// Harga resmi per unit. Adya Space: dibaca langsung dari tabel public.pricing_packages (sumber yang sama dengan website)
// bila Supabase tersedia; selain itu dari pengetahuan/<unit>/harga.md.
import { baca, pakaiSupabase, sbFetch } from './core.mjs';

let cache = { t: 0, teks: {} };
const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

async function dariWebsite() {
  const kat = await sbFetch('pricing_categories?select=id,name_id,sort_order&order=sort_order');
  const pk = await sbFetch('pricing_packages?is_active=eq.true&select=category_id,label_id,prefix_id,price,unit_id,desc_id,note_id,items_id,promo_starts_at,promo_ends_at,original_price,sort_order&order=sort_order');
  const now = Date.now(), L = ['# Harga resmi Adya Space (live dari tabel pricing_packages website)', ''];
  for (const c of kat) {
    const isi = pk.filter((p) => p.category_id === c.id);
    if (!isi.length) continue;
    L.push(`## ${c.name_id}`);
    for (const p of isi) {
      const promo = p.original_price && (!p.promo_starts_at || Date.parse(p.promo_starts_at) <= now) && (!p.promo_ends_at || Date.parse(p.promo_ends_at) >= now);
      const harga = p.price == null ? 'Hubungi kami (tidak ada harga tetap; jangan sebut angka)' : `${p.prefix_id || ''} ${rp(p.price)}${(p.unit_id || '').trim() ? ' ' + p.unit_id.trim() : ''}`.trim() + (promo ? ` (promo, harga normal ${rp(p.original_price)})` : '');
      L.push(`- ${p.label_id}: ${harga}. ${p.desc_id || ''}${(p.items_id || []).length ? ' Termasuk: ' + p.items_id.join('; ') + '.' : ''}${p.note_id ? ' Catatan: ' + p.note_id : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}

export async function hargaResmi(unit) {
  if (Date.now() - cache.t > 5 * 60e3) cache = { t: Date.now(), teks: {} };
  if (cache.teks[unit] !== undefined) return cache.teks[unit];
  let t = '';
  if (unit === 'adyaspace' && pakaiSupabase() && process.env.HARGA_DARI_WEBSITE !== '0') {
    try { t = await dariWebsite(); } catch (e) { console.error('Gagal membaca pricing_packages, pakai harga.md:', e.message); }
  }
  return (cache.teks[unit] = t || baca(`pengetahuan/${unit}/harga.md`));
}
