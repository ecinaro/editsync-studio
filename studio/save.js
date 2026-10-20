// EditSync Stüdyo — "Kaydet" (save to a folder the user picks). Used by MP4 export, SFX stem, SRT and still PNGs.
//   EDS_pickFolder(start)            -> folder path or null   (folder browser over /api/browse?dirs=1; drives, home …)
//   EDS_saveAs({ src | content, name, title })   asks folder + file name, confirms before overwriting, POST /api/save
// The last folder is remembered (localStorage). Files are written only to the folder chosen here.
(function () {
'use strict';
const DEF_DIR = ''; // first save starts in the folder browser's root; afterwards the last folder is remembered
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lastDir = () => { try { return localStorage.getItem('edsSaveDir') || DEF_DIR; } catch { return DEF_DIR; } };
const remember = (d) => { try { localStorage.setItem('edsSaveDir', d); } catch {} };
window.EDS_lastSaveDir = lastDir; window.EDS_rememberSaveDir = remember;
// file names: keep Turkish letters, drop only what Windows forbids
window.EDS_fileName = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 140);
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
window.EDS_stamp = stamp;

// ---- folder picker ----
const fm = document.createElement('div'); fm.className = 'modal'; fm.hidden = true; fm.style.zIndex = 620;
fm.innerHTML = `<div class="mbox"><div class="row"><b>Klasör seç</b><span class="hint">sürücüler ve klasörler</span><button data-a="x" style="margin-left:auto">Vazgeç</button></div>
  <div class="row"><input type="text" class="fp" spellcheck="false" style="flex:1"><button data-a="go">Git</button><button data-a="up">⬑</button></div>
  <div class="vbl fl2"></div><div class="row"><span class="hint fs" style="flex:1;word-break:break-all"></span><button data-a="ok" style="border-color:var(--red)">Bu klasörü seç</button></div></div>`;
document.body.appendChild(fm);
let cur = '', parent = null, resolveP = null;
async function go(dir) {
  const r = await (await fetch('/api/browse?dirs=1&dir=' + encodeURIComponent(dir || ''))).json();
  if (r.error) { fm.querySelector('.fs').textContent = 'Açılamadı: ' + r.error; return false; }
  cur = r.dir; parent = r.parent; fm.querySelector('.fp').value = r.dir; fm.querySelector('.fs').textContent = r.dir || 'Sürücüler';
  fm.querySelector('.fl2').innerHTML = r.entries.filter((e) => e.dir).map((e) => `<div class="vbi dir" data-p="${esc(e.path)}">▸ ${esc(e.name)}</div>`).join('') || '<div class="hint" style="padding:10px">Alt klasör yok</div>';
  return true;
}
fm.addEventListener('click', async (e) => {
  const a = e.target.dataset.a, it = e.target.closest('.vbi');
  if (it) return go(it.dataset.p);
  if (a === 'go') go(fm.querySelector('.fp').value.trim());
  if (a === 'up' && parent != null) go(parent);
  if (a === 'x' || a === 'ok') { fm.hidden = true; const r = a === 'ok' && cur ? cur : null; if (r) remember(r); resolveP && resolveP(r); resolveP = null; }
});
fm.querySelector('.fp').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(e.target.value.trim()); });
window.EDS_pickFolder = async (start) => {
  fm.hidden = false;
  let d = start || lastDir();
  // walk up until something exists (the default MOTION folder may not exist yet)
  for (let i = 0; i < 8 && d; i++) { if (await go(d)) break; d = d.replace(/[\\/][^\\/]*$/, ''); if (/^[A-Za-z]:$/.test(d)) d += '\\'; }
  if (!cur) await go('');
  return new Promise((r) => (resolveP = r));
};

// ---- save dialog ----
const sm = document.createElement('div'); sm.className = 'modal'; sm.hidden = true; sm.style.zIndex = 610;
sm.innerHTML = `<div class="mbox" style="width:min(560px,92vw)"><div class="row"><b class="st">Kaydet</b><button data-a="x" style="margin-left:auto">Vazgeç</button></div>
  <div class="fl">Klasör <div class="row"><input type="text" class="sd" spellcheck="false" style="flex:1"><button data-a="pick">Klasör seç…</button></div></div>
  <div class="fl">Dosya adı <input type="text" class="sn" spellcheck="false"></div>
  <div class="row"><button data-a="ok" style="border-color:var(--red)">Kaydet</button><a class="dl hint" target="_blank" download>tarayıcıya indir</a><span class="flash sm"></span></div></div>`;
document.body.appendChild(sm);
sm.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
let job = null;
async function doSave(overwrite) {
  const dir = sm.querySelector('.sd').value.trim(), name = EDS_fileName(sm.querySelector('.sn').value);
  if (!dir || !name) return;
  const r = await (await fetch('/api/save', { method: 'POST', body: JSON.stringify({ ...job.payload, dir, name, overwrite }) })).json();
  if (r.exists && !overwrite) { if (confirm(`“${name}” bu klasörde zaten var. Üzerine yazılsın mı?`)) return doSave(true); return; }
  if (!r.ok) { sm.querySelector('.sm').textContent = 'Hata: ' + r.error; return; }
  remember(dir); sm.querySelector('.sm').textContent = 'Kaydedildi ✓ ' + r.path; job.done(r.path);
  setTimeout(() => (sm.hidden = true), 1400);
}
sm.addEventListener('click', async (e) => {
  const a = e.target.dataset.a;
  if (a === 'x') { sm.hidden = true; job && job.done(null); }
  if (a === 'pick') { const d = await EDS_pickFolder(sm.querySelector('.sd').value.trim()); if (d) sm.querySelector('.sd').value = d; }
  if (a === 'ok') doSave(false);
});
window.EDS_saveAs = ({ src, content, name, title }) => new Promise((done) => {
  job = { payload: src ? { src } : { content }, done };
  sm.querySelector('.st').textContent = title || 'Kaydet';
  sm.querySelector('.sd').value = lastDir(); sm.querySelector('.sn').value = name; sm.querySelector('.sm').textContent = '';
  const dl = sm.querySelector('.dl');
  if (src) { dl.href = src; dl.hidden = false; dl.download = name; } else { dl.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); dl.download = name; }
  sm.hidden = false;
});
})();
