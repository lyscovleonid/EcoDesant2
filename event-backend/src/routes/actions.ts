import { Router } from 'express';
import { extractVkUserId } from '../middleware/auth';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
const { Parser } = require('json2csv');

const router = Router();

interface ParticipantRow {
  vk_id: number;
  user_name: string;
  attended: number;
  points_earned: number;
  registered_at: string;
  inventory_name: string | null;
  issued_quantity: number | null;
}

// Получить или обновить имя пользователя
router.get('/my-profile', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const user = db.prepare('SELECT name FROM users WHERE vk_id = ?').get(userId);
  res.json({ name: user?.name || null });
});

router.post('/my-profile', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });

  const existing = db.prepare('SELECT vk_id FROM users WHERE vk_id = ?').get(userId);
  if (existing) {
    db.prepare('UPDATE users SET name = ? WHERE vk_id = ?').run(name, userId);
  } else {
    db.prepare('INSERT INTO users (vk_id, role, name) VALUES (?, ?, ?)').run(userId, 'user', name);
  }
  res.json({ success: true });
});

// Получить все акции
router.get('/', (req, res) => {
  const db = req.app.get('db');
  const actions = db.prepare(`
    SELECT id, title, description, date, location, max_participants, points_per_participant, organizer_vk_id,
           (SELECT COUNT(*) FROM participations WHERE action_id = eco_actions.id) as participants_count
    FROM eco_actions
    ORDER BY date ASC
  `).all();
  res.json(actions);
});

// Создать акцию
router.post('/', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
  if (!user || user.role !== 'organizer') {
    return res.status(403).json({ error: 'Только организаторы могут создавать акции' });
  }
  const { title, description, date, location, max_participants, points_per_participant } = req.body;
  if (!title || !date) {
    return res.status(400).json({ error: 'Название и дата обязательны' });
  }
  const stmt = db.prepare(`
    INSERT INTO eco_actions (title, description, date, location, organizer_vk_id, max_participants, points_per_participant)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title, description, date, location, userId, max_participants || null, points_per_participant || 10);
  res.json({ id: result.lastInsertRowid, message: 'Эко-акция создана' });
});

// Записаться на акцию
router.post('/:actionId/participate', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const actionId = req.params.actionId;
  const userId = req.vkUserId!;

  // Убедимся, что пользователь существует
  const userExists = db.prepare('SELECT vk_id FROM users WHERE vk_id = ?').get(userId);
  if (!userExists) {
    // Создаём запись с ролью 'user' и именем из запроса (если есть)
    const userName = req.body.name || 'Участник';
    db.prepare('INSERT INTO users (vk_id, role, name) VALUES (?, ?, ?)')
      .run(userId, 'user', userName);
  }

  const action = db.prepare('SELECT * FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });

  if (action.max_participants) {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM participations WHERE action_id = ?').get(actionId);
    if (count.cnt >= action.max_participants) {
      return res.status(400).json({ error: 'Все места заняты' });
    }
  }

  const ticketCode = crypto.randomUUID();
  const points = action.points_per_participant || 10;

  try {
    const stmt = db.prepare(`
      INSERT INTO participations (action_id, user_vk_id, ticket_code, points_earned)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(actionId, userId, ticketCode, points);
    res.json({ success: true, ticketCode, points });
  } catch (e) {
    res.status(400).json({ error: 'Вы уже записаны или ошибка базы' });
  }
});

// Получить билет
router.get('/:actionId/my-ticket', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const actionId = req.params.actionId;
  const userId = req.vkUserId!;
  const reg = db.prepare(`
    SELECT ticket_code, points_earned FROM participations
    WHERE action_id = ? AND user_vk_id = ?
  `).get(actionId, userId);
  res.json(reg || null);
});

// Получить роль
router.get('/my-role', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
  res.json({ role: user?.role || 'user' });
});

// Статистика
router.get('/my-stats', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const total = db.prepare(`
    SELECT SUM(points_earned) as total_points
    FROM participations
    WHERE user_vk_id = ? AND attended = 1
  `).get(userId);
  res.json({ total_points: total.total_points || 0 });
});

// Подтверждение билета
router.post('/verify-ticket', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
  if (!user || user.role !== 'organizer') {
    return res.status(403).json({ error: 'Только организаторы могут подтверждать билеты' });
  }
  const { ticketCode } = req.body;
  if (!ticketCode) return res.status(400).json({ error: 'Не указан код билета' });
  const participation = db.prepare(`
    SELECT p.*, a.organizer_vk_id, a.points_per_participant
    FROM participations p
    JOIN eco_actions a ON p.action_id = a.id
    WHERE p.ticket_code = ?
  `).get(ticketCode);
  if (!participation) return res.status(404).json({ error: 'Билет не найден' });
  if (participation.attended) return res.status(400).json({ error: 'Участник уже отмечен' });
  if (participation.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Вы не организатор этой акции' });
  }
  const points = participation.points_per_participant || 10;
  db.prepare(`UPDATE participations SET attended = 1, points_earned = ? WHERE id = ?`).run(points, participation.id);
  db.prepare(`UPDATE users SET total_points = total_points + ? WHERE vk_id = ?`).run(points, participation.user_vk_id);
  res.json({ success: true, points });
});

// Удалить акцию (только её организатор)
router.delete('/:id', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const actionId = req.params.id;

  const action = db.prepare('SELECT organizer_vk_id FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) {
    return res.status(404).json({ error: 'Акция не найдена' });
  }
  if (action.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор акции может её удалить' });
  }

  try {
    // 1. Удаляем записи выдачи инвентаря
    db.prepare(`
      DELETE FROM inventory_log
      WHERE inventory_id IN (SELECT id FROM inventory WHERE action_id = ?)
    `).run(actionId);

    // 2. Удаляем сам инвентарь
    db.prepare('DELETE FROM inventory WHERE action_id = ?').run(actionId);

    // 3. Удаляем участия
    db.prepare('DELETE FROM participations WHERE action_id = ?').run(actionId);

    // 4. Удаляем акцию
    db.prepare('DELETE FROM eco_actions WHERE id = ?').run(actionId);

    res.json({ success: true, message: 'Акция удалена' });
  } catch (err) {
    console.error('Ошибка удаления акции:', err);
    res.status(500).json({ error: 'Ошибка при удалении акции' });
  }
});

// Получить инвентарь
router.get('/:actionId/inventory', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const actionId = req.params.actionId;
  const inventory = db.prepare(`
    SELECT id, name, total_quantity, available_quantity
    FROM inventory
    WHERE action_id = ?
  `).all(actionId);
  res.json(inventory);
});

// Добавить инвентарь
router.post('/:actionId/inventory', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const actionId = req.params.actionId;
  const { name, total_quantity } = req.body;
  if (!name || total_quantity === undefined) {
    return res.status(400).json({ error: 'Название и количество обязательны' });
  }
  const action = db.prepare('SELECT organizer_vk_id FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });
  if (action.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор акции может добавлять инвентарь' });
  }
  const stmt = db.prepare(`
    INSERT INTO inventory (action_id, name, total_quantity, available_quantity)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(actionId, name, total_quantity, total_quantity);
  res.json({ id: result.lastInsertRowid });
});

// Получить участников
router.get('/:actionId/participants', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const actionId = req.params.actionId;
  const action = db.prepare('SELECT organizer_vk_id FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });
  if (action.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор может просматривать участников' });
  }
  const participants = db.prepare(`
    SELECT p.id as participation_id, u.vk_id, u.name
    FROM participations p
    JOIN users u ON p.user_vk_id = u.vk_id
    WHERE p.action_id = ?
    ORDER BY u.name
  `).all(actionId);
  res.json(participants);
});

// Выдать инвентарь
router.post('/:actionId/inventory/issue', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const actionId = req.params.actionId;
  const { inventory_id, participation_id, quantity } = req.body;
  const action = db.prepare('SELECT organizer_vk_id FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });
  if (action.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор может выдавать инвентарь' });
  }
  const inventory = db.prepare('SELECT available_quantity FROM inventory WHERE id = ? AND action_id = ?')
    .get(inventory_id, actionId);
  if (!inventory) return res.status(404).json({ error: 'Инвентарь не найден' });
  if (inventory.available_quantity < quantity) {
    return res.status(400).json({ error: 'Недостаточно доступного инвентаря' });
  }
  db.prepare(`UPDATE inventory SET available_quantity = available_quantity - ? WHERE id = ?`).run(quantity, inventory_id);
  db.prepare(`
    INSERT INTO inventory_log (inventory_id, participation_id, quantity)
    VALUES (?, ?, ?)
  `).run(inventory_id, participation_id, quantity);
  res.json({ success: true });
});

// Гибкий CSV/JSON отчёт (без extractVkUserId, проверка по query)
router.get('/:actionId/report', (req, res) => {
  const db = req.app.get('db');
  const actionId = req.params.actionId;
  const vkId = req.query.vk_id ? Number(req.query.vk_id) : null;
  const format = (req.query.format as string) || 'csv';
  const attendedOnly = req.query.attended_only === 'true';
  const includeInventory = req.query.include_inventory !== 'false';
  const sortBy = (req.query.sort as string) || 'name';

  if (!vkId) return res.status(401).json({ error: 'Не указан vk_id' });

  const action = db.prepare('SELECT organizer_vk_id, title FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });
  if (action.organizer_vk_id !== vkId) {
    return res.status(403).json({ error: 'Только организатор может скачивать отчёт' });
  }

  let query = `
    SELECT 
      u.vk_id, u.name as user_name,
      p.attended, p.points_earned,
      p.registered_at,
      i.name as inventory_name, il.quantity as issued_quantity
    FROM participations p
    JOIN users u ON p.user_vk_id = u.vk_id
    LEFT JOIN inventory_log il ON il.participation_id = p.id
    LEFT JOIN inventory i ON il.inventory_id = i.id
    WHERE p.action_id = ?
  `;
  const params: any[] = [actionId];
  if (attendedOnly) query += ' AND p.attended = 1';
  switch (sortBy) {
    case 'points': query += ' ORDER BY p.points_earned DESC'; break;
    case 'registration': query += ' ORDER BY p.registered_at ASC'; break;
    default: query += ' ORDER BY u.name ASC';
  }

  const rows = db.prepare(query).all(...params) as ParticipantRow[];

  const participantMap = new Map<number, any>();
  rows.forEach((row: ParticipantRow) => {
    if (!participantMap.has(row.vk_id)) {
      participantMap.set(row.vk_id, {
        vk_id: row.vk_id,
        name: row.user_name,
        attended: row.attended ? 'Да' : 'Нет',
        points: row.points_earned,
        registered_at: row.registered_at,
        inventory: []
      });
    }
    if (includeInventory && row.inventory_name) {
      participantMap.get(row.vk_id).inventory.push(`${row.inventory_name} (${row.issued_quantity} шт.)`);
    }
  });

  let participants = Array.from(participantMap.values()).map(p => {
    const result: any = { vk_id: p.vk_id, name: p.name, attended: p.attended, points: p.points };
    if (includeInventory) result.inventory = p.inventory.join('; ') || '—';
    if (format === 'json') result.registered_at = p.registered_at;
    return result;
  });

  if (format === 'json') {
    return res.json({ action: action.title, participants });
  }

  const fields = includeInventory
    ? ['vk_id', 'name', 'attended', 'points', 'inventory']
    : ['vk_id', 'name', 'attended', 'points'];
  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(participants);
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(`action_${actionId}_report.csv`);
  res.send('\uFEFF' + csv);
});

// Excel-отчёт (без extractVkUserId, проверка по query)
router.get('/:actionId/report/excel', async (req, res) => {
  const db = req.app.get('db');
  const actionId = req.params.actionId;
  const vkId = req.query.vk_id ? Number(req.query.vk_id) : null;
  const attendedOnly = req.query.attended_only === 'true';
  const includeInventory = req.query.include_inventory !== 'false';

  if (!vkId) return res.status(401).json({ error: 'Не указан vk_id' });

  const action = db.prepare('SELECT title, organizer_vk_id FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });
  if (action.organizer_vk_id !== vkId) {
    return res.status(403).json({ error: 'Только организатор может скачивать отчёт' });
  }

  let query = `
    SELECT 
      u.vk_id, u.name as user_name,
      p.attended, p.points_earned,
      i.name as inventory_name, il.quantity as issued_quantity
    FROM participations p
    JOIN users u ON p.user_vk_id = u.vk_id
    LEFT JOIN inventory_log il ON il.participation_id = p.id
    LEFT JOIN inventory i ON il.inventory_id = i.id
    WHERE p.action_id = ?
  `;
  const params: any[] = [actionId];
  if (attendedOnly) query += ' AND p.attended = 1';
  query += ' ORDER BY u.name ASC';

  const rows = db.prepare(query).all(...params) as any[];

  const participantMap = new Map<number, any>();
  rows.forEach((row: any) => {
    if (!participantMap.has(row.vk_id)) {
      participantMap.set(row.vk_id, {
        vk_id: row.vk_id,
        name: row.user_name,
        attended: row.attended ? 'Да' : 'Нет',
        points: row.points_earned,
        inventory: []
      });
    }
    if (includeInventory && row.inventory_name) {
      participantMap.get(row.vk_id).inventory.push(`${row.inventory_name} (${row.issued_quantity} шт.)`);
    }
  });

  const participants = Array.from(participantMap.values()).map(p => ({
    ...p,
    inventory: p.inventory.join('; ') || '—'
  }));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Участники');

  const columns = [
    { header: 'VK ID', key: 'vk_id', width: 12 },
    { header: 'Имя', key: 'name', width: 20 },
    { header: 'Присутствовал', key: 'attended', width: 15 },
    { header: 'Баллы', key: 'points', width: 10 },
  ];
  if (includeInventory) {
    columns.push({ header: 'Выданный инвентарь', key: 'inventory', width: 40 });
  }
  worksheet.columns = columns;

  participants.forEach(p => worksheet.addRow(p));

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=action_${actionId}_report.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

export default router;