// Development helper: full-page screenshots of SAHELI pages at phone and desktop widths,
// using the locally installed Microsoft Edge (or Chrome) through playwright-core.
//
//   node dev/screenshots.mjs <outDir> <path> [<path> ...]
//   Options via env: WIDTHS=390,1280  SIGNED_IN=1  BASE=http://localhost:5173
//
// Signs in with the first account in dev/.test-accounts.local when SIGNED_IN=1.

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir, ...paths] = process.argv.slice(2);
if (!outDir || !paths.length) {
  console.error('usage: node dev/screenshots.mjs <outDir> <path> [...]');
  process.exit(1);
}
const base = process.env.BASE || 'http://localhost:5173';
const widths = (process.env.WIDTHS || '390,1280').split(',').map(Number);
const signedIn = process.env.SIGNED_IN === '1';
mkdirSync(outDir, { recursive: true });

function credentials() {
  const file = path.join(here, '.test-accounts.local');
  if (!existsSync(file)) throw new Error('No dev/.test-accounts.local file');
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.includes('@') && !l.startsWith('#'));
  const [email, password] = line.trim().split(/\s+/);
  return { email, password };
}

const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const width of widths) {
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport: { width, height: mobile ? 844 : 900 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', (err) => errors.push(String(err)));

    if (signedIn) {
      const { email, password } = credentials();
      await page.goto(`${base}/sign-in`, { waitUntil: 'networkidle' });
      await page.fill('#email', email);
      await page.fill('#password', password);
      await page.click('button[type=submit]');
      await page.waitForURL(/\/home/, { timeout: 15000 });
    }

    for (const p of paths) {
      await page.goto(`${base}${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth <= limit) return null;
        return [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > limit + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
      });
      if (overflow) console.log(`HORIZONTAL OVERFLOW on ${p} at ${width}px:\n  ${overflow.join('\n  ')}`);
      const name =`${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${width}.png`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true });
      console.log(`saved ${name}`);
    }
    if (errors.length) console.log(`console errors at ${width}px:\n  ${errors.join('\n  ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
