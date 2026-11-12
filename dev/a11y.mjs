// Development helper: run axe-core accessibility checks on SAHELI pages (WCAG 2.1 A/AA rules).
//
//   node dev/a11y.mjs            (public pages, then signed-in pages with a throwaway account)
//
// Exits non-zero if any serious or critical violation is found.

import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE || 'http://localhost:5173';
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PUBLIC = ['/', '/sign-in', '/sign-up', '/forgot-password', '/check/conversation', '/check/link', '/check/profile', '/sos', '/help', '/help/private-images', '/privacy', '/terms', '/contact', '/watch', '/s/invalid-token', '/nope'];
const PRIVATE = ['/home', '/check/image', '/companion', '/vault', '/reports', '/reports/new', '/contacts', '/sos', '/meeting', '/family', '/checkin', '/devices', '/settings'];

const browser = await chromium.launch({ executablePath, headless: true });
let serious = 0;

async function audit(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }),
  );
  const important = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  const minor = result.violations.filter((v) => !['serious', 'critical'].includes(v.impact));
  serious += important.length;
  const line = (v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`;
  console.log(`${important.length ? 'FAIL' : 'ok  '} ${path}${important.length || minor.length ? '' : ''}`);
  for (const v of important) console.log(`     ${line(v)}`);
  for (const v of minor) console.log(`     (minor) ${line(v)}`);
}

for (const width of [390, 1280]) {
  console.log(`\n== ${width}px, signed out ==`);
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  for (const path of PUBLIC) await audit(page, path);

  console.log(`\n== ${width}px, signed in ==`);
  await page.goto(`${BASE}/sign-up`);
  await page.fill('#email', `a11y.${randomBytes(4).toString('hex')}@example.com`);
  await page.fill('#password', `Saheli-${randomBytes(8).toString('hex')}`);
  await page.getByRole('button', { name: '18 or older' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/home/);
  for (const path of PRIVATE) await audit(page, path);

  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.fill('#delete-type', 'DELETE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.waitForURL(`${BASE}/`);
  await context.close();
}

await browser.close();
console.log(`\n${serious} serious or critical violation(s)`);
process.exit(serious ? 1 : 0);
