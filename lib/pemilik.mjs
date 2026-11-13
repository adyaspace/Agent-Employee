// Saluran pemilik lewat WhatsApp: laporan rapat pagi/malam (tanpa AI) dan perintah dua arah ke Kepala Staf.
// Aktif bila OWNER_WA diisi. Pesan dari nomor itu tidak pernah menjadi lead pelanggan.
import { ambil, simpan, semua, hari, now, iso, env } from './core.mjs';
import { kirimWA, teks, tpl, dalamJendela } from './wa.mjs';
import { ringkas } from './ringkas.mjs';
import * as tim from './tim.mjs';

export const nomorPemilik = () => env('OWNER_WA').replace(/\D/g, '').replace(/^0/, '62');
export const dariPemilik = (wa) => !!nomorPemilik() && String(wa) === nomorPemilik();
const unitPemilik = () => env('OWNER_UNIT') || 'adyaspace'; // nomor bisnis yang mengirim laporan
const namaPemilik = () => env('OWNER_NAMA') || 'Pemilik'; // samakan dengan nama login dashboard agar riwayat chat menyatu
const jamWIBmenit = () => now().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
const muatStatus = async () => (await ambil('pemilik', 'status')) || { id: 'status', last_in: {}, rapat: {}, wamid: [] };
const MAKS_WA = 3500;

// ---------- laporan rapat (deterministik, 0 token) ----------
export async function susunLaporan(sesi) {
  const r = await ringkas(), tgl = hari(), T = await semua('tugas'), agen = await semua('agen');
  const tglLabel = now().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
  const L = [`*Rapat ${sesi} · ${tglLabel}*`, ''];
  L.push(`Butuh keputusan Anda: ${r.keputusan.length} pesan WA, ${r.tugas_review.length} hasil kerja agent${r.konten.length ? `, ${r.konten.length} konten` : ''}.`);
  const urgen = r.keputusan.filter((a) => a.urgen);
  if (urgen.length) L.push('', '*Urgen*', ...urgen.slice(0, 3).map((a) => `- ${a.ringkas}`));
  if (sesi === 'pagi') {
    const dekat = r.tenggat.filter((t) => t.sisa_hari <= 7);
    L.push('', '*Tenggat 7 hari*', ...(dekat.length ? dekat.slice(0, 6).map((t) => `- ${t.jatuh_tempo.slice(5)} (H-${t.sisa_hari}) ${t.nama}: ${t.label}`) : ['- Tidak ada']));
    if (r.sla.length) L.push('', `*SLA 5P terlambat: ${r.sla.length}*`, ...r.sla.slice(0, 3).map((x) => `- ${x.pelanggan} / ${x.teknisi}: lewat ${x.lewat_jam} jam`));
    const dow = new Date(tgl + 'T12:00:00+07:00').getUTCDay();
    const rutin = agen.filter((a) => a.aktif).flatMap((a) => (a.rutin || []).filter((x) => x.hari.includes(dow)).map((x) => `- ${x.jam} ${a.nama}: ${x.judul}`)).sort();
    if (rutin.length) L.push('', '*Rutinitas agent hari ini*', ...rutin.slice(0, 8));
  } else {
    const hariIni = (s) => s && hari(s) === tgl;
    L.push(`Hari ini: ${r.terkirim_hari_ini} pesan terkirim, ${T.filter((t) => hariIni(t.selesai_dikerjakan)).length} tugas agent dikerjakan.`);
    const lapor = agen.filter((a) => a.aktif).map((a) => {
      const m = T.filter((t) => t.agen === a.id), sel = m.filter((t) => hariIni(t.selesai_dikerjakan)).length;
      const jalan = m.filter((t) => ['antre', 'revisi', 'berjalan'].includes(t.status)).length, tunggu = m.filter((t) => t.status === 'review').length;
      return sel || jalan || tunggu ? `- ${a.nama}: ${sel} kelar · ${jalan} jalan · ${tunggu} tunggu Anda` : null;
    }).filter(Boolean);
    if (lapor.length) L.push('', '*Laporan agent*', ...lapor);
    const usul = [
      ...urgen.map((a) => a.ringkas),
      ...r.tenggat.filter((t) => t.sisa_hari <= 2).map((t) => `${t.label} ${t.nama} (H-${t.sisa_hari})`),
      ...r.sla.map((x) => `Tindak lanjut SLA ${x.pelanggan} / ${x.teknisi}`),
      ...r.menunggu_balasan.filter((x) => x.jam >= 12).map((x) => `Balas ${x.nama} (menunggu ${x.jam} jam)`),
    ];
    L.push('', '*Usulan prioritas besok*', ...(usul.length ? usul.slice(0, 3).map((u, i) => `${i + 1}. ${u}`) : ['- Tidak ada yang mendesak']));
  }
  if (env('DASHBOARD_URL')) L.push('', env('DASHBOARD_URL'));
  L.push('', 'Balas pesan ini untuk memberi instruksi ke Kepala Staf, atau ketik "laporan".');
  return { teks: L.join('\n').slice(0, MAKS_WA), keputusan: r.keputusan.length + r.tugas_review.length, tenggat: r.tenggat.filter((t) => t.sisa_hari <= 7).length };
}

// Teks bebas hanya dalam 24 jam sejak pemilik terakhir menulis ke nomor bisnis itu; di luar itu template Meta "laporan_pemilik_v1".
async function kirimKePemilik(unit, isi, cadangan = null) {
  const st = await muatStatus(), to = nomorPemilik();
  const payload = dalamJendela(st.last_in?.[unit]) ? teks(to, isi) : cadangan ? tpl(to, 'laporan_pemilik_v1', cadangan) : null;
  if (!payload) return 'LEWATI: di luar jendela 24 jam dan tidak ada template';
  return `${payload.type.toUpperCase()} ${await kirimWA(unit, payload)}`;
}

// Dipanggil cron tiap 10 menit: kirim rapat pagi (06:30) dan malam (21:00) sekali per hari.
export async function jalankanRapat() {
  if (!nomorPemilik()) return [];
  const tgl = hari(), hm = jamWIBmenit(), out = [];
  for (const [sesi, jam] of [['pagi', env('RAPAT_PAGI') || '06:30'], ['malam', env('RAPAT_MALAM') || '21:00']]) {
    const st = await muatStatus(), kunci = `${tgl}-${sesi}`;
    if (hm < jam || st.rapat[kunci]) continue;
    st.rapat[kunci] = iso(); await simpan('pemilik', st); // tandai dulu: cron berikutnya tidak mengirim ulang walau kirim gagal
    const lap = await susunLaporan(sesi);
    try { out.push(`rapat ${sesi}: ${await kirimKePemilik(unitPemilik(), lap.teks, [sesi, lap.keputusan, lap.tenggat])}`); }
    catch (e) { out.push(`rapat ${sesi} gagal: ${String(e.message).slice(0, 200)}`); }
  }
  return out;
}

// ---------- perintah dari WA pemilik ----------
export async function perintahPemilik({ unit, teks: isi, wamid, at }) {
  const st = await muatStatus();
  if (wamid && st.wamid.includes(wamid)) return 'LEWATI: pesan ganda';
  st.wamid = [...st.wamid, wamid].filter(Boolean).slice(-50);
  (st.last_in ||= {})[unit] = at || iso();
  await simpan('pemilik', st);
  const t = String(isi || '').trim(), balas = (x) => kirimKePemilik(unit, String(x).slice(0, MAKS_WA));
  if (/^(laporan|lapor|rapat)\b/i.test(t)) return balas((await susunLaporan(jamWIBmenit() < '15:00' ? 'pagi' : 'malam')).teks);
  if (!env('ANTHROPIC_API_KEY')) return balas('Kepala Staf belum aktif: ANTHROPIC_API_KEY belum diisi. Ketik "laporan" untuk ringkasan tanpa AI.');
  try {
    if (/^susun\b/i.test(t)) { // jalankan usulan proyek terakhir dari Kepala Staf
      const u = (await tim.riwayatChat(namaPemilik())).pesan.filter((m) => m.usul_proyek).at(-1)?.usul_proyek;
      if (!u) return balas('Belum ada usulan proyek dari Kepala Staf.');
      const { proyek, tugas } = await tim.buatProyek({ judul: u.judul, tujuan: u.tujuan }, namaPemilik());
      return balas(`Rencana "${proyek.judul}":\n${tugas.map((x, i) => `${i + 1}. ${x.judul}`).join('\n')}\n\nBalas "SETUJUI" untuk mulai dikerjakan.`);
    }
    if (/^setujui\b/i.test(t)) { // setujui rencana proyek terbaru yang menunggu
      const p = (await semua('proyek')).filter((x) => x.status === 'menunggu_rencana').sort((a, b) => b.dibuat.localeCompare(a.dibuat))[0];
      if (!p) return balas('Tidak ada rencana yang menunggu persetujuan. Pesan WA ke pelanggan tetap disetujui dari dashboard.');
      await tim.setujuiRencana(p.id, namaPemilik());
      return balas(`Rencana "${p.judul}" disetujui. Agent mulai bekerja; hasilnya muncul di laporan dan dashboard.`);
    }
    const c = await tim.kirimChat(namaPemilik(), t), m = c.pesan.at(-1);
    return balas(m.teks + (m.usul_proyek ? `\n\nUsulan proyek: *${m.usul_proyek.judul}*. Balas "SUSUN" untuk menyusun rencananya.` : ''));
  } catch (e) { return balas('Gagal: ' + String(e.message).slice(0, 300)); }
}
