/* EditSync Stüdyo — motion variant hook. Must run BEFORE the clip's engine script (the studio server inserts it at the top of
   <head> for /dist/x.html?inject; a render uses page.addInitScript). It traps `window.BM = {...}` and wraps engine functions
   as the engine defines them, so the clip's own timeline is built with the variant's motion settings:
     speed  0.75..1.5   every spring runs faster/slower (freq × speed), reveal in/out durations ÷ speed — the moments stay on the words
     bounce -0.5..1     spring damping (1 = much more overshoot, negative = stiffer / no overshoot)
     enter  'default' | 'blur-rise' | 'pop' | 'slide' | 'fade' | 'wipe'   style of BM.reveal entrances/exits
   Settings: window.__EDS_MOTION (render: set it in the same init script) or the studio parent's window.__EDS_MOTION.
   Limits: only motion built from BM.value / BM.color / BM.spring / BM.reveal changes; hand-written easing in a clip does not.
   'wipe' needs BM.show (clips with their own SH() helper fall back to a plain fade). */
(function () {
  let M = null;
  try { M = window.__EDS_MOTION || (window.parent !== window && window.parent.__EDS_MOTION) || null; } catch { M = null; }
  if (!M) return;
  const speed = Math.max(0.25, Number(M.speed) || 1), bounce = Number(M.bounce) || 0, enter = M.enter || 'default';
  if (speed === 1 && !bounce && enter === 'default') return;
  const adj = (sp) => (!sp || !isFinite(sp[0]) ? sp : [sp[0] * speed, Math.min(1.3, Math.max(0.3, sp[1] * (1 - 0.45 * bounce)))]);
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const backOut = (u) => { u = clamp(u); const s = 1.9; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); };
  function trapProp(o, name, wrap) {
    let w;
    Object.defineProperty(o, name, { configurable: true, enumerable: true, get: () => w, set: (fn) => { w = typeof fn === 'function' ? wrap(fn) : fn; } });
  }
  function patch(BM) {
    trapProp(BM, 'spring', (sp0) => (dt, f, z) => { const a = adj([f, z]); return sp0(dt, a[0], a[1]); });
    trapProp(BM, 'value', (v0) => (start, def) => {
      const f = v0(start, def), to0 = f.to, d = def || (BM.SPRING && BM.SPRING.shape) || [15, 0.84];
      f.to = (t, v, sp = d) => { to0(t, v, adj(sp)); return f; };
      return f;
    });
    trapProp(BM, 'reveal', (r0) => (t, from, until, o = {}) => {
      const oo = { ...o, delay: (o.delay ?? 0.06) / speed, dur: (o.dur ?? 0.28) / speed, out: (o.out ?? 0.12) / speed };
      const r = r0(t, from, until, oo), a = r.in, b = r.out, blur = o.blur ?? 12, rise = o.rise ?? 0;
      switch (enter) {
        case 'blur-rise': r.blur = (1 - a) * blur * 1.2 + b * blur; r.y = (1 - a) * Math.max(rise, 70) - b * 20; break;
        case 'pop': r.blur = b * blur * 0.4; r.scale = (0.55 + 0.45 * backOut(a)) * (1 - 0.06 * b); break;
        case 'slide': r.blur = (1 - a) * blur * 0.2 + b * blur * 0.3; r.y = (1 - a) * 160 - b * 60; r.scale = 1; break;
        case 'fade': r.blur = 0; r.scale = 1; r.y = 0; break;
        case 'wipe': r.blur = 0; r.scale = 1; r.y = 0; r.wipe = a * (1 - b); if (a > 0 && b < 1) r.opacity = Math.max(r.opacity, Math.min(1, a * 6) * (1 - b)); break;
      }
      return r;
    });
    trapProp(BM, 'show', (s0) => (el, r, extra) => {
      const ok = s0(el, r, extra);
      if (r && r.wipe != null) el.style.clipPath = r.wipe < 0.999 ? `inset(-10% ${((1 - r.wipe) * 100).toFixed(2)}% -10% -10%)` : '';
      return ok;
    });
  }
  let bm;
  Object.defineProperty(window, 'BM', { configurable: true, enumerable: true, get: () => bm, set: (v) => { bm = v; if (v && typeof v === 'object') patch(v); } });
})();
