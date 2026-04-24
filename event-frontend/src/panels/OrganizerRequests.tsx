import { useState, useEffect } from 'react';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Div,
  Button,
  Header,
  SimpleCell,
  Text,
} from '@vkontakte/vkui';
import api from '../api/client';

interface Request {
  id: number;
  vk_id: number;
  name: string;
  reason: string;
  created_at: string;
}

export const OrganizerRequests = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/organizer-requests');
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (requestId: number) => {
    try {
      await api.put(`/organizer-requests/${requestId}/approve`);
      alert('Заявка одобрена');
      fetchRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка');
    }
  };

  const handleReject = async (requestId: number) => {
    try {
      await api.put(`/organizer-requests/${requestId}/reject`);
      alert('Заявка отклонена');
      fetchRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка');
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={onBack} />}>
        Заявки на организатора
      </PanelHeader>
      <Group header={<Header>Активные заявки</Header>}>
        {loading && <Div>Загрузка...</Div>}
        {!loading && requests.length === 0 && <Div>Нет активных заявок</Div>}
        {requests.map(req => (
          <SimpleCell key={req.id}>
            <Text weight="2">{req.name} (VK ID: {req.vk_id})</Text>
            <Text style={{ marginTop: 4 }}>{req.reason || 'Без пояснения'}</Text>
            <Div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button size="m" mode="secondary" onClick={() => handleApprove(req.id)}>
                ✅ Одобрить
              </Button>
              <Button size="m" mode="secondary" appearance="negative" onClick={() => handleReject(req.id)}>
                ❌ Отклонить
              </Button>
            </Div>
          </SimpleCell>
        ))}
      </Group>
    </Panel>
  );
};