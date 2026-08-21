const INSTRUMENTS = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 316.28 },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 182.14 },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 531.42 },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 348.63 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 246.18 },
  { symbol: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 801.11 },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 231.09 },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", exchange: "NYSE", mic_code: "XNYS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 510.25 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", mic_code: "XNYS", country: "United States", currency: "USD", type: "Common Stock", group: "us", base_price: 291.64 },
  { symbol: "BABA", name: "Alibaba Group Holding Limited", exchange: "NYSE", mic_code: "XNYS", country: "United States", currency: "USD", type: "American Depositary Receipt", group: "china", base_price: 161.28 },
  { symbol: "PDD", name: "PDD Holdings Inc.", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "American Depositary Receipt", group: "china", base_price: 128.42 },
  { symbol: "NIO", name: "NIO Inc.", exchange: "NYSE", mic_code: "XNYS", country: "United States", currency: "USD", type: "American Depositary Receipt", group: "china", base_price: 5.38 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSE ARCA", mic_code: "ARCX", country: "United States", currency: "USD", type: "ETF", group: "etf", base_price: 770.23 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "ETF", group: "etf", base_price: 668.41 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", exchange: "NYSE ARCA", mic_code: "ARCX", country: "United States", currency: "USD", type: "ETF", group: "etf", base_price: 334.18 },
  { symbol: "GLD", name: "SPDR Gold Shares", exchange: "NYSE ARCA", mic_code: "ARCX", country: "United States", currency: "USD", type: "ETF", group: "etf", base_price: 307.82 },
  { symbol: "SOXX", name: "iShares Semiconductor ETF", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "ETF", group: "etf", base_price: 332.44 },
  { symbol: "KWEB", name: "KraneShares CSI China Internet ETF", exchange: "NYSE ARCA", mic_code: "ARCX", country: "United States", currency: "USD", type: "ETF", group: "etf", base_price: 44.81 },
  { symbol: "0700", name: "腾讯控股", exchange: "HKEX", mic_code: "XHKG", country: "Hong Kong", currency: "HKD", type: "Common Stock", group: "hk", base_price: 610.5 },
  { symbol: "9988", name: "阿里巴巴-W", exchange: "HKEX", mic_code: "XHKG", country: "Hong Kong", currency: "HKD", type: "Common Stock", group: "hk", base_price: 142.8 },
  { symbol: "3690", name: "美团-W", exchange: "HKEX", mic_code: "XHKG", country: "Hong Kong", currency: "HKD", type: "Common Stock", group: "hk", base_price: 118.7 },
  { symbol: "1810", name: "小米集团-W", exchange: "HKEX", mic_code: "XHKG", country: "Hong Kong", currency: "HKD", type: "Common Stock", group: "hk", base_price: 57.35 },
  { symbol: "2800", name: "盈富基金", exchange: "HKEX", mic_code: "XHKG", country: "Hong Kong", currency: "HKD", type: "ETF", group: "hk", base_price: 27.26 },
  { symbol: "600519", name: "贵州茅台", exchange: "SSE", mic_code: "XSHG", country: "China", currency: "CNY", type: "Common Stock", group: "cn", base_price: 1488.0 },
  { symbol: "601318", name: "中国平安", exchange: "SSE", mic_code: "XSHG", country: "China", currency: "CNY", type: "Common Stock", group: "cn", base_price: 61.42 },
  { symbol: "000001", name: "平安银行", exchange: "SZSE", mic_code: "XSHE", country: "China", currency: "CNY", type: "Common Stock", group: "cn", base_price: 12.05 },
  { symbol: "000858", name: "五粮液", exchange: "SZSE", mic_code: "XSHE", country: "China", currency: "CNY", type: "Common Stock", group: "cn", base_price: 138.62 },
  { symbol: "300750", name: "宁德时代", exchange: "SZSE", mic_code: "XSHE", country: "China", currency: "CNY", type: "Common Stock", group: "cn", base_price: 286.4 },
  { symbol: "510300", name: "华泰柏瑞沪深300ETF", exchange: "SSE", mic_code: "XSHG", country: "China", currency: "CNY", type: "ETF", group: "cn", base_price: 4.62 },
  { symbol: "159919", name: "嘉实沪深300ETF", exchange: "SZSE", mic_code: "XSHE", country: "China", currency: "CNY", type: "ETF", group: "cn", base_price: 4.78 },
  { symbol: "VFIAX", name: "Vanguard 500 Index Fund Admiral Shares", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Mutual Fund", group: "fund", base_price: 705.12 },
  { symbol: "FXAIX", name: "Fidelity 500 Index Fund", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Mutual Fund", group: "fund", base_price: 231.45 },
  { symbol: "SWPPX", name: "Schwab S&P 500 Index Fund", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Mutual Fund", group: "fund", base_price: 105.72 },
  { symbol: "FCNTX", name: "Fidelity Contrafund", exchange: "NASDAQ", mic_code: "XNAS", country: "United States", currency: "USD", type: "Mutual Fund", group: "fund", base_price: 23.17 }
];

const cnAliases = {
  "苹果": "AAPL", "英伟达": "NVDA", "微软": "MSFT", "特斯拉": "TSLA", "亚马逊": "AMZN",
  "阿里巴巴": "BABA 9988", "腾讯": "0700", "美团": "3690", "小米": "1810", "茅台": "600519",
  "宁德时代": "300750", "平安": "601318 000001", "沪深300": "510300 159919"
};

function clean(value, max = 80) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function instrumentId(item) {
  return [item.symbol, item.mic_code || item.exchange || "", item.type || ""].map((value) => clean(value).toUpperCase()).join("|");
}

function routeKind(type) {
  return /ETF|Fund/i.test(String(type || "")) ? "fund" : "stock";
}

function normalizeInstrument(item) {
  return {
    id: instrumentId(item),
    symbol: clean(item.symbol).toUpperCase(),
    name: clean(item.name, 160),
    exchange: clean(item.exchange).toUpperCase(),
    mic_code: clean(item.mic_code).toUpperCase(),
    country: clean(item.country, 80),
    currency: clean(item.currency, 12).toUpperCase(),
    type: clean(item.type, 80),
    group: clean(item.group || inferGroup(item), 20),
    route: routeKind(item.type)
  };
}

function inferGroup(item) {
  const country = clean(item.country).toLowerCase();
  const exchange = clean(item.exchange).toUpperCase();
  const type = clean(item.type).toLowerCase();
  if (country.includes("hong kong") || exchange === "HKEX") return "hk";
  if (country === "china" || ["SSE", "SZSE"].includes(exchange)) return "cn";
  if (type.includes("etf")) return "etf";
  if (type.includes("fund")) return "fund";
  if (/depositary receipt/i.test(item.type || "")) return "china";
  return "us";
}

function matchesMarket(item, market) {
  const wanted = clean(market).toLowerCase();
  return !wanted || wanted === "all" || inferGroup(item) === wanted || clean(item.group).toLowerCase() === wanted;
}

function searchCatalog(query, { market = "all", limit = 20 } = {}) {
  const q = clean(query).toLowerCase();
  if (!q) return [];
  const alias = Object.entries(cnAliases).filter(([label]) => label.includes(q) || q.includes(label)).map(([, symbols]) => symbols).join(" ").toLowerCase();
  return INSTRUMENTS
    .filter((item) => matchesMarket(item, market))
    .map((item) => {
      const haystack = `${item.symbol} ${item.name} ${item.exchange} ${item.country} ${item.type}`.toLowerCase();
      const symbol = item.symbol.toLowerCase();
      let score = haystack.includes(q) ? 10 : 0;
      if (symbol === q) score += 50;
      else if (symbol.startsWith(q)) score += 25;
      if (item.name.toLowerCase().startsWith(q)) score += 15;
      if (alias.includes(symbol)) score += 35;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.symbol.localeCompare(b.item.symbol))
    .slice(0, Math.min(Math.max(Number(limit) || 20, 1), 60))
    .map((entry) => normalizeInstrument(entry.item));
}

function findInstrument({ symbol, exchange = "", type = "" } = {}) {
  const s = clean(symbol).toUpperCase();
  const ex = clean(exchange).toUpperCase();
  const t = clean(type).toLowerCase();
  const item = INSTRUMENTS.find((candidate) => candidate.symbol === s && (!ex || candidate.exchange === ex || candidate.mic_code === ex) && (!t || candidate.type.toLowerCase() === t))
    || INSTRUMENTS.find((candidate) => candidate.symbol === s);
  return item || null;
}

function hashSeed(value) {
  return Array.from(String(value || "")).reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function demoQuote(item) {
  const seed = hashSeed(instrumentId(item));
  const base = Number(item.base_price || 20 + (seed % 50000) / 100);
  const change = Number((((seed % 801) - 400) / 100).toFixed(2));
  const previous = base / (1 + change / 100);
  const open = previous * (1 + (((seed >> 3) % 121) - 60) / 10000);
  const high = Math.max(base, open) * (1 + ((seed >> 5) % 90) / 10000);
  const low = Math.min(base, open) * (1 - ((seed >> 7) % 90) / 10000);
  const volume = 500000 + (seed % 85000000);
  const marketCap = base * (50000000 + (seed % 12000000000));
  return {
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
    mic_code: item.mic_code,
    country: item.country,
    currency: item.currency,
    type: item.type,
    group: inferGroup(item),
    price: Number(base.toFixed(2)),
    change: Number(change.toFixed(2)),
    change_amount: Number((base - previous).toFixed(2)),
    previous_close: Number(previous.toFixed(2)),
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    volume,
    average_volume: Math.round(volume * 0.94),
    market_cap: Math.round(marketCap),
    pe: Number((12 + (seed % 4800) / 100).toFixed(2)),
    fifty_two_week: {
      low: Number((base * 0.68).toFixed(2)),
      high: Number((base * 1.22).toFixed(2)),
      range: `${(base * 0.68).toFixed(2)} - ${(base * 1.22).toFixed(2)}`
    },
    is_market_open: false,
    datetime: "2026-08-21 16:00:00",
    source: "niulai-demo"
  };
}

function demoSeries(item, outputsize = 48) {
  const quote = demoQuote(item);
  const count = Math.min(Math.max(Number(outputsize) || 48, 5), 500);
  const seed = hashSeed(instrumentId(item));
  return Array.from({ length: count }, (_, index) => {
    const age = count - index - 1;
    const wave = Math.sin((index + seed % 17) / 4.8) * 0.025 + Math.cos((index + seed % 29) / 9.2) * 0.018;
    const trend = ((index / Math.max(count - 1, 1)) - 0.5) * quote.change / 100;
    const close = quote.price * (1 + wave + trend);
    return { datetime: new Date(Date.UTC(2026, 7, 21 - age)).toISOString(), close: Number(close.toFixed(4)) };
  });
}

function coverage() {
  return INSTRUMENTS.reduce((result, item) => {
    const key = inferGroup(item);
    result[key] = (result[key] || 0) + 1;
    result.total += 1;
    return result;
  }, { total: 0, us: 0, china: 0, etf: 0, hk: 0, cn: 0, fund: 0 });
}

module.exports = { INSTRUMENTS, clean, instrumentId, normalizeInstrument, inferGroup, routeKind, searchCatalog, findInstrument, demoQuote, demoSeries, coverage };
