// EditSync Stüdyo — Zaman çizelgesi: ruler, segment blocks (trim / move / transition), head-audio waveform, subtitle word track,
// SFX lane (drawn by sfx.js), notes + markers. Timing edits go to work/timing.json { segs: {id: {start,end,trans}}, markers: [{t}] },
// never into segments.json; index.html applies them at load and the blocks edit the live SEGS objects directly.
// Uses index.html globals (v, SEGS, DATA, $, segAt).
(function () {
'use strict';
const COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#00a2c7', '#3e63dd', '#8e4ec6', '#d6409f', '#ad7f58', '#9bb83a', '#6e9bf5'];
const scroll = $('tlScroll'), inner = $('tlInner');
let pps = 0, WAVE = null, WORDS = [], NOTES = [], TIMING = { segs: {}, markers: [] }, selSeg = null;
const dur = () => (typeof DATA !== 'undefined' && DATA && DATA.duration) || v.duration || 60;
const t2x = (t) => t * pps, x2t = (x) => x / pps;
const f2 = (x) => x.toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

inner.innerHTML = `<div class="lane ruler" id="tlRuler"></div><div class="lane seg" id="tlSeg"><span class="lab">Segment</span></div>
  <div class="lane wav"><canvas id="tlWave"></canvas><span class="lab" style="position:absolute;left:0">Ses</span></div>
  <div class="lane words" id="tlWords"><span class="lab">Kelime</span></div><div class="lane subs" id="tlSubs"><span class="lab">Altyazı</span></div><div class="lane sfx" id="tlSfx"><span class="lab">SFX</span></div>
  <div class="lane marks" id="tlMarks"><span class="lab">İşaret</span></div><div class="ph" id="tlPh"></div>`;
document.head.insertAdjacentHTML('beforeend', `<style>
  .lane.subs{position:relative;height:30px}
  .lane.subs .cue{position:absolute;top:4px;height:22px;border-radius:5px;background:#2a2626;border:1px solid #6b6060;color:#f2eeee;font-size:11px;line-height:20px;padding:0 7px;overflow:hidden;white-space:nowrap;cursor:grab;box-sizing:border-box}
  .lane.subs .cue.man{border-color:#e5484d;background:#3a2222}
  .lane.subs .cue.on{outline:2px solid #fff}
  .lane.subs .cue .h{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(255,255,255,.18)}
  .lane.subs .cue .h.l{left:0}.lane.subs .cue .h.r{right:0}
  .lane.seg .scn{position:absolute;top:3px;bottom:3px;border-radius:4px;color:#fff;font-size:10px;padding:0 4px;overflow:hidden;white-space:nowrap;cursor:pointer;box-sizing:border-box;border-left:2px solid rgba(255,255,255,.7)}
</style>`);
let SHOTS = []; // work/shots.json (scene list) — shown when there are no segments

// ---- data ----
async function loadAll() {
  try { TIMING = await (await fetch('/api/store/timing', { cache: 'no-store' })).json(); } catch {}
  TIMING.segs = TIMING.segs || {}; TIMING.markers = TIMING.markers || [];
  try { WAVE = await (await fetch('/api/waveform', { cache: 'no-store' })).json(); } catch { WAVE = null; }
  try { // same word list / indices as subs.js
    const txt = await (await fetch('/work/words.txt', { cache: 'no-store' })).text(), W = [];
    for (const ln of txt.split(/\r?\n/)) { const m = /^\s+([\d.]+)\s+(\S.*)$/.exec(ln); if (!m) continue; const w = m[2].trim(); if (/^['’]/.test(w) && W.length) { W[W.length - 1].w += w; continue; } W.push({ t: +m[1], w }); }
    WORDS = W.map((x, i) => ({ ...x, i }));
  } catch {}
  try { NOTES = await (await fetch('/api/notes', { cache: 'no-store' })).json(); } catch {}
  try { SHOTS = await (await fetch('/work/shots.json', { cache: 'no-store' })).json(); } catch { SHOTS = []; }
  fit(); draw();
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => fetch('/api/store/timing', { method: 'POST', body: JSON.stringify(TIMING) }).catch(() => {}), 350);
}
function record(s) { // keep only what differs from segments.json
  const o = {}, O = s._orig || {};
  if (Math.abs(s.start - O.start) > 1e-4) o.start = +s.start.toFixed(3);
  if (Math.abs(s.end - O.end) > 1e-4) o.end = +s.end.toFixed(3);
  if ((s.trans || 'blur') !== (O.trans || 'blur')) o.trans = s.trans || 'blur';
  if (Object.keys(o).length) TIMING.segs[s.id] = o; else delete TIMING.segs[s.id];
  save();
}

// ---- snapping: word starts, markers, other segment edges, playhead ----
function snap(t, self) {
  if (!$('tlSnap').checked || window.__altKey) return t;
  const cands = [...WORDS.map((w) => w.t), ...TIMING.markers.map((m) => m.t), ...SEGS.filter((s) => s !== self).flatMap((s) => [s.start, s.end]), v.currentTime];
  let best = t, bd = 7 / pps; for (const c of cands) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
  return best;
}
addEventListener('keydown', (e) => (window.__altKey = e.altKey)); addEventListener('keyup', (e) => (window.__altKey = e.altKey));

// ---- drawing ----
function fit() { pps = Math.max(8, (scroll.clientWidth - 4) / dur()); }
function draw() {
  if (!pps) return;
  const W = t2x(dur()); inner.style.width = W + 'px';
  // ruler
  const step = pps > 120 ? 0.5 : pps > 50 ? 1 : pps > 20 ? 2 : 5;
  let r = ''; for (let t = 0; t <= dur(); t += step) r += `<span class="tk" style="left:${t2x(t)}px">${step < 1 ? t.toFixed(1) : Math.round(t)}</span>`;
  // transition diamonds live in the ruler, at each segment's start (clear of the trim handles)
  r += SEGS.map((s, i) => (i ? `<div class="tr${s.trans === 'flash' ? ' flash' : ''}" data-id="${s.id}" style="left:${t2x(s.start)}px" title="${s.id} geçişi: ${s.trans === 'flash' ? 'beyaz flaş' : 'blur'} (tıkla: değiştir)"></div>` : '')).join('');
  $('tlRuler').innerHTML = r;
  // segments + transition diamonds
  $('tlSeg').innerHTML = '<span class="lab">Segment</span>' + SEGS.map((s, i) => {
    const mod = TIMING.segs[s.id] ? ' mod' : '', on = segAt(v.currentTime) === s ? ' on' : '';
    return `<div class="blk${mod}${on}" data-id="${s.id}" style="left:${t2x(s.start)}px;width:${Math.max(4, t2x(s.end - s.start))}px;background:${COLORS[i % COLORS.length]}cc" title="${s.id} · ${esc(s.name)} · ${f2(s.start)}–${f2(s.end)}${mod ? ' · değiştirildi (çift tık: sıfırla)' : ''}"><span class="h l"></span>${s.id} ${esc(s.name)}<span class="h r"></span></div>`
      ;
  }).join('');
  if (!SEGS.length && SHOTS.length) // no segments (a finished video as the base): show the scenes, read-only (click = jump)
    $('tlSeg').innerHTML = '<span class="lab">Sahne</span>' + SHOTS.map((s, i) => `<div class="scn" data-t="${s.s}" style="left:${t2x(s.s)}px;width:${Math.max(3, t2x(s.e - s.s) - 1)}px;background:${COLORS[i % COLORS.length]}99" title="${s.id} · ${s.f} · ${f2(s.s)}–${f2(s.e)}">${s.id}</div>`).join('');
  // waveform
  const cv = $('tlWave'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  cv.width = Math.min(32000, W * dpr); cv.height = 40 * dpr; cv.style.width = W + 'px';
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (WAVE) { ctx.fillStyle = '#5c5353'; const k = cv.width / W; WAVE.peaks.forEach((p, i) => { const x = t2x(i * WAVE.step) * k, h = Math.max(1, p * 38 * dpr); ctx.fillRect(x, (cv.height - h) / 2, Math.max(1, t2x(WAVE.step) * k - 0.5), h); }); }
  drawWords(); drawSubs(); drawMarks(); if (window.SFX) SFX.drawLane();
}
// ---- caption lane (subs.js cues): drag the edges to set start / end, drag the body to move, double click = automatic ----
let CUEL = [];
function drawSubs() {
  CUEL = window.SUBCUES ? SUBCUES.list().slice() : [];
  $('tlSubs').innerHTML = '<span class="lab">Altyazı</span>' + CUEL.map((c, i) => `<div class="cue${c.man ? ' man' : ''}" data-i="${i}" style="left:${t2x(c.s)}px;width:${Math.max(6, t2x(c.e - c.s) - 1)}px" title="${esc(c.w.map((w) => w[1]).join(' '))} · ${f2(c.s)}–${f2(c.e)} (${f2(c.e - c.s)} sn)${c.man ? ' · elle ayarlandı (çift tık: otomatiğe dön)' : ''}"><span class="h l"></span>${pps >= 30 ? esc(c.w.map((w) => w[1]).join(' ')) : ''}<span class="h r"></span></div>`).join('');
}
setInterval(() => { if (!pps || !window.SUBCUES || (drag && drag.kind === 'cue')) return; const k = SUBCUES.list().map((c) => c.s + ':' + c.e).join(); if (k !== drawSubs.k) { drawSubs.k = k; drawSubs(); } }, 500);
function drawWords() {
  const on = (i) => { const o = window.SUBS && SUBS.words && SUBS.words[i]; return SUBS && SUBS.mode !== 'all' ? !!(o && o.on) : !(o && o.off); };
  const showText = pps >= 45;
  $('tlWords').innerHTML = '<span class="lab">Kelime</span>' + WORDS.map((w, i) => { const nx = WORDS[i + 1] ? WORDS[i + 1].t : w.t + 0.4;
    return `<span class="wd${on(w.i) ? ' on' : ''}" data-t="${w.t}" style="left:${t2x(w.t)}px;width:${Math.max(2, t2x(nx - w.t) - 1)}px" title="${esc(w.w)} · ${f2(w.t)}">${showText ? esc(w.w) : ''}</span>`; }).join('');
}
function drawMarks() {
  $('tlMarks').innerHTML = '<span class="lab">İşaret</span>' + NOTES.map((n) => `<span class="mk note" style="left:${t2x(n.t)}px" data-t="${n.t}" title="Not · ${f2(n.t)} · ${esc(n.text)}">n</span>`).join('')
    + TIMING.markers.map((m, i) => `<span class="mk mark" style="left:${t2x(m.t)}px" data-t="${m.t}" data-i="${i}" title="İşaret · ${f2(m.t)} (sağ tık: sil)">◆</span>`).join('');
}
// follow the panel's width (layout.js docks / splitters): stay fitted unless the user zoomed in
let userZoom = false, lastW = 0;
new ResizeObserver(() => { const w = scroll.clientWidth; if (!w || w === lastW) return; lastW = w; const t = x2t(scroll.scrollLeft); if (!userZoom) fit(); else pps = Math.max(pps, (w - 4) / dur()); draw(); scroll.scrollLeft = t2x(t); }).observe(scroll);

// ---- playhead + follow ----
function loop() {
  requestAnimationFrame(loop);
  if (!pps) return;
  const x = t2x(v.currentTime); $('tlPh').style.left = x + 'px';
  if (!v.paused && !drag && (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40)) scroll.scrollLeft = x - 60;
  const s = segAt(v.currentTime), id = s ? s.id : '';
  if (id !== loop.id) { loop.id = id; $('tlSeg').querySelectorAll('.blk').forEach((b) => b.classList.toggle('on', b.dataset.id === id)); }
  if (window.SUBS && SUBS.words !== loop.w) { loop.w = SUBS.words; }
}
// subtitle words change in subs.js -> refresh the word track now and then (cheap)
setInterval(() => { if (pps && window.SUBS) { const k = JSON.stringify(SUBS.words) + SUBS.mode; if (k !== drawWords.k) { drawWords.k = k; drawWords(); } } }, 700);

// ---- interaction ----
let drag = null;
const tAt = (e) => x2t(e.clientX - inner.getBoundingClientRect().left);
inner.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const blk = e.target.closest('.blk'), tr = e.target.closest('.tr'), wd = e.target.closest('.wd'), mk = e.target.closest('.mk');
  if (e.target.closest('.sfxb')) return; // sfx.js
  if (tr) { const s = SEGS.find((q) => q.id === tr.dataset.id); if (s.trans === 'flash') delete s.trans; else s.trans = 'flash'; record(s); draw(); toastT(`${s.id}: ${s.trans === 'flash' ? 'flaş' : 'blur'} geçiş`); return; }
  if (blk) {
    const s = SEGS.find((q) => q.id === blk.dataset.id), mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    drag = { kind: 'seg', s, mode, t0: tAt(e), a: s.start, b: s.end, moved: false }; inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  const cue = e.target.closest('.cue'), scn = e.target.closest('.scn');
  if (cue) {
    const c = CUEL[+cue.dataset.i], mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    drag = { kind: 'cue', c, el: cue, mode, t0: tAt(e), a: c.s, b: c.e, s: c.s, e: c.e, moved: false }; inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  if (scn) { v.pause(); v.currentTime = +scn.dataset.t + 0.001; return; }
  if (mk) { v.pause(); v.currentTime = +mk.dataset.t + 0.001; return; }
  if (wd) { v.pause(); v.currentTime = +wd.dataset.t + 0.001; return; }
  // empty space / ruler: scrub
  drag = { kind: 'scrub', wasPlaying: !v.paused }; v.pause(); v.currentTime = Math.max(0, Math.min(dur(), tAt(e))); inner.setPointerCapture(e.pointerId);
});
inner.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.kind === 'scrub') { v.currentTime = Math.max(0, Math.min(dur(), tAt(e))); return; }
  if (drag.kind === 'cue') {
    const d = tAt(e) - drag.t0; if (Math.abs(d * pps) > 2) drag.moved = true; if (!drag.moved) return;
    if (drag.mode === 'l') drag.s = Math.min(drag.b - 0.1, Math.max(0, snap(drag.a + d)));
    else if (drag.mode === 'r') drag.e = Math.max(drag.a + 0.1, Math.min(dur(), snap(drag.b + d)));
    else { const len = drag.b - drag.a; drag.s = Math.max(0, Math.min(dur() - len, snap(drag.a + d))); drag.e = drag.s + len; }
    drag.el.style.left = t2x(drag.s) + 'px'; drag.el.style.width = Math.max(6, t2x(drag.e - drag.s) - 1) + 'px';
    v.pause(); v.currentTime = drag.mode === 'r' ? Math.max(drag.s, drag.e - 0.04) : drag.s + 0.01; // preview the edge being moved
    return;
  }
  if (drag.kind === 'seg') {
    const d = tAt(e) - drag.t0, s = drag.s; if (Math.abs(d * pps) > 2) drag.moved = true; if (!drag.moved) return;
    if (drag.mode === 'l') s.start = Math.min(s.end - 0.2, Math.max(0, snap(drag.a + d, s)));
    else if (drag.mode === 'r') s.end = Math.max(s.start + 0.2, Math.min(dur(), snap(drag.b + d, s)));
    else { const len = drag.b - drag.a; let a = snap(drag.a + d, s); a = Math.max(0, Math.min(dur() - len, a)); s.start = a; s.end = a + len; }
    const el = $('tlSeg').querySelector(`.blk[data-id="${s.id}"]`); el.style.left = t2x(s.start) + 'px'; el.style.width = t2x(s.end - s.start) + 'px';
    const tr = $('tlRuler').querySelector(`.tr[data-id="${s.id}"]`); if (tr) tr.style.left = t2x(s.start) + 'px';
    el.title = `${s.id} · ${f2(s.start)}–${f2(s.end)}`;
  }
});
const up = () => {
  if (!drag) return;
  if (drag.kind === 'seg') { if (drag.moved) { record(drag.s); refreshList(); draw(); } else { v.pause(); v.currentTime = drag.s.start + 0.001; } }
  if (drag.kind === 'cue') {
    const g = drag; drag = null;
    if (g.moved) { SUBCUES.setEdges(g.c, g.mode === 'r' ? null : g.s, g.mode === 'l' ? null : g.e); toastT(`Altyazı ${f2(g.s)}–${f2(g.e)} sn`); setTimeout(drawSubs, 50); }
    else { v.pause(); v.currentTime = g.c.s + 0.01; }
    return;
  }
  drag = null;
};
inner.addEventListener('pointerup', up); inner.addEventListener('pointercancel', up);
inner.addEventListener('dblclick', (e) => { // reset a segment's timing to segments.json (or a caption to automatic)
  const cue = e.target.closest('.cue'); if (cue) { SUBCUES.reset(CUEL[+cue.dataset.i]); toastT('Altyazı otomatik süreye döndü'); setTimeout(drawSubs, 50); return; }
  const blk = e.target.closest('.blk'); if (!blk) return; const s = SEGS.find((q) => q.id === blk.dataset.id), O = s._orig;
  s.start = O.start; s.end = O.end; if (O.trans) s.trans = O.trans; else delete s.trans; record(s); refreshList(); draw(); toastT(`${s.id}: orijinal zamanlama`);
});
inner.addEventListener('contextmenu', (e) => { const mk = e.target.closest('.mk.mark'); if (!mk) return; e.preventDefault(); TIMING.markers.splice(+mk.dataset.i, 1); save(); drawMarks(); });
scroll.addEventListener('wheel', (e) => { // ctrl+wheel: zoom around the pointer
  if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
  const r = scroll.getBoundingClientRect(), t = x2t(e.clientX - r.left + scroll.scrollLeft);
  zoom(e.deltaY < 0 ? 1.25 : 0.8, t, e.clientX - r.left);
}, { passive: false });
function zoom(k, tAnchor = v.currentTime, px = scroll.clientWidth / 2) {
  const min = (scroll.clientWidth - 4) / dur(); pps = Math.max(min, Math.min(600, pps * k)); userZoom = pps > min + 0.01; draw(); scroll.scrollLeft = t2x(tAnchor) - px;
}
$('tlIn').onclick = () => zoom(1.5); $('tlOut').onclick = () => zoom(1 / 1.5); $('tlFit').onclick = () => { userZoom = false; fit(); draw(); scroll.scrollLeft = 0; };
$('tlMin').onclick = () => (window.LAYOUT ? LAYOUT.toggle('tl') : document.body.classList.toggle('tlmin'));
addEventListener('keydown', (e) => {
  const tg = e.target; if (tg.tagName === 'TEXTAREA' || tg.isContentEditable || (tg.tagName === 'INPUT' && !/^(range|checkbox|button|color|file)$/.test(tg.type))) return;
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) { TIMING.markers.push({ t: +v.currentTime.toFixed(3) }); TIMING.markers.sort((a, b) => a.t - b.t); save(); drawMarks(); toastT('İşaret eklendi'); }
});
function refreshList() { // left segment list shows the (possibly edited) times
  document.querySelectorAll('.seg').forEach((el) => { const s = SEGS.find((q) => q.id === el.dataset.id), tm = el.querySelector('.tm'); if (s && tm) tm.textContent = `${f2(s.start)} – ${f2(s.end)} · ${s.layout}${TIMING.segs[s.id] ? ' · ✎' : ''}`; });
}
const toastT = (m) => (window.toast ? toast(m) : null);

window.TL = { get pps() { return pps; }, t2x, x2t, snap, draw, tAt, get markers() { return TIMING.markers; }, get words() { return WORDS; } };
addEventListener('eds:segments', () => { loadAll().then(refreshList); });
if (SEGS.length) loadAll().then(refreshList); else setTimeout(() => { if (!pps) loadAll().then(refreshList); }, 1500); // no segments: draw anyway
requestAnimationFrame(loop);
})();
