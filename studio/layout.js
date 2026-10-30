// EditSync Stüdyo — esnek yerleşim. The preview stays in the centre and grows to fill whatever room is left; the other areas
// are panels (Sahneler, Paneller = Notlar/Düzenle/Altyazı/Varyant/SFX, Zaman çizelgesi) that live in three docks: left, right,
// bottom. Drag a panel's header to move it (drop on a dock edge, or onto another panel to sit before / after it); drag the
// splitters to resize; click a header to collapse it (a dock whose panels are all collapsed shrinks to a thin strip).
// The layout is remembered in localStorage; "↺ Yerleşim" resets it. Existing elements keep their ids, only their parents change.
(function () {
'use strict';
const KEY = 'edsLayout';
const DEF = () => ({ L: [], R: ['scenes', 'tabs'], B: ['tl'], wL: 380, wR: 520, hB: 250, grow: { scenes: 1, tabs: 3, tl: 1 }, min: {} });
let S = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.R && s.B && s.L) return { ...DEF(), ...s }; } catch {} return DEF(); })();
const saveS = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

// ---- build: panels around the existing markup ----
const app = document.querySelector('.app'), left = app.querySelector('.left'), right = app.querySelector('.right'), tl = $('tl');
const PANELS = { scenes: 'Sahneler', tabs: 'Paneller', tl: 'Zaman çizelgesi' };
const P = {};
for (const [id, title] of Object.entries(PANELS)) {
  const p = document.createElement('section'); p.className = 'pnl'; p.dataset.id = id;
  p.innerHTML = `<header class="phd" title="Sürükle: taşı · tıkla: daralt / aç"><span class="grip">⠿</span><span class="pt">${title}</span><button class="pmin" tabindex="-1">▾</button></header><div class="pbd"></div>`;
  P[id] = p;
}
const h1 = right.querySelector('h1');
P.scenes.querySelector('.pbd').append(h1, $('list'));
P.tabs.querySelector('.pbd').append($('tabs'), right.querySelector('.panes'));
P.tl.querySelector('.pbd').append(tl);
right.remove();
const center = document.createElement('div'); center.className = 'center'; center.id = 'center';
left.parentNode.insertBefore(center, left); center.appendChild(left);
const dock = (k) => { const d = document.createElement('div'); d.className = 'dock dock' + k; d.id = 'dock' + k; d.dataset.k = k; return d; };
const split = (k) => { const s = document.createElement('div'); s.className = 'splitter sp' + k; s.dataset.k = k; return s; };
const D = { L: dock('L'), R: dock('R'), B: dock('B') }, SP = { L: split('L'), R: split('R'), B: split('B') };
app.prepend(D.L, SP.L); center.after(SP.R, D.R, SP.B, D.B);
// reset button next to the player controls
const rb = document.createElement('button'); rb.textContent = '↺ Yerleşim'; rb.title = 'Yerleşimi sıfırla (paneller, boyutlar)';
rb.onclick = () => { S = DEF(); saveS(); apply(); };
const bar = left.querySelectorAll('.bar')[1] || left.querySelector('.bar'); bar.appendChild(rb);

// ---- apply state ----
function apply() {
  for (const k of ['L', 'R', 'B']) {
    const d = D[k]; d.querySelectorAll('.isplit').forEach((x) => x.remove());
    S[k] = S[k].filter((id) => P[id]);
    S[k].forEach((id, i) => { if (i) { const s = document.createElement('div'); s.className = 'isplit'; s.dataset.k = k; s.dataset.i = i; d.appendChild(s); } d.appendChild(P[id]); });
    const allMin = S[k].length && S[k].every((id) => S.min[id]);
    d.classList.toggle('allmin', !!allMin);
  }
  for (const id in P) { const m = !!S.min[id]; P[id].classList.toggle('min', m); P[id].querySelector('.pmin').textContent = m ? '▸' : '▾'; P[id].style.flexGrow = S.grow[id] || 1; }
  const has = (k) => S[k].length > 0, thin = (k) => D[k].classList.contains('allmin');
  app.style.setProperty('--wL', has('L') ? (thin('L') ? '34px' : S.wL + 'px') : '0px');
  app.style.setProperty('--wR', has('R') ? (thin('R') ? '34px' : S.wR + 'px') : '0px');
  app.style.setProperty('--hB', has('B') ? (thin('B') ? 'auto' : S.hB + 'px') : '0px');
  ['L', 'R', 'B'].forEach((k) => { D[k].hidden = !has(k); SP[k].hidden = !has(k) || thin(k); });
  fit(); dispatchEvent(new Event('resize')); // timeline refits to its new width
}

// ---- preview: as big as the centre allows (9:16, or the frame from segments.json) ----
function fit() {
  if (document.body.classList.contains('embed')) { stage.style.height = ''; return; }
  // everything in the column except the stage (control rows, hints) must stay visible
  // (sum the siblings directly: scrollHeight of a full-height column feeds back and shrinks the stage to nothing)
  const bars = [...left.children].filter((c) => c !== stage && !c.contains(stage) && getComputedStyle(c).position !== 'absolute')
    .reduce((a, c) => { const m = getComputedStyle(c); return a + c.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom); }, 0)
    + (parseFloat(getComputedStyle(left).rowGap) || 0) * Math.max(0, left.children.length - 1);
  const H = center.clientHeight - bars - 12, W = center.clientWidth - 8;
  const ar = window.EDS_FRAME ? EDS_FRAME[0] / EDS_FRAME[1] : 9 / 16;
  stage.style.height = Math.max(160, Math.floor(Math.min(H, W / ar))) + 'px';
}
new ResizeObserver(() => fit()).observe(center);
addEventListener('resize', () => requestAnimationFrame(fit));

// ---- splitters ----
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const sp = e.target.closest('.splitter'), is = e.target.closest('.isplit');
  if (sp) { drag = { kind: 'dock', k: sp.dataset.k }; }
  else if (is) {
    const d = D[is.dataset.k], i = +is.dataset.i, a = P[S[is.dataset.k][i - 1]], b = P[S[is.dataset.k][i]];
    const horiz = is.dataset.k === 'B', sa = horiz ? a.offsetWidth : a.offsetHeight, sb = horiz ? b.offsetWidth : b.offsetHeight;
    drag = { kind: 'inner', horiz, a, b, sa, sb, g: (S.grow[a.dataset.id] || 1) + (S.grow[b.dataset.id] || 1), x0: e.clientX, y0: e.clientY };
    if (S.min[a.dataset.id] || S.min[b.dataset.id]) { drag = null; return; }
  } else return;
  e.preventDefault(); document.body.classList.add('resizing');
  (sp || is).setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const R = app.getBoundingClientRect();
  if (drag.kind === 'dock') {
    if (drag.k === 'L') S.wL = Math.round(Math.max(220, Math.min(R.width * 0.5, e.clientX - R.left)));
    if (drag.k === 'R') S.wR = Math.round(Math.max(260, Math.min(R.width * 0.6, R.right - e.clientX)));
    if (drag.k === 'B') S.hB = Math.round(Math.max(90, Math.min(R.height * 0.7, R.bottom - e.clientY)));
    apply();
  } else if (drag.kind === 'inner') {
    const d = drag.horiz ? e.clientX - drag.x0 : e.clientY - drag.y0, tot = drag.sa + drag.sb;
    const na = Math.max(60, Math.min(tot - 60, drag.sa + d));
    S.grow[drag.a.dataset.id] = +(drag.g * (na / tot)).toFixed(3); S.grow[drag.b.dataset.id] = +(drag.g * (1 - na / tot)).toFixed(3);
    drag.a.style.flexGrow = S.grow[drag.a.dataset.id]; drag.b.style.flexGrow = S.grow[drag.b.dataset.id];
  }
});
document.addEventListener('pointerup', () => { if (drag) { drag = null; document.body.classList.remove('resizing'); saveS(); apply(); } });

// ---- panel headers: click = collapse, drag = move ----
const zones = document.createElement('div'); zones.className = 'dz'; zones.hidden = true;
zones.innerHTML = '<div data-k="L">Sola</div><div data-k="R">Sağa</div><div data-k="B">Alta</div><i class="ins"></i>';
document.body.appendChild(zones);
let mv = null;
function target(e) {
  const R = app.getBoundingClientRect();
  const over = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest && x.closest('.pnl')).find((x) => x && x !== mv.p);
  if (over) { // before / after another panel in its dock
    const k = over.parentElement.dataset.k, r = over.getBoundingClientRect(), after = k === 'B' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    return { k, before: after ? S[k][S[k].indexOf(over.dataset.id) + 1] ?? null : over.dataset.id, r, after, horiz: k === 'B' };
  }
  if (e.clientX < R.left + R.width * 0.18) return { k: 'L', before: null };
  if (e.clientX > R.right - R.width * 0.18) return { k: 'R', before: null };
  if (e.clientY > R.bottom - R.height * 0.25) return { k: 'B', before: null };
  return null;
}
document.addEventListener('pointerdown', (e) => {
  const hd = e.target.closest('.phd'); if (!hd || e.button !== 0) return;
  mv = { p: hd.parentElement, x0: e.clientX, y0: e.clientY, moved: false, btn: !!e.target.closest('.pmin') };
  hd.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!mv) return;
  if (!mv.moved && Math.hypot(e.clientX - mv.x0, e.clientY - mv.y0) > 6 && !mv.btn) { mv.moved = true; zones.hidden = false; mv.p.classList.add('moving'); }
  if (!mv.moved) return;
  const t = target(e), ins = zones.querySelector('.ins');
  zones.querySelectorAll('[data-k]').forEach((z) => z.classList.toggle('on', !!t && !t.r && t.k === z.dataset.k));
  if (t && t.r) { ins.style.display = 'block'; Object.assign(ins.style, t.horiz ? { left: (t.after ? t.r.right : t.r.left) - 2 + 'px', top: t.r.top + 'px', width: '4px', height: t.r.height + 'px' } : { left: t.r.left + 'px', top: (t.after ? t.r.bottom : t.r.top) - 2 + 'px', width: t.r.width + 'px', height: '4px' }); }
  else ins.style.display = 'none';
  mv.t = t;
});
document.addEventListener('pointerup', () => {
  if (!mv) return;
  const id = mv.p.dataset.id;
  if (!mv.moved) { S.min[id] = !S.min[id]; }
  else if (mv.t) {
    for (const k of ['L', 'R', 'B']) S[k] = S[k].filter((x) => x !== id);
    const L = S[mv.t.k], i = mv.t.before ? L.indexOf(mv.t.before) : -1;
    if (i >= 0) L.splice(i, 0, id); else L.push(id);
    S.min[id] = false;
  }
  zones.hidden = true; mv.p.classList.remove('moving'); mv = null; saveS(); apply();
});

window.LAYOUT = { toggle: (id) => { S.min[id] = !S.min[id]; saveS(); apply(); }, reset: () => { S = DEF(); saveS(); apply(); }, get state() { return S; }, fit };
apply();
setInterval(fit, 1000); // embed mode / bar wrapping changes
})();
