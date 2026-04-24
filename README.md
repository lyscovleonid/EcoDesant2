# 🌿 ЭкоДесант — координация волонтёрских акций

Платформа для организации экологических акций с системой учёта вклада участников. Включает **мини-приложение VK/MAX** и **чат-бота MAX** для удобного управления мероприятиями и волонтёрами.

## 🚀 Функционал

- Создание экологических акций с указанием места, даты, лимита участников и баллов за участие
- Запись волонтёров, генерация уникальных QR‑билетов
- Подтверждение участия через QR‑код
- Начисление баллов за подтверждённое участие
- Управление инвентарём: учёт наличия и выдача участникам
- Гибкие отчёты (CSV, JSON, Excel) с фильтрами и сортировкой
- Система заявок на роль организатора с ручным подтверждением

## 🛠️ Технологии

### Бэкенд
- Node.js + Express + TypeScript
- SQLite (better‑sqlite3)
- Деплой на [Render.com](https://render.com)

### Фронтенд (мини-приложение)
- React + TypeScript
- VKUI
- VK Bridge
- Деплой на GitHub Pages

### Чат-бот
- Node.js + [@maxhub/max-bot-api](https://www.npmjs.com/package/@maxhub/max-bot-api)
- Деплой на Render (Web Service с health‑check)

---

## 📦 Развёртывание (локально)

### 1. Бэкенд

```bash
cd event-backend
npm install
npm run dev
# Сервер запустится на http://localhost:3001
```

### 2. Фронтенд 

```bash
cd event-frontend
npm install
npm start
# Приложение откроется на http://localhost:5173
```

### 3. Бот
```bash
cd bot
npm install
node bot.js
# Бот начнёт принимать сообщения
# Важно: в файле bot.js проверьте, что API_BASE указывает на локальный бэкенд (http://localhost:3001) при разработке.
```

## 🌐 Продакшен‑развёртывание

### Бэкенд (Render)
- Создайте Web Service на Render, подключите репозиторий event-backend.
- Build Command: npm install && npm run build
- Start Command: npm start
- Добавьте Persistent Disk, чтобы база данных не сбрасывалась при перезапусках.
- Установите переменные окружения:
    - ADMIN_SECRET — секретный ключ для назначения организаторов
- После деплоя вы получите публичный URL (например, https://event-backend-h5k0.onrender.com).

### Фронтенд GitHub Pages
- В файле src/api/client.ts укажите продакшен‑URL бэкенда:
    ```ts
    const BASE_URL = 'https://event-backend-h5k0.onrender.com/api';
    ```
- Соберите и задеплойте:
    ```bash
    npm run build
    npm run deploy
- Полученный URL вставьте в настройки мини‑приложения VK/MAX.

### Бот (Render)
- Создайте Web Service на Render, подключите репозиторий bot.
- Build Command: npm install
- Start Command: npm start
- Установите переменные окружения:
    - NODE_ENV=production — чтобы использовался продакшен‑бэкенд
    - ADMIN_SECRET — тот же, что на бэкенде
- Чтобы Render не ждал открытия порта, в коде бота уже добавлен минимальный HTTP‑сервер, отвечающий на /health.
- После деплоя бот автоматически подключится к бэкенду и начнёт принимать сообщения.

## 🔐 Первый запуск – назначение организатора
После развёртывания бэкенда выполните следующий запрос (например, из консоли браузера на любой вкладке) для назначения первого организатора:
```js
fetch('https://event-backend-h5k0.onrender.com/api/admin/set-organizer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-VK-User-Id': 'ID_ПОЛЬЗОВАТЕЛЯ'
  },
  body: JSON.stringify({
    secret: 'ваш_секрет_из_ADMIN_SECRET',
    vk_id: ID_ПОЛЬЗОВАТЕЛЯ,
    name: 'Имя Организатора'
  })
})
.then(r => r.json())
.then(console.log)
```
После этого пользователь с указанным VK/MAX ID получит права организатора.

## Снятие организатора
```js
fetch('https://event-backend-h5k0.onrender.com/api/admin/remove-organizer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-VK-User-Id': 'ID_ПОЛЬЗОВАТЕЛЯ'   // ID организатора, выполняющего действие
  },
  body: JSON.stringify({
    secret: 'ваш_секрет_из_ADMIN_SECRET',
    vk_id: ID_ПОЛЬЗОВАТЕЛЯ             // ID пользователя, с которого снимаем роль
  })
})
.then(r => r.json())
.then(console.log)
```

## 👥 Роли участников

| Участник | Вклад |
|------|-------------|
| **Величук Владислав** | – Написание общего скелета кода<br> – Тестирование проекта<br> – Организация деплоя проекта и первоначального хостинга  |
| **Дмитрий Тарасенко** | – Написание бота<br> – Аудит кода<br> – Тестирование проекта   |
| **Леонид Лысцов** | – Капитан команды<br> – Оформление документации к проекту|