// ─── Events ──────────────────────────────────────────────

if (els.btnVoice) {
    els.btnVoice.addEventListener('click', () => toggleVoiceListening());
}

els.cardButtons.addEventListener('click', e => {
    const btn = e.target.closest('.card-btn');
    if (!btn) return;
    const cost = parseInt(btn.dataset.cost, 10);
    subtractElixir(cost);
    btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
});

els.btnResetElixir.addEventListener('click', () => resetElixirToMax());
els.btnStart.addEventListener('click', () => startMatch());

els.cycleContainer.addEventListener('click', e => {
    const cardEl = e.target.closest('.cycle-card');
    if (!cardEl) return;
    if (cardEl.dataset.cardName) {
        removeCardFromCycle(cardEl.dataset.cardName);
    }
});

els.opponentDeckContainer.addEventListener('click', e => {
    const identifiedSlot = e.target.closest('.deck-slot:not(.empty):not(.predicted)');
    if (identifiedSlot && identifiedSlot.dataset.cardName) {
        const removedMatch = state.opponentDeck.find(c => c.name === identifiedSlot.dataset.cardName && c.confirmed);
        if (removedMatch) {
            removedMatch.confirmed = false;
            updateOpponentDeckUI();
            updatePredictedDeck();
        }
        return;
