import axios from 'axios';
import bridge from '@vkontakte/vk-bridge';

const BASE_URL = import.meta.env.DEV
  ? '/api'
  : 'https://event-backend-h5k0.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use(async (config) => {
  try {
    const user = await bridge.send('VKWebAppGetUserInfo');
    config.headers['X-VK-User-Id'] = String(user.id);
  } catch (e) {
    console.warn('VK Bridge error, using test ID');
    config.headers['X-VK-User-Id'] = '539521831'; // твой VK ID
  }
  return config;
});

export default api;