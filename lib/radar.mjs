// Radar harian (deterministik, tanpa AI): membuat usulan aksi dari aturan.
//   1. Follow-up lead yang belum membalas
//   2. Pengingat kewajiban pajak, LKPM, SPT Tahunan, dan perpanjangan VO klien Adya Space
//   3. Pengingat servis berkala unit pelanggan Piramid
// Aman dijalankan berulang: setiap usulan punya kunci unik sehingga tidak dobel.
import { semua, hari, tambahHari, kebijakan, template, isiTemplate, selisihHari } from './core.mjs';
import { buatAksi } from './aksi.mjs';
import { kewajibanKlien, servisUnit } from './kalender.mjs';

const ember = (sisa, offsets) => [...offsets].sort((a, b) => a - b).find((x) => x >= sisa); // offset terkecil yang >= sisa hari
const fmt = (s) => new Date(s + 'T00:00:00+07:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
function pesan(namaTpl, data) {
  const t = template(namaTpl);
  return { isi: isiTemplate(t.teks, data), template: { nama: t.meta_template, kategori: t.kategori, params: t.params.map((p) => data[p] ?? '') } };
}

export async function jalankanRadar({ cek = false } = {}) {
  const KB = kebijakan(), NAMA = KB.unit_nama || {}, today = hari(), hasil = [];
  const [leads, klien, armada, aksiAda] = await Promise.all([semua('leads'), semua('klien'), semua('armada'), semua('aksi')]);
  async function usul(d) {
    if (cek) { hasil.push('[cek] ' + d.ringkas); return; }
    const a = await buatAksi(d, aksiAda);
    if (a) { aksiAda.push(a); hasil.push(`${a.id} ${a.status} ${a.ringkas}`); }
  }

  const fu = KB.followup_hari || [];
  for (const l of leads) {
    if (l.optout || l.perlu_balasan || ['menang', 'kalah'].includes(l.tahap) || !l.last_out) continue;
    if (l.last_in && l.last_in > l.last_out) continue; // pelanggan sudah membalas pesan terakhir kita
    const ke = l.followup_ke || 0;
    if (ke >= fu.length) continue; // jatah habis: muncul di briefing sebagai lead dingin
    if (selisihHari(today, hari(l.last_out)) < fu[ke]) continue;
    await usul({
      unit: l.unit, jenis: 'wa_followup', sumber: 'radar', risiko: 'sedang', kunci: `fu:${l.id}:${ke}:${l.last_out}`,
      tujuan: { wa: l.wa, nama: l.nama, lead: l.id }, ringkas: `Follow-up ke-${ke + 1} untuk ${l.nama || l.wa}`,
      alasan: `Tidak ada balasan sejak ${hari(l.last_out)} (${fu[ke]} hari)`,
      ...pesan('followup_lead', { nama: l.nama || 'Bapak/Ibu', kebutuhan: l.kebutuhan || 'kebutuhan Anda', unit_nama: NAMA[l.unit] }),
    });
  }

  for (const k of klien) {
    if (k.nonaktif || !k.wa) continue;
    for (const x of kewajibanKlien(k, today, 45)) {
      const vo = x.kode.startsWith('vo_'), e = ember(x.sisa_hari, vo ? KB.pengingat_vo_hari : KB.pengingat_kepatuhan_hari);
      if (e === undefined) continue;
      const batas = x.sisa_hari <= 3 ? 'hari ini' : fmt(tambahHari(x.jatuh_tempo, -3));
      await usul({
        unit: 'adyaspace', jenis: 'wa_pengingat', sumber: 'radar', risiko: 'rendah', kunci: `kp:${k.id}:${x.kode}:${e}`,
        tujuan: { wa: k.wa, nama: k.nama, klien: k.id }, ringkas: `${x.label} - ${k.nama} (H-${x.sisa_hari})`,
        alasan: `Jatuh tempo ${x.jatuh_tempo}`,
        ...(vo ? pesan('pengingat_vo', { nama: k.nama, tanggal: fmt(x.jatuh_tempo), unit_nama: NAMA.adyaspace })
               : pesan('pengingat_pajak', { nama: k.nama, label: x.label, tanggal: fmt(x.jatuh_tempo), batas_kirim: batas, unit_nama: NAMA.adyaspace })),
      });
    }
  }

  for (const u of armada) {
    const s = servisUnit(u, today);
    if (!s || !u.wa || s.sisa_hari < 0) continue;
    const e = ember(s.sisa_hari, KB.pengingat_servis_hari || []);
    if (e === undefined) continue;
    await usul({
      unit: 'piramid-forklift', jenis: 'wa_pengingat', sumber: 'radar', risiko: 'rendah', kunci: `sv:${u.id}:${s.jatuh_tempo}:${e}`,
      tujuan: { wa: u.wa, nama: u.pelanggan, armada: u.id }, ringkas: `${s.label} - ${u.pelanggan} (H-${s.sisa_hari})`,
      alasan: `Servis terakhir ${u.servis_terakhir}, interval ${u.interval_hari} hari`,
      ...pesan('pengingat_servis', { nama: u.pelanggan, label: s.label, tanggal: fmt(s.jatuh_tempo), unit_nama: NAMA['piramid-forklift'] }),
    });
  }
  return hasil;
}
