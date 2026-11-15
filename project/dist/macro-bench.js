(() => {
  const FAR_SRC = 'https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/sentry-sky.webp';
  const NEAR_SRC = 'https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/sentry-fg.webp';

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPaused = false;
  try {
    motionPaused = localStorage.getItem('a2b-motion') === 'paused' || reduceMotionQuery.matches;
  } catch (_) {}

  function syncMotionButtons() {
    document.querySelectorAll('[data-motion-toggle]').forEach(btn => {
      btn.textContent = motionPaused ? '▶ Play background' : '⏸ Pause background';
      btn.setAttribute('aria-pressed', String(motionPaused));
    });
  }

  function mountParallaxBackground() {
    syncMotionButtons();

    document.querySelectorAll('.ang-meshnet-bg, .ang-fluid-bg-wrap, .app-parallax-bg').forEach(el => el.remove());

    const bg = document.createElement('div');
    bg.className = 'app-parallax-bg';
    bg.setAttribute('aria-hidden', 'true');

    const isHome = document.body.classList.contains('home-bench-page');
    const taglineMarkup = isHome
      ? '<div class="app-parallax-tagline"><p class="app-parallax-tagline-text">See it before it moves.</p></div>'
      : '';

    bg.innerHTML = `
      <img class="app-parallax-plate app-parallax-far" src="${FAR_SRC}" alt="" decoding="async" />
      <div class="app-parallax-scrim"></div>
      ${taglineMarkup}
      <img class="app-parallax-plate app-parallax-near" src="${NEAR_SRC}" alt="" decoding="async" />
      <div class="app-parallax-grain"></div>
      <div class="app-parallax-vignette"></div>
      <div class="app-parallax-light-veil"></div>
    `;
    document.body.insertBefore(bg, document.body.firstChild);

    const farEl = bg.querySelector('.app-parallax-far');
    const nearEl = bg.querySelector('.app-parallax-near');
    const typeEl = bg.querySelector('.app-parallax-tagline');

    let targetPx = 0;
    let targetPy = 0;
    let curPx = 0;
    let curPy = 0;
    let rafId = 0;

    function applyFrame() {
      rafId = 0;
      bg.classList.toggle('is-motion-paused', motionPaused);

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const p = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;

      if (motionPaused) {
        farEl.style.translate = '0px 0px';
        farEl.style.scale = '1.10';
        nearEl.style.translate = '0px 0px';
        nearEl.style.scale = '1.08';
        if (typeEl) {
          typeEl.style.translate = '0px 0px';
          typeEl.style.opacity = '1';
        }
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

      if (typeEl) {
        const typeX = (curPx * -16).toFixed(2);
        const typeY = (p * -180 + curPy * -6).toFixed(2);
        const typeOpacity = Math.max(0.05, 1 - (Math.min(0.62, p) / 0.62) * 0.95).toFixed(3);
        typeEl.style.translate = `${typeX}px ${typeY}px`;
        typeEl.style.opacity = typeOpacity;
      }

      if (Math.abs(targetPx - curPx) > 0.002 || Math.abs(targetPy - curPy) > 0.002) {
        rafId = requestAnimationFrame(applyFrame);
      }
    }

    function scheduleFrame() {
      if (!rafId) rafId = requestAnimationFrame(applyFrame);
    }

    window.addEventListener('pointermove', e => {
      if (motionPaused) return;
      targetPx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      targetPy = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      scheduleFrame();
    }, { passive: true });

    window.addEventListener('scroll', scheduleFrame, { passive: true });
    window.addEventListener('resize', scheduleFrame, { passive: true });

    document.querySelectorAll('[data-motion-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        motionPaused = !motionPaused;
        try {
          localStorage.setItem('a2b-motion', motionPaused ? 'paused' : 'running');
        } catch (_) {}
        syncMotionButtons();
        scheduleFrame();
      });
    });

    if (reduceMotionQuery.addEventListener) {
      reduceMotionQuery.addEventListener('change', e => {
        let hasExplicit = false;
        try {
          hasExplicit = Boolean(localStorage.getItem('a2b-motion'));
        } catch (_) {}
        if (!hasExplicit) {
          motionPaused = e.matches;
          syncMotionButtons();
          scheduleFrame();
        }
      });
    }

    applyFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountParallaxBackground);
  } else {
    mountParallaxBackground();
  }
})();
