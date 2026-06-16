"""Weighted causal graph operations for agentic chat."""

from __future__ import annotations

import re
from typing import Any, Literal

from app.agentic.weight import clamp_weight, format_weight_short

NodeType = Literal["event", "asset", "market", "concept"]

DOMAIN_ENTITY_RE = re.compile(
    r"oil|crypto|bitcoin|btc|eth|war|price|musk|trump|iran|vehicle|electric|tweet|market|coin|"
    r"environmental|stability|tesla|stock|asset|energy|inflation|fed|rate",
    re.I,
)
JUNK_LABEL_RE = re.compile(
    r"^(re|ve|ll|t|s|m|d|nt|is|are|was|were|the|that|this|when|you|your|we|they|it|its|what|how|"
    r"why|if|so|as|at|by|for|in|on|to|of|yes|no|ok|okay|suggesting|important|confirming|assigned|"
    r"indicating|appreciate|could|please|let|know|proceed|summary)\b",
    re.I,
)

PROSE_ENTITY_HINTS: list[tuple[re.Pattern[str], str, NodeType]] = [
    (re.compile(r"oil\s*price", re.I), "Oil Price", "market"),
    (re.compile(r"\bev\b|electric\s*vehicle", re.I), "Electric Vehicle Usage", "asset"),
    (re.compile(r"elon\s*musk.*(tweet|twitter|x\b)", re.I), "Elon Musk Tweets", "event"),
    (re.compile(r"elon\s*musk", re.I), "Elon Musk", "event"),
    (re.compile(r"crypto|bitcoin|btc|eth\b", re.I), "Crypto Coins Value", "asset"),
    (re.compile(r"iran\s*war", re.I), "Iran War Escalating", "event"),
    (re.compile(r"trump", re.I), "Trump Not Saying Anything", "event"),
]


def is_valid_node_label(label: str) -> bool:
    t = " ".join(label.strip().split())
    if len(t) < 3 or len(t) > 80:
        return False
    if not re.search(r"[a-zA-Z]", t):
        return False
    if JUNK_LABEL_RE.match(t):
        return False
    if t.endswith("..."):
        return False

    words = [w for w in t.split() if w]
    if len(words) == 1 and len(words[0]) < 4 and not DOMAIN_ENTITY_RE.search(t):
        return False
    if re.match(r"^[a-z]{1,3}\s", t) and not DOMAIN_ENTITY_RE.search(t):
        return False

    has_title_case = any(re.match(r"^[A-Z][a-z]", w) or re.match(r"^[A-Z]{2,}$", w) for w in words)
    has_domain = bool(DOMAIN_ENTITY_RE.search(t))
    if not has_title_case and not has_domain:
        return False
    if len(words) >= 2 and all(w == w.lower() for w in words) and not has_domain:
        return False
    return True


def infer_node_type(label: str) -> NodeType:
    l = label.lower()
    if re.search(r"war|election|policy|trump|iran|conflict|event|tweet|musk", l):
        return "event"
    if re.search(r"oil|btc|bitcoin|eth|crypto|gold|stock|asset|ev|vehicle", l):
        return "asset"
    if re.search(r"market|price|index|sector", l):
        return "market"
    return "concept"


def slugify(label: str) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", label.lower()))[:48]


def create_empty_graph() -> dict[str, list]:
    return {"nodes": [], "edges": []}


def _normalize_label(text: str) -> str:
    return text.strip().lower()


def _find_node_by_label(nodes: list[dict], label: str) -> dict | None:
    n = _normalize_label(label)
    for node in nodes:
        if (
            _normalize_label(node["label"]) == n
            or node["id"] == label
            or node["id"] == slugify(label)
            or slugify(node["label"]) == slugify(label)
        ):
            return node
    return None


def _unique_id(base: str, existing: set[str]) -> str:
    node_id = base or "node"
    i = 2
    while node_id in existing:
        node_id = f"{base}_{i}"
        i += 1
    existing.add(node_id)
    return node_id


def _find_node_id(nodes: list[dict], ref: str, node_ids: set[str]) -> str | None:
    for node in nodes:
        if node["id"] == ref:
            return node["id"]
    by_label = _find_node_by_label(nodes, ref)
    if by_label:
        return by_label["id"]
    if not is_valid_node_label(ref):
        return None
    node_id = _unique_id(slugify(ref), node_ids)
    nodes.append({"id": node_id, "label": ref.strip(), "type": infer_node_type(ref)})
    return node_id


def _find_edge_id_by_labels(graph: dict, source_label: str, target_label: str) -> str | None:
    src = _find_node_by_label(graph["nodes"], source_label)
    tgt = _find_node_by_label(graph["nodes"], target_label)
    if not src or not tgt:
        return None
    for edge in graph["edges"]:
        if edge["source"] == src["id"] and edge["target"] == tgt["id"]:
            return edge["id"]
    return None


def extract_quoted_relations(text: str) -> list[dict[str, str]]:
    pairs: list[dict[str, str]] = []
    seen: set[str] = set()
    patterns = [
        re.compile(r'"([^"]{2,60})"\s*→\s*"([^"]{2,60})"'),
        re.compile(r"'([A-Z][^'→]{2,60})'\s*→\s*'([A-Z][^'→]{2,60})'"),
    ]
    for pattern in patterns:
        for match in pattern.finditer(text):
            source_label = match.group(1).strip()
            target_label = match.group(2).strip()
            if not is_valid_node_label(source_label) or not is_valid_node_label(target_label):
                continue
            key = f"{source_label}→{target_label}".lower()
            if key in seen:
                continue
            seen.add(key)
            pairs.append({"sourceLabel": source_label, "targetLabel": target_label})
    return pairs


def _infer_expected_sign(text: str, target_label: str) -> int:
    snippet = text.lower()
    tgt = target_label.lower()
    if (
        re.search(r"fall|decline|drop|down|inverse|inversely|negative|decrease", snippet)
        and tgt in snippet
    ):
        return -1
    return 1


def apply_llm_delta(graph: dict, delta: dict[str, Any]) -> dict:
    node_ids = {n["id"] for n in graph["nodes"]}
    edge_ids = {e["id"] for e in graph["edges"]}
    nodes = list(graph["nodes"])
    edges = list(graph["edges"])

    for raw in delta.get("nodes") or []:
        if not is_valid_node_label(raw.get("label", "")):
            continue
        node_id = raw.get("id") or _unique_id(slugify(raw["label"]), node_ids)
        node = {"id": node_id, "label": raw["label"].strip(), "type": raw.get("type", "concept")}
        idx = next((i for i, n in enumerate(nodes) if n["id"] == node_id), -1)
        if idx >= 0:
            nodes[idx] = node
        else:
            nodes.append(node)

    for raw in delta.get("edges") or []:
        source = _find_node_id(nodes, raw["source"], node_ids)
        target = _find_node_id(nodes, raw["target"], node_ids)
        if not source or not target:
            continue
        src_node = next((n for n in nodes if n["id"] == source), None)
        tgt_node = next((n for n in nodes if n["id"] == target), None)
        label = raw.get("label") or f"{src_node['label'] if src_node else source} → {tgt_node['label'] if tgt_node else target}"
        edge_id = raw.get("id") or _unique_id(f"{source}_to_{target}", edge_ids)
        idx = next((i for i, e in enumerate(edges) if e["id"] == edge_id), -1)
        weight = None if raw.get("weight") is None else clamp_weight(float(raw["weight"]))
        expected_sign = -1 if raw.get("expected_sign") == -1 else 1
        edge = {
            "id": edge_id,
            "source": source,
            "target": target,
            "label": label,
            "weight": weight,
            "expectedSign": expected_sign,
        }
        if idx >= 0:
            prev = edges[idx]
            edges[idx] = {
                **prev,
                **edge,
                "weight": edge["weight"] if edge["weight"] is not None else prev.get("weight"),
                "expectedSign": edge["expectedSign"] if edge.get("expectedSign") else prev.get("expectedSign", 1),
            }
        else:
            edges.append(edge)

    for update in delta.get("weight_updates") or []:
        edge_id = update.get("edge_id", "")
        idx = next((i for i, e in enumerate(edges) if e["id"] == edge_id), -1)
        if idx < 0:
            idx = next(
                (
                    i
                    for i, e in enumerate(edges)
                    if e["id"] == edge_id or f"{e['source']}_to_{e['target']}" == edge_id
                ),
                -1,
            )
        if idx >= 0:
            edges[idx] = {**edges[idx], "weight": clamp_weight(float(update["weight"]))}

    return {"nodes": nodes, "edges": edges}


def supplement_graph_from_text(graph: dict, *texts: str) -> dict:
    combined = "\n".join(t for t in texts if t)
    if not combined.strip():
        return graph
    relations = extract_quoted_relations(combined)
    if not relations:
        return graph
    return apply_llm_delta(
        graph,
        {
            "assistant_message": "",
            "edges": [
                {
                    "id": f"{slugify(r['sourceLabel'])}_to_{slugify(r['targetLabel'])}",
                    "source": slugify(r["sourceLabel"]),
                    "target": slugify(r["targetLabel"]),
                    "label": f"{r['sourceLabel']} → {r['targetLabel']}",
                    "weight": None,
                    "expected_sign": _infer_expected_sign(combined, r["targetLabel"]),
                }
                for r in relations
            ],
        },
    )


def supplement_graph_from_prose(graph: dict, text: str) -> dict:
    if not text.strip():
        return graph
    matched = [(p, label, typ) for p, label, typ in PROSE_ENTITY_HINTS if p.search(text)]
    if not matched:
        return graph

    next_graph = apply_llm_delta(
        graph,
        {
            "assistant_message": "",
            "nodes": [{"id": slugify(label), "label": label, "type": typ} for _, label, typ in matched],
        },
    )
    labels = {label for _, label, _ in matched}
    lower = text.lower()

    if "Oil Price" in labels and "Electric Vehicle Usage" in labels:
        next_graph = apply_llm_delta(
            next_graph,
            {
                "assistant_message": "",
                "edges": [
                    {
                        "id": "oil_price_to_electric_vehicle_usage",
                        "source": "oil_price",
                        "target": "electric_vehicle_usage",
                        "label": "Oil Price → Electric Vehicle Usage",
                        "weight": None,
                        "expected_sign": 1,
                    }
                ],
            },
        )

    if "Elon Musk Tweets" in labels and "Crypto Coins Value" in labels:
        next_graph = apply_llm_delta(
            next_graph,
            {
                "assistant_message": "",
                "edges": [
                    {
                        "id": "elon_musk_tweets_to_crypto_coins_value",
                        "source": "elon_musk_tweets",
                        "target": "crypto_coins_value",
                        "label": "Elon Musk Tweets → Crypto Coins Value",
                        "weight": None,
                        "expected_sign": 1,
                    }
                ],
            },
        )

    if "Electric Vehicle Usage" in labels and "Elon Musk" in labels:
        next_graph = apply_llm_delta(
            next_graph,
            {
                "assistant_message": "",
                "edges": [
                    {
                        "id": "electric_vehicle_usage_to_elon_musk",
                        "source": "electric_vehicle_usage",
                        "target": "elon_musk",
                        "label": "Electric Vehicle Usage → Elon Musk",
                        "weight": None,
                        "expected_sign": 1,
                    }
                ],
            },
        )

    return next_graph


def sanitize_graph(graph: dict) -> dict:
    connected: set[str] = set()
    for edge in graph["edges"]:
        connected.add(edge["source"])
        connected.add(edge["target"])

    nodes = [
        n
        for n in graph["nodes"]
        if is_valid_node_label(n["label"]) or n["id"] in connected
    ]
    node_ids = {n["id"] for n in nodes}
    edges = [e for e in graph["edges"] if e["source"] in node_ids and e["target"] in node_ids]
    return {"nodes": nodes, "edges": edges}


def _extract_weight_values(user_text: str) -> list[float]:
    from app.agentic.weight import parse_weight_input

    return [
        w
        for line in re.split(r"\n+", user_text)
        if (w := parse_weight_input(line.strip())) is not None
    ]


def apply_weights_from_quoted_context(graph: dict, context_text: str, user_text: str) -> dict:
    relations = extract_quoted_relations(context_text)
    weights = _extract_weight_values(user_text)
    if not relations or not weights:
        return graph

    updates: list[dict] = []
    weight_idx = 0
    for rel in relations:
        if weight_idx >= len(weights):
            break
        edge_id = _find_edge_id_by_labels(graph, rel["sourceLabel"], rel["targetLabel"])
        if not edge_id:
            graph = supplement_graph_from_text(graph, context_text)
            edge_id = _find_edge_id_by_labels(graph, rel["sourceLabel"], rel["targetLabel"])
        if not edge_id:
            continue
        existing = next((e for e in graph["edges"] if e["id"] == edge_id), None)
        if existing and existing.get("weight") is not None:
            continue
        updates.append({"edge_id": edge_id, "weight": weights[weight_idx]})
        weight_idx += 1

    if not updates:
        return graph
    return apply_llm_delta(graph, {"assistant_message": "", "weight_updates": updates})


def apply_weights_from_recent_assistant_messages(
    graph: dict,
    messages: list[dict[str, str]],
    user_text: str,
) -> dict:
    if not _extract_weight_values(user_text):
        return graph
    assistants = [m for m in messages if m.get("role") == "assistant"][-3:]
    next_graph = graph
    for msg in assistants:
        next_graph = apply_weights_from_quoted_context(next_graph, msg.get("content", ""), user_text)
    return next_graph


def pending_weight_questions(graph: dict) -> list[dict]:
    label_by_id = {n["id"]: n["label"] for n in graph["nodes"]}
    pending = []
    for edge in graph["edges"]:
        if edge.get("weight") is not None:
            continue
        source_label = label_by_id.get(edge["source"], edge["source"])
        target_label = label_by_id.get(edge["target"], edge["target"])
        expected_sign = edge.get("expectedSign", 1)
        pending.append(
            {
                "edgeId": edge["id"],
                "sourceLabel": source_label,
                "targetLabel": target_label,
                "expectedSign": expected_sign,
                "question": "",
            }
        )
    return pending


def graph_is_complete(graph: dict) -> bool:
    return bool(graph["edges"]) and all(e.get("weight") is not None for e in graph["edges"])


def graph_summary(graph: dict) -> str:
    if not graph["nodes"] and not graph["edges"]:
        return "Empty — no nodes or edges yet."

    node_lines = [f'  - {n["id"]}: "{n["label"]}" ({n["type"]})' for n in graph["nodes"]]
    edge_lines = []
    for edge in graph["edges"]:
        w = format_weight_short(edge.get("weight"))
        direction = "inverse" if edge.get("expectedSign") == -1 else "direct"
        edge_lines.append(
            f'  - {edge["id"]}: {edge["source"]} → {edge["target"]} "{edge["label"]}" [{direction}, weight={w}]'
        )

    return "\n".join(
        [
            f"Nodes ({len(graph['nodes'])}):",
            *node_lines,
            f"Edges ({len(graph['edges'])}):",
            *(edge_lines or ["  (none)"]),
        ]
    )
