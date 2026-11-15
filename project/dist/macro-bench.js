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

  // Procedural studio environment map so mirror silicon die & 24k gold pins reflect crisp light panels
  function buildStudioEnvMap(THREE, renderer) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x010102);

      const addPanel = (w, h, colorHex, intensity, pos, look) => {
        const c = new THREE.Color(colorHex).multiplyScalar(intensity);
        const mat = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(pos[0], pos[1], pos[2]);
        m.lookAt(look[0], look[1], look[2]);
        envScene.add(m);
      };

      // Sharp diagonal studio softbox (creates the half-obsidian / half-chrome diagonal reflection on the die)
      addPanel(8.5, 1.9, 0xfff8ed, 2.2, [3.8, 6.2, 3.2], [0, 0, 0]);
      // Subtle secondary rim strip
      addPanel(1.2, 6.0, 0xdbeafe, 0.85, [-5.2, 3.8, -2.5], [0, 0, 0]);
      // Rich 24k warm-gold side kicker so SMD capacitor banks glint warm gold
      addPanel(4.2, 2.4, 0xffaa2b, 2.0, [3.5, 1.4, 4.0], [0, 0, 0]);
      addPanel(3.5, 1.8, 0xd97706, 1.4, [-3.5, 1.2, 3.5], [0, 0, 0]);

      const rt = pmrem.fromScene(envScene, 0.02);
      pmrem.dispose();
      return rt.texture;
    } catch (_) {
      return null;
    }
  }

  // Procedural etched PCB substrate textures (45-degree micro-traces, vias, corner fiducials)
  function createSubstrateTextures(THREE) {
    const size = 1024;
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const ctx = albedoCanvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bctx = bumpCanvas.getContext('2d');

    // Deep matte obsidian substrate base
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, size, size);
    bctx.fillStyle = '#383838';
    bctx.fillRect(0, 0, size, size);

    // Subtle woven fiberglass micro-grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.006)';
    ctx.lineWidth = 1;
    for (let i = 0; i < size; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    // Outer chamfer trim frame
    ctx.strokeStyle = 'rgba(180, 128, 52, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, size - 36, size - 36);

    const half = size / 2;

    // Etched 45° / 90° radial circuit traces fanning from the central die out toward edges
    const drawTraceBank = (rotRad) => {
      ctx.save();
      bctx.save();
      ctx.translate(half, half);
      bctx.translate(half, half);
      ctx.rotate(rotRad);
      bctx.rotate(rotRad);

      for (let i = -22; i <= 22; i++) {
        const x0 = i * 11.5;
        const y0 = 195;
        const bend = 250 + (Math.abs(i) % 5) * 24;
        const spread = x0 * 1.48;
        const yEnd = 472;

        const isGoldTrace = (Math.abs(i) % 4 === 0);
        ctx.strokeStyle = isGoldTrace ? 'rgba(135, 92, 36, 0.22)' : 'rgba(18, 20, 25, 0.90)';
        ctx.lineWidth = isGoldTrace ? 2.0 : 1.5;

        bctx.strokeStyle = isGoldTrace ? '#b8b8b8' : '#787878';
        bctx.lineWidth = 2.2;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, bend);
        ctx.lineTo(spread, bend + Math.abs(spread - x0));
        ctx.lineTo(spread, yEnd);
        ctx.stroke();

        bctx.beginPath();
        bctx.moveTo(x0, y0);
        bctx.lineTo(x0, bend);
        bctx.lineTo(spread, bend + Math.abs(spread - x0));
        bctx.lineTo(spread, yEnd);
        bctx.stroke();

        // Micro-via pad at trace end
        if (Math.abs(i) % 2 === 0) {
          ctx.fillStyle = isGoldTrace ? 'rgba(217, 169, 92, 0.35)' : 'rgba(65, 74, 94, 0.5)';
          ctx.beginPath();
          ctx.arc(spread, yEnd, 3.2, 0, Math.PI * 2);
          ctx.fill();

          bctx.fillStyle = '#d0d0d0';
          bctx.beginPath();
          bctx.arc(spread, yEnd, 3.2, 0, Math.PI * 2);
          bctx.fill();
        }
      }

      // Corner gold fiducial alignment markers
      ctx.strokeStyle = 'rgba(175, 125, 52, 0.28)';
      ctx.lineWidth = 2;
      ctx.strokeRect(394, 394, 30, 30);
      ctx.fillStyle = 'rgba(175, 125, 52, 0.34)';
      ctx.fillRect(405, 405, 8, 8);

      ctx.restore();
      bctx.restore();
    };

    drawTraceBank(0);
    drawTraceBank(Math.PI / 2);
    drawTraceBank(Math.PI);
    drawTraceBank((3 * Math.PI) / 2);

    const map = new THREE.CanvasTexture(albedoCanvas);
    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    map.anisotropy = 8;
    bumpMap.anisotropy = 8;
    return { map, bumpMap };
  }

  // Soft radial glow texture for forge sparks & die light bar bloom
  function createGlowTexture(THREE, innerRgba, midRgba) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, innerRgba || 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, midRgba || 'rgba(255, 255, 255, 0.85)');
    gradient.addColorStop(0.6, 'rgba(255, 190, 95, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
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

    // Inject global 3D background stage across every page
    let container = document.getElementById('threejs-macro-bench');
    if (typeof window.THREE === 'undefined') return;
    if (!container) {
      const wrap = document.createElement('div');
      wrap.className = 'ang-three-wrap ang-global-three-bg';
      wrap.setAttribute('aria-hidden', 'true');
      container = document.createElement('div');
      container.id = 'threejs-macro-bench';
      wrap.appendChild(container);
      document.body.insertBefore(wrap, document.body.firstChild);
    }

    const THREE = window.THREE;
    const isHomeUploadPage = Boolean(document.getElementById('home-step1-content'));
    const sizes = {
      width: container.clientWidth || window.innerWidth,
      height: container.clientHeight || window.innerHeight
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    scene.fog = new THREE.FogExp2('#000000', 0.015);

    const camera = new THREE.PerspectiveCamera(42, sizes.width / sizes.height, 0.1, 100);
    camera.position.set(0, 1.75, 4.1);
    scene.add(camera);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
    } catch (_) {
      return;
    }
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    container.appendChild(renderer.domElement);

    const envMap = buildStudioEnvMap(THREE, renderer);
    if (envMap) {
      scene.environment = envMap;
    }

    /* ========================================================================
       1. LAOCOÖN LIQUID-BRONZE-TO-SAPPHIRE BREATHING WAVE SHADER (CHILD OF CAMERA)
       ======================================================================== */
    const shaderUniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(sizes.width, sizes.height) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uScroll: { value: 0 },
      uLightMode: { value: 0 }
    };

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;
      uniform float uScroll;
      uniform float uLightMode;

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
        float aspect = uResolution.x / uResolution.y;

        float time = uTime * 0.08;
        float scroll = uScroll;

        float angle1 = 0.6;
        float angle2 = -0.7;
        float angle3 = 1.2;

        float freq1 = 2.4;
        float freq2 = 3.2;
        float freq3 = 4.0;

        vec2 warpedUv = uv;
        float scrollDeform = scroll * 5.0;

        warpedUv.x += sin(uv.y * 2.5 + time * 0.2 + scrollDeform) * 0.35;
        warpedUv.y += cos(uv.x * 2.5 - time * 0.15 - scrollDeform * 0.8) * 0.35;

        warpedUv.x += sin(uv.y * 1.2 - time * 0.1 - scrollDeform * 1.5) * 0.25;
        warpedUv.y += cos(uv.x * 1.2 + time * 0.18 + scrollDeform * 1.2) * 0.25;

        vec2 scrollDrift = vec2(scroll * 0.04, -scroll * 0.02);
        vec2 mouseShift = vec2(uMouse.x * aspect * 0.05, uMouse.y * 0.05);
        warpedUv += scrollDrift + mouseShift;

        vec2 dir1 = vec2(cos(angle1), sin(angle1));
        vec2 dir2 = vec2(cos(angle2), sin(angle2));
        vec2 dir3 = vec2(cos(angle3), sin(angle3));

        float w1 = sin(dot(warpedUv, dir1) * freq1 + time * 1.0);
        float w2 = cos(dot(warpedUv, dir2) * freq2 - time * 1.4 + w1 * 0.4);
        float w3 = sin(dot(warpedUv, dir3) * freq3 + time * 1.8 + w2 * 0.5);

        float waveField = w1 * 0.50 + w2 * 0.35 + w3 * 0.15;

        float wideSheen = pow(max(0.0, 1.0 - abs(waveField - 0.1)), 2.5);
        float crispSpecular = pow(max(0.0, 1.0 - abs(waveField - 0.15)), 8.0);
        float crest = wideSheen * 0.5 + crispSpecular * 0.9;

        // Top Palette (Scroll = 0.0): Rich Molten Bronze
        vec3 c0_shadow = vec3(0.0010, 0.0006, 0.0004);
        vec3 c0_wave1  = vec3(0.085, 0.040, 0.015);
        vec3 c0_wave2  = vec3(0.050, 0.022, 0.008);
        vec3 c0_crest  = vec3(0.45, 0.30, 0.18);

        // Bottom Palette (Scroll = 1.0): Deep Sapphire Blue
        vec3 c1_shadow = vec3(0.0004, 0.0006, 0.0012);
        vec3 c1_wave1  = vec3(0.015, 0.035, 0.065);
        vec3 c1_wave2  = vec3(0.008, 0.020, 0.045);
        vec3 c1_crest  = vec3(0.18, 0.35, 0.55);

        float t = smoothstep(0.0, 1.0, scroll);
        vec3 colShadow = mix(c0_shadow, c1_shadow, t);
        vec3 colWave1  = mix(c0_wave1, c1_wave1, t);
        vec3 colWave2  = mix(c0_wave2, c1_wave2, t);
        vec3 colCrest  = mix(c0_crest, c1_crest, t);

        vec3 darkColor = colShadow;
        darkColor = mix(darkColor, colWave2, smoothstep(-0.6, 0.2, waveField));
        darkColor = mix(darkColor, colWave1, smoothstep(0.0, 0.8, waveField));
        darkColor += colCrest * crest * 1.4;
        float vignette = 1.0 - dot(uv, uv) * 0.12;
        darkColor *= vignette;

        // Crisp macOS Frosted Daylight silver-silk variant when Light Mode is toggled
        vec3 lightBase = vec3(0.955, 0.961, 0.973);
        vec3 lightFold = vec3(0.896, 0.910, 0.936);
        vec3 lightCrest = vec3(1.00, 0.994, 0.980);
        vec3 lightColor = mix(lightBase, lightFold, smoothstep(-0.5, 0.6, waveField));
        lightColor = mix(lightColor, lightCrest, clamp(crest * 0.65, 0.0, 1.0));

        vec3 finalColor = mix(darkColor, lightColor, uLightMode);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const bgMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: shaderUniforms,
      depthWrite: false,
      depthTest: false
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), bgMaterial);
    bgMesh.position.set(0.0, 0.0, -10.0);
    bgMesh.renderOrder = -10;
    camera.add(bgMesh);

    /* ========================================================================
       2. DRAMATIC CHIAROSCURO LIGHTING
       ======================================================================== */
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.08);
    scene.add(ambientLight);

    const keyLight = new THREE.SpotLight('#fff7eb', 1.45);
    keyLight.position.set(4, 6, 3);
    keyLight.angle = Math.PI / 4;
    keyLight.penumbra = 0.9;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#ffdca8', 0.68);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight('#ffbe6b', 0.35);
    fillLight.position.set(-2, -4, 2);
    scene.add(fillLight);

    /* ========================================================================
       3. FORGE SPARKS (450 ADDITIVE RISING PARTICLES — 60% MOLTEN / 40% ICY)
       ======================================================================== */
    const sparkCount = 450;
    const sparkData = [];
    let sparkParticles = null;
    let sparkMaterial = null;

    function createSparks() {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(sparkCount * 3);
      const colors = new Float32Array(sparkCount * 3);

      for (let i = 0; i < sparkCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 6.5;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 5.0 - 0.5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 6.5;

        if (Math.random() < 0.6) {
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 0.42 + Math.random() * 0.18;
          colors[i * 3 + 2] = 0.06 + Math.random() * 0.1;
        } else {
          colors[i * 3] = 0.55 + Math.random() * 0.15;
          colors[i * 3 + 1] = 0.82 + Math.random() * 0.12;
          colors[i * 3 + 2] = 1.0;
        }

        sparkData.push({
          speedX: (Math.random() - 0.5) * 0.4,
          speedY: 0.15 + Math.random() * 0.3,
          speedZ: (Math.random() - 0.5) * 0.4,
          swaySpeed: 0.5 + Math.random() * 1.5,
          swayRadius: 0.05 + Math.random() * 0.15,
          phase: Math.random() * Math.PI * 2
        });
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      sparkMaterial = new THREE.PointsMaterial({
        size: 0.032,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: createGlowTexture(THREE, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.85)')
      });

      sparkParticles = new THREE.Points(geometry, sparkMaterial);
      scene.add(sparkParticles);
    }
    createSparks();

    /* ========================================================================
       4. HIGH-DETAIL 3D SILICON COMPUTER CHIP (MATCHING REFERENCE PHOTO)
          - Etched matte-obsidian PCB substrate with 45° micro-traces
          - 4 dense perimeter banks of 24k gold SMD capacitors/pins (216 units)
          - Raised chamfered silver bevel + mirror-polished central silicon die
          - Glowing molten-amber light bar gliding around the die bevel
          - Underside gold BGA pad array
       ======================================================================== */
    const modelPivot = new THREE.Group();
    scene.add(modelPivot);

    const chipAssembly = new THREE.Group();
    // Base diamond orientation matching the reference macro shot
    chipAssembly.rotation.y = Math.PI / 4;
    modelPivot.add(chipAssembly);

    const { map: pcbAlbedo, bumpMap: pcbBump } = createSubstrateTextures(THREE);

    // 4a. Dark etched PCB substrate package
    const substrateW = 2.72;
    const substrateH = 0.068;
    const substrateMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a40,
      map: pcbAlbedo,
      bumpMap: pcbBump,
      bumpScale: 0.014,
      roughness: 0.56,
      metalness: 0.28,
      envMapIntensity: 0.35
    });
    const substrateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(substrateW, substrateH, substrateW),
      substrateMat
    );
    substrateMesh.castShadow = true;
    substrateMesh.receiveShadow = true;
    chipAssembly.add(substrateMesh);

    // Subtle dark-gold copper core sandwich stripe around outer substrate edge
    const coreTrimMat = new THREE.MeshStandardMaterial({
      color: 0xb87e2e,
      roughness: 0.32,
      metalness: 0.92,
      envMapIntensity: 1.0
    });
    const coreTrim = new THREE.Mesh(
      new THREE.BoxGeometry(substrateW + 0.006, 0.010, substrateW + 0.006),
      coreTrimMat
    );
    coreTrim.position.y = -0.012;
    chipAssembly.add(coreTrim);

    // 4b. Glossy dark epoxy underfill skirt around central silicon die
    const underfillMat = new THREE.MeshStandardMaterial({
      color: 0x030305,
      roughness: 0.12,
      metalness: 0.55,
      envMapIntensity: 0.5
    });
    const underfill = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.022, 1.18),
      underfillMat
    );
    underfill.position.y = substrateH * 0.5 + 0.010;
    underfill.receiveShadow = true;
    chipAssembly.add(underfill);

    // 4c. Chamfered metallic die bevel (4-sided frustum rotated 45° to form square bevel)
    const dieBevelMat = new THREE.MeshStandardMaterial({
      color: 0x8e96a3,
      roughness: 0.18,
      metalness: 0.96,
      envMapIntensity: 1.35
    });
    const dieBevelGeo = new THREE.CylinderGeometry(0.755, 0.805, 0.058, 4, 1);
    dieBevelGeo.rotateY(Math.PI / 4);
    const dieBevel = new THREE.Mesh(dieBevelGeo, dieBevelMat);
    dieBevel.position.y = substrateH * 0.5 + 0.044;
    dieBevel.castShadow = true;
    dieBevel.receiveShadow = true;
    chipAssembly.add(dieBevel);

    // 4d. Mirror-polished dark-chrome central silicon die top surface
    const dieSize = 1.055;
    const dieTopY = substrateH * 0.5 + 0.074;
    const dieMirrorMat = new THREE.MeshStandardMaterial({
      color: 0x262930,
      roughness: 0.045,
      metalness: 0.99,
      envMapIntensity: 1.65
    });
    const dieMirror = new THREE.Mesh(
      new THREE.BoxGeometry(dieSize, 0.012, dieSize),
      dieMirrorMat
    );
    dieMirror.position.y = dieTopY;
    dieMirror.castShadow = true;
    dieMirror.receiveShadow = true;
    chipAssembly.add(dieMirror);

    // 4e. 4 Dense Perimeter Banks of 24k Gold SMD Capacitors / Pins (matching photo)
    const goldCapMat = new THREE.MeshStandardMaterial({
      color: 0xe6a128,
      emissive: 0x241300,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.96,
      envMapIntensity: 1.45
    });
    const ceramicBodyMat = new THREE.MeshStandardMaterial({
      color: 0x3d2812,
      roughness: 0.42,
      metalness: 0.45,
      envMapIntensity: 0.6
    });

    const colsPerSide = 18;
    const rowsPerSide = 3;
    const totalCaps = 4 * colsPerSide * rowsPerSide;

    // Gold terminal block (slightly wider/taller than ceramic center so each SMD has twin gold ends)
    const goldBlockGeo = new THREE.BoxGeometry(0.036, 0.034, 0.062);
    const ceramicGeo = new THREE.BoxGeometry(0.028, 0.030, 0.026);
    const goldCapsInstanced = new THREE.InstancedMesh(goldBlockGeo, goldCapMat, totalCaps);
    const ceramicInstanced = new THREE.InstancedMesh(ceramicGeo, ceramicBodyMat, totalCaps);
    goldCapsInstanced.castShadow = true;
    goldCapsInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let instIdx = 0;
    const baseCapY = substrateH * 0.5 + 0.017;

    for (let side = 0; side < 4; side++) {
      const angle = side * (Math.PI / 2);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      for (let r = 0; r < rowsPerSide; r++) {
        const distFromCenter = 0.675 + r * 0.082;
        for (let c = 0; c < colsPerSide; c++) {
          const along = -0.495 + (c / (colsPerSide - 1)) * 0.99;
          // Subtle deterministic height variation for micro-realism
          const hScale = 0.86 + ((c * 7 + r * 13 + side * 5) % 5) * 0.08;

          const lx = along * cosA - distFromCenter * sinA;
          const lz = along * sinA + distFromCenter * cosA;

          dummy.position.set(lx, baseCapY * hScale + 0.003, lz);
          dummy.rotation.set(0, -angle, 0);
          dummy.scale.set(1, hScale, 1);
          dummy.updateMatrix();

          goldCapsInstanced.setMatrixAt(instIdx, dummy.matrix);
          ceramicInstanced.setMatrixAt(instIdx, dummy.matrix);
          instIdx++;
        }
      }
    }
    goldCapsInstanced.instanceMatrix.needsUpdate = true;
    ceramicInstanced.instanceMatrix.needsUpdate = true;
    chipAssembly.add(goldCapsInstanced);
    chipAssembly.add(ceramicInstanced);

    // 4f. Underside BGA gold contact pads (visible on edge/tilt)
    const bgaGrid = 14;
    const bgaPositions = [];
    for (let gx = 0; gx < bgaGrid; gx++) {
      for (let gz = 0; gz < bgaGrid; gz++) {
        if (gx > 2 && gx < bgaGrid - 3 && gz > 2 && gz < bgaGrid - 3) continue;
        bgaPositions.push([
          -1.18 + (gx / (bgaGrid - 1)) * 2.36,
          -1.18 + (gz / (bgaGrid - 1)) * 2.36
        ]);
      }
    }
    const bgaGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.012, 8);
    const bgaInstanced = new THREE.InstancedMesh(bgaGeo, goldCapMat, bgaPositions.length);
    bgaPositions.forEach(([bx, bz], i) => {
      dummy.position.set(bx, -substrateH * 0.5 - 0.005, bz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bgaInstanced.setMatrixAt(i, dummy.matrix);
    });
    bgaInstanced.instanceMatrix.needsUpdate = true;
    chipAssembly.add(bgaInstanced);

    // 4g. Glowing Molten-Amber Edge Signal Bar circling the raised silicon die bevel
    const halfDie = dieSize * 0.485;
    const traceY = dieTopY + 0.010;
    const traceCorners = [
      new THREE.Vector3(-halfDie, traceY, -halfDie),
      new THREE.Vector3(halfDie, traceY, -halfDie),
      new THREE.Vector3(halfDie, traceY, halfDie),
      new THREE.Vector3(-halfDie, traceY, halfDie)
    ];
    const diePerimeterCurve = new THREE.CurvePath();
    for (let i = 0; i < 4; i++) {
      diePerimeterCurve.add(new THREE.LineCurve3(traceCorners[i], traceCorners[(i + 1) % 4]));
    }

    const barCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending
    });
    const signalBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.018, 0.028), barCoreMat);
    chipAssembly.add(signalBar);

    const barHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffa826,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const signalHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.14), barHaloMat);
    signalHalo.rotation.x = -Math.PI / 2;
    chipAssembly.add(signalHalo);

    const bloomSpriteMat = new THREE.SpriteMaterial({
      map: createGlowTexture(THREE, 'rgba(255,244,200,0.95)', 'rgba(255,170,45,0.55)'),
      color: 0xffb347,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const signalBloomSprite = new THREE.Sprite(bloomSpriteMat);
    signalBloomSprite.scale.set(0.65, 0.36, 1);
    chipAssembly.add(signalBloomSprite);

    const diePulseLight = new THREE.PointLight(0xffb347, 2.6, 2.6, 2);
    chipAssembly.add(diePulseLight);

    // Frame chip size & vertical position:
    // On Homepage (`/`), sits centered right beneath the bottom edge of the upload card;
    // on Workspace / Summary / About, framed cleanly in the stage behind the frosted glass.
    const chipScale = isHomeUploadPage ? 0.62 : 0.84;
    modelPivot.scale.setScalar(chipScale);
    modelPivot.position.set(0, isHomeUploadPage ? -0.78 : -0.32, 0);

    /* ========================================================================
       5. DARK / LIGHT THEME ADAPTATION
       ======================================================================== */
    function applySceneTheme(mode) {
      const isLight = mode === 'light';
      shaderUniforms.uLightMode.value = isLight ? 1.0 : 0.0;
      const bgHex = isLight ? 0xf5f5f7 : 0x000000;
      scene.background.setHex(bgHex);
      scene.fog.color.setHex(bgHex);
      scene.fog.density = isLight ? 0.006 : 0.015;

      ambientLight.intensity = isLight ? 0.78 : 0.08;
      keyLight.intensity = isLight ? 2.15 : 1.45;
      rimLight.intensity = isLight ? 0.95 : 0.68;
      renderer.toneMappingExposure = isLight ? 1.28 : 1.35;

      if (sparkMaterial) {
        sparkMaterial.opacity = isLight ? 0.30 : 0.85;
        sparkMaterial.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      }
      barCoreMat.color.setHex(isLight ? 0xd97706 : 0xfff3c4);
      barCoreMat.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      barHaloMat.opacity = isLight ? 0.32 : 0.65;
      barHaloMat.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
      bloomSpriteMat.opacity = isLight ? 0.38 : 0.82;
    }

    applySceneTheme(document.documentElement.dataset.theme || 'dark');
    window.addEventListener('a2b-theme-change', e => applySceneTheme(e.detail?.theme || 'dark'));

    /* ========================================================================
       6. INTERACTION & LAOCOÖN ORBIT + SPARKS + WAVE ANIMATION LOOP
       ======================================================================== */
    let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0;
    let currentScroll = 0;

    window.addEventListener('mousemove', e => {
      if (motionPaused) return;
      targetMouseX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      targetMouseY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    });

    const easeInOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const clock = new THREE.Clock();
    let elapsedAccum = 0;

    // Position camera immediately on first frame so there is no jump
    const baseRadius = isHomeUploadPage ? 4.05 : 4.2;
    const baseCamY = isHomeUploadPage ? 1.58 : 1.75;
    const lookAtTargetY = isHomeUploadPage ? -0.18 : -0.15;
    camera.position.set(0, baseCamY, baseRadius);
    camera.lookAt(0, lookAtTargetY, 0);

    function animate() {
      requestAnimationFrame(animate);
      if (document.hidden) return;
      const deltaTime = Math.min(clock.getDelta(), 0.1);

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const scrollTop = window.scrollY !== undefined
        ? window.scrollY
        : (window.pageYOffset !== undefined ? window.pageYOffset : document.documentElement.scrollTop);
      const targetScroll = maxScroll > 20 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;

      if (!motionPaused) {
        elapsedAccum += deltaTime;

        // Physical scroll inertia lerp (verbatim Laocoön feel)
        currentScroll += (targetScroll - currentScroll) * 0.035;

        // Smooth mouse tilt lerp
        mouseX += (targetMouseX - mouseX) * 0.05;
        mouseY += (targetMouseY - mouseY) * 0.05;

        // Interactive 3D chip tilt from pointer
        modelPivot.rotation.y = mouseX * 0.28;
        modelPivot.rotation.x = mouseY * 0.16;

        // Forge sparks upward drift + sinusoidal sway + scroll-velocity turbulence
        if (sparkParticles) {
          const positions = sparkParticles.geometry.attributes.position.array;
          const scrollVelocity = Math.abs(targetScroll - currentScroll);
          const speedMultiplier = 1.0 + scrollVelocity * 9.0;
          const turbulence = scrollVelocity * 0.8;

          for (let i = 0; i < sparkCount; i++) {
            const idx = i * 3;
            const data = sparkData[i];
            positions[idx]     += data.speedX * deltaTime * speedMultiplier;
            positions[idx + 1] += data.speedY * deltaTime * speedMultiplier;
            positions[idx + 2] += data.speedZ * deltaTime * speedMultiplier;

            const currentSway = data.swayRadius * (1.0 + turbulence * 4.0);
            positions[idx]     += Math.sin(elapsedAccum * data.swaySpeed + data.phase) * currentSway * deltaTime;
            positions[idx + 2] += Math.cos(elapsedAccum * data.swaySpeed + data.phase) * currentSway * deltaTime;

            if (positions[idx + 1] > 3.0 || Math.abs(positions[idx]) > 3.5 || Math.abs(positions[idx + 2]) > 3.5) {
              positions[idx + 1] = -2.5;
              positions[idx]     = (Math.random() - 0.5) * 3.2;
              positions[idx + 2] = (Math.random() - 0.5) * 3.2;
            }
          }
          sparkParticles.geometry.attributes.position.needsUpdate = true;
        }

        // Smooth 360° camera orbit: combines calm continuous orbital glide + scroll-driven 360° orbit
        const phi = elapsedAccum * 0.12 + currentScroll * Math.PI * 2.0;
        const y = baseCamY + Math.sin(currentScroll * Math.PI + elapsedAccum * 0.22) * 0.32;
        const radius = baseRadius - Math.sin(currentScroll * Math.PI) * 0.45;
        const camX = radius * Math.sin(phi);
        const camZ = radius * Math.cos(phi);

        const targetPos = new THREE.Vector3(camX, y, camZ);
        camera.position.lerp(targetPos, 0.04);
        camera.lookAt(0, lookAtTargetY, 0);

        // Update liquid-metal wave shader uniforms
        shaderUniforms.uTime.value = elapsedAccum;
        shaderUniforms.uMouse.value.set(mouseX, -mouseY);
        shaderUniforms.uScroll.value = currentScroll;
      }

      // Animate glowing amber signal bar along the silicon die bevel perimeter
      const loopT = (elapsedAccum % 4.6) / 4.6;
      const easedT = easeInOutCubic(loopT);
      const pt = diePerimeterCurve.getPointAt(easedT);
      const tangent = diePerimeterCurve.getTangentAt(easedT);
      if (pt && tangent) {
        const angleY = Math.atan2(tangent.z, tangent.x);
        signalBar.position.set(pt.x, pt.y, pt.z);
        signalBar.rotation.y = -angleY;

        signalHalo.position.set(pt.x, pt.y - 0.002, pt.z);
        signalHalo.rotation.z = angleY;

        signalBloomSprite.position.set(pt.x, pt.y + 0.02, pt.z);
        diePulseLight.position.set(pt.x * 1.15, pt.y + 0.20, pt.z * 1.15);
      }

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      sizes.width = container.clientWidth || window.innerWidth;
      sizes.height = container.clientHeight || window.innerHeight;
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      shaderUniforms.uResolution.value.set(sizes.width, sizes.height);
    });
  });
})();
