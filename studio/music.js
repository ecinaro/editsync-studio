// EditSync Stüdyo — müzik önizlemesi. work/music.json'daki parçaları videoyla senkron çalar (export mix'iyle aynı kurallar:
// çıktı zamanında yerleşim, parçanın kendi hızı (perde korunur), giriş/çıkış fade, gain + master, konuşmada ducking).
// Uses index.html globals (v, $).
(function () {
'use strict';
let M = { master: 0, items: [] }, speech = [], players = [];
const db = (g) => Math.pow(10, (g || 0) / 20);
const sp = () => window.EDS_speed || 1;

async function loadAll() {
  // export hızı (work/timing.json .speed): müzik + SFX önizlemede de çıktı zaman çizelgesine göre yerleşsin
  const T = await fetch('/api/store/timing', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
  window.EDS_speed = Math.max(0.5, Math.min(2, +(T && T.speed) || 1));
  M = await fetch('/api/store/music').then((r) => r.json()).catch(() => M) || M;
  M.items = M.items || [];
  const txt = await fetch('/work/words.txt').then((r) => r.text()).catch(() => '');
  const t = []; for (const ln of txt.split(/\r?\n/)) { const m = /^\s+([\d.]+)\s+\S/.exec(ln); if (m) t.push(+m[1]); }
  speech = []; t.forEach((x, i) => { const e = Math.min(t[i + 1] ?? x + 0.6, x + 0.6); const L = speech[speech.length - 1]; if (L && x - L[1] < 0.35) L[1] = Math.max(L[1], e); else speech.push([x, e]); });
  players.forEach((p) => p.a.pause());
  players = M.items.filter((x) => !x.mute && x.file).map((x) => { const a = new Audio('/' + x.file); a.preload = 'auto'; a.preservesPitch = true; return { x, a }; });
}
// konuşma zarfı (0..1), export'taki 80 ms atak / 300 ms bırakma ile aynı
function talk(t) { let m = 0; for (const [p, q] of speech) { if (t < p - 0.1) break; m = Math.max(m, Math.min(1, Math.max(0, (t - (p - 0.08)) / 0.08)) * Math.min(1, Math.max(0, (q + 0.3 - t) / 0.3))); } return m; }
function place(p) { // kaynak zamanı (video) -> parçanın dosya içindeki konumu
  const { x, a } = p, s = sp(), cs = Math.max(0.5, Math.min(2, +x.speed || 1)), i0 = +x.in || 0;
  const outT = (v.currentTime - x.t) / s, pos = i0 + outT * cs, end = x.out != null ? +x.out : (a.duration || 1e9);
  return { outT, pos, end, cs, len: (end - i0) / cs };
}
function sync(hard) {
  for (const p of players) {
    const { outT, pos, end, cs } = place(p), a = p.a;
    const on = !v.paused && outT >= 0 && pos < end;
    if (!on) { if (!a.paused) a.pause(); continue; }
    a.playbackRate = cs * (v.playbackRate || 1) / sp();
    if (hard || Math.abs(a.currentTime - pos) > 0.25) a.currentTime = pos;
    if (a.paused) a.play().catch(() => {});
  }
}
function tick() {
  const mute = $('xMute') && $('xMute').checked;
  for (const p of players) {
    const { outT, len } = place(p), x = p.x;
    const fi = +x.fadeIn || 0, fo = +x.fadeOut || 0;
    let g = db((+x.gain || 0) + (+M.master || 0));
    if (fi) g *= Math.min(1, Math.max(0, outT / fi));
    if (fo) g *= Math.min(1, Math.max(0, (len - outT) / fo));
    if (M.duck && M.duck.on) g *= 1 - (1 - db(-Math.abs(+M.duck.db || 10))) * talk(v.currentTime);
    p.a.volume = mute ? 0 : Math.max(0, Math.min(1, g));
  }
  if (!v.paused) sync(false);
}
v.addEventListener('play', () => sync(true));
v.addEventListener('pause', () => players.forEach((p) => p.a.pause()));
v.addEventListener('seeked', () => sync(true));
v.addEventListener('ratechange', () => sync(true));
loadAll().then(() => { tick(); setInterval(tick, 50); });
window.EDS_music = { reload: loadAll, get players() { return players; } };
})();
