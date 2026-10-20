// EditSync Stüdyo — "⬇ MP4" dışa aktarma. Dialog: variant (active / all = queue), 1080×1920 or 2160×3840, 30 fps, speech audio
// (+ optional SFX mix), subtitles on/off. The server renders the bare studio page frame by frame in headless Chrome
// (server-ext.mjs, render-page.js) and writes work/exports/<variant>_<date>.mp4. Uses globals $, VARIANTS.
(function () {
'use strict';
if (new URLSearchParams(location.search).has('embed')) return;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dlg = document.createElement('div'); dlg.className = 'modal'; dlg.id = 'xpModal'; dlg.hidden = true;
dlg.innerHTML = `<div class="mbox" style="width:min(520px,92vw)">
  <div class="row"><b>MP4 dışa aktar</b><button id="xpClose" style="margin-left:auto">Kapat</button></div>
  <div class="fl">Varyant <select id="xpVar"></select></div>
  <div class="fl">Çözünürlük <select id="xpRes"><option value="1">1080 × 1920</option><option value="1.3333">1440 × 2560 (2K)</option><option value="2">2160 × 3840 (4K, yavaş)</option></select></div>
  <div class="fl">Kare hızı <span class="hint">30 fps · H.264 (crf 16) · AAC 192k</span></div>
  <div class="fl">Ses <div class="row"><span class="hint">konuşma (orijinal kafa sesi)</span><label><input type="checkbox" id="xpSfx" checked> + SFX miksi</label></div></div>
  <div class="fl">Altyazı <label><input type="checkbox" id="xpSubs" checked> dahil</label></div>
  <div class="fl">Kaydet <div class="row"><input type="text" id="xpDir" spellcheck="false" style="flex:1"><button id="xpPick">Klasör seç…</button></div></div>
  <div class="fl">Dosya adı <input type="text" id="xpName" spellcheck="false"></div>
  <div class="row"><button id="xpGo" style="border-color:var(--red)">Başlat</button><span class="hint">Tarayıcı kapalı arka planda render alır; bu pencereyi kapatabilirsin.</span></div>
  <div id="xpJobs" style="display:flex;flex-direction:column;gap:8px"></div>
</div>`;
document.body.appendChild(dlg);
const st = document.createElement('style');
st.textContent = `.xpj{border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:5px;font-size:12px}
.xpj .bar{height:6px;border-radius:3px;background:#2a2626;overflow:hidden;max-width:none}.xpj .bar i{display:block;height:100%;background:var(--red);transition:width .4s}
.xpj.ok .bar i{background:#46a758}.xpj .p{color:var(--sub);word-break:break-all;user-select:all}`;
document.head.appendChild(st);

function open() {
  const L = (window.VARIANTS && VARIANTS.list) || [], cur = window.VARIANTS && VARIANTS.current;
  $('xpVar').innerHTML = L.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') + (L.length > 1 ? `<option value="*">Tüm varyantlar (${L.length} video, sırayla)</option>` : '');
  if (cur) $('xpVar').value = cur.id;
  $('xpDir').value = EDS_lastSaveDir(); defName(); dlg.hidden = false; poll();
}
$('xpClose').onclick = () => (dlg.hidden = true);
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.hidden = true; });
const RES = { 1: '1080x1920', 1.3333: '1440x2560', 2: '2160x3840' };
const nameFor = (x) => EDS_fileName(`${x.name}_${RES[$('xpRes').value]}_${EDS_stamp()}.mp4`);
function defName() {
  const L = (window.VARIANTS && VARIANTS.list) || [], x = L.find((q) => q.id === $('xpVar').value);
  $('xpName').value = x ? nameFor(x) : '(her varyant kendi adıyla)'; $('xpName').disabled = !x;
}
$('xpVar').onchange = defName; $('xpRes').onchange = defName;
$('xpPick').onclick = async () => { const d = await EDS_pickFolder($('xpDir').value.trim()); if (d) $('xpDir').value = d; };
['xpDir', 'xpName'].forEach((id) => $(id).addEventListener('keydown', (e) => e.stopPropagation()));
$('xpGo').onclick = async () => {
  const L = VARIANTS.list, sel = $('xpVar').value, vs = (sel === '*' ? L : L.filter((x) => x.id === sel)).map((x) => ({ id: x.id, name: x.name }));
  const dir = $('xpDir').value.trim(), name = EDS_fileName($('xpName').value); let overwrite = false;
  if (dir && vs.length === 1) { // ask before replacing an existing file (with several variants the server never overwrites: "name (2).mp4")
    const c = await (await fetch(`/api/save/check?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`)).json();
    if (c.exists) { if (!confirm(`“${name}” bu klasörde zaten var. Render bitince üzerine yazılsın mı?`)) return; overwrite = true; }
  }
  if (dir) EDS_rememberSaveDir(dir);
  const saveNames = Object.fromEntries(vs.map((x) => [x.id, nameFor(x)]));
  const r = await (await fetch('/api/export', { method: 'POST', body: JSON.stringify({ variants: vs, scale: +$('xpRes').value, sfx: $('xpSfx').checked, subs: $('xpSubs').checked, saveDir: dir || null, saveName: name, saveNames, overwrite }) })).json();
  if (!r.ok) alert(r.error); poll();
};
const fmtS = (s) => (s == null ? '' : s >= 60 ? `${Math.floor(s / 60)} dk ${s % 60} sn` : `${s} sn`);
let pt = 0;
async function poll() {
  clearTimeout(pt);
  let J = []; try { J = await (await fetch('/api/export/jobs', { cache: 'no-store' })).json(); } catch {}
  $('xpJobs').innerHTML = J.slice().reverse().map((j) => {
    const pc = j.total ? Math.round((j.done / j.total) * 100) : 0, ok = j.status === 'bitti';
    return `<div class="xpj${ok ? ' ok' : ''}"><div class="row"><b>${esc(j.name)}</b><span class="hint">${j.scale === 2 ? '2160p' : j.scale > 1.2 ? '1440p (2K)' : '1080p'}${j.sfx ? ' · SFX' : ''}${j.subs ? '' : ' · altyazısız'}</span>
      <span style="margin-left:auto">${esc(j.status)}${j.status === 'kareler' ? ` · ${j.done}/${j.total} kare${j.eta != null ? ' · ~' + fmtS(j.eta) + ' kaldı' : ''}` : ''}${ok && j.secs ? ' · ' + fmtS(j.secs) : ''}</span>
      ${!ok && !/hata|iptal/.test(j.status) ? `<button data-c="${j.id}">İptal</button>` : ''}</div>
      <div class="bar"><i style="width:${ok ? 100 : pc}%"></i></div>
      ${ok ? `<div class="row"><a href="${j.url}" download style="color:var(--ink)">⬇ İndir</a><span class="p">${esc(j.saved || j.path)}</span></div>` : ''}${j.saveError ? `<div style="color:#ff6b6b">Seçilen klasöre kaydedilemedi: ${esc(j.saveError)} (dosya work/exports içinde)</div>` : ''}${j.error ? `<div style="color:#ff6b6b">${esc(j.error)}</div>` : ''}</div>`;
  }).join('');
  const busy = J.some((j) => !/bitti|hata|iptal/.test(j.status));
  const b = $('xpBtn'); if (b) b.textContent = busy ? `⬇ MP4 · ${(J.find((j) => j.status === 'kareler') || {}).done || 0}/${(J.find((j) => j.status === 'kareler') || {}).total || '…'}` : '⬇ MP4';
  if (busy || !dlg.hidden) pt = setTimeout(poll, busy ? 1000 : 3000);
}
$('xpJobs').addEventListener('click', async (e) => { const id = e.target.dataset.c; if (!id) return; await fetch('/api/export/cancel', { method: 'POST', body: JSON.stringify({ id }) }); poll(); });

// buttons: next to the player controls and in the Varyant panel
const b1 = document.createElement('button'); b1.id = 'xpBtn'; b1.textContent = '⬇ MP4'; b1.title = 'MP4 dışa aktar (varyant, çözünürlük, ses, altyazı)'; b1.onclick = open;
const bar = document.querySelector('.left .bar'); if (bar) bar.appendChild(b1);
// plan page (plan notes, my script, second-by-second shot list)
const bp = document.createElement('button'); bp.textContent = '📋 Plan'; bp.title = 'Plan sayfası: plan, metin, saniye saniye liste';
bp.onclick = () => window.open('/studio/plan.html', 'editsync-plan'); if (bar) bar.appendChild(bp);
// /studio/#t=12.5 (from the plan page's "▶ git") jumps the player there
const goHash = () => { const m = /t=([\d.]+)/.exec(location.hash); if (!m) return; const t = +m[1], vv = $('v'); const go = () => { vv.pause(); vv.currentTime = t; }; vv.readyState >= 1 ? go() : vv.addEventListener('loadedmetadata', go, { once: true }); };
window.addEventListener('hashchange', goHash); goHash();
const vs = $('vStill'); if (vs) { const b2 = document.createElement('button'); b2.textContent = '⬇ MP4 dışa aktar'; b2.onclick = open; vs.after(b2); }
poll();
window.EXPORT = { open, poll };
})();
