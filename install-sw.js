if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then((reg) => console.log('SW registrad', reg))
    .catch((err) => console.log('Erro no SW', err));
}
