import 'dotenv/config';
import QRCode from 'qrcode';
import http from 'http';

import {
    Bot,
    Keyboard,
    ImageAttachment,
    LocationAttachment,
} from '@maxhub/max-bot-api';

// Минимальный сервер для health check (Render требует открытый порт)
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🩺 Health check server listening on port ${PORT}`);
});

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const API_BASE = IS_PRODUCTION
    ? process.env.PRODUCTION_BACKEND
    : process.env.LOCAL_BACKEND;

console.log(`🌍 Используется API: ${API_BASE}`);
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ Переменная окружения BOT_TOKEN не задана');
    process.exit(1);
}

// ─── Бот ─────────────────────────────────────────────────────────────────────

const bot = new Bot(BOT_TOKEN);

bot.api.setMyCommands([
    { name: 'start', description: 'Зайти в профиль' },
    { name: 'help', description: 'Получить помощь' },
]).catch(e => console.warn('⚠️ Не удалось установить команды бота, продолжаем...'));

// ─── Хелперы для работы с API ─────────────────────────────────────────────────

async function apiRequest(method, path, vkId, body = null) {
    if (!vkId) throw new Error('VK ID is required');
    const url = `${API_BASE}${path}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'x-vk-user-id': String(vkId),
        },
    };
    if (body) options.body = JSON.stringify(body);
    console.log(`📡 ${method} ${path} (vkId: ${vkId})`);
    const res = await fetch(url, options);
    // Принудительно декодируем как UTF-8
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    try {
        return JSON.parse(text);
    } catch {
        console.error('❌ Ответ не JSON:', text.slice(0, 200));
        throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`);
    }
}

const api = {
    // Акции
    getActions: () => fetch(`${API_BASE}/api/actions`).then((r) => r.json()),
    createAction: (vkId, data) => apiRequest('POST', '/api/actions', vkId, data),
    deleteAction: (vkId, id) => apiRequest('DELETE', `/api/actions/${id}`, vkId),

    // Роль и статистика пользователя
    getMyRole: (vkId) => apiRequest('GET', '/api/actions/my-role', vkId),
    getMyStats: (vkId) => apiRequest('GET', '/api/actions/my-stats', vkId),

    // Участие
    participate: (vkId, actionId) =>
        apiRequest('POST', `/api/actions/${actionId}/participate`, vkId),
    getMyTicket: (vkId, actionId) =>
        apiRequest('GET', `/api/actions/${actionId}/my-ticket`, vkId),
    verifyTicket: (vkId, ticketCode) =>
        apiRequest('POST', '/api/actions/verify-ticket', vkId, { ticketCode }),

    // Инвентарь
    getInventory: (vkId, actionId) =>
        apiRequest('GET', `/api/actions/${actionId}/inventory`, vkId),
    addInventory: (vkId, actionId, name, total_quantity) =>
        apiRequest('POST', `/api/actions/${actionId}/inventory`, vkId, {
            name,
            total_quantity,
        }),
    issueInventory: (vkId, actionId, inventory_id, participation_id, quantity) =>
        apiRequest('POST', `/api/actions/${actionId}/inventory/issue`, vkId, {
            inventory_id,
            participation_id,
            quantity,
        }),

    // Участники
    getParticipants: (vkId, actionId) =>
        apiRequest('GET', `/api/actions/${actionId}/participants`, vkId),

    // Отчёты
    getReportUrl: (actionId, vkId, format = 'csv') =>
        `${API_BASE}/api/actions/${actionId}/report?format=${format}&vk_id=${vkId}`,
    getExcelReportUrl: (actionId, vkId) =>
        `${API_BASE}/api/actions/${actionId}/report/excel?vk_id=${vkId}`,

    // Инвентарь (pledge) – временно заглушки
    getPledgeItems: async () => [],
    addPledgeItem: async () => ({ error: 'Функция временно недоступна' }),
    pledge: async () => ({ error: 'Функция временно недоступна' }),
    getPledges: async () => [],
    updatePledgeItem: async () => ({ error: 'Функция временно недоступна' }),
    deletePledgeItem: async () => ({ error: 'Функция временно недоступна' }),

    // Администрирование
    setOrganizer: (vkId, targetVkId, name) =>
        apiRequest('POST', '/api/admin/set-organizer', vkId, {
            secret: process.env.ADMIN_SECRET,
            vk_id: targetVkId,
            name,
        }),
    removeOrganizer: (vkId, targetVkId) =>
        apiRequest('POST', '/api/admin/remove-organizer', vkId, {
            secret: process.env.ADMIN_SECRET,
            vk_id: targetVkId,
        }),

    // Заявки на организатора
    submitRequest: (vkId, name, reason) =>
        apiRequest('POST', '/api/organizer-requests', vkId, { name, reason }),
    getRequests: (vkId) =>
        apiRequest('GET', '/api/organizer-requests', vkId),
    approveRequest: (vkId, requestId) =>
        apiRequest('PUT', `/api/organizer-requests/${requestId}/approve`, vkId),
    rejectRequest: (vkId, requestId) =>
        apiRequest('PUT', `/api/organizer-requests/${requestId}/reject`, vkId),
};

// ─── Состояние диалогов (in-memory) ──────────────────────────────────────────
const sessions = new Map();

function getSession(userId) {
    if (!sessions.has(userId)) sessions.set(userId, { step: null, data: {} });
    return sessions.get(userId);
}
function clearSession(userId) {
    sessions.set(userId, { step: null, data: {} });
}

// ─── Клавиатуры ───────────────────────────────────────────────────────────────

function mainMenuKeyboard(isOrganizer = false) {
    const rows = [
        [
            Keyboard.button.callback('📋 Список акций', 'list_actions'),
            Keyboard.button.callback('🎫 Мой билет', 'my_ticket_menu'),
        ],
        [
            Keyboard.button.callback('⭐ Мои баллы', 'my_stats'),
        ],
    ];
    if (isOrganizer) {
        rows.push([
            Keyboard.button.callback('➕ Создать акцию', 'create_action'),
            Keyboard.button.callback('✅ Отметить билет', 'verify_ticket'),
        ]);
        rows.push([
            Keyboard.button.callback('👥 Участники акции', 'show_participants'),
            Keyboard.button.callback('📊 Отчёт (CSV)', 'report_csv'),
        ]);
        rows.push([
            Keyboard.button.callback('📊 Отчёт (Excel)', 'report_excel'),
        ]);
        rows.push([
            Keyboard.button.callback('📦 Управление инвентарём', 'manage_inventory'),
        ]);
        rows.push([
            Keyboard.button.callback('🗑️ Удалить акцию', 'delete_action'),
        ]);
        rows.push([
        Keyboard.button.callback('📋 Заявки на организатора', 'organizer_requests'),
        ]);
        } else {
        rows.push([
            Keyboard.button.callback('📝 Стать организатором', 'request_organizer'),
        ]);
    }
    return Keyboard.inlineKeyboard(rows);
}

function actionsKeyboard(actions, callbackPrefix) {
    const rows = actions.slice(0, 10).map((a) => [
        Keyboard.button.callback(
            `${a.title} (${a.date})`,
            `${callbackPrefix}:${a.id}`
        ),
    ]);
    rows.push([Keyboard.button.callback('🏠 Главное меню', 'main_menu')]);
    return Keyboard.inlineKeyboard(rows);
}

function cancelKeyboard() {
    return Keyboard.inlineKeyboard([
        [Keyboard.button.callback('❌ Отмена', 'cancel')],
    ]);
}

// ─── Форматирование ───────────────────────────────────────────────────────────

function formatActionWithMap(a) {
    const mapLink = a.location
        ? `\n🗺️ [Посмотреть на карте](https://yandex.ru/maps/?text=${encodeURIComponent(a.location)})`
        : '';
    return (
        `**${a.title}**\n` +
        `📅 ${a.date}` +
        (a.location ? ` · 📍 ${a.location}` : '') +
        mapLink +
        `\n👥 Участников: ${a.participants_count ?? '?'}` +
        (a.max_participants ? `/${a.max_participants}` : '') +
        `\n⭐ Баллов за участие: ${a.points_per_participant ?? 10}`
    );
}

// ─── /start ───────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
    const userId = ctx.user?.user_id;
    clearSession(userId);

    const { role } = await api.getMyRole(userId);
    const isOrg = role === 'organizer';

    // Проверяем, есть ли имя
    const profile = await apiRequest('GET', '/api/actions/my-profile', userId);
    if (!profile.name) {
        const session = getSession(userId);
        session.step = 'set_name';
        return ctx.reply('👋 Добро пожаловать! Как к вам обращаться?', {
            attachments: [cancelKeyboard()],
        });
    }

    await ctx.reply(
        `👋 Привет, ${profile.name}! Я бот эко-акций MAX.\n\n` +
        `Твоя роль: **${isOrg ? 'Организатор' : 'Участник'}**\n\n` +
        `Выбери действие:`,
        { format: 'markdown', attachments: [mainMenuKeyboard(isOrg)] }
    );
});

// ─── /help ────────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
    await ctx.reply(
        `**Доступные команды:**\n\n` +
        `/start — главное меню\n` +
        `/help — эта справка\n\n` +
        `**Что умеет бот:**\n` +
        `• Показывать список эко-акций\n` +
        `• Записываться на акции и выдавать QR-билеты\n` +
        `• Показывать ваши баллы\n` +
        `**Организаторам:**\n` +
        `• Создавать и удалять акции\n` +
        `• Отмечать посещаемость по коду билета\n` +
        `• Управлять инвентарём\n` +
        `• Скачивать отчёты CSV/Excel\n` +
        `• Рассматривать заявки на организатора`,
        { format: 'markdown' }
    );
});

// ─── bot_started (первый запуск) ──────────────────────────────────────────────

bot.on('bot_started', async (ctx) => {
    const userId = ctx.user?.user_id;
    const { role } = await api.getMyRole(userId);
    await ctx.reply(
        `🌱 Добро пожаловать в эко-акции MAX!\nНапиши /start чтобы начать.`,
        { format: 'markdown' }
    );
});

// ─── Главное меню (callback) ──────────────────────────────────────────────────

bot.action('main_menu', async (ctx) => {
    const userId = ctx.user?.user_id;
    clearSession(userId);
    const { role } = await api.getMyRole(userId);
    await ctx.reply('Главное меню:', {
        attachments: [mainMenuKeyboard(role === 'organizer')],
    });
});

bot.action('cancel', async (ctx) => {
    const userId = ctx.user?.user_id;
    clearSession(userId);
    await ctx.reply('Отменено.', {
        attachments: [
            Keyboard.inlineKeyboard([
                [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
            ]),
        ],
    });
});

// ─── Список акций ─────────────────────────────────────────────────────────────

bot.action('list_actions', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) {
        return ctx.reply('Пока нет активных акций.', {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }
    const lines = actions.map((a) => formatActionWithMap(a)).join('\n\n---\n\n');
    await ctx.reply(lines, {
        format: 'markdown',
        attachments: [actionsKeyboard(actions, 'join_action')],
    });
});

// ─── Записаться на акцию ──────────────────────────────────────────────────────

bot.action(/^join_action:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];
    const result = await api.participate(userId, actionId);

    if (result.error) {
        return ctx.reply(`❌ ${result.error}`, {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    const ticketCode = result.ticketCode;
    const points = result.points;

    try {
        const qrBuffer = await QRCode.toBuffer(ticketCode, {
            width: 200,
            margin: 2,
        });

        const image = await ctx.api.uploadImage({ source: qrBuffer });

        await ctx.reply(
            `✅ Вы записаны!\n\n🎫 Код билета:\n\`${ticketCode}\`\n\n⭐ Получите **${points}** баллов после отметки.`,
            {
                format: 'markdown',
                attachments: [
                    image.toJson(),
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            }
        );
    } catch (err) {
        console.error('Ошибка генерации QR при записи:', err);
        await ctx.reply(
            `✅ Вы записаны!\n\n⚠️ Не удалось отобразить QR-код.\n\n🎫 Код билета:\n\`${ticketCode}\`\n\n⭐ Получите **${points}** баллов после отметки.`,
            {
                format: 'markdown',
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            }
        );
    }
});

// ─── Мой билет (выбор акции) ──────────────────────────────────────────────────

bot.action('my_ticket_menu', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) return ctx.reply('Нет доступных акций.');
    await ctx.reply('На какую акцию показать билет?', {
        attachments: [actionsKeyboard(actions, 'my_ticket')],
    });
});

bot.action(/^my_ticket:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];
    const ticket = await api.getMyTicket(userId, actionId);

    if (!ticket) {
        return ctx.reply('Вы не записаны на эту акцию.', {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    try {
        const qrBuffer = await QRCode.toBuffer(ticket.ticket_code, {
            width: 200,
            margin: 2,
        });

        const image = await ctx.api.uploadImage({ source: qrBuffer });

        await ctx.reply(
            `🎫 Ваш билет:\n\n\`${ticket.ticket_code}\`\n\n⭐ Баллов: ${ticket.points_earned}`,
            {
                format: 'markdown',
                attachments: [
                    image.toJson(),
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            }
        );
    } catch (err) {
        console.error('Ошибка генерации QR:', err);
        await ctx.reply(
            `⚠️ Не удалось отобразить QR-код.\n\n` +
            `🎫 Ваш билет:\n\n\`${ticket.ticket_code}\`\n\n⭐ Баллов: ${ticket.points_earned}`,
            {
            format: 'markdown',
            attachments: [
                Keyboard.inlineKeyboard([
                [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
            }
        );
    }
});

// ─── Мои баллы ────────────────────────────────────────────────────────────────

bot.action('my_stats', async (ctx) => {
    const userId = ctx.user?.user_id;
    const stats = await api.getMyStats(userId);
    await ctx.reply(`⭐ Ваши баллы: **${stats.total_points}**`, {
        format: 'markdown',
        attachments: [
            Keyboard.inlineKeyboard([
                [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
            ]),
        ],
    });
});

// ─── ОРГАНИЗАТОР: Создать акцию (многошаговый диалог) ─────────────────────────

bot.action('create_action', async (ctx) => {
    const userId = ctx.user?.user_id;
    const session = getSession(userId);
    session.step = 'create_title';
    session.data = {};
    await ctx.reply('✏️ Введите **название** акции:', {
        format: 'markdown',
        attachments: [cancelKeyboard()],
    });
});

// ─── ОРГАНИЗАТОР: Подтвердить билет (многошаговый диалог) ─────────────────────

bot.action('verify_ticket', async (ctx) => {
    const userId = ctx.user?.user_id;
    const session = getSession(userId);
    session.step = 'verify_code';
    await ctx.reply('🎫 Введите **код билета** для подтверждения:', {
        format: 'markdown',
        attachments: [cancelKeyboard()],
    });
});

// ─── ОРГАНИЗАТОР: Участники акции ─────────────────────────────────────────────

bot.action('show_participants', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) return ctx.reply('Нет акций.');
    await ctx.reply('Участники какой акции?', {
        attachments: [actionsKeyboard(actions, 'participants_action')],
    });
});

bot.action(/^participants_action:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];
    const result = await api.getParticipants(userId, actionId);

    if (result.error) return ctx.reply(`❌ ${result.error}`);
    if (!result.length) return ctx.reply('Участников пока нет.');

    const lines = result
        .map((p, i) => `${i + 1}. ${p.name || 'Без имени'} (VK ID: ${p.vk_id})`)
        .join('\n');

    await ctx.reply(`👥 Участники акции:\n\n${lines}`, {
        attachments: [
            Keyboard.inlineKeyboard([
                [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
            ]),
        ],
    });
});

// ─── Управление инвентарём (подменю) ───────────────────────────────────────
bot.action('manage_inventory', async (ctx) => {
    const keyboard = Keyboard.inlineKeyboard([
        [Keyboard.button.callback('🏷 Добавить инвентарь', 'add_inventory')],
        [Keyboard.button.callback('📤 Выдать инвентарь', 'issue_inventory')],
        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
    ]);
    await ctx.reply('Выберите действие с инвентарём:', { attachments: [keyboard] });
});

// ─── ОРГАНИЗАТОР: Удалить акцию ──────────────────────────────────────────────
bot.action('delete_action', async (ctx) => {
    const userId = ctx.user?.user_id;
    const actions = await api.getActions();

    const myActions = actions.filter(a => a.organizer_vk_id === userId);

    if (!myActions.length) {
        return ctx.reply('У вас нет созданных акций.', {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    const rows = myActions.map((a) => [
        Keyboard.button.callback(
            `${a.title} (${a.date})`,
            `confirm_delete:${a.id}`
        ),
    ]);
    rows.push([Keyboard.button.callback('🏠 Главное меню', 'main_menu')]);
    await ctx.reply('Выберите акцию для удаления:', {
        attachments: [Keyboard.inlineKeyboard(rows)],
    });
});

bot.action(/^confirm_delete:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];

    const actions = await api.getActions();
    const action = actions.find(a => a.id === Number(actionId));
    if (!action) {
        return ctx.reply('❌ Акция не найдена.', {
            attachments: [[Keyboard.button.callback('🏠 Главное меню', 'main_menu')]],
        });
    }

    const keyboard = Keyboard.inlineKeyboard([
        [
            Keyboard.button.callback('✅ Да, удалить', `do_delete:${actionId}`),
            Keyboard.button.callback('❌ Отмена', 'main_menu'),
        ],
    ]);

    await ctx.reply(
        `Вы уверены, что хотите удалить акцию **«${action.title}»**?\n\n` +
        `Все записи участников и инвентарь будут потеряны.`,
        { format: 'markdown', attachments: [keyboard] }
    );
});

bot.action(/^do_delete:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];

    const result = await api.deleteAction(userId, actionId);
    if (result.error) {
        return ctx.reply(`❌ Ошибка: ${result.error}`, {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')]
                ])
            ],
        });
    }

    await ctx.reply('✅ Акция успешно удалена.', {
        attachments: [
            Keyboard.inlineKeyboard([
                [Keyboard.button.callback('🏠 Главное меню', 'main_menu')]
            ])
        ],
    });
});

// ─── ОРГАНИЗАТОР: Отчёт CSV ───────────────────────────────────────────────────

bot.action('report_csv', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) return ctx.reply('Нет акций.');
    await ctx.reply('Отчёт CSV для какой акции?', {
        attachments: [actionsKeyboard(actions, 'do_report_csv')],
    });
});

bot.action(/^do_report_csv:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];
    const url = api.getReportUrl(actionId, userId, 'csv');
    await ctx.reply(
        `📊 CSV-отчёт для акции #${actionId} готов.`,
        {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.link('📥 Скачать CSV', url)],
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        }
    );
});

// ─── ОРГАНИЗАТОР: Отчёт Excel ────────────────────────────────────────────────

bot.action('report_excel', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) return ctx.reply('Нет акций.');
    await ctx.reply('Отчёт Excel для какой акции?', {
        attachments: [actionsKeyboard(actions, 'do_report_excel')],
    });
});

bot.action(/^do_report_excel:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];
    const url = api.getExcelReportUrl(actionId, userId);
    await ctx.reply(
        `📊 Excel-отчёт для акции #${actionId} готов.`,
        {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.link('📥 Скачать Excel', url)],
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        }
    );
});

// ─── ОРГАНИЗАТОР: Добавить инвентарь (многошаговый диалог) ───────────────────

bot.action('add_inventory', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) return ctx.reply('Нет акций.');
    await ctx.reply('К какой акции добавить инвентарь?', {
        attachments: [actionsKeyboard(actions, 'add_inv_action')],
    });
});

bot.action(/^add_inv_action:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const session = getSession(userId);
    session.step = 'add_inv_name';
    session.data.actionId = ctx.match[1];
    await ctx.reply('📦 Введите **название** предмета инвентаря:', {
        format: 'markdown',
        attachments: [cancelKeyboard()],
    });
});

// ─── ОРГАНИЗАТОР: Выдать инвентарь (многошаговый диалог) ─────────────────────
bot.action('issue_inventory', async (ctx) => {
    const actions = await api.getActions();
    if (!actions.length) return ctx.reply('Нет акций.');
    await ctx.reply('Для какой акции выдать инвентарь?', {
        attachments: [actionsKeyboard(actions, 'issue_inv_action')],
    });
});

bot.action(/^issue_inv_action:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const actionId = ctx.match[1];
    const session = getSession(userId);
    session.step = 'issue_inv_select_participant';
    session.data = { actionId };

    const participants = await api.getParticipants(userId, actionId);
    if (participants.error) {
        return ctx.reply(`❌ ${participants.error}`, {
            attachments: [[Keyboard.button.callback('🏠 Главное меню', 'main_menu')]],
        });
    }
    if (!participants.length) {
        return ctx.reply('На эту акцию ещё никто не записался.', {
            attachments: [[Keyboard.button.callback('🏠 Главное меню', 'main_menu')]],
        });
    }

    const rows = participants.map((p) => [
        Keyboard.button.callback(
            `${p.name || 'Без имени'} (VK ID: ${p.vk_id})`,
            `issue_inv_participant:${p.participation_id}`
        ),
    ]);
    rows.push([Keyboard.button.callback('🏠 Главное меню', 'main_menu')]);
    await ctx.reply('Кому выдать инвентарь?', {
        attachments: [Keyboard.inlineKeyboard(rows)],
    });
});

bot.action(/^issue_inv_participant:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const participationId = ctx.match[1];
    const session = getSession(userId);
    session.data.participationId = participationId;
    session.step = 'issue_inv_select_item';

    const inventory = await api.getInventory(userId, session.data.actionId);
    if (inventory.error) {
        return ctx.reply(`❌ ${inventory.error}`, {
            attachments: [[Keyboard.button.callback('🏠 Главное меню', 'main_menu')]],
        });
    }
    const available = inventory.filter((i) => i.available_quantity > 0);
    if (!available.length) {
        return ctx.reply('Нет доступного инвентаря для выдачи.', {
            attachments: [[Keyboard.button.callback('🏠 Главное меню', 'main_menu')]],
        });
    }

    const rows = available.map((item) => [
        Keyboard.button.callback(
            `${item.name} (доступно ${item.available_quantity})`,
            `issue_inv_item:${item.id}`
        ),
    ]);
    rows.push([Keyboard.button.callback('🏠 Главное меню', 'main_menu')]);
    await ctx.reply('Какой предмет выдать?', {
        attachments: [Keyboard.inlineKeyboard(rows)],
    });
});

bot.action(/^issue_inv_item:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const itemId = ctx.match[1];
    const session = getSession(userId);
    session.data.inventoryId = itemId;
    session.step = 'issue_inv_quantity';
    await ctx.reply('Введите количество для выдачи:', {
        attachments: [cancelKeyboard()],
    });
});

// ─── Карта ──────────────────────────────────────────────────────────────────

bot.action('pick_location', async (ctx) => {
    const userId = ctx.user?.user_id;
    const session = getSession(userId);
    if (session.step !== 'create_location') return;

    const mapUrl = 'https://yandex.ru/maps/?ll=37.618423%2C55.751244&z=12';
    await ctx.reply(
        `🗺️ [Открыть Яндекс.Карты](${mapUrl})\n\n` +
        `Найдите место, скопируйте адрес и вставьте его сюда.`,
        { format: 'markdown' }
    );
});

// ─── НОВОЕ: Подать заявку на организатора ─────────────────────────────────────

bot.action('request_organizer', async (ctx) => {
    const userId = ctx.user?.user_id;
    if (!userId) {
        return ctx.reply('❌ Не удалось определить ваш ID.');
    }
    const session = getSession(userId);
    session.step = 'req_organizer_name';
    await ctx.reply('📝 Введите **ваше имя** (для заявки на организатора):', {
        format: 'markdown',
        attachments: [cancelKeyboard()],
    });
});

// ─── Просмотр заявок (для организатора) ───────────────────────────────

bot.action('organizer_requests', async (ctx) => {
    const userId = ctx.user?.user_id;
    if (!userId) {
        return ctx.reply('❌ Не удалось определить ваш ID. Попробуйте позже.');
    }
    const requests = await api.getRequests(userId);

    if (requests.error) {
        return ctx.reply(`❌ ${requests.error}`, {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    if (!requests.length) {
        return ctx.reply('Нет активных заявок.', {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    for (const req of requests) {
        const text = `📋 **Заявка #${req.id}**\n👤 ${req.name} (VK ID: ${req.vk_id})\n📝 Причина: ${req.reason || 'не указана'}`;
        const keyboard = Keyboard.inlineKeyboard([
            [
                Keyboard.button.callback('✅ Одобрить', `approve_req:${req.id}`),
                Keyboard.button.callback('❌ Отклонить', `reject_req:${req.id}`),
            ],
        ]);
        await ctx.reply(text, { format: 'markdown', attachments: [keyboard] });
    }

    await ctx.reply('Вернуться в меню:', {
        attachments: [
            Keyboard.inlineKeyboard([
                [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
            ]),
        ],
    });
});

bot.action(/^approve_req:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const requestId = ctx.match[1];
    const result = await api.approveRequest(userId, requestId);
    if (result.error) {
        return ctx.reply(`❌ ${result.error}`);
    }
    await ctx.reply(`✅ ${result.message}`);
});

bot.action(/^reject_req:(\d+)$/, async (ctx) => {
    const userId = ctx.user?.user_id;
    const requestId = ctx.match[1];
    const result = await api.rejectRequest(userId, requestId);
    if (result.error) {
        return ctx.reply(`❌ ${result.error}`);
    }
    await ctx.reply(`✅ ${result.message}`);
});

// ─── Обработчик входящих сообщений (многошаговые диалоги) ─────────────────────

bot.on('message_created', async (ctx) => {
    const userId = ctx.user?.user_id;
    const text = ctx.message?.body?.text?.trim();
    const session = getSession(userId);

    console.log(userId);

    if (!text || !session.step) return;
    
    if (session.step === 'set_name') {
        const name = text.trim();
        if (!name) return ctx.reply('Пожалуйста, введите имя.');
        await apiRequest('POST', '/api/actions/my-profile', userId, { name });
        clearSession(userId);
        const { role } = await api.getMyRole(userId);
        const isOrg = role === 'organizer';
        return ctx.reply(
            `✅ Спасибо, ${name}!\n\n` +
            `Твоя роль: **${isOrg ? 'Организатор' : 'Участник'}**\n\n` +
            `Выбери действие:`,
            { format: 'markdown', attachments: [mainMenuKeyboard(isOrg)] }
        );
    }
    // Создание акции
    if (session.step === 'create_title') {
        session.data.title = text;
        session.step = 'create_date';
        return ctx.reply('📅 Введите **дату** акции (например, 15.06.2025):', {
            format: 'markdown',
            attachments: [cancelKeyboard()],
        });
    }

    if (session.step === 'create_date') {
        const dateInput = text.trim();
        
        // Проверяем формат ДД.ММ.ГГГГ (день.месяц.год)
        const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
        const match = dateInput.match(dateRegex);
        
        if (!match) {
            return ctx.reply(
                '❌ Неверный формат даты. Пожалуйста, введите дату в формате **ДД.ММ.ГГГГ** (например, 15.06.2025):',
                {
                    format: 'markdown',
                    attachments: [cancelKeyboard()],
                }
            );
        }
        
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        
        // Проверяем корректность даты (учитываем високосные годы)
        const dateObj = new Date(year, month - 1, day);
        if (
            dateObj.getFullYear() !== year ||
            dateObj.getMonth() !== month - 1 ||
            dateObj.getDate() !== day
        ) {
            return ctx.reply(
                '❌ Такой даты не существует. Пожалуйста, введите корректную дату (например, 15.06.2025):',
                {
                    format: 'markdown',
                    attachments: [cancelKeyboard()],
                }
            );
        }
        
        // Преобразуем в формат YYYY-MM-DD для бэкенда
        const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // Опционально: проверка, что дата не в прошлом
        // const today = new Date();
        // today.setHours(0, 0, 0, 0);
        // if (dateObj < today) {
        //     return ctx.reply('❌ Дата не может быть в прошлом. Введите будущую дату:', {
        //         format: 'markdown',
        //         attachments: [cancelKeyboard()],
        //     });
        // }
        
        session.data.date = isoDate;   // сохраняем в ISO для API
        session.step = 'create_location';
        
        return ctx.reply('📍 Введите **место** проведения (или отправьте "-" чтобы пропустить):', {
            format: 'markdown',
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🗺️ Выбрать на карте', 'pick_location')],
                    [Keyboard.button.callback('❌ Отмена', 'cancel')],
                ])
            ],
        });
    }

    if (session.step === 'create_location') {
        session.data.location = text === '-' ? '' : text;
        session.step = 'create_max_participants';
        return ctx.reply('👥 Введите **максимальное число участников** (или "-" без ограничений):', {
            format: 'markdown',
            attachments: [cancelKeyboard()],
        });
    }

    if (session.step === 'create_max_participants') {
        session.data.max_participants = text === '-' ? null : Number(text);
        session.step = 'create_points';
        return ctx.reply('⭐ Введите **баллы за участие** (по умолчанию 10):', {
            format: 'markdown',
            attachments: [cancelKeyboard()],
        });
    }

    if (session.step === 'create_points') {
        session.data.points_per_participant = Number(text) || 10;
        const result = await api.createAction(userId, session.data);
        clearSession(userId);

        if (result.error) {
            return ctx.reply(`❌ Ошибка: ${result.error}`, {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            });
        }

        return ctx.reply(
            `✅ Акция **«${session.data.title}»** создана (ID: ${result.id})`,
            {
                format: 'markdown',
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            }
        );
    }

    // Подтверждение билета
    if (session.step === 'verify_code') {
        clearSession(userId);
        const result = await api.verifyTicket(userId, text);
        if (result.error) {
            return ctx.reply(`❌ ${result.error}`, {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            });
        }
        return ctx.reply(`✅ Участник отмечен! Начислено **${result.points}** баллов.`, {
            format: 'markdown',
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('✅ Отметить ещё', 'verify_ticket')],
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    // Добавление инвентаря: название
    if (session.step === 'add_inv_name') {
        session.data.invName = text;
        session.step = 'add_inv_qty';
        return ctx.reply('🔢 Введите **количество** предметов:', {
            format: 'markdown',
            attachments: [cancelKeyboard()],
        });
    }

    // Добавление инвентаря: количество
    if (session.step === 'add_inv_qty') {
        const qty = Number(text);
        const { actionId, invName } = session.data;
        clearSession(userId);

        if (!qty || qty <= 0) {
            return ctx.reply('❌ Некорректное количество.', {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            });
        }

        const result = await api.addInventory(userId, actionId, invName, qty);
        if (result.error) {
            return ctx.reply(`❌ Ошибка: ${result.error}`);
        }

        return ctx.reply(`✅ Инвентарь **«${invName}»** × ${qty} добавлен к акции #${actionId}`, {
            format: 'markdown',
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    // Выдача инвентаря: количество
    if (session.step === 'issue_inv_quantity') {
        const qty = Number(text);
        const { actionId, participationId, inventoryId } = session.data;
        clearSession(userId);

        if (!qty || qty <= 0) {
            return ctx.reply('❌ Некорректное количество.', {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            });
        }

        const result = await api.issueInventory(userId, actionId, inventoryId, participationId, qty);
        if (result.error) {
            return ctx.reply(`❌ Ошибка: ${result.error}`);
        }

        return ctx.reply(`✅ Инвентарь выдан (${qty} шт.)`, {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }

    // Заявка на организатора: имя
    if (session.step === 'req_organizer_name') {
        session.data.reqName = text;
        session.step = 'req_organizer_reason';
        return ctx.reply('📝 Напишите **почему вы хотите стать организатором** (или отправьте "-" чтобы пропустить):', {
            format: 'markdown',
            attachments: [cancelKeyboard()],
        });
    }

    // Заявка на организатора: причина
    if (session.step === 'req_organizer_reason') {
        const reason = text === '-' ? '' : text;
        const name = session.data.reqName;
        clearSession(userId);

        const result = await api.submitRequest(userId, name, reason);
        if (result.error) {
            return ctx.reply(`❌ ${result.error}`, {
                attachments: [
                    Keyboard.inlineKeyboard([
                        [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                    ]),
                ],
            });
        }

        return ctx.reply('✅ Ваша заявка отправлена! Ожидайте решения организаторов.', {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.callback('🏠 Главное меню', 'main_menu')],
                ]),
            ],
        });
    }
});

// ─── Редактирование сообщения ─────────────────────────────────────────────────
bot.on('message_edited', async (ctx) => {});

// ─── Бот добавлен/удалён из чата ─────────────────────────────────────────────
bot.on('bot_added', async (ctx) => {
    await ctx.reply('🌱 Привет! Я бот эко-акций. Напиши /start чтобы начать работу.');
});
bot.on('bot_removed', async (ctx) => {
    console.log(`Бот удалён из чата ${ctx.chat?.chat_id}`);
});

// ─── Новый пользователь в беседе ─────────────────────────────────────────────
bot.on('user_added', async (ctx) => {
    const name = ctx.user?.name || 'Участник';
    await ctx.reply(`👋 Добро пожаловать, **${name}**! Напиши /start чтобы записаться на эко-акцию.`, { format: 'markdown' });
});
bot.on('user_removed', async (ctx) => {
    const name = ctx.user?.name || 'Участник';
    await ctx.reply(`👋 ${name} покинул чат.`);
});

// ─── Переименование беседы ────────────────────────────────────────────────────
bot.on('chat_title_changed', async (ctx) => {
    const title = ctx.chat?.title || '';
    await ctx.reply(`📝 Название беседы изменено на: **${title}**`, { format: 'markdown' });
});

// ─── Удаление сообщения ───────────────────────────────────────────────────────
bot.on('message_removed', async (ctx) => {
    console.log(`Сообщение удалено: ${ctx.message?.body?.mid}`);
});

// ─── Запуск ───────────────────────────────────────────────────────────────────
console.log('🚀 Запускаем бота...');

async function checkBackend() {
    try {
        const res = await fetch(`${API_BASE}/api/actions`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        console.log('✅ Бэкенд доступен');
    } catch (e) {
        console.error('❌ Бэкенд недоступен:', e.message);
        console.error('   Убедитесь, что сервер запущен на', API_BASE);
        process.exit(1);
    }
}
await checkBackend();

bot.start();