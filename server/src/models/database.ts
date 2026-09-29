import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbDir = path.join(__dirname, '../../data');
const dbPath = path.join(dbDir, 'shift_schedule.db');
let db: SqlJsDatabase;

export async function getDb(): Promise<SqlJsDatabase> {
  if (!db) {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  }
  return db;
}

function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export async function initDatabase(): Promise<void> {
  const database = await getDb();

  database.run(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'バイト',
      page_number INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      annual_hours REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS shift_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      deadline TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      period_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      is_off INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (period_id) REFERENCES shift_periods(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS required_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      hour INTEGER NOT NULL,
      required_count REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS date_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      required_count REAL NOT NULL,
      reason TEXT,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS monthly_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      year_month TEXT NOT NULL,
      total_hours REAL DEFAULT 0,
      total_days INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(employee_id, year_month)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS archive_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      period_id INTEGER NOT NULL,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      row_count INTEGER DEFAULT 0,
      csv_filename TEXT,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (period_id) REFERENCES shift_periods(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS shift_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      period_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      available INTEGER DEFAULT 1,
      note TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (period_id) REFERENCES shift_periods(id) ON DELETE CASCADE,
      UNIQUE(employee_id, period_id, date)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL UNIQUE,
      smtp_host TEXT DEFAULT '',
      smtp_port INTEGER DEFAULT 587,
      smtp_user TEXT DEFAULT '',
      smtp_pass TEXT DEFAULT '',
      from_name TEXT DEFAULT '',
      from_email TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  try {
    database.run("ALTER TABLE shift_periods ADD COLUMN deadline TEXT");
  } catch (e) { }

  try {
    database.run("ALTER TABLE employees ADD COLUMN email TEXT DEFAULT ''");
  } catch (e) { }

  insertDefaultHolidays(database);
  saveDb();
}

function insertDefaultHolidays(database: SqlJsDatabase): void {
  const holidays = [
    { date: "2025-01-01", name: "元日" },
    { date: "2025-01-13", name: "成人の日" },
    { date: "2025-02-11", name: "建国記念の日" },
    { date: "2025-02-23", name: "天皇誕生日" },
    { date: "2025-03-20", name: "春分の日" },
    { date: "2025-04-29", name: "昭和の日" },
    { date: "2025-05-03", name: "憲法記念日" },
    { date: "2025-05-04", name: "みどりの日" },
    { date: "2025-05-05", name: "こどもの日" },
    { date: "2025-07-21", name: "海の日" },
    { date: "2025-08-11", name: "山の日" },
    { date: "2025-09-15", name: "敬老の日" },
    { date: "2025-09-23", name: "秋分の日" },
    { date: "2025-10-13", name: "スポーツの日" },
    { date: "2025-11-03", name: "文化の日" },
    { date: "2025-11-23", name: "勤労感謝の日" },
    { date: "2026-01-01", name: "元日" },
    { date: "2026-01-12", name: "成人の日" },
    { date: "2026-02-11", name: "建国記念の日" },
    { date: "2026-02-23", name: "天皇誕生日" },
    { date: "2026-03-20", name: "春分の日" },
    { date: "2026-04-29", name: "昭和の日" },
    { date: "2026-05-03", name: "憲法記念日" },
    { date: "2026-05-04", name: "みどりの日" },
    { date: "2026-05-05", name: "こどもの日" },
    { date: "2026-07-20", name: "海の日" },
    { date: "2026-08-11", name: "山の日" },
    { date: "2026-09-21", name: "敬老の日" },
    { date: "2026-09-23", name: "秋分の日" },
    { date: "2026-10-12", name: "スポーツの日" },
    { date: "2026-11-03", name: "文化の日" },
    { date: "2026-11-23", name: "勤労感謝の日" }
  ];

  const stmt = database.prepare("INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)");
  holidays.forEach((h) => {
    stmt.bind([h.date, h.name]);
    stmt.step();
    stmt.reset();
  });
  stmt.free();
}

export function saveDatabase(): void {
  saveDb();
}

export function archiveOldShifts(monthsToKeep: number = 3): { archivedCount: number; periods: number[] } {
  if (!db) return { archivedCount: 0, periods: [] };

  const cutoffDate = new Date();
  const now = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
  const cutoffStr = cutoffDate.getFullYear() + '-' + String(cutoffDate.getMonth() + 1).padStart(2, '0') + '-' + String(cutoffDate.getDate()).padStart(2, '0');

  const periodsToArchive: number[] = [];
  const periodStmt = db.prepare(
    "SELECT id FROM shift_periods WHERE end_date < ?"
  );
  periodStmt.bind([cutoffStr]);
  while (periodStmt.step()) {
    const row = periodStmt.getAsObject();
    periodsToArchive.push(row.id as number);
  }
  periodStmt.free();

  if (periodsToArchive.length === 0) {
    return { archivedCount: 0, periods: [] };
  }

  let totalDeleted = 0;
  for (const periodId of periodsToArchive) {
    const countStmt = db.prepare("SELECT COUNT(*) as cnt FROM shifts WHERE period_id = ?");
    countStmt.bind([periodId]);
    let cnt = 0;
    if (countStmt.step()) {
      cnt = (countStmt.getAsObject().cnt as number) || 0;
    }
    countStmt.free();

    db.run("DELETE FROM shifts WHERE period_id = ?", [periodId]);
    db.run("DELETE FROM shift_periods WHERE id = ?", [periodId]);
    totalDeleted += cnt;
  }

  saveDb();
  return { archivedCount: totalDeleted, periods: periodsToArchive };
}

export function updateMonthlySummary(employeeId: number, yearMonth: string, totalHours: number, totalDays: number): void {
  if (!db) return;

  const existing = db.prepare(
    "SELECT id FROM monthly_summary WHERE employee_id = ? AND year_month = ?"
  );
  existing.bind([employeeId, yearMonth]);
  const exists = existing.step();
  existing.free();

  if (exists) {
    db.run(
      "UPDATE monthly_summary SET total_hours = ?, total_days = ?, updated_at = datetime('now') WHERE employee_id = ? AND year_month = ?",
      [totalHours, totalDays, employeeId, yearMonth]
    );
  } else {
    db.run(
      "INSERT INTO monthly_summary (employee_id, year_month, total_hours, total_days) VALUES (?, ?, ?, ?)",
      [employeeId, yearMonth, totalHours, totalDays]
    );
  }
  saveDb();
}

export function getMonthlySummary(storeId: number): any[] {
  if (!db) return [];

  const results: any[] = [];
  const stmt = db.prepare(`
    SELECT ms.*, e.name as employee_name, e.tag
    FROM monthly_summary ms
    JOIN employees e ON ms.employee_id = e.id
    WHERE e.store_id = ?
    ORDER BY ms.year_month DESC, e.name
  `);
  stmt.bind([storeId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function cleanupEmptyShifts(): number {
  if (!db) return 0;

  const result = db.run(
    "DELETE FROM shifts WHERE start_time IS NULL AND end_time IS NULL AND is_off = 0"
  );
  saveDb();
  return result;
}