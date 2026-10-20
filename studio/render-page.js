// EditSync Stüdyo — page side of the MP4 export. Only active on /studio/?embed=1&render=1&variant=…(&nosubs=1).
// The server's headless Chromium opens ONE such page per worker and, for every output frame, calls
//   await __EDS_renderFrame(t)   -> video really seeked (seeked + requestVideoFrameCallback), tick() run once,
//                                   clip pages' (possibly async) seeks awaited, two paints for subtitles / look layer
// then screenshots the stage. index.html's tick loop is stopped in this mode (window.__EDS_MANUAL).
(function () {
'use strict';
const Q = new URLSearchParams(location.search);
if (!Q.has('render')) return;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
window.__EDS_renderReady = false;
(async () => {
  while (!window.VARIANTS || !VARIANTS.current || !DATA) await wait(50); // SEGS may legitimately be empty (finished video as the base)
  document.querySelectorAll('#toast').forEach((x) => x.remove());
  SEGS.forEach(frameFor); // every clip page loaded up front: no loading hiccups mid-render
  for (let i = 0; i < 600; i++) {
    const ok = SEGS.every((s) => { try { const f = frames[s.id]; return f.contentWindow.__bm && f.contentDocument.readyState === 'complete'; } catch { return false; } });
    if (ok) break; await wait(100);
  }
  for (const s of SEGS) { try { await frames[s.id].contentDocument.fonts.ready; } catch {} }
  while (v.readyState < 2) await wait(50);
  const r = stage.getBoundingClientRect();
  window.__EDS_stageRect = { x: r.left, y: r.top, width: r.width, height: r.height };
  window.__EDS_duration = DATA.duration;
  window.__EDS_renderReady = true;
})();
window.__EDS_renderFrame = async (t) => {
  v.pause();
  if (Math.abs(v.currentTime - t) > 1e-4 || v.readyState < 2) {
    const shown = v.requestVideoFrameCallback ? new Promise((r) => v.requestVideoFrameCallback(() => r())) : null;
    const seeked = new Promise((r) => { v.addEventListener('seeked', () => r(), { once: true }); setTimeout(r, 5000); });
    v.currentTime = t;
    await seeked;
    if (shown) await Promise.race([shown, wait(300)]);
  }
  tick();
  await Promise.all(Object.values(frames).map((f) => f.__p).filter((p) => p && typeof p.then === 'function'));
  await raf(); await raf();
  return v.currentTime;
};
})();
