import express from 'express';
import cors from 'cors';
import { initDatabase } from './models/database';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import shiftRoutes from './routes/shifts';
import settingsRoutes from './routes/settings';
import preferencesRoutes from './routes/preferences';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  }
}));
app.use(express.json());

async function startServer() {
  await initDatabase();

  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/preferences', preferencesRoutes);

  app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
  });
}

startServer();