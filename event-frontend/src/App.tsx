import { useState, useEffect } from 'react';
import {
  AppRoot,
  SplitLayout,
  SplitCol,
  View,
  Panel,
  PanelHeader,
  Spinner,
} from '@vkontakte/vkui';
import { Home } from './panels/Home';
import { CreateAction } from './panels/CreateAction';
import { ActionDetails } from './panels/ActionDetails';
import { InventoryManager } from './panels/InventoryManager';
import { RequestOrganizer } from './panels/RequestOrganizer';
import { OrganizerRequests } from './panels/OrganizerRequests';
import { SetName } from './panels/SetName';
import api from './api/client';
import '@vkontakte/vkui/dist/vkui.css';

const App = () => {
  const [activePanel, setActivePanel] = useState('home');
  const [actionId, setActionId] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    // Проверяем, указал ли пользователь своё имя
    api.get('/actions/my-profile')
      .then(res => setNeedsName(!res.data.name))
      .catch(() => setNeedsName(true))
      .finally(() => setLoadingProfile(false));
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash.startsWith('/action/')) {
        const id = hash.split('/')[2];
        setActionId(id);
        setActivePanel('action-details');
      } else if (hash.startsWith('/inventory/')) {
        const id = hash.split('/')[2];
        setActionId(id);
        setActivePanel('inventory');
      } else if (hash === '/create-action') {
        setActivePanel('create-action');
      } else if (hash === '/request-organizer') {
        setActivePanel('request-organizer');
      } else if (hash === '/organizer-requests') {
        setActivePanel('organizer-requests');
      } else {
        setActivePanel('home');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Пока загружается профиль, показываем спиннер
  if (loadingProfile) {
    return (
      <AppRoot>
        <SplitLayout>
          <SplitCol>
            <View activePanel="loading">
              <Panel id="loading">
                <PanelHeader>Загрузка...</PanelHeader>
                <Spinner size="l" style={{ margin: '50px auto' }} />
              </Panel>
            </View>
          </SplitCol>
        </SplitLayout>
      </AppRoot>
    );
  }

  // Если имя не задано, показываем панель ввода имени
  if (needsName) {
    return (
      <AppRoot>
        <SplitLayout>
          <SplitCol>
            <View activePanel="set-name">
              <SetName id="set-name" onComplete={() => setNeedsName(false)} />
            </View>
          </SplitCol>
        </SplitLayout>
      </AppRoot>
    );
  }

  return (
    <AppRoot>
      <SplitLayout>
        <SplitCol>
          <View id="main" activePanel={activePanel}>
            <Home id="home" />
            <CreateAction id="create-action" />
            <ActionDetails id="action-details" actionId={actionId} />
            <InventoryManager
              id="inventory"
              actionId={actionId!}
              onBack={() => { window.location.hash = `#/action/${actionId}`; }}
            />
            <RequestOrganizer
              id="request-organizer"
              onBack={() => { window.location.hash = '#/'; }}
            />
            <OrganizerRequests
              id="organizer-requests"
              onBack={() => { window.location.hash = '#/'; }}
            />
          </View>
        </SplitCol>
      </SplitLayout>
    </AppRoot>
  );
};

export default App;