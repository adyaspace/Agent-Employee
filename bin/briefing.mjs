#!/usr/bin/env node
// Briefing pagi. Menulis data/briefing/YYYY-MM-DD.md (mode lokal) dan mencetaknya.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, main, DATA, pakaiSupabase } from '../lib/core.mjs';
import { buatBriefing } from '../lib/briefing.mjs';
loadEnv();
main(async () => {
  const b = await buatBriefing();
  if (!pakaiSupabase()) { const dir = path.join(DATA(), 'briefing'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, b.tanggal + '.md'), b.teks); }
  console.log(b.teks);
});
