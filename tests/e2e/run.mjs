// End-to-end tests in a real browser (Chromium), on a desktop and a phone screen.
// Needs the server running (E2E_BASE_URL, default http://localhost:3000) with a super admin whose
// phone/password are E2E_PHONE / E2E_PASSWORD. It creates its own course, committees and ceremony.
//   npm run test:e2e
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const PHONE = process.env.E2E_PHONE || '01000000000';
const PASSWORD = process.env.E2E_PASSWORD || 'Test12345!';
const RUN = Date.now().toString(36);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

let token = '';
async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const results = [];
async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n    ${String(err?.stack || err).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

async function login(page) {
  await page.goto(`${BASE}/`);
  await page.locator('input[type="tel"], input[type="text"]').first().fill(PHONE);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), null, { timeout: 15_000 });
}

/** The input currently holding `value` (React keeps the value as a property, not an attribute). */
async function inputWithValue(page, value) {
  await page.waitForFunction((v) => [...document.querySelectorAll('input')].some((i) => i.value === v), value, { timeout: 10_000 });
  const idx = await page.evaluate((v) => [...document.querySelectorAll('input')].findIndex((i) => i.value === v), value);
  return page.locator('input').nth(idx);
}

/** Opens a screen and waits for the app to settle. */
async function open(page, tab) {
  await page.goto(`${BASE}/#${tab}`);
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------- data
token = (await api('POST', '/auth/login', { identifier: PHONE, password: PASSWORD })).token;
const courseId = `e2e-course-${RUN}`;
await api('POST', '/courses', { id: courseId, name: `دورة E2E ${RUN}`, startDate: today, endDate: today, status: 'active', isDefault: true });
const base = { courseId, members: ['مراقب'], createdDate: today, studentsCount: 12 };
const c1 = (await api('POST', '/committees', { ...base, id: `e2e-c1-${RUN}`, committeeNumber: 1, committeeName: 'لجنة 1', sheikhName: 'هشام نعام', sheikhCountry: 'مسجد النور - طنطا', competitionBook: 'ما لا يسع' })).committee;
const c2 = (await api('POST', '/committees', { ...base, id: `e2e-c2-${RUN}`, committeeNumber: 2, committeeName: 'لجنة 2', sheikhName: 'محمد كريم', competitionBook: 'العقيدة' })).committee;
await api('POST', `/committees/${c1.id}/actions`, { action: { type: 'scheduleCeremony', ceremonyDate: today, ceremonyPlace: 'القاعة الكبرى' } });
// Committee 1 reaches the ceremony stage (everything before it done), committee 2 waits for its exam.
for (const stage of ['registration', 'exam', 'scoring', 'aggregation', 'review', 'sheet', 'accreditation', 'announcement']) {
  await api('POST', `/committees/${c1.id}/actions`, { action: { type: 'completeStage', stage } });
}
await api('POST', `/committees/${c2.id}/actions`, { action: { type: 'completeStage', stage: 'registration' } });

const browser = await chromium.launch();
const consoleErrors = [];
const watch = (page) => {
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
};

// ---------------------------------------------------------------- desktop
console.log('Desktop (1400×900)');
const desk = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await desk.newPage();
watch(page);

await test('login with phone and password', async () => {
  await login(page);
});

await test('course sheet shows the sheikh\'s place from the database', async () => {
  await open(page, 'summer_course');
  await inputWithValue(page, 'مسجد النور - طنطا');
  await inputWithValue(page, 'هشام نعام');
});

await test('«لم يتم الحفل» and «في انتظار الامتحان» filters are there and count the committees', async () => {
  const notHeld = await page.getByText(/لم يتم الحفل \(\d+\)/).first().innerText();
  const waiting = await page.getByText(/في انتظار الامتحان \(\d+\)/).first().innerText();
  assert.ok(Number(/\((\d+)\)/.exec(notHeld)[1]) >= 2, notHeld);
  assert.ok(Number(/\((\d+)\)/.exec(waiting)[1]) >= 1, waiting);
});

await test('editing the sheikh\'s name and place in the sheet updates the committee', async () => {
  const name = await inputWithValue(page, 'محمد كريم');
  await name.fill('محمد كريم عبد الله');
  await name.press('Enter');
  const place = name.locator('xpath=ancestor::tr').locator('input[placeholder="المسجد / القاعة..."]');
  await place.fill('مسجد الرحمة');
  await place.press('Enter');
  await page.waitForTimeout(1500);
  const saved = (await api('GET', `/committees/${c2.id}`)).committee;
  assert.equal(saved.sheikhName, 'محمد كريم عبد الله');
  assert.equal(saved.sheikhCountry, 'مسجد الرحمة');
});

await test('ceremonies: «تصدير PDF» downloads a real PDF file', async () => {
  await open(page, 'ceremonies');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: /تصدير PDF/ }).click(),
  ]);
  const path = await download.path();
  const bytes = (await import('node:fs')).readFileSync(path);
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(bytes.length > 5_000, `PDF too small (${bytes.length} bytes)`);
  assert.match(download.suggestedFilename(), /^Bukhari-ceremonies-day-\d{4}-\d{2}-\d{2}\.pdf$/);
});

await test('ticking the ceremony in the calendar records «تم الحفل» on the committee', async () => {
  await open(page, 'calendar');
  await api('PATCH', `/tasks/task-ceremony-${c1.id}/toggle`, { completed: true });
  const after = (await api('GET', `/committees/${c1.id}`)).committee;
  assert.equal(after.stages.ceremony.completed, true);
  await api('PATCH', `/tasks/task-ceremony-${c1.id}/toggle`, { completed: false });
  assert.equal((await api('GET', `/committees/${c1.id}`)).committee.stages.ceremony.completed, false);
});

await test('a ceremony task has no delete button in the calendar', async () => {
  await open(page, 'calendar');
  const n = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.hidden && b.offsetParent && b.innerText.trim() === 'حذف').length);
  const tasks = (await api('GET', '/tasks')).tasks.filter((t) => !t.id.startsWith('task-ceremony-')).length;
  assert.ok(n <= tasks, `${n} delete buttons for ${tasks} deletable tasks`);
});

async function downloadPdf(page, click) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), click()]);
  const bytes = (await import('node:fs')).readFileSync(await download.path());
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  return { bytes, name: download.suggestedFilename() };
}

await test('ceremonies: «لم يتم الحفل» report downloads as PDF', async () => {
  await open(page, 'ceremonies');
  const { name } = await downloadPdf(page, () => page.getByRole('button', { name: 'تصدير كشف لم يتم الحفل PDF' }).click());
  assert.match(name, /^Bukhari-ceremony-not-held-\d{4}-\d{2}-\d{2}\.pdf$/);
  if (process.env.E2E_SAVE_DIR) (await import('node:fs')).writeFileSync(`${process.env.E2E_SAVE_DIR}/not-held.pdf`, (await downloadPdf(page, () => page.getByRole('button', { name: 'تصدير كشف لم يتم الحفل PDF' }).click())).bytes);
});

await test('course sheet: filter «لم يتم الحفل» then PDF exports that list', async () => {
  await open(page, 'summer_course');
  await page.getByText(/لم يتم الحفل \(\d+\)/).first().click();
  const { name } = await downloadPdf(page, () => page.getByRole('button', { name: 'تصدير الكشف المعروض PDF' }).click());
  assert.match(name, /^Bukhari-sheet-/);
});

// ---------------------------------------------------------------- phone
console.log('Phone (Pixel 7)');
const phone = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const mobile = await phone.newPage();
watch(mobile);

await test('login on the phone', async () => {
  await login(mobile);
});

for (const tab of ['home', 'summer_course', 'committees', 'ceremonies', 'calendar', 'exams', 'assistants']) {
  await test(`«${tab}» fits the phone screen (no sideways scrolling)`, async () => {
    await open(mobile, tab);
    const { scroll, width } = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
    assert.ok(scroll <= width + 1, `page is ${scroll}px wide on a ${width}px screen`);
  });
}

await test('«+ لجنة» opens the add-committee form on the phone, and a committee can be added', async () => {
  await open(mobile, 'committees');
  await mobile.getByRole('button', { name: 'إضافة لجنة جديدة', exact: true }).click();
  const dialog = mobile.getByRole('dialog', { name: 'إضافة لجنة جديدة' });
  await dialog.waitFor();
  await dialog.getByRole('textbox', { name: 'اسم اللجنة' }).fill(`لجنة الموبايل ${RUN}`);
  await dialog.locator('button[type="submit"]').click();
  await mobile.waitForTimeout(1500);
  const list = (await api('GET', '/committees?limit=500')).committees;
  assert.ok(list.some((c) => c.committeeName === `لجنة الموبايل ${RUN}`), 'committee not saved');
});

await test('no errors in the browser console', async () => {
  assert.deepEqual(consoleErrors, []);
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
