#!/usr/bin/env node
// Mode contoh: dashboard lokal berisi data CONTOH (semua nama diawali "Contoh"), terpisah dari data asli.
// Tidak menyentuh Supabase, tidak mengirim WA.
//   npm run contoh      -> http://127.0.0.1:4747  (PIN: contoh-1234)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ROOT } from '../lib/core.mjs';

const DIR = path.join(ROOT, 'data-contoh');
Object.assign(process.env, {
  KARYAWAN_DATA: DIR, KONTEN_DATA: path.join(DIR, 'konten'), SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
  DASHBOARD_PIN: 'contoh-1234', KARYAWAN_LIVE: '', AUTOPILOT: '', ANTHROPIC_API_KEY: '', VERCEL: '', TIM_JEDA: '1',
});
const { simpan, iso } = await import('../lib/core.mjs');
const { buatAksi } = await import('../lib/aksi.mjs');
const { jalankanRadar } = await import('../lib/radar.mjs');
const { handler } = await import('../lib/web.mjs');
const { daftarAgen } = await import('../lib/tim.mjs');

fs.rmSync(DIR, { recursive: true, force: true });
const jam = (x) => new Date(Date.now() - x * 36e5).toISOString();
const r = (o) => ({ riwayat: [], dibuat: iso(), ...o });

await simpan('leads', r({ id: 'lead-contoh-1', unit: 'adyaspace', nama: 'Contoh Rina', wa: '6281200000001', tahap: 'kualifikasi', kebutuhan: 'virtual office', nilai: 3000000, last_in: jam(1) }));
await simpan('leads', r({ id: 'lead-contoh-2', unit: 'piramid-forklift', nama: 'Contoh Pak Joko', wa: '6281300000002', tahap: 'baru', last_in: jam(0.5) }));
await simpan('leads', r({ id: 'lead-contoh-3', unit: 'piramid-forklift', nama: 'Contoh CV Gudang', wa: '6281400000003', tahap: 'penawaran', kebutuhan: 'sewa forklift 3 ton', last_in: jam(96), last_out: jam(72), followup_ke: 0 }));
await simpan('leads', r({ id: 'lead-contoh-4', unit: 'adyaspace', nama: 'Contoh Dimas', wa: '6281700000006', tahap: 'baru', perlu_balasan: true, last_in: jam(3) }));
await simpan('percakapan', { id: 'adyaspace--6281200000001', unit: 'adyaspace', wa: '6281200000001', pesan: [
  { arah: 'masuk', teks: 'Halo kak, virtual office di Buaran bisa buat NIB?', waktu: jam(1.2) },
  { arah: 'masuk', teks: 'Terus harganya berapa setahun?', waktu: jam(1.1) }] });
await simpan('percakapan', { id: 'piramid-forklift--6281300000002', unit: 'piramid-forklift', wa: '6281300000002', pesan: [
  { arah: 'masuk', teks: 'Pak, forklift sewaan di gudang Cakung mati total, tidak bisa start', waktu: jam(0.5) }] });
await simpan('klien', r({ id: 'klien-contoh-1', nama: 'Contoh PT Maju Bersama', wa: '6281500000004', jenis: 'badan', skala: 'kecil', pkp: true, layanan: ['pph_masa', 'ppn', 'lkpm'] }));
await simpan('armada', r({ id: 'unit-contoh-1', pelanggan: 'Contoh PT Logistik Timur', wa: '6281600000005', tipe: 'Diesel 3 ton', sn: 'CONTOH-001', servis_terakhir: new Date(Date.now() - 85 * 864e5).toISOString().slice(0, 10), interval_hari: 90 }));
await simpan('jobs', r({ id: 'job-contoh-1', pelanggan: 'Contoh PT Logistik Timur', teknisi: 'Andi', kejadian: { spk_cek: jam(40), selesai_cek: jam(30) } }));
await simpan('jobs', r({ id: 'job-contoh-2', pelanggan: 'Contoh PT Pangan Jaya', teknisi: 'Budi', kejadian: { spk_cek: jam(100), selesai_cek: jam(96), input_cek: jam(90) } }));

await buatAksi({ unit: 'adyaspace', jenis: 'wa_balas', intent: 'tanya_harga', sumber: 'cs-draft', risiko: 'tinggi', eskalasi: 'Intent "tanya_harga" wajib dilihat manusia',
  isi: 'Halo Kak Rina, bisa. Virtual Office kami Rp2.500.000 per tahun dan langsung bisa untuk NIB. Usahanya di bidang apa, Kak?',
  tujuan: { wa: '6281200000001', nama: 'Contoh Rina', lead: 'lead-contoh-1' }, ringkas: 'Balas Contoh Rina: tanya harga', alasan: 'Contoh draf dengan harga salah: pemeriksa memblokirnya' });
await buatAksi({ unit: 'piramid-forklift', jenis: 'wa_balas', intent: 'darurat_unit', urgen: true, sumber: 'cs-draft', risiko: 'tinggi', eskalasi: 'Intent "darurat_unit" wajib dilihat manusia',
  isi: 'Baik Pak Joko, kami teruskan ke tim teknis sekarang. Mohon kirim lokasi unit, tipe forklift, dan foto panel atau bagian yang bermasalah.',
  tujuan: { wa: '6281300000002', nama: 'Contoh Pak Joko', lead: 'lead-contoh-2' }, ringkas: 'Balas Contoh Pak Joko: unit darurat' });
const radar = await jalankanRadar();

// Tim AI contoh: satu proyek berjalan dan satu rencana menunggu persetujuan
await daftarAgen();
const now = iso();
await simpan('proyek', r({ id: 'proyek-contoh-1', judul: 'Contoh: follow-up calon klien VO', tujuan: 'Follow-up calon klien virtual office yang belum membalas minggu ini', status: 'berjalan', batas_usd: 2, terpakai_usd: 0.0213, token: 9800, rencana_ringkas: 'Laras menyusun pesan, Galih memeriksa, Wulan merekap hasil.' }));
await simpan('proyek', r({ id: 'proyek-contoh-2', judul: 'Contoh: konten Desember Piramid', tujuan: 'Siapkan 6 ide konten edukasi sewa forklift untuk Desember', status: 'menunggu_rencana', batas_usd: 1, terpakai_usd: 0.0061, token: 2100, rencana_ringkas: 'Kirana menulis ide, Galih memeriksa klaim.' }));
const tg = (o) => simpan('tugas', r({ urutan: 1, percobaan: 1, biaya_usd: 0.004, ...o }));
await tg({ id: 'tugas-contoh-1', proyek: 'proyek-contoh-1', agen: 'cs-adya', judul: 'Susun follow-up calon klien VO', instruksi: 'Buat pesan follow-up untuk lead yang menanyakan virtual office.', status: 'review', selesai_dikerjakan: now,
  hasil: { ringkasan: 'Dua pesan follow-up siap ditinjau.', md: '## Pesan follow-up\n- **Contoh Rina**: menindaklanjuti pertanyaan VO untuk NIB, menyebut harga mulai Rp3.000.000 per tahun.\n- **Contoh Dimas**: menanyakan kebutuhan legalitas.\n\n## Catatan\nJam operasional belum ada di FAQ.', butuh: ['Jam operasional kantor untuk dicantumkan di pesan'], pesan_wa: [] } });
await tg({ id: 'tugas-contoh-2', proyek: 'proyek-contoh-1', agen: 'qa', urutan: 2, judul: 'Periksa pesan follow-up', instruksi: 'Periksa pesan dari Laras terhadap harga resmi dan klaim terlarang.', status: 'antre', biaya_usd: 0 });
await tg({ id: 'tugas-contoh-3', proyek: null, agen: 'analis', judul: 'Rekap omzet klien November', instruksi: 'Analisis CSV omzet yang ditempel.', status: 'berjalan', mulai: now, biaya_usd: 0 });
await tg({ id: 'tugas-contoh-4', proyek: null, agen: 'kepatuhan', judul: 'Checklist dokumen SPT Masa', instruksi: 'Susun checklist dokumen SPT Masa PPN untuk klien PKP.', status: 'selesai', hasil: { ringkasan: 'Checklist 8 dokumen.', md: '1. Faktur keluaran\n2. Faktur masukan\n3. Rekap penjualan', butuh: [], pesan_wa: [] } });
await tg({ id: 'tugas-contoh-5', proyek: null, agen: 'teknisi', judul: 'Ringkas job servis terlambat', instruksi: 'Ringkas job servis yang melewati SLA 5P dan usulkan tindak lanjut.', status: 'review', selesai_dikerjakan: now,
  hasil: { ringkasan: '2 job melewati SLA; Andi perlu input hasil pengecekan hari ini.', md: '## Job terlambat\n- Contoh PT Logistik Timur (Andi): input pengecekan lewat 6 jam\n- Contoh PT Pangan Jaya (Budi): keputusan analisa lewat 18 jam', butuh: [], pesan_wa: [] } });
for (const [i, [agen, judul]] of [['konten', 'Tulis 6 ide konten sewa forklift'], ['qa', 'Periksa klaim dan nada']].entries())
  await tg({ id: 'tugas-contoh-r' + i, proyek: 'proyek-contoh-2', agen, urutan: i + 1, judul, instruksi: judul + '.', status: 'rencana', biaya_usd: 0 });

const port = +(process.env.DASHBOARD_PORT || 4747);
http.createServer(handler).listen(port, '127.0.0.1', () => {
  console.log(`Data contoh dibuat (${radar.length} usulan dari radar).`);
  console.log(`Buka http://127.0.0.1:${port}  ->  nama bebas, PIN: contoh-1234`);
  console.log('Ini hanya contoh. Data asli ada di Supabase / dashboard online.');
});
