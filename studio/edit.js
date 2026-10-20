// EditSync Stüdyo — Düzenleme modu: pick a text / image inside a clip iframe, retype, recolour, change font,
// move (drag), scale (wheel / handle), swap images. Edits live in work/overrides.json, never in the clip files;
// applyOverrides() (apply-overrides.js) re-applies them after every __bm.seek. Uses index.html globals (v, stage, SEGS, frames…).
(function () {
'use strict';
const OV = {}; // { "<dist file>": { "<selector>": {...} } }
let on = false, sel = null, drag = null, dyn = false; // sel = {s, f, el, path, file}
const layer = $('edLayer'), box = $('edBox'), hov = $('edHover');
const fileOf = (s) => s.file.split('/').pop();
// stage px per clip px — each iframe has its own canvas width (1440, or s.size e.g. 1080 for the simple style)
const K = (el) => { const fe = el && el.ownerDocument && el.ownerDocument.defaultView.frameElement; return stage.clientWidth / ((fe && parseFloat(fe.style.width)) || 1440); };
const cur = () => (sel && OV[sel.file] && OV[sel.file][sel.path]) || {};
const r2 = (x) => Math.round(x * 100) / 100;

// wrap the clip's seek once per page load: original paint, then our overrides
function hook(win, s) {
  const b = win && win.__bm; if (!b || b.__ed) return;
  const seek0 = b.seek, file = fileOf(s);
  b.seek = function () {
    const r = seek0.apply(this, arguments), go = () => {
      try { applyOverrides(win, OV[file]); } catch (e) { console.warn('override', e); }
      try { if (window.applyLook) applyLook(win, window.__EDS_LOOK); } catch (e) { console.warn('look', e); } // variant theme / UI / type
    };
    if (r && typeof r.then === 'function') return r.then((x) => (go(), x));
    go(); return r;
  };
  b.__ed = 1;
}
function reapply() { for (const s of SEGS) { const f = frames[s.id]; try { f && f.contentWindow.__bm && applyOverrides(f.contentWindow, OV[fileOf(s)]); } catch {} } }

// ---- persistence (debounced) ----
let saveT = 0;
function save() {
  clearTimeout(saveT); msg('kaydediliyor…');
  saveT = setTimeout(async () => {
    try { const r = await (await fetch('/api/overrides', { method: 'POST', body: JSON.stringify(OV) })).json(); msg(r.ok ? 'Kaydedildi ✓' : 'Hata: ' + r.error); }
    catch (e) { msg('Kaydedilemedi: ' + e.message); }
    count();
  }, 350);
}
function msg(m) { $('edMsg').textContent = m; }
function count() {
  const n = Object.values(OV).reduce((a, o) => a + Object.keys(o).length, 0), s = active && OV[fileOf(active)];
  $('edCount').textContent = n ? `Toplam ${n} düzenleme${s ? ` · bu segmentte ${Object.keys(s).length}` : ''} (work/overrides.json)` : '';
}
function set(patch) {
  if (!sel) return;
  const F = OV[sel.file] || (OV[sel.file] = {}), o = Object.assign({}, F[sel.path], patch);
  for (const k in o) if (o[k] == null || o[k] === '') delete o[k];
  if (o.scale != null && Math.abs(o.scale - 1) < 0.005) delete o.scale;
  if (o.translate && !o.translate[0] && !o.translate[1]) delete o.translate;
  if (Object.keys(o).length) F[sel.path] = o; else delete F[sel.path];
  if (!Object.keys(F).length) delete OV[sel.file];
  try { applyOverrides(sel.f.contentWindow, OV[sel.file]); } catch {}
  save(); fill();
}

// ---- picking ----
function visible(el, w) {
  let o = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = w.getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return false; o *= +cs.opacity; }
  return o > 0.04;
}
const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const pickable = (el, w) => (el.tagName === 'IMG' || ownText(el)) && visible(el, w);
function pick(cx, cy) {
  const R = stage.getBoundingClientRect();
  const vis = SEGS.filter((s) => frames[s.id] && frames[s.id].style.visibility === 'visible').sort((a, b) => frames[b.id].style.zIndex - frames[a.id].style.zIndex);
  for (const s of vis) {
    const f = frames[s.id]; let d, w; try { d = f.contentDocument; w = f.contentWindow; } catch { continue; }
    const k = stage.clientWidth / (parseFloat(f.style.width) || 1440), x = (cx - R.left) / k, y = (cy - R.top) / k;
    if (!d || y > parseFloat(f.style.height)) continue;
    let el = d.elementsFromPoint(x, y).find((e) => pickable(e, w));
    if (!el) { // pointer-events:none parts are skipped by elementsFromPoint -> geometric fallback, smallest box wins
      let best = 0;
      for (const e of d.body.querySelectorAll('*')) {
        if (!(e.tagName === 'IMG' || ownText(e))) continue;
        const r = e.getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom || !visible(e, w)) continue;
        const a = r.width * r.height; if (!best || a < best) { best = a; el = e; }
      }
    }
    // alt yazı / etiket kelimeleri her satırda yeniden üretilir: tek kelime yerine bütün kutuyu seç (sürükleyince hepsi taşınır)
    const grp = el && el.closest('#cap, .sm-cap, #label, .sm-label');
    if (grp) el = grp;
    if (el) return { s, f, el };
  }
  return null;
}
function pathOf(el) {
  const w = el.ownerDocument.defaultView, esc = (x) => '#' + w.CSS.escape(x);
  if (el.id) return esc(el.id);
  const parts = []; let n = el;
  while (n && !n.id && n.parentElement && n !== n.ownerDocument.body) { parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...n.parentElement.children].indexOf(n) + 1})`); n = n.parentElement; }
  return (n && n.id ? esc(n.id) : 'body') + '>' + parts.join('>');
}
const localT = (s) => Math.max(0, Math.min(s.end - s.start, v.currentTime - s.start));
// text that the clip rewrites over time (timecodes, typewriters) is not editable
async function isDynamic(h) {
  const b = h.f.contentWindow.__bm, t = localT(h.s), t0 = h.el.textContent; let d = false;
  try {
    for (const dt of [0.4, -0.4, 1.2]) { await b.seek(Math.max(0, t + dt)); if (h.el.textContent !== t0) { d = true; break; } }
    await b.seek(t);
  } catch {}
  return d;
}
async function select(h) {
  sel = h ? { ...h, path: pathOf(h.el), file: fileOf(h.s) } : null; dyn = false;
  if (sel && sel.el.tagName !== 'IMG' && !sel.el.children.length && cur().text == null) dyn = await isDynamic(sel);
  fill();
}

// ---- inspector ----
function fill() {
  $('insp').hidden = !sel; $('edNone').hidden = !!sel; count();
  if (!sel) { box.style.display = 'none'; return; }
  const o = cur(), el = sel.el, img = el.tagName === 'IMG', leaf = !img && !el.children.length;
  $('edSel').textContent = `${sel.s.id} · ${sel.file} · ${sel.path}`;
  const t = $('edText');
  t.disabled = img || !leaf || dyn;
  if (document.activeElement !== t) t.value = img ? '(görsel)' : o.text ?? (leaf ? el.textContent : el.textContent.trim());
  t.title = dyn ? 'Bu yazı animasyonla değişiyor, düzenlenemez' : !leaf && !img ? 'Kelimelere bölünmüş — tek kelimeye tıkla' : '';
  document.querySelectorAll('#edColors .sw').forEach((b) => b.classList.toggle('on', !!o.color && b.dataset.c.toLowerCase() === o.color.toLowerCase()));
  if (o.color) $('edColor').value = o.color;
  document.querySelectorAll('#edFonts button').forEach((b) => b.classList.toggle('on', (o.font || '') === b.dataset.f));
  const sc = o.scale ?? 1; $('edScale').value = sc; $('edScaleV').textContent = sc.toFixed(2);
  const tr = o.translate || [0, 0]; $('edPos').textContent = `x ${Math.round(tr[0])} · y ${Math.round(tr[1])} px`;
  $('edDrop').hidden = !img; $('edRowText').hidden = $('edRowColor').hidden = $('edRowFont').hidden = img;
}
$('edText').oninput = (e) => set({ text: e.target.value === '' ? null : e.target.value });
document.querySelectorAll('#edColors .sw').forEach((b) => (b.onclick = () => set({ color: b.dataset.c })));
$('edColor').oninput = (e) => set({ color: e.target.value.toUpperCase() });
$('edColorX').onclick = () => set({ color: null });
document.querySelectorAll('#edFonts button').forEach((b) => (b.onclick = () => set({ font: b.dataset.f || null })));
$('edScale').oninput = (e) => set({ scale: r2(+e.target.value) });
$('edPosX').onclick = () => set({ translate: null });
$('edReset').onclick = () => { if (!sel) return; delete (OV[sel.file] || {})[sel.path]; if (OV[sel.file] && !Object.keys(OV[sel.file]).length) delete OV[sel.file]; reapply(); save(); dyn = false; fill(); };

// image swap: drop on the inspector (or on the stage while an <img> is selected) / file picker
async function upload(file) {
  if (!sel || sel.el.tagName !== 'IMG' || !file || !/^image\//.test(file.type)) return msg('Önce bir görsel seç, sonra resim dosyası bırak');
  msg('Yükleniyor…');
  try {
    const j = await (await fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })).json();
    if (!j.ok) throw new Error(j.error);
    set({ src: j.url }); msg('Görsel değişti ✓');
  } catch (e) { msg('Yükleme hatası: ' + e.message); }
}
const dz = $('edDrop');
dz.onclick = () => $('edFile').click();
$('edFile').onchange = (e) => upload(e.target.files[0]);
for (const z of [dz, layer]) {
  z.addEventListener('dragover', (e) => { if (sel && sel.el.tagName === 'IMG') { e.preventDefault(); dz.classList.add('over'); } });
  z.addEventListener('dragleave', () => dz.classList.remove('over'));
  z.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); upload(e.dataTransfer.files[0]); });
}

// ---- stage interaction ----
function toggle(x) {
  on = x ?? !on; $('edOn').checked = on; layer.classList.toggle('on', on);
  if (on) { v.pause(); showTab('edit'); } else { hov.style.display = 'none'; }
  fill();
}
$('edOn').onchange = (e) => toggle(e.target.checked);
const inBox = (cx, cy) => { if (!sel || box.style.display === 'none') return false; const r = box.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; };
// how many clip px one px of `translate` moves on screen (ancestors may be scaled by the clip)
function factor(el, t0) {
  const w = el.ownerDocument.defaultView, st = el.style, prev = st.translate;
  if (w.getComputedStyle(el).display === 'inline') st.display = 'inline-block';
  st.translate = `${t0[0]}px ${t0[1]}px`; const a = el.getBoundingClientRect().left;
  st.translate = `${t0[0] + 100}px ${t0[1]}px`; const b = el.getBoundingClientRect().left;
  st.translate = prev; return Math.abs(b - a) / 100 || 1;
}
layer.addEventListener('pointerdown', async (e) => {
  if (!on || e.button !== 0) return;
  e.preventDefault(); v.pause();
  if (e.target === $('edHandle') && sel) { // scale around the box centre
    const r = box.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    drag = { mode: 'scale', cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, s0: cur().scale ?? 1 };
  } else {
    if (!inBox(e.clientX, e.clientY)) { const h = pick(e.clientX, e.clientY); await select(h); if (!h) return; }
    const t0 = cur().translate || [0, 0];
    const r = sel.el.getBoundingClientRect(), k = K(sel.el);
    drag = { mode: 'move', x0: e.clientX, y0: e.clientY, t0, fac: factor(sel.el, t0), moved: false, cx: (r.left + r.width / 2) * k, cy: (r.top + r.height / 2) * k };
  }
  layer.setPointerCapture(e.pointerId);
});
layer.addEventListener('pointermove', (e) => {
  if (!on) return;
  if (!drag) { // hover hint
    const h = !inBox(e.clientX, e.clientY) && pick(e.clientX, e.clientY);
    if (h) place(hov, h.el); else hov.style.display = 'none';
    return;
  }
  hov.style.display = 'none';
  if (drag.mode === 'scale') return set({ scale: r2(Math.max(0.1, Math.min(6, drag.s0 * Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) / drag.d0))) });
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 3) return; // plain click = select only
  drag.moved = true;
  // magnet: the element's centre snaps onto the stage's X / Y centre lines
  const [mx, my] = EDS_snap(drag.cx + e.clientX - drag.x0, drag.cy + e.clientY - drag.y0, e.altKey);
  const k = K(sel.el), dx = (mx - drag.cx) / k / drag.fac, dy = (my - drag.cy) / k / drag.fac;
  set({ translate: [Math.round(drag.t0[0] + (e.shiftKey && Math.abs(dy) > Math.abs(dx) ? 0 : dx)), Math.round(drag.t0[1] + (e.shiftKey && Math.abs(dx) >= Math.abs(dy) ? 0 : dy))] });
});
const end = () => { drag = null; EDS_snap.hide(); };
layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
layer.addEventListener('pointerleave', () => { if (!drag) hov.style.display = 'none'; });
layer.addEventListener('wheel', (e) => {
  if (!on || !sel) return;
  e.preventDefault();
  set({ scale: r2(Math.max(0.1, Math.min(6, (cur().scale ?? 1) * Math.exp(-e.deltaY * 0.0015)))) });
}, { passive: false });

// selection outline follows the element every frame (clip animation, hot reload)
function place(d, el) {
  const r = el.getBoundingClientRect(), k = K(el);
  Object.assign(d.style, { display: 'block', left: r.left * k + 'px', top: r.top * k + 'px', width: Math.max(4, r.width * k) + 'px', height: Math.max(4, r.height * k) + 'px' });
}
function loop() {
  requestAnimationFrame(loop);
  if (!sel || !on) { box.style.display = 'none'; return; }
  let d = null; try { d = sel.f.contentDocument; } catch {}
  if (!d) return (box.style.display = 'none');
  if (!sel.el.isConnected || sel.el.ownerDocument !== d) { const el = d.querySelector(sel.path); if (!el) return (box.style.display = 'none'); sel.el = el; }
  if (sel.f.style.visibility !== 'visible') return (box.style.display = 'none');
  place(box, sel.el);
}

window.ED = { hook, toggle: () => toggle(), select: (h) => { if (!drag) select(h); }, get overrides() { return OV; } };
fetch('/api/overrides', { cache: 'no-store' }).then((r) => r.json()).then((o) => { Object.assign(OV, o || {}); reapply(); count(); }).catch(() => {});
requestAnimationFrame(loop);
fill();
})();
