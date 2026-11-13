// Kalender kepatuhan klien Adyaspace dan jatuh tempo servis unit Piramid.
// Aturan tanggal (diverifikasi November 2026, cek ulang bila regulasi berubah):
//   PPh masa: setor tgl 15 bulan berikutnya (PMK 81/2024 Ps. 94 ayat 2), lapor SPT Masa paling lama 20 hari setelah masa berakhir.
//   PPN (PKP): setor dan lapor paling lambat akhir bulan berikutnya.
//   LKPM: usaha kecil per semester (15 Jul, 15 Jan); menengah dan besar per triwulan (15 Apr, 15 Jul, 15 Okt, 15 Jan) - Perka BKPM 5/2025.
//   SPT Tahunan: orang pribadi 31 Maret, badan 30 April (tahun buku kalender).
// Pajak yang jatuh pada Sabtu, Minggu, atau tanggal di aturan/libur.json digeser ke hari kerja berikutnya.
// LKPM tidak digeser otomatis: OSS mengumumkan sendiri penyesuaiannya.
import { hari, tglWIB, tambahHari, selisihHari, libur } from './core.mjs';

const pad = (n) => String(n).padStart(2, '0');
const akhirBulan = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; // m = 1..12
const tgl = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function hariKerja(s) {
  const L = new Set(libur());
  let d = s;
  for (let i = 0; i < 15; i++) {
    const w = tglWIB(d).getUTCDay(); // tengah malam WIB = 17.00 UTC hari sebelumnya
    const dow = (w + 1) % 7;          // koreksi ke hari WIB: 0 Minggu .. 6 Sabtu
    if (dow !== 0 && dow !== 6 && !L.has(d)) return d;
    d = tambahHari(d, 1);
  }
  return d;
}

// Kewajiban satu klien yang jatuh tempo dalam rentang [dari, dari + hariKe]
export function kewajibanKlien(k, dari = hari(), hariKe = 45) {
  const out = [], [y0, m0] = dari.split('-').map(Number), L = k.layanan || [];
  const push = (kode, label, due, geser = true) => {
    const t = geser ? hariKerja(due) : due, sisa = selisihHari(t, dari);
    if (sisa >= 0 && sisa <= hariKe) out.push({ klien: k.id, nama: k.nama, kode, label, jatuh_tempo: t, sisa_hari: sisa });
  };
  for (let i = -1; i <= 2; i++) { // masa pajak bulan lalu s.d. 2 bulan ke depan
    const mm = ((m0 - 1 + i) % 12 + 12) % 12 + 1, yy = y0 + Math.floor((m0 - 1 + i) / 12);
    const ny = mm === 12 ? yy + 1 : yy, nm = mm === 12 ? 1 : mm + 1, masa = `${BULAN[mm - 1]} ${yy}`;
    if (L.includes('pph_masa')) {
      push('pph_setor_' + yy + pad(mm), `Setor PPh masa ${masa}`, tgl(ny, nm, 15));
      push('pph_lapor_' + yy + pad(mm), `Lapor SPT Masa PPh ${masa}`, tgl(ny, nm, 20));
    }
    if (L.includes('ppn') && k.pkp) push('ppn_' + yy + pad(mm), `Setor dan lapor SPT Masa PPN ${masa}`, akhirBulan(ny, nm));
  }
  for (const y of [y0, y0 + 1]) {
    if (L.includes('lkpm')) {
      const jadwal = k.skala === 'kecil'
        ? [[7, `Semester I ${y}`], [1, `Semester II ${y - 1}`]]
        : [[4, `Triwulan I ${y}`], [7, `Triwulan II ${y}`], [10, `Triwulan III ${y}`], [1, `Triwulan IV ${y - 1}`]];
      for (const [m, p] of jadwal) push(`lkpm_${y}${pad(m)}`, `LKPM ${p}`, tgl(y, m, 15), false);
    }
    if (L.includes('spt_tahunan')) {
      push(`spt_tahunan_${y}`, `SPT Tahunan ${k.jenis === 'badan' ? 'Badan' : 'Orang Pribadi'} tahun pajak ${y - 1}`,
        k.jenis === 'badan' ? tgl(y, 4, 30) : tgl(y, 3, 31));
    }
  }
  if (k.vo_berakhir) push('vo_' + k.vo_berakhir, 'Perpanjangan Virtual Office', k.vo_berakhir, false);
  return out.sort((a, b) => a.jatuh_tempo.localeCompare(b.jatuh_tempo));
}

// Unit pelanggan Piramid: jatuh tempo servis berkala berdasarkan interval hari yang diisi tim (tidak ada nilai bawaan).
export function servisUnit(u, dari = hari()) {
  if (!u.servis_terakhir || !u.interval_hari) return null;
  const due = tambahHari(u.servis_terakhir, +u.interval_hari);
  return { unit: u.id, pelanggan: u.pelanggan, label: `Servis berkala ${u.tipe || ''} ${u.sn || ''}`.trim(), jatuh_tempo: due, sisa_hari: selisihHari(due, dari) };
}
