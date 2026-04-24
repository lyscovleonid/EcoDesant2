import express from 'express';
import cors from 'cors';
import { initDB } from './db';
import actionsRouter from './routes/actions';
import adminRouter from './routes/admin';
import inventoryRouter from './routes/inventory';
import organizerRequestsRouter from './routes/organizerRequests';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://koteika77.github.io',
    'https://vk.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ strict: false, limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

const db = initDB();
app.set('db', db);

app.use('/api/actions', actionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/organizer-requests', organizerRequestsRouter);

app.get('/', (_req, res) => {
  res.send('MAX Events API is running');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});