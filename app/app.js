/* Tablou BTC — aplicația (fără biblioteci, fără AI).
 * Citește tablou.json (scris de sarcina programată la 30 de minute) și prețul live de pe Binance.
 * Toate concluziile vin din reguli fixe, calculate în scripts/colecteaza.mjs. */
'use strict';
(() => {
  const ZI = 86400000, GENEZA = Date.UTC(2009, 0, 3), MINUS = '−';
  const LS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
  const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
  const CURCUBEU = ['#3653A8', '#3F7FD0', '#34A6B5', '#4DB37A', '#A8C54A', '#E3C443', '#F09A3A', '#E5683A', '#C9343F'];
  const C = { alb: '#F4F6F8', albastru: '#3F7FD0', albDeschis: '#9CC8FF', portocaliu: '#F09A3A', accent: '#F7931A', gri: '#C9D1D9', griInchis: '#6E7681', galben: '#F2D06B', verde: '#8FD9AE' };

  let DATE = null, LIVE = null, SURSA_DATE = 'rețea', ULTIMA_INCARCARE = 0;

  // ------------------------------------------------------------ formatare
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF = new Map();
  const fin = v => v != null && Number.isFinite(v);
  const nf = (v, d = 0) => {
    if (!fin(v)) return '—';
    if (!NF.has(d)) NF.set(d, new Intl.NumberFormat('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }));
    return NF.get(d).format(v).replace('-', MINUS);
  };
  const semn = (v, d = 0) => (!fin(v) ? '—' : (Math.round(v * 10 ** d) > 0 ? '+' : Math.round(v * 10 ** d) < 0 ? MINUS : '') + nf(Math.abs(v), d));
  const pct = (v, d = 0) => (!fin(v) ? '—' : `${semn(v, d)}%`);
  const usd = (v, d) => (!fin(v) ? '—' : `${nf(v, d ?? (v < 100 ? 2 : 0))} $`);
  const mld = (v, d) => (!fin(v) ? '—' : `${nf(v / 1e9, d ?? (v >= 1e11 ? 0 : 1))} mld $`);
  const scorTxt = s => (!fin(s) ? '—' : (s > 0 ? '+' : s < 0 ? MINUS : '') + nf(Math.abs(s), Number.isInteger(s) ? 0 : 1));
  const dinZi = d => GENEZA + d * ZI;
  const zg = t => Math.round((t - GENEZA) / ZI);
  const r1 = v => Math.round(v * 10) / 10;
  const mare = s => s.charAt(0).toUpperCase() + s.slice(1);

  const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function parti(t) {
    const o = {};
    for (const p of FMT.formatToParts(new Date(t))) o[p.type] = p.value;
    return { an: +o.year, luna: +o.month - 1, zi: +o.day, zs: WD[o.weekday], ora: o.hour === '24' ? '00' : o.hour, min: o.minute };
  }
  const oraRo = t => { const p = parti(t); return `${p.ora}:${p.min}`; };
  const dataScurta = t => { const p = parti(t); return `${p.zi} ${LS[p.luna]} ${p.an}`; };
  const lunaAn = t => { const p = parti(t); return `${LS[p.luna]} ${p.an}`; };
  function ziRelativa(t, cuAn) {
    const a = parti(Date.now()), b = parti(t);
    const dz = Math.round((Date.UTC(b.an, b.luna, b.zi) - Date.UTC(a.an, a.luna, a.zi)) / ZI);
    if (dz === 0) return 'azi';
    if (dz === 1) return 'mâine';
    if (dz === -1) return 'ieri';
    return `${ZILE[b.zs]} ${b.zi} ${LS[b.luna]}${cuAn && b.an !== a.an ? ` ${b.an}` : ''}`;
  }
  const cand = t => `${ziRelativa(t, true)}, ${oraRo(t)}`;

  // ------------------------------------------------------------ piese de interfață
  const ICON = {
    reimprospateaza: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
    info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>',
    bifa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    sageata: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    ok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8FD9AE" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    atentie: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFB27A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
    ceas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };
  const tipScor = s => (!fin(s) ? 'gri' : s > 0 ? 'fav' : s < 0 ? 'unfav' : 'neu');
  const chip = (txt, tip = 'gri') => `<span class="chip chip-${tip}">${esc(txt)}</span>`;
  const chipScor = s => `<span class="chip-scor chip-${tipScor(s)}">${scorTxt(s)}</span>`;
  const insigna = (nr, cls = '') => `<span class="insigna ${cls}">${esc(nr)}</span>`;
  const bara = (titlu, extra = '') => `<header class="bara"><h1>${esc(titlu)}</h1>${extra}<button type="button" class="btn-icon" data-act="reimprospateaza" aria-label="Reîmprospătează">${ICON.reimprospateaza}</button></header>`;
  const cutie = (st, dr, continut, cls = '') => `<div class="cutie ${cls}">${st || dr ? `<div class="cutie-cap"><span>${st || ''}</span><span>${dr || ''}</span></div>` : ''}${continut}</div>`;
  const stat = (l, v, s, cls = '') => `<div class="stat"><div class="stat-l">${esc(l)}</div><div class="stat-v ${cls}">${esc(v)}</div><div class="stat-s">${esc(s)}</div></div>`;
  const grila = arr => `<div class="grila2">${arr.join('')}</div>`;
  const chipuri = arr => `<div class="chipuri">${arr.filter(Boolean).join('')}</div>`;
  const legenda = items => `<div class="legenda">${items.map(([tip, cul, txt]) => `<span><i class="leg-${tip}" style="--c:${cul}"></i>${esc(txt)}</span>`).join('')}</div>`;
  const mare32 = txt => `<div class="mare">${esc(txt)}</div>`;
  function antet(nr, titlu, m) {
    let dr;
    if (m?.nr === '25') dr = `<span class="chip chip-${m.valori?.sanatoasa ? 'ok' : 'unfav'} cu-icon">${m.valori?.sanatoasa ? ICON.bifa : ''}${esc(m.eticheta)}</span>`;
    else if (m?.informativ) dr = chip('informativ');
    else dr = chipScor(m?.scor);
    return `<div class="antet">${[].concat(nr).map(n => insigna(n)).join('')}<h2>${esc(titlu)}</h2>${dr}</div>`;
  }
  function regula(m) {
    const vechi = m.stare === 'vechi' ? `<div class="avert">${ICON.ceas}<span>Sursa nu a răspuns la ultima actualizare; datele sunt din ${esc(cand(Date.parse(m.actualizat)))}.</span></div>` : '';
    return `${vechi}<div class="cutie"><div class="regula">Regulă: ${esc(m.regula)}</div><p class="concluzie"><strong>Concluzie: </strong>${esc(m.concluzie)}</p></div><div class="surse">Surse: ${esc(m.surse)}</div>`;
  }
  const sectiune = continut => `<section class="card">${continut}</section>`;

  // ------------------------------------------------------------ grafice SVG
  let idGrafic = 0;
  function scala(min, max, a, b, log) {
    if (log) { const l0 = Math.log10(min), l1 = Math.log10(max); return v => a + ((Math.log10(v) - l0) / (l1 - l0)) * (b - a); }
    return v => a + ((v - min) / (max - min)) * (b - a);
  }
  function cale(pts, sx, sy) {
    let s = '';
    for (const [x, y] of pts) {
      if (!fin(y) || !fin(x)) continue;
      s += `${s ? 'L' : 'M'}${r1(sx(x))},${r1(sy(y))}`;
    }
    return s;
  }
  function grafic(o) {
    const w = 300, h = o.h, st = o.st ?? 30, dr = o.dr ?? 296, sus = o.sus ?? 8, jos = o.jos ?? h - 18;
    const sx = scala(o.x.min, o.x.max, st, dr, o.x.log), sy = scala(o.y.min, o.y.max, jos, sus, o.y.log);
    const id = `g${++idGrafic}`;
    let g = `<defs><clipPath id="${id}"><rect x="${st}" y="${sus - 4}" width="${dr - st + 4}" height="${jos - sus + 8}"/></clipPath></defs>`;
    for (const [v] of o.gridY || []) g += `<path d="M${st},${r1(sy(v))}H${dr}" stroke="#fff" stroke-opacity=".08"/>`;
    let corp = '';
    for (const z of o.zone || []) {
      const x0 = Math.max(st, sx(z.x0)), x1 = Math.min(dr, sx(z.x1));
      if (x1 > x0) corp += `<rect x="${r1(x0)}" y="${sus}" width="${r1(x1 - x0)}" height="${r1(jos - sus)}" fill="${z.cul}" fill-opacity="${z.op ?? 0.12}"/>`;
    }
    if (o.fundal) corp += o.fundal(sx, sy, { st, dr, sus, jos });
    for (const l of o.oriz || []) corp += `<path d="M${st},${r1(sy(l.y))}H${dr}" stroke="${l.cul}" stroke-opacity="${l.op ?? 0.6}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''}/>`;
    for (const s of o.serii || []) {
      const d = cale(s.pts, sx, sy);
      if (!d) continue;
      const pv = s.pts.filter(p => fin(p[1]));
      if (s.arie) corp += `<path d="${d}L${r1(sx(pv.at(-1)[0]))},${jos}L${r1(sx(pv[0][0]))},${jos}Z" fill="${s.cul}" fill-opacity="${s.arie}"/>`;
      corp += `<path d="${d}" fill="none" stroke="${s.cul}" stroke-width="${s.gros ?? 1.6}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.op ? ` stroke-opacity="${s.op}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    g += `<g clip-path="url(#${id})">${corp}</g>`;
    if (o.deasupra) g += o.deasupra(sx, sy, { st, dr, sus, jos });
    for (const p of o.puncte || []) {
      g += p.gol
        ? `<circle cx="${r1(sx(p.x))}" cy="${r1(sy(p.y))}" r="${p.r ?? 3.5}" fill="none" stroke="${p.cul}" stroke-width="1.5"/>`
        : `<circle cx="${r1(sx(p.x))}" cy="${r1(sy(p.y))}" r="${p.r ?? 4}" fill="${p.cul}" stroke="#0E1116" stroke-width="2"/>`;
    }
    let et = '';
    for (const [v, t] of o.gridY || []) if (t) et += `<text x="2" y="${r1(Math.max(11, sy(v) + 3.5))}">${esc(t)}</text>`;
    for (const t of o.text || []) et += `<text x="${r1(sx(t.x) + (t.dx || 0))}" y="${r1(sy(t.y) + (t.dy || 0))}" text-anchor="${t.anchor || 'middle'}"${t.cul ? ` fill="${t.cul}"` : ''}>${esc(t.t)}</text>`;
    let ex = '';
    for (const [v, t, anchor] of o.etX || []) {
      const x = sx(v);
      if (x < st - 1 || x > dr + 1) continue;
      ex += `<text x="${r1(x)}" y="${h - 3}" text-anchor="${anchor || 'middle'}">${esc(t)}</text>`;
    }
    return `<svg viewBox="0 0 ${w} ${h}" class="grafic" role="img" aria-label="${esc(o.label)}">${g}<g class="et-y">${et}</g><g class="et-x">${ex}</g></svg>`;
  }
  function etAni(x0, x1, pas = 1) {
    const out = [];
    const a0 = new Date(dinZi(x0)).getUTCFullYear() + 1, a1 = new Date(dinZi(x1)).getUTCFullYear();
    for (let a = a0; a <= a1; a += pas) out.push([zg(Date.UTC(a, 0, 1)), String(a)]);
    return out;
  }
  function etLuni(x0, x1, pas = 3) {
    const out = [];
    const d = new Date(dinZi(x0));
    let a = d.getUTCFullYear(), l = d.getUTCMonth() + 1;
    for (;;) {
      if (l > 11) { l = 0; a++; }
      const z = zg(Date.UTC(a, l, 1));
      if (z > x1) break;
      if (l % pas === 0) out.push([z, l === 0 ? String(a) : LS[l]]);
      l++;
    }
    return out;
  }
  const minMax = (pts, pad = 0.06) => {
    let mn = Infinity, mx = -Infinity;
    for (const p of pts) if (fin(p[1])) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); }
    const r = mx - mn || Math.abs(mx) || 1;
    return [mn - r * pad, mx + r * pad];
  };
  const etPret = v => (v >= 1e6 ? `${nf(v / 1e6)}M` : v >= 1e3 ? `${nf(v / 1e3)}k` : `${nf(v)} $`);

  // ------------------------------------------------------------ date
  const pretAcum = () => LIVE?.pret ?? DATE?.pret?.usd;
  const modul = nr => DATE?.module?.[nr];

  // ------------------------------------------------------------ ecranul Acasă
  function gauge(t) {
    const L = 47.9, a = ((180 - t * 1.8) * Math.PI) / 180;
    const x = r1(75 + L * Math.cos(a)), y = r1(78 - L * Math.sin(a));
    return `<svg width="140" height="78" viewBox="0 0 150 84" role="img" aria-label="Termometru ${t} din 100"><g fill="none" stroke-width="12">
<path d="M13,78 A62,62 0 0 1 24.8,41.6" stroke="#3F7FD0"/><path d="M24.8,41.6 A62,62 0 0 1 55.8,19" stroke="#34A6B5"/><path d="M55.8,19 A62,62 0 0 1 94.2,19" stroke="#E3C443"/><path d="M94.2,19 A62,62 0 0 1 125.2,41.6" stroke="#F09A3A"/><path d="M125.2,41.6 A62,62 0 0 1 137,78" stroke="#C9343F"/></g>
<path d="M75,78 L${x},${y}" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/><circle cx="75" cy="78" r="5" fill="#FFFFFF"/></svg>`;
  }
  const NUME_PLACI = { 2: 'Curcubeu', 3: 'On-chain', 4: 'Minerii', 15: 'Capitalizare', 16: 'Power Law', 17: 'Ciclu', 6: 'ETF', 7: 'Macro', 8: 'Sentiment', 19: 'Volatilitate', 20: 'Derivate', 28: 'Stablecoins' };
  const ETAPA = { 6: 'etapa 2', 7: 'etapa 3', 9: 'etapa 2', 20: 'etapa 3', 24: 'etapa 2' };
  function placa(nr) {
    const m = modul(nr);
    if (!m || m.stare === 'lipsa') {
      const viitor = ETAPA[nr];
      return `<div class="placa placa-gol">${`<span class="placa-cap">${insigna(nr)}<span class="placa-nume">${esc(NUME_PLACI[nr])}</span></span>`}<span class="placa-val gri">${viitor ? 'În curând' : 'Indisponibil'}</span><span class="placa-det">${viitor ? `vine în ${viitor}` : 'sursa nu răspunde'}</span></div>`;
    }
    const cl = tipScor(m.scor);
    return `<a class="placa" href="#grafice/${nr}"><span class="placa-cap">${insigna(nr)}<span class="placa-nume">${esc(NUME_PLACI[nr])}</span>${chipScor(m.scor)}</span><span class="placa-val ${cl}">${esc(m.eticheta)}</span><span class="placa-det">${esc(m.detaliu)}</span>${m.stare === 'vechi' ? '<span class="placa-vechi">date vechi</span>' : ''}</a>`;
  }
  function ecranAcasa() {
    const v = DATE.verdict, L = v.lung, S = v.scurt;
    const p = pretAcum(), ch = LIVE?.schimbare ?? DATE.pret.schimbare24h;
    const fx = DATE.fx, cap = modul('15')?.valori;
    const varsta = Date.now() - Date.parse(DATE.generat);
    const stare = varsta > 3 * 3600000
      ? `<div class="stare avert-text">${ICON.atentie}Date din ${esc(cand(Date.parse(DATE.generat)))}${SURSA_DATE === 'cache' ? ' (offline)' : ''} · sarcina programată nu a mai rulat</div>`
      : `<div class="stare">Actualizat ${esc(cand(Date.parse(DATE.generat)))}${SURSA_DATE === 'cache' ? ' · offline' : ''} · doar surse gratuite</div>`;
    const lei = fx ? `<div class="rand-lei">${insigna('27', 'mica')}<span>≈ <strong class="num">${nf(p * fx.usdRon)} lei</strong> · <strong class="num">${nf((p * fx.usdRon) / fx.eurRon)} €</strong></span><span class="gri-txt">curs ${esc(fx.sursa)}</span></div>` : '';
    const capRand = cap ? `<div class="rand-cap"><span>Capitalizare <strong class="num">${mld(LIVE?.pret && DATE.cap?.usd ? (DATE.cap.usd * LIVE.pret) / DATE.pret.usd : cap.cap)}</strong></span>${chip(`${pct(cap.fata200)} față de media 200 z`, cap.fata200 < 0 ? 'fav' : cap.fata200 > 50 ? 'unfav' : 'gri')}</div>` : '';
    const termo = L.termometru;
    const placiLung = ['2', '3', '4', '15', '16', '17'].map(placa).join('');
    const placiScurt = ['6', '7', '8', '20', '19', '28'].map(placa).join('');
    const stiri = `<div class="placa-rand placa-gol">${insigna('9')}<span class="pr-txt"><span class="pr-t">Știri, ultimele 48 de ore</span><span class="pr-s">vin în etapa 2</span></span></div>`;
    const info = [['18', 'Randamente'], ['24', 'Pariuri (Polymarket)'], ['25', 'Rețea']].map(([nr, t]) => {
      const m = modul(nr);
      if (!m || m.stare === 'lipsa') return `<div class="info-rand info-gol">${insigna(nr)}<span class="pr-txt"><span class="pr-t">${esc(t)}</span><span class="pr-s">${ETAPA[nr] ? `vine în ${ETAPA[nr]}` : 'indisponibil acum'}</span></span></div>`;
      return `<a class="info-rand" href="#grafice/${nr}">${insigna(nr)}<span class="pr-txt"><span class="pr-t">${esc(t)}</span><span class="pr-s">${esc(nr === '18' ? m.eticheta : m.detaliu)}</span></span>${ICON.sageata}</a>`;
    }).join('');
    return `<header class="bara"><svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="15" fill="#F7931A"/><text x="15" y="20.5" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="16" fill="#0E1116">₿</text></svg><h1 style="margin-left:8px">Tablou BTC</h1>
<button type="button" class="btn-icon" data-act="despre" aria-label="Despre aplicație">${ICON.info}</button><button type="button" class="btn-icon" data-act="reimprospateaza" aria-label="Reîmprospătează">${ICON.reimprospateaza}</button></header>
<main class="continut">
${stare}
<div class="rand-pret"><div class="pret num">${nf(p)} $</div>${chip(`${pct(ch, 1)} în 24 h`, ch < 0 ? 'unfav' : 'fav')}<span class="gri-txt">${pct(DATE.pret.schimbare30z)} în 30 de zile</span></div>
${lei}${capRand}
<section class="card verdict"><div class="verdict-sus">${fin(termo) ? gauge(termo) : ''}<div class="verdict-txt">
<div class="mic-titlu">${insigna('1', 'mica')}Verdict pe termen lung</div>
<div class="termo num ${termo < 40 ? 'fav' : termo >= 60 ? 'unfav' : 'neu'}">${fin(termo) ? termo : '—'}<span> / 100</span></div>
<div class="${termo < 40 ? 'fav' : termo >= 60 ? 'unfav' : 'neu'}">${esc(L.zona || '—')}</div>
${S.eticheta ? chip(`Termen scurt: ${S.eticheta} (${semn(S.medie, 1)})`, S.eticheta === 'negativ' ? 'unfav' : S.eticheta === 'pozitiv' ? 'fav' : 'neu') : ''}
</div></div>
${v.fraza ? `<p class="verdict-fraza">${esc(v.fraza)}</p>` : ''}
<button type="button" class="link-btn" data-act="calcul">Vezi calculul (reguli fixe)${ICON.sageata}</button></section>
<div class="sect"><h2>Termen lung · intră în termometru</h2><span>media ${semn(L.medie, 2)}</span></div>
<div class="grila2">${placiLung}</div>
<div class="sect"><h2>Termen scurt</h2><span>${S.module.length} din 7 module · media ${semn(S.medie, 2)}</span></div>
<div class="grila2">${placiScurt}</div>
${stiri}
<div class="sect"><h2>Informativ · nu intră în verdict</h2></div>
<div class="info-lista">${info}</div>
<p class="disclaimer">Informații, nu sfaturi financiare. Regulile sunt fixe și se văd în fiecare card.</p>
</main>`;
  }

  // ------------------------------------------------------------ ecranele de grafice
  const CIPURI = [['2', 'Curcubeu'], ['16', 'Power Law'], ['15', 'Capitalizare'], ['3', 'On-chain'], ['17', 'Ciclu'], ['18', 'Randamente'], ['4', 'Mineri'], ['25', 'Rețea'], ['28', 'Stablecoins'], ['19', 'Derivate'], ['8', 'Sentiment']];

  const RAND = {};

  RAND['2'] = m => {
    const v = m.valori, g = m.grafic, p = pretAcum();
    const x0 = zg(Date.UTC(2012, 0, 1)), x1 = zg(Date.UTC(2028, 11, 31));
    const mij = d => 10 ** (g.model.a * Math.log(d) + g.model.b);
    const lim = [-0.8, ...g.limite, 1.0];
    const zile = [];
    for (let d = x0; d < x1; d += 45) zile.push(d);
    zile.push(x1);
    const fundal = (sx, sy) => {
      let s = '';
      for (let i = 0; i < 9; i++) {
        const sus = zile.map(d => `${r1(sx(d))},${r1(sy(mij(d) * 10 ** lim[i + 1]))}`);
        const jos = zile.slice().reverse().map(d => `${r1(sx(d))},${r1(sy(mij(d) * 10 ** lim[i]))}`);
        s += `<path d="M${sus.join('L')}L${jos.join('L')}Z" fill="${CURCUBEU[i]}" fill-opacity="${i + 1 === v.banda ? 0.75 : 0.42}"/>`;
      }
      return s;
    };
    const pret = g.pret.filter(x => x[0] >= x0);
    const azi = zg(Date.now());
    const svg = grafic({
      h: 190, x: { min: x0, max: x1 }, y: { min: 1, max: 3e6, log: true }, fundal,
      gridY: [[1, '1 $'], [100, '100 $'], [1e4, '10k $'], [1e6, '1M $']],
      serii: [{ pts: pret, cul: C.alb, gros: 1.3 }], puncte: [{ x: azi, y: p, cul: C.accent }],
      etX: [[zg(Date.UTC(2012, 0, 1)), '2012', 'start'], [zg(Date.UTC(2016, 0, 1)), '2016'], [zg(Date.UTC(2020, 0, 1)), '2020'], [zg(Date.UTC(2024, 0, 1)), '2024'], [zg(Date.UTC(2028, 0, 1)), '2028']],
      label: `Curcubeul Bitcoin din 2012: prețul e în banda ${v.banda} din 9`,
    });
    const randuri = v.benzi.map((b, i) => ({ ...b, i })).reverse().map(b => {
      const interval = b.de == null ? `sub ${nf(b.pana)}` : b.pana == null ? `peste ${nf(b.de)}` : `${nf(b.de)}–${nf(b.pana)}`;
      const acum = b.i + 1 === v.banda;
      return `<tr class="${acum ? 'acum' : ''}"><td><i class="banda" style="--c:${CURCUBEU[b.i]}"></i>${b.i + 1}. ${esc(b.nume)}${acum ? ' <span class="azi-et">← azi</span>' : ''}</td><td class="num dr">${interval}</td><td class="dr">${chipScor(b.scor)}</td></tr>`;
    }).join('');
    const jos = v.banda > 1 ? v.benzi[v.banda - 2] : null;
    return sectiune(`${antet('2', 'Curcubeul Bitcoin', m)}${mare32(usd(p))}
${chipuri([chip(`banda ${v.banda} din 9 · ${v.benzi[v.banda - 1].nume}`, tipScor(m.scor)), chip(`${pct(v.fataDeMijloc)} față de mijloc`, v.fataDeMijloc < 0 ? 'fav' : 'unfav'), jos ? chip(`${pct((v.benzi[v.banda - 1].de / p - 1) * 100, 1)} până la „${jos.nume}”`) : ''])}
${cutie('Preț, scară log · 2012–2028', `mijloc: ${nf(v.mijloc)} $`, svg)}
${cutie('Cele 9 benzi azi (în $)', 'scor', `<table class="tabel benzi"><tbody>${randuri}</tbody></table>`)}
${regula(m)}`);
  };

  RAND['16'] = m => {
    const v = m.valori, g = m.grafic, p = pretAcum(), k = v.k;
    const centru = d => 10 ** (v.interceptie + v.panta * Math.log10(d));
    const azi = zg(Date.now());
    const pretTot = g.pret;
    const d0 = 700, d1 = 7700;
    const svg1 = grafic({
      h: 176, x: { min: d0, max: d1, log: true }, y: { min: 0.1, max: 1e6, log: true },
      fundal: (sx, sy) => `<path d="M${r1(sx(d0))},${r1(sy(centru(d0)))}L${r1(sx(d1))},${r1(sy(centru(d1)))}L${r1(sx(d1))},${r1(sy(centru(d1) * k))}L${r1(sx(d0))},${r1(sy(centru(d0) * k))}Z" fill="#408CFF" fill-opacity=".12"/>`,
      serii: [
        { pts: [[d0, centru(d0)], [d1, centru(d1)]], cul: '#E6EDF3', op: 0.6, dash: '5 3', gros: 1.4 },
        { pts: [[d0, centru(d0) * k], [d1, centru(d1) * k]], cul: C.albastru, gros: 1.8 },
        { pts: pretTot, cul: C.alb, gros: 1.3 },
      ],
      gridY: [[1, '1 $'], [100, '100 $'], [1e4, '10k $'], [1e6, '1M $']],
      puncte: [{ x: azi, y: p, cul: C.accent }],
      etX: [[zg(Date.UTC(2012, 0, 1)), '2012'], [zg(Date.UTC(2014, 0, 1)), '2014'], [zg(Date.UTC(2016, 0, 1)), '2016'], [zg(Date.UTC(2020, 0, 1)), '2020'], [zg(Date.UTC(2024, 0, 1)), '2024']],
      label: 'Prețul BTC pe scară log-log, cu linia centrală și podeaua modelului',
    });
    const zoom = g.zoom;
    const z0 = zoom[0][0], z1 = Math.max(zoom.at(-1)[0], azi);
    const pctr = [];
    for (let d = z0; d <= z1; d += 15) pctr.push([d, centru(d)]);
    pctr.push([z1, centru(z1)]);
    const pf = pctr.map(([d, c]) => [d, c * k]);
    const vals = [...zoom.map(x => x[1]), ...pf.map(x => x[1]), ...pctr.map(x => x[1])];
    const ymin = Math.min(...vals) * 0.9, ymax = Math.max(...vals) * 1.08;
    const ticks = [10e3, 20e3, 30e3, 50e3, 100e3, 200e3, 300e3, 500e3].filter(t => t > ymin && t < ymax);
    const at = v.atingere;
    const svg2 = grafic({
      h: 120, x: { min: z0, max: z1 }, y: { min: ymin, max: ymax, log: true },
      fundal: (sx, sy) => `<path d="M${pctr.map(([d, c]) => `${r1(sx(d))},${r1(sy(c))}`).join('L')}L${pf.slice().reverse().map(([d, c]) => `${r1(sx(d))},${r1(sy(c))}`).join('L')}Z" fill="#408CFF" fill-opacity=".12"/>`,
      serii: [{ pts: pctr, cul: '#E6EDF3', op: 0.6, dash: '5 3', gros: 1.4 }, { pts: pf, cul: C.albastru, gros: 1.8 }, { pts: zoom, cul: C.alb, gros: 1.6 }],
      gridY: ticks.map(t => [t, etPret(t)]),
      puncte: [...(at && zg(at.t) >= z0 ? [{ x: zg(at.t), y: at.pret, cul: C.albDeschis, gol: true }] : []), { x: azi, y: p, cul: C.accent }],
      etX: etLuni(z0, z1, 6),
      label: 'Ultimele 24 de luni: prețul față de podea și linia centrală',
    });
    // banda de poziție
    const lr = Math.log10(p / (centru(azi) * k));
    const lim = [0, Math.log10(1.5), Math.log10(1 / k), Math.log10(2 / k)];
    const D0 = Math.min(-0.2, lr - 0.05), D1 = Math.max(1.0, lr + 0.05);
    const X = q => ((q - D0) / (D1 - D0)) * 300;
    const seg = [[D0, lim[0], '#3F7FD0', '+2'], [lim[0], lim[1], '#34A6B5', '+1'], [lim[1], lim[2], '#E3C443', '0'], [lim[2], lim[3], '#F09A3A', '−1'], [lim[3], D1, '#C9343F', '−2']];
    const mx = X(lr);
    const bar = `<svg viewBox="0 0 300 40" class="grafic" role="img" aria-label="Benzile de scor față de podea; prețul e în banda ${scorTxt(m.scor)}">${seg.map(([a, b, c]) => `<rect x="${r1(X(a))}" y="12" width="${r1(Math.max(0, X(b) - X(a) - 1))}" height="12" fill="${c}"/>`).join('')}
<path d="M${r1(mx - 4)},2 L${r1(mx + 4)},2 L${r1(mx)},10Z" fill="#fff"/><g class="et-x">${seg.map(([a, b, , t]) => `<text x="${r1((X(a) + X(b)) / 2)}" y="37" text-anchor="middle">${t}</text>`).join('')}</g></svg>`;
    return sectiune(`${antet('16', 'Power Law (legea puterii)', m)}${mare32(usd(p))}
${chipuri([chip(`${nf(Math.abs(v.fataPodea))}% ${v.fataPodea < 0 ? 'sub' : 'peste'} podea`, v.fataPodea < 50 ? 'fav' : 'gri'), chip(`${nf(Math.abs(v.fataCentru))}% ${v.fataCentru < 0 ? 'sub' : 'peste'} linia centrală`, v.fataCentru < 0 ? 'fav' : 'unfav'), chip(`ziua ${nf(v.zile)}`)])}
${cutie('Toată istoria · scară log-log', `panta ${nf(v.panta, 2)}`, svg1 + legenda([['linie', C.alb, 'preț'], ['punctat', '#C9D1D9', 'linia centrală'], ['linie', C.albastru, 'podea'], ['patrat', 'rgba(64,140,255,.3)', 'zona de valoare']]))}
${cutie('Ultimele 24 de luni', `<span class="fav">podea azi: ${usd(v.podea)}</span>`, svg2)}
${cutie('Unde e prețul față de podea', 'scorul', `${bar}<div class="sub-bara"><span>sub podea</span><span>1,5× podea</span><span>centru</span><span>2× centru</span></div>`)}
${grila([
      stat('podea azi', usd(v.podea), `urcă ~${nf(v.cresterePodeaZi, 2)}% pe zi`),
      stat('linia centrală', usd(v.centru), `prețul e cu ${nf(Math.abs(v.fataCentru))}% ${v.fataCentru < 0 ? 'sub' : 'peste'}`),
      stat('podea peste 1 an', `≈ ${usd(v.podeaPeste1An)}`, 'dacă modelul ține'),
      at ? stat('ultima atingere', lunaAn(at.t), `${usd(at.pret)}, apoi ${pct(at.apoi)}`) : stat('ultima atingere', '—', 'nu în ultimii ani'),
    ])}
${regula(m)}`);
  };

  RAND['15'] = m => {
    const v = m.valori, g = m.grafic;
    const toate = [...g.cap, ...g.ma50, ...g.ma200].map(x => [x[0], x[1] / 1e9]);
    const [ymin, ymax] = minMax(toate, 0.08);
    const pas = ymax - ymin > 1500 ? 500 : ymax - ymin > 600 ? 200 : 100;
    const grid = [];
    for (let t = Math.ceil(ymin / pas) * pas; t < ymax; t += pas) grid.push([t, nf(t)]);
    const x0 = g.cap[0][0], x1 = g.cap.at(-1)[0];
    const svg1 = grafic({
      h: 140, st: 34, x: { min: x0, max: x1 }, y: { min: ymin, max: ymax }, gridY: grid,
      serii: [{ pts: g.ma200.map(x => [x[0], x[1] / 1e9]), cul: C.gri, dash: '2 3', gros: 1.4 }, { pts: g.ma50.map(x => [x[0], x[1] / 1e9]), cul: C.albDeschis, dash: '5 3', gros: 1.4 }, { pts: g.cap.map(x => [x[0], x[1] / 1e9]), cul: C.alb, gros: 1.8 }],
      puncte: [{ x: x1, y: g.cap.at(-1)[1] / 1e9, cul: C.accent }], etX: etLuni(x0, x1, 3), label: 'Capitalizarea pe 12 luni cu mediile de 50 și 200 de zile',
    });
    const ab = g.abateri, mxAb = Math.max(10, ...ab.map(x => Math.abs(x[1])));
    const bw = 266 / ab.length;
    const bare = ab.map(([, val], i) => { const hgt = (Math.abs(val) / mxAb) * 30; return `<rect x="${r1(30 + i * bw)}" y="${r1(val >= 0 ? 36 - hgt : 36)}" width="${r1(Math.max(1, bw - 1.2))}" height="${r1(Math.max(0.5, hgt))}" fill="${val >= 0 ? '#F09A3A' : '#3F7FD0'}"/>`; }).join('');
    const svg2 = `<svg viewBox="0 0 300 74" class="grafic" role="img" aria-label="Distanța săptămânală față de media de 200 de zile, ultimul an"><path d="M30,36H300" stroke="#fff" stroke-opacity=".3"/>${bare}<g class="et-y"><text x="2" y="12">peste</text><text x="2" y="70">sub</text></g><g class="et-x"><text x="296" y="${ab.at(-1)[1] >= 0 ? 72 : 10}" text-anchor="end" fill="${ab.at(-1)[1] >= 0 ? '#FFB27A' : '#9CC8FF'}">azi ${pct(ab.at(-1)[1])}</text></g></svg>`;
    const dom = fin(v.dominanta) ? cutie('Dominanța BTC', `${nf(v.dominanta, 1)}%`, `<div class="bara-prog"><i style="width:${Math.min(100, v.dominanta)}%"></i></div><div class="sub-bara"><span>BTC</span><span>restul pieței crypto</span></div>`) : '';
    return sectiune(`${antet('15', 'Capitalizarea de piață', m)}${mare32(mld(v.cap))}
${chipuri([chip(`${pct(v.schimbare24h, 1)} azi`, v.schimbare24h < 0 ? 'unfav' : 'fav'), chip(`${pct(v.schimbare30z)} în 30 de zile`, v.schimbare30z < 0 ? 'unfav' : 'fav'), chip(`${pct(v.fataVarf)} față de vârf`)])}
${cutie('12 luni · mld $', '', svg1 + legenda([['linie', C.alb, 'capitalizare'], ['punctat', C.albDeschis, 'media 50 z'], ['punctat', C.gri, 'media 200 z']]))}
${cutie('Față de media de 200 de zile, pe săptămâni', '', svg2)}
${grila([
      stat('față de media 50 z', pct(v.fata50), `media ${mld(v.ma50)}`, v.fata50 < 0 ? 'fav' : 'unfav'),
      stat('față de media 200 z', pct(v.fata200), `media ${mld(v.ma200)}`, v.fata200 < 0 ? 'fav' : 'unfav'),
      stat('față de vârf', pct(v.fataVarf), `${mld(v.varf)} · ${lunaAn(v.dataVarf)}`),
      stat('cap. realizată', mld(v.realizata), v.mvrv ? `raport MVRV ${nf(v.mvrv, 2)}` : 'Coin Metrics'),
    ])}
${dom}${regula(m)}`);
  };

  RAND['3'] = m => {
    const v = m.valori, g = m.grafic;
    let svg = '';
    const serie = g.mvrv || null;
    if (serie?.length) {
      const x0 = serie[0][0], x1 = serie.at(-1)[0];
      const ymax = Math.min(6, Math.max(4, ...serie.map(x => x[1]))) * 1.05;
      svg = cutie('MVRV din 2017', 'preț / preț realizat', grafic({
        h: 140, x: { min: x0, max: x1 }, y: { min: 0, max: ymax },
        fundal: (sx, sy, b) => `<rect x="${b.st}" y="${r1(sy(1))}" width="${b.dr - b.st}" height="${r1(b.jos - sy(1))}" fill="#408CFF" fill-opacity=".14"/><rect x="${b.st}" y="${r1(sy(ymax))}" width="${b.dr - b.st}" height="${r1(sy(3.5) - sy(ymax))}" fill="#F09A3A" fill-opacity=".14"/>`,
        oriz: [{ y: 1, cul: C.albDeschis, dash: '3 3' }, { y: 2.5, cul: C.galben, dash: '3 3', op: 0.4 }, { y: 3.5, cul: C.portocaliu, dash: '3 3' }],
        gridY: [[1, '1'], [2, '2'], [3, '3'], [4, '4']], serii: [{ pts: serie, cul: C.alb, gros: 1.5 }], puncte: [{ x: x1, y: serie.at(-1)[1], cul: C.accent }],
        etX: etAni(x0, x1, 2), label: 'MVRV din 2017, cu pragurile 1 și 3,5',
      }) + legenda([['patrat', 'rgba(64,140,255,.3)', 'sub 1: ieftin (+2)'], ['patrat', 'rgba(240,154,58,.3)', 'peste 3,5: scump (−2)']]));
    }
    const s = v.semnale || {};
    return sectiune(`${antet('3', 'On-chain: MVRV și Mayer', m)}${mare32(fin(v.mvrv) ? `MVRV ${nf(v.mvrv, 2)}` : `Mayer ${nf(v.mayer, 2)}`)}
${chipuri([chip(`Mayer ${nf(v.mayer, 2)}`, tipScor(s.mayer)), fin(v.ma200s) ? chip(`${v.sub200s ? 'sub' : 'peste'} media 200 săpt.`, v.sub200s ? 'fav' : 'gri') : '', chip(v.piCycle ? 'Pi Cycle: vârf' : 'Pi Cycle: fără vârf', v.piCycle ? 'unfav' : 'gri')])}
${svg}
${grila([
      stat('MVRV', fin(v.mvrv) ? nf(v.mvrv, 2) : '—', `scor ${scorTxt(s.mvrv)}`, tipScor(s.mvrv)),
      stat('Mayer (preț / media 200 z)', nf(v.mayer, 2), `scor ${scorTxt(s.mayer)}`, tipScor(s.mayer)),
      stat('media 200 de zile', usd(v.ma200z), 'prețul mediu pe 200 z'),
      stat('media 200 de săptămâni', usd(v.ma200s), `scor ${scorTxt(s.ma200s)}`, tipScor(s.ma200s)),
    ])}
${regula(m)}`);
  };

  RAND['17'] = m => {
    const v = m.valori, cic = m.grafic.cicluri;
    const TX = d => 44 + (Math.min(d, 1460) * 252) / 1460;
    const randY = [30, 56, 82, 108];
    let tl = `<rect x="${r1(TX(371))}" y="14" width="${r1(TX(548) - TX(371))}" height="102" fill="#F09A3A" fill-opacity=".12"/><rect x="${r1(TX(777))}" y="14" width="${r1(TX(924) - TX(777))}" height="102" fill="#408CFF" fill-opacity=".14"/>`;
    tl += `<g font-size="9.5" text-anchor="middle"><text x="${r1((TX(371) + TX(548)) / 2)}" y="10" fill="#FFB27A">vârfuri</text><text x="${r1((TX(777) + TX(924)) / 2)}" y="10" fill="#9CC8FF">funduri</text></g>`;
    cic.slice(-4).forEach((c, i) => {
      const y = randY[i], acum = !c.complet;
      const sf = acum ? TX(v.zi) : TX(c.lungime);
      tl += `<path d="M44,${y}H${r1(sf)}" stroke="#3A424D" stroke-width="2"/>`;
      if (acum) tl += `<path d="M${r1(sf)},${y}H${r1(TX(1450))}" stroke="#3A424D" stroke-width="2" stroke-dasharray="2 3"/>`;
      tl += `<text x="0" y="${y + 3.5}" font-size="10" fill="${acum ? '#E6EDF3' : '#9AA4AF'}">${c.an}</text>`;
      const xv = TX(c.ziVarf);
      tl += `<path d="M${r1(xv - 4.5)},${y + 4} L${r1(xv + 4.5)},${y + 4} L${r1(xv)},${y - 5}Z" fill="#F09A3A"/><text x="${r1(xv)}" y="${y - 8}" font-size="9" fill="#9AA4AF" text-anchor="middle">${c.ziVarf}</text>`;
      const xf = TX(c.ziFund);
      tl += acum
        ? `<path d="M${r1(xf - 4.5)},${y - 4} L${r1(xf + 4.5)},${y - 4} L${r1(xf)},${y + 5}Z" fill="none" stroke="#9CC8FF" stroke-width="1.5"/>`
        : `<path d="M${r1(xf - 4.5)},${y - 4} L${r1(xf + 4.5)},${y - 4} L${r1(xf)},${y + 5}Z" fill="#3F7FD0"/>`;
      tl += `<text x="${r1(xf)}" y="${y - 8}" font-size="9" fill="#9AA4AF" text-anchor="middle">${c.ziFund}</text>`;
    });
    const xa = TX(v.zi);
    tl += `<path d="M${r1(xa)},14V118" stroke="#F7931A" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="${r1(xa)}" cy="108" r="4" fill="#F7931A" stroke="#0E1116" stroke-width="2"/><text x="${r1(Math.min(250, Math.max(50, xa)))}" y="129" font-size="10" fill="#F7931A" text-anchor="middle">azi · ziua ${nf(v.zi)}</text>`;
    const svgTl = `<svg viewBox="0 0 300 132" class="grafic" role="img" aria-label="Vârfurile și fundurile ciclurilor trecute, aliniate la halving; azi e ziua ${v.zi}">${tl}</svg>`;
    const cul = { 2016: C.griInchis, 2020: C.albDeschis, 2024: C.alb };
    const serii = cic.filter(c => c.multipli).map(c => ({ pts: c.multipli, cul: cul[c.an] || C.gri, gros: c.complet ? 1.4 : 2 }));
    const toate = serii.flatMap(s => s.pts.map(x => x[1]));
    const ymin = Math.min(0.6, Math.min(...toate) * 0.9), ymax = Math.max(...toate) * 1.15;
    const svgM = grafic({
      h: 140, st: 34, x: { min: 0, max: 1460 }, y: { min: ymin, max: ymax, log: true },
      zone: [{ x0: 371, x1: 548, cul: '#F09A3A', op: 0.1 }, { x0: 777, x1: 924, cul: '#408CFF', op: 0.12 }],
      oriz: [{ y: 1, cul: '#FFFFFF', op: 0.25 }],
      gridY: [[1, '1×'], [3, '3×'], [10, '10×'], [30, '30×']].filter(t => t[0] > ymin && t[0] < ymax),
      serii, puncte: [{ x: v.zi, y: v.multipluAcum, cul: C.accent }],
      etX: [[0, 'ziua 0', 'start'], [365, '1 an'], [730, '2 ani'], [1095, '3 ani'], [1460, '4 ani', 'end']], label: 'Prețul ca multiplu al prețului din ziua halvingului, pe cicluri',
    });
    const laZi = v.laAceeasiZi.filter(x => x.an >= 2016);
    return sectiune(`${antet('17', 'Ceasul ciclului (halving)', m)}${mare32(`Ziua ${nf(v.zi)}`)}
${chipuri([chip(m.eticheta, tipScor(m.scor)), chip(`halving: ${dataScurta(v.halving)}`), DATE.halving ? chip(`următorul ≈ ${lunaAn(DATE.halving.data)}`) : ''])}
${cutie('Ciclurile, aliniate la halving', 'zile', svgTl + legenda([['triunghi', '#F09A3A', 'vârf'], ['triunghi-jos', '#3F7FD0', 'fund'], ['triunghi-gol', '#9CC8FF', 'minimul de până acum']]))}
${cutie('Prețul față de ziua halvingului', 'ori prețul de atunci', svgM + legenda([['linie', C.griInchis, '2016–20'], ['linie', C.albDeschis, '2020–24'], ['linie', C.alb, '2024–28 (acum)']]) + `<p class="nota">Azi prețul e la ${nf(v.multipluAcum, 2)}× față de ziua halvingului (${usd(v.pretHalving)}).${laZi.length ? ` În ziua ${nf(v.zi)}, ciclurile trecute erau la ${laZi.map(x => `${nf(x.multiplu, 1)}× (${x.an})`).join(' și ')}.` : ''}</p>`)}
${grila([
      stat('vârful ciclului', usd(v.varf.pret), `${dataScurta(v.varf.t)} · ziua ${v.varf.zi}`),
      stat('minimul de după vârf', usd(v.minim.pret), `${dataScurta(v.minim.t)} · ziua ${v.minim.zi}`),
      stat('zile de la vârf', nf(v.zileDeLaVarf), `trecut: ${Math.min(...v.durateVarfFund)}–${Math.max(...v.durateVarfFund)} până la fund`),
      stat('scădere de la vârf', pct(v.scadere), `trecut: ${pct(Math.max(...v.scaderiTrecute))} … ${pct(Math.min(...v.scaderiTrecute))}`),
    ])}
${regula(m)}`);
  };

  RAND['18'] = m => {
    const v = m.valori, cls = x => (!fin(x) ? '' : x >= 0 ? 'fav' : 'unfav');
    const rows = v.randamente.map(r => `<tr><th scope="row">${esc(r.nume)}</th><td class="num dr ${cls(r.usd)}">${pct(r.usd)}</td><td class="num dr ${cls(r.eur)}">${pct(r.eur)}</td><td class="num dr ${cls(r.lei)}">${pct(r.lei)}</td></tr>`).join('');
    const lei = v.lei;
    const notaLei = lei ? `<div class="nota-insigna">${insigna('27', 'mica')}<span>La cursul ${esc(lei.sursa)} din ${esc(dataScurta(Date.parse(lei.data)))}, 1 BTC ≈ ${nf(lei.pretLei)} lei ≈ ${nf(lei.pretEur)} €.${fin(lei.dolarInLei1An) ? ` Într-un an, dolarul s-a ${lei.dolarInLei1An >= 0 ? 'scumpit' : 'ieftinit'} cu ${nf(Math.abs(lei.dolarInLei1An), 1)}% în lei (${nf(lei.usdRon1An, 2)} → ${nf(lei.usdRon, 2)}).` : ''}</span></div>` : '';
    const tabel = `<table class="tabel randamente"><thead><tr><th scope="col">Perioadă</th><th scope="col" class="dr">în $</th><th scope="col" class="dr">în €</th><th scope="col" class="dr">în lei</th></tr></thead><tbody>${rows}</tbody></table>${notaLei}`;
    const med = v.mediane, mx = Math.max(10, ...med.map(Math.abs));
    let s = `<rect x="${8 + v.luna * 24 - 4}" y="14" width="24" height="88" rx="4" fill="#F7931A" fill-opacity=".08"/><rect x="${8 + v.lunaUrm * 24 - 4}" y="14" width="24" height="88" rx="4" fill="#F7931A" fill-opacity=".16"/>`;
    s += `<g font-size="9" fill="#FFD3A1" text-anchor="middle"><text x="${16 + v.luna * 24}" y="10">acum</text><text x="${16 + v.lunaUrm * 24}" y="10">urm.</text></g><path d="M0,64H300" stroke="#fff" stroke-opacity=".3"/>`;
    med.forEach((x, i) => {
      const hgt = (Math.abs(x) / mx) * 44, X = 8 + i * 24;
      s += `<rect x="${X}" y="${r1(x >= 0 ? 64 - hgt : 64)}" width="16" height="${r1(Math.max(1, hgt))}" rx="2" fill="${x >= 0 ? '#3F7FD0' : '#F09A3A'}"/>`;
      s += `<text x="${X + 8}" y="${r1(x >= 0 ? 64 - hgt - 3 : 64 + hgt + 10)}" font-size="9" fill="#C9D1D9" text-anchor="middle">${semn(x, Math.abs(x) < 10 && Math.abs(Math.round(x) - x) >= 0.25 ? 1 : 0)}</text>`;
      s += `<text x="${X + 8}" y="114" font-size="9" fill="#9AA4AF" text-anchor="middle">${LS[i]}</text>`;
    });
    const svg = `<svg viewBox="0 0 300 118" class="grafic" role="img" aria-label="Randamentul median pe luni, ${esc(v.perioadaAni)}">${s}</svg>`;
    const c = v.conditionat;
    return sectiune(`${antet('18', 'Randamente și sezonalitate', m)}
${cutie('', '', tabel)}
${cutie(`Mediana pe luni, ${esc(v.perioadaAni)}`, `<span class="${cls(v.mtd)}">${LS[v.luna]} ${new Date().getFullYear()}: ${pct(v.mtd)}</span>`, svg + legenda([['patrat', '#3F7FD0', 'de obicei pe plus'], ['patrat', '#F09A3A', 'pe minus']]))}
${grila([
      stat(`${LUNI[v.lunaUrm]}, mediana`, pct(v.urm.mediana, 1), `pe plus în ${v.urm.pozitive} din ${v.urm.total} ani`, cls(v.urm.mediana)),
      c.total ? stat(`după ${LUNI[v.luna]} ${c.rosu ? 'pe minus' : 'pe plus'}`, `${c.laFel} din ${c.total}`, `${LUNI[v.lunaUrm]} tot ${c.rosu ? 'pe minus' : 'pe plus'}`, c.rosu ? 'unfav' : 'fav') : stat('istoric', '—', 'prea puține date'),
      stat('cea mai bună lună', LUNI[v.best.luna], `mediana ${pct(v.best.mediana, 1)}`),
      stat('cea mai slabă lună', LUNI[v.worst.luna], `mediana ${pct(v.worst.mediana, 1)}`),
    ])}
${regula(m)}`);
  };

  RAND['4'] = m => {
    const v = m.valori, g = m.grafic, s = v.semnale || {};
    let svgH = '';
    if (g.s30?.length) {
      const x0 = g.s60[0][0], x1 = g.s60.at(-1)[0];
      const [ymin, ymax] = minMax([...g.s30, ...g.s60], 0.1);
      const pas = ymax - ymin > 400 ? 200 : 100;
      const grid = [];
      for (let t = Math.ceil(ymin / pas) * pas; t < ymax; t += pas) grid.push([t, nf(t)]);
      svgH = cutie('Hash Ribbons · EH/s', v.capitulare ? `<span class="fav">capitulare, ziua ${v.zileCap}</span>` : 'fără capitulare', grafic({
        h: 130, x: { min: x0, max: x1 }, y: { min: ymin, max: ymax }, gridY: grid,
        zone: v.capitulare ? [{ x0: x1 - v.zileCap, x1, cul: '#408CFF', op: 0.14 }] : [],
        serii: [{ pts: g.s60, cul: C.albDeschis, dash: '5 3', gros: 1.5 }, { pts: g.s30, cul: C.alb, gros: 1.8 }],
        etX: etLuni(x0, x1, 3), label: 'Media pe 30 de zile a hashrate-ului față de media pe 60 de zile',
      }) + legenda([['linie', C.alb, 'media 30 z'], ['punctat', C.albDeschis, 'media 60 z'], ['patrat', 'rgba(64,140,255,.3)', 'capitulare']]));
    }
    let svgD = '';
    const sch = g.schimbari || [];
    if (sch.length) {
      const toate = [...sch.map(x => x[1]), v.urmatoare?.schimbare ?? 0];
      const mx = Math.max(5, ...toate.map(Math.abs));
      const n = sch.length + (v.urmatoare ? 1 : 0), bw = 266 / n;
      let b = '<path d="M30,46H300" stroke="#fff" stroke-opacity=".3"/>';
      sch.forEach(([, x], i) => {
        const hgt = (Math.abs(x) / mx) * 34, X = 30 + i * bw;
        b += `<rect x="${r1(X + 3)}" y="${r1(x >= 0 ? 46 - hgt : 46)}" width="${r1(bw - 6)}" height="${r1(Math.max(1, hgt))}" rx="2" fill="${x >= 0 ? '#F09A3A' : '#3F7FD0'}"/><text x="${r1(X + bw / 2)}" y="${r1(x >= 0 ? 46 - hgt - 3 : 46 + hgt + 10)}" font-size="9" fill="#C9D1D9" text-anchor="middle">${semn(x, 1)}</text>`;
      });
      if (v.urmatoare) {
        const x = v.urmatoare.schimbare, hgt = (Math.abs(x) / mx) * 34, X = 30 + sch.length * bw;
        b += `<rect x="${r1(X + 3)}" y="${r1(x >= 0 ? 46 - hgt : 46)}" width="${r1(bw - 6)}" height="${r1(Math.max(1, hgt))}" rx="2" fill="none" stroke="#C9D1D9" stroke-dasharray="3 2"/><text x="${r1(X + bw / 2)}" y="${r1(x >= 0 ? 46 - hgt - 3 : 46 + hgt + 10)}" font-size="9" fill="#C9D1D9" text-anchor="middle">≈${semn(x, 1)}</text>`;
      }
      b += '<g class="et-y"><text x="2" y="16">+</text><text x="2" y="84">−</text></g>';
      svgD = cutie('Ajustările de dificultate', v.urmatoare ? `următoarea: ${esc(ziRelativa(v.urmatoare.data))}` : '', `<svg viewBox="0 0 300 92" class="grafic" role="img" aria-label="Ultimele ajustări de dificultate și estimarea pentru următoarea">${b}</svg>${legenda([['patrat', '#F09A3A', 'crește'], ['patrat', '#3F7FD0', 'scade'], ['contur', '#C9D1D9', 'estimare']])}`);
    }
    return sectiune(`${antet('4', 'Minerii', m)}${mare32(m.eticheta)}
${chipuri([fin(v.hashrateEH) ? chip(`hashrate ${nf(v.hashrateEH)} EH/s`) : '', v.capitulare ? chip(`capitulare de ${v.zileCap} zile`, 'fav') : chip('fără capitulare')])}
${svgH}${svgD}
${grila([
      stat('hashprice', fin(v.hashprice) ? `${nf(v.hashprice)} $/PH/zi` : '—', `sub 35 $ = stres · scor ${scorTxt(s.hashprice)}`, tipScor(s.hashprice)),
      stat('Puell', fin(v.puell) ? nf(v.puell, 2) : '—', `sub 0,8 = minerii câștigă puțin · scor ${scorTxt(s.puell)}`, tipScor(s.puell)),
      stat('Hash Ribbons', v.capitulare ? 'capitulare' : 'normal', `media 30 z ${v.capitulare ? '<' : '≥'} media 60 z · scor ${scorTxt(s.ribbons)}`, tipScor(s.ribbons)),
      v.urmatoare ? stat('următoarea ajustare', pct(v.urmatoare.schimbare, 1), `${ziRelativa(v.urmatoare.data, true)} · ${nf(v.urmatoare.blocuriRamase)} blocuri`) : stat('următoarea ajustare', '—', ''),
    ])}
${regula(m)}`);
  };

  RAND['25'] = m => {
    const v = m.valori, g = m.grafic;
    const ver = v.verificari.map(x => `<div class="verif">${x.ok ? ICON.ok : ICON.atentie}<span>${esc(x.text)}</span><strong class="num">${esc(x.valoare)}</strong></div>`).join('');
    let svg = '';
    if (g.lightning?.length) {
      const pts = g.lightning, x0 = pts[0][0], x1 = pts.at(-1)[0];
      const [ymin, ymax] = minMax(pts, 0.12);
      const pas = ymax - ymin > 2500 ? 1000 : 500;
      const grid = [];
      for (let t = Math.ceil(ymin / pas) * pas; t < ymax; t += pas) grid.push([t, nf(t)]);
      svg = cutie('Capacitatea Lightning publică · 12 luni', 'BTC', grafic({
        h: 100, st: 34, x: { min: x0, max: x1 }, y: { min: ymin, max: ymax }, gridY: grid,
        serii: [{ pts, cul: C.alb, gros: 1.8 }],
        puncte: [...(v.ln?.dataVarf ? [{ x: zg(v.ln.dataVarf), y: v.ln.varf, cul: C.albDeschis, gol: true }] : []), { x: x1, y: pts.at(-1)[1], cul: C.accent }],
        etX: etLuni(x0, x1, 3), label: 'Capacitatea publică a rețelei Lightning pe 12 luni',
      }) + '<p class="nota">Canalele private (portofele mobile) nu apar aici, deci cifra e o limită de jos.</p>');
    }
    return sectiune(`${antet('25', 'Sănătatea rețelei', m)}
${cutie('', '', ver)}
${grila([
      v.noduri ? stat('noduri accesibile', nf(v.noduri.total), `${nf(v.noduri.raport)}% din media recentă`) : stat('noduri accesibile', '—', 'btcnodes.io nu a răspuns'),
      v.ln ? stat('Lightning publică', `${nf(v.ln.capacitate)} BTC`, fin(v.ln.fataVarf) ? `${pct(v.ln.fataVarf)} față de vârf` : `${nf(v.ln.canale)} canale`) : stat('Lightning', '—', ''),
      stat('mempool', fin(v.mempoolMB) ? `${nf(v.mempoolMB, 1)} MB` : '—', fin(v.comision) ? `comision rapid ${nf(v.comision)} sat/vB` : ''),
      stat('înălțimea blocului', nf(v.inaltime), DATE.halving ? `halving la ${nf(DATE.halving.tinta)}` : ''),
    ])}
${svg}
${regula(m)}`);
  };

  RAND['28'] = m => {
    const v = m.valori, g = m.grafic;
    const pts = g.total, x0 = pts[0][0], x1 = pts.at(-1)[0];
    const [ymin, ymax] = minMax(pts, 0.15);
    const pas = ymax - ymin > 60 ? 20 : 10;
    const grid = [];
    for (let t = Math.ceil(ymin / pas) * pas; t < ymax; t += pas) grid.push([t, nf(t)]);
    const svg1 = grafic({
      h: 100, st: 34, x: { min: x0, max: x1 }, y: { min: ymin, max: ymax }, gridY: grid,
      serii: [{ pts, cul: C.alb, gros: 1.8, arie: 0.08 }],
      puncte: [...(v.dataVarf >= dinZi(x0) ? [{ x: zg(v.dataVarf), y: v.varf / 1e9, cul: C.albDeschis, gol: true }] : []), { x: x1, y: pts.at(-1)[1], cul: C.accent }],
      etX: etLuni(x0, x1, 3), label: 'Oferta totală de stablecoins pe 12 luni',
    });
    const sp = g.saptamani, mx = Math.max(2, ...sp.map(x => Math.abs(x[1]))), bw = 266 / sp.length;
    let b = '<path d="M24,36H300" stroke="#fff" stroke-opacity=".3"/>';
    let iMin = 0;
    sp.forEach((x, i) => { if (x[1] < sp[iMin][1]) iMin = i; });
    sp.forEach(([, x], i) => {
      const hgt = (Math.abs(x) / mx) * 30, X = 30 + i * bw;
      b += `<rect x="${r1(X + 2)}" y="${r1(x >= 0 ? 36 - hgt : 36)}" width="${r1(bw - 4)}" height="${r1(Math.max(1, hgt))}" rx="1" fill="${x >= 0 ? '#3F7FD0' : '#F09A3A'}"/>`;
      if (i === iMin && x < 0) b += `<text x="${r1(X + bw / 2)}" y="${r1(36 + hgt + 10)}" font-size="9" fill="#FFB27A" text-anchor="middle">${semn(x, 1)}</text>`;
    });
    const svg2 = `<svg viewBox="0 0 300 80" class="grafic" role="img" aria-label="Emisiunea netă de stablecoins pe ultimele 12 săptămâni">${b}</svg>`;
    return sectiune(`${antet('28', 'Stablecoins (dolarii din crypto)', m)}${mare32(mld(v.total))}
${chipuri([chip(`${pct(v.schimbare30z, 1)} în 30 de zile`, v.schimbare30z < 0 ? 'unfav' : 'fav'), chip(`${pct(v.fataVarf)} față de vârf (${lunaAn(v.dataVarf)})`), fin(v.usdt) && fin(v.usdc) ? chip(`USDT + USDC = ${nf(((v.usdt + v.usdc) / v.total) * 100)}%`) : ''])}
${cutie('Oferta totală · 12 luni', 'mld $', svg1)}
${cutie('Emisiune netă pe săptămână · mld $', `<span class="${v.emisiune4sapt < 0 ? 'unfav' : 'fav'}">4 săpt.: ${semn(v.emisiune4sapt, 1)}</span>`, svg2 + legenda([['patrat', '#3F7FD0', 'bani noi (emitere)'], ['patrat', '#F09A3A', 'bani ieșiți (răscumpărare)']]))}
${grila([
      stat('USDT', mld(v.usdt, 1), fin(v.usdt) ? `${nf((v.usdt / v.total) * 100, 1)}% din total` : ''),
      stat('USDC', mld(v.usdc, 1), fin(v.usdc) ? `${nf((v.usdc / v.total) * 100, 1)}% din total` : ''),
      stat('raport SSR', nf(v.ssr, 1), v.ssrText || '', fin(v.percSsr) && v.percSsr <= 20 ? 'fav' : fin(v.percSsr) && v.percSsr >= 80 ? 'unfav' : ''),
      stat('emisiune netă 30 z', `${semn(v.emisiune30z, 1)} mld $`, v.emisiune30z < 0 ? 'ies dolari din piață' : 'intră dolari în piață', v.emisiune30z < 0 ? 'unfav' : 'fav'),
    ])}
${regula(m)}`);
  };

  RAND['19'] = m => {
    const v = m.valori, g = m.grafic;
    const toate = [...g.dvol, ...g.realizata];
    const [ymin0, ymax0] = minMax(toate, 0.1);
    const ymin = Math.max(0, Math.floor(ymin0 / 10) * 10), ymax = Math.ceil(ymax0 / 10) * 10;
    const grid = [];
    for (let t = ymin + 10; t < ymax; t += 10) grid.push([t, nf(t)]);
    const x0 = g.dvol[0][0], x1 = g.dvol.at(-1)[0];
    const svg = grafic({
      h: 120, x: { min: x0, max: x1 }, y: { min: ymin, max: ymax }, gridY: grid,
      oriz: [{ y: v.medieAn, cul: C.galben, dash: '2 3', op: 0.6 }],
      serii: [{ pts: g.realizata, cul: C.albDeschis, dash: '4 3', gros: 1.4 }, { pts: g.dvol, cul: C.alb, gros: 1.8 }],
      puncte: [{ x: g.realizata.at(-1)[0], y: g.realizata.at(-1)[1], cul: C.albDeschis, r: 3.5 }, { x: x1, y: g.dvol.at(-1)[1], cul: C.accent }],
      etX: etLuni(x0, x1, 2), label: 'DVOL și volatilitatea realizată pe 12 luni',
    });
    const sec19 = sectiune(`${antet('19', 'Volatilitatea din opțiuni', m)}${mare32(`DVOL ${nf(v.dvol)}`)}
${chipuri([chip(`realizată 30 z: ${nf(v.realizata30)}%`), chip(`percentila pe 1 an: ${nf(v.percentila)}`, v.percentila >= 90 ? 'fav' : v.percentila <= 10 ? 'unfav' : 'gri')])}
${cutie('Volatilitate anualizată · 12 luni · %', `<span class="neu">media anului: ${nf(v.medieAn)}</span>`, svg + legenda([['linie', C.alb, 'DVOL (așteptată, Deribit)'], ['punctat', C.albDeschis, 'realizată 30 z'], ['punctat', C.galben, 'media anului']]))}
${regula(m)}`);
    const sec20 = `<section class="card card-gol"><div class="antet">${insigna('20')}<h2>Derivate pe toate bursele</h2>${chip('etapa 3')}</div><p class="nota">Pozițiile deschise (OI), lichidările și funding-ul agregat de pe toate bursele vin de la Coinalyze, care cere o cheie gratuită. Le adaug în etapa 3.</p></section>`;
    return sec19 + sec20;
  };

  RAND['8'] = m => {
    const v = m.valori, g = m.grafic, s = v.semnale || {};
    let svg = '';
    if (g.fng?.length) {
      const pts = g.fng, bw = 266 / pts.length;
      let b = '<path d="M30,25H296M30,95H296" stroke="#fff" stroke-opacity=".08"/>';
      pts.forEach(([, x], i) => {
        const hgt = (x / 100) * 88, X = 30 + i * bw;
        const cul = x < 25 ? '#3F7FD0' : x < 45 ? '#34A6B5' : x <= 55 ? '#E3C443' : x <= 75 ? '#F09A3A' : '#C9343F';
        b += `<rect x="${r1(X + 1)}" y="${r1(100 - hgt)}" width="${r1(bw - 2)}" height="${r1(hgt)}" rx="1" fill="${cul}"/>`;
      });
      b += '<g class="et-y"><text x="2" y="28">75</text><text x="2" y="98">25</text></g>';
      svg = cutie('Fear & Greed · 30 de zile', '0 = frică, 100 = lăcomie', `<svg viewBox="0 0 300 104" class="grafic" role="img" aria-label="Indicele Fear and Greed pe ultimele 30 de zile">${b}</svg>`);
    }
    return sectiune(`${antet('8', 'Sentiment', m)}${mare32(fin(v.fng) ? `Fear & Greed ${v.fng}` : m.eticheta)}
${chipuri([v.fngClasa ? chip(v.fngClasa, tipScor(s.fng)) : '', fin(v.funding) ? chip(`funding ${semn(v.funding, 3)}% pe 8 h`, tipScor(s.funding)) : ''])}
${svg}
${grila([
      stat('Fear & Greed', fin(v.fng) ? String(v.fng) : '—', `scor ${scorTxt(s.fng)} (contrarian)`, tipScor(s.fng)),
      stat('funding', fin(v.funding) ? `${semn(v.funding, 3)}%` : '—', `${v.sursaFunding ? `${v.sursaFunding} · ` : ''}scor ${scorTxt(s.funding)}`, tipScor(s.funding)),
    ])}
${regula(m)}`);
  };

  function ecranGrafice(nr) {
    if (!CIPURI.some(c => c[0] === nr)) nr = '2';
    const m = modul(nr);
    const cip = CIPURI.map(([n, t]) => `<a class="cip${n === nr ? ' activ' : ''}" href="#grafice/${n}"${n === nr ? ' aria-current="page"' : ''}>${n === nr ? ICON.bifa : ''}${esc(t)}</a>`).join('');
    let corp;
    if (!m || m.stare === 'lipsa') corp = `<section class="card card-gol"><div class="antet">${insigna(nr)}<h2>${esc(CIPURI.find(c => c[0] === nr)[1])}</h2></div><p class="nota">Datele nu sunt disponibile acum${m?.motiv ? ` (${esc(m.motiv)})` : ''}. Sarcina programată reîncearcă la fiecare 30 de minute.</p></section>`;
    else {
      try { corp = RAND[nr](m); } catch (e) { console.error(e); corp = `<section class="card card-gol"><p class="nota">Nu am putut desena modulul ${esc(nr)}: ${esc(e.message)}</p></section>`; }
    }
    return `${bara('Grafice')}<nav class="cipuri-bara" aria-label="Module">${cip}</nav><main class="continut">${corp}</main>`;
  }

  // ------------------------------------------------------------ Știri, Calendar
  function ecranStiri() {
    return `${bara('Știri')}<main class="continut"><section class="card"><div class="antet">${insigna('9')}<h2>Știri importante</h2>${chip('etapa 2')}</div>
<p class="nota">În etapa 2, sarcina programată citește titlurile din CoinDesk, Cointelegraph, The Block, Decrypt și Bitcoin Magazine și le clasifică cu reguli fixe de cuvinte-cheie: categoria (ETF, Fed, mineri, bănci, reglementare, securitate), sensul (pozitiv sau negativ) și impactul.</p>
<p class="nota">Scorul știrilor din ultimele 48 de ore va intra în verdictul pe termen scurt. Tot aici vor apărea și influențatorii (Saylor, Warsh, Fink și ceilalți), din titlurile de presă.</p></section>
<section class="card card-gol"><div class="antet">${insigna('10')}<h2>Influențatori · din presă</h2>${chip('etapa 2')}</div><p class="nota">Citirea de pe X costă, așa că îi urmăresc prin titlurile care îi pomenesc.</p></section></main>`;
  }
  function ecranCalendar() {
    const H = DATE.halving;
    const hv = H ? `<section class="card"><div class="antet">${insigna('11')}<h2>Următorul halving</h2>${chip(`≈ ${lunaAn(H.data)}`)}</div>
<div class="mare">≈ ${nf(H.zile)} de zile</div>
<div class="bara-prog"><i style="width:${Math.min(100, H.progres)}%"></i></div>
<div class="sub-bara"><span>${nf(H.anterior)}</span><span class="num">bloc ${nf(H.inaltime)} · ${nf(H.progres, 0)}%</span><span>${nf(H.tinta)}</span></div>
<p class="nota">Recompensa scade de la ${nf(H.recompensa, 3)} la ${nf(H.recompensa / 2, 4)} BTC pe bloc. Mai sunt ${nf(H.ramase)} de blocuri, la ritmul actual.</p></section>` : '';
    const ev = (DATE.calendar || []).map(e => {
      const imp = e.impact === 'mare' ? 'unfav' : e.impact === 'mediu' ? 'neu' : 'gri';
      return `<li class="ev"><div class="ev-cand"><span class="ev-zi">${esc(ziRelativa(e.t))}</span><span class="ev-ora num">${e.estimat ? '≈ ' : ''}${esc(oraRo(e.t))}</span></div>
<div class="ev-corp"><div class="ev-titlu">${esc(e.titlu)}</div>${e.nota ? `<div class="ev-nota">${esc(e.nota)}</div>` : ''}${e.regula ? `<div class="ev-regula">Regulă: ${esc(e.regula)}</div>` : ''}<div>${chip(`impact ${e.impact}`, imp)}</div></div></li>`;
    }).join('');
    return `${bara('Calendar')}<main class="continut">${hv}
<section class="card"><div class="antet">${insigna('11')}<h2>Evenimente care mișcă prețul</h2></div><p class="nota mic">Ora României. Impactul vine dintr-o listă fixă: Fed, inflație și locuri de muncă = mare; expirarea trimestrială = mare, cea lunară = mediu; ajustarea dificultății = mic.</p>
<ul class="evenimente">${ev || '<li class="nota">Niciun eveniment în următoarele zile.</li>'}</ul></section></main>`;
  }

  // ------------------------------------------------------------ dialoguri
  function arataCalcul() {
    const v = DATE.verdict;
    const rand = nr => {
      const m = modul(nr);
      const ok = m && fin(m.scor);
      return `<tr><td>${insigna(nr, 'mica')} ${esc(NUME_PLACI[nr] || m?.nume || nr)}</td><td class="dr">${ok ? chipScor(m.scor) : chip(ETAPA[nr] || 'lipsă')}</td></tr>`;
    };
    const html = `<h2>Cum se calculează verdictul</h2>
<p>Fiecare modul dă un scor de la −2 la +2 după praguri fixe (le vezi în cardul lui). Scorul unui modul e media semnalelor lui.</p>
<h3>Termen lung · termometru 0–100</h3>
<table class="tabel">${['2', '3', '4', '15', '16', '17'].map(rand).join('')}</table>
<p class="formula">media = ${semn(v.lung.medie, 2)} → termometru = 50 − 25 × media = <strong>${v.lung.termometru}</strong> (${esc(v.lung.zona)})</p>
<p class="nota mic">0–20 foarte ieftin · 20–40 zonă de acumulare · 40–60 neutru · 60–80 scump · 80–100 foarte scump</p>
<h3>Termen scurt</h3>
<table class="tabel">${['6', '7', '8', '9', '19', '20', '28'].map(rand).join('')}</table>
<p class="formula">media = ${semn(v.scurt.medie, 2)} → <strong>${esc(v.scurt.eticheta || '—')}</strong> (≤ −0,5 negativ, ≥ +0,5 pozitiv, altfel neutru)</p>
<p class="nota mic">Modulele care vin în etapele 2 și 3 nu intră încă în medie.</p>`;
    deschideDialog(html);
  }
  function arataDespre() {
    const html = `<h2>Despre Tablou BTC</h2>
<p>Aplicația adună date despre Bitcoin din surse gratuite și dă pentru fiecare modul o concluzie după reguli fixe, fără AI. Regula care a dat concluzia apare în fiecare card.</p>
<p>Datele se actualizează automat la 30 de minute, pe GitHub. Prețul din antet vine direct de la Binance, la fiecare minut cât aplicația e deschisă.</p>
<h3>Surse</h3><p class="nota">Coin Metrics Community · mempool.space · Deribit · DefiLlama · alternative.me · CoinPaprika · btcnodes.io · BNR (prin cursbnr.ro) · Coinbase · OKX · Binance</p>
<p class="nota mic">Ultima actualizare: ${esc(cand(Date.parse(DATE.generat)))}${DATE.erori?.length ? ` · ${DATE.erori.length} surse nu au răspuns` : ''}.</p>
<p class="disclaimer">Informații, nu sfaturi financiare.</p>`;
    deschideDialog(html);
  }
  function deschideDialog(html) {
    const d = $('#dialog');
    $('#dialog-corp').innerHTML = html;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }

  // ------------------------------------------------------------ navigare
  function ruta() {
    const h = location.hash.replace(/^#/, '') || 'acasa';
    const [fila, nr] = h.split('/');
    return { fila: ['acasa', 'grafice', 'stiri', 'calendar'].includes(fila) ? fila : 'acasa', nr };
  }
  function deseneaza(pastreazaScroll) {
    const r = ruta(), e = $('#ecran');
    const y = window.scrollY;
    if (!DATE) {
      e.innerHTML = `<header class="bara"><h1>Tablou BTC</h1></header><main class="continut"><section class="card"><p class="nota">${SURSA_DATE === 'eroare' ? 'Nu am putut încărca datele. Verifică internetul și apasă reîmprospătare.' : 'Se încarcă datele…'}</p>${SURSA_DATE === 'eroare' ? '<button type="button" class="link-btn" data-act="reimprospateaza">Încearcă din nou</button>' : ''}</section></main>`;
    } else if (r.fila === 'acasa') e.innerHTML = ecranAcasa();
    else if (r.fila === 'grafice') e.innerHTML = ecranGrafice(r.nr || '2');
    else if (r.fila === 'stiri') e.innerHTML = ecranStiri();
    else e.innerHTML = ecranCalendar();
    document.querySelectorAll('.nav a').forEach(a => {
      if (a.dataset.fila === r.fila) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (pastreazaScroll) window.scrollTo(0, y);
    else {
      window.scrollTo(0, 0);
      const c = document.querySelector('.cip.activ');
      if (c) c.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }

  // ------------------------------------------------------------ încărcare
  async function incarcaDate() {
    try {
      const r = await fetch(`tablou.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      DATE = await r.json();
      SURSA_DATE = r.headers.get('x-din-cache') ? 'cache' : 'rețea';
      ULTIMA_INCARCARE = Date.now();
    } catch (e) {
      if (!DATE) SURSA_DATE = 'eroare';
      console.warn('date:', e);
    }
  }
  async function incarcaPret() {
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const p = +j.lastPrice;
      if (p > 0) LIVE = { pret: p, schimbare: +j.priceChangePercent, t: Date.now() };
    } catch (e) { console.warn('preț live:', e); }
  }
  let ocupat = false;
  async function reimprospateaza(tot = true) {
    if (ocupat) return;
    ocupat = true;
    document.body.classList.add('se-incarca');
    await Promise.all([tot ? incarcaDate() : null, incarcaPret()]);
    document.body.classList.remove('se-incarca');
    ocupat = false;
    deseneaza(true);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'reimprospateaza') reimprospateaza(true);
    else if (a === 'calcul') arataCalcul();
    else if (a === 'despre') arataDespre();
    else if (a === 'inchide') $('#dialog').close();
  });
  $('#dialog').addEventListener('click', e => { if (e.target.id === 'dialog') e.target.close(); });
  window.addEventListener('hashchange', () => deseneaza(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reimprospateaza(Date.now() - ULTIMA_INCARCARE > 5 * 60000);
  });
  setInterval(() => { if (document.visibilityState === 'visible') reimprospateaza(Date.now() - ULTIMA_INCARCARE > 10 * 60000); }, 60000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw:', e));
    let reincarcat = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reincarcat) { reincarcat = true; location.reload(); } });
  }

  deseneaza(false);
  reimprospateaza(true);
})();
