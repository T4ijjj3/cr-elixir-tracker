import asyncio
import base64
import io
import json
import logging
import os
import re
import ssl
import sys
import threading
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import websockets

try:
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
except ImportError:
    print("pip install faster-whisper websockets numpy")
    sys.exit(1)

try:
    from rapidfuzz import fuzz
except Exception:  # noqa: BLE001
    fuzz = None


BASE_DIR = Path(__file__).resolve().parent
CARDS_DB_PATH = BASE_DIR / "cards_db.js"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

LISTEN_LOG_FILE = Path(os.getenv("CR_LISTEN_LOG_FILE", str(LOG_DIR / "listen_server.log")))
LISTEN_LOG_LEVEL = os.getenv("CR_LISTEN_LOG_LEVEL", "INFO").strip().upper()
LISTEN_TLS_MODE = os.getenv("CR_LISTEN_TLS", "auto").strip().lower()
LISTEN_CERT_FILE_RAW = os.getenv("CR_LISTEN_CERT", "server.pem").strip()

PROTOCOL_VERSION = "cr_voice_v3_pcm_canonical"
SAMPLE_RATE = 16000


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("listen_server")
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, LISTEN_LOG_LEVEL, logging.INFO))
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    file_handler = logging.FileHandler(LISTEN_LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    logger.propagate = False
    return logger


LOGGER = configure_logging()


def log_event(event: str, level: str = "info", **fields) -> None:
    payload = {"event": event, **fields}
    message = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    getattr(LOGGER, level if level in {"debug", "info", "warning", "error"} else "info")(message)


def env_int(name: str, default: int, min_value: Optional[int] = None, max_value: Optional[int] = None) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else int(default)
    except Exception:  # noqa: BLE001
        value = int(default)
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def dedupe(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def read_cards_db() -> str:
    try:
        return CARDS_DB_PATH.read_text(encoding="utf-8")
    except OSError:
        return ""


def load_cards_and_costs() -> Tuple[List[str], Dict[str, int]]:
    source = read_cards_db()
    if not source:
        return [], {}

    pattern = re.compile(r"\{\s*name:\s*'([^']+)'\s*,\s*cost:\s*(\d+)", re.IGNORECASE)
    rows = pattern.findall(source)

    ordered_names: List[str] = []
    costs: Dict[str, int] = {}
    seen = set()

    for name, cost_raw in rows:
        if name not in seen:
            ordered_names.append(name)
            seen.add(name)
        try:
            costs[name] = int(cost_raw)
        except ValueError:
            continue

    if ordered_names:
        return ordered_names, costs

    for name in re.findall(r"name:\s*'([^']+)'", source):
        if name in seen:
            continue
        ordered_names.append(name)
        seen.add(name)

    return ordered_names, costs


CARD_NAMES, CARD_COSTS = load_cards_and_costs()
CARD_NAMES_BY_COST: Dict[int, List[str]] = {}
for card_name, cost in CARD_COSTS.items():
    CARD_NAMES_BY_COST.setdefault(cost, []).append(card_name)

HOTWORD_LIMIT_DEFAULT = len(CARD_NAMES) if CARD_NAMES else 120
HOTWORD_LIMIT = env_int(
    "CR_WHISPER_HOTWORD_LIMIT",
    HOTWORD_LIMIT_DEFAULT,
    min_value=24,
    max_value=max(64, HOTWORD_LIMIT_DEFAULT),
)
CONTEXT_COST_CARD_LIMIT = env_int("CR_WHISPER_HINT_COST_LIMIT", 18, min_value=6, max_value=40)
AUTO_VARIANT_TARGET = env_int("CR_VOICE_VARIANT_TARGET", 32, min_value=30, max_value=64)
AUTO_TOKEN_VARIANT_TARGET = env_int("CR_VOICE_TOKEN_VARIANT_TARGET", 36, min_value=18, max_value=48)
AUTO_PAIR_VARIANT_LIMIT = env_int("CR_VOICE_PAIR_VARIANT_LIMIT", 4, min_value=2, max_value=8)
HOTWORD_VARIANTS_PER_CARD = env_int("CR_WHISPER_HOTWORDS_PER_CARD", 2, min_value=1, max_value=6)
PRELOAD_MODEL_ON_BOOT = os.getenv("CR_WHISPER_PRELOAD_MODEL", "1").strip().lower() not in {"0", "false", "off", "no"}

FIXUPS = [
    (r"\balpha\b", "alfa"),
    (r"\bbelta\b", "beta"),
    (r"\bbetta\b", "beta"),
    (r"\bselta\b", "celta"),
    (r"\bceta\b", "celta"),
    (r"\bdeta\b", "delta"),
    (r"\bdeita\b", "delta"),
    (r"\bka\b", "k"),
    (r"\bkay\b", "k"),
    (r"\bkei\b", "k"),
    (r"\bquei\b", "k"),
]

NUM_WORDS = {
    "zero": 0,
    "0": 0,
    "um": 1,
    "uma": 1,
    "1": 1,
    "dois": 2,
    "2": 2,
    "tres": 3,
    "três": 3,
    "3": 3,
    "quatro": 4,
    "4": 4,
    "cinco": 5,
    "5": 5,
    "seis": 6,
    "6": 6,
    "sete": 7,
    "7": 7,
    "oito": 8,
    "8": 8,
    "nove": 9,
    "9": 9,
    "dez": 10,
    "10": 10,
}

STOP_WORDS = {"de", "da", "do", "das", "dos", "a", "o", "as", "os", "e"}
VARIANT_STOP_WORDS = STOP_WORDS | {"com", "pra", "pro"}

ARIETE_BATALHA_PHRASE_ALIASES = [
    "ariete de batalha",
    "ariete batalha",
    "ariete da batalha",
    "ariete de batala",
    "ariete batalia",
    "ariete bataria",
    "ariete bataia",
    "ariete baralha",
    "arete de batalha",
    "arete batalha",
    "arete da batalha",
    "arete de batala",
    "arete batalia",
    "arite de batalha",
    "arite batalha",
    "ariti de batalha",
    "arieti de batalha",
    "arieti batalha",
    "ariente de batalha",
    "ariente batalha",
    "aliete de batalha",
    "aliete batalha",
    "ari ete de batalha",
    "ari ete batalha",
    "a riete de batalha",
    "a riete batalha",
    "cariete de batalha",
    "cariete batalha",
    "cariente de batalha",
    "kariete de batalha",
]

ARIETE_BATALHA_SHORT_ALIASES = [
    "ariete",
    "battle ram",
    "ram",
    "arete",
    "arite",
    "arrete",
    "arreter",
    "arieti",
    "ariet",
    "a rede",
    "caliente",
    "caliente de batalha",
    "cariente",
    "cariete",
    "cari eti",
    "kariete",
    "ari eti",
    "arietee",
    "ariente",
    "aliete",
    "aride batalha",
    "aridi batalha",
    "aridi de batalha",
    "ariente de bataria",
]

CARD_ALIAS_OVERRIDES = {
    "ariete de batalha": ARIETE_BATALHA_SHORT_ALIASES + ARIETE_BATALHA_PHRASE_ALIASES,
    "pirotecnica": ["piro tecnica", "piro", "pirotecnia", "fogueteira", "foguetera"],
    "x besta": ["xbesta", "xis besta", "besta"],
    "p e k k a": ["pekka", "peka", "p e k a"],
    "mini pekka": ["mini peka", "minipekka"],
    "o tronco": ["tronco"],
    "tres mosqueteiras": ["3 mosqueteiras", "tres mosqueteira"],
}


def apply_token_mutators(token: str) -> List[str]:
    candidates = [
        token.replace("qu", "k"),
        token.replace("que", "ke"),
        token.replace("qui", "ki"),
        token.replace("ce", "se").replace("ci", "si"),
        token.replace("ge", "je").replace("gi", "ji"),
        token.replace("ch", "x"),
        token.replace("x", "s"),
        token.replace("x", "z"),
        token.replace("lh", "li"),
        token.replace("nh", "ni"),
        token.replace("rr", "r"),
        token.replace("ss", "s"),
        re.sub(r"gu([ei])", r"g\1", token),
        token.replace("v", "b"),
        token.replace("b", "v"),
        token.replace("d", "t"),
        token.replace("t", "d"),
        token.replace("ph", "f"),
        token.replace("w", "v"),
        token.replace("y", "i"),
        token.replace("ca", "ka").replace("co", "ko").replace("cu", "ku"),
        token.replace("z", "s"),
        token.replace("s", "z"),
        token.replace("ei", "e"),
        token.replace("ou", "o"),
        token.replace("ao", "aum"),
        token.replace("l", "u"),
        token.replace("r", "l"),
        token.replace("l", "r"),
        token.replace("c", "k"),
        token.replace("g", "j"),
    ]
    return [candidate for candidate in candidates if candidate and candidate != token]


def apply_token_finishers(token: str) -> List[str]:
    candidates = [
        f"{token[:-1]}n" if token.endswith("m") else token,
        f"{token[:-1]}u" if token.endswith("o") else token,
        f"{token[:-1]}i" if token.endswith("e") else token,
        token[:-1] if token.endswith("r") else token,
        token[:-1] if token.endswith("s") else token,
        f"{token}a" if len(token) <= 9 else token,
        f"{token}e" if len(token) <= 9 else token,
        f"{token}i" if len(token) <= 9 else token,
        f"{token}o" if len(token) <= 9 else token,
        f"{token}u" if len(token) <= 9 else token,
        f"e{token}" if len(token) <= 9 else token,
        f"i{token}" if len(token) <= 9 else token,
        f"a{token}" if len(token) <= 9 else token,
        token[:-1] if len(token) > 4 else token,
        token[1:] if len(token) > 4 else token,
        f"{token}{token[-1]}" if len(token) > 3 else token,
    ]
    return [candidate for candidate in candidates if candidate and candidate != token]


def strip_accents(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", value) if unicodedata.category(ch) != "Mn")


def normalize_match_text(value: str) -> str:
    text = strip_accents((value or "").lower())
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_transcript(value: str) -> str:
    text = re.sub(r"\s+", " ", (value or "").strip().lower())
    if not text:
        return ""
    for pattern, replacement in FIXUPS:
        text = re.sub(pattern, replacement, text)
    return re.sub(r"\s+", " ", text).strip()


def compact_words(value: str) -> str:
    return " ".join(token for token in value.split() if token and token not in STOP_WORDS).strip()


def add_phrase_forms(container: List[str], value: str) -> None:
    normalized = normalize_match_text(value)
    if len(normalized.replace(" ", "")) < 2:
        return

    container.append(normalized)

    without_stops = " ".join(token for token in normalized.split() if token and token not in VARIANT_STOP_WORDS).strip()
    if without_stops and without_stops != normalized:
        container.append(without_stops)

    compact_full = normalized.replace(" ", "")
    if len(compact_full) >= 4:
        container.append(compact_full)

    compact_without_stops = without_stops.replace(" ", "")
    if compact_without_stops and compact_without_stops != compact_full and len(compact_without_stops) >= 4:
        container.append(compact_without_stops)


def generate_token_variants(token: str, target: int = AUTO_TOKEN_VARIANT_TARGET) -> List[str]:
    base = normalize_match_text(token).replace(" ", "")
    if not base:
        return []

    ordered: List[str] = []
    seen = set()
    queue: List[Tuple[str, int]] = [(base, 0)]

    def push(value: str) -> bool:
        normalized = normalize_match_text(value).replace(" ", "")
        if len(normalized) < 2 or normalized in seen:
            return False
        seen.add(normalized)
        ordered.append(normalized)
        return True

    push(base)
    index = 0
    while index < len(queue) and len(ordered) < target:
        current, depth = queue[index]
        index += 1
        if depth >= 2:
            continue
        for candidate in apply_token_mutators(current):
            normalized = normalize_match_text(candidate).replace(" ", "")
            if not normalized or normalized == current or normalized in seen:
                continue
            push(normalized)
            queue.append((normalized, depth + 1))
            if len(ordered) >= target:
                break

    finisher_inputs = ordered[: max(8, min(len(ordered), 12))] or [base]
    for value in finisher_inputs:
        for candidate in apply_token_finishers(value):
            push(candidate)
            if len(ordered) >= target:
                return ordered[:target]

    for value in list(ordered):
        if len(ordered) >= target:
            break
        for candidate in apply_token_mutators(value):
            for finished in apply_token_finishers(candidate):
                push(finished)
                if len(ordered) >= target:
                    break
            if len(ordered) >= target:
                break

    return ordered[:target]


def build_auto_phrase_variants(card_name: str, target: int = AUTO_VARIANT_TARGET) -> List[str]:
    base = normalize_match_text(card_name)
    if not base:
        return []

    tokens = [token for token in base.split() if token]
    content_indices = [index for index, token in enumerate(tokens) if token not in VARIANT_STOP_WORDS]
    if not content_indices:
        content_indices = list(range(len(tokens)))

    variants: List[str] = []
    add_phrase_forms(variants, base)

    content_tokens = [tokens[index] for index in content_indices]
    if content_tokens:
        add_phrase_forms(variants, " ".join(content_tokens))

    token_variants = {index: generate_token_variants(tokens[index]) for index in content_indices}

    for index in content_indices:
        for variant in token_variants.get(index, []):
            candidate_tokens = tokens[:]
            candidate_tokens[index] = variant
            add_phrase_forms(variants, " ".join(candidate_tokens))
            if len(dedupe(variants)) >= target:
                return dedupe(variants)[:target]

    for left_pos, left_index in enumerate(content_indices):
        left_variants = token_variants.get(left_index, [])[:AUTO_PAIR_VARIANT_LIMIT]
        for right_index in content_indices[left_pos + 1 :]:
            right_variants = token_variants.get(right_index, [])[:AUTO_PAIR_VARIANT_LIMIT]
            for left_variant in left_variants:
                for right_variant in right_variants:
                    candidate_tokens = tokens[:]
                    candidate_tokens[left_index] = left_variant
                    candidate_tokens[right_index] = right_variant
                    add_phrase_forms(variants, " ".join(candidate_tokens))
                    if len(dedupe(variants)) >= target:
                        return dedupe(variants)[:target]

    return dedupe(variants)[:target]


def build_card_variants(card_name: str) -> List[str]:
    base = normalize_match_text(card_name)
    if not base:
        return []

    compacted = compact_words(base)
    variants: List[str] = []
    add_phrase_forms(variants, base)
    if compacted and compacted != base:
        add_phrase_forms(variants, compacted)

    if base.startswith("o "):
        add_phrase_forms(variants, base[2:].strip())
    if base.startswith("a "):
        add_phrase_forms(variants, base[2:].strip())

    for manual_variant in CARD_ALIAS_OVERRIDES.get(base, []):
        add_phrase_forms(variants, manual_variant)

    variants.extend(build_auto_phrase_variants(base))
    return dedupe([variant.strip() for variant in variants if variant and len(variant.replace(" ", "")) >= 2])


CARD_VARIANTS: Dict[str, List[str]] = {card_name: build_card_variants(card_name) for card_name in CARD_NAMES}


def build_card_hotwords(card_name: str) -> List[str]:
    base = normalize_match_text(card_name)
    if not base:
        return []

    hotwords: List[str] = [base]
    for manual_variant in CARD_ALIAS_OVERRIDES.get(base, []):
        normalized = normalize_match_text(manual_variant)
        if not normalized or normalized == base:
            continue
        hotwords.append(normalized)
        if len(dedupe(hotwords)) >= HOTWORD_VARIANTS_PER_CARD:
            break
    return dedupe(hotwords)[:HOTWORD_VARIANTS_PER_CARD]


CARD_HOTWORDS: Dict[str, List[str]] = {card_name: build_card_hotwords(card_name) for card_name in CARD_NAMES}
VARIANT_TO_CARD: Dict[str, str] = {}
VARIANT_COLLISIONS = set()
for card_name in CARD_NAMES:
    for variant in CARD_VARIANTS.get(card_name, []):
        existing = VARIANT_TO_CARD.get(variant)
        if existing and existing != card_name:
            VARIANT_COLLISIONS.add(variant)
            VARIANT_TO_CARD.pop(variant, None)
            continue
        if variant in VARIANT_COLLISIONS:
            continue
        VARIANT_TO_CARD[variant] = card_name

if VARIANT_COLLISIONS:
    log_event("variant_collisions", level="warning", count=len(VARIANT_COLLISIONS))


def build_global_hotwords() -> str:
    base_terms = [
        "clash royale",
        "alfa",
        "beta",
        "celta",
        "delta",
        "habilidade",
        "campeao",
        "k 1",
        "k 2",
        "k 3",
    ]

    card_terms: List[str] = []
    for card_name in CARD_NAMES[:HOTWORD_LIMIT]:
        card_terms.extend(CARD_HOTWORDS.get(card_name, [card_name]))

    env_terms = [term.strip() for term in os.getenv("CR_WHISPER_HOTWORDS", "").split(",") if term.strip()]
    return ", ".join(dedupe(base_terms + card_terms + env_terms))


GLOBAL_HOTWORDS = build_global_hotwords()
BASE_PROMPT = (
    "Clash Royale em portugues do Brasil. "
    "Comando curto no formato '<custo> <carta>'. "
    "Use nomes oficiais das cartas. "
    "Se nao houver fala clara, retorne vazio."
)


def parse_hint_cost(raw_value: object) -> Optional[int]:
    try:
        cost = int(raw_value)
    except (TypeError, ValueError):
        return None
    if 0 <= cost <= 10:
        return cost
    return None


def build_decode_context(hint_cost: Optional[int]) -> Tuple[str, str]:
    cost = parse_hint_cost(hint_cost)
    if cost is None:
        return BASE_PROMPT, GLOBAL_HOTWORDS

    cost_cards = CARD_NAMES_BY_COST.get(cost, [])[:CONTEXT_COST_CARD_LIMIT]
    if not cost_cards:
        return BASE_PROMPT, GLOBAL_HOTWORDS

    contextual_terms = [
        "clash royale",
        "alfa",
        "beta",
        "celta",
        "delta",
        "habilidade",
        "campeao",
        "k 1",
        "k 2",
        "k 3",
        str(cost),
    ]
    for card_name in cost_cards:
        contextual_terms.extend(CARD_HOTWORDS.get(card_name, [card_name]))

    prompt = (
        f"{BASE_PROMPT} "
        f"Custo em foco: {cost}. Priorize cartas desse custo."
    )
    return prompt, ", ".join(dedupe(contextual_terms))


def parse_cost(text: str) -> Tuple[Optional[int], str]:
    tokens = text.split()
    for index, token in enumerate(tokens[:6]):
        if token in NUM_WORDS:
            return int(NUM_WORDS[token]), " ".join(tokens[index + 1 :]).strip()
        if token.isdigit():
            value = int(token)
            if 0 <= value <= 10:
                return value, " ".join(tokens[index + 1 :]).strip()
    return None, text


def similarity_score(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    if fuzz is not None:
        return float(fuzz.WRatio(left, right))

    import difflib

    return float(difflib.SequenceMatcher(None, left, right).ratio() * 100.0)


def best_card(remainder_norm: str, candidates: List[str]) -> Tuple[Optional[str], float, float, str, str]:
    if not remainder_norm:
        return None, 0.0, 0.0, "", "empty"

    exact = VARIANT_TO_CARD.get(remainder_norm)
    if exact and exact in candidates:
        return exact, 100.0, 0.0, remainder_norm, "exact_variant"

    best_name: Optional[str] = None
    best_score = 0.0
    second_score = 0.0
    best_variant = ""

    for card_name in candidates:
        card_best = 0.0
        card_variant = ""
        for variant in CARD_VARIANTS.get(card_name, [normalize_match_text(card_name)]):
            score = similarity_score(remainder_norm, variant)
            if score > card_best:
                card_best = score
                card_variant = variant
        if card_best > best_score:
            second_score = best_score
            best_score = card_best
            best_name = card_name
            best_variant = card_variant
        elif card_best > second_score:
            second_score = card_best

    method = "rapidfuzz" if fuzz is not None else "difflib"
    rationale = f"{method} best={best_score:.1f} margin={best_score - second_score:.1f}"
    return best_name, best_score, second_score, best_variant, rationale


def should_accept_match(remainder_norm: str, score: float, margin: float, exact_variant: bool) -> bool:
    if exact_variant:
        return True
    if not remainder_norm or len(remainder_norm) < 3:
        return False

    compact_len = len(remainder_norm.replace(" ", ""))
    if score >= 95:
        return True
    if score >= 91 and margin >= 5:
        return True
    if score >= 88 and compact_len >= 7 and margin >= 8:
        return True
    if score >= 85 and compact_len >= 11 and margin >= 12:
        return True
    return False


def canonicalize(raw_text: str, hint_cost: Optional[int] = None) -> Tuple[str, Optional[dict]]:
    normalized = normalize_transcript(raw_text)
    if not normalized:
        return "", None

    spoken_cost, remainder = parse_cost(normalized)
    effective_cost = spoken_cost if spoken_cost is not None else parse_hint_cost(hint_cost)
    effective_remainder = remainder if spoken_cost is not None else normalized
    remainder_norm = normalize_match_text(effective_remainder)

    candidates = CARD_NAMES
    if effective_cost is not None and CARD_COSTS:
        filtered = [card_name for card_name in CARD_NAMES if CARD_COSTS.get(card_name) == effective_cost]
        if filtered:
            candidates = filtered

    match_name, score, second_score, matched_variant, rationale = best_card(remainder_norm, candidates)
    margin = max(0.0, score - second_score)
    accepted = bool(
        match_name
        and should_accept_match(
            remainder_norm,
            score,
            margin,
            exact_variant=(matched_variant == remainder_norm and score >= 100.0),
        )
    )

    metadata = {
        "raw": raw_text,
        "normalized": normalized,
        "cost": effective_cost,
        "costSource": "spoken" if spoken_cost is not None else ("hint" if effective_cost is not None else None),
        "remainder": effective_remainder,
        "match": match_name,
        "matchedVariant": matched_variant or None,
        "score": round(score, 2),
        "margin": round(margin, 2),
        "rationale": rationale,
        "accepted": accepted,
    }

    fallback_text = raw_text.strip() or normalized
    if accepted and match_name and effective_cost is not None:
        return f"{effective_cost} {match_name}", metadata
    if accepted and match_name:
        return match_name, metadata
    return fallback_text, metadata


def detect_device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


DEVICE = detect_device()
MODEL_NAME = os.getenv("CR_WHISPER_MODEL", "small")
COMPUTE_TYPE = os.getenv("CR_WHISPER_COMPUTE_TYPE", "int8")
CPU_COUNT = max(2, os.cpu_count() or 4)
CPU_THREADS = env_int("CR_WHISPER_CPU_THREADS", CPU_COUNT, min_value=2, max_value=CPU_COUNT)
NUM_WORKERS = env_int("CR_WHISPER_NUM_WORKERS", 1, min_value=1, max_value=4)
MAX_NEW_TOKENS = env_int("CR_WHISPER_MAX_NEW_TOKENS", 12, min_value=8, max_value=32)

MODEL: Optional[WhisperModel] = None
MODEL_BOOT_LOCK = threading.Lock()
TRANSCRIBE_LOCK = threading.Lock()


def ensure_model_loaded() -> WhisperModel:
    global MODEL
    if MODEL is not None:
        return MODEL

    with MODEL_BOOT_LOCK:
        if MODEL is None:
            MODEL = WhisperModel(
                MODEL_NAME,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                cpu_threads=CPU_THREADS,
                num_workers=NUM_WORKERS,
            )
            log_event(
                "server_profile",
                device=DEVICE,
                model=MODEL_NAME,
                compute=COMPUTE_TYPE,
                cpu_threads=CPU_THREADS,
                workers=NUM_WORKERS,
                hotwords=len([value for value in GLOBAL_HOTWORDS.split(",") if value.strip()]),
                rapidfuzz=bool(fuzz),
                protocol=PROTOCOL_VERSION,
            )
    return MODEL


def resolve_listen_cert_path() -> Path:
    raw_path = Path(LISTEN_CERT_FILE_RAW)
    return raw_path if raw_path.is_absolute() else (BASE_DIR / raw_path)


def build_websocket_ssl_context() -> Optional[ssl.SSLContext]:
    if LISTEN_TLS_MODE in {"0", "false", "off", "disabled"}:
        log_event("ws_tls_disabled", mode=LISTEN_TLS_MODE)
        return None

    cert_path = resolve_listen_cert_path()
    if not cert_path.exists():
        level = "warning" if LISTEN_TLS_MODE in {"auto", ""} else "error"
        log_event("ws_tls_cert_missing", level=level, path=str(cert_path), mode=LISTEN_TLS_MODE)
        return None

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_path))
    log_event("ws_tls_enabled", path=str(cert_path), mode=LISTEN_TLS_MODE)
    return context


def preload_model_task() -> None:
    started = time.perf_counter()
    log_event("model_preload_started", model=MODEL_NAME)
    try:
        ensure_model_loaded()
        log_event("model_preload_ready", model=MODEL_NAME, ms=int((time.perf_counter() - started) * 1000))
    except Exception as exc:  # noqa: BLE001
        log_event("model_preload_failed", level="error", model=MODEL_NAME, error=str(exc))


def transcribe_pcm(pcm: np.ndarray, hint_cost: Optional[int] = None) -> str:
    model = ensure_model_loaded()
    prompt_text, hotwords_text = build_decode_context(hint_cost)
    with TRANSCRIBE_LOCK:
        segments, _ = model.transcribe(
            pcm,
            beam_size=1,
            best_of=1,
            patience=0.35,
            language="pt",
            initial_prompt=prompt_text,
            condition_on_previous_text=False,
            temperature=0.0,
            no_speech_threshold=0.36,
            log_prob_threshold=-1.1,
            compression_ratio_threshold=2.2,
            # The browser already segments each utterance, so model-side VAD only adds latency here.
            vad_filter=False,
            without_timestamps=True,
            max_new_tokens=MAX_NEW_TOKENS,
            hotwords=hotwords_text or None,
        )
    return normalize_transcript(re.sub(r"\s+", " ", " ".join(segment.text for segment in segments)).strip())


def decode_chunks_to_pcm(chunks: List[bytes]) -> Optional[np.ndarray]:
    pcm_parts: List[np.ndarray] = []
    failed_chunks = 0

    for chunk in chunks:
        try:
            pcm_parts.append(decode_audio(io.BytesIO(chunk), sampling_rate=SAMPLE_RATE))
        except Exception as exc:  # noqa: BLE001
            failed_chunks += 1
            log_event(
                "decode_chunk_failed",
                level="warning",
                error=str(exc),
                blob_bytes=len(chunk),
            )

    if pcm_parts:
        if failed_chunks:
            log_event("decode_chunk_partial_recovery", level="warning", ok=len(pcm_parts), failed=failed_chunks)
        return np.concatenate(pcm_parts, axis=0)

    joined = b"".join(chunks)
    if not joined:
        return None

    try:
        log_event("decode_chunk_joined_fallback", level="warning", chunks=len(chunks), bytes=len(joined))
        return decode_audio(io.BytesIO(joined), sampling_rate=SAMPLE_RATE)
    except Exception as exc:  # noqa: BLE001
        log_event("decode_joined_failed", level="error", error=str(exc), bytes=len(joined))
        return None


@dataclass
class Utterance:
    utterance_id: str
    platform: str = "desktop"
    speech_started_at: int = 0
    chunk_count: int = 0
    bytes_received: int = 0
    hint_cost: Optional[int] = None
    chunks: List[bytes] = field(default_factory=list)


def append_chunk_to_utterance(utterance: Utterance, chunk: bytes, hint_cost: Optional[int] = None) -> None:
    if not chunk:
        return
    if hint_cost is not None:
        utterance.hint_cost = hint_cost
    utterance.chunk_count += 1
    utterance.bytes_received += len(chunk)
    utterance.chunks.append(chunk)


def build_server_ready_payload() -> dict:
    return {
        "type": "server_ready",
        "protocol": PROTOCOL_VERSION,
        "engines": [
            {
                "engine": "whisper",
                "modelName": MODEL_NAME,
                "computeType": COMPUTE_TYPE,
                "decodeProfile": "precision",
                "sharedModel": False,
                "partialEnabled": False,
            }
        ],
        "receivedAt": int(time.time() * 1000),
    }


async def send_final(websocket, utterance: Utterance) -> None:
    started = time.perf_counter()

    def run_decode() -> Tuple[str, Optional[dict]]:
        pcm = decode_chunks_to_pcm(utterance.chunks)
        if pcm is None or pcm.size == 0:
            return "", None
        raw_text = transcribe_pcm(pcm, utterance.hint_cost)
        return canonicalize(raw_text, hint_cost=utterance.hint_cost)

    transcript, metadata = await asyncio.to_thread(run_decode)
    decode_ms = int((time.perf_counter() - started) * 1000)
    received_at = int(time.time() * 1000)
    latency_ms = max(0, received_at - utterance.speech_started_at) if utterance.speech_started_at else None
    confidence = float(metadata["score"]) / 100.0 if metadata and metadata.get("accepted") else None

    payload = {
        "type": "voice_event",
        "engine": "whisper",
        "platform": utterance.platform,
        "utteranceId": utterance.utterance_id,
        "phase": "final",
        "transcript": transcript,
        "confidence": confidence,
        "receivedAt": received_at,
        "speechStartedAt": utterance.speech_started_at or received_at,
        "latencyMs": latency_ms,
        "chunkCount": utterance.chunk_count,
        "bytes": utterance.bytes_received,
        "modelName": MODEL_NAME,
        "computeType": COMPUTE_TYPE,
        "decodeMs": decode_ms,
        "hintCost": utterance.hint_cost,
    }
    if metadata:
        payload["canonical"] = metadata

    log_event(
        "final_ready",
        utterance_id=utterance.utterance_id,
        decode_ms=decode_ms,
        transcript=transcript,
        accepted=metadata.get("accepted") if metadata else None,
        score=metadata.get("score") if metadata else None,
        hint_cost=utterance.hint_cost,
    )

    if transcript:
        await websocket.send(json.dumps(payload, ensure_ascii=False))


async def recognize_audio(websocket) -> None:
    remote = str(getattr(websocket, "remote_address", "unknown"))
    conn_id = f"ws-{int(time.time() * 1000)}-{id(websocket)}"
    log_event("ws_connected", conn_id=conn_id, remote=remote)
    utterances: Dict[str, Utterance] = {}

    await websocket.send(json.dumps(build_server_ready_payload(), ensure_ascii=False))

    try:
        async for message in websocket:
            if isinstance(message, (bytes, bytearray)):
                legacy_utterance = Utterance(
                    utterance_id=f"legacy-{int(time.time() * 1000)}",
                    platform="legacy",
                    speech_started_at=int(time.time() * 1000),
                    chunk_count=1,
                    bytes_received=len(message),
                    chunks=[bytes(message)],
                )
                await send_final(websocket, legacy_utterance)
                continue

            if not isinstance(message, str):
                continue

            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                log_event("ws_invalid_json", level="warning", conn_id=conn_id, sample=message[:180])
                continue

            msg_type = payload.get("type")
            utterance_id = payload.get("utteranceId") or payload.get("utterance_id") or ""

            if msg_type == "start_utterance":
                if not utterance_id:
                    log_event("start_utterance_missing_id", level="warning", conn_id=conn_id)
                    continue
                hint_cost = parse_hint_cost(payload.get("hintCost") or payload.get("hint_cost"))
                utterances[utterance_id] = Utterance(
                    utterance_id=utterance_id,
                    platform=payload.get("platform") or "desktop",
                    speech_started_at=int(payload.get("speechStartedAt") or 0),
                    hint_cost=hint_cost,
                )
                log_event(
                    "utterance_started",
                    conn_id=conn_id,
                    utterance_id=utterance_id,
                    platform=utterances[utterance_id].platform,
                    speech_started_at=utterances[utterance_id].speech_started_at,
                    hint_cost=hint_cost,
                )
                continue

            if msg_type == "audio_chunk":
                if not utterance_id:
                    log_event("audio_chunk_missing_id", level="warning", conn_id=conn_id)
                    continue

                utterance = utterances.setdefault(
                    utterance_id,
                    Utterance(
                        utterance_id=utterance_id,
                        platform=payload.get("platform") or "desktop",
                        speech_started_at=int(payload.get("speechStartedAt") or 0),
                        hint_cost=parse_hint_cost(payload.get("hintCost") or payload.get("hint_cost")),
                    ),
                )

                try:
                    chunk = base64.b64decode(payload.get("audioBase64") or "", validate=False)
                except Exception as exc:  # noqa: BLE001
                    log_event(
                        "audio_chunk_decode_error",
                        level="warning",
                        conn_id=conn_id,
                        utterance_id=utterance_id,
                        error=str(exc),
                    )
                    chunk = b""

                if not chunk:
                    continue

                chunk_hint_cost = parse_hint_cost(payload.get("hintCost") or payload.get("hint_cost"))
                append_chunk_to_utterance(utterance, chunk, hint_cost=chunk_hint_cost)
                continue

            if msg_type == "audio_chunks":
                if not utterance_id:
                    log_event("audio_chunks_missing_id", level="warning", conn_id=conn_id)
                    continue

                utterance = utterances.setdefault(
                    utterance_id,
                    Utterance(
                        utterance_id=utterance_id,
                        platform=payload.get("platform") or "desktop",
                        speech_started_at=int(payload.get("speechStartedAt") or 0),
                        hint_cost=parse_hint_cost(payload.get("hintCost") or payload.get("hint_cost")),
                    ),
                )

                chunk_hint_cost = parse_hint_cost(payload.get("hintCost") or payload.get("hint_cost"))
                audio_items = payload.get("audio")
                if not isinstance(audio_items, list):
                    log_event("audio_chunks_invalid_payload", level="warning", conn_id=conn_id, utterance_id=utterance_id)
                    continue

                decoded_count = 0
                for item in audio_items:
                    if not isinstance(item, dict):
                        continue
                    try:
                        chunk = base64.b64decode(item.get("audioBase64") or "", validate=False)
                    except Exception as exc:  # noqa: BLE001
                        log_event(
                            "audio_chunks_decode_error",
                            level="warning",
                            conn_id=conn_id,
                            utterance_id=utterance_id,
                            error=str(exc),
                        )
                        continue
                    if not chunk:
                        continue
                    append_chunk_to_utterance(utterance, chunk, hint_cost=chunk_hint_cost)
                    decoded_count += 1

                if decoded_count == 0:
                    log_event("audio_chunks_empty", level="warning", conn_id=conn_id, utterance_id=utterance_id)
                continue

            if msg_type == "utterance_context":
                if not utterance_id:
                    log_event("utterance_context_missing_id", level="warning", conn_id=conn_id)
                    continue
                utterance = utterances.get(utterance_id)
                if not utterance:
                    log_event(
                        "utterance_context_missing_state",
                        level="debug",
                        conn_id=conn_id,
                        utterance_id=utterance_id,
                    )
                    continue
                hint_cost = parse_hint_cost(payload.get("hintCost") or payload.get("hint_cost"))
                if hint_cost is not None:
                    utterance.hint_cost = hint_cost
                log_event(
                    "utterance_context_updated",
                    level="debug",
                    conn_id=conn_id,
                    utterance_id=utterance_id,
                    hint_cost=utterance.hint_cost,
                    source=payload.get("source") or "frontend",
                )
                continue

            if msg_type == "end_utterance":
                if not utterance_id:
                    log_event("end_utterance_missing_id", level="warning", conn_id=conn_id)
                    continue
                utterance = utterances.pop(utterance_id, None)
                if not utterance:
                    log_event("end_utterance_missing_state", level="warning", conn_id=conn_id, utterance_id=utterance_id)
                    continue
                await send_final(websocket, utterance)
                continue

            if msg_type:
                log_event("ws_message_unhandled", level="debug", conn_id=conn_id, type=msg_type)
    except websockets.exceptions.ConnectionClosed:
        log_event("ws_closed", conn_id=conn_id, remote=remote)
    finally:
        log_event("ws_cleanup_done", conn_id=conn_id, pending_utterances=len(utterances))


async def main() -> None:
    host = os.getenv("CR_LISTEN_HOST", "127.0.0.1")
    port = env_int("CR_LISTEN_PORT", 8765, min_value=1, max_value=65535)
    ssl_context = build_websocket_ssl_context()
    log_event("ws_server_starting", host=host, port=port, transport="wss" if ssl_context else "ws")
    async with websockets.serve(recognize_audio, host, port, ping_interval=None, ssl=ssl_context):
        log_event("ws_server_ready", host=host, port=port, transport="wss" if ssl_context else "ws")
        if PRELOAD_MODEL_ON_BOOT:
            asyncio.create_task(asyncio.to_thread(preload_model_task))
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
