import { Router, Response } from 'express';
import { getDb, saveDatabase, archiveOldShifts, updateMonthlySummary, getMonthlySummary, cleanupEmptyShifts } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

function parseTimeStr(timeStr: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours + minutes / 60;
}

router.get('/periods', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM shift_periods WHERE store_id = ? ORDER BY start_date DESC");
  stmt.bind([req.storeId!]);
  const periods: any[] = [];
  while (stmt.step()) {
    periods.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(periods);
});

router.post('/periods', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { start_date, end_date } = req.body;
  const db = await getDb();

  const checkStmt = db.prepare("SELECT id FROM shift_periods WHERE store_id = ? AND start_date = ? AND end_date = ?");
  checkStmt.bind([req.storeId!, start_date, end_date]);
  const exists = checkStmt.step();
  checkStmt.free();

  if (exists) {
    res.status(400).json({ error: '同じ期間のシフト表が既に存在します' });
    return;
  }

  db.run("INSERT INTO shift_periods (store_id, start_date, end_date) VALUES (?, ?, ?)",
    [req.storeId!, start_date, end_date]);
  const result = db.exec("SELECT last_insert_rowid() as id");
  const periodId = result[0]?.values[0][0] as number;
  saveDatabase();
  res.json({ id: periodId, start_date, end_date });
});

router.get('/period/:periodId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { periodId } = req.params;
  const db = await getDb();

  const empStmt = db.prepare("SELECT * FROM employees WHERE store_id = ? ORDER BY page_number, sort_order");
  empStmt.bind([req.storeId!]);
  const employees: any[] = [];
  while (empStmt.step()) {
    employees.push(empStmt.getAsObject());
  }
  empStmt.free();

  const shiftStmt = db.prepare(`
    SELECT s.*, e.name as employee_name, e.page_number
    FROM shifts s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.period_id = ? AND e.store_id = ?
  `);
  shiftStmt.bind([periodId, req.storeId!]);
  const shifts: any[] = [];
  while (shiftStmt.step()) {
    shifts.push(shiftStmt.getAsObject());
  }
  shiftStmt.free();

  res.json({ employees, shifts });
});

router.post('/save', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { period_id, shifts } = req.body;
  const db = await getDb();

  db.run(`
    DELETE FROM shifts
    WHERE period_id = ? AND employee_id IN (
      SELECT id FROM employees WHERE store_id = ?
    )
  `, [period_id, req.storeId!]);

  shifts.forEach((item: { employee_id: number; date: string; start_time?: string; end_time?: string; is_off?: number }) => {
    db.run("INSERT INTO shifts (employee_id, period_id, date, start_time, end_time, is_off) VALUES (?, ?, ?, ?, ?, ?)",
      [item.employee_id, period_id, item.date, item.start_time || null, item.end_time || null, item.is_off || 0]);
  });
  saveDatabase();

  cleanupEmptyShifts();

  res.json({ success: true });
});

router.get('/annual-hours', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const stmt = db.prepare(`
    SELECT e.id, e.name, e.tag,
      COALESCE(SUM(
        CASE
          WHEN s.start_time IS NOT NULL AND s.end_time IS NOT NULL AND s.is_off = 0 THEN
            CASE
              WHEN s.end_time > s.start_time THEN
                (CAST(substr(s.end_time, 1, 2) AS REAL) + CAST(substr(s.end_time, 4, 2) AS REAL) / 60) -
                (CAST(substr(s.start_time, 1, 2) AS REAL) + CAST(substr(s.start_time, 4, 2) AS REAL) / 60)
              ELSE
                (24 + (CAST(substr(s.end_time, 1, 2) AS REAL) + CAST(substr(s.end_time, 4, 2) AS REAL) / 60)) -
                (CAST(substr(s.start_time, 1, 2) AS REAL) + CAST(substr(s.start_time, 4, 2) AS REAL) / 60)
            END
          ELSE 0
        END
      ), 0) as total_hours
    FROM employees e
    LEFT JOIN shifts s ON e.id = s.employee_id
    WHERE e.store_id = ?
    GROUP BY e.id
  `);
  stmt.bind([req.storeId!]);
  const result: any[] = [];
  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();

  res.json(result);
});

router.post('/archive', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { monthsToKeep } = req.body;
  const result = archiveOldShifts(monthsToKeep || 3);
  res.json({ success: true, ...result });
});

router.post('/monthly-summary/calculate', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { period_id } = req.body;
  const db = await getDb();

  const empStmt = db.prepare("SELECT id FROM employees WHERE store_id = ?");
  empStmt.bind([req.storeId!]);
  const empIds: number[] = [];
  while (empStmt.step()) {
    empIds.push((empStmt.getAsObject().id as number));
  }
  empStmt.free();

  for (const empId of empIds) {
    const shiftStmt = db.prepare(`
      SELECT date, start_time, end_time, is_off
      FROM shifts
      WHERE employee_id = ? AND period_id = ?
    `);
    shiftStmt.bind([empId, period_id]);
    
    const monthlyHours: { [ym: string]: { hours: number; days: number } } = {};

    while (shiftStmt.step()) {
      const row = shiftStmt.getAsObject();
      const date = row.date as string;
      const ym = date.slice(0, 7);

      if (!monthlyHours[ym]) {
        monthlyHours[ym] = { hours: 0, days: 0 };
      }

      if (!row.is_off && row.start_time && row.end_time) {
        const start = parseTimeStr(row.start_time as string);
        const end = parseTimeStr(row.end_time as string);
        if (start !== null && end !== null) {
          let hours = end > start ? end - start : (24 - start) + end;
          monthlyHours[ym].hours += hours;
          monthlyHours[ym].days += 1;
        }
      }
    }
    shiftStmt.free();

    for (const [ym, data] of Object.entries(monthlyHours)) {
      updateMonthlySummary(empId, ym, data.hours, data.days);
    }
  }

  res.json({ success: true });
});

router.get('/monthly-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  const result = getMonthlySummary(req.storeId!);
  res.json(result);
});

router.post('/cleanup', authenticateToken, async (req: AuthRequest, res: Response) => {
  const deleted = cleanupEmptyShifts();
  res.json({ success: true, deletedCount: deleted });
});

export default router;