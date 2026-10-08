// The intro shown when the site opens: five seconds, once per visit (tab), skipped with a tap.
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
    setTimeout(function () { el.remove(); }, 300);
  }
  setTimeout(close, 5000);
  el.addEventListener('click', close);
})();
