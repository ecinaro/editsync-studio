// EditSync Stüdyo — SFX havuzu. Library = sfx/library/index.json (name, file, duration_s, category, description, use_for).
// Placed sounds live in work/sfx.json { master: dB, items: [{ id, name, file, t, gain: dB, mute? }] } and play with the
// video through WebAudio (scheduled on play / seek). "SFX stem indir" asks the server to mix them with ffmpeg into one WAV
// that starts at 0:00 and lasts the whole video, so it drops straight into the user's own mix.
// Uses index.html globals (v, $) and timeline.js (TL).
(function () {
'use strict';
const LIB_BASE = '/sfx/library/';
const CAT = { ui: 'Arayüz', transition: 'Geçiş', morph: 'Morph', accent: 'Vurgu', data: 'Veri', device: 'Cihaz', object: 'Nesne' };
let LIB = [], S = { master: 0, items: [] }, sel = null, ctx = null, master = null, playing = [];
const buf = new Map();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const msg = (m) => { $('xMsg').textContent = m; clearTimeout(msg.t); msg.t = setTimeout(() => ($('xMsg').textContent = ''), 3000); };
const db = (g) => Math.pow(10, (g || 0) / 20);
const durOf = (it) => (buf.get(it.file) && buf.get(it.file).duration) || (LIB.find((l) => l.path === it.file) || {}).duration_s || 1;

// ---- audio ----
function ac() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); }
  master.gain.value = $('xMute').checked ? 0 : db(S.master);
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
async function load(file) {
  if (buf.has(file)) return buf.get(file);
  const data = await (await fetch('/' + file)).arrayBuffer(), b = await ac().decodeAudioData(data);
  buf.set(file, b); return b;
}
function stopAll() { playing.forEach((s) => { try { s.stop(); } catch {} }); playing = []; }
async function schedule() { // (re)start every sound that overlaps "now" or comes later
  stopAll(); if (v.paused || !S.items.length) return;
  // sounds keep their natural speed in the OUTPUT: with a video speed s they start at t/s and play at rate (preview rate)
  const c = ac(), now = v.currentTime, rate = v.playbackRate || 1, s = window.EDS_speed || 1, base = c.currentTime + 0.03;
  for (const it of S.items) {
    if (it.mute) continue;
    const b = await load(it.file).catch(() => null); if (!b || v.paused) continue;
    const off = (now - it.t) / s; if (off >= b.duration) continue; // seconds into the sound
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = b; src.playbackRate.value = rate / s; g.gain.value = db(it.gain);
    src.connect(g).connect(master);
    const wait = Math.max(0, it.t - now) / rate; src.start(base + wait, Math.max(0, off)); playing.push(src);
  }
}
v.addEventListener('play', schedule); v.addEventListener('seeked', () => { if (!v.paused) schedule(); });
v.addEventListener('pause', stopAll); v.addEventListener('ratechange', () => { if (!v.paused) schedule(); });
async function audition(file) { const b = await load(file), c = ac(), s = c.createBufferSource(); s.buffer = b; s.connect(master); s.start(); }

// ---- persistence ----
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => fetch('/api/store/sfx', { method: 'POST', body: JSON.stringify(S) }).then((r) => r.json()).then((r) => msg(r.ok ? 'Kaydedildi ✓' : r.error)).catch((e) => msg(e.message)), 350); }
function add(file, t) {
  const L = LIB.find((l) => l.path === file) || { name: file.split('/').pop() };
  const it = { id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: L.name, file, t: +Math.max(0, t).toFixed(3), gain: 0 };
  S.items.push(it); sel = it; save(); drawLane(); panel(); load(file).then(drawLane).catch(() => {});
  if (!v.paused) schedule();
}

// ---- panel ----
function libUI() {
  const by = {}; LIB.forEach((l) => (by[l.category] = by[l.category] || []).push(l));
  $('xLib').innerHTML = Object.entries(by).map(([c, ls]) => `<div class="sfxcat">${CAT[c] || c}</div>` + ls.map((l) =>
    `<div class="sfxrow" draggable="true" data-f="${esc(l.path)}" title="${esc(l.description || '')}${l.use_for ? ' — ' + esc(l.use_for) : ''}"><button data-a="play" title="Dinle">▶</button><span>${esc(l.name)}</span><small>${(+l.duration_s || 0).toFixed(1)} sn</small><button data-a="add" title="Oynatma çizgisine ekle">+</button></div>`).join('')).join('');
}
$('xLib').addEventListener('click', (e) => { const r = e.target.closest('.sfxrow'), a = e.target.dataset.a; if (!r || !a) return; if (a === 'play') audition(r.dataset.f); else add(r.dataset.f, v.currentTime); });
$('xLib').addEventListener('dragstart', (e) => { const r = e.target.closest('.sfxrow'); if (r) { e.dataTransfer.setData('text/eds-sfx', r.dataset.f); e.dataTransfer.effectAllowed = 'copy'; } });
function panel() {
  $('xMaster').value = S.master || 0; $('xMasterV').textContent = (S.master > 0 ? '+' : '') + (S.master || 0) + ' dB';
  if (!sel || !S.items.includes(sel)) { sel = null; $('xSel').innerHTML = `<div class="hint">${S.items.length} ses yerleştirildi. Zaman çizelgesinde bir sese tıkla: seviye / sil.</div>`; return; }
  $('xSel').innerHTML = `<div class="row"><b>${esc(sel.name)}</b><span class="hint">${sel.t.toFixed(2)} sn</span><button data-a="go">Git</button><button data-a="nudge" data-d="-0.05">−0.05</button><button data-a="nudge" data-d="0.05">+0.05</button><label><input type="checkbox" data-a="mute" ${sel.mute ? 'checked' : ''}> sessiz</label><button data-a="del" style="margin-left:auto">Sil</button></div>
    <div class="fl">Seviye <div class="row"><input type="range" data-a="gain" min="-30" max="12" step="0.5" value="${sel.gain || 0}"><span class="hint">${(sel.gain > 0 ? '+' : '') + (sel.gain || 0)} dB</span></div></div>`;
}
$('xSel').addEventListener('input', (e) => { if (e.target.dataset.a === 'gain' && sel) { sel.gain = +e.target.value; e.target.nextElementSibling.textContent = (sel.gain > 0 ? '+' : '') + sel.gain + ' dB'; save(); } });
$('xSel').addEventListener('change', (e) => { if (e.target.dataset.a === 'mute' && sel) { sel.mute = e.target.checked || undefined; save(); drawLane(); } });
$('xSel').addEventListener('click', (e) => {
  const a = e.target.dataset.a; if (!sel || !a) return;
  if (a === 'go') { v.pause(); v.currentTime = sel.t; }
  if (a === 'nudge') { sel.t = +Math.max(0, sel.t + +e.target.dataset.d).toFixed(3); save(); drawLane(); panel(); }
  if (a === 'del') { S.items = S.items.filter((x) => x !== sel); sel = null; save(); drawLane(); panel(); }
});
$('xMaster').oninput = (e) => { S.master = +e.target.value; ac(); panel(); save(); };
$('xMute').onchange = () => ac();
$('xExport').onclick = async () => {
  msg('Miksleniyor…');
  try {
    clearTimeout(saveT); await fetch('/api/store/sfx', { method: 'POST', body: JSON.stringify(S) });
    const r = await (await fetch('/api/sfx/export', { method: 'POST' })).json(); if (!r.ok) throw new Error(r.error);
    msg(`${r.items} ses · ${r.duration.toFixed(1)} sn hazır`);
    const saved = await EDS_saveAs({ src: r.url, name: EDS_fileName(`SFX_stem_${EDS_stamp()}.wav`), title: 'SFX stem (WAV) kaydet' });
    if (saved) msg('Kaydedildi ✓ ' + saved);
  } catch (e) { msg('Hata: ' + e.message); }
};

// ---- timeline lane ----
const lane = $('tlSfx');
function drawLane() {
  if (!window.TL || !TL.pps) return;
  lane.innerHTML = '<span class="lab">SFX</span>' + S.items.map((it) => `<div class="sfxb${it === sel ? ' sel' : ''}${it.mute ? ' mute' : ''}" data-id="${it.id}" style="left:${TL.t2x(it.t)}px;width:${Math.max(10, TL.t2x(durOf(it) * (window.EDS_speed || 1)))}px" title="${esc(it.name)} · ${it.t.toFixed(2)} sn · ${(it.gain || 0)} dB">${esc(it.name)}</div>`).join('');
}
lane.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/eds-sfx')) { e.preventDefault(); lane.classList.add('over'); } });
lane.addEventListener('dragleave', () => lane.classList.remove('over'));
lane.addEventListener('drop', (e) => { e.preventDefault(); lane.classList.remove('over'); const f = e.dataTransfer.getData('text/eds-sfx'); if (f) add(f, TL.snap(TL.tAt(e))); });
let drag = null;
lane.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.sfxb'); if (!b || e.button !== 0) return; e.stopPropagation(); e.preventDefault();
  sel = S.items.find((x) => x.id === b.dataset.id); panel(); drawLane(); if (window.showTab) showTab('sfx');
  drag = { it: sel, t0: TL.tAt(e), a: sel.t, moved: false }; lane.setPointerCapture(e.pointerId);
});
lane.addEventListener('pointermove', (e) => {
  if (!drag) return; const d = TL.tAt(e) - drag.t0; if (Math.abs(d * TL.pps) > 2) drag.moved = true; if (!drag.moved) return;
  drag.it.t = +Math.max(0, TL.snap(drag.a + d)).toFixed(3);
  const el = lane.querySelector(`.sfxb[data-id="${drag.it.id}"]`); if (el) el.style.left = TL.t2x(drag.it.t) + 'px';
});
lane.addEventListener('pointerup', () => { if (drag) { if (drag.moved) { save(); panel(); if (!v.paused) schedule(); } else { v.pause(); v.currentTime = drag.it.t; } drag = null; drawLane(); } });
addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && e.target === document.body) { S.items = S.items.filter((x) => x !== sel); sel = null; save(); drawLane(); panel(); } });

(async () => {
  try { LIB = (await (await fetch(LIB_BASE + 'index.json', { cache: 'no-store' })).json()).map((l) => ({ ...l, path: 'sfx/library/' + l.file })); } catch { LIB = []; }
  try { S = await (await fetch('/api/store/sfx', { cache: 'no-store' })).json(); } catch {}
  S.items = S.items || []; S.master = S.master || 0;
  libUI(); panel(); drawLane();
  S.items.forEach((it) => load(it.file).then(drawLane).catch(() => {}));
})();
window.SFX = { drawLane, get state() { return S; }, get scheduled() { return playing.length; }, get audio() { return ctx && ctx.state; } };
})();
