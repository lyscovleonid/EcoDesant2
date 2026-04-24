import { useState } from 'react';
import { Panel, PanelHeader, Group, FormItem, Input, Button, Div } from '@vkontakte/vkui';
import api from '../api/client';

export const SetName = ({ id, onComplete }: { id: string; onComplete: () => void }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/actions/my-profile', { name });
      onComplete();
    } catch (err) {
      alert('Ошибка сохранения имени');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader>Добро пожаловать!</PanelHeader>
      <Group>
        <form onSubmit={handleSubmit}>
          <FormItem top="Как к вам обращаться?">
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </FormItem>
          <Div>
            <Button size="l" stretched type="submit" loading={loading}>
              Продолжить
            </Button>
          </Div>
        </form>
      </Group>
    </Panel>
  );
};