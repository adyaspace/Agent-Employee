#!/usr/bin/env node
// Penerbit deterministik (tanpa AI). Bawaan = dry-run. Tayang sungguhan butuh --live DAN KONTEN_LIVE=1.
//   node scripts/publish.mjs <id>          dry-run satu item
//   node scripts/publish.mjs --due         dry-run semua yang jatuh tempo
//   KONTEN_LIVE=1 node scripts/publish.mjs --due --live
import { loadEnv, CHANNELS, args, load, save, all, die, now, day, log, validate, compose } from './lib.mjs';
loadEnv();
const { _, o } = args(process.argv.slice(2));
const LIVE = !!o.live;
if (LIVE && process.env.KONTEN_LIVE !== '1') die('--live ditolak: set KONTEN_LIVE=1 (hanya di cron VPS atau shell manusia).');
const GR = (process.env.META_API_BASE || 'https://graph.facebook.com') + '/' + (process.env.META_GRAPH_VERSION || 'v26.0');
const TH = (process.env.THREADS_API_BASE || 'https://graph.threads.com') + '/v1.0';
const MAXDAY = +(process.env.MAX_POSTS_PER_DAY || 3), POLL = +(process.env.POLL_MS || 3000);
const K = (b) => b.toUpperCase().replace(/-/g, '_');
const cred = (n, b) => process.env[`${n}_${K(b)}`] || die(`Env ${n}_${K(b)} belum diisi di .env`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, url, p = {}) {
  const u = method === 'GET' ? url + '?' + new URLSearchParams(p) : url;
  const r = await fetch(u, method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(JSON.stringify(j.error || j) + ' (HTTP ' + r.status + ')');
  return j;
}
async function ready(url, field, token) { // tunggu container FINISHED
  for (let i = 0; i < 20; i++) {
    const s = (await http('GET', url, { fields: field, access_token: token }))[field];
    if (s === 'FINISHED' || s === 'PUBLISHED') return s;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error('Container ' + s);
    await sleep(POLL);
  }
  throw new Error('Container belum siap setelah menunggu');
}
async function link(base, id, token) { try { return (await http('GET', `${base}/${id}`, { fields: 'permalink', access_token: token })).permalink || ''; } catch { return ''; } }
const PUB = {
  async threads(it, st) {
    const uid = cred('THREADS_USER_ID', it.brand), tok = cred('THREADS_TOKEN', it.brand), m = it.media || [];
    if (!st.creation_id) {
      const p = { text: compose(it), access_token: tok };
      if (m.length) { p.media_type = 'IMAGE'; p.image_url = m[0]; } else p.media_type = 'TEXT';
      st.creation_id = (await http('POST', `${TH}/${uid}/threads`, p)).id; it.publish = st; save(it);
    }
    await ready(`${TH}/${st.creation_id}`, 'status', tok);
    const id = (await http('POST', `${TH}/${uid}/threads_publish`, { creation_id: st.creation_id, access_token: tok })).id;
    return { id, url: await link(TH, id, tok) };
  },
  async instagram(it, st) {
    const uid = cred('IG_USER_ID', it.brand), tok = cred('IG_TOKEN', it.brand), m = it.media || [];
    if (!st.creation_id) {
      if (m.length > 1) {
        const kids = [];
        for (const url of m) kids.push((await http('POST', `${GR}/${uid}/media`, { image_url: url, is_carousel_item: 'true', access_token: tok })).id);
        for (const k of kids) await ready(`${GR}/${k}`, 'status_code', tok);
        st.creation_id = (await http('POST', `${GR}/${uid}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: compose(it), access_token: tok })).id;
      } else st.creation_id = (await http('POST', `${GR}/${uid}/media`, { image_url: m[0], caption: compose(it), access_token: tok })).id;
      it.publish = st; save(it);
    }
    await ready(`${GR}/${st.creation_id}`, 'status_code', tok);
    const id = (await http('POST', `${GR}/${uid}/media_publish`, { creation_id: st.creation_id, access_token: tok })).id;
    return { id, url: await link(GR, id, tok) };
  },
  async facebook(it) {
    const pid = cred('FB_PAGE_ID', it.brand), tok = cred('FB_PAGE_TOKEN', it.brand), m = it.media || [];
    const r = m.length ? await http('POST', `${GR}/${pid}/photos`, { url: m[0], caption: compose(it), access_token: tok })
                       : await http('POST', `${GR}/${pid}/feed`, { message: compose(it), access_token: tok });
    const id = r.post_id || r.id; return { id, url: await link(GR, id, tok) };
  },
};
async function run(it) {
  if (it.status !== 'terjadwal') return console.log(`SKIP ${it.id}: status ${it.status}`);
  if (!it.approval?.by || !it.qa?.passed) return console.log(`SKIP ${it.id}: belum ada persetujuan manusia dan QA`);
  if (!CHANNELS[it.channel].auto) return console.log(`MANUAL ${it.id}: unggah ${it.channel} sendiri lalu: kq.mjs posted ${it.id} --by NAMA --url URL`);
  const probs = validate(it, true);
  if (probs.length) { log(it, 'gagal', 'publisher', probs.join('; ')); save(it); return console.log(`GAGAL ${it.id}: ${probs.join('; ')}`); }
  const today = all().filter((i) => i.status === 'tayang' && i.brand === it.brand && i.channel === it.channel && i.publish?.at && day(i.publish.at) === day(now())).length;
  if (today >= MAXDAY) return console.log(`TUNDA ${it.id}: batas harian ${MAXDAY} untuk ${it.brand}/${it.channel} tercapai`);
  if (!LIVE) return console.log(`DRY-RUN ${it.id} -> ${it.channel}/${it.brand}\n${compose(it)}\nmedia: ${(it.media || []).join(', ') || '-'}`);
  const st = it.publish || {};
  try {
    const r = await PUB[it.channel](it, st);
    it.publish = { ...st, post_id: r.id, url: r.url, at: now() }; log(it, 'tayang', 'publisher', r.url); save(it); console.log(`TAYANG ${it.id} ${r.url || r.id}`);
  } catch (e) { it.publish = st; log(it, 'gagal', 'publisher', String(e.message).slice(0, 400)); save(it); console.log(`GAGAL ${it.id}: ${e.message}`); }
}
if (o.due) { for (const it of all().filter((i) => i.status === 'terjadwal' && Date.parse(i.scheduled_at) <= Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) await run(it); }
else if (_[0]) await run(load(_[0]));
else die('Pakai: publish.mjs <id> | --due [--live]');
