// Satu handler HTTP untuk semua: dashboard Meja Keputusan, webhook WhatsApp, dan cron.
// Dipakai oleh server lokal (bin/dashboard.mjs) dan Vercel (api/index.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { ROOT, KONTEN_DATA, muat, ambil, simpan, Galat, iso, pakaiSupabase, UNITS, K, env } from './core.mjs';
import { setujuiAksi, tolakAksi, ulangAksi } from './aksi.mjs';
import { ringkas } from './ringkas.mjs';
import { ambilPercakapan, pesanMasuk } from './percakapan.mjs';
import { cekTandaTangan, unitDariPhoneId } from './wa.mjs';
import { jalankanRadar } from './radar.mjs';
import { prosesSemua } from './cs.mjs';
import { kirimAksi, kirimSemua } from './kirim.mjs';
import { buatBriefing } from './briefing.mjs';
import * as tim from './tim.mjs';
import { dariPemilik, perintahPemilik, jalankanRapat } from './pemilik.mjs';

const live = () => env('KARYAWAN_LIVE') === '1';
const online = () => !!process.env.VERCEL;

// Pekerjaan setelah respons dikirim. Di Vercel memakai waitUntil agar fungsi tidak dibekukan.
let waitUntil = null;
try { ({ waitUntil } = await import('@vercel/functions')); } catch { /* lokal: proses tetap hidup */ }
const tunda = (p) => { const q = Promise.resolve().then(p).catch((e) => console.error('Tugas latar gagal:', e.message)); if (waitUntil) waitUntil(q); return q; };

// ---------- respons ----------
const json = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); };
const bacaRaw = (req) => new Promise((ok, no) => {
  const c = []; let n = 0;
  req.on('data', (d) => { n += d.length; if (n > 1e6) { req.destroy(); no(new Galat('Body terlalu besar')); } else c.push(d); });
  req.on('end', () => ok(Buffer.concat(c))); req.on('error', no);
});
const bacaJSON = async (req) => { const r = await bacaRaw(req); try { return r.length ? JSON.parse(r.toString('utf8')) : {}; } catch { throw new Galat('Body bukan JSON'); } };

// ---------- sesi ----------
// PIN aktif: PIN yang diubah dari dashboard (disimpan sebagai hash scrypt), atau DASHBOARD_PIN di environment.
// Lupa PIN: ganti DASHBOARD_PIN di Vercel lalu redeploy. PIN dashboard otomatis gugur karena dibuat saat DASHBOARD_PIN masih yang lama.
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
let cachePin = { at: 0, v: undefined };
async function pinTersimpan() { // shortcut: cache 30 detik per instance; setelah PIN diubah, instance lain menerima PIN lama paling lama 30 detik
  if (Date.now() - cachePin.at > 30000) cachePin = { at: Date.now(), v: await ambil('keamanan', 'pin').catch(() => null) };
  const p = cachePin.v;
  return p && p.env_sidik === sha(env('DASHBOARD_PIN')) ? p : null;
}
// PIN aktif ikut dalam kunci tanda tangan: mengganti PIN langsung mengeluarkan semua sesi lama (penting karena sesi berlaku 30 hari)
const rahasia = async () => sha(`karyawan-ai:${env('SESSION_SECRET')}:${env('DASHBOARD_PIN')}:${(await pinTersimpan())?.hash || ''}`);
const SESI_HARI = 30;
const b64 = (s) => Buffer.from(s).toString('base64url');
const tanda = async (s) => crypto.createHmac('sha256', await rahasia()).update(s).digest('base64url');
async function buatSesi(nama) { const p = b64(JSON.stringify({ n: nama, e: Date.now() + SESI_HARI * 864e5 })); return p + '.' + await tanda(p); }
async function bacaSesi(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)ka_sesi=([^;]+)/);
  if (!m) return null;
  const [p, s] = m[1].split('.');
  if (!p || !s) return null;
  const a = Buffer.from(await tanda(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.e > Date.now() ? d : null; } catch { return null; }
}
const cookie = (req, val, maxAge) => `ka_sesi=${val}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : ''}`;
const samaBuf = (x, y) => { const a = Buffer.from(String(x)), b = Buffer.from(String(y)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
async function samaPin(x) {
  const v = String(x || '').trim(), p = await pinTersimpan();
  if (p) return samaBuf(hashPin(v, p.salt), p.hash);
  return !!env('DASHBOARD_PIN') && samaBuf(v, env('DASHBOARD_PIN'));
}
const PIN_LEMAH = ['123456', '654321', '123123', '112233', '121212', '123321', '111222', '000000'];
function cekPinBaru(pin) {
  if (!/^\d{6,12}$/.test(pin)) return 'PIN baru harus 6 sampai 12 angka.';
  if (/^(\d)\1+$/.test(pin) || PIN_LEMAH.includes(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) return 'PIN baru terlalu mudah ditebak (berurutan atau berulang). Pilih kombinasi lain.';
  return null;
}
// Batas percobaan PIN salah (login dan ubah PIN): 8 kali per 15 menit
async function catatGagal() {
  const L = (await ambil('keamanan', 'login').catch(() => null)) || { id: 'login', gagal: [] };
  L.gagal = (L.gagal || []).filter((t) => Date.now() - Date.parse(t) < 15 * 6e4);
  return { terkunci: L.gagal.length >= 8, tambah: async () => { L.gagal.push(iso()); await simpan('keamanan', L).catch(() => {}); } };
}
async function ubahPin(req, res, sesi) {
  const b = await bacaJSON(req), baru = String(b.baru || '').trim(), g = await catatGagal();
  if (g.terkunci) return json(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });
  if (!(await samaPin(b.lama))) { await g.tambah(); return json(res, 401, { error: 'PIN lama salah.' }); }
  const salah = cekPinBaru(baru);
  if (salah) return json(res, 400, { error: salah });
  const salt = crypto.randomBytes(16).toString('hex');
  await simpan('keamanan', { id: 'pin', salt, hash: hashPin(baru, salt), env_sidik: sha(env('DASHBOARD_PIN')), diubah_oleh: sesi.n, diubah: iso() });
  cachePin = { at: 0, v: undefined };
  // sesi pengubah diperbarui agar tetap masuk; perangkat lain keluar
  return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, await buatSesi(sesi.n), SESI_HARI * 86400) });
}

async function masuk(req, res) {
  const b = await bacaJSON(req), nama = String(b.nama || '').trim().slice(0, 60);
  if (!env('DASHBOARD_PIN')) return json(res, 503, { error: 'DASHBOARD_PIN belum diisi di environment server.' });
  // 6 digit cukup karena percobaan dibatasi 8 kali per 15 menit (di bawah): menebak 1 juta kombinasi butuh bertahun-tahun
  if (online() && env('DASHBOARD_PIN').length < 6) return json(res, 503, { error: 'DASHBOARD_PIN terlalu pendek untuk dashboard online (minimal 6 karakter). Ganti di Vercel lalu redeploy.' });
  if (!nama) return json(res, 400, { error: 'Isi nama Anda: dicatat di setiap keputusan.' });
  const g = await catatGagal();
  if (g.terkunci) return json(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });
  if (!(await samaPin(b.pin))) { await g.tambah(); return json(res, 401, { error: 'PIN salah.' }); }
  return json(res, 200, { ok: true, nama }, { 'Set-Cookie': cookie(req, await buatSesi(nama), SESI_HARI * 86400) });
}

// ---------- kesiapan ----------
function kesiapan() {
  const ada = (k) => !!env(k);
  return {
    penyimpanan: pakaiSupabase() ? 'supabase' : 'file lokal',
    ai: ada('ANTHROPIC_API_KEY'),
    wa: Object.fromEntries(UNITS.map((u) => [u, ada('WA_PHONE_ID_' + K(u)) && ada('WA_TOKEN_' + K(u))])),
    webhook: ada('WA_APP_SECRET') && ada('WA_VERIFY_TOKEN'),
    kirim_hidup: live(),
    autopilot: process.env.AUTOPILOT === '1',
  };
}

// ---------- konten (hanya bila antrean konten ada di mesin ini) ----------
const kontenAda = () => fs.existsSync(path.join(KONTEN_DATA(), 'queue'));
const kq = (argv) => new Promise((ok, no) => execFile(process.execPath, [path.join(ROOT, 'scripts/kq.mjs'), ...argv], { env: process.env }, (e, out, err) => (e ? no(new Galat((err || out || e.message).replace(/^ERROR:\s*/, '').trim())) : ok(out.trim()))));

// ---------- webhook WhatsApp ----------
async function webhook(req, res, url) {
  if (req.method === 'GET') {
    const ok = env('WA_VERIFY_TOKEN') && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('WA_VERIFY_TOKEN');
    res.writeHead(ok ? 200 : 403, { 'Content-Type': 'text/plain' }); return res.end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
  }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  if (online() && !pakaiSupabase()) { res.writeHead(503); return res.end('storage not configured'); }
  const raw = await bacaRaw(req);
  if (!cekTandaTangan(raw, req.headers['x-hub-signature-256'], env('WA_APP_SECRET'))) { res.writeHead(401); return res.end('bad signature'); }
  let body; try { body = JSON.parse(raw.toString('utf8')); } catch { res.writeHead(400); return res.end(); }
  let n = 0; const pemilik = [];
  for (const entry of body.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {}, unit = unitDariPhoneId(v.metadata?.phone_number_id);
    if (!unit) { if (v.messages) console.error('phone_number_id tidak dikenal:', v.metadata?.phone_number_id); continue; }
    const nama = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
    for (const m of v.messages || []) {
      const teks = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
        ?? (m.type ? `[${m.type}${m[m.type]?.caption ? ': ' + m[m.type].caption : ''}]` : '');
      const at = m.timestamp ? new Date(+m.timestamp * 1000).toISOString() : iso();
      if (dariPemilik(m.from)) { pemilik.push({ unit, teks, wamid: m.id, at }); continue; } // perintah pemilik, bukan lead
      if (await pesanMasuk(unit, { wa: m.from, nama: nama[m.from], teks, wamid: m.id, at })) n++;
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); // balas cepat; Meta mengulang bila lambat
  if (pemilik.length) tunda(async () => { for (const p of pemilik) console.log('pemilik:', await perintahPemilik(p)); });
  if (n && process.env.CS_AUTODRAFT !== '0' && process.env.ANTHROPIC_API_KEY) {
    tunda(async () => {
      for (const r of await prosesSemua()) {
        console.log(r.teks);
        if (r.aksi?.status === 'disetujui') console.log(await kirimAksi(r.aksi, { live: live() })); // disetujui autopilot: kirim sekarang
      }
    });
  }
}

// ---------- cron harian ----------
async function cron(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!env('CRON_SECRET') || auth.trim() !== 'Bearer ' + env('CRON_SECRET')) return json(res, 401, { error: 'unauthorized' });
  if (online() && !pakaiSupabase()) return json(res, 503, { error: 'storage not configured' });
  const log = { radar: await jalankanRadar() };
  if (process.env.ANTHROPIC_API_KEY) log.cs = (await prosesSemua()).map((r) => r.teks);
  log.kirim = await kirimSemua({ live: live() });
  if (process.env.ANTHROPIC_API_KEY) { log.rutin = await tim.jalankanRutin(); log.tim = []; const t0 = Date.now(); while (Date.now() - t0 < 25000) { const r = await tim.jalankanBerikut(); if (!r.jalan) break; log.tim.push(`${r.jalan.id} ${r.jalan.status}`); if (r.tertahan) break; } }
  const b = await buatBriefing();
  await simpan('briefing', { id: b.tanggal, teks: b.teks });
  log.briefing = b.tanggal;
  log.rapat = await jalankanRapat(); // tanpa AI: laporan pagi/malam ke WA pemilik bila OWNER_WA diisi
  return json(res, 200, log);
}

// ---------- router ----------
export async function handler(req, res) {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  try {
    if (p === '/webhook') return await webhook(req, res, url);
    if (p === '/api/cron') return await cron(req, res);
    if (req.method === 'GET' && /^\/(app|vendor)\/[\w./-]+$/.test(p) && !p.includes('..')) { // lokal; di Vercel disajikan CDN dari public/
      const f = path.join(ROOT, 'public', p);
      if (!fs.existsSync(f)) return json(res, 404, { error: 'Tidak ditemukan' });
      const tipe = { '.js': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': tipe, 'Cache-Control': p.startsWith('/app/') && tipe.startsWith('text/javascript') ? 'no-cache' : 'public, max-age=3600' }); // kode app selalu dicek ulang agar perbaikan langsung terlihat
      return res.end(fs.readFileSync(f));
    }
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:; frame-ancestors 'none'" });
      return res.end(fs.readFileSync(path.join(ROOT, 'ui/index.html')));
    }
    if (req.method === 'POST' && p === '/api/masuk') return await masuk(req, res);
    if (req.method === 'POST' && p === '/api/keluar') return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });

    // Semua di bawah ini wajib sesi
    const sesi = await bacaSesi(req);
    if (!sesi) return json(res, 401, { error: 'Perlu masuk', perlu_masuk: true, pin_ada: !!process.env.DASHBOARD_PIN });
    if (online() && !pakaiSupabase()) return json(res, 503, { error: 'Penyimpanan belum tersambung: isi SUPABASE_SERVICE_ROLE_KEY di Environment Variables Vercel, lalu redeploy.', belum_siap: true });
    if (req.method === 'POST' && req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return json(res, 403, { error: 'Permintaan lintas situs ditolak' });

    if (req.method === 'POST' && p === '/api/pin') return await ubahPin(req, res, sesi);
    if (req.method === 'GET' && p === '/api/ringkas') return json(res, 200, { ...(await ringkas()), nama: sesi.n, kesiapan: kesiapan(), konten_lokal: kontenAda() });
    if (req.method === 'GET' && p.startsWith('/api/aksi/')) {
      const a = await muat('aksi', p.split('/')[3]);
      return json(res, 200, { aksi: a, percakapan: a.tujuan?.wa ? (await ambilPercakapan(a.unit, a.tujuan.wa)).pesan.slice(-12) : [] });
    }
    if (req.method === 'GET' && p === '/api/briefing') return json(res, 200, (await buatBriefing()));

    const m = p.match(/^\/api\/(aksi|konten)\/([A-Za-z0-9._-]+)\/(setujui|tolak|ulang|revisi)$/);
    if (req.method === 'POST' && m) {
      const b = await bacaJSON(req), by = sesi.n, [, jenis, id, act] = m;
      if (jenis === 'aksi') {
        if (act === 'tolak') return json(res, 200, { ok: true, hasil: (await tolakAksi(id, by, b.note || '')).status });
        const a = act === 'ulang' ? await ulangAksi(id, by) : await setujuiAksi(id, by, { isi: typeof b.isi === 'string' ? b.isi : null, paksa: !!b.paksa });
        const kirim = await kirimAksi(a, { live: live() }); // langsung kirim; tanpa KARYAWAN_LIVE hanya simulasi
        return json(res, 200, { ok: true, hasil: kirim.split('\n')[0], hidup: live() });
      }
      if (!kontenAda()) return json(res, 400, { error: 'Antrean konten tidak ada di server ini; setujui konten dari laptop.' });
      const argv = { setujui: ['approve', id, '--by', by, ...(b.at ? ['--at', b.at] : [])], tolak: ['reject', id, '--by', by, '--note', b.note || '-'], revisi: ['revise', id, '--by', by, '--note', b.note || '-'] }[act];
      if (!argv) return json(res, 404, { error: 'Tidak dikenal' });
      return json(res, 200, { ok: true, hasil: await kq(argv) });
    }
    // ---------- Tim AI ----------
    // Kerjakan tugas antre di latar selama sisa waktu fungsi (Vercel memotong di 60 detik); sisanya dilanjutkan dashboard atau cron.
    const lanjutkanAntrean = () => tunda(async () => { const t0 = Date.now(); while (Date.now() - t0 < 25000) { const r = await tim.jalankanBerikut(); if (!r.jalan || r.tertahan) break; } });
    if (req.method === 'GET' && p === '/api/tim') return json(res, 200, await tim.dataTim());
    if (req.method === 'GET' && p === '/api/chat') return json(res, 200, await tim.riwayatChat(sesi.n));
    let mm;
    if (req.method === 'GET' && (mm = p.match(/^\/api\/agen\/([\w.-]+)\/progres$/))) return json(res, 200, await tim.progresAgen(mm[1]));
    if (req.method === 'POST') {
      if (p === '/api/agen') return json(res, 200, await tim.simpanAgen(await bacaJSON(req), sesi.n));
      if (p === '/api/proyek') { const b = await bacaJSON(req); return json(res, 200, await tim.buatProyek(b, sesi.n)); }
      if ((mm = p.match(/^\/api\/proyek\/([\w.-]+)\/setujui-hasil$/))) return json(res, 200, await tim.setujuiHasilProyek(mm[1], sesi.n));
      if ((mm = p.match(/^\/api\/proyek\/([\w.-]+)\/(setujui|batal|anggaran|rencana-ulang)$/))) {
        const b = await bacaJSON(req);
        const r = mm[2] === 'setujui' ? await tim.setujuiRencana(mm[1], sesi.n) : mm[2] === 'batal' ? await tim.batalProyek(mm[1], sesi.n)
          : mm[2] === 'anggaran' ? await tim.naikkanAnggaran(mm[1], b.batas_usd, sesi.n) : (await tim.batalProyek(mm[1], sesi.n), await tim.buatProyek({ judul: b.judul, tujuan: b.tujuan, batas_usd: b.batas_usd }, sesi.n));
        if (['setujui', 'anggaran'].includes(mm[2])) lanjutkanAntrean();
        return json(res, 200, r);
      }
      if (p === '/api/tugas') { const t = await tim.beriTugas(await bacaJSON(req), sesi.n); lanjutkanAntrean(); return json(res, 200, t); }
      if ((mm = p.match(/^\/api\/tugas\/([\w.-]+)\/(setujui|revisi|tolak|ulang)$/))) {
        const b = await bacaJSON(req), t = await tim.putuskanTugas(mm[1], mm[2], sesi.n, b.note || '', b.ingat === true);
        if (['revisi', 'ulang'].includes(mm[2])) lanjutkanAntrean();
        return json(res, 200, t);
      }
      if (p === '/api/tim/jalan') return json(res, 200, await tim.jalankanBerikut());
      if (p === '/api/chat') { const b = await bacaJSON(req); return json(res, 200, await tim.kirimChat(sesi.n, b.pesan)); }
    }
    const j = p.match(/^\/api\/jalankan\/(radar|kirim|cs)$/);
    if (req.method === 'POST' && j) {
      const hasil = j[1] === 'radar' ? await jalankanRadar() : j[1] === 'kirim' ? await kirimSemua({ live: live() }) : (await prosesSemua()).map((r) => r.teks);
      return json(res, 200, { ok: true, hasil, hidup: live() });
    }
    json(res, 404, { error: 'Tidak ditemukan' });
  } catch (e) {
    if (!res.headersSent) json(res, e instanceof Galat ? 400 : 500, { error: e instanceof Galat ? e.message : 'Galat server: ' + e.message });
    if (!(e instanceof Galat)) console.error(e);
  }
}
