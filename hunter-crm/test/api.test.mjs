// Exercises the API against a running, freshly seeded server.
//   npm run db:seed && npm start &
//   npm test
const BASE = process.env.CRM_URL || 'http://localhost:3100';
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

let token = null;
async function call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
}

console.log('\n== auth ==');
let r = await call('POST', '/api/auth/login', { email: 'demo@huntercrm.test', password: 'demo1234' });
check('login succeeds', r.status === 200 && !!r.body.token, JSON.stringify(r.body));
token = r.body.token;

r = await call('POST', '/api/auth/login', { email: 'demo@huntercrm.test', password: 'wrong' });
check('bad password rejected', r.status === 401);

const saved = token; token = null;
r = await call('GET', '/api/dashboard');
check('unauthenticated request rejected', r.status === 401);
token = saved;

r = await call('POST', '/api/auth/register', { email: 'demo@huntercrm.test', fullName: 'Dup', password: 'demo1234' });
check('duplicate email rejected', r.status === 409, JSON.stringify(r.body));

r = await call('POST', '/api/auth/register', { email: 'x@y.co', fullName: 'X', password: 'short' });
check('short password rejected', r.status === 400);

console.log('\n== dashboard ==');
r = await call('GET', '/api/dashboard');
const dash = r.body;
check('dashboard 200', r.status === 200, JSON.stringify(r.body).slice(0, 200));
check('open pipeline counted', dash.pipeline.open_count === 5, `got ${dash?.pipeline?.open_count}`);
check('open pipeline total', Number(dash.pipeline.open_total) === 185250, `got ${dash?.pipeline?.open_total}`);
// 48000*.85 + 22500*.65 + 61000*.45 + 15750*.25 + 38000*.10 = 40800+14625+27450+3937.5+3800
check('weighted forecast', Math.abs(dash.pipeline.weighted_total - 90612.5) < 0.01, `got ${dash?.pipeline?.weighted_total}`);
check('won this month', dash.month.won_count === 1 && Number(dash.month.won_total) === 27000, JSON.stringify(dash.month));
check('win rate 50%', dash.month.win_rate === 0.5, `got ${dash?.month?.win_rate}`);
check('quota attainment', Math.abs(dash.month.quota_attainment - 0.108) < 1e-9, `got ${dash?.month?.quota_attainment}`);
check('overdue task counted', dash.tasks.overdue === 1, JSON.stringify(dash.tasks));
check('due-today task counted separately', dash.tasks.due_today === 1, JSON.stringify(dash.tasks));
check('cold contacts surfaced', dash.cold_contacts.length >= 2, `got ${dash?.cold_contacts?.length}`);
check('cold list has never-touched first', dash.cold_contacts[0].last_touch_at === null, JSON.stringify(dash.cold_contacts[0]));

console.log('\n== contacts ==');
r = await call('GET', '/api/contacts');
check('contacts listed', r.status === 200 && r.body.contacts.length === 6, `got ${r.body?.contacts?.length}`);
check('company joined', r.body.contacts.every(c => c.company_name), 'missing company_name');

r = await call('GET', '/api/contacts?status=QUALIFIED');
check('status filter', r.body.contacts.length === 2, `got ${r.body?.contacts?.length}`);

r = await call('GET', '/api/contacts?q=northwind');
check('search matches company name', r.body.contacts.length === 2, `got ${r.body?.contacts?.length}`);

r = await call('GET', '/api/contacts?q=Okonkwo');
check('search matches last name', r.body.contacts.length === 1, `got ${r.body?.contacts?.length}`);

r = await call('GET', '/api/contacts?stale=14');
check('stale filter', r.body.contacts.length === 3, `got ${r.body?.contacts?.length}`);

r = await call('GET', '/api/contacts?status=BOGUS');
check('bad status rejected', r.status === 400);

const priya = (await call('GET', '/api/contacts?q=Raman')).body.contacts[0];
r = await call('GET', `/api/contacts/${priya.id}`);
check('contact detail 200', r.status === 200);
check('detail includes deals', r.body.deals.length === 1, `got ${r.body?.deals?.length}`);
check('detail includes activities', r.body.activities.length === 3, `got ${r.body?.activities?.length}`);
check('detail includes tasks', r.body.tasks.length === 1, `got ${r.body?.tasks?.length}`);

r = await call('GET', '/api/contacts/999999');
check('missing contact 404', r.status === 404);

console.log('\n== create flow ==');
r = await call('POST', '/api/companies', { name: 'Halcyon Robotics', domain: 'halcyon.dev', industry: 'Robotics', employeeCount: 120 });
check('company created', r.status === 201, JSON.stringify(r.body));
const companyId = r.body.company.id;

r = await call('POST', '/api/companies', { name: 'Halcyon Robotics' });
check('duplicate company rejected', r.status === 409, JSON.stringify(r.body));

r = await call('POST', '/api/contacts', {
    firstName: 'Iris', lastName: 'Novak', title: 'CTO',
    email: 'iris@halcyon.dev', companyId, source: 'OUTBOUND',
});
check('contact created', r.status === 201, JSON.stringify(r.body));
const irisId = r.body.contact.id;
check('contact defaults to NEW', r.body.contact.status === 'NEW');
check('new contact has no touch', r.body.contact.last_touch_at === null);

r = await call('POST', '/api/contacts', { firstName: 'No', lastName: 'Company', companyId: 999999 });
check('unknown company rejected', r.status === 400, JSON.stringify(r.body));

r = await call('POST', '/api/contacts', { firstName: '', lastName: 'Nameless' });
check('blank name rejected', r.status === 400);

console.log('\n== activities update last touch ==');
r = await call('POST', '/api/activities', {
    type: 'CALL', subject: 'Cold call', body: 'Interested in a pilot.', contactId: irisId,
});
check('activity logged', r.status === 201, JSON.stringify(r.body));

r = await call('GET', `/api/contacts/${irisId}`);
check('last_touch_at stamped', r.body.contact.last_touch_at !== null, JSON.stringify(r.body.contact.last_touch_at));
const firstTouch = r.body.contact.last_touch_at;

// An older backfilled activity must not roll the freshest touch backwards.
r = await call('POST', '/api/activities', {
    type: 'EMAIL', subject: 'Backfilled older email', contactId: irisId,
    occurredAt: new Date(Date.now() - 30 * 86400000).toISOString(),
});
check('backdated activity accepted', r.status === 201);
r = await call('GET', `/api/contacts/${irisId}`);
check('last_touch_at not moved backwards', r.body.contact.last_touch_at === firstTouch,
    `${firstTouch} -> ${r.body.contact.last_touch_at}`);

r = await call('POST', '/api/activities', { type: 'CALL', subject: 'Orphan' });
check('unlinked activity rejected', r.status === 400, JSON.stringify(r.body));

r = await call('POST', '/api/activities', { type: 'SMOKE', subject: 'Bad type', contactId: irisId });
check('bad activity type rejected', r.status === 400);

console.log('\n== deals & pipeline ==');
r = await call('GET', '/api/deals');
check('deals listed', r.status === 200 && r.body.deals.length === 7, `got ${r.body?.deals?.length}`);
check('board keyed by stage', r.body.board.NEGOTIATION.count === 1, JSON.stringify(r.body.board?.NEGOTIATION?.count));
check('board totals', Number(r.body.board.DEMO.total) === 61000, `got ${r.body?.board?.DEMO?.total}`);

r = await call('GET', '/api/deals?open=true');
check('open filter', r.body.deals.length === 5, `got ${r.body?.deals?.length}`);

r = await call('POST', '/api/deals', { title: 'Halcyon — pilot', amount: 12000, contactId: irisId, companyId });
check('deal created', r.status === 201, JSON.stringify(r.body));
const dealId = r.body.deal.id;
check('deal defaults to PROSPECTING', r.body.deal.stage === 'PROSPECTING');
check('open deal has no closed_at', r.body.deal.closed_at === null);

r = await call('POST', '/api/deals', { title: 'Negative', amount: -5 });
check('negative amount rejected', r.status === 400);

r = await call('POST', '/api/deals', { title: 'Bad stage', stage: 'NOPE' });
check('bad stage rejected', r.status === 400);

r = await call('PATCH', `/api/deals/${dealId}`, { stage: 'DEMO' });
check('stage moved', r.status === 200 && r.body.deal.stage === 'DEMO', JSON.stringify(r.body));
check('still open, no closed_at', r.body.deal.closed_at === null);

r = await call('GET', `/api/contacts/${irisId}`);
const stageNote = r.body.activities.find(a => a.subject === 'Stage moved to DEMO');
check('stage move wrote a timeline entry', !!stageNote, 'no note found');
check('note references the deal', stageNote && stageNote.deal_id === dealId);

r = await call('PATCH', `/api/deals/${dealId}`, { stage: 'WON' });
check('won stamps closed_at', r.body.deal.closed_at !== null, JSON.stringify(r.body.deal.closed_at));

r = await call('PATCH', `/api/deals/${dealId}`, { stage: 'LOST', lostReason: 'Went with incumbent' });
check('lost reason stored', r.body.deal.lost_reason === 'Went with incumbent', JSON.stringify(r.body.deal));

r = await call('PATCH', `/api/deals/${dealId}`, { stage: 'PROPOSAL' });
check('reopening clears closed_at', r.body.deal.closed_at === null, JSON.stringify(r.body.deal.closed_at));
check('reopening clears lost reason', r.body.deal.lost_reason === null, JSON.stringify(r.body.deal.lost_reason));

r = await call('PATCH', `/api/deals/${dealId}`, {});
check('empty patch rejected', r.status === 400);

r = await call('PATCH', '/api/deals/999999', { stage: 'DEMO' });
check('missing deal 404', r.status === 404);

console.log('\n== tasks ==');
r = await call('POST', '/api/tasks', { title: 'Send Halcyon proposal', dueAt: new Date(Date.now() + 86400000).toISOString(), contactId: irisId });
check('task created', r.status === 201, JSON.stringify(r.body));
const taskId = r.body.task.id;

r = await call('POST', '/api/tasks', { title: 'No due date' });
check('missing dueAt rejected', r.status === 400);

r = await call('GET', '/api/tasks?scope=overdue');
check('overdue scope', r.status === 200 && r.body.tasks.length === 1, `got ${r.body?.tasks?.length}`);

r = await call('GET', '/api/tasks?scope=open');
const openBefore = r.body.tasks.length;

r = await call('PATCH', `/api/tasks/${taskId}`, { completed: true });
check('task completed', r.body.task.completed_at !== null, JSON.stringify(r.body));

r = await call('GET', '/api/tasks?scope=open');
check('completed task leaves open list', r.body.tasks.length === openBefore - 1, `${openBefore} -> ${r.body?.tasks?.length}`);

r = await call('PATCH', `/api/tasks/${taskId}`, { completed: false });
check('task reopened', r.body.task.completed_at === null);

r = await call('GET', '/api/tasks?scope=bogus');
check('bad scope rejected', r.status === 400);

r = await call('DELETE', `/api/tasks/${taskId}`);
check('task deleted', r.status === 200);
r = await call('DELETE', `/api/tasks/${taskId}`);
check('double delete 404', r.status === 404);

console.log('\n== cross-account isolation ==');
r = await call('POST', '/api/auth/register', {
    email: `rival-${Date.now()}@test.co`, fullName: 'Rival Rep', password: 'rival1234',
});
check('second rep registered', r.status === 201, JSON.stringify(r.body));
const rivalToken = r.body.token;
const demoToken = token;
token = rivalToken;

r = await call('GET', '/api/contacts');
check("rival sees no demo contacts", r.body.contacts.length === 0, `got ${r.body?.contacts?.length}`);

r = await call('GET', `/api/contacts/${irisId}`);
check("rival cannot read demo contact", r.status === 404);

r = await call('PATCH', `/api/deals/${dealId}`, { stage: 'WON' });
check("rival cannot move demo deal", r.status === 404);

r = await call('DELETE', `/api/contacts/${irisId}`);
check("rival cannot delete demo contact", r.status === 404);

r = await call('POST', '/api/contacts', { firstName: 'Cross', lastName: 'Link', companyId });
check("rival cannot attach demo company", r.status === 400, JSON.stringify(r.body));

r = await call('POST', '/api/activities', { type: 'NOTE', subject: 'Peek', contactId: irisId });
check("rival cannot log against demo contact", r.status === 400);

token = demoToken;
r = await call('GET', `/api/contacts/${irisId}`);
check('demo contact survived rival attempts', r.status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
