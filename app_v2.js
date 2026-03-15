/**
 * Clash Royale — Elixir Tracker do Oponente v3
 * Desktop-optimized with meta deck prediction
 */

// ─── Constants ───────────────────────────────────────────
const REGEN_NORMAL_MS = 2800;
const REGEN_TRIPLE_MS = 933;
const REGEN_DOUBLE_MS = 1400;
const MAX_ELIXIR = 10;
const START_ELIXIR = 5;
const AUTO_START_MAX_ELIXIR_BONUS = 4.5;
const ELIXIR_IMPOSSIBLE_PLAY_TOLERANCE = 0.22;
const MATCH_DURATION_S = 180;
const DOUBLE_ELIXIR_AT_S = 60;
const TICK_INTERVAL_MS = 50;
const DECK_SIZE = 8;
const HAND_SIZE = 4;
const VOICE_DEBOUNCE_MS = 320;
const VOICE_HIGH_CONFIDENCE = 0.85;
const VOICE_LOW_CONFIDENCE = 0.70;
const VOICE_MIN_CONFIDENCE_MARGIN = 0.08;
const VOICE_MIN_CONFIDENCE_MARGIN_SINGLE_TOKEN = 0.12;
const VOICE_BROWSER_ECHO_SUPPRESS_MS = 900;
const VOICE_REQUIRE_COST_FOR_NEW_PLAY = false;
const VOICE_ALLOW_GLOBAL_CARD_ONLY_INFERENCE = true;
const VOICE_REPORT_LIMIT = 320;
const VOICE_SLOT_HAND_LETTERS = ['A', 'B', 'C', 'D'];
const VOICE_SLOT_QUEUE_LETTERS = ['E', 'F', 'G', 'H'];
const VOICE_STABLE_WINDOW_MS = 120;
const VOICE_RECORDER_TIMESLICE_MS = 60;
const VOICE_ENSEMBLE_GROUP_WINDOW_MS = 520;
const VOICE_ENSEMBLE_STALE_GROUP_MS = 6500;
const VOICE_ENSEMBLE_STABLE_TTL_MS = 1700;
const VOICE_BROWSER_AUTHORITY_GRACE_MS = 8;
const VOICE_BROWSER_CARD_AUTHORITY_GRACE_MS = 10;
const VOICE_PREROLL_CHUNKS = 5;
const VOICE_PREROLL_MAX_AGE_MS = 520;
const VOICE_CHROME_ONLY_MODE = false;

// ─── DOM ─────────────────────────────────────────────────
const els = {
    matchPhase: document.getElementById('matchPhase'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerBar: document.getElementById('timerBar'),
    elixirValue: document.getElementById('elixirValue'),
    elixirBarFill: document.getElementById('elixirBarFill'),
    regenRate: document.getElementById('regenRate'),
    wastedValue: document.getElementById('wastedValue'),
    cardButtons: document.getElementById('cardButtons'),
    btnResetElixir: document.getElementById('btnResetElixir'),
    btnStart: document.getElementById('btnStart'),
    btnVoice: document.getElementById('btnVoice'),
    historyList: document.getElementById('historyList'),
    cycleHand: document.getElementById('cycleHand'),
    cycleQueue: document.getElementById('cycleQueue'),
    cardsPlayed: document.getElementById('cardsPlayed'),
    nextCardHero: document.getElementById('nextCardHero'),
    nextCardDisplay: document.getElementById('nextCardDisplay'),
    deckCards: document.getElementById('deckCards'),
    deckCount: document.getElementById('deckCount'),
    predictedDeck: document.getElementById('predictedDeck'),
    identifyOverlay: document.getElementById('identifyOverlay'),
    identifyClose: document.getElementById('identifyClose'),
    identifyCost: document.getElementById('identifyCost'),
    identifyStepType: document.getElementById('identifyStepType'),
    identifyStepCard: document.getElementById('identifyStepCard'),
    identifyCardList: document.getElementById('identifyCardList'),
    typeTroop: document.getElementById('typeTroop'),
    typeSpell: document.getElementById('typeSpell'),
    typeBuilding: document.getElementById('typeBuilding'),
    typeHero: document.getElementById('typeHero'),
    voiceStatus: document.getElementById('voiceStatus'),
    voiceDot: document.getElementById('voiceDot'),
    voiceStatusText: document.getElementById('voiceStatusText'),
    voiceTranscript: document.getElementById('voiceTranscript'),
    voiceLogPanel: document.getElementById('voiceLogPanel'),
    voiceLogOutput: document.getElementById('voiceLogOutput'),
    btnCopyVoiceLog: document.getElementById('btnCopyVoiceLog'),
    btnClearVoiceLog: document.getElementById('btnClearVoiceLog'),
};

// ─── State ───────────────────────────────────────────────
let state = {
    running: false,
    elixir: START_ELIXIR,
    wasted: 0,
    regenMs: REGEN_NORMAL_MS,
    isDouble: false,
    matchTimeRemaining: MATCH_DURATION_S,
    lastTick: 0,
    tickTimer: null,
    history: [],
    cardCycle: [],
    handCards: [],
    queueCards: [],
    totalPlayed: 0,
    opponentDeck: [],
    deckComplete: false,
    identifying: false,
    identifyCost: 0,
    identifyType: null,
    _currentCards: null,
    discardedPredictions: [],
    voice: {
        supported: false,
        listening: false,
        manuallyStopped: false,
        browserSupported: false,
        browserActive: false,
        nativeAvailable: false,
        nativeActive: false,
        whisperAvailable: false,
        whisperActive: false,
        whisperAltAvailable: false,
        whisperAltActive: false,
        recognition: null,
        platform: 'web',
        lastAcceptedText: '',
        lastAcceptedCost: null,
        lastAcceptedAt: 0,
        lastAcceptedIsFinal: false,
        lastAcceptedSource: '',
        lastResultIndex: -1,
        pendingCost: null,
        pendingCardText: '',
        engine: 'whisper',
        socketState: 'offline',
        chunksSent: 0,
        transcriptsReceived: 0,
        lastTranscript: '',
        lastPlayedCost: null,
        lastPlayedTime: 0,
        lastPlayedCardKey: '',
        lastSlotCommandKey: '',
        lastSlotCommandAt: 0,
        lastSlotCommandSource: '',
        lastSlotRawKey: '',
        lastSlotRawAt: 0,
        lastCommandKey: '',
        lastCommandAt: 0,
        lastCommandSource: '',
        awaitingCardOnlyCost: null,
        awaitingCardOnlyUntil: 0,
        lastMicLevel: 0,
        lastAudioDetectedAt: 0,
        lastRecognitionLagMs: 0,
        lastSpeechStartedAt: 0,
        debugEntries: [],
        excludedCards: new Set(), // Cards manually excluded by user — penalized in matching
    },
};

// ─── Engine ──────────────────────────────────────────────

function startMatch(options = {}) {
    const { preserveVoiceDedupe = false } = options;
    if (state.running) { resetMatch(); return; }

    state.running = true;
    state.elixir = START_ELIXIR;
    state.wasted = 0;
    state.regenMs = REGEN_NORMAL_MS;
    state.isDouble = false;
    state.matchTimeRemaining = MATCH_DURATION_S;
    state.history = [];
    state.lastTick = Date.now();
    state.cardCycle = [];
    state.handCards = [];
    state.queueCards = [];
    state.totalPlayed = 0;
    state.opponentDeck = [];
    state.deckComplete = false;
    state.voice.awaitingCardOnlyCost = null;
    state.voice.awaitingCardOnlyUntil = 0;
    state.voice.lastRecognitionLagMs = 0;
    state.voice.lastPlayedCost = null;
    state.voice.lastPlayedTime = 0;
    state.voice.lastPlayedCardKey = '';
    state.voice.pendingCost = null;
    state.voice.pendingCardText = '';
    if (!preserveVoiceDedupe) {
        lastResolvedVoiceAction = { normalizedKey: '', commandClass: '', engine: '', at: 0 };
        state.voice.lastAcceptedText = '';
        state.voice.lastAcceptedCost = null;
        state.voice.lastAcceptedAt = 0;
        state.voice.lastAcceptedIsFinal = false;
        state.voice.lastAcceptedSource = '';
        state.voice.lastResultIndex = -1;
        state.voice.lastCommandKey = '';
        state.voice.lastCommandAt = 0;
        state.voice.lastCommandSource = '';
        state.voice.lastSlotCommandKey = '';
        state.voice.lastSlotCommandAt = 0;
        state.voice.lastSlotCommandSource = '';
        state.voice.lastSlotRawKey = '';
        state.voice.lastSlotRawAt = 0;
    }

    els.btnStart.innerHTML = '<span class="btn-icon">⏹</span> RESET';
    els.btnStart.classList.add('running');
    els.matchPhase.textContent = 'NORMAL';
    els.matchPhase.className = 'match-phase active';
    els.timerDisplay.className = 'timer-compact';

    clearHistoryUI();
    updateAll();
    state.tickTimer = setInterval(tick, TICK_INTERVAL_MS);
    appendVoiceDebug('match_start', { preserveVoiceDedupe: preserveVoiceDedupe ? 1 : 0 });
}

function resetMatch() {
    state.running = false;
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }

    state.elixir = START_ELIXIR;
    state.wasted = 0;
    state.regenMs = REGEN_NORMAL_MS;
    state.isDouble = false;
    state.matchTimeRemaining = MATCH_DURATION_S;
    state.history = [];
    state.cardCycle = [];
    state.handCards = [];
    state.queueCards = [];
    state.totalPlayed = 0;
    state.opponentDeck = [];
    state.deckComplete = false;
    state._autoFilled = false;
    state.discardedPredictions = [];
    state.voice.awaitingCardOnlyCost = null;
    state.voice.awaitingCardOnlyUntil = 0;
    state.voice.lastRecognitionLagMs = 0;
    state.voice.lastPlayedCost = null;
    state.voice.lastPlayedTime = 0;
    state.voice.lastPlayedCardKey = '';
    state.voice.pendingCost = null;
    state.voice.pendingCardText = '';
    lastResolvedVoiceAction = { normalizedKey: '', commandClass: '', engine: '', at: 0 };
    state.voice.lastAcceptedText = '';
    state.voice.lastAcceptedCost = null;
    state.voice.lastAcceptedAt = 0;
    state.voice.lastAcceptedIsFinal = false;
    state.voice.lastAcceptedSource = '';
    state.voice.lastResultIndex = -1;
    state.voice.lastCommandKey = '';
    state.voice.lastCommandAt = 0;
    state.voice.lastCommandSource = '';
    state.voice.lastSlotCommandKey = '';
    state.voice.lastSlotCommandAt = 0;
    state.voice.lastSlotCommandSource = '';
    state.voice.lastSlotRawKey = '';
    state.voice.lastSlotRawAt = 0;
    closeIdentifyModal();

    els.btnStart.innerHTML = '<span class="btn-icon">▶</span> INICIAR';
    els.btnStart.classList.remove('running');
    els.matchPhase.textContent = 'PRONTO';
    els.matchPhase.className = 'match-phase';
    els.timerDisplay.className = 'timer-compact';
    els.regenRate.textContent = '2.8s / ponto';

    clearHistoryUI();
    updateAll();
    appendVoiceDebug('match_reset');
}

function tick() {
    const now = Date.now();
    const deltaMs = now - state.lastTick;
    state.lastTick = now;

    state.matchTimeRemaining -= deltaMs / 1000;

    // Check phases based on matchTimeRemaining (starts at 180)
    // 180 to 60: 1x Elixir (2.8s)
    // 60 to 0: 2x Elixir (1.4s)
    // 0 to -60: Overtime 2x Elixir (1.4s)
    // -60 onwards: 3x Elixir (0.933s)

    if (state.matchTimeRemaining <= 60 && state.matchTimeRemaining > -60 && !state.isDouble) {
        state.isDouble = true;
        state.regenMs = REGEN_DOUBLE_MS;
        els.matchPhase.textContent = state.matchTimeRemaining <= 0 ? 'OVERTIME 2x' : '2x ELIXIR';
        els.matchPhase.className = 'match-phase double';
        els.timerDisplay.classList.add('double-time');
        els.regenRate.textContent = '1.4s / ponto';
    } else if (state.matchTimeRemaining <= 0 && state.isDouble && els.matchPhase.textContent !== 'OVERTIME 2x') {
        els.matchPhase.textContent = 'OVERTIME 2x';
    }

    if (state.matchTimeRemaining <= -60 && state.regenMs !== REGEN_TRIPLE_MS) {
        state.regenMs = REGEN_TRIPLE_MS;
        els.matchPhase.textContent = '3x ELIXIR!!';
        els.matchPhase.className = 'match-phase triple';
        els.timerDisplay.classList.add('triple-time');
        els.regenRate.textContent = '0.9s / ponto';
    }

    if (state.matchTimeRemaining <= 15 && state.matchTimeRemaining > 0) {
        els.timerDisplay.classList.add('ending');
    } else {
        els.timerDisplay.classList.remove('ending');
    }

    state.elixir += deltaMs / state.regenMs;
    if (state.elixir > MAX_ELIXIR) {
        state.wasted += state.elixir - MAX_ELIXIR;
        state.elixir = MAX_ELIXIR;
    }

    updateElixirUI();
    updateTimerUI();
}

// ─── Card Cycle ──────────────────────────────────────────

function processCardPlayed(cost, cardName) {
    const advancedVisibleMatrix = tryAdvanceVisibleHandQueue(cardName, cost);
    state.totalPlayed++;
    state.cardCycle.push({ cost, name: cardName || cost.toString(), playIndex: state.totalPlayed });
    if (!advancedVisibleMatrix) {
        rebuildCyclePrediction();
    }
}

function isNamedVisibleCard(card) {
    return !!(card && card.name && !/^\d+$/.test(card.name));
}

function hasCompleteVisibleHandQueueMatrix(handCards = state.handCards, queueCards = state.queueCards) {
    const hand = (handCards || []).slice(0, HAND_SIZE);
    const queue = (queueCards || []).slice(0, HAND_SIZE);
    if (hand.length < HAND_SIZE || queue.length < HAND_SIZE) return false;
    if (!hand.every(isNamedVisibleCard) || !queue.every(isNamedVisibleCard)) return false;

    const combinedKeys = [...hand, ...queue]
        .map(card => normalizeCardName(card.name))
        .filter(Boolean);
    return combinedKeys.length === HAND_SIZE * 2 && new Set(combinedKeys).size === HAND_SIZE * 2;
}

function tryAdvanceVisibleHandQueue(cardName, cost) {
    const playedKey = normalizeCardName(cardName || '');
    if (!playedKey || /^\d+$/.test(cardName || '')) return false;

    const hand = (state.handCards || []).slice(0, HAND_SIZE).map(card => (card ? { ...card } : null));
    const queue = (state.queueCards || []).slice(0, HAND_SIZE).map(card => (card ? { ...card } : null));
    if (!hasCompleteVisibleHandQueueMatrix(hand, queue)) return false;

    const matchingIndexes = hand
        .map((card, index) => (normalizeCardName(card && card.name) === playedKey ? index : -1))
        .filter(index => index !== -1);
    if (matchingIndexes.length !== 1) return false;

    const handIndex = matchingIndexes[0];
    const playedCard = hand[handIndex] ? { ...hand[handIndex] } : null;
    const promotedCard = queue[0] ? { ...queue[0] } : null;
    if (!isNamedVisibleCard(playedCard) || !isNamedVisibleCard(promotedCard)) return false;

    if (Number.isFinite(cost)) {
        playedCard.cost = cost;
    }

    const nextHand = hand.slice();
    nextHand[handIndex] = promotedCard;

    const nextQueue = queue.slice(1).map(card => ({ ...card }));
    nextQueue.push(playedCard);

    if (!hasCompleteVisibleHandQueueMatrix(nextHand, nextQueue)) return false;

    state.handCards = nextHand;
    state.queueCards = nextQueue;
    return true;
}

function getDeckInferencePool() {
    const deck = state.opponentDeck || [];
    const seen = new Set();
    const ordered = [
        ...deck.filter(card => card && card.confirmed && card.name && !/^\d+$/.test(card.name)),
        ...deck.filter(card => card && !card.confirmed && card.name && !/^\d+$/.test(card.name)),
    ];

    const pool = [];
    ordered.forEach(card => {
        const key = normalizeCardName(card.name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        pool.push(card);
    });
    return pool;
}

function rebuildCyclePrediction() {
    const played = state.cardCycle;
    const total = played.length;
    if (total === 0) { state.queueCards = []; state.handCards = []; return; }
    const previousHand = (state.handCards || []).slice(0, HAND_SIZE);

    const recentFour = played.slice(-HAND_SIZE);
    const recentCycleKeys = new Set(
        recentFour
            .map(card => normalizeCardName(card && card.name))
            .filter(Boolean)
    );
    // Deduplicate queue: same named card cannot appear twice
    const queueSeen = new Set();
    state.queueCards = recentFour
        .map((c, i) => ({ ...c, returnsIn: HAND_SIZE - i }))
        .filter(c => {
            const key = (c.name && !/^\d+$/.test(c.name)) ? normalizeCardName(c.name) : `__cost_${c.cost}_${Math.random()}`;
            if (queueSeen.has(key)) return false;
            queueSeen.add(key);
            return true;
        });

    const handCandidates = total >= HAND_SIZE + 1
        ? played.slice(-(HAND_SIZE * 2), -HAND_SIZE).map(c => ({ ...c }))
        : [];

    const confirmedDeck = getConfirmedDeckCards();
    const knownDeckPool = getDeckInferencePool();
    const deckReady = syncDeckCompleteFlag();
    const stableDeckPool = (deckReady && confirmedDeck.length >= DECK_SIZE)
        ? confirmedDeck
        : (knownDeckPool.length >= DECK_SIZE ? knownDeckPool : []);

    if (stableDeckPool.length >= DECK_SIZE) {
        // With full deck visibility, hand = deck minus the 4 cards currently cycling.
        const inferredHand = stableDeckPool
            .filter(card => !recentCycleKeys.has(normalizeCardName(card.name)))
            .map(card => ({ cost: card.cost, name: card.name, inferredFromDeck: true }))
            .slice(0, HAND_SIZE);

        // Accept partial hand inference too (relaxed from === to >=)
        if (inferredHand.length >= 1) {
            state.handCards = inferredHand.slice(0, HAND_SIZE);
            return;
        }
    }

    const fillDeck = stableDeckPool.length > 0 ? stableDeckPool : confirmedDeck;
    if (handCandidates.length < HAND_SIZE && fillDeck.length > 0) {
        const inQueue = new Set(recentCycleKeys);
        const inHand = new Set(
            handCandidates
                .map(card => normalizeCardName(card.name))
                .filter(Boolean)
        );

        const fillCandidates = fillDeck
            .filter(card => {
                const key = normalizeCardName(card.name);
                return key && !inQueue.has(key) && !inHand.has(key);
            })
            .map(card => {
                const key = normalizeCardName(card.name);
                let lastSeenIdx = -1;
                for (let i = played.length - 1; i >= 0; i--) {
                    if (normalizeCardName(played[i].name) === key) {
                        lastSeenIdx = i;
                        break;
                    }
                }
                return { card, lastSeenIdx };
            })
            .sort((a, b) => a.lastSeenIdx - b.lastSeenIdx);

        fillCandidates.forEach(({ card }) => {
            if (handCandidates.length >= HAND_SIZE) return;
            const key = normalizeCardName(card.name);
            if (inHand.has(key)) return;
            inHand.add(key);
            handCandidates.push({ cost: card.cost, name: card.name, inferredFromDeck: true });
        });
    }

    if (handCandidates.length < HAND_SIZE && knownDeckPool.length > 0) {
        const inQueue = new Set(recentCycleKeys);
        const inHand = new Set(
            handCandidates
                .map(card => normalizeCardName(card.name))
                .filter(Boolean)
        );

        const fillFromPool = knownDeckPool
            .filter(card => {
                const key = normalizeCardName(card.name);
                return key && !inQueue.has(key) && !inHand.has(key);
            })
            .map(card => {
                const key = normalizeCardName(card.name);
                let lastSeenIdx = -1;
                for (let i = played.length - 1; i >= 0; i--) {
                    if (normalizeCardName(played[i].name) === key) {
                        lastSeenIdx = i;
                        break;
                    }
                }
                return { card, lastSeenIdx };
            })
            .sort((a, b) => {
                const confirmedDiff = (b.card.confirmed ? 1 : 0) - (a.card.confirmed ? 1 : 0);
                if (confirmedDiff !== 0) return confirmedDiff;
                return a.lastSeenIdx - b.lastSeenIdx;
            });

        fillFromPool.forEach(({ card }) => {
            if (handCandidates.length >= HAND_SIZE) return;
            const key = normalizeCardName(card.name);
            if (inHand.has(key)) return;
            inHand.add(key);
            handCandidates.push({
                cost: card.cost,
                name: card.name,
                inferredFromDeck: true,
                inferredFromPrediction: !card.confirmed,
            });
        });
    }


    // Deduplicate hand: same named card cannot appear twice
    const handSeen = new Set();
    recentCycleKeys.forEach(key => handSeen.add(key));
    const deduped = handCandidates.filter(c => {
        const key = (c.name && !/^\d+$/.test(c.name)) ? normalizeCardName(c.name) : `__cost_${c.cost}_${Math.random()}`;
        if (handSeen.has(key)) return false;
        handSeen.add(key);
        return true;
    });

    const addFallbackHandCard = (card, mark = {}) => {
        if (deduped.length >= HAND_SIZE) return;
        if (!card || !card.name || /^\d+$/.test(card.name)) return;
        const key = normalizeCardName(card.name);
        if (!key || handSeen.has(key)) return;
        handSeen.add(key);
        deduped.push({
            cost: card.cost,
            name: card.name,
            inferredFromDeck: true,
            ...mark,
        });
    };

    // Preserve previous visible hand first to avoid flicker/disappearing slots.
    previousHand.forEach(card => addFallbackHandCard(card, { preservedFromPrevious: true }));
    // Then complete with known deck pool when available.
    knownDeckPool.forEach(card => addFallbackHandCard(card));

    state.handCards = deduped.slice(0, HAND_SIZE);
}

function getNextCardPrediction() {
    return state.queueCards.length >= HAND_SIZE ? state.queueCards[0] : null;
}

// ─── Identification Flow ─────────────────────────────────

function beginIdentification(cost) {
    // If already identifying, close the previous one first
    if (state.identifying) closeIdentifyModal();
    state.identifying = true;
    state.identifyCost = cost;
    state.identifyType = null;
    els.identifyCost.textContent = cost;

    // Sempre renderiza a lista imediatamente para evitar painel vazio.
    showCardList('all');

    els.identifyOverlay.style.display = 'block';
}

function selectType(type) {
    state.identifyType = type;
    showCardList(type);
}

function showCardList(type) {
    els.identifyStepType.style.display = 'none';
    els.identifyStepCard.style.display = 'block';

    const identifiedNames = state.opponentDeck.filter(c => c.confirmed).map(c => c.name);
    const scored = (type === 'all')
        ? getScoredCardsForCost(state.identifyCost, null, identifiedNames)
        : getScoredCardsForCost(state.identifyCost, type, identifiedNames);

    // Assign keyboard letters
    const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    scored.forEach((c, i) => { c.key = keys[i] || (i + 1).toString(); });

    const typeLabel = { T: '🗡️', S: '✨', B: '🏗️', C: '👑', H: '⚔️' };

    els.identifyCardList.innerHTML = scored.map(card => {
        const percentage = scored[0].score > 0 ? Math.round((card.score / scored[0].score) * 100) : 0;
        const barWidth = percentage;
        const primaryImage = getImagePathPrimary(card.image);
        const fallbackImage = getImagePathFallback(card.image);
        const fallbackAttr = fallbackImage ? ` data-fallback="${fallbackImage}"` : '';
        const imgHtml = card.image !== null
            ? `<div class="card-img-wrapper"><img src="${primaryImage}" class="card-grid-img" alt="${card.name}"${fallbackAttr} onerror="onCardArtError(this)"></div>`
            : `<div class="card-img-wrapper fallback-img"><span class="card-type-icon">${typeLabel[card.type] || '🗡️'}</span></div>`;
        return `
        <button class="identify-grid-btn" data-card-name="${card.name}" data-card-key="${card.key}" title="${card.name}">
            <div class="card-kbd-badge">${card.key}</div>
            ${imgHtml}
            <div class="card-grid-name">${card.name}</div>
            ${card.score > 0 ? `<div class="card-prob-badge">${percentage}%</div><div class="card-prob-bar"><div class="prob-fill" style="width:${barWidth}%"></div></div>` : ''}
        </button>`;
    }).join('') + `
        <button class="identify-grid-btn skip-btn" data-card-name="__skip__" data-card-key="/" title="Pular">
            <div class="card-kbd-badge">/</div>
            <div class="card-img-wrapper skip-img">⏭️</div>
            <div class="card-grid-name">Pular Ident.</div>
        </button>`;

    state._currentCards = scored;
}

function confirmPredictedCard(cardName) {
    if (syncDeckCompleteFlag()) return;

    const predicted = state.opponentDeck.find(c => c.name === cardName && !c.confirmed);
    if (predicted) {
        predicted.confirmed = true;
        
        syncDeckCompleteFlag();
        
        updateAll();
    }
}

function ensureConfirmedOpponentCard(cardName, costHint = null) {
    if (!cardName || /^\d+$/.test(cardName)) return false;
    if (syncDeckCompleteFlag()) return false;

    const target = normalizeCardName(cardName);
    const cardData = (typeof ALL_CARDS !== 'undefined')
        ? ALL_CARDS.find(c => normalizeCardName(c.name) === target)
        : null;
    const canonicalName = cardData ? cardData.name : cardName;

    const alreadyConfirmed = state.opponentDeck.find(c => normalizeCardName(c.name) === target && c.confirmed);
    if (alreadyConfirmed) return true;

    const predicted = state.opponentDeck.find(c => normalizeCardName(c.name) === target && !c.confirmed);
    if (predicted) {
        predicted.confirmed = true;
        if (cardData) {
            predicted.cost = cardData.cost;
            predicted.type = cardData.type;
            predicted.name = canonicalName;
        }
    } else {
        const existing = state.opponentDeck.find(c => normalizeCardName(c.name) === target);
        if (existing) {
            existing.confirmed = true;
            if (cardData) {
                existing.cost = cardData.cost;
                existing.type = cardData.type;
                existing.name = canonicalName;
            }
        } else {
            state.opponentDeck.push({
                cost: cardData ? cardData.cost : (Number.isFinite(costHint) ? costHint : 0),
                name: canonicalName,
                type: cardData ? cardData.type : 'T',
                confirmed: true,
            });
        }
    }

    const confirmedCount = getConfirmedDeckCount();
    if (confirmedCount >= 2) autoFillPredictions();
    syncDeckCompleteFlag();
    rebuildCyclePrediction();
    return true;
}

function confirmCardIdentification(cardName) {
    const cost = state.identifyCost;

    if (cardName !== '__skip__' && !syncDeckCompleteFlag()) {
        if (!state.opponentDeck.find(c => c.name === cardName && c.confirmed)) {
            // Check if this card was predicted — if so, promote it
            const predicted = state.opponentDeck.find(c => c.name === cardName && !c.confirmed);
            if (predicted) {
                predicted.confirmed = true;
            } else {
                // Remove any predicted card with same cost to make room, or just add
                const card = ALL_CARDS.find(c => c.name === cardName);
                state.opponentDeck.push({ cost, name: cardName, type: card ? card.type : 'T', confirmed: true });
            }

            // Count confirmed cards
            const confirmedCount = getConfirmedDeckCount();

            // Auto-fill dynamically when >= 2
            if (confirmedCount >= 2) {
                autoFillPredictions();
            }

            // Check if all 8 are confirmed
            syncDeckCompleteFlag();
        }
    }

    processCardPlayed(cost, cardName === '__skip__' ? cost.toString() : cardName);
    closeIdentifyModal();
    finalizeCardPlay(cost, cardName === '__skip__' ? null : cardName);
}

function autoFillPredictions() {
    const confirmedCards = state.opponentDeck.filter(c => c.confirmed);
    const confirmedNames = confirmedCards.map(c => c.name);
    const predicted = predictDecks(confirmedNames);

    if (predicted.length === 0) return;

    // Use the name of the highest scoring specific variation for the HUD label
    const bestDeck = predicted[0];
    
    // Clear out any old unconfirmed predictions
    state.opponentDeck = confirmedCards;

    // Retrieve all unseen cards and rank them statistically by synergy with the confirmed cards
    let unseenTotal = ALL_CARDS
        .filter(c => !confirmedNames.includes(c.name) && !state.discardedPredictions.includes(c.name))
        .filter(c => c.name !== 'Espelho'); // nunca sugerir Espelho como previsão automática
    let probabilityRanked = scoreCards(unseenTotal, confirmedNames);
    
    // Fill the remaining empty slots with the highest mathematically probable cards
    const remainingSlots = DECK_SIZE - confirmedNames.length;
    const topSuggestions = probabilityRanked.slice(0, remainingSlots);

    const maxScore = probabilityRanked.length > 0 && probabilityRanked[0].score > 0 ? probabilityRanked[0].score : 1;

    topSuggestions.forEach(card => {
        state.opponentDeck.push({
            cost: card.cost,
            name: card.name,
            type: card.type,
            confirmed: false,
            predictedFrom: bestDeck.name, // Will be displayed in tooltip or deck title
            prob: Math.round((card.score / maxScore) * 100)
        });
    });

    state._autoFilled = true;
    updateDeckUI(); // Ensure UI refreshed immediately
}

function closeIdentifyModal() {
    state.identifying = false;
    state._currentCards = null;
    state.voice.pendingCost = null;
    state.voice.pendingCardText = '';
    els.identifyOverlay.style.display = 'none';
    els.identifyStepType.style.display = 'block';
    els.identifyStepCard.style.display = 'none';
}

// ─── Actions ─────────────────────────────────────────────

function getAutoStartOpeningBonus(cost) {
    const numericCost = Number.isFinite(cost) ? cost : parseFloat(cost);
    if (!Number.isFinite(numericCost)) return 0;

    const minToAfford = Math.max(0, numericCost - START_ELIXIR);
    let reactionBonus = 0.9;
    if (numericCost <= 2) reactionBonus = 0.6;
    else if (numericCost >= 5) reactionBonus = 1.15;

    return Math.min(AUTO_START_MAX_ELIXIR_BONUS, minToAfford + reactionBonus);
}

function applyAutoStartCalibration(firstCost) {
    if (!state.running) return;
    if (state.totalPlayed > 0 || state.history.length > 0) return;

    const bonusElixir = getAutoStartOpeningBonus(firstCost);
    if (bonusElixir <= 0) return;

    state.elixir = Math.min(MAX_ELIXIR, state.elixir + bonusElixir);
    state.matchTimeRemaining -= (bonusElixir * REGEN_NORMAL_MS) / 1000;
    state.lastTick = Date.now();
}

function getConfirmedDeckCards() {
    const deck = state.opponentDeck || [];
    const seen = new Set();
    const confirmed = [];
    deck.forEach(card => {
        if (!card || !card.confirmed || !card.name || /^\d+$/.test(card.name)) return;
        const key = normalizeCardName(card.name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        confirmed.push(card);
    });
    return confirmed;
}

function getConfirmedDeckCount() {
    return getConfirmedDeckCards().length;
}

function getKnownDeckCardCount() {
    const deck = state.opponentDeck || [];
    const seen = new Set();
    deck.forEach(card => {
        if (!card || !card.name || /^\d+$/.test(card.name)) return;
        const key = normalizeCardName(card.name);
        if (key) seen.add(key);
    });
    return seen.size;
}

function hasFullVisibleSlotMatrix() {
    return hasCompleteVisibleHandQueueMatrix();
}

function syncDeckCompleteFlag() {
    const deckReady = getConfirmedDeckCount() >= DECK_SIZE;
    if (state.deckComplete !== deckReady) {
        state.deckComplete = deckReady;
    }
    return deckReady;
}

function isLetterModeReady() {
    if (syncDeckCompleteFlag()) return true;
    if (getKnownDeckCardCount() >= DECK_SIZE) return true;
    return hasFullVisibleSlotMatrix();
}

function inferDeckCardByCost(cost, preferredCardName = null) {
    const confirmedDeck = getConfirmedDeckCards();
    const byCost = confirmedDeck.filter(card => card.cost === cost);
    if (byCost.length === 0) {
        return { card: null, reason: 'no_card_for_cost', candidates: [] };
    }

    if (preferredCardName) {
        const preferredKey = normalizeCardName(preferredCardName);
        const preferred = byCost.find(card => normalizeCardName(card.name) === preferredKey)
            || confirmedDeck.find(card => normalizeCardName(card.name) === preferredKey)
            || null;
        if (preferred) {
            return { card: preferred, reason: 'preferred_match', candidates: [preferred] };
        }
    }

    if (byCost.length === 1) {
        return { card: byCost[0], reason: 'single_cost_in_deck', candidates: byCost };
    }

    const queueBlocked = new Set(
        (state.queueCards || [])
            .map(card => normalizeCardName(card.name))
            .filter(Boolean)
    );
    const playableByCycle = byCost.filter(card => !queueBlocked.has(normalizeCardName(card.name)));
    if (playableByCycle.length === 1) {
        return { card: playableByCycle[0], reason: 'single_playable_by_cycle', candidates: playableByCycle };
    }

    const handKeys = new Set(
        (state.handCards || [])
            .map(card => normalizeCardName(card.name))
            .filter(Boolean)
    );
    const inHand = byCost.filter(card => handKeys.has(normalizeCardName(card.name)));
    if (inHand.length === 1) {
        return { card: inHand[0], reason: 'single_in_hand', candidates: inHand };
    }
    if (inHand.length > 1) {
        return { card: null, reason: 'ambiguous_same_cost_hand', candidates: inHand };
    }

    const next = getNextCardPrediction();
    if (next && next.cost === cost && next.name && !/^\d+$/.test(next.name)) {
        const nextKey = normalizeCardName(next.name);
        const nextMatch = byCost.find(card => normalizeCardName(card.name) === nextKey);
        if (nextMatch) {
            return { card: nextMatch, reason: 'next_prediction', candidates: [nextMatch] };
        }
    }

    return { card: null, reason: 'ambiguous_same_cost', candidates: byCost };
}

function registerChampionAbilitySpend(cost, meta = {}) {
    const source = meta && meta.source ? meta.source : 'manual';
    const label = meta && meta.label ? meta.label : `Habilidade de Campeao (${cost})`;

    if (!state.running) {
        appendVoiceDebug('ability_skip', { reason: 'match_off', source, cost });
        return { applied: false, reason: 'match_off' };
    }
    if (cost < 1 || cost > 3) {
        appendVoiceDebug('ability_skip', { reason: 'invalid_cost', source, cost });
        return { applied: false, reason: 'invalid_cost' };
    }

    const beforeElixir = state.elixir;
    if (cost > state.elixir + ELIXIR_IMPOSSIBLE_PLAY_TOLERANCE) {
        state.elixir = Math.min(MAX_ELIXIR, cost);
        appendVoiceDebug('elixir_recalib', {
            source,
            before: beforeElixir.toFixed(2),
            to: state.elixir.toFixed(2),
            cost,
            reason: 'ability',
        });
    }

    state.elixir = Math.max(0, state.elixir - cost);
    const timeStr = formatTime(state.matchTimeRemaining);
    state.history.unshift({
        cost,
        cardName: label,
        time: timeStr,
        remaining: state.elixir.toFixed(1),
        type: 'ability',
    });

    triggerBump('down');
    updateAll();
    addHistoryEntry(state.history[0]);
    appendVoiceDebug('ability_sub', {
        source,
        cost,
        before: beforeElixir.toFixed(2),
        after: state.elixir.toFixed(2),
    });
    return { applied: true, reason: 'ok' };
}

function subtractElixir(cost, preferredCardName = null, meta = {}) {
    const source = meta && meta.source ? meta.source : 'manual';
    const skipIdentify = !!(meta && meta.skipIdentify);
    const forceManualIdentify = !!(meta && meta.forceManualIdentify);
    const forcedCycleCardName = meta && meta.forcedCycleCardName ? meta.forcedCycleCardName : null;
    const forcedHistoryCardName = meta && meta.forcedHistoryCardName ? meta.forcedHistoryCardName : null;
    if (!state.running) {
        appendVoiceDebug('elixir_skip', { reason: 'match_off', source, cost });
        return { applied: false, resolvedName: null, ambiguous: false, reason: 'match_off', candidates: [] };
    }
    if (cost < 1 || cost > 10) {
        appendVoiceDebug('elixir_skip', { reason: 'invalid_cost', source, cost });
        return { applied: false, resolvedName: null, ambiguous: false, reason: 'invalid_cost', candidates: [] };
    }

    const deckReady = syncDeckCompleteFlag();
    const beforeElixir = state.elixir;

    if (cost > state.elixir + ELIXIR_IMPOSSIBLE_PLAY_TOLERANCE) {
        console.log(`Recalibrando elixir: leitura ${state.elixir.toFixed(2)} impossibilita custo ${cost}.`);
        state.elixir = Math.min(MAX_ELIXIR, cost);
        appendVoiceDebug('elixir_recalib', {
            source,
            before: beforeElixir.toFixed(2),
            to: state.elixir.toFixed(2),
            cost
        });
    }

    state.elixir = Math.max(0, state.elixir - cost);
    const afterElixir = state.elixir;
    updateElixirUI();
    appendVoiceDebug('elixir_sub', {
        source,
        cost,
        before: beforeElixir.toFixed(2),
        after: afterElixir.toFixed(2),
        preferred: preferredCardName || '-',
        deckReady: deckReady ? 1 : 0
    });

    if (!deckReady && !skipIdentify) {
        // Open identification but NEVER block — elixir is already subtracted
        beginIdentification(cost);
        return { applied: true, resolvedName: null, ambiguous: false, reason: 'identify_opened', candidates: [] };
    } else {
        const inferred = inferDeckCardByCost(cost, preferredCardName);
        if (forceManualIdentify && !skipIdentify) {
            const candidates = (inferred.candidates || [])
                .map(card => card && card.name)
                .filter(Boolean);
            appendVoiceDebug('deck_infer', {
                source,
                cost,
                reason: 'manual_review_requested',
                card: '-',
                options: candidates.join(',') || '-',
            });
            return {
                applied: true,
                resolvedName: null,
                ambiguous: true,
                reason: 'manual_review_requested',
                candidates,
            };
        }
        let match = inferred.card || null;
        if (!match && preferredCardName) {
            const target = normalizeCardName(preferredCardName);
            match = state.opponentDeck.find(c => normalizeCardName(c.name) === target && c.cost === cost)
                || state.opponentDeck.find(c => normalizeCardName(c.name) === target)
                || null;
        }
        if (!match && inferred && /^ambiguous_/.test(inferred.reason || '')) {
            const candidates = (inferred.candidates || [])
                .map(card => card && card.name)
                .filter(Boolean);
            appendVoiceDebug('deck_infer', {
                source,
                cost,
                reason: inferred.reason,
                card: '-',
                options: candidates.join(',') || '-',
            });
            return {
                applied: true,
                resolvedName: null,
                ambiguous: true,
                reason: inferred.reason,
                candidates,
            };
        }
        const cycleName = forcedCycleCardName || (match ? match.name : cost.toString());
        const historyName = (typeof forcedHistoryCardName === 'string')
            ? forcedHistoryCardName
            : (match ? match.name : null);
        processCardPlayed(cost, cycleName || cost.toString());
        finalizeCardPlay(cost, historyName);
        const candidates = (inferred && inferred.candidates ? inferred.candidates : [])
            .map(card => card && card.name)
            .filter(Boolean);
        appendVoiceDebug('deck_infer', {
            source,
            cost,
            reason: inferred ? inferred.reason : 'fallback_match',
            card: match ? match.name : '-',
            options: candidates.join(',') || '-',
        });
        return {
            applied: true,
            resolvedName: match ? match.name : null,
            ambiguous: !match && candidates.length > 1,
            reason: inferred ? inferred.reason : 'fallback_match',
            candidates,
        };
    }
}

function finalizeCardPlay(cost, cardName) {
    const timeStr = formatTime(state.matchTimeRemaining);
    state.history.unshift({
        cost,
        cardName: cardName || cost.toString(),
        time: timeStr,
        remaining: state.elixir.toFixed(1),
        type: 'card',
    });

    triggerBump('down');
    updateAll();
    addHistoryEntry(state.history[0]);
}

function resetElixirToMax() {
    if (!state.running) return;
    state.elixir = MAX_ELIXIR;

    state.history.unshift({
        cost: 'RESET', time: formatTime(state.matchTimeRemaining),
        remaining: 10, type: 'reset',
    });

    triggerBump('up');
    updateElixirUI();
    addHistoryEntry(state.history[0]);
    appendVoiceDebug('elixir_reset', { to: MAX_ELIXIR });
}

// ─── UI Updates ──────────────────────────────────────────

function updateAll() {
    updateElixirUI();
    updateTimerUI();
    updateCycleUI();
    updateDeckUI();
    updateNextCardHero();
    updatePredictedDeck();
}


function isSpamCounter(name) {
    if (!name || /^\d+$/.test(name)) return false;
    const dbCard = typeof ALL_CARDS !== 'undefined' ? ALL_CARDS.find(c => c.name === name) : null;
    return dbCard && dbCard.isCounterToSpam === true;
}

// ─── Vulnerabilidade focada em PEKKA Bridge Spam ───────────────
const PEKKA_DEF_GROUPS = {
    building: ['Canhão', 'Torre de Bombas', 'Tesla', 'Torre Inferno', 'Lápide', 'Jaula de Goblin'],
    swarm: ['Exército de Esqueletos', 'Gangue de Goblins', 'Guardas', 'Esqueletos', 'Goblins', 'Morcegos', 'Recrutas Reais'],
    miniTank: ['Mini PEKKA', 'Príncipe', 'Príncipe das Trevas', 'Cavaleiro', 'Valquíria', 'Pequeno Príncipe', 'Megacavaleiro', 'P.E.K.K.A'],
    splash: ['Bebê Dragão', 'Mago de Gelo', 'Mago', 'Lançador', 'Arqueiro Mágico', 'Fênix'],
    control: ['O Tronco', 'Bola de Neve', 'Choque (Zap)', 'Flechas', 'Tornado'],
};

const PEKKA_GROUP_WEIGHT = {
    building: 1.5,
    swarm: 1.2,
    miniTank: 1.1,
    splash: 0.9,
    control: 0.5,
};

// ─── Cartas que são ameaça/counter ao PEKKA Bridge Spam do jogador ───
const MY_DECK_COUNTERS = new Set([
    // --- Construções que desviam/matam PEKKA/Aríete ---
    'Canhão', 'Torre de Bombas', 'Tesla', 'Torre Inferno', 'Lápide',
    'Jaula de Goblin', 'Fornalha', 'Morteiro',
    // --- Swarms que cercam PEKKA/Bandida ---
    'Exército de Esqueletos', 'Gangue de Goblins', 'Guardas',
    'Esqueletos', 'Morcegos', 'Horda de Servos', 'Recrutas Reais',
    'Goblins', 'Goblins Lanceiros',
    // --- Mini-tanks que seguram PEKKA ---
    'Mini PEKKA', 'Príncipe', 'Príncipe das Trevas', 'Cavaleiro',
    'Valquíria', 'Megacavaleiro', 'P.E.K.K.A',
    // --- Splash que limpa suporte ---
    'Bebê Dragão', 'Mago de Gelo', 'Mago', 'Lançador', 'Fênix',
    'Executor', 'Bruxa Mãe', 'Bruxa Sombria',
    // --- Controle que reseta/empurra ---
    'Tornado', 'O Tronco', 'Bola de Neve', 'Choque (Zap)',
    // --- Anti-push cards ---
    'Dragão Infernal', 'Caçador', 'Pescador',
    'Bárbaros', 'Bárbaros de Elite',
    'Pequeno Príncipe', 'Rainha Arqueira', 'Monge',
]);

const MY_DECK_COUNTERS_NORMALIZED = new Set(
    Array.from(MY_DECK_COUNTERS).map(name => normalizeCardName(name)).filter(Boolean)
);

const MY_DECK_CRITICAL_COUNTERS = new Set([
    'Canhão',
    'Torre de Bombas',
    'Tesla',
    'Torre Inferno',
    'Lápide',
    'Jaula de Goblin',
    'Exército de Esqueletos',
    'Gangue de Goblins',
    'Guardas',
    'Mini PEKKA',
    'Príncipe',
    'Príncipe das Trevas',
    'Megacavaleiro',
    'P.E.K.K.A',
    'Dragão Infernal',
    'Caçador',
    'Pescador',
]);

const MY_DECK_CRITICAL_COUNTERS_NORMALIZED = new Set(
    Array.from(MY_DECK_CRITICAL_COUNTERS).map(name => normalizeCardName(name)).filter(Boolean)
);

function isMyDeckCounter(cardName) {
    if (!cardName || /^\d+$/.test(cardName)) return false;
    return MY_DECK_COUNTERS_NORMALIZED.has(normalizeCardName(cardName));
}

function getMyDeckCounterThreatLevel(cardName) {
    if (!cardName || /^\d+$/.test(cardName)) return 'none';
    const normalized = normalizeCardName(cardName);
    if (!normalized) return 'none';
    if (MY_DECK_CRITICAL_COUNTERS_NORMALIZED.has(normalized)) return 'critical';
    if (MY_DECK_COUNTERS_NORMALIZED.has(normalized)) return 'standard';
    return 'none';
}

const HARD_DEF_GROUPS = ['building', 'swarm', 'miniTank'];
const DEF_GROUP_LABEL = {
    building: 'construção',
    swarm: 'swarm',
    miniTank: 'mini-tank',
    splash: 'splash',
    control: 'controle',
};

const PEKKA_DEF_LOOKUP = (() => {
    const map = new Map();
    Object.entries(PEKKA_DEF_GROUPS).forEach(([group, cards]) => {
        cards.forEach(card => {
            const key = normalizeCardName(card);
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(group);
        });
    });
    return map;
})();

function getDefenseGroups(cardName) {
    if (!cardName || /^\d+$/.test(cardName)) return [];
    const key = normalizeCardName(cardName);
    const groups = PEKKA_DEF_LOOKUP.has(key) ? Array.from(PEKKA_DEF_LOOKUP.get(key)) : [];
    if (isSpamCounter(cardName) && !groups.includes('swarm')) groups.push('swarm');
    return groups;
}

function getCardCycleStatus(cardName) {
    if (!cardName || /^\d+$/.test(cardName)) return 'unknown';
    if (state.handCards && state.handCards.find(c => c.name === cardName)) return 'hand';

    const last = [...state.cardCycle].reverse().find(c => c.name === cardName);
    if (!last) return 'unknown';
    const cardsSince = state.totalPlayed - last.playIndex;
    if (cardsSince >= 4) return 'hand';
    if (cardsSince === 3) return 'next';
    return 'cooldown';
}

function computeDefenseReadiness() {
    const readyFlags = { building: false, swarm: false, miniTank: false, splash: false, control: false };
    const nextFlags = { building: false, swarm: false, miniTank: false, splash: false, control: false };
    const scoredReady = new Set();
    const scoredNext = new Set();

    const readiness = {
        readyScore: 0,
        nextScore: 0,
        confirmedDefenders: 0,
        seenDefensivePlays: 0,
        groupsReady: readyFlags,
        groupsNext: nextFlags,
        hasHardReady: false,
        hasHardNext: false,
        hardReadyCount: 0,
        hardNextCount: 0,
        readyGroupCount: 0,
        nextGroupCount: 0,
        readyCards: [],
        nextCards: [],
        criticalMissingNow: [],
        criticalMissingSoon: [],
        vulnerabilityBias: 0,
        knowledge: 'low',
    };

    const register = (cardName, status, confirmed = false) => {
        if (!cardName || /^\d+$/.test(cardName)) return;
        const key = normalizeCardName(cardName);
        const groups = getDefenseGroups(cardName);
        if (groups.length === 0) return;

        const weight = Math.max(...groups.map(g => PEKKA_GROUP_WEIGHT[g] || 0.6));

        if (status === 'hand') {
            if (scoredReady.has(key)) return;
            scoredReady.add(key);
            readiness.readyScore += weight;
            groups.forEach(g => readiness.groupsReady[g] = true);
            if (!readiness.readyCards.includes(cardName)) readiness.readyCards.push(cardName);
        } else if (status === 'next') {
            if (scoredReady.has(key) || scoredNext.has(key)) return;
            scoredNext.add(key);
            readiness.nextScore += weight * 0.6;
            groups.forEach(g => readiness.groupsNext[g] = true);
            if (!readiness.nextCards.includes(cardName)) readiness.nextCards.push(cardName);
        }

        if (confirmed) readiness.confirmedDefenders += 1;
    };

    if (state.handCards && state.handCards.length > 0) {
        const confirmedHand = (state.opponentDeck || []).filter(d => d.confirmed).map(d => d.name);
        state.handCards.forEach(c => register(c.name, 'hand', confirmedHand.includes(c.name)));
    }

    if (state.opponentDeck && state.opponentDeck.length > 0) {
        state.opponentDeck.forEach(card => {
            register(card.name, getCardCycleStatus(card.name), card.confirmed);
        });
    }

    if (state.cardCycle && state.cardCycle.length > 0) {
        state.cardCycle.forEach(c => {
            if (getDefenseGroups(c.name).length > 0) {
                readiness.seenDefensivePlays += 1;
            }
        });
    }

    readiness.hasHardReady = readiness.groupsReady.building || readiness.groupsReady.swarm || readiness.groupsReady.miniTank;
    readiness.hasHardNext = readiness.groupsNext.building || readiness.groupsNext.swarm || readiness.groupsNext.miniTank;
    readiness.hardReadyCount = HARD_DEF_GROUPS.filter(group => readiness.groupsReady[group]).length;
    readiness.hardNextCount = HARD_DEF_GROUPS.filter(group => readiness.groupsNext[group]).length;
    readiness.readyGroupCount = Object.values(readiness.groupsReady).filter(Boolean).length;
    readiness.nextGroupCount = Object.values(readiness.groupsNext).filter(Boolean).length;
    readiness.criticalMissingNow = HARD_DEF_GROUPS.filter(group => !readiness.groupsReady[group]);
    readiness.criticalMissingSoon = HARD_DEF_GROUPS.filter(group => !readiness.groupsReady[group] && !readiness.groupsNext[group]);
    readiness.vulnerabilityBias =
        ((3 - readiness.hardReadyCount) * 0.55)
        + ((3 - (readiness.hardReadyCount + readiness.hardNextCount)) * 0.25)
        + (readiness.readyScore < 1.6 ? 0.55 : 0);

    const defensiveSignals =
        readiness.confirmedDefenders
        + readiness.seenDefensivePlays
        + readiness.readyCards.length
        + (readiness.nextCards.length * 0.5);
    readiness.knowledge = (readiness.confirmedDefenders >= 3 || defensiveSignals >= 8)
        ? 'high'
        : (readiness.confirmedDefenders >= 1 || defensiveSignals >= 4)
            ? 'medium'
            : 'low';

    return readiness;
}

function summarizeGroups(flags) {
    return Object.entries(flags)
        .filter(([, active]) => active)
        .map(([key]) => DEF_GROUP_LABEL[key] || key)
        .join(', ');
}

function summarizeGroupKeys(keys) {
    if (!keys || keys.length === 0) return '';
    return keys.map(key => DEF_GROUP_LABEL[key] || key).join(', ');
}

function checkVulnerability() {
    if (!state.running) return { isVulnerable: false, level: 'idle', reason: '' };

    const elixir = state.elixir;
    const defense = computeDefenseReadiness();
    const missingNow = summarizeGroupKeys(defense.criticalMissingNow);
    const missingSoon = summarizeGroupKeys(defense.criticalMissingSoon);
    const readySummary = summarizeGroups(defense.groupsReady);
    const readyCardsSummary = defense.readyCards.slice(0, 3).join(', ');
    const nextCardsSummary = defense.nextCards.slice(0, 2).join(', ');

    const elixirPressureScore = Math.max(0, (6 - elixir) * 1.15);
    let defenseGapScore = 0;
    if (!defense.hasHardReady) defenseGapScore += 2.7;
    if (!defense.groupsReady.building) defenseGapScore += 1.15;
    if (!defense.groupsReady.swarm) defenseGapScore += 1.0;
    if (!defense.groupsReady.miniTank) defenseGapScore += 0.9;
    if (!defense.groupsReady.splash) defenseGapScore += 0.5;
    if (!defense.groupsReady.control) defenseGapScore += 0.25;
    if (!defense.hasHardNext) defenseGapScore += 0.9;
    if (defense.nextScore < 0.9) defenseGapScore += 0.35;
    defenseGapScore += Math.max(0, defense.vulnerabilityBias);

    const confidenceMultiplier = defense.knowledge === 'high'
        ? 1
        : defense.knowledge === 'medium'
            ? 0.9
            : 0.78;
    const vulnerabilityScore = (elixirPressureScore + defenseGapScore) * confidenceMultiplier;

    const hardMissingNowCount = defense.criticalMissingNow.length;
    const hardMissingSoonCount = defense.criticalMissingSoon.length;
    const hardLockNow = (!defense.hasHardReady) || hardMissingNowCount >= 2;
    const hardLockSoon = (!defense.hasHardNext) || hardMissingSoonCount >= 2;
    const earlyUnknown = defense.knowledge === 'low' && state.totalPlayed < 6;

    // Sem leitura suficiente, só alertar em cenário extremo.
    if (earlyUnknown) {
        if (elixir <= 2.2 && hardLockNow) {
            return {
                isVulnerable: true,
                level: 'critical',
                reason: `Elixir ${elixir.toFixed(1)} crítico${missingNow ? ` e sem ${missingNow}` : ''} — punição imediata`,
            };
        }
        return {
            isVulnerable: false,
            level: 'uncertain',
            reason: 'Leitura inicial baixa. Aguarde mais cartas para abrir janela.',
        };
    }

    // Acima desse ponto, sem pressão real para bridge spam.
    if (elixir > 5.4) {
        const fallback = readyCardsSummary
            ? `Defesas na mão: ${readyCardsSummary}${nextCardsSummary ? ` | próximas: ${nextCardsSummary}` : ''}`
            : 'Elixir alto do oponente: segure a pressão.';
        return { isVulnerable: false, level: 'safe', reason: fallback };
    }

    // Janela máxima: elixir bem baixo + falta de defesa crítica.
    if (elixir <= 2.8 && hardLockNow) {
        return {
            isVulnerable: true,
            level: 'critical',
            reason: `Elixir ${elixir.toFixed(1)} crítico${missingNow ? ` e sem ${missingNow}` : ''} — janela máxima`,
        };
    }

    // Janela forte: falta resposta agora e na próxima rotação curta.
    if (elixir <= 3.7 && hardLockNow && hardLockSoon) {
        return {
            isVulnerable: true,
            level: 'high',
            reason: `Sem defesa crítica na mão${missingNow ? ` (${missingNow})` : ''}${missingSoon ? ` e sem reposição (${missingSoon})` : ''}`,
        };
    }

    // Janela média: só com sinal consistente e elixir já sob pressão.
    if (elixir <= 3.2 && vulnerabilityScore >= 6.8 && hardMissingNowCount >= 2) {
        return {
            isVulnerable: true,
            level: 'window',
            reason: `Elixir ${elixir.toFixed(1)} + coberturas fracas${missingNow ? ` (${missingNow})` : ''}`,
        };
    }

    // Seguro / indeterminado
    let defaultReason = readySummary ? `Defesas prontas: ${readySummary}` : 'Sem dados suficientes sobre defesas.';
    if (readyCardsSummary) {
        defaultReason = `Defesas na mão: ${readyCardsSummary}${nextCardsSummary ? ` | próximas: ${nextCardsSummary}` : ''}`;
    }

    return { isVulnerable: false, level: 'safe', reason: defaultReason };
}

function updateVulnerabilityUI() {
    const banner = document.getElementById('vulnerabilityBanner');
    const reason = document.getElementById('vulnerabilityReason');
    const sideLeft = document.getElementById('vulnerabilitySideLeft');
    const sideRight = document.getElementById('vulnerabilitySideRight');
    if (!banner) return;

    const result = checkVulnerability();

    if (result.isVulnerable) {
        if (banner.style.display !== 'block') banner.style.display = 'block';
        if (sideLeft && sideLeft.style.display !== 'block') sideLeft.style.display = 'block';
        if (sideRight && sideRight.style.display !== 'block') sideRight.style.display = 'block';
        if (!document.body.classList.contains('vulnerable')) document.body.classList.add('vulnerable');

        let glowColor = 'rgba(30, 255, 30, 0.88)';
        let textColor = '#d9ffe9';
        let pillBg = 'rgba(16, 26, 22, 0.86)';

        if (result.level === 'critical') {
            glowColor = 'rgba(255, 86, 86, 0.9)';
            textColor = '#ffd9d9';
            pillBg = 'rgba(44, 18, 18, 0.88)';
        } else if (result.level === 'high') {
            glowColor = 'rgba(255, 186, 74, 0.9)';
            textColor = '#ffe8c3';
            pillBg = 'rgba(42, 30, 16, 0.88)';
        }

        let sideInnerGlow = 26;
        let sideOuterGlow = 56;
        let sideOpacity = 0.95;
        if (result.level === 'critical') {
            sideInnerGlow = 40;
            sideOuterGlow = 84;
            sideOpacity = 1;
        } else if (result.level === 'high') {
            sideInnerGlow = 34;
            sideOuterGlow = 72;
            sideOpacity = 0.98;
        }

        if (sideLeft) {
            sideLeft.style.background = `linear-gradient(180deg, transparent 0%, ${glowColor} 12%, ${glowColor} 88%, transparent 100%)`;
            sideLeft.style.boxShadow = `0 0 ${sideInnerGlow}px ${glowColor}, 0 0 ${sideOuterGlow}px ${glowColor}`;
            sideLeft.style.opacity = String(sideOpacity);
        }
        if (sideRight) {
            sideRight.style.background = `linear-gradient(180deg, transparent 0%, ${glowColor} 12%, ${glowColor} 88%, transparent 100%)`;
            sideRight.style.boxShadow = `0 0 ${sideInnerGlow}px ${glowColor}, 0 0 ${sideOuterGlow}px ${glowColor}`;
            sideRight.style.opacity = String(sideOpacity);
        }

        banner.style.backgroundColor = pillBg;
        banner.style.color = textColor;
        banner.style.borderColor = glowColor;
        banner.style.boxShadow = `0 0 12px ${glowColor}`;

        const text = result.reason || 'Janela de punição aberta!';
        if (reason.innerText !== text) reason.innerText = text;
    } else {
        if (banner.style.display !== 'none') banner.style.display = 'none';
        if (sideLeft && sideLeft.style.display !== 'none') sideLeft.style.display = 'none';
        if (sideRight && sideRight.style.display !== 'none') sideRight.style.display = 'none';
        if (document.body.classList.contains('vulnerable')) document.body.classList.remove('vulnerable');
    }
}

function updateElixirUI() {
    const d = Math.max(0, Math.min(MAX_ELIXIR, Math.round(state.elixir * 10) / 10));
    els.elixirValue.textContent = d.toFixed(1);
    updateVulnerabilityUI();
    els.elixirBarFill.style.width = (state.elixir / MAX_ELIXIR * 100) + '%';
    els.wastedValue.textContent = state.wasted.toFixed(1);
    
    // Smooth fractional UI to show it's constantly moving
    if (!els.elixirFraction) {
        els.elixirFraction = document.createElement('div');
        els.elixirFraction.style.fontSize = '12px';
        els.elixirFraction.style.color = '#ffcc00';
        els.elixirFraction.style.marginTop = '4px';
        els.elixirValue.parentElement.appendChild(els.elixirFraction);
    }
    els.elixirFraction.textContent = state.elixir.toFixed(2);
}

function updateTimerUI() {
    els.timerDisplay.textContent = formatTime(state.matchTimeRemaining);
    const progress = (1 - (MATCH_DURATION_S - state.matchTimeRemaining) / MATCH_DURATION_S) * 100;
    els.timerBar.style.width = Math.max(0, progress) + '%';
}

function updateNextCardHero() {
    const deckReadyForSlots = isLetterModeReady();
    const next = getNextCardPrediction();
    const handCards = (state.handCards || []).slice(0, HAND_SIZE);
    const queueCards = (state.queueCards || []).slice(0, HAND_SIZE);

    if (handCards.length === 0 && queueCards.length === 0) {
        els.nextCardDisplay.innerHTML = '<span class="next-card-empty">Jogue cartas para rastrear</span>';
        els.nextCardHero.classList.remove('has-prediction');
        return;
    }

    const renderTopCard = (card, { isNext = false, queue = false } = {}) => {
        if (!card) {
            return '<div class="top-track-card placeholder">?</div>';
        }

        const isNamedCard = card.name && !/^\d+$/.test(card.name);
        const cardUrl = isNamedCard ? getCardImage(card.name) : '';
        const cardFallback = isNamedCard ? getCardImageFallback(card.name) : '';
        const fallbackAttr = cardFallback ? ` data-fallback="${cardFallback}"` : '';
        const label = isNamedCard ? card.name : `${card.cost} elixir`;
        const counterLevel = isNamedCard ? getMyDeckCounterThreatLevel(card.name) : 'none';
        const counterClass = counterLevel !== 'none'
            ? ` counter-threat counter-${counterLevel} ${queue ? 'counter-queue' : 'counter-hand'}`
            : '';

        if (cardUrl) {
            return `
                <div class="top-track-card ${isNext ? 'is-next' : ''}${counterClass}" title="${label}">
                    <img src="${cardUrl}" class="top-track-art" alt="${label}"${fallbackAttr} onerror="onCardArtError(this)">
                    <span class="top-track-cost">${card.cost}</span>
                </div>
            `;
        }

        return `
            <div class="top-track-card ${isNext ? 'is-next' : ''}${counterClass}" title="${label}">
                <span class="top-track-fallback">${card.cost}</span>
            </div>
        `;
    };

    const renderTopRow = (cards, { queue = false } = {}) => {
        const slots = [];
        for (let i = 0; i < HAND_SIZE; i++) {
            const card = cards[i] || null;
            const isNext = queue && i === 0 && !!card;
            slots.push(renderTopCard(card, { isNext, queue }));
        }
        return slots.join('');
    };

    const renderTopLetterRow = ({ queue = false } = {}) => {
        const letters = queue ? VOICE_SLOT_QUEUE_LETTERS : VOICE_SLOT_HAND_LETTERS;
        return `
            <div class="top-track-slot-letters" aria-hidden="true">
                ${letters.map(letter => `<span class="top-track-slot-letter${deckReadyForSlots ? '' : ' locked'}">${letter}</span>`).join('')}
            </div>
        `;
    };

    els.nextCardDisplay.innerHTML = `
        <div class="top-track">
            <div class="top-track-row">
                <span class="top-track-label">MÃO</span>
                <div class="top-track-cards-wrap">
                    ${renderTopLetterRow()}
                    <div class="top-track-cards">${renderTopRow(handCards)}</div>
                </div>
            </div>
            <div class="top-track-row">
                <span class="top-track-label">FILA</span>
                <div class="top-track-cards-wrap">
                    ${renderTopLetterRow({ queue: true })}
                    <div class="top-track-cards">${renderTopRow(queueCards, { queue: true })}</div>
                </div>
            </div>
            ${next ? `<div class="top-track-next">Próxima: <strong>${next.name || next.cost}</strong></div>` : ''}
        </div>
    `;

    if (next) {
        els.nextCardHero.classList.add('has-prediction');
    } else {
        els.nextCardHero.classList.remove('has-prediction');
    }
}

function updateCycleUI() {
    const showSlotLetters = isLetterModeReady();
    const renderSlotLetter = (slotLetter) => (showSlotLetters && slotLetter)
        ? `<span class="slot-letter-badge">${slotLetter}</span>`
        : '';

    const renderCycleCard = (c, isQueue = false, slotLetter = '') => {
        const threatLevel = (c.name && !/^\d+$/.test(c.name)) ? getMyDeckCounterThreatLevel(c.name) : 'none';
        const counterClass = threatLevel !== 'none' ? ` counter-threat counter-${threatLevel}` : '';
        const classes = `cycle-card ${isQueue ? 'in-queue' : 'in-hand'}${counterClass}`;
        const returnsBadge = isQueue ? `<span class="returns-badge">${c.returnsIn}</span>` : '';
        const title = isQueue ? `${c.name} — volta em ${c.returnsIn}` : c.name;
        const showImage = showSlotLetters && c.name && !/^\d+$/.test(c.name);
        const cardUrl = showImage ? getCardImage(c.name) : '';
        const cardFallback = showImage ? getCardImageFallback(c.name) : '';
        const fallbackAttr = cardFallback ? ` data-fallback="${cardFallback}"` : '';
        const cardToken = encodeURIComponent(c.name || '');
        const playIndexAttr = Number.isFinite(c.playIndex) ? ` data-play-index="${c.playIndex}"` : '';
        const dataAttrs = ` data-card-token="${cardToken}"${playIndexAttr}`;
        const removeBtn = `<button type="button" class="cycle-remove-btn" title="Excluir carta" data-card-token="${cardToken}"${playIndexAttr}>✕</button>`;
        const slotLetterBadge = renderSlotLetter(slotLetter);

        if (!cardUrl) {
            return `<div class="${classes}" title="${title}"${dataAttrs}>${removeBtn}${slotLetterBadge}${c.cost}${returnsBadge}</div>`;
        }

        return `<div class="${classes} has-art" title="${title}"${dataAttrs}>
            ${removeBtn}
            ${slotLetterBadge}
            <div class="cycle-art-wrap">
                <img src="${cardUrl}" class="cycle-art" alt="${c.name}"${fallbackAttr} onerror="onCardArtError(this)">
            </div>
            <span class="cycle-name">${c.name}</span>
            ${returnsBadge}
        </div>`;
    };

    const renderUnknownSlot = (slotLetter = '', isQueue = false) => {
        const classes = `cycle-card unknown${isQueue ? ' in-queue' : ''}`;
        return `<div class="${classes}" title="Slot sem carta definida">${renderSlotLetter(slotLetter)}?</div>`;
    };

    const handSlots = [];
    for (let i = 0; i < HAND_SIZE; i++) {
        const card = state.handCards[i];
        const slotLetter = VOICE_SLOT_HAND_LETTERS[i] || '';
        handSlots.push(card ? renderCycleCard(card, false, slotLetter) : renderUnknownSlot(slotLetter, false));
    }
    els.cycleHand.innerHTML = handSlots.join('');

    if (showSlotLetters) {
        const queueSlots = [];
        for (let i = 0; i < HAND_SIZE; i++) {
            const card = state.queueCards[i] || null;
            const slotLetter = VOICE_SLOT_QUEUE_LETTERS[i] || '';
            queueSlots.push(card ? renderCycleCard(card, true, slotLetter) : renderUnknownSlot(slotLetter, true));
        }
        els.cycleQueue.innerHTML = queueSlots.join('');
    } else if (state.queueCards.length > 0) {
        els.cycleQueue.innerHTML = state.queueCards.map(c => renderCycleCard(c, true)).join('');
    } else {
        els.cycleQueue.innerHTML = '<span class="cycle-empty">—</span>';
    }
    els.cardsPlayed.textContent = state.totalPlayed;
}

// ─── Card Exclusion ─────────────────────────────────────
// When user manually excludes a card that was incorrectly identified,
// remember it so future voice matching penalizes it heavily.
function removeCardFromCycle(cardName, playIndex = null) {
    let removed = null;
    const normalizedName = normalizeCardName(cardName || '');

    if (Number.isFinite(playIndex)) {
        const byPlayIdx = state.cardCycle.findIndex(c => c && c.playIndex === playIndex);
        if (byPlayIdx !== -1) {
            removed = state.cardCycle.splice(byPlayIdx, 1)[0];
        }
    }

    if (!removed && normalizedName) {
        for (let i = state.cardCycle.length - 1; i >= 0; i--) {
            const entry = state.cardCycle[i];
            if (!entry) continue;
            if (normalizeCardName(entry.name) === normalizedName) {
                removed = state.cardCycle.splice(i, 1)[0];
                break;
            }
        }
    }

    if (removed) {
        state.totalPlayed = Math.max(0, state.totalPlayed - 1);

        const historyIdx = state.history.findIndex(entry => {
            if (!entry || entry.type !== 'card') return false;
            if (normalizedName && normalizeCardName(entry.cardName) === normalizedName) return true;
            if (!normalizedName && Number.isFinite(removed.cost) && entry.cost === removed.cost) return true;
            return false;
        });
        if (historyIdx !== -1) state.history.splice(historyIdx, 1);

        rebuildCyclePrediction();
        updateAll();
        return true;
    }

    // Fallback: if this card only exists as inferred hand/deck info, unconfirm it.
    if (normalizedName) {
        const deckCard = state.opponentDeck.find(c => c && c.confirmed && normalizeCardName(c.name) === normalizedName);
        if (deckCard) {
            deckCard.confirmed = false;
            syncDeckCompleteFlag();
            rebuildCyclePrediction();
            updateAll();
            return true;
        }
    }

    return false;
}

function excludeConfirmedCard(cardName) {
    if (!cardName) return;
    const normKey = normalizeCardName(cardName);
    state.voice.excludedCards.add(normKey);
    // Remove from opponent deck
    state.opponentDeck = state.opponentDeck.filter(c => normalizeCardName(c.name) !== normKey);
    state.deckComplete = false;
    // Also undo the last elixir subtraction for this card if it was recent
    const lastHistoryEntry = state.history.find(h => h.type === 'card' && normalizeCardName(h.cardName) === normKey);
    if (lastHistoryEntry) {
        state.history = state.history.filter(h => h !== lastHistoryEntry);
    }
    // Remove from cardCycle
    const cycleIdx = state.cardCycle.findIndex(c => normalizeCardName(c.name) === normKey);
    if (cycleIdx !== -1) state.cardCycle.splice(cycleIdx, 1);
    console.log(`Carta excluída: ${cardName} — será penalizada em futuros matchings.`);
    rebuildCyclePrediction();
    updateAll();
}

function updateDeckUI() {
    const slots = els.deckCards.children;
    // Show confirmed first, then predicted
    const confirmed = state.opponentDeck.filter(c => c.confirmed);
    const predicted = state.opponentDeck.filter(c => !c.confirmed);
    const ordered = [...confirmed, ...predicted];

    for (let i = 0; i < DECK_SIZE; i++) {
        if (i < ordered.length) {
            const card = ordered[i];
            
            let cycleHtml = '';
            if (card.confirmed) {
                let cardsSince = -1;
                let count = 0;
                // Walk history newest to oldest, counting only type 'card'
                for (let h of state.history) {
                    if (h.type === 'card') {
                        if (h.cardName === card.name) {
                            cardsSince = count;
                            break;
                        }
                        count++;
                    }
                }
                
                if (cardsSince >= 4) {
                    cycleHtml = `<span class="cycle-badge in-hand" title="Pronta para uso.">NA MÃO</span>`;
                } else if (cardsSince === 3) {
                    cycleHtml = `<span class="cycle-badge next" title="Próxima carta.">PRÓXIMA</span>`;
                }
            }

            if (card.confirmed) {
                const counterLevel = getMyDeckCounterThreatLevel(card.name);
                const isCounter = counterLevel !== 'none';
                slots[i].className = 'deck-slot filled' + (isCounter ? ` counter-threat counter-${counterLevel}` : '');
                const cardUrl = getCardImage(card.name);
                const cardFallback = getCardImageFallback(card.name);
                const fallbackAttr = cardFallback ? ` data-fallback="${cardFallback}"` : '';
                const artHtml = cardUrl
                    ? `<img src="${cardUrl}" class="slot-art" alt="${card.name}"${fallbackAttr} onerror="onCardArtError(this)">`
                    : '';
                slots[i].style.backgroundImage = 'none';
                slots[i].innerHTML = `${cycleHtml}
                    <button class="exclude-card-btn" data-exclude-idx="${i}" title="Excluir carta (erro de reconhecimento)" style="position:absolute; top:2px; left:2px; background:rgba(239,68,68,0.85); border:none; color:#fff; font-size:10px; font-weight:900; border-radius:4px; padding:1px 5px; cursor:pointer; z-index:10; line-height:1.3;">✕</button>
                    <div class="slot-art-wrap">${artHtml}</div>
                    <span class="deck-name">${card.name}</span>
                    <span class="deck-cost">${card.cost}⚡</span>`;
                slots[i].classList.toggle('no-art', !cardUrl);
                slots[i].title = card.name + (isCounter ? ' ⚠️ COUNTER PEKKA BS' : '') + ' — clique ✕ para excluir';
                slots[i].style.cursor = 'default';
                delete slots[i].dataset.cardName;
            } else {
                slots[i].className = 'deck-slot predicted';
                // Add cycle logic for predicted cards as well just in case they were played but not clicked? Actually predicted cards haven't been confirmed played yet.
                const tagContent = card.prob ? `${card.prob}%` : '?';
                const cardUrl = getCardImage(card.name);
                const cardFallback = getCardImageFallback(card.name);
                const fallbackAttr = cardFallback ? ` data-fallback="${cardFallback}"` : '';
                const artHtml = cardUrl
                    ? `<img src="${cardUrl}" class="slot-art" alt="${card.name}"${fallbackAttr} onerror="onCardArtError(this)">`
                    : '';
                slots[i].style.backgroundImage = 'none';
                slots[i].innerHTML = `
                    <button class="discard-pred-btn" data-discard-name="${card.name}" title="Descartar sugestão" style="position:absolute; top:2px; left:2px; background:var(--danger, #ff4d4d); border:none; color:#fff; font-size:9px; border-radius:3px; padding:2px 4px; cursor:pointer; z-index:10;">✕</button>
                    ${cycleHtml}
                    <div class="slot-art-wrap">${artHtml}</div>
                    <span class="deck-name">${card.name}</span>
                    <span class="deck-cost">${card.cost}⚡</span>
                    <span class="deck-predicted-tag" style="background:var(--accent); font-size:9px;">${tagContent}</span>`;
                slots[i].classList.toggle('no-art', !cardUrl);
                slots[i].title = `${card.name} (${tagContent} de probabilidade estatística) — clique para confirmar`;
                slots[i].style.cursor = 'pointer';
                slots[i].dataset.cardName = card.name;
            }
        } else {
            slots[i].className = 'deck-slot empty';
            slots[i].style.backgroundImage = 'none';
            slots[i].innerHTML = '?';
            slots[i].classList.remove('no-art');
            slots[i].title = '';
            slots[i].style.cursor = 'default';
            delete slots[i].dataset.cardName;
        }
    }
    els.deckCount.textContent = confirmed.length;
}

function updatePredictedDeck() {
    const confirmed = state.opponentDeck.filter(c => c.confirmed);
    const predictedSlots = state.opponentDeck.filter(c => !c.confirmed);

    // Prioridade: mostrar cartas previstas já preenchidas no deck do oponente.
    if (predictedSlots.length > 0) {
        els.predictedDeck.innerHTML = predictedSlots.map((card, i) => {
            const rightLabel = card.prob ? `${card.prob}%` : `${card.cost}⚡`;
            return `
                <div class="predicted-item ${i === 0 ? 'top' : ''}">
                    <span class="predicted-name">${card.name}</span>
                    <span class="predicted-match">${rightLabel}</span>
                </div>
            `;
        }).join('');
        return;
    }

    // Fallback: gerar cartas prováveis pela melhor combinação de arquétipos.
    const identified = confirmed.map(c => c.name);
    if (identified.length === 0) {
        els.predictedDeck.innerHTML = '<span class="predicted-empty">Identifique cartas para prever o deck</span>';
        return;
    }

    const topDecks = predictDecks(identified).slice(0, 3);
    if (!topDecks.length) {
        els.predictedDeck.innerHTML = '<span class="predicted-empty">Sem previsão suficiente no momento</span>';
        return;
    }

    const confirmedSet = new Set(identified);
    const scoreMap = new Map();

    topDecks.forEach((deck, idx) => {
        const deckWeight = Math.max(0.1, deck.matchScore || deck.weight || 1);
        const positionBoost = 1 - (idx * 0.18);
        deck.cards.forEach(name => {
            if (confirmedSet.has(name)) return;
            const cardData = ALL_CARDS.find(c => c.name === name);
            const current = scoreMap.get(name) || { score: 0, card: cardData || { name, cost: '?' } };
            current.score += deckWeight * positionBoost;
            scoreMap.set(name, current);
        });
    });

    const missingSlots = Math.max(1, DECK_SIZE - confirmed.length);
    const rankedCards = Array.from(scoreMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, missingSlots);

    if (rankedCards.length === 0) {
        els.predictedDeck.innerHTML = '<span class="predicted-empty">Sem previsão suficiente no momento</span>';
        return;
    }

    const topScore = rankedCards[0].score || 1;
    els.predictedDeck.innerHTML = rankedCards.map((entry, i) => {
        const confidence = Math.max(1, Math.round((entry.score / topScore) * 100));
        return `
            <div class="predicted-item ${i === 0 ? 'top' : ''}">
                <span class="predicted-name">${entry.card.name}</span>
                <span class="predicted-match">${confidence}%</span>
            </div>
        `;
    }).join('');
}

function triggerBump(dir) {
    const cls = dir === 'down' ? 'bump-down' : 'bump-up';
    els.elixirValue.classList.remove('bump-down', 'bump-up');
    void els.elixirValue.offsetWidth;
    els.elixirValue.classList.add(cls);
}

function addHistoryEntry(entry) {
    const empty = els.historyList.querySelector('.history-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'history-entry' + (entry.type === 'reset' ? ' reset-entry' : '');
    if (entry.type === 'reset') {
        div.innerHTML = `<span class="entry-cost">🔄</span><span class="entry-remaining">→ 10</span><span class="entry-time">${entry.time}</span>`;
    } else if (entry.type === 'ability') {
        div.innerHTML = `<span class="entry-cost">⚡-${entry.cost}</span><span class="entry-name">${entry.cardName || 'Habilidade'}</span><span class="entry-remaining">→ ${entry.remaining}</span><span class="entry-time">${entry.time}</span>`;
    } else {
        div.innerHTML = `<span class="entry-cost">-${entry.cost}</span><span class="entry-name">${entry.cardName}</span><span class="entry-remaining">→ ${entry.remaining}</span><span class="entry-time">${entry.time}</span>`;
    }

    els.historyList.prepend(div);
    const entries = els.historyList.querySelectorAll('.history-entry');
    if (entries.length > 30) entries[entries.length - 1].remove();
}

function clearHistoryUI() {
    els.historyList.innerHTML = '<div class="history-empty">Nenhuma jogada registrada</div>';
}

function formatTime(s) {
    if (s >= 0) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + sec.toString().padStart(2, '0');
    } else {
        const over = Math.abs(s);
        const m = Math.floor(over / 60);
        const sec = Math.floor(over % 60);
        return '+' + m + ':' + sec.toString().padStart(2, '0');
    }
}

function normalizeCardName(value) {
    return (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeLooseText(value) {
    return normalizeCardName(value)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const VOICE_CARD_ALIAS_PAIRS = [
    // ─── Valquíria ───
    ['valkiria', 'valquiria'],
    ['valquiria', 'valquiria'],
    ['valkíria', 'valquiria'],
    ['valk', 'valquiria'],
    // ─── Mega Cavaleiro ───
    ['mega cavaleiro', 'megacavaleiro'],
    ['mega', 'megacavaleiro'],
    ['megaknight', 'megacavaleiro'],
    ['mega knight', 'megacavaleiro'],
    // ─── P.E.K.K.A ───
    ['pekka', 'p e k k a'],
    ['p e k k a', 'p e k k a'],
    ['peka', 'p e k k a'],
    ['pecca', 'p e k k a'],
    ['peca', 'p e k k a'],
    ['pecka', 'p e k k a'],
    ['pekaa', 'p e k k a'],
    ['peka pekka', 'p e k k a'],
    // ─── Mini PEKKA ───
    ['mini pekka', 'mini pekka'],
    ['mini p e k k a', 'mini pekka'],
    ['mini p e k a', 'mini pekka'],
    ['mini peka', 'mini pekka'],
    ['minipekka', 'mini pekka'],
    // ─── X-Besta ───
    ['x besta', 'x besta'],
    ['xbow', 'x besta'],
    ['x bow', 'x besta'],
    // ─── Choque / Zap ───
    ['zap', 'choque zap'],
    // ─── O Tronco ───
    ['tronco', 'o tronco'],
    ['log', 'o tronco'],
    // ─── Bruxas ───
    ['bruxa mae', 'bruxa mae'],
    ['bruxa sombria', 'bruxa sombria'],
    ['night witch', 'bruxa sombria'],
    // ─── Dragões ───
    ['bebe dragao', 'bebe dragao'],
    ['baby dragon', 'bebe dragao'],
    ['dragao infernal', 'dragao infernal'],
    ['inferno dragon', 'dragao infernal'],
    ['dragao eletrico', 'dragao eletrico'],
    // ─── Mago / Arqueiro Mágico ───
    ['arqueiro magico', 'arqueiro magico'],
    ['magic archer', 'arqueiro magico'],
    ['mago eletrico', 'mago eletrico'],
    ['electro wizard', 'mago eletrico'],
    ['ewiz', 'mago eletrico'],
    ['mago gelo', 'mago de gelo'],
    ['ice wizard', 'mago de gelo'],
    // ─── Príncipes ───
    ['principe das trevas', 'principe das trevas'],
    ['dark prince', 'principe das trevas'],
    ['principe', 'principe'],
    // ─── Espíritos ───
    ['espirito eletrico', 'espirito eletrico'],
    ['espirito de fogo', 'espirito de fogo'],
    ['espirito de gelo', 'espirito de gelo'],
    ['espirito curador', 'espirito curador'],
    ['heal spirit', 'espirito curador'],
    ['ice spirit', 'espirito de gelo'],
    ['fire spirit', 'espirito de fogo'],
    // ─── Goblins Lanceiros ───
    ['goblin lanceiro', 'goblins lanceiros'],
    ['goblin lanceiros', 'goblins lanceiros'],
    ['goblins lanceiro', 'goblins lanceiros'],
    ['lanceiro goblin', 'goblins lanceiros'],
    ['lanceiros', 'goblins lanceiros'],
    ['lanceiro', 'goblins lanceiros'],
    ['spear goblins', 'goblins lanceiros'],
    // ─── Gangue de Goblins ───
    ['gangue goblin', 'gangue de goblins'],
    ['gangue goblins', 'gangue de goblins'],
    ['goblin gang', 'gangue de goblins'],
    // ─── Exército de Esqueletos ───
    ['exercito esqueletos', 'exercito de esqueletos'],
    ['exercito', 'exercito de esqueletos'],
    ['skarmy', 'exercito de esqueletos'],
    ['skeleton army', 'exercito de esqueletos'],
    // ─── Clone ───
    ['clon', 'clone'],
    ['cloni', 'clone'],
    ['clona', 'clone'],
    ['clonou', 'clone'],
    ['clonado', 'clone'],
    ['clonar', 'clone'],
    ['clonagem', 'clone'],
    ['clao', 'clone'],
    ['klon', 'clone'],
    ['klone', 'clone'],
    ['clown', 'clone'],
    ['cloune', 'clone'],
    ['clonei', 'clone'],
    ['clone', 'clone'],
    // ─── Sparky ───
    ['spyke', 'sparky'],
    ['spike', 'sparky'],
    ['spaik', 'sparky'],
    ['espaik', 'sparky'],
    ['esparky', 'sparky'],
    ['espark', 'sparky'],
    ['sparki', 'sparky'],
    // ─── Corredor / Hog ───
    ['hog', 'corredor'],
    ['hog rider', 'corredor'],
    // ─── Fantasma Real ───
    ['fantasma', 'fantasma real'],
    ['ghost', 'fantasma real'],
    ['royal ghost', 'fantasma real'],
    // ─── Bandida ───
    ['bandit', 'bandida'],
    // ─── Aríete de Batalha ───
    ['ariete', 'ariete de batalha'],
    ['battle ram', 'ariete de batalha'],
    ['ram', 'ariete de batalha'],
    ['arete', 'ariete de batalha'],
    ['arite', 'ariete de batalha'],
    ['arrete', 'ariete de batalha'],
    ['arreter', 'ariete de batalha'],
    ['arieti', 'ariete de batalha'],
    ['ariet', 'ariete de batalha'],
    ['a rede', 'ariete de batalha'],
    ['arete de batalha', 'ariete de batalha'],
    ['ariete de batalha', 'ariete de batalha'],
    ['ariete batalha', 'ariete de batalha'],
    ['ariete batala', 'ariete de batalha'],
    ['ariete batalha', 'ariete de batalha'],
    ['ariete bataia', 'ariete de batalha'],
    ['arete batalha', 'ariete de batalha'],
    ['arete batala', 'ariete de batalha'],
    ['ariete de batala', 'ariete de batalha'],
    ['ariete de bataia', 'ariete de batalha'],
    ['ariete de bataria', 'ariete de batalha'],
    ['ariete de baralha', 'ariete de batalha'],
    ['ariete batalha', 'ariete de batalha'],
    ['ariete de batalha', 'ariete de batalha'],
    ['ariete batalha', 'ariete de batalha'],
    ['a riete de batalha', 'ariete de batalha'],
    ['caliente', 'ariete de batalha'],
    ['caliente de batalha', 'ariete de batalha'],
    ['cariente', 'ariete de batalha'],
    ['cariente de batalha', 'ariete de batalha'],
    ['cariete', 'ariete de batalha'],
    ['cari eti', 'ariete de batalha'],
    ['kariete', 'ariete de batalha'],
    ['ariete', 'ariete de batalha'],
    ['arieti', 'ariete de batalha'],
    ['ari eti', 'ariete de batalha'],
    ['arietee', 'ariete de batalha'],
    ['ariete de batalia', 'ariete de batalha'],
    ['ariente de batalha', 'ariete de batalha'],
    // ─── Bola de Neve ───
    ['neve', 'bola de neve'],
    ['snowball', 'bola de neve'],
    // ─── Bola de Fogo ───
    ['bola fogo', 'bola de fogo'],
    ['fireball', 'bola de fogo'],
    // ─── Foguete ───
    ['rocket', 'foguete'],
    // ─── Tornado ───
    ['nado', 'tornado'],
    // ─── Veneno ───
    ['poison', 'veneno'],
    ['venemo', 'veneno'],
    ['venelo', 'veneno'],
    ['veneco', 'veneno'],
    ['venen', 'veneno'],
    // ─── Torre Inferno ───
    ['torre inferno', 'torre inferno'],
    ['inferno tower', 'torre inferno'],
    // ─── Tesla ───
    ['tesla', 'tesla'],
    // ─── Canhão ───
    ['cannon', 'canhao'],
    // ─── Destruidores de Muros ───
    ['muros', 'destruidores de muros'],
    ['wall breakers', 'destruidores de muros'],
    // ─── Barril de Goblins ───
    ['barril goblin', 'barril de goblins'],
    ['barril goblins', 'barril de goblins'],
    ['goblin barrel', 'barril de goblins'],
    // ─── Barril de Esqueletos ───
    ['barril esqueletos', 'barril de esqueletos'],
    ['skeleton barrel', 'barril de esqueletos'],
    // ─── Barril de Bárbaro ───
    ['barril barbaro', 'barril de barbaro'],
    ['barbarian barrel', 'barril de barbaro'],
    // ─── Esqueleto Gigante ───
    ['esqueleto gigante', 'esqueleto gigante'],
    ['giant skeleton', 'esqueleto gigante'],
    // ─── Gigante Elétrico ───
    ['gigante eletrico', 'gigante eletrico'],
    ['egiant', 'gigante eletrico'],
    ['e giant', 'gigante eletrico'],
    // ─── Gigante Real ───
    ['gigante real', 'gigante real'],
    ['royal giant', 'gigante real'],
    // ─── Goblin Gigante ───
    ['goblin gigante', 'goblin gigante'],
    // ─── Coletor de Elixir ───
    ['coletor', 'coletor de elixir'],
    ['pump', 'coletor de elixir'],
    // ─── Recrutas Reais ───
    ['recrutas', 'recrutas reais'],
    ['royal recruits', 'recrutas reais'],
    // ─── Porcos Reais ───
    ['porcos', 'porcos reais'],
    ['royal hogs', 'porcos reais'],
    // ─── Três Mosqueteiras ───
    ['mosqueteiras', 'tres mosqueteiras'],
    ['3 mosqueteiras', 'tres mosqueteiras'],
    // ─── Lava Hound ───
    ['lava', 'lava hound'],
    ['lavahound', 'lava hound'],
    // ─── Balão ───
    ['balloon', 'balao'],
    ['loon', 'balao'],
    // ─── Pescador ───
    ['fisherman', 'pescador'],
    // ─── Caçador ───
    ['hunter', 'cacador'],
    // ─── Lenhador ───
    ['lumberjack', 'lenhador'],
    // ─── Mineiro ───
    ['miner', 'mineiro'],
    // ─── Mosqueteira ───
    ['musketeer', 'mosqueteira'],
    // ─── Cemitério ───
    ['graveyard', 'cemiterio'],
    // ─── Relâmpago ───
    ['lightning', 'relampago'],
    // ─── Gelo ───
    ['freeze', 'gelo'],
    // ─── Fúria ───
    ['rage', 'furia'],
    // ─── Terremoto ───
    ['earthquake', 'terremoto'],
    // ─── Princesa ───
    ['princess', 'princesa'],
    // ─── Cavaleiro ───
    ['knight', 'cavaleiro'],
    // ─── Golem ───
    ['golem', 'golem'],
    // ─── Golem de Gelo ───
    ['golem gelo', 'golem de gelo'],
    ['ice golem', 'golem de gelo'],
    // ─── Escavadeira de Goblins ───
    ['escavadeira', 'escavadeira de goblins'],
    ['drill', 'escavadeira de goblins'],
    ['goblin drill', 'escavadeira de goblins'],
    // ─── Executor ───
    ['executioner', 'executor'],
    // ─── Lançador / Bowler ───
    ['bowler', 'lancador'],
    // ─── Fênix ───
    ['phoenix', 'fenix'],
    ['fenix', 'fenix'],
    // ─── Flechas ───
    ['arrows', 'flechas'],
    // ─── Morcegos ───
    ['bats', 'morcegos'],
    // ─── Servos ───
    ['minions', 'servos'],
    // ─── Horda de Servos ───
    ['horda', 'horda de servos'],
    ['minion horde', 'horda de servos'],
    // ─── Megasservo ───
    ['mega minion', 'megasservo'],
    ['megaminion', 'megasservo'],
    // ─── Rainha Arqueira ───
    ['rainha', 'rainha arqueira'],
    ['archer queen', 'rainha arqueira'],
    // ─── Pequeno Príncipe ───
    ['pequeno principe', 'pequeno principe'],
    ['little prince', 'pequeno principe'],
    // ─── Cavaleiro Dourado ───
    ['golden knight', 'cavaleiro dourado'],
    ['dourado', 'cavaleiro dourado'],
    // ─── Monge ───
    ['monk', 'monge'],
    // ─── Rei Esqueleto ───
    ['rei esqueleto', 'rei esqueleto'],
    ['skeleton king', 'rei esqueleto'],
    // ─── Pirotécnica ───
    ['firecracker', 'pirotecnica'],
    ['piro', 'pirotecnica'],
    // ─── Bombardeiro ───
    ['bomber', 'bombardeiro'],
    // ─── Arqueiras ───
    ['archers', 'arqueiras'],
    // ─── Bárbaros ───
    ['barbarians', 'barbaros'],
    // ─── Bárbaros de Elite ───
    ['elite barbarians', 'barbaros de elite'],
    ['ebarbs', 'barbaros de elite'],
    // ─── Morteiro ───
    ['mortar', 'morteiro'],
    // ─── Cabana de Goblins ───
    ['cabana goblin', 'cabana de goblins'],
    ['goblin hut', 'cabana de goblins'],
    // ─── Goblin com Dardos ───
    ['goblin com dardo', 'goblin com dardos'],
    ['goblin com dardos', 'goblin com dardos'],
    ['goblin dardo', 'goblin com dardos'],
    ['goblin dardos', 'goblin com dardos'],
    ['dart goblin', 'goblin com dardos'],
    // ─── Dragões Esqueleto ───
    ['dragoes esqueleto', 'dragoes esqueleto'],
    ['skeleton dragons', 'dragoes esqueleto'],
    // ─── Curadora Guerreira ───
    ['curadora', 'curadora guerreira'],
    ['battle healer', 'curadora guerreira'],
    // ─── Máquina Voadora ───
    ['maquina voadora', 'maquina voadora'],
    ['flying machine', 'maquina voadora'],
    // ─── Carrinho de Canhão ───
    ['carrinho canhao', 'carrinho de canhao'],
    ['cannon cart', 'carrinho de canhao'],
    // ─── Eletrocutadores ───
    ['eletrocutadores', 'eletrocutadores'],
    ['zappies', 'eletrocutadores'],
    // ─── Fornalha ───
    ['furnace', 'fornalha'],
    // ─── Lápide ───
    ['tombstone', 'lapide'],
    ['lapide', 'lapide'],
    // ─── Jaula de Goblin ───
    ['jaula goblin', 'jaula de goblin'],
    ['goblin cage', 'jaula de goblin'],
    // ─── Vácuo / Vinhas ───
    ['vazio', 'vacuo'],
    ['vacuo', 'vacuo'],
    ['vaco', 'vacuo'],
    ['vaquo', 'vacuo'],
    ['vakuo', 'vacuo'],
    ['vacu', 'vacuo'],
    ['feitico de vacuo', 'vacuo'],
    ['feitico vacuo', 'vacuo'],
    ['void', 'vacuo'],
    ['vinha', 'vinhas'],
    ['vinhas', 'vinhas'],
    ['maldicao goblin', 'vinhas'],
    ['goblin curse', 'vinhas'],
    // ─── Oficiais auditados a partir da pasta CartasClashRoyale ───
    ['espirito de fogo', 'espiritos de fogo'],
    ['espiritos de fogo', 'espiritos de fogo'],
    ['bola de neve gigante', 'bola de neve'],
    ['domadora de carneiros', 'domadora de carneiro'],
    ['besta', 'x besta'],
    ['x besta', 'x besta'],
    ['xbesta', 'x besta'],
    ['xis besta', 'x besta'],
    // ─── Torre de Bombas ───
    ['torre bombas', 'torre de bombas'],
    ['bomb tower', 'torre de bombas'],
    // ─── PT-BR SPEECH RECOGNIZER COMMON MISHEARINGS ───
    // These are how the browser's Portuguese speech API commonly misinterprets game terms
    // P.E.K.K.A mishearings
    ['pega', 'p e k k a'], ['pecar', 'p e k k a'], ['pecado', 'p e k k a'],
    ['pegar', 'p e k k a'], ['pega la', 'p e k k a'], ['pedra', 'p e k k a'],
    ['peça', 'p e k k a'], ['pegas', 'p e k k a'], ['peco', 'p e k k a'],
    ['pepka', 'p e k k a'], ['beca', 'p e k k a'],
    // Mini PEKKA mishearings
    ['mini pega', 'mini p e k k a'], ['mini peca', 'mini p e k k a'],
    ['mini peça', 'mini p e k k a'],
    // Valquíria mishearings
    ['vai curia', 'valquiria'], ['val curia', 'valquiria'], ['valkiria', 'valquiria'],
    ['val quiria', 'valquiria'], ['valqueria', 'valquiria'], ['valteria', 'valquiria'],
    ['vai queria', 'valquiria'], ['valqueria', 'valquiria'], ['vau quiria', 'valquiria'],
    // Corredor / Hog mishearings
    ['corredor', 'corredor'], ['corridos', 'corredor'], ['corrida', 'corredor'],
    ['porco', 'corredor'], ['ogue', 'corredor'], ['hogui', 'corredor'],
    ['og', 'corredor'], ['och', 'corredor'],
    // Tornado mishearings
    ['tornado', 'tornado'], ['tornada', 'tornado'], ['tor nado', 'tornado'],
    // Esqueletos mishearings
    ['esqueleto', 'esqueletos'], ['esqueleta', 'esqueletos'],
    // Golem mishearings
    ['gole', 'golem'], ['goleiro', 'golem'], ['golen', 'golem'],
    // Megacavaleiro mishearings
    ['megacav', 'megacavaleiro'], ['mega cav', 'megacavaleiro'],
    ['mega cavalo', 'megacavaleiro'], ['mega cavalho', 'megacavaleiro'],
    // Sparky mishearings
    ['espere', 'sparky'], ['espere que', 'sparky'], ['es parque', 'sparky'],
    ['is park', 'sparky'], ['espero', 'sparky'], ['disparo', 'sparky'],
    // Balão mishearings
    ['baloes', 'balao'], ['baloe', 'balao'], ['balã', 'balao'],
    ['bala', 'balao'], ['balou', 'balao'],
    // Mago mishearings/abbreviations
    ['mago', 'mago'], ['magu', 'mago'], ['magus', 'mago'],
    // Bruxa mishearings
    ['bruxa', 'bruxa'], ['brush', 'bruxa sombria'],
    // Lava Hound mishearings
    ['lava ound', 'lava hound'], ['lava on', 'lava hound'],
    // Bandida mishearings
    ['bandido', 'bandida'], ['band', 'bandida'], ['vandit', 'bandida'],
    // Fantasma mishearings
    ['fanta', 'fantasma real'], ['fantasia', 'fantasma real'],
    // Mosqueteira mishearings
    ['mosquete', 'mosqueteira'], ['mosque', 'mosqueteira'],
    ['mosqueteiro', 'mosqueteira'],
    // Princesa mishearings
    ['princeso', 'princesa'], ['princ', 'princesa'],
    // Cavaleiro mishearings
    ['cavalo', 'cavaleiro'], ['cavalero', 'cavaleiro'],
    // Tesla mishearings
    ['tesler', 'tesla'], ['testla', 'tesla'],
    // Foguete mishearings
    ['foguetes', 'foguete'], ['fogue', 'foguete'],
    // Veneno / Vácuo mishearings
    ['veneno', 'veneno'], ['venen', 'veneno'], ['venemo', 'veneno'], ['venelo', 'veneno'],
    ['vacuo', 'vacuo'], ['vaco', 'vacuo'], ['vazio', 'vacuo'], ['vakuo', 'vacuo'],
    // Flechas mishearings
    ['flecha', 'flechas'], ['flecho', 'flechas'],
    // Morcegos mishearings
    ['morcego', 'morcegos'], ['morce', 'morcegos'],
    // Lenhador mishearings
    ['lenhado', 'lenhador'], ['lenha', 'lenhador'],
    // Mineiro mishearings
    ['minero', 'mineiro'], ['mine', 'mineiro'],
    // Pescador mishearings
    ['pesca', 'pescador'], ['pescado', 'pescador'],
    // Caçador mishearings
    ['cacado', 'cacador'], ['caca', 'cacador'],
    // Pirotécnica mishearings
    ['pirotec', 'pirotecnica'], ['pirote', 'pirotecnica'],
    ['fogos', 'pirotecnica'],
    // Arqueiro Mágico mishearings
    ['arqueiro', 'arqueiro magico'],
    // Dragão Infernal mishearings
    ['inferno', 'dragao infernal'],
    // Bola de Neve / Bola de Fogo abbreviations
    ['bola neve', 'bola de neve'], ['bolinha neve', 'bola de neve'],
    ['bola fogo', 'bola de fogo'], ['fireball', 'bola de fogo'],
    // Exército abbreviations
    ['army', 'exercito de esqueletos'], ['esqueleton army', 'exercito de esqueletos'],
    // Cemitério mishearings
    ['cemiteria', 'cemiterio'], ['cemi', 'cemiterio'],
    // Terremoto mishearings  
    ['terra moto', 'terremoto'], ['terre', 'terremoto'],
    // Gelo / Congelamento mishearings
    ['congelo', 'gelo'], ['congelamento', 'gelo'], ['ice', 'gelo'],
    // Relâmpago mishearings
    ['relampado', 'relampago'], ['lampago', 'relampago'],
    ['raio', 'relampago'],
    // Fúria mishearings
    ['furo', 'furia'], ['furioso', 'furia'],
    // Guardas
    ['guarda', 'guardas'], ['guards', 'guardas'],
    // Barril
    ['barril', 'barril de goblins'],
    // Lápide
    ['lapis', 'lapide'], ['la pide', 'lapide'],
    // Fornalha
    ['forno', 'fornalha'], ['fornal', 'fornalha'],
    // Megasservo
    ['mega servo', 'megasservo'],
    // Fênix
    ['fenis', 'fenix'], ['feni', 'fenix'],
    // Maquina Voadora
    ['maquina', 'maquina voadora'],
    // Goblin Cage
    ['jaula', 'jaula de goblin'],
    // Cannon Cart
    ['carrinho', 'carrinho de canhao'],
];

const VOICE_SHORT_ALIAS_WHITELIST = new Set([
    'hog',
    'zap',
    'log',
    'xbow',
    'ewiz',
    'egiant',
    'loon',
    'ram',
]);

const VOICE_AMBIGUOUS_SINGLE_ALIASES = new Set([
    'mega',
    'mago',
    'bruxa',
    'principe',
    'fantasma',
    'exercito',
    'barril',
    'arqueiro',
    'golem',
    'maquina',
    'rainha',
    'dourado',
    'lava',
    'neve',
    'fogo',
    'inferno',
    'veneno',
]);

function shouldApplyInlineVoiceAlias(alias) {
    if (!alias) return false;
    const tokenCount = alias.split(' ').length;
    if (tokenCount >= 2) return true;
    if (VOICE_SHORT_ALIAS_WHITELIST.has(alias)) return true;
    if (alias.length >= 5 && !VOICE_AMBIGUOUS_SINGLE_ALIASES.has(alias)) return true;
    return false;
}

const VOICE_ALIAS_REPLACEMENTS = VOICE_CARD_ALIAS_PAIRS
    .map(([from, to]) => {
        const fromNorm = normalizeLooseText(from);
        const toNorm = normalizeLooseText(to);
        if (!fromNorm || !toNorm) return null;
        return {
            fromNorm,
            toNorm,
            applyInline: shouldApplyInlineVoiceAlias(fromNorm),
        };
    })
    .filter(Boolean)
    .sort((a, b) => {
        const tokenDiff = b.fromNorm.split(' ').length - a.fromNorm.split(' ').length;
        if (tokenDiff !== 0) return tokenDiff;
        return b.fromNorm.length - a.fromNorm.length;
    });

const VOICE_EXACT_ALIAS_DEFER_TO_MATCHER = new Set([
    'barril',
    'inferno',
    'maquina',
    'mega',
]);

function applyVoiceAliasNormalization(value) {
    let text = normalizeLooseText(value);
    if (!text) return '';

    const exactAlias = VOICE_ALIAS_REPLACEMENTS.find(entry =>
        entry.fromNorm === text && !VOICE_EXACT_ALIAS_DEFER_TO_MATCHER.has(entry.fromNorm)
    );
    if (exactAlias) {
        return exactAlias.toNorm;
    }

    VOICE_ALIAS_REPLACEMENTS.forEach(entry => {
        if (!entry.applyInline) return;
        const pattern = new RegExp(`\\b${entry.fromNorm}\\b`, 'g');
        text = text.replace(pattern, entry.toNorm);
    });

    return text.replace(/\s+/g, ' ').trim();
}

function normalizeVoiceRawText(value) {
    return normalizeCardName(value)
        // Ensure tokens like "bruxa5" or "5bruxa" are separated for parsing.
        .replace(/([a-z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-z])/g, '$1 $2')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeVoiceCardText(value) {
    let text = applyVoiceAliasNormalization(value);
    if (!text) return '';

    return text
        .replace(/\b(carta|carta de|custo|solta|joga|jogar|vai|usa|usar|manda|de|uma|um|qual|aqui|agora|olha|a|o|na|no|com|pra|pro|que|esse|essa|isso|aquela|tipo|ate|ele|ela|la|ali)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeVoiceText(value) {
    return normalizeVoiceRawText(value);
}

const VOICE_PARSER_NOISE_TOKENS = new Set([
    'elixir',
    'de',
    'da',
    'do',
    'custo',
    'carta',
    'solta',
    'joga',
    'jogar',
    'vai',
    'usa',
    'usar',
    'manda',
    'por',
    'pra',
    'pro',
    'com',
    'na',
    'no',
    'um',
    'uma',
]);

const VOICE_COST_HINT_TOKENS = new Set([
    'elixir',
    'custo',
    'carta',
    'solta',
    'joga',
    'jogar',
    'vai',
    'usa',
    'usar',
    'manda',
    'de',
    'da',
    'do',
]);

const VOICE_ABILITY_MARKER_TOKENS = new Set([
    'k',
    'ka',
    'kei',
    'kay',
    'quei',
    'que',
]);

function shouldIgnoreNumericTokenAsCost(tokens, index) {
    const token = tokens[index] || '';
    const next = tokens[index + 1] || '';
    if ((token === 'tres' || token === '3') && next.startsWith('mosqueteir')) {
        return true;
    }
    return false;
}

function pickBestSpokenCost(tokens) {
    let best = null;

    for (let i = 0; i < tokens.length; i++) {
        const parsed = parseSpokenCostToken(tokens[i]);
        if (parsed === null) continue;

        const cost = parsed === 0 ? 10 : parsed;
        let score = 0;
        let costIndices = [i];
        const prev = tokens[i - 1] || '';
        const next = tokens[i + 1] || '';

        if (i === 0) score += 3;
        if (i === 1 && VOICE_COST_HINT_TOKENS.has(tokens[0])) score += 2;
        if (i === tokens.length - 1 && tokens.length <= 3) score += 2;
        if (prev === 'elixir' || prev === 'custo' || prev === 'carta') score += 2;
        if (next === 'elixir') score += 2;
        if (next === 'de' || next === 'da') score += 1;
        if (i <= 2) score += 1;

        if (shouldIgnoreNumericTokenAsCost(tokens, i)) score -= 5;
        if (i > 2 && prev !== 'elixir' && !VOICE_COST_HINT_TOKENS.has(tokens[0])) score -= 2;

        const candidate = { cost, score, costIndices };
        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }

    if (!best || best.score < 2) return null;
    return best;
}

function parseVoiceAbilityCost(tokens) {
    if (!tokens || tokens.length < 2) return null;
    const marker = normalizeVoiceText(tokens[0] || '').replace(/\s+/g, '');
    if (!VOICE_ABILITY_MARKER_TOKENS.has(marker)) return null;

    const second = parseSpokenCostToken(tokens[1]);
    if (second === null) return null;
    if (second < 1 || second > 3) return null;
    return second;
}

function isLegacyVoiceAbilityCommand(tokens) {
    if (!tokens || tokens.length < 2) return false;
    const marker = normalizeVoiceText(tokens[0] || '').replace(/\s+/g, '');
    if (marker !== 'zero' && marker !== '0') return false;
    const second = parseSpokenCostToken(tokens[1]);
    return second !== null && second >= 1 && second <= 3;
}

const MIRROR_KEYWORDS = /\b(espelho|espelhada|espelhado|espelhei|espelhou|espelhando)\b/;
const MIRROR_KEYWORDS_G = /\b(espelho|espelhada|espelhado|espelhei|espelhou|espelhando)\b/g;

function hasMirrorMarker(text) {
    const normalized = normalizeVoiceCardText(text || '');
    if (!normalized) return false;
    return MIRROR_KEYWORDS.test(normalized);
}

function stripMirrorMarker(text) {
    return normalizeVoiceCardText(text || '')
        .replace(MIRROR_KEYWORDS_G, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getLastMirrorableCardName() {
    const entries = state.history || [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry || entry.type !== 'card') continue;
        if (!entry.cardName || /^\d+$/.test(entry.cardName)) continue;
        const clean = entry.cardName.replace(/\s*\(espelho\)\s*$/i, '').trim();
        if (!clean) continue;
        if (normalizeCardName(clean) === normalizeCardName('Espelho')) continue;
        return clean;
    }
    return null;
}

function isImmediateRepeatMirror(baseCardName) {
    if (!baseCardName) return false;
    const entries = state.history || [];
    const lastEntry = entries.find(entry => entry && entry.type === 'card');
    if (!lastEntry || !lastEntry.cardName) return false;

    const clean = lastEntry.cardName.replace(/\s*\(espelho\)\s*$/i, '').trim();
    if (!clean || /^\d+$/.test(clean)) return false;
    if (normalizeCardName(clean) === normalizeCardName('Espelho')) return false;
    return normalizeVoiceCardText(clean) === normalizeVoiceCardText(baseCardName);
}

function parseSpokenCostToken(token) {
    const cleanedToken = (token || '').toString().trim().replace(/[^a-z0-9]/g, '');
    if (!cleanedToken) return null;

    const words = {
        zero: 0,
        um: 1,
        hum: 1,
        uhm: 1,
        un: 1,
        one: 1,
        won: 1,
        uan: 1,
        van: 1,
        uma: 1,
        dois: 2,
        two: 2,
        duas: 2,
        tres: 3,
        three: 3,
        quatro: 4,
        four: 4,
        cinco: 5,
        five: 5,
        seis: 6,
        six: 6,
        sete: 7,
        seven: 7,
        oito: 8,
        eight: 8,
        nove: 9,
        nine: 9,
        dez: 10,
        ten: 10,
    };

    if (/^\d+$/.test(cleanedToken)) {
        const n = parseInt(cleanedToken, 10);
        return n >= 0 && n <= 10 ? n : null;
    }

    return Object.prototype.hasOwnProperty.call(words, cleanedToken) ? words[cleanedToken] : null;
}

const VOICE_SLOT_LETTER_ALIASES = {
    A: ['a', 'ei', 'alfa', 'alpha', 'alfah', 'alfaa', 'aufa'],
    B: ['b', 'be', 'bi', 'beta', 'beita', 'betta', 'betaa', 'belta'],
    C: ['c', 'ce', 'ci', 'celta', 'selta', 'ceta', 'celtaa', 'seltah', 'celtra'],
    D: ['d', 'di', 'delta', 'deta', 'deltaa', 'deuta', 'deltta', 'deita'],
    E: ['e', 'eh'],
    F: ['f', 'efe', 'ef'],
    G: ['g', 'ge', 'gi', 'ji'],
    H: ['h', 'aga', 'agah', 'ha'],
};

const VOICE_SLOT_FUZZY_MIN_SCORE = 0.76;
const VOICE_SLOT_FUZZY_MIN_MARGIN = 0.08;
const VOICE_SLOT_ALIAS_INDEX = Object.entries(VOICE_SLOT_LETTER_ALIASES).flatMap(([letter, aliases]) =>
    aliases
        .map(alias => normalizeVoiceText(alias).replace(/\s+/g, ''))
        .filter(Boolean)
        .map(alias => ({ letter, alias }))
);

const VOICE_SLOT_NOISE_TOKENS = new Set([
    'letra',
    'slot',
    'carta',
    'joga',
    'jogar',
    'usa',
    'usar',
    'vai',
    'agora',
    'por',
    'favor',
    'pra',
    'pro',
    'de',
    'da',
    'do',
    'na',
    'no',
    'ai',
    'o',
    'um',
    'uma',
    'esse',
    'essa',
    'isso',
]);

function parseVoiceSlotLetterToken(token) {
    const cleaned = normalizeVoiceText(token || '').replace(/\s+/g, '');
    if (!cleaned) return null;
    if (cleaned.length === 1 && cleaned >= 'a' && cleaned <= 'h') return cleaned.toUpperCase();

    // Exact alias match first.
    for (let i = 0; i < VOICE_SLOT_ALIAS_INDEX.length; i++) {
        const entry = VOICE_SLOT_ALIAS_INDEX[i];
        if (entry.alias === cleaned) return entry.letter;
    }

    // Fuzzy/phonetic fallback for real microphone variants.
    if (cleaned.length < 2) return null;
    let best = null;
    let runnerUp = null;

    for (let i = 0; i < VOICE_SLOT_ALIAS_INDEX.length; i++) {
        const entry = VOICE_SLOT_ALIAS_INDEX[i];
        const alias = entry.alias;
        const distance = levenshteinDistance(cleaned, alias);
        const maxLen = Math.max(cleaned.length, alias.length) || 1;
        const similarity = 1 - (distance / maxLen);
        const maxDistance = alias.length <= 4 ? 1 : 2;

        if (distance > maxDistance && similarity < VOICE_SLOT_FUZZY_MIN_SCORE) {
            continue;
        }

        const score = Math.max(similarity, 1 - (distance / (maxLen + 0.0001)));
        const candidate = { letter: entry.letter, score };
        if (!best || candidate.score > best.score) {
            runnerUp = best;
            best = candidate;
        } else if (!runnerUp || candidate.score > runnerUp.score) {
            runnerUp = candidate;
        }
    }

    if (!best || best.score < VOICE_SLOT_FUZZY_MIN_SCORE) return null;
    const margin = runnerUp ? (best.score - runnerUp.score) : 1;
    if (runnerUp && runnerUp.letter !== best.letter && margin < VOICE_SLOT_FUZZY_MIN_MARGIN) {
        return null;
    }

    return best.letter;
}

function parseVoiceSlotCommand(transcript) {
    const normalized = normalizeVoiceText(transcript);
    if (!normalized) return null;

    const rawTokens = normalized.split(' ').filter(Boolean);
    if (rawTokens.length === 0 || rawTokens.length > 12) return null;
    const tokens = rawTokens.filter(token => !VOICE_SLOT_NOISE_TOKENS.has(token));
    if (tokens.length === 0 || tokens.length > 7) return null;

    const letterHits = [];
    const costTokens = [];
    const unknownTokens = [];

    tokens.forEach((token, index) => {
        const slotLetter = parseVoiceSlotLetterToken(token);
        if (slotLetter) {
            letterHits.push({ letter: slotLetter, index, token });
            return;
        }

        const parsedCost = parseSpokenCostToken(token);
        if (parsedCost !== null) {
            const cost = parsedCost === 0 ? 10 : parsedCost;
            if (cost >= 1 && cost <= 10) {
                costTokens.push({ cost, index });
                return;
            }
        }

        unknownTokens.push(token);
    });

    if (letterHits.length === 0) return null;

    // Some ASR engines prepend article "a" before the spoken slot letter (ex.: "a beta").
    // Treat this leading "a" as noise when another clear slot letter follows.
    let effectiveLetterHits = letterHits;
    if (letterHits.length >= 2) {
        const firstHit = letterHits[0];
        if (firstHit.letter === 'A' && firstHit.index === 0 && firstHit.token === 'a') {
            const remaining = letterHits.slice(1);
            const remainingUnique = new Set(remaining.map(hit => hit.letter));
            if (remaining.length > 0 && remainingUnique.size === 1) {
                effectiveLetterHits = remaining;
            }
        }
    }

    const uniqueLetters = new Set(effectiveLetterHits.map(hit => hit.letter));
    if (uniqueLetters.size !== 1) return null;
    const letter = effectiveLetterHits[0].letter;
    const letterIndex = effectiveLetterHits[0].index;
    if (unknownTokens.length > 2) return null;
    if (unknownTokens.length >= 1 && unknownTokens.some(token => token.length > 4)) return null;

    let cost = null;
    if (costTokens.length > 0) {
        costTokens.sort((a, b) => {
            const distanceA = Math.abs(a.index - letterIndex);
            const distanceB = Math.abs(b.index - letterIndex);
            if (distanceA !== distanceB) return distanceA - distanceB;
            return a.index - b.index;
        });
        cost = costTokens[0].cost;
    }

    return { letter, cost, normalized };
}

function extractVoiceCostAndCard(transcript) {
    const normalized = normalizeVoiceText(transcript);
    if (!normalized) return null;

    const tokens = normalized.split(' ').filter(Boolean);
    const abilityCost = parseVoiceAbilityCost(tokens);
    if (abilityCost !== null) {
        const trailing = tokens.slice(2).filter(token => !VOICE_PARSER_NOISE_TOKENS.has(token));
        return {
            normalized,
            cost: abilityCost,
            cardText: normalizeVoiceCardText(trailing.join(' ').trim()),
            isAbility: true,
        };
    }

    if (isLegacyVoiceAbilityCommand(tokens)) {
        return {
            normalized,
            cost: null,
            cardText: '',
            isAbility: false,
            isLegacyAbilityCommand: true,
        };
    }

    const parsedCost = pickBestSpokenCost(tokens);
    if (!parsedCost || parsedCost.cost < 1 || parsedCost.cost > 10) {
        return { normalized, cost: null, cardText: normalizeVoiceCardText(tokens.join(' ')), isAbility: false };
    }

    const costIndices = new Set(parsedCost.costIndices);
    const cardTokens = tokens
        .filter((_, i) => !costIndices.has(i))
        .filter(token => !VOICE_PARSER_NOISE_TOKENS.has(token));

    return {
        normalized,
        cost: parsedCost.cost,
        cardText: normalizeVoiceCardText(cardTokens.join(' ').trim()),
        isAbility: false,
        isLegacyAbilityCommand: false,
    };
}

function getCapacitorRuntime() {
    return window.Capacitor || null;
}

function getVoiceBridgePlugin() {
    const capacitor = getCapacitorRuntime();
    if (!capacitor || !capacitor.Plugins) return null;
    return capacitor.Plugins.VoiceBridge || null;
}

function isAndroidNativePlatform() {
    const capacitor = getCapacitorRuntime();
    return !!(capacitor && typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() === 'android');
}

function getVoicePlatform() {
    return isAndroidNativePlatform() ? 'android' : 'desktop';
}

function buildResolvedVoiceCommand(transcript) {
    const slotCommand = parseVoiceSlotCommand(transcript);
    if (slotCommand) {
        return {
            kind: 'slot',
            commandClass: 'slot',
            cost: Number.isFinite(slotCommand.cost) ? slotCommand.cost : null,
            slotLetter: slotCommand.letter,
            cardText: '',
            normalizedKey: `slot:${slotCommand.letter}:${Number.isFinite(slotCommand.cost) ? slotCommand.cost : '-'}`,
            normalizedText: slotCommand.normalized || '',
            parsed: null,
        };
    }

    const parsed = extractVoiceCostAndCard(transcript);
    if (!parsed) return null;

    if (parsed.isLegacyAbilityCommand) {
        return {
            kind: 'legacy_ability',
            commandClass: 'legacy_ability',
            cost: null,
            slotLetter: '',
            cardText: '',
            normalizedKey: `ability_legacy:${parsed.normalized || ''}`,
            normalizedText: parsed.normalized || '',
            parsed,
        };
    }

    const hasCost = Number.isFinite(parsed.cost) && parsed.cost >= 1 && parsed.cost <= 10;
    const normalizedCardKey = normalizeVoiceCardText(parsed.cardText || '');

    if (parsed.isAbility && hasCost) {
        return {
            kind: 'ability',
            commandClass: 'ability',
            cost: parsed.cost,
            slotLetter: '',
            cardText: '',
            normalizedKey: `ability:${parsed.cost}`,
            normalizedText: parsed.normalized || '',
            parsed,
        };
    }

    if (hasCost && normalizedCardKey) {
        return {
            kind: 'play',
            commandClass: 'cost_card',
            cost: parsed.cost,
            slotLetter: '',
            cardText: parsed.cardText,
            normalizedKey: `play:${parsed.cost}:${normalizedCardKey}`,
            normalizedText: parsed.normalized || '',
            parsed,
        };
    }

    if (hasCost) {
        return {
            kind: 'play',
            commandClass: 'cost_only',
            cost: parsed.cost,
            slotLetter: '',
            cardText: '',
            normalizedKey: `play:${parsed.cost}:-`,
            normalizedText: parsed.normalized || '',
            parsed,
        };
    }

    if (normalizedCardKey) {
        return {
            kind: 'card_only',
            commandClass: 'card_only',
            cost: null,
            slotLetter: '',
            cardText: parsed.cardText,
            normalizedKey: `card_only:${normalizedCardKey}`,
            normalizedText: parsed.normalized || '',
            parsed,
        };
    }

    return {
        kind: 'unknown',
        commandClass: 'unknown',
        cost: null,
        slotLetter: '',
        cardText: '',
        normalizedKey: `unknown:${parsed.normalized || ''}`,
        normalizedText: parsed.normalized || '',
        parsed,
    };
}

class VoiceCoordinator {
    constructor() {
        this.eventSeq = 0;
        this.groupSeq = 0;
        this.engineStates = new Map();
        this.utterances = new Map();
        this.groups = new Map();
        this.deferredActionHandler = null;
    }

    setDeferredActionHandler(handler) {
        this.deferredActionHandler = typeof handler === 'function' ? handler : null;
    }

    reset() {
        this.eventSeq = 0;
        this.groupSeq = 0;
        this.groups.forEach(group => this.clearGroupTimers(group));
        this.engineStates.clear();
        this.utterances.clear();
        this.groups.clear();
    }

    getEngineState(engine) {
        if (!this.engineStates.has(engine)) {
            this.engineStates.set(engine, {
                seq: 0,
                currentUtteranceId: '',
                currentResultIndex: -1,
                lastSpeechStartedAt: 0,
                currentGroupId: '',
            });
        }
        return this.engineStates.get(engine);
    }

    getUtteranceMapKey(engine, utteranceId) {
        return `${engine}:${utteranceId}`;
    }

    createGroup(options = {}) {
        const now = Date.now();
        const groupId = options.groupId || `voice-group-${++this.groupSeq}`;
        const group = {
            groupId,
            platform: options.platform || getVoicePlatform(),
            speechStartedAt: Number.isFinite(options.speechStartedAt) ? options.speechStartedAt : now,
            createdAt: now,
            lastActivityAt: now,
            utterances: new Map(),
            utteranceIds: new Set(),
            observations: new Map(),
            latestStableByEngine: new Map(),
            dispatched: new Set(),
            authorityTimers: new Map(),
        };
        this.groups.set(groupId, group);
        return group;
    }

    clearGroupTimers(group) {
        if (!group || !group.authorityTimers) return;
        group.authorityTimers.forEach(timerId => clearTimeout(timerId));
        group.authorityTimers.clear();
    }

    pruneGroups(now = Date.now()) {
        this.groups.forEach(group => {
            if ((now - group.lastActivityAt) <= VOICE_ENSEMBLE_STALE_GROUP_MS) return;
            if (group.authorityTimers.size > 0) return;
            group.utterances.forEach(utteranceKey => {
                this.utterances.delete(utteranceKey);
            });
            this.groups.delete(group.groupId);
        });
    }

    findGroupByUtteranceId(utteranceId) {
        if (!utteranceId) return null;
        for (const group of this.groups.values()) {
            if (group.utteranceIds.has(utteranceId)) {
                return group;
            }
        }
        return null;
    }

    findCompatibleGroup(engine, utteranceId, options = {}) {
        const now = Date.now();
        const platform = options.platform || getVoicePlatform();
        const speechStartedAt = Number.isFinite(options.speechStartedAt) ? options.speechStartedAt : now;

        const exactGroup = this.findGroupByUtteranceId(utteranceId);
        if (exactGroup) return exactGroup;

        const engineState = this.getEngineState(engine);
        if (engineState.currentGroupId && this.groups.has(engineState.currentGroupId)) {
            return this.groups.get(engineState.currentGroupId);
        }

        const candidates = Array.from(this.groups.values())
            .filter(group => group.platform === platform)
            .filter(group => (now - group.lastActivityAt) <= VOICE_ENSEMBLE_STALE_GROUP_MS)
            .filter(group => !group.utterances.has(engine))
            .filter(group => {
                const groupSpeechStartedAt = Number.isFinite(group.speechStartedAt) ? group.speechStartedAt : 0;
                const withinSpeechWindow = groupSpeechStartedAt > 0
                    && speechStartedAt > 0
                    && Math.abs(groupSpeechStartedAt - speechStartedAt) <= VOICE_ENSEMBLE_GROUP_WINDOW_MS;
                const recentActivity = (now - group.lastActivityAt) <= 1300;
                return withinSpeechWindow || recentActivity;
            })
            .sort((a, b) => {
                const aDelta = Math.abs((a.speechStartedAt || now) - speechStartedAt);
                const bDelta = Math.abs((b.speechStartedAt || now) - speechStartedAt);
                if (aDelta !== bDelta) return aDelta - bDelta;
                return b.lastActivityAt - a.lastActivityAt;
            });

        return candidates[0] || this.createGroup({ platform, speechStartedAt });
    }

    beginUtterance(engine, options = {}) {
        this.pruneGroups();
        const engineState = this.getEngineState(engine);
        const utteranceId = options.utteranceId || `${engine}-${++engineState.seq}`;
        engineState.currentUtteranceId = utteranceId;
        engineState.lastSpeechStartedAt = Number.isFinite(options.speechStartedAt) ? options.speechStartedAt : Date.now();
        state.voice.lastSpeechStartedAt = engineState.lastSpeechStartedAt;

        const key = this.getUtteranceMapKey(engine, utteranceId);
        if (!this.utterances.has(key)) {
            const group = this.findCompatibleGroup(engine, utteranceId, options);
            const utterance = {
                engine,
                utteranceId,
                groupId: group.groupId,
                platform: options.platform || getVoicePlatform(),
                speechStartedAt: engineState.lastSpeechStartedAt,
                observations: new Map(),
                firstPartialLogged: false,
                finalLogged: false,
            };
            this.utterances.set(key, utterance);
            group.utterances.set(engine, key);
            group.utteranceIds.add(utteranceId);
            group.lastActivityAt = Date.now();
            if (!Number.isFinite(group.speechStartedAt) || !group.speechStartedAt) {
                group.speechStartedAt = utterance.speechStartedAt;
            }
            engineState.currentGroupId = group.groupId;
            appendVoiceDebug('speech_start', {
                engine,
                platform: options.platform || getVoicePlatform(),
                utteranceId,
                groupId: group.groupId,
            });
        }

        return utteranceId;
    }

    ensureUtterance(engine, utteranceId, options = {}) {
        const id = utteranceId || this.beginUtterance(engine, options);
        const key = this.getUtteranceMapKey(engine, id);
        if (!this.utterances.has(key)) {
            this.beginUtterance(engine, { ...options, utteranceId: id });
        }
        const utterance = this.utterances.get(key);
        if (Number.isFinite(options.speechStartedAt) && !Number.isFinite(utterance.speechStartedAt)) {
            utterance.speechStartedAt = options.speechStartedAt;
        }
        if (options.platform) utterance.platform = options.platform;
        const group = utterance && this.groups.get(utterance.groupId);
        if (group) {
            group.lastActivityAt = Date.now();
            if (options.platform) group.platform = options.platform;
            if (Number.isFinite(options.speechStartedAt) && (!Number.isFinite(group.speechStartedAt) || !group.speechStartedAt)) {
                group.speechStartedAt = options.speechStartedAt;
            }
            this.getEngineState(engine).currentGroupId = group.groupId;
        }
        return { utterance, group };
    }

    endUtterance(engine, utteranceId) {
        if (!utteranceId) return;
        const state = this.getEngineState(engine);
        if (state.currentUtteranceId === utteranceId) {
            state.currentUtteranceId = '';
            state.currentResultIndex = -1;
            state.currentGroupId = '';
        }

        const utteranceKey = this.getUtteranceMapKey(engine, utteranceId);
        const utterance = this.utterances.get(utteranceKey);
        if (!utterance) return;
        const group = this.groups.get(utterance.groupId);
        if (group) {
            group.lastActivityAt = Date.now();
            group.utterances.delete(engine);
        }
    }

    assignBrowserUtterance(resultIndex = -1) {
        const state = this.getEngineState('browser');
        if (!state.currentUtteranceId || (resultIndex !== -1 && resultIndex !== state.currentResultIndex)) {
            const utteranceId = this.beginUtterance('browser', {
                platform: getVoicePlatform(),
                speechStartedAt: Date.now(),
            });
            state.currentResultIndex = resultIndex;
            return utteranceId;
        }
        return state.currentUtteranceId;
    }

    nextEventId(engine, utteranceId) {
        this.eventSeq += 1;
        return `${engine}:${utteranceId}:${this.eventSeq}`;
    }

    getCommandFamily(command) {
        if (!command || !command.commandClass) return 'unknown';
        if (command.commandClass === 'slot') return 'slot';
        if (command.commandClass === 'ability' || command.commandClass === 'legacy_ability') return 'ability';
        if (command.commandClass === 'cost_only' || command.commandClass === 'cost_card' || command.commandClass === 'card_only') {
            return 'play';
        }
        return command.commandClass;
    }

    getCommandCardKey(command) {
        return normalizeVoiceCardText((command && command.cardText) || '');
    }

    doesObservationSupportCandidate(candidate, observed) {
        if (!candidate || !observed) return false;
        if (candidate.normalizedKey && observed.normalizedKey && candidate.normalizedKey === observed.normalizedKey) {
            return true;
        }

        if (candidate.commandClass === 'slot' && observed.commandClass === 'slot') {
            return candidate.slotLetter === observed.slotLetter
                && (!Number.isFinite(candidate.cost) || !Number.isFinite(observed.cost) || candidate.cost === observed.cost);
        }

        if (candidate.commandClass === 'ability' && observed.commandClass === 'ability') {
            return Number.isFinite(candidate.cost) && Number.isFinite(observed.cost) && candidate.cost === observed.cost;
        }

        if (this.getCommandFamily(candidate) !== 'play' || this.getCommandFamily(observed) !== 'play') {
            return false;
        }

        const candidateHasCost = Number.isFinite(candidate.cost);
        const observedHasCost = Number.isFinite(observed.cost);
        const candidateCard = this.getCommandCardKey(candidate);
        const observedCard = this.getCommandCardKey(observed);

        if (candidate.commandClass === 'cost_only') {
            return candidateHasCost && observedHasCost && candidate.cost === observed.cost;
        }

        if (candidate.commandClass === 'cost_card') {
            return candidateHasCost
                && observedHasCost
                && candidate.cost === observed.cost
                && !!candidateCard
                && candidateCard === observedCard;
        }

        if (candidate.commandClass === 'card_only') {
            return !!candidateCard && candidateCard === observedCard;
        }

        return false;
    }

    getSupportingEngineRecords(group, candidate, now = Date.now()) {
        const supporting = [];
        group.latestStableByEngine.forEach(record => {
            if (!record || !record.command) return;
            const isRecent = record.final || (now - record.at) <= VOICE_ENSEMBLE_STABLE_TTL_MS;
            if (!isRecent) return;
            if (!this.doesObservationSupportCandidate(candidate, record.command)) return;
            supporting.push(record);
        });
        return supporting;
    }

    hasConflictingSupport(group, candidate, now = Date.now()) {
        const family = this.getCommandFamily(candidate);
        const candidateCard = this.getCommandCardKey(candidate);

        for (const record of group.latestStableByEngine.values()) {
            if (!record || !record.command) continue;
            const isRecent = record.final || (now - record.at) <= VOICE_ENSEMBLE_STABLE_TTL_MS;
            if (!isRecent) continue;
            const observed = record.command;
            if (this.getCommandFamily(observed) !== family) continue;
            if (this.doesObservationSupportCandidate(candidate, observed)) continue;

            if (family === 'slot') {
                return observed.slotLetter !== candidate.slotLetter;
            }

            if (family === 'ability') {
                return Number.isFinite(observed.cost) && Number.isFinite(candidate.cost) && observed.cost !== candidate.cost;
            }

            if (family === 'play') {
                const observedHasCost = Number.isFinite(observed.cost);
                const candidateHasCost = Number.isFinite(candidate.cost);
                const observedCard = this.getCommandCardKey(observed);

                if (candidateHasCost && observedHasCost && observed.cost !== candidate.cost) {
                    return true;
                }

                if (candidate.commandClass === 'cost_card'
                    && observed.commandClass === 'cost_card'
                    && candidateHasCost
                    && observedHasCost
                    && candidate.cost === observed.cost
                    && candidateCard
                    && observedCard
                    && candidateCard !== observedCard) {
                    return true;
                }

                if (candidate.commandClass === 'card_only'
                    && observed.commandClass === 'card_only'
                    && candidateCard
                    && observedCard
                    && candidateCard !== observedCard) {
                    return true;
                }
            }
        }

        return false;
    }

    getActiveEnsembleEngines(platform) {
        if (platform === 'android') {
            if (state.voice.nativeActive) return ['native'];
            return state.voice.nativeAvailable ? ['native'] : [];
        }

        const engines = [];
        if (state.voice.browserActive) engines.push('browser');
        if (state.voice.whisperActive) engines.push('whisper');
        if (state.voice.whisperAltActive) engines.push('whisper_alt');
        if (engines.length) return engines;

        if (state.voice.browserSupported) engines.push('browser');
        if (state.voice.whisperAvailable) engines.push('whisper');
        if (state.voice.whisperAltAvailable) engines.push('whisper_alt');
        return engines;
    }

    getRequiredSupportCount(platform) {
        const activeEngines = this.getActiveEnsembleEngines(platform);
        if (activeEngines.length <= 1) return 1;

        // Latency-first policy: when browser speech is live, do not hold commands
        // waiting for model quorum. Whisper engines remain as correction/fallback.
        if (platform !== 'android' && activeEngines.includes('browser')) {
            return 1;
        }
        return Math.min(2, activeEngines.length);
    }

    getDispatchToken(command) {
        return command.dispatchKey || command.normalizedKey || `${command.kind || 'voice'}:${command.commandClass || 'unknown'}`;
    }

    getBrowserAuthorityDelay(command) {
        if (!command) return VOICE_BROWSER_AUTHORITY_GRACE_MS;
        if (command.commandClass === 'slot' || command.commandClass === 'ability') return 0;
        if (command.commandClass === 'cost_card') return VOICE_BROWSER_CARD_AUTHORITY_GRACE_MS;
        return VOICE_BROWSER_AUTHORITY_GRACE_MS;
    }

    canFastTrackBrowserPartial(command, event) {
        if (!command || !event || event.engine !== 'browser' || event.phase !== 'partial') return false;
        const normalizedText = normalizeVoiceText(command.normalizedText || event.transcript || '');
        if (!normalizedText) return false;
        const tokens = normalizedText.split(' ').filter(Boolean);
        if (tokens.length === 0 || tokens.length > 4) return false;

        if (command.commandClass === 'slot') {
            const parsed = parseVoiceSlotCommand(normalizedText);
            if (!parsed || parsed.letter !== command.slotLetter) return false;
            if (Number.isFinite(command.cost) && parsed.cost !== command.cost) return false;
            return true;
        }

        if (command.commandClass === 'ability') {
            return Number.isFinite(command.cost) && tokens[0] === 'k' && tokens.length <= 2;
        }

        if (command.commandClass === 'cost_card') {
            const cardTokens = normalizeVoiceCardText(command.cardText || '').split(' ').filter(Boolean);
            return cardTokens.length > 0 && cardTokens.length <= 3 && !!resolveBrowserPriorityCommand(command);
        }

        if (command.commandClass === 'cost_only') {
            return Number.isFinite(command.cost)
                && tokens.length === 1
                && Number.isFinite(event.confidence)
                && event.confidence >= 0.82;
        }

        return false;
    }

    canDispatchBrowserImmediately(candidate, event) {
        if (!candidate || !event || event.engine !== 'browser') return false;
        if (candidate.commandClass === 'slot' || candidate.commandClass === 'ability') {
            return true;
        }
        if (candidate.commandClass === 'cost_card') {
            return !!resolveBrowserPriorityCommand(candidate);
        }
        if (candidate.commandClass === 'cost_only') {
            const normalizedText = normalizeVoiceText(candidate.normalizedText || event.transcript || '');
            const tokens = normalizedText.split(' ').filter(Boolean);
            if (!Number.isFinite(candidate.cost)) return false;
            if (tokens.length === 0 || tokens.length > 2) return false;
            if (Number.isFinite(event.confidence) && event.confidence < 0.72) return false;
            return true;
        }
        return false;
    }

    cancelAuthorityTimer(group, dispatchToken) {
        if (!group || !dispatchToken || !group.authorityTimers.has(dispatchToken)) return;
        clearTimeout(group.authorityTimers.get(dispatchToken));
        group.authorityTimers.delete(dispatchToken);
    }

    queueImmediateDispatch(group, event, command, reason, supportRecords = []) {
        const dispatchToken = this.getDispatchToken(command);
        this.cancelAuthorityTimer(group, dispatchToken);
        if (group.dispatched.has(dispatchToken)) return null;
        group.dispatched.add(dispatchToken);
        return {
            reason,
            command: {
                ...command,
                sourceEventId: event.id,
            },
            supportEngines: supportRecords.map(record => record.engine),
            supportCount: supportRecords.length,
            groupId: group.groupId,
        };
    }

    emitDeferredAction(event, action) {
        if (typeof this.deferredActionHandler !== 'function') return;
        try {
            this.deferredActionHandler({ event, action });
        } catch (err) {
            console.warn('Falha ao processar acao de voz adiada.', err);
        }
    }

    maybeScheduleBrowserAuthority(group, event, command) {
        const dispatchToken = this.getDispatchToken(command);
        if (group.dispatched.has(dispatchToken) || group.authorityTimers.has(dispatchToken)) {
            return true;
        }

        const eventSnapshot = { ...event };
        const authorityDelayMs = this.getBrowserAuthorityDelay(command);
        const timerId = setTimeout(() => {
            group.authorityTimers.delete(dispatchToken);
            const liveGroup = this.groups.get(group.groupId);
            if (!liveGroup) return;
            if (liveGroup.dispatched.has(dispatchToken)) return;

            const now = Date.now();
            const supportRecords = this.getSupportingEngineRecords(liveGroup, command, now);
            const required = this.getRequiredSupportCount(eventSnapshot.platform || liveGroup.platform);
            const hasConflict = this.hasConflictingSupport(liveGroup, command, now);

            if (supportRecords.length >= required) {
                const quorumAction = this.queueImmediateDispatch(liveGroup, eventSnapshot, command, 'quorum', supportRecords);
                if (quorumAction) this.emitDeferredAction(eventSnapshot, quorumAction);
                return;
            }

            if (hasConflict) {
                appendVoiceDebug('ensemble_conflict', {
                    source: eventSnapshot.engine || 'unknown',
                    groupId: liveGroup.groupId,
                    key: command.normalizedKey || '-',
                    reason: 'browser_authority_blocked',
                });
                return;
            }

            const authorityAction = this.queueImmediateDispatch(
                liveGroup,
                eventSnapshot,
                command,
                'browser_authority',
                supportRecords.length ? supportRecords : [{ engine: 'browser' }]
            );
            if (authorityAction) this.emitDeferredAction(eventSnapshot, authorityAction);
        }, authorityDelayMs);

        group.authorityTimers.set(dispatchToken, timerId);
        return true;
    }

    canUseBrowserAuthority(candidate, event) {
        if (event.engine !== 'browser') return false;
        if ((event.platform || getVoicePlatform()) === 'android') return false;
        if (!state.voice.browserActive) return false;
        return candidate.commandClass === 'slot'
            || candidate.commandClass === 'ability'
            || candidate.commandClass === 'cost_only'
            || candidate.commandClass === 'cost_card';
    }

    registerStableCommand(group, event, command) {
        const observation = group.observations.get(command.normalizedKey) || {
            command,
            sources: new Map(),
            firstSeenAt: event.receivedAt,
            lastSeenAt: 0,
        };
        observation.command = command;
        observation.lastSeenAt = event.receivedAt;
        observation.sources.set(event.engine, {
            engine: event.engine,
            at: event.receivedAt,
            final: event.phase === 'final',
            text: event.transcript || '',
            eventId: event.id,
        });
        group.observations.set(command.normalizedKey, observation);
        group.latestStableByEngine.set(event.engine, {
            engine: event.engine,
            command,
            event: {
                id: event.id,
                utteranceId: event.utteranceId,
                groupId: event.groupId,
                phase: event.phase,
                transcript: event.transcript,
            },
            at: event.receivedAt,
            final: event.phase === 'final',
        });
    }

    evaluateCandidate(group, event, candidate) {
        const now = event.receivedAt;
        const supportRecords = this.getSupportingEngineRecords(group, candidate, now);
        const required = this.getRequiredSupportCount(event.platform || group.platform);
        const hasConflict = this.hasConflictingSupport(group, candidate, now);

        if (!hasConflict && this.canDispatchBrowserImmediately(candidate, event)) {
            const action = this.queueImmediateDispatch(
                group,
                event,
                candidate,
                'browser_instant',
                supportRecords.length ? supportRecords : [{ engine: event.engine }]
            );
            return {
                actions: action ? [action] : [],
                reason: 'browser_instant',
            };
        }

        if (supportRecords.length >= required) {
            const dispatchReason = required >= 2 ? 'quorum' : 'stable_single_engine';
            const action = this.queueImmediateDispatch(group, event, candidate, dispatchReason, supportRecords);
            return {
                actions: action ? [action] : [],
                reason: dispatchReason,
            };
        }

        if (event.phase === 'final' && !hasConflict) {
            const action = this.queueImmediateDispatch(
                group,
                event,
                candidate,
                'final_single_engine',
                supportRecords.length ? supportRecords : [{ engine: event.engine }]
            );
            return {
                actions: action ? [action] : [],
                reason: 'final_single_engine',
            };
        }

        if (required <= 1 && !hasConflict) {
            const action = this.queueImmediateDispatch(
                group,
                event,
                candidate,
                'stable_single_engine',
                supportRecords.length ? supportRecords : [{ engine: event.engine }]
            );
            return {
                actions: action ? [action] : [],
                reason: 'stable_single_engine',
            };
        }

        if (!hasConflict && this.canUseBrowserAuthority(candidate, event)) {
            this.maybeScheduleBrowserAuthority(group, event, candidate);
            return {
                actions: [],
                reason: 'awaiting_quorum',
            };
        }

        return {
            actions: [],
            reason: hasConflict ? 'conflict' : 'awaiting_quorum',
        };
    }

    ingest(inputEvent) {
        if (!inputEvent || !inputEvent.engine) {
            return { event: null, command: null, actions: [], reason: 'invalid_event' };
        }

        const phase = inputEvent.phase === 'start'
            ? 'start'
            : (inputEvent.phase === 'final' ? 'final' : 'partial');
        let utteranceId = inputEvent.utteranceId || '';
        if (inputEvent.engine === 'browser' && !utteranceId) {
            utteranceId = this.assignBrowserUtterance(Number.isFinite(inputEvent.resultIndex) ? inputEvent.resultIndex : -1);
        }

        const ensured = this.ensureUtterance(inputEvent.engine, utteranceId, {
            platform: inputEvent.platform || getVoicePlatform(),
            speechStartedAt: Number.isFinite(inputEvent.speechStartedAt) ? inputEvent.speechStartedAt : Date.now(),
        });
        const utterance = ensured.utterance;
        const group = ensured.group;
        const event = {
            ...inputEvent,
            phase,
            platform: inputEvent.platform || utterance.platform || getVoicePlatform(),
            utteranceId: utterance.utteranceId,
            groupId: group ? group.groupId : '',
            receivedAt: Number.isFinite(inputEvent.receivedAt) ? inputEvent.receivedAt : Date.now(),
            speechStartedAt: Number.isFinite(inputEvent.speechStartedAt) ? inputEvent.speechStartedAt : utterance.speechStartedAt || Date.now(),
        };
        event.id = inputEvent.id || this.nextEventId(event.engine, event.utteranceId);
        if (group) group.lastActivityAt = event.receivedAt;

        if (event.phase === 'start') {
            return { event, command: null, actions: [], reason: 'speech_start' };
        }

        const transcript = typeof event.transcript === 'string' ? event.transcript.trim() : '';
        if (!transcript) {
            return { event, command: null, actions: [], reason: 'empty_transcript' };
        }

        const command = buildResolvedVoiceCommand(transcript);
        event.commandClass = command ? command.commandClass : 'unknown';

        if (event.phase === 'partial' && !utterance.firstPartialLogged) {
            utterance.firstPartialLogged = true;
            appendVoiceDebug('first_partial', {
                engine: event.engine,
                utteranceId: event.utteranceId,
                groupId: event.groupId || '-',
                text: transcript,
            });
        } else if (event.phase === 'final' && !utterance.finalLogged) {
            utterance.finalLogged = true;
            appendVoiceDebug('final_result', {
                engine: event.engine,
                utteranceId: event.utteranceId,
                groupId: event.groupId || '-',
                text: transcript,
            });
        }

        if (!command || command.commandClass === 'unknown') {
            return { event, command, actions: [], reason: 'unknown_command' };
        }

        const observation = utterance.observations.get(command.normalizedKey) || {
            count: 0,
            lastSeenAt: 0,
            command,
        };
        if ((event.receivedAt - observation.lastSeenAt) <= VOICE_STABLE_WINDOW_MS) {
            observation.count += 1;
        } else {
            observation.count = 1;
        }
        observation.lastSeenAt = event.receivedAt;
        observation.command = command;
        utterance.observations.set(command.normalizedKey, observation);

        const browserFastTrack = this.canFastTrackBrowserPartial(command, event);
        const isStable = event.phase === 'final' || observation.count >= 2 || browserFastTrack;
        if (!isStable) {
            return { event, command, actions: [], reason: 'awaiting_stability' };
        }

        if (browserFastTrack && observation.count < 2) {
            appendVoiceDebug('browser_fasttrack', {
                utteranceId: event.utteranceId,
                groupId: event.groupId || '-',
                class: command.commandClass || 'unknown',
                key: command.normalizedKey || '-',
                text: event.transcript || '-',
            });
        }

        if (command.commandClass === 'card_only' && event.phase !== 'final') {
            return { event, command, actions: [], reason: 'awaiting_final_card_only' };
        }

        if (group) {
            this.registerStableCommand(group, event, command);
        }

        if (command.commandClass === 'cost_card' && event.phase !== 'final') {
            if (event.engine === 'browser') {
                const browserPriorityCommand = resolveBrowserPriorityCommand(command);
                if (browserPriorityCommand) {
                    const browserEvaluation = group
                        ? this.evaluateCandidate(group, event, browserPriorityCommand)
                        : { actions: [], reason: 'stable_single_engine' };
                    if ((browserEvaluation.actions && browserEvaluation.actions.length)
                        || browserEvaluation.reason === 'awaiting_quorum'
                        || browserEvaluation.reason === 'stable_single_engine'
                        || browserEvaluation.reason === 'browser_instant'
                        || browserEvaluation.reason === 'browser_authority'
                        || browserEvaluation.reason === 'quorum') {
                        return {
                            event,
                            command: browserPriorityCommand,
                            actions: browserEvaluation.actions || [],
                            reason: browserEvaluation.reason || 'browser_instant',
                        };
                    }
                }
            }

            const evaluation = group
                ? this.evaluateCandidate(group, event, {
                    ...command,
                    cardText: '',
                    commandClass: 'cost_only',
                    normalizedKey: `play:${command.cost}:-`,
                    dispatchKey: `fast_cost:${command.cost}`,
                })
                : { actions: [], reason: 'stable_partial_cost' };
            return { event, command, actions: evaluation.actions || [], reason: evaluation.reason || 'stable_partial_cost' };
        }

        const evaluation = group
            ? this.evaluateCandidate(group, event, command)
            : { actions: [], reason: event.phase === 'final' ? 'final_single_engine' : 'stable_single_engine' };
        return {
            event,
            command,
            actions: evaluation.actions || [],
            reason: evaluation.reason || (event.phase === 'final' ? 'final_single_engine' : 'stable_single_engine'),
        };
    }
}

let voiceCoordinator = new VoiceCoordinator();
voiceCoordinator.setDeferredActionHandler(handleDeferredVoiceAction);
let lastResolvedVoiceAction = {
    normalizedKey: '',
    commandClass: '',
    engine: '',
    at: 0,
};

function shouldSuppressWhisperAuthoritativeEcho(command, engine = 'whisper') {
    if (!command || !state.voice.browserActive) return false;
    if (engine !== 'whisper' && engine !== 'whisper_alt') return false;
    if (command.commandClass !== 'slot'
        && command.commandClass !== 'ability'
        && command.commandClass !== 'cost_only'
        && command.commandClass !== 'cost_card') {
        return false;
    }
    if (lastResolvedVoiceAction.engine !== 'browser') return false;
    if (!lastResolvedVoiceAction.normalizedKey || lastResolvedVoiceAction.normalizedKey !== command.normalizedKey) {
        return false;
    }
    return (Date.now() - lastResolvedVoiceAction.at) < 1600;
}

function rememberResolvedVoiceAction(command, engine) {
    if (!command) return;
    lastResolvedVoiceAction = {
        normalizedKey: command.normalizedKey || '',
        commandClass: command.commandClass || '',
        engine: engine || 'unknown',
        at: Date.now(),
    };
}

function levenshteinDistance(a, b) {
    const aa = a || '';
    const bb = b || '';
    if (!aa.length) return bb.length;
    if (!bb.length) return aa.length;

    const matrix = Array.from({ length: aa.length + 1 }, () => Array(bb.length + 1).fill(0));
    for (let i = 0; i <= aa.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= bb.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= aa.length; i++) {
        for (let j = 1; j <= bb.length; j++) {
            const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[aa.length][bb.length];
}

function nameSimilarity(a, b) {
    const aa = normalizeLooseText(a);
    const bb = normalizeLooseText(b);
    if (!aa || !bb) return 0;
    if (aa === bb) return 1;
    const maxLen = Math.max(aa.length, bb.length) || 1;
    const base = 1 - (levenshteinDistance(aa, bb) / maxLen);
    if (aa.includes(bb) || bb.includes(aa)) return Math.max(base, 0.78);
    return Math.max(0, base);
}

function sanitizeVoiceReportValue(value) {
    if (value === null || typeof value === 'undefined') return '-';
    const raw = String(value).replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
    return raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
}

function appendVoiceDebug(eventType, details = {}) {
    if (!state.voice.debugEntries) state.voice.debugEntries = [];

    const now = new Date();
    const ts = now.toISOString().slice(11, 23);
    const matchClock = state.running ? formatTime(state.matchTimeRemaining) : 'idle';
    const base = [`${ts}`, eventType, `mt:${matchClock}`, `elx:${state.elixir.toFixed(2)}`];

    Object.entries(details).forEach(([key, value]) => {
        base.push(`${key}:${sanitizeVoiceReportValue(value)}`);
    });

    const line = base.join(' | ');
    state.voice.debugEntries.push(line);
    if (state.voice.debugEntries.length > VOICE_REPORT_LIMIT) {
        state.voice.debugEntries.splice(0, state.voice.debugEntries.length - VOICE_REPORT_LIMIT);
    }
    renderVoiceDebugReport();
}

function getVoiceDebugReportText() {
    const header = [
        'CR Elixir Tracker - Relatorio Tecnico de Voz',
        `gerado_em=${new Date().toISOString()}`,
        `estado_atual=running:${state.running ? 1 : 0} elixir:${state.elixir.toFixed(2)} tempo:${state.running ? formatTime(state.matchTimeRemaining) : 'idle'}`,
        '---'
    ];
    const lines = state.voice.debugEntries && state.voice.debugEntries.length
        ? state.voice.debugEntries
        : ['(sem eventos registrados)'];
    return `${header.join('\n')}\n${lines.join('\n')}`;
}

function renderVoiceDebugReport() {
    if (!els.voiceLogOutput) return;
    const entries = state.voice.debugEntries || [];
    if (entries.length === 0) {
        els.voiceLogOutput.value = 'Ative a voz para gerar historico tecnico copiavel.';
        return;
    }
    els.voiceLogOutput.value = getVoiceDebugReportText();
    els.voiceLogOutput.scrollTop = els.voiceLogOutput.scrollHeight;
}

async function copyVoiceDebugReport() {
    const reportText = getVoiceDebugReportText();
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(reportText);
        return true;
    }

    if (!els.voiceLogOutput) return false;
    els.voiceLogOutput.focus();
    els.voiceLogOutput.select();
    try {
        return document.execCommand('copy');
    } catch (err) {
        console.warn('Falha no fallback de copia do relatorio.', err);
        return false;
    }
}

function clearVoiceDebugReport() {
    state.voice.debugEntries = [];
    renderVoiceDebugReport();
    appendVoiceDebug('report_cleared');
}

function updateVoiceUI(mode, message, transcript) {
    if (!els.voiceStatus || !els.voiceStatusText || !els.voiceTranscript || !els.voiceDot || !els.btnVoice) return;

    const shouldShow = state.voice.supported || mode === 'error';
    els.voiceStatus.style.display = shouldShow ? 'block' : 'none';
    if (els.voiceLogPanel) els.voiceLogPanel.style.display = shouldShow ? 'block' : 'none';
    els.voiceStatus.className = `voice-status ${mode}`;
    els.btnVoice.className = `btn-voice ${mode === 'listening' ? 'listening' : ''}`;
    els.voiceDot.className = `voice-dot ${mode}`;
    els.voiceStatusText.textContent = message || 'Voz inativa';

    if (typeof transcript === 'string' && transcript.trim()) {
        state.voice.lastTranscript = transcript.trim();
    }

    const micPct = Math.max(0, Math.min(99, Math.round((state.voice.lastMicLevel || 0) * 1800)));
    const lagMs = Math.max(0, Math.round(state.voice.lastRecognitionLagMs || 0));
    const debugText = `motor:${state.voice.engine || 'n/a'} | plataforma:${state.voice.platform || 'n/a'} | browser:${state.voice.browserActive ? 'on' : 'off'} | native:${state.voice.nativeActive ? 'on' : 'off'} | whisper:${state.voice.whisperActive ? 'on' : 'off'} | whisperAlt:${state.voice.whisperAltActive ? 'on' : 'off'} | socket:${state.voice.socketState} | mic:${micPct}% | lag:${lagMs}ms | chunks:${state.voice.chunksSent} | ia:${state.voice.transcriptsReceived}`;
    els.voiceTranscript.textContent = state.voice.lastTranscript
        ? `${state.voice.lastTranscript}\n${debugText}`
        : debugText;

    if (mode === 'error') {
        els.btnVoice.classList.add('error');
    } else {
        els.btnVoice.classList.remove('error');
    }
}

function tokenizeVoiceName(value) {
    const normalized = normalizeVoiceCardText(value || '');
    if (!normalized) return [];
    return normalized.split(' ').filter(token => token && token.length > 1);
}

const VOICE_TOKEN_STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);

function normalizeVoiceTokenStem(token) {
    if (!token) return '';
    let t = token;
    if (t.length > 5 && t.endsWith('es')) t = t.slice(0, -2);
    else if (t.length > 4 && t.endsWith('s')) t = t.slice(0, -1);
    return t;
}

function tokenizeVoiceNameForMatch(value) {
    return tokenizeVoiceName(value)
        .filter(token => !VOICE_TOKEN_STOPWORDS.has(token))
        .map(token => normalizeVoiceTokenStem(token))
        .filter(Boolean);
}

function matchesOrderedVoicePartialTokens(inputTokens, cardTokens) {
    if (!inputTokens.length || !cardTokens.length) return false;

    let scanIndex = 0;
    for (const inputToken of inputTokens) {
        let matched = false;
        for (let i = scanIndex; i < cardTokens.length; i++) {
            const cardToken = cardTokens[i];
            const prefixMatch = cardToken.startsWith(inputToken);
            const reverseMatch = inputToken.length >= 5 && inputToken.startsWith(cardToken);
            if (!prefixMatch && !reverseMatch) continue;
            matched = true;
            scanIndex = i + 1;
            break;
        }
        if (!matched) return false;
    }

    return true;
}

function buildDeterministicUniquePartialVoiceMatch(normalizedInput, candidates, options = {}) {
    const { minSingleTokenLength = 5 } = options;
    const input = normalizeVoiceCardText(normalizedInput || '');
    if (!input || !candidates || candidates.length === 0) return null;

    const compactInput = input.replace(/\s+/g, '');
    const inputTokens = tokenizeVoiceNameForMatch(input);
    if (compactInput.length < 3 || inputTokens.length === 0) return null;
    if (inputTokens.length === 1 && compactInput.length < minSingleTokenLength) return null;

    const matched = candidates.filter(card => {
        const cardNorm = normalizeVoiceCardText(card && card.name);
        if (!cardNorm) return false;

        const cardTokens = tokenizeVoiceNameForMatch(cardNorm);
        if (!cardTokens.length) return false;
        if (matchesOrderedVoicePartialTokens(inputTokens, cardTokens)) return true;

        if (inputTokens.length !== 1 || compactInput.length < minSingleTokenLength) return false;
        const compactCard = cardNorm.replace(/\s+/g, '');
        return compactCard.startsWith(compactInput);
    });

    if (matched.length !== 1) return null;

    return {
        card: matched[0],
        confidence: inputTokens.length >= 2 ? 0.97 : 0.94,
        inferred: true,
        margin: 1,
        reason: 'deterministic_unique_partial',
    };
}

const VOICE_FORCED_AMBIGUOUS_PARTIAL_TOKENS = new Set([
    'espirito',
    'barril',
]);

function isForcedAmbiguousPartialRaw(value) {
    const raw = normalizeLooseText(value || '');
    if (!raw) return false;
    const tokens = raw
        .split(' ')
        .filter(Boolean)
        .map(token => normalizeVoiceTokenStem(token))
        .filter(Boolean);
    if (tokens.length !== 1) return false;
    return VOICE_FORCED_AMBIGUOUS_PARTIAL_TOKENS.has(tokens[0]);
}

function buildUniquePartialVoiceMatch(normalizedInput, candidates, options = {}) {
    const { minSingleTokenLength = 5 } = options;
    const input = normalizeVoiceCardText(normalizedInput || '');
    if (!input || !candidates || candidates.length === 0) return null;

    const compactInput = input.replace(/\s+/g, '');
    const inputTokens = tokenizeVoiceNameForMatch(input);
    if (compactInput.length < 3 || inputTokens.length === 0) return null;
    if (inputTokens.length === 1 && compactInput.length < minSingleTokenLength) return null;

    const ranked = candidates
        .map(card => {
            const cardNorm = normalizeVoiceCardText(card && card.name);
            if (!cardNorm) return null;
            const compactCard = cardNorm.replace(/\s+/g, '');
            const cardTokens = tokenizeVoiceNameForMatch(cardNorm);
            if (cardTokens.length === 0) return null;

            const prefixHits = inputTokens.filter(token =>
                cardTokens.some(cardToken => cardToken.startsWith(token) || (token.length >= 5 && token.startsWith(cardToken)))
            ).length;
            const exactHits = inputTokens.filter(token => cardTokens.includes(token)).length;
            const compactContained = compactInput.length >= 4
                && (compactCard.startsWith(compactInput) || compactCard.includes(compactInput));

            let confidence = 0;
            if (prefixHits === inputTokens.length) {
                confidence = inputTokens.length >= 2
                    ? 0.95
                    : (compactInput.length >= 7 ? 0.91 : 0.87);
            } else if (compactContained) {
                confidence = compactInput.length >= 6 ? 0.88 : 0.82;
            } else if (inputTokens.length === 1 && exactHits === 1 && compactInput.length >= 6) {
                confidence = 0.86;
            }

            if (!confidence) return null;
            confidence = applyVoiceDisambiguationPenalty(input, card.name, confidence);
            if (state.voice.excludedCards.has(normalizeCardName(card.name))) {
                confidence -= 0.35;
            }
            return { card, confidence };
        })
        .filter(Boolean)
        .sort((a, b) => b.confidence - a.confidence);

    const viable = ranked.filter(entry => entry.confidence >= 0.82);
    if (viable.length !== 1) return null;

    return {
        card: viable[0].card,
        confidence: viable[0].confidence,
        inferred: true,
        margin: 1,
        reason: 'unique_partial',
    };
}

const VOICE_CARD_DISAMBIGUATION_GROUPS = {
    veneno: {
        triggers: ['veneno', 'venemo', 'venelo', 'veneco', 'venen'],
        cardKeys: new Set(['veneno']),
        opposingKeys: new Set(['vacuo']),
    },
    vacuo: {
        triggers: ['vacuo', 'vaco', 'vaquo', 'vakuo', 'vacu', 'vazio'],
        cardKeys: new Set(['vacuo']),
        opposingKeys: new Set(['veneno']),
    },
};

function getVoiceDisambiguationGroup(normalizedInput) {
    const input = normalizeVoiceCardText(normalizedInput || '');
    if (!input) return null;

    for (const group of Object.values(VOICE_CARD_DISAMBIGUATION_GROUPS)) {
        if (group.triggers.some(trigger => input.includes(trigger))) {
            return group;
        }
    }
    return null;
}

function applyVoiceDisambiguationPenalty(normalizedInput, cardName, confidence) {
    const group = getVoiceDisambiguationGroup(normalizedInput);
    if (!group) return confidence;

    const cardKey = normalizeVoiceCardText(cardName || '');
    if (!cardKey) return confidence;
    if (group.cardKeys.has(cardKey)) return confidence;
    if (group.opposingKeys.has(cardKey)) return confidence - 0.42;
    return confidence;
}

function scoreVoiceCandidate(inputNormalized, cardName) {
    const input = normalizeVoiceCardText(inputNormalized || '');
    const cardNorm = normalizeVoiceCardText(cardName || '');
    if (!input || !cardNorm) return 0;
    if (input === cardNorm) return 1;

    let score = nameSimilarity(input, cardNorm);

    const compactInput = input.replace(/\s+/g, '');
    const compactCard = cardNorm.replace(/\s+/g, '');
    if ((input.length >= 4 && cardNorm.includes(input))
        || (cardNorm.length >= 4 && input.includes(cardNorm))
        || (compactInput.length >= 5 && compactCard.includes(compactInput))
        || (compactCard.length >= 5 && compactInput.includes(compactCard))) {
        score = Math.max(score, 0.84);
    }

    // Prefix match: if the input (3+ chars) is a prefix of the card name, boost significantly
    if (compactInput.length >= 3 && compactCard.startsWith(compactInput)) {
        score = Math.max(score, 0.82 + Math.min(0.15, compactInput.length * 0.02));
    }
    // Reverse: card is prefix of input
    if (compactCard.length >= 3 && compactInput.startsWith(compactCard)) {
        score = Math.max(score, 0.80);
    }

    const inputTokens = tokenizeVoiceNameForMatch(input);
    const cardTokens = tokenizeVoiceNameForMatch(cardNorm);
    if (inputTokens.length > 0 && cardTokens.length > 0) {
        const sharedFromInput = inputTokens.filter(t => cardTokens.includes(t)).length / inputTokens.length;
        const sharedFromCard = cardTokens.filter(t => inputTokens.includes(t)).length / cardTokens.length;

        score = Math.max(score, sharedFromInput * 0.95, sharedFromCard * 0.88);
        if (sharedFromInput === 1 && inputTokens.length >= 2) {
            score = Math.max(score, 0.93);
        }

        // Partial token prefix match: check if any input token is a prefix of a card token
        const prefixMatches = inputTokens.filter(it => 
            it.length >= 3 && cardTokens.some(ct => ct.startsWith(it) || it.startsWith(ct))
        ).length;
        if (prefixMatches > 0) {
            score = Math.max(score, 0.72 + (prefixMatches / inputTokens.length) * 0.20);
        }

        // Evita que cartas genéricas de 1 palavra ganhem de cartas compostas faladas.
        if (inputTokens.length >= 2 && cardTokens.length === 1 && sharedFromInput < 1) {
            score -= 0.22;
        } else if (inputTokens.length >= 2 && sharedFromInput < 1) {
            score -= 0.1;
        }
    }

    // Evita priorizar variantes "Herói/Super" quando não foram faladas.
    const inputRawTokens = tokenizeVoiceName(input);
    const hasHeroWord = inputRawTokens.includes('heroi');
    const hasSuperWord = inputRawTokens.includes('super');
    if (!hasHeroWord && cardNorm.startsWith('heroi ')) {
        score -= 0.2;
    }
    if (!hasSuperWord && cardNorm.startsWith('super ')) {
        score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
}

function dedupeVoiceCandidates(candidates) {
    const map = new Map();
    (candidates || []).forEach(card => {
        if (!card || !card.name) return;
        const key = normalizeVoiceCardText(card.name) || normalizeCardName(card.name);
        if (!key) return;

        const existing = map.get(key);
        if (!existing) {
            map.set(key, card);
            return;
        }

        const existingConfirmed = existing.confirmed ? 1 : 0;
        const incomingConfirmed = card.confirmed ? 1 : 0;
        if (incomingConfirmed > existingConfirmed) {
            map.set(key, card);
            return;
        }

        if (!existing.prob && card.prob) {
            map.set(key, card);
        }
    });
    return Array.from(map.values());
}

function getVoiceContextCandidates(cost) {
    const targetCost = Number(cost);
    const candidates = [];

    if (state.identifying && state.identifyCost === targetCost && state._currentCards && state._currentCards.length > 0) {
        candidates.push(...state._currentCards);
    }

    if (state.opponentDeck && state.opponentDeck.length > 0) {
        candidates.push(...state.opponentDeck.filter(c => c.cost === targetCost));
    }

    if (typeof ALL_CARDS !== 'undefined' && ALL_CARDS.length > 0) {
        candidates.push(...ALL_CARDS.filter(c => c.cost === targetCost));
    }

    if (candidates.length === 0) {
        const identified = state.opponentDeck.filter(c => c.confirmed).map(c => c.name);
        candidates.push(...getScoredCardsForCost(targetCost, null, identified));
    }

    // NEVER match Espelho via voice scoring — it is only triggered explicitly
    return dedupeVoiceCandidates(candidates).filter(c => normalizeCardName(c.name) !== normalizeCardName('Espelho'));
}

function getVoiceMatchConstraints(normalizedInput) {
    const tokens = tokenizeVoiceNameForMatch(normalizedInput);
    const compact = (normalizedInput || '').replace(/\s+/g, '');
    const singleToken = tokens.length <= 1;
    const shortInput = compact.length < 5;
    return {
        minConfidence: (singleToken || shortInput) ? Math.max(VOICE_HIGH_CONFIDENCE, 0.86) : VOICE_LOW_CONFIDENCE,
        minMargin: (singleToken || shortInput) ? VOICE_MIN_CONFIDENCE_MARGIN_SINGLE_TOKEN : VOICE_MIN_CONFIDENCE_MARGIN,
    };
}

function resolveBestVoiceMatch(ranked, normalizedInput, options = {}) {
    const { allowInferred = true } = options;
    if (!ranked || ranked.length === 0) return null;

    const top = ranked[0];
    const runnerUp = ranked[1] || null;
    const { minConfidence, minMargin } = getVoiceMatchConstraints(normalizedInput);
    const margin = runnerUp ? (top.confidence - runnerUp.confidence) : 1;

    if (top.confidence < minConfidence) return null;
    if (runnerUp && margin < minMargin) return null;

    const inferred = top.confidence < VOICE_HIGH_CONFIDENCE;
    if (inferred && !allowInferred) return null;

    return {
        card: top.card,
        confidence: top.confidence,
        inferred,
        margin,
    };
}

function getBestGlobalVoiceCardMatch(cardText, options = {}) {
    if (isForcedAmbiguousPartialRaw(cardText)) return null;
    const normalizedInput = normalizeVoiceCardText(cardText);
    if (!normalizedInput || typeof ALL_CARDS === 'undefined' || !ALL_CARDS.length) return null;

    // Never match Espelho via global fuzzy matching
    const pool = ALL_CARDS.filter(c => normalizeCardName(c.name) !== normalizeCardName('Espelho'));

    const exact = pool.find(card => normalizeVoiceCardText(card.name) === normalizedInput);
    if (exact) return { card: exact, confidence: 1, inferred: false };

    const deterministicPartial = buildDeterministicUniquePartialVoiceMatch(normalizedInput, pool, { minSingleTokenLength: 6 });
    if (deterministicPartial && deterministicPartial.card) return deterministicPartial;

    const uniquePartial = buildUniquePartialVoiceMatch(normalizedInput, pool, { minSingleTokenLength: 6 });
    if (uniquePartial && uniquePartial.card) return uniquePartial;

    const ranked = pool
        .map(card => {
            let confidence = scoreVoiceCandidate(normalizedInput, card.name);
            confidence = applyVoiceDisambiguationPenalty(normalizedInput, card.name, confidence);
            // Penalize excluded cards
            if (state.voice.excludedCards.has(normalizeCardName(card.name))) {
                confidence -= 0.35;
            }
            return { card, confidence };
        })
        .sort((a, b) => b.confidence - a.confidence);
    return resolveBestVoiceMatch(ranked, normalizedInput, options);
}

function getBestVoiceCardMatch(cardText, cost, options = {}) {
    const { allowInferred = true } = options;
    const candidates = getVoiceContextCandidates(cost);
    if (!candidates || candidates.length === 0) return null;
    if (isForcedAmbiguousPartialRaw(cardText)) return null;

    const normalizedInput = normalizeVoiceCardText(cardText);
    if (!normalizedInput) return null;

    const aliasExact = candidates.find(card => normalizeVoiceCardText(card.name) === normalizedInput);
    if (aliasExact) {
        return { card: aliasExact, confidence: 1, inferred: false };
    }

    const deterministicPartial = buildDeterministicUniquePartialVoiceMatch(normalizedInput, candidates, { minSingleTokenLength: 4 });
    if (deterministicPartial && deterministicPartial.card) {
        if (deterministicPartial.inferred && !allowInferred) return null;
        return deterministicPartial;
    }

    const uniquePartial = buildUniquePartialVoiceMatch(normalizedInput, candidates, { minSingleTokenLength: 4 });
    if (uniquePartial && uniquePartial.card) {
        if (uniquePartial.inferred && !allowInferred) return null;
        return uniquePartial;
    }

    const ranked = candidates
        .map(card => {
            let confidence = scoreVoiceCandidate(normalizedInput, card.name);
            confidence = applyVoiceDisambiguationPenalty(normalizedInput, card.name, confidence);
            // Boost confirmed deck cards to prefer known cards over global matches
            if (card.confirmed) confidence = Math.min(1, confidence + 0.08);
            // Penalize excluded cards heavily — user manually rejected this match
            if (state.voice.excludedCards.has(normalizeCardName(card.name))) {
                confidence -= 0.35;
            }
            return { card, confidence };
        })
        .sort((a, b) => b.confidence - a.confidence);
    return resolveBestVoiceMatch(ranked, normalizedInput, { allowInferred });
}

function resolveBrowserPriorityCommand(command) {
    if (!command || command.commandClass !== 'cost_card' || !Number.isFinite(command.cost)) return null;
    const rawCardText = command.cardText || '';
    const normalizedInput = normalizeVoiceCardText(rawCardText);
    if (!normalizedInput) return null;

    const contextualMatch = getBestVoiceCardMatch(rawCardText, command.cost, { allowInferred: true });
    const globalMatch = contextualMatch && contextualMatch.card
        ? contextualMatch
        : getBestGlobalVoiceCardMatch(rawCardText, { allowInferred: true });
    const match = globalMatch && globalMatch.card ? globalMatch : null;
    if (!match || !match.card) return null;

    const matchedCardKey = normalizeVoiceCardText(match.card.name || '');
    const exactMatch = matchedCardKey && matchedCardKey === normalizedInput;
    const confirmedDeckMatch = !!((state.opponentDeck || []).find(card =>
        card
        && card.confirmed
        && Number(card.cost) === Number(command.cost)
        && normalizeVoiceCardText(card.name || '') === matchedCardKey
    ));
    const threshold = exactMatch
        ? 0.72
        : confirmedDeckMatch
            ? 0.80
            : 0.90;

    if (match.inferred && match.confidence < threshold) return null;
    if (!match.inferred && match.confidence < 0.58) return null;

    return {
        ...command,
        cardText: match.card.name,
        normalizedKey: `play:${command.cost}:${matchedCardKey}`,
        dispatchKey: `browser_card:${command.cost}:${matchedCardKey}`,
    };
}

function tryApplyVoicePendingCard() {
    if (!state.identifying) return;
    if (!state.voice.pendingCost || state.voice.pendingCost !== state.identifyCost) return;
    if (!state.voice.pendingCardText) return;

    const match = getBestVoiceCardMatch(state.voice.pendingCardText, state.identifyCost, { allowInferred: true });
    if (!match || !match.card || (match.inferred && match.confidence < 0.78)) {
        state.voice.pendingCardText = '';
        state.voice.pendingCost = null;
        updateVoiceUI('processing', `Elixir ${state.identifyCost} registrado. Nao chutei carta para evitar erro.`);
        return;
    }

    const selectedName = match.card.name;
    state.voice.pendingCardText = '';
    state.voice.pendingCost = null;
    confirmCardIdentification(selectedName);
    updateVoiceUI('processing', `Carta reconhecida com alta confianca: ${selectedName}.`, selectedName);
}

function handleMirrorPlayByVoice(baseCardName, spokenCost, meta = {}) {
    const { source = 'unknown', explicit = false } = meta || {};
    const baseFromHistory = getLastMirrorableCardName();

    let resolvedBaseName = baseCardName || baseFromHistory;
    let baseCardData = null;
    if (resolvedBaseName && typeof ALL_CARDS !== 'undefined') {
        baseCardData = ALL_CARDS.find(c => normalizeCardName(c.name) === normalizeCardName(resolvedBaseName)) || null;
        if (baseCardData) resolvedBaseName = baseCardData.name;
    }

    if (!resolvedBaseName) {
        appendVoiceDebug('cmd_drop', { source, reason: 'mirror_without_base' });
        updateVoiceUI('error', 'Espelho detectado, mas faltou carta base.');
        return false;
    }

    if (!baseCardData || !Number.isFinite(baseCardData.cost) || baseCardData.cost < 1) {
        appendVoiceDebug('cmd_drop', { source, reason: 'mirror_unknown_base', base: resolvedBaseName });
        updateVoiceUI('error', 'Base do espelho nao reconhecida com segurança.');
        return false;
    }

    const mirrorCost = Math.min(10, baseCardData.cost + 1);
    if (Number.isFinite(spokenCost) && spokenCost >= 1 && spokenCost <= 10 && spokenCost !== mirrorCost) {
        appendVoiceDebug('cmd_drop', {
            source,
            reason: 'mirror_cost_mismatch',
            base: resolvedBaseName,
            expected: mirrorCost,
            spoken: spokenCost,
        });
        updateVoiceUI('error', `Espelho rejeitado: custo esperado ${mirrorCost}, recebido ${spokenCost}.`);
        return false;
    }

    const commandKey = `mirror:${mirrorCost}:${normalizeVoiceCardText(resolvedBaseName)}`;

    if (!state.running) {
        startMatch({ preserveVoiceDedupe: true });
        applyAutoStartCalibration(mirrorCost);
        appendVoiceDebug('cmd_auto_start', { source, cost: mirrorCost, reason: 'mirror_play' });
    }

    ensureConfirmedOpponentCard('Espelho', 1);
    if (baseCardData) ensureConfirmedOpponentCard(baseCardData.name, baseCardData.cost);

    subtractElixir(mirrorCost, 'Espelho', {
        source: `voice:${source}`,
        commandKey,
        skipIdentify: true,
        forcedCycleCardName: 'Espelho',
        forcedHistoryCardName: `${resolvedBaseName} (Espelho)`,
    });

    state.voice.lastCommandKey = commandKey;
    state.voice.lastCommandAt = Date.now();
    state.voice.lastCommandSource = source || 'unknown';
    state.voice.lastPlayedCost = mirrorCost;
    state.voice.lastPlayedTime = Date.now();
    state.voice.lastPlayedCardKey = normalizeVoiceCardText(resolvedBaseName);
    state.voice.awaitingCardOnlyCost = null;
    state.voice.awaitingCardOnlyUntil = 0;
    state.voice.pendingCost = null;
    state.voice.pendingCardText = '';

    updateVoiceUI('processing', `${resolvedBaseName} espelhada (${mirrorCost}) registrada.`, `${resolvedBaseName} espelhada`);
    appendVoiceDebug('cmd_mirror', {
        source,
        base: resolvedBaseName,
        cost: mirrorCost,
        explicit: explicit ? 1 : 0,
    });
    return true;
}

function updateRecentVoicePlayCard(cost, newName, options = {}) {
    const {
        source = 'voice',
        confidence = 1,
        inferred = false,
        reason = 'recent_fix',
    } = options || {};

    if (!newName || !state.history.length) return { status: 'rejected', cardName: null };

    const lastEntry = state.history[0];
    if (!lastEntry || lastEntry.type !== 'card' || lastEntry.cost !== cost) {
        return { status: 'rejected', cardName: null };
    }

    const previousName = lastEntry.cardName;
    const previousNorm = normalizeVoiceCardText(previousName || '');
    const nextNorm = normalizeVoiceCardText(newName || '');
    const sameName = previousName === newName || (previousNorm && nextNorm && previousNorm === nextNorm);
    if (sameName) {
        state.voice.awaitingCardOnlyCost = null;
        state.voice.awaitingCardOnlyUntil = 0;
        return { status: 'kept', cardName: previousName, reason: 'same_name' };
    }

    const previousIsCostOnly = previousName === cost.toString();
    if (!previousIsCostOnly) {
        const existingConfirmed = state.opponentDeck.find(c => c.name === previousName && c.confirmed);
        if (existingConfirmed) {
            // Carta já confirmada não pode ser trocada por inferência posterior.
            appendVoiceDebug('cmd_fix_skip', {
                source,
                cost,
                from: previousName,
                to: newName,
                reason: 'confirmed_lock',
                conf: Number.isFinite(confidence) ? confidence.toFixed(2) : '-',
                inferred: inferred ? 1 : 0,
                trigger: reason,
            });
            state.voice.awaitingCardOnlyCost = null;
            state.voice.awaitingCardOnlyUntil = 0;
            return { status: 'kept', cardName: previousName, reason: 'confirmed_lock' };
        }
    }

    if (!syncDeckCompleteFlag()) {
        if (!previousIsCostOnly) {
            const existing = state.opponentDeck.find(c => c.name === previousName);
            if (existing && !existing.confirmed) {
                existing.name = newName;
                const cardData = ALL_CARDS.find(c => c.name === newName);
                if (cardData) {
                    existing.cost = cardData.cost;
                    existing.type = cardData.type;
                }
            }
        } else if (!state.opponentDeck.find(c => c.name === newName && c.confirmed)) {
            const predicted = state.opponentDeck.find(c => c.name === newName && !c.confirmed);
            if (predicted) {
                predicted.confirmed = true;
            } else {
                const cardData = ALL_CARDS.find(c => c.name === newName);
                state.opponentDeck.push({
                    cost,
                    name: newName,
                    type: cardData ? cardData.type : 'T',
                    confirmed: true,
                });
            }

            const confirmedCount = getConfirmedDeckCount();
            if (confirmedCount >= 2) autoFillPredictions();
            syncDeckCompleteFlag();
        }
    }

    lastEntry.cardName = newName;

    if (typeof state.cardCycle !== 'undefined' && state.cardCycle.length > 0) {
        const lastCycle = state.cardCycle[state.cardCycle.length - 1];
        if (lastCycle && lastCycle.cost === cost) {
            lastCycle.name = newName;
            rebuildCyclePrediction();
        }
    }

    state.voice.awaitingCardOnlyCost = null;
    state.voice.awaitingCardOnlyUntil = 0;
    updateAll();
    return { status: 'updated', cardName: newName, reason: 'updated' };
}

function handleVoiceAbilityCost(cost, meta = {}) {
    const { source = 'unknown' } = meta;
    const now = Date.now();
    const commandKey = `ability:${cost}`;

    if (state.voice.lastCommandKey === commandKey && (now - state.voice.lastCommandAt) < 600) {
        appendVoiceDebug('cmd_drop', { source, cost, reason: 'ability_dedupe' });
        return false;
    }

    state.voice.lastCommandKey = commandKey;
    state.voice.lastCommandAt = now;
    state.voice.lastCommandSource = source || 'unknown';
    state.voice.lastPlayedCost = cost;
    state.voice.lastPlayedTime = now;
    state.voice.lastPlayedCardKey = '';

    if (!state.running) {
        startMatch({ preserveVoiceDedupe: true });
        applyAutoStartCalibration(cost);
        appendVoiceDebug('cmd_auto_start', { source, cost, reason: 'ability_play' });
    }

    const result = registerChampionAbilitySpend(cost, {
        source: `voice:${source}`,
        label: `Habilidade de Campeao (${cost})`,
    });

    state.voice.awaitingCardOnlyCost = null;
    state.voice.awaitingCardOnlyUntil = 0;
    state.voice.pendingCost = null;
    state.voice.pendingCardText = '';

    if (result && result.applied) {
        updateVoiceUI('processing', `Habilidade de campeao (${cost}) registrada.`);
        appendVoiceDebug('cmd_ability', { source, cost });
        return true;
    }

    updateVoiceUI('error', `Nao consegui registrar habilidade de custo ${cost}.`);
    return false;
}

function resolveVoiceSlot(letter) {
    const normalized = (letter || '').toString().toUpperCase().trim();
    const handIdx = VOICE_SLOT_HAND_LETTERS.indexOf(normalized);
    if (handIdx !== -1) {
        return {
            letter: normalized,
            scope: 'hand',
            index: handIdx,
            card: state.handCards[handIdx] || null,
        };
    }

    const queueIdx = VOICE_SLOT_QUEUE_LETTERS.indexOf(normalized);
    if (queueIdx !== -1) {
        return {
            letter: normalized,
            scope: 'queue',
            index: queueIdx,
            card: state.queueCards[queueIdx] || null,
        };
    }

    return null;
}

function getVoiceSlotFallbackCost(slotCard, explicitCost = null) {
    if (Number.isFinite(explicitCost) && explicitCost >= 1 && explicitCost <= 10) return explicitCost;
    if (slotCard && Number.isFinite(slotCard.cost) && slotCard.cost >= 1 && slotCard.cost <= 10) return slotCard.cost;
    if (Number.isFinite(state.voice.awaitingCardOnlyCost) && state.voice.awaitingCardOnlyCost >= 1 && state.voice.awaitingCardOnlyCost <= 10) {
        return state.voice.awaitingCardOnlyCost;
    }
    if (Number.isFinite(state.voice.pendingCost) && state.voice.pendingCost >= 1 && state.voice.pendingCost <= 10) {
        return state.voice.pendingCost;
    }
    return null;
}

function shouldDedupeVoiceSlotCommand(commandKey, source, now, windowMs = 1400) {
    const fromPlayKey = state.voice.lastSlotCommandKey === commandKey && (now - state.voice.lastSlotCommandAt) < windowMs;
    const fromRawKey = state.voice.lastSlotRawKey === commandKey && (now - state.voice.lastSlotRawAt) < windowMs;
    if (fromPlayKey || fromRawKey) {
        appendVoiceDebug('cmd_drop', { source, reason: 'slot_dedupe', cmd: commandKey, windowMs });
        return true;
    }

    // Cross-engine safety net: same card/cost fired again soon after a recent accepted play.
    const elapsedSincePlay = now - (state.voice.lastPlayedTime || 0);
    if (elapsedSincePlay >= 0 && elapsedSincePlay < 2200) {
        const recentCardKey = state.voice.lastPlayedCardKey || '';
        const recentCost = state.voice.lastPlayedCost;
        if (recentCardKey && commandKey.includes(`:${recentCardKey}`) && Number.isFinite(recentCost) && commandKey.includes(`:${recentCost}:`)) {
            appendVoiceDebug('cmd_drop', { source, reason: 'slot_recent_play_dup', cmd: commandKey, elapsedSincePlay });
            return true;
        }
    }

    return false;
}

function registerVoiceSlotCommandFeedback(commandKey, source, now, mode = 'play') {
    if (mode === 'raw') {
        state.voice.lastSlotRawKey = commandKey;
        state.voice.lastSlotRawAt = now;
        return;
    }

    state.voice.lastSlotCommandKey = commandKey;
    state.voice.lastSlotCommandAt = now;
    state.voice.lastSlotCommandSource = source || 'unknown';
}

function handleVoiceSlotCommand(slotCommand, meta = {}) {
    const { source = 'unknown' } = meta;
    const now = Date.now();
    const letter = (slotCommand && slotCommand.letter ? slotCommand.letter : '').toUpperCase();
    const explicitCost = (slotCommand && Number.isFinite(slotCommand.cost)) ? slotCommand.cost : null;
    const baseCommandKey = `slot:${letter}:${explicitCost || '-'}`;

    if (!letter) return false;
    if (shouldDedupeVoiceSlotCommand(baseCommandKey, source, now, 1800)) return true;
    registerVoiceSlotCommandFeedback(baseCommandKey, source, now, 'raw');

    const slot = resolveVoiceSlot(letter);
    if (!slot) {
        registerVoiceSlotCommandFeedback(baseCommandKey, source, now);
        appendVoiceDebug('cmd_drop', { source, reason: 'slot_invalid', slot: letter });
        updateVoiceUI('error', `Slot ${letter} invalido. Use letras de A a H.`);
        return true;
    }

    const slotCard = slot.card;
    const hasNamedCard = !!(slotCard && slotCard.name && !/^\d+$/.test(slotCard.name));
    const hasSlotCost = !!(slotCard && Number.isFinite(slotCard.cost) && slotCard.cost >= 1 && slotCard.cost <= 10);
    const letterModeReady = isLetterModeReady();
    const canUsePartialHandSlot = !letterModeReady
        && slot.scope === 'hand'
        && hasNamedCard
        && hasSlotCost;

    if (!letterModeReady && !canUsePartialHandSlot) {
        registerVoiceSlotCommandFeedback(baseCommandKey, source, now);
        appendVoiceDebug('cmd_drop', { source, reason: 'slot_requires_complete_deck', slot: letter });
        updateVoiceUI('error', 'Atalho por letra ainda sem contexto suficiente. Revele mais cartas ou fale custo+carta.');
        return true;
    }

    if (canUsePartialHandSlot) {
        appendVoiceDebug('cmd_slot_partial', {
            source,
            slot: letter,
            card: slotCard.name,
            cost: slotCard.cost,
            reason: 'hand_visible_before_full_deck',
        });
    }

    if (slot.scope === 'queue') {
        const queueCommandKey = `${baseCommandKey}:queue_blocked`;
        if (shouldDedupeVoiceSlotCommand(queueCommandKey, source, now, 900)) return true;
        registerVoiceSlotCommandFeedback(queueCommandKey, source, now);
        appendVoiceDebug('cmd_drop', { source, reason: 'slot_queue_blocked', slot: letter });
        updateVoiceUI('processing', `Slot ${letter} pertence a fila e nao e jogavel agora.`);
        return true;
    }

    if (hasNamedCard) {
        const slotCost = Number.isFinite(slotCard.cost) ? slotCard.cost : explicitCost;
        if (!Number.isFinite(slotCost) || slotCost < 1 || slotCost > 10) {
            registerVoiceSlotCommandFeedback(baseCommandKey, source, now);
            appendVoiceDebug('cmd_drop', { source, reason: 'slot_no_valid_cost', slot: letter, card: slotCard.name });
            updateVoiceUI('error', `Slot ${letter} sem custo valido para jogar.`);
            return true;
        }

        if (Number.isFinite(explicitCost) && explicitCost !== slotCost) {
            appendVoiceDebug('cmd_slot_cost_hint_mismatch', {
                source,
                slot: letter,
                hinted: explicitCost,
                resolved: slotCost,
                card: slotCard.name,
            });
        }

        const resolvedCardKey = normalizeVoiceCardText(slotCard.name || '');
        const playCommandKey = `slotplay:${slotCost}:${resolvedCardKey || '-'}`;
        if (shouldDedupeVoiceSlotCommand(playCommandKey, source, now, 2400)) return true;
        registerVoiceSlotCommandFeedback(playCommandKey, source, now);

        appendVoiceDebug('cmd_slot', {
            source,
            slot: letter,
            scope: slot.scope,
            card: slotCard.name,
            cost: slotCost,
            mode: Number.isFinite(explicitCost) ? 'cost_plus_letter' : 'letter_only',
        });
        handleVoicePlay(slotCost, slotCard.name, { source, isFinal: true, resultIndex: -1 });
        return true;
    }

    const fallbackCost = getVoiceSlotFallbackCost(slotCard, explicitCost);
    if (Number.isFinite(fallbackCost)) {
        appendVoiceDebug('cmd_slot_fallback', {
            source,
            slot: letter,
            cost: fallbackCost,
            reason: explicitCost ? 'explicit_cost' : (slotCard && Number.isFinite(slotCard.cost) ? 'slot_cost' : 'context_cost'),
        });
        updateVoiceUI('processing', `Slot ${letter} sem carta definida. Aplicando inferencia por custo ${fallbackCost}.`);
        handleVoicePlay(fallbackCost, '', { source, isFinal: true, resultIndex: -1 });
        return true;
    }

    registerVoiceSlotCommandFeedback(baseCommandKey, source, now);
    appendVoiceDebug('cmd_drop', { source, reason: 'slot_empty_no_cost', slot: letter });
    updateVoiceUI('error', `Slot ${letter} vazio/incerto. Fale custo + letra (ex.: "4 ${letter}") ou informe a carta.`);
    return true;
}

function handleVoicePlay(cost, cardText, meta = {}) {
    const { source = 'unknown' } = meta;
    const now = Date.now();
    const normalizedCardKey = normalizeVoiceCardText(cardText || '');
    const commandKey = `${cost}:${normalizedCardKey || '-'}`;
    const incomingHasCard = !!normalizedCardKey;
    const lastHasCard = !!state.voice.lastPlayedCardKey;
    const sameCostAsLastPlay = state.voice.lastPlayedCost === cost;
    const elapsedSinceLastPlay = now - (state.voice.lastPlayedTime || 0);
    const sourceChangedSinceLastCommand = !!state.voice.lastCommandSource && source !== state.voice.lastCommandSource;
    const deckReady = syncDeckCompleteFlag();
    appendVoiceDebug('cmd_in', { source, cost, card: normalizedCardKey || '-', cmd: commandKey });

    if (
        state.voice.awaitingCardOnlyCost === cost
        && state.voice.awaitingCardOnlyUntil > now
        && normalizedCardKey
    ) {
        const match = getBestVoiceCardMatch(cardText, cost, { allowInferred: false });
        if (match && match.card) {
            const fix = updateRecentVoicePlayCard(cost, match.card.name, {
                source,
                confidence: match.confidence,
                inferred: !!match.inferred,
                reason: 'awaiting_card',
            });
            if (fix.status !== 'rejected') {
                const resolvedName = fix.cardName || match.card.name;
                state.voice.lastPlayedCardKey = normalizeVoiceCardText(resolvedName);
                state.voice.lastPlayedTime = now;
                if (fix.status === 'updated') {
                    updateVoiceUI('processing', `Carta corrigida para ${resolvedName}.`, resolvedName);
                    appendVoiceDebug('cmd_fix', { source, cost, card: resolvedName, reason: 'awaiting_card' });
                } else {
                    updateVoiceUI('processing', `Carta mantida: ${resolvedName}.`, resolvedName);
                }
                return;
            }
        }
    }

    // Browser + Whisper can emit the same spoken command in two variants:
    // "6 sparky" and then "6" (or the inverse). Never subtract twice for this echo.
    const echoMismatchWindowMs = sourceChangedSinceLastCommand
        ? (cost <= 2 ? 450 : (cost <= 4 ? 800 : 1200))
        : (cost <= 2 ? 120 : 200);
    if (
        sameCostAsLastPlay
        && (incomingHasCard !== lastHasCard)
        && elapsedSinceLastPlay < echoMismatchWindowMs
    ) {
        if (incomingHasCard && !lastHasCard) {
            const match = getBestVoiceCardMatch(cardText, cost, { allowInferred: false });
            if (match && match.card) {
                const fix = updateRecentVoicePlayCard(cost, match.card.name, {
                    source,
                    confidence: match.confidence,
                    inferred: !!match.inferred,
                    reason: 'echo_merge',
                });
                if (fix.status !== 'rejected') {
                    const resolvedName = fix.cardName || match.card.name;
                    state.voice.lastPlayedCardKey = normalizeVoiceCardText(resolvedName);
                    state.voice.lastPlayedTime = now;
                    if (fix.status === 'updated') {
                        updateVoiceUI('processing', `Carta corrigida para ${resolvedName}.`, resolvedName);
                        appendVoiceDebug('cmd_fix', { source, cost, card: resolvedName, reason: 'echo_merge' });
                    } else {
                        updateVoiceUI('processing', `Carta mantida: ${resolvedName}.`, resolvedName);
                    }
                }
            }
        }
        console.log(`Ignorando eco de voz com custo ${cost} (${source}).`);
        appendVoiceDebug('cmd_drop', { source, cost, reason: 'echo_variant', elapsedMs: elapsedSinceLastPlay });
        return;
    }

    const commandDedupeMs = sourceChangedSinceLastCommand
        ? (normalizedCardKey ? 1500 : 250)
        : (normalizedCardKey ? 1200 : 130);
    if (state.voice.lastCommandKey === commandKey && (now - state.voice.lastCommandAt) < commandDedupeMs) {
        console.log('Ignorando comando de voz duplicado: ' + commandKey);
        appendVoiceDebug('cmd_drop', { source, cost, reason: 'dedupe', windowMs: commandDedupeMs });
        return;
    }

    state.voice.lastCommandKey = commandKey;
    state.voice.lastCommandAt = now;
    state.voice.lastCommandSource = source || 'unknown';
    state.voice.lastPlayedCost = cost;
    state.voice.lastPlayedTime = now;
    state.voice.lastPlayedCardKey = normalizedCardKey;

    if (!state.running) {
        startMatch({ preserveVoiceDedupe: true });
        applyAutoStartCalibration(cost);
        updateVoiceUI('processing', 'Partida iniciada por voz.');
        appendVoiceDebug('cmd_auto_start', { source, cost });
    }

    // ─── CYCLE-AWARE DUPLICATE PROTECTION ───
    // In Clash Royale, a played card cannot reappear for 4 more card plays.
    // If the user says a named card that was played recently (within last 4 plays),
    // reject it as a voice recognition error. Cost-only commands are exempt.
    if (normalizedCardKey) {
        const hasConfirmedCard = (state.opponentDeck || []).some(card =>
            card && card.confirmed && normalizeVoiceCardText(card.name) === normalizedCardKey
        );
        const shouldEnforceCycleDup = deckReady || hasConfirmedCard;
        if (!shouldEnforceCycleDup) {
            appendVoiceDebug('cmd_cycle_guard_skip', { source, cost, card: normalizedCardKey, reason: 'deck_not_stable' });
        }

        if (shouldEnforceCycleDup) {
            const recentPlays = state.cardCycle.slice(-4);
            const cardAlreadyInCycle = recentPlays.some(p => {
                const pKey = normalizeVoiceCardText(p.name || '');
                return pKey && pKey === normalizedCardKey && !/^\d+$/.test(p.name);
            });
            if (cardAlreadyInCycle) {
                console.log(`Bloqueado: carta "${normalizedCardKey}" ainda está no ciclo (últimas 4 jogadas).`);
                appendVoiceDebug('cmd_drop', { source, cost, card: normalizedCardKey, reason: 'cycle_dup' });
                updateVoiceUI('processing', `Carta "${cardText}" bloqueada: ainda no ciclo.`);
                return;
            }
        }
    }

    appendVoiceDebug('cmd_ok', { source, cost, card: normalizedCardKey || '-' });

    if (deckReady) {
        let preferredName = null;
        let manualReviewRequested = false;
        if (cardText) {
            const match = getBestVoiceCardMatch(cardText, cost, { allowInferred: true });
            if (match && match.card) {
                preferredName = match.card.name;
                if (match.inferred && match.confidence < 0.74) {
                    manualReviewRequested = true;
                }
            } else {
                manualReviewRequested = true;
            }
        }
        const result = subtractElixir(cost, preferredName, {
            source: `voice:${source}`,
            commandKey,
            forceManualIdentify: manualReviewRequested,
        });
        if (!result || !result.applied) {
            updateVoiceUI('error', `Nao consegui registrar custo ${cost}.`);
            return;
        }
        const resolvedName = (result && result.resolvedName) || preferredName;
        if (result && result.ambiguous) {
            state.voice.awaitingCardOnlyCost = cost;
            state.voice.awaitingCardOnlyUntil = now + 4500;
            const optionsText = (result.candidates || []).slice(0, 3).join(', ');
            if (manualReviewRequested) {
                updateVoiceUI('processing', `Elixir ${cost} registrado. Nao confirmei o nome "${cardText}": selecione a carta manualmente.`);
            } else {
                updateVoiceUI('processing', `Elixir ${cost} registrado. Custo ambiguo${optionsText ? ` (${optionsText})` : ''}: fale o nome da carta.`);
            }
            beginIdentification(cost);
            return;
        }
        state.voice.awaitingCardOnlyCost = null;
        state.voice.awaitingCardOnlyUntil = 0;
        updateVoiceUI('processing', `Elixir ${cost} registrado${resolvedName ? ` com ${resolvedName}` : ''}.`);
        return;
    }

    state.voice.pendingCost = cost;
    state.voice.pendingCardText = cardText || '';
    subtractElixir(cost, null, { source: `voice:${source}`, commandKey });

    if (cardText) {
        state.voice.awaitingCardOnlyCost = null;
        state.voice.awaitingCardOnlyUntil = 0;
        tryApplyVoicePendingCard();
    } else {
        state.voice.awaitingCardOnlyCost = cost;
        state.voice.awaitingCardOnlyUntil = now + 7000;
        updateVoiceUI('processing', `Elixir ${cost} registrado. Fale o nome da carta ou selecione manualmente.`);
        if (!state.identifying) beginIdentification(cost);
    }
}

function updateVoiceLagFromEvent(voiceEvent) {
    if (!voiceEvent) return;
    const receivedAt = Number.isFinite(voiceEvent.receivedAt) ? voiceEvent.receivedAt : Date.now();
    const speechStartedAt = Number.isFinite(voiceEvent.speechStartedAt) ? voiceEvent.speechStartedAt : 0;
    state.voice.lastSpeechStartedAt = speechStartedAt || state.voice.lastSpeechStartedAt || 0;
    if (speechStartedAt > 0) {
        state.voice.lastRecognitionLagMs = Math.max(0, Math.min(3000, receivedAt - speechStartedAt));
        return;
    }
    if (voiceEvent.engine === 'browser') {
        state.voice.lastRecognitionLagMs = 0;
    }
}

function appendVoiceInputDebug(voiceEvent, command) {
    if (!voiceEvent || voiceEvent.phase === 'start') return;
    const debugCost = command && Number.isFinite(command.cost) ? command.cost : '-';
    const debugCard = command && command.commandClass === 'slot'
        ? `slot_${command.slotLetter || '-'}`
        : ((command && command.cardText) ? normalizeVoiceCardText(command.cardText) : '-');
    appendVoiceDebug('asr_in', {
        source: voiceEvent.engine || 'unknown',
        final: voiceEvent.phase === 'final' ? 1 : 0,
        utteranceId: voiceEvent.utteranceId || '-',
        groupId: voiceEvent.groupId || '-',
        idx: Number.isFinite(voiceEvent.resultIndex) ? voiceEvent.resultIndex : '-',
        cost: debugCost,
        card: debugCard || '-',
        class: command ? command.commandClass : 'unknown',
        text: voiceEvent.transcript || '-',
    });
}

function applyParsedVoiceCommand(parsed, meta = {}) {
    const {
        source = 'unknown',
        isFinal = true,
        resultIndex = -1,
    } = meta;
    const now = Date.now();

    if (!parsed) return;
    if (parsed.isLegacyAbilityCommand) {
        appendVoiceDebug('cmd_drop', { source, reason: 'ability_legacy_zero', text: parsed.normalized || '-' });
        updateVoiceUI('error', 'Comando de habilidade atualizado: use "K + custo" (ex.: "K 1").');
        return;
    }

    const hadSpokenCostToken = typeof parsed.cost === 'number' && parsed.cost >= 1 && parsed.cost <= 10;
    const mirrorExplicitSpoken = hasMirrorMarker(parsed.cardText || '');
    if (mirrorExplicitSpoken) {
        parsed.cardText = stripMirrorMarker(parsed.cardText || '');
    }

    if (state.identifying && parsed.cost && parsed.cardText && parsed.cost === state.identifyCost) {
        state.voice.pendingCost = state.identifyCost;
        state.voice.pendingCardText = parsed.cardText;
        tryApplyVoicePendingCard();
        return;
    }

    if (state.identifying && !parsed.cost && parsed.cardText) {
        state.voice.pendingCost = state.identifyCost;
        state.voice.pendingCardText = parsed.cardText;
        tryApplyVoicePendingCard();
        return;
    }

    if (!parsed.cost && !state.identifying) {
        if (mirrorExplicitSpoken && !parsed.cardText) {
            const lastBase = getLastMirrorableCardName();
            if (lastBase) parsed.cardText = lastBase;
        }

        if (
            state.voice.awaitingCardOnlyCost
            && state.voice.awaitingCardOnlyUntil > now
            && parsed.cardText
        ) {
            const match = getBestVoiceCardMatch(parsed.cardText, state.voice.awaitingCardOnlyCost, { allowInferred: false });
            if (match && match.card) {
                const fix = updateRecentVoicePlayCard(state.voice.awaitingCardOnlyCost, match.card.name, {
                    source,
                    confidence: match.confidence,
                    inferred: !!match.inferred,
                    reason: 'awaiting_name_only',
                });
                if (fix.status !== 'rejected') {
                    const resolvedName = fix.cardName || match.card.name;
                    state.voice.lastPlayedCardKey = normalizeVoiceCardText(resolvedName);
                    state.voice.lastPlayedTime = now;
                    if (fix.status === 'updated') {
                        updateVoiceUI('processing', `Carta corrigida para ${resolvedName}.`, resolvedName);
                    } else {
                        updateVoiceUI('processing', `Carta mantida: ${resolvedName}.`, resolvedName);
                    }
                    return;
                }
            }
        }

        if (!mirrorExplicitSpoken) {
            const normalizedNameOnly = normalizeVoiceCardText(parsed.cardText || '');
            if (normalizedNameOnly) {
                const notMirror = (card) => normalizeCardName(card && card.name) !== normalizeCardName('Espelho');
                const nameMatches = (card) => normalizeVoiceCardText(card && card.name) === normalizedNameOnly;

                const deckPool = (state.opponentDeck || [])
                    .filter(card => card && card.name && !/^\d+$/.test(card.name) && notMirror(card))
                    .sort((a, b) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0));
                const exactDeck = deckPool.find(nameMatches) || null;

                if (exactDeck) {
                    parsed.cost = exactDeck.cost;
                    parsed.cardText = exactDeck.name;
                    appendVoiceDebug('cmd_fix', {
                        source,
                        cost: parsed.cost,
                        card: parsed.cardText,
                        reason: 'name_only_exact_deck',
                    });
                } else if (typeof ALL_CARDS !== 'undefined' && ALL_CARDS.length > 0) {
                    const exactGlobal = ALL_CARDS.find(card => notMirror(card) && nameMatches(card)) || null;
                    if (exactGlobal) {
                        parsed.cost = exactGlobal.cost;
                        parsed.cardText = exactGlobal.name;
                        appendVoiceDebug('cmd_fix', {
                            source,
                            cost: parsed.cost,
                            card: parsed.cardText,
                            reason: 'name_only_exact_global',
                        });
                    }
                }
            }

            if (!parsed.cost && VOICE_ALLOW_GLOBAL_CARD_ONLY_INFERENCE) {
                const globalMatch = getBestGlobalVoiceCardMatch(parsed.cardText || '', { allowInferred: true });
                if (globalMatch && globalMatch.card) {
                    parsed.cost = globalMatch.card.cost;
                    parsed.cardText = globalMatch.card.name;
                    appendVoiceDebug('cmd_fix', {
                        source,
                        cost: parsed.cost,
                        card: parsed.cardText,
                        reason: 'name_only_fuzzy_global',
                        conf: globalMatch.confidence.toFixed(2),
                    });
                }
            }

            if (!parsed.cost && VOICE_REQUIRE_COST_FOR_NEW_PLAY) {
                appendVoiceDebug('cmd_drop', {
                    source,
                    reason: 'missing_cost',
                    card: normalizeVoiceCardText(parsed.cardText || '') || '-',
                });
                updateVoiceUI('error', 'Fale custo + carta. Ex.: "4 valquiria".');
                return;
            }

            if (!parsed.cost) {
                updateVoiceUI('error', 'Nao reconheci o nome da carta. Repita o nome ou fale custo + carta.');
                return;
            }
        }
    }

    if (!state.identifying && mirrorExplicitSpoken) {
        const mirrorApplied = handleMirrorPlayByVoice(parsed.cardText, hadSpokenCostToken ? parsed.cost : null, {
            source,
            explicit: true,
        });
        if (mirrorApplied) return;
        return;
    }

    handleVoicePlay(parsed.cost, parsed.cardText, { source, isFinal, resultIndex });
}

function applyResolvedVoiceCommand(command, meta = {}) {
    if (!command) return;
    const { source = 'unknown' } = meta;

    if (command.kind === 'slot') {
        handleVoiceSlotCommand({
            letter: command.slotLetter,
            cost: command.cost,
            normalized: command.normalizedText || '',
        }, meta);
        return;
    }

    if (command.kind === 'legacy_ability') {
        appendVoiceDebug('cmd_drop', {
            source,
            reason: 'ability_legacy_zero',
            text: command.normalizedText || '-',
        });
        updateVoiceUI('error', 'Comando de habilidade atualizado: use "K + custo" (ex.: "K 1").');
        return;
    }

    if (command.kind === 'ability') {
        handleVoiceAbilityCost(command.cost, meta);
        return;
    }

    const parsed = command.parsed
        ? {
            ...command.parsed,
            cost: Number.isFinite(command.cost) ? command.cost : command.parsed.cost,
            cardText: typeof command.cardText === 'string' ? command.cardText : command.parsed.cardText,
        }
        : {
            normalized: command.normalizedText || '',
            cost: Number.isFinite(command.cost) ? command.cost : null,
            cardText: command.cardText || '',
            isAbility: false,
            isLegacyAbilityCommand: false,
    };
    applyParsedVoiceCommand(parsed, meta);
}

function applyVoiceActionEnvelope(event, action) {
    if (!event || !action || !action.command) return;

    if (shouldSuppressWhisperAuthoritativeEcho(action.command, event.engine || 'unknown')) {
        appendVoiceDebug('asr_drop', {
            source: event.engine || 'unknown',
            utteranceId: event.utteranceId || '-',
            groupId: event.groupId || action.groupId || '-',
            reason: 'browser_authoritative',
            key: action.command.normalizedKey || '-',
        });
        return;
    }

    if (action.reason === 'quorum') {
        appendVoiceDebug('ensemble_quorum', {
            source: event.engine || 'unknown',
            groupId: action.groupId || event.groupId || '-',
            key: action.command.normalizedKey || '-',
            engines: (action.supportEngines || []).join('+') || '-',
        });
    } else if (action.reason === 'browser_authority' || action.reason === 'browser_instant') {
        appendVoiceDebug('ensemble_fastlane', {
            source: event.engine || 'unknown',
            groupId: action.groupId || event.groupId || '-',
            key: action.command.normalizedKey || '-',
            holdMs: action.reason === 'browser_instant' ? 0 : voiceCoordinator.getBrowserAuthorityDelay(action.command),
        });
    }

    appendVoiceDebug('command_applied', {
        source: event.engine || 'unknown',
        utteranceId: event.utteranceId || '-',
        groupId: action.groupId || event.groupId || '-',
        reason: action.reason,
        support: (action.supportEngines || []).join('+') || '-',
        class: action.command.commandClass || 'unknown',
        key: action.command.normalizedKey || '-',
    });
    applyResolvedVoiceCommand(action.command, {
        source: event.engine || 'unknown',
        isFinal: event.phase === 'final',
        resultIndex: Number.isFinite(event.resultIndex) ? event.resultIndex : -1,
        utteranceId: event.utteranceId || '',
        sourceEventId: event.id,
        groupId: action.groupId || event.groupId || '',
    });
    rememberResolvedVoiceAction(action.command, event.engine || 'unknown');
}

function handleDeferredVoiceAction(payload) {
    if (!payload || !payload.event || !payload.action) return;
    applyVoiceActionEnvelope(payload.event, payload.action);
}

function dispatchVoiceEvent(voiceEvent) {
    const result = voiceCoordinator.ingest(voiceEvent);
    if (!result || !result.event) return;

    const { event, command, actions, reason } = result;
    updateVoiceLagFromEvent(event);
    appendVoiceInputDebug(event, command);

    state.voice.lastAcceptedText = command ? (command.normalizedText || command.normalizedKey) : (event.transcript || '');
    state.voice.lastAcceptedCost = command && Number.isFinite(command.cost) ? command.cost : null;
    state.voice.lastAcceptedAt = event.receivedAt;
    state.voice.lastAcceptedIsFinal = event.phase === 'final';
    state.voice.lastAcceptedSource = event.engine || 'unknown';
    if (Number.isFinite(event.resultIndex) && event.resultIndex !== -1) {
        state.voice.lastResultIndex = event.resultIndex;
    }

    if (reason === 'awaiting_stability' && command) {
        appendVoiceDebug('asr_hold', {
            source: event.engine || 'unknown',
            utteranceId: event.utteranceId || '-',
            groupId: event.groupId || '-',
            class: command.commandClass || 'unknown',
            key: command.normalizedKey || '-',
        });
    }

    if (reason === 'awaiting_quorum' && command) {
        appendVoiceDebug('ensemble_wait', {
            source: event.engine || 'unknown',
            utteranceId: event.utteranceId || '-',
            groupId: event.groupId || '-',
            class: command.commandClass || 'unknown',
            key: command.normalizedKey || '-',
        });
    }

    if (reason === 'conflict' && command) {
        appendVoiceDebug('ensemble_conflict', {
            source: event.engine || 'unknown',
            utteranceId: event.utteranceId || '-',
            groupId: event.groupId || '-',
            class: command.commandClass || 'unknown',
            key: command.normalizedKey || '-',
        });
    }

    if (reason === 'unknown_command' && event.phase === 'final') {
        appendVoiceDebug('asr_drop', {
            source: event.engine || 'unknown',
            utteranceId: event.utteranceId || '-',
            groupId: event.groupId || '-',
            reason,
            text: event.transcript || '-',
        });
    }

    actions.forEach(action => {
        applyVoiceActionEnvelope(event, action);
    });

    if (event.phase === 'final') {
        voiceCoordinator.endUtterance(event.engine, event.utteranceId);
    }
}

function processVoiceTranscript(transcript, resultIndex = -1, options = {}) {
    const {
        isFinal = true,
        source = 'unknown',
        confidence = null,
        utteranceId = '',
        speechStartedAt = 0,
        platform = state.voice.platform || getVoicePlatform(),
    } = options;
    const phase = isFinal ? 'final' : 'partial';

    dispatchVoiceEvent({
        engine: source,
        source,
        platform,
        utteranceId,
        phase,
        transcript,
        confidence,
        receivedAt: Date.now(),
        speechStartedAt: speechStartedAt || state.voice.lastSpeechStartedAt || state.voice.lastAudioDetectedAt || Date.now(),
        resultIndex,
    });
}
let mediaRecorder;
let voiceSocket;
let whisperPendingMessages = [];
let whisperActiveUtterance = null;
let whisperSendChain = Promise.resolve();
let whisperPreRollChunks = [];
let lastWhisperChunkUiUpdateAt = 0;
let audioContext;
let analyser;
let microphone;
let processedMicDestination;
let voiceHighpassFilter;
let voiceLowpassFilter;
let voiceCompressor;
let voiceGainNode;
let silenceTimer;
let isRecordingWord = false;
let vadFrameId;
const VOICE_SILENCE_MS = 110;
const VOICE_RMS_THRESHOLD = 0.00105;
const WHISPER_FALLBACK_MS = 700;
const WHISPER_PENDING_LIMIT = 8;
let whisperFallbackTimer;
let nativeVoiceListenerHandle = null;
const browserSpeechSession = {
    activeUtteranceId: '',
    speechStartedAt: 0,
};

function getBrowserSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getSupportedRecorderMimeType() {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
    ];

    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return '';
    }

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function refreshVoiceEngineState() {
    if (state.voice.nativeActive) {
        state.voice.engine = 'native';
    } else {
        const desktopEngines = [];
        if (state.voice.browserActive) desktopEngines.push('browser');
        if (state.voice.whisperActive) desktopEngines.push('whisper');
        if (state.voice.whisperAltActive) desktopEngines.push('whisper_alt');
        state.voice.engine = desktopEngines.length ? desktopEngines.join('+') : 'idle';
    }
    state.voice.listening = state.voice.browserActive
        || state.voice.whisperActive
        || state.voice.whisperAltActive
        || state.voice.nativeActive;
}

function getVoiceLaunchHint() {
    if (window.location && window.location.origin && /^https?:/i.test(window.location.origin)) {
        return window.location.origin;
    }
    return 'http://localhost:8080';
}

function queuePendingWhisperMessage(message) {
    whisperPendingMessages.push(message);
    if (whisperPendingMessages.length > WHISPER_PENDING_LIMIT) {
        whisperPendingMessages.shift();
    }
}

function sendWhisperSocketMessage(message) {
    if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
        if (message && message.type === 'audio_chunk') {
            state.voice.chunksSent += 1;
        }
        voiceSocket.send(JSON.stringify(message));
        return true;
    }

    queuePendingWhisperMessage(message);
    return false;
}

function flushPendingWhisperMessages() {
    if (!voiceSocket || voiceSocket.readyState !== WebSocket.OPEN) return;
    if (!whisperPendingMessages.length) return;

    const queued = whisperPendingMessages.splice(0, whisperPendingMessages.length);
    queued.forEach(message => {
        if (!voiceSocket || voiceSocket.readyState !== WebSocket.OPEN) {
            queuePendingWhisperMessage(message);
            return;
        }
        if (message && message.type === 'audio_chunk') {
            state.voice.chunksSent += 1;
        }
        voiceSocket.send(JSON.stringify(message));
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler blob de audio.'));
        reader.onloadend = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64 || '');
        };
        reader.readAsDataURL(blob);
    });
}

function closeWhisperSocket() {
    if (!voiceSocket) return;
    const socket = voiceSocket;
    voiceSocket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    } catch (err) {
        console.warn('Nao foi possivel fechar o socket do Whisper.', err);
    }
}

async function ensureNativeVoiceListener() {
    const plugin = getVoiceBridgePlugin();
    if (!plugin || typeof plugin.addListener !== 'function') return false;
    if (nativeVoiceListenerHandle) return true;

    nativeVoiceListenerHandle = await plugin.addListener('voiceEvent', (event) => {
        if (!event) return;

        const phase = event.phase === 'start'
            ? 'start'
            : (event.phase === 'final' ? 'final' : 'partial');
        const speechStartedAt = Number.isFinite(event.speechStartedAt) ? event.speechStartedAt : Date.now();
        state.voice.lastSpeechStartedAt = speechStartedAt;

        if (phase === 'start') {
            dispatchVoiceEvent({
                engine: 'native',
                platform: 'android',
                utteranceId: event.utteranceId || '',
                phase: 'start',
                transcript: '',
                receivedAt: Number.isFinite(event.receivedAt) ? event.receivedAt : Date.now(),
                speechStartedAt,
            });
            updateVoiceUI('listening', 'Motor nativo ativo. Escutando voce...');
            return;
        }

        const transcript = typeof event.transcript === 'string' ? event.transcript.trim() : '';
        if (!transcript) return;
        state.voice.transcriptsReceived += 1;
        updateVoiceUI(phase === 'final' ? 'processing' : 'listening', phase === 'final' ? 'Motor nativo reconheceu.' : 'Motor nativo ouvindo...', transcript);
        processVoiceTranscript(transcript, -1, {
            isFinal: phase === 'final',
            source: 'native',
            utteranceId: event.utteranceId || '',
            speechStartedAt,
            platform: 'android',
            confidence: Number.isFinite(event.confidence) ? event.confidence : null,
        });
        if (phase === 'final' && state.voice.listening && !state.voice.manuallyStopped) {
            setTimeout(() => updateVoiceUI('listening', 'Motor nativo ativo. Escutando voce...'), 320);
        }
    });
    return true;
}

async function startNativeVoiceRecognition() {
    const plugin = getVoiceBridgePlugin();
    if (!plugin || typeof plugin.start !== 'function') {
        updateVoiceUI('error', 'Plugin nativo de voz indisponivel neste Android.');
        return false;
    }

    await ensureNativeVoiceListener();
    try {
        await plugin.start();
        state.voice.nativeActive = true;
        state.voice.nativeAvailable = true;
        state.voice.socketState = 'native_only';
        refreshVoiceEngineState();
        updateVoiceUI('listening', 'Motor nativo ativo. Escutando voce...');
        appendVoiceDebug('voice_native', { state: 'start' });
        return true;
    } catch (err) {
        console.error('Falha ao iniciar VoiceBridge.', err);
        state.voice.nativeActive = false;
        refreshVoiceEngineState();
        updateVoiceUI('error', 'Nao consegui iniciar a voz nativa neste Android.');
        appendVoiceDebug('voice_native', { state: 'start_error', message: err && err.message ? err.message : String(err) });
        return false;
    }
}

async function stopNativeVoiceRecognition() {
    const plugin = getVoiceBridgePlugin();
    if (plugin && typeof plugin.stop === 'function') {
        try {
            await plugin.stop();
        } catch (err) {
            console.warn('Falha ao parar VoiceBridge.', err);
        }
    }
    state.voice.nativeActive = false;
    if (state.voice.platform === 'android') {
        state.voice.socketState = 'native_only';
    }
    refreshVoiceEngineState();
    appendVoiceDebug('voice_native', { state: 'stop' });
}

function initVoiceRecognition() {
    state.voice.platform = getVoicePlatform();
    if (isAndroidNativePlatform()) {
        state.voice.nativeAvailable = !!getVoiceBridgePlugin();
        state.voice.browserSupported = false;
        state.voice.whisperAvailable = false;
        state.voice.whisperAltAvailable = false;
        state.voice.whisperAltActive = false;
        state.voice.socketState = 'native_only';
        state.voice.supported = state.voice.nativeAvailable;
        if (!state.voice.supported) {
            if (els.btnVoice) els.btnVoice.disabled = true;
            updateVoiceUI('error', 'Plugin nativo de voz indisponivel neste Android.');
            appendVoiceDebug('voice_init', { supported: 0, platform: 'android', native: 0 });
            return;
        }

        refreshVoiceEngineState();
        updateVoiceUI('idle', 'Voz nativa pronta. Clique em VOZ.');
        appendVoiceDebug('voice_init', { supported: 1, platform: 'android', native: 1 });
        return;
    }

    const hasBrowserSpeech = !!getBrowserSpeechRecognitionCtor();
    const hasMicCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const isFileProtocol = window.location.protocol === 'file:';
    const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    state.voice.browserSupported = !isFileProtocol && isSecure && hasBrowserSpeech;
    state.voice.whisperAvailable = false;
    state.voice.whisperActive = false;
    state.voice.whisperAltAvailable = false;
    state.voice.whisperAltActive = false;
    state.voice.socketState = VOICE_CHROME_ONLY_MODE ? 'browser_only' : 'offline';
    state.voice.supported = VOICE_CHROME_ONLY_MODE
        ? state.voice.browserSupported
        : (!isFileProtocol && isSecure && (state.voice.browserSupported || hasMicCapture));
    if (!state.voice.supported) {
        if (els.btnVoice) els.btnVoice.disabled = true;
        if (isFileProtocol || !isSecure) {
            updateVoiceUI('error', `Abra em ${getVoiceLaunchHint()} para liberar o microfone.`);
        } else if (VOICE_CHROME_ONLY_MODE) {
            updateVoiceUI('error', 'Modo Chrome-only: use Google Chrome com reconhecimento de voz ativo.');
        } else {
            updateVoiceUI('error', 'Este navegador nao suporta microfone nem reconhecimento de voz.');
        }
        appendVoiceDebug('voice_init', { supported: 0, secure: isSecure ? 1 : 0, file: isFileProtocol ? 1 : 0 });
        return;
    }

    refreshVoiceEngineState();
    if (VOICE_CHROME_ONLY_MODE) {
        updateVoiceUI('idle', 'Voz do Chrome pronta. Clique em VOZ.');
    } else if (state.voice.browserSupported && hasMicCapture) {
        updateVoiceUI('idle', 'Voz multi-engine pronta. Clique em VOZ.');
    } else if (state.voice.browserSupported) {
        updateVoiceUI('idle', 'Reconhecimento do navegador pronto. Clique em VOZ.');
    } else {
        updateVoiceUI('idle', 'Microfone pronto. Use VOZ com Whisper local.');
    }
    appendVoiceDebug('voice_init', {
        supported: 1,
        platform: state.voice.platform,
        browser: state.voice.browserSupported ? 1 : 0,
        mic: hasMicCapture ? 1 : 0,
        chromeOnly: VOICE_CHROME_ONLY_MODE ? 1 : 0,
    });

    // Warm-up do socket local para reduzir latencia no primeiro clique de VOZ.
    if (!VOICE_CHROME_ONLY_MODE) {
        connectWhisperSocket({ quiet: true }).catch(() => {});
    }
}

async function connectWhisperSocket(options = {}) {
    const { quiet = false, timeoutMs = 1800 } = options;
    if (VOICE_CHROME_ONLY_MODE) {
        state.voice.whisperAvailable = false;
        state.voice.whisperAltAvailable = false;
        state.voice.whisperActive = false;
        state.voice.whisperAltActive = false;
        state.voice.socketState = 'browser_only';
        return false;
    }
    if (state.voice.platform === 'android') return false;

    if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
        state.voice.socketState = 'online';
        state.voice.whisperAvailable = true;
        flushPendingWhisperMessages();
        return true;
    }

    if (voiceSocket && voiceSocket.readyState === WebSocket.CONNECTING) {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            const poll = setInterval(() => {
                if (!voiceSocket) {
                    clearInterval(poll);
                    resolve(false);
                    return;
                }
                if (voiceSocket.readyState === WebSocket.OPEN) {
                    clearInterval(poll);
                    state.voice.socketState = 'online';
                    state.voice.whisperAvailable = true;
                    flushPendingWhisperMessages();
                    resolve(true);
                    return;
                }
                if (voiceSocket.readyState === WebSocket.CLOSING || voiceSocket.readyState === WebSocket.CLOSED) {
                    clearInterval(poll);
                    resolve(false);
                    return;
                }
                if (Date.now() - startedAt > timeoutMs) {
                    clearInterval(poll);
                    resolve(false);
                }
            }, 50);
        });
    }

    return new Promise((resolve) => {
        let settled = false;
        let timeoutId = null;
        const settle = (value) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve(value);
        };

        state.voice.socketState = 'connecting';
        state.voice.whisperAvailable = false;
        state.voice.whisperAltAvailable = false;
        if (!quiet) updateVoiceUI('processing', 'Conectando ao Whisper local...');

        const socket = new WebSocket('ws://localhost:8765');
        voiceSocket = socket;
        timeoutId = setTimeout(() => {
            state.voice.socketState = 'timeout';
            state.voice.whisperAvailable = false;
            state.voice.whisperAltAvailable = false;
            if (voiceSocket === socket) closeWhisperSocket();
            if (!quiet && !state.voice.browserActive) {
                updateVoiceUI('error', 'Whisper local nao respondeu. Rode ./start_whisper.sh.');
            }
            settle(false);
        }, timeoutMs);

        socket.onopen = () => {
            state.voice.socketState = 'online';
            state.voice.whisperAvailable = true;
            console.log('🔗 Conectado ao Servidor Whisper Local');
            flushPendingWhisperMessages();
            if (!quiet && !state.voice.listening) {
                updateVoiceUI('idle', 'Whisper local pronto. Clique em VOZ.');
            }
            appendVoiceDebug('whisper_socket', { state: 'open' });
            settle(true);
        };

        socket.onmessage = (event) => {
            let payload = null;
            if (typeof event.data === 'string') {
                try {
                    payload = JSON.parse(event.data);
                } catch (_) {
                    payload = {
                        type: 'voice_event',
                        engine: 'whisper',
                        platform: 'desktop',
                        utteranceId: '',
                        phase: 'final',
                        transcript: event.data,
                        receivedAt: Date.now(),
                    };
                }
            }

            if (!payload) return;
            if (payload.type === 'server_ready') {
                const engines = Array.isArray(payload.engines) ? payload.engines : [];
                const engineNames = engines
                    .map(engine => engine && engine.engine ? engine.engine : '')
                    .filter(Boolean);
                state.voice.whisperAvailable = engineNames.includes('whisper') || !engineNames.length;
                state.voice.whisperAltAvailable = engineNames.includes('whisper_alt');
                if (state.voice.whisperActive) {
                    state.voice.whisperAltActive = state.voice.whisperAltAvailable;
                }
                refreshVoiceEngineState();
                appendVoiceDebug('whisper_ready', {
                    protocol: payload.protocol || '-',
                    engines: engineNames.join('+') || 'whisper',
                });
                return;
            }

            if (payload.type !== 'voice_event') return;
            if (payload.phase === 'start') {
                dispatchVoiceEvent({
                    engine: payload.engine || 'whisper',
                    platform: payload.platform || 'desktop',
                    utteranceId: payload.utteranceId || '',
                    phase: 'start',
                    transcript: '',
                    receivedAt: Number.isFinite(payload.receivedAt) ? payload.receivedAt : Date.now(),
                    speechStartedAt: Number.isFinite(payload.speechStartedAt) ? payload.speechStartedAt : Date.now(),
                });
                return;
            }

            const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';
            if (transcript) {
                const voiceEngine = payload.engine || 'whisper';
                if (voiceEngine === 'whisper_alt') {
                    state.voice.whisperAltAvailable = true;
                    if (state.voice.whisperActive) state.voice.whisperAltActive = true;
                }
                state.voice.transcriptsReceived += 1;
                updateVoiceUI(
                    payload.phase === 'final' ? 'processing' : 'listening',
                    payload.phase === 'final'
                        ? (voiceEngine === 'whisper_alt' ? 'Lendo IA alternativa...' : 'Lendo IA...')
                        : (voiceEngine === 'whisper_alt' ? 'Whisper alternativo parcial...' : 'Whisper parcial...'),
                    transcript
                );
                processVoiceTranscript(transcript, -1, {
                    isFinal: payload.phase === 'final',
                    source: voiceEngine,
                    utteranceId: payload.utteranceId || '',
                    speechStartedAt: Number.isFinite(payload.speechStartedAt) ? payload.speechStartedAt : (state.voice.lastSpeechStartedAt || Date.now()),
                    platform: payload.platform || 'desktop',
                    confidence: Number.isFinite(payload.confidence) ? payload.confidence : null,
                });

                if (payload.phase === 'final' && state.voice.listening && !state.voice.manuallyStopped) {
                    setTimeout(() => updateVoiceUI('listening', 'Escutando voce...'), 420);
                }
            }
        };

        socket.onerror = () => {
            state.voice.socketState = 'error';
            state.voice.whisperAvailable = false;
            state.voice.whisperAltAvailable = false;
            if (voiceSocket === socket) closeWhisperSocket();
            if (!quiet && !state.voice.browserActive) {
                updateVoiceUI('error', 'Sem conexao com o Whisper local. Rode ./start_whisper.sh.');
            }
            appendVoiceDebug('whisper_socket', { state: 'error' });
            settle(false);
        };

        socket.onclose = () => {
            const whisperWasActive = state.voice.whisperActive;
            state.voice.whisperAvailable = false;
            state.voice.whisperAltAvailable = false;
            state.voice.whisperActive = false;
            state.voice.whisperAltActive = false;
            if (voiceSocket === socket) voiceSocket = null;
            if (state.voice.socketState !== 'error' && state.voice.socketState !== 'timeout') {
                state.voice.socketState = 'offline';
            }
            refreshVoiceEngineState();
            if (whisperWasActive && !state.voice.browserActive && !state.voice.manuallyStopped) {
                updateVoiceUI('error', 'Whisper desconectou durante a captura.');
            }
            appendVoiceDebug('whisper_socket', { state: 'closed' });
            console.log('Servidor Whisper desconectado.');
        };
    });
}

function stopAllAudio() {
    clearTimeout(whisperFallbackTimer);
    cancelAnimationFrame(vadFrameId);
    if (whisperActiveUtterance) {
        const finishedUtterance = whisperActiveUtterance;
        whisperActiveUtterance = null;
        whisperSendChain = whisperSendChain
            .catch(() => {})
            .then(() => {
                sendWhisperSocketMessage({
                    type: 'end_utterance',
                    utteranceId: finishedUtterance.id,
                    seq: finishedUtterance.seq,
                    speechStartedAt: finishedUtterance.speechStartedAt,
                    platform: finishedUtterance.platform,
                    receivedAt: Date.now(),
                });
            });
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
        } catch (err) {
            console.warn('Nao foi possivel parar o MediaRecorder.', err);
        }
    }
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    if (microphone) microphone.disconnect();
    if (audioContext) {
        audioContext.close().catch(() => {});
    }
    clearTimeout(silenceTimer);
    isRecordingWord = false;
    whisperPendingMessages = [];
    whisperActiveUtterance = null;
    whisperSendChain = Promise.resolve();
    whisperPreRollChunks = [];
    lastWhisperChunkUiUpdateAt = 0;
    mediaRecorder = null;
    analyser = null;
    microphone = null;
    processedMicDestination = null;
    voiceHighpassFilter = null;
    voiceLowpassFilter = null;
    voiceCompressor = null;
    voiceGainNode = null;
    audioContext = null;
    state.voice.lastMicLevel = 0;
    state.voice.lastRecognitionLagMs = 0;
    state.voice.lastSpeechStartedAt = 0;
    state.voice.whisperActive = false;
    state.voice.whisperAltActive = false;
    refreshVoiceEngineState();
}

function stopBrowserRecognition() {
    const recognition = state.voice.recognition;
    state.voice.recognition = null;
    if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onspeechstart = null;
        try {
            recognition.stop();
        } catch (err) {
            console.warn('Nao foi possivel parar reconhecimento do navegador.', err);
        }
    }
    if (browserSpeechSession.activeUtteranceId) {
        voiceCoordinator.endUtterance('browser', browserSpeechSession.activeUtteranceId);
    }
    browserSpeechSession.activeUtteranceId = '';
    browserSpeechSession.speechStartedAt = 0;
    state.voice.browserActive = false;
    refreshVoiceEngineState();
}

const VOICE_CHROME_PRIORITY_HINTS = [
    'alfa',
    'beta',
    'celta',
    'delta',
    'k 1',
    'k 2',
    'k 3',
    'ariete',
    'ariete de batalha',
    '4 ariete',
    '4 ariete de batalha',
    'caliente',
    '4 caliente',
    'veneno',
    'vacuo',
    'x besta',
    'mini pekka',
    'principe',
    '5 principe',
];

let chromeVoiceHintsCache = null;

function buildChromeVoiceHints() {
    if (chromeVoiceHintsCache) return chromeVoiceHintsCache;

    const hints = [];
    const seen = new Set();
    const pushHint = (value) => {
        const normalized = normalizeVoiceText(value || '');
        if (!normalized || seen.has(normalized)) return;
        if (normalized.length < 2 || normalized.length > 40) return;
        seen.add(normalized);
        hints.push(normalized);
    };

    VOICE_CHROME_PRIORITY_HINTS.forEach(pushHint);

    const cardCostByNorm = new Map();
    if (Array.isArray(ALL_CARDS)) {
        ALL_CARDS.forEach(card => {
            if (!card || !card.name) return;
            const cardNorm = normalizeVoiceCardText(card.name);
            if (!cardNorm) return;
            if (!cardCostByNorm.has(cardNorm) && Number.isFinite(card.cost)) {
                cardCostByNorm.set(cardNorm, card.cost);
            }
            pushHint(cardNorm);
            if (Number.isFinite(card.cost)) {
                pushHint(`${card.cost} ${cardNorm}`);
            }
        });
    }

    VOICE_CARD_ALIAS_PAIRS.forEach(([from, to]) => {
        const fromNorm = normalizeVoiceText(from || '');
        const toNorm = normalizeVoiceCardText(to || '');
        if (!fromNorm || !toNorm) return;

        pushHint(fromNorm);
        const cost = cardCostByNorm.get(toNorm);
        if (Number.isFinite(cost)) {
            pushHint(`${cost} ${fromNorm}`);
        }
    });

    chromeVoiceHintsCache = hints.slice(0, 360);
    return chromeVoiceHintsCache;
}

function applyChromeSpeechBias(recognition) {
    if (!recognition) return { hints: 0, grammar: 0, phrases: 0 };
    const hints = buildChromeVoiceHints();
    if (!hints.length) return { hints: 0, grammar: 0, phrases: 0 };

    let grammar = 0;
    let phrases = 0;

    const GrammarListCtor = window.SpeechGrammarList || window.webkitSpeechGrammarList;
    if (GrammarListCtor && 'grammars' in recognition) {
        try {
            const list = new GrammarListCtor();
            const grammarHints = hints.slice(0, 180).map(hint => hint.replace(/[^a-z0-9\s]/g, ' ').trim()).filter(Boolean);
            if (grammarHints.length) {
                const grammarBody = grammarHints.join(' | ');
                const grammarText = `#JSGF V1.0; grammar clash; public <cmd> = ${grammarBody} ;`;
                list.addFromString(grammarText, 1.0);
                recognition.grammars = list;
                grammar = grammarHints.length;
            }
        } catch (err) {
            console.warn('Nao foi possivel aplicar grammar bias no Chrome.', err);
        }
    }

    const PhraseCtor = window.SpeechRecognitionPhrase || window.webkitSpeechRecognitionPhrase;
    if (PhraseCtor && 'phrases' in recognition) {
        try {
            recognition.phrases = hints.slice(0, 220).map(text => new PhraseCtor(text, 3.0));
            phrases = recognition.phrases.length;
        } catch (err) {
            console.warn('Nao foi possivel aplicar phrase bias no Chrome.', err);
        }
    }

    return { hints: hints.length, grammar, phrases };
}

function clearChromeSpeechBias(recognition) {
    if (!recognition) return;

    const GrammarListCtor = window.SpeechGrammarList || window.webkitSpeechGrammarList;
    if (GrammarListCtor && 'grammars' in recognition) {
        try {
            recognition.grammars = new GrammarListCtor();
        } catch (err) {
            console.warn('Nao foi possivel limpar grammar bias no Chrome.', err);
        }
    }

    if ('phrases' in recognition) {
        try {
            recognition.phrases = [];
        } catch (err) {
            console.warn('Nao foi possivel limpar phrase bias no Chrome.', err);
        }
    }
}

function nextBrowserRecognitionProfile(profile) {
    if (profile === 'full') return 'safe';
    if (profile === 'safe') return 'basic';
    return 'basic';
}

function configureBrowserRecognitionProfile(recognition, profile = 'full') {
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    clearChromeSpeechBias(recognition);

    if (profile === 'full') {
        recognition.maxAlternatives = 6;
        const browserBias = applyChromeSpeechBias(recognition);
        appendVoiceDebug('browser_bias', {
            profile,
            hints: browserBias.hints || 0,
            grammar: browserBias.grammar || 0,
            phrases: browserBias.phrases || 0,
        });
        return;
    }

    if (profile === 'safe') {
        recognition.maxAlternatives = 4;
        appendVoiceDebug('browser_bias', { profile, hints: 0, grammar: 0, phrases: 0 });
        return;
    }

    recognition.maxAlternatives = 2;
    appendVoiceDebug('browser_bias', { profile: 'basic', hints: 0, grammar: 0, phrases: 0 });
}

function scoreBrowserRecognitionAlternative(alternative, resultIndex, isFinal) {
    const transcript = alternative && typeof alternative.transcript === 'string'
        ? alternative.transcript.trim()
        : '';
    if (!transcript) {
        return {
            transcript: '',
            confidence: null,
            command: null,
            score: -100,
        };
    }

    const command = buildResolvedVoiceCommand(transcript);
    const normalizedTranscript = normalizeVoiceText(transcript);
    const confidence = Number.isFinite(alternative && alternative.confidence) ? alternative.confidence : null;
    const classWeight = {
        slot: 1.36,
        ability: 1.24,
        cost_card: 1.15,
        cost_only: 1.04,
        card_only: 0.72,
        legacy_ability: 0.18,
        unknown: 0,
    };
    const commandClass = command ? command.commandClass : 'unknown';
    let score = classWeight[commandClass] || 0;
    score += Number.isFinite(confidence) ? Math.max(0, Math.min(0.48, confidence)) : (resultIndex === 0 ? 0.12 : 0);
    score += isFinal ? 0.06 : 0;
    score -= resultIndex * 0.04;

    if ((commandClass === 'cost_card' || commandClass === 'card_only') && normalizeVoiceCardText(command && command.cardText)) {
        const globalMatch = getBestGlobalVoiceCardMatch(command.cardText || '', { allowInferred: true });
        if (globalMatch && globalMatch.card) {
            score += 0.12 + Math.max(0, Math.min(0.22, globalMatch.confidence * 0.22));
        } else {
            score -= 0.18;
        }
    }
    if (normalizedTranscript.includes('ariete') || normalizedTranscript.includes('caliente')) {
        const resolvedCard = normalizeVoiceCardText(command && command.cardText);
        if (resolvedCard && resolvedCard.includes('ariete')) {
            score += 0.22;
        }
    }
    if (commandClass === 'unknown') {
        score -= 0.5;
    }

    return {
        transcript,
        confidence,
        command,
        score,
    };
}

function selectBrowserRecognitionHypothesis(result) {
    if (!result || typeof result.length !== 'number' || result.length <= 0) {
        return null;
    }

    let best = null;
    for (let index = 0; index < result.length; index++) {
        const candidate = scoreBrowserRecognitionAlternative(result[index], index, !!result.isFinal);
        if (!candidate.transcript) continue;
        if (!best || candidate.score > best.score) {
            best = { ...candidate, alternativeIndex: index };
        }
    }

    return best;
}

function queueWhisperChunkSend(utterance, blob, meta = {}) {
    if (!utterance || !blob) return;
    const seq = ++utterance.seq;
    const mimeType = blob.type || 'audio/webm';
    const { preRoll = false } = meta;

    whisperSendChain = whisperSendChain
        .catch(() => {})
        .then(async () => {
            const audioBase64 = await blobToBase64(blob);
            const sent = sendWhisperSocketMessage({
                type: 'audio_chunk',
                utteranceId: utterance.id,
                seq,
                mimeType,
                audioBase64,
                speechStartedAt: utterance.speechStartedAt,
                platform: utterance.platform,
            });
            if (state.voice.whisperActive) {
                const now = Date.now();
                if (preRoll || seq <= 1 || (now - lastWhisperChunkUiUpdateAt) >= 320) {
                    lastWhisperChunkUiUpdateAt = now;
                    updateVoiceUI(
                        'processing',
                        sent
                            ? (preRoll ? 'Audio de pre-captura enviado para IA...' : 'Audio incremental enviado para IA...')
                            : 'Microfone pronto. Conectando ao Whisper...'
                    );
                }
            }
        })
        .catch(err => {
            console.error('Falha ao enviar chunk incremental do Whisper.', err);
            appendVoiceDebug('voice_degraded', {
                target: 'whisper',
                reason: preRoll ? 'preroll_send_failed' : 'chunk_send_failed',
                message: err && err.message ? err.message : String(err),
            });
        });
}

function startBrowserRecognition() {
    const RecognitionCtor = getBrowserSpeechRecognitionCtor();
    if (!RecognitionCtor) {
        updateVoiceUI('error', 'Reconhecimento nativo indisponivel neste navegador.');
        return false;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onspeechstart = () => {
        const speechStartedAt = Date.now();
        browserSpeechSession.speechStartedAt = speechStartedAt;
        browserSpeechSession.activeUtteranceId = voiceCoordinator.beginUtterance('browser', {
            platform: state.voice.platform || getVoicePlatform(),
            speechStartedAt,
        });
        state.voice.lastSpeechStartedAt = speechStartedAt;
    };

    recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const picked = selectBrowserRecognitionHypothesis(result);
            if (!picked || !picked.transcript) continue;
            const transcript = picked.transcript;

            updateVoiceUI('listening', result.isFinal ? 'Voz do navegador reconhecida.' : 'Ouvindo no navegador...', transcript);
            const utteranceId = browserSpeechSession.activeUtteranceId || voiceCoordinator.beginUtterance('browser', {
                platform: state.voice.platform || getVoicePlatform(),
                speechStartedAt: browserSpeechSession.speechStartedAt || Date.now(),
            });
            browserSpeechSession.activeUtteranceId = utteranceId;
            state.voice.transcriptsReceived += 1;
            if (picked.alternativeIndex > 0 && picked.command && picked.command.commandClass !== 'unknown') {
                appendVoiceDebug('browser_alt_pick', {
                    idx: picked.alternativeIndex,
                    class: picked.command.commandClass,
                    text: transcript,
                });
            }
            processVoiceTranscript(transcript, i, {
                isFinal: result.isFinal,
                source: 'browser',
                utteranceId,
                speechStartedAt: browserSpeechSession.speechStartedAt || Date.now(),
                platform: state.voice.platform || getVoicePlatform(),
                confidence: Number.isFinite(picked.confidence) ? picked.confidence : null,
            });
            if (result.isFinal) {
                voiceCoordinator.endUtterance('browser', utteranceId);
                browserSpeechSession.activeUtteranceId = '';
                browserSpeechSession.speechStartedAt = 0;
            }
        }
    };

    recognition.onerror = (event) => {
        console.warn('SpeechRecognition erro', event.error);
        if (!state.voice.listening || state.voice.manuallyStopped) return;

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            state.voice.browserActive = false;
            refreshVoiceEngineState();
            updateVoiceUI('error', state.voice.whisperActive
                ? 'Permissao negada no navegador, mas Whisper segue ativo.'
                : 'Permissao do microfone negada no navegador.');
            return;
        }
        if (event.error === 'audio-capture') {
            state.voice.browserActive = false;
            refreshVoiceEngineState();
            updateVoiceUI('error', state.voice.whisperActive
                ? 'Captura do navegador falhou, Whisper segue ativo.'
                : 'Nenhum microfone capturado pelo navegador.');
            return;
        }
        if (event.error === 'no-speech') {
            updateVoiceUI('listening', state.voice.whisperActive
                ? 'Navegador sem fala; Whisper segue ouvindo.'
                : 'Aguardando fala no navegador...');
            return;
        }
        updateVoiceUI('processing', state.voice.whisperActive
            ? 'Reconhecimento do navegador oscilou; Whisper continua ouvindo.'
            : 'Reconectando reconhecimento do navegador...');
    };

    recognition.onend = () => {
        if (browserSpeechSession.activeUtteranceId) {
            voiceCoordinator.endUtterance('browser', browserSpeechSession.activeUtteranceId);
        }
        browserSpeechSession.activeUtteranceId = '';
        browserSpeechSession.speechStartedAt = 0;
        if (!state.voice.browserActive || state.voice.manuallyStopped) return;
        setTimeout(() => {
            if (!state.voice.browserActive || state.voice.manuallyStopped) return;
            try {
                recognition.start();
            } catch (err) {
                console.warn('Falha ao reiniciar SpeechRecognition.', err);
                state.voice.browserActive = false;
                refreshVoiceEngineState();
                updateVoiceUI('error', state.voice.whisperActive
                    ? 'Navegador caiu, mas Whisper continua ouvindo.'
                    : 'Falha no reconhecimento do navegador.');
            }
        }, 140);
    };

    state.voice.recognition = recognition;
    try {
        recognition.start();
        state.voice.browserActive = true;
        refreshVoiceEngineState();
        updateVoiceUI('listening', state.voice.whisperActive
            ? 'Modo hibrido ativo. Navegador e Whisper ouvindo.'
            : 'Reconhecimento do navegador ativo. Escutando voce...');
        return true;
    } catch (err) {
        console.error('Falha ao iniciar SpeechRecognition.', err);
        updateVoiceUI('error', 'Falha ao iniciar reconhecimento local.');
        state.voice.recognition = null;
        state.voice.browserActive = false;
        refreshVoiceEngineState();
        return false;
    }
}

function switchToBrowserFallback(reason) {
    if (state.voice.browserActive || state.voice.manuallyStopped) return;
    state.voice.socketState = 'fallback';
    updateVoiceUI('processing', reason || 'Whisper sem resposta. Ativando navegador...');
    appendVoiceDebug('voice_fallback', { target: 'browser', reason: reason || 'whisper_no_response' });
    startBrowserRecognition();
}

function startSpeechRecording(speechStartedAt = Date.now()) {
    if (!mediaRecorder || state.voice.manuallyStopped || !state.voice.listening) return;
    if (whisperActiveUtterance) return;

    const recentPreRoll = (whisperPreRollChunks || []).filter(chunk => {
        if (!chunk || !chunk.capturedAt) return false;
        return (speechStartedAt - chunk.capturedAt) <= VOICE_PREROLL_MAX_AGE_MS;
    });
    const preRollOffsetMs = recentPreRoll.length * VOICE_RECORDER_TIMESLICE_MS;
    const alignedSpeechStartedAt = Math.max(0, speechStartedAt - preRollOffsetMs);

    const utteranceId = voiceCoordinator.beginUtterance('whisper', {
        platform: state.voice.platform || getVoicePlatform(),
        speechStartedAt: alignedSpeechStartedAt,
    });
    whisperActiveUtterance = {
        id: utteranceId,
        speechStartedAt: alignedSpeechStartedAt,
        seq: 0,
        platform: state.voice.platform || getVoicePlatform(),
    };
    state.voice.lastSpeechStartedAt = alignedSpeechStartedAt;
    sendWhisperSocketMessage({
        type: 'start_utterance',
        utteranceId,
        speechStartedAt: alignedSpeechStartedAt,
        platform: whisperActiveUtterance.platform,
    });

    if (recentPreRoll.length > 0) {
        appendVoiceDebug('voice_preroll', {
            utteranceId,
            chunks: recentPreRoll.length,
            backfillMs: preRollOffsetMs,
        });
    }

    recentPreRoll.forEach(chunk => {
        queueWhisperChunkSend(whisperActiveUtterance, chunk.blob, { preRoll: true });
    });
    whisperPreRollChunks = [];
    updateVoiceUI(
        'listening',
        state.voice.browserActive
            ? (state.voice.whisperAltActive ? 'Ensemble local gravando; navegador segue ouvindo.' : 'Whisper gravando; navegador segue ouvindo.')
            : (state.voice.whisperAltActive ? 'Ensemble local gravando...' : 'Whisper gravando...')
    );
    isRecordingWord = true;
}

function stopSpeechRecording() {
    clearTimeout(silenceTimer);
    if (!whisperActiveUtterance) return;

    isRecordingWord = false;
    const finishedUtterance = whisperActiveUtterance;
    whisperActiveUtterance = null;
    updateVoiceUI('processing', 'IA finalizando audio...');
    whisperSendChain = whisperSendChain
        .catch(() => {})
        .then(() => {
            sendWhisperSocketMessage({
                type: 'end_utterance',
                utteranceId: finishedUtterance.id,
                seq: finishedUtterance.seq,
                speechStartedAt: finishedUtterance.speechStartedAt,
                platform: finishedUtterance.platform,
                receivedAt: Date.now(),
            });
            updateVoiceUI('processing', 'IA processando...');
        });
}

async function startVADRecording() {
    if (VOICE_CHROME_ONLY_MODE) return false;
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            updateVoiceUI('error', 'Este navegador nao libera captura bruta do microfone.');
            return false;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 48000,
                sampleSize: 16,
            },
        });

        audioContext = new AudioContext({ latencyHint: 'interactive' });
        await audioContext.resume();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.46;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        processedMicDestination = typeof audioContext.createMediaStreamDestination === 'function'
            ? audioContext.createMediaStreamDestination()
            : null;
        if (processedMicDestination) {
            voiceHighpassFilter = audioContext.createBiquadFilter();
            voiceHighpassFilter.type = 'highpass';
            voiceHighpassFilter.frequency.value = 95;
            voiceHighpassFilter.Q.value = 0.8;

            voiceLowpassFilter = audioContext.createBiquadFilter();
            voiceLowpassFilter.type = 'lowpass';
            voiceLowpassFilter.frequency.value = 7800;
            voiceLowpassFilter.Q.value = 0.7;

            voiceCompressor = audioContext.createDynamicsCompressor();
            voiceCompressor.threshold.value = -24;
            voiceCompressor.knee.value = 12;
            voiceCompressor.ratio.value = 4.5;
            voiceCompressor.attack.value = 0.004;
            voiceCompressor.release.value = 0.12;

            voiceGainNode = audioContext.createGain();
            voiceGainNode.gain.value = 1.12;

            microphone.connect(voiceHighpassFilter);
            voiceHighpassFilter.connect(voiceLowpassFilter);
            voiceLowpassFilter.connect(voiceCompressor);
            voiceCompressor.connect(voiceGainNode);
            voiceGainNode.connect(processedMicDestination);
        }
        const timeDomainData = new Uint8Array(analyser.fftSize);
        let noiseFloor = VOICE_RMS_THRESHOLD * 0.30;

        const mimeType = getSupportedRecorderMimeType();
        const recorderStream = processedMicDestination ? processedMicDestination.stream : stream;
        mediaRecorder = mimeType
            ? new MediaRecorder(recorderStream, { mimeType })
            : new MediaRecorder(recorderStream);
        whisperPreRollChunks = [];

        mediaRecorder.ondataavailable = e => {
            if (e.data.size <= 0) return;
            const blob = new Blob([e.data], { type: mediaRecorder.mimeType || e.data.type || 'audio/webm' });
            if (!whisperActiveUtterance) {
                whisperPreRollChunks.push({
                    blob,
                    capturedAt: Date.now(),
                });
                if (whisperPreRollChunks.length > VOICE_PREROLL_CHUNKS) {
                    whisperPreRollChunks.splice(0, whisperPreRollChunks.length - VOICE_PREROLL_CHUNKS);
                }
                return;
            }

            queueWhisperChunkSend(whisperActiveUtterance, blob);
        };
        mediaRecorder.onstop = () => {
            clearTimeout(silenceTimer);
            whisperPreRollChunks = [];
            lastWhisperChunkUiUpdateAt = 0;
        };
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error', event.error || event);
            whisperActiveUtterance = null;
            state.voice.whisperActive = false;
            state.voice.whisperAltActive = false;
            refreshVoiceEngineState();
            updateVoiceUI('error', state.voice.browserActive
                ? 'Whisper perdeu a captura, mas o navegador segue ouvindo.'
                : 'Falha ao capturar audio do microfone.');
        };

        function detectSpeech() {
            if (state.voice.manuallyStopped || !state.voice.whisperActive) return;

            analyser.getByteTimeDomainData(timeDomainData);
            let sumSquares = 0;
            for (let i = 0; i < timeDomainData.length; i++) {
                const normalized = (timeDomainData[i] - 128) / 128;
                sumSquares += normalized * normalized;
            }

            const rms = Math.sqrt(sumSquares / timeDomainData.length);
            state.voice.lastMicLevel = rms;
            if (!isRecordingWord) {
                noiseFloor = (noiseFloor * 0.92) + (Math.min(rms, VOICE_RMS_THRESHOLD) * 0.08);
            }
            const speechThreshold = Math.max(VOICE_RMS_THRESHOLD * 0.68, noiseFloor * 1.025);

            if (rms >= speechThreshold) {
                const detectedAt = Date.now();
                state.voice.lastAudioDetectedAt = detectedAt;
                clearTimeout(silenceTimer);
                if (!isRecordingWord) {
                    startSpeechRecording(detectedAt);
                }

                silenceTimer = setTimeout(() => {
                    stopSpeechRecording();
                }, VOICE_SILENCE_MS);
            }

            vadFrameId = requestAnimationFrame(detectSpeech);
        }

        mediaRecorder.start(VOICE_RECORDER_TIMESLICE_MS);

        state.voice.whisperActive = true;
        state.voice.whisperAltActive = state.voice.whisperAltAvailable;
        state.voice.lastAudioDetectedAt = Date.now();
        refreshVoiceEngineState();
        updateVoiceUI('listening', state.voice.browserActive
            ? (state.voice.whisperAltActive ? 'Modo trio ativo. Navegador, Whisper e Whisper alt ouvindo.' : 'Modo hibrido ativo. Navegador e Whisper ouvindo.')
            : (state.voice.whisperAltActive ? 'Ensemble local ativo. Dois modelos ouvindo voce.' : 'Whisper local ativo. Escutando voce...'));
        detectSpeech();
        return true;

    } catch(err) {
        console.error(err);
        state.voice.whisperActive = false;
        state.voice.whisperAltActive = false;
        refreshVoiceEngineState();
        updateVoiceUI('error', state.voice.browserActive
            ? 'Whisper nao conseguiu acessar o microfone, mas o navegador segue ouvindo.'
            : 'Permissao do microfone negada ou indisponivel.');
        return false;
    }
}

async function toggleVoiceListening() {
    if (!state.voice.supported) return;

    if (state.voice.listening) {
        appendVoiceDebug('voice_toggle', { action: 'off_request' });
        state.voice.manuallyStopped = true;
        voiceCoordinator.reset();
        lastResolvedVoiceAction = { normalizedKey: '', commandClass: '', engine: '', at: 0 };
        browserSpeechSession.activeUtteranceId = '';
        browserSpeechSession.speechStartedAt = 0;
        state.voice.awaitingCardOnlyCost = null;
        state.voice.awaitingCardOnlyUntil = 0;
        state.voice.lastAcceptedText = '';
        state.voice.lastAcceptedCost = null;
        state.voice.lastAcceptedAt = 0;
        state.voice.lastAcceptedIsFinal = false;
        state.voice.lastAcceptedSource = '';
        state.voice.lastResultIndex = -1;
        state.voice.lastCommandKey = '';
        state.voice.lastCommandAt = 0;
        state.voice.lastCommandSource = '';
        state.voice.lastSlotCommandKey = '';
        state.voice.lastSlotCommandAt = 0;
        state.voice.lastSlotCommandSource = '';
        state.voice.lastSlotRawKey = '';
        state.voice.lastSlotRawAt = 0;
        state.voice.lastRecognitionLagMs = 0;

        await stopNativeVoiceRecognition();
        stopBrowserRecognition();
        stopAllAudio();
        await whisperSendChain.catch(() => {});
        closeWhisperSocket();
        state.voice.socketState = 'offline';
        state.voice.whisperAvailable = false;
        state.voice.whisperAltAvailable = false;
        state.voice.whisperAltActive = false;
        state.voice.nativeActive = false;
        refreshVoiceEngineState();
        updateVoiceUI('idle', 'Voz inativa');
        appendVoiceDebug('voice_toggle', { action: 'off_done' });
        return;
    }

    appendVoiceDebug('voice_toggle', { action: 'on_request' });
    state.voice.manuallyStopped = false;
    voiceCoordinator.reset();
    lastResolvedVoiceAction = { normalizedKey: '', commandClass: '', engine: '', at: 0 };
    browserSpeechSession.activeUtteranceId = '';
    browserSpeechSession.speechStartedAt = 0;
    whisperPendingMessages = [];
    whisperActiveUtterance = null;
    whisperSendChain = Promise.resolve();
    state.voice.awaitingCardOnlyCost = null;
    state.voice.awaitingCardOnlyUntil = 0;
    state.voice.chunksSent = 0;
    state.voice.transcriptsReceived = 0;
    state.voice.lastTranscript = '';
    state.voice.lastMicLevel = 0;
    state.voice.lastRecognitionLagMs = 0;
    state.voice.lastAcceptedText = '';
    state.voice.lastAcceptedCost = null;
    state.voice.lastAcceptedAt = 0;
    state.voice.lastAcceptedIsFinal = false;
    state.voice.lastAcceptedSource = '';
    state.voice.lastResultIndex = -1;
    state.voice.lastCommandKey = '';
    state.voice.lastCommandAt = 0;
    state.voice.lastCommandSource = '';
    state.voice.lastSlotCommandKey = '';
    state.voice.lastSlotCommandAt = 0;
    state.voice.lastSlotCommandSource = '';
    state.voice.lastSlotRawKey = '';
    state.voice.lastSlotRawAt = 0;
    state.voice.browserActive = false;
    state.voice.whisperActive = false;
    state.voice.whisperAltActive = false;
    state.voice.nativeActive = false;
    refreshVoiceEngineState();

    if (state.voice.platform === 'android') {
        updateVoiceUI('processing', 'Iniciando voz nativa do Android...');
        const nativeStarted = await startNativeVoiceRecognition();
        if (!nativeStarted) {
            appendVoiceDebug('voice_toggle', { action: 'on_failed', platform: 'android' });
            return;
        }
        appendVoiceDebug('voice_toggle', {
            action: 'on_done',
            native: 1,
            browser: 0,
            whisper: 0,
            whisperAlt: 0,
            socket: 0,
        });
        return;
    }

    if (VOICE_CHROME_ONLY_MODE) {
        if (!state.voice.browserSupported) {
            updateVoiceUI('error', 'Modo Chrome-only: reconhecimento de voz indisponivel neste navegador.');
            appendVoiceDebug('voice_toggle', { action: 'on_failed', reason: 'browser_not_supported', chromeOnly: 1 });
            return;
        }

        updateVoiceUI('processing', 'Iniciando reconhecimento do Google Chrome...');
        const browserStarted = startBrowserRecognition();
        if (!browserStarted) {
            updateVoiceUI('error', 'Nao consegui iniciar o microfone do Chrome.');
            appendVoiceDebug('voice_toggle', { action: 'on_failed', reason: 'browser_start_failed', chromeOnly: 1 });
            return;
        }

        state.voice.socketState = 'browser_only';
        state.voice.whisperAvailable = false;
        state.voice.whisperAltAvailable = false;
        state.voice.whisperActive = false;
        state.voice.whisperAltActive = false;
        refreshVoiceEngineState();
        updateVoiceUI('listening', 'Microfone do Google Chrome ativo. Fale custo e carta.');
        appendVoiceDebug('voice_toggle', {
            action: 'on_done',
            browser: 1,
            whisper: 0,
            whisperAlt: 0,
            socket: 0,
            native: 0,
            chromeOnly: 1,
        });
        return;
    }

    let browserStarted = false;
    if (state.voice.browserSupported) {
        updateVoiceUI('processing', 'Iniciando reconhecimento do navegador...');
        browserStarted = startBrowserRecognition();
    } else {
        updateVoiceUI('processing', 'Navegador sem reconhecimento nativo. Tentando Whisper local...');
    }

    const whisperConnectPromise = connectWhisperSocket({ quiet: true });
    const whisperStarted = await startVADRecording();
    const whisperConnected = await whisperConnectPromise;

    if (!browserStarted && !whisperStarted) {
        updateVoiceUI('error', 'Nao consegui ouvir. Rode ./start_whisper.sh ou use Chrome em localhost.');
        appendVoiceDebug('voice_toggle', { action: 'on_failed' });
        return;
    }

    if (browserStarted && whisperStarted) {
        if (whisperConnected) {
            updateVoiceUI('listening', state.voice.whisperAltAvailable
                ? 'Modo trio ativo. Navegador, Whisper e Whisper alt ouvindo.'
                : 'Modo hibrido ativo. Navegador e Whisper ouvindo.');
        } else {
            updateVoiceUI('listening', 'Navegador ouvindo agora. Whisper conectando em segundo plano.');
        }
    } else if (whisperStarted) {
        if (whisperConnected) {
            updateVoiceUI('listening', state.voice.whisperAltAvailable
                ? 'Ensemble local ativo. Dois modelos ouvindo voce.'
                : 'Whisper local ativo. Fale custo e carta.');
        } else {
            updateVoiceUI('processing', 'Microfone ativo. Conectando Whisper local...');
        }
    } else {
        updateVoiceUI('listening', 'Reconhecimento do navegador ativo. Rode ./start_whisper.sh para mais precisao.');
    }
    appendVoiceDebug('voice_toggle', {
        action: 'on_done',
        browser: browserStarted ? 1 : 0,
        whisper: whisperStarted ? 1 : 0,
        whisperAlt: state.voice.whisperAltAvailable ? 1 : 0,
        socket: whisperConnected ? 1 : 0,
        native: 0,
    });

    clearTimeout(whisperFallbackTimer);
    whisperFallbackTimer = setTimeout(() => {
        if (state.voice.manuallyStopped) return;
        if (state.voice.whisperActive && !state.voice.browserActive && state.voice.transcriptsReceived === 0 && state.voice.chunksSent >= 1) {
            switchToBrowserFallback('Whisper sem resposta. Ativando navegador...');
        }
        if (state.voice.whisperActive && state.voice.chunksSent === 0 && (Date.now() - state.voice.lastAudioDetectedAt) > 5000) {
            updateVoiceUI('error', 'Microfone sem sinal util. Verifique permissao e dispositivo.');
        }
    }, WHISPER_FALLBACK_MS);
}

// ─── Events ──────────────────────────────────────────────

if (els.btnVoice) {
    els.btnVoice.addEventListener('click', (e) => {
        if (e.target && e.target.blur) e.target.blur();
        toggleVoiceListening().catch((err) => {
            console.error('Falha ao alternar voz', err);
            updateVoiceUI('error', 'Erro interno ao iniciar voz. Recarregue a pagina.');
        });
    });
}

if (els.btnCopyVoiceLog) {
    els.btnCopyVoiceLog.addEventListener('click', async () => {
        const original = els.btnCopyVoiceLog.textContent;
        try {
            const copied = await copyVoiceDebugReport();
            els.btnCopyVoiceLog.textContent = copied ? 'Copiado' : 'Falhou';
            appendVoiceDebug('report_copy', { ok: copied ? 1 : 0 });
        } catch (err) {
            console.warn('Falha ao copiar relatorio de voz.', err);
            els.btnCopyVoiceLog.textContent = 'Falhou';
            appendVoiceDebug('report_copy', { ok: 0, err: err && err.message ? err.message : 'copy_error' });
        }
        setTimeout(() => { els.btnCopyVoiceLog.textContent = original; }, 1000);
    });
}

if (els.btnClearVoiceLog) {
    els.btnClearVoiceLog.addEventListener('click', () => {
        clearVoiceDebugReport();
    });
}

if (els.identifyClose) {
    els.identifyClose.addEventListener('click', () => closeIdentifyModal());
}

if (els.identifyStepType) {
    els.identifyStepType.addEventListener('click', e => {
        const btn = e.target.closest('.type-btn');
        if (!btn) return;
        const type = btn.dataset.type;
        if (!type) return;
        selectType(type);
    });
}

if (els.identifyCardList) {
    els.identifyCardList.addEventListener('click', e => {
        const btn = e.target.closest('.identify-grid-btn');
        if (!btn) return;
        const cardName = btn.dataset.cardName;
        if (!cardName) return;
        confirmCardIdentification(cardName);
    });
}

els.cardButtons.addEventListener('click', e => {
    const btn = e.target.closest('.card-btn');
    if (!btn) return;
    const cost = parseInt(btn.dataset.cost, 10);
    subtractElixir(cost);
    

    const allBtns = els.cardButtons.querySelectorAll('.btn-card');
    allBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');



});

els.btnResetElixir.addEventListener('click', () => resetElixirToMax());
els.btnStart.addEventListener('click', () => startMatch());

document.querySelector('.cycle-grid').addEventListener('click', e => {
    const removeBtn = e.target.closest('.cycle-remove-btn');
    if (!removeBtn) return;
    e.preventDefault();
    e.stopPropagation();

    const rawToken = removeBtn.dataset.cardToken || '';
    let cardName = rawToken;
    try { cardName = decodeURIComponent(rawToken); } catch (_) {}

    const playIndexRaw = parseInt(removeBtn.dataset.playIndex || '', 10);
    const playIndex = Number.isNaN(playIndexRaw) ? null : playIndexRaw;
    removeCardFromCycle(cardName, playIndex);
});

document.querySelector('.deck-section').addEventListener('click', e => {
    // Handle exclude button on confirmed cards
    const excludeBtn = e.target.closest('.exclude-card-btn');
    if (excludeBtn) {
        e.stopPropagation();
        const idx = parseInt(excludeBtn.dataset.excludeIdx, 10);
        const confirmed = state.opponentDeck.filter(c => c.confirmed);
        const predicted = state.opponentDeck.filter(c => !c.confirmed);
        const ordered = [...confirmed, ...predicted];
        if (idx >= 0 && idx < ordered.length && ordered[idx].confirmed) {
            excludeConfirmedCard(ordered[idx].name);
        }
        return;
    }

    // Handle discard button on predicted cards
    const discardBtn = e.target.closest('.discard-pred-btn');
    if (discardBtn) {
        e.stopPropagation();
        const name = discardBtn.dataset.discardName;
        if (name) {
            state.opponentDeck = state.opponentDeck.filter(c => c.name !== name || c.confirmed);
            state.discardedPredictions.push(name);
            autoFillPredictions();
        }
        return;
    }

    const slot = e.target.closest('.deck-slot.predicted');
    if (slot && slot.dataset.cardName) {
        confirmPredictedCard(slot.dataset.cardName);
    }
});

document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // Disable the Enter key globally outside of inputs so it doesn't accidentally trigger focused buttons (like the Voice button)
    if (e.key === 'Enter') {
        e.preventDefault();
        return;
    }
    
    const key = e.key.toUpperCase();
    const raw = e.key.toLowerCase();

    // Number keys and Q ALWAYS work, even during identification
    if (raw === 'q') { e.preventDefault(); resetElixirToMax(); return; }
    if (raw === 'r') { 
        e.preventDefault(); 
        const unconfirmed = state.opponentDeck.filter(c => !c.confirmed).map(c => c.name);
        if (unconfirmed.length > 0) {
            state.discardedPredictions.push(...unconfirmed);
            autoFillPredictions();
        }
        return; 
    }
    if (raw === ' ' || e.code === 'Space') { e.preventDefault(); startMatch(); return; }
    if (raw >= '0' && raw <= '9') {
        e.preventDefault();
        const cost = raw === '0' ? 10 : parseInt(raw, 10);
        subtractElixir(cost);
        const btn = els.cardButtons.querySelector(`[data-cost="${cost}"]`);
        if (btn) { 

    const allBtns = els.cardButtons.querySelectorAll('.btn-card');
    allBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');


 }
        return;
    }

    // Identification panel shortcuts (only when panel is open)
    if (state.identifying) {
        if (els.identifyStepType.style.display !== 'none') {
            if (raw === 'z') { e.preventDefault(); selectType('troop'); return; }
            if (raw === 'x') { e.preventDefault(); selectType('spell'); return; }
            if (raw === 'c') { e.preventDefault(); selectType('building'); return; }
            if (raw === 'v') { e.preventDefault(); selectType('hero'); return; }
            if (raw === 'escape') { e.preventDefault(); closeIdentifyModal(); return; }
            return;
        }
        if (els.identifyStepCard.style.display !== 'none') {
            if (raw === '/') { e.preventDefault(); confirmCardIdentification('__skip__'); return; }
            if (raw === 'escape') { e.preventDefault(); closeIdentifyModal(); return; }
            if (raw === 'backspace') {
                e.preventDefault();
                els.identifyStepType.style.display = 'block';
                els.identifyStepCard.style.display = 'none';
                return;
            }
            if (state._currentCards) {
                const match = state._currentCards.find(c => c.key === key);
                if (match) { e.preventDefault(); confirmCardIdentification(match.name); return; }
            }
            return;
        }
        return;
    }

    // (number keys and Q handled above, before identification check)
});

// ─── Helpers ─────────────────────────────────────────────

function findCardByNameLike(cardName) {
    if (!cardName) return null;
    const cleanedName = (cardName || '').toString().replace(/\s*\(espelho\)\s*$/i, '').trim();
    if (!cleanedName) return null;

    const targetName = normalizeCardName(cleanedName);
    let card = ALL_CARDS.find(c => normalizeCardName(c.name) === targetName);
    if (card) return card;

    const voiceKey = normalizeVoiceCardText(cleanedName);
    if (voiceKey) {
        card = ALL_CARDS.find(c => normalizeVoiceCardText(c.name) === voiceKey);
        if (card) return card;
    }

    return null;
}

function getCardImage(cardName) {
    if (!cardName) return '';
    const card = findCardByNameLike(cardName);
    const candidates = [];

    if (card && card.image) {
        candidates.push(...getImagePathCandidates(card.image));
    }

    if (card && card.name) {
        candidates.push(encodeURI(`images/${card.name}.png`));
        candidates.push(encodeURI(`CartasClashRoyale/${card.name}.png`));
    }

    return dedupeImageCandidates(candidates)[0] || '';
}

function getCardImageFallback(cardName) {
    if (!cardName) return '';
    const card = findCardByNameLike(cardName);
    const candidates = [];

    if (card && card.image) {
        candidates.push(...getImagePathCandidates(card.image));
    }

    if (card && card.name) {
        candidates.push(encodeURI(`images/${card.name}.png`));
        candidates.push(encodeURI(`CartasClashRoyale/${card.name}.png`));
    }

    const deduped = dedupeImageCandidates(candidates);
    return deduped.length > 1 ? deduped[1] : '';
}

function dedupeImageCandidates(paths) {
    const seen = new Set();
    const out = [];
    (paths || []).forEach(path => {
        const clean = (path || '').toString().trim();
        if (!clean || seen.has(clean)) return;
        seen.add(clean);
        out.push(clean);
    });
    return out;
}

function getImagePathCandidates(imagePath) {
    const raw = (imagePath || '').toString().trim();
    if (!raw) return [];

    const normalized = raw.replace(/^\.?\//, '');
    const encodedPrimary = encodeURI(normalized);
    const variants = [encodedPrimary];

    if (normalized.startsWith('images/')) {
        variants.push(encodeURI(normalized.replace(/^images\//, 'CartasClashRoyale/')));
    } else if (normalized.startsWith('CartasClashRoyale/')) {
        variants.push(encodeURI(normalized.replace(/^CartasClashRoyale\//, 'images/')));
    }

    return dedupeImageCandidates(variants);
}

function getImagePathPrimary(imagePath) {
    return getImagePathCandidates(imagePath)[0] || '';
}

function getImagePathFallback(imagePath) {
    const candidates = getImagePathCandidates(imagePath);
    return candidates.length > 1 ? candidates[1] : '';
}

function onCardArtError(imgEl) {
    if (!imgEl) return;
    const fallback = imgEl.dataset ? imgEl.dataset.fallback : '';
    const alreadyTried = imgEl.dataset ? imgEl.dataset.fallbackTried === '1' : false;

    if (fallback && !alreadyTried) {
        if (imgEl.dataset) imgEl.dataset.fallbackTried = '1';
        imgEl.src = fallback;
        return;
    }

    imgEl.remove();
}

window.onCardArtError = onCardArtError;

// ─── Init ────────────────────────────────────────────────
updateAll();
renderVoiceDebugReport();
appendVoiceDebug('app_ready');
try {
    initVoiceRecognition();
} catch (err) {
    // Voice is optional; never break manual controls if voice init fails.
    console.warn('Voice init failed, manual mode remains active.', err);
}
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(r => console.log('SW Reg')).catch(e => console.error('SW Error', e));
    });
}
