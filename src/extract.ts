import type { Listing, Src } from './types.js';

/** Layer 1: render the page in a real browser (portals are JS-heavy and bot-sensitive). */
export async function render(url: string): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'en-ZA', userAgent: process.env.USER_AGENT || undefined });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    return await page.content();
  } finally { await browser.close(); }
}

export const toText = (h: string) => h
  .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&sup2;/g, '²').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const n = (s?: string) => { const v = s ? Number(s.replace(/[,.]\d{1,2}$/, '').replace(/[^\d]/g, '')) : NaN; return v > 0 ? v : undefined; };
const MONEY = String.raw`R\s?(\d{1,3}(?:[\s,]\d{3})+|\d+)`;

/** Layer 2: deterministic parsing. Priority: JSON-LD > visible text. Never invents values. */
export function parseListing(html: string, url: string): Listing {
  const L: Listing = { url, features: [], titleType: 'unknown', src: {} };
  const set = (k: string, v: unknown, s: Src) => {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !(v > 0))) return;
    if ((L as any)[k] === undefined) { (L as any)[k] = v; L.src[k] = s; }
  };
  for (const m of html.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o: any): void => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (!o || typeof o !== 'object') return;
        const off = Array.isArray(o.offers) ? o.offers[0] : o.offers;
        set('price', n(String(off?.price ?? '')), 'jsonld');
        set('beds', n(String(o.numberOfBedrooms ?? '')), 'jsonld');
        set('baths', n(String(o.numberOfBathroomsTotal ?? o.numberOfBathrooms ?? '')), 'jsonld');
        set('floorSqm', n(String(o.floorSize?.value ?? '')), 'jsonld');
        set('suburb', o.address?.addressLocality, 'jsonld');
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(m[1]));
    } catch { /* malformed JSON-LD: fall through to text */ }
  }
  const T = toText(html);
  const g = (re: RegExp) => T.match(re)?.[1];
  L.image = html.match(/property=["']og:image["'][^>]*content=["'](https?:[^"']+)/i)?.[1];
  L.title = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim();
  const firstBig = [...T.matchAll(new RegExp(String.raw`\b${MONEY}`, 'g'))].map(m => n(m[1])!).find(v => v >= 100_000);
  set('price', n(g(new RegExp(String.raw`(?:asking price|price)\s*:?\s*${MONEY}`, 'i'))) ?? firstBig, 'text');
  set('beds', n(g(/(\d+)\s*bed(?:room)?s?\b/i)), 'text');
  set('baths', parseFloat(g(/(\d+(?:\.\d)?)\s*bath(?:room)?s?\b/i) ?? ''), 'text');
  set('parking', n(g(/(\d+)\s*(?:parking|garages?|carports?)\b/i)), 'text');
  set('floorSqm', n(g(/floor\s*(?:size|area)\s*:?\s*(\d[\d\s]*?)\s*m/i)), 'text');
  set('erfSqm', n(g(/(?:erf|land|stand|plot)\s*(?:size|area)\s*:?\s*(\d[\d\s]*?)\s*m/i)), 'text');
  set('levy', n(g(new RegExp(String.raw`levies?\s*:?\s*${MONEY}`, 'i'))), 'text');
  set('rates', n(g(new RegExp(String.raw`rates(?:\s*(?:&|and)\s*taxes)?\s*:?\s*${MONEY}`, 'i'))), 'text');
  set('suburb', L.title?.match(/\bin ([A-Z][\w' -]+?)(?:,|\s[-|]|$)/)?.[1], 'text');
  L.propertyType = L.title?.match(/\b(house|apartment|flat|townhouse|cluster|duplex|studio|vacant land)\b/i)?.[1]?.toLowerCase();
  L.titleType = (L.levy ?? 0) > 0 || /sectional title|body corporate/i.test(T) || /apartment|flat|townhouse|cluster/.test(L.propertyType ?? '')
    ? 'sectional' : /freehold|free-standing|freestanding/i.test(T) ? 'freehold' : 'unknown';
  L.features = ['garden', 'fibre', 'pool', 'solar', 'inverter', 'generator', 'borehole', 'security', 'alarm', 'electric fence', 'pet friendly', 'balcony', 'braai', 'study', 'victorian', 'fireplace', 'wooden floors', 'sash', 'pressed ceiling']
    .filter(f => new RegExp(String.raw`\b${f}`, 'i').test(T));
  return L;
}

/** Layer 3 (optional): Claude reads only the text for fields still missing. Explicit values only. */
export async function llmFill(L: Listing, text: string): Promise<Listing> {
  const key = process.env.ANTHROPIC_API_KEY;
  const need = ['price', 'beds', 'baths', 'floorSqm', 'erfSqm', 'levy', 'rates'].filter(k => (L as any)[k] === undefined);
  if (!key || !need.length) return L;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MODEL || 'claude-sonnet-5', max_tokens: 300,
        messages: [{ role: 'user', content: `From this South African property listing text, return ONLY a JSON object with numeric values (rand or m²) for these keys if explicitly stated: ${need.join(', ')}. Omit any key not stated. Never estimate.\n\n${text.slice(0, 12_000)}` }],
      }),
    });
    const t = (await r.json() as any).content?.[0]?.text ?? '{}';
    const o = JSON.parse(t.replace(/```json|```/g, ''));
    for (const k of need) if (typeof o[k] === 'number' && o[k] > 0) { (L as any)[k] = o[k]; L.src[k] = 'llm'; }
  } catch (e) { console.warn('LLM fallback skipped:', (e as Error).message); }
  return L;
}
