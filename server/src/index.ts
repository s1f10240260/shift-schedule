import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { initDatabase } from './models/database';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import shiftRoutes from './routes/shifts';
import settingsRoutes from './routes/settings';
import preferencesRoutes from './routes/preferences';
import emailRoutes from './routes/email';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function startServer() {
  await initDatabase();

  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/preferences', preferencesRoutes);
  app.use('/api/email', emailRoutes);

  // Serve built client when present (single-process production deploy)
  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    console.log('Serving client from ' + clientDist);
  }

  app.listen(PORT, HOST, () => {
    const nets = os.networkInterfaces();
    const lan: string[] = [];
    Object.values(nets).forEach((list) => {
      (list || []).forEach((n) => {
        if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
      });
    });
    console.log('Server running on port ' + PORT);
    console.log('Local:  http://localhost:' + PORT);
    lan.forEach((ip) => {
      console.log('LAN:    http://' + ip + ':' + PORT + '  (スマホ・QR用)');
    });
  });
}

startServer().catch((e) => {
  console.error('Failed to start server', e);
  process.exit(1);
});
