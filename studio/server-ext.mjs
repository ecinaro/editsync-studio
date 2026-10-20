// EditSync Stüdyo — server extensions (variants, head videos, timing, SFX, waveform, motion-hook injection).
//   GET/POST /api/store/timing|sfx       work/timing.json, work/sfx.json
//   GET      /api/variants               [variant, ...] from work/variants/*.json
//   POST     /api/variants               variant {id, ...} -> work/variants/<id>.json   ·  {id, delete:true} removes it
//   GET      /api/heads                  head videos usable in a variant (work/head_proxy.mp4 + work/heads/*.mp4)
//   GET      /api/browse?dir=            read-only folder listing (dirs + video files) for picking a source
//   POST     /api/heads/import           {path} -> ffmpeg proxy job (1080x1920 H.264, audio + length of head_proxy)
//   POST     /api/heads/upload?name=     raw body (streamed to disk, no size cap) -> same proxy job
//   GET      /api/jobs                   running / finished proxy jobs
//   GET      /api/waveform               peaks of the head_proxy audio (cached in work/waveform.json)
//   POST     /api/sfx/export             work/sfx.json -> SFX-only stem WAV (48 kHz / 24-bit, full video length)
//   GET      /api/still?variant=&t=      1080x1920 PNG of a variant at t (headless Chromium via Playwright) -> work/exports/
//   POST     /api/export                 {variants:[{id,name}], scale:1|2, sfx, subs} -> MP4 jobs (queue, one at a time)
//   GET      /api/export/jobs · POST /api/export/cancel {id}
//   /dist/*.html?...&inject              serves the clip with studio/motion-hook.js loaded first (file on disk untouched)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { makeMusic } from './music-ext.mjs'; // music library + export soundtrack mix

export function makeExt(ROOT, { json, readJ, writeJ }) {
  const W = (...p) => path.join(ROOT, 'work', ...p);
  const HEAD = W('head_proxy.mp4');
  const VIDEO_EXT = /\.(mov|mp4|m4v|mkv|webm|avi)$/i;
  const safeName = (s) => String(s || '').replace(/ı/g, 'i').replace(/İ/g, 'I').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'video';
  const jobs = [];
  let headDur = null;
  const MUSIC = makeMusic(ROOT, { json, readJ, writeJ });

  const probeDur = (f) => new Promise((res) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]);
    let o = ''; p.stdout.on('data', (c) => (o += c)); p.on('close', () => res(Number(o.trim()) || null)); p.on('error', () => res(null));
  });
  const readBody = (req, cb, limit = 8e6) => { const ch = []; let n = 0; req.on('data', (c) => { n += c.length; if (n <= limit) ch.push(c); }); req.on('end', () => { try { cb(JSON.parse(Buffer.concat(ch).toString('utf8') || 'null')); } catch (e) { cb(null, e); } }); };

  async function proxyJob(src, name) {
    headDur = headDur || (await probeDur(HEAD)) || 55.8;
    fs.mkdirSync(W('heads'), { recursive: true });
    let base = safeName(path.basename(name || src).replace(/\.[^.]+$/, '')), out = W('heads', base + '.mp4');
    for (let i = 2; fs.existsSync(out); i++) out = W('heads', `${base}_${i}.mp4`);
    const job = { id: Date.now().toString(36), name: path.basename(out), src: path.basename(src), status: 'çalışıyor', progress: 0, url: '/work/heads/' + path.basename(out) };
    jobs.unshift(job); jobs.length = Math.min(jobs.length, 20);
    // picture from the new file, sound + length from the original head proxy so everything stays in sync
    const args = ['-hide_banner', '-y', '-i', src, '-i', HEAD, '-map', '0:v:0', '-map', '1:a:0',
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '15', '-keyint_min', '15', '-c:a', 'copy', '-t', String(headDur), '-movflags', '+faststart',
      '-progress', 'pipe:1', '-nostats', out + '.part.mp4'];
    const p = spawn('ffmpeg', args); let err = '';
    p.stdout.on('data', (c) => { const m = /out_time_ms=(\d+)/.exec(String(c)); if (m) job.progress = Math.min(0.99, Number(m[1]) / 1e6 / headDur); });
    p.stderr.on('data', (c) => (err = (err + c).slice(-600)));
    p.on('error', (e) => { job.status = 'hata'; job.error = e.message; });
    p.on('close', (code) => {
      if (code === 0) { fs.renameSync(out + '.part.mp4', out); job.status = 'bitti'; job.progress = 1; }
      else { job.status = 'hata'; job.error = err.trim().split('\n').pop(); try { fs.unlinkSync(out + '.part.mp4'); } catch {} }
      if (job.tmp) try { fs.unlinkSync(job.tmp); } catch {}
    });
    return job;
  }

  async function waveform() {
    const F = W('waveform.json'), m = fs.statSync(HEAD).mtimeMs, c = readJ(F, null);
    if (c && c.src === m) return c;
    const rate = 4000, step = 0.025, per = rate * step;
    const pcm = await new Promise((res, rej) => {
      const p = spawn('ffmpeg', ['-v', 'error', '-i', HEAD, '-ac', '1', '-ar', String(rate), '-f', 's16le', '-']); const ch = [];
      p.stdout.on('data', (d) => ch.push(d)); p.on('close', () => res(Buffer.concat(ch))); p.on('error', rej);
    });
    const n = Math.floor(pcm.length / 2), peaks = [];
    for (let i = 0; i < n; i += per) { let mx = 0; for (let j = i; j < Math.min(n, i + per); j++) mx = Math.max(mx, Math.abs(pcm.readInt16LE(j * 2))); peaks.push(Math.round((mx / 32768) * 1000) / 1000); }
    const out = { src: m, step, peaks }; writeJ(F, out); return out;
  }

  async function sfxExport() {
    headDur = headDur || (await probeDur(HEAD)) || 55.8;
    const S = readJ(W('sfx.json'), { items: [] }), items = (S.items || []).filter((x) => !x.mute && x.file && fs.existsSync(path.join(ROOT, x.file)));
    fs.mkdirSync(W('exports'), { recursive: true });
    const name = `sfx_stem_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.wav`, out = W('exports', name);
    const master = Number(S.master ?? 0) || 0;
    // with a video speed the stem follows the OUTPUT timeline: positions / speed, sounds at their natural rate
    const sp = Math.max(0.5, Math.min(2, Number((readJ(W('timing.json'), {}) || {}).speed) || 1)), D = headDur / sp;
    const args = ['-hide_banner', '-v', 'error', '-y'];
    let filter;
    if (!items.length) { args.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`); filter = `[0:a]atrim=0:${D}[out]`; }
    else {
      items.forEach((x) => args.push('-i', path.join(ROOT, x.file)));
      filter = items.map((x, i) => { const ms = Math.max(0, Math.round(((Number(x.t) || 0) / sp) * 1000)), off = Math.max(0, Number(x.offset) || 0);
        return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${off},asetpts=PTS-STARTPTS,volume=${(Number(x.gain) || 0) + master}dB,adelay=${ms}:all=1[a${i}]`; }).join(';')
        + `;${items.map((_, i) => `[a${i}]`).join('')}amix=inputs=${items.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=0:${D}[out]`;
    }
    args.push('-filter_complex', filter, '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s24le', out);
    await new Promise((res, rej) => { const p = spawn('ffmpeg', args); let e = ''; p.stderr.on('data', (c) => (e += c)); p.on('close', (c) => (c === 0 ? res() : rej(new Error(e.trim().split('\n').pop() || 'ffmpeg ' + c)))); p.on('error', rej); });
    return { url: '/work/exports/' + name, items: items.length, duration: D };
  }

  function browse(dir, dirsOnly, kind) {
    const roots = /^win/.test(process.platform) ? 'CDEFGHIJ'.split('').map((d) => d + ':\\').filter((d) => { try { fs.accessSync(d); return true; } catch { return false; } }) : ['/'];
    if (!dir) return { dir: '', parent: null, entries: roots.map((r) => ({ name: r, dir: true, path: r })) };
    const d = path.resolve(dir), entries = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) entries.push({ name: e.name, dir: true, path: full });
      else if (!dirsOnly && (kind === 'audio' ? MUSIC.ANY_AUDIO : VIDEO_EXT).test(e.name)) { let size = 0; try { size = fs.statSync(full).size; } catch {} entries.push({ name: e.name, size, path: full }); }
    }
    entries.sort((a, b) => (b.dir ? 1 : 0) - (a.dir ? 1 : 0) || a.name.localeCompare(b.name, 'tr'));
    const parent = path.dirname(d) === d ? '' : path.dirname(d);
    return { dir: d, parent, entries };
  }

  // still frame of a variant: headless Chromium opens the bare studio (?embed=1&variant=…&still=t) at 1080x1920
  let browserP = null;
  async function getBrowser() {
    if (!browserP) {
      const { createRequire } = await import('node:module');
      const { chromium } = createRequire(path.join(ROOT, 'x.js'))('playwright');
      // installed Chrome / Edge decode H.264 (the head video); Playwright's own Chromium does not
      browserP = chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' })).catch(() => chromium.launch());
      browserP.catch(() => (browserP = null));
    }
    return browserP;
  }
  async function still(port, variant, t) {
    const b = await getBrowser(), page = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    try {
      await page.goto(`http://localhost:${port}/studio/?embed=1&variant=${encodeURIComponent(variant)}&still=${t}`);
      await page.waitForFunction(() => window.__stillReady === true, null, { timeout: 30000 });
      fs.mkdirSync(W('exports'), { recursive: true });
      const name = `still_${safeName(variant)}_${Number(t).toFixed(2)}s.png`;
      await page.locator('#stage').screenshot({ path: W('exports', name) });
      return { url: '/work/exports/' + name };
    } finally { await page.close(); }
  }

  // ---- save to a user-chosen folder (src = file under work/, or text content) ----
  const cleanName = (n) => String(n || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim().slice(0, 140);
  function uniq(f) { if (!fs.existsSync(f)) return f; const e = path.extname(f), b = f.slice(0, -e.length); for (let i = 2; ; i++) { const g = `${b} (${i})${e}`; if (!fs.existsSync(g)) return g; } }
  function saveTo(src, dir, name, overwrite, keepBoth) {
    const nm = cleanName(name); if (!nm) throw new Error('dosya adı boş');
    if (!path.isAbsolute(dir)) throw new Error('klasör tam yol olmalı');
    fs.mkdirSync(dir, { recursive: true });
    let dst = path.join(dir, nm);
    if (fs.existsSync(dst) && !overwrite) { if (!keepBoth) return { exists: true }; dst = uniq(dst); }
    fs.copyFileSync(src, dst); return dst;
  }
  // ---- MP4 export queue: one job at a time; each job = 2 headless pages (frame ranges) -> ffmpeg slices -> concat -> audio mux ----
  const EXP = []; let expRunning = false;
  const ffmpegRun = (args) => new Promise((ok, no) => { const p = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args]); let e = ''; p.stderr.on('data', (c) => (e += c)); p.on('close', (c) => (c === 0 ? ok() : no(new Error(e.trim().split('\n').pop() || 'ffmpeg ' + c)))); p.on('error', no); });
  async function exportJob(job, port) {
    headDur = headDur || (await probeDur(HEAD)) || 55.8;
    // video speed (work/timing.json .speed) changes the OUTPUT: output frame k shows source time a + k/fps*speed
    const speed = Math.max(0.5, Math.min(2, Number((readJ(W('timing.json'), {}) || {}).speed) || 1)), rg = job.range && job.range.length === 2 ? [Math.max(0, +job.range[0]), Math.min(headDur, +job.range[1])] : [0, headDur];
    job.speed = speed;
    const fps = job.fps || 30, N = Math.round(((rg[1] - rg[0]) / speed) * fps), scale = job.scale, W2 = Math.round(1080 * scale / 2) * 2, H2 = Math.round(1920 * scale / 2) * 2;
    const tmp = W('exports', '_tmp_' + job.id); fs.mkdirSync(tmp, { recursive: true });
    job.total = N; job.done = 0; job.status = 'hazırlanıyor'; job.t0 = Date.now();
    const b = await getBrowser();
    const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
    job.ctx = ctx; // cancel closes it, which unblocks any pending page call
    if (job.cancel) { await ctx.close().catch(() => {}); throw new Error('iptal edildi'); }
    // profiled: the frame grab dominates (~180-260 ms with page.screenshot vs ~100 ms with CDP optimizeForSpeed,
    // seek+paint ~45 ms) -> fast CDP capture + 4 parallel pages + x264 veryfast: ~1 min for a 1 min 1080p video
    const WORKERS = Number(process.env.EDS_WORKERS) || 4, slices = [];
    try {
      const pages = await Promise.all(Array.from({ length: WORKERS }, async () => {
        const pg = await ctx.newPage();
        await pg.goto(`http://localhost:${port}/studio/?embed=1&render=1&variant=${encodeURIComponent(job.variant)}${job.subs === false ? '&nosubs=1' : ''}`);
        await pg.waitForFunction(() => window.__EDS_renderReady === true, null, { timeout: 120000 });
        return pg;
      }));
      const clip = await pages[0].evaluate(() => window.__EDS_stageRect);
      job.status = 'kareler';
      await Promise.all(pages.map(async (pg, w) => {
        const a = Math.floor((N * w) / WORKERS), z = Math.floor((N * (w + 1)) / WORKERS), out = path.join(tmp, `slice${w}.mp4`);
        slices[w] = out;
        const ff = spawn('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
          '-vf', `scale=${W2}:${H2}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-r', String(fps), out]);
        const cdp = await ctx.newCDPSession(pg), shotClip = { ...clip, scale: 1 };
        let ferr = ''; ff.stderr.on('data', (c) => (ferr += c)); job.procs.push(ff);
        const closed = new Promise((ok, no) => ff.on('close', (c) => (c === 0 || job.cancel ? ok() : no(new Error('ffmpeg: ' + ferr.trim().split('\n').pop())))));
        for (let i = a; i < z && !job.cancel; i++) {
          await pg.evaluate((t) => window.__EDS_renderFrame(t), rg[0] + (i / fps) * speed + 0.0005);
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, clip: shotClip, optimizeForSpeed: true });
          const jpg = Buffer.from(data, 'base64');
          if (job.cancel || ff.stdin.destroyed) break;
          // a cancelled/killed ffmpeg never emits 'drain': also give up on close/error, or the queue hangs forever
          if (!ff.stdin.write(jpg)) await new Promise((r) => {
            const done = () => { ff.stdin.off('drain', done); ff.stdin.off('close', done); ff.stdin.off('error', done); ff.off('close', done); r(); };
            ff.stdin.on('drain', done); ff.stdin.on('close', done); ff.stdin.on('error', done); ff.on('close', done);
          });
          job.done++;
        }
        try { ff.stdin.end(); } catch {} await closed;
      }));
      if (job.cancel) throw new Error('iptal edildi');
      job.status = 'ses + birleştirme';
      const list = path.join(tmp, 'list.txt');
      fs.writeFileSync(list, slices.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
      const video = path.join(tmp, 'video.mp4');
      await ffmpegRun(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
      // soundtrack in output time: speech (atempo) + SFX + music (ducking) -> amix -> alimiter
      const mixd = await MUSIC.buildAudio({ speed, range: rg, sfx: !!job.sfx, music: job.music !== false, headDur });
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16), out = W('exports', `${safeName(job.name || job.variant)}_${H2}p_${stamp}.mp4`);
      // speech = the ORIGINAL head_proxy audio (never the variant head's own track); SFX stem mixed on top when asked
      try { await ffmpegRun(['-i', video, '-i', mixd.path, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', mixd.duration.toFixed(3), '-movflags', '+faststart', out]); }
      finally { try { fs.unlinkSync(mixd.path); } catch {} }
      job.url = '/work/exports/' + path.basename(out); job.path = out;
      if (job.saveDir) { // copy to the folder the user picked (never overwrite unless they confirmed)
        try { job.saved = saveTo(out, job.saveDir, job.saveName || path.basename(out), job.overwrite, true); } catch (e) { job.saveError = e.message; }
      }
      job.status = 'bitti';
    } finally {
      await ctx.close().catch(() => {});
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  async function pump(port) {
    if (expRunning) return; expRunning = true;
    try {
      for (let j; (j = EXP.find((x) => x.status === 'sırada'));) {
        try { await exportJob(j, port); }
        catch (e) { j.status = j.cancel ? 'iptal' : 'hata'; j.error = e.message; }
        j.procs = []; j.secs = Math.round((Date.now() - j.t0) / 1000);
      }
    } finally { expRunning = false; }
  }

  // returns true when it handled the request
  return function ext(req, res, url, p) {
    if (MUSIC.route(req, res, url, p)) return true;
    if (p === '/api/save' && req.method === 'POST') {
      readBody(req, (o, e) => {
        try {
          if (e || !o || !o.dir || !o.name) throw new Error('klasör ve dosya adı gerekli');
          let src = null;
          if (o.src) { src = path.resolve(ROOT, '.' + decodeURIComponent(String(o.src).split('?')[0])); if (!src.startsWith(W()) || !fs.existsSync(src)) throw new Error('kaynak dosya yok'); }
          else { src = W('exports', '_save_' + Date.now() + '.tmp'); fs.mkdirSync(path.dirname(src), { recursive: true }); fs.writeFileSync(src, String(o.content ?? ''), 'utf8'); }
          const r = saveTo(src, String(o.dir), String(o.name), !!o.overwrite, false);
          if (!o.src) fs.unlinkSync(src);
          if (r && r.exists) return json(res, { ok: false, exists: true });
          json(res, { ok: true, path: r });
        } catch (x) { json(res, { ok: false, error: x.message }, 400); }
      }, 32e6);
      return true;
    }
    if (p === '/api/save/check') { const d = url.searchParams.get('dir') || '', n = cleanName(url.searchParams.get('name')); json(res, { exists: !!(d && n && fs.existsSync(path.join(d, n))) }); return true; }
    if (p === '/api/export' && req.method === 'POST') {
      readBody(req, (o, e) => {
        if (e || !o || !Array.isArray(o.variants) || !o.variants.length) return json(res, { ok: false, error: 'varyant seçilmedi' }, 400);
        const made = o.variants.map((v) => { const j = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), variant: String(v.id || v), name: String(v.name || v.id || v), scale: [1, 4 / 3, 2].find((k) => Math.abs(k - Number(o.scale)) < 0.01) || 1, fps: 30, saveDir: o.saveDir ? String(o.saveDir) : null, saveName: o.variants.length === 1 && o.saveName ? String(o.saveName) : (o.saveNames && o.saveNames[v.id]) || null, overwrite: !!o.overwrite, sfx: !!o.sfx, music: o.music !== false, range: Array.isArray(o.range) ? o.range.map(Number) : null, subs: o.subs !== false, status: 'sırada', done: 0, total: 0, procs: [], created: Date.now() }; EXP.push(j); return j.id; });
        pump(req.socket.localPort); json(res, { ok: true, jobs: made });
      });
      return true;
    }
    if (p === '/api/export/jobs') { json(res, EXP.slice(-20).map(({ procs, ctx, ...j }) => ({ ...j, eta: j.status === 'kareler' && j.done ? Math.round(((Date.now() - j.t0) / j.done) * (j.total - j.done) / 1000) : null }))); return true; }
    if (p === '/api/export/cancel' && req.method === 'POST') {
      readBody(req, (o) => { const j = EXP.find((x) => x.id === (o && o.id)); if (j) { j.cancel = true; if (j.status === 'sırada') j.status = 'iptal'; (j.procs || []).forEach((q) => { try { q.stdin.destroy(); q.kill(); } catch {} }); if (j.ctx) j.ctx.close().catch(() => {}); } json(res, { ok: !!j }); });
      return true;
    }
    if (p === '/api/still') {
      still(req.socket.localPort, url.searchParams.get('variant') || '', Number(url.searchParams.get('t')) || 0)
        .then((r) => json(res, { ok: true, ...r }), (e) => json(res, { ok: false, error: e.message }, 500));
      return true;
    }
    const err = (e, c = 500) => json(res, { ok: false, error: e.message || String(e) }, c);
    const m = /^\/api\/store\/(timing|sfx|music)$/.exec(p);
    if (m) {
      const F = W(m[1] + '.json');
      if (req.method !== 'POST') { json(res, readJ(F, m[1] === 'timing' ? {} : { items: [] })); return true; }
      readBody(req, (o, e) => { if (e || !o || typeof o !== 'object') return err(e || new Error('nesne bekleniyordu'), 400); writeJ(F, o); json(res, { ok: true }); });
      return true;
    }
    if (p === '/api/variants') {
      const D = W('variants');
      if (req.method !== 'POST') {
        let list = []; try { list = fs.readdirSync(D).filter((f) => f.endsWith('.json')).map((f) => readJ(path.join(D, f), null)).filter(Boolean); } catch {}
        json(res, list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'tr'))); return true;
      }
      readBody(req, (o, e) => {
        if (e || !o || !o.id) return err(e || new Error('id gerekli'), 400);
        const F = path.join(D, safeName(o.id) + '.json');
        try { if (o.delete) { try { fs.unlinkSync(F); } catch {} } else writeJ(F, o); json(res, { ok: true }); } catch (x) { err(x); }
      });
      return true;
    }
    if (p === '/api/heads') {
      const list = [{ name: 'Orijinal (head_proxy)', url: '/work/head_proxy.mp4' }];
      try { for (const f of fs.readdirSync(W('heads'))) if (/\.mp4$/i.test(f) && !/\.part\.mp4$/i.test(f)) list.push({ name: f.replace(/\.mp4$/i, ''), url: '/work/heads/' + f }); } catch {}
      json(res, list); return true;
    }
    if (p === '/api/browse') { try { json(res, browse(url.searchParams.get('dir') || '', url.searchParams.has('dirs'), url.searchParams.get('kind'))); } catch (e) { err(e, 400); } return true; }
    if (p === '/api/jobs') { json(res, jobs); return true; }
    if (p === '/api/heads/import' && req.method === 'POST') {
      readBody(req, async (o, e) => {
        try { if (e || !o || !o.path || !fs.existsSync(o.path) || !VIDEO_EXT.test(o.path)) throw new Error('video dosyası bulunamadı'); json(res, { ok: true, job: await proxyJob(o.path) }); }
        catch (x) { err(x, 400); }
      });
      return true;
    }
    if (p === '/api/heads/upload' && req.method === 'POST') {
      fs.mkdirSync(W('heads', '_src'), { recursive: true });
      const nm = safeName(url.searchParams.get('name') || 'video.mov'), tmp = W('heads', '_src', Date.now() + '-' + nm);
      const ws = fs.createWriteStream(tmp); req.pipe(ws);
      ws.on('finish', async () => { try { const job = await proxyJob(tmp, nm); job.tmp = tmp; json(res, { ok: true, job }); } catch (x) { err(x); } });
      ws.on('error', (x) => err(x));
      return true;
    }
    if (p === '/api/waveform') { waveform().then((w) => json(res, w), (e) => err(e)); return true; }
    if (p === '/api/sfx/export' && req.method === 'POST') { sfxExport().then((r) => json(res, { ok: true, ...r }), (e) => err(e)); return true; }
    if (/^\/dist\/[^/]+\.html$/.test(p) && url.searchParams.has('inject')) {
      const f = path.join(ROOT, p);
      if (!fs.existsSync(f)) return false;
      let html = fs.readFileSync(f, 'utf8');
      const tag = '<script src="/studio/motion-hook.js"></script>', i = html.search(/<head[^>]*>/i);
      html = i >= 0 ? html.replace(/<head[^>]*>/i, (h) => h + tag) : tag + html;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return true;
    }
    return false;
  };
}
