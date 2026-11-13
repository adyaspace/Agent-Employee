# karyawan-ai

Karyawan AI untuk Adya Space dan Piramid Forklift: CS WhatsApp, follow-up lead, pengingat pajak/LKPM/VO klien, pengingat servis unit, pemantau SLA 5P teknisi, penawaran, konten, dan briefing pagi. AI mengusulkan, skrip mengeksekusi, Anda memutuskan di satu layar.

Latar dan riset: [BLUEPRINT.md](BLUEPRINT.md).

## Isi
| Bagian | Fungsi | Pakai AI? |
|---|---|---|
| `bin/webhook.mjs` | Menerima chat WA, membuat/memperbarui lead | Tidak |
| `bin/cs-draft.mjs` | Menyusun draf balasan WA dari profil, FAQ, dan harga resmi | Ya (Claude API) |
| `bin/radar.mjs` | Follow-up, pengingat kepatuhan klien, pengingat servis | Tidak |
| `bin/kirim.mjs` | Mengirim aksi yang disetujui lewat WhatsApp Cloud API | Tidak |
| `bin/dashboard.mjs` | Meja Keputusan: setujui, edit, tolak | Tidak |
| `bin/briefing.mjs` | Ringkasan pagi | Tidak |
| `bin/ai.mjs` | CLI data: aksi, lead, klien, job 5P, armada | Tidak |
| `.claude/` | Subagent `penyusun-penawaran`, alur konten, skill `karyawan-harian` | Ya (Claude Code) |
| `scripts/` | Antrean dan penerbit konten (dari konten-agent) | Tidak |

## Tim AI dan Kantor 3D
Dashboard punya empat tab:
| Tab | Fungsi |
|---|---|
| Meja Keputusan | Pesan WA, konten, dan hasil kerja agent yang menunggu persetujuan Anda |
| Kantor 3D | Seluruh tim sebagai avatar. Agent bekerja di meja, yang santai duduk di lounge, penanda kuning = hasil menunggu tinjauan. Klik avatar: Beri tugas, Tanya progres, Lihat hasil |
| Tim & Tugas | Proyek baru (Kepala Staf memecah tujuan menjadi tugas), papan tugas, roster agent (tambah, ubah model, data yang boleh dibaca) |
| Kepala Staf | Chat untuk pertanyaan dan instruksi bebas; bisa mengusulkan proyek |

Tiga fitur yang lazim di platform AI employee lain:
- **Kepercayaan 30 hari** (sidebar Meja Keputusan): persen usulan yang disetujui tanpa edit, per jenis pesan/intent dan per agent. Jadi dasar menyalakan autopilot per jenis (minimal 70% dari 20 keputusan).
- **Memori agent** (Tim & Tugas > Ubah): catatan tetap yang dibaca agent di setiap tugas. Saat meminta revisi, pilih OK di pertanyaan "Ingat catatan ini" agar catatannya masuk memori.
- **Rutinitas terjadwal** (Tim & Tugas > Ubah): satu baris per rutinitas, `senin,kamis 07:00 | Judul | Instruksi` atau `setiap hari 16:00 | ...`. Cron membuat tugasnya sekali per hari pada jam itu (06:00-21:50 WIB); hasilnya tetap masuk Meja Keputusan.

Alur: tujuan → rencana Kepala Staf → Anda setujui → agent bekerja berurutan → hasil ditinjau (setujui / minta revisi / tolak). Pesan WA yang diusulkan agent masuk Meja Keputusan, tidak pernah terkirim tanpa persetujuan.

Biaya: tarif per model ada di `aturan/tim.json` (Sonnet 5.5 $2/$10, Haiku 5.5 $0,10/$0,50 per juta token, per Nov 2026). Setiap proyek punya anggaran; tugas berhenti (tertahan) saat anggaran atau batas harian `batas_harian_usd` tercapai.

## Lihat contoh dulu (1 perintah)
```powershell
npm install
npm run contoh
```
Buka http://127.0.0.1:4747, isi nama bebas, PIN `contoh-1234`. Isinya data CONTOH di folder `data-contoh/`, terpisah dari data asli, tanpa kirim WA.

## Dashboard online error "Supabase 401 / Invalid API key"
Kunci Supabase di Vercel salah. Jalankan `powershell -ExecutionPolicy Bypass -File deploy\perbaiki-kunci.ps1`: kunci diuji ke Supabase dulu (menolak kunci anon, publishable, atau dari project lain), baru disimpan dan redeploy.

## Mulai di laptop (tanpa akun Meta dulu)
1. Node 18 atau lebih baru. `npm test` harus lulus semua (memakai server tiruan).
2. Lengkapi semua ISI dan VERIFIKASI di `brands/*.md` dan `pengetahuan/*/`. Ini penentu mutu nomor satu.
3. `copy .env.example .env` (Windows) lalu isi minimal `DASHBOARD_PIN`.
4. Daftarkan data nyata:
   ```bash
   node bin/ai.mjs klien baru --nama "PT ..." --wa 0812... --jenis badan --skala kecil --pkp ya --layanan pph_masa,ppn,lkpm,spt_tahunan --vo-berakhir 2027-03-31
   node bin/ai.mjs armada baru --pelanggan "PT ..." --wa 0813... --tipe "Diesel 3 ton" --sn ... --servis-terakhir 2026-10-01 --interval-hari 90
   node bin/ai.mjs job baru --pelanggan "PT ..." --teknisi Andi --spk SPK-001
   node bin/ai.mjs job catat <job-id> selesai_cek
   ```
   Interval servis tidak punya nilai bawaan: isi sesuai buku manual unit atau kontrak.
5. `node bin/radar.mjs` lalu `node bin/dashboard.mjs` dan buka http://127.0.0.1:4747.

## Online: Vercel + Supabase (yang dipakai sekarang)
Data tersimpan di tabel `karyawan_rekaman` pada project Supabase **Adyaspace** (RLS aktif, hanya bisa diakses server). Harga Adya Space dibaca langsung dari tabel `pricing_packages` milik website.

Deploy pertama, dari PowerShell di folder ini:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\setup-vercel.ps1
```
Skrip membuat project Vercel `karyawan-ai`, mengisi rahasia (dibuat di laptop Anda), meminta `service_role` key Supabase dan `ANTHROPIC_API_KEY`, lalu deploy. PIN dashboard dicetak di akhir.

Yang berjalan online:
| Path | Fungsi |
|---|---|
| `/` | Meja Keputusan (login nama + PIN 6 digit, tetap masuk 30 hari per perangkat; ganti PIN = semua perangkat keluar) |
| `/webhook` | Callback URL WhatsApp Cloud API |
| `/api/cron` | Tiap 10 menit, 06.00-21.59 WIB (paket Pro): radar, draf CS yang tertunda, kirim yang disetujui, antrean tugas agent, briefing. Aman diulang: usulan berkunci unik, kirim tidak dobel |

Menyetujui di dashboard langsung mengirim pesan bila `KARYAWAN_LIVE=1`; tanpa itu hanya simulasi. CLI di laptop (`node bin/ai.mjs ...`) memakai data online yang sama bila `.env` berisi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.

## Sambungkan WhatsApp
1. Buat aplikasi di Meta for Developers, tambahkan produk WhatsApp, daftarkan nomor bisnis, buat System User token permanen.
2. Ajukan 4 template di WhatsApp Manager sesuai `templates/*.json` (nama, kategori, urutan parameter `{{1}}`, `{{2}}`, ...). Executor gagal dengan jelas bila template belum disetujui.
3. Isi bagian WhatsApp dan `ANTHROPIC_API_KEY` di `.env`.
4. Tambahkan di Vercel (Settings > Environment Variables): `WA_PHONE_ID_ADYASPACE`, `WA_TOKEN_ADYASPACE`, `WA_PHONE_ID_PIRAMID_FORKLIFT`, `WA_TOKEN_PIRAMID_FORKLIFT`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` (string acak buatan Anda). Redeploy.
5. Di Meta App Dashboard: Callback URL `https://<domain-vercel>/webhook`, Verify token = `WA_VERIFY_TOKEN`, langganan field `messages`.
6. Setelah uji kirim ke nomor sendiri berhasil, set `KARYAWAN_LIVE=1`. Dua minggu kemudian, pertimbangkan `AUTOPILOT=1`.
Alternatif tanpa Vercel: VPS dengan `node bin/dashboard.mjs` di balik HTTPS + cron dari `deploy/crontab.example`.

## Harian
- Pagi: buka dashboard, putuskan item urgen dulu. Atau di Claude Code: "jalankan rutinitas pagi".
- Teknisi selesai cek atau kerja: catat dengan `ai.mjs job catat`. Dashboard menyala merah bila SLA 5P lewat.
- Konten: "jalankan alur konten mingguan" (lihat skill `konten-workflow`).

## Lapisan pengaman
1. Aksi keluar butuh persetujuan manusia, kecuali kebijakan autopilot di `aturan/kebijakan.json` DAN `AUTOPILOT=1`.
2. Pemeriksa otomatis memblokir angka rupiah yang tidak ada di `harga.md` dan klaim terlarang dari profil brand, termasuk saat kirim.
3. Intent harga, penawaran, keluhan, darurat, dan status order selalu ke manusia.
4. `kirim.mjs` bawaannya dry-run; kirim sungguhan butuh `--live` dan `KARYAWAN_LIVE=1`. Batas harian per unit. Kirim yang terputus tidak diulang otomatis.
5. Webhook memverifikasi tanda tangan Meta. Dashboard butuh PIN dan nama penyetuju; semua keputusan tercatat di riwayat aksi.
6. Ini lapisan pengaman, bukan sandbox. Jalankan di server dan akun khusus proyek ini.

## Batasan
- Mode lokal tanpa Supabase menyimpan file JSON di `data/` (untuk uji). Online selalu Supabase.
- Belum terhubung ke APPS Piramid, Coretax, atau OSS (lihat BLUEPRINT).
- Agent Claude Code belum diuji di sesi sungguhan; yang teruji otomatis adalah skrip (`npm test`, 45 + 17 uji, termasuk backend Supabase tiruan).
- Cron butuh paket Vercel Pro (Hobby hanya sekali sehari). Pesan yang disetujui di dashboard tetap dikirim saat itu juga.
- Deploy hanya dari folder `karyawan-ai` (atau lewat push ke `main`). Deploy dari folder lain mengunggah file yang salah dan situs menjadi 404.
- Antrean konten (`scripts/`, `content/`) tetap berjalan di laptop; dashboard online belum menampilkannya.
- Kalender libur nasional belum terisi: lengkapi `aturan/libur.json`.
