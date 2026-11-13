#!/usr/bin/env node
// Uji mandiri: alur penuh ide -> tayang memakai server tiruan. Tidak menyentuh akun asli.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const ex = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'konten-'));
const calls = [];
const srv = http.createServer((req, res) => {
  req.resume(); req.on('end', () => {
    calls.push(req.method + ' ' + req.url.split('?')[0]);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.method === 'GET' ? { status: 'FINISHED', status_code: 'FINISHED', permalink: 'https://mock.example/p/1' } : { id: 'id-' + calls.length }));
  });
});
await new Promise((r) => srv.listen(0, r));
const base = 'http://127.0.0.1:' + srv.address().port;
const env = { ...process.env, KONTEN_DATA: tmp, META_API_BASE: base, THREADS_API_BASE: base, POLL_MS: '10',
  THREADS_USER_ID_PIRAMID_FORKLIFT: 't1', THREADS_TOKEN_PIRAMID_FORKLIFT: 'x', IG_USER_ID_PIRAMID_FORKLIFT: 'i1', IG_TOKEN_PIRAMID_FORKLIFT: 'x', FB_PAGE_ID_PIRAMID_FORKLIFT: 'f1', FB_PAGE_TOKEN_PIRAMID_FORKLIFT: 'x' };
const run = async (s, a, e = {}) => {
  try { return { ok: true, out: (await ex('node', [path.join(here, s), ...a], { env: { ...env, ...e }, encoding: 'utf8', timeout: 20000 })).stdout.trim() }; }
  catch (x) { return { ok: false, out: ((x.stderr || '') + (x.stdout || '')).trim() }; }
};
let fail = 0; const t = (n, c, d = '') => { console.log((c ? 'LULUS  ' : 'GAGAL  ') + n + (c ? '' : '  -> ' + d)); if (!c) fail++; };
const B = 'piramid-forklift', past = '2020-01-01T10:00:00+07:00', K = (a, e) => run('kq.mjs', a, e);
const mk = async (ch, text, extra = []) => {
  const id = (await K(['new', '--brand', B, '--channel', ch, '--topic', 'uji ' + ch])).out;
  fs.writeFileSync(path.join(tmp, id + '.txt'), text);
  await K(['set', id, '--text-file', path.join(tmp, id + '.txt'), ...extra]); await K(['move', id, 'draf']); return id;
};
const th = await mk('threads', 'Tiga tanda forklift perlu servis sebelum rusak. Cek rutin tiap shift.');
const ig = await mk('instagram', 'Checklist harian operator forklift.', ['--hashtags', 'forklift,k3']);
const fb = await mk('facebook', 'Unit ready stock minggu ini, tanyakan lewat WhatsApp.');
const bad = await mk('threads', 'Kami paling murah dan dijamin tidak rusak!');
const long = await mk('threads', 'a'.repeat(501));
t('klaim terlarang memaksa revisi', /REVISI/.test((await K(['qa', bad, '--pass'])).out));
t('teks terlalu panjang ditolak QA', /REVISI/.test((await K(['qa', long, '--pass'])).out));
for (const id of [th, ig, fb]) t('QA lolos ' + id.slice(-14), /LOLOS/.test((await K(['qa', id, '--pass', '--note', 'ok'])).out));
t('agent tidak bisa approve', !(await K(['approve', th, '--at', past])).ok);
t('instagram tanpa gambar belum bisa disetujui', !(await K(['approve', ig, '--by', 'Budi', '--at', past])).ok);
await K(['set', ig, '--media', 'https://cdn.example.com/a.jpg,https://cdn.example.com/b.jpg']);
for (const id of [th, ig, fb]) t('manusia menyetujui ' + id.slice(-14), /TERJADWAL/.test((await K(['approve', id, '--by', 'Budi', '--at', past])).out));
t('dry-run tidak memposting', /DRY-RUN/.test((await run('publish.mjs', [th])).out) && calls.length === 0);
t('--live tanpa KONTEN_LIVE ditolak', !(await run('publish.mjs', ['--due', '--live'])).ok);
const r = (await run('publish.mjs', ['--due', '--live'], { KONTEN_LIVE: '1' })).out;
t('ketiganya tayang', (r.match(/TAYANG/g) || []).length === 3, r);
t('threads: container lalu publish', calls.some((c) => c.endsWith('/t1/threads')) && calls.some((c) => c.endsWith('/t1/threads_publish')));
t('instagram carousel: 2 anak + induk, lalu publish', calls.filter((c) => c === 'POST /v26.0/i1/media').length === 3 && calls.some((c) => c.endsWith('/i1/media_publish')), calls.join(' '));
t('facebook: feed', calls.some((c) => c.endsWith('/f1/feed')));
const n = calls.length; await run('publish.mjs', ['--due', '--live'], { KONTEN_LIVE: '1' });
t('tidak ada posting ganda', calls.length === n);
t('status akhir tayang tersimpan', JSON.parse(fs.readFileSync(path.join(tmp, 'queue', th + '.json'))).status === 'tayang');
srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} uji gagal` : '\nSemua uji lulus'); process.exit(fail ? 1 : 0);
