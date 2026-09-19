# Property Decision Engine

Paste a property listing URL, get a buyer decision report (HTML + JSON): true monthly and upfront cost, affordability, price-fairness verdict from comparable sales you supply, red flags, and questions to ask the agent.

## How it works
1. **Render** (`src/extract.ts`): Playwright loads the page like a browser.
2. **Extract**: JSON-LD first, then text patterns. Optional Claude pass fills only fields still missing, and only explicit values. Every field is tagged with its source; missing fields stay "Not found", never guessed.
3. **Decide** (`src/decide.ts`): SARS 2026/27 transfer duty, bond maths, cost of ownership, comps benchmark (needs 3+ comps; median R/m² when floor size is known), flags, readiness score.
4. **Report** (`src/report.ts`): a single self-contained HTML file.

## Setup
```bash
npm install
npx playwright install chromium
cp .env.example .env        # optional: add ANTHROPIC_API_KEY
npm test                    # 6 Cucumber scenarios
```

## Use
```bash
npm run analyze -- https://www.property24.com/... --income 90000 --comps comps.json
npm run analyze -- <url> --html saved-page.html   # if a site blocks automation, save the page from your browser
npm run analyze -- <url> --floor 130 --levy 900   # fill in what the agent tells you
```
Flags: `--profile --deposit --rate --term --income --rent --vat --comps --price --floor --erf --levy --rates --html`.
Default rate is prime (10.5% at last check); use your bank's quote.

## Ready for market checklist
- [x] Local setup, typecheck, passing Cucumber suite (decision maths, extraction)
- [x] CI (`.github/workflows/ci.yml`)
- [ ] Live-site extraction tests with Playwright against saved Property24 / PrivateProperty pages
- [ ] Dockerfile + hosted API (wrap `decide()` in a route) before any public launch
- [ ] Confirm each portal's terms permit automated access; this tool is built for one listing at a time, for personal use
- [ ] Comps source: Lightstone/Windeed integration or agent CSV import

## Next sprint
Per-portal adapters (Property24, PrivateProperty, Gumtree), CSV comps import, suburb price trend, PDF export.

*Decision support only. Not a valuation or financial, tax or legal advice.*
