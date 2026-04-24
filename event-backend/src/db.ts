import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const initDB = () => {
  const dbPath = process.env.NODE_ENV === 'production'
    ? '/opt/render/project/src/data/ecodesant.db'
    : path.join(__dirname, '../ecodesant.db');

  if (process.env.NODE_ENV === 'production') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  
  db.pragma('encoding = "UTF-8"');
  const encoding = db.pragma('encoding', { simple: true });
  console.log(`✅ Database encoding set to: ${encoding}`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      vk_id INTEGER PRIMARY KEY,
      role TEXT DEFAULT 'user',
      name TEXT,
      total_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eco_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      location TEXT,
      organizer_vk_id INTEGER NOT NULL,
      max_participants INTEGER,
      points_per_participant INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizer_vk_id) REFERENCES users(vk_id)
    );

    CREATE TABLE IF NOT EXISTS participations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id INTEGER NOT NULL,
      user_vk_id INTEGER NOT NULL,
      ticket_code TEXT UNIQUE NOT NULL,
      attended INTEGER DEFAULT 0,
      points_earned INTEGER DEFAULT 0,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (action_id) REFERENCES eco_actions(id),
      FOREIGN KEY (user_vk_id) REFERENCES users(vk_id),
      UNIQUE(action_id, user_vk_id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      total_quantity INTEGER NOT NULL,
      available_quantity INTEGER NOT NULL,
      FOREIGN KEY (action_id) REFERENCES eco_actions(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      participation_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (participation_id) REFERENCES participations(id)
    );

    CREATE TABLE IF NOT EXISTS organizer_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vk_id INTEGER NOT NULL,
      name TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vk_id) REFERENCES users(vk_id)
    );
  `);

  return db;
};