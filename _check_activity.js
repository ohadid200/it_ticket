/* Quick interactive check of the Activity Log button against a running server.
   Usage:  node _check_activity.js <url>                                */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_ = process.argv[2] || 'http://127.0.0.1:8080/';
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = 9333;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'actchk-'));
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      const j = await res.json();
      wsUrl = j.webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
  }
  if (!wsUrl) { console.log('CDP not reachable'); proc.kill(); process.exit(1); }

  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: '(' + expr + ')', awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await send('Page.navigate', { url: URL_ });
  await sleep(5000);
  console.log('Viewport width              :', await evaluate('window.innerWidth'));
  console.log('Nav computed display        :', await evaluate(
    'getComputedStyle(document.querySelector(\'nav[role=tablist]\')).display'));

  console.log('--- Desktop nav ---');
  console.log('Activity Log button exists :', await evaluate(
    '!!document.querySelector(\'nav [data-view="activity"]\')'));
  console.log('Button label                :', await evaluate(
    '(document.querySelector(\'nav [data-view="activity"]\')||{}).innerText||"(none)"'));
  console.log('Button visible (has box)    :', await evaluate(
    '(function(){const b=document.querySelector(\'nav [data-view="activity"]\');' +
    'if(!b)return false;const r=b.getBoundingClientRect();' +
    'return r.width>0&&r.height>0&&getComputedStyle(b).display!=="none";})()'));
  console.log('Button rect                 :', await evaluate(
    '(function(){const b=document.querySelector(\'nav [data-view="activity"]\');' +
    'if(!b)return "n/a";const r=b.getBoundingClientRect();' +
    'return Math.round(r.x)+","+Math.round(r.y)+" "+Math.round(r.width)+"x"+Math.round(r.height);})()'));

  console.log('--- Clicking it ---');
  console.log('Click dispatched            :', await evaluate(
    '(function(){const b=document.querySelector(\'nav [data-view="activity"]\');' +
    'if(!b)return false;b.click();return true;})()'));
  await sleep(1200);
  console.log('Activity view visible       :', await evaluate(
    '!!document.querySelector("#view-activity:not(.hidden)")'));
  console.log('Portal view hidden          :', await evaluate(
    '!!document.querySelector("#view-portal.hidden")'));
  console.log('Activity feed present       :', await evaluate(
    '!!document.getElementById("activityFeed")'));
  console.log('Events shown                :', await evaluate(
    'document.getElementById("activityCount").textContent'));
  console.log('Feed rows rendered          :', await evaluate(
    'document.querySelectorAll("#activityFeed > *").length'));
  console.log('Type filter options         :', await evaluate(
    'document.getElementById("activityType").options.length'));

  console.log('--- Mobile nav ---');
  console.log('Mobile activity button      :', await evaluate(
    '!!document.querySelector(\'#mobileNav [data-view="activity"]\')'));

  console.log('--- Making a real mutation ---');
  await evaluate('App.setView("portal")');
  await sleep(600);
  console.log('Form submit dispatched      :', await evaluate(
    '(function(){document.getElementById("reqName").value="Manual User";' +
    'document.getElementById("reqId").value="manual@corp.com";' +
    'document.getElementById("reqDept").selectedIndex=1;' +
    'document.getElementById("reqCategory").selectedIndex=1;' +
    'document.getElementById("reqPriority").selectedIndex=1;' +
    'document.getElementById("reqSubject").value="Manual test ticket";' +
    'document.getElementById("reqDescription").value="Created from the live check script.";' +
    'document.getElementById("ticketForm").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true}));' +
    'return true;})()'));
  await sleep(1500);
  await evaluate('App.setView("activity")');
  await sleep(1200);
  console.log('Events shown after mutation :', await evaluate(
    'document.getElementById("activityCount").textContent'));
  console.log('Feed rows after mutation     :', await evaluate(
    'document.querySelectorAll("#activityFeed > *").length'));
  console.log('First row text               :', await evaluate(
    '(document.querySelector("#activityFeed > *")||{}).innerText||"(none)"'));
  console.log('Empty state hidden           :', await evaluate(
    'document.getElementById("activityEmpty").classList.contains("hidden")'));
  console.log('CSV header                   :', await evaluate(
    'Activity.toCSV().split("\\n")[0]'));
  console.log('Persisted in localStorage    :', await evaluate(
    'JSON.parse(localStorage.getItem("it_helpdesk_activity_v1")).length'));

  console.log('--- Reload persistence ---');
  await send('Page.reload');
  await sleep(4000);
  await evaluate('App.setView("activity")');
  await sleep(1200);
  console.log('Events shown after reload   :', await evaluate(
    'document.getElementById("activityCount").textContent'));
  console.log('Feed rows after reload       :', await evaluate(
    'document.querySelectorAll("#activityFeed > *").length'));

  ws.close();
  proc.kill();
  await sleep(500);
  process.exit(0);
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
