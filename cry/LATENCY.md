# Latency Budget

Realistic latencies per stage, measured/estimated for the default config. "Detection latency" for any poller averages `poll_interval / 2`.

## Sources (mind agents + sub-agents)

| Stage | Realistic latency | Bottleneck |
|-------|------------------|------------|
| Real-world event → CoinDesk article | 1–5 min | editorial, not ours |
| cryptoNewsAgent poll (60s default) | avg 30s + 0.2–0.6s fetch | poll interval |
| arbitrageAgent scan (Poly ∥ Kalshi, parallel) | 0.4–1.2s per scan | slower venue (Kalshi, 3 paginated calls) |
| arbitrageAgent detection (15s poll) | avg ~8s, worst ~16s | poll interval |
| whaleAgent — trade on-chain → Data API indexed | 1–5s | Polymarket indexing |
| whaleAgent poll (30s default) | avg 15s + 0.2–0.5s/wallet | poll interval |
| divergenceAgent (60s poll) | avg 30s; CoinGecko prices are themselves ~30–60s stale | CoinGecko free-tier cache |

## Pipeline internals (per signal)

| Stage | Latency |
|-------|---------|
| mind agent stdout → orchestrator bus | < 1 ms |
| bus → decision engine pickup | < 1 s (queue timeout), typically < 10 ms |
| keyword match + graph propagation (19 nodes) | < 1 ms |
| corroboration lookup (in-memory) | < 1 ms |
| price confirmation (CoinGecko) | 0.3–0.8 s |
| market search (Gamma) — first call | 0.3–0.8 s |
| market search — cached (30s TTL catalog) | < 1 ms |
| arbitrage event → published suggestion (bypasses engine) | < 10 ms |

## End-to-end (event → suggestion printed)

| Flow | Realistic total | Dominated by |
|------|----------------|--------------|
| Flow-2: news → suggestion | **1.5–6 min** | news source lag (pipeline itself < 1.5s) |
| Flow-1: whale trade → suggestion | **~16–20 s** | whale poll interval |
| Arbitrage: spread appears → suggestion | **~8–17 s** | arb poll interval + scan |

## Already optimized

- Arbitrage agent fetches both venues **in parallel** (saves ~0.5–1s/scan)
- Gamma market catalog **cached 30s** — repeat searches < 1ms instead of ~500ms
- Arbitrage suggestions **bypass the decision engine** (no corroboration wait — an arb is self-verifying and speed-critical)
- All agents run on their own thread/process; one slow source never blocks another

## How to go lower (next steps, in impact order)

1. **WebSockets instead of polling** — Polymarket CLOB WSS (`wss://ws-subscriptions-clob.polymarket.com`) and Kalshi WSS push quote updates in ms. Removes the poll interval entirely: arb detection ~8s → **< 1s**.
2. **Faster news source** — X/Twitter filtered stream or Telegram instead of CoinDesk: 1–5 min → **seconds**. (Swap in as a new mind agent folder, same NDJSON contract.)
3. **Tighter polls within rate limits** — Kalshi public API tolerates ~10 req/s; `arbitrage_poll_s: 5` is safe and halves detection latency.
4. **Colocation** — run near the venues' edges (US-East for Kalshi; Dublin/Amsterdam route well to Polymarket). Cuts RTT 100–300ms → 10–30ms per call.
5. **Persistent HTTP/2 sessions + pre-resolved DNS** — saves 50–150ms handshake per request (stdlib urllib reconnects every call).
6. **Batch price checks** — one CoinGecko call per decision cycle instead of per node.
