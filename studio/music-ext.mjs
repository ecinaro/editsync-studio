// EditSync Stüdyo — music library + the export audio mix.
//   GET  /api/music                  library: music/library/*.mp3|wav|m4a  (+ title / favourite / duration / mini waveform from index.json)
//   POST /api/music/meta             {file, title?, fav?}
//   POST /api/music/import           {path}  -> copied (mp3/wav) or converted with ffmpeg (-> mp3) into music/library
//   POST /api/music/upload?name=     raw body (dropped file) -> same
// buildAudio({speed, range, sfx, music}) mixes the final soundtrack in OUTPUT time:
//   speech = work/head_proxy.mp4 audio (atempo = video speed, pitch kept) · SFX at t/speed at their natural rate ·
//   music clips (trim in/out, own speed via atempo, loop, fades, gain, master, speech ducking from words.txt) ·
//   amix normalize=0 -> alimiter (no clipping) -> 48 kHz WAV.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function makeMusic(ROOT, { json, readJ, writeJ }) {
  const LIB = path.join(ROOT, 'music', 'library'), IDX = path.join(LIB, 'index.json');
  const W = (...p) => path.join(ROOT, 'work', ...p), HEAD = W('head_proxy.mp4');
  const AUDIO = /\.(mp3|wav|m4a)$/i, ANY_AUDIO = /\.(mp3|wav|m4a|mpeg|mpga|aac|flac|ogg|opus)$/i;
  const safe = (s) => String(s || '').replace(/ı/g, 'i').replace(/İ/g, 'I').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'muzik';
  const run = (args, out) => new Promise((ok, no) => {
    const p = spawn(args[0], args.slice(1)); const ch = []; let e = '';
    p.stdout.on('data', (d) => ch.push(d)); p.stderr.on('data', (c) => (e += c));
    p.on('close', (c) => (c === 0 ? ok(Buffer.concat(ch)) : no(new Error(e.trim().split('\n').pop() || 'ffmpeg ' + c)))); p.on('error', no);
  });
  const dur = async (f) => Number(String(await run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f])).trim()) || 0;
  const readBody = (req, cb) => { const ch = []; req.on('data', (c) => ch.push(c)); req.on('end', () => { try { cb(JSON.parse(Buffer.concat(ch).toString('utf8') || 'null')); } catch (e) { cb(null, e); } }); };

  async function list() {
    fs.mkdirSync(LIB, { recursive: true });
    const idx = readJ(IDX, { files: {} }); idx.files = idx.files || {}; let dirty = false;
    const out = [];
    for (const f of fs.readdirSync(LIB).filter((x) => AUDIO.test(x))) {
      const full = path.join(LIB, f), m = fs.statSync(full).mtimeMs, e = idx.files[f] || (idx.files[f] = {});
      if (e.m !== m || !e.peaks) {
        e.m = m; e.dur = await dur(full).catch(() => 0);
        const pcm = await run(['ffmpeg', '-v', 'error', '-i', full, '-ac', '1', '-ar', '2000', '-f', 's16le', '-']).catch(() => Buffer.alloc(0));
        const n = Math.floor(pcm.length / 2), per = Math.max(1, Math.floor(n / 120)), pk = [];
        for (let i = 0; i < n; i += per) { let mx = 0; for (let j = i; j < Math.min(n, i + per); j++) mx = Math.max(mx, Math.abs(pcm.readInt16LE(j * 2))); pk.push(Math.round((mx / 32768) * 100) / 100); }
        e.peaks = pk; dirty = true;
      }
      out.push({ file: 'music/library/' + f, name: f, title: e.title || f.replace(/\.[^.]+$/, ''), fav: !!e.fav, dur: e.dur, peaks: e.peaks });
    }
    if (dirty) writeJ(IDX, idx);
    return out.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.title.localeCompare(b.title, 'tr'));
  }
  async function importFile(src, name) {
    fs.mkdirSync(LIB, { recursive: true });
    const ext = path.extname(name || src).toLowerCase(), base = safe(path.basename(name || src).replace(/\.[^.]+$/, ''));
    const keep = ext === '.mp3' || ext === '.wav', e2 = keep ? ext : '.mp3';
    let out = path.join(LIB, base + e2); for (let i = 2; fs.existsSync(out); i++) out = path.join(LIB, `${base}_${i}${e2}`);
    if (keep) fs.copyFileSync(src, out);
    else await run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', out]);
    const idx = readJ(IDX, { files: {} }); idx.files = idx.files || {}; idx.files[path.basename(out)] = { title: path.basename(name || src).replace(/\.[^.]+$/, '') }; writeJ(IDX, idx);
    return 'music/library/' + path.basename(out);
  }

  // speech intervals (source seconds) from words.txt: word start -> next word (max 0.6 s), gaps < 0.35 s merged
  function speech() {
    let txt = ''; try { txt = fs.readFileSync(W('words.txt'), 'utf8'); } catch { return []; }
    const t = []; for (const ln of txt.split(/\r?\n/)) { const m = /^\s+([\d.]+)\s+\S/.exec(ln); if (m) t.push(+m[1]); }
    const iv = []; t.forEach((x, i) => { const e = Math.min(t[i + 1] ?? x + 0.6, x + 0.6); const L = iv[iv.length - 1]; if (L && x - L[1] < 0.35) L[1] = Math.max(L[1], e); else iv.push([x, e]); });
    return iv;
  }
  const tempo = (v) => { const f = []; v = Math.max(0.25, Math.min(4, v)); while (v > 2) { f.push('atempo=2'); v /= 2; } while (v < 0.5) { f.push('atempo=0.5'); v /= 0.5; } if (Math.abs(v - 1) > 1e-3) f.push('atempo=' + v.toFixed(4)); return f; };
  const n3 = (x) => (+x).toFixed(3);

  async function buildAudio({ speed = 1, range, sfx = true, music = true, headDur }) {
    const a = range ? range[0] : 0, b = range ? range[1] : headDur, s = speed, L = (b - a) / s;
    const args = ['ffmpeg', '-v', 'error', '-y', '-i', HEAD], f = [], mix = [];
    f.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${n3(a)}:end=${n3(b)},asetpts=PTS-STARTPTS${tempo(s).map((x) => ',' + x).join('')}[sp]`); mix.push('[sp]');
    let k = 1;
    if (sfx) { // natural rate, placed at (t - a) / speed
      const S = readJ(W('sfx.json'), { items: [] }), master = Number(S.master) || 0;
      for (const x of (S.items || []).filter((x) => !x.mute && x.file && fs.existsSync(path.join(ROOT, x.file)))) {
        const st = (x.t - a) / s; if (st > L) continue;
        args.push('-i', path.join(ROOT, x.file));
        f.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${n3(Math.max(0, -st))},asetpts=PTS-STARTPTS,volume=${(Number(x.gain) || 0) + master}dB,adelay=${Math.round(Math.max(0, st) * 1000)}:all=1[x${k}]`);
        mix.push(`[x${k}]`); k++;
      }
    }
    if (music) {
      const M = readJ(W('music.json'), { items: [] }), master = Number(M.master) || 0, mus = [];
      for (const x of (M.items || []).filter((x) => !x.mute && x.file && fs.existsSync(path.join(ROOT, x.file)))) {
        const full = path.join(ROOT, x.file), fd = await dur(full), i0 = Math.max(0, +x.in || 0), i1 = Math.min(fd, x.out != null ? +x.out : fd);
        const cs = Math.max(0.5, Math.min(2, +x.speed || 1)), st = (x.t - a) / s;
        const len = x.loop ? Math.max(0.1, (x.len != null ? +x.len : L - st)) : (i1 - i0) / cs; // clip length in output seconds
        if (st > L || st + len < 0 || i1 <= i0) continue;
        args.push('-i', full);
        const fi = Math.max(0, +x.fadeIn || 0), fo = Math.max(0, +x.fadeOut || 0);
        let c = `[${k}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${n3(i0)}:end=${n3(i1)},asetpts=PTS-STARTPTS`;
        if (x.loop) c += ',aloop=loop=-1:size=2147483647';
        c += tempo(cs).map((y) => ',' + y).join('') + `,atrim=0:${n3(len)},asetpts=PTS-STARTPTS,volume=${(Number(x.gain) || 0) + master}dB`;
        if (fi) c += `,afade=t=in:st=0:d=${n3(fi)}`; if (fo) c += `,afade=t=out:st=${n3(Math.max(0, len - fo))}:d=${n3(fo)}`;
        if (st < 0) c += `,atrim=start=${n3(-st)},asetpts=PTS-STARTPTS`;
        c += `,adelay=${Math.round(Math.max(0, st) * 1000)}:all=1[m${k}]`;
        f.push(c); mus.push(`[m${k}]`); k++;
      }
      if (mus.length) {
        let bus = mus.length > 1 ? `${mus.join('')}amix=inputs=${mus.length}:normalize=0:duration=longest` : `${mus[0]}anull`;
        if (M.duck && M.duck.on) { // speech ducking: smooth envelope (80 ms attack / 300 ms release) built from the word timings
          const D = Math.pow(10, -Math.abs(+M.duck.db || 10) / 20), att = 0.08, rel = 0.3;
          const r = speech().map(([p, q]) => [(p - a) / s, (q - a) / s]).filter(([p, q]) => q > -1 && p < L + 1)
            .map(([p, q]) => `clip((t-${n3(p - att)})/${att},0,1)*clip((${n3(q + rel)}-t)/${rel},0,1)`);
          if (r.length) bus += `,volume='1-${(1 - D).toFixed(4)}*${r.reduce((x, y) => `max(${x},${y})`)}':eval=frame`;
        }
        f.push(bus + '[mus]'); mix.push('[mus]');
      }
    }
    f.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95:level=0,atrim=0:${n3(L)}[out]`);
    fs.mkdirSync(W('exports'), { recursive: true });
    const out = W('exports', `_mix_${Date.now()}.wav`), script = out + '.filter';
    fs.writeFileSync(script, f.join(';\n')); // long ducking expressions: keep them out of the command line
    try { await run([...args, '-/filter_complex', script, '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', out]); }
    finally { try { fs.unlinkSync(script); } catch {} }
    return { path: out, duration: L };
  }

  function route(req, res, url, p) {
    const err = (e, c = 500) => json(res, { ok: false, error: e.message || String(e) }, c);
    if (p === '/api/music') { list().then((l) => json(res, l), (e) => err(e)); return true; }
    if (p === '/api/music/meta' && req.method === 'POST') {
      readBody(req, (o) => {
        if (!o || !o.file) return err(new Error('dosya yok'), 400);
        const idx = readJ(IDX, { files: {} }), k = path.basename(String(o.file)); idx.files = idx.files || {}; const e = idx.files[k] || (idx.files[k] = {});
        if (o.title != null) e.title = String(o.title).slice(0, 120); if (o.fav != null) e.fav = !!o.fav; writeJ(IDX, idx); json(res, { ok: true });
      });
      return true;
    }
    if (p === '/api/music/import' && req.method === 'POST') {
      readBody(req, (o) => {
        if (!o || !o.path || !fs.existsSync(o.path) || !ANY_AUDIO.test(o.path)) return err(new Error('ses dosyası bulunamadı'), 400);
        importFile(o.path).then((file) => json(res, { ok: true, file }), (e) => err(e));
      });
      return true;
    }
    if (p === '/api/music/upload' && req.method === 'POST') {
      const nm = path.basename(String(url.searchParams.get('name') || 'muzik.mp3'));
      if (!ANY_AUDIO.test(nm)) { req.resume(); err(new Error('desteklenmeyen dosya'), 400); return true; }
      fs.mkdirSync(W('exports'), { recursive: true });
      const tmp = W('exports', '_up_' + Date.now() + path.extname(nm)), ws = fs.createWriteStream(tmp); req.pipe(ws);
      ws.on('finish', () => importFile(tmp, nm).then((file) => json(res, { ok: true, file }), (e) => err(e)).finally(() => { try { fs.unlinkSync(tmp); } catch {} }));
      return true;
    }
    return false;
  }
  return { route, buildAudio, ANY_AUDIO };
}
