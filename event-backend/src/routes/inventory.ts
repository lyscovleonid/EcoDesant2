import { Router } from 'express';
import { extractVkUserId } from '../middleware/auth';

const router = Router();

// Получить список инвентаря для акции
router.get('/action/:actionId', (req, res) => {
  const db = req.app.get('db');
  const actionId = req.params.actionId;
  const items = db.prepare(`
    SELECT id, name, quantity_required, quantity_promised
    FROM inventory_items
    WHERE action_id = ?
  `).all(actionId);
  res.json(items);
});

// Добавить предмет инвентаря (только организатор акции)
router.post('/action/:actionId', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const actionId = req.params.actionId;

  const action = db.prepare('SELECT organizer_vk_id FROM eco_actions WHERE id = ?').get(actionId);
  if (!action) return res.status(404).json({ error: 'Акция не найдена' });
  if (action.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор может управлять инвентарём' });
  }

  const { name, quantity_required } = req.body;
  if (!name) return res.status(400).json({ error: 'Название предмета обязательно' });

  const stmt = db.prepare(`
    INSERT INTO inventory_items (action_id, name, quantity_required)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(actionId, name, quantity_required || 1);
  res.json({ id: result.lastInsertRowid, message: 'Предмет добавлен' });
});

// Обновить предмет (только организатор)
router.put('/item/:itemId', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const itemId = req.params.itemId;

  const item = db.prepare(`
    SELECT i.*, a.organizer_vk_id
    FROM inventory_items i
    JOIN eco_actions a ON i.action_id = a.id
    WHERE i.id = ?
  `).get(itemId);

  if (!item) return res.status(404).json({ error: 'Предмет не найден' });
  if (item.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор может изменять инвентарь' });
  }

  const { name, quantity_required } = req.body;
  db.prepare(`
    UPDATE inventory_items
    SET name = COALESCE(?, name),
        quantity_required = COALESCE(?, quantity_required)
    WHERE id = ?
  `).run(name, quantity_required, itemId);
  res.json({ success: true });
});

// Удалить предмет (только организатор)
router.delete('/item/:itemId', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const itemId = req.params.itemId;

  const item = db.prepare(`
    SELECT i.*, a.organizer_vk_id
    FROM inventory_items i
    JOIN eco_actions a ON i.action_id = a.id
    WHERE i.id = ?
  `).get(itemId);

  if (!item) return res.status(404).json({ error: 'Предмет не найден' });
  if (item.organizer_vk_id !== userId) {
    return res.status(403).json({ error: 'Только организатор может удалять инвентарь' });
  }

  db.prepare('DELETE FROM inventory_pledges WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM inventory_items WHERE id = ?').run(itemId);
  res.json({ success: true });
});

// Волонтёр обещает принести предмет
router.post('/item/:itemId/pledge', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const userId = req.vkUserId!;
  const itemId = req.params.itemId;
  const { quantity } = req.body;

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: 'Предмет не найден' });

  try {
    const stmt = db.prepare(`
      INSERT INTO inventory_pledges (item_id, user_vk_id, quantity)
      VALUES (?, ?, ?)
    `);
    stmt.run(itemId, userId, quantity || 1);
    // Увеличиваем счётчик обещанного
    db.prepare(`
      UPDATE inventory_items
      SET quantity_promised = quantity_promised + ?
      WHERE id = ?
    `).run(quantity || 1, itemId);
    res.json({ success: true, message: 'Спасибо! Вы записаны на этот предмет.' });
  } catch (e) {
    res.status(400).json({ error: 'Вы уже обещали этот предмет' });
  }
});

// Получить список обещаний для предмета (для организатора)
router.get('/item/:itemId/pledges', extractVkUserId, (req, res) => {
  const db = req.app.get('db');
  const itemId = req.params.itemId;

  const pledges = db.prepare(`
    SELECT p.quantity, u.name, u.vk_id
    FROM inventory_pledges p
    JOIN users u ON p.user_vk_id = u.vk_id
    WHERE p.item_id = ?
  `).all(itemId);
  res.json(pledges);
});

export default router;