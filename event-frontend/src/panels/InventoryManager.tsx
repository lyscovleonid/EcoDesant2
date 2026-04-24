import { useState, useEffect } from 'react';
import {
  Panel,
  PanelHeader,
  PanelHeaderBack,
  Group,
  Div,
  Button,
  FormItem,
  Input,
  Header,
  SimpleCell,
  Text,
  Checkbox,
} from '@vkontakte/vkui';
import api from '../api/client';
import bridge from '@vkontakte/vk-bridge';

interface InventoryItem {
  id: number;
  name: string;
  total_quantity: number;
  available_quantity: number;
}

interface Participant {
  participation_id: number;
  vk_id: number;
  name: string;
}

export const InventoryManager = ({ id, actionId, onBack }: { id: string; actionId: string; onBack: () => void }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const [issueQuantity, setIssueQuantity] = useState('1');

  const [reportFormat, setReportFormat] = useState<'csv' | 'json'>('csv');
  const [attendedOnly, setAttendedOnly] = useState(false);
  const [includeInventory, setIncludeInventory] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'registration'>('name');

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/actions/${actionId}/inventory`);
      setInventory(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipants = async () => {
    try {
      const res = await api.get(`/actions/${actionId}/participants`);
      setParticipants(res.data);
    } catch (err: any) {
      console.error(err);
      alert('Не удалось загрузить участников. Проверьте права организатора.');
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchParticipants();
  }, [actionId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.post(`/actions/${actionId}/inventory`, {
        name: newName,
        total_quantity: parseInt(newQuantity),
      });
      setNewName('');
      setNewQuantity('');
      fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка добавления');
    } finally {
      setAdding(false);
    }
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParticipantId || !selectedInventoryId) {
      alert('Выберите участника и инвентарь');
      return;
    }
    const quantity = parseInt(issueQuantity);
    if (quantity <= 0) {
      alert('Количество должно быть положительным');
      return;
    }
    setIssuing(true);
    try {
      await api.post(`/actions/${actionId}/inventory/issue`, {
        participation_id: selectedParticipantId,
        inventory_id: selectedInventoryId,
        quantity,
      });
      alert('Инвентарь успешно выдан');
      setSelectedParticipantId(null);
      setSelectedInventoryId(null);
      setIssueQuantity('1');
      fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка выдачи');
    } finally {
      setIssuing(false);
    }
  };

const handleDownloadReport = async () => {
  try {
    const user = await bridge.send('VKWebAppGetUserInfo');
    const vkId = user.id;
    const params = new URLSearchParams({
      format: reportFormat,
      attended_only: String(attendedOnly),
      include_inventory: String(includeInventory),
      sort: sortBy,
      vk_id: String(vkId),
    });
    const response = await api.get(`/actions/${actionId}/report?${params}`, {
      responseType: reportFormat === 'csv' ? 'blob' : 'json',
    });
    if (reportFormat === 'csv') {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `action_${actionId}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `action_${actionId}_report.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  } catch (err) {
    alert('Ошибка скачивания отчёта');
  }
};

const handleDownloadExcel = async () => {
  try {
    const user = await bridge.send('VKWebAppGetUserInfo');
    const vkId = user.id;
    const params = new URLSearchParams({
      attended_only: String(attendedOnly),
      include_inventory: String(includeInventory),
      vk_id: String(vkId),
    });
    const _res = await api.get(`/actions/${actionId}/report/excel?${params}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([_res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `action_${actionId}_report.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    alert('Ошибка скачивания Excel-отчёта');
  }
};

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={onBack} />}>Инвентарь акции</PanelHeader>

      <Group header={<Header>Настройки отчёта</Header>}>
        <FormItem top="Формат">
          <select value={reportFormat} onChange={e => setReportFormat(e.target.value as any)} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--vkui--color_field_border_alpha)' }}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </FormItem>
        <FormItem top="Сортировка">
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--vkui--color_field_border_alpha)' }}>
            <option value="name">По имени</option>
            <option value="points">По баллам (убыв.)</option>
            <option value="registration">По дате регистрации</option>
          </select>
        </FormItem>
        <FormItem>
          <Checkbox checked={attendedOnly} onChange={e => setAttendedOnly(e.target.checked)}>Только подтверждённые участники</Checkbox>
          <Checkbox checked={includeInventory} onChange={e => setIncludeInventory(e.target.checked)}>Включить выданный инвентарь</Checkbox>
        </FormItem>
        <Div>
          <Button size="l" stretched onClick={handleDownloadReport}>📊 Скачать отчёт (CSV/JSON)</Button>
        </Div>
        <Div>
          <Button size="l" stretched mode="secondary" onClick={handleDownloadExcel}>📥 Скачать Excel-отчёт (красивый)</Button>
        </Div>
      </Group>

      <Group header={<Header>Выдать инвентарь участнику</Header>}>
        <form onSubmit={handleIssue}>
          <FormItem top="Участник">
            <select value={selectedParticipantId ?? ''} onChange={e => setSelectedParticipantId(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--vkui--color_field_border_alpha)' }} required>
              <option value="" disabled>Выберите участника</option>
              {participants.map(p => (
                <option key={p.participation_id} value={p.participation_id}>{p.name || `ID ${p.vk_id}`}</option>
              ))}
            </select>
          </FormItem>
          <FormItem top="Инвентарь">
            <select value={selectedInventoryId ?? ''} onChange={e => setSelectedInventoryId(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid var(--vkui--color_field_border_alpha)' }} required>
              <option value="" disabled>Выберите инвентарь</option>
              {inventory.filter(i => i.available_quantity > 0).map(item => (
                <option key={item.id} value={item.id}>{item.name} (доступно {item.available_quantity})</option>
              ))}
            </select>
          </FormItem>
          <FormItem top="Количество">
            <Input type="number" value={issueQuantity} onChange={e => setIssueQuantity(e.target.value)} min="1" required />
          </FormItem>
          <Div>
            <Button size="l" stretched type="submit" loading={issuing}>Выдать инвентарь</Button>
          </Div>
        </form>
      </Group>

      <Group header={<Header>Добавить инвентарь</Header>}>
        <form onSubmit={handleAdd}>
          <FormItem top="Название">
            <Input value={newName} onChange={e => setNewName(e.target.value)} required />
          </FormItem>
          <FormItem top="Количество">
            <Input type="number" value={newQuantity} onChange={e => setNewQuantity(e.target.value)} required />
          </FormItem>
          <Div>
            <Button size="l" stretched type="submit" loading={adding}>Добавить</Button>
          </Div>
        </form>
      </Group>

      <Group header={<Header>Текущий инвентарь</Header>}>
        {loading && <Div>Загрузка...</Div>}
        {!loading && inventory.length === 0 && <Div>Инвентарь не добавлен</Div>}
        {inventory.map((item: InventoryItem) => (
          <SimpleCell key={item.id}>
            <Text weight="2">{item.name}</Text>
            <Text style={{ marginTop: 4 }}>Всего: {item.total_quantity} | Доступно: {item.available_quantity}</Text>
          </SimpleCell>
        ))}
      </Group>
    </Panel>
  );
};