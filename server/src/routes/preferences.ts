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
    "INSERT INTO shift_preferences (employee_id, period_id, date, available, note) VALUES (?, ?, ?, ?, ?)"
  );
  dates.forEach((item: { date: string; available: number; note?: string }) => {
    stmt.bind([employee_id, period_id, item.date, item.available, item.note || '']);
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

  db.run("DELETE FROM shift_preferences WHERE employee_id = ? AND period_id = ?", [employee_id, period_id]);

  const stmt = db.prepare(
    "INSERT INTO shift_preferences (employee_id, period_id, date, available, note) VALUES (?, ?, ?, ?, ?)"
  );
  dates.forEach((item: { date: string; available: number; note?: string }) => {
    stmt.bind([employee_id, period_id, item.date, item.available, item.note || '']);
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

export default router;