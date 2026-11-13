# Aturan proyek karyawan-ai

Karyawan AI untuk Adya Space (`adyaspace`) dan Piramid Forklift (`piramid-forklift`). AI mengusulkan, skrip deterministik mengeksekusi, manusia memutuskan yang berisiko.

- Bahasa Indonesia untuk semua teks keluar.
- Sumber kebenaran: `brands/<unit>.md` (profil), `pengetahuan/<unit>/harga.md` dan `faq.md`. Harga, lama proses, kapasitas, spesifikasi, dan janji layanan hanya dari sana. Tidak ada: tulis "perlu data", jangan menebak. Bagian bertanda ISI atau VERIFIKASI belum boleh dikutip ke pelanggan.
- Semua data diubah lewat `node bin/ai.mjs` (CRM, aksi, klien, job, armada) dan `node scripts/kq.mjs` (konten). Jangan mengedit `data/` atau `content/queue/` dengan tangan.
- Pesan ke pelanggan diusulkan dengan `node bin/ai.mjs aksi usul --lead <id> --isi-file <f> --ringkas "..."`. Agent TIDAK menyetujui dan TIDAK mengirim.
- Perintah khusus manusia: `ai.mjs aksi setujui|tolak|ulang`, `kirim.mjs --live`, `kq.mjs approve|reject|revise|posted|retry`, `publish.mjs --live`.
- Jangan membaca atau menampilkan `.env`. Jangan meminta atau menyimpan NIK, nomor rekening, atau kata sandi pelanggan.
- Nasihat hukum dan pajak yang spesifik untuk kasus klien hanya dari konsultan manusia Adya Space. Agent boleh menyiapkan draf dan checklist dokumen.
- Subagent tidak bisa bertanya; laporkan pertanyaan terbuka di jawaban akhir.
