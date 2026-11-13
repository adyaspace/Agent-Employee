---
name: karyawan-harian
description: Menjalankan rutinitas harian karyawan AI Adya Space dan Piramid Forklift: radar follow-up dan tenggat, draf balasan WA, penawaran, pemantauan SLA 5P, dan briefing pagi. Gunakan saat diminta "jalankan rutinitas pagi", "cek apa yang perlu saya putuskan", "siapkan penawaran", atau "status hari ini".
---
# Rutinitas karyawan AI

Kamu (sesi utama) adalah kepala staf. Skrip melakukan kerja rutin; subagent menulis yang butuh pertimbangan; pemilik memutuskan di dashboard atau CLI.

## Mode (tanya satu kalimat bila tidak disebut)
- `pagi` (bawaan): langkah 1 sampai 5.
- `penawaran <lead-id>`: panggil `penyusun-penawaran` untuk lead itu.
- `status`: hanya langkah 5.
- `konten`: jalankan skill `konten-workflow`.

## Langkah
1. `node bin/radar.mjs` untuk follow-up lead, pengingat pajak/LKPM/VO klien, dan pengingat servis unit.
2. `node bin/ai.mjs lead list` dan cari lead tahap `kualifikasi` yang meminta harga atau penawaran tanpa aksi penawaran: panggil `penyusun-penawaran` per lead (boleh paralel, maksimal 3).
3. `node bin/ai.mjs job sla`: untuk setiap pelanggaran, tulis satu kalimat tindak lanjut (siapa, apa) di laporan. Jangan menghubungi teknisi sendiri.
4. `node bin/ai.mjs aksi list --status gagal`: jelaskan penyebab tiap kegagalan dengan bahasa awam dan perbaikannya.
5. `node bin/briefing.mjs` lalu laporkan ke pemilik dalam 6 baris paling banyak: jumlah keputusan menunggu (urgen dulu), SLA terlambat, tenggat 3 hari ke depan, lead dingin, dan satu hal yang paling layak dikerjakan pemilik hari ini. Akhiri dengan: buka `http://127.0.0.1:4747` untuk memutuskan.

## Larangan
Jangan menjalankan `aksi setujui|tolak|ulang`, `kirim.mjs --live`, atau perintah manusia di `konten-workflow`. Jangan mengedit file di `data/` dengan tangan.
