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
const MATCH_DURATION_S = 180;
const DOUBLE_ELIXIR_AT_S = 60;
const TICK_INTERVAL_MS = 50;
const DECK_SIZE = 8;
const HAND_SIZE = 4;
const VOICE_DEBOUNCE_MS = 600;
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
        engine: 'whisper',
        socketState: 'offline',
        chunksSent: 0,
        transcriptsReceived: 0,
        lastTranscript: '',
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
    state.lastTick = Date.now();
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
    ['valkiria', 'valquiria'],
    ['valquiria', 'valquiria'],
    ['mega cavaleiro', 'megacavaleiro'],
    ['mega', 'megacavaleiro'],
    ['pekka', 'p e k k a'],
    ['p e k k a', 'p e k k a'],
    ['peka', 'p e k k a'],
    ['pecca', 'p e k k a'],
    ['peca', 'p e k k a'],
    ['pecka', 'p e k k a'],
    ['pekaa', 'p e k k a'],
    ['peka pekka', 'p e k k a'],
    ['x besta', 'x besta'],
    ['zap', 'choque zap'],
    ['tronco', 'o tronco'],
    ['bruxa mae', 'bruxa mae'],
    ['bruxa sombria', 'bruxa sombria'],
    ['bebe dragao', 'bebe dragao'],
    ['arqueiro magico', 'arqueiro magico'],
    ['mago eletrico', 'mago eletrico'],
    ['principe das trevas', 'principe das trevas'],
    ['espirito eletrico', 'espirito eletrico'],
    ['espirito de fogo', 'espirito de fogo'],
    ['espirito de gelo', 'espirito de gelo'],
    ['espirito curador', 'espirito curador'],
];

function normalizeVoiceCardText(value) {
    let text = normalizeLooseText(value);
    if (!text) return '';

    VOICE_CARD_ALIAS_PAIRS.forEach(([from, to]) => {
        const fromNorm = normalizeLooseText(from);
        const toNorm = normalizeLooseText(to);
        if (!fromNorm || !toNorm) return;
        const pattern = new RegExp(`\\b${fromNorm}\\b`, 'g');
        text = text.replace(pattern, toNorm);
    });

    return text
        .replace(/\b(carta|carta de|custo|elixir|solta|joga|jogar|vai|usa|usar|manda|de)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeVoiceText(value) {
    return normalizeVoiceCardText(value)
    // Ensure tokens like "bruxa5" or "5bruxa" are separated for parsing.
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseSpokenCostToken(token) {
    const cleanedToken = (token || '').toString().trim().replace(/[^a-z0-9]/g, '');
    if (!cleanedToken) return null;

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

    if (/^\d+$/.test(cleanedToken)) {
        const n = parseInt(cleanedToken, 10);
        return n >= 0 && n <= 10 ? n : null;
    }

    return Object.prototype.hasOwnProperty.call(words, cleanedToken) ? words[cleanedToken] : null;
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
        cardText: normalizeVoiceCardText(cardTokens.join(' ').trim()),
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

function updateVoiceUI(mode, message, transcript) {
    if (!els.voiceStatus || !els.voiceStatusText || !els.voiceTranscript || !els.voiceDot || !els.btnVoice) return;

    const shouldShow = state.voice.supported || mode === 'error';
    els.voiceStatus.style.display = shouldShow ? 'block' : 'none';
    els.voiceStatus.className = `voice-status ${mode}`;
    els.btnVoice.className = `btn-voice ${mode === 'listening' ? 'listening' : ''}`;
    els.voiceDot.className = `voice-dot ${mode}`;
    els.voiceStatusText.textContent = message || 'Voz inativa';

    if (typeof transcript === 'string' && transcript.trim()) {
        state.voice.lastTranscript = transcript.trim();
    }

    const debugText = `motor:${state.voice.engine || 'n/a'} | socket:${state.voice.socketState} | chunks:${state.voice.chunksSent} | ia:${state.voice.transcriptsReceived}`;
    els.voiceTranscript.textContent = state.voice.lastTranscript
        ? `${state.voice.lastTranscript}\n${debugText}`
        : debugText;

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

    const identified = state.opponentDeck.filter(c => c.confirmed).map(c => c.name);
    return getScoredCardsForCost(cost, null, identified);
}

function getBestVoiceCardMatch(cardText, cost) {
    const candidates = getVoiceContextCandidates(cost);
    if (!candidates || candidates.length === 0) return null;

    const normalizedInput = normalizeVoiceCardText(cardText);
    if (!normalizedInput) return null;

    const aliasExact = candidates.find(card => normalizeVoiceCardText(card.name) === normalizedInput);
    if (aliasExact) {
        return { card: aliasExact, confidence: 1, inferred: false };
    }

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

    return null;
}

function tryApplyVoicePendingCard() {
    if (!state.identifying) return;
    if (!state.voice.pendingCost || state.voice.pendingCost !== state.identifyCost) return;
    if (!state.voice.pendingCardText) return;

    const match = getBestVoiceCardMatch(state.voice.pendingCardText, state.identifyCost);
    if (!match || !match.card) {
        state.voice.pendingCardText = '';
        state.voice.pendingCost = null;
        updateVoiceUI('processing', `Elixir ${state.identifyCost} registrado. Nao chutei carta para evitar erro.`);
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
        startMatch();
        updateVoiceUI('processing', 'Partida iniciada por voz.');
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

function processVoiceTranscript(transcript, resultIndex = -1) {
    const parsed = extractVoiceCostAndCard(transcript);
    if (!parsed) return;

    const now = Date.now();
    const isSameUtteranceByIndex = resultIndex !== -1 && resultIndex === state.voice.lastResultIndex;
    
    // We treat as the same utterance ONLY if it's exactly the same Web Speech result block
    const isSameUtterance = isSameUtteranceByIndex;

    if (isSameUtterance) {
        if (parsed.normalized === state.voice.lastAcceptedText) return;

        state.voice.lastAcceptedText = parsed.normalized;
        if (resultIndex !== -1) state.voice.lastResultIndex = resultIndex;

        if (parsed.cardText) {
            if (state.identifying) {
                state.voice.pendingCardText = parsed.cardText;
                tryApplyVoicePendingCard();
            } else if (state.history.length > 0) {
                const lastEntry = state.history[0];
                if (lastEntry.type === 'card' && lastEntry.cost === parsed.cost) {
                    const match = getBestVoiceCardMatch(parsed.cardText, parsed.cost);
                    if (match && match.card && match.card.name !== lastEntry.cardName) {
                        
                        if (!state.deckComplete && lastEntry.cardName !== parsed.cost.toString()) {
                            const oldCard = state.opponentDeck.find(c => c.name === lastEntry.cardName);
                            if (oldCard) {
                                oldCard.name = match.card.name;
                                const cardData = ALL_CARDS.find(c => c.name === oldCard.name);
                                if (cardData) oldCard.type = cardData.type;
                            }
                        }

                        lastEntry.cardName = match.card.name;
                        
                        if (typeof state.cardCycle !== 'undefined' && state.cardCycle.length > 0) {
                            const lastCycle = state.cardCycle[state.cardCycle.length - 1];
                            if (lastCycle.cost === parsed.cost) {
                                lastCycle.name = match.card.name;
                                if (typeof rebuildCyclePrediction === 'function') {
                                    rebuildCyclePrediction();
                                }
                            }
                        }

                        updateAll();
                        updateVoiceUI('processing', `Carta corrigida p/: ${match.card.name}`);
                    }
                }
            }
        }
        return;
    }

    state.voice.lastAcceptedText = parsed.normalized;
    state.voice.lastAcceptedAt = now;
    state.voice.lastResultIndex = resultIndex;

    if (state.identifying && !parsed.cost && parsed.cardText) {
        state.voice.pendingCost = state.identifyCost;
        state.voice.pendingCardText = parsed.cardText;
        tryApplyVoicePendingCard();
        return;
    }

    if (!parsed.cost && !state.identifying) {
        let inferredCost = null;
        let inferredName = null;
        const norm = normalizeVoiceCardText(parsed.cardText);
        
        if (norm) {
            let exactMatch = state.opponentDeck.find(c => normalizeVoiceCardText(c.name) === norm);
            if (!exactMatch && typeof ALL_CARDS !== 'undefined') {
                exactMatch = ALL_CARDS.find(c => normalizeVoiceCardText(c.name) === norm);
            }
            if (exactMatch) {
                inferredCost = exactMatch.cost;
                inferredName = exactMatch.name;
            }
        }

        if (inferredCost) {
            parsed.cost = inferredCost;
            parsed.cardText = inferredName; // Auto correction
        } else {
            updateVoiceUI('error', 'Fale um custo entre 1 e 10 ou nome exato.');
            return;
        }
    }

    handleVoicePlay(parsed.cost, parsed.cardText);
}
let mediaRecorder;
let audioChunks = [];
let voiceSocket;
let audioContext;
let analyser;
let microphone;
let startRecordingWordTimeout;
let silenceTimer;
let isRecordingWord = false;
let vadFrameId;
const VOICE_SILENCE_MS = 900;
const VOICE_RMS_THRESHOLD = 0.018;
const WHISPER_FALLBACK_MS = 6500;
let whisperFallbackTimer;
const VOICE_ENGINE_PREFERENCE = 'browser-first';

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

function initVoiceRecognition() {
    const hasBrowserSpeech = !!getBrowserSpeechRecognitionCtor();
    const isFileProtocol = window.location.protocol === 'file:';
    const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    state.voice.supported = !isFileProtocol && isSecure && hasBrowserSpeech;
    if (!state.voice.supported) {
        if (els.btnVoice) els.btnVoice.disabled = true;
        if (isFileProtocol || !isSecure) {
            updateVoiceUI('error', 'Abra em http://localhost:8080 para liberar o microfone.');
        } else {
            updateVoiceUI('error', 'Este navegador nao suporta captura de voz nativa.');
        }
        return;
    }

    state.voice.engine = 'browser';
    updateVoiceUI('idle', 'Modo browser pronto. Clique em VOZ.');
}

async function connectWhisperSocket() {
    return new Promise((resolve) => {
        state.voice.socketState = 'connecting';
        updateVoiceUI('processing', 'Conectando ao servidor local...');
        voiceSocket = new WebSocket('ws://localhost:8765');
        
        voiceSocket.onopen = () => {
            state.voice.socketState = 'online';
            console.log('🔗 Conectado ao Servidor Whisper Local');
            updateVoiceUI('idle', 'IA Whisper pronta. Clique em VOZ.');
            resolve(true);
        };
        
        voiceSocket.onmessage = (event) => {
            const transcript = event.data;
            if (transcript.trim()) {
                state.voice.transcriptsReceived += 1;
                updateVoiceUI('listening', 'Lendo IA...', transcript);
                processVoiceTranscript(transcript);
                
                // Keep UI updated briefly before switching to listening again if still active
                if (state.voice.listening && !state.voice.manuallyStopped) {
                    setTimeout(() => updateVoiceUI('listening', 'Escutando você...'), 2000);
                }
            }
        };

        voiceSocket.onerror = () => {
            state.voice.socketState = 'error';
            updateVoiceUI('error', 'Sem conexão com Servidor Python.');
            resolve(false);
        };

        voiceSocket.onclose = () => {
            state.voice.socketState = 'offline';
            updateVoiceUI('idle', state.voice.listening ? 'Voz desconectada.' : 'Voz inativa');
            console.log('Servidor Whisper desconectado.');
        }
    });
}

function stopAllAudio() {
    clearTimeout(whisperFallbackTimer);
    cancelAnimationFrame(vadFrameId);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (microphone) microphone.disconnect();
    if (audioContext) audioContext.close();
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearTimeout(silenceTimer);
    clearTimeout(startRecordingWordTimeout);
    isRecordingWord = false;
    audioChunks = [];
}

function stopBrowserRecognition() {
    if (!state.voice.recognition) return;
    const recognition = state.voice.recognition;
    state.voice.recognition = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
        recognition.stop();
    } catch (err) {
        console.warn('Nao foi possivel parar reconhecimento do navegador.', err);
    }
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
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (!result || !result[0]) continue;
            const transcript = (result[0].transcript || '').trim();
            if (!transcript) continue;

            state.voice.transcriptsReceived += 1;
            updateVoiceUI('listening', 'Lendo voz do navegador...', transcript);
            processVoiceTranscript(transcript, i);
        }
    };

    recognition.onerror = (event) => {
        console.warn('SpeechRecognition erro', event.error);
        if (!state.voice.listening || state.voice.manuallyStopped) return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            updateVoiceUI('error', 'Permissao do microfone negada no navegador.');
            state.voice.listening = false;
            return;
        }
        updateVoiceUI('processing', 'Reconectando reconhecimento local...');
    };

    recognition.onend = () => {
        if (!state.voice.listening || state.voice.manuallyStopped || state.voice.engine !== 'browser') return;
        setTimeout(() => {
            if (!state.voice.listening || state.voice.manuallyStopped) return;
            try {
                recognition.start();
            } catch (err) {
                console.warn('Falha ao reiniciar SpeechRecognition.', err);
                updateVoiceUI('error', 'Falha no reconhecimento local do navegador.');
                state.voice.listening = false;
            }
        }, 300);
    };

    state.voice.recognition = recognition;
    try {
        recognition.start();
        updateVoiceUI('listening', 'Modo browser ativo. Escutando voce...');
        return true;
    } catch (err) {
        console.error('Falha ao iniciar SpeechRecognition.', err);
        updateVoiceUI('error', 'Falha ao iniciar reconhecimento local.');
        state.voice.recognition = null;
        return false;
    }
}

function switchToBrowserFallback(reason) {
    if (!state.voice.listening || state.voice.manuallyStopped || state.voice.engine === 'browser') return;

    stopAllAudio();
    if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
        voiceSocket.close();
    }

    state.voice.socketState = 'fallback';
    state.voice.engine = 'browser';
    updateVoiceUI('processing', reason || 'Whisper sem resposta. Ativando modo browser...');

    const started = startBrowserRecognition();
    if (!started) {
        state.voice.listening = false;
    }
}

function startSpeechRecording() {
    if (!mediaRecorder || state.voice.manuallyStopped || !state.voice.listening) return;
    if (mediaRecorder.state !== 'inactive') return;

    audioChunks = [];
    mediaRecorder.start();
    updateVoiceUI('listening', '(Gravando...)');
    isRecordingWord = true;
}

function stopSpeechRecording() {
    clearTimeout(silenceTimer);
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

    isRecordingWord = false;
    updateVoiceUI('processing', 'IA processando...');
    mediaRecorder.stop();
}

async function startVADRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        audioContext = new AudioContext();
        await audioContext.resume();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        const timeDomainData = new Uint8Array(analyser.fftSize);

        const mimeType = getSupportedRecorderMimeType();
        mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0 && voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
                state.voice.chunksSent += 1;
                const blob = new Blob([e.data], { type: mediaRecorder.mimeType || e.data.type || 'audio/webm' });
                voiceSocket.send(blob);
                updateVoiceUI('processing', 'Audio enviado para IA...');
            }
        };
        mediaRecorder.onstop = () => {
            clearTimeout(silenceTimer);
        };
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error', event.error || event);
            updateVoiceUI('error', 'Falha ao capturar audio do microfone.');
            state.voice.listening = false;
        };

        function detectSpeech() {
            if (state.voice.manuallyStopped || !state.voice.listening) return;

            analyser.getByteTimeDomainData(timeDomainData);
            let sumSquares = 0;
            for (let i = 0; i < timeDomainData.length; i++) {
                const normalized = (timeDomainData[i] - 128) / 128;
                sumSquares += normalized * normalized;
            }

            const rms = Math.sqrt(sumSquares / timeDomainData.length);

            if (rms >= VOICE_RMS_THRESHOLD) {
                clearTimeout(silenceTimer);
                if (!isRecordingWord) {
                    startSpeechRecording();
                }

                silenceTimer = setTimeout(() => {
                    stopSpeechRecording();
                }, VOICE_SILENCE_MS);
            }

            vadFrameId = requestAnimationFrame(detectSpeech);
        }

        state.voice.listening = true;
        updateVoiceUI('listening', 'Escutando voce...');
        detectSpeech();

    } catch(err) {
        console.error(err);
        updateVoiceUI('error', 'Permissao do microfone negada ou indisponivel.');
        state.voice.listening = false;
    }
}

async function toggleVoiceListening() {
    if (!state.voice.supported) return;

    if (state.voice.listening) {
        state.voice.manuallyStopped = true;
        state.voice.listening = false;

        stopBrowserRecognition();
        
        stopAllAudio();
        
        if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
            voiceSocket.close();
        }
        
        updateVoiceUI('idle', 'Voz inativa');
        return;
    }

    state.voice.manuallyStopped = false;
    state.voice.chunksSent = 0;
    state.voice.transcriptsReceived = 0;
    state.voice.lastTranscript = '';

    const hasBrowserSpeech = !!getBrowserSpeechRecognitionCtor();
    if (true) {
        state.voice.engine = 'browser';
        state.voice.socketState = 'offline';
        state.voice.listening = true;
        updateVoiceUI('processing', 'Iniciando reconhecimento do navegador...');
        const started = startBrowserRecognition();
        if (!started) state.voice.listening = false;
        return;
    }

    clearTimeout(whisperFallbackTimer);
    whisperFallbackTimer = setTimeout(() => {
        if (state.voice.engine !== 'whisper' || !state.voice.listening || state.voice.manuallyStopped) return;
        if (state.voice.transcriptsReceived === 0 && state.voice.chunksSent >= 1) {
            switchToBrowserFallback('Whisper sem resposta. Trocando para modo browser...');
        }
    }, WHISPER_FALLBACK_MS);
}

// ─── Events ──────────────────────────────────────────────

if (els.btnVoice) {
    els.btnVoice.addEventListener('click', (e) => {
        if (e.target && e.target.blur) e.target.blur();
        toggleVoiceListening();
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
    const cardEl = e.target.closest('.cycle-card');
    if (!cardEl) return;
    if (cardEl.dataset.cardName) {
        removeCardFromCycle(cardEl.dataset.cardName);
    }
});

document.querySelector('.deck-section').addEventListener('click', e => {
    const identifiedSlot = e.target.closest('.deck-slot:not(.empty):not(.predicted)');
    if (identifiedSlot && identifiedSlot.dataset.cardName) {
        const removedMatch = state.opponentDeck.find(c => c.name === identifiedSlot.dataset.cardName && c.confirmed);
        if (removedMatch) {
            removedMatch.confirmed = false;
            updateOpponentDeckUI();
            updatePredictedDeck();
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

function getCardImage(cardName) {
    if (!cardName) return '';
    const targetName = normalizeCardName(cardName);
    const card = ALL_CARDS.find(c => normalizeCardName(c.name) === targetName);
    return card && card.image ? card.image : '';
}

// ─── Init ────────────────────────────────────────────────
updateAll();
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
