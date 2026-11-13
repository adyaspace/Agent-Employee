// Executor deterministik (tanpa AI): mengirim aksi WA yang sudah disetujui.
// live=false -> hanya mensimulasikan (dry-run).
import { semua, muat, ambil, simpan, pindahAksi, hari, iso, kebijakan } from './core.mjs';
import { kirimWA, teks, tpl, dalamJendela } from './wa.mjs';
import { periksaTeks } from './aksi.mjs';
import { tambahPesan } from './percakapan.mjs';

async function gagal(a, alasan) { pindahAksi(a, 'gagal', 'executor', alasan); await simpan('aksi', a); return `GAGAL ${a.id}: ${alasan}`; }

export async function kirimAksi(a, { live = false, semuaAksi = null } = {}) {
  if (typeof a === 'string') a = await muat('aksi', a);
  if (a.status !== 'disetujui') return `LEWATI ${a.id}: status ${a.status}`;
  if (!a.jenis?.startsWith('wa_')) return `LEWATI ${a.id}: jenis ${a.jenis} bukan WA`;
  const lead = a.tujuan?.lead ? await ambil('leads', a.tujuan.lead) : null;
  if (lead?.optout) return gagal(a, 'Penerima meminta berhenti dihubungi (opt-out)');
  if (a.kirim?.mulai && !a.kirim?.wamid) return gagal(a, 'Percobaan sebelumnya terputus; status kirim tidak pasti. Cek WA Manager, lalu "ulang" bila memang belum terkirim.');
  const masalah = await periksaTeks(a.unit, a.isi);
  if (masalah.length && !a.paksa) return gagal(a, masalah.join('; '));
  const MAX = +(process.env.WA_MAX_PER_DAY || kebijakan().batas_kirim_harian || 200);
  const terkirimHariIni = (semuaAksi || await semua('aksi')).filter((x) => x.unit === a.unit && x.status === 'terkirim' && x.kirim?.at && hari(x.kirim.at) === hari()).length;
  if (terkirimHariIni >= MAX) return `TUNDA ${a.id}: batas harian ${MAX} pesan untuk ${a.unit}`;

  // Teks bebas hanya dalam jendela 24 jam; di luar itu wajib template Meta yang sudah disetujui.
  const jendela = dalamJendela(lead?.last_in);
  if (!jendela && !a.template?.nama) return gagal(a, 'Di luar jendela 24 jam dan aksi ini tidak punya template Meta');
  const payload = jendela ? teks(a.tujuan.wa, a.isi) : tpl(a.tujuan.wa, a.template.nama, a.template.params);
  const cara = jendela ? 'teks (dalam jendela 24 jam)' : `template ${a.template.nama} (${a.template.kategori})`;
  if (!live) return `DRY-RUN ${a.id} -> ${a.unit} ${a.tujuan.wa} via ${cara}\n${a.isi}`;

  a.kirim = { mulai: iso(), cara }; await simpan('aksi', a); // tandai sebelum mengirim: cegah kirim ganda bila proses mati di tengah
  try {
    const wamid = await kirimWA(a.unit, payload);
    a.kirim = { ...a.kirim, wamid, at: iso() };
    pindahAksi(a, 'terkirim', 'executor', wamid); await simpan('aksi', a);
  } catch (e) { delete a.kirim; return gagal(a, String(e.message).slice(0, 400)); }
  await tambahPesan(a.unit, a.tujuan.wa, { arah: 'keluar', teks: a.isi, wamid: a.kirim.wamid, aksi: a.id });
  if (lead) {
    lead.last_out = a.kirim.at;
    if (a.jenis === 'wa_followup') lead.followup_ke = (lead.followup_ke || 0) + 1;
    await simpan('leads', lead);
  }
  return `TERKIRIM ${a.id} ${a.kirim.wamid}`;
}

export async function kirimSemua({ live = false } = {}) {
  const all = await semua('aksi');
  const daftar = all.filter((a) => a.status === 'disetujui').sort((a, b) => a.dibuat.localeCompare(b.dibuat));
  const out = [];
  for (const a of daftar) out.push(await kirimAksi(a, { live, semuaAksi: all }));
  return out;
}
