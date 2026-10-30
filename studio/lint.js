// EditSync Stüdyo — Kontrol (L): finds text that leaves the safe area, sits under the Reels / TikTok buttons and caption
// (when the phone overlay is on), or overflows its own box (a longer font in a typography variant). Outlines the offenders
// on the stage (preview only) and lists them. "Tüm video" samples every 0.5 s and lists the times with problems.
// Uses index.html globals (v, stage, SEGS, frames, $).
(function () {
'use strict';
const SAFE = { x0: 140, x1: 1300, y0: 260, y1: 2000 }; // 1440x2560 clip px (same box as "Güvenli alan")
const ZONES = { // platform UI in clip px (1080x1920 phone layout × 4/3)
  reels: [{ x: 1240, y: 1490, w: 200, h: 1070, n: 'Reels sağ butonlar' }, { x: 0, y: 2110, w: 1240, h: 450, n: 'Reels açıklama' }, { x: 0, y: 0, w: 1440, h: 300, n: 'Reels üst bar' }],
  tiktok: [{ x: 1220, y: 1180, w: 220, h: 1380, n: 'TikTok sağ butonlar' }, { x: 0, y: 1980, w: 1220, h: 580, n: 'TikTok açıklama + menü' }, { x: 0, y: 0, w: 1440, h: 320, n: 'TikTok üst sekmeler' }],
};
const layer = $('lintLayer'), btn = $('lintBtn');
let on = false, last = [];
const visible = (el, w) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = w.getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; o *= +cs.opacity; } return o > 0.15; };
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function scan() { // problems in the frames visible right now
  if (window.EDS_LAND) return []; // safe area and platform zones are for vertical phone layouts
  const out = [], zones = $('phoneT').checked ? ZONES[$('phoneK').value] || [] : [];
  for (const s of SEGS) {
    const f = frames[s.id]; if (!f || f.style.visibility !== 'visible' || +f.style.opacity < 0.5) continue;
    let d, w; try { d = f.contentDocument; w = f.contentWindow; } catch { continue; }
    if (!d || !d.body) continue;
    const H = parseFloat(f.style.height) || 2560;
    for (const el of d.body.querySelectorAll('*')) {
      if (!/\S/.test([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))) continue;
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || !visible(el, w)) continue;
      const b = { x: r.left, y: r.top, w: r.width, h: r.height }, why = [];
      if (b.x < SAFE.x0 || b.x + b.w > SAFE.x1 || b.y < SAFE.y0 || b.y + b.h > Math.min(SAFE.y1, H)) why.push('güvenli alan dışı');
      for (const z of zones) if (hit(b, z)) why.push(z.n);
      // clipped by an overflow:hidden ancestor (typical when a wider font no longer fits its card / pill)
      for (let p = el.parentElement; p && p !== d.body; p = p.parentElement) {
        const cs = w.getComputedStyle(p); if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
        const q = p.getBoundingClientRect(); if (q.width > 20 && (r.left < q.left - 2 || r.right > q.right + 2)) { why.push('kutusundan taşıyor'); } break;
      }
      if (b.x + b.w < 0 || b.x > 1440 || b.y > H || b.y + b.h < 0) continue; // fully off frame = intentionally parked, ignore
      if (why.length) out.push({ s, b, why: [...new Set(why)], text: el.textContent.trim().slice(0, 30), top: s.layout === 'split' });
    }
  }
  return out;
}
function show(list) {
  const k = stage.clientWidth / 1440;
  layer.innerHTML = list.map((p) => `<div title="${p.text} · ${p.why.join(', ')}" style="left:${p.b.x * k}px;top:${p.b.y * k}px;width:${p.b.w * k}px;height:${p.b.h * k}px"></div>`).join('');
  btn.classList.toggle('bad', list.length > 0);
  btn.textContent = list.length ? `⚠ ${list.length} sorun` : on ? '✓ Temiz' : '⚠ Kontrol';
  btn.title = list.length ? list.map((p) => `${p.s.id} “${p.text}”: ${p.why.join(', ')}`).join('\n') : 'Güvenli alan / platform arayüzü / taşma kontrolü (L) · Shift+tık: tüm videoyu tara';
}
function loop() { // live while switched on and paused
  if (on && v.paused) { last = scan(); show(last); }
  setTimeout(loop, 500);
}
async function full() { // sample the whole video, report times
  const was = v.currentTime, hits = [];
  btn.textContent = 'Taranıyor…';
  for (let t = 0.2; t < (v.duration || 56); t += 0.5) {
    v.currentTime = t; await new Promise((r) => v.addEventListener('seeked', r, { once: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const p = scan(); if (p.length) hits.push(`${t.toFixed(1)} sn · ${p[0].s.id}: “${p[0].text}” ${p[0].why.join(', ')}${p.length > 1 ? ` (+${p.length - 1})` : ''}`);
  }
  v.currentTime = was;
  alert(hits.length ? `Sorunlu anlar (${hits.length}):\n\n` + hits.slice(0, 40).join('\n') : 'Tüm video temiz ✓');
}
function toggle() { on = !on; if (!on) { layer.innerHTML = ''; show([]); } else { last = scan(); show(last); } }
btn.onclick = (e) => { if (e.shiftKey) full(); else toggle(); };
addEventListener('keydown', (e) => {
  const tg = e.target; if (tg.tagName === 'TEXTAREA' || tg.isContentEditable || (tg.tagName === 'INPUT' && !/^(range|checkbox|button|color|file)$/.test(tg.type))) return;
  if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey) toggle();
});
loop();
window.LINT = { scan, full };
})();
