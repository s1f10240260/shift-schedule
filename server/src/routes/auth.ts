import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, saveDatabase } from '../models/database';
import { generateToken } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const { name, password } = req.body;
  const db = await getDb();

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO stores (name, password) VALUES (?, ?)", [name, hashedPassword]);
    const result = db.exec("SELECT last_insert_rowid() as id");
    const storeId = result[0]?.values[0][0] as number;
    saveDatabase();
    const token = generateToken(storeId);
    res.json({ token, storeId, storeName: name });
  } catch (error) {
    res.status(400).json({ error: 'Store name already exists' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { name, password } = req.body;
  const db = await getDb();

  const stmt = db.prepare("SELECT * FROM stores WHERE name = ?");
  stmt.bind([name]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    
    if (bcrypt.compareSync(password, row.password as string)) {
      const token = generateToken(row.id as number);
      res.json({ token, storeId: row.id, storeName: row.name });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } else {
    stmt.free();
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

export default router;