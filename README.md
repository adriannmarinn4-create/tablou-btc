# Tablou BTC

Aplicație pentru telefon (se instalează din Chrome) care adună date despre Bitcoin din surse gratuite și dă pentru fiecare modul o concluzie după **reguli fixe**, fără AI. Regula care a dat concluzia apare în fiecare card.

**Aplicația:** https://adriannmarinn4-create.github.io/tablou-btc/

## Cum o instalezi pe Android

1. Deschide linkul de mai sus în Chrome.
2. Meniul ⋮ → **Instalează aplicația** (sau **Adaugă pe ecranul de pornire**).
3. Apare ca aplicație normală, cu iconița ₿. Se actualizează singură.

## Cum funcționează

- `scripts/colecteaza.mjs` citește sursele, aplică regulile și scrie `tablou.json`.
- Sarcina programată `.github/workflows/actualizare.yml` rulează la 30 de minute, la fiecare modificare pe `main` și la cerere (fila **Actions** → **Actualizare date** → **Run workflow**).
- Rezultatul (aplicația + `tablou.json`) se publică pe ramura `site`, iar GitHub Pages îl servește de acolo.
- Prețul din antet vine direct de la Binance, la fiecare minut cât aplicația e deschisă.
- Dacă o sursă nu răspunde, modulul păstrează datele de la rularea trecută și arată de când sunt.

Test fără rețea, cu date simulate: `node scripts/colecteaza.mjs --mock --out=/tmp/tablou.json`

## Verdictul

Fiecare modul dă un scor între −2 și +2 după praguri fixe; scorul modulului e media semnalelor lui.

- **Termen lung** (module 2, 3, 4, 15, 16, 17) → termometru 0–100 = 50 − 25 × media. 0–20 foarte ieftin · 20–40 zonă de acumulare · 40–60 neutru · 60–80 scump · 80–100 foarte scump.
- **Termen scurt** (module 6, 7, 8, 9, 19, 20, 28) → negativ dacă media ≤ −0,5, pozitiv dacă ≥ +0,5, altfel neutru.
- **Informative**, fără scor: 10 Influențatori, 18 Randamente, 24 Pariuri (Polymarket), 25 Rețea, 27 Lei și euro, companiile-trezorerie din modulul 6, aurul, M2 și corelațiile din modulul 7.

| Nr. | Modul | Regula |
|---|---|---|
| 2 | Curcubeu | benzile 1–2 → +2 · 3–4 → +1 · 5 → 0 · 6–7 → −1 · 8–9 → −2 |
| 3 | On-chain | MVRV < 1 → +2 … > 3,5 → −2 · Mayer < 0,8 → +2 … > 2,4 → −2 · sub media de 200 de săptămâni → +2 |
| 4 | Minerii | Hash Ribbons (media 30 z < media 60 z) → +1 · Puell < 0,8 → +1 (< 0,5 → +2) · hashprice < 35 $/PH/zi → +1 |
| 6 | ETF | suma fluxurilor nete pe 10 sesiuni: ieșiri > 1 mld $ → −2 · 0,5–1 mld $ → −1 · intrări 0,5–1 mld $ → +1 · > 1 mld $ → +2 |
| 7 | Macro | Fed după pariuri (creștere −1, scădere +1, pauză 0) · DXY peste media de 200 z −1, sub +1 · randament 10 ani ±0,25 pp în 3 luni → −1 / +1 · S&P 500 sub media de 50 z −1, peste +1 · media |
| 8 | Sentiment | Fear & Greed < 20 → +1, > 80 → −1 · funding negativ → +1, > 0,03% pe 8 h → −1 |
| 9 | Știri | categoria din cuvinte-cheie (ETF, Fed, reglementare = impact mare ×2; securitate, companii, mineri, bănci = ×1) · sensul din liste fixe de cuvinte în titlu (ambele = mixtă) · scor = 2 × media ponderată pe 48 h · aceeași poveste contează o dată · sub 3 știri → 0 |
| 15 | Capitalizare | sub media de 200 de zile → +1 (peste ea cu > 50% → −1) · cu > 40% sub vârf → +1 |
| 16 | Power Law | sub podea → +2 · până la 1,5× podea → +1 · până la linia centrală → 0 · până la 2× centrul → −1 · peste → −2 |
| 17 | Ciclu | zile de la halving: 0–365 → +1 · 366–550 → −2 · 551–750 → −1 · 751–1.000 → +2 · peste 1.000 → +1 |
| 19 | Volatilitate | percentila DVOL pe 1 an ≥ 90 → +1 · ≤ 10 → −1 |
| 20 | Derivate | prețul a scăzut în 30 z și OI-ul în BTC −5% → +1, +5% → −1 · lichidări long ≥ 3× short în 7 z → +1, invers −1 · media |
| 28 | Stablecoins | emisiune netă pe 30 z ≥ +2% → +1, ≤ −2% → −1 · SSR în cei mai de jos 20% din 2 ani → +1, în cei mai de sus 20% → −1 |

## Surse (toate gratuite)

Coin Metrics Community (preț, capitalizare, MVRV, emisie) · mempool.space (hashrate, dificultate, Lightning, comisioane) · Deribit (DVOL) · DefiLlama (stablecoins) · alternative.me (Fear & Greed) · Binance / OKX / Bybit (funding) · CoinPaprika (dominanță) · btcnodes.io (noduri) · BNR, preluat prin API-ul cursbnr.ro (curs lei, euro, dolar; rezerve: XML-ul BNR pe 10 zile, apoi BCE prin Frankfurter) · Coinbase / Kraken (preț) · Kraken (PAXG, pentru aur) · BCE prin Frankfurter (DXY calculat cu formula ICE) · Polymarket, Gamma API (pariuri) · CoinGecko (companii-trezorerie) · știri prin RSS: CoinDesk, Cointelegraph, The Block, Decrypt, Bitcoin Magazine, Bitcoin.com, Google News.

Pe serverele GitHub (în SUA) Binance Futures răspunde cu HTTP 451, așa că funding-ul vine de obicei de la OKX. Farside (fluxurile ETF) blochează serverele GitHub, iar datele ETF de la DefiLlama sunt plătite, așa că fluxurile ETF vin de la SoSoValue.

### Cheile gratuite

Stau în **Settings → Secrets and variables → Actions → Repository secrets**, niciodată în cod. Dacă una lipsește sau expiră, se oprește doar modulul ei.

| Secret | Pentru | Limită | Cât folosește aplicația |
|---|---|---|---|
| `SOSOVALUE_API_KEY` | 6 · fluxurile ETF | 10.000 de cereri pe lună | cel mult o cerere la 2 ore, plus fondurile o dată pe zi |
| `COINALYZE_API_KEY` | 20 · OI și lichidări pe toate bursele | 40 pe minut (fiecare piață contează separat) | o dată la 2 ore, cu o pauză de ~1 minut |
| `FRED_API_KEY` | 7 · dobânda Fed, randamentul pe 10 ani, S&P 500, M2 | fără limită lunară | 5 cereri la fiecare rulare |

Regulile pentru știri sunt în `scripts/stiri.mjs`: categoriile, listele de cuvinte, concluziile fixe și numele urmărite (Saylor, Warsh, Trump, Fink, Musk, Cathie Wood, CZ).

## Calendar

Expirările de opțiuni, ajustarea dificultății și halvingul se calculează singure. Datele Fed, CPI și NFP stau în `scripts/evenimente.json`; adaugă-le acolo când apar calendarele noi. La FOMC apar și cotele de pe Polymarket.

## Etape

1. **Gata:** aplicația, modulele fără cheie, actualizarea automată, cursul BNR, calendarul de bază.
2. **Gata:** știri din RSS cu reguli de cuvinte-cheie, influențatori din presă, pariuri Polymarket, companii-trezorerie.
3. **Gata:** modulele cu chei gratuite: SoSoValue (fluxuri ETF), Coinalyze (derivate pe toate bursele) și FRED (macro, cu DXY, aur și corelații).

Informații, nu sfaturi financiare.
