import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

// Drives the real UI in Chromium against a running, freshly seeded server.
// Requires Playwright:  npm i -D playwright && npx playwright install chromium
//   npm run db:seed && npm start &
//   npm run test:ui
const BASE = process.env.CRM_URL || 'http://localhost:3100';
const SHOTS = process.env.CRM_SHOTS || 'test/screenshots';
await mkdir(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const failures = [];
const consoleErrors = [];

function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

console.log('\n== landing & login ==');
await page.goto(BASE, { waitUntil: 'networkidle' });
check('landing renders', (await page.locator('h1').innerText()).includes('Every lead worked'));
await page.screenshot({ path: `${SHOTS}/1-landing.png`, fullPage: true });

await page.goto(`${BASE}/login.html`);
await page.fill('#email', 'demo@huntercrm.test');
await page.fill('#password', 'wrongpass');
await page.click('#submit');
await page.waitForSelector('.error-msg.show');
check('bad login shows inline error', (await page.locator('#error').innerText()).includes('Invalid credentials'));
await page.screenshot({ path: `${SHOTS}/2-login-error.png` });

// The deliberate bad login logs an expected 401; everything after this point
// must stay clean.
consoleErrors.length = 0;

await page.fill('#password', 'demo1234');
await page.click('#submit');
await page.waitForURL('**/dashboard.html');
check('login redirects to dashboard', page.url().includes('dashboard.html'));

console.log('\n== dashboard ==');
await page.waitForSelector('#open-total:not(:has-text("—"))');
await page.waitForTimeout(600);
const openTotal = await page.locator('#open-total').innerText();
check('open pipeline rendered', openTotal === '$185,250', `got ${openTotal}`);
const weighted = await page.locator('#weighted-total').innerText();
check('weighted forecast rendered', weighted === '$90,613', `got ${weighted}`);
const won = await page.locator('#won-total').innerText();
check('won this month rendered', won === '$27,000', `got ${won}`);
check('win rate rendered', (await page.locator('#win-rate').innerText()) === '50%');
check('quota bar has width', (await page.locator('#quota-bar').evaluate(el => el.style.width)) === '10.8%');
check('greeting personalised', (await page.locator('#greeting').innerText()) === "Demo's desk");

const taskCount = await page.locator('#task-list .task').count();
check('follow-ups listed', taskCount === 2, `got ${taskCount}`);
const overdueMarks = await page.locator('#task-list .task-due-overdue').count();
check('overdue follow-up highlighted', overdueMarks === 1, `got ${overdueMarks}`);
const coldCount = await page.locator('#cold-list .task').count();
check('cold contacts listed', coldCount === 2, `got ${coldCount}`);
check('nurturing contact excluded from cold list', !(await page.locator('#cold-list').innerText()).includes('Sam Idris'));
const stageBars = await page.locator('#stage-list .progress-bar').count();
check('stage breakdown rendered', stageBars === 5, `got ${stageBars}`);
const activityCount = await page.locator('#activity-list .timeline-item').count();
check('recent activity rendered', activityCount === 8, `got ${activityCount}`);
await page.screenshot({ path: `${SHOTS}/3-dashboard.png`, fullPage: true });

console.log('\n== completing a follow-up ==');
await page.locator('#task-list .task-check').first().click();
await page.waitForTimeout(900);
const afterCount = await page.locator('#task-list .task').count();
check('completing removes it from the list', afterCount === 1, `${taskCount} -> ${afterCount}`);

console.log('\n== pipeline board ==');
await page.click('a[href="/pipeline.html"]');
await page.waitForURL('**/pipeline.html');
await page.waitForSelector('.deal-card');
const cols = await page.locator('.board-col').count();
check('five open columns by default', cols === 5, `got ${cols}`);
const cards = await page.locator('.deal-card').count();
check('open deals on the board', cards === 5, `got ${cards}`);
check('summary line computed', (await page.locator('#summary').innerText()).includes('$185,250'));
await page.screenshot({ path: `${SHOTS}/4-pipeline.png`, fullPage: true });

// Drag the Lumen deal from Prospecting into Qualifying.
const source = page.locator('.board-col[data-stage="PROSPECTING"] .deal-card').first();
const dealName = await source.locator('.deal-card-title').innerText();
const target = page.locator('.board-col[data-stage="QUALIFYING"] .board-col-body');
await source.dragTo(target);
await page.waitForTimeout(1000);

const prospectingNow = await page.locator('.board-col[data-stage="PROSPECTING"] .deal-card').count();
const qualifyingNow = await page.locator('.board-col[data-stage="QUALIFYING"] .deal-card').count();
check('drag emptied the source column', prospectingNow === 0, `got ${prospectingNow}`);
check('drag filled the target column', qualifyingNow === 2, `got ${qualifyingNow}`);
check('dragged deal is in the new column',
    (await page.locator('.board-col[data-stage="QUALIFYING"]').innerText()).includes(dealName));
await page.screenshot({ path: `${SHOTS}/5-pipeline-after-drag.png`, fullPage: true });

console.log('\n== show closed toggle ==');
await page.check('#show-closed');
await page.waitForTimeout(700);
const allCols = await page.locator('.board-col').count();
check('closed columns appear', allCols === 7, `got ${allCols}`);
check('won deal shown', (await page.locator('.board-col[data-stage="WON"]').innerText()).includes('depot expansion'));
await page.uncheck('#show-closed');
await page.waitForTimeout(500);

console.log('\n== editing a deal from the board ==');
await page.locator('.board-col[data-stage="NEGOTIATION"] .deal-card').first().click();
await page.waitForSelector('#deal-modal:not([hidden])');
check('edit modal opens populated', (await page.inputValue('#deal-title')).includes('Northwind'));
check('contact select disabled when editing', await page.locator('#deal-contact').isDisabled());
await page.fill('#deal-amount', '52000');
await page.click('#save-deal');
await page.waitForTimeout(900);
check('amount change reflected on card',
    (await page.locator('.board-col[data-stage="NEGOTIATION"]').innerText()).includes('$52K'));
check('summary recalculated', (await page.locator('#summary').innerText()).includes('$189,250'));

console.log('\n== creating a deal ==');
await page.click('#add-deal-btn');
await page.waitForSelector('#deal-modal:not([hidden])');
await page.fill('#deal-title', 'Lumen — analytics add-on');
await page.fill('#deal-amount', '9000');
await page.selectOption('#deal-stage', 'DEMO');
await page.selectOption('#deal-contact', { label: 'Renee Alvarez — Lumen Health' });
await page.click('#save-deal');
await page.waitForTimeout(900);
check('new deal lands in Demo',
    (await page.locator('.board-col[data-stage="DEMO"]').innerText()).includes('analytics add-on'));

console.log('\n== marking a deal lost ==');
await page.locator('.board-col[data-stage="DEMO"] .deal-card', { hasText: 'analytics add-on' }).click();
await page.waitForSelector('#deal-modal:not([hidden])');
await page.selectOption('#deal-stage', 'LOST');
check('lost reason field revealed', await page.locator('#lost-reason-field').isVisible());
await page.fill('#deal-lost-reason', 'No budget this cycle');
await page.click('#save-deal');
await page.waitForTimeout(900);
await page.check('#show-closed');
await page.waitForTimeout(700);
check('lost deal shows its reason',
    (await page.locator('.board-col[data-stage="LOST"]').innerText()).includes('No budget this cycle'));
await page.screenshot({ path: `${SHOTS}/6-pipeline-closed.png`, fullPage: true });

console.log('\n== contacts list ==');
await page.click('a[href="/contacts.html"]');
await page.waitForURL('**/contacts.html');
await page.waitForSelector('#contacts-body tr.row-hover');
const rows = await page.locator('#contacts-body tr.row-hover').count();
check('all contacts listed', rows === 6, `got ${rows}`);

await page.fill('#search', 'northwind');
await page.waitForTimeout(700);
const searched = await page.locator('#contacts-body tr.row-hover').count();
check('search filters the table', searched === 2, `got ${searched}`);

await page.fill('#search', '');
await page.selectOption('#status-filter', 'QUALIFIED');
await page.waitForTimeout(700);
const filtered = await page.locator('#contacts-body tr.row-hover').count();
check('status filter works', filtered === 2, `got ${filtered}`);

await page.selectOption('#status-filter', '');
await page.selectOption('#stale-filter', '14');
await page.waitForTimeout(700);
const stale = await page.locator('#contacts-body tr.row-hover').count();
check('cold filter works', stale === 3, `got ${stale}`);
await page.selectOption('#stale-filter', '');
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/7-contacts.png`, fullPage: true });

console.log('\n== adding a contact with a new company ==');
await page.click('#add-btn');
await page.waitForSelector('#contact-modal:not([hidden])');
await page.fill('#firstName', 'Iris');
await page.fill('#lastName', 'Novak');
await page.fill('#title', 'CTO');
await page.fill('#email', 'iris@halcyon.dev');
await page.selectOption('#company', '__new__');
check('new-company field revealed', await page.locator('#new-company-field').isVisible());
await page.fill('#newCompany', 'Halcyon Robotics');
await page.selectOption('#status', 'WORKING');
await page.click('#save-contact');
await page.waitForTimeout(1100);
const rowsAfter = await page.locator('#contacts-body tr.row-hover').count();
check('contact added to the list', rowsAfter === 7, `got ${rowsAfter}`);
check('new company shown on the row',
    (await page.locator('#contacts-body').innerText()).includes('Halcyon Robotics'));
await page.screenshot({ path: `${SHOTS}/8-contact-added.png`, fullPage: true });

console.log('\n== contact detail ==');
await page.locator('#contacts-body tr.row-hover', { hasText: 'Priya' }).click();
await page.waitForURL('**/contact.html?id=*');
await page.waitForSelector('#timeline .timeline-item');
check('name rendered', (await page.locator('#name').innerText()) === 'Priya Raman');
check('subtitle has title and company',
    (await page.locator('#subtitle').innerText()) === 'VP Operations · Northwind Logistics');
const timelineCount = await page.locator('#timeline .timeline-item').count();
check('timeline populated', timelineCount === 3, `got ${timelineCount}`);
check('deal listed', (await page.locator('#deals').innerText()).includes('fleet rollout'));
check('deal shows updated amount', (await page.locator('#deals').innerText()).includes('$52,000'));
const taskRows = await page.locator('#tasks .task').count();
check('follow-up listed', taskRows === 1, `got ${taskRows}`);
check('email is a mailto link',
    (await page.locator('#details a[href^="mailto:"]').getAttribute('href')) === 'mailto:priya.raman@northwind.com');
await page.screenshot({ path: `${SHOTS}/9-contact-detail.png`, fullPage: true });

console.log('\n== logging a touch ==');
await page.selectOption('#type', 'CALL');
await page.selectOption('#deal', { label: 'Northwind — fleet rollout' });
await page.fill('#subject', 'Pricing follow-up');
await page.fill('#body', 'Walked through the revised numbers. Sending paperwork Thursday.');
await page.click('#log-btn');
await page.waitForTimeout(1100);
const timelineAfter = await page.locator('#timeline .timeline-item').count();
check('timeline gained the new touch', timelineAfter === 4, `${timelineCount} -> ${timelineAfter}`);
check('newest entry is at the top',
    (await page.locator('#timeline .timeline-item').first().innerText()).includes('Pricing follow-up'));
check('last touch updated',
    (await page.locator('#details').innerText()).includes('just now')
    || (await page.locator('#details').innerText()).includes('within the hour'));

console.log('\n== changing status ==');
await page.selectOption('#status', 'NURTURING');
await page.waitForTimeout(800);
await page.reload();
await page.waitForSelector('#timeline .timeline-item');
check('status change persisted', (await page.inputValue('#status')) === 'NURTURING');

console.log('\n== adding a follow-up ==');
await page.click('#add-task-btn');
await page.waitForSelector('#task-modal:not([hidden])');
await page.fill('#task-title', 'Send countersigned contract');
const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
await page.fill('#task-due', soon);
await page.click('#save-task');
await page.waitForTimeout(1100);
const tasksAfter = await page.locator('#tasks .task').count();
check('follow-up added', tasksAfter === 2, `got ${tasksAfter}`);

console.log('\n== adding a deal from the contact ==');
await page.click('#add-deal-btn');
await page.waitForSelector('#deal-modal:not([hidden])');
await page.fill('#deal-title', 'Northwind — driver app');
await page.fill('#deal-amount', '14000');
await page.selectOption('#deal-stage', 'QUALIFYING');
await page.click('#save-deal');
await page.waitForTimeout(1100);
check('deal appears on the contact', (await page.locator('#deals').innerText()).includes('driver app'));
await page.screenshot({ path: `${SHOTS}/10-contact-after-activity.png`, fullPage: true });

console.log('\n== stage-move note reaches the timeline ==');
await page.goto(`${BASE}/pipeline.html`);
await page.waitForSelector('.deal-card');
const driverCard = page.locator('.board-col[data-stage="QUALIFYING"] .deal-card', { hasText: 'driver app' });
await driverCard.dragTo(page.locator('.board-col[data-stage="DEMO"] .board-col-body'));
await page.waitForTimeout(1000);
await page.goto(`${BASE}/contacts.html`);
await page.waitForSelector('#contacts-body tr.row-hover');
await page.locator('#contacts-body tr.row-hover', { hasText: 'Priya' }).click();
await page.waitForSelector('#timeline .timeline-item');
check('stage move logged on the contact timeline',
    (await page.locator('#timeline').innerText()).includes('Stage moved to DEMO'));

console.log('\n== auth guard ==');
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/dashboard.html`);
await page.waitForURL('**/login.html');
check('logged-out user is bounced to login', page.url().includes('login.html'));

console.log('\n== responsive ==');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/login.html`);
await page.fill('#email', 'demo@huntercrm.test');
// The deliberate bad login logs an expected 401; everything after this point
// must stay clean.
consoleErrors.length = 0;

await page.fill('#password', 'demo1234');
await page.click('#submit');
await page.waitForURL('**/dashboard.html');
await page.waitForSelector('#open-total:not(:has-text("—"))');
await page.waitForTimeout(500);
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
const widest = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
    .slice(0, 5)
    .map(el => `${el.tagName}.${el.className}=${Math.round(el.getBoundingClientRect().right)}`));
check('no horizontal overflow on mobile', scrollW <= 391, `scrollWidth ${scrollW} :: ${widest.join(', ')}`);
await page.screenshot({ path: `${SHOTS}/11-mobile-dashboard.png`, fullPage: true });

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
