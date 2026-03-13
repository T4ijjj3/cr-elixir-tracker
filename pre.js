/**
 * Clash Royale — Elixir Tracker do Oponente v3
 * Desktop-optimized with meta deck prediction
 */

// ─── Constants ───────────────────────────────────────────
const REGEN_NORMAL_MS = 2800;
const REGEN_DOUBLE_MS = 1400;
const MAX_ELIXIR = 10;
const START_ELIXIR = 7;
const MATCH_DURATION_S = 180;
const DOUBLE_ELIXIR_AT_S = 60;
const TICK_INTERVAL_MS = 50;
const DECK_SIZE = 8;
const HAND_SIZE = 4;
const VOICE_DEBOUNCE_MS = 1200;
const VOICE_HIGH_CONFIDENCE = 0.82;
const VOICE_LOW_CONFIDENCE = 0.52;

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
        recognition: null,
        lastAcceptedText: '',
        lastAcceptedAt: 0,
        pendingCost: null,
        pendingCardText: '',
    },
};

// ─── Engine ──────────────────────────────────────────────

function startMatch() {
    if (state.running) { resetMatch(); return; }

    state.running = true;
    state.elixir = START_ELIXIR;
    state.wasted = 0;
    state.regenMs = REGEN_NORMAL_MS;
    state.isDouble = false;
    state.matchTimeRemaining = MATCH_DURATION_S;
    state.history = [];
    state.lastTick = performance.now();
    state.cardCycle = [];
    state.handCards = [];
    state.queueCards = [];
    state.totalPlayed = 0;
    state.opponentDeck = [];
    state.deckComplete = false;

    els.btnStart.innerHTML = '<span class="btn-icon">⏹</span> RESET';
    els.btnStart.classList.add('running');
    els.matchPhase.textContent = 'NORMAL';
    els.matchPhase.className = 'match-phase active';
    els.timerDisplay.className = 'timer-compact';

    clearHistoryUI();
    updateAll();
    state.tickTimer = setInterval(tick, TICK_INTERVAL_MS);
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
    closeIdentifyModal();

    els.btnStart.innerHTML = '<span class="btn-icon">▶</span> INICIAR';
    els.btnStart.classList.remove('running');
    els.matchPhase.textContent = 'PRONTO';
    els.matchPhase.className = 'match-phase';
    els.timerDisplay.className = 'timer-compact';
    els.regenRate.textContent = '2.8s / ponto';

    clearHistoryUI();
    updateAll();
}

function tick() {
    const now = performance.now();
    const deltaMs = now - state.lastTick;
    state.lastTick = now;

    state.matchTimeRemaining -= deltaMs / 1000;

    if (state.matchTimeRemaining <= 0) {
        state.matchTimeRemaining = 0;
        updateTimerUI();
        resetMatch();
        return;
    }

    if (!state.isDouble && state.matchTimeRemaining <= DOUBLE_ELIXIR_AT_S) {
        state.isDouble = true;
        state.regenMs = REGEN_DOUBLE_MS;
        els.matchPhase.textContent = '2x ELIXIR';
        els.matchPhase.className = 'match-phase double';
        els.timerDisplay.classList.add('double-time');
        els.regenRate.textContent = '1.4s / ponto';
    }

    if (state.matchTimeRemaining <= 15) {
        els.timerDisplay.classList.remove('double-time');
        els.timerDisplay.classList.add('ending');
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
    state.totalPlayed++;
    state.cardCycle.push({ cost, name: cardName || cost.toString(), playIndex: state.totalPlayed });
    rebuildCyclePrediction();
}

function rebuildCyclePrediction() {
    const played = state.cardCycle;
    const total = played.length;
    if (total === 0) { state.queueCards = []; state.handCards = []; return; }

    const recentFour = played.slice(-HAND_SIZE);
    state.queueCards = recentFour.map((c, i) => ({ ...c, returnsIn: HAND_SIZE - i }));

    state.handCards = total >= HAND_SIZE + 1
        ? played.slice(-(HAND_SIZE * 2), -HAND_SIZE).map(c => ({ ...c }))
        : [];
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

    const hasSpells = costHasSpells(cost);
    const hasHeroes = costHasHeroes(cost);
    const hasBuildings = costHasBuildings(cost);
    const needsTypeQ = (hasSpells || hasHeroes || hasBuildings) && !state.deckComplete;

    if (needsTypeQ) {
        els.identifyStepType.style.display = 'block';
        els.identifyStepCard.style.display = 'none';
        els.typeSpell.style.display = hasSpells ? 'flex' : 'none';
        els.typeBuilding.style.display = hasBuildings ? 'flex' : 'none';
        els.typeHero.style.display = hasHeroes ? 'flex' : 'none';
        els.typeTroop.style.display = 'flex';
    } else {
        showCardList('all');
    }

    els.identifyOverlay.style.display = 'block';
}

function selectType(type) {
    state.identifyType = type;
    showCardList(type);
}

function showCardList(type) {
    els.identifyStepType.style.display = 'none';
    els.identifyStepCard.style.display = 'block';

    const identifiedNames = state.opponentDeck.map(c => c.name);
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
        const imgHtml = card.image !== null ? `<div class="card-img-wrapper"><img src="${card.image}" class="card-grid-img" alt="${card.name}"></div>` : `<div class="card-img-wrapper fallback-img"><span class="card-type-icon">${typeLabel[card.type] || '🗡️'}</span></div>`;
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
    if (state.deckComplete) return;

    const predicted = state.opponentDeck.find(c => c.name === cardName && !c.confirmed);
    if (predicted) {
        predicted.confirmed = true;
        
        const confirmedCount = state.opponentDeck.filter(c => c.confirmed).length;
        if (confirmedCount >= DECK_SIZE) state.deckComplete = true;
        
        updateAll();
    }
}

function confirmCardIdentification(cardName) {
    const cost = state.identifyCost;

    if (cardName !== '__skip__' && !state.deckComplete) {
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
            const confirmedCount = state.opponentDeck.filter(c => c.confirmed).length;

            // Auto-fill dynamically when >= 2
            if (confirmedCount >= 2) {
                autoFillPredictions();
            }

            // Check if all 8 are confirmed
            if (confirmedCount >= DECK_SIZE) state.deckComplete = true;
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
    let unseenTotal = ALL_CARDS.filter(c => !confirmedNames.includes(c.name) && !state.discardedPredictions.includes(c.name));
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

function subtractElixir(cost, preferredCardName = null) {
    if (!state.running) return;
    if (cost < 1 || cost > 10) return;

    state.elixir = Math.max(0, state.elixir - cost);
    updateElixirUI();

    if (!state.deckComplete) {
        // Open identification but NEVER block — elixir is already subtracted
        beginIdentification(cost);
    } else {
        let match = null;
        if (preferredCardName) {
            const target = normalizeCardName(preferredCardName);
            match = state.opponentDeck.find(c => normalizeCardName(c.name) === target && c.cost === cost)
                || state.opponentDeck.find(c => normalizeCardName(c.name) === target)
                || null;
        }
        if (!match) match = state.opponentDeck.find(c => c.cost === cost);
        processCardPlayed(cost, match ? match.name : cost.toString());
        finalizeCardPlay(cost, match ? match.name : null);
    }
}

function finalizeCardPlay(cost, cardName) {
    const timeStr = formatTime(state.matchTimeRemaining);
    state.history.unshift({
        cost,
        cardName: cardName || cost.toString(),
        time: timeStr,
        remaining: Math.floor(state.elixir),
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

function updateElixirUI() {
    const d = Math.floor(state.elixir);
    els.elixirValue.textContent = d;
    els.elixirBarFill.style.width = (state.elixir / MAX_ELIXIR * 100) + '%';
    els.wastedValue.textContent = state.wasted.toFixed(1);
}

function updateTimerUI() {
    els.timerDisplay.textContent = formatTime(state.matchTimeRemaining);
    const progress = (1 - (MATCH_DURATION_S - state.matchTimeRemaining) / MATCH_DURATION_S) * 100;
    els.timerBar.style.width = Math.max(0, progress) + '%';
}

function updateNextCardHero() {
    const next = getNextCardPrediction();
    if (next) {
        els.nextCardDisplay.innerHTML = `
            <div class="next-card-big">
                <span class="next-cost">${next.cost}</span>
                <span class="next-name">${next.name || next.cost}</span>
            </div>`;
        els.nextCardHero.classList.add('has-prediction');
    } else {
        els.nextCardDisplay.innerHTML = '<span class="next-card-empty">Jogue cartas para rastrear</span>';
        els.nextCardHero.classList.remove('has-prediction');
    }
}

function updateCycleUI() {
    const renderCycleCard = (c, isQueue = false) => {
        const classes = `cycle-card ${isQueue ? 'in-queue' : 'in-hand'}`;
        const returnsBadge = isQueue ? `<span class="returns-badge">${c.returnsIn}</span>` : '';
        const title = isQueue ? `${c.name} — volta em ${c.returnsIn}` : c.name;
        const showImage = state.deckComplete && c.name && !/^\d+$/.test(c.name);
        const cardUrl = showImage ? getCardImage(c.name) : '';

        if (!cardUrl) {
            return `<div class="${classes}" title="${title}">${c.cost}${returnsBadge}</div>`;
        }

        return `<div class="${classes} has-art" title="${title}">
            <div class="cycle-art-wrap">
                <img src="${cardUrl}" class="cycle-art" alt="${c.name}" onerror="this.remove()">
            </div>
            <span class="cycle-name">${c.name}</span>
            ${returnsBadge}
        </div>`;
    };

    if (state.handCards.length > 0) {
        els.cycleHand.innerHTML = state.handCards.map(c => renderCycleCard(c)).join('');
    } else {
        els.cycleHand.innerHTML = Array(4).fill('<div class="cycle-card unknown">?</div>').join('');
    }

    if (state.queueCards.length > 0) {
        els.cycleQueue.innerHTML = state.queueCards.map(c => renderCycleCard(c, true)).join('');
    } else {
        els.cycleQueue.innerHTML = '<span class="cycle-empty">—</span>';
    }
    els.cardsPlayed.textContent = state.totalPlayed;
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
                slots[i].className = 'deck-slot filled';
                const cardUrl = getCardImage(card.name);
                const artHtml = cardUrl
                    ? `<img src="${cardUrl}" class="slot-art" alt="${card.name}" onerror="this.remove()">`
                    : '';
                slots[i].style.backgroundImage = 'none';
                slots[i].innerHTML = `${cycleHtml}
                    <div class="slot-art-wrap">${artHtml}</div>
                    <span class="deck-name">${card.name}</span>
                    <span class="deck-cost">${card.cost}⚡</span>`;
                slots[i].classList.toggle('no-art', !cardUrl);
                slots[i].title = card.name;
                slots[i].style.cursor = 'default';
                delete slots[i].dataset.cardName;
            } else {
                slots[i].className = 'deck-slot predicted';
                // Add cycle logic for predicted cards as well just in case they were played but not clicked? Actually predicted cards haven't been confirmed played yet.
                const tagContent = card.prob ? `${card.prob}%` : '?';
                const cardUrl = getCardImage(card.name);
                const artHtml = cardUrl
                    ? `<img src="${cardUrl}" class="slot-art" alt="${card.name}" onerror="this.remove()">`
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
    // Only base deck prediction strictly on CONFIRMED cards
    const identified = state.opponentDeck.filter(c => c.confirmed).map(c => c.name);
    const predicted = predictDecks(identified);

    if (predicted.length > 0 && identified.length > 0) {
        els.predictedDeck.innerHTML = predicted.map((d, i) => `
            <div class="predicted-item ${i === 0 ? 'top' : ''}">
                <span class="predicted-name">${d.name}</span>
                <span class="predicted-match">${d.matchCount}/${identified.length} cartas</span>
            </div>
        `).join('');
    } else {
        els.predictedDeck.innerHTML = '<span class="predicted-empty">Identifique cartas para prever o deck</span>';
    }
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
    div.innerHTML = entry.type === 'reset'
        ? `<span class="entry-cost">🔄</span><span class="entry-remaining">→ 10</span><span class="entry-time">${entry.time}</span>`
        : `<span class="entry-cost">-${entry.cost}</span><span class="entry-name">${entry.cardName}</span><span class="entry-remaining">→ ${entry.remaining}</span><span class="entry-time">${entry.time}</span>`;

    els.historyList.prepend(div);
    const entries = els.historyList.querySelectorAll('.history-entry');
    if (entries.length > 30) entries[entries.length - 1].remove();
}

function clearHistoryUI() {
    els.historyList.innerHTML = '<div class="history-empty">Nenhuma jogada registrada</div>';
}

function formatTime(s) {
    const m = Math.floor(Math.max(0, s) / 60);
    const sec = Math.floor(Math.max(0, s) % 60);
    return m + ':' + sec.toString().padStart(2, '0');
}

function normalizeCardName(value) {
    return (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeVoiceText(value) {
    return normalizeCardName(value)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseSpokenCostToken(token) {
    const words = {
        zero: 0,
        um: 1,
        uma: 1,
        dois: 2,
        duas: 2,
        tres: 3,
        quatro: 4,
        cinco: 5,
        seis: 6,
        sete: 7,
        oito: 8,
        nove: 9,
        dez: 10,
    };

    if (/^\d+$/.test(token)) {
        const n = parseInt(token, 10);
        return n >= 0 && n <= 10 ? n : null;
    }

    return Object.prototype.hasOwnProperty.call(words, token) ? words[token] : null;
}

function extractVoiceCostAndCard(transcript) {
    const normalized = normalizeVoiceText(transcript);
    if (!normalized) return null;

    const tokens = normalized.split(' ');
    let cost = null;
    let costTokenIndex = -1;

    for (let i = 0; i < tokens.length; i++) {
        const maybe = parseSpokenCostToken(tokens[i]);
        if (maybe !== null) {
            cost = maybe === 0 ? 10 : maybe;
            costTokenIndex = i;
            break;
        }
    }

    if (cost === null || cost < 1 || cost > 10) {
        return { normalized, cost: null, cardText: normalized };
    }

    let cardTokens = tokens.filter((_, i) => i !== costTokenIndex);
    cardTokens = cardTokens.filter(t => t !== 'elixir' && t !== 'de' && t !== 'custo' && t !== 'carta');

    return {
        normalized,
        cost,
        cardText: cardTokens.join(' ').trim(),
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
    const aa = normalizeCardName(a);
    const bb = normalizeCardName(b);
    if (!aa || !bb) return 0;
    if (aa === bb) return 1;
    const maxLen = Math.max(aa.length, bb.length) || 1;
    const base = 1 - (levenshteinDistance(aa, bb) / maxLen);
    if (aa.includes(bb) || bb.includes(aa)) return Math.max(base, 0.78);
    return Math.max(0, base);
}

function updateVoiceUI(mode, message, transcript) {
    if (!els.voiceStatus || !els.voiceStatusText || !els.voiceTranscript || !els.voiceDot || !els.btnVoice) return;

    const shouldShow = state.voice.supported || mode === 'error';
    els.voiceStatus.style.display = shouldShow ? 'block' : 'none';
    els.voiceStatus.className = `voice-status ${mode}`;
    els.btnVoice.className = `btn-voice ${mode === 'listening' ? 'listening' : ''}`;
    els.voiceDot.className = `voice-dot ${mode}`;
    els.voiceStatusText.textContent = message || 'Voz inativa';
    els.voiceTranscript.textContent = transcript || '';

    if (mode === 'error') {
        els.btnVoice.classList.add('error');
    } else {
        els.btnVoice.classList.remove('error');
    }
}

function getVoiceContextCandidates(cost) {
    if (state.identifying && state.identifyCost === cost && state._currentCards && state._currentCards.length > 0) {
        return state._currentCards;
    }

    const identified = state.opponentDeck.map(c => c.name);
    return getScoredCardsForCost(cost, null, identified);
}

function getBestVoiceCardMatch(cardText, cost) {
    const candidates = getVoiceContextCandidates(cost);
    if (!candidates || candidates.length === 0) return null;

    const normalizedInput = normalizeCardName(cardText);
    if (!normalizedInput) return null;

    const ranked = candidates
        .map(card => ({ card, confidence: nameSimilarity(normalizedInput, card.name) }))
        .sort((a, b) => b.confidence - a.confidence);

    const top = ranked[0];
    if (!top) return null;

    if (top.confidence >= VOICE_HIGH_CONFIDENCE) {
        return { card: top.card, confidence: top.confidence, inferred: false };
    }

    if (top.confidence >= VOICE_LOW_CONFIDENCE) {
        return { card: top.card, confidence: top.confidence, inferred: true };
    }

    return { card: candidates[0], confidence: top.confidence, inferred: true };
}

function tryApplyVoicePendingCard() {
    if (!state.identifying) return;
    if (!state.voice.pendingCost || state.voice.pendingCost !== state.identifyCost) return;
    if (!state.voice.pendingCardText) return;

    const match = getBestVoiceCardMatch(state.voice.pendingCardText, state.identifyCost);
    if (!match || !match.card) {
        updateVoiceUI('processing', `Elixir ${state.identifyCost} registrado. Complete a carta manualmente.`);
        return;
    }

    const label = match.inferred ? 'mais provável' : 'reconhecida';
    const selectedName = match.card.name;
    state.voice.pendingCardText = '';
    state.voice.pendingCost = null;
    confirmCardIdentification(selectedName);
    updateVoiceUI('processing', `Carta ${label}: ${selectedName}.`, selectedName);
}

function handleVoicePlay(cost, cardText) {
    if (!state.running) {
        updateVoiceUI('error', 'Inicie a partida antes de usar voz.');
        return;
    }

    if (state.deckComplete) {
        let preferredName = null;
        if (cardText) {
            const options = state.opponentDeck.filter(c => c.cost === cost);
            const byName = options
                .map(c => ({ c, confidence: nameSimilarity(cardText, c.name) }))
                .sort((a, b) => b.confidence - a.confidence)[0];
            preferredName = byName ? byName.c.name : null;
        }
        subtractElixir(cost, preferredName);
        updateVoiceUI('processing', `Elixir ${cost} registrado${preferredName ? ` com ${preferredName}` : ''}.`);
        return;
    }

    state.voice.pendingCost = cost;
    state.voice.pendingCardText = cardText || '';
    subtractElixir(cost);

    if (cardText) {
        tryApplyVoicePendingCard();
    } else {
        updateVoiceUI('processing', `Elixir ${cost} registrado. Complete a carta manualmente.`);
    }
}

function processVoiceTranscript(transcript) {
    const parsed = extractVoiceCostAndCard(transcript);
    if (!parsed) return;

    const now = Date.now();
    if (parsed.normalized === state.voice.lastAcceptedText && (now - state.voice.lastAcceptedAt) < VOICE_DEBOUNCE_MS) {
        return;
    }

    state.voice.lastAcceptedText = parsed.normalized;
    state.voice.lastAcceptedAt = now;

    if (state.identifying && !parsed.cost && parsed.cardText) {
        state.voice.pendingCost = state.identifyCost;
        state.voice.pendingCardText = parsed.cardText;
        tryApplyVoicePendingCard();
        return;
    }

    if (!parsed.cost) {
        updateVoiceUI('error', 'Fale um custo entre 1 e 10.');
        return;
    }

    handleVoicePlay(parsed.cost, parsed.cardText);
}
