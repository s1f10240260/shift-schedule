import { Router, Request, Response } from 'express';
import { getDb, saveDatabase } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/summary/:periodId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { periodId } = req.params;
  const db = await getDb();

  const stmt = db.prepare(`
    SELECT sp.date, COUNT(*) as count,
      GROUP_CONCAT(e.name, ',') as employee_names
    FROM shift_preferences sp
    JOIN employees e ON sp.employee_id = e.id
    WHERE sp.period_id = ? AND sp.available = 1 AND e.store_id = ?
    GROUP BY sp.date
  `);
  stmt.bind([periodId, req.storeId!]);
  const summary: any[] = [];
  while (stmt.step()) {
    summary.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(summary);
});

router.get('/employee/:employeeId/:periodId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { employeeId, periodId } = req.params;
  const db = await getDb();

  const stmt = db.prepare(`
    SELECT * FROM shift_preferences WHERE employee_id = ? AND period_id = ?
  `);
  stmt.bind([employeeId, periodId]);
  const prefs: any[] = [];
  while (stmt.step()) {
    prefs.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(prefs);
});

router.get('/all/:periodId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { periodId } = req.params;
  const db = await getDb();

  const stmt = db.prepare(`
    SELECT sp.*, e.name as employee_name, e.tag
    FROM shift_preferences sp
    JOIN employees e ON sp.employee_id = e.id
    WHERE sp.period_id = ? AND e.store_id = ?
    ORDER BY e.sort_order, sp.date
  `);
  stmt.bind([periodId, req.storeId!]);
  const prefs: any[] = [];
  while (stmt.step()) {
    prefs.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(prefs);
});

router.post('/save', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { employee_id, period_id, dates } = req.body;
  const db = await getDb();

  db.run("DELETE FROM shift_preferences WHERE employee_id = ? AND period_id = ?", [employee_id, period_id]);

  const stmt = db.prepare(
    "INSERT INTO shift_preferences (employee_id, period_id, date, available, start_time, end_time, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  dates.forEach((item: { date: string; start_time?: string; end_time?: string; note?: string }) => {
    const start = item.start_time || '';
    const end = item.end_time || '';
    stmt.bind([employee_id, period_id, item.date, start && end ? 1 : 0, start, end, item.note || '']);
    stmt.step();
    stmt.reset();
  });
  stmt.free();
  saveDatabase();

  res.json({ success: true });
});

router.post('/public-submit', async (req: any, res: Response) => {
  const { employee_id, period_id, dates } = req.body;
  const db = await getDb();

  const empStmt = db.prepare("SELECT id FROM employees WHERE id = ?");
  empStmt.bind([employee_id]);
  if (!empStmt.step()) {
    empStmt.free();
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  empStmt.free();

  const periodStmt = db.prepare("SELECT deadline FROM shift_periods WHERE id = ?");
  periodStmt.bind([period_id]);
  let deadline = null;
  if (periodStmt.step()) {
    deadline = periodStmt.getAsObject().deadline;
  }
  periodStmt.free();

  const existingStmt = db.prepare("SELECT COUNT(*) as cnt FROM shift_preferences WHERE employee_id = ? AND period_id = ?");
  existingStmt.bind([employee_id, period_id]);
  let hasSubmitted = false;
  if (existingStmt.step()) {
    hasSubmitted = (existingStmt.getAsObject().cnt as number) > 0;
  }
  existingStmt.free();

  if (hasSubmitted && deadline) {
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (today > deadline) {
      res.status(403).json({ error: '提出期限を過ぎています' });
      return;
    }
  } else if (hasSubmitted && !deadline) {
    const periodStmt2 = db.prepare("SELECT start_date FROM shift_periods WHERE id = ?");
    periodStmt2.bind([period_id]);
    let startDate = '';
    if (periodStmt2.step()) {
      startDate = periodStmt2.getAsObject().start_date as string;
    }
    periodStmt2.free();
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (startDate && today > startDate) {
      res.status(403).json({ error: '期間開始後に再提出はできません' });
      return;
    }
  }

  db.run("DELETE FROM shift_preferences WHERE employee_id = ? AND period_id = ?", [employee_id, period_id]);

  const stmt = db.prepare(
    "INSERT INTO shift_preferences (employee_id, period_id, date, available, start_time, end_time, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  dates.forEach((item: { date: string; start_time?: string; end_time?: string; note?: string }) => {
    const start = item.start_time || '';
    const end = item.end_time || '';
    stmt.bind([employee_id, period_id, item.date, start && end ? 1 : 0, start, end, item.note || '']);
    stmt.step();
    stmt.reset();
  });
  stmt.free();
  saveDatabase();

  res.json({ success: true });
});

router.get('/public/:employeeId/:periodId', async (req: any, res: Response) => {
  const { employeeId, periodId } = req.params;
  const db = await getDb();

  const empStmt = db.prepare("SELECT id, name, tag FROM employees WHERE id = ?");
  empStmt.bind([employeeId]);
  let employee = null;
  if (empStmt.step()) {
    employee = empStmt.getAsObject();
  }
  empStmt.free();

  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const periodStmt = db.prepare("SELECT * FROM shift_periods WHERE id = ?");
  periodStmt.bind([periodId]);
  let period = null;
  if (periodStmt.step()) {
    period = periodStmt.getAsObject();
  }
  periodStmt.free();

  const prefStmt = db.prepare("SELECT * FROM shift_preferences WHERE employee_id = ? AND period_id = ?");
  prefStmt.bind([employeeId, periodId]);
  const prefs: any[] = [];
  while (prefStmt.step()) {
    prefs.push(prefStmt.getAsObject());
  }
  prefStmt.free();

  res.json({ employee, period, preferences: prefs });
});

router.get('/public-employees/:periodId', async (req: any, res: Response) => {
  const { periodId } = req.params;
  const db = await getDb();

  const periodStmt = db.prepare("SELECT store_id FROM shift_periods WHERE id = ?");
  periodStmt.bind([periodId]);
  let storeId = null;
  if (periodStmt.step()) {
    storeId = periodStmt.getAsObject().store_id;
  }
  periodStmt.free();

  if (!storeId) {
    res.status(404).json({ error: 'Period not found' });
    return;
  }

  const empStmt = db.prepare("SELECT id, name, tag FROM employees WHERE store_id = ? ORDER BY sort_order");
  empStmt.bind([storeId]);
  const employees: any[] = [];
  while (empStmt.step()) {
    employees.push(empStmt.getAsObject());
  }
  empStmt.free();

  res.json(employees);
});

router.get('/public-periods/:employeeId', async (req: any, res: Response) => {
  const { employeeId } = req.params;
  const db = await getDb();

  const empStmt = db.prepare("SELECT store_id FROM employees WHERE id = ?");
  empStmt.bind([employeeId]);
  let storeId = null;
  if (empStmt.step()) {
    storeId = empStmt.getAsObject().store_id;
  }
  empStmt.free();

  if (!storeId) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const periodStmt = db.prepare(
    "SELECT id, start_date, end_date, deadline FROM shift_periods WHERE store_id = ? ORDER BY start_date DESC"
  );
  periodStmt.bind([storeId]);
  const periods: any[] = [];
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  while (periodStmt.step()) {
    const row = periodStmt.getAsObject();
    const prefStmt = db.prepare(
      "SELECT COUNT(*) as cnt FROM shift_preferences WHERE employee_id = ? AND period_id = ?"
    );
    prefStmt.bind([employeeId, row.id]);
    let submitted = false;
    if (prefStmt.step()) {
      submitted = (prefStmt.getAsObject().cnt as number) > 0;
    }
    prefStmt.free();

    const deadline = row.deadline as string | null;
    const startDate = row.start_date as string;
    let isEditable = true;
    if (submitted && deadline) {
      isEditable = today <= deadline;
    } else if (submitted && !deadline) {
      // match public-submit: can resubmit until period starts
      isEditable = today <= startDate;
    }

    periods.push({ ...row, submitted, editable: isEditable });
  }
  periodStmt.free();

  res.json(periods);
});

router.get('/public-employee/:employeeId', async (req: any, res: Response) => {
  const { employeeId } = req.params;
  const db = await getDb();

  const empStmt = db.prepare("SELECT id, name, tag FROM employees WHERE id = ?");
  empStmt.bind([employeeId]);
  let employee = null;
  if (empStmt.step()) {
    employee = empStmt.getAsObject();
  }
  empStmt.free();

  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  res.json(employee);
});

export default router;