// EditSync Stüdyo — geri al / yinele. Ctrl+Z (⌘Z) bir adım geri, Ctrl+Shift+Z ya da Ctrl+Y ileri.
// Sunucu her düzenleme dosyası yazımından önceki hali saklar (/api/undo, /api/redo). Geri alınca sayfa
// aynı saniyede yeniden yüklenir, böylece yerleşim / zamanlama / altyazı / SFX hep diskteki hale döner.
(() => {
  const v = document.getElementById('v');
  const bar = document.querySelector('.left .bar');
  const mk = (txt, title) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; bar.append(b); return b; };
  const bU = mk('↶ Geri al', 'Son düzenlemeyi geri al (Ctrl+Z)'), bR = mk('↷', 'Yinele (Ctrl+Shift+Z)');
  const say = (m) => { const el = document.getElementById('msg'); if (el) { el.textContent = m; clearTimeout(say.t); say.t = setTimeout(() => (el.textContent = ''), 2500); } };

  // yeniden yüklemeden sonra aynı saniyeye dön
  const keep = sessionStorage.getItem('eds:t');
  if (keep != null) { sessionStorage.removeItem('eds:t'); const go = () => { v.currentTime = +keep; }; v.readyState >= 1 ? go() : v.addEventListener('loadedmetadata', go, { once: true }); }
  const left = sessionStorage.getItem('eds:undo-msg'); if (left) { sessionStorage.removeItem('eds:undo-msg'); setTimeout(() => say(left), 800); }

  async function step(kind) {
    const r = await (await fetch('/api/' + kind, { method: 'POST' })).json().catch(() => ({}));
    if (!r.ok) { say(kind === 'undo' ? 'Geri alınacak adım yok' : 'Yinelenecek adım yok'); return; }
    sessionStorage.setItem('eds:t', String(v.currentTime));
    sessionStorage.setItem('eds:undo-msg', `${kind === 'undo' ? 'Geri alındı' : 'Yinelendi'}: ${r.file} (kalan ${r.undo} adım)`);
    location.reload();
  }
  bU.addEventListener('click', () => step('undo'));
  bR.addEventListener('click', () => step('redo'));
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return; // yazı alanında tarayıcının kendi geri alması
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); step('undo'); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); step('redo'); }
  }, true);
})();
