// Pemantau SLA 5P teknikal support Piramid (Pengecekan, Penganalisaan, Perencanaan, Pengerjaan, Pengujian).
// Setiap job menyimpan cap waktu per kejadian. Aturan SLA ada di aturan/kebijakan.json -> sla_5p.
import { semua, kebijakan, jamSejak, now } from './core.mjs';

export const KEJADIAN = ['spk_cek', 'selesai_cek', 'input_cek', 'keputusan_analisa', 'spk_kerja', 'selesai_kerja', 'input_kerja', 'uji_lulus'];
export const TAHAP_5P = (j) => {
  const e = j.kejadian || {};
  if (e.uji_lulus) return 'selesai';
  if (e.input_kerja || e.selesai_kerja) return 'pengujian';
  if (e.spk_kerja) return 'pengerjaan';
  if (e.keputusan_analisa) return 'perencanaan';
  if (e.input_cek) return 'penganalisaan';
  return 'pengecekan';
};

// Kembalikan pelanggaran yang sedang terjadi (target belum tercatat dan batas jam lewat)
// atau yang sudah terjadi (target tercatat tetapi terlambat).
export function cekJob(j, ref = now()) {
  const out = [], e = j.kejadian || {};
  for (const r of kebijakan().sla_5p || []) {
    if (!e[r.dari]) continue;
    const selesai = e[r.ke], lama = jamSejak(e[r.dari], selesai || ref);
    if (lama > r.maks_jam) out.push({ job: j.id, pelanggan: j.pelanggan, teknisi: j.teknisi || '-', aturan: r.label, maks_jam: r.maks_jam, lewat_jam: Math.round(lama - r.maks_jam), aktif: !selesai });
  }
  return out;
}
// Semua pelanggaran (aktif dan historis). Konsumen menyaring field `aktif` bila hanya butuh yang perlu ditindak.
export const pelanggaranSLA = async (ref = now()) => (await semua('jobs')).flatMap((j) => cekJob(j, ref));
