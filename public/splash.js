// The intro shown when the site opens: brief, once per visit (tab), skipped with a tap or button.
// A classic script right after the intro's markup, so a repeat visit removes it before it is painted.
(function () {
  var el = document.getElementById('splash');
  if (!el) return;
  var seen = false;
  try { seen = sessionStorage.getItem('bet62_intro') === '1'; sessionStorage.setItem('bet62_intro', '1'); } catch (e) { /* private mode */ }
  if (seen) { el.remove(); return; }
  document.documentElement.classList.add('splash-on');
  var done = false;
  function close() {
    if (done) return;
    done = true;
    el.classList.add('out');
    document.documentElement.classList.remove('splash-on');
    document.removeEventListener('keydown', onKeyDown);
    setTimeout(function () { el.remove(); }, 300);
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeyDown);
  // It ends as soon as the site is ready (the games loaded), never before 0.6 s nor after 1.4 s.
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shownAt = Date.now();
  document.addEventListener('bet62:ready', function () { setTimeout(close, Math.max(0, 600 - (Date.now() - shownAt))); });
  setTimeout(close, reducedMotion ? 450 : 1400);
  el.addEventListener('click', close);
})();
