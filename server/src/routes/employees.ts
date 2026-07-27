import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM employees WHERE store_id = ? ORDER BY page_number, sort_order");
  stmt.bind([req.storeId!]);
  const employees: any[] = [];
  while (stmt.step()) {
    employees.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(employees);
});

router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { name, tag, page_number } = req.body;
  const db = await getDb();

  const orderStmt = db.prepare("SELECT MAX(sort_order) as max_order FROM employees WHERE store_id = ? AND page_number = ?");
  orderStmt.bind([req.storeId!, page_number || 1]);
  let sortOrder = 1;
  if (orderStmt.step()) {
    const row = orderStmt.getAsObject();
    sortOrder = ((row.max_order as number) || 0) + 1;
  }
  orderStmt.free();

  db.run("INSERT INTO employees (store_id, name, tag, page_number, sort_order) VALUES (?, ?, ?, ?, ?)",
    [req.storeId!, name, tag || 'バイト', page_number || 1, sortOrder]);
  const result = db.exec("SELECT last_insert_rowid() as id");
  const employeeId = result[0]?.values[0][0] as number;
  saveDatabase();

  res.json({ id: employeeId, name, tag: tag || 'バイト', page_number: page_number || 1, sort_order: sortOrder });
});

router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, tag, page_number, sort_order } = req.body;
  const db = await getDb();

  db.run("UPDATE employees SET name = COALESCE(?, name), tag = COALESCE(?, tag), page_number = COALESCE(?, page_number), sort_order = COALESCE(?, sort_order) WHERE id = ? AND store_id = ?",
    [name || null, tag || null, page_number || null, sort_order || null, id, req.storeId!]);
  saveDatabase();

  res.json({ success: true });
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = await getDb();
  db.run("DELETE FROM employees WHERE id = ? AND store_id = ?", [id, req.storeId!]);
  saveDatabase();
  res.json({ success: true });
});

router.post('/reorder', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { employees } = req.body;
  const db = await getDb();

  employees.forEach((emp: { id: number; page_number: number; sort_order: number }) => {
    db.run("UPDATE employees SET page_number = ?, sort_order = ? WHERE id = ? AND store_id = ?",
      [emp.page_number, emp.sort_order, emp.id, req.storeId!]);
  });
  saveDatabase();

  res.json({ success: true });
});

export default router;