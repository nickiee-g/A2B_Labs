(() => {
  let saved = null;
  try { saved = localStorage.getItem('a2b-theme'); } catch (_) {}
  const initial = saved === 'light' || saved === 'dark' ? saved : 'dark';

  const apply = value => {
    document.documentElement.dataset.theme = value;
    document.documentElement.classList.toggle('dark', value === 'dark');
    document.documentElement.style.colorScheme = value;
    document.querySelectorAll('.vs-dropzone').forEach(dz => {
      if (value === 'light') dz.setAttribute('data-theme', 'light');
      else dz.removeAttribute('data-theme');
    });
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.innerHTML = value === 'dark'
        ? '<span class="theme-dot" aria-hidden="true">☀</span><span>Light mode</span>'
        : '<span class="theme-dot" aria-hidden="true">☾</span><span>Dark mode</span>';
      b.setAttribute('aria-label', value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
    window.dispatchEvent(new CustomEvent('a2b-theme-change', { detail: { theme: value } }));
  };

  apply(initial);

  document.addEventListener('DOMContentLoaded', () => {
    apply(document.documentElement.dataset.theme || initial);
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('a2b-theme', next); } catch (_) {}
        apply(next);
      });
    });
  });
})();
