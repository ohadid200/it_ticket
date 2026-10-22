/* Headless smoke test for the logic layers (Store + I18n).
   Minimal DOM/localStorage shim — no external dependencies. */
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('FAIL  ' + name + (extra ? ' :: ' + extra : '')); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; }
};
const documentStub = {
  documentElement: { lang: 'en', dir: 'ltr', classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
  title: '',
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {}
};

const sandbox = {
  window: null, console, localStorage, document: documentStub,
  setTimeout, clearTimeout, Date, Math, JSON,
  Blob: class Blob { constructor() { this.parts = arguments[0]; } },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  navigator: { clipboard: { writeText: async () => {} } }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync('assets/js/' + file, 'utf8'), sandbox, { filename: file });
}
load('logger.js');
load('activity.js');
load('store.js');
load('i18n.js');

const Store = sandbox.Store;
const I18n = sandbox.I18n;
const Log = sandbox.Log;
const Activity = sandbox.Activity;

/* ---------- Store: init / persistence ---------- */
Store.init();
eq('store starts empty', Store.tickets.length, 0);

const created = Store.create({
  requesterName: 'Layla Hassan', employeeId: 'layla@corp.com', department: 'Finance',
  category: 'Hardware', priority: 'Critical', subject: 'Laptop will not power on',
  description: 'The machine is dead and needs to be replaced soon.'
});
ok('create returns a ticket', !!created && !!created.id);
eq('create assigns pending status', created.status, 'pending');
eq('create assigns Unassigned', created.assignee, 'Unassigned');
ok('create generates IT- code', /^IT-\d{5}$/.test(created.code), created.code);
eq('create unshifts to list', Store.tickets[0].id, created.id);

ok('ticket persisted to localStorage', !!localStorage.getItem('it_helpdesk_tickets_v1'));
Store.init();
eq('reload restores 1 ticket', Store.tickets.length, 1);
eq('reload keeps the code', Store.tickets[0].code, created.code);

eq('getByCode exact', Store.getByCode(created.code).id, created.id);
eq('getByCode lowercase + no dash', Store.getByCode('it-' + created.code.slice(3)).id, created.id);
eq('getByCode with # prefix', Store.getByCode('#' + created.code).id, created.id);
eq('getByCode bare digits rejected (documented IT-12345 format)', Store.getByCode(created.code.slice(3)), null);
eq('getByCode invalid returns null', Store.getByCode('ABC'), null);
eq('normaliseCode canonicalises', Store.normaliseCode('  it-98241 '), 'IT-98241');
eq('normaliseCode rejects garbage', Store.normaliseCode('IT-1234'), null);

const up = Store.updateStatus(created.id, 'in_progress');
eq('updateStatus applies', up.status, 'in_progress');
eq('updateStatus bumps updatedAt', up.updatedAt !== created.createdAt, true);
eq('updateStatus rejects unknown status', Store.updateStatus(created.id, 'nope'), null);

Store.updateStatus(created.id, 'rejected', { rejectionReason: 'Out of scope' });
eq('rejection reason stored', Store.getById(created.id).rejectionReason, 'Out of scope');
Store.updateStatus(created.id, 'analyzing');
eq('rejection reason cleared on leaving rejected', Store.getById(created.id).rejectionReason, '');

Store.assign(created.id, 'Ahmed Hassan — Hardware');
eq('assign sets assignee', Store.getById(created.id).assignee, 'Ahmed Hassan — Hardware');

const noted = Store.addNote(created.id, 'Spare laptop reserved', 'IT Helpdesk');
eq('addNote appends', noted.notes.length, 1);
eq('addNote stores author', noted.notes[0].author, 'IT Helpdesk');
eq('addNote rejects empty text', Store.addNote(created.id, '   ', 'IT Helpdesk'), null);

const m = Store.metrics();
eq('metrics total', m.total, 1);
eq('metrics open (analyzing counts as open)', m.open, 1);
eq('metrics in_progress', m.in_progress, 0);
eq('metrics closed', m.closed, 0);
eq('metrics rejected', m.rejected, 0);

Store.create({
  requesterName: 'Omar Farouk', employeeId: 'omar@corp.com', department: 'Ops',
  category: 'Network/Wi-Fi', priority: 'Low', subject: 'Wifi drops in meeting room',
  description: 'Signal keeps dropping every few minutes in room 4.'
});
Store.updateStatus(Store.tickets[0].id, 'resolved');
eq('query all', Store.query({}).length, 2);
eq('query by status', Store.query({ status: 'resolved' }).length, 1);
eq('query by search term', Store.query({ search: 'wifi' }).length, 1);
eq('query by search miss', Store.query({ search: 'zzzz' }).length, 0);
eq('query by priority', Store.query({ priority: 'Critical' }).length, 1);
eq('query sort oldest puts newest-created last', Store.query({ sort: 'oldest' })[0].code, created.code);

const csv = Store.toCSV(Store.query({}));
ok('CSV has header + rows', csv.split('\n').length >= 3, String(csv.split('\n').length));
ok('CSV contains ticket code', csv.indexOf(created.code) !== -1);
const json = Store.toJSON(Store.query({}));
ok('JSON parses and is an array', Array.isArray(JSON.parse(json)) && JSON.parse(json).length === 2);

eq('remove existing ticket', Store.remove(created.id), true);
eq('remove unknown ticket', Store.remove('nope'), false);
eq('list shrank', Store.tickets.length, 1);

const demoCount = Store.loadDemoData();
ok('loadDemoData returns > 0', demoCount > 0, String(demoCount));
eq('demo tickets flagged', Store.tickets.filter((t) => t.isDemo).length, demoCount);
eq('loadDemoData is idempotent', Store.loadDemoData(), demoCount);
const demoStatuses = new Set(Store.tickets.map((t) => t.status));
['pending', 'analyzing', 'in_progress', 'on_hold', 'resolved', 'rejected'].forEach((s) => {
  ok('demo covers status ' + s, demoStatuses.has(s));
});
Store.clearAll();
eq('clearAll empties the list', Store.tickets.length, 0);

/* ---------- Logger ---------- */
Log.mirrorToConsole = false;
eq('logger default level', Log.getLevel(), 'info');
Log.setLevel('debug');
eq('setLevel persists', localStorage.getItem('it_helpdesk_log_level_v1'), 'debug');
eq('getLevel reflects change', Log.getLevel(), 'debug');
eq('debug enabled at debug level', Log.isEnabled('debug'), true);
eq('error enabled at debug level', Log.isEnabled('error'), true);
Log.setLevel('error');
eq('debug disabled at error level', Log.isEnabled('debug'), false);
eq('error still enabled at error level', Log.isEnabled('error'), true);
Log.setLevel('silent');
eq('nothing enabled at silent level', Log.isEnabled('error'), false);
Log.setLevel('info');

const beforeCount = Log.entries.length;
const logged = Log.warn('smoke', 'a warning', { n: 1 });
ok('log entry returned', !!logged);
eq('log entry scope', logged.scope, 'smoke');
eq('log entry level', logged.level, 'warn');
eq('log entry message', logged.message, 'a warning');
eq('log entry extra', logged.extra.n, 1);
eq('buffer grew by one', Log.entries.length, beforeCount + 1);
ok('history returns the newest entries', Log.history(1).length === 1);
eq('history(1) is the latest entry', Log.history(1)[0].message, 'a warning');

/* the ring buffer is capped at 250 entries */
Log.setLevel('debug');
for (let i = 0; i < 300; i++) Log.debug('smoke', 'flood ' + i);
eq('ring buffer capped at 250', Log.entries.length, 250);
eq('oldest entries dropped', Log.entries[0].message, 'flood 50');
Log.clear();
eq('clear empties the buffer', Log.entries.length, 0);

/* the persisted level survives a reload */
Log.setLevel('info');
eq('logger restores persisted level', Log._readLevel(), 'info');
Log.setLevel('warn');
eq('logger restores warn level', Log._readLevel(), 'warn');
Log.setLevel('info');

/* ---------- Activity / audit log ---------- */
Activity.clear();
eq('activity starts empty', Activity.count(), 0);
const ev = Activity.record('ticket_created', 'Ticket IT-00001 created — Laptop issue', {
  ticketId: 't1', code: 'IT-00001'
});
ok('activity record returns an entry', !!ev && !!ev.id);
eq('activity entry action', ev.action, 'ticket_created');
eq('activity entry code', ev.code, 'IT-00001');
eq('activity entry persisted', Activity.count(), 1);
ok('activity persisted to localStorage', !!localStorage.getItem('it_helpdesk_activity_v1'));

Activity.record('status_changed', 'Ticket IT-00001 status changed from pending to resolved', {
  ticketId: 't1', code: 'IT-00001'
});
Activity.record('note_added', 'Note added to ticket IT-00001 by IT Helpdesk', {
  ticketId: 't1', code: 'IT-00001'
});
Activity.record('team_member_added', 'Team member added: Mona Adel — Network', { member: 'Mona' });
eq('activity count grew', Activity.count(), 4);

const all = Activity.all();
eq('all() returns everything', all.length, 4);
ok('all() is newest first', all[0].action === 'team_member_added', all[0].action);
eq('query by action', Activity.query({ action: 'status_changed' }).length, 1);
eq('query by action all', Activity.query({ action: 'all' }).length, 4);
eq('query by search term', Activity.query({ search: 'status changed' }).length, 1);
eq('query by search miss', Activity.query({ search: 'zzzznope' }).length, 0);
eq('query by code', Activity.query({ code: 'IT-00001' }).length, 3);
eq('query with limit', Activity.query({ limit: 2 }).length, 2);
ok('usedTypes lists distinct actions', Activity.usedTypes().length >= 3, String(Activity.usedTypes().length));
ok('usedTypes contains ticket_created', Activity.usedTypes().indexOf('ticket_created') !== -1);

const actCsv = Activity.toCSV();
const actLines = actCsv.split('\n');
ok('activity CSV has a header', actLines[0].indexOf('Timestamp') !== -1, actLines[0]);
ok('activity CSV header has Action/Ticket/Details',
  actLines[0].indexOf('Action') !== -1 &&
  actLines[0].indexOf('Ticket') !== -1 &&
  actLines[0].indexOf('Details') !== -1, actLines[0]);
ok('activity CSV has one row per event', actLines.length === 5, String(actLines.length));
ok('activity CSV contains the ticket code', actCsv.indexOf('IT-00001') !== -1);
ok('activity CSV quotes fields', actCsv.indexOf('"ticket_created"') !== -1);

/* events survive a reload from storage */
eq('activity reload keeps the count', Activity.count(), 4);

/* Store mutations are audited automatically */
Activity.clear();
const audited = Store.create({
  requesterName: 'Audit User', employeeId: 'audit@corp.com', department: 'IT',
  category: 'Software', priority: 'High', subject: 'Audited ticket subject',
  description: 'This ticket is created to verify that the audit trail records it.'
});
ok('creating a ticket writes an audit event', Activity.count() >= 1, String(Activity.count()));
ok('audit event is ticket_created', Activity.all()[0].action === 'ticket_created', Activity.all()[0].action);
ok('audit event carries the ticket code', Activity.all()[0].code === audited.code, Activity.all()[0].code);

Store.updateStatus(audited.id, 'in_progress');
ok('status change is audited', Activity.all()[0].action === 'status_changed', Activity.all()[0].action);
eq('audit status event records the previous status', Activity.all()[0].meta.from, 'pending');
eq('audit status event records the new status', Activity.all()[0].meta.to, 'in_progress');

Store.assign(audited.id, 'Mona Adel — Network');
ok('assignment is audited', Activity.all()[0].action === 'assigned', Activity.all()[0].action);

Store.addNote(audited.id, 'Spare unit reserved', 'IT Helpdesk');
ok('note is audited', Activity.all()[0].action === 'note_added', Activity.all()[0].action);

Store.updateStatus(audited.id, 'resolved');
ok('closing a ticket is audited as ticket_closed', Activity.all()[0].action === 'ticket_closed', Activity.all()[0].action);

Store.updateStatus(audited.id, 'analyzing');
ok('reopening a ticket is audited as ticket_reopened', Activity.all()[0].action === 'ticket_reopened', Activity.all()[0].action);

Store.updateStatus(audited.id, 'rejected', { rejectionReason: 'Out of scope' });
ok('rejection is audited as ticket_rejected', Activity.all()[0].action === 'ticket_rejected', Activity.all()[0].action);

Store.remove(audited.id);
ok('deletion is audited as ticket_deleted', Activity.all()[0].action === 'ticket_deleted', Activity.all()[0].action);

/* team changes are audited too */
Activity.clear();
Store.addTeamMember('Hala Kamel', 'Print Services');
ok('team addition is audited', Activity.all()[0].action === 'team_member_added', Activity.all()[0].action);
Store.removeTeamMember('Hala Kamel — Print Services');
ok('team removal is audited', Activity.all()[0].action === 'team_member_removed', Activity.all()[0].action);

/* the audit event must exist before store subscribers re-render the feed */
Activity.clear();
let observedDuringEmit = null;
const unsubscribe = Store.subscribe(() => {
  observedDuringEmit = Activity.all()[0] ? Activity.all()[0].action : null;
});
const orderingTicket = Store.create({
  requesterName: 'Order Test', employeeId: 'order@corp.com', department: 'IT',
  category: 'Software', priority: 'Low', subject: 'Ordering probe ticket',
  description: 'Used to prove the audit trail is written before the change is broadcast.'
});
ok('audit event exists when subscribers are notified',
  observedDuringEmit === 'ticket_created', String(observedDuringEmit));
eq('audit event matches the created ticket', Activity.all()[0].code, orderingTicket.code);
unsubscribe();
Store.remove(orderingTicket.id);

/* every activity type has an English and an Arabic label */
Activity.TYPES.forEach((type) => {
  const key = 'activity.type.' + type;
  ok('activity type has an English label (' + type + ')',
    typeof I18n.dict.en[key] === 'string' && I18n.dict.en[key].length > 0);
  ok('activity type has an Arabic label (' + type + ')',
    typeof I18n.dict.ar[key] === 'string' && I18n.dict.ar[key].length > 0);
  ok('activity type labels differ between languages (' + type + ')',
    I18n.dict.en[key] !== I18n.dict.ar[key]);
});
eq('activity type count', Activity.TYPES.length, 11);

Activity.clear();
eq('activity clear empties the log', Activity.count(), 0);

/* ---------- Store: team management ---------- */
const teamLen0 = Store.TEAM.length;
eq('team default starts with Unassigned', Store.TEAM[0], 'Unassigned');
eq('addTeamMember returns entry', Store.addTeamMember('Layla Mansour', 'Mobile Support'), 'Layla Mansour \u2014 Mobile Support');
eq('addTeamMember appends to list', Store.TEAM.length, teamLen0 + 1);
eq('addTeamMember rejects short name', Store.addTeamMember('A', 'x'), null);
eq('addTeamMember rejects empty name', Store.addTeamMember('   ', ''), null);
eq('addTeamMember rejects duplicate', Store.addTeamMember('Layla Mansour', 'Mobile Support'), null);
eq('addTeamMember works without role', Store.addTeamMember('Mostafa Aziz', ''), 'Mostafa Aziz');
ok('team persisted to localStorage', String(localStorage.getItem('it_helpdesk_team_v1')).indexOf('Layla Mansour') !== -1);

const tmTicket = Store.create({
  requesterName: 'Team Test', employeeId: 'team@corp.com', department: 'HR',
  category: 'Hardware', priority: 'Low', subject: 'Ticket used for team removal test',
  description: 'Assigned to a custom member so delete-reassignment can be verified.'
});
Store.assign(tmTicket.id, 'Layla Mansour \u2014 Mobile Support');
eq('removeTeamMember rejects Unassigned', Store.removeTeamMember('Unassigned'), null);
eq('removeTeamMember rejects unknown', Store.removeTeamMember('Ghost \u2014 Nowhere'), null);
const rmResult = Store.removeTeamMember('Layla Mansour \u2014 Mobile Support');
eq('removeTeamMember returns reassigned count', rmResult.reassigned, 1);
eq('removed member gone from list', Store.TEAM.indexOf('Layla Mansour \u2014 Mobile Support'), -1);
eq('ticket falls back to Unassigned', Store.getById(tmTicket.id).assignee, 'Unassigned');

Store.init();
eq('custom team survives reload', Store.TEAM.indexOf('Mostafa Aziz') !== -1, true);
eq('deleted member stays deleted after reload', Store.TEAM.indexOf('Layla Mansour \u2014 Mobile Support'), -1);
eq('reloaded team keeps Unassigned first', Store.TEAM[0], 'Unassigned');
Store.clearAll();

/* ---------- I18n ---------- */
I18n.setLanguage('en');
eq('en lang set', documentStub.documentElement.lang, 'en');
eq('en dir ltr', documentStub.documentElement.dir, 'ltr');
eq('en translation resolves', I18n.t('toast.updated'), 'Status updated');
ok('unknown key falls back to the key itself', I18n.t('does.not.exist') === 'does.not.exist');
eq('interpolation works', I18n.t('toast.updatedMsg', { code: 'IT-00001' }).indexOf('IT-00001') !== -1, true);

I18n.setLanguage('ar');
eq('ar lang set', documentStub.documentElement.lang, 'ar');
eq('ar dir rtl', documentStub.documentElement.dir, 'rtl');
ok('ar translation differs from en', I18n.t('toast.updated') !== 'Ticket updated');
ok('ar status label is arabic', /[\u0600-\u06FF]/.test(I18n.status('pending')));
eq('status() returns localized pending', I18n.status('pending'), I18n.dict.ar['status.pending']);
I18n.setLanguage('en');
eq('back to en dir ltr', documentStub.documentElement.dir, 'ltr');

/* close-ticket strings exist in both languages */
eq('close ticket label resolves (en)', I18n.t('admin.closeTicket'), 'Close Ticket');
ok('close modal body interpolates (en)', I18n.t('modal.closeTicketBody', { code: 'IT-12345' }).indexOf('IT-12345') !== -1);
I18n.setLanguage('ar');
eq('close ticket label resolves (ar)', I18n.t('admin.closeTicket'), 'إغلاق التذكرة');
ok('close modal body interpolates (ar)', I18n.t('modal.closeTicketBody', { code: 'IT-12345' }).indexOf('IT-12345') !== -1);
I18n.setLanguage('en');

console.log('----------------------------------------');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail) { failures.forEach((f) => console.log('  x ' + f)); process.exit(1); }
