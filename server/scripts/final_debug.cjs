const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: 'localhost',
        port: 3001,
        path,
        method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: token ? 'Bearer ' + token : '',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(b);
          } catch {
            parsed = b;
          }
          resolve({ status: res.statusCode, data: parsed, raw: b });
        });
      }
    );
    r.on('error', (e) => resolve({ status: 0, data: { error: e.message } }));
    if (data) r.write(data);
    r.end();
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  | ' + detail : ''));
}

(async () => {
  const unique = 'dbg-' + Date.now();
  // --- AUTH ---
  let r = await req('POST', '/api/auth/register', { name: unique, password: 'pass1234' });
  check('auth.register', r.status === 200 && r.data.token, 'status=' + r.status);
  const token = r.data.token;

  r = await req('POST', '/api/auth/login', { name: unique, password: 'pass1234' });
  check('auth.login', r.status === 200 && r.data.token);

  r = await req('POST', '/api/auth/login', { name: unique, password: 'wrong' });
  check('auth.login_bad_password', r.status === 401);

  // --- EMPLOYEES ---
  r = await req('POST', '/api/employees', { name: '太郎', tag: '店長', page_number: 1, email: 'taro@example.com' }, token);
  check('employees.create', r.status === 200 && r.data.id, JSON.stringify(r.data));
  const emp1 = r.data;

  r = await req('POST', '/api/employees', { name: '花子', tag: 'バイト', page_number: 1, email: 'hanako@example.com' }, token);
  const emp2 = r.data;
  r = await req('POST', '/api/employees', { name: '次郎', tag: '学生バイト', page_number: 2, email: '' }, token);
  const emp3 = r.data;

  r = await req('GET', '/api/employees', null, token);
  check('employees.list', r.status === 200 && r.data.length === 3, 'count=' + r.data.length);

  r = await req('PUT', '/api/employees/' + emp2.id, { name: '花子改', tag: 'バイト', email: 'hanako2@example.com' }, token);
  check('employees.update', r.status === 200);
  r = await req('GET', '/api/employees', null, token);
  const hanako = r.data.find((e) => e.id === emp2.id);
  check('employees.update_fields', hanako.name === '花子改' && hanako.email === 'hanako2@example.com', JSON.stringify(hanako));

  r = await req('POST', '/api/employees/reorder', {
    employees: [
      { id: emp2.id, page_number: 1, sort_order: 1 },
      { id: emp1.id, page_number: 1, sort_order: 2 },
      { id: emp3.id, page_number: 2, sort_order: 1 }
    ]
  }, token);
  check('employees.reorder', r.status === 200);

  // --- SHIFTS ---
  r = await req('POST', '/api/shifts/periods', { start_date: '2026-03-01', end_date: '2026-03-07', deadline: '2026-02-25' }, token);
  check('shifts.create_period', r.status === 200 && r.data.id);
  const period = r.data;

  r = await req('POST', '/api/shifts/periods', { start_date: '2026-03-01', end_date: '2026-03-07' }, token);
  check('shifts.duplicate_period_blocked', r.status === 400);

  r = await req('GET', '/api/shifts/periods', null, token);
  check('shifts.list_periods', r.status === 200 && r.data.length >= 1);

  r = await req('GET', '/api/shifts/period/' + period.id, null, token);
  check('shifts.get_period_data', r.status === 200 && r.data.employees.length === 3);

  r = await req('POST', '/api/shifts/save', {
    period_id: period.id,
    shifts: [
      { employee_id: emp1.id, date: '2026-03-02', start_time: '10:00', end_time: '18:00', is_off: 0 },
      { employee_id: emp2.id, date: '2026-03-02', start_time: '18:00', end_time: '23:00', is_off: 0 },
      { employee_id: emp3.id, date: '2026-03-02', start_time: null, end_time: null, is_off: 1 },
      { employee_id: emp1.id, date: '2026-03-03', start_time: '22:00', end_time: '03:00', is_off: 0 }
    ]
  }, token);
  check('shifts.save', r.status === 200 && r.data.success);

  r = await req('GET', '/api/shifts/period/' + period.id, null, token);
  check('shifts.saved_count', r.data.shifts.length >= 3, 'shifts=' + r.data.shifts.length);

  r = await req('GET', '/api/shifts/annual-hours', null, token);
  const taroHours = r.data.find((e) => e.id === emp1.id);
  check('shifts.annual_hours', r.status === 200 && Number(taroHours.total_hours) > 0, 'taro=' + taroHours.total_hours);

  // --- SETTINGS ---
  r = await req('POST', '/api/settings/required-staff', { day_of_week: 1, hour: 18, required_count: 2 }, token);
  check('settings.required_staff_save', r.status === 200);
  r = await req('GET', '/api/settings/required-staff', null, token);
  check('settings.required_staff_get', r.data.some((s) => s.day_of_week === 1 && s.hour === 18 && Number(s.required_count) === 2));

  r = await req('POST', '/api/settings/date-overrides', { date: '2026-03-02', hour: 18, required_count: 5, reason: '繁忙' }, token);
  check('settings.date_override_save', r.status === 200);
  r = await req('GET', '/api/settings/date-overrides/2026-03-02', null, token);
  check('settings.date_override_get', r.data.length === 1 && Number(r.data[0].required_count) === 5);

  r = await req('GET', '/api/settings/holidays', null, token);
  check('settings.holidays', r.status === 200 && r.data.length > 0, 'count=' + r.data.length);
  r = await req('GET', '/api/settings/holidays/2026', null, token);
  check('settings.holidays_year', r.status === 200 && r.data.every((h) => h.date.startsWith('2026')));

  // --- PREFERENCES ---
  r = await req('POST', '/api/preferences/public-submit', {
    employee_id: emp1.id,
    period_id: period.id,
    dates: [
      { date: '2026-03-02', available: 1, note: 'OK' },
      { date: '2026-03-03', available: 0, note: '不可' }
    ]
  });
  check('prefs.public_submit', r.status === 200 && r.data.success);

  r = await req('GET', '/api/preferences/public/' + emp1.id + '/' + period.id);
  check(
    'prefs.public_get',
    r.status === 200 && r.data.preferences && r.data.preferences.length === 2,
    'prefs=' + (r.data.preferences && r.data.preferences.length)
  );

  r = await req('GET', '/api/preferences/public-employee/' + emp1.id);
  check('prefs.public_employee', r.status === 200);

  r = await req('GET', '/api/preferences/public-periods/' + emp1.id);
  check('prefs.public_periods', r.status === 200);

  r = await req('GET', '/api/preferences/public-employees/' + period.id);
  check('prefs.public_employees', r.status === 200 && r.data.length === 3);

  r = await req('POST', '/api/preferences/save', {
    employee_id: emp2.id,
    period_id: period.id,
    dates: [{ date: '2026-03-02', available: 1, note: '' }]
  }, token);
  check('prefs.save', r.status === 200);

  r = await req('GET', '/api/preferences/summary/' + period.id, null, token);
  check('prefs.summary', r.status === 200);

  r = await req('GET', '/api/preferences/all/' + period.id, null, token);
  check('prefs.all', r.status === 200 && r.data.length >= 3, 'len=' + r.data.length);

  r = await req('GET', '/api/preferences/employee/' + emp2.id + '/' + period.id, null, token);
  check('prefs.employee', r.status === 200 && r.data.length === 1);

  // --- MONTHLY / ARCHIVE ---
  r = await req('POST', '/api/shifts/monthly-summary/calculate', { period_id: period.id }, token);
  check('shifts.monthly_calc', r.status === 200 && r.data.success);
  r = await req('GET', '/api/shifts/monthly-summary', null, token);
  check('shifts.monthly_get', r.status === 200 && r.data.length >= 1, 'rows=' + r.data.length);

  r = await req('POST', '/api/shifts/cleanup', {}, token);
  check('shifts.cleanup', r.status === 200);

  r = await req('POST', '/api/shifts/archive', { monthsToKeep: 3 }, token);
  check('shifts.archive', r.status === 200);

  // Archive removes past periods; recreate a future one for remaining email checks
  r = await req('POST', '/api/shifts/periods', { start_date: '2026-12-01', end_date: '2026-12-07' }, token);
  const period2 = r.data;

  // --- EMAIL ---
  r = await req('GET', '/api/email/settings', null, token);
  check('email.settings_get', r.status === 200 && typeof r.data.configured === 'boolean');

  r = await req('POST', '/api/email/settings', {
    smtp_host: 'smtp.example.com',
    smtp_port: 587,
    smtp_user: 'x@example.com',
    smtp_pass: 'pw',
    from_name: 'テスト店',
    from_email: 'x@example.com'
  }, token);
  check('email.settings_save', r.status === 200 && r.data.configured === true);

  r = await req('GET', '/api/email/shortages/' + period2.id, null, token);
  check('email.shortages', r.status === 200 && Array.isArray(r.data.shortages) && r.data.employees.length === 3);
  // Monday 2026-03-02 required 2 at 18h; assign 1 (taro 10-18 covers until 18, hanako 18-23 covers 18)
  // taro 10:00-18:00 covers hours 10-17; hanako 18-23 covers 18-22
  // so 18h assigned=1 (hanako only), required from override 5 -> deficit 4
  const slots = r.data.shortages.filter((s) => s.date === '2026-12-07' || s.date.startsWith('2026-12'));
  check('email.shortages_detect', r.data.shortages.length >= 1, JSON.stringify(r.data.shortages.slice(0, 3)));

  r = await req('POST', '/api/email/preview', {
    period_id: period2.id,
    subject: '件名',
    message: '追記',
    include_shortages: true
  }, token);
  check('email.preview', r.status === 200 && r.data.body.includes('追記'));

  r = await req('POST', '/api/email/templates', {
    name: '汎用',
    subject: 'お知らせ',
    body: '本文です'
  }, token);
  check('email.template_create', r.status === 200 && r.data.id);
  const tmplId = r.data.id;
  r = await req('GET', '/api/email/templates', null, token);
  check('email.template_list', r.data.some((t) => t.id === tmplId));
  r = await req('POST', '/api/email/templates', {
    id: tmplId,
    name: '汎用改',
    subject: 'お知らせ改',
    body: '本文改'
  }, token);
  check('email.template_update', r.status === 200);
  r = await req('GET', '/api/email/templates', null, token);
  check('email.template_updated', r.data.find((t) => t.id === tmplId).name === '汎用改');
  r = await req('DELETE', '/api/email/templates/' + tmplId, null, token);
  check('email.template_delete', r.status === 200);

  r = await req('POST', '/api/email/send-bulk', {
    period_id: period2.id,
    tags: ['バイト'],
    subject: 'test',
    body: 'b'
  }, token);
  // smtp host is fake -> expect failCount >= 1 but request succeeds
  check('email.send_bulk_runs', r.status === 200 && r.data.total === 1, JSON.stringify({ total: r.data.total, fail: r.data.failCount }));

  r = await req('POST', '/api/email/send-bulk', {
    period_id: period2.id,
    tags: [],
    subject: 'test',
    body: 'b'
  }, token);
  check('email.send_all_tags', r.status === 200 && r.data.total === 2, 'total=' + r.data.total + ' (email holders)');

  r = await req('POST', '/api/email/send-bulk', {
    period_id: period2.id,
    employee_ids: [emp1.id],
    subject: 'test',
    body: 'b',
    send_mode: 'bcc'
  }, token);
  check('email.send_selected_bcc', r.status === 200 && r.data.total === 1);

  // --- SECURITY: other store isolation ---
  const unique2 = 'dbg2-' + Date.now();
  r = await req('POST', '/api/auth/register', { name: unique2, password: 'pass1234' });
  const token2 = r.data.token;
  r = await req('GET', '/api/employees', null, token2);
  check('isolation.employees', r.status === 200 && r.data.length === 0);
  r = await req('GET', '/api/email/shortages/' + period2.id, null, token2);
  check('isolation.period', r.status === 404);
  r = await req('GET', '/api/email/templates', null, token2);
  check('isolation.templates', r.status === 200 && r.data.length === 0);

  // --- AUTH REQUIRED ---
  r = await req('GET', '/api/employees', null, null);
  check('security.no_token', r.status === 401);

  // --- EMPLOYEE DELETE ---
  r = await req('DELETE', '/api/employees/' + emp3.id, null, token);
  check('employees.delete', r.status === 200);
  r = await req('GET', '/api/employees', null, token);
  check('employees.delete_ok', r.data.length === 2);

  const failed = results.filter((x) => !x.ok);
  console.log('\n==== SUMMARY ====');
  console.log('total=' + results.length + ' pass=' + (results.length - failed.length) + ' fail=' + failed.length);
  if (failed.length) {
    failed.forEach((f) => console.log('  FAIL: ' + f.name + ' ' + f.detail));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
