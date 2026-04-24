import { useState } from 'react';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  FormItem,
  Input,
  Textarea,
  Button,
  Div,
} from '@vkontakte/vkui';
import api from '../api/client';

export const RequestOrganizer = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/organizer-requests', { name, reason });
      alert('Заявка отправлена! Ожидайте решения.');
      onBack();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка отправки заявки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={onBack} />}>
        Стать организатором
      </PanelHeader>
      <Group>
        <form onSubmit={handleSubmit}>
          <FormItem top="Ваше имя">
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </FormItem>
          <FormItem top="Почему хотите стать организатором?">
            <Textarea value={reason} onChange={e => setReason(e.target.value)} />
          </FormItem>
          <Div>
            <Button size="l" stretched type="submit" loading={loading}>
              Отправить заявку
            </Button>
          </Div>
        </form>
      </Group>
    </Panel>
  );
};