// Răspunsuri simulate, în forma API-urilor reale, pentru testul fără rețea (--mock).
// Valorile sunt ilustrative; nu ajung niciodată în aplicația publicată.
const ZI = 86400000;
const zi = s => Date.parse(`${s}T00:00:00Z`);
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PUNCTE = [
  ['2010-07-18', 0.086], ['2010-11-06', 0.39], ['2011-02-09', 1.0], ['2011-06-08', 29.6], ['2011-08-01', 13], ['2011-11-18', 2.0],
  ['2012-04-01', 4.9], ['2012-08-16', 13.5], ['2012-11-28', 12.4], ['2013-01-15', 14], ['2013-04-09', 230], ['2013-04-16', 68],
  ['2013-07-05', 68], ['2013-10-01', 125], ['2013-12-04', 1150], ['2014-02-25', 530], ['2014-06-01', 630], ['2014-10-05', 320],
  ['2015-01-14', 172], ['2015-06-01', 225], ['2015-11-04', 400], ['2016-03-01', 430], ['2016-07-09', 650], ['2017-01-01', 1000],
  ['2017-06-12', 2900], ['2017-09-01', 4800], ['2017-12-17', 19500], ['2018-02-06', 6900], ['2018-05-05', 9800], ['2018-09-01', 7100],
  ['2018-12-15', 3200], ['2019-03-01', 3800], ['2019-06-26', 12900], ['2019-12-17', 6600], ['2020-03-12', 4900], ['2020-05-11', 8600],
  ['2020-07-01', 9200], ['2020-11-30', 19700], ['2021-04-14', 63500], ['2021-07-20', 29800], ['2021-11-10', 68000], ['2022-06-18', 19000],
  ['2022-11-21', 15800], ['2023-04-14', 30400], ['2023-10-01', 27000], ['2024-03-14', 73000], ['2024-04-20', 63800], ['2024-08-05', 54000],
  ['2024-12-17', 106000], ['2025-01-20', 109000], ['2025-04-07', 76000], ['2025-05-22', 111000], ['2025-07-14', 123000], ['2025-10-06', 126000],
  ['2025-11-21', 84000], ['2025-11-27', 91000], ['2025-12-31', 87500], ['2026-02-13', 67000], ['2026-04-25', 79000], ['2026-06-25', 58000],
  ['2026-07-30', 70000], ['2026-09-01', 76000], ['2026-10-10', 83000], ['2026-11-05', 76000], ['2026-11-19', 63300], ['2026-11-26', 64400],
].map(([d, p]) => [zi(d), p]);

function interp(puncte, t, log = true) {
  if (t <= puncte[0][0]) return puncte[0][1];
  for (let i = 1; i < puncte.length; i++) {
    const [ta, a] = puncte[i - 1], [tb, b] = puncte[i];
    if (t <= tb) {
      const f = (t - ta) / (tb - ta);
      return log ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f) : a + (b - a) * f;
    }
  }
  return puncte.at(-1)[1];
}
function zgomot(n, seed, amp) { // zgomot neted
  const r = rng(seed), out = [];
  let x = 0;
  for (let i = 0; i < n; i++) { x = 0.9 * x + (r() - 0.5) * amp; out.push(x); }
  return out;
}

let CACHE = null;
function istoric(T) {
  if (CACHE) return CACHE;
  const start = zi('2010-07-18'), end = Date.UTC(new Date(T).getUTCFullYear(), new Date(T).getUTCMonth(), new Date(T).getUTCDate()) - ZI;
  const zile = [];
  for (let t = start; t <= end; t += ZI) zile.push(t);
  const z = zgomot(zile.length, 7, 0.05);
  const pret = zile.map((t, i) => {
    let near = Infinity;
    for (const [tk] of PUNCTE) near = Math.min(near, Math.abs(t - tk));
    return interp(PUNCTE, t) * Math.exp(z[i] * Math.min(1, near / (6 * ZI)));
  });
  const halv = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].map(zi);
  const recompensa = t => 50 / 2 ** halv.filter(h => t >= h).length;
  let s = 3640000;
  const sply = zile.map(t => (s += 144 * recompensa(t)));
  let ema = Math.log(pret[0]);
  const realizat = pret.map(p => { ema = ema + (Math.log(p) - ema) / 500; return Math.exp(ema) * 0.72; });
  CACHE = { zile, pret, sply, realizat, recompensa };
  return CACHE;
}

const iso = t => new Date(t).toISOString().replace('.000Z', '.000000000Z');

function coinMetrics(url, T) {
  const u = new URL(url), metrici = u.searchParams.get('metrics').split(','), start = Date.parse(u.searchParams.get('start_time'));
  const H = istoric(T);
  const data = [];
  H.zile.forEach((t, i) => {
    if (t < start) return;
    const r = { asset: 'btc', time: iso(t) };
    for (const m of metrici) {
      const p = H.pret[i];
      if (m === 'PriceUSD') r[m] = String(p);
      if (m === 'SplyCur') r[m] = String(H.sply[i]);
      if (m === 'CapMrktCurUSD') r[m] = String(p * H.sply[i]);
      if (m === 'CapRealUSD') r[m] = String(H.realizat[i] * H.sply[i]);
      if (m === 'CapMVRVCur') r[m] = String(p / H.realizat[i]);
      if (m === 'IssTotUSD') r[m] = String(144 * H.recompensa(t) * p);
    }
    data.push(r);
  });
  return { data };
}

function hashrate(T) {
  const r = rng(11), hashrates = [], difficulty = [];
  const ziAzi = Math.floor(T / ZI) * ZI;
  for (let k = 364; k >= 0; k--) {
    const t = ziAzi - k * ZI, f = (364 - k) / 364;
    const baza = f < 0.8 ? 980 + 160 * f : 1108 - (f - 0.8) * 5 * 170;
    hashrates.push({ timestamp: t / 1000, avgHashrate: (baza + (r() - 0.5) * 40) * 1e18 });
  }
  const schimbari = [2.4, 3.8, -1.2, 1.9, 4.1, 0.6, 2.7, 3.3, -0.4, 1.5, 5.2, 2.0, 1.1, -2.2, 3.6, 0.9, 2.8, 3.1, 1.2, -0.8, 4.5, 2.2, -2.9, -1.5, -9.1];
  let d = 120e12;
  schimbari.forEach((c, i) => {
    d *= 1 + c / 100;
    difficulty.push({ time: (ziAzi - (schimbari.length - 1 - i) * 14 * ZI - 11 * ZI) / 1000, height: 977000 - (schimbari.length - 1 - i) * 2016, difficulty: d, adjustment: 1 + c / 100 });
  });
  return { hashrates, difficulty, currentHashrate: 952e18, currentDifficulty: d };
}

function dvol(T) {
  const puncte = [[-400, 47], [-360, 45], [-330, 43], [-300, 50], [-280, 53], [-250, 54], [-220, 48], [-190, 47], [-160, 46], [-150, 51], [-130, 44], [-100, 40], [-75, 38], [-55, 36], [-35, 37], [-14, 40.8], [-5, 40], [0, 41]]
    .map(([k, v]) => [T + k * ZI, v]);
  const r = rng(5), data = [];
  for (let t = T - 405 * ZI; t <= T; t += ZI) { const c = interp(puncte, t, false) + (r() - 0.5) * 2.4; data.push([t, c, c + 1, c - 1, c]); }
  return { jsonrpc: '2.0', result: { data, continuation: null } };
}

function stablecoins(T) {
  const puncte = [['2020-01-01', 5e9], ['2021-12-31', 160e9], ['2022-12-31', 140e9], ['2023-12-31', 130e9], ['2024-12-31', 205e9],
    ['2025-12-31', 307e9], ['2026-03-01', 309e9], ['2026-05-17', 315.5e9], ['2026-09-01', 308e9], ['2026-10-15', 303e9], ['2026-11-07', 292.3e9],
    ['2026-11-16', 288.9e9], ['2026-11-26', 285e9]].map(([d, v]) => [zi(d), v]);
  const out = [];
  for (let t = zi('2020-01-01'); t < T - ZI / 2; t += ZI) {
    const v = interp(puncte, t);
    out.push({ date: String(t / 1000), totalCirculating: { peggedUSD: v * 0.99 }, totalCirculatingUSD: { peggedUSD: v * 0.99, peggedEUR: v * 0.01 } });
  }
  return out;
}

function bnr(an, T) {
  const eurRon = [[zi('2025-01-01'), 4.97], [zi('2025-12-31'), 5.09], [zi('2026-11-26'), 5.3442]];
  const eurUsd = [[zi('2025-01-01'), 1.03], [zi('2025-06-01'), 1.14], [zi('2025-09-15'), 1.17], [zi('2025-12-31'), 1.16], [zi('2026-11-26'), 1.1007]];
  let x = '<?xml version="1.0" encoding="utf-8"?><DataSet xmlns="http://www.bnr.ro/xsd"><Body><Subject>Reference rates</Subject><OrigCurrency>RON</OrigCurrency>';
  for (let t = Date.UTC(an, 0, 2); t < Math.min(Date.UTC(an + 1, 0, 1), T - ZI / 2); t += ZI) {
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const e = interp(eurRon, t, false), u = e / interp(eurUsd, t, false);
    x += `<Cube date="${new Date(t).toISOString().slice(0, 10)}"><Rate currency="AUD">3.1000</Rate><Rate currency="EUR">${e.toFixed(4)}</Rate><Rate currency="USD">${u.toFixed(4)}</Rate></Cube>`;
  }
  return `${x}</Body></DataSet>`;
}

function ln1y(T) {
  const puncte = [[-365, 5600], [-337, 5851], [-310, 5500], [-275, 5200], [-240, 4950], [-210, 4898], [-185, 4600], [-150, 4300], [-115, 3900], [-90, 3700], [-31, 3455], [-23, 3203], [0, 3150]]
    .map(([k, v]) => [T + k * ZI, v]);
  const out = [];
  for (let t = T - 365 * ZI; t <= T; t += ZI) out.push({ added: Math.floor(t / 1000), channel_count: 28900, node_count: 15900, total_capacity: Math.round(interp(puncte, t, false) * 1e8) });
  return out;
}

export function raspuns(url, tip, T) {
  const u = new URL(url), p = u.pathname;
  if (u.host === 'community-api.coinmetrics.io') return coinMetrics(url, T);
  if (u.host === 'api.exchange.coinbase.com') return { open: '64535.12', high: '65210', low: '63880', last: '64150.00', volume: '9876' };
  if (u.host === 'mempool.space') {
    if (p.endsWith('/difficulty-adjustment')) return { progressPercent: 62.5, difficultyChange: 2.1, estimatedRetargetDate: T + 2.3 * ZI, remainingBlocks: 756, remainingTime: 2.3 * ZI, previousRetarget: -9.1, nextRetargetHeight: 979776, timeAvg: 588000 };
    if (p.endsWith('/hashrate/1y')) return hashrate(T);
    if (p.endsWith('/tip/height')) return '977712';
    if (p.endsWith('/fees/recommended')) return { fastestFee: 3, halfHourFee: 2, hourFee: 2, economyFee: 1, minimumFee: 1 };
    if (p.endsWith('/mempool')) return { count: 11800, vsize: 6200000, total_fee: 4500000 };
    if (p.includes('/reward-stats/')) return { startBlock: 977569, endBlock: 977712, totalReward: '45450000000', totalFee: '450000000', totalTx: '512000' };
    if (p.endsWith('/statistics/latest')) return { latest: { added: new Date(T).toISOString(), channel_count: 28900, node_count: 15900, total_capacity: 315000000000 } };
    if (p.endsWith('/statistics/1y')) return ln1y(T);
  }
  if (u.host === 'www.deribit.com') return dvol(T);
  if (u.host === 'api.alternative.me') {
    const v = [24, 22, 25, 21, 20, 18, 17, 19, 16, 15, 14, 16, 15, 13, 12, 14, 13, 11, 12, 10, 11, 12, 13, 12, 11, 12, 14, 13, 12, 11, 12];
    return { data: v.reverse().map((x, i) => ({ value: String(x), value_classification: x < 25 ? 'Extreme Fear' : 'Fear', timestamp: String(Math.floor((T - i * ZI) / 1000)) })) };
  }
  if (u.host === 'fapi.binance.com') return { symbol: 'BTCUSDT', lastFundingRate: '-0.00004000' };
  if (u.host === 'stablecoins.llama.fi') {
    if (p.endsWith('/stablecoincharts/all')) return stablecoins(T);
    return { peggedAssets: [{ symbol: 'USDT', circulating: { peggedUSD: 175.4e9 } }, { symbol: 'USDC', circulating: { peggedUSD: 69.3e9 } }] };
  }
  if (u.host === 'api.coinpaprika.com') return { bitcoin_dominance_percentage: 59.1, market_cap_usd: 2.19e12 };
  if (u.host === 'www.bnr.ro') {
    const m = /nbrfxrates(\d{4})\.xml/.exec(p);
    if (m) return bnr(+m[1], T);
    return bnr(new Date(T).getUTCFullYear(), T).replace(/<Cube[\s\S]*(<Cube date="[^"]+">[\s\S]*?<\/Cube>)<\/Body>/, '$1</Body>');
  }
  if (u.host === 'www.cursbnr.ro') {
    const d = u.searchParams.get('date');
    const t = d ? Date.parse(`${d}T00:00:00Z`) : T - ZI;
    if (new Date(t).getUTCDay() % 6 === 0) return { date: d, quote: 'RON', rates: { EUR: null, USD: null } };
    const eurRon = interp([[zi('2025-01-01'), 4.97], [zi('2025-12-31'), 5.09], [zi('2026-11-26'), 5.3442]], t, false);
    const eurUsd = interp([[zi('2025-01-01'), 1.03], [zi('2025-06-01'), 1.14], [zi('2025-09-15'), 1.17], [zi('2025-12-31'), 1.16], [zi('2026-11-26'), 1.1007]], t, false);
    return { date: new Date(t).toISOString().slice(0, 10), quote: 'RON', rates: { EUR: +eurRon.toFixed(4), USD: +(eurRon / eurUsd).toFixed(4) } };
  }
  if (u.host === 'btcnodes.io') {
    const r = rng(3);
    return { count: 200, results: Array.from({ length: 200 }, (_, i) => ({ url: '', timestamp: Math.floor((T - i * 600000) / 1000), total_nodes: Math.round(23800 + (r() - 0.5) * 300), latest_height: 977712 })) };
  }
  throw new Error(`mock: fără răspuns pentru ${url}`);
}
