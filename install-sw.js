if ('serviceWorker' in navigator) {
  const host = (window.location.hostname || '').toLowerCase();
  const allowServiceWorker = window.location.protocol === 'https:'
    && host !== 'localhost'
    && host !== '127.0.0.1';

  if (allowServiceWorker) {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => {
        reg.update();
        console.log('SW registrado', reg);
      })
      .catch((err) => console.log('Erro no SW', err));
  } else {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister().catch(() => {})))
      .catch(() => {});
  }
}
