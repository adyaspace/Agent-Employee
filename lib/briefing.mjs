// Briefing pagi untuk pemilik (markdown).
import { ringkas } from './ringkas.mjs';
const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
export async function buatBriefing() {
  const r = await ringkas(), L = [];
  L.push(`# Briefing ${r.tanggal}`, '');
  L.push(`Butuh keputusan Anda: ${r.keputusan.length} aksi${r.konten.length ? ` dan ${r.konten.length} konten` : ''}. Gagal kirim: ${r.gagal.length}. Pelanggaran SLA aktif: ${r.sla.length}.`, '');
  if (r.keputusan.some((a) => a.urgen)) {
    L.push('## Urgen');
    r.keputusan.filter((a) => a.urgen).forEach((a) => L.push(`- ${a.ringkas} (${a.unit}) -> ${a.id}`));
    L.push('');
  }
  L.push('## Keputusan menunggu');
  r.keputusan.slice(0, 15).forEach((a) => L.push(`- [${a.risiko}] ${a.ringkas}${a.masalah?.length ? ' — ' + a.masalah[0] : ''} (${a.id})`));
  if (!r.keputusan.length) L.push('- Tidak ada');
  L.push('', '## Terlambat (SLA 5P Piramid)');
  r.sla.forEach((x) => L.push(`- ${x.pelanggan} / ${x.teknisi}: ${x.aturan}, lewat ${x.lewat_jam} jam (${x.job})`));
  if (!r.sla.length) L.push('- Tidak ada');
  L.push('', '## Jatuh tempo 14 hari');
  r.tenggat.forEach((t) => L.push(`- ${t.jatuh_tempo} (H-${t.sisa_hari}) ${t.nama}: ${t.label}`));
  if (!r.tenggat.length) L.push('- Tidak ada');
  L.push('', '## Pipeline');
  r.pipeline.forEach((p) => L.push(`- ${p.tahap}: ${p.jumlah} lead${p.nilai ? ', ' + rp(p.nilai) : ''}`));
  if (r.menunggu_balasan.length) L.push(`- Belum dibalas: ${r.menunggu_balasan.map((x) => `${x.nama} (${x.jam} jam)`).join(', ')}`);
  if (r.lead_dingin.length) L.push(`- Lead dingin (follow-up habis, putuskan kalah atau telepon): ${r.lead_dingin.map((x) => x.nama).join(', ')}`);
  L.push('', `Otomatis hari ini: ${r.otomatis_hari_ini} aksi disetujui autopilot, ${r.terkirim_hari_ini} pesan terkirim.`);
  return { tanggal: r.tanggal, teks: L.join('\n') + '\n' };
}
