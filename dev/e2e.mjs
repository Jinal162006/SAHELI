// End-to-end walk through SAHELI's critical workflows in a real browser.
// Development only: needs the API (port 8000), the auth emulator (54321) and Vite (5173).
//
//   node dev/e2e.mjs
//
// Creates throwaway accounts with random emails, and deletes them at the end.

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5173';
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const results = [];
const consoleErrors = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n')[0] });
    console.log(`  FAIL ${name}\n       ${error.message.split('\n').slice(0, 3).join('\n       ')}`);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const password = `Saheli-${randomBytes(8).toString('hex')}`;
const tag = randomBytes(4).toString('hex');
const asha = { email: `asha.${tag}@example.com`, password };
const meera = { email: `meera.${tag}@example.com`, password };

const browser = await chromium.launch({ executablePath, headless: true });

async function newPage(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    permissions: ['geolocation'],
    geolocation: { latitude: 28.6139, longitude: 77.209 },
    acceptDownloads: true,
    ...options.context,
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) consoleErrors.push(msg.text());
  });
  return page;
}

async function signUp(page, user, age) {
  await page.goto(`${BASE}/sign-up`);
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.getByRole('button', { name: age }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/home/);
}

const a = await newPage();
const b = await newPage({ viewport: { width: 390, height: 844 } });

console.log('SAHELI end-to-end');

await step('sign up two accounts', async () => {
  await signUp(a, asha, '18 or older');
  await signUp(b, meera, '13 to 17');
  await a.getByText('What would you like to do?').waitFor();
});

await step('set display name in settings', async () => {
  await a.goto(`${BASE}/settings`);
  await a.fill('#display-name', 'Asha Verma');
  await a.getByRole('button', { name: 'Save', exact: true }).first().click();
  await a.getByRole('button', { name: 'Saved' }).waitFor();
});

await step('add a trusted contact (with validation)', async () => {
  await a.goto(`${BASE}/contacts`);
  await a.getByRole('button', { name: 'Add a trusted contact' }).first().click();
  await a.fill('#c-name', 'Maa');
  await a.fill('#c-phone', '12345');
  await a.getByRole('button', { name: 'Save' }).click();
  await a.getByText('Add the country code, for example +91 98765 43210.').waitFor();
  await a.fill('#c-phone', '98765 43210');
  await a.getByRole('button', { name: 'Save' }).click();
  await a.getByText('+919876543210').waitFor();
});

await step('conversation check: paste, choose sender, explained result', async () => {
  await a.goto(`${BASE}/check/conversation`);
  await a.fill(
    '#conversation',
    'Raj: I love you so much\nMe: ok\nRaj: send me 5000 rs right now please, it is urgent\nRaj: and don\'t tell anyone about us',
  );
  await a.getByRole('button', { name: 'Check this conversation' }).click();
  await a.getByRole('button', { name: 'Me', exact: true }).click();
  await a.getByText('Why SAHELI is concerned').waitFor();
  await a.getByText('Asks for money').waitFor();
  await a.getByText('What you can do').waitFor();
  expect(await a.getByText('High', { exact: true }).count(), 'level badge shows High');
});

await step('save checked conversation to the vault (explicit)', async () => {
  await a.getByRole('button', { name: 'Save to Evidence Vault' }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await a.getByText('Saved to your Evidence Vault.').waitFor();
  await a.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
});

await step('link check flags an impersonation domain', async () => {
  await a.goto(`${BASE}/check/link`);
  await a.fill('#url', 'http://sbi-kyc-update.xyz/login');
  await a.getByRole('button', { name: 'Check link' }).click();
  await a.getByText('High risk', { exact: true }).waitFor();
  await a.getByText('It uses a well-known brand name, but the website does not belong to that brand.').waitFor();
});

await step('photo check finds hidden location and offers a clean copy', async () => {
  await a.goto(`${BASE}/check/image`);
  await a.setInputFiles('input[type=file]', path.join(here, 'fixtures', 'photo-with-location.jpg'));
  await a.getByRole('button', { name: 'Check photo' }).click();
  await a.getByText('The exact place it was taken').waitFor();
  const download = a.waitForEvent('download');
  await a.getByRole('button', { name: 'Download a copy without hidden data' }).click();
  const file = await download;
  expect(/saheli-clean\.(jpg|png)/.test(file.suggestedFilename()), 'clean copy filename');
});

await step('evidence vault: add a note and open it', async () => {
  await a.goto(`${BASE}/vault`);
  await a.getByRole('button', { name: 'Add evidence' }).first().click();
  await a.selectOption('#ev-kind', 'note');
  await a.fill('#ev-title', 'Threat message');
  await a.fill('#ev-notes', 'He said he would post my photos.');
  await a.getByRole('button', { name: 'Save to vault' }).click();
  await a.getByRole('link', { name: /Threat message/ }).click();
  await a.getByText('He said he would post my photos.').waitFor();
});

await step('incident report: create, link evidence, view printable report', async () => {
  await a.goto(`${BASE}/reports/new`);
  await a.selectOption('#r-type', 'sextortion');
  await a.fill('#r-title', 'Instagram blackmail');
  await a.fill('#r-summary', 'Someone threatened to share my photos unless I paid.');
  await a.getByRole('button', { name: 'Add a moment' }).click();
  await a.getByLabel('When').fill('3 March');
  await a.getByLabel('What happened').fill('First threat message received.');
  await a.getByLabel('Threat message').check();
  await a.getByRole('button', { name: 'Save report' }).click();
  await a.waitForURL(/\/reports\/[0-9a-f-]+$/);
  await a.getByText('Prepared by the person reporting, using SAHELI.', { exact: false }).waitFor();
  await a.getByText('First threat message received.').waitFor();
});

await step('hold-to-send SOS starts an emergency with per-contact links', async () => {
  await a.goto(`${BASE}/sos`);
  const button = a.getByRole('button', { name: /Hold for SOS/ });
  await button.waitFor();
  const box = await button.boundingBox();
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.mouse.down();
  await a.waitForTimeout(2400);
  await a.mouse.up();
  await a.getByText('Emergency alert is on').waitFor({ timeout: 10000 });
  await a.getByText('No email saved. Message them from your phone below.', { exact: false }).waitFor();
  const sms = await a.getByRole('link', { name: 'SMS' }).getAttribute('href');
  expect(sms.startsWith('sms:+919876543210?body='), 'SMS link targets the contact');
  const statusLink = decodeURIComponent(sms).match(/https?:\/\/\S+\/s\/[\w-]+/)[0];
  const viewer = await newPage({ context: { permissions: [] } });
  await viewer.goto(statusLink.replace(/^https?:\/\/[^/]+/, BASE));
  await viewer.getByText('Asha started an emergency alert').waitFor();
  await viewer.getByText('Last shared location').waitFor();
  await viewer.context().close();
});

await step('end the emergency', async () => {
  await a.getByRole('button', { name: "I'm safe now" }).click();
  await a.getByRole('dialog').getByRole('button', { name: "I'm safe now" }).click();
  await a.getByText('Emergency alert ended. We are glad you are safe.').waitFor();
});

await step('family link: invite, child previews and consents, guardian view', async () => {
  await a.goto(`${BASE}/family`);
  await a.getByRole('button', { name: 'Invite someone' }).click();
  await a.fill('#invite-name', 'Meera');
  await a.getByRole('button', { name: 'Create invite code' }).click();
  const code = (await a.locator('p.font-mono').innerText()).trim();
  await b.goto(`${BASE}/family`);
  await b.getByRole('button', { name: 'I have a code' }).click();
  await b.fill('#link-code', code);
  await b.getByRole('button', { name: 'Continue' }).click();
  await b.getByText('Asha Verma wants to link with you').waitFor();
  await b.getByText('They will not see your conversations', { exact: false }).waitFor();
  await b.getByRole('button', { name: 'Accept' }).click();
  await b.getByText('Linked. You can end this link at any time.').waitFor();
  await a.getByRole('button', { name: 'Done' }).click();
  await a.reload();
  await a.getByRole('link', { name: /Meera/ }).click();
  await a.getByText('No location shared yet', { exact: false }).waitFor();
});

await step('child checks in with location; guardian sees it', async () => {
  await b.goto(`${BASE}/checkin`);
  await b.getByRole('button', { name: "I'm safe" }).click();
  await b.getByText('Check-in sent.').waitFor();
  await a.reload();
  await a.getByText('from a check-in', { exact: false }).waitFor();
});

await step('watch: pair with a code, send HELP, end from the watch', async () => {
  await a.goto(`${BASE}/devices`);
  await a.getByRole('button', { name: 'Pair a device' }).first().click();
  await a.getByRole('button', { name: 'Create pairing code' }).click();
  const code = (await a.locator('p.font-mono').innerText()).replace('-', '').trim();
  const watch = await newPage({ viewport: { width: 240, height: 280 } });
  await watch.goto(`${BASE}/watch`);
  await watch.fill('#watch-code', code);
  await watch.getByRole('button', { name: 'Pair' }).click();
  await watch.getByText('Hi, Asha').waitFor();
  const help = watch.getByRole('button', { name: /HELP/ });
  const box = await help.boundingBox();
  await watch.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await watch.mouse.down();
  await watch.waitForTimeout(1800);
  await watch.mouse.up();
  await watch.getByText('Alert sent').waitFor();
  await watch.getByRole('button', { name: "I'm safe now" }).click();
  await watch.getByText('Hi, Asha').waitFor();
  await watch.context().close();
});

await step('notifications reach the guardian', async () => {
  await a.goto(`${BASE}/home`);
  await a.getByRole('button', { name: /Notifications/ }).click();
  await a.getByText(/Meera accepted your link|checked in/).first().waitFor();
});

await step('download my data', async () => {
  await a.goto(`${BASE}/settings`);
  const download = a.waitForEvent('download');
  await a.getByRole('button', { name: 'Download my data' }).click();
  expect((await download).suggestedFilename() === 'saheli-my-data.json', 'export filename');
});

await step('delete both accounts', async () => {
  for (const page of [b, a]) {
    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.fill('#delete-type', 'DELETE');
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await page.waitForURL(`${BASE}/`);
  }
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (consoleErrors.length) console.log(`Console errors:\n  ${[...new Set(consoleErrors)].join('\n  ')}`);
process.exit(failed.length ? 1 : 0);
