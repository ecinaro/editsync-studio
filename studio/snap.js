// EditSync Stüdyo — "📷 Kare": full-res still of the head video at the playhead (button or K).
// Server (/api/snap) grabs it with ffmpeg from the original source and saves it to <source folder>/KARELER/.
(() => {
  const v = document.getElementById('v');
  const bar = document.querySelector('.left .bar');
  const btn = document.createElement('button');
  btn.textContent = '📷 Kare';
  btn.title = 'Bu karenin tam çözünürlüklü görüntüsünü kaydet (K)';
  const msg = document.createElement('span');
  msg.className = 'hint';
  msg.style.cssText = 'margin-left:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px';
  bar.append(btn, msg);

  let busy = false;
  async function snap() {
    if (busy) return;
    busy = true; v.pause();
    const t = v.currentTime;
    msg.textContent = `kaydediliyor… ${t.toFixed(2)} sn`;
    try {
      const r = await (await fetch('/api/snap?t=' + t.toFixed(3), { cache: 'no-store' })).json();
      if (!r.ok) throw new Error(r.error);
      msg.textContent = '✓ ' + r.path; msg.title = r.path;
      const a = document.createElement('a'); // also hand the file to the browser (Downloads)
      a.href = r.url; a.download = r.url.split('/').pop(); a.click();
    } catch (e) { msg.textContent = 'kaydedilemedi: ' + e.message; }
    busy = false;
  }
  btn.addEventListener('click', snap);
  addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable) { e.preventDefault(); snap(); }
  });
})();
