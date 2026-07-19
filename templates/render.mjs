import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrateLegacySlide } from './registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

const WIDTH = 1080;
const HEIGHT = 1350;

// ---------------------------------------------------------------- fontes

const FONT_FILES = {
  archivo: { file: 'archivo-black.ttf', family: 'Archivo Black', weight: '400' },
  inter: { file: 'inter-800.ttf', family: 'Inter', weight: '100 900' },
  playfair: { file: 'playfair.ttf', family: 'Playfair Display', weight: '400 900' },
  playfairItalic: { file: 'playfair-italic.ttf', family: 'Playfair Display', weight: '400 900', style: 'italic' },
  caveat: { file: 'caveat.ttf', family: 'Caveat', weight: '400 700' },
};

const fontCache = new Map();
function fontFaceCSS(keys) {
  return keys
    .map((key) => {
      if (!fontCache.has(key)) {
        const f = FONT_FILES[key];
        const b64 = readFileSync(path.join(FONTS_DIR, f.file)).toString('base64');
        fontCache.set(
          key,
          `@font-face { font-family: '${f.family}'; src: url(data:font/ttf;base64,${b64}) format('truetype'); font-weight: ${f.weight}; ${f.style ? `font-style: ${f.style};` : ''} }`
        );
      }
      return fontCache.get(key);
    })
    .join('\n');
}

// ---------------------------------------------------------------- helpers

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphsHtml(text = '', highlight) {
  const paragraphs = String(text).split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      let html = escapeHtml(p).replace(/\n/g, '<br/>');
      if (highlight) {
        const esc = escapeHtml(highlight);
        if (html.includes(esc)) html = html.replace(esc, `<span class="hl">${esc}</span>`);
      }
      return `<p>${html}</p>`;
    })
    .join('\n');
}

function sizeFor(text, steps) {
  const len = String(text || '').length;
  for (const [max, size] of steps) if (len <= max) return size;
  return steps[steps.length - 1][1];
}

const coverSize = (t, mult = 1) =>
  Math.round(sizeFor(t, [[20, 108], [40, 88], [70, 68], [110, 54], [Infinity, 44]]) * mult);
const contentSize = (t, mult = 1) =>
  Math.round(sizeFor(t, [[60, 62], [140, 50], [240, 40], [Infinity, 34]]) * mult);

function baseDoc(bodyInner, styleCSS, fontKeys) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  ${fontFaceCSS(fontKeys)}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  .slide { width: ${WIDTH}px; height: ${HEIGHT}px; position: relative; display: flex; flex-direction: column; }
  ${styleCSS}
</style>
</head>
<body>
${bodyInner}
</body>
</html>`;
}

function inkArrowSVG(color) {
  return `<svg class="doodle" width="180" height="110" viewBox="0 0 180 110" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 20 C 80 10, 130 40, 150 70" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M115 55 L 155 78 L 140 35" stroke="${color}" stroke-width="10" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function thinArrowSVG(color) {
  return `<svg class="doodle" width="220" height="40" viewBox="0 0 220 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 20 H 200 M 182 6 L 204 20 L 182 34" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

const pad2 = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- grid

const GRID_PALETTES = {
  light: { bg: '#ede7d8', grid: '#d9d1ba', text: '#14120d', accent: '#d94a38' },
  dark: { bg: '#111111', grid: '#232323', text: '#f3f1ea', accent: '#e8503f' },
};

function renderGrid(slide, ctx) {
  const p = GRID_PALETTES[slide.variant] || GRID_PALETTES.light;
  const isCover = slide.role === 'cover' || slide.role === 'closing';
  const fontSize = isCover ? coverSize(slide.text) : contentSize(slide.text);

  const css = `
    .slide {
      background-color: ${p.bg};
      background-image:
        linear-gradient(${p.grid} 1px, transparent 1px),
        linear-gradient(90deg, ${p.grid} 1px, transparent 1px);
      background-size: 44px 44px;
      padding: 110px 90px; justify-content: center;
    }
    .badge { position: absolute; top: 80px; left: 90px; font-family: 'Inter', sans-serif; font-weight: 800;
      font-size: 26px; letter-spacing: 2px; text-transform: uppercase; color: ${p.bg};
      background: ${p.text}; padding: 10px 18px; }
    .eyebrow { font-family: 'Inter', sans-serif; font-weight: 800; font-size: 28px; letter-spacing: 2px;
      color: ${p.text}; opacity: .55; margin-bottom: 28px; text-transform: uppercase; }
    .main { font-family: ${isCover ? "'Archivo Black'" : "'Inter'"}, sans-serif; font-weight: 800;
      font-size: ${fontSize}px; line-height: ${isCover ? 1.08 : 1.32}; color: ${p.text};
      ${isCover ? 'text-transform: uppercase;' : ''} }
    .main p + p { margin-top: ${isCover ? 18 : 34}px; }
    .main .hl { background: ${p.accent}; color: ${p.bg}; padding: 0 ${isCover ? 12 : 10}px;
      box-decoration-break: clone; -webkit-box-decoration-break: clone; }
    .signature { position: absolute; left: 90px; bottom: 80px; font-family: 'Archivo Black', sans-serif;
      font-size: 34px; color: ${p.text}; transform: rotate(-2deg); }
    .doodle { position: absolute; right: 70px; bottom: 70px; }
  `;
  const body = `
    <div class="slide">
      ${slide.badge ? `<div class="badge">${escapeHtml(slide.badge)}</div>` : ''}
      ${slide.eyebrow ? `<div class="eyebrow">${escapeHtml(slide.eyebrow)}</div>` : ''}
      <div class="main">${paragraphsHtml(slide.text, slide.highlight)}</div>
      ${slide.signature ? `<div class="signature">${escapeHtml(slide.signature)}</div>` : ''}
      ${slide.decoration === 'arrow' ? inkArrowSVG(p.text) : ''}
    </div>`;
  return baseDoc(body, css, ['archivo', 'inter']);
}

// ---------------------------------------------------------------- editorial

const EDITORIAL_PALETTES = {
  light: { bg: '#f6f3ec', text: '#191714', accent: '#a4432a', rule: '#c4bcab', muted: '#8d8577' },
  dark: { bg: '#171512', text: '#efeae0', accent: '#d98757', rule: '#3a362e', muted: '#8d8577' },
};

function renderEditorial(slide, ctx) {
  const p = EDITORIAL_PALETTES[slide.variant] || EDITORIAL_PALETTES.light;
  const isCover = slide.role === 'cover' || slide.role === 'closing';
  const fontSize = isCover ? coverSize(slide.text, 0.95) : contentSize(slide.text, 0.98);

  const css = `
    .slide { background: ${p.bg}; padding: 90px; }
    .topbar { display: flex; justify-content: space-between; align-items: baseline;
      border-top: 3px solid ${p.text}; padding-top: 22px; }
    .eyebrow { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 24px;
      letter-spacing: 6px; text-transform: uppercase; color: ${p.text}; }
    .pageno { font-family: 'Playfair Display', serif; font-size: 28px; color: ${p.muted};
      font-variant-numeric: lining-nums; }
    .middle { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .badge { font-family: 'Playfair Display', serif; font-size: 120px; color: ${p.accent};
      line-height: 1; margin-bottom: 36px; }
    .badge::after { content: '.'; }
    .main { font-family: 'Playfair Display', serif; font-weight: ${isCover ? 800 : 500};
      font-size: ${fontSize}px; line-height: ${isCover ? 1.12 : 1.38}; color: ${p.text}; }
    .main p + p { margin-top: 34px; }
    .main .hl { font-style: italic; color: ${p.accent}; }
    .bottombar { display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 1px solid ${p.rule}; padding-bottom: 22px; }
    .signature { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 22px;
      letter-spacing: 4px; text-transform: uppercase; color: ${p.muted}; }
    .swipe { font-family: 'Playfair Display', serif; font-style: italic; font-size: 26px; color: ${p.muted}; }
    .doodle { position: absolute; right: 90px; bottom: 160px; }
  `;
  const isLast = ctx.index === ctx.total - 1;
  const body = `
    <div class="slide">
      <div class="topbar">
        <div class="eyebrow">${escapeHtml(slide.eyebrow || '')}</div>
        <div class="pageno">${pad2(ctx.index + 1)} / ${pad2(ctx.total)}</div>
      </div>
      <div class="middle">
        ${slide.badge ? `<div class="badge">${escapeHtml(slide.badge)}</div>` : ''}
        <div class="main">${paragraphsHtml(slide.text, slide.highlight)}</div>
      </div>
      <div class="bottombar">
        <div class="signature">${escapeHtml(slide.signature || '')}</div>
        <div class="swipe">${isLast ? 'fim' : 'continua →'}</div>
      </div>
      ${slide.decoration === 'arrow' ? thinArrowSVG(p.accent) : ''}
    </div>`;
  return baseDoc(body, css, ['playfair', 'playfairItalic', 'inter']);
}

// ---------------------------------------------------------------- scrapbook

const SCRAPBOOK_PALETTES = {
  light: { bg: '#e9e0c9', dot: '#cfc4a6', card: '#fbf8ef', ink: '#26211a', accent: '#c2402e', marker: '#f9df6d' },
  dark: { bg: '#33302a', dot: '#4a463d', card: '#f6f1e2', ink: '#26211a', accent: '#c2402e', marker: '#f9df6d' },
};

function renderScrapbook(slide, ctx) {
  const p = SCRAPBOOK_PALETTES[slide.variant] || SCRAPBOOK_PALETTES.light;
  const isCover = slide.role === 'cover' || slide.role === 'closing';
  // Caveat lê menor — multiplicador maior
  const fontSize = isCover ? coverSize(slide.text, 1.35) : contentSize(slide.text, 1.35);
  const tilt = (ctx.index % 2 === 0 ? -1.4 : 1.2).toFixed(1);

  const css = `
    .slide {
      background-color: ${p.bg};
      background-image: radial-gradient(${p.dot} 3px, transparent 3px);
      background-size: 52px 52px;
      align-items: center; justify-content: center;
    }
    .card { position: relative; width: 860px; min-height: 900px; background: ${p.card};
      transform: rotate(${tilt}deg); padding: 110px 80px 90px;
      box-shadow: 0 18px 45px rgba(0,0,0,.28);
      display: flex; flex-direction: column; justify-content: center; }
    .tape { position: absolute; width: 220px; height: 62px; background: rgba(222, 205, 160, .82);
      box-shadow: 0 3px 8px rgba(0,0,0,.12); }
    .tape.tl { top: -26px; left: 60px; transform: rotate(-8deg); }
    .tape.tr { top: -22px; right: 70px; transform: rotate(6deg); }
    .badge { position: absolute; top: 46px; left: 60px; font-family: 'Caveat', cursive; font-weight: 700;
      font-size: 52px; color: ${p.accent}; border: 4px solid ${p.accent}; border-radius: 50%;
      width: 96px; height: 96px; display: flex; align-items: center; justify-content: center;
      transform: rotate(-7deg); }
    .eyebrow { font-family: 'Caveat', cursive; font-weight: 700; font-size: 40px; color: ${p.accent};
      margin-bottom: 20px; }
    .main { font-family: 'Caveat', cursive; font-weight: 700; font-size: ${fontSize}px;
      line-height: 1.2; color: ${p.ink}; }
    .main p + p { margin-top: 28px; }
    .main .hl { background: linear-gradient(transparent 20%, ${p.marker} 22%, ${p.marker} 88%, transparent 90%);
      padding: 0 8px; }
    .signature { margin-top: 46px; font-family: 'Caveat', cursive; font-size: 44px; color: ${p.ink};
      opacity: .75; transform: rotate(-2deg); }
    .pageno { position: absolute; bottom: 34px; right: 52px; font-family: 'Caveat', cursive;
      font-size: 36px; color: ${p.ink}; opacity: .5; }
    .doodle { position: absolute; right: 46px; bottom: 80px; transform: rotate(12deg); }
  `;
  const body = `
    <div class="slide">
      <div class="card">
        <div class="tape tl"></div>
        <div class="tape tr"></div>
        ${slide.badge ? `<div class="badge">${escapeHtml(slide.badge)}</div>` : ''}
        ${slide.eyebrow ? `<div class="eyebrow">${escapeHtml(slide.eyebrow)}</div>` : ''}
        <div class="main">${paragraphsHtml(slide.text, slide.highlight)}</div>
        ${slide.signature ? `<div class="signature">${escapeHtml(slide.signature)}</div>` : ''}
        <div class="pageno">${ctx.index + 1}/${ctx.total}</div>
        ${slide.decoration === 'arrow' ? inkArrowSVG(p.accent) : ''}
      </div>
    </div>`;
  return baseDoc(body, css, ['caveat']);
}

// ---------------------------------------------------------------- panorâmico

const PANO_PALETTES = {
  dark: {
    stops: ['#0d0b21', '#241b4d', '#1a2a52', '#0f2f3f', '#241b4d', '#0d0b21'],
    glowA: '#e8503f', glowB: '#3f7de8', text: '#f4f2ff', accent: '#ff6a55',
    ghost: 'rgba(255,255,255,0.06)', line: 'rgba(255,106,85,0.55)',
  },
  light: {
    stops: ['#f2ecdc', '#ead9c4', '#e5e0ce', '#f0e3cf', '#ece5d2', '#f2ecdc'],
    glowA: '#e8a83f', glowB: '#d94a38', text: '#1c180f', accent: '#c2402e',
    ghost: 'rgba(0,0,0,0.05)', line: 'rgba(194,64,46,0.5)',
  },
};

// SVG único e largo, compartilhado por todos os slides do carrossel —
// cada slide mostra sua fatia via background-position.
function panoBackgroundSVG(total, p) {
  const W = total * WIDTH;
  const stops = p.stops
    .map((c, i) => `<stop offset="${(i / (p.stops.length - 1)) * 100}%" stop-color="${c}"/>`)
    .join('');
  const glows = [];
  for (let i = 0; i < total; i++) {
    const cx = i * WIDTH + (i % 2 === 0 ? 260 : 820);
    const cy = i % 2 === 0 ? 260 : 1050;
    const which = i % 2 === 0 ? 'ga' : 'gb';
    glows.push(`<circle cx="${cx}" cy="${cy}" r="430" fill="url(#${which})"/>`);
  }
  // linha fluida que atravessa todos os slides
  let d = `M 0 ${HEIGHT * 0.62}`;
  for (let i = 0; i < total; i++) {
    const midX = i * WIDTH + WIDTH / 2;
    const endX = (i + 1) * WIDTH;
    const midY = i % 2 === 0 ? HEIGHT * 0.3 : HEIGHT * 0.85;
    const endY = HEIGHT * 0.62;
    d += ` Q ${midX} ${midY}, ${endX} ${endY}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEIGHT}" viewBox="0 0 ${W} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
      <radialGradient id="ga"><stop offset="0%" stop-color="${p.glowA}" stop-opacity=".33"/><stop offset="100%" stop-color="${p.glowA}" stop-opacity="0"/></radialGradient>
      <radialGradient id="gb"><stop offset="0%" stop-color="${p.glowB}" stop-opacity=".28"/><stop offset="100%" stop-color="${p.glowB}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${HEIGHT}" fill="url(#bg)"/>
    ${glows.join('\n')}
    <path d="${d}" stroke="${p.line}" stroke-width="6" fill="none"/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function renderPano(slide, ctx) {
  // o fundo é contínuo entre os slides, então a paleta é do carrossel
  // inteiro (definida pelo primeiro slide), não de cada slide
  const p = PANO_PALETTES[ctx.baseVariant] || PANO_PALETTES.dark;
  const isCover = slide.role === 'cover' || slide.role === 'closing';
  const fontSize = isCover ? coverSize(slide.text, 0.95) : contentSize(slide.text);
  const bg = panoBackgroundSVG(ctx.total, p);
  const isLast = ctx.index === ctx.total - 1;
  const dots = Array.from({ length: ctx.total }, (_, i) =>
    `<span class="dot${i === ctx.index ? ' on' : ''}"></span>`).join('');

  const css = `
    .slide {
      background-image: ${bg};
      background-size: ${ctx.total * WIDTH}px ${HEIGHT}px;
      background-position: -${ctx.index * WIDTH}px 0;
      padding: 110px 90px; justify-content: center;
    }
    .ghost { position: absolute; right: 30px; bottom: -60px; font-family: 'Archivo Black', sans-serif;
      font-size: 520px; line-height: 1; color: ${p.ghost}; user-select: none; }
    .badge { position: absolute; top: 84px; left: 90px; font-family: 'Inter', sans-serif; font-weight: 800;
      font-size: 24px; letter-spacing: 3px; text-transform: uppercase; color: ${p.text};
      border: 2px solid ${p.accent}; border-radius: 999px; padding: 10px 22px; }
    .eyebrow { font-family: 'Inter', sans-serif; font-weight: 800; font-size: 26px; letter-spacing: 4px;
      text-transform: uppercase; color: ${p.accent}; margin-bottom: 26px; }
    .main { position: relative; font-family: ${isCover ? "'Archivo Black'" : "'Inter'"}, sans-serif;
      font-weight: 800; font-size: ${fontSize}px; line-height: ${isCover ? 1.1 : 1.32};
      color: ${p.text}; ${isCover ? 'text-transform: uppercase;' : ''} }
    .main p + p { margin-top: 30px; }
    .main .hl { color: ${p.accent}; }
    .signature { position: absolute; left: 90px; bottom: 84px; font-family: 'Inter', sans-serif;
      font-weight: 800; font-size: 26px; color: ${p.text}; opacity: .8; }
    .dots { position: absolute; bottom: 92px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: ${p.text}; opacity: .25; display: block; }
    .dot.on { opacity: 1; background: ${p.accent}; }
    .swipe { position: absolute; right: 90px; bottom: 78px; font-family: 'Inter', sans-serif;
      font-weight: 800; font-size: 30px; color: ${p.accent}; }
  `;
  const body = `
    <div class="slide">
      <div class="ghost">${ctx.index + 1}</div>
      ${slide.badge ? `<div class="badge">${escapeHtml(slide.badge)}</div>` : ''}
      ${slide.eyebrow ? `<div class="eyebrow">${escapeHtml(slide.eyebrow)}</div>` : ''}
      <div class="main">${paragraphsHtml(slide.text, slide.highlight)}</div>
      ${slide.signature ? `<div class="signature">${escapeHtml(slide.signature)}</div>` : ''}
      <div class="dots">${dots}</div>
      ${isLast ? '' : '<div class="swipe">→</div>'}
    </div>`;
  return baseDoc(body, css, ['archivo', 'inter']);
}

// ---------------------------------------------------------------- API

const STYLE_RENDERERS = {
  grid: renderGrid,
  editorial: renderEditorial,
  scrapbook: renderScrapbook,
  pano: renderPano,
};

export function renderSlideHTML(slide, ctx = {}) {
  const migrated = migrateLegacySlide(slide);
  const renderer = STYLE_RENDERERS[ctx.style] || renderGrid;
  return renderer(migrated, {
    index: ctx.index ?? 0,
    total: ctx.total ?? 1,
    baseVariant: ctx.baseVariant || 'dark',
  });
}

export const CANVAS = { width: WIDTH, height: HEIGHT };
