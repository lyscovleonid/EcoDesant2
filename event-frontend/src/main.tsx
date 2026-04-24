import ReactDOM from 'react-dom/client';
import bridge from '@vkontakte/vk-bridge';
import { AdaptivityProvider, ConfigProvider } from '@vkontakte/vkui';
import App from './App';
import '@vkontakte/vkui/dist/vkui.css';

// Инициализация VK Bridge (обязательно!)
bridge.send('VKWebAppInit');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider>
    <AdaptivityProvider>
      <App />
    </AdaptivityProvider>
  </ConfigProvider>
);