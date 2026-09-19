import type { Listing, Comp, Profile } from './types.js';

export const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const pmt = (loan: number, ratePct: number, years: number) => {
  const i = ratePct / 1200, k = years * 12;
  return i ? (loan * i) / (1 - (1 + i) ** -k) : loan / k;
};
/** SARS transfer duty, effective 1 Apr 2025 and unchanged for 2026/27. */
export const transferDuty = (v: number) => {
  const t: [number, number, number][] = [[13_310_000, 1_241_456, .13], [2_994_800, 106_784, .11], [2_329_300, 53_544, .08], [1_663_800, 13_614, .06], [1_210_000, 0, .03]];
  for (const [from, base, rate] of t) if (v > from) return Math.round(base + (v - from) * rate);
  return 0;
};

const Rz = (n: number) => 'R ' + Math.round(n).toLocaleString('en-ZA');
/** Cape Town residential rates: (market value - rates-free threshold) x rate. Sources conflict for 2026/27, so we bracket. */
const CT = [{ rate: .007159, exempt: 450_000 }, { rate: .007010, exempt: 605_000 }, { rate: .006428, exempt: 620_000 }];
export const impliedValue = (rates: number) => { const v = CT.map(t => rates * 12 / t.rate + t.exempt); return { low: Math.min(...v), high: Math.max(...v) }; };

export type Flag = { level: 'high' | 'medium' | 'info'; text: string };

export function decide(L: Listing, p: Profile, comps: Comp[] = []) {
  if (!L.price) throw new Error('No asking price found. Pass --price <rand> to supply it.');
  const price = L.price;
  const deposit = price * p.depositPct / 100, loan = price - deposit;
  const bond = pmt(loan, p.rate, p.termYears), bondPlus1 = pmt(loan, p.rate + 1, p.termYears);
  const duty = p.vatSale ? 0 : transferDuty(price);
  const fees = price * 0.03;            // guideline: attorney, deeds office and bond registration, excl. duty
  const reserve = price * 0.01 / 12;    // rule of thumb: 1% of value per year for maintenance
  const monthly = bond + (L.rates ?? 0) + (L.levy ?? 0) + reserve;
  const incomeNeeded = bond / 0.3;      // lenders commonly cap the instalment near 30% of gross income

  const perFloor = L.floorSqm ? price / L.floorSqm : undefined;
  const perErf = L.erfSqm ? price / L.erfSqm : undefined;
  const coverage = L.floorSqm && L.erfSqm ? L.floorSqm / L.erfSqm : undefined;

  const ok = comps.filter(c => c.price > 0), wf = ok.filter(c => c.floorSqm);
  const perM2 = !!L.floorSqm && wf.length >= 3, sample = perM2 ? wf.length : ok.length;
  let bench: { n: number; basis: string; value: number; gap: number; position: 'above' | 'in line' | 'below'; strength: 'strong' | 'moderate'; low: number } | undefined;
  if (sample >= 3) {
    const value = perM2 ? med(wf.map(c => c.price / c.floorSqm!)) * L.floorSqm! : med(ok.map(c => c.price));
    const gap = (price - value) / value;
    bench = { n: sample, basis: perM2 ? 'median R/m² of floor area' : 'median sale price', value, gap, low: value * 0.95,
      position: gap > .07 ? 'above' : gap < -.07 ? 'below' : 'in line', strength: sample >= 6 ? 'strong' : 'moderate' };
  }

  const bondRatio = p.grossIncome ? bond / p.grossIncome : undefined;
  const status = bondRatio && bondRatio > .33 ? 'Affordability stretch'
    : !bench ? 'Gather evidence'
    : bench.position === 'above' ? 'Negotiate' : bench.position === 'below' ? 'Priced below benchmark' : 'Priced in line';
  const summary: Record<string, string> = {
    'Affordability stretch': 'The instalment is above about a third of your gross income. Check what a lender would actually approve before viewing further.',
    'Gather evidence': 'Nothing here proves the price is fair yet. Add recent comparable sales (--comps) before you make an offer.',
    'Negotiate': 'Asking is meaningfully above the comparable benchmark. There is a case for negotiating, backed by the sales you supplied.',
    'Priced below benchmark': 'Asking is below the comparable benchmark. Find out why: condition, defects, title issues or a motivated seller.',
    'Priced in line': 'Asking is close to the comparable benchmark. Condition and running costs now decide the offer.',
  };

  const flags: Flag[] = [];
  if (!L.floorSqm) flags.push({ level: 'medium', text: 'Floor size is missing, so R/m² comparisons are not possible. Ask the agent for the measured floor area.' });
  if (L.titleType === 'unknown') flags.push({ level: 'medium', text: 'Title type is unclear. Freehold and sectional title carry very different costs and rules, so confirm which this is.' });
  if (L.levy === undefined && L.titleType !== 'freehold') flags.push({ level: L.titleType === 'sectional' ? 'high' : 'medium', text: 'No levy is stated. Sectional title levies can add thousands a month; also ask about special levies and the reserve fund.' });
  if (coverage && coverage > .8) flags.push({ level: 'medium', text: `Building covers about ${Math.round(coverage * 100)}% of the erf, leaving little outdoor space or room to extend.` });
  if (L.beds && L.baths && L.baths >= L.beds && L.titleType !== 'sectional') flags.push({ level: 'info', text: 'Bathrooms match or exceed bedrooms, which often follows renovations. Ask for approved building plans and confirm all additions are on them.' });
  if (!L.features.some(f => /solar|inverter|generator|borehole/.test(f))) flags.push({ level: 'info', text: 'No backup power or water is listed. Budget for an inverter or solar if load-shedding or outages matter to you.' });
  if (p.depositPct < 10) flags.push({ level: 'medium', text: 'A deposit below 10% may mean a higher rate or a tighter approval.' });
  if (bondRatio && bondRatio > .3) flags.push({ level: 'high', text: `The instalment is ${Math.round(bondRatio * 100)}% of your gross income. Lenders typically want closer to 30%.` });
  if (!bench) flags.push({ level: 'high', text: 'No comparable sales supplied: price fairness is unproven.' });

  const questions = [
    'What did similar homes on this street sell for in the last 12 months, and how long did they take to sell?',
    'Why is the owner selling, and how long has it been on the market? Has the price dropped?',
    L.titleType === 'sectional' || L.titleType === 'unknown' ? 'What are the monthly levies, any special levies, and is the body corporate financially healthy (minutes and financials)?' : 'Are there any servitudes or building-line restrictions on the title deed?',
    'Are there approved building plans and an occupancy certificate for the whole structure?',
    'Are there electrical, plumbing, beetle, damp and roof compliance certificates, and who pays for them?',
    'What is included in the sale (fittings, appliances, solar, alarm)? What is the occupation date?',
    ...(!L.floorSqm ? ['What is the measured floor area?'] : []),
  ];

  const has = (k: keyof Listing) => L[k] !== undefined || (k === 'levy' && L.titleType === 'freehold');
  const keys: (keyof Listing)[] = ['price', 'floorSqm', 'erfSqm', 'rates', 'levy', 'beds', 'baths'];
  const readiness = Math.round(keys.filter(has).length / keys.length * 55) + (L.titleType !== 'unknown' ? 5 : 0) + (bench ? (bench.strength === 'strong' ? 40 : 25) : 0);

  const rent = p.monthlyRent ? {
    grossYield: p.monthlyRent * 12 / price,
    netYield: (p.monthlyRent * 12 - ((L.rates ?? 0) + (L.levy ?? 0)) * 12 - price * 0.01) / price,
    cashflow: p.monthlyRent - monthly,
  } : undefined;

  const interest1 = loan * p.rate / 1200, principal1 = bond - interest1;
  const ownCost = interest1 + (L.rates ?? 0) + (L.levy ?? 0) + reserve;   // owning cost before principal
  const uplift = (1 + (duty + fees) / price) / (1 - 0.06) - 1;             // assumes ~6% selling costs
  const breakEven = [3, 6, 9].map(g => ({ g, years: Math.log(1 + uplift) / Math.log(1 + g / 100) }));
  const grid = [0, 10, 20].map(dep => ({ dep, cells: [-1, 0, 1, 2].map(dr => pmt(price * (1 - dep / 100), p.rate + dr, p.termYears)) }));
  const implied = p.city === 'ct' && L.rates ? impliedValue(L.rates) : undefined;
  if (implied && price > implied.high * 1.05) flags.push({ level: 'medium', text: `Asking is ${Math.round((price / implied.high - 1) * 100)}% to ${Math.round((price / implied.low - 1) * 100)}% above the ${Rz(implied.low)} to ${Rz(implied.high)} municipal value implied by the rates bill. Municipal values lag the market, so this is not proof of overpricing, but it is a reason to see recent sales before offering.` });
  if (L.features.some(f => /victorian|fireplace|wooden floors|sash|pressed ceiling/.test(f))) flags.push({ level: 'medium', text: 'Period features suggest an older house. Budget for roof, damp, wiring, plumbing and timber-pest checks, and ask whether heritage rules limit alterations (structures over 60 years old generally need a permit under the National Heritage Resources Act).' });
  const plan = [
    `Get a bond pre-approval first. This price needs about ${Rz(incomeNeeded)} gross a month at 30%, and ${Rz(pmt(loan, p.rate + 2, p.termYears) / 0.3)} if rates rise 2 points.`,
    bench ? 'Use your comparable sales in the offer, and keep the list to show the agent.' : `Get 3 to 6 recent sales of similar homes nearby (agent, Lightstone or Windeed) and re-run with --comps.${implied ? ' Also check the City valuation roll for this address.' : ''}`,
    'Make the offer subject to a building inspection and the compliance certificates below, not just to bond approval.',
  ];
  return { interest1, principal1, ownCost, uplift, breakEven, grid, implied, plan, ct: p.city === 'ct', L, p, price, deposit, loan, bond, bondPlus1, duty, fees, reserve, monthly, incomeNeeded, bondRatio, perFloor, perErf, coverage, bench, status, summary: summary[status], flags, questions, readiness, rent, upfront: deposit + duty + fees };
}
export type Decision = ReturnType<typeof decide>;
