#!/usr/bin/env node
// Kirim aksi WA yang disetujui. Bawaan dry-run. Kirim sungguhan butuh --live DAN KARYAWAN_LIVE=1.
//   node bin/kirim.mjs                 dry-run semua aksi disetujui
//   node bin/kirim.mjs <id>            dry-run satu aksi
//   KARYAWAN_LIVE=1 node bin/kirim.mjs --live
import { loadEnv, args, main, die } from '../lib/core.mjs';
import { kirimAksi, kirimSemua } from '../lib/kirim.mjs';
loadEnv();
const { _, o } = args(process.argv.slice(2));
main(async () => {
  const live = !!o.live;
  if (live && process.env.KARYAWAN_LIVE !== '1') die('--live ditolak: set KARYAWAN_LIVE=1 (hanya di server atau shell manusia).');
  const out = _[0] ? [await kirimAksi(_[0], { live })] : await kirimSemua({ live });
  console.log(out.length ? out.join('\n') : 'Tidak ada aksi disetujui yang menunggu kirim');
});
