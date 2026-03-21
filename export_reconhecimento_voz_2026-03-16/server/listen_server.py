import asyncio
import base64
import json
import logging
import os
import re
import sys
import tempfile
import threading
import time
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path

import websockets

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Erro: Bibliotecas nao encontradas.")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
CARDS_DB_PATH = BASE_DIR / "cards_db.js"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LISTEN_LOG_FILE = Path(os.getenv("CR_LISTEN_LOG_FILE", str(LOG_DIR / "listen_server.log")))
LISTEN_LOG_LEVEL = os.getenv("CR_LISTEN_LOG_LEVEL", "INFO").strip().upper()


def configure_logging():
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


def sanitize_log_value(value):
    if isinstance(value, (list, tuple, set)):
        return [sanitize_log_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): sanitize_log_value(v) for k, v in value.items()}
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, float):
        return round(value, 4)
    if value is None or isinstance(value, (int, bool)):
        return value
    text = str(value).replace("\n", " ").strip()
    if len(text) > 300:
        text = f"{text[:297]}..."
    return text


def log_event(event, level="info", **fields):
    payload = {
        "event": event,
        **{k: sanitize_log_value(v) for k, v in fields.items()},
    }
    message = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    if level == "debug":
        LOGGER.debug(message)
    elif level == "warning":
        LOGGER.warning(message)
    elif level == "error":
        LOGGER.error(message)
    else:
        LOGGER.info(message)


def env_int(name, default, min_value=None, max_value=None):
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else int(default)
    except (TypeError, ValueError):
        value = int(default)
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def env_float(name, default, min_value=None, max_value=None):
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else float(default)
    except (TypeError, ValueError):
        value = float(default)
    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def env_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "yes", "on", "y"}


def detectar_ram_total_gb():
    meminfo = Path("/proc/meminfo")
    if not meminfo.exists():
        return 0
    try:
        for line in meminfo.read_text(encoding="utf-8").splitlines():
            if not line.startswith("MemTotal:"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            kib = int(parts[1])
            return max(0, int(round(kib / (1024 * 1024))))
    except Exception:
        return 0
    return 0


LOW_LATENCY_MODE = env_bool("CR_LOW_LATENCY_MODE", True)
SYSTEM_RAM_GB = detectar_ram_total_gb()
TARGET_RAM_GB = env_int("CR_WHISPER_TARGET_RAM_GB", 16, min_value=4, max_value=64)
CPU_COUNT = max(2, os.cpu_count() or 4)
CPU_THREADS = env_int("CR_WHISPER_CPU_THREADS", min(CPU_COUNT, 16), min_value=2, max_value=CPU_COUNT)
WHISPER_NUM_WORKERS = env_int("CR_WHISPER_NUM_WORKERS", 1, min_value=1, max_value=4)
PARTIAL_MIN_CHUNKS = env_int("CR_PARTIAL_MIN_CHUNKS", 1, min_value=1, max_value=6)
PARTIAL_MIN_BYTES = env_int(
    "CR_PARTIAL_MIN_BYTES",
    2200 if LOW_LATENCY_MODE else 3200,
    min_value=1200,
    max_value=16000,
)
PARTIAL_MIN_INTERVAL_S = env_float(
    "CR_PARTIAL_MIN_INTERVAL_S",
    0.11 if LOW_LATENCY_MODE else 0.18,
    min_value=0.05,
    max_value=0.6,
)
PROTOCOL_VERSION = "triple_ensemble_v1"
DEFAULT_MAX_NEW_TOKENS = env_int("CR_WHISPER_MAX_NEW_TOKENS", 18, min_value=8, max_value=32)
LOCAL_PTBR_MODEL_DIRS = (
    "models/distil-whisper-large-v3-ptbr-ct2",
    "models/whisper-large-v3-ptbr-ct2",
    "models/whisper-ptbr-ct2",
)


def carregar_cartas():
    try:
        source = CARDS_DB_PATH.read_text(encoding="utf-8")
    except OSError:
        return []

    cards = re.findall(r"name:\s*'([^']+)'", source)
    ordered = []
    seen = set()
    for card in cards:
        if card in seen:
            continue
        seen.add(card)
        ordered.append(card)
    return ordered


CARD_NAMES = carregar_cartas()
CARD_SAMPLE = ", ".join(CARD_NAMES[:140])
CLASH_ROYALE_PROMPT = (
    "Contexto: Clash Royale em portugues do Brasil. "
    "O usuario costuma falar primeiro o custo de elixir e depois o nome da carta. "
    "Atalhos por letra importantes: alfa=A, beta=B, celta=C, delta=D. "
    "Habilidade de campeao: comando K seguido de numero (1, 2 ou 3). "
    "Formato preferido: '<custo> <nome da carta>' com resposta curta. "
    "Numeros validos: um, dois, tres, quatro, cinco, seis, sete, oito, nove, dez. "
    "Se nao houver fala clara, prefira retornar vazio. "
    f"Cartas possiveis: {CARD_SAMPLE}."
)
EXTRA_TRANSCRIPTION_CONTEXT = os.getenv("CR_WHISPER_PROMPT_EXTRA", "").strip()
if EXTRA_TRANSCRIPTION_CONTEXT:
    CLASH_ROYALE_PROMPT = f"{CLASH_ROYALE_PROMPT} {EXTRA_TRANSCRIPTION_CONTEXT}"

TRANSCRIPT_FIXUPS = [
    (r"\balpha\b", "alfa"),
    (r"\bbelta\b", "beta"),
    (r"\bbetta\b", "beta"),
    (r"\bbetaa\b", "beta"),
    (r"\bselta\b", "celta"),
    (r"\bceta\b", "celta"),
    (r"\bceltra\b", "celta"),
    (r"\bdeta\b", "delta"),
    (r"\bdeita\b", "delta"),
    (r"\bdeltta\b", "delta"),
    (r"\bdeltaa\b", "delta"),
    (r"\bka\b", "k"),
    (r"\bkay\b", "k"),
    (r"\bkei\b", "k"),
    (r"\bquei\b", "k"),
]

LOGGER.info("=========================================================")
LOGGER.info("🤖 IA do Whisper - MODO TURBO E MULTI-TAREFA (NOVA VERSAO)")
LOGGER.info("=========================================================")
log_event(
    "server_profile",
    low_latency=LOW_LATENCY_MODE,
    ram_total_gb=SYSTEM_RAM_GB,
    ram_target_gb=TARGET_RAM_GB,
    cpu_threads=CPU_THREADS,
    workers=WHISPER_NUM_WORKERS,
    log_file=str(LISTEN_LOG_FILE),
)


@dataclass
class AsrBackend:
    engine: str
    model_name: str
    compute_type: str
    model: WhisperModel
    decode_profile: str
    beam_size: int = 1
    best_of: int = 1
    patience: float = 0.35
    no_speech_threshold: float = 0.36
    log_prob_threshold: float = -1.1
    compression_ratio_threshold: float = 2.25
    vad_parameters: dict = field(
        default_factory=lambda: {
            "min_silence_duration_ms": 170,
            "speech_pad_ms": 110,
        }
    )
    transcribe_lock: threading.Lock = field(default_factory=threading.Lock)
    shared_model: bool = False
    partial_enabled: bool = True
    max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS
    hotwords: str = ""


def descobrir_device():
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def dedupe_valores(valores):
    ordered = []
    seen = set()
    for valor in valores:
        if not valor or valor in seen:
            continue
        seen.add(valor)
        ordered.append(valor)
    return ordered


def modelos_locais_existentes(env_vars=(), relative_dirs=()):
    candidates = []

    for env_var in env_vars:
        value = os.getenv(env_var)
        if not value:
            continue
        path = Path(value)
        if not path.is_absolute():
            path = BASE_DIR / value
        if path.exists():
            candidates.append(str(path.resolve()))

    for relative_dir in relative_dirs:
        path = BASE_DIR / relative_dir
        if path.exists():
            candidates.append(str(path.resolve()))

    return dedupe_valores(candidates)


def construir_hotwords_clash():
    default_limit = env_int("CR_WHISPER_HOTWORD_LIMIT", 96, min_value=24, max_value=max(24, len(CARD_NAMES) or 64))
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
    env_terms = [term.strip() for term in os.getenv("CR_WHISPER_HOTWORDS", "").split(",") if term.strip()]
    return ", ".join(dedupe_valores(base_terms + CARD_NAMES[:default_limit] + env_terms))


CLASH_ROYALE_HOTWORDS = construir_hotwords_clash()


def candidatos_compute_type_primario(device):
    forced = os.getenv("CR_WHISPER_COMPUTE_TYPE")
    if forced:
        return [forced]
    if device == "cuda":
        return ["float16", "int8_float16", "int8"]
    return ["int8", "int8_float32"]


def candidatos_compute_type_alternativo(device, primary_compute_type):
    forced = os.getenv("CR_WHISPER_ALT_COMPUTE_TYPE")
    if forced:
        return [forced]
    if device == "cuda":
        return dedupe_valores(["int8_float16", "int8", "float16", primary_compute_type])
    return dedupe_valores(["int8_float32", "int8", primary_compute_type])


def candidatos_modelo_primario(device):
    forced = os.getenv("CR_WHISPER_MODEL")
    if forced:
        return [forced]
    local_ptbr = modelos_locais_existentes(
        env_vars=("CR_WHISPER_PTBR_MODEL", "CR_WHISPER_LOCAL_MODEL"),
        relative_dirs=LOCAL_PTBR_MODEL_DIRS,
    )
    if device == "cuda":
        return dedupe_valores(local_ptbr + ["large-v3-turbo", "medium", "small"])
    preferir_modelo_forte_cpu = TARGET_RAM_GB >= 14 and SYSTEM_RAM_GB >= 14
    if preferir_modelo_forte_cpu and local_ptbr:
        return dedupe_valores(local_ptbr + ["small", "base"])
    if LOW_LATENCY_MODE:
        return dedupe_valores(["small", "base"] + local_ptbr)
    return dedupe_valores(local_ptbr + ["small", "base"])


def candidatos_modelo_alternativo(device, primary_model_name):
    forced = os.getenv("CR_WHISPER_ALT_MODEL")
    if forced:
        return [forced]
    local_alt = modelos_locais_existentes(
        env_vars=("CR_WHISPER_ALT_LOCAL_MODEL",),
        relative_dirs=LOCAL_PTBR_MODEL_DIRS,
    )
    local_alt = [candidate for candidate in local_alt if str(candidate) != str(primary_model_name)]
    if device == "cuda":
        return dedupe_valores(local_alt + ["small", "medium", primary_model_name, "base"])
    if LOW_LATENCY_MODE:
        return dedupe_valores(["base", "small"] + local_alt + [primary_model_name])
    return dedupe_valores(local_alt + ["small", "base", primary_model_name])


def carregar_modelo(device, model_candidates, compute_candidates, label="principal"):
    ultimo_erro = None

    for model_name in model_candidates:
        for compute_type in compute_candidates:
            try:
                log_event(
                    "model_load_attempt",
                    label=label,
                    model=model_name,
                    device=device.upper(),
                    compute=compute_type,
                    cpu_threads=CPU_THREADS,
                    workers=WHISPER_NUM_WORKERS,
                )
                model = WhisperModel(
                    model_name,
                    device=device,
                    compute_type=compute_type,
                    cpu_threads=CPU_THREADS,
                    num_workers=WHISPER_NUM_WORKERS,
                )
                log_event(
                    "model_load_ok",
                    label=label,
                    model=model_name,
                    device=device.upper(),
                    compute=compute_type,
                )
                return model_name, compute_type, model
            except Exception as exc:  # noqa: BLE001
                ultimo_erro = exc
                log_event(
                    "model_load_failed",
                    level="warning",
                    label=label,
                    model=model_name,
                    compute=compute_type,
                    error=str(exc),
                )

    raise RuntimeError(f"Nao consegui carregar nenhum modelo Whisper ({ultimo_erro}).")


def criar_backend(engine, model_name, compute_type, model, decode_profile, shared_model=False, transcribe_lock=None):
    if decode_profile == "rescue":
        beam_size = 2 if LOW_LATENCY_MODE else 3
        best_of = 2 if LOW_LATENCY_MODE else 3
        return AsrBackend(
            engine=engine,
            model_name=model_name,
            compute_type=compute_type,
            model=model,
            decode_profile=decode_profile,
            beam_size=beam_size,
            best_of=best_of,
            patience=0.85,
            no_speech_threshold=0.40,
            log_prob_threshold=-1.25,
            compression_ratio_threshold=2.3,
            vad_parameters={
                "min_silence_duration_ms": 120 if LOW_LATENCY_MODE else 160,
                "speech_pad_ms": 90 if LOW_LATENCY_MODE else 150,
            },
            transcribe_lock=transcribe_lock or threading.Lock(),
            shared_model=shared_model,
            partial_enabled=False,
            max_new_tokens=DEFAULT_MAX_NEW_TOKENS,
            hotwords=CLASH_ROYALE_HOTWORDS,
        )

    return AsrBackend(
        engine=engine,
        model_name=model_name,
        compute_type=compute_type,
        model=model,
        decode_profile=decode_profile,
        beam_size=1,
        best_of=1,
        patience=0.35,
        no_speech_threshold=0.36,
        log_prob_threshold=-1.1,
        compression_ratio_threshold=2.2,
        vad_parameters={
            "min_silence_duration_ms": 105 if LOW_LATENCY_MODE else 150,
            "speech_pad_ms": 70 if LOW_LATENCY_MODE else 100,
        },
        transcribe_lock=transcribe_lock or threading.Lock(),
        shared_model=shared_model,
        max_new_tokens=DEFAULT_MAX_NEW_TOKENS,
        hotwords=CLASH_ROYALE_HOTWORDS,
    )


def carregar_backends(device):
    primary_model_name, primary_compute_type, primary_model = carregar_modelo(
        device,
        candidatos_modelo_primario(device),
        candidatos_compute_type_primario(device),
        label="principal",
    )
    primary_backend = criar_backend(
        "whisper",
        primary_model_name,
        primary_compute_type,
        primary_model,
        "precision",
    )
    if device == "cpu" and primary_model_name not in {"small", "base"}:
        # Browser is the fast lane on CPU; heavy local models should correct finals,
        # not consume CPU with partials and drag the end-to-end latency.
        primary_backend.partial_enabled = False

    default_alt_enabled = device == "cuda"
    if not LOW_LATENCY_MODE:
        default_alt_enabled = True
    alt_enabled = env_bool("CR_WHISPER_ALT_ENABLED", default_alt_enabled)
    if not alt_enabled:
        log_event("alt_engine_disabled", reason="CR_WHISPER_ALT_ENABLED=0")
        return [primary_backend]

    try:
        alt_model_name, alt_compute_type, alt_model = carregar_modelo(
            device,
            candidatos_modelo_alternativo(device, primary_model_name),
            candidatos_compute_type_alternativo(device, primary_compute_type),
            label="alternativo",
        )
        alt_backend = criar_backend(
            "whisper_alt",
            alt_model_name,
            alt_compute_type,
            alt_model,
            "rescue",
        )
    except Exception as exc:  # noqa: BLE001
        log_event(
            "alt_engine_fallback_shared_model",
            level="warning",
            reason=str(exc),
            shared_from=primary_model_name,
            compute_type=primary_compute_type,
        )
        alt_backend = criar_backend(
            "whisper_alt",
            primary_model_name,
            primary_compute_type,
            primary_model,
            "rescue",
            shared_model=True,
            transcribe_lock=primary_backend.transcribe_lock,
        )

    return [primary_backend, alt_backend]


device = descobrir_device()
ASR_BACKENDS = carregar_backends(device)
for backend in ASR_BACKENDS:
    log_event(
        "backend_ready",
        device=device.upper(),
        engine=backend.engine,
        compute=backend.compute_type,
        model=backend.model_name,
        profile=backend.decode_profile,
        shared_model=backend.shared_model,
        partial_enabled=backend.partial_enabled,
    )
log_event("backends_loaded", websocket_host="localhost", websocket_port=8765, backend_count=len(ASR_BACKENDS))


def normalizar_transcricao_clash(texto):
    cleaned = re.sub(r"\s+", " ", (texto or "").strip().lower())
    if not cleaned:
        return ""
    for pattern, replacement in TRANSCRIPT_FIXUPS:
        cleaned = re.sub(pattern, replacement, cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def suffix_for_mime(mime_type):
    raw = (mime_type or "").lower()
    if "ogg" in raw:
        return ".ogg"
    if "mp4" in raw or "aac" in raw:
        return ".m4a"
    return ".webm"


def processar_audio(caminho_arquivo, backend):
    with backend.transcribe_lock:
        segments, _ = backend.model.transcribe(
            caminho_arquivo,
            beam_size=backend.beam_size,
            best_of=backend.best_of,
            patience=backend.patience,
            language="pt",
            initial_prompt=CLASH_ROYALE_PROMPT,
            condition_on_previous_text=False,
            temperature=0.0,
            no_speech_threshold=backend.no_speech_threshold,
            log_prob_threshold=backend.log_prob_threshold,
            compression_ratio_threshold=backend.compression_ratio_threshold,
            vad_filter=True,
            vad_parameters=backend.vad_parameters,
            without_timestamps=True,
            max_new_tokens=backend.max_new_tokens,
            hotwords=backend.hotwords or None,
        )
    bruto = re.sub(r"\s+", " ", " ".join(segment.text for segment in segments)).strip()
    return normalizar_transcricao_clash(bruto)


def processar_audio_bytes(audio_bytes, mime_type, backend):
    suffix = suffix_for_mime(mime_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_file_name = temp_audio.name

    try:
        return processar_audio(temp_file_name, backend)
    finally:
        if os.path.exists(temp_file_name):
            os.remove(temp_file_name)


@dataclass
class UtteranceState:
    utterance_id: str
    speech_started_at: int = 0
    platform: str = "desktop"
    mime_type: str = "audio/webm"
    audio_bytes: bytearray = field(default_factory=bytearray)
    seq: int = 0
    chunk_count: int = 0
    partial_texts: dict = field(default_factory=dict)
    partial_tasks: dict = field(default_factory=dict)
    partial_inflight: set = field(default_factory=set)
    last_partial_sent_at: dict = field(default_factory=dict)
    finals_sent: set = field(default_factory=set)
    created_at_ms: int = 0
    first_chunk_at_ms: int = 0
    last_chunk_at_ms: int = 0
    bytes_received: int = 0
    decode_time_ms: dict = field(default_factory=dict)


def build_server_ready_payload():
    return {
        "type": "server_ready",
        "protocol": PROTOCOL_VERSION,
        "engines": [
            {
                "engine": backend.engine,
                "modelName": backend.model_name,
                "computeType": backend.compute_type,
                "decodeProfile": backend.decode_profile,
                "sharedModel": backend.shared_model,
                "partialEnabled": backend.partial_enabled,
            }
            for backend in ASR_BACKENDS
        ],
        "receivedAt": int(time.time() * 1000),
    }


def build_voice_event(utterance, backend, phase, transcript):
    received_at = int(time.time() * 1000)
    latency_ms = None
    if utterance.speech_started_at:
        latency_ms = max(0, received_at - utterance.speech_started_at)
    return {
        "type": "voice_event",
        "engine": backend.engine,
        "platform": utterance.platform or "desktop",
        "utteranceId": utterance.utterance_id,
        "phase": phase,
        "transcript": transcript,
        "confidence": None,
        "receivedAt": received_at,
        "speechStartedAt": utterance.speech_started_at or received_at,
        "latencyMs": latency_ms,
        "chunkCount": utterance.chunk_count,
        "modelName": backend.model_name,
        "computeType": backend.compute_type,
        "decodeProfile": backend.decode_profile,
        "sharedModel": backend.shared_model,
    }


def build_utterance_summary(utterance, closed_at_ms):
    started_at = utterance.speech_started_at or utterance.created_at_ms or 0
    speech_to_close_ms = max(0, closed_at_ms - started_at) if started_at else None
    capture_window_ms = None
    if utterance.first_chunk_at_ms and utterance.last_chunk_at_ms:
        capture_window_ms = max(0, utterance.last_chunk_at_ms - utterance.first_chunk_at_ms)
    return {
        "utteranceId": utterance.utterance_id,
        "platform": utterance.platform,
        "chunks": utterance.chunk_count,
        "bytes": utterance.bytes_received or len(utterance.audio_bytes),
        "speechToCloseMs": speech_to_close_ms,
        "captureWindowMs": capture_window_ms,
        "decodeMsByEngine": utterance.decode_time_ms,
        "partialsByEngine": list(utterance.partial_texts.keys()),
        "finalsByEngine": list(utterance.finals_sent),
    }


async def emit_voice_event(websocket, utterance, backend, phase, transcript):
    if not transcript:
        return
    payload = build_voice_event(utterance, backend, phase, transcript)
    await websocket.send(json.dumps(payload, ensure_ascii=False))


async def maybe_emit_partial_for_backend(websocket, utterance, backend):
    if not backend.partial_enabled:
        return
    if backend.engine in utterance.finals_sent or backend.engine in utterance.partial_inflight:
        return
    if utterance.chunk_count < PARTIAL_MIN_CHUNKS:
        return
    if len(utterance.audio_bytes) < PARTIAL_MIN_BYTES:
        return
    if (time.monotonic() - utterance.last_partial_sent_at.get(backend.engine, 0.0)) < PARTIAL_MIN_INTERVAL_S:
        return

    snapshot = bytes(utterance.audio_bytes)
    mime_type = utterance.mime_type
    utterance.partial_inflight.add(backend.engine)

    async def run_partial():
        decode_started = time.perf_counter()
        try:
            transcript = await asyncio.to_thread(processar_audio_bytes, snapshot, mime_type, backend)
            decode_ms = int((time.perf_counter() - decode_started) * 1000)
            utterance.decode_time_ms[backend.engine] = utterance.decode_time_ms.get(backend.engine, 0) + decode_ms
            if not transcript:
                log_event(
                    "partial_skip_empty",
                    level="debug",
                    engine=backend.engine,
                    utterance_id=utterance.utterance_id,
                    decode_ms=decode_ms,
                    chunks=utterance.chunk_count,
                    bytes=len(snapshot),
                )
                return
            if transcript == utterance.partial_texts.get(backend.engine) or backend.engine in utterance.finals_sent:
                log_event(
                    "partial_skip_duplicate",
                    level="debug",
                    engine=backend.engine,
                    utterance_id=utterance.utterance_id,
                    decode_ms=decode_ms,
                )
                return
            utterance.partial_texts[backend.engine] = transcript
            utterance.last_partial_sent_at[backend.engine] = time.monotonic()
            log_event(
                "partial_sent",
                engine=backend.engine,
                utterance_id=utterance.utterance_id,
                decode_ms=decode_ms,
                chunks=utterance.chunk_count,
                bytes=len(snapshot),
                text=transcript,
            )
            await emit_voice_event(websocket, utterance, backend, "partial", transcript)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log_event(
                "partial_error",
                level="warning",
                engine=backend.engine,
                utterance_id=utterance.utterance_id,
                error=str(exc),
            )
        finally:
            utterance.partial_inflight.discard(backend.engine)
            utterance.partial_tasks.pop(backend.engine, None)

    utterance.partial_tasks[backend.engine] = asyncio.create_task(run_partial())


async def maybe_emit_partial(websocket, utterance):
    for backend in ASR_BACKENDS:
        await maybe_emit_partial_for_backend(websocket, utterance, backend)


async def finalizar_utterance(websocket, utterance):
    if utterance.finals_sent.issuperset({backend.engine for backend in ASR_BACKENDS}):
        return

    pending_tasks = [
        task for task in utterance.partial_tasks.values()
        if task and not task.done()
    ]
    for task in pending_tasks:
        task.cancel()
    for task in pending_tasks:
        with suppress(asyncio.CancelledError):
            await task

    if not utterance.audio_bytes:
        log_event(
            "utterance_skip_empty",
            utterance_id=utterance.utterance_id,
            chunks=utterance.chunk_count,
            platform=utterance.platform,
        )
        return

    snapshot = bytes(utterance.audio_bytes)

    async def run_final(backend):
        if backend.engine in utterance.finals_sent:
            return
        utterance.finals_sent.add(backend.engine)
        decode_started = time.perf_counter()
        transcript = await asyncio.to_thread(
            processar_audio_bytes,
            snapshot,
            utterance.mime_type,
            backend,
        )
        decode_ms = int((time.perf_counter() - decode_started) * 1000)
        utterance.decode_time_ms[backend.engine] = utterance.decode_time_ms.get(backend.engine, 0) + decode_ms
        if transcript:
            log_event(
                "final_sent",
                engine=backend.engine,
                utterance_id=utterance.utterance_id,
                decode_ms=decode_ms,
                chunks=utterance.chunk_count,
                bytes=len(snapshot),
                text=transcript,
            )
            await emit_voice_event(websocket, utterance, backend, "final", transcript)
        else:
            log_event(
                "final_empty",
                level="debug",
                engine=backend.engine,
                utterance_id=utterance.utterance_id,
                decode_ms=decode_ms,
                chunks=utterance.chunk_count,
                bytes=len(snapshot),
            )

    await asyncio.gather(*(run_final(backend) for backend in ASR_BACKENDS))
    closed_at_ms = int(time.time() * 1000)
    log_event("utterance_closed", **build_utterance_summary(utterance, closed_at_ms))


async def recognize_audio(websocket):
    remote = str(getattr(websocket, "remote_address", "unknown"))
    conn_id = f"ws-{int(time.time() * 1000)}-{id(websocket)}"
    log_event("ws_connected", conn_id=conn_id, remote=remote)
    utterances = {}
    await websocket.send(json.dumps(build_server_ready_payload(), ensure_ascii=False))
    log_event("server_ready_sent", conn_id=conn_id, engines=[backend.engine for backend in ASR_BACKENDS])

    try:
        async for message in websocket:
            if not isinstance(message, str):
                log_event("ws_skip_non_text_message", level="debug", conn_id=conn_id)
                continue

            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                log_event(
                    "ws_invalid_json",
                    level="warning",
                    conn_id=conn_id,
                    sample=message[:180],
                )
                continue

            msg_type = payload.get("type")
            utterance_id = payload.get("utteranceId") or payload.get("utterance_id") or ""

            if msg_type == "start_utterance":
                if not utterance_id:
                    log_event("start_utterance_missing_id", level="warning", conn_id=conn_id)
                    continue
                now_ms = int(time.time() * 1000)
                utterances[utterance_id] = UtteranceState(
                    utterance_id=utterance_id,
                    speech_started_at=int(payload.get("speechStartedAt") or 0),
                    platform=payload.get("platform") or "desktop",
                    created_at_ms=now_ms,
                )
                log_event(
                    "utterance_started",
                    conn_id=conn_id,
                    utterance_id=utterance_id,
                    platform=utterances[utterance_id].platform,
                    speech_started_at=utterances[utterance_id].speech_started_at,
                )
                continue

            if msg_type == "audio_chunk":
                if not utterance_id:
                    log_event("audio_chunk_missing_id", level="warning", conn_id=conn_id)
                    continue
                utterance = utterances.setdefault(
                    utterance_id,
                    UtteranceState(
                        utterance_id=utterance_id,
                        speech_started_at=int(payload.get("speechStartedAt") or 0),
                        platform=payload.get("platform") or "desktop",
                        created_at_ms=int(time.time() * 1000),
                    ),
                )
                try:
                    chunk = base64.b64decode(payload.get("audioBase64") or "", validate=False)
                except Exception as exc:
                    log_event(
                        "audio_chunk_decode_error",
                        level="warning",
                        conn_id=conn_id,
                        utterance_id=utterance_id,
                        error=str(exc),
                    )
                    chunk = b""
                if not chunk:
                    log_event(
                        "audio_chunk_empty",
                        level="debug",
                        conn_id=conn_id,
                        utterance_id=utterance_id,
                    )
                    continue
                utterance.mime_type = payload.get("mimeType") or utterance.mime_type
                utterance.seq = max(utterance.seq, int(payload.get("seq") or 0))
                utterance.chunk_count += 1
                utterance.audio_bytes.extend(chunk)
                chunk_now_ms = int(time.time() * 1000)
                utterance.bytes_received += len(chunk)
                if not utterance.first_chunk_at_ms:
                    utterance.first_chunk_at_ms = chunk_now_ms
                utterance.last_chunk_at_ms = chunk_now_ms
                if utterance.chunk_count == 1 or utterance.chunk_count % 20 == 0:
                    log_event(
                        "audio_chunk_progress",
                        level="debug",
                        conn_id=conn_id,
                        utterance_id=utterance_id,
                        chunks=utterance.chunk_count,
                        bytes=utterance.bytes_received,
                        seq=utterance.seq,
                        mime=utterance.mime_type,
                    )
                await maybe_emit_partial(websocket, utterance)
                continue

            if msg_type == "end_utterance":
                if not utterance_id:
                    log_event("end_utterance_missing_id", level="warning", conn_id=conn_id)
                    continue
                utterance = utterances.get(utterance_id)
                if not utterance:
                    log_event(
                        "end_utterance_missing_state",
                        level="warning",
                        conn_id=conn_id,
                        utterance_id=utterance_id,
                    )
                    continue
                await finalizar_utterance(websocket, utterance)
                utterances.pop(utterance_id, None)
                continue

            if msg_type:
                log_event("ws_message_unhandled", level="debug", conn_id=conn_id, type=msg_type)
    except websockets.exceptions.ConnectionClosed:
        log_event("ws_closed", conn_id=conn_id, remote=remote)
    except Exception as exc:  # noqa: BLE001
        log_event("ws_loop_error", level="error", conn_id=conn_id, error=str(exc))
        raise
    finally:
        for utterance in utterances.values():
            for task in utterance.partial_tasks.values():
                if task and not task.done():
                    task.cancel()
        log_event("ws_cleanup_done", conn_id=conn_id, pending_utterances=len(utterances))


async def main():
    host = os.getenv("CR_LISTEN_HOST", "localhost")
    port = env_int("CR_LISTEN_PORT", 8765, min_value=1, max_value=65535)
    log_event("ws_server_starting", host=host, port=port)
    async with websockets.serve(recognize_audio, host, port, ping_interval=None):
        log_event("ws_server_ready", host=host, port=port)
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
