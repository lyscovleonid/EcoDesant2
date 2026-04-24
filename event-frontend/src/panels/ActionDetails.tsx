import { useState, useEffect } from 'react';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Div,
  Button,
  Title,
  Text,
  Header,
} from '@vkontakte/vkui';
import QRCode from 'react-qr-code';
import api from '../api/client';
import bridge from '@vkontakte/vk-bridge';

interface EcoAction {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  max_participants: number | null;
  points_per_participant: number;
  organizer_vk_id?: number;
}

interface Participation {
  ticket_code: string;
  points_earned: number;
}

export const ActionDetails = ({ id, actionId }: { id: string; actionId: string | null }) => {
  const [action, setAction] = useState<EcoAction | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    if (!actionId) return;

    Promise.all([
      api.get('/actions').then(res => res.data.find((a: EcoAction) => a.id === Number(actionId))),
      api.get(`/actions/${actionId}/my-ticket`).then(res => res.data),
    ]).then(([act, part]) => {
      setAction(act || null);
      setParticipation(part);
    }).catch(console.error).finally(() => setLoading(false));
    bridge.send('VKWebAppGetUserInfo').then(user => {
      setCurrentUserId(user.id);
    });
  }, [actionId]);

  const handleParticipate = async () => {
    if (!actionId) return;
    setRegistering(true);
    try {
      const res = await api.post(`/actions/${actionId}/participate`);
      setParticipation({
        ticket_code: res.data.ticketCode,
        points_earned: res.data.points,
      });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось записаться');
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async () => {
    if (!actionId || !confirm('Вы уверены, что хотите удалить акцию? Все записи участников будут потеряны.')) return;
    setDeleting(true);
    try {
      await api.delete(`/actions/${actionId}`);
      alert('Акция удалена');
      window.location.hash = '#/';
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const handleBack = () => {
    window.location.hash = '#/';
  };

  const goToInventory = () => {
    window.location.hash = `#/inventory/${actionId}`;
  };

  if (loading) {
    return (
      <Panel id={id}>
        <PanelHeader before={<PanelHeaderBack onClick={handleBack} />}>Загрузка...</PanelHeader>
        <Div>Загрузка...</Div>
      </Panel>
    );
  }

  if (!action) {
    return (
      <Panel id={id}>
        <PanelHeader before={<PanelHeaderBack onClick={handleBack} />}>Ошибка</PanelHeader>
        <Div>Акция не найдена</Div>
      </Panel>
    );
  }

  const isOrganizerOfThisAction = currentUserId === action.organizer_vk_id;

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={handleBack} />}>
        {action.title}
      </PanelHeader>
      <Group>
        <Div>
          <Title level="1" weight="1">{action.title}</Title>
          <Text style={{ marginTop: 8, color: 'var(--vkui--color_text_secondary)' }}>
            {new Date(action.date).toLocaleString()} · {action.location || 'Онлайн'}
          </Text>
          <Text>🌱 Баллы за участие: {action.points_per_participant}</Text>
          {action.max_participants && <Text>👥 Мест: {action.max_participants}</Text>}
        </Div>
        {action.description && <Div><Text>{action.description}</Text></Div>}
      </Group>

      <Group header={<Header>Ваш билет</Header>}>
        {participation ? (
          <Div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <QRCode value={participation.ticket_code} size={200} />
            <Text style={{ marginTop: 12 }}>Покажите этот код организатору</Text>
            <Text weight="2" style={{ marginTop: 4 }}>
              Вы получите {participation.points_earned} эко-баллов
            </Text>
            <Text
              style={{
                marginTop: 16,
                padding: '8px 12px',
                backgroundColor: '#f0f0f0',
                borderRadius: 8,
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: 14,
              }}
            >
              Код: {participation.ticket_code}
            </Text>
          </Div>
        ) : (
          <Div>
            <Button size="l" stretched onClick={handleParticipate} loading={registering}>
              Участвовать
            </Button>
          </Div>
        )}
      </Group>

      {isOrganizerOfThisAction && (
        <>
          <Group>
            <Div>
              <Button
                size="l"
                stretched
                mode="secondary"
                onClick={goToInventory}
              >
                📦 Управление инвентарём
              </Button>
            </Div>
          </Group>
          <Group>
            <Div>
              <Button
                size="l"
                stretched
                appearance="negative"
                onClick={handleDelete}
                loading={deleting}
              >
                🗑️ Удалить акцию
              </Button>
            </Div>
          </Group>
        </>
      )}
    </Panel>
  );
};