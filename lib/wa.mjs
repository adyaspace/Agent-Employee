// WhatsApp Business Platform (Cloud API resmi Meta). Bukan pustaka tidak resmi: nomor bisnis tidak berisiko diblokir karena otomasi ilegal.
// Biaya per pesan (Indonesia, efektif 1 Okt 2026): service Rp356,65; utility Rp356,65; marketing ±Rp586-667; + PPN 11%. Cek rate card Meta.
// Aturan jendela 24 jam: teks bebas hanya boleh dalam 24 jam sejak pesan terakhir pelanggan. Di luar itu wajib template yang disetujui Meta.
import crypto from 'node:crypto';
import { K, die, env } from './core.mjs';

export const graph = () => (process.env.META_API_BASE || 'https://graph.facebook.com') + '/' + (process.env.META_GRAPH_VERSION || 'v26.0');
export const cred = (unit) => ({
  phoneId: env('WA_PHONE_ID_' + K(unit)) || die(`Env WA_PHONE_ID_${K(unit)} belum diisi`),
  token: env('WA_TOKEN_' + K(unit)) || die(`Env WA_TOKEN_${K(unit)} belum diisi`),
});
export function unitDariPhoneId(id) {
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('WA_PHONE_ID_') && String(v).trim() === String(id)) return k.slice(12).toLowerCase().replace(/_/g, '-');
  return null;
}
export function dalamJendela(lastIn, ref = new Date()) {
  return !!lastIn && (new Date(ref) - new Date(lastIn)) < 24 * 36e5 - 5 * 6e4; // sisakan 5 menit
}
export function cekTandaTangan(raw, header, secret) {
  if (!secret) return false;
  const h = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(h), b = Buffer.from(String(header || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function kirimWA(unit, payload) {
  const { phoneId, token } = cred(unit);
  const r = await fetch(`${graph()}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(JSON.stringify(j.error || j).slice(0, 400) + ' (HTTP ' + r.status + ')');
  return j.messages?.[0]?.id || '';
}
export const teks = (to, body) => ({ to, type: 'text', text: { preview_url: false, body } });
export const tpl = (to, name, params = [], lang = 'id') => ({
  to, type: 'template',
  template: { name, language: { code: lang }, components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : [] },
});
