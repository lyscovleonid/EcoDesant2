import { Router } from 'express';
import { extractVkUserId } from '../middleware/auth';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-me-in-production';

const router = Router();

// Назначить организатора по VK ID (требуется секретный ключ)
router.post('/set-organizer', extractVkUserId, (req, res) => {
  const { secret, vk_id, name } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Неверный секретный ключ' });
  }
  if (!vk_id) {
    return res.status(400).json({ error: 'Не указан VK ID' });
  }

  const db = req.app.get('db');
  db.prepare(`
    INSERT OR REPLACE INTO users (vk_id, role, name)
    VALUES (?, 'organizer', ?)
  `).run(vk_id, name || 'Организатор');

  res.json({ success: true, message: `Пользователь ${vk_id} теперь организатор` });
});

// Снять роль организатора (требуется секретный ключ)
router.post('/remove-organizer', extractVkUserId, (req, res) => {
  const { secret, vk_id } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Неверный секретный ключ' });
  }
  if (!vk_id) {
    return res.status(400).json({ error: 'Не указан VK ID' });
  }

  const db = req.app.get('db');
  const result = db.prepare(`
    UPDATE users SET role = 'user' WHERE vk_id = ?
  `).run(vk_id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  res.json({ success: true, message: `Пользователь ${vk_id} больше не организатор` });
});

export default router;