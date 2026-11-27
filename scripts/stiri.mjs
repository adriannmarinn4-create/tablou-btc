/*
 * Tablou BTC — regulile pentru știri (modulul 9) și influențatori (modulul 10).
 * Fără AI: categoria vine din cuvinte-cheie, sensul din liste fixe de cuvinte din titlu.
 * Titlurile rămân în engleză; etichetele și concluziile sunt în română.
 */

export const FLUXURI = [
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  ['Cointelegraph', 'https://cointelegraph.com/rss'],
  ['The Block', 'https://www.theblock.co/rss.xml'],
  ['Decrypt', 'https://decrypt.co/feed'],
  ['Bitcoin Magazine', 'https://bitcoinmagazine.com/.rss/full/'],
  ['Bitcoin.com', 'https://news.bitcoin.com/feed/'],
  ['Google News', 'https://news.google.com/rss/search?q=bitcoin+when:2d&hl=en-US&gl=US&ceid=US:en'],
];

const ZI = 86400000;
const ORE_SCOR = 48;
const ZILE_AFISATE = 7;

// ---------------------------------------------------------------- citirea RSS
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–' };
function entitati(s) {
  let x = String(s ?? '');
  for (let i = 0; i < 2; i++) { // unele fluxuri codifică de două ori (&amp;#8217;)
    x = x.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
      .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
  }
  return x;
}
const curat = s => entitati(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const camp = (bloc, tag) => { const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(bloc); return m ? m[1] : null; };

export function citesteRss(xml, sursa) {
  const out = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    let titlu = curat(camp(b, 'title'));
    const t = Date.parse(curat(camp(b, 'pubDate')));
    const link = curat(camp(b, 'link')) || (/<guid[^>]*>(https?:[^<]+)<\/guid>/i.exec(b)?.[1] ?? null);
    let editor = sursa;
    const src = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(b);
    if (src) { // Google News: editorul real e în <source>, iar titlul se termină cu „ - Editor”
      editor = curat(src[1]);
      if (titlu.endsWith(` - ${editor}`)) titlu = titlu.slice(0, -(editor.length + 3));
    }
    if (titlu && Number.isFinite(t)) out.push({ t, sursa: editor, titlu: titlu.replace(/[’‘]/g, "'").replace(/[“”]/g, '"'), link });
  }
  return out;
}

// ---------------------------------------------------------------- categorii
// Ordinea contează: o știre primește prima categorie care se potrivește.
const STRATEGY = /\bStrategy(?:'s)?\s+(?:buys|bought|adds|added|acquires|acquired|purchases|purchased|sells|sold|holds|now|stock|shares|CEO|chairman|executive|files|raises|raised|announces|reports|posts|plans|pauses|paused|halts|resumes|repurchases?|repurchased|STR[CDFK]|MSTR|\()/;
export const CATEGORII = [
  { id: 'etf', nume: 'ETF', impact: 'mare', re: [/\bETF[sS]?\b|\bETP[sS]?\b|\bIBIT\b|\bFBTC\b|\bGBTC\b|\bARKB\b|\bBITB\b/, /spot bitcoin funds?|bitcoin funds?\b/i] },
  { id: 'fed', nume: 'Fed', impact: 'mare', re: [/\bFed\b|\bFOMC\b|\bPowell\b|\bWarsh\b|\bCPI\b|\bPCE\b|\bNFP\b/, /federal reserve|interest[- ]rates?|\brate (?:hike|cut|decision)s?\b|\binflation\b|jobs report|payrolls|treasury yields?|bond yields?/i] },
  { id: 'reglementare', nume: 'Reglementare', impact: 'mare', re: [/\bSEC\b|\bCFTC\b|\bMiCA\b|\bIRS\b|\bOCC\b|\bFDIC\b|\bAct\b/, /regulat|legislat|lawmakers?|\bsenate\b|\bcongress|\bbill\b|\blaws?\b|\blawsuits?\b|\bcourt\b|\bjudge\b|\bban(?:s|ned)?\b|\btax(?:es|ation)?\b|sanction|strategic (?:bitcoin )?reserve|bitcoin reserve/i] },
  { id: 'companii', nume: 'Companii', impact: 'mediu', re: [/\bSaylor\b|\bMicroStrategy\b|\bMSTR\b|\bMetaplanet\b|\bStrive\b|\bTwenty One\b|\bNakamoto\b|\bSemler\b|\bGameStop\b|\bTrump Media\b/, STRATEGY, /treasury compan|corporate treasur|bitcoin treasur|digital asset treasur/i] },
  { id: 'mineri', nume: 'Mineri', impact: 'mediu', re: [/\bminers?\b|\bmining\b|hash ?rate|hashprice|\bdifficulty\b/i, /\bMARA\b|\bRiot\b|CleanSpark|Bitfarms|Core Scientific|\bIREN\b|Cipher Mining|\bHut 8\b|TeraWulf|Bitdeer|\bCanaan\b|Bitmain/] },
  { id: 'banci', nume: 'Bănci', impact: 'mediu', re: [/\bbanks?\b|\bbanking\b/i, /JPMorgan|\bJ\.?P\.? Morgan\b|Goldman|\bCiti(?:group|bank)?\b|Morgan Stanley|Standard Chartered|Bank of America|\bBofA\b|\bHSBC\b|Wells Fargo|Deutsche Bank|\bUBS\b|Barclays|Bernstein|\bBNY\b|State Street|Fidelity|Vanguard|Schwab|BlackRock/] },
  { id: 'securitate', nume: 'Securitate', impact: 'mediu', re: [/\bhack(?:s|ed|ers?)?\b|\bexploit(?:s|ed)?\b|\bstolen\b|\btheft\b|\bthieves\b|\bbreach(?:es|ed)?\b|\bdrained\b|\bscams?\b|phishing|vulnerab|\bquantum\b|\battack(?:s|ed|ers?)?\b|ransomware|laundering|\bseiz(?:e|es|ed|ure)\b|forfeit/i] },
];
const BTC = /\bbitcoin\b|\bBTC\b/i;
const ALT = /\b(?:Ether(?:eum)?|ETH|Solana|SOL|XRP|Ripple|Dogecoin|DOGE|Cardano|ADA|Litecoin|LTC|Avalanche|AVAX|Chainlink|LINK|SUI|HBAR|Hedera|Polkadot|DOT|Tron|TRX|BNB|TON|Toncoin|Shiba|SHIB|PEPE|Monero|XMR|Aptos|Arbitrum|Polygon|MATIC|Stellar|XLM|NEAR|Hyperliquid|HYPE|Zcash|ZEC|Ethena|Uniswap|Aave|[Mm]emecoins?|[Aa]ltcoins?)\b/;
const SUMA_MARE = /\$\s?\d[\d.,]*\s?(?:billion|bn|B)\b|\$\s?\d{3}[\d.,]*\s?(?:million|M)\b/i;
const BURSE = /\b(?:Binance|Coinbase|Kraken|Bybit|OKX|Bitfinex|Gemini|Upbit|Bithumb)\b/;

function categoria(titlu) {
  for (const c of CATEGORII) if (c.re.some(r => r.test(titlu))) return c;
  return null;
}
// relevant pentru BTC: are o categorie și nu e despre altă monedă; la securitate, doar dacă e despre BTC, o sumă mare sau o bursă mare
function relevanta(titlu, cat) {
  if (!cat) return false;
  if (BTC.test(titlu)) return true;
  if (ALT.test(titlu)) return false;
  if (cat.id === 'securitate') return SUMA_MARE.test(titlu) || BURSE.test(titlu);
  return true;
}

// ---------------------------------------------------------------- sensul
// Expresiile se verifică primele și se scot din titlu, ca „rate cut” să nu fie citit și ca „cut”.
const EXPRESII = [
  [+1, /\b(?:interest[- ])?rate cuts?\b/i],
  [+1, /\bcut(?:s|ting)? (?:interest )?rates\b/i],
  [+1, /\blower(?:s|ed|ing)? (?:interest )?rates\b/i],
  [+1, /\b(?:drops?|dropped|dismiss(?:es|ed)?|ends?|ended|closes?|closed) (?:its |the |a )?(?:case|lawsuit|charges|probe|investigation)\b/i],
  [+1, /\braise[sd]? (?:its |their |the )?(?:bitcoin |BTC )?(?:price |year-end )?(?:target|forecast)s?\b/i],
  [+1, /\brecord (?:high|inflows?)\b|\ball[- ]time highs?\b/i],
  [-1, /\brate hikes?\b|\bhike[sd]? (?:interest )?rates\b|\braise[sd]? (?:interest )?rates\b|\bhigher for longer\b/i],
  [-1, /\b(?:cuts?|slash(?:es|ed)?|lower(?:s|ed)?|trim(?:s|med)?) (?:its |their |the )?(?:bitcoin |BTC |crypto )?(?:price |year-end )?(?:target|forecast|outlook)s?\b/i],
];
const CUVINTE = [
  [-1, /\boutflows?\b|\bbleed(?:s|ing)?\b|\blos(?:e|es|t|ing)\b|\bexit(?:s|ed|ing)?\b|\bwithdraw(?:s|als?|n)?\b|\bredemptions?\b|\bdump(?:s|ed|ing)?\b/gi],
  [-1, /\bsell(?:s|ing|ers)?\b|\bsold\b|\bsell-?offs?\b|\boffload(?:s|ed|ing)?\b|\bliquidat(?:e|es|ed|ions?)\b|\bcapitulat(?:e|es|ed|ion)\b/gi],
  [-1, /\bhikes?\b|\bhiked\b|\bhawkish\b|\btighten(?:s|ing)?\b|\bhot(?:ter)?\b/gi],
  [-1, /\bdowngrade[sd]?\b|\bbearish\b|\bwarn(?:s|ed|ing|ings)?\b|\bcuts?\b|\bslash(?:es|ed)?\b/gi],
  [-1, /\bban(?:s|ned)?\b|\bcrackdown\b|\blawsuits?\b|\bsue[sd]?\b|\bcharged\b|\bprobe\b|\binvestigat(?:e|es|ed|ion)\b|\breject(?:s|ed|ion)?\b|\bdelay(?:s|ed)?\b|\bfined\b|\bpenalt(?:y|ies)\b/gi],
  [-1, /\bhack(?:s|ed|ers?)?\b|\bexploit(?:s|ed)?\b|\bstolen\b|\bsteal(?:s|ing)?\b|\btheft\b|\bdrain(?:s|ed)?\b|\bbreach(?:es|ed)?\b|\bscams?\b|\battack(?:s|ed|ers?)?\b/gi],
  [-1, /\bplung(?:e|es|ed|ing)\b|\bcrash(?:es|ed)?\b|\btumbl(?:e|es|ed)\b|\bslump(?:s|ed)?\b|\bslid(?:e|es)?\b|\bsinks?\b|\bsank\b|\bdrops?\b|\bdropped\b|\bfall(?:s|ing)?\b|\bfell\b|\bdeclin(?:e|es|ed|ing)\b|\bfears?\b|\bcollaps(?:e|es|ed)\b|\bbankrupt(?:cy)?\b|\binsolven(?:t|cy)\b|\bworst\b|\bstress\b|\bweak(?:ens?|er|ness)?\b/gi],
  [+1, /\binflows?\b|\badd(?:s|ed)?\b|\battract(?:s|ed)?\b/gi],
  [+1, /\bbuy(?:s|ing|ers)?\b|\bbought\b|\bpurchas(?:e|es|ed)\b|\bacquir(?:e|es|ed)\b|\baccumulat(?:e|es|ed|ing|ion)\b|\bscoop(?:s|ed)?\b/gi],
  [+1, /\bdovish\b|\beas(?:e|es|ing)\b|\bcool(?:s|ing|er|ed)?\b/gi],
  [+1, /\bupgrade[sd]?\b|\bbullish\b|\boverweight\b/gi],
  [+1, /\bapprov(?:e|es|ed|al)\b|\blegaliz(?:e|es|ed|ation)\b|\bpass(?:es|ed)\b|\bsigns?\b|\bsigned\b|\bgreen ?light(?:s|ed)?\b|\bwins?\b|\bwon\b|\bembrac(?:e|es|ed)\b|\badopt(?:s|ed|ion)?\b/gi],
  [+1, /\bsurg(?:e|es|ed|ing)\b|\brall(?:y|ies|ied)\b|\bsoar(?:s|ed|ing)?\b|\bjump(?:s|ed)?\b|\bclimb(?:s|ed)?\b|\brises?\b|\brose\b|\bgain(?:s|ed)?\b|\brebound(?:s|ed)?\b|\brecover(?:s|y|ed)?\b|\btops\b|\brestor(?:e|es|ed)\b/gi],
];
export function sens(titlu) {
  let rest = titlu;
  const poz = [], neg = [];
  for (const [s, re] of EXPRESII) {
    const m = re.exec(rest);
    if (m) { (s > 0 ? poz : neg).push(m[0]); rest = rest.replace(m[0], ' '); }
  }
  for (const [s, re] of CUVINTE) for (const m of rest.matchAll(re)) (s > 0 ? poz : neg).push(m[0]);
  const tip = poz.length && neg.length ? 'mixtă' : neg.length ? 'negativ' : poz.length ? 'pozitiv' : 'neutră';
  return { s: tip === 'negativ' ? -1 : tip === 'pozitiv' ? 1 : 0, tip, poz, neg };
}
const ghilimele = a => [...new Set(a.map(w => w.trim()))].slice(0, 3).map(w => `„${w}”`).join(', ');
function regulaSens(eticheta, x) {
  if (x.tip === 'neutră') return `${eticheta}, fără cuvinte de sens în titlu → neutră`;
  if (x.tip === 'mixtă') return `${eticheta} + ${ghilimele(x.neg)} (negativ) și ${ghilimele(x.poz)} (pozitiv) → mixtă`;
  return `${eticheta} + ${ghilimele(x.tip === 'negativ' ? x.neg : x.poz)} → ${x.tip}`;
}

// concluzia fixă pe (categorie, sens)
const CONCLUZII = {
  etf: { '-1': 'Ieșirile din ETF au însemnat istoric presiune de vânzare pe termen scurt.', 1: 'Intrările în ETF aduc cumpărători noi; istoric au susținut prețul.' },
  fed: { '-1': 'Dobânzi mai mari înseamnă mai puțină lichiditate pentru BTC.', 1: 'Dobânzi mai mici înseamnă mai multă lichiditate; istoric au ajutat BTC.' },
  reglementare: { '-1': 'Reguli mai dure sau procese pot speria piața pe termen scurt.', 1: 'Reguli mai clare sau aprobări deschid ușa banilor instituționali.' },
  companii: { '-1': 'Când companiile-trezorerie vând, e semn de stres; efectul direct pe preț e de obicei mic.', 1: 'Companiile care cumpără scot monede de pe piață; efect mic, dar constant.' },
  mineri: { '-1': 'Minerii sub presiune vând din rezerve; efectul trece de obicei în câteva săptămâni.', 1: 'Minerii în formă bună vând mai puțin; semn de rețea sănătoasă.' },
  banci: { '-1': 'Țintele tăiate de bănci arată pesimism; efectul direct pe preț e de obicei mic.', 1: 'Interesul băncilor aduce bani noi pe termen lung; efectul imediat e mic.' },
  securitate: { '-1': 'Un atac sau un furt strică încrederea; contează cât de mare e suma.', 1: 'Fonduri recuperate sau breșe închise reduc riscul perceput.' },
};
const concluzieStire = (cat, x) => (x.s ? CONCLUZII[cat.id][x.s] : x.tip === 'mixtă' ? 'Semne amestecate în titlu; nu mută scorul.' : 'Titlul nu are un sens clar; nu mută scorul.');

const cheie = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 70);
export function unifica(liste, T) { // fără dubluri, doar ultimele 7 zile, cele mai noi primele
  const vazut = new Set(), out = [];
  for (const it of liste.flat().sort((a, b) => b.t - a.t)) {
    const k = cheie(it.titlu);
    if (vazut.has(k) || it.t < T - ZILE_AFISATE * ZI || it.t > T + 3600000) continue;
    vazut.add(k);
    out.push(it);
  }
  return out;
}

// ---------------------------------------------------------------- 9 · Știri
// în română, de la 20 în sus se spune „20 de știri”
const plural = (n, unu, mai) => `${n} ${n === 1 ? unu : `${n % 100 >= 20 || (n >= 100 && n % 100 === 0) ? 'de ' : ''}${mai}`}`;
export function modulStiri(toate, T, { semn, scorTxt }) {
  const stiri = [];
  for (const it of toate) {
    const cat = categoria(it.titlu);
    if (!relevanta(it.titlu, cat)) continue;
    const x = sens(it.titlu);
    stiri.push({
      t: it.t, sursa: it.sursa, titlu: it.titlu, link: it.link, cat: cat.id, catNume: cat.nume, impact: cat.impact,
      s: x.s, tip: x.tip, concluzie: concluzieStire(cat, x), regula: regulaSens(cat.nume, x), in48: it.t >= T - ORE_SCOR * 3600000,
    });
  }
  const r = stiri.filter(s => s.in48);
  const nr = tip => r.filter(s => s.tip === tip).length;
  const neg = nr('negativ'), poz = nr('pozitiv'), mix = nr('mixtă'), neu = nr('neutră');
  const greutate = s => (s.impact === 'mare' ? 2 : 1);
  const G = r.reduce((a, s) => a + greutate(s), 0);
  const M = G ? r.reduce((a, s) => a + greutate(s) * s.s, 0) / G : 0;
  const putine = r.length < 3;
  const scor = putine ? 0 : Math.max(-2, Math.min(2, Math.round(2 * M * 10) / 10));
  const eticheta = putine ? 'Puține știri' : M <= -0.25 ? 'Mai mult negative' : M >= 0.25 ? 'Mai mult pozitive' : 'Echilibrate';
  const parti = [neg && plural(neg, 'negativă', 'negative'), mix && plural(mix, 'mixtă', 'mixte'), poz && plural(poz, 'pozitivă', 'pozitive'), neu && plural(neu, 'neutră', 'neutre')].filter(Boolean);
  const peCat = tip => {
    const c = {};
    for (const s of r.filter(s => s.tip === tip)) c[s.catNume] = (c[s.catNume] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
  };
  let concluzie;
  if (!r.length) concluzie = 'Nicio știre relevantă pentru BTC în ultimele 48 de ore (scor 0).';
  else {
    concluzie = `În ultimele 48 de ore: ${plural(r.length, 'știre relevantă', 'știri relevante')}, ${parti.join(', ')}`;
    if (neg) concluzie += `; negativele sunt despre ${peCat('negativ')}`;
    if (poz) concluzie += `; pozitivele despre ${peCat('pozitiv')}`;
    concluzie += putine ? '. Prea puține știri pentru un semnal (0).' : `. Tonul e ${M <= -0.25 ? 'negativ' : M >= 0.25 ? 'pozitiv' : 'echilibrat'} (${scorTxt(scor)}).`;
  }
  const afisate = [...r, ...stiri.filter(s => !s.in48).slice(0, 12)].slice(0, 45);
  return {
    scor, eticheta, detaliu: parti.join(' · ') || 'nicio știre relevantă',
    valori: { ore: ORE_SCOR, relevante: r.length, negative: neg, pozitive: poz, mixte: mix, neutre: neu, medie: Math.round(M * 100) / 100, stiri: afisate },
    regula: 'categoria din cuvinte-cheie în titlu (ETF, Fed și reglementare = impact mare; companii, mineri, bănci și securitate = impact mediu) · sensul din liste fixe de cuvinte (outflows, sell, hike, hack… = negativ; inflows, buy, rate cut, approve… = pozitiv; ambele = mixtă) · scorul = 2 × media pe 48 de ore, impactul mare contează dublu · sub 3 știri → 0',
    concluzie, surse: `RSS gratuite: ${FLUXURI.map(f => f[0]).join(', ')} (titlurile rămân în engleză)`,
  };
}

// ---------------------------------------------------------------- 10 · Influențatori
export const PERSOANE = [
  { id: 'saylor', scurt: 'Saylor', nume: 'Michael Saylor', rol: 'Strategy', init: 'MS', cuv: 'Saylor sau Strategy', re: [/\bSaylor\b|\bMicroStrategy\b|\bMSTR\b/, STRATEGY],
    c: { '-1': 'Când Strategy vinde, e semn de stres; efectul direct pe preț e de obicei mic.', 1: 'Strategy cumpără din nou: cerere constantă, cu efect direct mic pe preț.', 0: 'Știre despre Strategy fără un sens clar.' } },
  { id: 'warsh', scurt: 'Warsh', nume: 'Kevin Warsh', rol: 'președintele Fed', init: 'KW', cuv: 'Warsh', re: [/\bWarsh\b/],
    c: { '-1': 'Un Fed mai strict înseamnă mai puțină lichiditate pentru BTC.', 1: 'Un Fed mai blând înseamnă mai multă lichiditate; istoric a ajutat BTC.', 0: 'Declarație a șefului Fed fără un semnal clar despre dobânzi.' } },
  { id: 'trump', scurt: 'Trump', nume: 'Donald Trump', rol: 'președintele SUA', init: 'DT', cuv: 'Trump', re: [/\bTrump\b/],
    c: { '-1': 'Tarifele și tensiunile politice au adus de obicei vânzări pe termen scurt.', 1: 'Sprijinul politic ajută sentimentul; efectul ține puțin dacă nu urmează legi.', 0: 'Știre politică fără un sens clar pentru BTC.' } },
  { id: 'fink', scurt: 'Fink', nume: 'Larry Fink', rol: 'BlackRock', init: 'LF', cuv: 'Fink', re: [/\bFink\b/],
    c: { '-1': 'Când BlackRock e rezervat, instituțiile tind să aștepte.', 1: 'Când BlackRock e optimist, instituțiile tind să urmeze.', 0: 'Declarație a șefului BlackRock fără un sens clar pentru BTC.' } },
  { id: 'musk', scurt: 'Musk', nume: 'Elon Musk', rol: 'Tesla, SpaceX', init: 'EM', cuv: 'Musk', re: [/\bMusk\b|\bElon\b/],
    c: { '-1': 'Vorbele lui Musk mișcă sentimentul pe termen scurt, rar și trendul.', 1: 'Vorbele lui Musk mișcă sentimentul pe termen scurt, rar și trendul.', 0: 'Știre despre Musk fără un sens clar pentru BTC.' } },
  { id: 'wood', scurt: 'Cathie Wood', nume: 'Cathie Wood', rol: 'ARK Invest', init: 'CW', cuv: 'Cathie Wood sau ARK', re: [/\bCathie\b|\bARK Invest\b|\bARK\b(?= (?:buys|sells|sold|bought|adds|trims|cuts|predicts|says))/],
    c: { '-1': 'Când ARK vinde, contează mai mult decât prognozele ei.', 1: 'Prognozele ARK sunt de obicei foarte optimiste; contează mai mult ce cumpără fondul.', 0: 'Știre despre ARK fără un sens clar.' } },
  { id: 'cz', scurt: 'CZ', nume: 'Changpeng Zhao', rol: 'fondatorul Binance', init: 'CZ', cuv: 'CZ', re: [/\bCZ\b|Changpeng Zhao/],
    c: { '-1': 'Știrile despre CZ mișcă mai mult sentimentul decât prețul.', 1: 'Știrile despre CZ mișcă mai mult sentimentul decât prețul.', 0: 'Știre despre CZ fără un sens clar.' } },
];
export function modulInfluentatori(toate) {
  const aparitii = [], pePersoana = {};
  for (const it of toate) {
    const p = PERSOANE.find(p => p.re.some(r => r.test(it.titlu)));
    if (!p || (pePersoana[p.id] || 0) >= 4) continue; // cel mult 4 titluri pe persoană
    pePersoana[p.id] = (pePersoana[p.id] || 0) + 1;
    const x = sens(it.titlu);
    aparitii.push({ cine: p.id, nume: p.nume, rol: p.rol, init: p.init, t: it.t, sursa: it.sursa, titlu: it.titlu, link: it.link, s: x.s, tip: x.tip, concluzie: p.c[x.s], regula: regulaSens(p.cuv, x) });
    if (aparitii.length >= 12) break;
  }
  const cine = PERSOANE.filter(p => pePersoana[p.id]);
  const rez = cine.map(p => {
    const a = aparitii.filter(x => x.cine === p.id);
    const n = a.filter(x => x.tip === 'negativ').length, po = a.filter(x => x.tip === 'pozitiv').length;
    return `${p.scurt} ${a.length}${n || po ? ` (${[n && `${n} neg.`, po && `${po} poz.`].filter(Boolean).join(', ')})` : ''}`;
  });
  return {
    informativ: true, scor: null,
    eticheta: cine.length ? cine.map(p => p.scurt).join(', ') : 'Liniște',
    detaliu: `${plural(aparitii.length, 'titlu', 'titluri')} în ${ZILE_AFISATE} zile`,
    valori: { urmariti: PERSOANE.map(p => ({ id: p.id, scurt: p.scurt, nume: p.nume, rol: p.rol })), aparitii },
    regula: `titluri care conțin numele urmărite (${PERSOANE.map(p => p.cuv).join(' · ')}) · sensul din aceleași liste de cuvinte ca la știri · doar informativ, nu intră în verdict`,
    concluzie: aparitii.length ? `În ultimele ${ZILE_AFISATE} zile: ${rez.join(' · ')}.` : `Niciunul dintre numele urmărite nu apare în titluri în ultimele ${ZILE_AFISATE} zile.`,
    surse: 'aceleași fluxuri RSS ca la știri (X nu e citit: costă pentru fiecare postare)',
  };
}
