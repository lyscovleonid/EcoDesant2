import { Router } from 'express';
import { extractVkUserId } from '../middleware/auth';

const router = Router();

// Подать заявку (любой авторизованный пользователь)
router.post('/', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const { name, reason } = req.body;

  console.log(`📥 Заявка от ${userId}: ${name}, причина: ${reason}`);

  try {
    // Сначала убедимся, что пользователь есть в таблице users
    const userExists = db.prepare('SELECT vk_id FROM users WHERE vk_id = ?').get(userId);
    if (!userExists) {
      // Создаём запись о пользователе с ролью 'user'
      db.prepare('INSERT INTO users (vk_id, role, name) VALUES (?, ?, ?)')
        .run(userId, 'user', name || 'Участник');
      console.log(`👤 Создан новый пользователь: ${userId}`);
    }

    // Проверяем, нет ли уже активной заявки
    const existing = db.prepare(
      "SELECT * FROM organizer_requests WHERE vk_id = ? AND status = 'pending'"
    ).get(userId);
    if (existing) {
      console.log(`⚠️ У пользователя ${userId} уже есть активная заявка`);
      return res.status(400).json({ error: 'У вас уже есть активная заявка' });
    }

    // Проверяем, не является ли уже организатором
    const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
    if (user?.role === 'organizer') {
      console.log(`⚠️ Пользователь ${userId} уже организатор`);
      return res.status(400).json({ error: 'Вы уже организатор' });
    }

    // Вставляем заявку
    const stmt = db.prepare(`
      INSERT INTO organizer_requests (vk_id, name, reason, status)
      VALUES (?, ?, ?, 'pending')
    `);
    const result = stmt.run(userId, name || 'Без имени', reason || '');
    console.log(`✅ Заявка создана, id: ${result.lastInsertRowid}`);
    
    res.json({ id: result.lastInsertRowid, message: 'Заявка отправлена' });
  } catch (err) {
    console.error('❌ Ошибка при создании заявки:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить список заявок (только для организаторов)
router.get('/', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;

  try {
    const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
    if (user?.role !== 'organizer') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const requests = db.prepare(`
      SELECT id, vk_id, name, reason, status, created_at
      FROM organizer_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();
    res.json(requests);
  } catch (err) {
    console.error('❌ Ошибка получения заявок:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Одобрить заявку (организатор)
router.put('/:id/approve', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const requestId = req.params.id;

  try {
    const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
    if (user?.role !== 'organizer') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const request = db.prepare('SELECT * FROM organizer_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Заявка не найдена' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Заявка уже обработана' });
    }

    db.prepare(`UPDATE users SET role = 'organizer' WHERE vk_id = ?`).run(request.vk_id);
    db.prepare(`UPDATE organizer_requests SET status = 'approved' WHERE id = ?`).run(requestId);

    res.json({ success: true, message: `Пользователь ${request.vk_id} теперь организатор` });
  } catch (err) {
    console.error('❌ Ошибка одобрения заявки:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Отклонить заявку
router.put('/:id/reject', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const requestId = req.params.id;

  try {
    const user = db.prepare('SELECT role FROM users WHERE vk_id = ?').get(userId);
    if (user?.role !== 'organizer') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const request = db.prepare('SELECT * FROM organizer_requests WHERE id = ?').get(requestId);
    if (!request) return res.status(404).json({ error: 'Заявка не найдена' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Заявка уже обработана' });
    }

    db.prepare(`UPDATE organizer_requests SET status = 'rejected' WHERE id = ?`).run(requestId);
    res.json({ success: true, message: 'Заявка отклонена' });
  } catch (err) {
    console.error('❌ Ошибка отклонения заявки:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;