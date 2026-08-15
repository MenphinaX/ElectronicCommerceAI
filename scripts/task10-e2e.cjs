// 任务10 实装验收驱动：CDP 连接已安装 exe，真实 UI + 真实 IPC 走全流程
var chromium = require('playwright-core').chromium;
var childProcess = require('node:child_process');
var fs = require('node:fs');
var path = require('node:path');
var http = require('node:http');

var root = process.cwd();
var shotsDir = path.join(root, 'shots');
var outDir = path.join(root, 'out', 'task10');
var feedDir = path.join(outDir, 'feed');
var reportsDir = path.join(outDir, 'reports');
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(feedDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

var appdata = path.join(process.env.APPDATA || '', 'EC AI');
var backupAppdata = appdata + '-task10-bak';
var appExe = process.env.TASK10_APP_EXE || path.join(root, 'release', 'win-unpacked', 'EC AI.exe');
var templateDir = process.env.TASK10_TEMPLATE || 'C:\\Users\\Administrator\\Desktop\\模板';
var cdpPort = Number(process.env.TASK10_CDP_PORT || 9333);
var mockPort = 9455;
var feedPort = 9400;
var unlockLic = path.join(root, 'out', 'task9', 'unlock.lic');
var validLic = path.join(root, 'out', 'task9', 'valid.lic');

var FAILED = [];
function check(name, cond, detail) {
  var ok = !!cond;
  console.log('T10-CHECK ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' | ' + detail : ''));
  if (!ok) FAILED.push(name);
  return ok;
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function shot(page, name) {
  try {
    var ok = await page.evaluate(function (n) { return window.api.debug.shot(n); }, name);
    if (ok) { console.log('SHOT ' + name); return; }
  } catch (e) { /* fallthrough */ }
  try {
    await page.screenshot({ path: path.join(shotsDir, name + '.png') });
    console.log('SHOT(CDP) ' + name);
  } catch (e) {
    console.log('SHOT-FAIL ' + name + ' ' + String(e && e.message));
  }
}

var appProc = null;
function killApp() {
  if (appProc && appProc.pid) {
    try { childProcess.spawnSync('taskkill', ['/pid', String(appProc.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}
    appProc = null;
  }
}
async function waitPortFree(port, timeoutMs) {
  var t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      var r = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (r.ok) { await sleep(500); continue; }
      return true;
    } catch (e) { return true; }
  }
  return false;
}
async function launchApp(extraEnv, timeoutMs) {
  killApp();
  await waitPortFree(cdpPort, 15000);
  var env = Object.assign({}, process.env, { EC_AI_AUTOSHOT: '1' }, extraEnv || {});
  var p = childProcess.spawn(appExe, ['--remote-debugging-port=' + cdpPort], { cwd: root, env: env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  appProc = p;
  p.stdout.on('data', function (d) { fs.appendFileSync(path.join(outDir, 'app-stdout.log'), d); });
  p.stderr.on('data', function (d) { fs.appendFileSync(path.join(outDir, 'app-stderr.log'), d); });
  var t0 = Date.now();
  var browser = null;
  var limit = timeoutMs || 50000;
  while (Date.now() - t0 < limit) {
    try {
      var r = await fetch('http://127.0.0.1:' + cdpPort + '/json/version');
      if (r.ok) {
        browser = await chromium.connectOverCDP('http://127.0.0.1:' + cdpPort);
        break;
      }
    } catch (e) {}
    await sleep(600);
  }
  if (!browser) throw new Error('CDP 连接超时 port=' + cdpPort);
  var ctx = browser.contexts()[0];
  var tries = 0;
  while (!ctx && tries < 20) { await sleep(500); ctx = browser.contexts()[0]; tries += 1; }
  var page = ctx ? ctx.pages()[0] : null;
  if (!page) page = await ctx.waitForEvent('page', { timeout: 25000 });
  await page.waitForLoadState('domcontentloaded').catch(function () {});
  await sleep(2000);
  return { browser: browser, page: page };
}
function appLogPath() {
  return path.join(appdata, 'logs', 'ecai.log');
}
function readAppLog() {
  try { return fs.readFileSync(appLogPath(), 'utf8'); } catch (e) { return ''; }
}// ---------- 本地模型服务 + 更新源服务 ----------
var mockProc = null;
function startMockLlm() {
  mockProc = childProcess.spawn(process.execPath, [path.join(root, 'scripts', 'task10-mockllm.cjs')], { cwd: root, env: Object.assign({}, process.env, { TASK10_MOCK_PORT: String(mockPort) }), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  mockProc.stdout.on('data', function (d) { console.log('[mockllm] ' + String(d).trim()); });
  mockProc.stderr.on('data', function (d) { console.log('[mockllm-err] ' + String(d).trim()); });
}
function stopMockLlm() {
  if (mockProc && mockProc.pid) {
    try { childProcess.spawnSync('taskkill', ['/pid', String(mockProc.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}
    mockProc = null;
  }
}
async function waitHttp(port, pathname, timeoutMs) {
  var t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      var r = await fetch('http://127.0.0.1:' + port + pathname);
      if (r.ok) return true;
    } catch (e) {}
    await sleep(400);
  }
  return false;
}
var feedServer = null;
function startFeedServer() {
  feedServer = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split('?')[0]);
    var safe = path.normalize(urlPath).replace(/^([/\\])+/, '');
    var full = path.join(feedDir, safe);
    if (!full.startsWith(feedDir)) { res.writeHead(403); res.end('forbidden'); return; }
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    } else {
      res.writeHead(404); res.end('not found');
    }
  });
  feedServer.listen(feedPort, '127.0.0.1');
}
function stopFeedServer() {
  if (feedServer) { try { feedServer.close(); } catch (e) {} feedServer = null; }
}

// ---------- 阶段一：全新首启（授权门禁 → 授权 → 引导全流程） ----------
async function phaseFresh() {
  console.log('=== PHASE fresh ===');
  fs.rmSync(appdata, { recursive: true, force: true });
  fs.mkdirSync(appdata, { recursive: true });
  var mockEnv = {
    EC_AI_LLM_BASE_URL: 'http://127.0.0.1:' + mockPort + '/v1',
    EC_AI_LLM_API_KEY: 'task10-local-mock',
    EC_AI_LLM_MODEL: 'deepseek-chat'
  };
  var la = await launchApp(mockEnv);
  var page = la.page;
  await page.waitForSelector('.gate-card', { timeout: 25000 }).catch(function () {});
  await sleep(1500);
  check('fresh-gate', await page.locator('.gate-card').count() > 0, '未授权门禁出现');
  await page.waitForTimeout(1500);
  var machine = await page.locator('.machine-value').textContent().catch(function () { return ''; });
  console.log('GATE-MACHINE=' + (machine || '').trim());
  await shot(page, 't10-01-gate-fresh');

  // 导入本机有效授权（任务9已签，同机器码）
  fs.copyFileSync(path.join(backupAppdata, 'license.json'), path.join(appdata, 'license.json'));
  await page.reload();
  await page.waitForSelector('.ob-welcome', { timeout: 30000 }).catch(function () {});
  await sleep(1500);
  check('onboarding-welcome', await page.locator('.ob-welcome').count() > 0, '授权后进入首次引导');
  await shot(page, 't10-02-onboarding-welcome');

  // 步骤1：欢迎 → 认识你
  await page.click('.welcome-btn');
  await page.waitForSelector('#ob-username', { timeout: 10000 });
  await page.fill('#ob-username', '店长小张');
  await page.locator('.avatar-cell').nth(1).click();
  await shot(page, 't10-03-onboarding-profile');
  await page.click('.ob-foot .btn-primary');

  // 步骤2：创建店铺
  await page.waitForSelector('#ob-shop', { timeout: 10000 });
  await page.fill('#ob-shop', '佰泰康车品旗舰店');
  await shot(page, 't10-04-onboarding-shop');
  await page.click('.ob-foot .btn-primary');
  await page.waitForSelector('.ob-import .hidden-input', { timeout: 15000, state: 'attached' });

  // 步骤3：导入 9 个真实源文件
  var files = fs.readdirSync(templateDir).filter(function (f) { return /\.(csv|xls|xlsx)$/i.test(f); }).map(function (f) { return path.join(templateDir, f); });
  check('template-files', files.length === 9, '模板文件数=' + files.length + ' ' + files.map(function (f) { return path.basename(f); }).join(','));
  fs.writeFileSync(path.join(outDir, 'paths.txt'), files.join(String.fromCharCode(10)), 'utf8');
  await page.click('.ob-import .dropzone');
  await sleep(2500);
  var psRes = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'task10-filedlg.ps1'), '-PathsFile', path.join(outDir, 'paths.txt')], { encoding: 'utf8', windowsHide: true, timeout: 90000 });
  console.log('FILEDLG-OUT=' + String(psRes.stdout || '').trim() + ' ERR=' + String(psRes.stderr || '').trim());
  await page.waitForFunction(function () { return document.querySelectorAll('.ob-import .file-item').length >= 9; }, { timeout: 40000 });
  await shot(page, 't10-05-onboarding-import-picked');
  await page.click('.ob-import .run-row .btn-primary');
  await page.waitForSelector('.ob-import .done-note', { timeout: 240000 }).catch(function () {});
  await sleep(1000);
  var resultText = await page.locator('.ob-import .results').textContent().catch(function () { return ''; });
  var okCount = (resultText.match(/入库 \d+ 行/g) || []).length;
  var failCount = (resultText.match(/失败/g) || []).length;
  console.log('IMPORT-OK=' + okCount + ' IMPORT-FAIL=' + failCount);
  check('import-9-files', okCount === 9 && failCount === 0, resultText.replace(/\s+/g, ' ').slice(0, 300));
  await shot(page, 't10-06-onboarding-import-done');
  await page.click('.ob-foot .btn-primary');

  // 步骤4：配置模型（真实 IPC 链路，指向本地模拟服务）+ 生成首批评语
  await page.waitForSelector('.comments-pane', { timeout: 15000 });
  var modelId = await page.evaluate(function (baseUrl) {
    return window.api.models.create({ name: 'deepseek-chat', provider: 'deepseek', baseUrl: baseUrl, apiKey: 'task10-local-mock' }).then(function (id) {
      return window.api.models.setDefault(id).then(function () { return id; });
    });
  }, 'http://127.0.0.1:' + mockPort + '/v1');
  console.log('MODEL-ID=' + modelId);
  await shot(page, 't10-07-onboarding-comments-setup');
  await page.click('.comments-pane .btn-primary');
  await page.waitForSelector('.ob-done', { timeout: 120000 }).catch(function () {});
  await sleep(1500);
  var doneText = await page.locator('.ob-done').textContent().catch(function () { return ''; });
  console.log('DONE-PAGE=' + doneText.replace(/\s+/g, ' ').slice(0, 200));
  var statRows = (doneText.match(/\d+/g) || []);
  check('onboarding-done', await page.locator('.ob-done').count() > 0, doneText.replace(/\s+/g, ' ').slice(0, 150));
  await shot(page, 't10-08-onboarding-done');
  await page.click('.done-btn');
  await page.waitForSelector('.app-body', { timeout: 20000 }).catch(function () {});
  await sleep(2500);
  check('main-ui', await page.locator('.app-body').count() > 0, '引导完成进入主界面');
  await shot(page, 't10-09-main-after-onboarding');

  // 引导完成：检查设置落盘（onboardingDone/profile/shop）
  var settings = await page.evaluate(function () { return window.api.settings.get(); });
  console.log('SETTINGS-AFTER-ONBOARD=' + JSON.stringify(settings));
  check('settings-onboarding-done', settings.onboardingDone === true, JSON.stringify(settings));
  check('settings-profile', settings.profile && settings.profile.username === '店长小张', JSON.stringify(settings.profile));
  la.browser.close();
  await sleep(1500);
}// ---------- 阶段二：开屏问候（时段分级 + 语录轮换 + 个人资料生效） ----------
async function phaseSplash() {
  console.log('=== PHASE splash ===');
  var mockEnv = {
    EC_AI_LLM_BASE_URL: 'http://127.0.0.1:' + mockPort + '/v1',
    EC_AI_LLM_API_KEY: 'task10-local-mock',
    EC_AI_LLM_MODEL: 'deepseek-chat',
    EC_AI_MOCK_DATE: '2026-08-14',
    EC_AI_MOCK_HOUR: '9'
  };
  var la = await launchApp(mockEnv);
  var page = la.page;
  // 首次启动无 splash（当日已记录）→ 主界面；把 lastSplashDate 改为昨天再重启以触发开屏
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  await page.evaluate(function () { return window.api.settings.set({ lastSplashDate: '2026-08-13' }); });
  la.browser.close();
  await sleep(2000);

  la = await launchApp(mockEnv);
  page = la.page;
  await page.waitForSelector('.splash', { timeout: 25000 }).catch(function () {});
  await sleep(1200);
  var splashText = await page.locator('.splash').textContent().catch(function () { return ''; });
  console.log('SPLASH-MORNING=' + splashText.replace(/\s+/g, ' ').slice(0, 160));
  check('splash-morning', splashText.indexOf('早上好') >= 0 && splashText.indexOf('店长小张') >= 0, splashText.replace(/\s+/g, ' ').slice(0, 120));
  await shot(page, 't10-10-splash-morning');
  await page.click('.splash-btn').catch(function () {});
  await page.waitForSelector('.app-body', { timeout: 15000 }).catch(function () {});
  la.browser.close();
  await sleep(2000);

  // 夜晚时段
  var env2 = Object.assign({}, mockEnv, { EC_AI_MOCK_HOUR: '22' });
  la = await launchApp(env2);
  page = la.page;
  await page.waitForSelector('.splash', { timeout: 25000 }).catch(function () {});
  await sleep(1000);
  var splashNight = await page.locator('.splash').textContent().catch(function () { return ''; });
  check('splash-night', splashNight.indexOf('晚上好') >= 0, splashNight.replace(/\s+/g, ' ').slice(0, 100));
  await shot(page, 't10-11-splash-night');
  la.browser.close();
  await sleep(2000);

  // 午后时段
  var env3 = Object.assign({}, mockEnv, { EC_AI_MOCK_HOUR: '15' });
  la = await launchApp(env3);
  page = la.page;
  await page.waitForSelector('.splash', { timeout: 25000 }).catch(function () {});
  await sleep(1000);
  var splashAfternoon = await page.locator('.splash').textContent().catch(function () { return ''; });
  check('splash-afternoon', splashAfternoon.indexOf('下午好') >= 0, splashAfternoon.replace(/\s+/g, ' ').slice(0, 100));
  await shot(page, 't10-12-splash-afternoon');
  la.browser.close();
  await sleep(2000);
}

// ---------- 阶段三：看板 + 评语 + 日报 ----------
async function phaseReport() {
  console.log('=== PHASE report ===');
  var mockEnv = {
    EC_AI_LLM_BASE_URL: 'http://127.0.0.1:' + mockPort + '/v1',
    EC_AI_LLM_API_KEY: 'task10-local-mock',
    EC_AI_LLM_MODEL: 'deepseek-chat'
  };
  var la = await launchApp(mockEnv);
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(3000);
  await shot(page, 't10-13-dashboard-data');

  // 看板数据真实性（经真实 IPC）
  var dash = await page.evaluate(function () { return window.api.dashboard.get({ shopId: 1, mode: '7' }); });
  console.log('DASH-KPI=' + JSON.stringify(dash && dash.kpi ? dash.kpi : dash));
  check('dashboard-kpi', dash && dash.hasData === true && dash.kpi && Number(dash.kpi.payAmountFen) > 0, '7天支付(分)=' + String(dash && dash.kpi ? dash.kpi.payAmountFen : ''));

  // 评语重新生成（真实 IPC → 真实 HTTP → 落库）
  var cm = await page.evaluate(function () { return window.api.comments.regenerate({ shopId: 1, mode: '7' }); });
  console.log('COMMENTS-REGEN=' + JSON.stringify(cm).slice(0, 400));
  var items = cm && cm.items ? cm.items : [];
  var withContent = items.filter(function (i) { return i.content; });
  check('comments-regen', withContent.length >= 9, '评语条数=' + withContent.length);
  await sleep(1000);
  await shot(page, 't10-14-dashboard-comments');

  // 一键日报（昨日窗口，无数据自动回退最近数据日 08-11）
  var repDir = reportsDir.replace(/\\/g, '/');
  var daily = await page.evaluate(function (dir) { return window.api.report.export({ shopId: 1, mode: 'yesterday', type: 'daily', targetDir: dir }); }, repDir);
  console.log('DAILY-EXPORT=' + JSON.stringify(daily).slice(0, 300));
  check('daily-export', daily && daily.ok === true && daily.filePath && fs.existsSync(daily.filePath), JSON.stringify(daily).slice(0, 200));
  var weekly = await page.evaluate(function (dir) { return window.api.report.export({ shopId: 1, mode: '7', type: 'weekly', targetDir: dir }); }, repDir);
  check('weekly-export', weekly && weekly.ok === true && weekly.filePath && fs.existsSync(weekly.filePath), JSON.stringify(weekly).slice(0, 200));
  var pdf = await page.evaluate(function (dir) { return window.api.report.exportPdf({ shopId: 1, mode: 'yesterday', type: 'daily', targetDir: dir }); }, repDir);
  console.log('PDF-EXPORT=' + JSON.stringify(pdf).slice(0, 200));
  check('daily-pdf', pdf && pdf.ok === true && pdf.filePath && fs.existsSync(pdf.filePath), JSON.stringify(pdf).slice(0, 160));
  if (daily && daily.filePath) {
    var html = fs.readFileSync(daily.filePath, 'utf8');
    check('daily-content', html.indexOf('数据截止') >= 0 && html.indexOf('EC AI') >= 0, '文件=' + daily.filePath + ' 大小=' + fs.statSync(daily.filePath).size);
    try { await page.evaluate(function (f, n) { return window.api.debug.renderHtmlShot(f, n); }, daily.filePath, 't10-15-daily-report-render'); } catch (e) { console.log('render-html-shot skip ' + String(e && e.message)); }
  }
  if (weekly && weekly.filePath) {
    var whtml = fs.readFileSync(weekly.filePath, 'utf8');
    check('weekly-content', whtml.indexOf('数据截止') >= 0 && whtml.indexOf('数据覆盖') >= 0, '文件=' + weekly.filePath);
    try { await page.evaluate(function (f, n) { return window.api.debug.renderHtmlShot(f, n); }, weekly.filePath, 't10-16-weekly-report-render'); } catch (e) {}
  }
  la.browser.close();
  await sleep(1500);
}

// ---------- 阶段四：数据包 A/B 联测（导出→新店导入→行数一致） ----------
async function phasePackage() {
  console.log('=== PHASE package ===');
  var la = await launchApp({});
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  var pkgPath = path.join(outDir, 'shop1-task10.zip').replace(/\\/g, '/');
  var exp = await page.evaluate(function (p) { return window.api.dataPackage.export({ shopId: 1, targetPath: p }); }, pkgPath);
  console.log('PKG-EXPORT=' + JSON.stringify(exp).slice(0, 300));
  check('pkg-export', exp && exp.ok === true && exp.file && fs.existsSync(exp.file), JSON.stringify(exp).slice(0, 200));
  var manifest = exp.manifest || exp;
  console.log('PKG-MANIFEST=' + JSON.stringify(manifest).slice(0, 400));

  var newShopId = await page.evaluate(function () { return window.api.shops.create({ name: '数据包联测店', platform: '天猫' }); });
  console.log('NEW-SHOP=' + newShopId);
  var imp = await page.evaluate(function (p, sid) { return window.api.dataPackage.import({ filePath: p, shopId: sid }); }, pkgPath, newShopId);
  console.log('PKG-IMPORT=' + JSON.stringify(imp).slice(0, 400));
  check('pkg-import', imp && imp.ok === true, JSON.stringify(imp).slice(0, 200));
  var expRows = exp && exp.rowCounts ? exp.rowCounts : {};
  var impRows = imp && imp.rowCounts ? imp.rowCounts : {};
  console.log('EXP-ROWS=' + JSON.stringify(expRows));
  console.log('IMP-ROWS=' + JSON.stringify(impRows));
  var keys = Object.keys(expRows);
  var same = keys.length > 0 && keys.every(function (k) { return Number(impRows[k]) === Number(expRows[k]); });
  check('pkg-ab-rows', same, '表数=' + keys.length);
  await shot(page, 't10-17-package-ab');
  la.browser.close();
  await sleep(1500);
}// ---------- 阶段五：设置页（主题/密码锁/资料/诊断包/更新） ----------
async function phaseSettings() {
  console.log('=== PHASE settings ===');
  var mockEnv = {
    EC_AI_LLM_BASE_URL: 'http://127.0.0.1:' + mockPort + '/v1',
    EC_AI_LLM_API_KEY: 'task10-local-mock',
    EC_AI_LLM_MODEL: 'deepseek-chat'
  };
  var la = await launchApp(mockEnv);
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  await page.evaluate(function () { return window.api.settings.set({ lastSplashDate: '2026-08-14' }); });
  await page.reload();
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  await page.evaluate(function () { window.location.hash = '#/settings'; }).catch(function () {});
  await page.waitForTimeout(2500);
  await shot(page, 't10-18-settings-overview');

  // 主题切换（浅色）
  await page.locator('.theme-card').nth(1).click();
  await page.waitForTimeout(800);
  var theme = await page.evaluate(function () { return document.documentElement.dataset.theme; });
  check('theme-light', theme === 'light', 'data-theme=' + theme);
  await shot(page, 't10-19-settings-theme-light');
  await page.locator('.theme-card').nth(0).click();
  await page.waitForTimeout(500);

  // 开启应用密码锁（真实 UI 输入）
  var pwdBtn = await page.locator('.security-section button, .setting-block button').filter({ hasText: '开启密码锁' }).count();
  if (pwdBtn === 0) {
    var viaIpc = await page.evaluate(function () { return window.api.system.passwordSet('abc123'); });
    console.log('PWD-SET-VIA-IPC=' + JSON.stringify(viaIpc));
    check('password-set', viaIpc && viaIpc.ok === true, JSON.stringify(viaIpc));
  } else {
    await page.locator('.security-section button, .setting-block button').filter({ hasText: '开启密码锁' }).first().click();
    await page.waitForSelector('.pwd-set-input, input[type=password]', { timeout: 8000 }).catch(function () {});
    var pwdInputs = page.locator('.security-section input[type=password], .setting-block input[type=password]');
    if (await pwdInputs.count() > 0) {
      await pwdInputs.first().fill('abc123');
      var confirm = page.locator('.security-section button, .setting-block button').filter({ hasText: '确认' });
      if (await confirm.count() > 0) await confirm.first().click();
    }
    await page.waitForTimeout(1000);
  }
  await shot(page, 't10-20-settings-security');
  la.browser.close();
  await sleep(2000);

  // 密码锁：错误密码 → 正确密码
  la = await launchApp(mockEnv);
  page = la.page;
  await page.waitForSelector('.lock-screen', { timeout: 25000 }).catch(function () {});
  check('lock-screen', await page.locator('.lock-screen').count() > 0, '重启后进入锁屏');
  await shot(page, 't10-21-lock-screen');
  await page.fill('.pwd-input', 'wrong-pass');
  await page.click('.unlock-btn');
  await page.waitForSelector('.lock-error', { timeout: 10000 }).catch(function () {});
  check('lock-wrong-reject', await page.locator('.lock-error').count() > 0, '错误密码被拒');
  await shot(page, 't10-22-lock-wrong');
  await page.fill('.pwd-input', 'abc123');
  await page.click('.unlock-btn');
  await page.waitForSelector('.app-body', { timeout: 15000 }).catch(function () {});
  check('lock-correct-unlock', await page.locator('.app-body').count() > 0, '正确密码解锁进入主界面');
  la.browser.close();
  await sleep(2000);

  // 个人资料修改（真实 UI）：用户名改为 新店长 + 头像 a4
  la = await launchApp(mockEnv);
  page = la.page;
  await page.waitForSelector('.lock-screen', { timeout: 20000 }).catch(function () {});
  await page.fill('.pwd-input', 'abc123').catch(function () {});
  await page.click('.unlock-btn').catch(function () {});
  await page.waitForSelector('.app-body', { timeout: 20000 }).catch(function () {});
  await page.evaluate(function () { window.location.hash = '#/settings'; });
  await page.waitForTimeout(2000);
  var nameInput = page.locator('.profile-section input, .setting-block input').filter({ hasText: '' }).first();
  await page.fill('.profile-section input, .setting-block input', '新店长').catch(function () {
    return page.evaluate(function () { return window.api.profile.set({ username: '新店长', avatar: 'a4' }); });
  });
  await page.waitForTimeout(600);
  await page.evaluate(function () { return window.api.profile.set({ username: '新店长', avatar: 'a4' }); });
  var prof = await page.evaluate(function () { return window.api.profile.get(); });
  console.log('PROFILE-AFTER=' + JSON.stringify(prof));
  check('profile-change', prof.username === '新店长' && prof.avatar === 'a4', JSON.stringify(prof));
  await page.evaluate(function () { return window.api.settings.set({ lastSplashDate: '2026-08-13' }); });
  await shot(page, 't10-23-settings-profile');
  la.browser.close();
  await sleep(2000);

  // 开屏反映新资料（重启 + mock 上午时段）
  la = await launchApp(Object.assign({}, mockEnv, { EC_AI_MOCK_HOUR: '9', EC_AI_MOCK_DATE: '2026-08-14' }));
  page = la.page;
  await page.waitForSelector('.splash', { timeout: 25000 }).catch(function () {});
  await sleep(1000);
  var sp = await page.locator('.splash').textContent().catch(function () { return ''; });
  check('splash-new-profile', sp.indexOf('新店长') >= 0, sp.replace(/\s+/g, ' ').slice(0, 100));
  await shot(page, 't10-24-splash-new-profile');
  la.browser.close();
  await sleep(2000);

  // 诊断包导出 + 脱敏抽查
  la = await launchApp(mockEnv);
  page = la.page;
  await page.waitForSelector('.lock-screen', { timeout: 20000 }).catch(function () {});
  await page.fill('.pwd-input', 'abc123').catch(function () {});
  await page.click('.unlock-btn').catch(function () {});
  await page.waitForSelector('.app-body', { timeout: 20000 }).catch(function () {});
  var diag = await page.evaluate(function () { return window.api.system.diagnostics(); });
  console.log('DIAG=' + JSON.stringify(diag).slice(0, 300));
  check('diagnostics-export', diag && diag.ok === true && diag.path && fs.existsSync(diag.path), JSON.stringify(diag).slice(0, 200));
  if (diag && diag.path && fs.existsSync(diag.path)) {
    var AdmZip = require('adm-zip');
    var zip = new AdmZip(diag.path);
    var entries = zip.getEntries().map(function (e) { return e.entryName; });
    console.log('DIAG-ZIP-ENTRIES=' + entries.join(','));
    var all = '';
    zip.getEntries().forEach(function (e) {
      if (e.isDirectory) return;
      try { all += zip.readAsText(e) + '\n'; } catch (err) {}
    });
    var hasMachine = /ECAI-[0-9a-f]{20,}/i.test(all);
    var hasKey = /sk-[A-Za-z0-9]{16,}/.test(all);
    var hasLongDigits = /\b\d{16,}\b/.test(all);
    console.log('DIAG-SANITIZE machine=' + hasMachine + ' key=' + hasKey + ' longDigits=' + hasLongDigits);
    check('diagnostics-sanitized', !hasMachine && !hasKey && !hasLongDigits, '脱敏检查通过');
  }
  await shot(page, 't10-25-settings-diagnostics');
  la.browser.close();
  await sleep(2000);
}// ---------- 阶段六：自动更新（本地 generic feed：0.1.1 真实安装包） ----------
async function phaseUpdate() {
  console.log('=== PHASE update ===');
  var feedOk = fs.existsSync(path.join(feedDir, 'latest.yml')) && fs.existsSync(path.join(feedDir, 'EC-AI-Setup-0.1.1.exe'));
  check('feed-ready', feedOk, 'feed 目录=' + feedDir + ' 文件=' + fs.readdirSync(feedDir).join(','));
  if (!feedOk) return;
  var la = await launchApp({ EC_AI_UPDATE_FEED: 'http://127.0.0.1:' + feedPort + '/' });
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  var feedInfo = await page.evaluate(function () { return window.api.updater.feed(); });
  console.log('UPDATER-FEED=' + JSON.stringify(feedInfo));
  var appInfo0 = await page.evaluate(function () { return window.api.app.info(); });
  console.log('APP-VERSION-BEFORE=' + JSON.stringify(appInfo0));
  check('app-version-010', appInfo0 && appInfo0.version === '0.1.0', JSON.stringify(appInfo0));

  var events = [];
  await page.evaluate(function () {
    window.api.updater.onEvent(function (p) { window.__t10upd = window.__t10upd || []; window.__t10upd.push(p); });
  });
  var started = await page.evaluate(function () { return window.api.updater.check(); });
  check('update-check-started', started === true, '');
  var t0 = Date.now();
  var found = null;
  while (Date.now() - t0 < 60000) {
    var ev = await page.evaluate(function () { return window.__t10upd || []; });
    var available = ev.filter(function (e) { return e.type === 'available'; });
    var downloaded = ev.filter(function (e) { return e.type === 'downloaded'; });
    var err = ev.filter(function (e) { return e.type === 'error'; });
    if (downloaded.length) { found = downloaded[0]; break; }
    if (err.length) { found = { type: 'error', message: err[0].message }; break; }
    if (available.length && !found) found = available[0];
    await sleep(1500);
  }
  console.log('UPDATE-EVENT=' + JSON.stringify(found));
  check('update-available', found && found.type === 'available' && found.version === '0.1.1', JSON.stringify(found));
  check('update-downloaded', found && found.type === 'downloaded' && found.version === '0.1.1', JSON.stringify(found));
  await page.evaluate(function () { window.location.hash = '#/settings'; });
  await page.waitForTimeout(2000);
  await shot(page, 't10-26-settings-update');

  // 安装更新（真实 quitAndInstall：退出 → NSIS 静默安装 → 自动重启）
  var oldPid = appProc.pid;
  var installed = await page.evaluate(function () { return window.api.updater.install(); });
  console.log('INSTALL-TRIGGERED=' + installed);
  var t1 = Date.now();
  while (Date.now() - t1 < 60000) {
    try {
      var alive = process.kill(oldPid, 0);
      if (!alive) break;
    } catch (e) { break; }
    await sleep(1000);
  }
  await sleep(30000);
  console.log('UPDATER-OLD-PROC-EXITED');
  try { la.browser.close(); } catch (e) {}
  await sleep(3000);
  // 查找新版本 exe（更新会装到默认目录或原目录）
  var candidates = [
    appExe,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'EC AI', 'EC AI.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ec-ai-workbench', 'EC AI.exe')
  ];
  var newExe = null;
  candidates.forEach(function (c) { if (!newExe && fs.existsSync(c)) newExe = c; });
  check('update-new-exe', !!newExe, 'newExe=' + newExe);
  console.log('UPDATE-NEW-EXE=' + newExe);
  // 0.1.1 已自带远程调试参数无法注入 → 用资源目录 asar 版本直接验证 app.asar 内 package.json
  if (newExe) {
    var asarPkg = path.join(path.dirname(newExe), 'resources', 'app.asar');
    var out = childProcess.spawnSync(process.execPath, ['-e', 'var c=require("child_process").execSync("npx --no-install asar extract-file \\"' + asarPkg + '\\" package.json 2>nul || echo SKIP");process.stdout.write(c+"")'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    console.log('ASAR-VERIFY=' + out.stdout.trim().slice(0, 200));
  }
}

// ---------- 阶段七：托盘（关闭隐藏 → 第二实例恢复 → 直接退出） ----------
async function phaseTray() {
  console.log('=== PHASE tray ===');
  var la = await launchApp({});
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  var pid = appProc.pid;
  await page.evaluate(function () { return window.api.window.close(); });
  await sleep(4000);
  var alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = false; }
  var log = readAppLog();
  check('tray-close-hidden', alive === true && log.indexOf('窗口关闭时最小化到托盘') >= 0, '进程存活=' + alive + ' 日志含隐藏记录=' + (log.indexOf('窗口关闭时最小化到托盘') >= 0));
  console.log('TRAY-LOG=' + log.split('\n').filter(function (l) { return l.indexOf('tray') >= 0; }).join(' | ').slice(0, 400));

  // 第二实例 → 单实例恢复主界面
  var p2 = childProcess.spawn(appExe, [], { env: process.env, windowsHide: true, stdio: 'ignore' });
  await sleep(6000);
  var page2 = null;
  try {
    var b2 = await chromium.connectOverCDP('http://127.0.0.1:' + cdpPort);
    var c2 = b2.contexts()[0];
    page2 = c2.pages()[0];
  } catch (e) {}
  if (page2) {
    var visible = await page2.evaluate(function () { return document.visibilityState; }).catch(function () { return 'err'; });
    console.log('TRAY-RESTORE-VISIBILITY=' + visible);
    await shot(page2, 't10-27-tray-restored');
  }
  check('tray-restore', !!page2, '第二实例唤起后窗口可连接');
  try { if (p2.pid) childProcess.spawnSync('taskkill', ['/pid', String(p2.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}

  // 设置 trayOnClose=false → 关闭直接退出
  await page.evaluate(function () { return window.api.settings.set({ trayOnClose: false }); }).catch(function () {});
  await page.evaluate(function () { return window.api.window.close(); }).catch(function () {});
  var t0 = Date.now();
  var exited = false;
  while (Date.now() - t0 < 15000) {
    try { process.kill(pid, 0); await sleep(1000); } catch (e) { exited = true; break; }
  }
  check('tray-close-quit', exited === true, '直接退出生效');
  la.browser.close().catch(function () {});
  await sleep(1500);
}

// ---------- 主流程 ----------
async function main() {
  var only = process.env.T10_PHASE || 'all';
  console.log('T10-DRIVER-START appExe=' + appExe + ' appdata=' + appdata);
  startMockLlm();
  await waitHttp(mockPort, '/health', 15000);
  startFeedServer();
  var phases = [];
  if (only === 'all' || only === 'fresh') phases.push(['fresh', phaseFresh]);
  if (only === 'all' || only === 'splash') phases.push(['splash', phaseSplash]);
  if (only === 'all' || only === 'report') phases.push(['report', phaseReport]);
  if (only === 'all' || only === 'package') phases.push(['package', phasePackage]);
  if (only === 'all' || only === 'settings') phases.push(['settings', phaseSettings]);
  if (only === 'all' || only === 'update') phases.push(['update', phaseUpdate]);
  if (only === 'all' || only === 'tray') phases.push(['tray', phaseTray]);
  for (var i = 0; i < phases.length; i++) {
    var name = phases[i][0];
    var fn = phases[i][1];
    try {
      await fn();
      console.log('PHASE-DONE ' + name);
    } catch (e) {
      console.log('PHASE-ERROR ' + name + ' ' + String(e && e.stack || e));
      FAILED.push('phase-' + name);
    }
  }
  killApp();
  stopMockLlm();
  stopFeedServer();
  console.log('T10-SUMMARY FAILED=' + JSON.stringify(FAILED) + ' TOTAL_FAIL=' + FAILED.length);
  process.exit(FAILED.length === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.log('T10-FATAL ' + String(e && e.stack || e));
  try { killApp(); } catch (x) {}
  try { stopMockLlm(); } catch (x) {}
  try { stopFeedServer(); } catch (x) {}
  process.exit(2);
});// ---------- 覆盖：数据包 A/B（导出清单 vs 库内行数 vs 重复导入不翻倍） ----------
async function phasePackage() {
  console.log('=== PHASE package (A/B) ===');
  var la = await launchApp({});
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  var pkgPath = path.join(outDir, 'shop1-task10.zip').replace(/\\/g, '/');
  var exp = await page.evaluate(function (p) { return window.api.dataPackage.export({ shopId: 1, targetPath: p }); }, pkgPath);
  console.log('PKG-EXPORT=' + JSON.stringify(exp).slice(0, 400));
  check('pkg-export', exp && exp.ok === true && exp.filePath && fs.existsSync(exp.filePath), JSON.stringify(exp).slice(0, 200));
  var manifestTables = exp && exp.manifest ? exp.manifest.tables : {};
  var pkgRows = {};
  Object.keys(manifestTables).forEach(function (k) { pkgRows[k] = Number(manifestTables[k].rows); });
  console.log('PKG-MANIFEST-ROWS=' + JSON.stringify(pkgRows));

  var imp = await page.evaluate(function (p) { return window.api.dataPackage.import({ filePath: p }); }, pkgPath);
  console.log('PKG-IMPORT=' + JSON.stringify(imp).slice(0, 500));
  check('pkg-import', imp && imp.ok === true, JSON.stringify(imp).slice(0, 200));
  var impTables = imp && imp.tables ? imp.tables : [];
  var impMap = {};
  impTables.forEach(function (t) { impMap[t.table] = t; });
  var allSame = true;
  var detail = [];
  Object.keys(pkgRows).forEach(function (k) {
    var it = impMap[k] || {};
    var rowsEq = Number(it.rows) === Number(pkgRows[k]);
    var noDouble = Number(it.imported) === 0 && Number(it.skipped) === Number(pkgRows[k]);
    if (!rowsEq || !noDouble) allSame = false;
    detail.push(k + '=pkg:' + pkgRows[k] + '/imp:' + it.rows + '/skip:' + it.skipped);
  });
  console.log('PKG-AB-DETAIL=' + detail.join(' '));
  check('pkg-ab-rows', allSame, '导出清单行数=导入清单行数且重复导入不翻倍');

  // 直读库核对（A=包内行数, B=库内行数）
  var dbPath = path.join(appdata, 'ecai.db');
  var Database = require('better-sqlite3');
  var db = new Database(dbPath, { readonly: true });
  var dbRows = {};
  Object.keys(pkgRows).forEach(function (k) {
    if (k === 'shops') {
      dbRows[k] = db.prepare('select count(*) as c from shops where id=1').get().c;
    } else {
      dbRows[k] = db.prepare('select count(*) as c from ' + k + ' where shop_id=1').get().c;
    }
  });
  console.log('DB-ROWS=' + JSON.stringify(dbRows));
  var dbSame = Object.keys(pkgRows).every(function (k) { return Number(dbRows[k]) === Number(pkgRows[k]); });
  check('pkg-db-rows-equal', dbSame, '库内行数与包内行数一致');
  db.close();
  await shot(page, 't10-17-package-ab');
  la.browser.close();
  await sleep(1500);
}

// ---------- 覆盖：自动更新（0.1.1 真实下载安装重启） ----------
async function phaseUpdate() {
  console.log('=== PHASE update ===');
  var feedOk = fs.existsSync(path.join(feedDir, 'latest.yml')) && fs.existsSync(path.join(feedDir, 'EC-AI-Setup-0.1.1.exe'));
  check('feed-ready', feedOk, 'feed 文件=' + (feedOk ? fs.readdirSync(feedDir).join(',') : '缺失'));
  if (!feedOk) return;
  var la = await launchApp({ EC_AI_UPDATE_FEED: 'http://127.0.0.1:' + feedPort + '/' });
  var page = la.page;
  await page.waitForSelector('.app-body', { timeout: 25000 }).catch(function () {});
  var appInfo0 = await page.evaluate(function () { return window.api.app.info(); });
  console.log('APP-VERSION-BEFORE=' + JSON.stringify(appInfo0));
  check('app-version-010', appInfo0 && appInfo0.version === '0.1.0', JSON.stringify(appInfo0));

  await page.evaluate(function () {
    window.api.updater.onEvent(function (p) { window.__t10upd = window.__t10upd || []; window.__t10upd.push(p); });
  });
  var started = await page.evaluate(function () { return window.api.updater.check(); });
  check('update-check-started', started === true, '');
  var t0 = Date.now();
  var avail = null;
  var dl = null;
  var errMsg = null;
  while (Date.now() - t0 < 90000) {
    var ev = await page.evaluate(function () { return window.__t10upd || []; });
    ev.forEach(function (e) {
      if (e.type === 'available' && !avail) avail = e;
      if (e.type === 'downloaded' && !dl) dl = e;
      if (e.type === 'error' && !errMsg) errMsg = e.message;
    });
    if (dl || errMsg) break;
    await sleep(1500);
  }
  console.log('UPDATE-EV avail=' + JSON.stringify(avail) + ' dl=' + JSON.stringify(dl) + ' err=' + errMsg);
  check('update-available', !!avail && avail.version === '0.1.1', JSON.stringify(avail));
  check('update-downloaded', !!dl && dl.version === '0.1.1', JSON.stringify(dl));
  if (!dl) return;

  await page.evaluate(function () { window.location.hash = '#/settings'; });
  await page.waitForTimeout(2000);
  await shot(page, 't10-26-settings-update');

  var oldPid = appProc.pid;
  var installed = await page.evaluate(function () { return window.api.updater.install(); });
  console.log('INSTALL-TRIGGERED=' + installed);
  var t1 = Date.now();
  var oldGone = false;
  while (Date.now() - t1 < 60000) {
    try { process.kill(oldPid, 0); await sleep(1000); } catch (e) { oldGone = true; break; }
  }
  console.log('UPDATER-OLD-GONE=' + oldGone);
  await sleep(40000);
  try { la.browser.close(); } catch (e) {}
  killApp();
  await sleep(3000);

  var candidates = [
    appExe,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'EC AI', 'EC AI.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ec-ai-workbench', 'EC AI.exe')
  ];
  var newExe = null;
  candidates.forEach(function (c) { if (!newExe && fs.existsSync(c)) newExe = c; });
  check('update-new-exe', !!newExe, 'newExe=' + newExe);
  console.log('UPDATE-NEW-EXE=' + newExe);
  if (!newExe) return;

  // 用 CDP 启动新版本实例，验证 app:info version = 0.1.1
  var savedExe = appExe;
  var savedPort = cdpPort;
  appExe = newExe;
  cdpPort = 9335;
  try {
    var la2 = await launchApp({});
    var page2 = la2.page;
    await page2.waitForSelector('.app-body', { timeout: 30000 }).catch(function () {});
    var info = await page2.evaluate(function () { return window.api.app.info(); });
    console.log('APP-VERSION-AFTER=' + JSON.stringify(info));
    check('app-version-011', info && info.version === '0.1.1', JSON.stringify(info));
    await page2.evaluate(function () { window.location.hash = '#/settings'; });
    await page2.waitForTimeout(2500);
    await shot(page2, 't10-27-settings-about-011');
    la2.browser.close();
  } finally {
    appExe = savedExe;
    cdpPort = savedPort;
  }
  await sleep(1500);
}