// Renders SAHELI's PNG icons and social preview image from the SVG mark and brand fonts.
// Writes into frontend/public. Re-run after changing the logo or brand colours.
//
//   node dev/render-assets.mjs

import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'frontend', 'public');
const fonts = path.join(here, '..', 'frontend', 'node_modules', '@fontsource-variable');
const svg = readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const fontFace = (family, file) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2');font-weight:100 900;}`;
const css =
  fontFace('Fraunces', path.join(fonts, 'fraunces', 'files', 'fraunces-latin-full-normal.woff2')) +
  fontFace('Figtree', path.join(fonts, 'figtree', 'files', 'figtree-latin-wght-normal.woff2'));

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();

async function icon(size, file, { padding = 0, background = null } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - padding * 2;
  await page.setContent(
    `<html><body style="margin:0;background:${background ?? 'transparent'}"><div style="padding:${padding}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: path.join(publicDir, file), omitBackground: !background });
  console.log(`wrote ${file}`);
}

await icon(32, 'favicon-32.png');
await icon(180, 'apple-touch-icon.png', { padding: 14, background: '#F8F7FC' });
await icon(192, 'icon-192.png');
await icon(512, 'icon-512.png');
await icon(512, 'icon-maskable-512.png', { padding: 64, background: '#6A2BD9' });

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><head><style>${css}
  body{margin:0;width:1200px;height:630px;background:#F8F7FC;font-family:Figtree;position:relative;overflow:hidden}
  .glow{position:absolute;inset:0;background:radial-gradient(900px 420px at 85% -10%,#DDD3F7,transparent 70%)}
  .wrap{position:relative;padding:84px 96px;display:flex;flex-direction:column;height:100%;box-sizing:border-box}
  .brand{display:flex;align-items:center;gap:20px;font-family:Fraunces;font-weight:600;font-size:44px;letter-spacing:.06em;color:#1E1A2E}
  h1{font-family:Fraunces;font-weight:600;font-size:78px;line-height:1.06;color:#1E1A2E;margin:64px 0 0;max-width:900px;font-variation-settings:'SOFT' 60}
  p{font-size:30px;color:#46405A;margin:28px 0 0;max-width:880px;line-height:1.35}
</style></head><body><div class="glow"></div><div class="wrap">
  <div class="brand">${svg.replace('<svg ', '<svg width="72" height="72" ')}SAHELI</div>
  <h1>Something feels wrong? Let's look at it together.</h1>
  <p>Check a conversation, link or photo for warning signs. Your digital safety companion.</p>
</div></body></html>`);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(publicDir, 'og-image.png') });
console.log('wrote og-image.png');

await browser.close();
