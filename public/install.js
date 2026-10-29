// "Instale a app": registers the service worker (sw.js) and offers to install Bet62 on the phone.
// Android and desktop Chrome: the browser's own install, from a button. iPhone and iPad (Safari has
// none): how to add it to the home screen. Not shown in the installed app, nor again for two weeks
// once closed (a year once installed).
(() => {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (installed) return;

  const KEY = 'bet62_install_hide';
  const hidden = () => { try { return Date.now() < Number(localStorage.getItem(KEY) || 0); } catch { return false; } };
  const hide = (days) => { try { localStorage.setItem(KEY, String(Date.now() + days * 86_400_000)); } catch { /* ignore */ } };
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Safari only: Chrome, Firefox and the apps' own browsers on iOS cannot add to the home screen the same way.
  const iosSafari = ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios|instagram|fban|fbav|line\/|gsa\//i.test(ua);
  const SHARE = '<svg class="install-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  let prompt = null;

  function show(body, button) {
    if (hidden() || document.querySelector('.install-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'install-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Instalar a app Bet62');
    bar.innerHTML = `<img src="/icon-192.png?v=2" alt="" width="44" height="44"><div class="install-text"><b>Instale a app Bet62</b><span>${body}</span></div>`
      + `${button ? '<button type="button" class="install-go" data-install="go">Instalar</button>' : ''}<button type="button" class="install-close" data-install="close" aria-label="Fechar">×</button>`;
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-install]');
      if (!b) return;
      if (b.dataset.install === 'go' && prompt) {
        prompt.prompt();
        const { outcome } = await prompt.userChoice.catch(() => ({}));
        prompt = null;
        hide(outcome === 'accepted' ? 365 : 14);
      } else hide(14);
      bar.remove();
    });
    document.body.append(bar);
  }

  // After the intro and a first look at the page.
  const later = (fn) => setTimeout(fn, 8000);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    later(() => show('Acesso direto no ecrã inicial, em ecrã inteiro.', true));
  });
  window.addEventListener('appinstalled', () => { hide(365); document.querySelector('.install-bar')?.remove(); });
  if (iosSafari) later(() => show(`Toque em ${SHARE} Partilhar e depois em <b>Adicionar ao ecrã principal</b>.`, false));
})();
