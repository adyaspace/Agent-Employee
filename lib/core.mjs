// Inti bersama: env, argumen, penyimpanan JSON per rekaman, mesin status, waktu Asia/Jakarta.
// Tanpa dependensi. Semua data di folder DATA (bawaan ./data), satu file per rekaman.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = () => process.env.KARYAWAN_DATA || path.join(ROOT, 'data');
export const KONTEN_DATA = () => process.env.KONTEN_DATA || path.join(ROOT, 'content');
export const UNITS = ['adyaspace', 'piramid-forklift'];
export const K = (u) => u.toUpperCase().replace(/-/g, '_');
// Nilai env tanpa spasi/baris baru di ujung (nilai yang ditempel lewat CLI sering membawa newline).
export const env = (k) => String(process.env[k] || '').trim();

export function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function args(argv) {
  const _ = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const n = argv[i + 1];
      if (n === undefined || n.startsWith('--')) o[a.slice(2)] = true; else { o[a.slice(2)] = n; i++; }
    } else _.push(a);
  }
  return { _, o };
}

export class Galat extends Error {}
export const die = (m) => { throw new Galat(m); };
export function main(fn) {
  Promise.resolve().then(fn).catch((e) => {
    console.error('ERROR: ' + (e instanceof Galat ? e.message : e.stack || e));
    process.exitCode = 1;
  });
}

// ---------- waktu (zona Asia/Jakarta, UTC+7 tanpa DST) ----------
export const now = () => (process.env.KARYAWAN_NOW ? new Date(process.env.KARYAWAN_NOW) : new Date());
export const iso = (d = now()) => new Date(d).toISOString();
export const hari = (t = now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
export const jamWIB = (t = now()) => +new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false });
export const tglWIB = (s) => new Date(s + 'T00:00:00+07:00'); // 'YYYY-MM-DD' -> Date tengah malam WIB
export const tambahHari = (s, n) => hari(new Date(tglWIB(s).getTime() + n * 864e5));
export const selisihHari = (a, b) => Math.round((tglWIB(a) - tglWIB(b)) / 864e5); // a - b dalam hari
export const jamSejak = (t, ref = now()) => (new Date(ref) - new Date(t)) / 36e5;

// ---------- penyimpanan ----------
// Dua backend dengan antarmuka sama (semua async):
//   Supabase (bila SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY ada): tabel public.karyawan_rekaman (koleksi, id, data jsonb)
//   File JSON lokal di DATA()/<koleksi>/<id>.json (untuk uji dan pemakaian tanpa internet)
const cekId = (id) => { if (!/^[A-Za-z0-9._-]+$/.test(String(id))) die('ID tidak sah: ' + id); return id; };
export const pakaiSupabase = () => !!(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));

export async function sbFetch(pathQ, { method = 'GET', body, headers = {} } = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: key, 'Content-Type': 'application/json', ...headers };
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key; // kunci JWT lama; kunci sb_secret_ cukup di header apikey
  const r = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/' + pathQ, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (r.status === 401 && /invalid api key/i.test(t)) throw new Galat('Kunci SUPABASE_SERVICE_ROLE_KEY di server ditolak Supabase (salah salin, kunci anon, atau dari project lain). Jalankan deploy\\perbaiki-kunci.ps1 di laptop untuk mengecek dan mengganti kunci.');
  if (!r.ok) throw new Galat(`Supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const fileBE = {
  dir: (k) => path.join(DATA(), k),
  fp: (k, id) => path.join(DATA(), k, cekId(id) + '.json'),
  async ada(k, id) { return fs.existsSync(this.fp(k, id)); },
  async ambil(k, id) { const f = this.fp(k, id); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; },
  async simpan(k, rec) {
    fs.mkdirSync(this.dir(k), { recursive: true });
    const f = this.fp(k, rec.id), tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2) + '\n');
    fs.renameSync(tmp, f); // atomik
  },
  async semua(k) {
    if (!fs.existsSync(this.dir(k))) return [];
    return fs.readdirSync(this.dir(k)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(this.dir(k), f), 'utf8')));
  },
};
const sbBE = {
  async ambil(k, id) { const r = await sbFetch(`karyawan_rekaman?koleksi=eq.${k}&id=eq.${encodeURIComponent(cekId(id))}&select=data`); return r[0]?.data || null; },
  async ada(k, id) { return !!(await this.ambil(k, id)); },
  async simpan(k, rec) {
    await sbFetch('karyawan_rekaman?on_conflict=koleksi,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { koleksi: k, id: cekId(rec.id), data: rec, diubah: new Date().toISOString() } });
  },
  async semua(k) {
    const out = [];
    for (let off = 0; ; off += 1000) {
      const r = await sbFetch(`karyawan_rekaman?koleksi=eq.${k}&select=data&order=id&limit=1000&offset=${off}`);
      out.push(...r.map((x) => x.data));
      if (r.length < 1000) return out;
    }
  },
};
const be = () => (pakaiSupabase() ? sbBE : fileBE);
export const ada = (k, id) => be().ada(k, id);
export async function muat(k, id) {
  if (!id) die(`${k} tidak ditemukan: ${id}`);
  return (await be().ambil(k, id)) || die(`${k} tidak ditemukan: ${id}`);
}
export const ambil = (k, id) => be().ambil(k, id);
export async function simpan(k, rec) { rec.diubah = iso(); await be().simpan(k, rec); return rec; }
export const semua = (k) => be().semua(k);
export function idBaru(prefix) {
  return `${prefix}-${hari().replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex')}`;
}
export function catat(rec, ke, oleh, note = '') {
  (rec.riwayat ||= []).push({ at: iso(), dari: rec.status ?? rec.tahap ?? null, ke, oleh, note });
}

// ---------- mesin status ----------
// Siapa boleh memindahkan apa. 'manusia' = wajib --by Nama (diblokir untuk agent di .claude/settings.json).
export const AKSI = {
  usulan:    { disetujui: 'manusia|autopilot', ditolak: 'manusia', diganti: 'sistem' },
  disetujui: { terkirim: 'executor', gagal: 'executor', ditolak: 'manusia' },
  gagal:     { disetujui: 'manusia', ditolak: 'manusia' },
  terkirim:  {},
  ditolak:   {},
  diganti:   {}, // draf lama yang digantikan draf baru untuk percakapan yang sama
};
export function pindahAksi(a, ke, oleh, note) {
  const izin = AKSI[a.status]?.[ke];
  if (!izin) die(`Transisi aksi ${a.status} -> ${ke} tidak sah`);
  const peran = ['autopilot', 'executor', 'sistem'].includes(oleh) ? oleh : 'manusia';
  if (!izin.split('|').includes(peran)) die(`Transisi ${a.status} -> ${ke} hanya untuk: ${izin}`);
  if (peran === 'manusia' && (!oleh || oleh === 'agent')) die('Perintah ini hanya untuk manusia: sertakan --by "Nama Anda"');
  catat(a, ke, oleh, note);
  a.status = ke;
  return a;
}
export const TAHAP_LEAD = ['baru', 'kualifikasi', 'penawaran', 'negosiasi', 'menang', 'kalah'];

// ---------- pengetahuan dan aturan ----------
export function baca(rel) { const f = path.join(ROOT, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
export function kebijakan() { return JSON.parse(baca('aturan/kebijakan.json') || '{}'); }
export function libur() { try { return JSON.parse(baca('aturan/libur.json') || '{}').tanggal || []; } catch { return []; } }
export function klaimTerlarang(unit) {
  const out = []; let on = false;
  for (const l of baca(`brands/${unit}.md`).split('\n')) {
    if (/^##\s/.test(l)) on = /klaim terlarang/i.test(l);
    else if (on && /^\s*-\s+/.test(l)) {
      const p = l.replace(/^\s*-\s+/, '').trim();
      if (p && !/ISI|\(/.test(p)) out.push(p.toLowerCase());
    }
  }
  return out;
}
export function template(nama) {
  const t = baca(`templates/${nama}.json`);
  if (!t) die('Template tidak ada: templates/' + nama + '.json');
  return JSON.parse(t);
}
export function isiTemplate(teks, data) {
  return teks.replace(/\{(\w+)\}/g, (m, k) => (data[k] ?? m));
}
export function nomorWA(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  if (!/^62\d{8,13}$/.test(d)) die('Nomor WA tidak sah: ' + s);
  return d;
}
