/* EditSync Stüdyo — override layer for clip pages (dist/*.html).
   applyOverrides(win, fileOverrides, opts?) paints the user's edits on top of whatever the clip just painted.
   Call it right AFTER every window.__bm.seek(t) — the clip repaints transform/opacity/color each frame and
   this re-asserts the edits, so clip animation keeps working underneath.

   fileOverrides = overrides.json[<dist file name>], e.g. overrides["09-kamera.html"]:
     { "#h2>span:nth-child(1)": { text, translate:[x,y] (clip px), scale, color, font:"oswald"|"serif-italic"|"serif", src } }
   opts.base = URL prefix for root-relative paths ("/work/uploads/…", "/clips/assets/…").
     In the studio (http://localhost) leave it empty. Under file:// pass the motion/ folder as a file URL.

   Offline renderer (tools/browser.mjs opens dist/x.html?render with Puppeteer), e.g.:
     const ov = JSON.parse(fs.readFileSync('work/overrides.json', 'utf8'))[path.basename(file)] || {};
     await page.addScriptTag({ path: 'studio/apply-overrides.js' });
     await page.evaluate((ov, base) => {
       const b = window.__bm, seek0 = b.seek;
       b.seek = async (t) => { const r = await seek0(t); applyOverrides(window, ov, { base }); return r; };
     }, ov, pathToFileURL(path.resolve('.')).href.replace(/\/$/, ''));
     await page.evaluate(() => document.fonts.ready);   // uploaded images / injected fonts
   (wrap BEFORE the first seek so frame 0 is edited too; tools/render_layers.mjs wraps seek the same way). */
(function (root) {
'use strict';
const FONT = {
  oswald: { fam: "'Oswald','EdOswald',sans-serif", style: 'normal', weight: '700', ls: '0' },
  'serif-italic': { fam: "'SS4','EdSerifI',serif", style: 'italic', weight: '500', ls: '-0.02em' },
  serif: { fam: "'EdSerif',serif", style: 'normal', weight: '500', ls: '-0.02em' },
};
const PROPS = ['color', 'font-family', 'font-style', 'font-weight', 'letter-spacing', 'text-transform'];

function ensureFonts(doc, base) {
  if (doc.getElementById('ed-fonts')) return;
  const st = doc.createElement('style'); st.id = 'ed-fonts';
  const ff = (n, f, s) => `@font-face{font-family:'${n}';src:url('${base}/clips/assets/${f}') format('truetype');font-style:${s};font-weight:100 900;font-display:block}`;
  st.textContent = ff('EdOswald', 'oswald.ttf', 'normal') + ff('EdSerif', 'sourceserif4.ttf', 'normal') + ff('EdSerifI', 'sourceserif4-italic.ttf', 'italic');
  (doc.head || doc.documentElement).appendChild(st);
}
const url = (s, base) => (s && s[0] === '/' && s[1] !== '/' ? (base || '') + s : s);

function applyOverrides(win, ov, opts) {
  const doc = win.document, base = (opts && opts.base) || '';
  ov = ov || {};
  ensureFonts(doc, base);
  const S = win.__edState || (win.__edState = new Map()); // element -> {orig text/src, what we set}
  const seen = new Set();
  for (const sel in ov) {
    let el; try { el = doc.querySelector(sel); } catch { el = null; }
    if (!el) continue;
    const o = ov[sel] || {}, st = S.get(el) || { tx: null, src: null, cs: new Set(), disp: null };
    S.set(el, st); seen.add(el);
    // text: only on leaf elements, never through innerHTML
    if (o.text != null && !el.children.length) { if (st.tx == null) st.tx = el.textContent; if (el.textContent !== o.text) el.textContent = o.text; }
    else if (o.text == null && st.tx != null) { el.textContent = st.tx; st.tx = null; }
    // move / scale: independent CSS properties compose with the clip's own inline transform
    const tr = o.translate && (o.translate[0] || o.translate[1]) ? `${(+o.translate[0]).toFixed(2)}px ${(+o.translate[1]).toFixed(2)}px` : '';
    const sc = o.scale != null && Math.abs(o.scale - 1) > 1e-4 ? String(+o.scale) : '';
    if (el.style.translate !== tr) el.style.translate = tr;
    if (el.style.scale !== sc) el.style.scale = sc;
    if ((tr || sc) && st.disp == null) { st.disp = win.getComputedStyle(el).display === 'inline' ? 'inline-block' : ''; if (st.disp) el.style.display = st.disp; }
    // colour + font on the element and its descendants (word spans carry their own classes)
    const want = {};
    if (o.color) want.color = o.color;
    const F = FONT[o.font];
    if (F) Object.assign(want, { 'font-family': F.fam, 'font-style': F.style, 'font-weight': F.weight, 'letter-spacing': F.ls });
    if (F && o.font !== 'oswald') want['text-transform'] = 'none';
    const targets = Object.keys(want).length || st.cs.size ? [el, ...el.querySelectorAll('*')] : [];
    for (const n of targets) for (const p of PROPS) {
      if (want[p]) { if (n.style.getPropertyValue(p) !== want[p] || n.style.getPropertyPriority(p) !== 'important') n.style.setProperty(p, want[p], 'important'); }
      else if (st.cs.has(p) && n.style.getPropertyPriority(p) === 'important') n.style.removeProperty(p);
    }
    st.cs = new Set(Object.keys(want));
    // image swap (object-fit / size stay whatever the clip set)
    if (el.tagName === 'IMG') {
      if (o.src) { if (st.src == null) st.src = el.getAttribute('src'); const u = url(o.src, base); if (el.getAttribute('src') !== u) el.setAttribute('src', u); }
      else if (st.src != null) { el.setAttribute('src', st.src); st.src = null; }
    }
  }
  // selectors that were removed / reset: put the element back
  for (const [el, st] of S) {
    if (seen.has(el)) continue;
    if (st.tx != null) el.textContent = st.tx;
    if (st.src != null) el.setAttribute('src', st.src);
    el.style.translate = ''; el.style.scale = ''; if (st.disp) el.style.display = '';
    for (const n of [el, ...el.querySelectorAll('*')]) for (const p of st.cs) if (n.style.getPropertyPriority(p) === 'important') n.style.removeProperty(p);
    S.delete(el);
  }
}
root.applyOverrides = applyOverrides;
if (typeof module === 'object' && module.exports) module.exports = { applyOverrides };
})(typeof window !== 'undefined' ? window : globalThis);
