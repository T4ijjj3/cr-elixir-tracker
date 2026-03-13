    }

    const slot = e.target.closest('.deck-slot.predicted');
    if (slot && slot.dataset.cardName) {
        confirmPredictedCard(slot.dataset.cardName);
    }
});

document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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
        if (btn) { btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash'); }
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
