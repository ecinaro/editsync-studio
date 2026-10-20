// EditSync Stüdyo — Telefon görünümü: Instagram Reels / TikTok arayüzü stage'in üstüne (pointer-events none).
// Drawn on a 1080x1920 viewBox so it scales with the stage. Pure SVG, white with a soft shadow.
(function () {
'use strict';
const F = `font-family="-apple-system,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif" fill="#fff"`;
const T = (x, y, s, w, txt, a = 'start', o = '') => `<text x="${x}" y="${y}" font-size="${s}" font-weight="${w}" text-anchor="${a}" ${o}>${txt}</text>`;
const st = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"';
const status = `<g>${T(78, 74, 40, 600, '9:41')}
  <g transform="translate(860,48)"><rect x="0" y="16" width="9" height="12" rx="2" fill="#fff"/><rect x="14" y="11" width="9" height="17" rx="2" fill="#fff"/><rect x="28" y="6" width="9" height="22" rx="2" fill="#fff"/><rect x="42" y="0" width="9" height="28" rx="2" fill="#fff"/></g>
  <path d="M928 60 a26 26 0 0 1 36 0 M934 67 a17 17 0 0 1 24 0" ${st} stroke-width="5"/><circle cx="946" cy="74" r="4" fill="#fff"/>
  <rect x="984" y="48" width="56" height="28" rx="8" ${st} stroke-width="3" opacity=".9"/><rect x="989" y="53" width="40" height="18" rx="4" fill="#fff"/><rect x="1043" y="57" width="5" height="10" rx="2" fill="#fff" opacity=".9"/></g>`;
const heart = (x, y, s = 1, fill = false) => `<path transform="translate(${x},${y}) scale(${s})" d="M0 -14 C -10 -34 -42 -30 -42 -4 C -42 18 -16 34 0 48 C 16 34 42 18 42 -4 C 42 -30 10 -34 0 -14 Z" ${fill ? 'fill="#fff"' : st + ' stroke-width="6"'}/>`;
const grad = `<defs><linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
  <linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3434"/><stop offset="1" stop-color="#7a6f6f"/></linearGradient>
  <linearGradient id="ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".45" stop-color="#FA7E1E"/><stop offset=".7" stop-color="#D62976"/><stop offset="1" stop-color="#962FBF"/></linearGradient></defs>`;
const avatar = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#av)"/><circle cx="${cx}" cy="${cy - r * 0.18}" r="${r * 0.32}" fill="#c9c1c1"/><path d="M${cx - r * 0.55} ${cy + r * 0.62} a${r * 0.55} ${r * 0.45} 0 0 1 ${r * 1.1} 0" fill="#c9c1c1"/>`;

const REELS = `${grad}<rect width="1080" height="300" fill="url(#gt)"/><rect y="1380" width="1080" height="540" fill="url(#gb)"/>${status}
  <g ${F}>${T(48, 196, 60, 700, 'Reels')}<path d="M232 170 l14 14 l14 -14" ${st} stroke-width="5"/></g>
  <g transform="translate(990,176)"><rect x="-32" y="-22" width="64" height="48" rx="12" ${st} stroke-width="5"/><circle cx="0" cy="2" r="12" ${st} stroke-width="5"/><path d="M-12 -22 l5 -9 h14 l5 9" ${st} stroke-width="5"/></g>
  <g ${F}>
    ${heart(1000, 1262, 1)}${T(1000, 1350, 32, 600, '48,2B', 'middle')}
    <path transform="translate(1000,1440)" d="M30 26 A40 40 0 1 1 38 8 L44 38 Z" ${st} stroke-width="6"/>${T(1000, 1530, 32, 600, '1.204', 'middle')}
    <path transform="translate(1000,1612)" d="M-38 -30 L40 -30 L2 40 L-6 -2 Z M-6 -2 L40 -30" ${st} stroke-width="6"/>${T(1000, 1702, 32, 600, '8.931', 'middle')}
    <circle cx="976" cy="1770" r="6"/><circle cx="1000" cy="1770" r="6"/><circle cx="1024" cy="1770" r="6"/>
    <rect x="968" y="1818" width="64" height="64" rx="12" fill="url(#av)" stroke="#fff" stroke-width="4"/>
    <circle cx="94" cy="1642" r="44" fill="none" stroke="url(#ring)" stroke-width="5"/>${avatar(94, 1642, 37)}
    ${T(156, 1655, 34, 700, 'brainlab.ai')}
    <rect x="352" y="1614" width="150" height="58" rx="14" fill="none" stroke="#fff" stroke-width="2.5" opacity=".9"/>${T(427, 1653, 30, 600, 'Takip et', 'middle')}
    ${T(48, 1742, 32, 400, 'Yapay zeka reklamları insanları geçti mi? Harvard’ın')}
    ${T(48, 1786, 32, 400, '16 milyar gösterimlik çalışmasına baktık… <tspan fill="#d8d2d2" font-weight="600">daha fazla</tspan>')}
    <g transform="translate(48,1838)"><path d="M6 22 V-6 L26 -12 V16" ${st} stroke-width="4"/><circle cx="2" cy="22" r="6"/><circle cx="22" cy="16" r="6"/></g>
    ${T(92, 1864, 28, 500, 'brainlab.ai · Orijinal ses')}
    <g transform="translate(470,1842)"><circle cx="0" cy="0" r="9" ${st} stroke-width="3.5"/><path d="M-16 22 a16 14 0 0 1 32 0" ${st} stroke-width="3.5"/></g>${T(492, 1864, 28, 500, 'eren.cinar')}
  </g>`;

const TIKTOK = `${grad}<rect width="1080" height="280" fill="url(#gt)"/><rect y="1360" width="1080" height="440" fill="url(#gb)"/>${status}
  <g ${F}>
    <g transform="translate(64,190)"><rect x="-22" y="-26" width="44" height="40" rx="8" ${st} stroke-width="4"/>${T(0, 6, 17, 800, 'LIVE', 'middle')}</g>
    ${T(330, 204, 36, 600, 'Keşfet', 'middle', 'opacity=".7"')}${T(540, 204, 36, 600, 'Takip edilenler', 'middle', 'opacity=".7"')}${T(800, 204, 38, 700, 'Sana Özel', 'middle')}
    <rect x="770" y="222" width="60" height="5" rx="2.5"/>
    <g transform="translate(1012,190)"><circle cx="-4" cy="-6" r="20" ${st} stroke-width="5"/><path d="M11 9 L24 22" ${st} stroke-width="6"/></g>
    <circle cx="990" cy="940" r="54" fill="#fff"/>${avatar(990, 940, 50)}<circle cx="990" cy="996" r="20" fill="#FE2C55"/><path d="M980 996 h20 M990 986 v20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    ${heart(990, 1092, 1.05, true)}${T(990, 1180, 30, 700, '312,4B', 'middle')}
    <path transform="translate(990,1268)" d="M-44 -6 C-44 -34 -20 -44 0 -44 C 20 -44 44 -34 44 -6 C 44 22 20 32 0 32 C -6 32 -12 31 -18 29 L-38 40 L-32 20 C-40 13 -44 4 -44 -6 Z" fill="#fff"/>
    <circle cx="972" cy="1262" r="6" fill="#222"/><circle cx="990" cy="1262" r="6" fill="#222"/><circle cx="1008" cy="1262" r="6" fill="#222"/>${T(990, 1346, 30, 700, '2.871', 'middle')}
    <path transform="translate(990,1428)" d="M-30 -40 H30 V44 L0 22 L-30 44 Z" fill="#fff"/>${T(990, 1516, 30, 700, '18,2B', 'middle')}
    <path transform="translate(990,1588)" d="M6 -38 L46 2 L6 40 V18 C-20 18 -36 26 -46 44 C-42 10 -24 -12 6 -16 Z" fill="#fff"/>${T(990, 1680, 30, 700, '9.402', 'middle')}
    <circle cx="990" cy="1736" r="42" fill="#161616"/><circle cx="990" cy="1736" r="42" fill="none" stroke="#3a3a3a" stroke-width="10"/>${avatar(990, 1736, 22)}
    ${T(40, 1572, 36, 700, 'brainlab.ai')}
    ${T(40, 1626, 32, 400, 'Yapay zeka reklamları insanları geçti mi? 🤖')}
    ${T(40, 1670, 32, 400, '#yapayzeka #reklam #harvard <tspan font-weight="700">daha fazla</tspan>')}
    <g transform="translate(40,1716)"><path d="M6 22 V-6 L26 -12 V16" ${st} stroke-width="4"/><circle cx="2" cy="22" r="6"/><circle cx="22" cy="16" r="6"/></g>
    ${T(84, 1742, 30, 500, 'orijinal ses - brainlab.ai')}
  </g>
  <rect y="1790" width="1080" height="130" fill="#000"/>
  <g ${F}>
    <path transform="translate(108,1832)" d="M-26 4 L0 -22 L26 4 V30 H8 V12 H-8 V30 H-26 Z" fill="#fff"/>${T(108, 1896, 22, 600, 'Ana Sayfa', 'middle')}
    <g transform="translate(324,1832)" opacity=".85"><circle cx="-10" cy="-6" r="13" ${st} stroke-width="4"/><path d="M-32 28 a22 18 0 0 1 44 0" ${st} stroke-width="4"/><circle cx="16" cy="-4" r="10" ${st} stroke-width="4"/><path d="M14 18 a20 16 0 0 1 22 10" ${st} stroke-width="4"/></g>${T(324, 1896, 22, 500, 'Arkadaşlar', 'middle', 'opacity=".85"')}
    <rect x="482" y="1810" width="100" height="62" rx="16" fill="#25F4EE"/><rect x="498" y="1810" width="100" height="62" rx="16" fill="#FE2C55"/><rect x="490" y="1810" width="100" height="62" rx="16" fill="#fff"/>
    <path d="M540 1826 v30 M525 1841 h30" stroke="#000" stroke-width="6" stroke-linecap="round"/>
    <g transform="translate(756,1832)" opacity=".85"><rect x="-28" y="-22" width="56" height="48" rx="8" ${st} stroke-width="4"/><path d="M-28 6 h16 l6 10 h12 l6 -10 h16" ${st} stroke-width="4"/></g>${T(756, 1896, 22, 500, 'Gelen Kutusu', 'middle', 'opacity=".85"')}
    <g transform="translate(972,1832)" opacity=".85"><circle cx="0" cy="-8" r="14" ${st} stroke-width="4"/><path d="M-24 28 a24 20 0 0 1 48 0" ${st} stroke-width="4"/></g>${T(972, 1896, 22, 500, 'Profil', 'middle', 'opacity=".85"')}
  </g>`;

const el = $('phone');
function draw() {
  const k = $('phoneK').value, on = $('phoneT').checked;
  el.style.display = on ? 'block' : 'none';
  if (on) el.innerHTML = `<svg viewBox="0 0 1080 1920" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${k === 'tiktok' ? TIKTOK : REELS}</svg>`;
  try { localStorage.setItem('edPhone', JSON.stringify({ on, k })); } catch {}
}
try { const p = JSON.parse(localStorage.getItem('edPhone') || 'null'); if (p) { $('phoneT').checked = !!p.on; $('phoneK').value = p.k || 'reels'; } } catch {}
$('phoneT').onchange = draw; $('phoneK').onchange = draw; draw();
})();
