import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.KONTEN_DATA || path.join(ROOT, 'content');
export const QUEUE = path.join(DATA, 'queue');
export const CHANNELS = {
  threads:   { auto: true,  max: 500,  format: 'text' },
  instagram: { auto: true,  max: 2200, format: 'image' },
  facebook:  { auto: true,  max: 5000, format: 'text' },
  tiktok:    { auto: false, max: 2200, format: 'video-script' },
  youtube:   { auto: false, max: 5000, format: 'video-script' },
};
export function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
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
export const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
export const now = () => new Date().toISOString();
export const day = (t) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
export const file = (id) => path.join(QUEUE, id + '.json');
export function load(id) {
  if (!id || !fs.existsSync(file(id))) die('Item tidak ditemukan: ' + id);
  return JSON.parse(fs.readFileSync(file(id), 'utf8'));
}
export function save(it) { fs.mkdirSync(QUEUE, { recursive: true }); fs.writeFileSync(file(it.id), JSON.stringify(it, null, 2) + '\n'); }
export function all() {
  if (!fs.existsSync(QUEUE)) return [];
  return fs.readdirSync(QUEUE).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(QUEUE, f), 'utf8')));
}
export function log(it, to, by, note) {
  (it.history ||= []).push({ at: now(), from: it.status, to, by, note: note || '' });
  it.status = to;
}
export function banned(brand) {
  const f = path.join(ROOT, 'brands', brand + '.md');
  if (!fs.existsSync(f)) return [];
  const out = []; let on = false;
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (/^##\s/.test(l)) on = /klaim terlarang/i.test(l); else if (on && /^\s*-\s+/.test(l)) {
      const p = l.replace(/^\s*-\s+/, '').trim();
      if (p && !/ISI|\(/.test(p)) out.push(p.toLowerCase());
    }
  }
  return out;
}
export function compose(it) {
  const tags = (it.hashtags || []).map((h) => '#' + h.replace(/^#/, '')).join(' ');
  return it.channel === 'threads' ? it.text : [it.text, tags].filter(Boolean).join('\n\n');
}
// publish=true: pemeriksaan lengkap sebelum persetujuan/tayang
export function validate(it, publish = false) {
  const p = [], c = CHANNELS[it.channel];
  if (!c) return ['Channel tidak dikenal: ' + it.channel];
  const t = compose(it);
  if (!it.text || !it.text.trim()) p.push('Teks kosong');
  if (t.length > c.max) p.push(`Teks ${t.length} karakter, batas ${it.channel} adalah ${c.max}`);
  for (const b of banned(it.brand)) if (t.toLowerCase().includes(b)) p.push('Mengandung klaim terlarang: "' + b + '"');
  if (publish) {
    if (it.channel === 'instagram' && !(it.media || []).length) p.push('Instagram wajib punya gambar (media)');
    for (const m of it.media || []) if (!/^https:\/\//.test(m)) p.push('Media harus URL https publik: ' + m);
    if (!it.scheduled_at || isNaN(Date.parse(it.scheduled_at))) p.push('Jadwal (scheduled_at) belum valid');
  }
  return p;
}
