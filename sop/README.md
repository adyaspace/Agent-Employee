# SOP agent

SOP = cara kerja baku yang sudah terbukti, ditulis sebagai file Markdown. Agent membacanya sebelum mengerjakan tugas, jadi tidak berimprovisasi dari nol.

- `sop/umum/*.md` dibaca semua agent.
- `sop/<id-agent>/*.md` hanya dibaca agent itu. Id agent: `kepala-staf`, `cs-adya`, `cs-piramid`, `sales`, `kepatuhan`, `teknisi`, `konten`, `analis`, `qa` (lihat Tim & Tugas).
- Total SOP per agent dipotong di 8.000 karakter: tulis ringkas, satu file satu prosedur.
- Setiap kali agent salah atau Anda menemukan cara kerja yang bagus, jadikan SOP baru lalu push ke `main` (Vercel deploy otomatis).
- Catatan pendek yang sering berubah lebih cocok di Memori agent (dashboard), bukan di sini.
- SOP tidak boleh berisi harga, lama proses, atau janji layanan: itu tetap hanya dari `pengetahuan/` dan `brands/`.

Contoh nama file: `sop/kepatuhan/rekap-tenggat.md`, `sop/sales/penawaran-sewa-forklift.md`, `sop/cs-adya/checklist-dokumen-pt.md`.

File README ini sendiri tidak dibaca agent.
