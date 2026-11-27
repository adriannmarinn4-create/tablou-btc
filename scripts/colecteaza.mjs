#!/usr/bin/env node
/*
 * Tablou BTC — colectorul de date.
 *
 * Rulează în GitHub Actions la fiecare 30 de minute (.github/workflows/actualizare.yml).
 * Citește doar surse gratuite, fără chei, aplică regulile fixe (rezumate în README.md)
 * și scrie un singur fișier JSON pe care îl citește aplicația.
 *
 *   node scripts/colecteaza.mjs --out=site/tablou.json [--prev=vechi.json] [--mock] [--acum=ISO]
 *
 * --prev  fișierul de la rularea trecută: un modul a cărui sursă cade păstrează datele vechi
 * --mock  date simulate, pentru test fără rețea
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] ?? true;
}
const OUT = ARG.out || 'site/tablou.json';
const MOCK = Boolean(ARG.mock);
const ACUM = ARG.acum ? new Date(ARG.acum) : new Date();
const T = ACUM.getTime();
const mock = MOCK ? await import('./mock.mjs') : null;

// ---------------------------------------------------------------- utilitare
const ZI = 86400000;
const GENEZA = Date.UTC(2009, 0, 3);
const HALVINGURI = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].map(s => Date.parse(`${s}T00:00:00Z`));
const BLOC_HALVING_ANTERIOR = 840000;
const BLOC_HALVING_URMATOR = 1050000;
const zg = t => Math.round((t - GENEZA) / ZI); // zile de la blocul geneză (3 ian 2009)
const ziUTC = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const somn = ms => new Promise(r => setTimeout(r, ms));
const medie = a => a.reduce((s, x) => s + x, 0) / a.length;
const mediana = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const rot = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const sig = (v, s = 4) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(s)));
const fin = v => v != null && Number.isFinite(v);

function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
function indexLa(z, t) { // ultimul index cu z[i] <= t
  let lo = 0, hi = z.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (z[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function esantion(z, v, pas, deLa = -Infinity, fn = x => x) { // un punct la `pas` zile, ultimul punct = azi
  const out = [];
  for (let i = z.length - 1; i >= 0 && z[i] >= deLa; i -= pas) out.push([zg(z[i]), fn(v[i])]);
  return out.reverse();
}
const percentila = (vals, x) => (vals.filter(v => v <= x).length / vals.length) * 100;

// formatare în română
const MINUS = '−';
const NF = new Map();
const nf = (v, d = 0) => {
  if (!NF.has(d)) NF.set(d, new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return NF.get(d).format(v).replace('-', MINUS);
};
const semn = (v, d = 0) => (rot(v, d) > 0 ? '+' : rot(v, d) < 0 ? MINUS : '') + nf(Math.abs(v), d);
const pct = (v, d = 0) => `${semn(v, d)}%`;
const usd = v => `${nf(v, v < 100 ? 2 : 0)} $`;
const mld = (v, d) => `${nf(v / 1e9, d ?? (v >= 1e11 ? 0 : 1))} mld $`;
const scorTxt = s => (s == null ? '—' : (s > 0 ? '+' : s < 0 ? MINUS : '') + nf(Math.abs(s), Number.isInteger(s) ? 0 : 1));
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const LS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
const dataRo = t => { const d = new Date(t); return `${d.getUTCDate()} ${LS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const lunaAn = t => { const d = new Date(t); return `${LUNI[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const LOG = [];
const log = (...a) => { const s = a.join(' '); LOG.push(s); console.log(s); };

// ---------------------------------------------------------------- rețea
const UA = `tablou-btc/1.0 (+https://github.com/${process.env.GITHUB_REPOSITORY || 'tablou-btc'})`;
async function cere(url, { tip = 'json', incercari = 3, timeout = 30000 } = {}) {
  if (MOCK) return mock.raspuns(url, tip, T);
  let ultima;
  for (let i = 0; i < incercari; i++) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: tip === 'json' ? 'application/json' : '*/*' }, signal: ctl.signal });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.reincearca = r.status === 429 || r.status >= 500; throw e; }
      const txt = await r.text();
      return tip === 'json' ? JSON.parse(txt) : txt;
    } catch (e) {
      ultima = e;
      if (e.reincearca === false) break;
      if (i < incercari - 1) await somn(2500 * (i + 1));
    } finally { clearTimeout(tm); }
  }
  const u = new URL(url);
  throw new Error(`${u.host}${u.pathname}: ${ultima?.name === 'AbortError' ? 'timeout' : ultima?.message}`);
}
async function primaReusita(ce, variante) {
  const err = [];
  for (const [sursa, f] of variante) {
    try {
      const r = { ...(await f()), sursa };
      if (err.length) log(`${ce}: am folosit ${sursa}, după ${err.join(' | ')}`);
      return r;
    } catch (e) { err.push(`${sursa}: ${e.message}`); }
  }
  throw new Error(`${ce} — ${err.join(' | ')}`);
}

// ---------------------------------------------------------------- surse
const MP = 'https://mempool.space/api';

async function sursaPret() {
  return primaReusita('preț', [
    ['Coinbase', async () => {
      const j = await cere('https://api.exchange.coinbase.com/products/BTC-USD/stats');
      const last = +j.last, open = +j.open;
      if (!(last > 0 && open > 0)) throw new Error('răspuns gol');
      return { usd: last, schimbare24h: (last / open - 1) * 100 };
    }],
    ['Kraken', async () => {
      const j = await cere('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
      const k = Object.values(j.result || {})[0];
      if (!k) throw new Error('răspuns gol');
      return { usd: +k.c[0], schimbare24h: (+k.c[0] / +k.o - 1) * 100 };
    }],
    ['CoinPaprika', async () => {
      const q = (await cere('https://api.coinpaprika.com/v1/tickers/btc-bitcoin')).quotes.USD;
      return { usd: q.price, schimbare24h: q.percent_change_24h };
    }],
  ]);
}

async function coinMetrics(metrici, start = '2010-07-18') {
  let url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=${metrici.join(',')}`
    + `&frequency=1d&start_time=${start}&page_size=10000&paging_from=start`;
  const randuri = [];
  for (let p = 0; url && p < 8; p++) {
    const j = await cere(url);
    randuri.push(...(j.data || []));
    url = j.next_page_url;
  }
  randuri.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const serii = {};
  for (const m of metrici) {
    const z = [], v = [];
    for (const r of randuri) {
      const x = parseFloat(r[m]);
      if (Number.isFinite(x) && x > 0) { z.push(ziUTC(Date.parse(r.time))); v.push(x); }
    }
    serii[m] = { z, v };
  }
  return serii;
}
async function coinMetricsSigur(metrici, start) { // o metrică lipsă din planul gratuit nu le strică pe celelalte
  try { return await coinMetrics(metrici, start); } catch (e) {
    log(`Coin Metrics (${metrici.join(',')}): ${e.message} — încerc pe rând`);
    const serii = {};
    for (const m of metrici) {
      try { Object.assign(serii, await coinMetrics([m], start)); } catch (e2) { log(`  ${m}: ${e2.message}`); }
      await somn(700);
    }
    return serii;
  }
}

function parseBNR(xml, harta) {
  const re = /<Cube date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g;
  let m;
  while ((m = re.exec(xml))) {
    const u = /<Rate currency="USD"[^>]*>([\d.]+)</.exec(m[2]);
    const e = /<Rate currency="EUR"[^>]*>([\d.]+)</.exec(m[2]);
    if (u && e) harta.set(m[1], { usdRon: +u[1], eurRon: +e[1] });
  }
}
// Cursul oficial BNR pentru azi și pentru datele de care au nevoie randamentele în lei și euro.
// Datele vechi nu se mai schimbă, așa că le păstrez de la o rulare la alta (fxIstoric).
async function sursaCurs(datele, cache = {}) {
  const an = ACUM.getUTCFullYear();
  const cursBnr = async d => {
    const j = await cere(`https://www.cursbnr.ro/api/v1/rates?currency=EUR,USD${d ? `&date=${d}` : ''}`);
    return j?.rates?.EUR && j?.rates?.USD ? { data: j.date || d, usdRon: +j.rates.USD, eurRon: +j.rates.EUR } : null;
  };
  return primaReusita('curs', [
    ['BNR', async () => {
      const harta = new Map();
      const ult = await cursBnr(null);
      if (!ult) throw new Error('răspuns fără cursuri');
      harta.set(ult.data, { usdRon: ult.usdRon, eurRon: ult.eurRon });
      for (const d of datele) {
        if (cache[d]?.usdRon) { harta.set(d, cache[d]); continue; }
        for (let k = 0; k < 5; k++) { // weekend sau sărbătoare: ziua bancară de dinainte
          const dd = new Date(Date.parse(d) - k * ZI).toISOString().slice(0, 10);
          const x = await cursBnr(dd).catch(() => null);
          await somn(300);
          if (x) { harta.set(d, { usdRon: x.usdRon, eurRon: x.eurRon }); break; }
        }
      }
      return { harta };
    }],
    ['BNR (XML)', async () => {
      const harta = new Map();
      parseBNR(await cere('https://www.bnr.ro/nbrfxrates10days.xml', { tip: 'text' }), harta);
      if (!harta.size) throw new Error('fișier fără cursuri');
      return { harta };
    }],
    ['BCE (Frankfurter)', async () => {
      const j = await cere(`https://api.frankfurter.dev/v1/${an - 1}-01-01..?base=USD&symbols=EUR,RON`);
      const harta = new Map();
      for (const [d, x] of Object.entries(j.rates || {})) if (x.RON && x.EUR) harta.set(d, { usdRon: x.RON, eurRon: x.RON / x.EUR });
      if (harta.size < 5) throw new Error('răspuns gol');
      return { harta };
    }],
  ]);
}

async function sursaMempool() {
  const [dif, hr, tip, fees, mem, rew, lnL, ln1y] = await Promise.allSettled([
    cere(`${MP}/v1/difficulty-adjustment`),
    cere(`${MP}/v1/mining/hashrate/1y`),
    cere(`${MP}/blocks/tip/height`, { tip: 'text' }),
    cere(`${MP}/v1/fees/recommended`),
    cere(`${MP}/mempool`),
    cere(`${MP}/v1/mining/reward-stats/144`),
    cere(`${MP}/v1/lightning/statistics/latest`),
    cere(`${MP}/v1/lightning/statistics/1y`),
  ]);
  const val = x => (x.status === 'fulfilled' ? x.value : (log(`mempool: ${x.reason.message}`), null));
  return { dif: val(dif), hr: val(hr), inaltime: tip.status === 'fulfilled' ? parseInt(tip.value, 10) : null, fees: val(fees), mem: val(mem), rew: val(rew), lnL: val(lnL), ln1y: val(ln1y) };
}

async function sursaDvol() {
  const start = T - 420 * ZI;
  const j = await cere(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp=${start}&end_timestamp=${T}&resolution=1D`);
  const date = (j.result?.data || []).map(r => [ziUTC(r[0]), +r[4]]).filter(r => r[1] > 0).sort((a, b) => a[0] - b[0]);
  if (date.length < 30) throw new Error('prea puține puncte DVOL');
  return date;
}

async function sursaFng() {
  const j = await cere('https://api.alternative.me/fng/?limit=31&format=json');
  const d = (j.data || []).map(x => ({ v: +x.value, c: x.value_classification, t: +x.timestamp * 1000 })).sort((a, b) => a.t - b.t);
  if (!d.length) throw new Error('răspuns gol');
  return d;
}

async function sursaFunding() { // rata de finanțare pe 8 ore, ca fracție
  return primaReusita('funding', [
    ['Binance', async () => ({ rata: +(await cere('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT')).lastFundingRate })],
    ['OKX', async () => ({ rata: +(await cere('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')).data[0].fundingRate })],
    ['Bybit', async () => ({ rata: +(await cere('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT')).result.list[0].fundingRate })],
    ['Deribit', async () => ({ rata: +(await cere(`https://www.deribit.com/api/v2/public/get_funding_rate_value?instrument_name=BTC-PERPETUAL&start_timestamp=${T - 8 * 3600000}&end_timestamp=${T}`)).result })],
  ]).then(r => { if (!Number.isFinite(r.rata)) throw new Error('funding invalid'); return r; });
}

async function sursaStablecoins() {
  const [tot, lista] = await Promise.all([
    cere('https://stablecoins.llama.fi/stablecoincharts/all'),
    cere('https://stablecoins.llama.fi/stablecoins?includePrices=true'),
  ]);
  const serie = tot.map(r => [ziUTC(+r.date * 1000), Object.values(r.totalCirculatingUSD || {}).reduce((s, x) => s + (+x || 0), 0)])
    .filter(r => r[1] > 0).sort((a, b) => a[0] - b[0]);
  const gaseste = s => (lista.peggedAssets || []).find(a => a.symbol === s)?.circulating?.peggedUSD ?? null;
  return { serie, usdt: gaseste('USDT'), usdc: gaseste('USDC') };
}

async function sursaPaprika() {
  const g = await cere('https://api.coinpaprika.com/v1/global');
  return { dominanta: +g.bitcoin_dominance_percentage };
}

async function sursaNoduri() {
  const j = await cere('https://btcnodes.io/api/v1/snapshots/?limit=200');
  const d = (j.results || []).map(x => ({ t: +x.timestamp * 1000, n: +x.total_nodes })).filter(x => x.n > 0).sort((a, b) => a.t - b.t);
  if (!d.length) throw new Error('fără instantanee');
  return d;
}

// ---------------------------------------------------------------- reguli comune
const NUME = {
  2: 'Curcubeu', 3: 'On-chain', 4: 'Minerii', 15: 'Capitalizare', 16: 'Power Law', 17: 'Ciclu',
  18: 'Randamente', 19: 'Volatilitate', 25: 'Rețea', 27: 'Lei și euro', 28: 'Stablecoins', 8: 'Sentiment',
};
const TERMEN_LUNG = ['2', '3', '4', '15', '16', '17'];
const TERMEN_SCURT = ['6', '7', '8', '9', '19', '20', '28'];
const IN_CURAND = { 6: 'ETF (etapa 2)', 7: 'Macro (etapa 3)', 9: 'Știri (etapa 2)', 20: 'Derivate (etapa 3)' };
const medieScoruri = semnale => { const s = semnale.filter(fin); return s.length ? rot(medie(s), 2) : null; };

// ---------------------------------------------------------------- module
// 2 · Curcubeu
const BENZI = ['Vânzare la foc', 'Cumpără!', 'Acumulează', 'Încă ieftin', 'HODL', 'E o bulă?', 'FOMO', 'Vinde. Serios!', 'Bulă maximă'];
const SCOR_BANDA = [2, 2, 1, 1, 0, -1, -1, -2, -2];
const LIMITE = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8];
const CURCUBEU = { a: 2.4318, b: -16.2007 }; // log10(preț) = a × ln(zile de la geneză) + b
const mijlocCurcubeu = zile => 10 ** (CURCUBEU.a * Math.log(zile) + CURCUBEU.b);

function modulCurcubeu(D) {
  const p = D.pret.usd, m = mijlocCurcubeu(zg(T));
  const off = Math.log10(p / m);
  let b = 0;
  while (b < 8 && off >= LIMITE[b]) b++;
  const scor = SCOR_BANDA[b];
  const fata = (p / m - 1) * 100;
  const benzi = BENZI.map((nume, i) => ({ nume, de: i ? sig(m * 10 ** LIMITE[i - 1]) : null, pana: i < 8 ? sig(m * 10 ** LIMITE[i]) : null, scor: SCOR_BANDA[i] }));
  const jos = b > 0 ? m * 10 ** LIMITE[b - 1] : null;
  let concluzie = `prețul e în banda ${b + 1} din 9, „${BENZI[b]}”, cu ${nf(Math.abs(fata))}% ${fata < 0 ? 'sub' : 'peste'} mijlocul curcubeului (${scorTxt(scor)}).`;
  if (jos) concluzie += ` Până la banda „${BENZI[b - 1]}” mai sunt ${pct((jos / p - 1) * 100, 1)}.`;
  return {
    scor, eticheta: BENZI[b], detaliu: `banda ${b + 1} din 9 · ${pct(fata)}`,
    valori: { banda: b + 1, mijloc: sig(m), fataDeMijloc: rot(fata, 1), benzi },
    grafic: { model: CURCUBEU, limite: LIMITE, pret: D.saptamanal },
    regula: 'benzile 1–2 → +2 · 3–4 → +1 · 5 → 0 · 6–7 → −1 · 8–9 → −2. Mijlocul: log10(preț) = 2,4318 × ln(zile de la 3 ian 2009) − 16,2007; benzile sunt la câte 0,2 decade.',
    concluzie, surse: 'Coin Metrics (preț zilnic din 2010) · formula curcubeului, calculată în aplicație',
  };
}

// 16 · Power Law
function modulPowerLaw(D) {
  const { z, v } = D.zilnic;
  const xs = [], ys = [];
  for (let i = 0; i < z.length; i++) { const d = zg(z[i]); if (d >= 561) { xs.push(Math.log10(d)); ys.push(Math.log10(v[i])); } }
  const mx = medie(xs), my = medie(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const panta = sxy / sxx, interceptie = my - panta * mx;
  const centru = d => 10 ** (interceptie + panta * Math.log10(d));
  let k = Infinity, tk = null;
  for (let i = 0; i < z.length; i++) {
    if (z[i] < Date.UTC(2013, 0, 1) || z[i] > T - 365 * ZI) continue;
    const r = v[i] / centru(zg(z[i]));
    if (r < k) { k = r; tk = z[i]; }
  }
  const p = D.pret.usd, d0 = zg(T), c = centru(d0), podea = c * k;
  let scor, eticheta;
  if (p < podea) { scor = 2; eticheta = 'Sub podea'; }
  else if (p < 1.5 * podea) { scor = 1; eticheta = 'Lângă podea'; }
  else if (p < c) { scor = 0; eticheta = 'Sub linia centrală'; }
  else if (p < 2 * c) { scor = -1; eticheta = 'Peste linia centrală'; }
  else { scor = -2; eticheta = 'Departe de centru'; }
  // ultima atingere a podelei (fără ultimele 30 de zile)
  let atingere = null;
  for (let i = z.length - 1; i >= 0 && z[i] >= Date.UTC(2013, 0, 1); i--) {
    if (z[i] > T - 30 * ZI) continue;
    if (v[i] <= centru(zg(z[i])) * k * 1.03) {
      let iMin = i;
      for (let j = Math.max(0, i - 45); j <= Math.min(z.length - 1, i + 45); j++) if (v[j] < v[iMin]) iMin = j;
      let iMax = iMin;
      for (let j = iMin; j < z.length && z[j] <= z[iMin] + 180 * ZI; j++) if (v[j] > v[iMax]) iMax = j;
      atingere = { t: z[iMin], pret: sig(v[iMin]), apoi: rot((v[iMax] / v[iMin] - 1) * 100, 0) };
      break;
    }
  }
  const fataPodea = (p / podea - 1) * 100, fataCentru = (p / c - 1) * 100;
  let concluzie;
  if (scor === 2) concluzie = `prețul e cu ${nf(Math.abs(fataPodea))}% sub podeaua modelului (+2).`;
  else if (scor === 1) concluzie = `prețul e la ${nf(fataPodea)}% peste podea, în partea ieftină a coridorului (+1).`;
  else if (scor === 0) concluzie = 'prețul e între podea și linia centrală (0).';
  else if (scor === -1) concluzie = `prețul e cu ${nf(fataCentru)}% peste linia centrală (−1).`;
  else concluzie = 'prețul e de peste două ori linia centrală (−2).';
  if (D.scor2 != null && Math.sign(D.scor2) === Math.sign(scor) && scor !== 0) concluzie += ` Curcubeul spune același lucru: ${scor > 0 ? 'ieftin' : 'scump'}.`;
  return {
    scor, eticheta, detaliu: scor >= 1 ? `${nf(Math.abs(fataPodea))}% ${fataPodea < 0 ? 'sub' : 'peste'} podea (${nf(sig(podea, 3))} $)` : `${pct(fataCentru)} față de centru`,
    valori: {
      panta: rot(panta, 3), interceptie: rot(interceptie, 4), k: rot(k, 3), dataK: tk, centru: sig(c), podea: sig(podea),
      podeaPeste1An: sig(centru(d0 + 365) * k), cresterePodeaZi: rot((centru(d0 + 1) / c - 1) * 100, 3),
      fataPodea: rot(fataPodea, 1), fataCentru: rot(fataCentru, 1), zile: d0, atingere,
    },
    grafic: { pret: D.saptamanal, zoom: esantion(z, v, 2, T - 731 * ZI, x => sig(x)) },
    regula: `sub podea → +2 · până la 1,5× podea → +1 · până la linia centrală → 0 · până la 2× centrul → −1 · peste → −2. Linia centrală = regresie log-log pe toată istoria (panta ${nf(panta, 2)}); podeaua = centrul × ${nf(k, 2)}, cel mai jos punct din 2013 până acum un an.`,
    concluzie, surse: 'Coin Metrics (preț zilnic din 2010) · modelul calculat în aplicație',
  };
}

// 17 · Ceasul ciclului
const FERESTRE = [
  { pana: 365, scor: 1, nume: 'primul an după halving', scurt: 'An 1 după halving' },
  { pana: 550, scor: -2, nume: 'fereastra în care s-au format vârfurile trecute', scurt: 'Zona vârfurilor' },
  { pana: 750, scor: -1, nume: 'perioada de după vârfurile trecute', scurt: 'După vârf' },
  { pana: 1000, scor: 2, nume: 'fereastra în care s-au format fundurile trecute', scurt: 'Zona de fund' },
  { pana: Infinity, scor: 1, nume: 'perioada de dinaintea următorului halving', scurt: 'Înainte de halving' },
];
function modulCiclu(D) {
  const { z, v } = D.zilnic;
  const cicluri = [];
  for (let c = 0; c < HALVINGURI.length; c++) {
    const h = HALVINGURI[c], urm = HALVINGURI[c + 1] ?? Infinity;
    const i0 = indexLa(z, h);
    if (i0 < 0) continue;
    const zile = t => Math.round((t - h) / ZI);
    let iV = i0;
    for (let i = i0; i < z.length && z[i] < urm && z[i] <= h + 1000 * ZI; i++) if (v[i] > v[iV]) iV = i;
    let iF = iV;
    for (let i = iV; i < z.length && z[i] < urm; i++) if (v[i] < v[iF]) iF = i;
    const multipli = [];
    for (let i = i0; i < z.length && z[i] < Math.min(urm, h + 1461 * ZI); i += 7) multipli.push([zile(z[i]), sig(v[i] / v[i0], 3)]);
    if (urm === Infinity && multipli.at(-1)?.[0] !== zile(z.at(-1))) multipli.push([zile(z.at(-1)), sig(v.at(-1) / v[i0], 3)]);
    cicluri.push({
      an: new Date(h).getUTCFullYear(), halving: h, p0: sig(v[i0]), complet: urm !== Infinity, lungime: urm !== Infinity ? zile(urm) : null,
      ziVarf: zile(z[iV]), pretVarf: sig(v[iV]), dataVarf: z[iV], ziFund: zile(z[iF]), pretFund: sig(v[iF]), dataFund: z[iF],
      scadere: rot((v[iF] / v[iV] - 1) * 100, 0), multipli,
    });
  }
  const acum = cicluri.at(-1), trecute = cicluri.filter(c => c.complet);
  const zi = Math.floor((T - acum.halving) / ZI);
  const f = FERESTRE.find(x => zi <= x.pana);
  const p = D.pret.usd;
  const zileDeLaVarf = Math.round((T - acum.dataVarf) / ZI);
  const scadereAcum = (p / acum.pretVarf - 1) * 100;
  const laAceeasiZi = trecute.map(c => {
    const i = indexLa(z, c.halving + zi * ZI);
    return { an: c.an, multiplu: rot(v[i] / c.p0, 1) };
  });
  const scaderi = trecute.filter(c => c.an >= 2012).map(c => c.scadere);
  const durate = trecute.map(c => c.ziFund - c.ziVarf);
  const concluzie = `ziua ${nf(zi)} cade în ${f.nume} (${scorTxt(f.scor)}). Scăderea de la vârf e ${pct(scadereAcum)}; în ciclurile trecute a fost între ${pct(Math.max(...scaderi))} și ${pct(Math.min(...scaderi))}.`;
  return {
    scor: f.scor, eticheta: f.scurt, detaliu: `ziua ${nf(zi)} de la halving`,
    valori: {
      zi, fereastra: f.nume, halving: acum.halving, pretHalving: acum.p0, multipluAcum: rot(p / acum.p0, 2),
      varf: { pret: acum.pretVarf, t: acum.dataVarf, zi: acum.ziVarf }, minim: { pret: acum.pretFund, t: acum.dataFund, zi: acum.ziFund },
      zileDeLaVarf, scadere: rot(scadereAcum, 1), scaderiTrecute: scaderi, durateVarfFund: durate, laAceeasiZi,
    },
    grafic: { cicluri: cicluri.map(({ multipli, ...c }) => ({ ...c, multipli: c.an >= 2016 ? multipli : undefined })) },
    regula: 'zile de la halving: 0–365 → +1 · 366–550 (vârfurile trecute) → −2 · 551–750 → −1 · 751–1.000 (fundurile trecute) → +2 · peste 1.000 → +1',
    concluzie, surse: 'Coin Metrics (preț istoric) · datele fixe ale halvingurilor',
  };
}

// 18 · Randamente și sezonalitate (+ 27 · lei și euro)
function modulRandamente(D) {
  const { z, v } = D.zilnic, p = D.pret.usd;
  const pretLa = t => { const i = indexLa(z, t); return i >= 0 ? v[i] : null; };
  const cursLa = t => {
    if (!D.curs) return null;
    const d = new Date(t).toISOString().slice(0, 10);
    let best = null;
    for (const [k, x] of D.curs.lista) { if (k <= d) best = x; else break; }
    return best;
  };
  const azi = D.curs?.ultim;
  const rand = (t0, p0 = pretLa(t0)) => {
    if (!p0) return null;
    const c0 = cursLa(t0), r = { usd: rot((p / p0 - 1) * 100, 1) };
    if (c0 && azi) {
      r.lei = rot(((p * azi.usdRon) / (p0 * c0.usdRon) - 1) * 100, 1);
      r.eur = rot(((p * azi.usdRon / azi.eurRon) / (p0 * c0.usdRon / c0.eurRon) - 1) * 100, 1);
    }
    return r;
  };
  let iAth = 0;
  for (let i = 0; i < v.length; i++) if (v[i] > v[iAth]) iAth = i;
  const an = ACUM.getUTCFullYear(), luna = ACUM.getUTCMonth();
  const randamente = [
    { nume: '7 zile', ...rand(T - 7 * ZI) },
    { nume: '30 de zile', ...rand(T - 30 * ZI) },
    { nume: 'de la 1 ianuarie', ...rand(Date.UTC(an - 1, 11, 31)) },
    { nume: '1 an', ...rand(T - 365 * ZI) },
    { nume: `de la vârf (${LS[new Date(z[iAth]).getUTCMonth()]} ${new Date(z[iAth]).getUTCFullYear()})`, ...rand(z[iAth], v[iAth]) },
  ];
  // închideri lunare
  const inchidere = new Map();
  for (let i = 0; i < z.length; i++) { const d = new Date(z[i]); inchidere.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), v[i]); }
  const cheieAcum = an * 12 + luna;
  const lunare = []; // [an, lună, randament %]
  for (const [k, c] of inchidere) {
    if (k >= cheieAcum || k < 2013 * 12) continue;
    const prev = inchidere.get(k - 1);
    if (prev) lunare.push([Math.floor(k / 12), k % 12, rot((c / prev - 1) * 100, 1)]);
  }
  const mtd = inchidere.get(cheieAcum - 1) ? (p / inchidere.get(cheieAcum - 1) - 1) * 100 : null;
  const pe = m => lunare.filter(x => x[1] === m).map(x => x[2]);
  const mediane = Array.from({ length: 12 }, (_, m) => rot(mediana(pe(m)), 1));
  const urm = (luna + 1) % 12;
  const valUrm = pe(urm);
  const pozitiveUrm = valUrm.filter(x => x > 0).length;
  // ce a urmat după o lună curentă de același semn
  const rosu = mtd != null && mtd < 0;
  const ani = lunare.filter(x => x[1] === luna && (rosu ? x[2] < 0 : x[2] >= 0)).map(x => x[0]);
  const urmari = ani.map(a => lunare.find(x => (urm === 0 ? x[0] === a + 1 : x[0] === a) && x[1] === urm)).filter(Boolean);
  const laFel = urmari.filter(x => (rosu ? x[2] < 0 : x[2] >= 0)).length;
  const best = mediane.indexOf(Math.max(...mediane)), worst = mediane.indexOf(Math.min(...mediane));
  const perioadaAni = `${lunare[0]?.[0] ?? 2013}–${lunare.at(-1)?.[0] ?? an - 1}`;
  let concluzie = `${LUNI[luna]} ${an} e ${rosu ? 'pe minus' : 'pe plus'} până acum (${pct(mtd ?? 0)}).`;
  if (urmari.length) concluzie += ` În istorie, după un ${LUNI[luna]} ${rosu ? 'pe minus' : 'pe plus'}, ${LUNI[urm]} a fost tot ${rosu ? 'pe minus' : 'pe plus'} în ${laFel} din ${urmari.length} ani${urmari.length < 8 ? ', dar eșantionul e mic' : ''}.`;
  const lei = azi ? { usdRon: azi.usdRon, eurRon: azi.eurRon, data: D.curs.dataUltim, sursa: D.curs.sursa, pretLei: Math.round(p * azi.usdRon), pretEur: Math.round(p * azi.usdRon / azi.eurRon) } : null;
  if (lei) {
    const c1 = cursLa(T - 365 * ZI);
    if (c1) lei.dolarInLei1An = rot((azi.usdRon / c1.usdRon - 1) * 100, 1), lei.usdRon1An = c1.usdRon;
  }
  return {
    scor: null, informativ: true, eticheta: `${LUNI[urm][0].toUpperCase() + LUNI[urm].slice(1)}: mediana ${pct(mediane[urm])}`, detaliu: `${LUNI[luna]} până acum: ${pct(mtd ?? 0)}`,
    valori: {
      randamente, lei, mtd: rot(mtd, 1), luna, lunaUrm: urm, mediane, perioadaAni,
      urm: { mediana: mediane[urm], pozitive: pozitiveUrm, total: valUrm.length },
      conditionat: { rosu, laFel, total: urmari.length }, best: { luna: best, mediana: mediane[best] }, worst: { luna: worst, mediana: mediane[worst] },
    },
    grafic: { lunare },
    regula: 'fără scor. Sezonalitatea are puțini ani de date, așa că apare ca informație și nu intră în verdict. Randamentele vin din prețul zilnic; coloanele € și lei folosesc cursul din fiecare zi.',
    concluzie, surse: `Coin Metrics (preț zilnic) · ${D.curs?.sursa === 'BNR' ? 'BNR (curs oficial lei, €, $)' : 'BCE prin Frankfurter (curs)'}`,
  };
}

// 3 · On-chain
function modulOnchain(D) {
  const { z, v } = D.zilnic, p = D.pret.usd, n = v.length;
  const s200 = sma(v, 200), s1400 = sma(v, 1400), s111 = sma(v, 111), s350 = sma(v, 350);
  const mayer = p / s200[n - 1];
  const mv = D.cm.CapMVRVCur;
  let mvrv = mv?.v?.length ? mv.v.at(-1) : null;
  if (mvrv == null && D.cm.CapRealUSD?.v?.length && D.capAzi) mvrv = D.capAzi / D.cm.CapRealUSD.v.at(-1);
  const sMvrv = mvrv == null ? null : mvrv < 1 ? 2 : mvrv < 1.5 ? 1 : mvrv < 2.5 ? 0 : mvrv < 3.5 ? -1 : -2;
  const sMayer = mayer < 0.8 ? 2 : mayer < 1 ? 1 : mayer < 1.5 ? 0 : mayer < 2.4 ? -1 : -2;
  const sub200s = s1400[n - 1] != null && p < s1400[n - 1];
  const s200s = s1400[n - 1] == null ? null : sub200s ? 2 : 0;
  const scor = medieScoruri([sMvrv, sMayer, s200s]);
  const piCycle = s111[n - 1] != null && s350[n - 1] != null && s111[n - 1] > 2 * s350[n - 1];
  const eticheta = scor > 0.5 ? 'Valoare' : scor < -0.5 ? 'Scump' : 'Neutru';
  const desc = scor > 0.5 ? 'zonă de valoare' : scor < -0.5 ? 'zonă scumpă' : 'zonă neutră';
  return {
    scor, eticheta, detaliu: `${mvrv != null ? `MVRV ${nf(mvrv, 2)} · ` : ''}Mayer ${nf(mayer, 2)}`,
    valori: { mvrv: rot(mvrv, 2), mayer: rot(mayer, 2), ma200z: sig(s200[n - 1]), ma200s: sig(s1400[n - 1]), sub200s, piCycle, semnale: { mvrv: sMvrv, mayer: sMayer, ma200s: s200s } },
    grafic: { mvrv: mv?.v?.length ? esantion(mv.z, mv.v, 7, Date.UTC(2017, 0, 1), x => rot(x, 2)) : null, mayer: esantion(z, v.map((x, i) => (s200[i] ? x / s200[i] : null)), 7, Date.UTC(2017, 0, 1), x => rot(x, 2)) },
    regula: 'MVRV < 1 → +2 · 1–1,5 → +1 · 1,5–2,5 → 0 · 2,5–3,5 → −1 · peste 3,5 → −2 · Mayer < 0,8 → +2 · 0,8–1 → +1 · 1–1,5 → 0 · 1,5–2,4 → −1 · peste 2,4 → −2 · preț sub media de 200 de săptămâni → +2 · scorul = media',
    concluzie: `${mvrv != null ? `MVRV ${nf(mvrv, 2)} și ` : ''}Mayer ${nf(mayer, 2)}${sub200s ? ', iar prețul e sub media de 200 de săptămâni' : ''}: ${desc} (${scorTxt(scor)}).${piCycle ? ' Atenție: Pi Cycle arată vârf.' : ''}`,
    surse: 'Coin Metrics (MVRV, preț) · Mayer și mediile calculate în aplicație',
  };
}

// 4 · Minerii
function modulMineri(D) {
  const M = D.mempool;
  if (!M.hr?.hashrates?.length) throw new Error('lipsește hashrate-ul (mempool.space)');
  const hr = M.hr.hashrates.map(x => [x.timestamp * 1000, x.avgHashrate]).sort((a, b) => a[0] - b[0]);
  const hv = hr.map(x => x[1]);
  const s30 = sma(hv, 30), s60 = sma(hv, 60), n = hv.length;
  const capitulare = s30[n - 1] < s60[n - 1];
  let zileCap = 0;
  for (let i = n - 1; i >= 0 && s30[i] != null && s60[i] != null && s30[i] < s60[i]; i--) zileCap++;
  const dif = [...(M.hr.difficulty || [])].sort((a, b) => a.time - b.time);
  const schimbari = [];
  for (let i = 1; i < dif.length; i++) schimbari.push([dif[i].time * 1000, rot((dif[i].difficulty / dif[i - 1].difficulty - 1) * 100, 1)]);
  const urmatoare = M.dif ? { schimbare: rot(+M.dif.difficultyChange, 1), data: +M.dif.estimatedRetargetDate, progres: rot(+M.dif.progressPercent, 0), blocuriRamase: +M.dif.remainingBlocks } : null;
  const hrAcum = M.hr.currentHashrate || hv.at(-1);
  let hashprice = null;
  if (M.rew?.totalReward) hashprice = ((+M.rew.totalReward / 1e8) * D.pret.usd) / (hrAcum / 1e15);
  const iss = D.cm.IssTotUSD;
  let puell = null;
  if (iss?.v?.length > 365) { const s = sma(iss.v, 365); puell = iss.v.at(-1) / s.at(-1); }
  const sRib = capitulare ? 1 : 0;
  const sPuell = puell == null ? null : puell < 0.5 ? 2 : puell < 0.8 ? 1 : 0;
  const sHp = hashprice == null ? null : hashprice < 35 ? 1 : 0;
  const scor = medieScoruri([sRib, sPuell, sHp]);
  const eticheta = capitulare ? 'Capitulare' : scor > 0 ? 'Stres la mineri' : 'Normal';
  const parti = [];
  parti.push(capitulare ? `Hash Ribbons arată capitulare de ${zileCap} zile` : 'Hash Ribbons nu arată capitulare');
  if (hashprice != null) parti.push(`hashprice ${nf(hashprice)} $/PH/zi${hashprice < 35 ? ' (stres)' : ''}`);
  if (puell != null) parti.push(`Puell ${nf(puell, 2)}`);
  return {
    scor, eticheta, detaliu: capitulare ? 'Hash Ribbons 30z < 60z' : hashprice != null ? `hashprice ${nf(hashprice)} $/PH/zi` : 'fără capitulare',
    valori: { capitulare, zileCap, hashrateEH: rot(hrAcum / 1e18, 0), hashprice: rot(hashprice, 1), puell: rot(puell, 2), urmatoare, semnale: { ribbons: sRib, puell: sPuell, hashprice: sHp } },
    grafic: { s30: hr.map((x, i) => [zg(x[0]), s30[i] && rot(s30[i] / 1e18, 0)]).filter((x, i) => i >= 59 && i % 2 === (n - 1) % 2), s60: hr.map((x, i) => [zg(x[0]), s60[i] && rot(s60[i] / 1e18, 0)]).filter((x, i) => i >= 59 && i % 2 === (n - 1) % 2), schimbari: schimbari.slice(-8) },
    regula: 'Hash Ribbons (media 30 z sub media 60 z) → +1 · Puell < 0,8 → +1, sub 0,5 → +2 · hashprice sub 35 $/PH/zi → +1 · scorul = media',
    concluzie: `${parti.join(', ')} (${scorTxt(scor)}).`,
    surse: 'mempool.space (hashrate, dificultate, recompense) · Coin Metrics (emisie, pentru Puell)',
  };
}

// 15 · Capitalizare
function modulCapitalizare(D) {
  const C = D.cm.CapMrktCurUSD;
  if (!C?.v?.length) throw new Error('lipsește capitalizarea (Coin Metrics)');
  const z = [...C.z], v = [...C.v];
  if (z.at(-1) < ziUTC(T) && D.capAzi) { z.push(ziUTC(T)); v.push(D.capAzi); } else if (D.capAzi) v[v.length - 1] = D.capAzi;
  const n = v.length, m50 = sma(v, 50), m200 = sma(v, 200), cap = v[n - 1];
  let iAth = 0;
  for (let i = 0; i < n; i++) if (v[i] > v[iAth]) iAth = i;
  const fata200 = (cap / m200[n - 1] - 1) * 100, fata50 = (cap / m50[n - 1] - 1) * 100, fataVarf = (cap / v[iAth] - 1) * 100;
  const s1 = cap < m200[n - 1] ? 1 : cap > 1.5 * m200[n - 1] ? -1 : 0;
  const s2 = cap < 0.6 * v[iAth] ? 1 : 0;
  const scor = medieScoruri([s1, s2]);
  const i30 = indexLa(z, T - 30 * ZI);
  // capitalizarea realizată nu e în planul gratuit Coin Metrics; o scot din MVRV = capitalizare / realizată
  const mvC = D.cm.CapMVRVCur?.v;
  const real = D.cm.CapRealUSD?.v?.at(-1) ?? (mvC?.length ? C.v.at(-1) / mvC.at(-1) : null);
  const abateri = [];
  for (let i = n - 1; i >= n - 365 && i >= 0; i -= 7) if (m200[i]) abateri.push([zg(z[i]), rot((v[i] / m200[i] - 1) * 100, 1)]);
  abateri.reverse();
  const deLa = T - 366 * ZI;
  return {
    scor, eticheta: fata200 < 0 ? 'Sub medie' : fata200 > 50 ? 'Supraîncălzit' : 'Peste medie', detaliu: `${nf(Math.abs(fata200))}% ${fata200 < 0 ? 'sub' : 'peste'} media 200 z`,
    valori: {
      cap: sig(cap), ma50: sig(m50[n - 1]), ma200: sig(m200[n - 1]), fata50: rot(fata50, 1), fata200: rot(fata200, 1),
      varf: sig(v[iAth]), dataVarf: z[iAth], fataVarf: rot(fataVarf, 1), schimbare30z: rot((cap / v[i30] - 1) * 100, 1),
      schimbare24h: rot(D.pret.schimbare24h, 1), realizata: sig(real), mvrv: real ? rot(cap / real, 2) : null, dominanta: rot(D.dominanta, 1),
    },
    grafic: { cap: esantion(z, v, 2, deLa, x => sig(x, 4)), ma50: esantion(z, m50, 2, deLa, x => sig(x, 4)), ma200: esantion(z, m200, 2, deLa, x => sig(x, 4)), abateri },
    regula: 'sub media de 200 de zile → +1 (peste ea cu mai mult de 50% → −1) · cu peste 40% sub vârf → +1 · scorul = media',
    concluzie: `capitalizarea e cu ${nf(Math.abs(fata200))}% ${fata200 < 0 ? 'sub' : 'peste'} media de 200 de zile și cu ${nf(Math.abs(fataVarf))}% sub vârf (${scorTxt(scor)}).`,
    surse: `Coin Metrics (istoric din 2010, capitalizare realizată)${D.dominanta ? ' · CoinPaprika (dominanță)' : ''}`,
  };
}

// 19 · Volatilitate (DVOL)
function modulDvol(D) {
  if (!D.dvol) throw new Error('lipsește DVOL (Deribit)');
  const ult = D.dvol.filter(x => x[0] >= T - 366 * ZI);
  const vals = ult.map(x => x[1]), azi = vals.at(-1);
  const perc = percentila(vals, azi);
  const an = ult.filter(x => new Date(x[0]).getUTCFullYear() === ACUM.getUTCFullYear()).map(x => x[1]);
  const medieAn = an.length ? medie(an) : medie(vals);
  // volatilitatea realizată pe 30 de zile, din prețul zilnic
  const { z, v } = D.zilnic;
  const rv = [];
  for (let i = Math.max(31, v.length - 400); i < v.length; i++) {
    const r = [];
    for (let j = i - 29; j <= i; j++) r.push(Math.log(v[j] / v[j - 1]));
    const m = medie(r);
    rv.push([z[i], Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(365) * 100]);
  }
  const rvAzi = rv.at(-1)?.[1];
  const scor = perc >= 90 ? 1 : perc <= 10 ? -1 : 0;
  const eticheta = scor === 1 ? 'Panică' : scor === -1 ? 'Calm total' : azi < medieAn ? 'Calm' : 'Agitat';
  const i30 = indexLa(z, T - 30 * ZI);
  const pret30 = (D.pret.usd / v[i30] - 1) * 100;
  let concluzie;
  if (scor === 1) concluzie = `DVOL ${nf(azi)} e în cele mai sus 10% din ultimul an: panică în opțiuni, ceva ce apare de obicei lângă funduri (+1).`;
  else if (scor === -1) concluzie = `DVOL ${nf(azi)} e în cele mai jos 10% din ultimul an: calm total, fără nicio frică în opțiuni (−1).`;
  else if (pret30 < -10 && azi < medieAn) concluzie = `prețul a scăzut ${nf(Math.abs(pret30))}% în 30 de zile, dar DVOL e sub media anului: opțiunile nu arată panică, deci nici capitulare (0).`;
  else concluzie = `DVOL ${nf(azi)} e în zona obișnuită a ultimului an (percentila ${nf(perc)}) (0).`;
  const deLa = T - 366 * ZI;
  return {
    scor, eticheta, detaliu: `DVOL ${nf(azi)} · percentila ${nf(perc)}`,
    valori: { dvol: rot(azi, 1), percentila: rot(perc, 0), medieAn: rot(medieAn, 1), realizata30: rot(rvAzi, 0), pret30: rot(pret30, 1) },
    grafic: { dvol: ult.filter((x, i) => i % 2 === (ult.length - 1) % 2).map(x => [zg(x[0]), rot(x[1], 1)]), realizata: rv.filter(x => x[0] >= deLa).filter((x, i, a) => i % 2 === (a.length - 1) % 2).map(x => [zg(x[0]), rot(x[1], 1)]) },
    regula: 'percentila DVOL pe ultimul an ≥ 90 → +1 (panică, de obicei lângă funduri) · ≤ 10 → −1 (calm total) · altfel 0',
    concluzie, surse: 'Deribit (DVOL, gratuit, fără cheie) · volatilitatea realizată calculată din preț',
  };
}

// 25 · Rețea
function modulRetea(D) {
  const M = D.mempool;
  const verificari = [];
  let noduri = null;
  if (D.noduri?.length) {
    const recente = D.noduri.filter(x => x.t >= T - 90 * ZI);
    const ult = D.noduri.at(-1).n, m90 = medie(recente.map(x => x.n));
    const zile = Math.max(1, Math.round((recente.at(-1).t - recente[0].t) / ZI));
    noduri = { total: ult, raport: rot((ult / m90) * 100, 0), zile };
    verificari.push({ text: `Noduri față de media ${zile >= 60 ? 'pe 90 de zile' : zile >= 7 ? `pe ${zile} de zile` : 'recentă'}`, valoare: `${nf(noduri.raport)}%`, ok: ult >= 0.9 * m90 });
  }
  const timpBloc = M.dif?.timeAvg ? M.dif.timeAvg / 60000 : null;
  if (timpBloc) verificari.push({ text: 'Timp mediu între blocuri', valoare: `${nf(timpBloc, 1)} min`, ok: timpBloc >= 9 && timpBloc <= 11 });
  const comision = M.fees?.fastestFee ?? null;
  const mempoolMB = M.mem?.vsize ? M.mem.vsize / 1e6 : null;
  if (comision != null) verificari.push({ text: `Comision rapid${mempoolMB != null && mempoolMB < 20 ? ' (mempool aproape gol)' : ''}`, valoare: `${nf(comision)} sat/vB`, ok: comision < 50 });
  if (!verificari.length) throw new Error('lipsesc datele de rețea (mempool.space)');
  const sanatoasa = verificari.every(x => x.ok);
  let ln = null, lnSerie = null;
  if (M.lnL?.latest) {
    const L = M.lnL.latest;
    ln = { capacitate: rot(+L.total_capacity / 1e8, 0), canale: +L.channel_count, noduri: +L.node_count };
  }
  if (Array.isArray(M.ln1y) && M.ln1y.length) {
    lnSerie = M.ln1y.map(x => { const a = typeof x.added === 'number' ? (x.added < 1e12 ? x.added * 1000 : x.added) : Date.parse(x.added); return [a, +x.total_capacity / 1e8]; })
      .filter(x => Number.isFinite(x[0]) && x[1] > 0).sort((a, b) => a[0] - b[0]);
    if (ln && lnSerie.length) {
      let iV = 0;
      lnSerie.forEach((x, i) => { if (x[1] > lnSerie[iV][1]) iV = i; });
      ln.varf = rot(lnSerie[iV][1], 0); ln.dataVarf = lnSerie[iV][0]; ln.fataVarf = rot((ln.capacitate / lnSerie[iV][1] - 1) * 100, 0);
    }
  }
  const parti = [];
  if (noduri) parti.push(noduri.raport >= 90 ? 'noduri stabile' : 'noduri în scădere');
  if (timpBloc) parti.push(`blocuri la ~${nf(timpBloc, 0)} minute`);
  if (comision != null) parti.push(comision < 50 ? 'comisioane mici' : 'comisioane mari');
  let concluzie = `${sanatoasa ? 'rețeaua merge normal' : 'atenție la rețea'}: ${parti.join(', ')}.`;
  if (ln?.fataVarf != null && ln.fataVarf < -20) concluzie += ` Lightning publică a scăzut cu ${nf(Math.abs(ln.fataVarf))}% de la vârf, dar nu intră în verdict.`;
  return {
    scor: null, informativ: true, eticheta: sanatoasa ? 'Sănătoasă' : 'Atenție', detaliu: noduri ? `${sanatoasa ? 'sănătoasă' : 'atenție'} · ${nf(noduri.total)} de noduri` : `${sanatoasa ? 'sănătoasă' : 'atenție'} · blocuri la ${nf(timpBloc ?? 10, 1)} min`,
    valori: { sanatoasa, verificari, noduri, ln, timpBloc: rot(timpBloc, 1), comision, mempoolMB: rot(mempoolMB, 1), inaltime: M.inaltime },
    grafic: { lightning: lnSerie ? lnSerie.filter((x, i) => i % 3 === (lnSerie.length - 1) % 3).map(x => [zg(x[0]), rot(x[1], 0)]) : null },
    regula: '„Sănătoasă” dacă nodurile sunt cel puțin 90% din media lor recentă (până la 90 de zile), blocurile vin la 9–11 minute și comisionul rapid e sub 50 sat/vB. Altfel: „Atenție”. Fără scor.',
    concluzie, surse: `${noduri ? 'btcnodes.io (noduri) · ' : ''}mempool.space (Lightning, comisioane, blocuri)`,
  };
}

// 28 · Stablecoins
function modulStablecoins(D) {
  const S = D.stable;
  if (!S?.serie?.length) throw new Error('lipsesc datele DefiLlama');
  const s = S.serie, tot = s.at(-1)[1];
  const i30 = s.findIndex(x => x[0] >= s.at(-1)[0] - 30 * ZI);
  const ch30 = (tot / s[i30][1] - 1) * 100;
  let iV = 0;
  s.forEach((x, i) => { if (x[1] > s[iV][1]) iV = i; });
  const saptamani = [];
  for (let k = 11; k >= 0; k--) {
    const a = s.findIndex(x => x[0] >= s.at(-1)[0] - (k + 1) * 7 * ZI), b = s.findIndex(x => x[0] >= s.at(-1)[0] - k * 7 * ZI);
    if (a >= 0 && b >= 0) saptamani.push([zg(s[b][0]), rot((s[b][1] - s[a][1]) / 1e9, 1)]);
  }
  // SSR = capitalizarea BTC / stablecoins
  const C = D.cm.CapMrktCurUSD, harta = new Map();
  if (C?.v) C.z.forEach((t, i) => harta.set(t, C.v[i]));
  const ssrSerie = s.map(([t, x]) => [t, harta.get(t) / x]).filter(x => Number.isFinite(x[1]));
  const ssr = D.capAzi ? D.capAzi / tot : ssrSerie.at(-1)?.[1];
  const ult2 = ssrSerie.filter(x => x[0] >= T - 730 * ZI).map(x => x[1]);
  const percSsr = ult2.length ? percentila(ult2, ssr) : null;
  // „cel mai mic din …”: ultima dată, mai veche de 30 de zile, când SSR a fost mai mic decât azi
  let maiMic = null, gasit = false;
  for (let i = ssrSerie.length - 1; i >= 0; i--) if (ssrSerie[i][0] < T - 30 * ZI && ssrSerie[i][1] < ssr) { maiMic = ssrSerie[i][0]; gasit = true; break; }
  const s1 = ch30 >= 2 ? 1 : ch30 <= -2 ? -1 : 0;
  const s2 = percSsr == null ? null : percSsr <= 20 ? 1 : percSsr >= 80 ? -1 : 0;
  const scor = medieScoruri([s1, s2]);
  const eticheta = s1 > 0 && (s2 ?? 0) >= 0 ? 'Intră bani' : s1 < 0 && (s2 ?? 0) <= 0 ? 'Ies bani' : s1 !== (s2 ?? 0) ? 'Mixt' : 'Stabil';
  const ssrTxt = !gasit ? 'cel mai mic din istoricul disponibil' : maiMic < T - 365 * ZI ? `cel mai mic din ${lunaAn(maiMic)}` : `percentila ${nf(percSsr ?? 0)} pe 2 ani`;
  let concluzie = `${ch30 <= -2 ? 'dolarii ies din crypto' : ch30 >= 2 ? 'intră dolari noi în crypto' : 'oferta de stablecoins e stabilă'} (${pct(ch30, 1)} în 30 de zile, ${scorTxt(s1)})`;
  if (ssr != null && s2 != null) concluzie += `; raportat la BTC, SSR ${nf(ssr, 1)}${s2 > 0 ? `, ${maiMic && maiMic >= T - 365 * ZI ? 'jos în intervalul pe 2 ani' : ssrTxt} (+1)` : s2 < 0 ? ', sus în intervalul pe 2 ani (−1)' : ' (0)'}`;
  concluzie += `. Scor ${scorTxt(scor)}.`;
  const deLa = T - 366 * ZI;
  return {
    scor, eticheta, detaliu: `${pct(ch30, 1)} în 30 z · SSR ${nf(ssr ?? 0, 1)}`,
    valori: {
      total: sig(tot), schimbare30z: rot(ch30, 1), varf: sig(s[iV][1]), dataVarf: s[iV][0], fataVarf: rot((tot / s[iV][1] - 1) * 100, 1),
      usdt: sig(S.usdt), usdc: sig(S.usdc), ssr: rot(ssr, 2), percSsr: rot(percSsr, 0), ssrMaiMicLa: maiMic, ssrText: ssrTxt,
      emisiune30z: rot((tot - s[i30][1]) / 1e9, 1), emisiune4sapt: rot(saptamani.slice(-4).reduce((a, x) => a + x[1], 0), 1),
    },
    grafic: { total: s.filter(x => x[0] >= deLa).filter((x, i, a) => i % 2 === (a.length - 1) % 2).map(x => [zg(x[0]), rot(x[1] / 1e9, 1)]), saptamani },
    regula: 'emisiune netă pe 30 de zile ≥ +2% → +1 (intră bani) · ≤ −2% → −1 (ies bani) · SSR (capitalizarea BTC împărțită la stablecoins) în cei mai de jos 20% din ultimii 2 ani → +1, în cei mai de sus 20% → −1 · scorul = media',
    concluzie, surse: 'DefiLlama (gratuit, fără cheie) · Coin Metrics (capitalizarea BTC)',
  };
}

// 8 · Sentiment
const FNG_RO = { 'Extreme Fear': 'Frică extremă', Fear: 'Frică', Neutral: 'Neutru', Greed: 'Lăcomie', 'Extreme Greed': 'Lăcomie extremă' };
function modulSentiment(D) {
  if (!D.fng && !D.funding) throw new Error('lipsesc Fear & Greed și funding');
  const fg = D.fng?.at(-1);
  const sFg = fg ? (fg.v < 20 ? 1 : fg.v > 80 ? -1 : 0) : null;
  const f = D.funding ? D.funding.rata * 100 : null; // % pe 8 ore
  const sF = f == null ? null : f < 0 ? 1 : f > 0.03 ? -1 : 0;
  const scor = medieScoruri([sFg, sF]);
  const parti = [];
  if (fg) parti.push(`Fear & Greed ${fg.v} (${(FNG_RO[fg.c] || fg.c).toLowerCase()})`);
  if (f != null) parti.push(`funding ${f < 0 ? 'negativ' : 'pozitiv'} (${semn(f, 3)}% pe 8 ore)`);
  return {
    scor, eticheta: fg ? FNG_RO[fg.c] || fg.c : f < 0 ? 'Pesimism' : 'Optimism', detaliu: `${fg ? `F&G ${fg.v}` : ''}${fg && f != null ? ' · ' : ''}${f != null ? `funding ${f < 0 ? 'sub 0' : 'peste 0'}` : ''}`,
    valori: { fng: fg?.v ?? null, fngClasa: fg ? FNG_RO[fg.c] || fg.c : null, funding: rot(f, 4), sursaFunding: D.funding?.sursa ?? null, semnale: { fng: sFg, funding: sF } },
    grafic: { fng: D.fng ? D.fng.map(x => [zg(x.t), x.v]) : null },
    regula: 'Fear & Greed sub 20 → +1, peste 80 → −1 (contrarian) · funding negativ → +1, peste 0,03% pe 8 ore → −1 · scorul = media',
    concluzie: `${parti.join(', ')}: ${scor > 0 ? 'frica domină, semnal contrarian de cumpărare' : scor < 0 ? 'lăcomia domină, semnal contrarian de prudență' : 'sentiment echilibrat'} (${scorTxt(scor)}).`,
    surse: `alternative.me (Fear & Greed, cu atribuire)${D.funding ? ` · ${D.funding.sursa} (funding)` : ''}`,
  };
}

// ---------------------------------------------------------------- calendar
function ultimaVineri(an, luna) { // luna 0..11, ora 08:00 UTC (expirarea Deribit)
  const d = new Date(Date.UTC(an, luna + 1, 0, 8));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}
async function calendar(D) {
  const ev = [];
  try {
    const fix = JSON.parse(await readFile(join(DIR, 'evenimente.json'), 'utf8'));
    for (const e of fix.evenimente) ev.push({ t: Date.parse(e.utc), titlu: e.titlu, tip: e.tip, nota: e.nota ?? null });
  } catch (e) { log(`calendar: ${e.message}`); }
  const IMPACT = { FOMC: 'mare', CPI: 'mare', NFP: 'mare', 'expirare-trimestriala': 'mare', 'expirare-lunara': 'mediu', dificultate: 'mic' };
  const REGULI = {
    FOMC: 'FOMC → impact mare. Dobândă majorată = negativ pentru BTC, redusă = pozitiv.',
    CPI: 'CPI → impact mare. Inflație peste așteptări = negativ pentru BTC.',
    NFP: 'NFP → impact mare. Piață a muncii foarte puternică = dobânzi mai mari mai mult timp.',
  };
  for (let k = 0; k < 3; k++) {
    const d = new Date(Date.UTC(ACUM.getUTCFullYear(), ACUM.getUTCMonth() + k, 1));
    const t = ultimaVineri(d.getUTCFullYear(), d.getUTCMonth());
    const trim = [2, 5, 8, 11].includes(d.getUTCMonth());
    ev.push({ t, titlu: `Expirare ${trim ? 'trimestrială' : 'lunară'} de opțiuni (Deribit)`, tip: trim ? 'expirare-trimestriala' : 'expirare-lunara', nota: trim ? 'cea mai mare expirare din trimestru' : null });
  }
  const dif = D.mempool?.dif;
  if (dif?.estimatedRetargetDate) ev.push({ t: +dif.estimatedRetargetDate, titlu: 'Ajustarea dificultății', tip: 'dificultate', nota: `estimare ${pct(+dif.difficultyChange, 1)}`, estimat: true });
  return ev
    .filter(e => Number.isFinite(e.t) && e.t >= T - 12 * 3600000 && e.t <= T + 75 * ZI)
    .map(e => ({ ...e, impact: IMPACT[e.tip] || 'mediu', regula: REGULI[e.tip] || null }))
    .sort((a, b) => a.t - b.t);
}
function halving(D) {
  const h = D.mempool?.inaltime;
  if (!h) return null;
  const minBloc = D.mempool?.dif?.timeAvg ? D.mempool.dif.timeAvg / 60000 : 10;
  const ramase = BLOC_HALVING_URMATOR - h;
  const t = T + ramase * minBloc * 60000;
  return { inaltime: h, tinta: BLOC_HALVING_URMATOR, anterior: BLOC_HALVING_ANTERIOR, ramase, zile: Math.round((t - T) / ZI), data: Math.round(t), progres: rot((h - BLOC_HALVING_ANTERIOR) / (BLOC_HALVING_URMATOR - BLOC_HALVING_ANTERIOR) * 100, 1), recompensa: 3.125 };
}

// ---------------------------------------------------------------- verdict
function verdict(module) {
  const parte = lista => {
    const ok = lista.filter(n => fin(module[n]?.scor));
    return { module: ok, lipsa: lista.filter(n => !ok.includes(n)), medie: ok.length ? rot(medie(ok.map(n => module[n].scor)), 2) : null };
  };
  const lung = parte(TERMEN_LUNG), scurt = parte(TERMEN_SCURT);
  if (lung.medie != null) {
    lung.termometru = Math.round(Math.max(0, Math.min(100, 50 - 25 * lung.medie)));
    const t = lung.termometru;
    lung.zona = t < 20 ? 'Foarte ieftin' : t < 40 ? 'Zonă de acumulare' : t < 60 ? 'Neutru' : t < 80 ? 'Scump' : 'Foarte scump';
  }
  if (scurt.medie != null) scurt.eticheta = scurt.medie <= -0.5 ? 'negativ' : scurt.medie >= 0.5 ? 'pozitiv' : 'neutru';
  const zl = lung.zona ? lung.zona.toLowerCase().replace('zonă de acumulare', 'în zona de acumulare') : null;
  const fraza = zl && scurt.eticheta ? `${zl[0].toUpperCase() + zl.slice(1)} pe termen lung, ${scurt.eticheta} pe termen scurt.` : null;
  return { lung, scurt, fraza, inCurand: IN_CURAND };
}

// ---------------------------------------------------------------- principal
async function principal() {
  const t0 = Date.now();
  log(`Tablou BTC · colectare ${ACUM.toISOString()}${MOCK ? ' (date simulate)' : ''}`);
  let prev = null;
  if (ARG.prev) { try { prev = JSON.parse(await readFile(ARG.prev, 'utf8')); } catch { log('fără date anterioare'); } }

  const [rPret, rCm, rCm2, rMp, rDvol, rFng, rFund, rStable, rPap, rNod] = await Promise.allSettled([
    sursaPret(),
    coinMetricsSigur(['PriceUSD', 'CapMrktCurUSD', 'SplyCur']),
    coinMetricsSigur(['CapMVRVCur', 'IssTotUSD'], '2012-01-01'),
    sursaMempool(), sursaDvol(), sursaFng(), sursaFunding(), sursaStablecoins(), sursaPaprika(), sursaNoduri(),
  ]);
  const ok = (r, nume) => { if (r.status === 'fulfilled') { log(`✓ ${nume}`); return r.value; } log(`✗ ${nume}: ${r.reason?.message}`); return null; };
  const D = {
    pret: ok(rPret, 'preț'), cm: { ...(ok(rCm, 'Coin Metrics (preț, capitalizare)') || {}), ...(ok(rCm2, 'Coin Metrics (MVRV, emisie)') || {}) },
    curs: null, mempool: ok(rMp, 'mempool.space') || {}, dvol: ok(rDvol, 'Deribit DVOL'), fng: ok(rFng, 'Fear & Greed'),
    funding: ok(rFund, 'funding'), stable: ok(rStable, 'DefiLlama'), dominanta: ok(rPap, 'CoinPaprika')?.dominanta ?? null, noduri: ok(rNod, 'btcnodes.io'),
  };
  const P = D.cm.PriceUSD;
  if (!D.pret && P?.v?.length) D.pret = { usd: P.v.at(-1), schimbare24h: (P.v.at(-1) / P.v.at(-2) - 1) * 100, sursa: 'Coin Metrics (ieri)' };
  if (!D.pret) throw new Error('fără preț: nu pot calcula nimic');
  if (P?.v?.length) {
    const z = [...P.z], v = [...P.v];
    if (z.at(-1) < ziUTC(T)) { z.push(ziUTC(T)); v.push(D.pret.usd); } else v[v.length - 1] = D.pret.usd;
    D.zilnic = { z, v };
    D.saptamanal = esantion(z, v, 7, Date.UTC(2010, 7, 1), x => sig(x, 4));
    const sply = D.cm.SplyCur?.v?.at(-1);
    if (sply) D.capAzi = D.pret.usd * sply;
  }
  // cursul: azi + datele folosite de randamente (7 z, 30 z, 1 ian, 1 an, vârful)
  const zileCurs = [T - 7 * ZI, T - 30 * ZI, Date.UTC(ACUM.getUTCFullYear() - 1, 11, 31), T - 365 * ZI];
  if (D.zilnic) { let iA = 0; D.zilnic.v.forEach((x, i) => { if (x > D.zilnic.v[iA]) iA = i; }); zileCurs.push(D.zilnic.z[iA]); }
  const datele = zileCurs.map(t => new Date(t).toISOString().slice(0, 10));
  const curs = await sursaCurs(datele, prev?.fxIstoric || {}).then(r => (log('✓ curs valutar'), r)).catch(e => (log(`✗ curs valutar: ${e.message}`), null));
  if (curs) {
    const lista = [...curs.harta.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    D.curs = { lista, ultim: lista.at(-1)[1], dataUltim: lista.at(-1)[0], sursa: curs.sursa.startsWith('BNR') ? 'BNR' : 'BCE' };
    D.fxIstoric = Object.fromEntries(datele.filter(d => curs.harta.has(d)).map(d => [d, curs.harta.get(d)]));
  }
  const i30 = D.zilnic ? indexLa(D.zilnic.z, T - 30 * ZI) : -1;
  const out = {
    v: 1, generat: ACUM.toISOString(), mock: MOCK || undefined,
    pret: { usd: rot(D.pret.usd, 2), schimbare24h: rot(D.pret.schimbare24h, 2), schimbare30z: i30 >= 0 ? rot((D.pret.usd / D.zilnic.v[i30] - 1) * 100, 1) : null, sursa: D.pret.sursa },
    fx: D.curs ? { usdRon: D.curs.ultim.usdRon, eurRon: rot(D.curs.ultim.eurRon, 4), data: D.curs.dataUltim, sursa: D.curs.sursa } : null,
    fxIstoric: D.fxIstoric || undefined,
    cap: D.capAzi ? { usd: sig(D.capAzi) } : null,
    module: {}, erori: [],
  };
  const ruleaza = (nr, fn) => {
    try {
      if (!D.zilnic && ['2', '3', '15', '16', '17', '18', '19'].includes(nr)) throw new Error('lipsește istoricul de preț (Coin Metrics)');
      out.module[nr] = { nr, nume: NUME[nr], ...fn(D), stare: 'ok', actualizat: ACUM.toISOString() };
    } catch (e) {
      out.erori.push(`modul ${nr} (${NUME[nr]}): ${e.message}`);
      log(`✗ modul ${nr}: ${e.message}`);
      if (prev?.module?.[nr]) out.module[nr] = { ...prev.module[nr], stare: 'vechi' };
      else out.module[nr] = { nr, nume: NUME[nr], stare: 'lipsa', scor: null, motiv: e.message };
    }
  };
  ruleaza('2', modulCurcubeu);
  D.scor2 = out.module['2']?.scor ?? null;
  ruleaza('16', modulPowerLaw);
  ruleaza('17', modulCiclu);
  ruleaza('15', modulCapitalizare);
  ruleaza('3', modulOnchain);
  ruleaza('4', modulMineri);
  ruleaza('18', modulRandamente);
  ruleaza('19', modulDvol);
  ruleaza('25', modulRetea);
  ruleaza('28', modulStablecoins);
  ruleaza('8', modulSentiment);
  out.verdict = verdict(out.module);
  out.calendar = await calendar(D);
  out.halving = halving(D);
  for (const [nr, m] of Object.entries(out.module)) log(`  ${nr.padStart(2)} ${String(m.nume).padEnd(13)} ${m.stare.padEnd(5)} scor ${m.scor ?? '—'}  ${m.eticheta ?? m.motiv ?? ''}`);
  log(`verdict: termometru ${out.verdict.lung.termometru} (${out.verdict.lung.zona}), termen scurt ${out.verdict.scurt.eticheta} (${out.verdict.scurt.medie})`);
  out.durataMs = Date.now() - t0;
  out.jurnal = LOG.slice(-60);
  await mkdir(dirname(OUT), { recursive: true });
  const txt = JSON.stringify(out);
  await writeFile(OUT, txt);
  log(`scris ${OUT} (${(txt.length / 1024).toFixed(0)} KB) în ${out.durataMs} ms`);
}

principal().catch(e => { console.error(e); process.exit(1); });
