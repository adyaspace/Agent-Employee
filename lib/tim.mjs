// Tim AI: roster agent, proyek, tugas, Kepala Staf (perencana + chat), batas biaya.
// Alur: pemilik memberi tujuan -> Kepala Staf menyusun rencana (status "rencana") -> pemilik menyetujui
// -> tugas dijalankan satu per satu oleh agent -> hasil masuk "review" -> pemilik setujui / minta revisi / tolak.
import { semua, ambil, muat, simpan, idBaru, iso, hari, baca, die, Galat, UNITS } from './core.mjs';
import { tanya, jsonDari } from './llm.mjs';
import { hargaResmi } from './harga.mjs';
import { buatAksi } from './aksi.mjs';
import { kewajibanKlien, servisUnit } from './kalender.mjs';
import { pelanggaranSLA, TAHAP_5P } from './sla.mjs';

const CFG = () => { try { return JSON.parse(baca('aturan/tim.json') || '{}'); } catch { return {}; } };
const NAMA_UNIT = { adyaspace: 'Adya Space', 'piramid-forklift': 'Piramid Forklift', umum: 'Adya Space dan Piramid Forklift' };
const potong = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
const catatT = (t, ke, oleh, note = '') => { (t.riwayat ||= []).push({ at: iso(), dari: t.status || null, ke, oleh, note }); t.status = ke; };

// ---------- roster ----------
export async function daftarAgen() {
  let a = await semua('agen');
  if (!a.length) { // pertama kali: isi dari aturan/tim.json
    for (const x of CFG().agen || []) await simpan('agen', { ...x, aktif: true, dibuat: iso() });
    a = await semua('agen');
  }
  return a.sort((x, y) => (x.id === 'kepala-staf' ? -1 : y.id === 'kepala-staf' ? 1 : x.nama.localeCompare(y.nama)));
}
export async function simpanAgen(d, by) {
  const id = d.id || ('agen-' + String(d.nama || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 40);
  const lama = await ambil('agen', id);
  const tarif = CFG().harga_per_juta_token_usd || {};
  if (d.model && !tarif[d.model]) die('Model tidak dikenal: ' + d.model);
  const a = { konteks: ['brand'], boleh_wa: false, warna: '#4a4f5c', model: 'claude-haiku-5-5', unit: 'umum', aktif: true, ...lama, ...d, id };
  if (!a.nama || !a.peran) die('Nama dan peran wajib diisi');
  if (![...UNITS, 'umum'].includes(a.unit)) die('Unit tidak sah');
  a.diubah_oleh = by;
  return simpan('agen', a);
}

// ---------- konteks per agent ----------
async function konteks(agen) {
  const K = agen.konteks || [], unitList = agen.unit === 'umum' ? UNITS : [agen.unit], bagian = [];
  if (K.includes('brand')) for (const u of unitList) bagian.push(`## Profil ${NAMA_UNIT[u]}\n${potong(baca(`brands/${u}.md`), 4000)}\n${potong(baca(`pengetahuan/${u}/faq.md`), 1500)}`);
  if (K.includes('harga')) for (const u of unitList) bagian.push(`## Harga resmi ${NAMA_UNIT[u]}\n${potong(await hargaResmi(u), 5000)}`);
  if (K.includes('leads')) {
    const L = (await semua('leads')).filter((l) => unitList.includes(l.unit) && !['menang', 'kalah'].includes(l.tahap) && !l.optout).slice(0, 40);
    bagian.push('## Lead aktif (id | unit | nama | tahap | kebutuhan | pesan terakhir masuk | keluar)\n' + (L.map((l) => `${l.id} | ${l.unit} | ${l.nama || '-'} | ${l.tahap} | ${l.kebutuhan || '-'} | ${l.last_in ? hari(l.last_in) : '-'} | ${l.last_out ? hari(l.last_out) : '-'}`).join('\n') || 'Belum ada.'));
  }
  if (K.includes('kepatuhan')) {
    const W = (await semua('klien')).filter((k) => !k.nonaktif).flatMap((k) => kewajibanKlien(k, hari(), 30));
    bagian.push('## Kewajiban klien 30 hari ke depan\n' + (W.map((w) => `${w.jatuh_tempo} (H-${w.sisa_hari}) | ${w.nama} | ${w.label}`).join('\n') || 'Belum ada klien terdaftar.'));
  }
  if (K.includes('jobs')) {
    const J = (await semua('jobs')).filter((j) => TAHAP_5P(j) !== 'selesai'), V = (await pelanggaranSLA()).filter((x) => x.aktif);
    bagian.push('## Job servis berjalan\n' + (J.map((j) => `${j.id} | ${j.pelanggan} | teknisi ${j.teknisi || '-'} | tahap ${TAHAP_5P(j)}`).join('\n') || 'Tidak ada.')
      + '\n## Pelanggaran SLA 5P aktif\n' + (V.map((x) => `${x.pelanggan} | ${x.teknisi} | ${x.aturan} | lewat ${x.lewat_jam} jam`).join('\n') || 'Tidak ada.'));
  }
  if (K.includes('armada')) {
    const S = (await semua('armada')).map((u) => servisUnit(u)).filter(Boolean);
    bagian.push('## Jadwal servis berkala unit pelanggan\n' + (S.map((s) => `${s.jatuh_tempo} (H-${s.sisa_hari}) | ${s.pelanggan} | ${s.label}`).join('\n') || 'Belum ada unit terdaftar.'));
  }
  if (K.includes('ringkas')) bagian.push('## Kondisi saat ini\n' + await ringkasKondisi());
  return bagian.join('\n\n');
}

export async function ringkasKondisi() {
  const [aksi, leads, tugas, proyek] = await Promise.all([semua('aksi'), semua('leads'), semua('tugas'), semua('proyek')]);
  const sla = (await pelanggaranSLA()).filter((x) => x.aktif);
  const tenggat = (await semua('klien')).filter((k) => !k.nonaktif).flatMap((k) => kewajibanKlien(k, hari(), 7));
  return [
    `Tanggal ${hari()}.`,
    `Keputusan menunggu pemilik: ${aksi.filter((a) => a.status === 'usulan').length} pesan WA, ${tugas.filter((t) => t.status === 'review').length} hasil kerja agent, ${tugas.filter((t) => t.status === 'rencana').length} tugas dalam rencana.`,
    `Lead aktif: ${leads.filter((l) => !['menang', 'kalah'].includes(l.tahap)).length} (belum dibalas: ${leads.filter((l) => l.perlu_balasan).length}).`,
    `Pelanggaran SLA 5P aktif: ${sla.length}${sla.length ? ' — ' + sla.slice(0, 3).map((x) => `${x.pelanggan}/${x.teknisi}`).join(', ') : ''}.`,
    `Tenggat klien 7 hari: ${tenggat.length}${tenggat.length ? ' — ' + tenggat.slice(0, 3).map((x) => `${x.nama}: ${x.label} ${x.jatuh_tempo}`).join('; ') : ''}.`,
    `Proyek berjalan: ${proyek.filter((p) => p.status === 'berjalan').map((p) => p.judul).join('; ') || 'tidak ada'}.`,
  ].join('\n');
}

const ATURAN = `ATURAN KERAS
- Fakta bisnis (harga, layanan, alamat, jadwal, data klien) HANYA dari bagian DATA di bawah. Tidak ada di sana: tulis "perlu data: ..." di daftar butuh_dari_pemilik. Jangan menebak.
- Jangan menyebut angka rupiah yang tidak tertulis persis di DATA. Jangan menjanjikan hasil, waktu proses, atau kepastian hukum/pajak.
- Nasihat hukum dan pajak spesifik kasus hanya dari konsultan manusia. Kamu boleh menyiapkan draf, checklist, dan analisis.
- Bahasa Indonesia, jelas, langsung bisa dipakai.`;

// ---------- biaya ----------
async function biayaHariIni() {
  return (await semua('tugas')).flatMap((t) => t.biaya_log || []).filter((b) => hari(b.at) === hari()).reduce((s, b) => s + (b.usd || 0), 0)
    + (await semua('chat')).flatMap((c) => c.biaya_log || []).filter((b) => hari(b.at) === hari()).reduce((s, b) => s + (b.usd || 0), 0);
}
function catatBiaya(rec, r) {
  (rec.biaya_log ||= []).push({ at: iso(), model: r.model, usd: r.biaya_usd || 0, masuk: r.usage.input_tokens || 0, keluar: r.usage.output_tokens || 0 });
  rec.biaya_usd = +((rec.biaya_usd || 0) + (r.biaya_usd || 0)).toFixed(6);
}
async function tambahBiayaProyek(pid, r) {
  if (!pid) return;
  const p = await ambil('proyek', pid);
  if (!p) return;
  p.terpakai_usd = +((p.terpakai_usd || 0) + (r.biaya_usd || 0)).toFixed(6);
  p.token = (p.token || 0) + (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0);
  await simpan('proyek', p);
}
async function cekAnggaran(pid) {
  const C = CFG();
  if (C.batas_harian_usd && await biayaHariIni() >= C.batas_harian_usd) return `Batas biaya harian $${C.batas_harian_usd} tercapai`;
  if (pid) { const p = await ambil('proyek', pid); if (p && p.batas_usd && (p.terpakai_usd || 0) >= p.batas_usd) return `Anggaran proyek $${p.batas_usd} habis`; }
  return null;
}

// ---------- proyek dan rencana ----------
export async function buatProyek({ judul, tujuan, batas_usd }, by) {
  if (!String(tujuan || '').trim()) die('Tulis tujuan proyek');
  const p = { id: idBaru('proyek'), judul: potong(String(judul || tujuan).trim(), 90), tujuan: String(tujuan).trim(), batas_usd: +batas_usd || CFG().batas_proyek_usd_bawaan || 2,
    terpakai_usd: 0, token: 0, status: 'merencanakan', oleh: by, dibuat: iso(), riwayat: [] };
  await simpan('proyek', p);
  return rencanakan(p.id);
}
export async function rencanakan(pid) {
  const p = await muat('proyek', pid);
  const tahan = await cekAnggaran(pid);
  if (tahan) die(tahan);
  const agen = (await daftarAgen()).filter((a) => a.aktif && a.id !== 'kepala-staf');
  const ks = (await ambil('agen', 'kepala-staf')) || { model: 'claude-sonnet-5-5' };
  const system = `Kamu ${ks.nama || 'Kepala Staf'}, kepala staf AI untuk Adya Space (konsultan legalitas dan pajak, Jakarta Timur) dan Piramid Forklift (jual, sewa, servis forklift).
Tugasmu: memecah tujuan pemilik menjadi tugas konkret untuk agent yang tepat.

AGENT TERSEDIA (id | nama | peran | kemampuan)
${agen.map((a) => `${a.id} | ${a.nama} | ${a.peran} | ${a.deskripsi}`).join('\n')}

${ATURAN}
- Maksimal ${CFG().maks_tugas_per_rencana || 8} tugas. Urutkan; tugas berikutnya boleh memakai hasil tugas sebelumnya.
- Setiap instruksi harus berdiri sendiri: apa yang dikerjakan, untuk siapa, bentuk hasil yang diharapkan.
- Bila tujuan butuh data yang tidak ada, jadikan tugas pertama "kumpulkan dan daftar data yang dibutuhkan".

DATA
${await ringkasKondisi()}

KELUARAN: satu objek JSON saja:
{"ringkasan":"rencana dalam 1-2 kalimat","tugas":[{"agen":"id agent","judul":"maks 8 kata","instruksi":"..."}]}`;
  const r = await tanya({ model: ks.model, system, messages: [{ role: 'user', content: `Tujuan: ${p.tujuan}` }], max_tokens: 1800 });
  catatBiaya(p, r); await simpan('proyek', p); await tambahBiayaProyek(pid, r);
  const d = jsonDari(r.teks);
  if (!d || !Array.isArray(d.tugas) || !d.tugas.length) { const p2 = await muat('proyek', pid); p2.status = 'gagal_rencana'; await simpan('proyek', p2); throw new Galat('Kepala Staf tidak menghasilkan rencana yang bisa dibaca. Coba tulis tujuan lebih spesifik.'); }
  const ids = new Set(agen.map((a) => a.id)), out = [];
  for (const [i, x] of d.tugas.slice(0, CFG().maks_tugas_per_rencana || 8).entries()) {
    const t = { id: idBaru('tugas'), proyek: pid, agen: ids.has(x.agen) ? x.agen : 'analis', judul: potong(x.judul || 'Tugas', 80), instruksi: String(x.instruksi || '').trim(), urutan: i + 1,
      status: 'rencana', percobaan: 0, biaya_usd: 0, dibuat: iso(), riwayat: [{ at: iso(), dari: null, ke: 'rencana', oleh: 'kepala-staf', note: '' }] };
    out.push(await simpan('tugas', t));
  }
  const p3 = await muat('proyek', pid);
  p3.status = 'menunggu_rencana'; p3.rencana_ringkas = potong(d.ringkasan || '', 400);
  await simpan('proyek', p3);
  return { proyek: p3, tugas: out };
}
export async function setujuiRencana(pid, by) {
  const p = await muat('proyek', pid);
  if (p.status !== 'menunggu_rencana') die('Rencana proyek ini tidak sedang menunggu persetujuan');
  for (const t of (await semua('tugas')).filter((x) => x.proyek === pid && x.status === 'rencana')) { catatT(t, 'antre', by, 'Rencana disetujui'); await simpan('tugas', t); }
  p.status = 'berjalan'; (p.riwayat ||= []).push({ at: iso(), ke: 'berjalan', oleh: by });
  return simpan('proyek', p);
}
export async function batalProyek(pid, by) {
  const p = await muat('proyek', pid);
  for (const t of (await semua('tugas')).filter((x) => x.proyek === pid && ['rencana', 'antre', 'revisi', 'tertahan', 'gagal'].includes(x.status))) { catatT(t, 'ditolak', by, 'Proyek dibatalkan'); await simpan('tugas', t); }
  p.status = 'dibatalkan'; (p.riwayat ||= []).push({ at: iso(), ke: 'dibatalkan', oleh: by });
  return simpan('proyek', p);
}
export async function naikkanAnggaran(pid, usd, by) {
  const p = await muat('proyek', pid);
  p.batas_usd = Math.max(+usd || 0, p.terpakai_usd || 0); (p.riwayat ||= []).push({ at: iso(), ke: 'anggaran ' + p.batas_usd, oleh: by });
  for (const t of (await semua('tugas')).filter((x) => x.proyek === pid && x.status === 'tertahan')) { catatT(t, 'antre', by, 'Anggaran dinaikkan'); await simpan('tugas', t); }
  return simpan('proyek', p);
}

// ---------- tugas ----------
export async function beriTugas({ agen, judul, instruksi }, by) {
  const a = await muat('agen', agen);
  if (!a.aktif) die(`${a.nama} sedang nonaktif`);
  if (!String(instruksi || '').trim()) die('Tulis instruksi tugas');
  const t = { id: idBaru('tugas'), proyek: null, agen, judul: potong(String(judul || instruksi).trim(), 80), instruksi: String(instruksi).trim(), urutan: 1,
    status: 'antre', percobaan: 0, biaya_usd: 0, dibuat: iso(), oleh: by, riwayat: [{ at: iso(), dari: null, ke: 'antre', oleh: by, note: 'Diberikan langsung oleh pemilik' }] };
  return simpan('tugas', t);
}
export async function putuskanTugas(id, act, by, note = '') {
  const t = await muat('tugas', id);
  const izin = { setujui: ['review'], revisi: ['review'], tolak: ['review', 'rencana', 'antre', 'gagal', 'tertahan'], ulang: ['gagal', 'tertahan'] }[act];
  if (!izin) die('Keputusan tidak dikenal');
  if (!izin.includes(t.status)) die(`Tugas berstatus "${t.status}" tidak bisa di-${act}`);
  if (act === 'revisi' && !String(note).trim()) die('Tulis apa yang perlu direvisi');
  if (act === 'setujui') catatT(t, 'selesai', by, note);
  if (act === 'tolak') catatT(t, 'ditolak', by, note);
  if (act === 'ulang') catatT(t, 'antre', by, 'Coba lagi');
  if (act === 'revisi') { (t.catatan_revisi ||= []).push({ at: iso(), oleh: by, note }); catatT(t, 'revisi', by, note); }
  await simpan('tugas', t);
  if (t.proyek) await cekProyekSelesai(t.proyek);
  return t;
}
async function cekProyekSelesai(pid) {
  const p = await ambil('proyek', pid);
  if (!p || p.status !== 'berjalan') return;
  const T = (await semua('tugas')).filter((t) => t.proyek === pid);
  if (T.length && T.every((t) => ['selesai', 'ditolak'].includes(t.status))) { p.status = 'selesai'; (p.riwayat ||= []).push({ at: iso(), ke: 'selesai', oleh: 'sistem' }); await simpan('proyek', p); }
}

// Pilih tugas berikutnya yang siap dikerjakan. Dalam satu proyek, tugas menunggu tugas berurutan sebelumnya selesai dikerjakan agent.
async function pilihBerikut(T) {
  const sekarang = Date.now();
  for (const t of T.filter((x) => x.status === 'berjalan' && sekarang - Date.parse(x.mulai || 0) > 10 * 6e4)) { catatT(t, 'antre', 'sistem', 'Pengerjaan terputus, diantrekan ulang'); await simpan('tugas', t); } // pulihkan yang macet
  const siap = T.filter((t) => ['antre', 'revisi'].includes(t.status)).filter((t) => !t.proyek || !T.some((x) => x.proyek === t.proyek && x.urutan < t.urutan && ['rencana', 'antre', 'revisi', 'berjalan'].includes(x.status)));
  return siap.sort((a, b) => (a.status === 'revisi' ? -1 : 0) - (b.status === 'revisi' ? -1 : 0) || a.dibuat.localeCompare(b.dibuat))[0] || null;
}

export async function jalankanBerikut() {
  if (process.env.TIM_JEDA === '1') return { jalan: null, sisa: 0 }; // mode contoh: agent tidak dijalankan
  const T = await semua('tugas');
  const t = await pilihBerikut(T);
  if (!t) return { jalan: null, sisa: 0 };
  const tahan = await cekAnggaran(t.proyek);
  if (tahan) { catatT(t, 'tertahan', 'sistem', tahan); await simpan('tugas', t); return { jalan: t, sisa: T.filter((x) => ['antre', 'revisi'].includes(x.status)).length - 1, tertahan: tahan }; }
  const agen = await muat('agen', t.agen);
  t.mulai = iso(); t.percobaan = (t.percobaan || 0) + 1; catatT(t, 'berjalan', agen.id); await simpan('tugas', t);

  const sebelumnya = t.proyek ? T.filter((x) => x.proyek === t.proyek && x.urutan < t.urutan && x.hasil).map((x) => `### ${x.judul} (oleh ${x.agen})\n${potong(x.hasil.md, 2500)}`).join('\n\n') : '';
  const p = t.proyek ? await ambil('proyek', t.proyek) : null;
  const system = `Kamu ${agen.nama}, ${agen.peran} di tim AI ${NAMA_UNIT[agen.unit] || agen.unit}. ${agen.deskripsi}

${ATURAN}
${agen.boleh_wa ? '- Kamu boleh mengusulkan pesan WhatsApp untuk lead yang ada di DATA (pakai id lead persis). Pesan tidak terkirim sebelum pemilik menyetujui.' : '- Kamu tidak mengirim pesan ke pelanggan.'}

DATA
${await konteks(agen)}

KELUARAN: satu objek JSON saja:
{"ringkasan":"1-2 kalimat hasil kerja","hasil_md":"hasil lengkap dalam Markdown","butuh_dari_pemilik":["data atau keputusan yang diperlukan"]${agen.boleh_wa ? ',"pesan_wa":[{"lead":"id lead","isi":"teks WhatsApp"}]' : ''}}`;
  const isi = [
    p ? `Proyek: ${p.judul}\nTujuan pemilik: ${p.tujuan}` : 'Tugas langsung dari pemilik.',
    `Tugasmu: ${t.judul}\n${t.instruksi}`,
    sebelumnya && `Hasil tugas sebelumnya di proyek ini:\n${sebelumnya}`,
    (t.catatan_revisi || []).length && `Hasil sebelumnya:\n${potong(t.hasil?.md, 3000)}\n\nPermintaan revisi dari pemilik:\n${t.catatan_revisi.map((c) => '- ' + c.note).join('\n')}`,
  ].filter(Boolean).join('\n\n');

  try {
    const r = await tanya({ model: agen.model, system, messages: [{ role: 'user', content: isi }], max_tokens: 2500 });
    const d = jsonDari(r.teks) || { ringkasan: '', hasil_md: r.teks, butuh_dari_pemilik: [] };
    const t2 = await muat('tugas', t.id);
    catatBiaya(t2, r);
    t2.hasil = { ringkasan: potong(d.ringkasan || '', 400), md: String(d.hasil_md || r.teks).slice(0, 20000), butuh: (d.butuh_dari_pemilik || []).slice(0, 8).map((x) => potong(x, 200)), pesan_wa: [], at: iso() };
    if (agen.boleh_wa) for (const m of (d.pesan_wa || []).slice(0, 10)) {
      const l = await ambil('leads', String(m.lead || ''));
      if (!l || l.optout) continue;
      const a = await buatAksi({ unit: l.unit, jenis: 'wa_agen', sumber: agen.id, risiko: 'tinggi', isi: String(m.isi || '').trim(), tujuan: { wa: l.wa, nama: l.nama, lead: l.id },
        ringkas: `${agen.nama}: pesan untuk ${l.nama || l.wa}`, alasan: `Dari tugas "${t2.judul}"`, tugas: t2.id });
      t2.hasil.pesan_wa.push(a.id);
    }
    t2.selesai_dikerjakan = iso(); catatT(t2, 'review', agen.id, t2.hasil.ringkasan);
    await simpan('tugas', t2); await tambahBiayaProyek(t2.proyek, r);
    return { jalan: t2, sisa: (await semua('tugas')).filter((x) => ['antre', 'revisi'].includes(x.status)).length };
  } catch (e) {
    const t2 = await muat('tugas', t.id);
    catatT(t2, 'gagal', 'sistem', String(e.message).slice(0, 300)); await simpan('tugas', t2);
    return { jalan: t2, sisa: (await semua('tugas')).filter((x) => ['antre', 'revisi'].includes(x.status)).length, galat: e.message };
  }
}

// ---------- progres agent (tanpa AI) ----------
export async function progresAgen(id) {
  const a = await muat('agen', id), T = (await semua('tugas')).filter((t) => t.agen === id).sort((x, y) => y.dibuat.localeCompare(x.dibuat));
  const n = (s) => T.filter((t) => t.status === s).length;
  const kini = T.find((t) => t.status === 'berjalan');
  const teks = !T.length ? `${a.nama} belum pernah diberi tugas.`
    : [kini ? `Sedang mengerjakan "${kini.judul}" sejak ${new Date(kini.mulai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}.` : 'Tidak sedang mengerjakan apa pun.',
      `${n('antre') + n('revisi')} tugas antre, ${n('review')} menunggu tinjauan Anda, ${n('selesai')} selesai, ${n('gagal') + n('tertahan')} gagal/tertahan.`,
      `Biaya total: $${T.reduce((s, t) => s + (t.biaya_usd || 0), 0).toFixed(4)}.`].join(' ');
  return { agen: a, teks, tugas: T.slice(0, 20) };
}
export function statusAgen(a, T) {
  const mine = T.filter((t) => t.agen === a.id);
  if (!a.aktif) return 'nonaktif';
  if (mine.some((t) => t.status === 'berjalan')) return 'bekerja';
  if (mine.some((t) => t.status === 'review')) return 'menunggu_review';
  if (mine.some((t) => ['antre', 'revisi'].includes(t.status))) return 'antre';
  if (mine.some((t) => ['gagal', 'tertahan'].includes(t.status))) return 'bermasalah';
  return 'santai';
}

// ---------- chat dengan Kepala Staf ----------
export async function riwayatChat(by) {
  const id = 'chat-' + String(by || 'pemilik').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return (await ambil('chat', id)) || { id, oleh: by, pesan: [] };
}
export async function kirimChat(by, pesan) {
  if (!String(pesan || '').trim()) die('Pesan kosong');
  const tahan = await cekAnggaran(null);
  if (tahan) die(tahan);
  const c = await riwayatChat(by), ks = (await ambil('agen', 'kepala-staf')) || { nama: 'Arga', model: 'claude-sonnet-5-5' };
  c.pesan.push({ at: iso(), dari: 'pemilik', teks: String(pesan).slice(0, 4000) });
  const agen = (await daftarAgen()).filter((a) => a.aktif);
  const system = `Kamu ${ks.nama}, kepala staf AI untuk Adya Space dan Piramid Forklift. Kamu bicara dengan pemilik (${by}).
Jawab ringkas (maks 6 kalimat), langsung, berdasarkan DATA. Kalau pemilik meminta pekerjaan yang butuh beberapa langkah atau agent, usulkan proyek.
${ATURAN}

TIM: ${agen.map((a) => `${a.nama} (${a.peran})`).join(', ')}

DATA
${await ringkasKondisi()}

KELUARAN: satu objek JSON saja: {"balasan":"teks","usul_proyek":null}
atau bila perlu proyek: {"balasan":"teks","usul_proyek":{"judul":"maks 8 kata","tujuan":"tujuan lengkap"}}`;
  const msgs = c.pesan.slice(-20).map((m) => ({ role: m.dari === 'pemilik' ? 'user' : 'assistant', content: m.teks }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const r = await tanya({ model: ks.model, system, messages: msgs, max_tokens: 900 });
  const d = jsonDari(r.teks) || { balasan: r.teks, usul_proyek: null };
  c.pesan.push({ at: iso(), dari: 'kepala-staf', teks: String(d.balasan || '').slice(0, 4000), usul_proyek: d.usul_proyek && d.usul_proyek.tujuan ? d.usul_proyek : null });
  c.pesan = c.pesan.slice(-80);
  catatBiaya(c, r);
  return simpan('chat', c);
}

export async function dataTim() {
  const [agen, tugas, proyek] = await Promise.all([daftarAgen(), semua('tugas'), semua('proyek')]);
  const C = CFG();
  return {
    agen: agen.map((a) => ({ ...a, status: statusAgen(a, tugas) })),
    tugas: tugas.sort((a, b) => b.dibuat.localeCompare(a.dibuat)).slice(0, 200),
    proyek: proyek.sort((a, b) => b.dibuat.localeCompare(a.dibuat)).slice(0, 50),
    biaya_hari_ini: +(await biayaHariIni()).toFixed(4), batas_harian_usd: C.batas_harian_usd || null,
    model: Object.keys(C.harga_per_juta_token_usd || {}),
  };
}
