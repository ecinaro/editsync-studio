// EditSync Stüdyo — Altyazı katmanı (kelime kelime). Word timings from work/words.txt ("[ a- b] sentence" + "   t  word").
// The overlay is always on. Default: only the words you switch on are shown, each as its own caption from its start to the
// next word (min 0.35 s, max 1.5 s); with "merge", neighbouring switched-on words become one caption.
// Stored in work/subtitles.json:
// { v: 2, enabled: true, mode: 'picked', merge, preset, size, x, y,          (x/y = caption centre, 0..1 of the frame)
//   colors: { text?, acc?, line?, box?, boxA? },                            unset = the preset's own colour
//   words: { "<word index>": { on?, text?, style?: 'red'|'osw' } },         word index = order in words.txt
//   chunks: [...], segs: {}, sents: {} }   (legacy chunk mode 'all' is still understood, but has no UI any more)
// Uses index.html globals (v, stage, SEGS, $).
(function () {
'use strict';
const SUB = { v: 2, enabled: true, mode: 'picked', merge: false, preset: 'bold', size: 1, x: 0.5, y: 0.7, colors: {}, words: {}, chunks: [], segs: {}, sents: {} };
let WORDS = []; // [{ i, t, w, nx }]
let WIDX = new Map(); // round(t*100) -> word index (legacy chunk mode)
const PRESETS = [
  ['bold', 'Oswald kontur'], ['red', 'Kırmızı vurgu'], ['karaoke', 'Karaoke dolgu'], ['pill', 'Beyaz kutu'], ['mini', 'Minimal küçük'],
  ['serif', 'Serif italik'], ['soft', 'Yumuşak gölge'], ['sred', 'İtalik kırmızı'], ['mix', 'karışık VURGU'], ['under', 'Altı çizili'],
  ['dpill', 'Koyu şeffaf kutu'], ['edit', 'editoryal Başlık'], ['pop', 'Büyüyen kelime'], ['dot', 'Kırmızı nokta'], ['roman', 'Zarif roman'], ['blur', 'Bulanık yükseliş'],
];
// one distinct tone per segment group (works on the dark UI)
const GROUP_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#00a2c7', '#3e63dd', '#8e4ec6', '#d6409f', '#ad7f58', '#9bb83a', '#6e9bf5'];
const SWATCHES = [['#FFFFFF', 'Beyaz'], ['#0B0B0B', 'Siyah'], ['#FF0000', 'Kırmızı'], ['#FFD400', 'Sarı'], ['#A8A0A0', 'Gri']];
const box = $('subs');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f2 = (x) => x.toFixed(2), f3 = (x) => Math.round(x * 1000) / 1000;
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

async function loadWords() {
  const txt = await (await fetch('/work/words.txt', { cache: 'no-store' })).text(), W = [];
  for (const ln of txt.split(/\r?\n/)) {
    const m = /^\s+([\d.]+)\s+(\S.*)$/.exec(ln); if (!m) continue;
    const w = m[2].trim();
    if (/^['’]/.test(w) && W.length) { W[W.length - 1].w += w; continue; } // Harvard + 'ın -> Harvard'ın
    W.push({ t: +m[1], w });
  }
  WORDS = W.map((x, i) => ({ i, t: x.t, w: x.w, nx: W[i + 1] ? W[i + 1].t : x.t + 0.6 }));
  WIDX = new Map(WORDS.map((x) => [Math.round(x.t * 100), x.i])); dirty = true;
}

let saveT = 0, dirty = true;
function save() {
  dirty = true; clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { const r = await (await fetch('/api/subtitles', { method: 'POST', body: JSON.stringify(SUB) })).json(); msg(r.ok ? 'Kaydedildi ✓' : 'Hata: ' + r.error); }
    catch (e) { msg('Kaydedilemedi: ' + e.message); }
  }, 400);
}
function msg(m) { $('sMsg').textContent = m; clearTimeout(msg.t); msg.t = setTimeout(() => ($('sMsg').textContent = ''), 2500); }

// ---- what goes on screen: "cues" ----
const wcfg = (k) => (k == null ? {} : SUB.words[k] || {});
const picked = () => SUB.mode !== 'all';
const wordOn = (x) => (picked() ? !!wcfg(x.i).on : !wcfg(x.i).off);
const wtxt = (k, def) => (wcfg(k).text != null ? wcfg(k).text : def);
// ---- grouping ("birleştir"): a run of neighbouring words -> captions of 1..SUB.group words ----
// Breaks at punctuation and speech pauses; longer phrases are split evenly (4 -> 2+2, 5 -> 3+2); a caption never ends on a
// joining word (ve, bir, bu ...). Manual: words[k].br = 'cut' (always break after k) | 'join' (never break after k).
// Inside a phrase the split is scored (dynamic programming): pauses in the speech are good places to cut, a caption should not
// end on a joining word (ve, bir, bu ...) nor start on a clitic / postposition (ki, de, da, ile, gibi ...); 2 words is the
// sweet spot, 1 and 3 are fine — so captions come out as a natural mix of 1, 2 and 3 words.
const JOINERS = new Set(['ve', 'ama', 'fakat', 'ya', 'veya', 'çünkü', 'eğer', 'bir', 'bu', 'şu', 'o', 'her', 'hiç', 'en', 'çok', 'daha', 'hem', 'ne', 'mesela', 'tabii', 'yani', 'siz', 'ben', 'bunun', 'benim']);
const CLITICS = new Set(['ki', 'de', 'da', 'te', 'ta', 'mi', 'mı', 'mu', 'mü', 'ile', 'gibi', 'için', 'kadar', 'olarak', 'ise', 'boyunca', 'birlikte', 'adında']);
const STARTERS = new Set(['ve', 'ama', 'fakat', 'çünkü', 'ya', 'veya', 'yani', 'eğer', 'böylece', 'sonuçta']);
const bare = (s) => String(s).toLocaleLowerCase('tr').replace(/[^\p{L}\d]/gu, '');
const SIZE_COST = [0, 0.9, 0, 0.35, 1.2, 2];
function phrases(r) {
  const N = Math.max(1, Math.min(5, +SUB.group || 3)), br = (w) => wcfg(w[2]).br;
  const P = []; let cur = [];
  r.forEach((w, j) => { // hard breaks: punctuation, a clear pause, a manual cut
    cur.push(w); const n = r[j + 1]; if (!n) return;
    const cut = br(w) === 'cut' || (br(w) !== 'join' && (/[.,!?;:…]$/.test(w[1]) || n[0] - w[0] > 0.75));
    if (cut) { P.push(cur); cur = []; }
  });
  if (cur.length) P.push(cur);
  const cutCost = (p, j) => { // cost of ending a caption after p[j] (p[j+1] starts the next one)
    const a = p[j], b = p[j + 1]; if (br(a) === 'join') return 1e6;
    let c = 0.6 - Math.min(0.45, Math.max(0, b[0] - a[0] - 0.32)) * 6; // longer gap before b -> cheaper cut
    if (JOINERS.has(bare(a[1])) || /^\d+$/.test(bare(a[1]))) c += 3; if (CLITICS.has(bare(b[1]))) c += 3;
    if (STARTERS.has(bare(b[1]))) c -= 1.5; // "… var | ve nereye …": a conjunction opens the next caption
    return c;
  };
  const out = [];
  for (const p of P) {
    const n = p.length, best = [0], from = [0];
    for (let i = 1; i <= n; i++) { best[i] = Infinity;
      for (let s = Math.max(0, i - N); s < i; s++) {
        const c = best[s] + SIZE_COST[i - s] + (s > 0 ? cutCost(p, s - 1) : 0);
        if (c < best[i]) { best[i] = c; from[i] = s; }
      } }
    const cuts = []; for (let i = n; i > 0; i = from[i]) cuts.unshift([from[i], i]);
    for (const [s, e] of cuts) out.push(p.slice(s, e));
  }
  return out;
}
let CUES = [], SCENE_CUTS = []; // scene cut times (work/shots.json starts), for the auto end
fetch('/work/shots.json', { cache: 'no-store' }).then((r) => r.json()).then((L) => { SCENE_CUTS = L.map((s) => +s.s).filter((t) => t > 0).sort((a, b) => a - b); dirty = true; }).catch(() => {});
function cues() { // [{ s, e, w: [[t, text, wordIndex]] }] sorted by start
  if (!dirty) return CUES; dirty = false;
  const out = [];
  if (picked()) {
    let run = null; const runs = [];
    for (const x of WORDS) { // runs of neighbouring switched-on words
      if (!wcfg(x.i).on) { run = null; continue; }
      const hold = cl(+SUB.hold || 1.5, 0.3, 3), e = +f2(Math.max(Math.min(x.nx, x.t + hold), x.t + 0.35)), item = [x.t, wtxt(x.i, x.w), x.i, e];
      if (run && run[run.length - 1][2] === x.i - 1) run.push(item); else runs.push((run = [item]));
    }
    for (const r of runs) for (const g of (SUB.merge ? phrases(r) : r.map((w) => [w])))
      out.push({ s: g[0][0], e: g[g.length - 1][3], w: g.map((w) => w.slice(0, 3)) });
  } else { // legacy: chunk by chunk minus switched-off words
    for (const c of SUB.chunks) {
      if (c.hidden) continue;
      const w = []; for (const [t, x] of c.w) { const k = WIDX.get(Math.round(t * 100)); if (k != null && wcfg(k).off) continue; w.push([t, wtxt(k, x), k]); }
      if (w.length) out.push({ s: c.s, e: c.e, w });
    }
  }
  for (const c of out) { // auto: a caption ends at the next scene cut; manual: words[first].s0 / words[last].e0 (timeline handles)
    const k0 = c.w[0][2], k1 = c.w[c.w.length - 1][2]; c.k0 = k0; c.k1 = k1;
    if (SUB.sceneCut !== false) { const cut = SCENE_CUTS.find((t) => t > c.s + 0.25 && t < c.e); if (cut != null) c.e = cut; }
    const s0 = wcfg(k0).s0, e0 = wcfg(k1).e0;
    if (s0 != null) c.s = s0; if (e0 != null) c.e = e0; c.man = s0 != null || e0 != null;
    if (c.e < c.s + 0.1) c.e = c.s + 0.1;
  }
  out.sort((a, b) => a.s - b.s);
  out.forEach((c, i) => { const n = out[i + 1]; if (n && c.e > n.s) c.e = n.s; }); // a caption ends when the next starts (no overlap in SRT)
  return (CUES = out);
}

// ---- edit target: the global settings, or (with "apply to all" off) the private look of the selected word ----
// SUB.words[k].ov = { preset?, size?, x?, y?, colors? }  ·  a caption uses the first override among its words (merged neighbours share it)
let selW = null;
const applyAll = () => selW == null || $('sAll').checked;
function tgt(create) { if (applyAll()) return SUB; const o = SUB.words[selW] || (SUB.words[selW] = {}); if (!o.ov && create) o.ov = {}; return o.ov || null; }
const ovOf = (q) => { if (!q) return null; for (const w of q.w) { const o = wcfg(w[2]).ov; if (o) return o; } return null; };
function lookOf(o) { o = o || {}; return { preset: o.preset ?? SUB.preset, size: o.size ?? SUB.size, x: o.x ?? SUB.x ?? 0.5, y: o.y ?? SUB.y, colors: { ...(SUB.colors || {}), ...(o.colors || {}) } }; }
const tgtLook = () => lookOf(applyAll() ? null : wcfg(selW).ov);

// ---- colours -> CSS variables (on the stage caption, the preset cards and the chips) ----
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function colorVars(el, C) {
  const vars = { '--st-text': C.text, '--st-acc': C.acc, '--st-line': C.line, '--st-sh': C.line ? rgba(C.line, 0.55) : null,
    '--st-boxbg': C.box ? rgba(C.box, C.boxA ?? 0.85) : null, '--st-boxa': C.boxA != null ? C.boxA : null };
  for (const [k, val] of Object.entries(vars)) { if (val == null) el.style.removeProperty(k); else el.style.setProperty(k, val); }
}
function applyColors() { const C = tgtLook().colors; for (const el of [$('sPresets'), $('sWords')]) colorVars(el, C); last = ''; }
const COLOR_ROWS = [['text', 'Metin'], ['acc', 'Vurgu (aktif / kırmızı)'], ['line', 'Kontur / gölge'], ['box', 'Kutu arka planı']];
function colorUI() {
  const C = tgtLook().colors, own = applyAll() ? SUB.colors || {} : (wcfg(selW).ov || {}).colors || {};
  $('sColors').innerHTML = COLOR_ROWS.map(([k, label]) => `<div class="colrow" data-k="${k}"><span>${label}</span><div class="sws">
      ${SWATCHES.map(([c, n]) => `<button class="sw${(C[k] || '').toUpperCase() === c ? ' on' : ''}" data-c="${c}" title="${n}" style="background:${c}"></button>`).join('')}
      <input type="color" value="${C[k] || '#ffffff'}" title="Özel renk"><button class="def${own[k] ? '' : ' on'}" data-c="">${applyAll() ? 'Varsayılan' : 'Genel'}</button></div></div>`).join('') +
    `<div class="colrow"><span>Kutu opaklığı</span><div class="sws"><input type="range" id="sBoxA" min="0" max="1" step="0.05" value="${C.boxA ?? 0.85}" style="flex:1"><span class="hint" id="sBoxAV">${C.boxA != null ? Math.round(C.boxA * 100) + '%' : 'varsayılan'}</span><button class="def${own.boxA != null ? '' : ' on'}" id="sBoxAX">${applyAll() ? 'Varsayılan' : 'Genel'}</button></div></div>`;
  applyColors();
}
const tgtColors = () => { const t = tgt(true); if (t === SUB) return (SUB.colors = SUB.colors || {}); return (t.colors = t.colors || {}); };
function changed() { const o = selW != null && SUB.words[selW]; if (o && o.ov) { if (o.ov.colors && !Object.keys(o.ov.colors).length) delete o.ov.colors; if (!Object.keys(o.ov).length) delete o.ov; tidyW(selW); }
  if (selW != null) { const c = $('sWords').querySelector(`.chip[data-i="${selW}"]`); if (c) c.classList.toggle('ovr', !!(SUB.words[selW] || {}).ov); }
  last = ''; save(); editUI(); }
function setColor(k, c) { const C = tgtColors(); if (c) C[k] = c.toUpperCase(); else delete C[k]; colorUI(); changed(); }
$('sColors').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (!b) return; setColor(b.closest('.colrow').dataset.k, b.dataset.c); });
$('sColors').addEventListener('change', (e) => { if (e.target.type === 'color') setColor(e.target.closest('.colrow').dataset.k, e.target.value); });
$('sColors').addEventListener('input', (e) => {
  if (e.target.id !== 'sBoxA') return; const C = tgtColors(); C.boxA = +e.target.value;
  $('sBoxAV').textContent = Math.round(C.boxA * 100) + '%'; $('sBoxAX').classList.remove('on'); applyColors(); changed();
});
$('sColors').addEventListener('click', (e) => { if (e.target.id === 'sBoxAX') { delete tgtColors().boxA; colorUI(); changed(); } });
// ---- markup per preset ----
const longest = (ws) => ws.reduce((b, w, i) => (w.replace(/[^\p{L}\d]/gu, '').length > ws[b].replace(/[^\p{L}\d]/gu, '').length ? i : b), 0);
function capHTML(p, ws, ai, st = []) {
  ws = ws.slice();
  if (p === 'dot' && ws.length) ws[ws.length - 1] = ws[ws.length - 1].replace(/[.,!?;:…]+$/, '');
  const em = p === 'mix' ? longest(ws) : -1;
  const sp = (w, i) => `<span class="w${i === ai ? ' on' : i < ai ? ' past' : ''}${i === em ? ' em' : ''}${st[i] ? ' kw-' + st[i] : ''}">${esc(w)}${p === 'dot' && i === ws.length - 1 ? '<span class="dot">.</span>' : ''}</span>`;
  if (p === 'edit' && ws.length > 1) {
    const k = Math.max(1, Math.floor(ws.length / 2));
    return `<span class="cap p-edit"><span class="l1">${ws.slice(0, k).map(sp).join(' ')}</span><span class="l2">${ws.slice(k).map((w, j) => sp(w, j + k)).join(' ')}</span></span>`;
  }
  return `<span class="cap p-${p}">${ws.map(sp).join(' ')}</span>`;
}
// per-frame motion for presets that animate inside a word (sweep / pop / blur-rise)
function animate(c, t, fs, p) {
  box.querySelectorAll('.w').forEach((el, i) => {
    const w0 = c.w[i] ? c.w[i][0] : c.s, w1 = c.w[i + 1] ? c.w[i + 1][0] : c.e, d = t - w0;
    if (p === 'karaoke') el.style.setProperty('--k', (cl(d / Math.max(0.12, w1 - w0)) * 100).toFixed(1) + '%');
    else if (p === 'pop') el.style.transform = d >= 0 && t < w1 ? `scale(${(1.1 + 0.14 * Math.sin(cl(d / 0.26) * Math.PI)).toFixed(3)})` : '';
    else if (p === 'blur') {
      const q = cl(d / 0.4), e = 1 - Math.pow(1 - q, 3);
      el.style.opacity = e.toFixed(3); el.style.filter = e < 0.999 ? `blur(${((1 - e) * fs * 0.16).toFixed(1)}px)` : '';
      el.style.transform = e < 0.999 ? `translateY(${((1 - e) * 0.38).toFixed(3)}em)` : '';
    }
  });
}

// ---- overlay ----
let last = '', curW = -1, curG = null, curQ = null, drag = null;
function loop() {
  requestAnimationFrame(loop);
  const t = v.currentTime;
  let wi = -1; for (const x of WORDS) { if (x.t <= t) wi = x.i; else break; }
  if (wi !== curW) { curW = wi; $('sWords').querySelectorAll('.chip').forEach((r) => r.classList.toggle('cur', +r.dataset.i === wi)); }
  const g = groupAtT(t); if (g !== curG) { curG = g; groupState(); }
  let q = drag ? drag.q : null;
  if (!q && !window.__EDS_NOSUBS) for (const x of cues()) { if (x.s > t) break; if (t < x.e) q = x; } // a variant can switch subtitles off
  curQ = q;
  const L = lookOf(ovOf(q)), fs = stage.clientWidth * 0.072 * L.size;
  let ai = -1; if (q) q.w.forEach((w, i) => { if (t >= w[0]) ai = i; });
  const key = q ? `${q.s}|${ai}|${fs.toFixed(1)}|${JSON.stringify(L)}|${q.w.map((w) => w[1] + wcfg(w[2]).style).join(' ')}` : '-';
  box.style.left = L.x * 100 + '%'; box.style.top = L.y * 100 + '%';
  if (key !== last) {
    last = key; box.style.display = q ? 'block' : 'none'; box.style.fontSize = fs + 'px';
    if (q) { colorVars(box, L.colors); box.innerHTML = capHTML(L.preset, q.w.map((w) => w[1]), ai, q.w.map((w) => wcfg(w[2]).style)); }
    box.classList.toggle('own', !!ovOf(q));
  }
  if (q) animate(q, t, fs, L.preset);
}

// ---- position: drag the caption on the stage, X/Y sliders ----
// target: a caption that already sits on its own (word override with x/y), or the selected word when "apply to all" is off,
// otherwise the global position
function posObj(q, create) {
  const o = ovOf(q);
  if (o && (o.x != null || o.y != null)) return o;
  if (!applyAll() && (!q || q.w.some((w) => w[2] === selW))) return tgt(create);
  return SUB;
}
function setPos(x, y, obj) {
  obj = obj || posObj(curQ, true);
  const L = lookOf(obj === SUB ? null : obj);
  if (obj !== SUB) { if (obj.x == null) obj.x = L.x; if (obj.y == null) obj.y = L.y; }
  if (x != null) obj.x = f3(Math.abs(x - 0.5) < 0.012 ? 0.5 : cl(x, 0.06, 0.94));
  if (y != null) obj.y = f3(cl(y, 0.03, 0.97));
  const T = tgtLook(); $('sX').value = T.x; $('sY').value = T.y; changed();
}
box.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !curQ) return;
  e.preventDefault(); e.stopPropagation();
  // dragging on the stage always moves just this caption (its own override on its first word);
  // Ctrl+drag moves every caption (global position)
  let obj = SUB;
  if (!e.ctrlKey) { obj = ovOf(curQ); if (!obj) { const k = curQ.w[0][2], o = SUB.words[k] || (SUB.words[k] = {}); obj = o.ov || (o.ov = {}); } }
  const R = stage.getBoundingClientRect(), L = lookOf(obj === SUB ? null : obj);
  drag = { q: curQ, obj, dx: e.clientX - (R.left + L.x * R.width), dy: e.clientY - (R.top + L.y * R.height), x0: L.x };
  box.classList.add('drag'); box.setPointerCapture(e.pointerId);
});
box.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const R = stage.getBoundingClientRect();
  const [sx, sy] = EDS_snap(e.clientX - drag.dx - R.left, e.clientY - drag.dy - R.top, e.altKey); // magnet to the centre axes
  setPos(e.shiftKey ? drag.x0 : sx / R.width, sy / R.height, drag.obj);
});
const end = () => { EDS_snap.hide(); if (drag) { drag = null; box.classList.remove('drag'); chipRows(); } };
box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
$('sX').oninput = (e) => setPos(+e.target.value, null, tgt(true));
$('sY').oninput = (e) => setPos(null, +e.target.value, tgt(true));
$('sCenter').onclick = () => setPos(0.5, null, tgt(true));

// ---- "Altyazıyı düzenle": the selected word ----
function editUI() {
  const has = selW != null && WORDS[selW], o = has ? wcfg(selW) : {};
  $('sEdit').hidden = !has;
  if (has) {
    $('sEdName').textContent = `“${wtxt(selW, WORDS[selW].w)}” · ${f2(WORDS[selW].t)} sn${wordOn(WORDS[selW]) ? '' : ' · kapalı (altyazıda görünmüyor)'}`;
    if (document.activeElement !== $('sEdText')) $('sEdText').value = wtxt(selW, WORDS[selW].w);
    $('sEdReset').hidden = !o.ov; $('sEdHint').textContent = o.ov ? 'Bu kelimenin kendi ayarları var.' : applyAll() ? 'Değişiklikler tüm altyazılara gider.' : 'Değişiklikler sadece bu kelimeye (ve onunla birleşen parçaya) gider.';
  }
  $('sTgtName').textContent = applyAll() ? 'Genel ayarlar · tüm altyazılar' : `Özel ayarlar · “${wtxt(selW, WORDS[selW].w)}”`;
  const T = tgtLook(); $('sSize').value = T.size; $('sX').value = T.x; $('sY').value = T.y;
  $('sPresets').querySelectorAll('.pcard').forEach((b) => b.classList.toggle('on', b.dataset.p === T.preset));
}
function selectWord(k) {
  selW = k; v.pause(); v.currentTime = WORDS[k].t + 0.02;
  chipRows(); colorUI(); editUI(); $('sEdit').scrollIntoView({ block: 'nearest' });
}
$('sEdX').onclick = () => { selW = null; chipRows(); colorUI(); editUI(); };
$('sEdGo').onclick = () => { if (selW != null) { v.pause(); v.currentTime = WORDS[selW].t + 0.02; } };
$('sAll').onchange = () => { colorUI(); editUI(); };
$('sEdText').oninput = (e) => { if (selW == null) return; const o = SUB.words[selW] || (SUB.words[selW] = {}), val = e.target.value.trim(); if (!val || val === WORDS[selW].w) delete o.text; else o.text = val; tidyW(selW); last = ''; save(); clearTimeout(editUI.t); editUI.t = setTimeout(chipRows, 400); };
$('sEdReset').onclick = () => { if (selW == null) return; const o = SUB.words[selW]; if (o) { delete o.ov; tidyW(selW); } chipRows(); colorUI(); changed(); };
// ---- word groups: one accordion per segment ----
const segList = () => (typeof SEGS !== 'undefined' ? SEGS : []);
function groupAtT(t) { // the segment a moment belongs to (gaps between segments go to the previous one)
  const L = segList(); if (!L.length) return null;
  let g = L.find((s) => t >= s.start && t < s.end); if (g) return g.id;
  for (const s of L) if (s.start <= t) g = s; return (g || L[0]).id;
}
const userOpen = new Set(), userClosed = new Set();
const isOpen = (id) => userOpen.has(id) || (id === curG && !userClosed.has(id));
function sentenceGroups() { // no segments (e.g. a finished video as the base): one accordion per sentence
  const G = []; let g = null;
  for (const x of WORDS) {
    if (!g) { g = { id: String(G.length + 1), color: GROUP_COLORS[G.length % GROUP_COLORS.length], words: [] }; G.push(g); }
    g.words.push(x);
    const n = WORDS[x.i + 1];
    if (/[.!?…]$/.test(x.w) || (n && n.t - x.t > 0.9) || g.words.length >= 14) g = null;
  }
  for (const q of G) q.name = `${f2(q.words[0].t)} sn · ${q.words.slice(0, 4).map((x) => x.w).join(' ')}…`;
  return G;
}
function groups() { // [{ id, name, color, words: [...] }]
  const L = segList(); if (!L.length) return sentenceGroups();
  const G = L.map((s, i) => ({ id: s.id, name: s.name, color: GROUP_COLORS[i % GROUP_COLORS.length], words: [] }));
  const by = Object.fromEntries(G.map((g) => [g.id, g]));
  for (const x of WORDS) { const id = groupAtT(x.t); (by[id] || G[0] || { words: [] }).words.push(x); }
  return G.filter((g) => g.words.length);
}
function chipHTML(x) {
  const o = wcfg(x.i);
  const isEnd = SUB.merge && grpEnd.has(x.i), mark = o.br === 'join' ? '<b class="brk join" title="elle birleştirildi">+</b>' : isEnd ? `<b class="brk${o.br === 'cut' ? ' cut' : ''}" title="${o.br === 'cut' ? 'elle bölündü' : 'altyazı burada biter'}">|</b>` : '';
  return `<span class="chip${wordOn(x) ? ' on' : ''}${o.style ? ' kw-' + o.style : ''}${x.i === curW ? ' cur' : ''}${x.i === selW ? ' sel' : ''}${o.ov ? ' ovr' : ''}" data-i="${x.i}" title="${f2(x.t)} sn${o.text != null ? ' · orijinal: ' + esc(x.w) : ''}${o.ov ? ' · kendi ayarları var' : ''} · tık: bu saniyeye git · Ctrl+tık: aç / kapat · Alt+tık / ✎: düzenle · Shift+tık: buradan böl / birleştir">${esc(wtxt(x.i, x.w))}<small>${f2(x.t)}</small><i class="ed" title="Bu kelimeyi düzenle">✎</i></span>${mark}`;
}
let grpEnd = new Set(); // word indices that end a caption (for the | markers)
function chipRows() {
  grpEnd = new Set(cues().map((c) => c.w[c.w.length - 1][2]));
  const G = groups();
  $('sWords').innerHTML = G.map((g) => {
    const n = g.words.filter(wordOn).length;
    return `<div class="wg${isOpen(g.id) ? ' open' : ''}${g.id === curG ? ' cur' : ''}" data-g="${g.id}" style="--gc:${g.color}">
      <div class="wgh"><span class="chev">▸</span><b>${g.id}</b><span class="nm">${esc(g.name)}</span><span class="cnt${n ? ' any' : ''}">${n}/${g.words.length} açık</span>
        <button data-act="on" title="Bu gruptaki bütün kelimeleri aç">aç</button><button data-act="off" title="Bu gruptaki bütün kelimeleri kapat">kapat</button></div>
      <div class="wgb">${g.words.map(chipHTML).join('')}</div></div>`;
  }).join('') || '<span class="hint">Kelime yok.</span>';
  const tot = WORDS.filter(wordOn).length; $('sCount').textContent = `${tot}/${WORDS.length} kelime açık`;
  $('sHold').value = SUB.hold || 1.5; $('sHoldV').textContent = (+SUB.hold || 1.5).toFixed(1) + ' sn'; $('sScene').checked = SUB.sceneCut !== false;
  $('sMerge').checked = !!SUB.merge; $('sGroup').value = String(SUB.group || 3); $('sGroup').disabled = !SUB.merge;
}
function groupState() { // follow the playhead without re-rendering the chips
  $('sWords').querySelectorAll('.wg').forEach((el) => { el.classList.toggle('cur', el.dataset.g === curG); el.classList.toggle('open', isOpen(el.dataset.g)); });
}
const tidyW = (k) => { const o = SUB.words[k]; if (o && !Object.keys(o).some((q) => o[q] != null && o[q] !== false)) delete SUB.words[k]; };
function setWord(k, on) {
  const o = SUB.words[k] || (SUB.words[k] = {});
  if (picked()) { if (on) o.on = true; else delete o.on; } else { if (on) delete o.off; else o.off = true; }
  tidyW(k);
}
let clickT = 0;
$('sWords').addEventListener('click', (e) => {
  const act = e.target.closest('button[data-act]'), wg = e.target.closest('.wg');
  if (act && wg) { const g = groups().find((q) => q.id === wg.dataset.g); g.words.forEach((x) => setWord(x.i, act.dataset.act === 'on')); chipRows(); last = ''; save(); return; }
  if (e.target.closest('.wgh') && wg) { // accordion toggle; remember the user's choice
    const id = wg.dataset.g;
    if (isOpen(id)) { userOpen.delete(id); userClosed.add(id); } else { userClosed.delete(id); userOpen.add(id); }
    const g = groups().find((q) => q.id === id); if (g && isOpen(id)) { v.pause(); v.currentTime = g.words[0].t + 0.02; } // opening a group jumps to its first word
    groupState(); return;
  }
  const ch = e.target.closest('.chip'); if (!ch || ch.querySelector('input')) return;
  if (e.altKey || e.target.closest('.ed')) { clearTimeout(clickT); selectWord(+ch.dataset.i); return; } // select for editing, no toggle
  if (e.shiftKey) { // manual grouping after this word: auto -> break here -> join with next -> auto
    clearTimeout(clickT); const k = +ch.dataset.i, o = SUB.words[k] || (SUB.words[k] = {});
    o.br = grpEnd.has(k) ? (o.br === 'cut' ? 'join' : o.br ? undefined : 'join') : (o.br === 'join' ? undefined : 'cut');
    if (!o.br) delete o.br; tidyW(k); dirty = true; last = ''; save(); chipRows(); return;
  }
  clearTimeout(clickT); const k = +ch.dataset.i;
  if (e.ctrlKey || e.metaKey) { // Ctrl+click: switch the word on / off (wait a moment so a double click does not also toggle)
    clickT = setTimeout(() => { setWord(k, !wordOn(WORDS[k])); chipRows(); last = ''; save(); }, 230); return;
  }
  v.pause(); v.currentTime = WORDS[k].t + 0.02; // plain click: jump to that word
});
$('sWords').addEventListener('dblclick', (e) => {
  const ch = e.target.closest('.chip'); if (!ch) return; clearTimeout(clickT);
  const k = +ch.dataset.i, x = WORDS[k];
  ch.innerHTML = `<input type="text" value="${esc(wtxt(k, x.w))}" spellcheck="false">`;
  const inp = ch.querySelector('input'); inp.focus(); inp.select();
  const done = (ok) => {
    if (inp.done) return; inp.done = true;
    if (ok) { const o = SUB.words[k] || (SUB.words[k] = {}), val = inp.value.trim(); if (!val || val === x.w) delete o.text; else o.text = val; tidyW(k); last = ''; save(); }
    chipRows();
  };
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); });
  inp.addEventListener('blur', () => done(true));
});
$('sWords').addEventListener('contextmenu', (e) => { // emphasis: none -> accent colour -> Oswald -> none
  const ch = e.target.closest('.chip'); if (!ch) return; e.preventDefault();
  const k = +ch.dataset.i, o = SUB.words[k] || (SUB.words[k] = {});
  o.style = { undefined: 'red', red: 'osw', osw: undefined }[o.style];
  if (!o.style) delete o.style; tidyW(k); chipRows(); last = ''; save();
});
$('sAllOn').onclick = () => { WORDS.forEach((x) => setWord(x.i, true)); chipRows(); last = ''; save(); };
$('sAllOff').onclick = () => { WORDS.forEach((x) => setWord(x.i, false)); chipRows(); last = ''; save(); };
$('sMerge').onchange = (e) => { SUB.merge = e.target.checked; dirty = true; last = ''; save(); chipRows(); };
$('sHold').oninput = (e) => { SUB.hold = +e.target.value; $('sHoldV').textContent = SUB.hold.toFixed(1) + ' sn'; dirty = true; last = ''; save(); };
$('sScene').onchange = (e) => { SUB.sceneCut = e.target.checked; dirty = true; last = ''; save(); };
$('sGroup').onchange = (e) => { SUB.group = +e.target.value; dirty = true; last = ''; save(); chipRows(); };

// ---- style picker: small cards, each name written in its own style (with the chosen colours) ----
function cards() {
  $('sPresets').innerHTML = PRESETS.map(([id, name]) => { const ws = name.split(' '); return `<button class="pcard${SUB.preset === id ? ' on' : ''}" data-p="${id}" title="${esc(name)}">${capHTML(id, ws, Math.min(1, ws.length - 1))}</button>`; }).join('');
}
$('sPresets').addEventListener('click', (e) => { const b = e.target.closest('.pcard'); if (!b) return; tgt(true).preset = b.dataset.p;
  // koyu şeffaf kutu tek kelimeyle boş kalır: seçilince öbekleme açılır (en fazla 3 kelime, noktalama/duraklamada bölünür)
  if (b.dataset.p === 'dpill' && applyAll() && !SUB.merge) { SUB.merge = true; SUB.group = SUB.group || 3; dirty = true; chipRows(); }
  changed(); });
$('sSize').oninput = (e) => { tgt(true).size = +e.target.value; changed(); };

const ts = (x) => { const ms = Math.round(x * 1000), p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
$('sSrt').onclick = () => {
  const out = cues(); // exactly what plays
  const srt = out.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(c.e)}\n${c.w.map((w) => w[1]).join(' ').trim()}\n`).join('\n');
  EDS_saveAs({ content: srt, name: EDS_fileName(`altyazi_${EDS_stamp()}.srt`), title: `SRT kaydet (${out.length} altyazı)` }).then((p) => p && msg('Kaydedildi ✓ ' + p));
};

// v1 -> v2: always on, word-picking mode, every word off; keep word text edits / emphasis; segment/sentence switches dropped
function migrate() {
  if (SUB.v === 2) return false;
  for (const k of Object.keys(SUB.words || {})) { const o = SUB.words[k]; delete o.on; delete o.off; tidyW(k); }
  Object.assign(SUB, { v: 2, enabled: true, mode: 'picked', segs: {}, sents: {} });
  return true;
}
(async () => {
  let s = null; try { s = await (await fetch('/api/subtitles', { cache: 'no-store' })).json(); } catch {}
  const fresh = !s || typeof s !== 'object' || !s.v; // no saved subtitles yet: start with every word on, grouped, dark box
  if (!fresh) Object.assign(SUB, s);
  for (const k of ['words', 'colors']) if (!SUB[k] || typeof SUB[k] !== 'object') SUB[k] = {};
  if (!Array.isArray(SUB.chunks)) SUB.chunks = [];
  if (!PRESETS.some((p) => p[0] === SUB.preset)) SUB.preset = 'bold';
  const changed = migrate(); SUB.enabled = true;
  try { await loadWords(); } catch { msg('words.txt okunamadı'); }
  if (fresh) { Object.assign(SUB, { merge: true, group: 3, preset: 'dpill', y: 0.78 }); WORDS.forEach((x) => setWord(x.i, true)); dirty = true; save(); }
  $('sSize').value = SUB.size; $('sX').value = SUB.x ?? 0.5; $('sY').value = SUB.y;
  cards(); colorUI(); chipRows(); editUI();
  let tries = 0; const wait = () => (segList().length || ++tries > 25 ? (curG = groupAtT(v.currentTime), chipRows()) : setTimeout(wait, 200)); wait(); // SEGS arrive async (or never: sentence groups)
  if (changed) save();
  requestAnimationFrame(loop);
})();
window.SUBS = SUB;
// timeline.js draws the caption lane from this: list() = what plays; setEdges / reset write words[first].s0 / words[last].e0
window.SUBCUES = {
  list: () => cues(),
  get sceneCuts() { return SCENE_CUTS; },
  setEdges(c, s, e) {
    const a = SUB.words[c.k0] || (SUB.words[c.k0] = {}), b = SUB.words[c.k1] || (SUB.words[c.k1] = {});
    if (s != null) a.s0 = f3(s); if (e != null) b.e0 = f3(e);
    dirty = true; last = ''; save();
  },
  reset(c) { for (const [k, f] of [[c.k0, 's0'], [c.k1, 'e0']]) { const o = SUB.words[k]; if (o) { delete o[f]; tidyW(k); } } dirty = true; last = ''; save(); },
};
})();
