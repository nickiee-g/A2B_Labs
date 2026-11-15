(() => {
  let saved = null;
  let savedCollapsed = false;
  try {
    saved = localStorage.getItem('a2b-theme');
    savedCollapsed = localStorage.getItem('a2b-queue-collapsed') === '1';
  } catch (_) {}
  const initial = saved === 'light' || saved === 'dark' ? saved : 'dark';

  if (savedCollapsed) {
    document.documentElement.classList.add('ws-sidebar-collapsed');
  }

  const syncThemedComponents = value => {
    document.querySelectorAll('.vs-dropzone').forEach(dz => {
      if (value === 'light') dz.setAttribute('data-theme', 'light');
      else dz.removeAttribute('data-theme');
    });
    document.querySelectorAll('.vs-chat-input').forEach(ci => {
      if (value === 'dark') ci.setAttribute('data-theme', 'dark');
      else ci.removeAttribute('data-theme');
    });
  };

  const apply = value => {
    document.documentElement.dataset.theme = value;
    document.documentElement.classList.toggle('dark', value === 'dark');
    document.documentElement.style.colorScheme = value;
    syncThemedComponents(value);
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.innerHTML = value === 'dark'
        ? '<span class="theme-dot" aria-hidden="true">☀</span><span>Light mode</span>'
        : '<span class="theme-dot" aria-hidden="true">☾</span><span>Dark mode</span>';
      b.setAttribute('aria-label', value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
    window.dispatchEvent(new CustomEvent('a2b-theme-change', { detail: { theme: value } }));
  };

  window.a2bSyncThemeElements = () => {
    syncThemedComponents(document.documentElement.dataset.theme || initial);
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

    initAppParallaxBackground();
  });

  function initAppParallaxBackground() {
    if (!document.body || document.querySelector('.app-parallax-bg')) return;

    const bg = document.createElement('div');
    bg.className = 'app-parallax-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = `
      <img
        class="app-parallax-plate app-parallax-far"
        src="https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/sentry-sky.webp"
        alt=""
        decoding="async"
      />
      <div class="app-parallax-scrim"></div>
      <img
        class="app-parallax-plate app-parallax-near"
        src="https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/sentry-fg.webp"
        alt=""
        decoding="async"
      />
      <div class="app-parallax-grain"></div>
      <div class="app-parallax-vignette"></div>
      <div class="app-parallax-light-veil"></div>
    `;
    document.body.prepend(bg);

    const farEl = bg.querySelector('.app-parallax-far');
    const nearEl = bg.querySelector('.app-parallax-near');
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const isMotionPaused = () => {
      let storedPaused = false;
      try { storedPaused = localStorage.getItem('a2b-motion') === 'paused'; } catch (_) {}
      return reduceMotionQuery.matches || storedPaused;
    };

    let targetPx = 0;
    let targetPy = 0;
    let curPx = 0;
    let curPy = 0;
    let rafId = 0;

    const applyFrame = () => {
      rafId = 0;
      const paused = isMotionPaused();
      bg.classList.toggle('is-motion-paused', paused);

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const p = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;

      if (paused) {
        farEl.style.translate = '0px 0px';
        farEl.style.scale = '1.10';
        nearEl.style.translate = '0px 0px';
        nearEl.style.scale = '1.08';
        return;
      }

      curPx += (targetPx - curPx) * 0.08;
      curPy += (targetPy - curPy) * 0.08;

      const farX = (curPx * -10).toFixed(2);
      const farY = (p * -60 + curPy * -4).toFixed(2);
      const farScale = (1.10 - p * 0.04).toFixed(4);

      const nearX = (curPx * 22).toFixed(2);
      const nearY = (p * 120 + curPy * 8).toFixed(2);
      const nearScale = (1.08 + p * 0.06).toFixed(4);

      farEl.style.translate = `${farX}px ${farY}px`;
      farEl.style.scale = farScale;
      nearEl.style.translate = `${nearX}px ${nearY}px`;
      nearEl.style.scale = nearScale;

      if (Math.abs(targetPx - curPx) > 0.002 || Math.abs(targetPy - curPy) > 0.002) {
        rafId = requestAnimationFrame(applyFrame);
      }
    };

    const scheduleFrame = () => {
      if (!rafId) rafId = requestAnimationFrame(applyFrame);
    };

    window.addEventListener('pointermove', (e) => {
      if (isMotionPaused()) return;
      targetPx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      targetPy = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      scheduleFrame();
    }, { passive: true });

    window.addEventListener('scroll', scheduleFrame, { passive: true });
    window.addEventListener('resize', scheduleFrame, { passive: true });
    if (reduceMotionQuery.addEventListener) {
      reduceMotionQuery.addEventListener('change', scheduleFrame);
    }
    document.querySelectorAll('[data-motion-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => requestAnimationFrame(scheduleFrame));
    });

    applyFrame();
  }
})();
