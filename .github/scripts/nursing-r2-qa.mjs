import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const OUT = 'nursing-r2-qa-output';
await mkdir(`${OUT}/screens`, { recursive: true });

const WORKER = 'https://dpro-home-nursing-line-api.dpromstk2000.workers.dev';
const ALLOWED_ORIGIN = 'https://dpromstk2000-lab.github.io';
const EXPECTED_WORKER_VERSION = 'NURSING-10-WORKER-20260730';
const ADMIN_CODE = '1234';

const viewports = [
  { name: 'pc1440', width: 1440, height: 1000 },
  { name: 'mobile390', width: 390, height: 844 },
  { name: 'mobile320', width: 320, height: 720 },
  { name: 'ipad1024', width: 1024, height: 768 }
];

const pages = [
  { name: 'live-root', url: 'https://dpromstk2000-lab.github.io/dpro-home-nursing-line/', publicSurface: true },
  { name: 'owner', url: 'https://dpromstk2000-lab.github.io/dpro-home-nursing-line/owner.html', publicSurface: false },
  { name: 'staff', url: 'https://dpromstk2000-lab.github.io/dpro-home-nursing-line/staff.html', publicSurface: false },
  { name: 'member', url: 'https://dpromstk2000-lab.github.io/dpro-home-nursing-line/member.html', publicSurface: true },
  { name: 'owner-ipad', url: 'https://dpromstk2000-lab.github.io/dpro-home-nursing-line/owner-ipad.html', publicSurface: false },
  { name: 'system-check', url: 'https://dpromstk2000-lab.github.io/dpro-home-nursing-line/system-check.html', publicSurface: false },
  { name: 'product-site', url: 'https://dpromstk2000-lab.github.io/dpro-line-systems-site/systems/home-nursing.html', publicSurface: true },
  { name: 'official-site', url: 'https://dpro-shop.com/systems/home-nursing', publicSurface: true },
  { name: 'sales-lp', url: 'https://dpromstk2000-lab.github.io/dpro-line-systems-site/lp-homenursing.html', publicSurface: true },
  { name: 'a4-html', url: 'https://dpromstk2000-lab.github.io/dpro-line-systems-site/flyer-homenursing.html', publicSurface: true, printSurface: true }
];

const pdfUrl = 'https://dpromstk2000-lab.github.io/dpro-line-systems-site/flyer-homenursing.pdf';

const result = {
  generated_at: new Date().toISOString(),
  system_code: 'NURSING',
  r2: true,
  expected_worker_version: EXPECTED_WORKER_VERSION,
  browser: [],
  runtime: [],
  failures: [],
  notes: [
    'LINE wrong-audience/expired vectors are synthetic JWT-style negative vectors. They prove the deployed Worker does not accept forged claim-bearing tokens; they are not LINE-signed expired/wrong-aud tokens.',
    'Staff E2E intentionally reissues the DEMO-MANAGER access code twice and revokes demo sessions. It does not disable the manager or create a QA staff row. The R2 controller must restore the pre-QA access_code_hash in Supabase after this workflow.'
  ]
};

function recordFailure(area, message, extra = {}) {
  result.failures.push({ area, message, ...extra });
}

function assert(condition, area, message, extra = {}) {
  if (!condition) {
    recordFailure(area, message, extra);
    throw new Error(`[${area}] ${message}`);
  }
}

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForHttp(url, expected = 200, attempts = 18) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const r = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      last = { status: r.status, finalUrl: r.url };
      if (r.status === expected) return last;
    } catch (error) {
      last = { error: String(error) };
    }
    await sleep(5000);
  }
  return last;
}

async function jsonRequest(path, { method = 'GET', token = '', body, origin = ALLOWED_ORIGIN, headers = {} } = {}) {
  const h = new Headers(headers);
  h.set('Accept', 'application/json');
  if (origin) h.set('Origin', origin);
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  const response = await fetch(`${WORKER}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
  let data = null;
  const text = await response.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 1000) }; }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data };
}

function randomCode() {
  return `R2-${crypto.randomBytes(18).toString('base64url')}`;
}

function unsignedJwt(payload) {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.`;
}

async function runtimeQa() {
  const healthWait = await waitForHttp(`${WORKER}/health`, 200, 8);
  assert(healthWait?.status === 200, 'runtime', 'Worker /health did not become HTTP 200', { healthWait });

  const health = await jsonRequest('/health');
  result.runtime.push({ test: 'health', status: health.status, data: health.data });
  assert(health.status === 200, 'runtime', '/health is not 200', { status: health.status });
  assert(health.data?.version === EXPECTED_WORKER_VERSION, 'runtime', 'Worker version mismatch', { observed: health.data?.version });
  assert(health.data?.database === 'connected', 'runtime', 'Worker database is not connected', { observed: health.data?.database });
  assert(health.data?.demo_environment_prepare === true, 'runtime', 'demo_environment_prepare flag is not true');
  assert(health.data?.final_system_check === true, 'runtime', 'final_system_check flag is not true');

  const cors = await fetch(`${WORKER}/v1/admin/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization'
    },
    redirect: 'manual'
  });
  result.runtime.push({ test: 'cors-deny', status: cors.status, allowOrigin: cors.headers.get('access-control-allow-origin') });
  assert(cors.status === 401 || cors.status === 403, 'security', 'Disallowed CORS origin was not rejected', { status: cors.status });
  assert(cors.headers.get('access-control-allow-origin') !== 'https://evil.example', 'security', 'Disallowed origin was reflected as allowed CORS origin');

  const config = await jsonRequest('/v1/config');
  result.runtime.push({ test: 'public-config', status: config.status, data: config.data });
  assert(config.status === 200 && config.data?.ok === true, 'runtime', '/v1/config failed');

  const login = await jsonRequest('/v1/admin/login', { method: 'POST', body: { admin_code: ADMIN_CODE } });
  result.runtime.push({ test: 'admin-login', status: login.status, ok: login.data?.ok ?? Boolean(login.data?.token) });
  assert(login.status === 200 && login.data?.token, 'auth', 'Demo admin login failed');
  const adminToken = login.data.token;

  const systemCheck = await jsonRequest('/v1/system-check', { token: adminToken });
  result.runtime.push({ test: 'system-check', status: systemCheck.status, data: systemCheck.data });
  assert(systemCheck.status === 200, 'runtime', '/v1/system-check failed');
  const failingChecks = (systemCheck.data?.checks || []).filter(x => String(x.status).toLowerCase() === 'fail');
  assert(failingChecks.length === 0, 'runtime', 'Server system-check contains FAIL', { failingChecks });

  const idem = `nursing-r2-${crypto.randomUUID()}`;
  const prep1 = await jsonRequest('/v1/admin/demo/prepare', {
    method: 'POST', token: adminToken, body: {}, headers: { 'Idempotency-Key': idem }
  });
  const prep2 = await jsonRequest('/v1/admin/demo/prepare', {
    method: 'POST', token: adminToken, body: {}, headers: { 'Idempotency-Key': idem }
  });
  result.runtime.push({ test: 'demo-prepare-1', status: prep1.status, data: prep1.data });
  result.runtime.push({ test: 'demo-prepare-idempotent-repeat', status: prep2.status, data: prep2.data });
  assert(prep1.status >= 200 && prep1.status < 300, 'demo', 'demo_prepare first request failed', { status: prep1.status });
  assert(prep2.status >= 200 && prep2.status < 300, 'demo', 'demo_prepare idempotent repeat failed', { status: prep2.status });
  const patientNumber = prep1.data?.credentials?.patient_number || prep1.data?.patient_number;
  assert(patientNumber === 'DEMO-PATIENT-01', 'demo', 'demo_prepare returned unexpected patient', { patientNumber });

  // LINE negative security vectors. The endpoint uses Bearer as LIFF ID Token in current frontend.
  const lineBody = {
    member_number: 'DEMO-PATIENT-01',
    member_phone: '09000000000',
    link_relationship: '本人',
    linked_person_type: 'patient',
    line_user_id: 'U_RAW_ID_MUST_NOT_BE_AUTHORITY'
  };
  const lineVectors = [
    { name: 'invalid-opaque-token', token: 'not-a-valid-line-id-token' },
    { name: 'wrong-aud-synthetic', token: unsignedJwt({ iss: 'https://access.line.me', sub: 'U_FAKE', aud: 'WRONG_AUDIENCE', exp: Math.floor(Date.now()/1000)+3600 }) },
    { name: 'expired-synthetic', token: unsignedJwt({ iss: 'https://access.line.me', sub: 'U_FAKE', aud: 'SYNTHETIC', exp: Math.floor(Date.now()/1000)-3600 }) }
  ];
  for (const vector of lineVectors) {
    const r = await jsonRequest('/v1/member/link-request', { method: 'POST', token: vector.token, body: lineBody });
    result.runtime.push({ test: `line-${vector.name}`, status: r.status, code: r.data?.error?.code || r.data?.code || null });
    assert([400, 401, 403, 422].includes(r.status), 'line', `LINE negative vector accepted or produced unexpected status: ${vector.name}`, { status: r.status, data: r.data });
  }
  const rawIdOnly = await jsonRequest('/v1/member/link-request', { method: 'POST', body: lineBody });
  result.runtime.push({ test: 'line-raw-id-without-token', status: rawIdOnly.status, code: rawIdOnly.data?.error?.code || rawIdOnly.data?.code || null });
  assert([400, 401, 403, 422].includes(rawIdOnly.status), 'line', 'Raw line_user_id was accepted without verified token', { status: rawIdOnly.status });

  // Staff E2E on the demo manager only: allow, wrong-code deny, access-code reissue revoke/stale deny, new-code allow.
  // We deliberately do NOT disable the only manager and do NOT create a persistent QA staff row.
  const list = await jsonRequest('/v1/admin/staff?status=all', { token: adminToken });
  assert(list.status === 200 && Array.isArray(list.data?.staff), 'staff', 'Admin staff list failed');
  const staff = list.data.staff.find(s => s.staff_code === 'DEMO-MANAGER');
  assert(staff?.id, 'staff', 'DEMO-MANAGER not found');
  const temp1 = randomCode();
  const temp2 = randomCode();
  const badCode = `BAD-${crypto.randomBytes(12).toString('base64url')}`;

  const issue1 = await jsonRequest(`/v1/admin/staff/${staff.id}/access-code`, {
    method: 'PUT', token: adminToken, body: { access_code: temp1 }, headers: { 'Idempotency-Key': `r2-staff-issue1-${crypto.randomUUID()}` }
  });
  result.runtime.push({ test: 'staff-access-code-issue-1', status: issue1.status, staff_code: staff.staff_code });
  assert(issue1.status >= 200 && issue1.status < 300, 'staff', 'First temporary access-code issue failed');

  const badLogin = await jsonRequest('/v1/staff/login', {
    method: 'POST', body: { staff_code: 'DEMO-MANAGER', access_code: badCode, device_label: 'R2 QA wrong-code negative' }
  });
  result.runtime.push({ test: 'staff-wrong-code-deny', status: badLogin.status });
  assert([400, 401, 403, 422].includes(badLogin.status), 'staff', 'Wrong staff access code was accepted', { status: badLogin.status });

  const staffLogin1 = await jsonRequest('/v1/staff/login', {
    method: 'POST', body: { staff_code: 'DEMO-MANAGER', access_code: temp1, device_label: 'R2 QA GitHub Actions' }
  });
  const staffLogin1ExpiresAt = staffLogin1.data?.expires_at || null;
  const staffLogin1TtlSeconds = staffLogin1ExpiresAt
    ? Math.ceil((Date.parse(staffLogin1ExpiresAt) - Date.now()) / 1000)
    : null;
  result.runtime.push({
    test: 'staff-login-allow-ttl',
    status: staffLogin1.status,
    expires_at: staffLogin1ExpiresAt,
    ttl_seconds_remaining: staffLogin1TtlSeconds
  });
  assert(staffLogin1.status === 200 && staffLogin1.data?.token, 'staff', 'Staff allow-login failed');
  assert(
    Number.isFinite(staffLogin1TtlSeconds) &&
      staffLogin1TtlSeconds > 0 &&
      staffLogin1TtlSeconds <= 1800,
    'staff',
    'Fresh staff session TTL exceeds Product READY 1800-second maximum',
    { expires_at: staffLogin1ExpiresAt, ttl_seconds_remaining: staffLogin1TtlSeconds }
  );
  const token1 = staffLogin1.data.token;

  const today1 = await jsonRequest('/v1/staff/today', { token: token1 });
  result.runtime.push({ test: 'staff-authorized-today', status: today1.status });
  assert(today1.status === 200, 'staff', 'Authorized staff token could not access /today');

  const issue2 = await jsonRequest(`/v1/admin/staff/${staff.id}/access-code`, {
    method: 'PUT', token: adminToken, body: { access_code: temp2 }, headers: { 'Idempotency-Key': `r2-staff-issue2-${crypto.randomUUID()}` }
  });
  result.runtime.push({ test: 'staff-access-code-issue-2-revoke', status: issue2.status });
  assert(issue2.status >= 200 && issue2.status < 300, 'staff', 'Second access-code issue/revoke failed');

  const staleAfterReissue = await jsonRequest('/v1/staff/today', { token: token1 });
  result.runtime.push({ test: 'staff-after-access-code-change-old-token-401', status: staleAfterReissue.status });
  assert(
    staleAfterReissue.status === 401,
    'staff',
    'Old token was not HTTP 401 after access-code reissue',
    { status: staleAfterReissue.status }
  );

  const oldCodeLogin = await jsonRequest('/v1/staff/login', {
    method: 'POST', body: { staff_code: 'DEMO-MANAGER', access_code: temp1, device_label: 'R2 QA old-code negative' }
  });
  result.runtime.push({ test: 'staff-old-code-after-reissue-deny', status: oldCodeLogin.status });
  assert([400, 401, 403, 422].includes(oldCodeLogin.status), 'staff', 'Old access code remained valid after reissue', { status: oldCodeLogin.status });

  const staffLogin2 = await jsonRequest('/v1/staff/login', {
    method: 'POST', body: { staff_code: 'DEMO-MANAGER', access_code: temp2, device_label: 'R2 QA GitHub Actions final' }
  });
  result.runtime.push({ test: 'staff-login-after-reissue-allow', status: staffLogin2.status });
  assert(staffLogin2.status === 200 && staffLogin2.data?.token, 'staff', 'Staff login after reissue failed');
  const token2 = staffLogin2.data.token;

  const logout = await jsonRequest('/v1/staff/logout', { method: 'POST', token: token2, body: {} });
  result.runtime.push({ test: 'staff-logout', status: logout.status });
  assert(logout.status >= 200 && logout.status < 300, 'staff', 'Staff logout failed');

  const staleAfterLogout = await jsonRequest('/v1/staff/today', { token: token2 });
  result.runtime.push({ test: 'staff-after-logout-old-token-401', status: staleAfterLogout.status });
  assert(
    staleAfterLogout.status === 401,
    'staff',
    'Logged-out staff token was not HTTP 401',
    { status: staleAfterLogout.status }
  );

  // The temporary plaintext codes are never logged. R2 controller restores the pre-QA DB hash after the workflow.

}

async function withHardTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} hard-timeout ${ms}ms`)), ms))
  ]);
}

async function readMetricsStable(page, attempts = 5) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const width = window.innerWidth;
        const scrollWidth = Math.max(html?.scrollWidth || 0, body?.scrollWidth || 0);
        const text = body?.innerText || '';
        const source = html?.outerHTML || '';
        return { width, scrollWidth, overflow: scrollWidth > width + 2, text: text.slice(0, 250000), source: source.slice(0, 1000000) };
      });
    } catch (error) {
      lastError = error;
      const message = String(error);
      if (!/Execution context was destroyed|Cannot find context|navigation/i.test(message)) throw error;
      await page.waitForTimeout(700);
      await page.waitForLoadState('domcontentloaded', { timeout: 2500 }).catch(() => {});
    }
  }
  throw lastError || new Error('readMetricsStable failed');
}

function isIgnorableExternalFailure(url = '') {
  return /(^|\/\/)(www\.)?google-analytics\.com\/g\/collect/i.test(url)
      || /(^|\/\/)(www\.)?googletagmanager\.com\//i.test(url);
}

async function checkpoint(label = '') {
  result.checkpoint = { label, at: new Date().toISOString() };
  await writeFile(`${OUT}/qa-result.partial.json`, JSON.stringify(result, null, 2));
}

async function browserQa() {
  for (const p of pages) {
    const availability = await waitForHttp(p.url, 200, p.name === 'a4-html' ? 12 : 5);
    assert(availability?.status === 200, 'url', `${p.name} did not become HTTP 200`, { url: p.url, availability });
  }
  const pdf = await waitForHttp(pdfUrl, 200, 12);
  result.browser.push({ page: 'a4-pdf', viewport: 'http-only', url: pdfUrl, status: pdf?.status, finalUrl: pdf?.finalUrl });
  assert(pdf?.status === 200, 'url', 'A4 PDF is not HTTP 200', { pdf });
  await checkpoint('public-url-matrix-complete');

  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
        serviceWorkers: 'block'
      });
      context.setDefaultTimeout(8000);
      context.setDefaultNavigationTimeout(12000);

      for (const p of pages) {
        const page = await context.newPage();
        const pageErrors = [];
        const consoleErrors = [];
        const failedRequests = [];
        page.on('pageerror', error => pageErrors.push(String(error)));
        page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' }));
        let response;
        const label = `${p.name}/${vp.name}`;
        console.log(`[BROWSER] START ${label}`);
        try {
          response = await page.goto(p.url, { waitUntil: 'commit', timeout: 12000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(1000);
          const metrics = await readMetricsStable(page);
          const secretPatterns = [
            /SUPABASE_SERVICE_ROLE_KEY/i,
            /SERVICE_ROLE_KEY\s*[:=]/i,
            /AUTH_SIGNING_SECRET\s*[:=]/i,
            /STAFF_CODE_PEPPER\s*[:=]/i,
            /postgres(?:ql)?:\/\/[^\s<]+/i,
            /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i
          ];
          const techPatterns = p.publicSurface ? [
            /TypeError:\s/i,
            /ReferenceError:\s/i,
            /Unhandled Promise Rejection/i,
            /SUPABASE_SERVICE_ROLE_KEY/i,
            /AUTH_SIGNING_SECRET/i,
            /STAFF_CODE_PEPPER/i
          ] : [];
          const secretHits = secretPatterns.filter(rx => rx.test(metrics.source)).map(rx => String(rx));
          const techHits = techPatterns.filter(rx => rx.test(metrics.text)).map(rx => String(rx));
          const criticalFailedRequests = failedRequests.filter(x => !isIgnorableExternalFailure(x.url));
          const ignoredExternalFailedRequests = failedRequests.filter(x => isIgnorableExternalFailure(x.url));
          const entry = {
            page: p.name, viewport: vp.name, url: p.url,
            status: response?.status() || 0,
            finalUrl: page.url(),
            scrollWidth: metrics.scrollWidth,
            innerWidth: metrics.width,
            overflow: metrics.overflow,
            pageErrors,
            consoleErrors,
            failedRequests: criticalFailedRequests,
            ignoredExternalFailedRequests,
            secretHits,
            blockingTechnicalTextHits: techHits
          };
          result.browser.push(entry);
          await page.screenshot({ path: `${OUT}/screens/${p.name}-${vp.name}.png`, fullPage: false, timeout: 8000 });
          if (entry.status !== 200) recordFailure('browser', `${p.name}/${vp.name} HTTP ${entry.status}`, { entry });
          if (entry.overflow && !p.printSurface) recordFailure('browser', `${p.name}/${vp.name} horizontal overflow`, { entry });
          if (pageErrors.length) recordFailure('browser', `${p.name}/${vp.name} pageerror`, { pageErrors });
          if (consoleErrors.length) recordFailure('browser', `${p.name}/${vp.name} console errors`, { consoleErrors });
          if (criticalFailedRequests.length) recordFailure('browser', `${p.name}/${vp.name} failed requests`, { failedRequests: criticalFailedRequests });
          if (secretHits.length) recordFailure('security', `${p.name}/${vp.name} secret marker exposure`, { secretHits });
          if (techHits.length) recordFailure('browser', `${p.name}/${vp.name} blocking technical text`, { techHits });
          console.log(`[BROWSER] DONE ${label}`);
        } catch (error) {
          recordFailure('browser', `${p.name}/${vp.name} navigation/test exception`, { error: String(error) });
          console.log(`[BROWSER] ERROR ${label}: ${String(error)}`);
        } finally {
          await checkpoint(`browser-${label}`);
          await withHardTimeout(page.close({ runBeforeUnload: false }), 1500, `page.close ${label}`).catch(() => {});
        }
      }
      await withHardTimeout(context.close(), 2500, `context.close ${vp.name}`).catch(() => {});
    }
  } finally {
    await withHardTimeout(browser.close(), 3000, 'browser.close').catch(() => {});
  }
}

try {
  await runtimeQa();
  await checkpoint('runtime-complete');
} catch (error) {
  recordFailure('runtime-fatal', String(error));
}

try {
  await browserQa();
} catch (error) {
  recordFailure('browser-fatal', String(error));
}

result.summary = {
  runtime_tests: result.runtime.length,
  browser_checks: result.browser.length,
  failures: result.failures.length,
  verdict: result.failures.length === 0 ? 'PASS' : 'FAIL'
};

await writeFile(`${OUT}/qa-result.json`, JSON.stringify(result, null, 2));
await writeFile(`${OUT}/qa-summary.txt`, [
  'DPRO PRODUCT READY #46 NURSING / R2 FRESH QA',
  `Generated: ${result.generated_at}`,
  `Worker expected: ${EXPECTED_WORKER_VERSION}`,
  `Runtime tests: ${result.summary.runtime_tests}`,
  `Browser checks: ${result.summary.browser_checks}`,
  `Failures: ${result.summary.failures}`,
  `VERDICT: ${result.summary.verdict}`,
  '',
  ...result.failures.map((f, i) => `${i + 1}. [${f.area}] ${f.message}`)
].join('\n'));

console.log(JSON.stringify(result.summary, null, 2));
if (result.failures.length) process.exitCode = 1;
