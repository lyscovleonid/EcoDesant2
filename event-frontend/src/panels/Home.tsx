import { useState, useEffect } from 'react';
import {
  Panel,
  PanelHeader,
  Group,
  SimpleCell,
  Div,
  Button,
  Header,
  Counter,
  Text,
} from '@vkontakte/vkui';
import bridge from '@vkontakte/vk-bridge';
import api from '../api/client';

interface EcoAction {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  max_participants: number | null;
  points_per_participant: number;
  participants_count: number;
}

export const Home = ({ id }: { id: string }) => {
  const [actions, setActions] = useState<EcoAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [userName, setUserName] = useState('');

  // Функция для получения актуального баланса с сервера
  const fetchMyStats = async () => {
    try {
      const res = await api.get('/actions/my-stats');
      setTotalPoints(res.data.total_points);
    } catch (err) {
      console.error('Ошибка получения баланса:', err);
    }
  };
  
  // Загрузка имени пользователя
  useEffect(() => {
    api.get('/actions/my-profile')
      .then(res => setUserName(res.data.name || 'Участник'))
      .catch(() => setUserName('Участник'));
  }, []);

  // Основной useEffect для загрузки акций, роли и баланса
  useEffect(() => {
    // Загрузка списка акций
    api.get('/actions')
      .then(res => setActions(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    // Проверка роли организатора
    api.get('/actions/my-role')
      .then(res => setIsOrganizer(res.data.role === 'organizer'))
      .catch(() => setIsOrganizer(false));

    // Получение начального баланса
    fetchMyStats();
  }, []);

  // Функция проверки билета (отправка кода на бэкенд)
  const verifyTicket = async (ticketCode: string) => {
    try {
      const res = await api.post('/actions/verify-ticket', { ticketCode });
      alert(`✅ Участник подтверждён! Начислено ${res.data.points} эко-баллов.`);
      // Обновляем баланс (на случай, если организатор тоже волонтёр)
      fetchMyStats();
      // Также можно обновить список акций, чтобы изменилось число участников
      const actionsRes = await api.get('/actions');
      setActions(actionsRes.data);
    } catch (err: any) {
      console.error('[ЭкоДесант] Ошибка проверки билета:', err);
      alert(err?.response?.data?.error || 'Не удалось подтвердить билет');
    }
  };

  // Ручной ввод кода (fallback)
  const manualInputCode = () => {
    const code = prompt('📋 Введите код билета вручную:');
    if (code && code.trim()) {
      verifyTicket(code.trim());
    }
  };

  // Обработчик нажатия кнопки сканирования
  const handleScanTicket = async () => {
    try {
      console.log('[ЭкоДесант] Запуск сканера VK Bridge...');
      const data = await bridge.send('VKWebAppOpenCodeReader');
      console.log('[ЭкоДесант] Результат сканера:', data);

      if (data && data.code_data) {
        await verifyTicket(data.code_data);
      } else {
        console.warn('[ЭкоДесант] Сканер не вернул код, запрашиваем вручную');
        manualInputCode();
      }
    } catch (err: any) {
      console.warn('[ЭкоДесант] Ошибка сканера, переходим к ручному вводу:', err);
      manualInputCode();
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader>ЭкоДесант 🌿</PanelHeader>

      {/* Блок с личным балансом */}
      <Div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text weight="2">{userName || 'Участник'}</Text>
        <Counter size="m">
          {totalPoints} баллов
        </Counter>
      </Div>

      <Group header={<Header>Ближайшие акции</Header>}>
        {loading && <Div>Загрузка...</Div>}
        {!loading && actions.length === 0 && (
          <Div>Пока нет акций. Создайте первую!</Div>
        )}
        {actions.map(action => (
          <SimpleCell
            key={action.id}
            subtitle={`${new Date(action.date).toLocaleString()} · ${action.location || 'Онлайн'}`}
            onClick={() => { window.location.hash = `#/action/${action.id}`; }}
            chevron="auto"
            after={
              <Counter mode="primary" size="s">
                {action.participants_count || 0}
              </Counter>
            }
          >
            {action.title}
          </SimpleCell>
        ))}
      </Group>

      <Div>
        <Button
          size="l"
          stretched
          onClick={() => { window.location.hash = '#/create-action'; }}
        >
          + Создать акцию
        </Button>
      </Div>

      {isOrganizer && (
        <Div>
          <Button
            size="l"
            stretched
            mode="secondary"
            onClick={handleScanTicket}
          >
            📷 Сканировать билет участника
          </Button>
        </Div>
      )}

      {!isOrganizer && (
        <Div>
          <Button
            size="l"
            stretched
            mode="secondary"
            onClick={() => { window.location.hash = '#/request-organizer'; }}
          >
            📝 Стать организатором
          </Button>
        </Div>
      )}
      {isOrganizer && (
        <Div>
          <Button
            size="l"
            stretched
            mode="secondary"
            onClick={() => { window.location.hash = '#/organizer-requests'; }}
          >
            📋 Заявки на организатора
          </Button>
        </Div>
      )}
    </Panel>
  );
};