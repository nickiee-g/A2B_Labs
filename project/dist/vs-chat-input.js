(() => {
  if (window.vsChatInput) return;
  const P = 'vs-chat-input';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    clip: svg('<path d="m20.5 11.3-8.6 8.6a5.6 5.6 0 0 1-7.9-7.9l8.6-8.6a3.75 3.75 0 0 1 5.3 5.3l-8.6 8.6a1.9 1.9 0 0 1-2.7-2.7l7.9-7.9"/>'),
    chev: svg('<path d="m6 9 6 6 6-6"/>', 2),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 2.2),
    x: svg('<path d="M17 7 7 17M7 7l10 10"/>', 3),
    arrow: svg('<path d="M12 19V5.5M5.5 12 12 5.5 18.5 12"/>', 2.2),
    tray: svg('<path d="M12 14.5V3.5M7.5 8 12 3.5 16.5 8"/><path d="M20.5 14.5v3a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-3"/>'),
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const size = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  const KINDS = [
    [/^(pdf)$/, 'PDF', '#d8483f'], [/^(csv|tsv|xlsx?|numbers)$/, null, '#2c9163'], [/^(docx?|rtf|pages|odt)$/, 'DOC', '#3a67c9'],
    [/^(md|txt|log)$/, null, '#6f6a61'], [/^(js|jsx|ts|tsx|py|rb|go|rs|java|json|html|css|sh|sql|ya?ml|swift|kt|c|cpp|h)$/, null, '#35302a'],
    [/^(zip|gz|tar|rar|7z)$/, 'ZIP', '#b0772a'], [/^(mp3|wav|m4a|flac|ogg)$/, 'AUD', '#8a4fb5'], [/^(mp4|mov|webm|mkv)$/, 'VID', '#c2416b'],
  ];
  function kindOf(f) {
    const ext = (f.name.includes('.') ? f.name.split('.').pop() : '').toLowerCase();
    if (/^image\//.test(f.type) || /^(png|jpe?g|gif|webp|avif|heic)$/.test(ext)) return { kind: 'image' };
    for (const [re, lab, tone] of KINDS) if (re.test(ext)) return { kind: 'file', label: lab || ext.toUpperCase().slice(0, 4), tone };
    return { kind: 'file', label: (ext || 'file').toUpperCase().slice(0, 4), tone: '#77726a' };
  }
  // "quarterly-revenue-forecast-v2.pdf" -> "quarterly-rev…cast-v2.pdf", measured in the real font
  const ctx2d = document.createElement('canvas').getContext('2d');
  function midTrunc(name, max, font) {
    ctx2d.font = font; const fits = t => ctx2d.measureText(t).width <= max;
    if (!max || fits(name)) return name;
    const dot = name.lastIndexOf('.'), ext = dot > 0 && name.length - dot <= 7 ? name.slice(dot) : '', base = ext ? name.slice(0, dot) : name;
    const cut = k => base.slice(0, Math.ceil(k * .58)) + '…' + base.slice(base.length - Math.floor(k * .42)) + ext;
    let lo = 1, hi = base.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fits(cut(m))) lo = m; else hi = m - 1; }
    return cut(lo);
  }

  // a tiny semi-implicit spring; interruptible because it keeps its velocity when the goal moves
  class Spring {
    constructor(x, k = 420, c = 36, eps = .001) { this.x = x; this.v = 0; this.g = x; this.k = k; this.c = c; this.eps = eps; }
    step(dt) {
      if (reduce.matches) { this.x = this.g; this.v = 0; return false; }
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - this.g) - this.c * this.v) * h; this.x += this.v * h; }
      if (Math.abs(this.v) < this.eps * 12 && Math.abs(this.x - this.g) < this.eps) { this.x = this.g; this.v = 0; return false; }
      return true;
    }
    snap(v) { this.x = this.g = v; this.v = 0; }
  }

  function mount(root) {
    if (root.vsChatInput) return root.vsChatInput;
    const uid = Math.random().toString(36).slice(2, 7);
    const $ = s => root.querySelector('.' + P + '-' + s);
    const ta = $('text'), bar = $('bar'), attach = $('attach'), send = $('send'), mBtn = $('model-btn'), menu = $('menu');
    // build the parts the markup leaves out
    const grow = document.createElement('div'); grow.className = P + '-grow';
    const inner = document.createElement('div'); inner.className = P + '-inner';
    const list = document.createElement('div'); list.className = P + '-files'; list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Attachments');
    ta.before(grow); grow.append(inner); inner.append(list, ta);
    const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true; picker.tabIndex = -1;
    if (root.dataset.accept) picker.accept = root.dataset.accept;
    root.append(picker);
    if (attach && !attach.innerHTML.trim()) attach.innerHTML = I.clip;
    send.innerHTML = `<span class="${P}-base"></span><span class="${P}-fill"></span><span class="${P}-stopbg"></span>
      <svg class="${P}-spin" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20.5"/><circle cx="22" cy="22" r="20.5"/></svg>
      <i class="${P}-arrow">${I.arrow}</i><i class="${P}-square"></i>`;
    const fill = $('fill'), stopbg = $('stopbg'), spin = $('spin'), arrow = $('arrow'), square = $('square');
    const drop = document.createElement('div'); drop.className = P + '-drop'; drop.setAttribute('aria-hidden', 'true');
    drop.innerHTML = `<div>${I.tray}<span>${esc(root.dataset.dropLabel || 'Drop to attach')}</span></div>`;
    const sr = document.createElement('span'); sr.className = P + '-sr'; sr.setAttribute('aria-live', 'polite');
    root.append(drop, sr);
    const say = t => { sr.textContent = ''; setTimeout(() => { sr.textContent = t; }, 40); };

    // ---- one rAF loop per composer, only alive while something moves
    const anims = new Set(); let raf = 0, last = 0;
    const tick = now => {
      const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
      for (const a of anims) if (!a(dt)) anims.delete(a);
      raf = anims.size ? requestAnimationFrame(tick) : 0;
    };
    const wake = a => { anims.add(a); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };

    // ---- height: textarea sized instantly, the wrapper follows on a spring
    const H = new Spring(0, 520, 46, .1);
    const drawH = () => { grow.style.height = H.x.toFixed(2) + 'px'; };
    const animH = dt => { const a = H.step(dt); drawH(); if (!a) grow.style.height = ''; return a; };
    let first = true;
    const measure = () => {
      const h = inner.offsetHeight;
      if (first || !root.isConnected || !root.getClientRects().length) { H.snap(h); first = false; grow.style.height = ''; return; }
      if (Math.abs(h - H.g) < .5 && !anims.has(animH)) return;
      if (!anims.has(animH)) { H.x = H.g; H.v = 0; }
      H.g = h; drawH(); wake(animH);
    };
    new ResizeObserver(measure).observe(inner);
    const fit = () => {
      const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 24, pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const lines = parseFloat(getComputedStyle(root).getPropertyValue('--vs-chat-input-lines')) || 8, max = lh * lines + pad;
      const st = ta.scrollTop; ta.style.height = '0px';
      const sh = ta.scrollHeight; ta.style.height = Math.min(sh, max) + 'px'; const over = sh > max + 1; ta.style.overflowY = over ? 'auto' : 'hidden'; root.toggleAttribute('data-overflow', over); ta.scrollTop = st;
    };
    grow.addEventListener('scroll', () => { grow.scrollTop = 0; });

    // ---- files
    const files = new Map(); let seq = 0;
    const maxFiles = +root.dataset.maxFiles || 10;
    const accepts = f => {
      const acc = (root.dataset.accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!acc.length) return true;
      const n = f.name.toLowerCase(), t = (f.type || '').toLowerCase();
      return acc.some(a => a.startsWith('.') ? n.endsWith(a) : a.endsWith('/*') ? t.startsWith(a.slice(0, -1)) : t === a);
    };
    function chipAnim(c) {
      return dt => {
        const a = c.e.step(dt), b = c.prog.step(dt), v = c.vis.step(dt);
        const e = Math.max(0, c.e.x);
        c.el.style.width = (c.w * Math.min(e, 1.03)).toFixed(2) + 'px';
        c.el.style.marginRight = (8 * Math.min(1, e)).toFixed(2) + 'px';
        c.el.style.opacity = clamp(e * 1.4 - .25, 0, 1).toFixed(3);
        c.el.style.transform = `scale(${(.82 + .18 * Math.min(e, 1.06)).toFixed(4)})`;
        c.arc.style.strokeDashoffset = (C * (1 - clamp(c.prog.x, 0, 1))).toFixed(2);
        c.ring.style.opacity = clamp(c.vis.x, 0, 1).toFixed(3); if (c.lab) c.lab.style.opacity = (1 - clamp(c.vis.x, 0, 1)).toFixed(3);
        if (c.uploading) c.sizeEl.textContent = 'Uploading · ' + Math.round(clamp(c.prog.x, 0, 1) * 100) + '%';
        if (c.uploading && c.target >= 1 && c.prog.x > .995) { c.uploading = false; c.vis.g = 0; c.sizeEl.textContent = size(c.size); update(); return true; }
        if (c.removing && e <= .002 && !a) { c.el.remove(); if (c.url) URL.revokeObjectURL(c.url); files.delete(c.id); update(); return false; }
        const busy = a || b || v;
        if (!busy) { c.el.style.width = c.el.style.transform = c.el.style.opacity = ''; c.el.style.marginRight = ''; }
        return busy;
      };
    }
    const C = 2 * Math.PI * 9;
    function addFiles(fileList) {
      const ids = [];
      for (const file of [...(fileList || [])]) {
        if (files.size >= maxFiles || !accepts(file)) continue;
        const id = 'f' + (++seq) + '-' + uid, k = kindOf(file);
        const el = document.createElement('div'); el.className = P + '-chip'; el.dataset.kind = k.kind; el.setAttribute('role', 'listitem');
        let url = '';
        if (k.kind === 'image') { url = URL.createObjectURL(file); }
        el.innerHTML = `<div class="${P}-chip-in" title="${esc(file.name)}">
            <div class="${P}-thumb" style="--t:${k.tone || ''}">${url ? `<img src="${url}" alt="">` : `<b>${esc(k.label)}</b>`}
              <div class="${P}-ring"><svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="9"/><circle cx="11" cy="11" r="9" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/></svg></div></div>
            ${k.kind === 'image' ? '' : `<div class="${P}-meta"><span class="${P}-name"></span><span class="${P}-size">${size(file.size)}</span></div>`}
            <button class="${P}-x" type="button" aria-label="Remove ${esc(file.name)}">${I.x}</button></div>`;
        list.append(el);
        const c = { id, file, name: file.name, size: file.size, type: file.type, el, url, w: el.firstElementChild.offsetWidth,
          e: new Spring(0, 380, 30, .001), prog: new Spring(0, 140, 24, .0005), vis: new Spring(0, 300, 34, .002), target: 1, uploading: false, removing: false,
          ring: el.querySelector('.' + P + '-ring'), arc: el.querySelector('circle + circle'), sizeEl: el.querySelector('.' + P + '-size') || { textContent: '' }, lab: el.querySelector('.' + P + '-thumb b') };
        const nameEl = el.querySelector('.' + P + '-name');
        c.trunc = () => { if (nameEl) nameEl.textContent = midTrunc(file.name, nameEl.clientWidth, getComputedStyle(nameEl).font); };
        c.trunc();
        c.el.style.width = '0px'; c.el.style.opacity = '0';
        c.e.g = 1; c.anim = chipAnim(c); files.set(id, c); wake(c.anim);
        el.querySelector('.' + P + '-x').addEventListener('click', () => { removeFile(id); ta.focus({ preventScroll: true }); });
        ids.push(id);
      }
      if (ids.length) {
        update(); say(ids.length === 1 ? 'Attached ' + files.get(ids[0]).name : 'Attached ' + ids.length + ' files');
        root.dispatchEvent(new CustomEvent(P + ':files', { bubbles: true, detail: { added: ids.map(id => ({ id, file: files.get(id).file })) } }));
      }
      return ids;
    }
    function removeFile(id) {
      const c = files.get(id); if (!c || c.removing) return;
      c.removing = true; c.w = c.el.firstElementChild.offsetWidth; c.e.g = 0; c.el.setAttribute('aria-hidden', 'true'); wake(c.anim);
      say('Removed ' + c.name);
      root.dispatchEvent(new CustomEvent(P + ':remove', { bubbles: true, detail: { id, file: c.file } }));
      update();
    }
    function setProgress(id, p) {
      const c = files.get(id); if (!c || c.removing) return;
      p = clamp(+p || 0, 0, 1); c.target = p;
      if (p < 1 && !c.uploading) { c.uploading = true; c.vis.g = 1; }
      c.prog.g = p; wake(c.anim); update();
    }
    const live = () => [...files.values()].filter(c => !c.removing);

    // ---- send / stop morph
    let busy = false, disabled = false;
    const M = new Spring(0, 520, 34, .001), EN = new Spring(0, 520, 40, .001);
    const drawSend = () => {
      const m = M.x, en = clamp(EN.x, 0, 1.1);
      fill.style.opacity = clamp(en * (1 - m), 0, 1).toFixed(3);
      fill.style.transform = `scale(${(.86 + .14 * en).toFixed(4)})`;
      stopbg.style.opacity = clamp(m, 0, 1).toFixed(3);
      arrow.style.opacity = clamp(1 - m * 1.6, 0, 1).toFixed(3);
      arrow.style.transform = `translateY(${(-7 * m).toFixed(2)}px) scale(${(1 - .35 * clamp(m, 0, 1)).toFixed(4)})`;
      square.style.opacity = clamp(m * 1.4 - .2, 0, 1).toFixed(3);
      square.style.transform = `scale(${(.2 + .8 * m).toFixed(4)}) rotate(${(90 * (1 - m)).toFixed(2)}deg)`;
      spin.style.opacity = clamp(m * 1.2 - .2, 0, 1).toFixed(3);
      spin.style.transform = `scale(${(.8 + .2 * m).toFixed(4)})`;
    };
    const animSend = dt => { const a = M.step(dt), b = EN.step(dt); drawSend(); return a || b; };
    function canSend() { return !disabled && !busy && (ta.value.trim().length > 0 || live().length > 0) && !live().some(c => c.uploading); }
    function update() {
      const ok = canSend();
      send.disabled = disabled || (!busy && !ok);
      send.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message');
      const en = busy || ok ? 1 : 0;
      if (EN.g !== en) { EN.g = en; wake(animSend); }
    }
    function setBusy(b) {
      busy = !!b; root.toggleAttribute('data-busy', busy); M.g = busy ? 1 : 0; wake(animSend); update();
    }
    function submit() {
      if (!canSend()) return false;
      const detail = { text: ta.value, files: live().map(c => ({ id: c.id, file: c.file, name: c.name, size: c.size, type: c.type })), model: api.model };
      const ev = new CustomEvent(P + ':submit', { bubbles: true, cancelable: true, detail });
      root.dispatchEvent(ev);
      if (ev.defaultPrevented) return false;
      clear(); if (root.dataset.autoBusy !== 'false') setBusy(true);
      say('Message sent'); return true;
    }
    function stop() {
      root.dispatchEvent(new CustomEvent(P + ':stop', { bubbles: true }));
      setBusy(false); say('Stopped'); ta.focus({ preventScroll: true });
    }
    function clear() {
      ta.value = ''; fit(); for (const id of [...files.keys()]) removeFile(id); update();
    }
    root.addEventListener('submit', e => { e.preventDefault(); busy ? stop() : submit(); });
    send.addEventListener('click', e => { e.preventDefault(); busy ? stop() : submit(); });

    // ---- textarea
    ta.addEventListener('input', () => { fit(); update(); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !coarse.matches) {
        e.preventDefault(); if (!busy) submit(); return;
      }
      if (e.key === 'Backspace' && !ta.value && files.size) { const l = live().pop(); if (l) { e.preventDefault(); removeFile(l.id); } }
      if (e.key === 'Escape' && busy && root.dataset.escStops !== 'false') { e.preventDefault(); stop(); }
    });
    ta.addEventListener('paste', e => {
      const fs = e.clipboardData && e.clipboardData.files;
      if (fs && fs.length) { if (!e.clipboardData.getData('text')) e.preventDefault(); addFiles(fs); }
    });

    // ---- attach + drag and drop
    attach && attach.addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; ta.focus({ preventScroll: true }); });
    const D = new Spring(0, 520, 40, .001);
    const animD = dt => { const a = D.step(dt); drop.style.opacity = clamp(D.x, 0, 1).toFixed(3); drop.style.transform = `scale(${(1.015 - .015 * D.x).toFixed(4)})`; return a; };
    let depth = 0;
    const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    root.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); if (++depth === 1) { D.g = 1; wake(animD); root.setAttribute('data-dragging', ''); } });
    root.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    root.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; D.g = 0; wake(animD); root.removeAttribute('data-dragging'); } });
    root.addEventListener('drop', e => {
      if (!hasFiles(e)) return; e.preventDefault(); depth = 0; D.g = 0; wake(animD); root.removeAttribute('data-dragging');
      addFiles(e.dataTransfer.files); ta.focus({ preventScroll: true });
    });

    // ---- model picker (listbox popover)
    const opts = menu ? [...menu.querySelectorAll('[role="option"]')] : [];
    let model = '', active = 0, open = false;
    const O = new Spring(0, 600, 38, .001), HY = new Spring(0, 700, 48, .05);
    let hl;
    const label = o => o.childNodes[0].textContent.trim();
    if (menu) {
      menu.id = menu.id || P + '-menu-' + uid; menu.tabIndex = -1;
      mBtn.setAttribute('aria-controls', menu.id); mBtn.setAttribute('aria-expanded', 'false');
      hl = document.createElement('div'); hl.className = P + '-hl'; hl.setAttribute('aria-hidden', 'true'); menu.prepend(hl);
      opts.forEach((o, i) => { o.id = o.id || menu.id + '-o' + i; o.insertAdjacentHTML('beforeend', I.check);
        o.addEventListener('pointermove', () => { if (active !== i) setActive(i); });
        o.addEventListener('click', () => { choose(i); close(true); }); });
      const sel = opts.find(o => o.getAttribute('aria-selected') === 'true') || opts[0];
      setModel(opts.indexOf(sel), false);
    }
    function setModel(i, fire) {
      opts.forEach((o, j) => o.setAttribute('aria-selected', String(i === j)));
      model = opts[i].dataset.value || label(opts[i]);
      mBtn.innerHTML = `<span>${esc(label(opts[i]))}</span>${I.chev}`;
      mBtn.setAttribute('aria-label', 'Model: ' + label(opts[i]));
      if (fire) { root.dispatchEvent(new CustomEvent(P + ':model', { bubbles: true, detail: { model } })); say(label(opts[i]) + ' selected'); }
    }
    function choose(i) { setModel(i, true); }
    function setActive(i, snap) {
      active = (i + opts.length) % opts.length; const o = opts[active];
      menu.setAttribute('aria-activedescendant', o.id);
      hl.style.height = o.offsetHeight + 'px';
      if (snap) HY.snap(o.offsetTop); else HY.g = o.offsetTop;
      wake(animO);
    }
    const drawO = () => {
      const o = O.x;
      menu.style.opacity = clamp(o * 1.5, 0, 1).toFixed(3);
      const dy = (menu.hasAttribute('data-below') ? -8 : 8) * (1 - o);
      menu.style.transform = `translate3d(0,${dy.toFixed(2)}px,0) scale(${(.9 + .1 * o).toFixed(4)})`;
      hl.style.transform = `translate3d(0,${HY.x.toFixed(2)}px,0)`;
    };
    const animO = dt => { const a = O.step(dt), b = HY.step(dt); drawO(); if (!a && !open) menu.hidden = true; return a || b; };
    function openMenu() {
      if (open || !menu) return; open = true; menu.hidden = false;
      const r = mBtn.getBoundingClientRect(), mh = menu.offsetHeight;
      menu.toggleAttribute('data-below', r.top < mh + 20 && innerHeight - r.bottom > r.top);
      const ox = r.left + r.width / 2 - menu.getBoundingClientRect().left;
      menu.style.transformOrigin = `${ox.toFixed(1)}px ${menu.hasAttribute('data-below') ? '0' : '100%'}`;
      mBtn.setAttribute('aria-expanded', 'true');
      setActive(opts.findIndex(o => o.getAttribute('aria-selected') === 'true'), true);
      O.g = 1; wake(animO); menu.focus({ preventScroll: true });
      document.addEventListener('pointerdown', outside, true);
    }
    function close(refocus) {
      if (!open) return; open = false; O.g = 0; wake(animO); mBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      if (refocus) mBtn.focus({ preventScroll: true });
    }
    const outside = e => { if (!menu.contains(e.target) && !mBtn.contains(e.target)) close(false); };
    if (menu) {
      mBtn.addEventListener('click', () => open ? close(true) : openMenu());
      mBtn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openMenu(); } });
      let typed = '', tt = 0;
      menu.addEventListener('keydown', e => {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); setActive(active + (k === 'ArrowDown' ? 1 : -1)); }
        else if (k === 'Home' || k === 'End') { e.preventDefault(); setActive(k === 'Home' ? 0 : opts.length - 1); }
        else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); close(true); }
        else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (k === 'Tab') { close(false); }
        else if (k.length === 1 && /\S/.test(k)) {
          clearTimeout(tt); typed += k.toLowerCase(); tt = setTimeout(() => { typed = ''; }, 600);
          const j = opts.findIndex(o => label(o).toLowerCase().startsWith(typed)); if (j > -1) setActive(j);
        }
      });
    }

    // fonts can arrive after mount: re-measure the middle truncation
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { files.forEach(c => c.trunc()); fit(); });
    addEventListener('resize', () => fit());

    const api = {
      el: root,
      get value() { return ta.value; }, set value(v) { ta.value = v; fit(); update(); },
      get model() { return model; },
      set model(v) { const i = opts.findIndex(o => o.dataset.value === v); if (i > -1) setModel(i, false); },
      get files() { return live().map(c => ({ id: c.id, file: c.file, name: c.name, size: c.size, type: c.type })); },
      get busy() { return busy; },
      addFiles, removeFile, setProgress, setBusy, submit, stop, clear,
      setDisabled(d) { disabled = !!d; root.toggleAttribute('data-disabled', disabled); ta.disabled = disabled; update(); },
      focus() { ta.focus(); },
      openModels: openMenu, closeModels: () => close(false),
    };
    root.vsChatInput = api;
    fit(); update(); drawSend(); measure();
    return api;
  }
  const mountAll = () => document.querySelectorAll('.' + P).forEach(mount);
  window.vsChatInput = { mount, mountAll };
  mountAll(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
})();
