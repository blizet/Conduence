from __future__ import annotations

import os
from pathlib import Path

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from cot_kb.falkordb_store import FalkorDBStore
from cot_kb.ingest import Neo4jIngestor
from cot_kb.io import load_json, save_json, split_batch_file
from cot_kb.models import decision_event_from_dict
from cot_kb.normalize import normalize_batch
from cot_kb.pipeline import ingest_decision
from cot_kb.redpanda_store import RedpandaStore
from cot_kb.redis_store import RedisGraphStore
from cot_kb.search import search_markdown
from cot_kb.wiki import append_log, trade_summary_from_edges

load_dotenv()

app = typer.Typer(
    name="cot",
    help="CoT Knowledge Base — decision graph ingest, validation, and wiki search.",
)
console = Console()

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DECISIONS = ROOT / "data" / "decisions"
DEFAULT_WIKI = ROOT / "wiki"
DEFAULT_RAW = ROOT / "data" / "raw"
DEFAULT_BATCH = ROOT / "data" / "sample" / "decisions-batch.json"
DEFAULT_GRAPH_ID = "eth.market.v1"


def _neo4j_config() -> tuple[str, str, str]:
    return (
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        os.getenv("NEO4J_USER", "neo4j"),
        os.getenv("NEO4J_PASSWORD", "cot-kb-password"),
    )


def _load_decisions(path: Path) -> list[dict]:
    raw = load_json(path)
    return normalize_batch(raw)


def _run_ingest(
    paths: list[Path],
    *,
    use_neo4j: bool,
    use_redis: bool,
    use_falkordb: bool,
    use_redpanda: bool,
    log: bool,
) -> None:
    log_path = DEFAULT_WIKI / "log.md"
    neo: Neo4jIngestor | None = None
    red: RedisGraphStore | None = None
    falkor: FalkorDBStore | None = None
    panda: RedpandaStore | None = None

    try:
        if use_neo4j:
            uri, user, password = _neo4j_config()
            neo = Neo4jIngestor(uri, user, password)
        if use_redis:
            red = RedisGraphStore()
            if not red.ping():
                raise typer.Exit("Redis not reachable. Run: docker compose up -d redis")
            red.ensure_indexes()
        if use_falkordb:
            falkor = FalkorDBStore()
            if not falkor.ping():
                raise typer.Exit("FalkorDB not reachable. Run: docker compose up -d falkordb-server")
        if use_redpanda:
            panda = RedpandaStore()
            try:
                panda.ensure_topic()
            except Exception as exc:
                raise typer.Exit(f"Redpanda not reachable. Run: docker compose up -d redpanda ({exc})")

        for file_path in paths:
            for item in _load_decisions(file_path):
                result = ingest_decision(
                    item,
                    neo4j=neo,
                    redis_store=red,
                    falkordb=falkor,
                    redpanda=panda,
                )
                parts = [f"[green]{item['decision_id']}[/green]"]
                if "neo4j" in result:
                    n = result["neo4j"]
                    parts.append(f"neo4j nodes={n['nodes']} edges={n['edges']}")
                if "redis" in result:
                    r = result["redis"]
                    parts.append(f"redis nodes={r['nodes']} edges={r['edges']}")
                if "falkordb" in result:
                    f = result["falkordb"]
                    parts.append(f"falkor graph={f['graph']} edges={f['edges']}")
                if "redpanda" in result:
                    p = result["redpanda"]
                    parts.append(f"kafka {p['topic']}@{p['offset']}")
                console.print(" ".join(parts))

                if log:
                    append_log(
                        log_path,
                        decision_id=item["decision_id"],
                        graph_id=item["graph_id"],
                        operation=item.get("operation", "assert"),
                        summary=trade_summary_from_edges(item["edges"]),
                    )
    finally:
        if neo:
            neo.close()
        if red:
            red.close()
        if falkor:
            falkor.close()
        if panda:
            panda.close()


@app.command("validate")
def validate(path: Path = typer.Argument(..., help="Decision JSON file or batch")) -> None:
    """Validate decision JSON against Pydantic models."""
    items = _load_decisions(path)
    for item in items:
        decision_event_from_dict(item)
    console.print(f"[green]OK[/green] {len(items)} decision(s) validated")


@app.command("normalize")
def normalize_cmd(
    path: Path = typer.Argument(...),
    out: Path | None = typer.Option(None, "--out", "-o"),
) -> None:
    """Print or write normalized decision JSON."""
    items = _load_decisions(path)
    if out:
        save_json(out, items[0] if len(items) == 1 else items)
        console.print(f"[green]Wrote[/green] {out}")
    else:
        console.print_json(data=items if len(items) > 1 else items[0])


@app.command("split")
def split(
    batch: Path = typer.Option(DEFAULT_BATCH, "--batch", "-b"),
    out_dir: Path = typer.Option(DEFAULT_DECISIONS, "--out-dir", "-o"),
) -> None:
    """Split a batch JSON array into one file per decision."""
    paths = split_batch_file(batch, out_dir)
    console.print(f"[green]Wrote {len(paths)} files[/green] to {out_dir}")


@app.command("ingest")
def ingest(
    path: Path = typer.Argument(..., help="Decision file or directory of .json files"),
    log: bool = typer.Option(True, "--log/--no-log", help="Append wiki/log.md"),
    neo4j: bool = typer.Option(True, "--neo4j/--no-neo4j"),
    redis: bool = typer.Option(True, "--redis/--no-redis"),
    falkordb: bool = typer.Option(True, "--falkordb/--no-falkordb"),
    redpanda: bool = typer.Option(True, "--redpanda/--no-redpanda"),
) -> None:
    """Ingest decision JSON into all configured backends."""
    paths = sorted(path.glob("*.json")) if path.is_dir() else [path]
    _run_ingest(
        paths,
        use_neo4j=neo4j,
        use_redis=redis,
        use_falkordb=falkordb,
        use_redpanda=redpanda,
        log=log,
    )


@app.command("ingest-all")
def ingest_all(
    decisions_dir: Path = typer.Option(DEFAULT_DECISIONS, "--dir", "-d"),
    log: bool = typer.Option(True, "--log/--no-log"),
    neo4j: bool = typer.Option(True, "--neo4j/--no-neo4j"),
    redis: bool = typer.Option(True, "--redis/--no-redis"),
    falkordb: bool = typer.Option(True, "--falkordb/--no-falkordb"),
    redpanda: bool = typer.Option(True, "--redpanda/--no-redpanda"),
) -> None:
    """Ingest every decision JSON in data/decisions/."""
    ingest(
        decisions_dir,
        log=log,
        neo4j=neo4j,
        redis=redis,
        falkordb=falkordb,
        redpanda=redpanda,
    )


@app.command("redis-init")
def redis_init() -> None:
    """Create RediSearch indexes for RedisInsight."""
    with RedisGraphStore() as store:
        if not store.ping():
            raise typer.Exit("Redis not reachable. Run: docker compose up -d redis")
        store.ensure_indexes()
    console.print("[green]RediSearch indexes ready.[/green]")
    console.print("RedisInsight UI: http://localhost:8001")


@app.command("redis-sync")
def redis_sync(
    path: Path = typer.Argument(
        DEFAULT_DECISIONS,
        help="Decision file or directory (default: data/decisions/)",
    ),
) -> None:
    """Sync decisions to Redis Stack only (no Neo4j)."""
    paths = sorted(path.glob("*.json")) if path.is_dir() else [path]
    _run_ingest(paths, use_neo4j=False, use_redis=True, use_falkordb=False, use_redpanda=False, log=False)


@app.command("falkordb-sync")
def falkordb_sync(
    path: Path = typer.Argument(DEFAULT_DECISIONS, help="Decision file or directory"),
) -> None:
    """Sync decisions to FalkorDB only."""
    paths = sorted(path.glob("*.json")) if path.is_dir() else [path]
    _run_ingest(paths, use_neo4j=False, use_redis=False, use_falkordb=True, use_redpanda=False, log=False)
    console.print("FalkorDB Browser: http://localhost:3000")


@app.command("falkordb-graphs")
def falkordb_graphs() -> None:
    """List graphs in FalkorDB."""
    with FalkorDBStore() as store:
        graphs = store.list_graphs()
    console.print_json(data={"graphs": graphs})


@app.command("redpanda-sync")
def redpanda_sync(
    path: Path = typer.Argument(DEFAULT_DECISIONS, help="Decision file or directory"),
) -> None:
    """Publish decisions to Redpanda topic only."""
    paths = sorted(path.glob("*.json")) if path.is_dir() else [path]
    _run_ingest(paths, use_neo4j=False, use_redis=False, use_falkordb=False, use_redpanda=True, log=False)
    console.print("Redpanda Console: http://localhost:8080")
    console.print("Topic: cot.decisions")


@app.command("services")
def services() -> None:
    """Print local GUI URLs for all stack services."""
    table = Table("Service", "GUI URL", "API / Notes")
    table.add_row("Neo4j Browser", "http://localhost:7474", "bolt://localhost:7687")
    table.add_row("RedisInsight", "http://localhost:8001", "redis://localhost:6379")
    table.add_row("FalkorDB Browser", "http://localhost:3000", "redis://localhost:6380")
    table.add_row("Redpanda Console", "http://localhost:8080", "kafka://localhost:19092")
    console.print(table)


@app.command("redis-search")
def redis_search(
    query: str = typer.Argument(..., help='RediSearch query, e.g. "@thesis:(fed macro)"'),
    graph_id: str | None = typer.Option(DEFAULT_GRAPH_ID, "--graph", "-g"),
    limit: int = typer.Option(10, "--limit", "-n"),
    json_out: bool = typer.Option(False, "--json"),
) -> None:
    """Search decisions indexed in Redis Stack."""
    with RedisGraphStore() as store:
        hits = store.search(query, graph_id=graph_id, limit=limit)
    if json_out:
        console.print_json(data=hits)
        return
    table = Table("Key", "Decision", "Action", "Thesis")
    for h in hits:
        thesis = str(h.get("thesis", ""))[:80]
        table.add_row(
            str(h.get("key", "")),
            str(h.get("decision_id", "")),
            str(h.get("trade_action", "")),
            thesis,
        )
    console.print(table)


@app.command("redis-stats")
def redis_stats(
    graph_id: str = typer.Option(DEFAULT_GRAPH_ID, "--graph", "-g"),
) -> None:
    """Print Redis graph statistics."""
    with RedisGraphStore() as store:
        stats = store.graph_stats(graph_id)
    console.print_json(data=stats)
    console.print("\nRedisInsight: http://localhost:8001")
    console.print(f"Browse viz snapshot: cot:meta:{graph_id}:viz:latest")


@app.command("search")
def search(
    query: str = typer.Argument(...),
    wiki_dir: Path = typer.Option(DEFAULT_WIKI, "--wiki"),
    limit: int = typer.Option(10, "--limit", "-n"),
    json_out: bool = typer.Option(False, "--json"),
) -> None:
    """Search wiki markdown (CLI tool for LLM agents)."""
    hits = search_markdown(wiki_dir, query, limit=limit)
    if json_out:
        console.print_json(
            data=[
                {"path": str(h.path), "line": h.line, "score": h.score, "snippet": h.snippet}
                for h in hits
            ]
        )
        return

    table = Table("Score", "File", "Line", "Snippet")
    for h in hits:
        rel = h.path.relative_to(ROOT) if h.path.is_relative_to(ROOT) else h.path
        table.add_row(f"{h.score:.2f}", str(rel), str(h.line), h.snippet)
    console.print(table)


@app.command("init")
def init_project() -> None:
    """Ensure default directories exist."""
    for d in [DEFAULT_RAW, DEFAULT_DECISIONS, DEFAULT_WIKI, ROOT / "data" / "sample"]:
        d.mkdir(parents=True, exist_ok=True)
    console.print("[green]Project directories ready.[/green]")
    services()


if __name__ == "__main__":
    app()
