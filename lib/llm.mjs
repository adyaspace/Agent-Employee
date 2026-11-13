// Panggilan Claude API + perhitungan biaya. Harga per juta token (USD) ada di aturan/tim.json.
import { die, baca } from './core.mjs';

export function tarif() { try { return JSON.parse(baca('aturan/tim.json') || '{}').harga_per_juta_token_usd || {}; } catch { return {}; } }
export function biayaUSD(model, u = {}) {
  const t = tarif()[model];
  if (!t) return null;
  const masuk = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const kali = t.ambang_prompt && masuk > t.ambang_prompt ? (t.kali_di_atas_ambang || 1) : 1;
  return ((u.input_tokens || 0) * t.input + (u.output_tokens || 0) * t.output
    + (u.cache_read_input_tokens || 0) * (t.cache_read ?? t.input) + (u.cache_creation_input_tokens || 0) * (t.cache_write ?? t.input)) * kali / 1e6;
}

// system: string; messages: [{role, content}]. Mengembalikan { teks, usage, model, biaya_usd }.
export async function tanya({ model, system, messages, max_tokens = 1500 }) {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim() || die('ANTHROPIC_API_KEY belum diisi');
  const r = await fetch((process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // system sebagai blok dengan cache_control: pengetahuan bisnis yang sama tidak ditagih penuh berulang-ulang
    body: JSON.stringify({ model, max_tokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API: ' + JSON.stringify(j.error || j).slice(0, 300));
  const teks = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { teks, usage: j.usage || {}, model, biaya_usd: biayaUSD(model, j.usage || {}) };
}
// Ambil objek JSON pertama dari teks model (toleran terhadap teks pembuka atau pagar ```).
export function jsonDari(teks) {
  const s = String(teks || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
