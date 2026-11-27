// Probă temporară: verific cheia FRED din GitHub Secrets (cheia și adresele cu ea nu apar în jurnal).
const K = process.env.FRED_API_KEY || '';
console.log('cheie FRED:', K ? `prezentă (${K.length} caractere, ${/^[a-z0-9]{32}$/.test(K) ? 'format corect' : 'format neobișnuit'})` : 'LIPSĂ');
for (const id of ['DFEDTARU', 'DFEDTARL', 'DGS10', 'SP500', 'M2SL', 'DTWEXBGS', 'NASDAQCOM']) {
  try {
    const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${K}&file_type=json&sort_order=desc&limit=3`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'tablou-btc/1.0' } });
    const t = await r.text();
    let rez = t.slice(0, 160).replace(/\s+/g, ' ');
    try { const j = JSON.parse(t); if (j.observations) rez = j.observations.map(o => `${o.date}: ${o.value}`).join(' | '); else rez = `${j.error_code} ${j.error_message}`; } catch {}
    console.log(`${id} → ${r.status} ${rez}`);
  } catch (e) { console.log(id, 'EROARE', e.cause?.code || e.message); }
}
