import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { render, parseListing, toText, llmFill } from './extract.js';
import { decide } from './decide.js';
import { renderReport } from './report.js';
import type { Profile } from './types.js';

try { process.loadEnvFile(); } catch { /* .env is optional */ }
const a = process.argv.slice(2);
const flag = (k: string) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
const url = a.find(x => x.startsWith('http'));
if (!url) {
  console.error('Usage: npm run analyze -- <listing-url> [--profile first-time|investor|upgrader] [--deposit 10] [--rate 10.5] [--term 20]\n  [--income 60000] [--rent 25000] [--vat] [--city ct] [--comps comps.json] [--price N --floor N --erf N --levy N --rates N] [--html saved-page.html]');
  process.exit(1);
}
const html = flag('html') ? readFileSync(flag('html')!, 'utf8') : await render(url);
const L = await llmFill(parseListing(html, url), toText(html));
for (const [k, f] of [['price', 'price'], ['floorSqm', 'floor'], ['erfSqm', 'erf'], ['levy', 'levy'], ['rates', 'rates']] as const) {
  const v = Number(flag(f)); if (v > 0) { (L as any)[k] = v; L.src[k] = 'user'; }
}
const profile: Profile = {
  buyer: (flag('profile') as Profile['buyer']) ?? 'first-time', depositPct: Number(flag('deposit') ?? 10),
  rate: Number(flag('rate') ?? 10.5), termYears: Number(flag('term') ?? 20),
  grossIncome: flag('income') ? Number(flag('income')) : undefined, monthlyRent: flag('rent') ? Number(flag('rent')) : undefined, vatSale: a.includes('--vat'), city: flag('city') === 'ct' ? 'ct' : undefined,
};
const comps = flag('comps') ? JSON.parse(readFileSync(flag('comps')!, 'utf8')) : [];
const d = decide(L, profile, comps);
mkdirSync('reports', { recursive: true });
const slug = new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'listing';
writeFileSync(`reports/${slug}.html`, renderReport(d));
writeFileSync(`reports/${slug}.json`, JSON.stringify({ listing: L, status: d.status, readiness: d.readiness, bond: d.bond, upfront: d.upfront, flags: d.flags }, null, 2));
console.log(`${d.status} | readiness ${d.readiness}/100 | reports/${slug}.html`);
