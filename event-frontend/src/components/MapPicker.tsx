import { useState } from 'react';
import { YMaps, Map, Placemark } from '@pbe/react-yandex-maps';
import { ModalCard, Button, Div, Title } from '@vkontakte/vkui';

interface MapPickerProps {
  id?: string;
  onClose: () => void;
  onSelect: (address: string) => void;
  initialCoords?: [number, number];
}

const API_KEY = '0a56bcf5-5c9b-4a0a-ad4a-31fd199ab0f6';

export const MapPicker = ({ id, onClose, onSelect, initialCoords = [55.751244, 37.618423] }: MapPickerProps) => {
  const [coords, setCoords] = useState<[number, number]>(initialCoords);
  const [loading, setLoading] = useState(false);

  const handleMapClick = (e: any) => {
    const newCoords = e.get('coords');
    setCoords(newCoords);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://geocode-maps.yandex.ru/1.x/?apikey=${API_KEY}&format=json&geocode=${coords[1]},${coords[0]}`
      );
      const data = await res.json();
      const address =
        data.response.GeoObjectCollection.featureMember[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.text ||
        `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
      onSelect(address);
    } catch {
      onSelect(`${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <ModalCard
      id={id}
      onClose={onClose}
      actions={
        <Div style={{ display: 'flex', gap: 8 }}>
          <Button size="l" stretched mode="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button size="l" stretched onClick={handleConfirm} loading={loading}>
            Подтвердить
          </Button>
        </Div>
      }
    >
      <Div style={{ paddingBottom: 0 }}>
        <Title level="2" weight="2" style={{ marginBottom: 16 }}>
          Выберите место на карте
        </Title>
      </Div>
      <YMaps query={{ apikey: API_KEY }}>
        <Map
          defaultState={{ center: initialCoords, zoom: 12 }}
          width="100%"
          height={300}
          onClick={handleMapClick}
        >
          <Placemark geometry={coords} />
        </Map>
      </YMaps>
    </ModalCard>
  );
};