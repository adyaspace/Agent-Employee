#!/usr/bin/env node
// CS WhatsApp: draf balasan untuk lead yang menunggu. Lihat lib/cs.mjs.
//   node bin/cs-draft.mjs            proses semua lead perlu_balasan
//   node bin/cs-draft.mjs --lead ID  satu lead
import { loadEnv, args, main } from '../lib/core.mjs';
import { prosesLead, prosesSemua } from '../lib/cs.mjs';
loadEnv();
const { o } = args(process.argv.slice(2));
main(async () => {
  const out = o.lead ? [await prosesLead(o.lead)] : await prosesSemua();
  if (!out.length) return console.log('CS: tidak ada pesan yang menunggu balasan');
  for (const r of out) (r.galat ? console.error : console.log)(r.teks);
});
