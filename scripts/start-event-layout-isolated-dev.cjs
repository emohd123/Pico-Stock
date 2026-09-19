// Dedicated dev build/cache plus a disk-only layout store. No cloud key can be loaded
// from .env.local because these variables exist (empty) before Next loads dotenv.
const path = require('node:path');
const http = require('node:http');
process.env.NODE_ENV = 'development';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.NEXT_PUBLIC_SUPABASE_URL = '';
process.env.VERCEL = '';
process.env.EVENT_LAYOUT_LOCAL_DIR = path.resolve('output/event-studio/photo-refresh/local-store');
const next = require('next');
const config = require('../next.config.js');
const port = 3121;
const app = next({ dev: true, hostname: 'localhost', port, conf: { ...config, distDir: 'output/event-studio/photo-refresh/next-cache' } });
app.prepare().then(() => {
  http.createServer(app.getRequestHandler()).listen(port, '127.0.0.1', () => console.log(`Isolated Event Studio: http://localhost:${port}; layout storage is local.`));
}).catch(error => { console.error(error.message); process.exit(1); });
