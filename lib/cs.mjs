// CS WhatsApp: menyusun draf balasan untuk lead yang menunggu balasan, memakai Claude API.
// Model hanya mengusulkan. Pemeriksaan deterministik (harga, klaim terlarang) dan kebijakan autopilot yang memutuskan.
import { semua, muat, simpan, baca, kebijakan, catat, die, jamWIB, pindahAksi } from './core.mjs';
import { buatAksi } from './aksi.mjs';
import { ambilPercakapan } from './percakapan.mjs';
import { hargaResmi } from './harga.mjs';
import { tanya, jsonDari } from './llm.mjs';
const KB = kebijakan(), CS = KB.cs || {};
const LABEL = { salam: 'salam', tanya_alamat_jam: 'tanya alamat/jam', tanya_layanan: 'tanya layanan', tanya_harga: 'tanya harga', minta_penawaran: 'minta penawaran',
  status_order: 'tanya status order', jadwal_servis: 'jadwal servis', darurat_unit: 'unit darurat', keluhan: 'keluhan', lainnya: 'pesan lain' };

async function sistem(unit) {
  const harga = await hargaResmi(unit);
  return `Kamu staf customer service WhatsApp untuk ${KB.unit_nama?.[unit] || unit}. Tugasmu hanya urusan bisnis ini: menjawab pertanyaan layanan, mengumpulkan kebutuhan calon pelanggan, dan meneruskan ke tim. Bukan asisten umum: pertanyaan di luar bisnis ini dijawab sopan bahwa kamu hanya melayani urusan ${KB.unit_nama?.[unit] || unit}.

ATURAN KERAS
- Fakta (layanan, alamat, jam, harga, syarat) HANYA dari PENGETAHUAN di bawah. Tidak ada di sana: katakan tim akan mengonfirmasi, jangan menebak.
- Jangan menyebut angka harga yang tidak tertulis persis di PENGETAHUAN. Jangan menjanjikan hasil, waktu proses, atau kepastian hukum/pajak.
- Jangan memberi nasihat hukum atau pajak yang spesifik untuk kasus pelanggan; tawarkan konsultasi dengan tim.
- Bahasa Indonesia, sopan, ringkas (maks 5 kalimat), maksimal satu pertanyaan balik, satu ajakan bertindak.
- Jangan meminta data sensitif (NIK, nomor rekening, kata sandi) lewat chat.

PENGETAHUAN
${baca(`brands/${unit}.md`)}
${baca(`pengetahuan/${unit}/faq.md`)}
${harga}

KELUARAN: satu objek JSON saja, tanpa teks lain:
{"intent":"${(CS.intent || []).join('|')}","risiko":"rendah|sedang|tinggi","balasan":"teks WA","alasan":"kenapa risiko itu","lead":{"nama":"","perusahaan":"","kebutuhan":"","lokasi":""}}
risiko rendah = jawaban faktual sederhana dari PENGETAHUAN. sedang = perlu dicek manusia. tinggi = harga, keluhan, darurat, janji, atau kamu ragu.`;
}

async function tanyaClaude(system, messages) {
  const r = await tanya({ model: process.env.CS_MODEL || CS.model, system, messages, max_tokens: 800 });
  const d = jsonDari(r.teks);
  if (!d) throw new Error('Balasan model bukan JSON');
  return d;
}

export async function prosesLead(l) {
  if (typeof l === 'string') l = await muat('leads', l);
  const c = await ambilPercakapan(l.unit, l.wa);
  const riwayat = c.pesan.slice(-(CS.riwayat_pesan || 12));
  // Format percakapan sebagai giliran user/assistant yang berselang-seling
  const msgs = [];
  for (const p of riwayat) {
    const role = p.arah === 'masuk' ? 'user' : 'assistant';
    if (msgs.length && msgs.at(-1).role === role) msgs.at(-1).content += '\n' + p.teks; else msgs.push({ role, content: p.teks || '' });
  }
  if (!msgs.length || msgs.at(-1).role !== 'user') { l.perlu_balasan = false; await simpan('leads', l); return { teks: `${l.id}: tidak ada pesan baru` }; }
  if (msgs[0].role !== 'user') msgs.shift();
  const jam = jamWIB(), luarJam = jam < 8 || jam >= 17;
  msgs.at(-1).content += `\n\n[catatan sistem: sekarang pukul ${jam}.00 WIB${luarJam ? ', di luar jam kerja' : ''}. Data lead saat ini: ${JSON.stringify({ nama: l.nama, kebutuhan: l.kebutuhan, tahap: l.tahap })}]`;

  const d = await tanyaClaude(await sistem(l.unit), msgs);
  const intent = (CS.intent || []).includes(d.intent) ? d.intent : 'lainnya';
  let risiko = ['rendah', 'sedang', 'tinggi'].includes(d.risiko) ? d.risiko : 'tinggi';
  // Eskalasi bukan cacat isi: draf tetap bisa langsung disetujui, hanya tidak boleh lewat autopilot.
  const eskalasi = (CS.eskalasi_intent || []).includes(intent) ? `Intent "${intent}" wajib dilihat manusia` : '';
  if (eskalasi) risiko = 'tinggi';

  // Satu draf aktif per percakapan: draf lama yang belum diputuskan digantikan draf baru yang membaca seluruh riwayat.
  for (const lama of (await semua('aksi')).filter((x) => x.status === 'usulan' && x.jenis === 'wa_balas' && x.tujuan?.lead === l.id)) {
    pindahAksi(lama, 'diganti', 'sistem', 'Ada pesan baru, draf disusun ulang'); await simpan('aksi', lama);
  }
  const a = await buatAksi({
    unit: l.unit, jenis: 'wa_balas', intent, sumber: 'cs-draft', risiko, eskalasi, isi: String(d.balasan || '').trim(),
    tujuan: { wa: l.wa, nama: l.nama, lead: l.id }, ringkas: `Balas ${l.nama || l.wa}: ${LABEL[intent] || intent}`, alasan: d.alasan || '',
    urgen: intent === 'darurat_unit' || intent === 'keluhan',
  });
  for (const f of ['nama', 'perusahaan', 'kebutuhan', 'lokasi']) if (d.lead?.[f] && !l[f]) l[f] = d.lead[f];
  if (l.tahap === 'baru' && (l.kebutuhan || intent === 'minta_penawaran')) { catat(l, 'kualifikasi', 'cs-draft', 'Kebutuhan teridentifikasi'); l.tahap = 'kualifikasi'; }
  l.perlu_balasan = false;
  await simpan('leads', l);
  return { aksi: a, teks: `${l.id}: ${a.id} ${a.status} risiko=${a.risiko} intent=${intent}${a.masalah.length ? ' :: ' + a.masalah.join('; ') : ''}` };
}

// Proses semua lead yang menunggu balasan. Kegagalan satu lead tidak menghentikan yang lain;
// lead itu tetap perlu_balasan dan dicoba lagi di putaran berikutnya.
export async function prosesSemua() {
  const target = (await semua('leads')).filter((l) => l.perlu_balasan && !l.optout), out = [];
  for (const l of target) {
    try { out.push(await prosesLead(l)); }
    catch (e) { out.push({ teks: `${l.id}: GAGAL ${e.message}`, galat: true }); }
  }
  return out;
}
