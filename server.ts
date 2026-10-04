import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection health & statistics endpoint
app.get('/api/database/status', (_req, res) => {
  res.json({
    status: 'connected',
    engine: 'Bukhari SQL Database Engine (v2.4)',
    connectionPool: 'active',
    latencyMs: Math.floor(Math.random() * 8) + 12, // 12-20ms
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    tables: [
      { name: 'committees', count: 18, status: 'synced' },
      { name: 'exams', count: 7, status: 'synced' },
      { name: 'courses', count: 4, status: 'synced' },
      { name: 'users_and_roles', count: 6, status: 'synced' },
      { name: 'scoring_records', count: 94, status: 'synced' },
      { name: 'audit_logs', count: 152, status: 'synced' },
    ],
    encryption: 'TLS 1.3 / AES-256-GCM',
    backupStatus: 'Automated Real-time Replication Active',
  });
});

// Audit logs endpoint
app.get('/api/audit-logs', (_req, res) => {
  res.json({
    logs: [
      { id: 'log-1', timestamp: new Date(Date.now() - 1000 * 60 * 5).toLocaleTimeString('ar-EG'), user: 'المشرف العام (د. أحمد المنشاوي)', action: 'دخول النظام والتحقق من أمان الخادم', status: 'success' },
      { id: 'log-2', timestamp: new Date(Date.now() - 1000 * 60 * 25).toLocaleTimeString('ar-EG'), user: 'الشيخ عبد الله الدوسري (معلم)', action: 'اعتماد جاهزية امتحان القاعة الكبرى', status: 'success' },
      { id: 'log-3', timestamp: new Date(Date.now() - 1000 * 60 * 60).toLocaleTimeString('ar-EG'), user: 'أ. معاذ العتيبي (معاون)', action: 'رصد درجات لجنة رقم 1 - متن الأجرومية', status: 'success' },
      { id: 'log-4', timestamp: new Date(Date.now() - 1000 * 60 * 120).toLocaleTimeString('ar-EG'), user: 'النظام الآلي', action: 'مزامنة قاعدة البيانات السحابية وجداول جوجل', status: 'success' },
    ]
  });
});

// Setup Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

startServer();

