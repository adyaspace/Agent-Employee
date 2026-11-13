---
name: konten-workflow
description: Menjalankan alur konten dari riset sampai siap tayang untuk Piramid Forklift dan Adyaspace. Gunakan saat diminta riset konten, membuat konten mingguan, menyiapkan jadwal posting, mengecek status antrean, atau membuat laporan konten.
---
# Alur konten: riset, tulis, periksa, jadwal, setujui, tayang

Kamu (sesi utama) adalah orkestrator. Subagent tidak bisa memanggil subagent lain dan tidak bisa bertanya ke manusia, jadi kamu yang mengatur urutan dan menghentikan alur bila perlu.

## Status item (disimpan di `content/queue/*.json`)
`ide` > `draf` > (`revisi` <> `draf`) > `menunggu_persetujuan` > `terjadwal` > `tayang` | `gagal` | `ditolak`
Hanya manusia yang memindahkan `menunggu_persetujuan` ke `terjadwal`. Hanya cron/skrip `publish.mjs --live` yang membuat `tayang`.

## Mode (tanya satu kalimat bila pengguna tidak menyebutkan)
- `status`: `node scripts/kq.mjs list`, ringkas per status dan sebutkan yang macet.
- `riset`: langkah 1 sampai 2.
- `mingguan`: langkah 0 sampai 6 untuk brand yang diminta (bawaan: keduanya).
- `jadwal`: langkah 5 sampai 6 saja.
- `laporan`: langkah 7.

## Langkah
0. Cek profil `brands/<brand>.md`. Bila bagian Layanan atau Data resmi masih memuat ISI, berhenti dan minta pengguna melengkapinya. Jangan menulis konten dengan data karangan.
1. Riset: panggil `riset-tren` sekali per brand (boleh paralel).
2. Tinjau hasil riset secara singkat. Ide yang tidak cocok dengan profil brand dibiarkan berstatus ide dan disebutkan di laporan; jangan dihapus.
3. Tulis: panggil `penulis-konten` per brand sampai tidak ada item `ide`.
4. Periksa: panggil `penjaga-mutu`. Item `revisi` kembali ke `penulis-konten` lalu `penjaga-mutu` lagi. Maksimal 2 putaran, sisanya laporkan ke pengguna.
5. Jadwal: panggil `penerbit` untuk usulan jadwal, kelengkapan, dan paket persetujuan.
6. Serahkan ke manusia dan BERHENTI. Tampilkan lokasi `content/persetujuan/<tanggal>.md`, jumlah item per brand, item yang belum punya gambar, dan perintah approve. Jangan menjalankan `approve`, `reject`, `revise`, `posted`, `retry`, atau `publish.mjs --live`.
7. Laporan: panggil `analis`.

## Eksekusi tayang (di luar sesi Claude)
Cron di VPS menjalankan `deploy/cron-publish.sh` tiap 10 menit. Skrip hanya menayangkan item `terjadwal` yang sudah disetujui manusia, lolos QA, dan jadwalnya sudah lewat. Gagal tayang tercatat di item dan di `logs/publish.log`.

## Format laporan ke pengguna
Singkat: berapa item per status, apa yang butuh keputusan manusia sekarang, apa yang diblokir dan kenapa.
