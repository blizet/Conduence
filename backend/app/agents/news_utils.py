import re

SHORT_TAIL_MAP = {
    "bitcoin": "BTC",
    "btc": "BTC",
    "ethereum": "ETH",
    "eth": "ETH",
    "solana": "SOL",
    "sol": "SOL",
    "xrp": "XRP",
    "dogecoin": "DOGE",
    "doge": "DOGE",
    "etf": "ETF",
    "ipo": "IPO",
    "spacex": "SpaceX",
    "microstrategy": "MicroStrategy",
    "mstr": "MicroStrategy",
    "zcash": "ZEC",
    "ripple": "XRP",
    "stablecoin": "stablecoin",
    "visa": "Visa",
    "sec": "SEC",
    "fed": "Fed",
    "inflation": "inflation",
    "regulation": "regulation",
    "hack": "hack",
    "defi": "DeFi",
    "nft": "NFT",
}

BULLISH_WORDS = {
    "surge", "rally", "soar", "jump", "gain", "rise", "bull", "record", "high", "approval", "launch",
}
BEARISH_WORDS = {
    "drop", "fall", "crash", "plunge", "decline", "bear", "hack", "ban", "lawsuit", "selloff", "loss",
}
STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "at", "by", "for", "is", "will", "be",
    "as", "it", "its", "this", "that", "with", "from", "after", "before", "says", "new", "how", "why",
}

CATEGORY_HINTS = {
    "Crypto": [
        "btc", "bitcoin", "eth", "ethereum", "crypto", "sol", "solana", "xrp", "doge", "defi", "nft",
        "blockchain", "stablecoin", "token", "binance", "coinbase",
    ],
    "Finance": ["stock", "ipo", "etf", "bank", "visa", "microstrategy", "mstr", "earnings", "market"],
    "Economics": ["fed", "inflation", "gdp", "rates", "treasury", "jobs", "recession", "cpi"],
    "Politics": ["election", "trump", "biden", "congress", "sec", "regulation", "sanction", "war"],
    "Entertainment": ["movie", "celebrity", "sport", "nfl", "nba", "oscar", "music"],
    "Weather": ["hurricane", "storm", "climate", "weather", "flood", "drought"],
}


def infer_sentiment(headline: str) -> str:
    tokens = re.split(r"[^a-z0-9]+", headline.lower())
    bull = sum(1 for t in tokens if t in BULLISH_WORDS)
    bear = sum(1 for t in tokens if t in BEARISH_WORDS)
    if bull > bear:
        return "bullish"
    if bear > bull:
        return "bearish"
    return "neutral"


def extract_short_tail_keywords(headline: str, summary: str | None = None) -> list[str]:
    text = f"{headline} {summary or ''}"
    keywords: set[str] = set()
    for raw, canonical in SHORT_TAIL_MAP.items():
        if re.search(rf"\b{raw}\b", text, re.I):
            keywords.add(canonical)
    tokens = [
        t
        for t in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split()
        if 2 <= len(t) <= 12 and t not in STOPWORDS
    ]
    upper_tokens = set(re.findall(r"\b[A-Z]{2,5}\b", text))
    for t in tokens:
        if t in SHORT_TAIL_MAP:
            keywords.add(SHORT_TAIL_MAP[t])
    for t in upper_tokens:
        if t.lower() not in STOPWORDS:
            keywords.add(t)
    return list(keywords)[:8]


def infer_news_categories(headline: str, keywords: list[str] | None = None) -> list[str]:
    text = f"{headline} {' '.join(keywords or [])}".lower()
    matched = [cat for cat, hints in CATEGORY_HINTS.items() if any(h in text for h in hints)]
    return matched or ["Finance"]
