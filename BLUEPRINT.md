# Blueprint: satu pemilik, satu karyawan AI

Untuk Adya Space (konsultan legalitas dan pajak) dan Piramid Forklift (jual, sewa, servis forklift). Disusun 13 November 2026.

## Kesimpulan yang perlu diterima dulu

1. "Karyawan AI" yang bekerja penuh sendiri untuk dua bisnis ini tidak realistis dan tidak aman. Yang realistis: satu orang pemilik/admin ditambah AI yang mengerjakan 60-80% pekerjaan administratif berulang, sementara manusia memutuskan hal yang berisiko (harga, janji, nasihat hukum/pajak, keluhan). Angka 60-80% adalah perkiraan, belum diukur.
2. Sebagian besar "kerja karyawan" di sini bukan pekerjaan LLM. Pengingat pajak, follow-up, SLA teknisi, dan jadwal servis adalah aturan tanggal. Skrip biasa mengerjakannya lebih murah, lebih cepat, dan tidak berhalusinasi. LLM hanya dipakai di tempat yang butuh bahasa: membaca chat pelanggan dan menyusun balasan, penawaran, dan konten.
3. Penghambat terbesar bukan teknologi, tapi data. `pengetahuan/*/harga.md` dan `faq.md` masih banyak bertanda ISI. Tanpa itu, CS AI hanya bisa mengumpulkan kebutuhan lalu meneruskan ke manusia.

## Fakta yang membentuk desain

| Fakta | Dampak ke desain | Sumber |
|---|---|---|
| Sejak 15 Jan 2026 Meta melarang chatbot AI serba-guna di WhatsApp Business API; bot untuk fungsi bisnis spesifik (CS, penjualan, notifikasi) tetap boleh. | CS dibatasi ke urusan bisnis; pertanyaan di luar itu ditolak sopan. | [respond.io](https://respond.io/blog/whatsapp-ai-chatbot-policy), [TechRadar](https://techradar.com/ai-platforms-assistants/meta-will-ban-rival-ai-chatbots-from-whatsapp) |
| Mulai 1 Okt 2026 pesan service di Indonesia ditarik biaya Rp356,65 per pesan; marketing sekitar Rp586-667; utility Rp356,65; ditambah PPN 11%. | Setiap balasan berbiaya. Follow-up memakai template marketing, pengingat memakai utility. Batas harian di `WA_MAX_PER_DAY`. | [Qontak](https://help-center.qontak.com/hc/en-us/articles/48430892733465-Latest-WhatsApp-Message-Prices-October-2026), [ChatMaxima](https://chatmaxima.com/whatsapp-api-pricing/indonesia/) |
| Teks bebas hanya boleh dalam 24 jam sejak pesan terakhir pelanggan; di luar itu wajib template yang disetujui Meta. | Executor memilih teks atau template otomatis; aksi tanpa template di luar jendela gagal dengan alasan jelas. | Dokumentasi Meta |
| PMK 81/2024: setor PPh masa tanggal 15 bulan berikutnya; lapor SPT Masa PPh paling lama 20 hari setelah masa berakhir; PPN akhir bulan berikutnya. Libur digeser ke hari kerja berikutnya. | Kalender kepatuhan klien di `lib/kalender.mjs`. | [Ortax](https://ortax.org/subjek-pilihan/9/batas-waktu-setor-dan-lapor-pph-unifikasi), [Klikpajak](https://klikpajak.id/blog/kalender-kepatuhan-pajak/) |
| Perka BKPM 5/2025: LKPM paling lambat tanggal 15; usaha kecil per semester, menengah dan besar per triwulan. | Pengingat LKPM per skala usaha klien. | [Jurnal.id](https://www.jurnal.id/id/blog/pelaporan-lkpm-dan-pentingnya-dalam-akuntansi/), [Smartlegal](https://smartlegal.id/?p=22889) |
| UU PDP 27/2022: pemrosesan data pribadi butuh dasar yang sah, termasuk persetujuan; subjek data berhak menarik persetujuan. | Lead mencatat dasar persetujuan; kata BERHENTI menghentikan follow-up; CS dilarang meminta data sensitif. | [Hukumonline](https://www.hukumonline.com/berita/a/pentingnya-kesadaran-perlindungan-data-pribadi-bagi-korporasi-lt68e0888c2b809?page=all) |

## Inventaris pekerjaan dan siapa mengerjakan

Tingkat: **Otomatis** (skrip, tanpa persetujuan), **Usul-setuju** (AI menyusun, manusia satu klik), **Manusia** (AI hanya menyiapkan bahan).

### Adya Space
| Pekerjaan | Tingkat | Modul |
|---|---|---|
| Membalas sapaan, alamat, jam, daftar layanan | Usul-setuju, lalu Otomatis setelah AUTOPILOT=1 | `cs-draft.mjs` |
| Menjawab harga, kelayakan VO untuk NIB, lama proses | Usul-setuju (selalu dilihat manusia) | `cs-draft.mjs` |
| Pengingat setor/lapor pajak, PPN, LKPM, SPT Tahunan, perpanjangan VO ke klien | Usul-setuju, bisa Otomatis (template utility) | `radar.mjs` |
| Follow-up calon klien yang diam 2/5/10 hari | Usul-setuju | `radar.mjs` |
| Draf penawaran paket | Usul-setuju | agent `penyusun-penawaran` |
| Konten Instagram, Threads, Facebook | Usul-setuju | skill `konten-workflow` |
| Nasihat pajak/hukum spesifik, pengisian Coretax/OSS, akta | Manusia | - |

### Piramid Forklift
| Pekerjaan | Tingkat | Modul |
|---|---|---|
| Menerima chat, mengumpulkan kebutuhan unit (barang, tinggi angkat, lokasi, durasi) | Usul-setuju | `cs-draft.mjs` |
| Laporan unit mogok/darurat | Manusia, ditandai Urgen di dashboard | `cs-draft.mjs` |
| Pemantauan SLA 5P: input pengecekan 1 hari, analisa 3 hari, input pengerjaan 1 hari | Otomatis (alarm) | `lib/sla.mjs`, `ai.mjs job` |
| Pengingat servis berkala ke pelanggan | Usul-setuju, bisa Otomatis | `radar.mjs` |
| Penawaran sewa/jual (harga dari sales) | Usul-setuju, kolom harga diisi sales | agent `penyusun-penawaran` |
| Diagnosis teknis, harga, negosiasi | Manusia | - |

## Arsitektur

```
WhatsApp pelanggan -> webhook.mjs -> data/leads + data/percakapan
                                   -> cs-draft.mjs (Claude API) -> data/aksi (usulan)
cron 06.47 radar.mjs (aturan tanggal, tanpa AI)   -> data/aksi (usulan)
Claude Code: penyusun-penawaran, konten-workflow   -> data/aksi, content/queue
                       |
            Meja Keputusan (dashboard, PIN) atau CLI: setujui / edit / tolak
                       |
cron tiap 2 menit kirim.mjs (tanpa AI) -> WhatsApp Cloud API
cron tiap 10 menit publish.mjs (tanpa AI) -> Threads, Instagram, Facebook
```

Prinsip yang tidak boleh dilanggar saat mengembangkan:
1. AI tidak pernah memegang tombol kirim. Eksekusi hanya oleh skrip deterministik.
2. Pemeriksa otomatis lebih dipercaya daripada model: angka rupiah yang tidak ada di `harga.md` dan klaim terlarang memblokir aksi, apa pun penilaian risiko dari model.
3. Autopilot menyala per jenis dan per intent, bukan sekaligus.
4. Setiap usulan punya kunci unik. Menjalankan ulang tidak menggandakan pesan; kirim yang terputus tidak diulang otomatis.

## Biaya bulanan (perkiraan kasar, belum diukur)

| Pos | Asumsi | Perkiraan |
|---|---|---|
| WhatsApp service | 1.000 balasan x Rp356,65 | Rp357 ribu |
| WhatsApp utility | 300 pengingat x Rp356,65 | Rp107 ribu |
| WhatsApp marketing | 200 follow-up x ±Rp650 | Rp130 ribu |
| PPN 11% atas WA | | ±Rp65 ribu |
| Claude API (CS) | 1.000 draf x ±6.000 token masuk | Cek harga model di docs.claude.com; prompt caching memangkas biaya bagian pengetahuan yang berulang |
| VPS kecil | 1 vCPU, 1-2 GB | ±Rp100-200 ribu |

Bandingkan dengan satu admin CS penuh waktu di Jakarta (UMP DKI 2026 di atas Rp5 juta). Penghematan nyata baru terlihat setelah 1-2 bulan data `aksi` menunjukkan berapa persen draf disetujui tanpa edit.

## Peta jalan

| Minggu | Target | Ukuran berhasil |
|---|---|---|
| 1 | Isi semua ISI/VERIFIKASI di `brands/` dan `pengetahuan/`. Daftarkan klien kepatuhan dan unit armada. Jalankan dashboard + radar secara lokal. | Radar menghasilkan pengingat yang benar untuk 3 klien uji |
| 2 | Aplikasi Meta, nomor WA bisnis, 4 template disetujui, webhook di VPS. CS draf-saja. | 100% chat masuk punya draf dalam 1 menit |
| 3-4 | Pantau draf. Catat alasan setiap edit ke FAQ. | Persentase draf disetujui tanpa edit naik di atas 70% |
| 5 | Nyalakan AUTOPILOT untuk salam, alamat/jam, layanan, dan pengingat utility. | Nol keluhan dari pesan otomatis |
| 6+ | Integrasi APPS Piramid untuk mengisi job 5P otomatis; ambil performa konten ke `content/performa.json`. | Teknisi tidak perlu mencatat dua kali |

## Yang belum dibangun (dan alasannya)
- Integrasi APPS Piramid: belum ada API atau ekspor yang diketahui. Sementara job dicatat lewat CLI.
- Integrasi Coretax/OSS: tidak ada API publik untuk pihak ketiga; otomasi peramban di portal pemerintah berisiko akun klien dikunci.
- Pengiriman penawaran sebagai PDF lewat WA: perlu unggah media WA; ditunda sampai format penawaran baku disepakati.
- Pembayaran dan penagihan: di luar cakupan versi ini.
