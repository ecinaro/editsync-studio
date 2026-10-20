/* EditSync Stüdyo — "look" layer for clip pages: colour theme (smart palette mapping), UI surface style, typography.
   applyLook(win, look, opts?) re-styles whatever the clip just painted. Call it right AFTER every __bm.seek(t) (after
   applyOverrides): it first takes back its own previous inline styles, reads the clip's fresh computed colours, maps them,
   and writes the result as inline !important styles. Clip animation (inline colour tweens included) keeps working.
   Photos / videos / canvases are never touched (no CSS filter tricks). Colours an override (overrides.json) set are kept.

   look = { theme: {bg:{white,black,red}, text:{white,black,red}} | null,
            ui:    {preset, radius?, shadow?, border?, texture?} | null,
            type:  {preset, tracking?, case?, weight?} | null }        (null / missing = clip original)
   opts.base = URL prefix for /studio/fonts (empty in the studio; motion/ folder as file URL in a file:// render)

   Render: inject this file + apply-overrides.js, then wrap seek:
     await page.addScriptTag({ path: 'studio/look.js' });
     await page.evaluate((look, base) => { const b = __bm, s0 = b.seek;
       b.seek = async (t) => { const r = await s0(t); applyLook(window, look, { base }); return r; }; }, variant.look, baseUrl);
   (variant.look = the "look" object stored in work/variants/<id>.json; resolveLook() below turns preset names into values) */
(function (root) {
'use strict';

// ---------- presets (shared with the studio UI) ----------
// Role-based themes (at least three separate layers): page = the backdrop (dots kept, recoloured), surface = what light
// cards / panels / pills become, dark = what originally dark cards become, ink / paper = what dark / light text becomes,
// accent = reds. Surfaces sitting on the page are pushed until they reach minC contrast against it (default 1.6).
const THEMES = {
  original: null,
  red:      { name: 'Kırmızı', page: '#FF0000', surface: '#FFFFFF', dark: '#0B0B0B', ink: '#0B0B0B', paper: '#FFFFFF', accent: '#FF0000', dots: 'rgba(40,0,0,.25)' },
  dark:     { name: 'Koyu', page: '#0E0C0C', surface: '#2E2828', dark: '#F2EFEC', ink: '#F2EFEC', paper: '#0B0B0B', accent: '#FF2A2A', dots: 'rgba(255,255,255,.14)' },
  invert:   { name: 'Ters', page: '#000000', surface: '#1F1B1B', dark: '#FFFFFF', ink: '#FFFFFF', paper: '#0B0B0B', accent: '#FF0000', dots: 'rgba(255,255,255,.14)' },
  blackred: { name: 'Siyah·kırmızı', page: '#0B0B0B', surface: '#FFFFFF', dark: '#FF0000', ink: '#0B0B0B', paper: '#FFFFFF', accent: '#FF0000', dots: 'rgba(255,255,255,.14)' },
  cream:    { name: 'Krem', page: '#F4EFE6', surface: '#FFFFFF', dark: '#1A1614', ink: '#1A1614', paper: '#FFFFFF', accent: '#E0301E', dots: 'rgba(26,22,20,.18)',
              minC: 1.0, shadow: '0 2px 0 rgba(26,22,20,.05), 0 26px 60px -24px rgba(26,22,20,.42), 0 0 0 1px rgba(26,22,20,.07)' },
};
const UI = {
  original: null,
  glass:   { name: 'Cam (Apple)', radius: 40, shadow: '0 30px 80px -24px rgba(0,0,0,.35)', border: '1.5px solid rgba(255,255,255,.45)', fill: 'glass' },
  flat:    { name: 'Düz koyu', radius: 28, shadow: 'none', border: 'none', fill: '#161313' },
  outline: { name: 'Çizgi minimal', radius: 24, shadow: 'none', border: '3px solid INK', fill: 'page' },
  soft:    { name: 'Yumuşak (neumorph)', radius: 56, shadow: '22px 22px 48px rgba(0,0,0,.14), -18px -18px 44px rgba(255,255,255,.85)', border: 'none', fill: 'page' },
  paper:   { name: 'Editoryal kâğıt', radius: 6, shadow: '0 2px 0 rgba(0,0,0,.06), 0 24px 60px -24px rgba(0,0,0,.28)', border: '1px solid #E2DACB', fill: '#F4EFE6' },
  brutal:  { name: 'Brütalist', radius: 0, shadow: '18px 18px 0 INK', border: '6px solid INK', fill: 'keep' },
};
const TEXTURES = { original: 'Orijinal', dots: 'Noktalı', flat: 'Düz', grain: 'Grain', grid: 'Izgara' };
const F = (fam, file, style = 'normal') => ({ fam, file, style });
const FONTS = [
  F('EdsInterTight', 'InterTight.ttf'), F('EdsArchivoNarrow', 'ArchivoNarrow.ttf'), F('EdsPlayfair', 'PlayfairDisplay.ttf'), F('EdsPlayfair', 'PlayfairDisplay-Italic.ttf', 'italic'),
  F('EdsDMSerif', 'DMSerifDisplay.ttf'), F('EdsDMSerif', 'DMSerifDisplay-Italic.ttf', 'italic'), F('EdsSpaceGrotesk', 'SpaceGrotesk.ttf'),
  F('EdsInstrument', 'InstrumentSerif.ttf'), F('EdsInstrument', 'InstrumentSerif-Italic.ttf', 'italic'), F('EdsBebas', 'BebasNeue.ttf'),
  F('EdsAnton', 'Anton.ttf'), F('EdsManrope', 'Manrope.ttf'), F('EdsOswald', '../../clips/assets/oswald.ttf'),
  F('EdsSerif', '../../clips/assets/sourceserif4.ttf'), F('EdsSerif', '../../clips/assets/sourceserif4-italic.ttf', 'italic'),
];
// roles: display (Anton/Oswald/Bebas…), serif (Source Serif…), ui (Montserrat), body (DM Sans / system)
const TYPE = {
  original: null,
  swiss:    { name: 'Swiss · Inter Tight', display: ['EdsInterTight', 800, 'none', '-0.035em'], serif: ['EdsInstrument'], ui: ['EdsInterTight', 700], body: ['EdsInterTight'] },
  condensed:{ name: 'Kondanse · Bebas', display: ['EdsBebas', 400, 'uppercase', '0.01em'], ui: ['EdsArchivoNarrow', 700], body: ['EdsManrope'] },
  editorial:{ name: 'Editoryal · Playfair', display: ['EdsPlayfair', 800, 'none', '-0.02em'], serif: ['EdsPlayfair'], ui: ['EdsManrope', 700], body: ['EdsManrope'] },
  grotesk:  { name: 'Grotesk · Space', display: ['EdsSpaceGrotesk', 700, 'none', '-0.045em'], serif: ['EdsInstrument'], ui: ['EdsSpaceGrotesk', 600], body: ['EdsSpaceGrotesk'] },
  dmserif:  { name: 'Klasik · DM Serif', display: ['EdsDMSerif', 400, 'none', '-0.01em'], serif: ['EdsDMSerif'], ui: ['EdsManrope', 700], body: ['EdsManrope'] },
  instrument:{ name: 'Instrument Serif', display: ['EdsInstrument', 400, 'none', '-0.02em'], serif: ['EdsInstrument'], ui: ['EdsInterTight', 600], body: ['EdsInterTight'] },
  oswald:   { name: 'Oswald + Serif', display: ['EdsOswald', 700, 'uppercase', '0'], serif: ['EdsSerif'], ui: ['EdsOswald', 600], body: ['EdsManrope'] },
  anton:    { name: 'Anton + Inter', display: ['EdsAnton', 400, 'uppercase', '0.005em'], serif: ['EdsInstrument'], ui: ['EdsInterTight', 700], body: ['EdsInterTight'] },
};

// ---------- colour helpers ----------
const parse = (s) => {
  let m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(s || '');
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4]];
  m = /^#([0-9a-f]{3,8})$/i.exec((s || '').trim());
  if (m) { let h = m[1]; if (h.length < 6) h = [...h].map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1]; }
  return null;
};
const css = (c) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+c[3].toFixed(3)})`;
const mix = (a, b, u) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * u);
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const BLACK = [11, 11, 11], WHITE = [255, 255, 255];
function kind(c) { // 'neutral' (with HSL lightness L) | 'red' | 'other'
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), L = (mx + mn) / 510, d = mx - mn;
  const S = d === 0 ? 0 : d / 255 / (1 - Math.abs(2 * L - 1) || 1);
  let h = 0; if (d) { if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6; else if (mx === c[1]) h = (c[2] - c[0]) / d + 2; else h = (c[0] - c[1]) / d + 4; h *= 60; if (h < 0) h += 360; }
  if (S < 0.2 || d < 28) return { k: 'neutral', L };
  if ((h <= 20 || h >= 335) && S >= 0.45) return { k: 'red', L };
  return { k: 'other', L };
}
const redRamp = (A, L) => (L <= 0.5 ? mix(BLACK, A, Math.min(1, L / 0.5)) : mix(A, WHITE, (L - 0.5) / 0.5));
// role: 'page' | 'surface' | 'text'. Other hues (photos, logos, brand colours) are untouched.
function mapColor(c, pal, role = 'surface') {
  if (!c || c[3] === 0 || !pal) return c;
  const q = kind(c);
  if (q.k === 'red') return [...redRamp(pal.accent, q.L), c[3]];
  if (q.k !== 'neutral') return c;
  if (role === 'page') return [...pal.page, c[3]];
  if (role === 'text') return [...mix(pal.ink, pal.paper, q.L), c[3]];
  if (c[3] < 0.9) return c; // translucent neutral layers are scrims / shades over photos: keep them as they are
  // surfaces: light ones become the theme surface (inner boxes keep a slight tone toward the ink), dark ones the "dark" layer
  return [...(q.L >= 0.5 ? mix(pal.surface, pal.ink, (1 - q.L) * 0.9) : mix(pal.dark, pal.surface, q.L * 0.6)), c[3]];
}
// shadows: neutral (dark) shadows stay shadows on any theme, only red glows follow the palette
const isNeutral = (c) => !c || Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 28;
const mapShadow = (s, pal) => (pal && s && s !== 'none' ? s.replace(/rgba?\([^)]*\)/g, (m) => { const c = parse(m); return isNeutral(c) ? m : css(mapColor(c, pal)); }) : s);
const mapStr = (s, pal, role) => (pal && s && s !== 'none' ? s.replace(/rgba?\([^)]*\)/g, (m) => css(mapColor(parse(m), pal, role))) : s);
function palette(theme) {
  if (!theme) return null;
  let t = theme;
  if (t.bg && t.text && !t.page) { // older 6-colour palettes ({bg:{white,black,red}, text:{…}}): same idea, surfaces derived
    const page = parse(t.bg.white), darkPage = lum(page) < 0.3;
    t = { page: t.bg.white, dark: t.bg.black, accent: t.text.red || t.bg.red, ink: t.text.black, paper: t.text.white, surface: darkPage ? '#2E2828' : '#FFFFFF' };
  }
  const P = (k, d) => (parse(t[k] || d) || parse(d)).slice(0, 3);
  const pal = { page: P('page', '#FFFFFF'), surface: P('surface', '#FFFFFF'), dark: P('dark', '#0B0B0B'), ink: P('ink', '#0B0B0B'), paper: P('paper', '#FFFFFF'), accent: P('accent', '#FF0000'),
    minC: t.minC ?? 1.6, shadow: t.shadow || null };
  const dl = lum(pal.page) < 0.25; // dots: elegant contrast on the page tone
  pal.dots = t.dots || (dl ? 'rgba(255,255,255,.14)' : kind([...pal.page, 1]).k === 'red' ? 'rgba(40,0,0,.25)' : 'rgba(0,0,0,.18)');
  // surfaces must separate from the page: push the surface tone away from the page until minC is reached
  for (const k of ['surface', 'dark']) {
    let c = pal[k], i = 0; const to = lum(pal.page) < 0.4 ? WHITE : BLACK;
    while (contrast(c, pal.page) < pal.minC && i++ < 40) c = mix(c, to, 0.06);
    pal[k] = c;
  }
  pal.cands = [pal.ink, pal.paper, pal.accent, BLACK, WHITE];
  return pal;
}

// ---------- injected sheet: fonts + things inline styles cannot reach (pseudo-elements) ----------
function sheet(doc, base, look, pal) {
  let st = doc.getElementById('eds-look');
  if (!st) { st = doc.createElement('style'); st.id = 'eds-look'; (doc.head || doc.documentElement).appendChild(st); }
  const fonts = look.type ? FONTS.map((f) => `@font-face{font-family:'${f.fam}';src:url('${base}/studio/fonts/${f.file}') format('truetype');font-style:${f.style};font-weight:100 900;font-display:block}`).join('') : '';
  const w = pal ? css([...pal.page, 1]).replace(/,1\)$/, ',') : null;
  const vign = pal ? `.bm-dots::after{background:radial-gradient(75% 55% at 50% 45%,${w}0) 40%,${w}.7) 100%)!important}` : ''; // softer than the original .92 so the dots stay visible
  const tex = look.ui && look.ui.texture === 'flat' ? '.bm-dots::after{display:none!important}' : '';
  const txt = fonts + vign + tex;
  if (st.textContent !== txt) st.textContent = txt;
}

const SKIP = /^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|SOURCE|SCRIPT|STYLE|LINK|META)$/;
const SURF = /surface|card|tile|mod|island|glass|paper|phone|panel|box|pill|sheet|bubble|dcard|scr/i;
const famRole = (ff) => {
  const f = (ff || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
  if (/^(anton|oswald|bebas|edsoswald|edsanton|edsbebas|archivo)/.test(f)) return 'display';
  if (/^(ss4|source serif|edsserif|serif|playfair|dm serif|instrument|edsserifi)/.test(f)) return 'serif';
  if (/^(montserrat)/.test(f)) return 'ui';
  return 'body';
};

function applyLook(win, look, opts) {
  const doc = win.document, base = (opts && opts.base) || '';
  const St = win.__edsLook || (win.__edsLook = { set: new Map() });
  // 1. take back what we wrote last time (unless the clip has since written its own value)
  for (const [el, rec] of St.set) for (const p in rec) {
    const r = rec[p]; if (el.style.getPropertyValue(p) !== r.mine || el.style.getPropertyPriority(p) !== 'important') continue;
    if (r.orig) el.style.setProperty(p, r.orig, r.pri); else el.style.removeProperty(p); // give the clip its own inline value back
  }
  St.set.clear();
  const L = look || {}, pal = palette(L.theme), ui = L.ui && UI[L.ui.preset] ? { ...UI[L.ui.preset], ...L.ui } : L.ui && L.ui.preset === 'original' ? { texture: L.ui.texture } : L.ui || null;
  const tp = L.type && TYPE[L.type.preset] ? { ...TYPE[L.type.preset], ...L.type } : L.type && (L.type.tracking || L.type.case || L.type.weight) ? { ...L.type } : null;
  if (!pal && !ui && !tp) { const s = doc.getElementById('eds-look'); if (s) s.textContent = ''; return; }
  sheet(doc, base, { ...L, type: tp }, pal);
  const rootEl = doc.querySelector('.bm-canvas, .bm-edit') || doc.body;
  const ov = win.__edState; // overrides.json state (apply-overrides.js): keep colours the user set by hand
  const els = [...rootEl.querySelectorAll('*')].filter((e) => !SKIP.test(e.tagName) && !e.closest('.bm-pointer'));
  // 2. read everything first (one style recalculation)
  const R = els.map((el) => {
    const cs = win.getComputedStyle(el), svg = el instanceof win.SVGElement;
    return { el, svg, color: cs.color, bg: cs.backgroundColor, bgi: cs.backgroundImage, bc: cs.borderTopColor, bw: parseFloat(cs.borderTopWidth) || 0,
      sh: cs.boxShadow, tsh: cs.textShadow, stroke: cs.webkitTextStrokeColor, deco: cs.textDecorationColor, fill: svg ? cs.fill : null, sstroke: svg ? cs.stroke : null,
      rad: parseFloat(cs.borderTopLeftRadius) || 0, w: el.offsetWidth || 0, h: el.offsetHeight || 0, ff: cs.fontFamily, fst: cs.fontStyle, fw: cs.fontWeight,
      own: [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()), cls: typeof el.className === 'string' ? el.className : '',
      keepColor: !!(ov && ov.get(el) && ov.get(el).cs && ov.get(el).cs.has('color')),
      // a text-less layer next to a photo / video (shade, tint, frame fill): part of the picture, not UI
      scrim: !/^(IMG|VIDEO|CANVAS)$/.test(el.tagName) && ((!el.textContent.trim() && !!(el.parentElement && el.parentElement.querySelector(':scope > img, :scope > video, :scope > canvas'))) || (!el.textContent.trim() || !!el.querySelector(':scope > img, :scope > video, :scope > canvas')) && [...el.querySelectorAll('img, video, canvas')].some((m) => m.offsetWidth * m.offsetHeight >= 0.6 * el.offsetWidth * el.offsetHeight)) }; // photo frames too (their colour shows through cross-fades)
  });
  const out = new Map(), put = (el, p, v) => { if (v == null) return; (out.get(el) || out.set(el, {}).get(el))[p] = v; };
  const finalBg = new Map(); // el -> [r,g,b,a] after theme + ui
  const ink = pal ? css([...pal.ink, 1]) : '#0B0B0B';
  const pageEl = R.find((r) => /bm-backdrop/.test(r.cls));
  const pageBgOf = () => (pageEl ? finalBg.get(pageEl.el) : null), pageSet = new Set();
  const isPage = (r) => /bm-backdrop|bm-stage|\bsm-bg\b/.test(r.cls) || (r.w >= 1300 && r.h >= 2300) || (pageEl && pageEl.el.contains(r.el));
  // 3a. backgrounds: page vs surfaces, dots kept, surfaces separated from the page, then UI presets
  for (const r of R) {
    let bg = parse(r.bg);
    const page = pal && isPage(r), backdrop = /bm-backdrop/.test(r.cls), role = page ? 'page' : 'surface';
    if (page) pageSet.add(r.el);
    if (pal && bg && bg[3] > 0 && !(r.scrim && !page && kind(bg).k === 'neutral')) {
      bg = mapColor(bg, pal, role);
      if (!page && bg[3] > 0.6 && r.w >= 60 && r.h >= 30) {
        // sits right on the page (no surface in between)? then it must stand out from it
        let parentBg = null, host = null; for (let n = r.el.parentElement; n && n !== rootEl.parentElement; n = n.parentElement) { const x = finalBg.get(n); if (x && x[3] > 0.5) { parentBg = x; host = n; break; } }
        const onPage = !host || pageSet.has(host);
        const under = parentBg || [...pal.page, 1];
        if (onPage && contrast(bg, under) < pal.minC) {
          const c = [pal.surface, pal.dark, pal.paper, pal.ink].find((x) => contrast(x, under) >= pal.minC) || pal.surface;
          bg = [...c, bg[3]];
        }
        if (pal.shadow && onPage && r.w >= 140 && r.h >= 60 && kind(parse(r.bg)).L >= 0.5) put(r.el, 'box-shadow', pal.shadow);
      }
      put(r.el, 'background-color', css(bg));
    }
    if (backdrop && ui && ui.texture && ui.texture !== 'original') {
      const B = bg || [255, 255, 255, 1], dark = lum(B) < 0.3 ? WHITE : BLACK;
      const dot = pal ? pal.dots : css([...mix(B, dark, 0.18), 1]), line = css([...mix(B, dark, 0.08), 1]);
      put(r.el, 'background-image', { dots: `radial-gradient(circle,${dot} 2.4px,transparent 3px)`, flat: 'none',
        grain: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        grid: `linear-gradient(${line} 2px,transparent 2px),linear-gradient(90deg,${line} 2px,transparent 2px)` }[ui.texture]);
      put(r.el, 'background-size', ui.texture === 'grid' ? '96px 96px' : ui.texture === 'dots' ? '40px 40px' : ui.texture === 'grain' ? '260px 260px' : null);
    } else if (pal && backdrop && /radial-gradient/.test(r.bgi || '')) {
      put(r.el, 'background-image', `radial-gradient(circle,${pal.dots} 2.4px,transparent 3px)`); // the dot grid, recoloured for the page
    } else if (pal && r.bgi && r.bgi !== 'none' && !/url\(/.test(r.bgi)) put(r.el, 'background-image', mapStr(r.bgi, pal, role));
    if (pal && r.bw > 0) put(r.el, 'border-color', css(mapColor(parse(r.bc), pal, 'surface')));
    if (pal && r.sh && r.sh !== 'none' && mapShadow(r.sh, pal) !== r.sh && !(out.get(r.el) || {})['box-shadow']) put(r.el, 'box-shadow', mapShadow(r.sh, pal));
    // UI surface: big, opaque, rounded or shadowed boxes (or clip classes that name a card)
    const surface = ui && ui.fill && !backdrop && !/\bsm-bg\b/.test(r.cls) && r.w >= 140 && r.h >= 60 && bg && bg[3] > 0.6 && (r.rad >= 10 || (r.sh && r.sh !== 'none') || SURF.test(r.cls));
    if (surface) {
      const pageBg = pageBgOf() || (pal ? [...pal.page, 1] : [255, 255, 255, 1]);
      const sub = (s) => s.replace(/INK/g, ink);
      if (ui.fill === 'glass') { bg = [...bg.slice(0, 3), 0.55]; put(r.el, 'backdrop-filter', 'blur(26px) saturate(1.6)'); put(r.el, '-webkit-backdrop-filter', 'blur(26px) saturate(1.6)'); }
      else if (ui.fill === 'page') bg = pageBg;
      else if (ui.fill !== 'keep') bg = pal ? mapColor(parse(ui.fill), pal, 'surface') : parse(ui.fill);
      put(r.el, 'background-color', css(bg));
      const rad = ui.radius != null ? +ui.radius : null; if (rad != null) put(r.el, 'border-radius', rad + 'px');
      const k = ui.shadowK != null ? +ui.shadowK : 1;
      if (ui.shadow != null) put(r.el, 'box-shadow', k === 0 || ui.shadow === 'none' ? 'none' : (/INK/.test(ui.shadow) ? sub(ui.shadow) : mapShadow(ui.shadow, pal)).replace(/(-?\d+(?:\.\d+)?)px/g, (m, n) => +n * k + 'px'));
      if (ui.border != null) { // longhands only, so the next frame can recognise and restore them
        if (ui.border === 'none') put(r.el, 'border-style', 'none');
        else { const [bw, bs, ...bc] = sub(ui.border).split(' '); put(r.el, 'border-width', (ui.borderW != null ? ui.borderW : parseFloat(bw)) + 'px'); put(r.el, 'border-style', bs); put(r.el, 'border-color', pal && !/INK/.test(ui.border) ? css(mapColor(parse(bc.join(' ')), pal, 'surface')) : bc.join(' ')); }
      }
    }
    if (bg) finalBg.set(r.el, bg);
  }
  // 3b. text colours (theme + legibility against the final background)
  if (pal || ui) for (const r of R) {
    if (r.keepColor) continue;
    let c = parse(r.color), b = null, host = null, photoCtx = false;
    if (r.own) { // context of visible text: solid background under it, or video / photo (then neutral text keeps its own colour)
      for (let n = r.el; n && n !== rootEl.parentElement; n = n.parentElement) { const x = finalBg.get(n); if (x && x[3] > 0.5) { b = x; host = n; break; } }
      b = b || pageBgOf();
      if (host) { const tr = r.el.getBoundingClientRect(); photoCtx = [...host.querySelectorAll('img,video,canvas')].some((m) => { const q = m.getBoundingClientRect(); return q.width > 40 && tr.left < q.right && tr.right > q.left && tr.top < q.bottom && tr.bottom > q.top; }); }
    }
    const loose = r.own && (!b || b[3] <= 0.5 || photoCtx) && c && kind(c).k === 'neutral'; // white text over the talking head stays white
    if (pal && c && !loose) { c = mapColor(c, pal, 'text'); put(r.el, 'color', css(c)); }
    if (pal && r.stroke) put(r.el, '-webkit-text-stroke-color', css(mapColor(parse(r.stroke), pal, 'text') || [0, 0, 0, 0]));
    if (pal && r.deco) put(r.el, 'text-decoration-color', css(mapColor(parse(r.deco), pal, 'text') || [0, 0, 0, 0]));
    if (pal && r.tsh && r.tsh !== 'none' && mapShadow(r.tsh, pal) !== r.tsh) put(r.el, 'text-shadow', mapShadow(r.tsh, pal));
    if (pal && r.svg) { if (r.fill && /rgb/.test(r.fill)) put(r.el, 'fill', css(mapColor(parse(r.fill), pal, 'text'))); if (r.sstroke && /rgb/.test(r.sstroke)) put(r.el, 'stroke', css(mapColor(parse(r.sstroke), pal, 'text'))); }
    if (r.own && c && c[3] > 0.3 && !loose) {
      // (b / host / photoCtx computed above)
      const overPhoto = () => photoCtx;
      // text over a photo inside that box: the box colour is hidden behind the picture, leave the text alone
      // (overPhoto: text over a photo inside that box — the box colour is hidden behind the picture)
      // what is really painted under the text (a sliding highlight is often a sibling, not an ancestor)
      const under = () => {
        const tr = r.el.getBoundingClientRect(); if (!tr.width) return null;
        for (const e of doc.elementsFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2)) {
          if (e === r.el || r.el.contains(e)) continue;
          const x = finalBg.get(e); if (x && x[3] > 0.5) return x;
          if (/^(IMG|VIDEO|CANVAS)$/.test(e.tagName)) return 'photo';
        }
        return null;
      };
      if (b && b[3] > 0.5 && contrast(c, b) < 2.4 && !overPhoto()) {
        const u = under(); if (u === 'photo' || (u && contrast(c, u) >= 2.4)) continue;
        if (u) b = u;
        const wasRed = kind(parse(r.color) || [0, 0, 0, 1]).k === 'red';
        const cands = pal ? (wasRed ? [pal.paper, pal.surface, pal.ink, pal.dark] : pal.cands) : [BLACK, WHITE];
        const best = cands.find((x) => contrast(x, b) >= 3) || cands.reduce((x, y) => (contrast(y, b) > contrast(x, b) ? y : x));
        put(r.el, 'color', css([...best.slice(0, 3), c[3]]));
      }
    }
  }  // 3c. typography by role
  if (tp) for (const r of R) {
    if (r.el.closest('.k-odo,.k-slot,.odo,[class*="odo"],[class*="slot"],[class*="roll"]')) continue; // rolling digit columns are sized to their own font's metrics
    const role = famRole(r.ff), spec = tp[role];
    if (spec && spec[0]) put(r.el, 'font-family', `'${spec[0]}',${role === 'serif' ? 'serif' : 'sans-serif'}`);
    if (spec && spec[1]) put(r.el, 'font-weight', String(tp.weight && role === 'display' ? tp.weight : spec[1]));
    else if (tp.weight && role === 'display') put(r.el, 'font-weight', String(tp.weight));
    if (role === 'display') {
      const tr = spec && spec[2], ls = spec && spec[3];
      const cs = tp.case && tp.case !== 'original' ? tp.case : tr; if (cs) put(r.el, 'text-transform', cs);
      if (tp.tracking != null && tp.tracking !== '') put(r.el, 'letter-spacing', (+tp.tracking).toFixed(3) + 'em'); else if (ls != null) put(r.el, 'letter-spacing', ls);
    }
  }
  // 4. write
  for (const [el, rec] of out) {
    const done = {};
    for (const p in rec) {
      const orig = el.style.getPropertyValue(p), pri = el.style.getPropertyPriority(p);
      el.style.setProperty(p, rec[p], 'important');
      done[p] = { mine: el.style.getPropertyValue(p), orig, pri }; // browser-normalised, so the next restore can recognise it
    }
    St.set.set(el, done);
  }
}

const LOOK = { THEMES, UI, TYPE, TEXTURES, FONTS, applyLook, mapColor, parse, css, contrast };
root.applyLook = applyLook; root.EDS_LOOK = LOOK;
if (typeof module === 'object' && module.exports) module.exports = LOOK;
})(typeof window !== 'undefined' ? window : globalThis);
