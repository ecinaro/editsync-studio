// EditSync Stüdyo — Varyantlar. One variant = colour theme + UI surface style + typography + motion + talking-head video + subtitles.
// Saved one file per variant in work/variants/<id>.json. The studio applies the active one live:
//   look   -> window.__EDS_LOOK   (look.js, applied after every seek by edit.js' hook)
//   motion -> window.__EDS_MOTION (motion-hook.js, read when a clip page loads -> clip iframes reload on change)
//   head   -> <video> source swap at the same time (or no head: plain colour field), subs -> window.__EDS_NOSUBS
// URL: ?variant=<id> opens a variant without changing the remembered one, &embed=1 = bare stage (used by compare.html).
// Uses index.html globals (v, stage, frames, SEGS, $, showTab).
(function () {
'use strict';
const L = window.EDS_LOOK, Q = new URLSearchParams(location.search);
const DEF = () => ({ id: 'v' + Date.now().toString(36), name: 'Yeni varyant', look: { theme: 'original', ui: { preset: 'original', texture: 'original' }, type: { preset: 'original' } },
  motion: { speed: 1, bounce: 0, enter: 'default' }, head: { src: '/work/head_proxy.mp4', bg: '#0B0B0B' }, subs: true });
let LIST = [], cur = null, heads = [], A = null, B = null, motionKey = '';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function toast(m) { let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:120;background:rgba(13,12,12,.85);color:#f2efec;font:600 13px system-ui;padding:6px 12px;border-radius:99px;pointer-events:none;transition:opacity .3s'; stage.appendChild(t); } t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.opacity = 0), 1400); }
window.toast = toast;
const msg = (m) => { $('vMsg').textContent = m; clearTimeout(msg.t); msg.t = setTimeout(() => ($('vMsg').textContent = ''), 2500); };

// fonts for the typography cards in the studio page itself
(() => { const st = document.createElement('style'); st.textContent = L.FONTS.map((f) => `@font-face{font-family:'${f.fam}';src:url('/studio/fonts/${f.file}') format('truetype');font-style:${f.style};font-weight:100 900}`).join(''); document.head.appendChild(st); })();

function resolveLook(x) {
  const lk = x.look || {}, th = lk.theme === 'custom' ? lk.custom : L.THEMES[lk.theme] || null;
  const ui = lk.ui && (lk.ui.preset !== 'original' || (lk.ui.texture && lk.ui.texture !== 'original')) ? { ...lk.ui } : null;
  const ty = lk.type && (lk.type.preset !== 'original' || lk.type.tracking != null || (lk.type.case && lk.type.case !== 'original') || lk.type.weight) ? { ...lk.type } : null;
  return th || ui || ty ? { theme: th, ui, type: ty } : null;
}
window.EDS_resolveLook = resolveLook;

// ---- apply ----
function apply(x, reloadMotion = true) {
  cur = x;
  window.__EDS_LOOK = resolveLook(x);
  // scheme: simple-style sahnelerin zemin renkleri { red: '#…', paper: '#…' } — kırmızı/kâğıt sahneler bu renklere döner (clip her karede okur)
  window.__EDS_SCHEME = x.scheme || null;
  window.__EDS_NOSUBS = x.subs === false || Q.get('nosubs') === '1'; // ?nosubs=1: MP4 export without subtitles
  // motion lives in the clip's build step -> reload the clip pages when it changes
  const mk = JSON.stringify({ ...DEF().motion, ...(x.motion || {}) });
  window.__EDS_MOTION = x.motion && (x.motion.speed !== 1 || x.motion.bounce || (x.motion.enter && x.motion.enter !== 'default')) ? x.motion : null;
  if (reloadMotion && motionKey && mk !== motionKey) for (const s of SEGS) if (frames[s.id]) frames[s.id].src = s.file + '?render&inject&v=' + Date.now();
  motionKey = mk;
  // talking head
  const src = x.head && x.head.src;
  stage.classList.toggle('nohead', !src);
  $('vwrap').style.background = (x.head && x.head.bg) || '#0B0B0B';
  if (src && !v.src.endsWith(src)) {
    const t = v.currentTime, playing = !v.paused, rate = v.playbackRate;
    v.src = src; v.addEventListener('loadedmetadata', () => { v.currentTime = t; v.playbackRate = rate; if (playing) v.play(); }, { once: true });
  }
  if (!Q.get('variant')) try { localStorage.setItem('edsVariant', x.id); } catch {}
  $('varSel').value = x.id;
  render();
}

// ---- persistence ----
let saveT = 0;
function save(x = cur) {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { const r = await (await fetch('/api/variants', { method: 'POST', body: JSON.stringify(x) })).json(); msg(r.ok ? 'Kaydedildi ✓' : 'Hata: ' + r.error); } catch (e) { msg('Kaydedilemedi: ' + e.message); }
  }, 350);
}
const change = (fn, reload = false) => { fn(cur); apply(cur, true); save(); if (reload) {} };

// ---- UI ----
// themes are role based ({page, surface, dark, ink, paper, accent}); older 6-colour custom palettes are converted on the fly
const TH = (t) => (!t ? null : t.page ? t : { page: t.bg.white, surface: '#FFFFFF', dark: t.bg.black, ink: t.text.black, paper: t.text.white, accent: t.text.red || t.bg.red, name: t.name });
const swatch = (t) => { const th = TH(t) || { page: '#fff', surface: '#fff', ink: '#0B0B0B', accent: '#FF0000' }; return [th.page, th.surface, th.accent].map((c) => `<span class="vsw" style="background:${c}"></span>`).join(''); };
function render() {
  if (!cur) return;
  const lk = cur.look, th = lk.theme === 'custom' ? lk.custom : L.THEMES[lk.theme];
  $('vList').innerHTML = LIST.map((x, i) => { const t = x.look.theme === 'custom' ? x.look.custom : L.THEMES[x.look.theme];
    return `<button class="vcard${x.id === cur.id ? ' on' : ''}" data-id="${x.id}" title="${i < 9 ? 'Alt+' + (i + 1) : ''}">${swatch(t)}<b>${esc(x.name)}</b>${x.id === A ? '<i>A</i>' : ''}${x.id === B ? '<i>B</i>' : ''}</button>`; }).join('');
  $('varSel').innerHTML = LIST.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); $('varSel').value = cur.id;
  ['vA', 'vB'].forEach((k, j) => { $(k).innerHTML = LIST.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); $(k).value = j ? B : A; });
  $('vCmp').href = `/studio/compare.html?a=${encodeURIComponent(A || '')}&b=${encodeURIComponent(B || '')}`;
  if (document.activeElement !== $('vName')) $('vName').value = cur.name;
  // theme cards
  $('vThemes').innerHTML =[...Object.entries(L.THEMES).map(([k, t]) => [k, t ? t.name : 'Orijinal', t]), ['custom', 'Özel palet', lk.custom || L.THEMES.red]]
    .map(([k, n, t0]) => { const t = TH(t0) || { page: '#FFFFFF', surface: '#F3F1EE', dark: '#0B0B0B', ink: '#0B0B0B', paper: '#FFFFFF', accent: '#FF0000' };
      return `<button class="tcard${lk.theme === k ? ' on' : ''}" data-k="${k}" style="background:${t.page};color:${t.ink}"><b style="background:${t.surface};color:${t.ink};border-radius:5px;padding:1px 5px;justify-self:start">${esc(n)}</b><span style="background:${t.dark};color:${t.paper}">Aa</span><span style="background:${t.accent}"></span></button>`; }).join('');
  $('vCustom').hidden = lk.theme !== 'custom';
  if (lk.theme === 'custom') { lk.custom = { ...TH(lk.custom) }; delete lk.custom.name; $('vCustom').innerHTML = [['page', 'Zemin'], ['surface', 'Yüzey (kartlar)'], ['dark', 'Koyu yüzey'], ['ink', 'Yazı'], ['paper', 'Açık yazı'], ['accent', 'Vurgu (kırmızılar)']]
    .map(([k, n]) => `<label class="cpick">${n}<input type="color" data-k="${k}" value="${lk.custom[k]}"></label>`).join(''); }
  const ui = lk.ui || {};
  $('vUI').innerHTML = Object.entries(L.UI).map(([k, u]) => `<button class="${(ui.preset || 'original') === k ? 'on' : ''}" data-k="${k}">${u ? u.name : 'Orijinal'}</button>`).join('');
  $('vTex').innerHTML = Object.entries(L.TEXTURES).map(([k, n]) => `<button class="${(ui.texture || 'original') === k ? 'on' : ''}" data-k="${k}">${n}</button>`).join('');
  const P = L.UI[ui.preset] || {};
  $('vRad').value = ui.radius ?? P.radius ?? 32; $('vRadV').textContent = ui.radius != null ? ui.radius + 'px' : 'preset';
  $('vSh').value = ui.shadowK ?? 1; $('vBw').value = ui.borderW ?? (parseFloat(P.border) || 0);
  ['vRad', 'vSh', 'vBw'].forEach((id) => ($(id).disabled = !L.UI[ui.preset]));
  // typography
  const ty = lk.type || {};
  $('vType').innerHTML = Object.entries(L.TYPE).map(([k, t]) => `<button class="ycard${(ty.preset || 'original') === k ? ' on' : ''}" data-k="${k}"><span style="font-family:'${t ? t.display[0] : 'Anton'}';font-weight:${t ? t.display[1] : 400};text-transform:${t ? t.display[2] : 'uppercase'};letter-spacing:${t ? t.display[3] : 0}">Başlık İş</span><span style="font-family:'${t && t.serif ? t.serif[0] : 'EdsSerif'}';font-style:italic">ve gövde</span><small>${t ? t.name : 'Orijinal'}</small></button>`).join('');
  $('vTrack').value = ty.tracking ?? 0; $('vTrackV').textContent = ty.tracking != null ? (+ty.tracking).toFixed(3) + 'em' : 'preset';
  $('vCase').value = ty.case || 'original'; $('vWeight').value = ty.weight || '';
  // motion
  const mo = cur.motion || {};
  $('vEnter').innerHTML = [['default', 'Orijinal'], ['blur-rise', 'Blur-rise (Apple)'], ['pop', 'Scale-pop'], ['slide', 'Kaydır'], ['fade', 'Sade fade'], ['wipe', 'Maske wipe']]
    .map(([k, n]) => `<button class="${(mo.enter || 'default') === k ? 'on' : ''}" data-k="${k}">${n}</button>`).join('');
  $('vSpeed').value = mo.speed ?? 1; $('vSpeedV').textContent = (+(mo.speed ?? 1)).toFixed(2) + '×';
  $('vBounce').value = mo.bounce ?? 0; $('vBounceV').textContent = (+(mo.bounce ?? 0)).toFixed(2);
  // head + subs
  $('vHead').innerHTML = heads.map((h) => `<option value="${esc(h.url)}">${esc(h.name)}</option>`).join('') + '<option value="">Yok (düz renk)</option>';
  $('vHead').value = (cur.head && cur.head.src) || ''; $('vHeadBg').value = (cur.head && cur.head.bg) || '#0B0B0B'; $('vHeadBg').hidden = !!(cur.head && cur.head.src);
  $('vSubs').checked = cur.subs !== false;
}
$('vList').addEventListener('click', (e) => { const b = e.target.closest('.vcard'); if (b) apply(LIST.find((x) => x.id === b.dataset.id)); });
$('varSel').onchange = (e) => apply(LIST.find((x) => x.id === e.target.value));
$('vName').oninput = (e) => { cur.name = e.target.value || 'Adsız'; save(); clearTimeout(render.t); render.t = setTimeout(render, 400); };
$('vNew').onclick = () => { const x = DEF(); x.name = 'Varyant ' + (LIST.length + 1); x.order = LIST.length; LIST.push(x); apply(x); save(x); };
$('vDup').onclick = () => { const x = JSON.parse(JSON.stringify(cur)); x.id = 'v' + Date.now().toString(36); x.name = cur.name + ' kopya'; x.order = LIST.length; LIST.push(x); apply(x); save(x); };
$('vDel').onclick = async () => {
  if (LIST.length < 2) return msg('Son varyant silinemez');
  if (!confirm(`"${cur.name}" varyantı silinsin mi?`)) return;
  await fetch('/api/variants', { method: 'POST', body: JSON.stringify({ id: cur.id, delete: true }) });
  LIST = LIST.filter((x) => x !== cur); apply(LIST[0]);
};
$('vThemes').addEventListener('click', (e) => { const b = e.target.closest('.tcard'); if (!b) return; change((x) => { x.look.theme = b.dataset.k; if (b.dataset.k === 'custom' && !x.look.custom) { x.look.custom = { ...L.THEMES.red }; delete x.look.custom.name; } }); });
$('vCustom').addEventListener('input', (e) => { const i = e.target; if (!i.dataset.k) return; cur.look.custom[i.dataset.k] = i.value.toUpperCase(); window.__EDS_LOOK = resolveLook(cur); save(); });
$('vCustom').addEventListener('change', () => render());
$('vUI').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) change((x) => { x.look.ui = { texture: (x.look.ui || {}).texture || 'original', preset: b.dataset.k }; }); });
$('vTex').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) change((x) => { (x.look.ui = x.look.ui || { preset: 'original' }).texture = b.dataset.k; }); });
$('vRad').oninput = (e) => change((x) => { x.look.ui.radius = +e.target.value; });
$('vSh').oninput = (e) => change((x) => { x.look.ui.shadowK = +e.target.value; });
$('vBw').oninput = (e) => change((x) => { x.look.ui.borderW = +e.target.value; });
$('vType').addEventListener('click', (e) => { const b = e.target.closest('.ycard'); if (b) change((x) => { x.look.type = { ...(x.look.type || {}), preset: b.dataset.k }; }); });
$('vTrack').oninput = (e) => change((x) => { x.look.type = { preset: 'original', ...(x.look.type || {}), tracking: +e.target.value }; });
$('vTrackX').onclick = () => change((x) => { if (x.look.type) delete x.look.type.tracking; });
$('vCase').onchange = (e) => change((x) => { x.look.type = { preset: 'original', ...(x.look.type || {}), case: e.target.value }; });
$('vWeight').onchange = (e) => change((x) => { x.look.type = { preset: 'original', ...(x.look.type || {}) }; if (e.target.value) x.look.type.weight = +e.target.value; else delete x.look.type.weight; });
$('vEnter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) change((x) => { x.motion = { ...(x.motion || {}), enter: b.dataset.k }; }); });
// sliders: live label, apply (= reload clips) when released
$('vSpeed').oninput = (e) => ($('vSpeedV').textContent = (+e.target.value).toFixed(2) + '×');
$('vSpeed').onchange = (e) => change((x) => { x.motion = { ...(x.motion || {}), speed: +e.target.value }; });
$('vBounce').oninput = (e) => ($('vBounceV').textContent = (+e.target.value).toFixed(2));
$('vBounce').onchange = (e) => change((x) => { x.motion = { ...(x.motion || {}), bounce: +e.target.value }; });
$('vHead').onchange = (e) => change((x) => { x.head = { ...(x.head || {}), src: e.target.value || null }; });
$('vHeadBg').oninput = (e) => change((x) => { x.head = { ...(x.head || {}), bg: e.target.value }; });
$('vSubs').onchange = (e) => change((x) => { x.subs = e.target.checked; });
// A/B
$('vA').onchange = (e) => { A = e.target.value; render(); };
$('vB').onchange = (e) => { B = e.target.value; render(); };
function flip() {
  if (!A || !B) return;
  const next = cur.id === A ? B : A, x = LIST.find((q) => q.id === next); if (!x) return;
  apply(x); toast(`${cur.id === A ? 'A' : 'B'} · ${x.name}`);
}
$('vFlip').onclick = flip;

// ---- talking head import: folder browser + drag & drop, ffmpeg proxy jobs ----
async function loadHeads() { try { heads = await (await fetch('/api/heads', { cache: 'no-store' })).json(); } catch { heads = []; } render(); }
let browseDir = (() => { try { return localStorage.getItem('edsBrowse') || ''; } catch { return ''; } })();
async function browse(dir) {
  const r = await (await fetch('/api/browse?dir=' + encodeURIComponent(dir || ''))).json();
  if (r.error) return msg(r.error);
  browseDir = r.dir; try { localStorage.setItem('edsBrowse', r.dir); } catch {}
  $('vbPath').value = r.dir;
  $('vbList').innerHTML = (r.parent != null && r.dir ? `<div class="vbi dir" data-p="${esc(r.parent)}">⬑ üst klasör</div>` : '')
    + r.entries.map((e) => `<div class="vbi${e.dir ? ' dir' : ''}" data-p="${esc(e.path)}" data-f="${e.dir ? '' : 1}">${e.dir ? '▸ ' : '▶ '}${esc(e.name)}${e.size ? `<small>${(e.size / 1048576).toFixed(0)} MB</small>` : ''}</div>`).join('');
}
$('vBrowse').onclick = () => { $('vbModal').hidden = false; browse(browseDir); };
$('vbClose').onclick = () => ($('vbModal').hidden = true);
$('vbGo').onclick = () => browse($('vbPath').value.trim());
$('vbPath').onkeydown = (e) => { if (e.key === 'Enter') browse(e.target.value.trim()); e.stopPropagation(); };
$('vbList').addEventListener('click', async (e) => {
  const it = e.target.closest('.vbi'); if (!it) return;
  if (!it.dataset.f) return browse(it.dataset.p);
  const r = await (await fetch('/api/heads/import', { method: 'POST', body: JSON.stringify({ path: it.dataset.p }) })).json();
  if (!r.ok) return msg(r.error);
  $('vbModal').hidden = true; msg('Proxy hazırlanıyor…'); pollJobs();
});
const dz = $('vDrop');
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', async (e) => {
  e.preventDefault(); dz.classList.remove('over');
  const f = e.dataTransfer.files[0]; if (!f || !/\.(mov|mp4|m4v|mkv|webm)$/i.test(f.name)) return msg('Bir video dosyası bırak');
  msg('Yükleniyor… ' + (f.size / 1048576).toFixed(0) + ' MB');
  const r = await (await fetch('/api/heads/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json();
  if (!r.ok) return msg(r.error); pollJobs();
});
let pollT = 0;
async function pollJobs() {
  clearTimeout(pollT);
  const J = await (await fetch('/api/jobs', { cache: 'no-store' })).json();
  $('vJobs').innerHTML = J.slice(0, 4).map((j) => `<div class="job ${j.status === 'hata' ? 'err' : ''}"><span>${esc(j.name)}</span><span>${j.status === 'çalışıyor' ? Math.round(j.progress * 100) + '%' : j.status}${j.error ? ' · ' + esc(j.error) : ''}</span></div>`).join('');
  if (J.some((j) => j.status === 'çalışıyor')) pollT = setTimeout(pollJobs, 1000);
  else { const was = heads.length; await loadHeads(); if (heads.length > was) msg('Yeni kafa videosu hazır ✓'); }
}

// ---- keys: V next variant, Alt+1..9, B = A/B flip ----
addEventListener('keydown', (e) => {
  const tg = e.target; if (tg.tagName === 'TEXTAREA' || tg.isContentEditable || (tg.tagName === 'INPUT' && !/^(range|checkbox|button|color|file)$/.test(tg.type)) || tg.tagName === 'SELECT') return;
  if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && LIST.length) { const i = LIST.indexOf(cur); apply(LIST[(i + (e.shiftKey ? -1 : 1) + LIST.length) % LIST.length]); toast(cur.name); }
  if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey) flip();
  if (e.altKey && /^[1-9]$/.test(e.key) && LIST[+e.key - 1]) { e.preventDefault(); apply(LIST[+e.key - 1]); }
});

(async () => {
  try { LIST = await (await fetch('/api/variants', { cache: 'no-store' })).json(); } catch { LIST = []; }
  if (!LIST.length) { const x = DEF(); x.id = 'orijinal'; x.name = 'Orijinal'; LIST = [x]; save(x); }
  let id = Q.get('variant'); try { id = id || localStorage.getItem('edsVariant'); } catch {}
  A = LIST[0].id; B = (LIST[1] || LIST[0]).id;
  await loadHeads();
  motionKey = JSON.stringify({ ...DEF().motion }); // clip pages already loading were built with the default motion
  apply(LIST.find((x) => x.id === id) || LIST[0], true);
  if (Q.get('embed')) document.body.classList.add('embed');
})();
// ---- still frames: ?still=t (used by /api/still) seeks, waits until video + clip pages are painted, then flags ready ----
if (Q.get('still') != null) (async () => {
  const t = Number(Q.get('still')) || 0, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  while (!cur || !SEGS.length) await wait(100);
  for (const x of document.querySelectorAll('.toast,#toast')) x.remove();
  v.pause(); v.currentTime = t; await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  for (let i = 0; i < 150; i++) { // up to 15 s for the clip pages near t to load
    const near = SEGS.filter((s) => t >= s.start - 0.05 && t < s.end + 0.35), ok = near.every((s) => { const f = frames[s.id]; try { return f && f.contentWindow.__bm && f.contentDocument.readyState === 'complete'; } catch { return false; } });
    if (ok && v.readyState >= 2) break; await wait(100);
  }
  for (const s of SEGS) { const f = frames[s.id]; try { await f.contentWindow.document.fonts.ready; } catch {} }
  await wait(250); v.currentTime = t; await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
  window.__stillReady = true;
})();
async function stillPng(all) {
  const t = +v.currentTime.toFixed(2), ids = all ? LIST.map((x) => x.id) : [cur.id];
  msg('Kare hazırlanıyor…');
  const pngName = (id) => EDS_fileName(`${(LIST.find((x) => x.id === id) || {}).name || id}_${t.toFixed(2)}s_${EDS_stamp()}.png`);
  if (!all) { // one still: normal save dialog
    const r = await (await fetch(`/api/still?variant=${encodeURIComponent(cur.id)}&t=${t}`)).json();
    if (!r.ok) return msg('Hata: ' + r.error);
    const p = await EDS_saveAs({ src: r.url, name: pngName(cur.id), title: 'Kare PNG kaydet' }); return msg(p ? 'Kaydedildi ✓' : 'İptal');
  }
  const dir = await EDS_pickFolder(); if (!dir) return msg('İptal'); // all variants: pick the folder once
  for (const id of ids) {
    const r = await (await fetch(`/api/still?variant=${encodeURIComponent(id)}&t=${t}`)).json();
    if (!r.ok) return msg('Hata: ' + r.error);
    let s = await (await fetch('/api/save', { method: 'POST', body: JSON.stringify({ src: r.url, dir, name: pngName(id) }) })).json();
    if (s.exists && confirm(`“${pngName(id)}” zaten var. Üzerine yazılsın mı?`)) s = await (await fetch('/api/save', { method: 'POST', body: JSON.stringify({ src: r.url, dir, name: pngName(id), overwrite: true }) })).json();
  }
  msg(`${ids.length} PNG · ${t} sn ✓`);
}
$('vStill').onclick = (e) => stillPng(e.shiftKey);
window.VARIANTS = { get list() { return LIST; }, get current() { return cur; }, apply: (id) => { const x = LIST.find((q) => q.id === id); if (x) apply(x); } };
})();
