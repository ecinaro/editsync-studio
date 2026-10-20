// EditSync Stüdyo — tiny local server for live-previewing motion segments over the talking head.
// usage (from the repo root): npm start  (= node studio/server.mjs)  ->  http://localhost:5176/studio/   (PORT=… to change)
// Serves motion/ statically (with HTTP Range for video), plus:
//   GET  /api/segments       studio/segments.json
//   GET  /api/mtime?f=path   last-modified ms of a file under motion/ (hot reload)
//   GET  /api/notes          work/notes.json
//   POST /api/note           {seg, t, text} -> appended to work/notes.json
//   GET  /api/overrides      work/overrides.json  { "<dist file>": { "<selector>": {text,translate,scale,color,font,src} } }
//   POST /api/overrides      whole object, or {"__patch": {file: {sel: {...}|null}|null}} (null deletes)
//   POST /api/upload?name=   raw body -> work/uploads/<stamp>-<name>, returns {url}
//   GET/POST /api/subtitles  work/subtitles.json
//   GET/POST /api/plan       work/plan.json (plan page)
//   POST /api/undo | /api/redo  düzenleme dosyalarında bir adım geri / ileri (Ctrl+Z / Ctrl+Shift+Z, studio/undo.js)
//   GET  /api/snap?t=        full-res still at t -> <source folder>/KARELER/ (+ work/frames/ copy), returns {path,url}
//   + everything in server-ext.mjs (variants, heads, timing, sfx, waveform, ?inject)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { makeExt } from './server-ext.mjs'; // variants, head videos, timing, SFX, waveform, motion-hook injection

// Optional: EDS_NODE_PATH points at a node_modules folder elsewhere (e.g. when the project lives on a synced drive where
// node_modules cannot be installed). Normally `npm install` in the repo root is enough.
import { createRequire as __cr } from 'node:module';
if (process.env.EDS_NODE_PATH) { process.env.NODE_PATH = process.env.EDS_NODE_PATH; __cr(import.meta.url)('module').Module._initPaths(); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = path.join(ROOT, 'work', 'notes.json');
const PORT = Number(process.env.PORT || 5176);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mov': 'video/quicktime' };

const inside = (p) => { const f = path.resolve(ROOT, '.' + p); return f.startsWith(ROOT) ? f : null; };
const readNotes = () => { try { return JSON.parse(fs.readFileSync(NOTES, 'utf8').replace(/^﻿/, '')); } catch { return []; } };
process.on('uncaughtException', (e) => console.error('hata:', e.message)); // keep serving
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
// small JSON stores under work/ (written without BOM)
const STORE = { overrides: path.join(ROOT, 'work', 'overrides.json'), subtitles: path.join(ROOT, 'work', 'subtitles.json'), plan: path.join(ROOT, 'work', 'plan.json') };
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const rawWrite = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', s, 'utf8'); fs.renameSync(f + '.tmp', f); };
// geri al / yinele: düzenleme dosyalarının (yerleşim, zamanlama, altyazı, SFX, müzik) her yazımından önceki hali saklanır.
// Aynı dosyaya 0.8 sn içinde gelen yazımlar (sürükleme) tek adım sayılır. Plan ve notlar hariç (kendi metin geri almaları var).
const UNDO = [], REDO = [], UNDOABLE = /[\\/](overrides|timing|subtitles|sfx|music)\.json$/;
const snap = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const writeJ = (f, o) => {
  if (UNDOABLE.test(f)) {
    const last = UNDO[UNDO.length - 1], now = Date.now();
    if (!(last && last.f === f && now - last.at < 800)) { UNDO.push({ f, prev: snap(f), at: now }); if (UNDO.length > 200) UNDO.shift(); }
    else last.at = now;
    REDO.length = 0;
  }
  rawWrite(f, JSON.stringify(o, null, 2));
};
const restore = (from, to) => { // bir adımı geri ya da ileri sar
  const e = from.pop(); if (!e) return null;
  to.push({ f: e.f, prev: snap(e.f), at: 0 });
  if (e.prev == null) { try { fs.unlinkSync(e.f); } catch {} } else rawWrite(e.f, e.prev);
  return path.basename(e.f);
};
let ext = null; // set below, after the helpers exist
const body = (req, cb, limit = 64e6) => { const ch = []; let n = 0; req.on('data', (c) => { n += c.length; if (n <= limit) ch.push(c); }); req.on('end', () => cb(Buffer.concat(ch), n > limit)); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  ext = ext || makeExt(ROOT, { json, readJ, writeJ });
  if (ext(req, res, url, p)) return;

  if (p === '/api/segments') {
    try { return json(res, JSON.parse(fs.readFileSync(path.join(ROOT, 'studio', 'segments.json'), 'utf8').replace(/^﻿/, ''))); }
    catch (e) { return json(res, { error: 'segments.json: ' + e.message }, 500); }
  }
  if (p === '/api/mtime') { const f = inside('/' + (url.searchParams.get('f') || '')); try { return json(res, { m: fs.statSync(f).mtimeMs }); } catch { return json(res, { m: 0 }); } }
  if (p === '/api/notes') return json(res, readNotes());
  if ((p === '/api/undo' || p === '/api/redo') && req.method === 'POST') {
    const f = p === '/api/undo' ? restore(UNDO, REDO) : restore(REDO, UNDO);
    return json(res, { ok: !!f, file: f, undo: UNDO.length, redo: REDO.length });
  }
  if (p === '/api/undo') return json(res, { undo: UNDO.length, redo: REDO.length });
  if (p === '/api/note' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const n = JSON.parse(body), notes = readNotes();
        notes.push({ seg: String(n.seg || ''), t: Number(n.t) || 0, text: String(n.text || '').slice(0, 2000), at: new Date().toISOString(), done: false });
        fs.mkdirSync(path.dirname(NOTES), { recursive: true }); fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2));
        json(res, { ok: true, count: notes.length });
      } catch (e) { json(res, { ok: false, error: e.message }, 400); }
    });
    return;
  }
  if (p === '/api/overrides' || p === '/api/subtitles' || p === '/api/plan') { // plan: studio/plan.html (plan notes + second-by-second shot list)
    const k = p.slice(5), F = STORE[k], empty = k === 'overrides' ? {} : null;
    if (req.method !== 'POST') return json(res, readJ(F, empty));
    return body(req, (b) => {
      try {
        const n = JSON.parse(b.toString('utf8') || 'null');
        let out = n;
        if (k === 'overrides' && n && n.__patch) { // merge per file / selector; null deletes
          out = readJ(F, {});
          for (const [file, sels] of Object.entries(n.__patch)) {
            if (sels === null) { delete out[file]; continue; }
            out[file] = out[file] || {};
            for (const [sel, o] of Object.entries(sels)) { if (o === null) delete out[file][sel]; else out[file][sel] = o; }
            if (!Object.keys(out[file]).length) delete out[file];
          }
        }
        if (!out || typeof out !== 'object') throw new Error('nesne bekleniyordu');
        writeJ(F, out); json(res, { ok: true });
      } catch (e) { json(res, { ok: false, error: e.message }, 400); }
    }, 8e6);
  }
  if (p === '/api/snap') { // ?t=sec -> full-res still of the head video at t (from segments.json "source" if set, else the proxy)
    const t = Math.max(0, Number(url.searchParams.get('t')) || 0);
    const seg = readJ(path.join(ROOT, 'studio', 'segments.json'), {});
    const src = seg.source && fs.existsSync(seg.source) ? seg.source : path.join(ROOT, 'work', 'head_proxy.mp4');
    const dir = seg.source && fs.existsSync(seg.source) ? path.join(path.dirname(seg.source), 'KARELER') : path.join(ROOT, 'work', 'frames');
    const name = `kare_${t.toFixed(2).replace('.', '-')}s.png`, out = path.join(dir, name);
    fs.mkdirSync(dir, { recursive: true });
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(3), '-i', src, '-frames:v', '1', out]);
    let err = ''; ff.stderr.on('data', (c) => (err += c));
    ff.on('error', (e) => json(res, { ok: false, error: e.message }, 500));
    ff.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) return json(res, { ok: false, error: err.trim() || 'ffmpeg ' + code }, 500);
      fs.mkdirSync(path.join(ROOT, 'work', 'frames'), { recursive: true }); // browser-servable copy
      const local = path.join(ROOT, 'work', 'frames', name);
      if (local !== out) fs.copyFileSync(out, local);
      json(res, { ok: true, path: out, url: '/work/frames/' + name });
    });
    return;
  }
  if (p === '/api/upload' && req.method === 'POST') {
    return body(req, (b, big) => {
      if (big) return json(res, { ok: false, error: 'dosya çok büyük (64 MB sınırı)' }, 413);
      const nm = String(url.searchParams.get('name') || 'gorsel.png').replace(/[^\w.\-]+/g, '_').slice(-80);
      const rel = `/work/uploads/${Date.now()}-${nm}`;
      try { fs.mkdirSync(path.join(ROOT, 'work', 'uploads'), { recursive: true }); fs.writeFileSync(path.join(ROOT, rel), b); json(res, { ok: true, url: rel }); }
      catch (e) { json(res, { ok: false, error: e.message }, 500); }
    });
  }

  let f = inside(p.endsWith('/') ? p + 'index.html' : p);
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const size = fs.statSync(f).size, type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`EditSync Stüdyo: http://localhost:${PORT}/studio/`));
