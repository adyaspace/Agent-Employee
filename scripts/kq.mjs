#!/usr/bin/env node
// Antrean konten dengan mesin status. Agent boleh: new, set, move, qa, list, show, due.
// Hanya manusia: approve, reject, revise, posted, retry (diblokir di .claude/settings.json).
import fs from 'node:fs';
import { CHANNELS, args, load, save, all, die, now, log, validate, day } from './lib.mjs';
const { _, o } = args(process.argv.slice(2));
const [cmd, id] = _;
const by = o.by || 'agent';
const human = () => { if (!o.by || o.by === 'agent') die('Perintah ini hanya untuk manusia: sertakan --by "Nama Anda"'); };

function setFields(it) {
  if (o.topic) it.topic = o.topic;
  if (o.hook) it.hook = o.hook;
  if (o.brief) it.brief_visual = o.brief;
  if (o.riset) it.riset = o.riset;
  if (o.media) it.media = String(o.media).split(',').map((s) => s.trim()).filter(Boolean);
  if (o.hashtags) it.hashtags = String(o.hashtags).split(',').map((s) => s.trim()).filter(Boolean);
  if (o.schedule) { if (isNaN(Date.parse(o.schedule))) die('Format --schedule harus ISO, contoh 2026-11-16T19:00:00+07:00'); it.scheduled_at = o.schedule; }
  const txt = o['text-file'] ? fs.readFileSync(o['text-file'], 'utf8').trim() : (typeof o.text === 'string' ? o.text : null);
  if (txt !== null && txt !== it.text) {
    it.text = txt;
    if (['menunggu_persetujuan', 'terjadwal'].includes(it.status)) { delete it.qa; delete it.approval; log(it, 'draf', by, 'Teks diubah, QA dan persetujuan diulang'); }
  }
}
const row = (i) => `${i.id} | ${i.status} | ${i.channel} | ${i.scheduled_at || '-'} | ${i.topic || ''}`;

if (cmd === 'new') {
  if (!o.brand || !o.channel || !o.topic) die('Wajib: --brand --channel --topic');
  if (!CHANNELS[o.channel]) die('Channel: ' + Object.keys(CHANNELS).join(', '));
  const pre = `${day(now()).replaceAll('-', '')}-${o.brand}-${o.channel}`;
  const n = all().filter((i) => i.id.startsWith(pre)).length + 1;
  const it = { id: `${pre}-${String(n).padStart(2, '0')}`, brand: o.brand, channel: o.channel, format: o.format || CHANNELS[o.channel].format, status: 'ide', history: [] };
  setFields(it); it.history.push({ at: now(), from: null, to: 'ide', by, note: 'Dibuat' }); save(it); console.log(it.id);
} else if (cmd === 'set') { const it = load(id); setFields(it); save(it); console.log('OK ' + id);
} else if (cmd === 'move') {
  const it = load(id), to = _[2], ok = (it.status === 'ide' && to === 'draf') || (it.status === 'revisi' && to === 'draf');
  if (!ok) die(`Transisi ${it.status} -> ${to} tidak diizinkan lewat move. Pakai qa untuk draf, atau perintah manusia.`);
  if (to === 'draf' && !it.text) die('Isi teks dulu (set --text-file) sebelum pindah ke draf');
  log(it, to, by, o.note); save(it); console.log('OK ' + id + ' -> ' + to);
} else if (cmd === 'qa') {
  const it = load(id); if (it.status !== 'draf') die('QA hanya untuk status draf (sekarang: ' + it.status + ')');
  if (!o.pass === !o.fail) die('Pilih tepat satu: --pass atau --fail');
  const probs = validate(it), ok = !!o.pass && !probs.length;
  it.qa = { passed: ok, note: [o.note, probs.length ? 'Pemeriksaan otomatis: ' + probs.join('; ') : ''].filter(Boolean).join(' | '), at: now(), by };
  log(it, ok ? 'menunggu_persetujuan' : 'revisi', by, it.qa.note); save(it); console.log((ok ? 'LOLOS' : 'REVISI') + ' ' + id + (it.qa.note ? ' :: ' + it.qa.note : ''));
} else if (cmd === 'list') {
  all().filter((i) => (!o.status || i.status === o.status) && (!o.brand || i.brand === o.brand)).sort((a, b) => a.id.localeCompare(b.id)).forEach((i) => console.log(row(i)));
} else if (cmd === 'show') console.log(JSON.stringify(load(id), null, 2));
else if (cmd === 'due') all().filter((i) => i.status === 'terjadwal' && Date.parse(i.scheduled_at) <= Date.now()).forEach((i) => console.log(row(i)));
else if (cmd === 'approve') {
  human(); const it = load(id);
  if (it.status !== 'menunggu_persetujuan') die('Status harus menunggu_persetujuan (sekarang: ' + it.status + ')');
  if (!it.qa?.passed) die('Belum lolos QA');
  if (o.at) { if (isNaN(Date.parse(o.at))) die('Format --at ISO'); it.scheduled_at = o.at; }
  const probs = validate(it, true); if (probs.length) die('Belum siap tayang: ' + probs.join('; '));
  it.approval = { by: o.by, at: now() }; log(it, 'terjadwal', o.by, 'Disetujui'); save(it); console.log('TERJADWAL ' + id + ' @ ' + it.scheduled_at);
} else if (cmd === 'reject' || cmd === 'revise') {
  human(); const it = load(id); if (['tayang', 'ditolak'].includes(it.status)) die('Sudah final: ' + it.status);
  delete it.approval; log(it, cmd === 'reject' ? 'ditolak' : 'revisi', o.by, o.note); save(it); console.log('OK ' + id);
} else if (cmd === 'posted') {
  human(); const it = load(id); if (CHANNELS[it.channel].auto) die('Channel ini diposting otomatis; posted hanya untuk tiktok/youtube');
  if (it.status !== 'terjadwal') die('Item harus terjadwal');
  it.publish = { ...(it.publish || {}), url: o.url || '', at: now(), manual: true }; log(it, 'tayang', o.by, 'Diunggah manual'); save(it); console.log('OK ' + id);
} else if (cmd === 'retry') {
  human(); const it = load(id); if (it.status !== 'gagal') die('Hanya untuk status gagal');
  log(it, 'terjadwal', o.by, 'Coba lagi'); save(it); console.log('OK ' + id);
} else console.log('Perintah: new | set | move | qa | list | show | due  (manusia: approve | reject | revise | posted | retry)');
