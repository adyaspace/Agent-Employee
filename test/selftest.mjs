#!/usr/bin/env node
// Uji mandiri karyawan-ai: memakai server tiruan untuk Meta dan Claude API. Tidak menyentuh akun asli.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const ex = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'karyawan-'));
const DATA = path.join(tmp, 'data');

// ---- server tiruan ----
const calls = [], claudeAntre = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    calls.push({ m: req.method, u: req.url, b: b ? JSON.parse(b) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/messages') return res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(claudeAntre.shift()) }], usage: { input_tokens: 1000, output_tokens: 500 } }));
    if (/\/messages$/.test(req.url)) return res.end(JSON.stringify({ messages: [{ id: 'wamid.' + calls.length }] }));
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + mock.address().port;
const env = {
  ...process.env, KARYAWAN_DATA: DATA, KONTEN_DATA: path.join(tmp, 'content'),
  META_API_BASE: base, ANTHROPIC_API_BASE: base, ANTHROPIC_API_KEY: 'x',
  WA_PHONE_ID_ADYASPACE: '111', WA_TOKEN_ADYASPACE: 't', WA_PHONE_ID_PIRAMID_FORKLIFT: '222', WA_TOKEN_PIRAMID_FORKLIFT: 't',
  WA_APP_SECRET: 'rahasia', WA_VERIFY_TOKEN: 'verif', DASHBOARD_PIN: '2468', AUTOPILOT: '', KARYAWAN_LIVE: '', CS_AUTODRAFT: '0',
  CRON_SECRET: 'cron-uji', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', VERCEL: '',
};
Object.assign(process.env, env);
const run = async (s, a, e = {}) => {
  try { return { ok: true, out: (await ex(process.execPath, [path.join(ROOT, s), ...a], { env: { ...env, ...e }, encoding: 'utf8', timeout: 20000 })).stdout.trim() }; }
  catch (x) { return { ok: false, out: ((x.stderr || '') + (x.stdout || '')).trim() }; }
};
const AI = (a, e) => run('bin/ai.mjs', a, e);
const rd = (k, id) => JSON.parse(fs.readFileSync(path.join(DATA, k, id + '.json'), 'utf8'));
const tulis = (k, rec) => { fs.mkdirSync(path.join(DATA, k), { recursive: true }); fs.writeFileSync(path.join(DATA, k, rec.id + '.json'), JSON.stringify(rec)); };
let fail = 0; const t = (n, c, d = '') => { console.log((c ? 'LULUS  ' : 'GAGAL  ') + n + (c ? '' : '  -> ' + d)); if (!c) fail++; };

// ---- 1. kalender kepatuhan ----
const { kewajibanKlien, hariKerja } = await import('../lib/kalender.mjs');
const kl = { id: 'k1', nama: 'Uji', jenis: 'badan', skala: 'kecil', pkp: true, layanan: ['pph_masa', 'ppn', 'lkpm'] };
const kw = kewajibanKlien(kl, '2026-11-13', 70), cari = (k) => kw.find((x) => x.kode === k)?.jatuh_tempo;
t('setor PPh masa Okt 2026 (15 Nov = Minggu) digeser ke 16 Nov', cari('pph_setor_202610') === '2026-11-16', cari('pph_setor_202610'));
t('lapor SPT Masa PPh Okt 2026 = 20 Nov', cari('pph_lapor_202610') === '2026-11-20');
t('PPN masa Okt 2026 = 30 Nov', cari('ppn_202610') === '2026-11-30');
t('LKPM usaha kecil Semester II 2026 = 15 Jan 2027', cari('lkpm_202701') === '2027-01-15', JSON.stringify(kw.map((x) => x.kode)));
t('hari kerja: Sabtu 14 Nov -> Senin 16 Nov', hariKerja('2026-11-14') === '2026-11-16');

// ---- 2. webhook ----
const { handler } = await import('../lib/web.mjs');
const wh = http.createServer(handler);
await new Promise((r) => wh.listen(0, '127.0.0.1', r));
const whURL = `http://127.0.0.1:${wh.address().port}/webhook`;
const kirimHook = async (body, sign = true) => {
  const raw = JSON.stringify(body), sig = 'sha256=' + crypto.createHmac('sha256', 'rahasia').update(raw).digest('hex');
  return (await fetch(whURL, { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign ? sig : 'sha256=salah' } })).status;
};
const pesan = (pid, from, nama, teks, id) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pid }, contacts: [{ wa_id: from, profile: { name: nama } }], messages: [{ id, from, type: 'text', text: { body: teks }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
t('verifikasi webhook GET', (await (await fetch(`${whURL}?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=abc`)).text()) === 'abc');
t('tanda tangan salah ditolak 401', (await kirimHook(pesan('111', '6281200000001', 'Rina', 'Halo', 'w1'), false)) === 401);
t('pesan sah diterima', (await kirimHook(pesan('111', '6281200000001', 'Rina', 'Halo, virtual office berapa ya?', 'w1'))) === 200);
await kirimHook(pesan('111', '6281200000001', 'Rina', 'Halo, virtual office berapa ya?', 'w1')); // duplikat dari Meta
await kirimHook(pesan('222', '6281300000002', 'Pak Joko', 'Selamat pagi', 'w2'));
await new Promise((r) => setTimeout(r, 150));
const leads = () => fs.readdirSync(path.join(DATA, 'leads')).map((f) => JSON.parse(fs.readFileSync(path.join(DATA, 'leads', f))));
const rina = leads().find((l) => l.wa === '6281200000001'), joko = leads().find((l) => l.wa === '6281300000002');
t('lead dibuat otomatis dan ditandai perlu balasan', rina?.unit === 'adyaspace' && rina.perlu_balasan && joko?.unit === 'piramid-forklift');
t('webhook duplikat tidak menggandakan pesan', rd('percakapan', 'adyaspace--6281200000001').pesan.length === 1);

// ---- 3. CS draft + pengaman ----
claudeAntre.push({ intent: 'tanya_layanan', risiko: 'rendah', balasan: 'Virtual office kami Rp2.750.000 per tahun, langsung aktif.', alasan: '-', lead: { kebutuhan: 'virtual office' } });
let r = await run('bin/cs-draft.mjs', ['--lead', rina.id]);
const aksiRina = r.out.match(/aksi-[\w-]+/)?.[0];
const a1 = aksiRina && rd('aksi', aksiRina);
t('harga karangan model dipaksa risiko tinggi', a1?.risiko === 'tinggi' && a1.masalah.some((m) => /Rp2\.750\.000/.test(m)), r.out);
t('kebutuhan lead terisi dari percakapan', rd('leads', rina.id).kebutuhan === 'virtual office' && rd('leads', rina.id).tahap === 'kualifikasi');
claudeAntre.push({ intent: 'salam', risiko: 'rendah', balasan: 'Selamat pagi Pak Joko, ada yang bisa kami bantu soal forklift?', alasan: 'salam' });
r = await run('bin/cs-draft.mjs', ['--lead', joko.id], { AUTOPILOT: '1' });
const aksiJoko = r.out.match(/aksi-[\w-]+/)?.[0];
t('salam risiko rendah langsung disetujui autopilot', rd('aksi', aksiJoko).status === 'disetujui' && rd('aksi', aksiJoko).riwayat.some((x) => x.oleh === 'autopilot'), r.out);
const claudeBody = calls.find((c) => c.u === '/v1/messages')?.b;
t('prompt CS memuat pengetahuan harga resmi', /Rp3\.000\.000/.test(JSON.stringify(claudeBody?.system || '')));

// ---- 4. persetujuan ----
t('agent tidak bisa menyetujui tanpa --by', !(await AI(['aksi', 'setujui', aksiRina])).ok);
t('nama sistem tidak bisa dipakai menyetujui', !(await AI(['aksi', 'setujui', aksiRina, '--by', 'autopilot'])).ok);
t('aksi bermasalah tidak bisa disetujui tanpa --paksa', !(await AI(['aksi', 'setujui', aksiRina, '--by', 'Budi'])).ok);
fs.writeFileSync(path.join(tmp, 'b.txt'), 'Virtual Office kami mulai Rp3.000.000 per tahun. Boleh tahu usahanya bergerak di bidang apa, Kak?');
t('manusia memperbaiki isi lalu menyetujui', /DISETUJUI/.test((await AI(['aksi', 'setujui', aksiRina, '--by', 'Budi', '--isi-file', path.join(tmp, 'b.txt')])).out));

// ---- 5. kirim ----
const n0 = calls.length;
t('dry-run tidak mengirim apa pun', /DRY-RUN/.test((await run('bin/kirim.mjs', [])).out) && calls.length === n0);
t('--live tanpa KARYAWAN_LIVE ditolak', !(await run('bin/kirim.mjs', ['--live'])).ok);
r = await run('bin/kirim.mjs', ['--live'], { KARYAWAN_LIVE: '1' });
t('dua aksi terkirim', (r.out.match(/TERKIRIM/g) || []).length === 2, r.out);
const waCall = calls.find((c) => c.u === '/v26.0/111/messages');
t('dalam jendela 24 jam dikirim sebagai teks', waCall?.b?.type === 'text' && /Rp3\.000\.000/.test(waCall.b.text.body));
t('percakapan mencatat pesan keluar', rd('percakapan', 'adyaspace--6281200000001').pesan.some((p) => p.arah === 'keluar'));
const n1 = calls.length; await run('bin/kirim.mjs', ['--live'], { KARYAWAN_LIVE: '1' });
t('tidak ada kirim ganda', calls.length === n1);

// ---- 6. radar ----
const tigaHari = new Date(Date.now() - 3 * 864e5).toISOString();
tulis('leads', { id: 'lead-uji-fu', unit: 'piramid-forklift', nama: 'CV Gudang', wa: '6281400000003', tahap: 'penawaran', kebutuhan: 'sewa forklift 3 ton', followup_ke: 0, last_in: new Date(Date.now() - 4 * 864e5).toISOString(), last_out: tigaHari, riwayat: [] });
const kid = (await AI(['klien', 'baru', '--nama', 'PT Uji', '--wa', '081500000004', '--jenis', 'badan', '--skala', 'kecil', '--pkp', 'ya', '--layanan', 'pph_masa,ppn'])).out;
r = await run('bin/radar.mjs', [], { KARYAWAN_NOW: '2026-11-13T09:00:00+07:00' });
t('radar membuat follow-up lead diam 3 hari', /Follow-up ke-1 untuk CV Gudang/.test(r.out), r.out);
t('radar membuat pengingat setor (H-3) dan lapor (H-7)', /Setor PPh masa Oktober 2026 - PT Uji \(H-3\)/.test(r.out) && /Lapor SPT Masa PPh Oktober 2026 - PT Uji \(H-7\)/.test(r.out), r.out);
t('radar tidak membuat duplikat saat diulang', /tidak ada usulan baru/.test((await run('bin/radar.mjs', [], { KARYAWAN_NOW: '2026-11-13T09:00:00+07:00' })).out));
const pengingat = fs.readdirSync(path.join(DATA, 'aksi')).map((f) => JSON.parse(fs.readFileSync(path.join(DATA, 'aksi', f)))).find((a) => a.tujuan?.klien === kid && /Setor/.test(a.ringkas));
await AI(['aksi', 'setujui', pengingat.id, '--by', 'Budi']);
await run('bin/kirim.mjs', [pengingat.id, '--live'], { KARYAWAN_LIVE: '1' });
const tplCall = calls.filter((c) => c.u === '/v26.0/111/messages').at(-1);
t('pengingat klien di luar jendela memakai template Meta', tplCall?.b?.type === 'template' && tplCall.b.template.name === 'pengingat_kewajiban_v1' && tplCall.b.template.components[0].parameters.length === 4, JSON.stringify(tplCall?.b));

// ---- 7. SLA 5P ----
const jid = (await AI(['job', 'baru', '--pelanggan', 'PT Logistik', '--teknisi', 'Andi'])).out;
await AI(['job', 'catat', jid, 'selesai_cek', '--at', new Date(Date.now() - 30 * 36e5).toISOString()]);
r = await AI(['job', 'sla']);
t('input pengecekan lewat 1 hari terdeteksi', /Input hasil pengecekan/.test(r.out) && /lewat 6 jam/.test(r.out), r.out);
await AI(['job', 'catat', jid, 'input_cek']);
t('setelah input dicatat, pelanggaran aktif hilang', /Tidak ada pelanggaran SLA aktif/.test((await AI(['job', 'sla'])).out));

// ---- 8. dashboard (sesi), draf pengganti, cron ----
const base2 = whURL.replace('/webhook', '');
const login = (pin, nama = 'Budi') => fetch(base2 + '/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama, pin }) });
t('dashboard: tanpa sesi ditolak 401', (await fetch(base2 + '/api/ringkas')).status === 401);
t('dashboard: PIN salah ditolak', (await login('0000')).status === 401);
const lr = await login('2468'), ck = (lr.headers.get('set-cookie') || '').split(';')[0];
t('dashboard: PIN benar memberi cookie sesi HttpOnly', lr.status === 200 && /ka_sesi=/.test(ck) && /HttpOnly/.test(lr.headers.get('set-cookie')));
const rg = await (await fetch(base2 + '/api/ringkas', { headers: { cookie: ck } })).json();
t('dashboard: ringkasan memuat keputusan, tenggat, dan kesiapan', rg.keputusan.length >= 2 && rg.tenggat.length >= 1 && rg.nama === 'Budi' && rg.kesiapan.ai === true, JSON.stringify({ k: rg.keputusan?.length, t: rg.tenggat?.length }));
const target = rg.keputusan.find((a) => !a.masalah?.length);
const ap = await (await fetch(`${base2}/api/aksi/${target.id}/setujui`, { method: 'POST', headers: { cookie: ck, 'Content-Type': 'application/json' }, body: '{}' })).json();
t('dashboard: setujui tercatat atas nama sesi dan langsung dicoba kirim (simulasi)', /^DRY-RUN/.test(ap.hasil) && rd('aksi', target.id).riwayat.at(-1).oleh === 'Budi', JSON.stringify(ap));
t('dashboard: cookie palsu ditolak', (await fetch(base2 + '/api/ringkas', { headers: { cookie: 'ka_sesi=abc.def' } })).status === 401);
t('dashboard: halaman UI tersaji', /Meja Keputusan/.test(await (await fetch(base2 + '/')).text()));
t('dashboard: kantor.js tersaji', (await fetch(base2 + '/app/kantor.js')).headers.get('content-type')?.startsWith('text/javascript'));
await kirimHook(pesan('111', '6281200000001', 'Rina', 'Kak, kalau PT perorangan berapa?', 'w9'));
claudeAntre.push({ intent: 'tanya_harga', risiko: 'sedang', balasan: 'PT Perorangan mulai Rp500.000, Kak.', alasan: 'harga' });
r = await run('bin/cs-draft.mjs', ['--lead', rina.id]);
const pertama = r.out.match(/aksi-[\w-]+/)?.[0];
await kirimHook(pesan('111', '6281200000001', 'Rina', 'Sama VO juga ya', 'w10'));
claudeAntre.push({ intent: 'tanya_harga', risiko: 'sedang', balasan: 'PT Perorangan mulai Rp500.000 dan Virtual Office mulai Rp3.000.000 per tahun, Kak.', alasan: 'harga' });
await run('bin/cs-draft.mjs', ['--lead', rina.id]);
t('pesan baru menggantikan draf lama yang belum diputuskan', rd('aksi', pertama).status === 'diganti');
// ---- 8c. Tim AI: rencana Kepala Staf, eksekusi agent, review, anggaran, chat ----
const api = async (path2, body) => { const r = await fetch(base2 + path2, body === undefined ? { headers: { cookie: ck } } : { method: 'POST', headers: { cookie: ck, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
const tunggu = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((z) => setTimeout(z, 100)); } return false; };
let tm = await api('/api/tim');
t('Tim AI: roster awal 9 agent dimuat', tm.j.agen?.length === 9 && tm.j.agen[0].id === 'kepala-staf', JSON.stringify(tm.j).slice(0, 200));
claudeAntre.push({ ringkasan: 'Follow-up lead VO lalu cek kualitas', tugas: [
  { agen: 'cs-adya', judul: 'Susun follow-up lead VO', instruksi: 'Buat pesan follow-up untuk lead yang tanya VO.' },
  { agen: 'qa', judul: 'Periksa pesan', instruksi: 'Periksa pesan dari tugas sebelumnya.' }] });
let pr = await api('/api/proyek', { judul: 'Follow-up VO', tujuan: 'Follow-up semua calon klien virtual office minggu ini', batas_usd: 1 });
const pid = pr.j.proyek?.id;
t('Kepala Staf menyusun rencana yang menunggu persetujuan', pr.s === 200 && pr.j.proyek.status === 'menunggu_rencana' && pr.j.tugas.length === 2 && pr.j.tugas.every((x) => x.status === 'rencana'), JSON.stringify(pr.j).slice(0, 300));
t('biaya rencana dihitung dari tarif Sonnet ($0,007)', Math.abs((rd('proyek', pid).terpakai_usd || 0) - 0.007) < 1e-9, String(rd('proyek', pid).terpakai_usd));
claudeAntre.push({ ringkasan: 'Dua pesan follow-up disiapkan', hasil_md: '## Follow-up\n- Rina', butuh_dari_pemilik: [], pesan_wa: [{ lead: rina.id, isi: 'Halo Kak Rina, Virtual Office kami mulai Rp3.000.000 per tahun. Masih tertarik?' }] });
claudeAntre.push({ ringkasan: 'Pesan aman', hasil_md: 'Tidak ada klaim terlarang.', butuh_dari_pemilik: ['Konfirmasi jam operasional'] });
await api(`/api/proyek/${pid}/setujui`, {});
const semuaTugas = () => fs.readdirSync(path.join(DATA, 'tugas')).map((f) => JSON.parse(fs.readFileSync(path.join(DATA, 'tugas', f))));
t('setelah rencana disetujui, agent bekerja berurutan sampai review', await tunggu(() => semuaTugas().filter((x) => x.proyek === pid).every((x) => x.status === 'review')), JSON.stringify(semuaTugas().map((x) => x.status)));
const t1 = semuaTugas().find((x) => x.proyek === pid && x.agen === 'cs-adya'), t2 = semuaTugas().find((x) => x.proyek === pid && x.agen === 'qa');
t('pesan WA usulan agent masuk Meja Keputusan', t1.hasil.pesan_wa.length === 1 && rd('aksi', t1.hasil.pesan_wa[0]).jenis === 'wa_agen' && rd('aksi', t1.hasil.pesan_wa[0]).status === 'usulan');
const pesanKeQA = calls.filter((c) => c.u === '/v1/messages').at(-1).b.messages[0].content;
t('tugas berikutnya menerima hasil tugas sebelumnya', /Hasil tugas sebelumnya/.test(pesanKeQA) && /Follow-up/.test(pesanKeQA));
const rg2 = (await api('/api/ringkas')).j;
t('hasil kerja agent tampil di ringkasan Meja Keputusan', rg2.tugas_review.length >= 2 && rg2.tugas_review.some((x) => x.agen_nama === 'Laras'));
t('revisi tanpa catatan ditolak', (await api(`/api/tugas/${t2.id}/revisi`, { note: '' })).s === 400);
claudeAntre.push({ ringkasan: 'Sudah direvisi', hasil_md: 'Versi revisi.', butuh_dari_pemilik: [] });
await api(`/api/tugas/${t2.id}/revisi`, { note: 'Tambahkan daftar periksa' });
t('revisi dikerjakan ulang dengan catatan pemilik', await tunggu(() => rd('tugas', t2.id).status === 'review' && rd('tugas', t2.id).hasil.md === 'Versi revisi.') && /Tambahkan daftar periksa/.test(calls.filter((c) => c.u === '/v1/messages').at(-1).b.messages[0].content));
await api(`/api/tugas/${t1.id}/setujui`, {}); await api(`/api/tugas/${t2.id}/setujui`, {});
t('semua tugas disetujui, proyek selesai', rd('proyek', pid).status === 'selesai');
claudeAntre.push({ ringkasan: 'r', tugas: [{ agen: 'analis', judul: 'Analisis', instruksi: 'x' }] });
const pr2 = await api('/api/proyek', { tujuan: 'Analisis kecil', batas_usd: 0.001 });
await api(`/api/proyek/${pr2.j.proyek.id}/setujui`, {});
t('anggaran proyek habis: tugas tertahan, tidak memanggil AI', await tunggu(() => semuaTugas().some((x) => x.proyek === pr2.j.proyek.id && x.status === 'tertahan')));
const progres = (await api('/api/agen/cs-adya/progres')).j;
t('tanya progres agent', /1 selesai/.test(progres.teks), progres.teks);
claudeAntre.push({ balasan: 'Ada 1 lead belum dibalas. Saya usulkan proyek follow-up.', usul_proyek: { judul: 'Follow-up lead', tujuan: 'Follow-up lead yang belum dibalas' } });
const ch = await api('/api/chat', { pesan: 'Apa yang perlu saya kerjakan hari ini?' });
t('chat Kepala Staf membalas dan bisa mengusulkan proyek', ch.s === 200 && ch.j.pesan.at(-1).dari === 'kepala-staf' && ch.j.pesan.at(-1).usul_proyek?.judul === 'Follow-up lead', JSON.stringify(ch.j).slice(0, 200));
t('agen baru bisa ditambahkan', (await api('/api/agen', { nama: 'Uji Agen', peran: 'Uji', unit: 'umum', model: 'claude-haiku-5-5' })).j.id === 'agen-uji-agen');
t('model tidak dikenal ditolak', (await api('/api/agen', { nama: 'X', peran: 'Y', model: 'gpt-x' })).s === 400);

t('cron tanpa rahasia ditolak', (await fetch(base2 + '/api/cron')).status === 401);
const cr = await fetch(base2 + '/api/cron', { headers: { authorization: 'Bearer cron-uji' } });
t('cron harian: radar, kirim, briefing tersimpan', cr.status === 200 && fs.existsSync(path.join(DATA, 'briefing')), await cr.text());
wh.close();

// ---- 8b. backend Supabase (PostgREST tiruan) + harga live dari pricing_packages ----
const tabel = new Map();
const sb = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'), q = u.searchParams, eq = (k) => q.get(k)?.replace(/^eq\./, '');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.apikey !== 'kunci-uji') { res.statusCode = 401; return res.end('{}'); }
    if (u.pathname === '/rest/v1/pricing_categories') return res.end(JSON.stringify([{ id: 'c1', name_id: 'Pendirian Badan Usaha', sort_order: 1 }]));
    if (u.pathname === '/rest/v1/pricing_packages') return res.end(JSON.stringify([{ category_id: 'c1', label_id: 'Pendirian PT (Modal >5M)', prefix_id: 'Jasa', price: '7000000', unit_id: ' All-In', items_id: [] }]));
    if (u.pathname !== '/rest/v1/karyawan_rekaman') { res.statusCode = 404; return res.end('{}'); }
    if (req.method === 'POST') { const row = JSON.parse(b); tabel.set(row.koleksi + '/' + row.id, row); res.statusCode = 201; return res.end(); }
    const rows = [...tabel.values()].filter((x) => x.koleksi === eq('koleksi') && (!q.get('id') || x.id === eq('id')));
    res.end(JSON.stringify(rows.slice(+(q.get('offset') || 0), +(q.get('offset') || 0) + +(q.get('limit') || 1000)).map((x) => ({ data: x.data }))));
  });
});
await new Promise((r2) => sb.listen(0, '127.0.0.1', r2));
const SBE = { SUPABASE_URL: `http://127.0.0.1:${sb.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'kunci-uji' };
const lid = (await AI(['lead', 'baru', '--unit', 'adyaspace', '--wa', '081600000005', '--nama', 'Uji SB'], SBE)).out;
t('Supabase: lead tersimpan di tabel karyawan_rekaman', tabel.has('leads/' + lid), lid);
t('Supabase: data terbaca kembali', /Uji SB/.test((await AI(['lead', 'list'], SBE)).out));
fs.writeFileSync(path.join(tmp, 'p.txt'), 'Pendirian PT modal di atas 5M Rp7.000.000 all-in.');
t('harga live dari pricing_packages diterima pemeriksa', !/::/.test((await AI(['aksi', 'usul', '--lead', lid, '--isi-file', path.join(tmp, 'p.txt')], SBE)).out));
t('tanpa Supabase, harga yang sama ditandai', /tidak ada di daftar harga resmi/.test((await AI(['aksi', 'usul', '--lead', 'lead-uji-fu', '--isi-file', path.join(tmp, 'p.txt')])).out));
sb.close();

// ---- 9. briefing ----
r = await run('bin/briefing.mjs', []);
t('briefing pagi ditulis', r.ok && /# Briefing/.test(r.out) && fs.existsSync(path.join(DATA, 'briefing')), r.out);

mock.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} uji gagal` : '\nSemua uji lulus'); process.exit(fail ? 1 : 0);
