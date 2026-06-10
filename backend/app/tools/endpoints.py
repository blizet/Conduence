GAMMA_BASE = "https://gamma-api.polymarket.com"
DATA_BASE = "https://data-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"


class GAMMA:
    base = GAMMA_BASE
    markets = f"{GAMMA_BASE}/markets"


class DATA:
    base = DATA_BASE
    trades = f"{DATA_BASE}/trades"

    @staticmethod
    def recent_trades(condition_id: str) -> str:
        return f"{DATA_BASE}/trades?condition_id={condition_id}"


class CLOB:
    base = CLOB_BASE
    orders = f"{CLOB_BASE}/order"

    @staticmethod
    def orderbook(token_id: str) -> str:
        return f"{CLOB_BASE}/book?token_id={token_id}"

    @staticmethod
    def last_trade_price(token_id: str) -> str:
        return f"{CLOB_BASE}/last-trade-price?token_id={token_id}"

    @staticmethod
    def spread(token_id: str) -> str:
        return f"{CLOB_BASE}/spread?token_id={token_id}"

    @staticmethod
    def midpoint(token_id: str) -> str:
        return f"{CLOB_BASE}/midpoint?token_id={token_id}"
