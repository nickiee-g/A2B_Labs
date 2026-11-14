(() => {
  let motionPaused = false;
  try {
    motionPaused = localStorage.getItem('a2b-motion') === 'paused' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  function syncMotionButtons() {
    document.querySelectorAll('[data-motion-toggle]').forEach(btn => {
      btn.textContent = motionPaused ? '▶ Play background' : '⏸ Pause background';
      btn.setAttribute('aria-pressed', String(motionPaused));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncMotionButtons();
    document.querySelectorAll('[data-motion-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        motionPaused = !motionPaused;
        try { localStorage.setItem('a2b-motion', motionPaused ? 'paused' : 'active'); } catch (_) {}
        syncMotionButtons();
      });
    });

    // Update live AI status badge across landing & info headers
    fetch('/api/status').then(r => r.json()).then(s => {
      document.querySelectorAll('[data-live-engine]').forEach(el => {
        el.textContent = s.configured ? 'AI Ready' : 'Sample Mode';
      });
    }).catch(() => {});

    // Telemetry top scanline beam
    const beam = document.getElementById('telemetry-beam');
    if (beam) {
      let pos = -220;
      const stepBeam = () => {
        if (!motionPaused && !document.hidden) {
          pos += 3.5;
          if (pos > window.innerWidth + 220) pos = -220;
          beam.style.transform = `translateX(${pos}px)`;
        }
        requestAnimationFrame(stepBeam);
      };
      requestAnimationFrame(stepBeam);
    }

    // Initialize 3D Macro Bench if container & THREE exist
    const container = document.getElementById('threejs-macro-bench');
    if (!container || typeof window.THREE === 'undefined') return;

    const THREE = window.THREE;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0f);
    scene.fog = new THREE.FogExp2(0x0b0b0f, 0.055);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(0, 2.55, 5.15);
    camera.lookAt(0, 0.12, 0);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (_) {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.30);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const coolRimLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
    coolRimLight.position.set(-5, 3, 2);
    scene.add(coolRimLight);

    const amberRim = new THREE.PointLight(0xffb347, 2.4, 8);
    amberRim.position.set(2.5, 0.4, 3.5);
    scene.add(amberRim);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x07080c,
      roughness: 0.14,
      metalness: 0.82,
      transparent: true,
      opacity: 0.88
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    let gridHelper = new THREE.GridHelper(24, 48, 0x26242b, 0x131318);
    gridHelper.position.y = 0.002;
    scene.add(gridHelper);

    // Silicon Package Hierarchy
    const chipGroup = new THREE.Group();
    scene.add(chipGroup);

    const substrateMat = new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.48, metalness: 0.42 });
    const substrate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2.4), substrateMat);
    substrate.position.y = 0.04;
    chipGroup.add(substrate);

    const pinsMat = new THREE.MeshStandardMaterial({ color: 0xc9944d, roughness: 0.28, metalness: 0.95 });
    const pins = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.02, 2.44), pinsMat);
    pins.position.y = 0.01;
    chipGroup.add(pins);

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.24, metalness: 0.84 });
    const heatSpreader = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 2.1), ringMat);
    heatSpreader.position.y = 0.10;
    chipGroup.add(heatSpreader);

    const dieWidth = 1.05;
    const dieMat = new THREE.MeshStandardMaterial({ color: 0x090a10, roughness: 0.05, metalness: 0.96 });
    const die = new THREE.Mesh(new THREE.BoxGeometry(dieWidth, 0.05, dieWidth), dieMat);
    die.position.y = 0.15;
    chipGroup.add(die);

    const hbmGeo = new THREE.BoxGeometry(0.38, 0.045, 0.45);
    const hbmMat = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.16, metalness: 0.76 });
    const bumpMat = new THREE.MeshStandardMaterial({ color: 0xd9a752, roughness: 0.2, metalness: 0.9 });

    [
      [-0.78, 0.13, -0.45],
      [-0.78, 0.13, 0.45],
      [0.78, 0.13, -0.45],
      [0.78, 0.13, 0.45]
    ].forEach(pos => {
      const hbm = new THREE.Mesh(hbmGeo, hbmMat);
      hbm.position.set(pos[0], pos[1], pos[2]);
      chipGroup.add(hbm);

      const bump = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.01, 0.04), bumpMat);
      bump.position.set(pos[0], pos[1] + 0.02, pos[2] > 0 ? pos[2] - 0.23 : pos[2] + 0.23);
      chipGroup.add(bump);
    });

    // Mirrored reflection clone
    const mirrorGroup = chipGroup.clone();
    mirrorGroup.scale.y = -1;
    mirrorGroup.position.y = -0.02;
    mirrorGroup.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.16;
      }
    });
    scene.add(mirrorGroup);

    chipGroup.rotation.y = Math.PI / 4;
    mirrorGroup.rotation.y = Math.PI / 4;

    // Signal trace perimeter
    const halfW = (dieWidth * 0.92) / 2;
    const tracePoints = [
      new THREE.Vector3(-halfW, 0.185, -halfW),
      new THREE.Vector3(halfW, 0.185, -halfW),
      new THREE.Vector3(halfW, 0.185, halfW),
      new THREE.Vector3(-halfW, 0.185, halfW)
    ];
    const curve = new THREE.CurvePath();
    for (let i = 0; i < 4; i++) {
      curve.add(new THREE.LineCurve3(tracePoints[i], tracePoints[(i + 1) % 4]));
    }

    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.036), streakMat);
    streak.rotation.x = -Math.PI / 2;
    chipGroup.add(streak);

    const tailMat = new THREE.MeshBasicMaterial({
      color: 0xff8c00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending
    });
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.026), tailMat);
    tail.rotation.x = -Math.PI / 2;
    chipGroup.add(tail);

    const traceLight = new THREE.PointLight(0xffb347, 3.2, 2.2, 2);
    traceLight.position.set(0, 0.35, 0);
    chipGroup.add(traceLight);

    const mirrorLight = new THREE.PointLight(0xffb347, 1.2, 1.8, 2);
    mirrorLight.position.set(0, -0.35, 0);
    mirrorGroup.add(mirrorLight);

    // Apply Dark / Light Bench Theme
    function applySceneTheme(mode) {
      const isLight = mode === 'light';
      const bgHex = isLight ? 0xf2eee5 : 0x0b0b0f;
      scene.background.setHex(bgHex);
      scene.fog.color.setHex(bgHex);
      scene.fog.density = isLight ? 0.042 : 0.055;

      groundMat.color.setHex(isLight ? 0xe5dfd2 : 0x07080c);
      groundMat.roughness = isLight ? 0.28 : 0.14;
      groundMat.metalness = isLight ? 0.25 : 0.82;
      groundMat.opacity = isLight ? 0.92 : 0.88;

      scene.remove(gridHelper);
      gridHelper = new THREE.GridHelper(
        24,
        48,
        isLight ? 0xbfb4a0 : 0x26242b,
        isLight ? 0xd8d0c1 : 0x131318
      );
      gridHelper.position.y = 0.002;
      scene.add(gridHelper);

      substrateMat.color.setHex(isLight ? 0x252730 : 0x101116);
      ringMat.color.setHex(isLight ? 0x3a3e4a : 0x1a1c24);
      dieMat.color.setHex(isLight ? 0x171922 : 0x090a10);
      hbmMat.color.setHex(isLight ? 0x2a2d38 : 0x14161f);

      ambientLight.intensity = isLight ? 0.95 : 0.30;
      keyLight.intensity = isLight ? 1.55 : 1.25;
      coolRimLight.color.setHex(isLight ? 0xfef3c7 : 0x93c5fd);
      coolRimLight.intensity = isLight ? 0.65 : 0.75;
      amberRim.color.setHex(isLight ? 0xd97706 : 0xffb347);
      amberRim.intensity = isLight ? 1.8 : 2.4;

      streakMat.color.setHex(isLight ? 0xd97706 : 0xffb347);
      streakMat.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      tailMat.color.setHex(isLight ? 0xb45309 : 0xff8c00);
      tailMat.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      traceLight.color.setHex(isLight ? 0xd97706 : 0xffb347);

      renderer.render(scene, camera);
    }

    applySceneTheme(document.documentElement.dataset.theme || 'dark');
    window.addEventListener('a2b-theme-change', e => applySceneTheme(e.detail?.theme || 'dark'));

    // Mouse micro-orbit
    let targetYaw = 0, targetPitch = 0, currentYaw = 0, currentPitch = 0;
    window.addEventListener('mousemove', e => {
      if (motionPaused) return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetYaw = nx * 0.055;
      targetPitch = -ny * 0.035;
    });

    const easeInOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const clock = new THREE.Clock();
    let elapsedAccum = 0;

    function animate() {
      requestAnimationFrame(animate);
      if (document.hidden) return;
      const delta = Math.min(clock.getDelta(), 0.1);

      if (!motionPaused) {
        elapsedAccum += delta;
        const k = 1.0 - Math.exp(-4.0 * delta);
        currentYaw += (targetYaw - currentYaw) * k;
        currentPitch += (targetPitch - currentPitch) * k;

        camera.position.x = 5.15 * Math.sin(currentYaw);
        camera.position.z = 5.15 * Math.cos(currentYaw);
        camera.position.y = 2.55 + currentPitch * 2.0;
        camera.lookAt(0, 0.12, 0);
      }

      const loopT = (elapsedAccum % 4.2) / 4.2;
      const easedT = easeInOutCubic(loopT);
      const tailT = (Math.max(0, loopT - 0.038)) % 1.0;
      const easedTailT = easeInOutCubic(tailT);

      const pt = curve.getPointAt(easedT);
      const tangent = curve.getTangentAt(easedT);
      const tailPt = curve.getPointAt(easedTailT);

      if (pt && tangent) {
        streak.position.set(pt.x, pt.y + 0.005, pt.z);
        streak.rotation.z = Math.atan2(tangent.z, tangent.x);
        tail.position.set(tailPt.x, tailPt.y + 0.004, tailPt.z);
        tail.rotation.z = streak.rotation.z;
        traceLight.position.set(pt.x * 1.12, pt.y + 0.18, pt.z * 1.12);
        mirrorLight.position.set(pt.x * 1.12, -(pt.y + 0.18), pt.z * 1.12);
      }

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    });
  });
})();
