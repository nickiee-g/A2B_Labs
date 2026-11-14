
(() => {
  if (window.vsBreadcrumbTrail) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const live = new Set(); let raf = 0, last = 0;
  const tick = now => {
    const dt = Math.min(.064, (now - last) / 1000 || .016); last = now;
    for (const t of live) if (!t.update(dt)) live.delete(t);
    raf = live.size ? requestAnimationFrame(tick) : 0;
  };
  const wake = t => { live.add(t); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  /* semi-implicit Euler spring, 120 Hz substeps, optional start delay d (s); e = settle epsilon */
  const sp = (x, k, c, e = .05) => ({ x, v: 0, g: x, k, c, e, d: 0 });
  const run = (s, dt) => {
    if (reduce.matches) { s.x = s.g; s.v = 0; s.d = 0; return false; }
    if (s.d > 0) { s.d -= dt; return true; }
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (-s.k * (s.x - s.g) - s.c * s.v) * h; s.x += s.v * h; }
    if (Math.abs(s.v) < s.e && Math.abs(s.x - s.g) < s.e) { s.x = s.g; s.v = 0; return false; }
    return true;
  };
  const snap = (s, v) => { s.x = s.g = v; s.v = 0; s.d = 0; };
  const GLYPH = { chevron: '<path d="M3.6 1.2 7.4 5 3.6 8.8"/>', slash: '<path d="M6.9.4 3.1 9.6"/>', dot: '<circle cx="5" cy="5" r="5"/>' };
  const glyph = t => `<svg viewBox="0 0 10 10" aria-hidden="true">${GLYPH[t] || GLYPH.chevron}</svg>`;
  const el = (tag, cls, attrs = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const springs = () => ({ x: sp(0, 320, 30), y: sp(0, 320, 30), o: sp(1, 280, 30, .004), s: sp(1, 360, 28, .002) });
  let uid = 0;

  function mount(nav) {
    if (nav.__vsBt) return nav.__vsBt;
    const ol = nav.querySelector(':scope > ol'); if (!ol) return null;
    const id = 'vs-breadcrumb-trail-' + (++uid);
    const crumbs = [...ol.children].filter(n => n.tagName === 'LI').map((li, i, arr) => {
      li.classList.add('vs-breadcrumb-trail-item');
      const link = li.querySelector(':scope > a, :scope > span'); link.classList.add('vs-breadcrumb-trail-crumb');
      const list = li.querySelector(':scope > ul');
      const c = { li, link, list, sep: null, pop: null, S: springs(), P: sp(0, 560, 38, .003), state: 'in' };
      if (i > 0) {
        c.sep = el(list ? 'button' : 'span', 'vs-breadcrumb-trail-sep', { 'aria-hidden': 'true' });
        if (list) { c.sep.type = 'button'; c.sep.tabIndex = -1; }
        li.prepend(c.sep);
      }
      if (list) {
        c.pop = el('div', 'vs-breadcrumb-trail-pop', { id: `${id}-${i}` });
        const head = el('div', 'vs-breadcrumb-trail-head'), a = el('span'), b = el('span');
        const parent = i > 0 ? arr[i - 1].querySelector(':scope > a, :scope > span').textContent.trim() : '~';
        a.textContent = parent + '/'; b.textContent = String(list.querySelectorAll('a').length);
        head.append(a, b); c.pop.append(head, list); li.append(c.pop); c.pop.inert = true;
        const here = link.textContent.trim();
        list.querySelectorAll('a').forEach(x => { if (x.textContent.trim() === here) { x.classList.add('is-here'); x.setAttribute('aria-current', 'true'); } });
        link.setAttribute('aria-expanded', 'false'); link.setAttribute('aria-controls', c.pop.id); link.setAttribute('aria-keyshortcuts', 'ArrowDown');
      }
      return c;
    });
    const n = crumbs.length;
    const moreLi = el('li', 'vs-breadcrumb-trail-item vs-breadcrumb-trail-more');
    const dots = el('button', 'vs-breadcrumb-trail-dots', { type: 'button', 'aria-expanded': 'false' }); dots.innerHTML = '<i></i><i></i><i></i>';
    moreLi.append(el('span', 'vs-breadcrumb-trail-sep', { 'aria-hidden': 'true' }), dots);
    crumbs[0].li.after(moreLi);
    const M = { li: moreLi, S: springs(), state: 'in', more: true };
    const order = [crumbs[0], M, ...crumbs.slice(1)];
    const line = el('span', 'vs-breadcrumb-trail-line', { 'aria-hidden': 'true' }); nav.append(line);
    const Ln = { l: sp(0, 520, 36), r: sp(0, 520, 36), y: sp(0, 420, 34), o: sp(0, 360, 32, .003) };
    const paintSeps = () => nav.querySelectorAll('.vs-breadcrumb-trail-sep').forEach(s => s.innerHTML = glyph(nav.dataset.sep));
    paintSeps();

    let expanded = false, effMax = 4, open = null, hot = null, tPop = 0, tPopClose = 0, tCol = 0, tExp = 0;
    const maxAttr = () => Math.max(2, parseInt(nav.dataset.max, 10) || 4);
    const hiddenCount = () => Math.max(0, n - Math.min(effMax, n));
    const plan = () => {
      const want = new Set(), m = Math.min(effMax, n);
      if (expanded || n <= m) crumbs.forEach(c => want.add(c));
      else { want.add(crumbs[0]); want.add(M); for (let i = n - (m - 1); i < n; i++) want.add(crumbs[i]); }
      return want;
    };
    const setDisplay = (e, on) => { e.li.style.display = on ? '' : 'none'; };

    /* interruptible FLIP: record what is on screen, change the flow, spring from the old picture to the new */
    function apply(animate = true) {
      const want = plan();
      const before = new Map();
      for (const e of order) if (e.state !== 'gone') before.set(e, e.li.getBoundingClientRect());
      const refOld = before.get(M) && M.state === 'in' ? before.get(M) : null;
      const leaving = order.filter(e => e.state === 'in' && !want.has(e));
      const entering = order.filter(e => e.state !== 'in' && want.has(e));
      for (const e of entering) { e.li.classList.remove('is-out'); e.li.style.left = e.li.style.top = ''; setDisplay(e, true); }
      for (const e of leaving) e.li.classList.add('is-out');
      const olR = ol.getBoundingClientRect();
      for (const e of leaving) {
        const b = before.get(e);
        e.li.style.left = (b.left - olR.left) + 'px'; e.li.style.top = (b.top - olR.top) + 'px';
        snap(e.S.x, 0); snap(e.S.y, 0);
      }
      for (const e of order) if (want.has(e)) {
        const r = e.li.getBoundingClientRect();
        e.lay = { l: r.left - e.S.x.x, t: r.top - e.S.y.x };
      }
      let k = 0;
      const hiddenNow = entering.filter(e => e.state === 'gone' && !e.more);
      for (const e of order) {
        if (!want.has(e)) continue;
        const b = before.get(e), S = e.S;
        if (b) { S.x.x = b.left - e.lay.l; S.y.x = b.top - e.lay.t; }
        else if (refOld && hiddenNow.includes(e)) {             // born from the ellipsis
          S.x.x = refOld.left - e.lay.l; S.y.x = refOld.top - e.lay.t; S.o.x = 0; S.s.x = .72;
          S.o.d = S.x.d = S.s.d = k++ * .038;
        } else { snap(S.x, 0); snap(S.y, 0); S.o.x = 0; S.s.x = .6; }
        S.x.g = 0; S.y.g = 0; S.o.g = 1; S.s.g = 1; e.state = 'in';
      }
      const into = want.has(M) ? M.lay : null;
      for (const e of leaving) {
        const b = before.get(e), S = e.S;
        S.o.g = 0; S.s.g = e.more ? .6 : .8;
        if (into && !e.more) { S.x.g = (into.l - b.left) * .75; S.y.g = (into.t - b.top) * .75; }
        e.state = 'out';
      }
      dots.setAttribute('aria-expanded', String(!want.has(M)));
      dots.setAttribute('aria-label', `Show ${hiddenCount()} hidden level${hiddenCount() === 1 ? '' : 's'}`);
      if (!animate) for (const e of order) { for (const s of Object.values(e.S)) { s.x = s.g; s.v = 0; s.d = 0; } }
      api.update(0); wake(api);
    }

    function aimLine(c, snapIt) {
      if (!c) { Ln.o.g = 0; return; }
      const li = c.li, a = c.link;
      const l = ol.offsetLeft + li.offsetLeft + a.offsetLeft + c.S.x.x + a.offsetWidth * .0, r = l + a.offsetWidth;
      const y = ol.offsetTop + li.offsetTop + a.offsetTop + a.offsetHeight + c.S.y.x;
      const pad = a.offsetWidth > 40 ? 5 : 2;
      if (snapIt || Ln.o.x < .06) { snap(Ln.l, l + pad); snap(Ln.r, r - pad); snap(Ln.y, y); }
      else { const dir = (l + r) - (Ln.l.g + Ln.r.g), [lead, trail] = dir >= 0 ? [Ln.r, Ln.l] : [Ln.l, Ln.r];
        lead.k = 560; lead.c = 36; trail.k = 250; trail.c = 28; Ln.l.g = l + pad; Ln.r.g = r - pad; Ln.y.g = y; }
      Ln.o.g = 1;
    }

    const api = {
      expand, collapse, refit,
      update(dt) {
        let moving = false;
        for (const e of order) {
          const S = e.S; for (const k in S) if (run(S[k], dt)) moving = true;
          if (e.state === 'gone') continue;
          e.li.style.transform = `translate3d(${S.x.x.toFixed(2)}px,${S.y.x.toFixed(2)}px,0) scale(${S.s.x.toFixed(4)})`;
          e.li.style.opacity = Math.max(0, Math.min(1, S.o.x)).toFixed(3);
          if (e.state === 'out' && S.o.x <= .01) {
            e.state = 'gone'; setDisplay(e, false); e.li.classList.remove('is-out'); e.li.style.left = e.li.style.top = '';
            snap(S.x, 0); snap(S.y, 0); snap(S.s, 1); snap(S.o, 0);
          }
        }
        for (const c of crumbs) if (c.pop) {
          if (run(c.P, dt)) moving = true;
          const p = Math.max(0, Math.min(1, c.P.x));
          c.pop.style.opacity = p.toFixed(3);
          c.pop.style.transform = `translate3d(0,${(-7 * (1 - c.P.x)).toFixed(2)}px,0) scale(${(.955 + .045 * c.P.x).toFixed(4)})`;
          const shown = p > .01 || c === open;
          c.pop.style.visibility = shown ? 'visible' : 'hidden';
          if (!shown) c.li.classList.remove('is-popped');
        }
        if (hot && moving) aimLine(hot);
        for (const k in Ln) if (run(Ln[k], dt)) moving = true;
        line.style.transform = `translate3d(${Ln.l.x.toFixed(2)}px,${Ln.y.x.toFixed(2)}px,0) scaleX(${(Math.max(0, Ln.r.x - Ln.l.x) / 100).toFixed(4)})`;
        line.style.opacity = Math.max(0, Math.min(1, Ln.o.x)).toFixed(3);
        return moving;
      },
    };

    function expand({ focus } = {}) {
      clearTimeout(tExp); clearTimeout(tCol);
      if (expanded || !hiddenCount()) return;
      const hid = crumbs.filter(c => c.state !== 'in');
      expanded = true; apply();
      nav.dispatchEvent(new CustomEvent('trailexpand', { bubbles: true }));
      if (focus === 'first') hid[0] && hid[0].link.focus({ preventScroll: true });
      if (focus === 'last') hid[hid.length - 1] && hid[hid.length - 1].link.focus({ preventScroll: true });
    }
    function collapse() {
      clearTimeout(tCol);
      if (!expanded) return;
      expanded = false;
      if (open && !plan().has(open)) closePop();
      apply();
      nav.dispatchEvent(new CustomEvent('trailcollapse', { bubbles: true }));
    }
    function openPop(c, focus) {
      clearTimeout(tPop); clearTimeout(tPopClose);
      if (!c || !c.pop) return;
      if (open && open !== c) closePop();
      open = c; c.P.g = 1;
      c.pop.style.left = c.link.offsetLeft + 'px';
      c.link.setAttribute('aria-expanded', 'true'); c.sep && c.sep.classList.add('is-open');
      c.li.classList.add('is-popped'); c.pop.inert = false; c.pop.style.visibility = 'visible';
      const over = c.pop.getBoundingClientRect().left + c.pop.offsetWidth - (innerWidth - 12);
      if (over > 0) c.pop.style.left = (c.link.offsetLeft - over) + 'px';
      wake(api);
      if (focus) { const f = c.pop.querySelector('a.is-here') || c.pop.querySelector('a'); f && f.focus({ preventScroll: true }); }
    }
    function closePop() {
      clearTimeout(tPop); clearTimeout(tPopClose);
      if (!open) return;
      const c = open; open = null; c.P.g = 0;
      c.link.setAttribute('aria-expanded', 'false'); c.sep && c.sep.classList.remove('is-open'); c.pop.inert = true;
      wake(api);
    }
    function refit() {
      // measure natural widths in an invisible probe, then keep as many levels as fit (never fewer than 2)
      const probe = ol.cloneNode(true);
      probe.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;flex-wrap:nowrap;width:max-content';
      [...probe.children].forEach(li => { li.removeAttribute('style'); li.classList.remove('is-out'); });
      nav.append(probe);
      const W = [...probe.children].map(li => li.getBoundingClientRect().width);
      probe.remove();
      const avail = nav.clientWidth, want = maxAttr();
      const crumbW = W.filter((_, i) => i !== 1), moreW = W[1];
      const total = crumbW.reduce((a, b) => a + b, 0);
      let m = Math.min(want, n);
      if (m >= n && total > avail) m = n - 1;
      while (m > 2) {
        let w = crumbW[0] + moreW; for (let i = n - (m - 1); i < n; i++) w += crumbW[i];
        if (w <= avail) break; m--;
      }
      effMax = m >= n && total <= avail ? n : m;
      apply(); if (hot) aimLine(hot, true);
    }

    /* pointer */
    const crumbOf = t => crumbs.find(c => c.li.contains(t) && (c.link === t || c.link.contains(t)));
    ol.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse') return;
      const c = crumbOf(e.target);
      if (!c) return;
      const cur = c.link.getAttribute('aria-current') === 'page';
      if (cur && hot) { hot = null; aimLine(null); wake(api); }
      else if (!cur && c !== hot) { hot = c; aimLine(c); wake(api); }
      if (c.pop && c !== open) { clearTimeout(tPop); tPop = setTimeout(() => openPop(c), open ? 60 : 260); }
      if (c === open) clearTimeout(tPopClose);
    });
    ol.addEventListener('pointerout', e => {
      if (e.pointerType !== 'mouse') return;
      const c = crumbOf(e.target); if (!c || c.li.contains(e.relatedTarget)) return;
      clearTimeout(tPop);
      if (c === open) tPopClose = setTimeout(closePop, 220);
      if (c === hot && !(e.relatedTarget && crumbOf(e.relatedTarget))) { hot = null; aimLine(null); wake(api); }
    });
    crumbs.forEach(c => {
      if (c.pop) {
        c.pop.addEventListener('pointerenter', () => clearTimeout(tPopClose));
        c.pop.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tPopClose = setTimeout(closePop, 220); });
        c.pop.addEventListener('keydown', e => {
          const A = [...c.pop.querySelectorAll('a')], i = A.indexOf(document.activeElement);
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); A[Math.max(0, Math.min(A.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus(); }
          else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); A[e.key === 'Home' ? 0 : A.length - 1].focus(); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); c.link.focus(); }
          else if (e.key === 'Tab') closePop();
        });
      }
      if (c.sep && c.pop) c.sep.addEventListener('click', () => (open === c ? closePop() : openPop(c)));
      if (c.pop && nav.classList.contains('workspace-trail')) c.link.addEventListener('click', e => { e.preventDefault(); open === c ? closePop() : openPop(c); });
      c.link.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && c.pop) { e.preventDefault(); openPop(c, true); } });
      c.link.addEventListener('focus', () => { if (c.link.matches(':focus-visible') && c.link.getAttribute('aria-current') !== 'page') { hot = c; aimLine(c); wake(api); } });
    });
    dots.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { clearTimeout(tExp); tExp = setTimeout(expand, 80); } });
    dots.addEventListener('pointerleave', () => clearTimeout(tExp));
    dots.addEventListener('click', e => expand({ focus: e.detail === 0 ? 'first' : null }));
    dots.addEventListener('focus', e => {
      if (!dots.matches(':focus-visible')) return;
      const from = e.relatedTarget && crumbs.find(c => c.link === e.relatedTarget);
      expand({ focus: from && crumbs.indexOf(from) > 0 ? 'last' : 'first' });
    });
    ol.addEventListener('pointerenter', () => clearTimeout(tCol));
    ol.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      if (hot) { hot = null; aimLine(null); wake(api); }
      if (expanded) { clearTimeout(tCol); tCol = setTimeout(() => { if (!open) collapse(); else tCol = setTimeout(() => { if (!ol.matches(':hover')) collapse(); }, 400); }, 650); }
    });
    nav.addEventListener('keydown', e => { if (e.key === 'Escape') { if (open) { const c = open; closePop(); c.link.focus(); } else collapse(); } });
    nav.addEventListener('focusout', () => setTimeout(() => {
      if (nav.contains(document.activeElement)) return;
      closePop(); hot = null; aimLine(null); wake(api);
      if (!ol.matches(':hover')) collapse();
    }));
    document.addEventListener('pointerdown', e => { if (!ol.contains(e.target)) { closePop(); collapse(); } });
    new MutationObserver(recs => {
      if (recs.some(r => r.attributeName === 'data-sep')) paintSeps();
      if (recs.some(r => r.attributeName === 'data-max')) refit();
    }).observe(nav, { attributes: true, attributeFilter: ['data-sep', 'data-max'] });
    let lastW = -1, lastF = '';
    new ResizeObserver(() => {
      const w = nav.clientWidth, f = getComputedStyle(nav).fontSize;
      if (w !== lastW || f !== lastF) { lastW = w; lastF = f; refit(); }
    }).observe(nav);
    document.fonts && document.fonts.ready.then(() => refit());
    nav.__vsBt = api;
    effMax = maxAttr(); apply(false); refit();
    for (const e of order) for (const s of Object.values(e.S)) { s.x = s.g; s.v = 0; s.d = 0; }
    api.update(0);
    return api;
  }
  const init = () => document.querySelectorAll('.vs-breadcrumb-trail').forEach(mount);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
  window.vsBreadcrumbTrail = { mount };
})();
