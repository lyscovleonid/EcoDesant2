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
  ModalRoot,
} from '@vkontakte/vkui';
import api from '../api/client';
import { MapPicker } from '../components/MapPicker';

export const CreateAction = ({ id }: { id: string }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [points, setPoints] = useState('10');
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const handleSelectLocation = (address: string) => {
    setLocation(address);
    setActiveModal(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/actions', {
        title,
        description,
        date: new Date(date).toISOString(),
        location,
        max_participants: maxParticipants ? parseInt(maxParticipants) : null,
        points_per_participant: parseInt(points) || 10,
      });
      window.location.hash = '#/';
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка создания акции');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={() => { window.location.hash = '#/'; }} />}>
        Новая эко-акция
      </PanelHeader>
      <Group>
        <form onSubmit={handleSubmit}>
          <FormItem top="Название акции" required>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </FormItem>
          <FormItem top="Описание">
            <Textarea value={description} onChange={e => setDescription(e.target.value)} />
          </FormItem>
          <FormItem top="Дата и время" required>
            <Input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
          </FormItem>
          <FormItem top="Место проведения">
            <Input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Адрес или координаты"
            />
          </FormItem>
          <Div>
            <Button
              size="l"
              mode="secondary"
              onClick={() => setActiveModal('map-picker')}
            >
              🗺️ Выбрать на карте
            </Button>
          </Div>
          <FormItem top="Макс. участников">
            <Input
              type="number"
              value={maxParticipants}
              onChange={e => setMaxParticipants(e.target.value)}
              placeholder="Без ограничений"
            />
          </FormItem>
          <FormItem top="Баллы за участие">
            <Input type="number" value={points} onChange={e => setPoints(e.target.value)} />
          </FormItem>
          <Div>
            <Button size="l" stretched type="submit" loading={loading}>
              Опубликовать
            </Button>
          </Div>
        </form>
      </Group>

      <ModalRoot activeModal={activeModal} onClose={() => setActiveModal(null)}>
        <MapPicker
          id="map-picker"
          onClose={() => setActiveModal(null)}
          onSelect={handleSelectLocation}
        />
      </ModalRoot>
    </Panel>
  );
};