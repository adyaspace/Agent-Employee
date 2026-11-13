// Kotak keputusan: setiap tindakan keluar (pesan ke pelanggan/klien) menjadi "aksi" yang harus disetujui,
// kecuali kebijakan autopilot mengizinkan dan AUTOPILOT=1.
import { semua, simpan, muat, die, idBaru, catat, iso, klaimTerlarang, kebijakan, pindahAksi } from './core.mjs';
import { hargaResmi } from './harga.mjs';

const MULT = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, m: 1e9, miliar: 1e9 };
export function angkaRupiah(s) {
  const out = [], re = /(?:rp\.?\s?)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(rb|ribu|k|jt|juta|miliar)?\b/gi;
  for (const m of String(s).matchAll(re)) {
    const pakaiRp = /^rp/i.test(m[0]), satuan = (m[2] || '').toLowerCase();
    if (!pakaiRp && !satuan) continue; // angka biasa (jam, tanggal, jumlah unit) bukan harga
    const n = satuan ? parseFloat(m[1].replace(',', '.')) * MULT[satuan] : +m[1].replace(/[.,]/g, '');
    if (n >= 1000) out.push({ teks: m[0].trim(), nilai: Math.round(n) });
  }
  return out;
}
// Pemeriksaan deterministik yang tidak bergantung pada kejujuran model.
export async function periksaTeks(unit, teks) {
  const p = [], t = String(teks || '');
  if (!t.trim()) p.push('Teks kosong');
  if (t.length > 1500) p.push(`Teks ${t.length} karakter, terlalu panjang untuk WA`);
  for (const b of klaimTerlarang(unit)) if (t.toLowerCase().includes(b)) p.push(`Klaim terlarang: "${b}"`);
  const resmi = new Set(angkaRupiah(await hargaResmi(unit)).map((x) => x.nilai));
  for (const a of angkaRupiah(t)) if (!resmi.has(a.nilai)) p.push(`Harga "${a.teks}" tidak ada di daftar harga resmi`);
  return p;
}

export function bolehAutopilot(a) {
  const k = kebijakan().autopilot || {};
  if (process.env.AUTOPILOT !== '1' || !k.aktif) return false;
  if (a.risiko !== 'rendah' || (a.masalah || []).length) return false;
  return (k.jenis || []).includes(a.jenis) && (!a.intent || (k.intent || []).includes(a.intent));
}

// kunci = penanda unik agar radar tidak membuat aksi yang sama dua kali
export async function buatAksi(d, sudahAda = null) {
  if (d.kunci && (sudahAda || await semua('aksi')).some((x) => x.kunci === d.kunci)) return null;
  const masalah = [...(d.masalah || []), ...(d.isi ? await periksaTeks(d.unit, d.isi) : [])];
  let risiko = d.risiko || 'sedang';
  if (masalah.length) risiko = 'tinggi';
  const a = { id: idBaru('aksi'), dibuat: iso(), status: 'usulan', ...d, risiko, masalah, riwayat: [] };
  catat(a, 'usulan', d.sumber || 'agent', d.alasan || '');
  if (bolehAutopilot(a)) pindahAksi(a, 'disetujui', 'autopilot', 'Kebijakan autopilot: risiko rendah, intent diizinkan');
  return simpan('aksi', a);
}

// Keputusan manusia (dipakai CLI dan dashboard agar aturannya satu).
const NAMA_SISTEM = ['agent', 'autopilot', 'executor', 'sistem', 'webhook', 'radar', 'cs-draft', 'publisher'];
const manusia = (by) => { const n = String(by || '').trim(); if (!n || NAMA_SISTEM.includes(n.toLowerCase())) die('Perintah ini hanya untuk manusia: sertakan --by "Nama Anda"'); return n; };
export async function setujuiAksi(id, by, { isi = null, paksa = false, note = '' } = {}) {
  by = manusia(by);
  const a = await muat('aksi', id);
  if (isi !== null && isi !== a.isi) { a.isi = isi; a.masalah = await periksaTeks(a.unit, isi); a.diedit_manusia = true; }
  if ((a.masalah || []).length && !paksa) die('Masih ada masalah: ' + a.masalah.join('; ') + '. Perbaiki isi, atau setujui dengan paksa bila Anda yakin.');
  if (paksa && (a.masalah || []).length) a.paksa = { oleh: by, masalah: a.masalah };
  pindahAksi(a, 'disetujui', by, note || (paksa ? 'Disetujui dengan paksa' : 'Disetujui'));
  return simpan('aksi', a);
}
export async function tolakAksi(id, by, note = '') { by = manusia(by); const a = await muat('aksi', id); pindahAksi(a, 'ditolak', by, note); return simpan('aksi', a); }
export async function ulangAksi(id, by) { by = manusia(by); const a = await muat('aksi', id); pindahAksi(a, 'disetujui', by, 'Coba kirim ulang'); delete a.kirim; return simpan('aksi', a); }
