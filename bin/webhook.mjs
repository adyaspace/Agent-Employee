#!/usr/bin/env node
// Alias: webhook dilayani oleh server yang sama dengan dashboard (path /webhook).
//   PORT=8787 node bin/webhook.mjs
import http from 'node:http';
import { loadEnv } from '../lib/core.mjs';
loadEnv();
const { handler } = await import('../lib/web.mjs');
const port = +(process.env.PORT || 8787);
http.createServer(handler).listen(port, () => console.log('Webhook WA + dashboard di :' + port + ' (path /webhook)'));
