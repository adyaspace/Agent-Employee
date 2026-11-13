#!/usr/bin/env node
// Server lokal: dashboard Meja Keputusan + webhook (/webhook) + cron manual (/api/cron).
//   node bin/dashboard.mjs        -> http://127.0.0.1:4747
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/core.mjs';
loadEnv();
const { handler } = await import('../lib/web.mjs');
export const server = http.createServer(handler);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.DASHBOARD_HOST || '127.0.0.1', port = +(process.env.DASHBOARD_PORT || 4747);
  server.listen(port, host, () => console.log(`Meja Keputusan: http://${host}:${port}${process.env.DASHBOARD_PIN ? '' : '  (DASHBOARD_PIN belum diisi: tidak bisa masuk)'}`));
}
