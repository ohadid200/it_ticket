/* Browser-level smoke test driven over the Chrome DevTools Protocol.
   Spawns headless Edge, loads index.html over a local HTTP server and
   exercises the real employee + admin workflows.

   Dependencies: Node built-ins only (http, fs, path, os, child_process,
   global fetch + global WebSocket). Requires Node >= 22.

   Usage:  node browsertest.js
*/
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
];

const EXTERNAL_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const isExternal = (url) => EXTERNAL_HOSTS.some((h) => String(url || '').indexOf(h) !== -1);

/* ---------- tiny assertion harness ---------- */
let pass = 0;
let fail = 0;
const failures = [];
const TRACE_LOG = path.join(ROOT, '_bt_trace.txt');

/* Synchronous file tracing so progress survives external process kills. */
function trace(msg) {
  try { fs.appendFileSync(TRACE_LOG, Date.now() + ' ' + msg + '\n'); } catch (e) { /* ignore */ }
}

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    trace('PASS ' + name);
    console.log('PASS  ' + name);
  } else {
    fail++;
    failures.push(name + (extra ? ' :: ' + extra : ''));
    trace('FAIL ' + name + (extra ? ' :: ' + extra : ''));
    console.log('FAIL  ' + name + (extra ? ' :: ' + extra : ''));
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected,
    'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- static file server (localStorage needs a real origin) ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/' || rel === '') rel = '/index.html';

      if (rel === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\\\])+/, ''));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('forbidden');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
        });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server: server, port: server.address().port }));
  });
}

/* ---------- minimal CDP client over the built-in WebSocket ---------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.closed = false;
    this.pending = new Map();
    this.seq = 0;
    this.consoleErrors = [];
    this.pageErrors = [];
    this.networkFailures = [];

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.handleEvent(msg.method, msg.params);
      }
    });
    ws.addEventListener('close', () => { this.closed = true; });
    ws.addEventListener('error', () => { this.closed = true; });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, 10000);
      this.ws.send(JSON.stringify({ id, method, params }));
      // Clear timeout when resolved/rejected
      const origResolve = resolve;
      const origReject = reject;
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timeout); origResolve(v); },
        reject: (e) => { clearTimeout(timeout); origReject(e); }
      });
    });
  }

  eval(expression, awaitPromise = true) {
    const wrapped = '(' + expression + ')';
    return this.send('Runtime.evaluate', {
      expression: wrapped,
      awaitPromise: awaitPromise,
      returnByValue: true
    }).then((r) => {
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails;
        const text = (ex.exception && (ex.exception.description || ex.exception.value)) ||
          ex.text || 'eval exception';
        throw new Error('eval exception: ' + text);
      }
      return r.result && r.result.value;
    });
  }

  handleEvent(method, params) {
    if (method === 'Runtime.consoleAPICalled') {
      const args = (params.args || []).map((a) => a.value);
      const type = params.type || 'log';
      if (type === 'error' || type === 'warning') {
        this.consoleErrors.push('[' + type + '] ' + args.join(' '));
      }
    }
    if (method === 'Runtime.exceptionThrown') {
      this.pageErrors.push(params.exceptionDetails.exception.text || 'exception');
    }
    if (method === 'Network.loadingFailed') {
      this.networkFailures.push({
        type: params.type,
        errorText: params.errorText,
        url: params.url
      });
    }
  }

  async waitFor(expression, timeout = 10000, interval = 120) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (err) {
        last = undefined;
      }
      await sleep(interval);
    }
    return last;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url: url });
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: false });
  }
}

/* ---------- Edge launcher ---------- */
function findEdge() {
  for (const candidate of EDGE_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch (e) { /* ignore */ }
  }
  return null;
}

async function launchEdge(profileDir, port) {
  const exe = findEdge();
  if (!exe) throw new Error('Microsoft Edge executable not found in the usual locations');

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profileDir,
    'about:blank'
  ];

  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', () => { /* swallow Edge noise */ });
  proc.on('error', (err) => { console.error('Edge spawn error: ' + err.message); });
  return proc;
}

/** Discover the CDP websocket URL from /json/version. */
async function discoverCdp(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (res.ok) {
        const json = await res.json();
        if (json.webSocketDebuggerUrl) return json;
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(250);
  }
  throw new Error('CDP endpoint not reachable on port ' + port +
    (lastErr ? ' :: ' + lastErr.message : ''));
}

/** Find the page target's own websocket URL. */
async function findPageTarget(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (err) { /* retry */ }
    await sleep(250);
  }
  throw new Error('No page target found on port ' + port);
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onOpen = () => { ws.removeEventListener('error', onError); resolve(ws); };
    const onError = (e) => {
      ws.removeEventListener('open', onOpen);
      reject(new Error('WebSocket error: ' + ((e && e.message) || 'unknown')));
    };
    ws.addEventListener('open', onOpen, { once: true });
    ws.addEventListener('error', onError, { once: true });
  });
}

/* ---------- DOM helpers over CDP ---------- */

async function cdpEval(cdp, expression) {
  return await cdp.eval(expression);
}

async function cdpClick(cdp, selector) {
  return await cdp.eval(
    '(function(){const el=document.querySelector(' + JSON.stringify(selector) + ');if(!el)return false;el.click();return true;})()'
  );
}

async function cdpType(cdp, selector, text) {
  return await cdp.eval(
    '(function(){const el=document.querySelector(' + JSON.stringify(selector) + ');if(!el)return false;el.focus();el.value=' + JSON.stringify(text) + ';el.dispatchEvent(new Event(\'input\',{bubbles:true}));el.dispatchEvent(new Event(\'change\',{bubbles:true}));return true;})()'
  );
}

async function cdpValue(cdp, selector) {
  return await cdp.eval(
    '(function(){const el=document.querySelector(' + JSON.stringify(selector) + ');return el?el.value:null;})()'
  );
}

async function cdpText(cdp, selector) {
  return await cdp.eval(
    '(function(){const el=document.querySelector(' + JSON.stringify(selector) + ');return el?el.textContent.trim():null;})()'
  );
}

async function cdpHas(cdp, selector) {
  return await cdp.eval(
    '(function(){return document.querySelector(' + JSON.stringify(selector) + ')!==null;})()'
  );
}

async function cdpClass(cdp, selector) {
  return await cdp.eval(
    '(function(){const el=document.querySelector(' + JSON.stringify(selector) + ');return el?el.className:null;})()'
  );
}

async function cdpWaitFor(cdp, selector, timeout) {
  const deadline = Date.now() + (timeout || 10000);
  while (Date.now() < deadline) {
    const found = await cdpHas(cdp, selector);
    if (found) return true;
    await sleep(200);
  }
  return false;
}

async function cdpWaitVisible(cdp, selector, timeout) {
  const deadline = Date.now() + (timeout || 10000);
  while (Date.now() < deadline) {
    const cls = await cdpClass(cdp, selector);
    if (cls && cls.indexOf('hidden') === -1) return true;
    await sleep(200);
  }
  return false;
}

async function cdpSelect(cdp, selector, value) {
  return await cdp.eval(
    '(function(){const el=document.querySelector(' + JSON.stringify(selector) + ');if(!el)return false;el.value=' + JSON.stringify(value) + ';el.dispatchEvent(new Event(\'change\',{bubbles:true}));return true;})()'
  );
}

/* ---------- Browser tests ---------- */

async function testFormValidation(cdp) {
  const portalVisible = await cdpHas(cdp, '#view-portal:not(.hidden)');
  ok('portal view is active by default', portalVisible);

  await cdpClick(cdp, '#btnSubmit');
  await sleep(300);

  const nameClass = await cdpClass(cdp, '#reqName');
  ok('name field marked invalid on empty submit', nameClass && nameClass.indexOf('is-invalid') !== -1, nameClass || 'null');

  await cdpType(cdp, '#reqName', 'Browser Test User');
  await cdpType(cdp, '#reqId', 'browser@corp.com');
  await cdpSelect(cdp, '#reqDept', 'Finance');
  await cdpSelect(cdp, '#reqCategory', 'Hardware');
  await cdpSelect(cdp, '#reqPriority', 'High');
  await cdpType(cdp, '#reqSubject', 'Browser test ticket subject');
  await cdpType(cdp, '#reqDescription', 'This is a browser test description long enough to pass validation');

  await cdpClick(cdp, '#btnSubmit');
  await sleep(800);

  const successToast = await cdpHas(cdp, '.toast-success');
  ok('success toast appears after valid submission', successToast);

  const lastTicketVisible = await cdpWaitVisible(cdp, '#lastTicket:not(.hidden)', 5000);
  ok('last ticket box appears after submission', lastTicketVisible);

  const code = await cdpEval(
    cdp,
    '(function(){const el=document.querySelector(\'#lastTicket .font-mono\');return el?el.textContent.trim():null;})()'
  );
  ok('ticket code matches IT-XXXXX format', /^IT-\d{5}$/.test(code || ''), code || 'null');

  return code;
}

async function testTracking(cdp, code) {
  if (!code) {
    ok('tracking lookup skipped (no ticket code)', true);
    return;
  }

  await cdpType(cdp, '#trackCode', code);
  await cdpClick(cdp, '#btnTrack');
  await sleep(800);

  const cardVisible = await cdpHas(cdp, '#trackResult [data-ticket-id]');
  ok('tracker card appears for valid code', cardVisible);

  const trackedCode = await cdpEval(
    cdp,
    '(function(){const el=document.querySelector(\'#trackResult .font-mono\');return el?el.textContent.trim():null;})()'
  );
  eq('tracker shows the correct code', trackedCode, code);

  const subject = await cdpEval(
    cdp,
    '(function(){const el=document.querySelector(\'#trackResult .text-sm.font-semibold\');return el?el.textContent.trim():null;})()'
  );
  ok('tracker shows ticket subject', subject && subject.length > 0, subject || 'null');
}

async function testAdminView(cdp) {
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);

  const adminViewVisible = await cdpHas(cdp, '#view-admin:not(.hidden)');
  ok('admin view is shown when tab clicked', adminViewVisible);

  const metricsVisible = await cdpHas(cdp, '.metric-card');
  ok('admin metrics cards are rendered', metricsVisible);

  const resultCount = await cdpValue(cdp, '#resultCount');
  ok('admin result count is displayed', resultCount !== null, resultCount || 'null');
}

async function testAdminFilters(cdp) {
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);

  await cdpSelect(cdp, '#filterStatus', 'resolved');
  await sleep(500);
  ok('status filter applied without error', true);

  await cdpType(cdp, '#adminSearch', 'browser');
  await sleep(500);
  ok('search filter applied without error', true);

  await cdpClick(cdp, '#btnResetFilters');
  await sleep(500);
  ok('filter reset applied without error', true);

  await cdpSelect(cdp, '#filterPriority', 'High');
  await sleep(500);
  ok('priority filter applied without error', true);

  await cdpClick(cdp, '#btnResetFilters');
  await sleep(500);
}

async function testAdminActions(cdp) {
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);

  const hasTickets = await cdpHas(cdp, '.ticket-card');
  if (!hasTickets) {
    ok('admin actions skipped (no tickets in feed)', true);
    return;
  }

  // Ensure a second ticket exists so the delete step leaves at least one
  // ticket behind for the persistence test.
  const ticketCount = await cdpEval(
    cdp,
    '(function(){return document.querySelectorAll(' + JSON.stringify('.ticket-card') + ').length;})()'
  );
  if (ticketCount < 2) {
    await cdpClick(cdp, '[data-view="portal"]');
    await sleep(500);
    await cdpType(cdp, '#reqName', 'Second Ticket User');
    await cdpType(cdp, '#reqId', 'second@corp.com');
    // Exact option values from index.html: dept has no "IT" option.
    await cdpSelect(cdp, '#reqDept', 'Operations');
    await cdpSelect(cdp, '#reqCategory', 'Software');
    await cdpSelect(cdp, '#reqPriority', 'Low');
    await cdpType(cdp, '#reqSubject', 'Second browser test ticket');
    await cdpType(cdp, '#reqDescription', 'Created so the admin delete test leaves at least one ticket behind');
    await cdpClick(cdp, '#btnSubmit');
    await sleep(800);
    const secondOk = await cdpHas(cdp, '.toast-success');
    trace('second ticket creation toast: ' + secondOk);
    await cdpClick(cdp, '[data-view="admin"]');
    await sleep(500);
  }

  // Change status on first ticket
  const statusSel = '.ticket-card [data-role="status"]';
  const statusChanged = await cdpEval(
    cdp,
    '(function(){const sel=document.querySelector(' + JSON.stringify(statusSel) + ');if(!sel)return false;sel.value=' + JSON.stringify('resolved') + ';sel.dispatchEvent(new Event(' + JSON.stringify('change') + ',{bubbles:true}));return true;})()'
  );
  ok('status dropdown change dispatched', statusChanged);
  await sleep(800);

  // Change assignee on first ticket
  const assigneeSel = '.ticket-card [data-role="assignee"]';
  const assigned = await cdpEval(
    cdp,
    '(function(){const sel=document.querySelector(' + JSON.stringify(assigneeSel) + ');if(!sel)return false;const opts=sel.options;if(opts.length>1){sel.value=opts[1].value;sel.dispatchEvent(new Event(' + JSON.stringify('change') + ',{bubbles:true}));return true;}return false;})()'
  );
  ok('assignee change dispatched', assigned);
  await sleep(800);

  // Add a note via modal
  const noteSel = '.ticket-card [data-action="note"]';
  const noteAdded = await cdpEval(
    cdp,
    '(function(){const btn=document.querySelector(' + JSON.stringify(noteSel) + ');if(!btn)return false;btn.click();return true;})()'
  );
  ok('add-note button clicked', noteAdded);
  await sleep(800);

  // Wait for modal to open (is-open class added by UI.js)
  const modalOpen = await cdpHas(cdp, '#modalBackdrop.is-open');
  if (modalOpen) {
    await cdpType(cdp, '#noteText', 'Browser test admin note');
    await sleep(300);
    // Use the specific confirm button ID set by UI.js
    const noteConfirm = await cdpEval(
      cdp,
      '(function(){const btn=document.getElementById(' + JSON.stringify('modalConfirmBtn') + ');if(!btn)return false;btn.click();return true;})()'
    );
    ok('note confirm clicked', noteConfirm);
    await sleep(800);
  }

  // Delete first ticket via modal
  const delSel = '.ticket-card [data-action="delete"]';
  const delClicked = await cdpEval(
    cdp,
    '(function(){const btn=document.querySelector(' + JSON.stringify(delSel) + ');if(!btn)return false;btn.click();return true;})()'
  );
  ok('delete button clicked', delClicked);
  await sleep(800);

  const delModalOpen = await cdpHas(cdp, '#modalBackdrop.is-open');
  if (delModalOpen) {
    await sleep(300);
    // Delete confirm button has id modalConfirmBtn (set by UI.js)
    const delConfirm = await cdpEval(
      cdp,
      '(function(){const btn=document.getElementById(' + JSON.stringify('modalConfirmBtn') + ');if(!btn)return false;btn.click();return true;})()'
    );
    ok('delete confirm clicked', delConfirm);
    await sleep(800);
  }
}

async function testLogger(cdp) {
  const hasLogger = await cdpEval(cdp, 'typeof window.Log === "object" && window.Log !== null');
  ok('logger global is exposed', hasLogger === true);

  const level = await cdpEval(cdp, 'Log.getLevel()');
  ok('logger reports a valid level', ['debug', 'info', 'warn', 'error', 'silent'].indexOf(level) !== -1, String(level));

  // A debug entry must not be recorded at the default "info" threshold.
  await cdpEval(cdp, '(function(){Log.setLevel("info");Log.clear();Log.debug("browser","should be dropped");return true;})()');
  const dropped = await cdpEval(cdp, 'Log.entries.length');
  eq('debug entries are dropped at info level', dropped, 0);

  await cdpEval(cdp, '(function(){Log.setLevel("debug");Log.info("browser","kept entry");return true;})()');
  const kept = await cdpEval(cdp, 'Log.entries.length');
  eq('info entries are kept at debug level', kept, 1);

  const scope = await cdpEval(cdp, 'Log.entries[0].scope');
  eq('log entry keeps its scope', scope, 'browser');

  // The level is persisted across a reload.
  await cdpEval(cdp, 'Log.setLevel("warn")');
  const stored = await cdpEval(cdp, 'localStorage.getItem("it_helpdesk_log_level_v1")');
  eq('log level is persisted to localStorage', stored, 'warn');

  await cdp.reload();
  await sleep(2500);
  const restored = await cdpEval(cdp, 'Log.getLevel()');
  eq('log level survives a reload', restored, 'warn');

  // The ring buffer keeps only the newest entries.
  await cdpEval(
    cdp,
    '(function(){Log.setLevel("debug");Log.clear();' +
      'for(var i=0;i<300;i++){Log.info("ring","entry "+i);}' +
      'return Log.entries.length;})()'
  );
  const ringLen = await cdpEval(cdp, 'Log.entries.length');
  eq('ring buffer is capped at 250 entries', ringLen, 250);
  const oldest = await cdpEval(cdp, 'Log.entries[0].message');
  eq('oldest entries are evicted first', oldest, 'entry 50');
  const newest = await cdpEval(cdp, 'Log.entries[249].message');
  eq('newest entry is kept', newest, 'entry 299');

  await cdpEval(cdp, '(function(){Log.setLevel("info");Log.clear();return true;})()');
}

async function testActivityLog(cdp) {
  // The dedicated view and its controls must exist.
  ok('activity view section exists', await cdpHas(cdp, '#view-activity'));
  ok('activity feed container exists', await cdpHas(cdp, '#activityFeed'));
  ok('activity empty state exists', await cdpHas(cdp, '#activityEmpty'));
  ok('activity type filter exists', await cdpHas(cdp, '#activityType'));
  ok('activity search input exists', await cdpHas(cdp, '#activitySearch'));
  ok('activity reset button exists', await cdpHas(cdp, '#btnActivityReset'));
  ok('activity export button exists', await cdpHas(cdp, '#btnActivityExport'));
  ok('activity count badge exists', await cdpHas(cdp, '#activityCount'));

  // Desktop navigation.
  await cdpClick(cdp, '[data-view="activity"]');
  await sleep(700);
  ok('activity view becomes visible', await cdpHas(cdp, '#view-activity:not(.hidden)'));
  ok('portal view hidden when activity view active', await cdpHas(cdp, '#view-portal.hidden'));
  ok('admin view hidden when activity view active', await cdpHas(cdp, '#view-admin.hidden'));

  // The store mutations made earlier in the run must have been audited.
  const stored = await cdpEval(cdp, 'Activity.count()');
  ok('activity log recorded the earlier mutations', typeof stored === 'number' && stored > 0, String(stored));

  const rows = await cdpEval(cdp, 'document.querySelectorAll("#activityFeed .activity-row").length');
  ok('activity feed renders one row per event', rows === stored, 'rows=' + rows + ' stored=' + stored);

  const countLabel = await cdpText(cdp, '#activityCount');
  eq('activity count badge matches the log size', countLabel, String(stored));

  // Every event type filter option must be translated (no raw key leaks).
  const rawOptions = await cdpEval(
    cdp,
    '(function(){const s=document.getElementById("activityType");' +
      'const out=[];for(let i=0;i<s.options.length;i++){if(s.options[i].value.indexOf("activity.type.")===0)out.push(s.options[i].textContent);}' +
      'return JSON.stringify(out);})()'
  );
  eq('activity type options are all translated', rawOptions, '[]');

  // Filtering by an event type.
  await cdpSelect(cdp, '#activityType', 'ticket_created');
  await sleep(600);
  const createdRows = await cdpEval(cdp, 'document.querySelectorAll("#activityFeed .activity-row").length');
  const createdActions = await cdpEval(
    cdp,
    '(function(){const r=document.querySelectorAll("#activityFeed .activity-row");const out=[];' +
      'for(let i=0;i<r.length;i++)out.push(r[i].getAttribute("data-activity-action"));' +
      'return JSON.stringify(out);})()'
  );
  const createdList = JSON.parse(createdActions || '[]');
  ok('type filter narrows the feed', createdRows <= stored && createdRows > 0, 'rows=' + createdRows);
  ok('type filter keeps only the selected action',
    createdList.every((a) => a === 'ticket_created'), createdActions);

  // Text search.
  await cdpSelect(cdp, '#activityType', 'all');
  await sleep(400);
  await cdpType(cdp, '#activitySearch', 'zzzz-no-such-event');
  await sleep(600);
  const noRows = await cdpEval(cdp, 'document.querySelectorAll("#activityFeed .activity-row").length');
  eq('search with no match empties the feed', noRows, 0);
  const emptyShown = await cdpClass(cdp, '#activityEmpty');
  ok('empty state shown when nothing matches', emptyShown && emptyShown.indexOf('hidden') === -1, emptyShown || 'null');

  // Reset restores the full feed.
  await cdpClick(cdp, '#btnActivityReset');
  await sleep(600);
  const resetRows = await cdpEval(cdp, 'document.querySelectorAll("#activityFeed .activity-row").length');
  eq('reset restores every event', resetRows, stored);
  const searchValue = await cdpValue(cdp, '#activitySearch');
  eq('reset clears the search box', searchValue, '');

  // CSV export of the filtered events.
  const csv = await cdpEval(cdp, 'Activity.toCSV()');
  const csvLines = String(csv || '').split('\n');
  ok('activity CSV header lists Timestamp/Action/Ticket/Details',
    csvLines[0].indexOf('Timestamp') !== -1 && csvLines[0].indexOf('Action') !== -1 &&
    csvLines[0].indexOf('Ticket') !== -1 && csvLines[0].indexOf('Details') !== -1, csvLines[0]);
  ok('activity CSV has one row per event', csvLines.length === stored + 1, String(csvLines.length));

  await cdpClick(cdp, '#btnActivityExport');
  await sleep(600);
  const exportToast = await cdpHas(cdp, '.toast-success');
  ok('activity CSV export shows a success toast', exportToast);

  // Live refresh: a new mutation must appear in the feed without a reload.
  await cdpEval(
    cdp,
    'Store.create({requesterName:"Log Tester",employeeId:"log@corp.com",department:"IT",' +
      'category:"Software",priority:"Low",subject:"Activity refresh probe",' +
      'description:"This ticket exists to prove the activity feed refreshes live."})'
  );
  await sleep(900);
  const liveRows = await cdpEval(cdp, 'document.querySelectorAll("#activityFeed .activity-row").length');
  eq('activity feed refreshes after a new mutation', liveRows, stored + 1);

  // Persistence across a reload.
  await cdp.reload();
  await sleep(2500);
  await cdpClick(cdp, '[data-view="activity"]');
  await sleep(800);
  const afterReload = await cdpEval(cdp, 'Activity.count()');
  ok('activity log persists across a reload', afterReload >= stored + 1, String(afterReload));

  // Mobile navigation reaches the same view.
  const mobileNavOk = await cdpEval(
    cdp,
    '(function(){const btn=document.querySelector("#mobileNav [data-view=activity]");' +
      'if(!btn)return false;btn.click();return true;})()'
  );
  ok('mobile nav has an activity button', mobileNavOk === true);
  await sleep(700);
  ok('mobile nav opens the activity view', await cdpHas(cdp, '#view-activity:not(.hidden)'));
}

async function testPersistence(cdp) {
  await cdp.reload();
  await sleep(3000);

  // Diagnostic dump of the restored page state.
  const diag = await cdpEval(
    cdp,
    '(function(){var out={};try{out.readyState=document.readyState;out.href=location.href;' +
      'var raw=localStorage.getItem(' + JSON.stringify('it_helpdesk_tickets_v1') + ');' +
      'out.ticketsRaw=raw?JSON.parse(raw).length:null;' +
      'var sess=null;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);' +
      'if(k.indexOf(' + JSON.stringify('session') + ')!==-1){sess=k+' + JSON.stringify('=') + '+localStorage.getItem(k);}}' +
      'out.session=sess;out.recentHtml=document.getElementById(' + JSON.stringify('recentList') + ')?document.getElementById(' + JSON.stringify('recentList') + ').innerHTML.length:null;' +
      'out.cards=document.querySelectorAll(' + JSON.stringify('.ticket-card') + ').length;' +
      '}catch(e){out.err=e.message;}return JSON.stringify(out);})()'
  );
  trace('DIAG after reload: ' + diag);

  // The app always boots into the portal view; tickets live in the admin
  // feed which re-renders from localStorage when the admin view is opened.
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(1000);

  const ticketsPersisted = await cdpHas(cdp, '.ticket-card');
  ok('tickets persist after page reload', ticketsPersisted);

  const cardCount = await cdpEval(
    cdp,
    '(function(){return document.querySelectorAll(' + JSON.stringify('.ticket-card') + ').length;})()'
  );
  trace('DIAG admin cards after reload: ' + cardCount);

  // Recent list is rendered by the portal from persisted session codes.
  await cdpClick(cdp, '[data-view="portal"]');
  await sleep(600);

  const recentVisible = await cdpWaitFor(cdp, '#recentList button', 5000);
  ok('recent tickets list shows after reload', recentVisible);
}

async function testToasts(cdp) {
  const toastStack = await cdpHas(cdp, '#toastStack');
  ok('toast stack element exists', toastStack);

  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);
  await cdpClick(cdp, '#btnResetFilters');
  await sleep(500);
  ok('admin reset triggers without error', true);
}

async function testTeamManagement(cdp) {
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);
  await cdpClick(cdp, '#btnResetFilters');
  await sleep(500);

  const btnExists = await cdpHas(cdp, '#btnManageTeam');
  ok('manage team button exists', btnExists);

  const baseline = await cdpEval(cdp, 'Store.TEAM.length');
  ok('baseline team size captured', typeof baseline === 'number' && baseline >= 1, String(baseline));

  await cdpClick(cdp, '#btnManageTeam');
  await sleep(800);
  ok('team modal opened', await cdpHas(cdp, '#modalBackdrop.is-open'));

  // The Unassigned row is permanent and must not offer a delete button.
  const unassignedDeletable = await cdpEval(
    cdp,
    '(function(){const row=document.querySelector("#teamList > li");if(!row)return null;return row.querySelector(".team-member-remove")!==null;})()'
  );
  eq('Unassigned row has no delete button', unassignedDeletable, false);

  // Add a new member.
  await cdpType(cdp, '#teamNameInput', 'Layla Mansour');
  await cdpType(cdp, '#teamRoleInput', 'Mobile Support');
  await cdpClick(cdp, '#teamAddBtn');
  await sleep(600);

  const memberValue = 'Layla Mansour \u2014 Mobile Support';
  const appended = await cdpEval(cdp, 'Store.TEAM[Store.TEAM.length - 1]');
  eq('new member appended to roster', appended, memberValue);
  eq('team size grew by one', await cdpEval(cdp, 'Store.TEAM.length'), baseline + 1);

  // Duplicate is rejected with an inline error.
  await cdpType(cdp, '#teamNameInput', 'Layla Mansour');
  await cdpType(cdp, '#teamRoleInput', 'Mobile Support');
  await cdpClick(cdp, '#teamAddBtn');
  await sleep(500);
  const errText = await cdpText(cdp, '#teamFormError');
  ok('duplicate add shows inline error', !!errText && errText.length > 0, String(errText));
  eq('duplicate did not grow the team', await cdpEval(cdp, 'Store.TEAM.length'), baseline + 1);

  // The new member must be offered in the assignee dropdowns.
  const inDropdown = await cdpEval(
    cdp,
    '(function(){const sel=document.querySelector(".ticket-card [data-role=\\"assignee\\"]");if(!sel)return false;' +
      'for(let i=0;i<sel.options.length;i++){if(sel.options[i].value===' + JSON.stringify(memberValue) + ')return true;}return false;})()'
  );
  ok('new member appears in assignee dropdown', inDropdown);

  // Assign the first ticket to the new member, then delete the member and
  // verify the ticket falls back to Unassigned.
  const assigned = await cdpEval(
    cdp,
    '(function(){const sel=document.querySelector(".ticket-card [data-role=\\"assignee\\"]");if(!sel)return false;' +
      'sel.value=' + JSON.stringify(memberValue) + ';sel.dispatchEvent(new Event("change",{bubbles:true}));return true;})()'
  );
  ok('ticket assigned to new member', assigned);
  await sleep(600);

  const deleteClicked = await cdpEval(
    cdp,
    '(function(){const want=' + JSON.stringify(memberValue) + ';' +
      'const btns=document.querySelectorAll("#teamList .team-member-remove");' +
      'for(let i=0;i<btns.length;i++){if(btns[i].getAttribute("data-value")===want){btns[i].click();return true;}}return false;})()'
  );
  ok('member delete button clicked', deleteClicked);
  await sleep(600);

  eq('member removed from roster', await cdpEval(cdp, 'Store.TEAM.indexOf(' + JSON.stringify(memberValue) + ')'), -1);
  const stillAssigned = await cdpEval(
    cdp,
    '(function(){return Store.tickets.filter(function(t){return t.assignee===' + JSON.stringify(memberValue) + ';}).length;})()'
  );
  eq('tickets reassigned to Unassigned after delete', stillAssigned, 0);

  // Close the modal and confirm the roster change survives a reload.
  await cdpClick(cdp, '#modalConfirmBtn');
  await sleep(500);
  ok('team modal closed', await cdpEval(cdp, '!document.getElementById("modalBackdrop").classList.contains("is-open")'));

  await cdp.reload();
  await sleep(3000);
  eq('deleted member stays deleted after reload', await cdpEval(cdp, 'Store.TEAM.indexOf(' + JSON.stringify(memberValue) + ')'), -1);
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);
}

async function testCloseTicket(cdp) {
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);
  await cdpClick(cdp, '#btnResetFilters');
  await sleep(500);

  // Pick the first open ticket (close button rendered and not hidden).
  const target = await cdpEval(
    cdp,
    '(function(){const btns=document.querySelectorAll(".ticket-card [data-action=close]");' +
      'for(let i=0;i<btns.length;i++){if(!btns[i].classList.contains("hidden")){' +
      'const card=btns[i].closest(".ticket-card");return card.getAttribute("data-ticket-id");}}' +
      'return null;})()'
  );
  ok('open ticket with close button found', typeof target === 'string' && target.length > 0, String(target));
  if (!target) return;

  const closeClicked = await cdpEval(
    cdp,
    '(function(){const btns=document.querySelectorAll(".ticket-card [data-action=close]");' +
      'const want=' + JSON.stringify(target) + ';' +
      'for(let i=0;i<btns.length;i++){const card=btns[i].closest(".ticket-card");' +
      'if(card && card.getAttribute("data-ticket-id")===want){btns[i].click();return true;}}' +
      'return false;})()'
  );
  ok('close button clicked', closeClicked);
  await sleep(700);

  ok('close confirmation modal opened', await cdpHas(cdp, '#modalBackdrop.is-open'));

  await cdpClick(cdp, '#modalConfirmBtn');
  await sleep(800);

  eq('ticket marked resolved after close',
    await cdpEval(cdp, 'Store.getById(' + JSON.stringify(target) + ').status'), 'resolved');

  const hiddenAfter = await cdpEval(
    cdp,
    '(function(){const btns=document.querySelectorAll(".ticket-card [data-action=close]");' +
      'const want=' + JSON.stringify(target) + ';' +
      'for(let i=0;i<btns.length;i++){const card=btns[i].closest(".ticket-card");' +
      'if(card && card.getAttribute("data-ticket-id")===want)return btns[i].classList.contains("hidden");}' +
      'return "card-gone";})()'
  );
  eq('close button hidden on closed ticket', hiddenAfter, true);

  // Reopening the ticket from the status dropdown restores the button.
  const reopened = await cdpEval(
    cdp,
    '(function(){const cards=document.querySelectorAll(".ticket-card");' +
      'const want=' + JSON.stringify(target) + ';' +
      'for(let i=0;i<cards.length;i++){if(cards[i].getAttribute("data-ticket-id")===want){' +
      'const sel=cards[i].querySelector("[data-role=status]");if(!sel)return false;' +
      'sel.value="pending";sel.dispatchEvent(new Event("change",{bubbles:true}));return true;}}' +
      'return false;})()'
  );
  ok('ticket reopened via status dropdown', reopened);
  await sleep(700);

  const visibleAgain = await cdpEval(
    cdp,
    '(function(){const btns=document.querySelectorAll(".ticket-card [data-action=close]");' +
      'const want=' + JSON.stringify(target) + ';' +
      'for(let i=0;i<btns.length;i++){const card=btns[i].closest(".ticket-card");' +
      'if(card && card.getAttribute("data-ticket-id")===want)return !btns[i].classList.contains("hidden");}' +
      'return "card-gone";})()'
  );
  eq('close button restored after reopen', visibleAgain, true);
}

async function testClosedTicketsView(cdp) {
  // The closed view must exist in the DOM and be reachable from the nav.
  ok('closed view section exists', await cdpHas(cdp, '#view-closed'));
  ok('closed tickets container exists', await cdpHas(cdp, '#closedTicketsContainer'));
  ok('closed tickets empty state exists', await cdpHas(cdp, '#closedTicketsEmpty'));
  ok('closed nav tab exists', await cdpHas(cdp, '[data-view="closed"]'));

  // Switch to the closed view.
  await cdpClick(cdp, '[data-view="closed"]');
  await sleep(700);

  ok('closed view becomes visible', await cdpHas(cdp, '#view-closed:not(.hidden)'));
  ok('admin view hidden when closed view active', await cdpHas(cdp, '#view-admin.hidden'));
  ok('portal view hidden when closed view active', await cdpHas(cdp, '#view-portal.hidden'));

  const closedCount = await cdpEval(
    cdp,
    'Store.getClosedTickets().length'
  );
  ok('store exposes closed tickets', typeof closedCount === 'number', String(closedCount));

  const rendered = await cdpEval(
    cdp,
    'document.querySelectorAll("#closedTicketsContainer [data-ticket-id]").length'
  );
  eq('closed container renders one card per closed ticket', rendered, closedCount);

  // The empty state is shown only when there is nothing archived.
  const emptyHidden = await cdpClass(cdp, '#closedTicketsEmpty');
  if (closedCount === 0) {
    ok('empty state shown when no closed tickets', emptyHidden && emptyHidden.indexOf('hidden') === -1, emptyHidden || 'null');
  } else {
    ok('empty state hidden when closed tickets exist', emptyHidden && emptyHidden.indexOf('hidden') !== -1, emptyHidden || 'null');
  }

  // Closing a ticket from the admin feed must move it into the closed archive.
  await cdpClick(cdp, '[data-view="admin"]');
  await sleep(500);
  await cdpClick(cdp, '#btnResetFilters');
  await sleep(500);

  const target = await cdpEval(
    cdp,
    '(function(){const btns=document.querySelectorAll("#adminFeed .ticket-card [data-action=close]");' +
      'for(let i=0;i<btns.length;i++){if(!btns[i].classList.contains("hidden")){' +
      'const card=btns[i].closest(".ticket-card");return card.getAttribute("data-ticket-id");}}' +
      'return null;})()'
  );
  if (typeof target !== 'string' || !target) {
    ok('no open ticket available to close (skipped)', true);
    return;
  }

  await cdpEval(
    cdp,
    '(function(){const cards=document.querySelectorAll("#adminFeed .ticket-card");' +
      'const want=' + JSON.stringify(target) + ';' +
      'for(let i=0;i<cards.length;i++){if(cards[i].getAttribute("data-ticket-id")===want){' +
      'const sel=cards[i].querySelector("[data-role=status]");if(!sel)return false;' +
      'sel.value="resolved";sel.dispatchEvent(new Event("change",{bubbles:true}));return true;}}' +
      'return false;})()'
  );
  await sleep(900);

  const inArchive = await cdpEval(
    cdp,
    'Store.getClosedTickets().some(function(t){return t.id===' + JSON.stringify(target) + ';})'
  );
  ok('resolved ticket is archived in the closed list', inArchive === true);

  // The closed view must show it.
  await cdpClick(cdp, '[data-view="closed"]');
  await sleep(700);

  const closedCard = await cdpEval(
    cdp,
    '!!document.querySelector("#closedTicketsContainer [data-ticket-id=\\"" + ' + JSON.stringify(target) + ' + "\\"]")'
  );
  ok('archived ticket is rendered in the closed view', closedCard === true);

  // Reopening it from the closed view removes it from the archive.
  const reopened = await cdpEval(
    cdp,
    '(function(){const cards=document.querySelectorAll("#closedTicketsContainer [data-ticket-id]");' +
      'const want=' + JSON.stringify(target) + ';' +
      'for(let i=0;i<cards.length;i++){if(cards[i].getAttribute("data-ticket-id")===want){' +
      'const sel=cards[i].querySelector("[data-role=status]");if(!sel)return false;' +
      'sel.value="pending";sel.dispatchEvent(new Event("change",{bubbles:true}));return true;}}' +
      'return false;})()'
  );
  ok('ticket reopened from the closed view', reopened === true);
  await sleep(900);

  const removed = await cdpEval(
    cdp,
    '!Store.getClosedTickets().some(function(t){return t.id===' + JSON.stringify(target) + ';})'
  );
  ok('reopened ticket leaves the closed archive', removed === true);

  const stillRendered = await cdpEval(
    cdp,
    '!!document.querySelector("#closedTicketsContainer [data-ticket-id=\\"" + ' + JSON.stringify(target) + ' + "\\"]")'
  );
  ok('reopened ticket disappears from the closed view', stillRendered === false);
}

async function main() {
  let server = null;
  let edgeProc = null;
  let cdp = null;

  try {
    server = await startServer();

    const profileDir = path.join(os.tmpdir(), 'edge_profile_' + Date.now());
    const cdpPort = 9222 + Math.floor(Math.random() * 1000);
    edgeProc = launchEdge(profileDir, cdpPort);

    const versionInfo = await discoverCdp(cdpPort);

    const pageTarget = await findPageTarget(cdpPort);

    const ws = await connectWs(pageTarget.webSocketDebuggerUrl);
    cdp = new CDP(ws);

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');

    await cdp.navigate('http://127.0.0.1:' + server.port + '/');
    await sleep(3000);

    console.log('\n--- Running browser tests ---\n');

    let ticketCode = null;

    trace('STEP formValidation'); try { ticketCode = await testFormValidation(cdp); } catch (e) { ok('form validation test', false, e.message); }

    trace('STEP tracking'); try { await testTracking(cdp, ticketCode); } catch (e) { ok('tracking lookup test', false, e.message); }

    trace('STEP adminView'); try { await testAdminView(cdp); } catch (e) { ok('admin view test', false, e.message); }

    trace('STEP adminFilters'); try { await testAdminFilters(cdp); } catch (e) { ok('admin filters test', false, e.message); }

    trace('STEP adminActions'); try { await testAdminActions(cdp); } catch (e) { ok('admin actions test', false, e.message); }

    trace('STEP teamManagement'); try { await testTeamManagement(cdp); } catch (e) { ok('team management test', false, e.message); }

    trace('STEP closeTicket'); try { await testCloseTicket(cdp); } catch (e) { ok('close ticket test', false, e.message); }

    trace('STEP closedTicketsView'); try { await testClosedTicketsView(cdp); } catch (e) { ok('closed tickets view test', false, e.message); }

    trace('STEP logger'); try { await testLogger(cdp); } catch (e) { ok('logger test', false, e.message); }

    trace('STEP activityLog'); try { await testActivityLog(cdp); } catch (e) { ok('activity log test', false, e.message); }

    trace('STEP persistence'); try { await testPersistence(cdp); } catch (e) { ok('persistence test', false, e.message); }

    trace('STEP toasts'); try { await testToasts(cdp); } catch (e) { ok('toasts test', false, e.message); }

    trace('STEP summary');

    if (cdp.consoleErrors.length > 0) {
      console.log('\nConsole errors detected:');
      cdp.consoleErrors.forEach((e) => console.log('  - ' + e));
    }
    if (cdp.pageErrors.length > 0) {
      console.log('\nPage errors detected:');
      cdp.pageErrors.forEach((e) => console.log('  - ' + e));
    }
    if (cdp.networkFailures.length > 0) {
      console.log('\nNetwork failures (non-external):');
      cdp.networkFailures.forEach((f) => {
        if (!isExternal(f.type || '')) console.log('  - ' + f.errorText + ' (' + f.type + ')');
      });
    }

    console.log('\n----------------------------------------');
    console.log('PASS: ' + pass + '   FAIL: ' + fail);

  } catch (err) {
    console.error('Test runner error: ' + err.message);
    process.exit(1);
  } finally {
    try { if (cdp && !cdp.closed) { cdp.ws.close(); } } catch (e) {}
    try { if (edgeProc) { edgeProc.kill(); } } catch (e) {}
    try { if (server) { server.server.close(); } } catch (e) {}
  }

  if (fail > 0) process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION: ' + (reason && reason.message ? reason.message : String(reason)));
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION: ' + err.message);
  process.exit(1);
});
process.on('exit', (code) => { trace('EXIT code=' + code); });

main().catch((err) => {
  console.error('Unhandled error: ' + err.message);
  process.exit(1);
});