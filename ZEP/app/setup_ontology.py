"""
Pushes the entity + edge ontology defined in `app/ontology.py` to your Zep
project.

Run this once after cloning, and again any time you change ontology.py.
`client.graph.set_ontology(...)` REPLACES the project's whole ontology, so
this is always safe to re-run -- it's not additive.

Usage:
    python setup_ontology.py
"""
from __future__ import annotations

from zep_cloud.client import Zep

from config import load_settings
from ontology import EDGES, ENTITIES


def main() -> None:
    settings = load_settings()
    client = Zep(api_key=settings.zep_api_key)

    print(f"Pushing ontology: {len(ENTITIES)} entity type(s), {len(EDGES)} edge type(s)...")
    for name in ENTITIES:
        print(f"  entity: {name}")
    for name in EDGES:
        print(f"  edge:   {name}")

    client.graph.set_ontology(entities=ENTITIES, edges=EDGES)

    print("Ontology pushed successfully.")


if __name__ == "__main__":
    main()
