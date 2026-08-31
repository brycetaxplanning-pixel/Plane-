/**
 * Measures the contrast of text as actually rendered, on every screen, in every
 * skin.
 *
 * The chart palettes were validated numerically when they were written, but
 * that checked marks against a surface — not the words on the page. This walks
 * the real DOM, resolves each element's effective background by climbing until
 * it finds an opaque one, and computes the WCAG ratio. Anything a person has to
 * read and cannot is a failure.
 */

import { chromium } from 'playwright';
import { inflateSync } from 'node:zlib';

const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const SKINS = ['Classic', 'Neon Miami', 'Arcade Brawler', 'Shinobi', 'Deployment', 'Ringworld', 'Late Night Set'];
const ROUTES = ['#/', '#/habits', '#/finance', '#/coach?tab=analysis', '#/health', '#/goals', '#/settings'];

const MEASURE = () => {
  // Two forms come back from getComputedStyle: rgb()/rgba(), and the
  // color(srgb r g b / a) form that color-mix() resolves to, whose channels are
  // 0–1 rather than 0–255. Reading only the first silently treats every mixed
  // colour as transparent, which is how a dark button reads as white-on-white.
  const parse = (c) => {
    const srgb = /color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+))?\)/.exec(c);
    if (srgb) {
      return {
        r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255,
        a: srgb[4] === undefined ? 1 : +srgb[4],
      };
    }
    const m = /rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:[,/]\s*([\d.]+))?\)/.exec(c);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  // The first opaque background behind this element, composited through any
  // translucent layers on the way.
  //
  // This resolves flat colours only. A gradient, an image or a filter is not a
  // background *colour*, so an element painted with one comes back reporting
  // `painted: true` and is measured from the rendered pixels instead — see
  // sampleBackdrops below. Without that, a card whose ground is a gradient is
  // measured against the page behind it, and white-on-dark reads as
  // white-on-white at 1.05:1.
  const bgOf = (el) => {
    const layers = [];
    let painted = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') painted = true;
      const c = parse(cs.backgroundColor);
      if (!c || c.a === 0) continue;
      layers.push(c);
      if (c.a === 1) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base);
    return { ...base, painted };
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Skip the visually-hidden heading; it is for screen readers, not eyes.
    if (el.classList.contains('sr-only')) continue;
    // Decorative by declaration: if it is hidden from the accessibility tree it
    // is not something anyone is asked to read.
    if (el.closest('[aria-hidden="true"]')) continue;
    // WCAG 1.4.3 exempts inactive controls, and a disabled button is meant to
    // look unavailable.
    if (el.closest('[disabled], [aria-disabled="true"]')) continue;
    // An emoji is a multicoloured glyph that ignores `color`, so measuring its
    // contrast measures nothing.
    if (!/[\p{L}\p{N}]/u.test(text)) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    // Opacity on this element or any ancestor fades the text against whatever
    // is behind it. Ignoring it reports a watermark as if it were solid.
    let fade = 1;
    for (let n = el; n; n = n.parentElement) fade *= +getComputedStyle(n).opacity;
    fg.a *= fade;
    const bg = bgOf(el);
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const r2 = el.getBoundingClientRect();

    out.push({
      text: text.slice(0, 30),
      cls: (el.className || '').toString().slice(0, 28),
      need,
      size: Math.round(size),
      color: cs.color,
      fg,
      bg: { r: bg.r, g: bg.g, b: bg.b },
      painted: bg.painted,
      // Document space, to line up with a full-page screenshot.
      x: Math.round(r2.left + window.scrollX + r2.width / 2),
      y: Math.round(r2.top + window.scrollY + r2.height / 2),
    });
  }
  return out;
};


/* ------------------------------------------------------------------
   Reading the real pixels.

   A gradient is not a background *colour*, so the DOM walk above cannot see
   it. For any text sitting on one, the page is re-shot with every glyph made
   transparent — leaving only what is painted behind the words — and the
   colour under each label is read straight off that image.

   Decoding is done here rather than with a dependency: a Playwright
   screenshot is always a non-interlaced 8-bit RGBA PNG, which is one inflate
   and one un-filter pass.
------------------------------------------------------------------ */

function decodePng(buf) {
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += len + 12;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unexpected PNG: depth ${bitDepth} type ${colorType} interlace ${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 0xff;
    }
  }
  return { width, height, bpp, data: out };
}

const pixelAt = (img, x, y) => {
  const i = y * img.width * img.bpp + x * img.bpp;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
};

const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lumOf = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const contrast = (a, b) => {
  const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const composite = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
});

/** One shot of the page with every glyph hidden, so the words' own grounds are
 *  visible. Animations are pinned to a fixed time first, or a moving highlight
 *  would land somewhere different on every run. */
async function backdrop(page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { color: transparent !important;'
      + ' -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a.effect?.getTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; }
    }
  });
  const png = await page.screenshot({ fullPage: true });
  await page.evaluate(() => {
    for (const a of document.getAnimations()) if (a.playState === 'paused') a.play();
    for (const s of document.querySelectorAll('style')) {
      if (s.textContent.includes('-webkit-text-fill-color: transparent !important')) s.remove();
    }
  });
  return decodePng(png);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 940 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Load sample data' }).click();
await page.getByRole('button', { name: 'Load it' }).click();
await page.waitForTimeout(600);

for (const skin of SKINS) {
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  const pick = page.getByRole('button', { name: new RegExp(skin) }).first();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.waitForTimeout(350);

  const failures = [];
  for (const route of ROUTES) {
    await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' });
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(450);
    const pop = page.locator('.pop button[aria-label="Close"]').first();
    if (await pop.count()) await pop.click().catch(() => {});

    // The tiles fade in. Measuring mid-animation reads every one of them as
    // fully transparent, so wait for the finite animations to finish — the
    // endless ones, like the cat on the decks, would never resolve.
    await page.evaluate(() => Promise.all(
      document.getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ));

    const found = await page.evaluate(MEASURE);
    const img = found.some((f) => f.painted) ? await backdrop(page) : null;

    for (const f of found) {
      // Where a gradient, image or filter is in play the flat-colour walk is
      // not the truth; the rendered pixel is.
      const bg = f.painted && img && f.x >= 0 && f.y >= 0 && f.x < img.width && f.y < img.height
        ? pixelAt(img, f.x, f.y)
        : f.bg;
      const got = contrast(composite(f.fg, bg), bg);
      if (got < f.need) failures.push({ route, ...f, ratio: Math.round(got * 100) / 100 });
    }
  }

  if (failures.length === 0) {
    ok(`${skin} — every label readable across ${ROUTES.length} screens`);
  } else {
    const worst = failures.sort((a, b) => a.ratio - b.ratio).slice(0, 4);
    bad(skin, worst.map((f) => `"${f.text}" ${f.ratio}:1 (needs ${f.need}) on ${f.route} .${f.cls}`).join(' | '));
  }
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
