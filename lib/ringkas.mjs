// Ringkasan satu layar untuk pemilik: apa yang butuh keputusan, apa yang terlambat, apa yang jatuh tempo.
import fs from 'node:fs';
import path from 'node:path';
import { semua, hari, KONTEN_DATA, kebijakan, jamSejak, tambahHari } from './core.mjs';
import { kewajibanKlien, servisUnit } from './kalender.mjs';
import { pelanggaranSLA, TAHAP_5P } from './sla.mjs';

export function kontenAntre() {
  const q = path.join(KONTEN_DATA(), 'queue');
  if (!fs.existsSync(q)) return [];
  return fs.readdirSync(q).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(q, f), 'utf8')));
}

// Kepercayaan 30 hari: berapa persen usulan disetujui manusia tanpa diedit, per jenis pesan / intent dan per agent.
// Dasar untuk menyalakan autopilot per jenis (BLUEPRINT: >70% tanpa edit).
const SISTEM = ['autopilot', 'executor', 'sistem'];
export function kepercayaan(aksi, tugas, agen, today = hari()) {
  const batas = tambahHari(today, -30), g = new Map();
  const tambah = (kunci, info, hasil) => { const x = g.get(kunci) || { ...info, n: 0, tanpa_edit: 0, diedit: 0, ditolak: 0 }; x.n++; x[hasil]++; g.set(kunci, x); };
  for (const a of aksi) {
    const r = a.riwayat?.find((x) => ['disetujui', 'ditolak'].includes(x.ke) && !SISTEM.includes(x.oleh));
    if (!r || hari(r.at) < batas) continue;
    const intent = a.jenis === 'wa_balas' ? a.intent || null : null;
    tambah(`${a.jenis}:${intent || ''}`, { jenis: a.jenis, intent }, r.ke === 'ditolak' ? 'ditolak' : a.diedit_manusia ? 'diedit' : 'tanpa_edit');
  }
  for (const t of tugas) {
    const r = t.riwayat?.at(-1);
    if (!['selesai', 'ditolak'].includes(t.status) || !r || r.note === 'Proyek dibatalkan' || hari(r.at) < batas || !t.hasil) continue;
    tambah('agen:' + t.agen, { agen: agen.find((a) => a.id === t.agen)?.nama || t.agen }, t.status === 'ditolak' ? 'ditolak' : (t.catatan_revisi || []).length ? 'diedit' : 'tanpa_edit');
  }
  return [...g.values()].map((x) => ({ ...x, persen: Math.round((x.tanpa_edit / x.n) * 100) })).sort((a, b) => b.n - a.n);
}

export async function ringkas() {
  const today = hari(), fu = kebijakan().followup_hari || [];
  const [aksi, leads, klienAll, armada, jobs, sla, tugas, agen] = await Promise.all([semua('aksi'), semua('leads'), semua('klien'), semua('armada'), semua('jobs'), pelanggaranSLA(), semua('tugas'), semua('agen')]);
  const klien = klienAll.filter((k) => !k.nonaktif);
  const konten = kontenAntre();
  const tenggat = [
    ...klien.flatMap((k) => kewajibanKlien(k, today, 14)).map((x) => ({ ...x, unit: 'adyaspace' })),
    ...armada.map((u) => servisUnit(u, today)).filter((s) => s && s.sisa_hari >= 0 && s.sisa_hari <= 14).map((s) => ({ ...s, nama: s.pelanggan, unit: 'piramid-forklift' })),
  ].sort((a, b) => a.jatuh_tempo.localeCompare(b.jatuh_tempo));
  const aktif = leads.filter((l) => !['menang', 'kalah'].includes(l.tahap));
  return {
    tanggal: today,
    keputusan: aksi.filter((a) => a.status === 'usulan').sort((a, b) => (b.urgen ? 1 : 0) - (a.urgen ? 1 : 0) || { tinggi: 0, sedang: 1, rendah: 2 }[a.risiko] - { tinggi: 0, sedang: 1, rendah: 2 }[b.risiko] || a.dibuat.localeCompare(b.dibuat)),
    gagal: aksi.filter((a) => a.status === 'gagal'),
    antre_kirim: aksi.filter((a) => a.status === 'disetujui').length,
    terkirim_hari_ini: aksi.filter((a) => a.status === 'terkirim' && a.kirim?.at && hari(a.kirim.at) === today).length,
    otomatis_hari_ini: aksi.filter((a) => a.riwayat?.some((r) => r.oleh === 'autopilot' && hari(r.at) === today)).length,
    menunggu_balasan: leads.filter((l) => l.perlu_balasan && !l.optout).map((l) => ({ id: l.id, unit: l.unit, nama: l.nama || l.wa, jam: Math.round(jamSejak(l.last_in)) })),
    pipeline: ['baru', 'kualifikasi', 'penawaran', 'negosiasi'].map((t) => ({ tahap: t, jumlah: aktif.filter((l) => l.tahap === t).length, nilai: aktif.filter((l) => l.tahap === t).reduce((s, l) => s + (l.nilai || 0), 0) })),
    lead_dingin: aktif.filter((l) => (l.followup_ke || 0) >= fu.length && fu.length && !(l.last_in > l.last_out)).map((l) => ({ id: l.id, unit: l.unit, nama: l.nama || l.wa })),
    sla: sla.filter((x) => x.aktif),
    jobs: jobs.filter((j) => TAHAP_5P(j) !== 'selesai').map((j) => ({ id: j.id, pelanggan: j.pelanggan, teknisi: j.teknisi, tahap: TAHAP_5P(j) })),
    tenggat,
    konten: konten.filter((k) => k.status === 'menunggu_persetujuan'),
    tugas_review: tugas.filter((t) => t.status === 'review').sort((a, b) => (a.selesai_dikerjakan || '').localeCompare(b.selesai_dikerjakan || ''))
      .map((t) => ({ id: t.id, judul: t.judul, agen: t.agen, agen_nama: agen.find((a) => a.id === t.agen)?.nama || t.agen, ringkasan: t.hasil?.ringkasan || '' })),
    kepercayaan: kepercayaan(aksi, tugas, agen, today),
    konten_status: Object.fromEntries(['ide', 'draf', 'revisi', 'menunggu_persetujuan', 'terjadwal', 'tayang', 'gagal'].map((s) => [s, konten.filter((k) => k.status === s).length])),
  };
}
