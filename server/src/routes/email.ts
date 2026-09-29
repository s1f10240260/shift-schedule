import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SmtpConfig, isSmtpConfigured, sendMail, formatFrom } from '../services/mailer';

const router = Router();

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function parseTimeStr(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours + minutes / 60;
}

function shiftCoversHour(startTime: number, endTime: number, hour: number): boolean {
  if (endTime === startTime) return false;
  const startHour = Math.floor(startTime);
  // treat each covered clock hour as [h, h+1)
  let endHour = Math.ceil(endTime);
  if (endHour === startHour) endHour = startHour + 1;
  if (endHour > 24) endHour = 24;

  if (endHour > startHour) {
    return hour >= startHour && hour < endHour;
  }
  // overnight (e.g. 22:00–05:00): covers 22..23 and 0..(endHour-1)
  return hour >= startHour || hour < endHour;
}

function formatHourRange(startHour: number, endHour: number): string {
  const pad = (h: number) => String(h).padStart(2, '0') + ':00';
  return pad(startHour) + '〜' + pad(endHour);
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dayName = DAY_NAMES[d.getDay()] || '';
  return m + '/' + day + '(' + dayName + ')';
}

function getSmtpConfig(db: any, storeId: number): SmtpConfig | null {
  const stmt = db.prepare('SELECT * FROM email_settings WHERE store_id = ?');
  stmt.bind([storeId]);
  let row: any = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  if (!row) return null;
  return {
    smtp_host: (row.smtp_host as string) || '',
    smtp_port: Number(row.smtp_port) || 587,
    smtp_user: (row.smtp_user as string) || '',
    smtp_pass: (row.smtp_pass as string) || '',
    from_name: (row.from_name as string) || '',
    from_email: (row.from_email as string) || ''
  };
}

function loadEmployees(db: any, storeId: number): any[] {
  const stmt = db.prepare('SELECT * FROM employees WHERE store_id = ? ORDER BY page_number, sort_order');
  stmt.bind([storeId]);
  const employees: any[] = [];
  while (stmt.step()) {
    employees.push(stmt.getAsObject());
  }
  stmt.free();
  return employees;
}

function loadShifts(db: any, periodId: number, storeId: number): any[] {
  const stmt = db.prepare(`
    SELECT s.*, e.name as employee_name, e.tag
    FROM shifts s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.period_id = ? AND e.store_id = ?
  `);
  stmt.bind([periodId, storeId]);
  const shifts: any[] = [];
  while (stmt.step()) {
    shifts.push(stmt.getAsObject());
  }
  stmt.free();
  return shifts;
}

function loadRequiredStaff(db: any, storeId: number): Map<string, number> {
  const map = new Map<string, number>();
  const stmt = db.prepare('SELECT day_of_week, hour, required_count FROM required_staff WHERE store_id = ?');
  stmt.bind([storeId]);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    map.set(row.day_of_week + ':' + row.hour, Number(row.required_count) || 0);
  }
  stmt.free();
  return map;
}

function loadDateOverrides(db: any, storeId: number): Map<string, number> {
  const map = new Map<string, number>();
  const stmt = db.prepare('SELECT date, hour, required_count FROM date_overrides WHERE store_id = ?');
  stmt.bind([storeId]);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    map.set(row.date + ':' + row.hour, Number(row.required_count) || 0);
  }
  stmt.free();
  return map;
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(y + '-' + m + '-' + d);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

interface ShortageSlot {
  date: string;
  start_hour: number;
  end_hour: number;
  required: number;
  assigned: number;
  deficit: number;
  label: string;
}

function calculateShortages(
  period: { start_date: string; end_date: string },
  shifts: any[],
  requiredStaff: Map<string, number>,
  dateOverrides: Map<string, number>
): ShortageSlot[] {
  const dates = generateDateRange(period.start_date, period.end_date);
  // hour slots: business day 5:00 → next 5:00, represented as hours 5..23 and 0..4
  const hourOrder = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4];

  const byDate: Record<string, any[]> = {};
  shifts.forEach((s) => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });

  const shortages: ShortageSlot[] = [];

  dates.forEach((date) => {
    const d = new Date(date + 'T00:00:00');
    const dow = d.getDay();
    const dayShifts = byDate[date] || [];

    hourOrder.forEach((hour) => {
      const overrideKey = date + ':' + hour;
      const staffKey = dow + ':' + hour;
      let required = 0;
      if (dateOverrides.has(overrideKey)) {
        required = dateOverrides.get(overrideKey)!;
      } else if (requiredStaff.has(staffKey)) {
        required = requiredStaff.get(staffKey)!;
      }
      if (required <= 0) return;

      let assigned = 0;
      dayShifts.forEach((s) => {
        if (s.is_off) return;
        const start = parseTimeStr(s.start_time);
        const end = parseTimeStr(s.end_time);
        if (start === null || end === null) return;
        if (shiftCoversHour(start, end, hour)) {
          assigned += 1;
        }
      });

      if (assigned < required) {
        shortages.push({
          date,
          start_hour: hour,
          end_hour: (hour + 1) % 24,
          required,
          assigned,
          deficit: required - assigned,
          label: formatDateLabel(date) + ' ' + String(hour).padStart(2, '0') + ':00〜' + String((hour + 1) % 24).padStart(2, '0') + ':00'
        });
      }
    });
  });

  return mergeShortages(shortages);
}

function mergeShortages(slots: ShortageSlot[]): ShortageSlot[] {
  if (slots.length === 0) return [];
  const sorted = [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // business hour order 5..23,0..4
    const order = (h: number) => (h >= 5 ? h - 5 : h + 19);
    return order(a.start_hour) - order(b.start_hour);
  });

  const merged: ShortageSlot[] = [];
  let current: ShortageSlot | null = null;

  sorted.forEach((slot) => {
    const nextHour = (slot.start_hour + 1) % 24;
    if (
      current &&
      current.date === slot.date &&
      current.end_hour === slot.start_hour &&
      current.deficit === slot.deficit
    ) {
      current.end_hour = nextHour;
      current.required = Math.max(current.required, slot.required);
      current.assigned = Math.min(current.assigned, slot.assigned);
      current.label = formatDateLabel(slot.date) + ' ' + formatHourRange(current.start_hour, current.end_hour);
    } else {
      if (current) merged.push(current);
      current = {
        ...slot,
        label: formatDateLabel(slot.date) + ' ' + String(slot.start_hour).padStart(2, '0') + ':00〜' + String(slot.end_hour).padStart(2, '0') + ':00'
      };
    }
  });
  if (current) merged.push(current);
  return merged;
}

function buildShortageText(shortages: ShortageSlot[]): string {
  if (shortages.length === 0) return '現在、不足している時間帯はありません。';
  return shortages
    .map((s) => '・' + formatDateLabel(s.date) + ' ' + String(s.start_hour).padStart(2, '0') + ':00〜' + String(s.end_hour).padStart(2, '0') + ':00　不足' + s.deficit + '名（必要' + s.required + '名／配置' + s.assigned + '名）')
    .join('\n');
}

router.get('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const config = getSmtpConfig(db, req.storeId!);
  if (!config) {
    res.json({
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      smtp_pass: '',
      from_name: '',
      from_email: '',
      configured: false
    });
    return;
  }
  res.json({
    smtp_host: config.smtp_host,
    smtp_port: config.smtp_port,
    smtp_user: config.smtp_user,
    smtp_pass: config.smtp_pass,
    from_name: config.from_name,
    from_email: config.from_email,
    configured: isSmtpConfigured(config)
  });
});

router.post('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email } = req.body;
  const db = await getDb();

  const checkStmt = db.prepare('SELECT id FROM email_settings WHERE store_id = ?');
  checkStmt.bind([req.storeId!]);
  const exists = checkStmt.step();
  checkStmt.free();

  const port = Number(smtp_port) || 587;
  if (exists) {
    db.run(
      `UPDATE email_settings SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, from_name = ?, from_email = ?, updated_at = datetime('now') WHERE store_id = ?`,
      [smtp_host || '', port, smtp_user || '', smtp_pass || '', from_name || '', from_email || '', req.storeId!]
    );
  } else {
    db.run(
      'INSERT INTO email_settings (store_id, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.storeId!, smtp_host || '', port, smtp_user || '', smtp_pass || '', from_name || '', from_email || '']
    );
  }
  saveDatabase();
  res.json({ success: true, configured: isSmtpConfigured({ smtp_host, smtp_port: port, smtp_user, smtp_pass, from_name, from_email }) });
});

router.post('/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { to } = req.body;
  if (!to) {
    res.status(400).json({ error: '送信先メールアドレスを指定してください' });
    return;
  }
  const db = await getDb();
  const config = getSmtpConfig(db, req.storeId!);
  if (!isSmtpConfigured(config)) {
    res.status(400).json({ error: 'SMTP設定が完了していません。設定画面で登録してください。' });
    return;
  }
  try {
    await sendMail(config!, {
      to,
      subject: '【シフト表】メール送信テスト',
      text: 'このメールが届いていれば、SMTP設定は正常です。\n送信元: ' + formatFrom(config!)
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: '送信に失敗しました: ' + (e?.message || 'unknown error') });
  }
});

router.get('/shortages/:periodId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { periodId } = req.params;
  const db = await getDb();

  const periodStmt = db.prepare('SELECT * FROM shift_periods WHERE id = ? AND store_id = ?');
  periodStmt.bind([periodId, req.storeId!]);
  let period: any = null;
  if (periodStmt.step()) {
    period = periodStmt.getAsObject();
  }
  periodStmt.free();

  if (!period) {
    res.status(404).json({ error: '対象のシフト期間が見つかりません' });
    return;
  }

  const employees = loadEmployees(db, req.storeId!).map((e) => ({
    id: e.id,
    name: e.name,
    tag: e.tag,
    email: e.email || '',
    page_number: e.page_number
  }));

  const shifts = loadShifts(db, Number(periodId), req.storeId!);
  const requiredStaff = loadRequiredStaff(db, req.storeId!);
  const dateOverrides = loadDateOverrides(db, req.storeId!);
  const shortages = calculateShortages(period, shifts, requiredStaff, dateOverrides);

  const tags = Array.from(new Set(employees.map((e) => e.tag)));

  res.json({
    period,
    shortages,
    employees,
    tags,
    shortage_text: buildShortageText(shortages)
  });
});

router.post('/send-bulk', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { period_id, tags, employee_ids, subject, message, include_shortages, send_mode, body } = req.body;

  if (!period_id) {
    res.status(400).json({ error: '期間を指定してください' });
    return;
  }
  if (!subject || !String(subject).trim()) {
    res.status(400).json({ error: '件名を入力してください' });
    return;
  }

  const db = await getDb();
  const config = getSmtpConfig(db, req.storeId!);
  if (!isSmtpConfigured(config)) {
    res.status(400).json({ error: 'SMTP設定が完了していません。設定画面でメール設定を登録してください。' });
    return;
  }

  const periodStmt = db.prepare('SELECT * FROM shift_periods WHERE id = ? AND store_id = ?');
  periodStmt.bind([period_id, req.storeId!]);
  let period: any = null;
  if (periodStmt.step()) {
    period = periodStmt.getAsObject();
  }
  periodStmt.free();
  if (!period) {
    res.status(404).json({ error: '対象のシフト期間が見つかりません' });
    return;
  }

  const allEmployees = loadEmployees(db, req.storeId!);
  const selectedTags: string[] = Array.isArray(tags) ? tags : [];
  const selectedIds: number[] = Array.isArray(employee_ids) ? employee_ids.map(Number) : [];

  let recipients = allEmployees.filter((e) => e.email && String(e.email).trim());
  if (selectedIds.length > 0) {
    recipients = recipients.filter((e) => selectedIds.includes(Number(e.id)));
  } else if (selectedTags.length > 0) {
    recipients = recipients.filter((e) => selectedTags.includes(e.tag));
  }

  if (recipients.length === 0) {
    res.status(400).json({ error: '送信対象にメールアドレスが登録された従業員がいません。従業員管理でメールアドレスを登録し、ロールを選択してください。' });
    return;
  }

  const shifts = loadShifts(db, Number(period_id), req.storeId!);
  const requiredStaff = loadRequiredStaff(db, req.storeId!);
  const dateOverrides = loadDateOverrides(db, req.storeId!);
  const shortages = calculateShortages(period, shifts, requiredStaff, dateOverrides);
  const shortageText = buildShortageText(shortages);

  // body: complete mail body (from client preview). message+include_shortages: template mode.
  let baseBody = '';
  if (body !== undefined && body !== null && String(body).trim()) {
    baseBody = String(body).trim();
  } else {
    const periodLabel = formatDateLabel(period.start_date) + ' 〜 ' + formatDateLabel(period.end_date);
    const customMessage = message ? String(message).trim() : '';
    const bodyParts = [
      'いつもお世話になっております。',
      '',
      periodLabel + 'のシフトについて、欠員補充のご協力をお願いしたくご連絡しました。',
      ''
    ];
    if (include_shortages !== false) {
      bodyParts.push('【不足している時間帯】');
      bodyParts.push(shortageText);
      bodyParts.push('');
    }
    if (customMessage) {
      bodyParts.push(customMessage);
      bodyParts.push('');
    }
    bodyParts.push('ご都合がつく方は、店長までご連絡ください。');
    bodyParts.push('よろしくお願いいたします。');
    baseBody = bodyParts.join('\n');
  }
  const results: Array<{ name: string; email: string; ok: boolean; error?: string }> = [];

  if (send_mode === 'bcc') {
    // one message, all recipients in BCC (privacy-preserving single send)
    const bccList = recipients.map((r) => String(r.email).trim()).join(', ');
    const toAddress = config.from_email || config.smtp_user;
    try {
      await sendMail(config!, {
        to: toAddress,
        bcc: bccList,
        subject: String(subject),
        text: baseBody
      });
      recipients.forEach((r) => {
        results.push({ name: r.name, email: String(r.email).trim(), ok: true });
      });
    } catch (e: any) {
      recipients.forEach((r) => {
        results.push({ name: r.name, email: String(r.email).trim(), ok: false, error: e?.message || 'send failed' });
      });
    }
  } else {
    for (const emp of recipients) {
      const personalized = emp.name + ' さん\n\n' + baseBody;
      try {
        await sendMail(config!, {
          to: String(emp.email).trim(),
          subject: String(subject),
          text: personalized
        });
        results.push({ name: emp.name, email: String(emp.email).trim(), ok: true });
      } catch (e: any) {
        results.push({ name: emp.name, email: String(emp.email).trim(), ok: false, error: e?.message || 'send failed' });
      }
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;
  res.json({
    success: failCount === 0,
    total: results.length,
    successCount,
    failCount,
    results,
    preview: {
      subject: String(subject),
      body: baseBody,
      shortage_text: shortageText
    }
  });
});

router.post('/preview', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { period_id, subject, message, include_shortages } = req.body;
  const db = await getDb();

  const periodStmt = db.prepare('SELECT * FROM shift_periods WHERE id = ? AND store_id = ?');
  periodStmt.bind([period_id, req.storeId!]);
  let period: any = null;
  if (periodStmt.step()) {
    period = periodStmt.getAsObject();
  }
  periodStmt.free();
  if (!period) {
    res.status(404).json({ error: '対象のシフト期間が見つかりません' });
    return;
  }

  const shifts = loadShifts(db, Number(period_id), req.storeId!);
  const requiredStaff = loadRequiredStaff(db, req.storeId!);
  const dateOverrides = loadDateOverrides(db, req.storeId!);
  const shortages = calculateShortages(period, shifts, requiredStaff, dateOverrides);
  const shortageText = buildShortageText(shortages);
  const periodLabel = formatDateLabel(period.start_date) + ' 〜 ' + formatDateLabel(period.end_date);
  const customMessage = message ? String(message).trim() : '';
  const bodyParts = [
    'いつもお世話になっております。',
    '',
    periodLabel + 'のシフトについて、欠員補充のご協力をお願いしたくご連絡しました。',
    ''
  ];
  if (include_shortages !== false) {
    bodyParts.push('【不足している時間帯】');
    bodyParts.push(shortageText);
    bodyParts.push('');
  }
  if (customMessage) {
    bodyParts.push(customMessage);
    bodyParts.push('');
  }
  bodyParts.push('ご都合がつく方は、店長までご連絡ください。');
  bodyParts.push('よろしくお願いいたします。');

  res.json({
    subject: subject || '【欠員補充】ご協力のお願い',
    body: bodyParts.join('\n'),
    shortages,
    shortage_text: shortageText
  });
});

router.get('/templates', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const stmt = db.prepare(
    'SELECT id, name, subject, body, created_at, updated_at FROM email_templates WHERE store_id = ? ORDER BY updated_at DESC'
  );
  stmt.bind([req.storeId!]);
  const templates: any[] = [];
  while (stmt.step()) {
    templates.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(templates);
});

router.post('/templates', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { name, subject, body, id } = req.body;
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: 'テンプレート名を入力してください' });
    return;
  }
  const db = await getDb();

  if (id) {
    const check = db.prepare('SELECT id FROM email_templates WHERE id = ? AND store_id = ?');
    check.bind([id, req.storeId!]);
    const exists = check.step();
    check.free();
    if (!exists) {
      res.status(404).json({ error: 'テンプレートが見つかりません' });
      return;
    }
    db.run(
      "UPDATE email_templates SET name = ?, subject = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?",
      [String(name).trim(), subject || '', body || '', id, req.storeId!]
    );
    saveDatabase();
    res.json({ success: true, id: Number(id) });
    return;
  }

  db.run(
    'INSERT INTO email_templates (store_id, name, subject, body) VALUES (?, ?, ?, ?)',
    [req.storeId!, String(name).trim(), subject || '', body || '']
  );
  const result = db.exec('SELECT last_insert_rowid() as id');
  const templateId = result[0]?.values[0][0] as number;
  saveDatabase();
  res.json({ success: true, id: templateId });
});

router.delete('/templates/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = await getDb();
  db.run('DELETE FROM email_templates WHERE id = ? AND store_id = ?', [id, req.storeId!]);
  saveDatabase();
  res.json({ success: true });
});

export default router;
