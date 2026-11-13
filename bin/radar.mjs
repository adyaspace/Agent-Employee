#!/usr/bin/env node
// Radar harian. Lihat lib/radar.mjs.
//   node bin/radar.mjs            jalankan semua
//   node bin/radar.mjs --cek      hanya tampilkan apa yang akan dibuat
import { loadEnv, args, main } from '../lib/core.mjs';
import { jalankanRadar } from '../lib/radar.mjs';
loadEnv();
const { o } = args(process.argv.slice(2));
main(async () => { const h = await jalankanRadar({ cek: !!o.cek }); console.log(h.length ? h.join('\n') : 'Radar: tidak ada usulan baru'); });
