import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/required-staff', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM required_staff WHERE store_id = ? ORDER BY day_of_week, hour");
  stmt.bind([req.storeId!]);
  const staff: any[] = [];
  while (stmt.step()) {
    staff.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(staff);
});

router.post('/required-staff', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { day_of_week, hour, required_count } = req.body;
  const db = await getDb();

  const checkStmt = db.prepare("SELECT id FROM required_staff WHERE store_id = ? AND day_of_week = ? AND hour = ?");
  checkStmt.bind([req.storeId!, day_of_week, hour]);
  const exists = checkStmt.step();
  const existingRow = exists ? checkStmt.getAsObject() : null;
  checkStmt.free();

  if (exists && existingRow) {
    db.run("UPDATE required_staff SET required_count = ? WHERE id = ?",
      [required_count, existingRow.id]);
  } else {
    db.run("INSERT INTO required_staff (store_id, day_of_week, hour, required_count) VALUES (?, ?, ?, ?)",
      [req.storeId!, day_of_week, hour, required_count]);
  }
  saveDatabase();

  res.json({ success: true });
});

router.get('/date-overrides/:date', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { date } = req.params;
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM date_overrides WHERE store_id = ? AND date = ?");
  stmt.bind([req.storeId!, date]);
  const overrides: any[] = [];
  while (stmt.step()) {
    overrides.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(overrides);
});

router.post('/date-overrides', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { date, hour, required_count, reason } = req.body;
  const db = await getDb();

  const checkStmt = db.prepare("SELECT id FROM date_overrides WHERE store_id = ? AND date = ? AND hour = ?");
  checkStmt.bind([req.storeId!, date, hour]);
  const exists = checkStmt.step();
  const existingRow = exists ? checkStmt.getAsObject() : null;
  checkStmt.free();

  if (exists && existingRow) {
    db.run("UPDATE date_overrides SET required_count = ?, reason = ? WHERE id = ?",
      [required_count, reason, existingRow.id]);
  } else {
    db.run("INSERT INTO date_overrides (store_id, date, hour, required_count, reason) VALUES (?, ?, ?, ?, ?)",
      [req.storeId!, date, hour, required_count, reason]);
  }
  saveDatabase();

  res.json({ success: true });
});

router.get('/holidays', async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM holidays ORDER BY date");
  const holidays: any[] = [];
  while (stmt.step()) {
    holidays.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(holidays);
});

router.get('/holidays/:year', async (req: AuthRequest, res: Response) => {
  const { year } = req.params;
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM holidays WHERE date LIKE ? ORDER BY date");
  stmt.bind([year + "%"]);
  const holidays: any[] = [];
  while (stmt.step()) {
    holidays.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(holidays);
});

export default router;