(() => {
  const VIDEO_SRC = 'https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/meshnet.mp4';
  const PLAYBACK_RATE = 0.72;

  let motionPaused = false;
  try {
    motionPaused =
      localStorage.getItem('a2b-motion') === 'paused' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  function syncMotionButtons() {
    document.querySelectorAll('[data-motion-toggle]').forEach(btn => {
      btn.textContent = motionPaused ? '▶ Play background' : '⏸ Pause background';
      btn.setAttribute('aria-pressed', String(motionPaused));
    });
  }

  function mountMeshnetBackground() {
    syncMotionButtons();

    // Remove any legacy background wrappers if present
    document.querySelectorAll('.ang-fluid-bg-wrap, .app-parallax-bg, .ang-meshnet-bg').forEach(el => el.remove());

    const wrap = document.createElement('div');
    wrap.className = 'ang-meshnet-bg';
    wrap.setAttribute('aria-hidden', 'true');

    const glow = document.createElement('div');
    glow.className = 'ang-meshnet-glow';

    const video = document.createElement('video');
    video.className = 'ang-meshnet-video';
    video.src = VIDEO_SRC;
    video.muted = true;
    video. defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'auto');

    const grain = document.createElement('div');
    grain.className = 'ang-meshnet-grain';

    const vignette = document.createElement('div');
    vignette.className = 'ang-meshnet-vignette';

    wrap.appendChild(glow);
    wrap.appendChild(video);
    wrap.appendChild(grain);
    wrap.appendChild(vignette);
    document.body.insertBefore(wrap, document.body.firstChild);

    function applyPlaybackState() {
      video.playbackRate = PLAYBACK_RATE;
      if (motionPaused) {
        try {
          video.pause();
        } catch (_) {}
      } else {
        const p = video.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    }

    video.addEventListener('loadedmetadata', () => {
      video.playbackRate = PLAYBACK_RATE;
    });

    video.addEventListener('canplay', () => {
      applyPlaybackState();
    });

    window.addEventListener('load', () => {
      applyPlaybackState();
    });

    applyPlaybackState();

    document.querySelectorAll('[data-motion-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        motionPaused = !motionPaused;
        try {
          localStorage.setItem('a2b-motion', motionPaused ? 'paused' : 'running');
        } catch (_) {}
        syncMotionButtons();
        applyPlaybackState();
      });
    });

    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotionQuery.addEventListener) {
      reduceMotionQuery.addEventListener('change', e => {
        let hasExplicitPref = false;
        try {
          hasExplicitPref = Boolean(localStorage.getItem('a2b-motion'));
        } catch (_) {}
        if (!hasExplicitPref) {
          motionPaused = e.matches;
          syncMotionButtons();
          applyPlaybackState();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountMeshnetBackground);
  } else {
    mountMeshnetBackground();
  }
})();
