#!/usr/bin/env node
// CLI tunggal untuk data karyawan AI. Agent boleh membaca dan mengusulkan; persetujuan khusus manusia.
// Memakai Supabase bila SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ada di .env (data sama dengan dashboard online).
//   node bin/ai.mjs aksi  list|show|usul|edit|setujui|tolak|ulang
//   node bin/ai.mjs lead  baru|set|list|show
//   node bin/ai.mjs klien baru|set|list|kalender
//   node bin/ai.mjs job   baru|catat|list|sla
//   node bin/ai.mjs armada baru|set|list
import fs from 'node:fs';
import { loadEnv, args, main, die, muat, simpan, semua, idBaru, catat, iso, hari, TAHAP_LEAD, UNITS, nomorWA } from '../lib/core.mjs';
import { periksaTeks, buatAksi, setujuiAksi, tolakAksi, ulangAksi } from '../lib/aksi.mjs';
import { kewajibanKlien, servisUnit } from '../lib/kalender.mjs';
import { KEJADIAN, TAHAP_5P, cekJob } from '../lib/sla.mjs';
loadEnv();

const { _, o } = args(process.argv.slice(2));
const [grup, cmd, id] = _;
const unit = (u) => (UNITS.includes(u) ? u : die('--unit harus salah satu: ' + UNITS.join(', ')));
const daftar = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const isiDari = () => (o['isi-file'] ? fs.readFileSync(o['isi-file'], 'utf8').trim() : typeof o.isi === 'string' ? o.isi : null);
const tabel = (rows) => rows.forEach((r) => console.log(r.join(' | ')));

const H = {
  aksi: {
    list: async () => tabel((await semua('aksi')).filter((a) => (!o.status || a.status === o.status) && (!o.unit || a.unit === o.unit))
      .sort((a, b) => a.dibuat.localeCompare(b.dibuat)).map((a) => [a.id, a.status, a.risiko, a.unit, a.jenis, a.tujuan?.nama || a.tujuan?.wa || '-', (a.ringkas || '').slice(0, 60)])),
    show: async () => console.log(JSON.stringify(await muat('aksi', id), null, 2)),
    usul: async () => { // agent mengusulkan pesan ke lead; tetap lewat persetujuan manusia
      const l = await muat('leads', o.lead || die('Wajib --lead')), isi = isiDari();
      if (isi === null) die('Wajib --isi atau --isi-file');
      const a = await buatAksi({ unit: l.unit, jenis: o.jenis || 'wa_penawaran', sumber: o.by || 'agent', risiko: 'tinggi', isi,
        tujuan: { wa: l.wa, nama: l.nama, lead: l.id }, ringkas: o.ringkas || `Pesan untuk ${l.nama || l.wa}`, alasan: o.alasan || '', lampiran: o.lampiran || '' });
      console.log(a.id + ' ' + a.status + (a.masalah.length ? ' :: ' + a.masalah.join('; ') : ''));
    },
    edit: async () => { // agent boleh memperbaiki isi selama masih usulan
      const a = await muat('aksi', id), isi = isiDari();
      if (a.status !== 'usulan') die('Hanya aksi berstatus usulan yang bisa diedit');
      if (isi === null) die('Wajib --isi atau --isi-file');
      a.isi = isi; a.masalah = await periksaTeks(a.unit, isi); if (a.masalah.length) a.risiko = 'tinggi';
      catat(a, 'usulan', o.by || 'agent', 'Isi diedit'); await simpan('aksi', a); console.log('OK ' + id + (a.masalah.length ? ' :: ' + a.masalah.join('; ') : ''));
    },
    setujui: async () => { await setujuiAksi(id, o.by, { isi: isiDari(), paksa: !!o.paksa, note: o.note }); console.log('DISETUJUI ' + id); },
    tolak: async () => { await tolakAksi(id, o.by, o.note); console.log('DITOLAK ' + id); },
    ulang: async () => { await ulangAksi(id, o.by); console.log('DISETUJUI ' + id); },
  },
  lead: {
    baru: async () => {
      const wa = nomorWA(o.wa), u = unit(o.unit);
      const dup = (await semua('leads')).find((l) => l.unit === u && l.wa === wa); if (dup) die('Lead dengan nomor ini sudah ada: ' + dup.id);
      const l = { id: idBaru('lead'), unit: u, nama: o.nama || '', wa, sumber: o.sumber || 'manual', kebutuhan: o.kebutuhan || '', tahap: 'baru', nilai: +o.nilai || 0, followup_ke: 0, consent: o.consent || 'manual', dibuat: iso(), riwayat: [] };
      catat(l, 'baru', o.by || 'agent'); await simpan('leads', l); console.log(l.id);
    },
    set: async () => {
      const l = await muat('leads', id);
      for (const f of ['nama', 'kebutuhan', 'perusahaan', 'lokasi', 'catatan']) if (o[f]) l[f] = o[f];
      if (o.nilai) l.nilai = +o.nilai;
      if (o.tahap) { if (!TAHAP_LEAD.includes(o.tahap)) die('Tahap: ' + TAHAP_LEAD.join(', ')); catat(l, o.tahap, o.by || 'agent', o.note); l.tahap = o.tahap; }
      if (o.optout) l.optout = true;
      await simpan('leads', l); console.log('OK ' + id);
    },
    list: async () => tabel((await semua('leads')).filter((l) => (!o.unit || l.unit === o.unit) && (!o.tahap || l.tahap === o.tahap))
      .map((l) => [l.id, l.unit, l.tahap, l.nama || '-', l.wa, l.nilai || 0, l.perlu_balasan ? 'PERLU BALASAN' : ''])),
    show: async () => console.log(JSON.stringify(await muat('leads', id), null, 2)),
  },
  klien: {
    baru: async () => {
      const k = { id: idBaru('klien'), nama: o.nama || die('Wajib --nama'), wa: o.wa ? nomorWA(o.wa) : '', jenis: o.jenis === 'op' ? 'op' : 'badan',
        skala: ['kecil', 'menengah', 'besar'].includes(o.skala) ? o.skala : 'kecil', pkp: o.pkp === 'ya', layanan: daftar(o.layanan), vo_berakhir: o['vo-berakhir'] || '', dibuat: iso() };
      await simpan('klien', k); console.log(k.id);
    },
    set: async () => {
      const k = await muat('klien', id);
      if (o.wa) k.wa = nomorWA(o.wa); if (o.layanan) k.layanan = daftar(o.layanan); if (o.pkp) k.pkp = o.pkp === 'ya';
      if (o.skala) k.skala = o.skala; if (o['vo-berakhir']) k.vo_berakhir = o['vo-berakhir']; if (o.nonaktif) k.nonaktif = true;
      await simpan('klien', k); console.log('OK ' + id);
    },
    list: async () => tabel((await semua('klien')).map((k) => [k.id, k.nama, k.jenis, k.skala, k.pkp ? 'PKP' : '-', (k.layanan || []).join(','), k.vo_berakhir || '-'])),
    kalender: async () => tabel((await semua('klien')).filter((k) => !k.nonaktif).flatMap((k) => kewajibanKlien(k, hari(), +o.hari || 30))
      .sort((a, b) => a.jatuh_tempo.localeCompare(b.jatuh_tempo)).map((x) => [x.jatuh_tempo, `H-${x.sisa_hari}`, x.nama, x.label])),
  },
  job: {
    baru: async () => {
      const j = { id: idBaru('job'), pelanggan: o.pelanggan || die('Wajib --pelanggan'), unit_sn: o['unit-sn'] || '', teknisi: o.teknisi || '', spk: o.spk || '', kejadian: {}, dibuat: iso() };
      j.kejadian.spk_cek = o.at || iso(); await simpan('jobs', j); console.log(j.id);
    },
    catat: async () => {
      const j = await muat('jobs', id), e = _[3];
      if (!KEJADIAN.includes(e)) die('Kejadian: ' + KEJADIAN.join(', '));
      const at = o.at || iso(); if (isNaN(Date.parse(at))) die('--at harus ISO');
      j.kejadian[e] = at; (j.riwayat ||= []).push({ at: iso(), kejadian: e, waktu: at, oleh: o.by || 'agent' });
      await simpan('jobs', j); console.log(`OK ${id} ${e} -> tahap ${TAHAP_5P(j)}`);
    },
    list: async () => tabel((await semua('jobs')).map((j) => [j.id, TAHAP_5P(j), j.pelanggan, j.unit_sn || '-', j.teknisi || '-'])),
    sla: async () => {
      const v = (await semua('jobs')).flatMap((j) => cekJob(j)).filter((x) => o.semua || x.aktif);
      if (!v.length) console.log('Tidak ada pelanggaran SLA aktif');
      tabel(v.map((x) => [x.job, x.pelanggan, x.teknisi, x.aturan, `lewat ${x.lewat_jam} jam`]));
    },
  },
  armada: {
    baru: async () => {
      const u = { id: idBaru('unit'), pelanggan: o.pelanggan || die('Wajib --pelanggan'), wa: o.wa ? nomorWA(o.wa) : '', tipe: o.tipe || '', sn: o.sn || '',
        servis_terakhir: o['servis-terakhir'] || '', interval_hari: +o['interval-hari'] || 0, dibuat: iso() };
      await simpan('armada', u); console.log(u.id);
    },
    set: async () => { const u = await muat('armada', id); if (o['servis-terakhir']) u.servis_terakhir = o['servis-terakhir']; if (o['interval-hari']) u.interval_hari = +o['interval-hari']; if (o.wa) u.wa = nomorWA(o.wa); await simpan('armada', u); console.log('OK ' + id); },
    list: async () => tabel((await semua('armada')).map((u) => { const s = servisUnit(u); return [u.id, u.pelanggan, u.tipe, u.sn, s ? `servis ${s.jatuh_tempo} (H-${s.sisa_hari})` : 'interval belum diisi']; })),
  },
};

main(() => {
  const f = H[grup]?.[cmd];
  if (!f) { console.log('Pakai: ' + Object.entries(H).map(([g, c]) => `${g} ${Object.keys(c).join('|')}`).join('\n      ')); return; }
  return f();
});
