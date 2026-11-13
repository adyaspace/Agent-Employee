// Riwayat percakapan WA per (unit, nomor) dan pembaruan lead otomatis.
import { ambil, simpan, semua, idBaru, catat, iso } from './core.mjs';

const pid = (unit, wa) => `${unit}--${wa}`;
export async function ambilPercakapan(unit, wa) {
  return (await ambil('percakapan', pid(unit, wa))) || { id: pid(unit, wa), unit, wa, pesan: [] };
}
export async function tambahPesan(unit, wa, p) {
  const c = await ambilPercakapan(unit, wa);
  if (p.wamid && c.pesan.some((x) => x.wamid === p.wamid)) return false; // Meta bisa mengirim webhook yang sama dua kali
  c.pesan.push({ at: iso(), ...p });
  c.pesan = c.pesan.slice(-60);
  await simpan('percakapan', c);
  return true;
}
const BERHENTI = /^\s*(stop|berhenti|unsubscribe|jangan hubungi)\b/i;

// Pesan masuk: buat atau perbarui lead. Dasar persetujuan: pelanggan yang menghubungi lebih dulu.
export async function pesanMasuk(unit, { wa, nama, teks, wamid, at }) {
  if (!(await tambahPesan(unit, wa, { arah: 'masuk', teks, wamid, waktu: at }))) return null;
  let l = (await semua('leads')).find((x) => x.unit === unit && x.wa === wa);
  if (!l) {
    l = { id: idBaru('lead'), unit, nama: nama || '', wa, sumber: 'whatsapp', kebutuhan: '', tahap: 'baru', nilai: 0, followup_ke: 0, consent: 'pelanggan_menghubungi', dibuat: iso(), riwayat: [] };
    catat(l, 'baru', 'webhook', 'Pesan WA pertama');
  }
  if (!l.nama && nama) l.nama = nama;
  l.last_in = at || iso();
  l.followup_ke = 0;
  if (BERHENTI.test(teks || '')) { l.optout = true; l.perlu_balasan = false; catat(l, l.tahap, 'webhook', 'Pelanggan meminta berhenti dihubungi'); }
  else l.perlu_balasan = true;
  await simpan('leads', l);
  return l;
}
