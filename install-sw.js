if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then((reg) => {
      reg.update();
      console.log('SW registrado', reg);
    })
    .catch((err) => console.log('Erro no SW', err));
}
