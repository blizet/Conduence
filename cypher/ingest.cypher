// Parameter: $payload — normalized decision event (bi-directional edges pre-expanded in Python)
// Requires: Neo4j 5.x + APOC

MERGE (g:GraphMetadata {graph_id: $payload.graph_id})
SET g.updated_at = $payload.updated_at,
    g.schema_version = coalesce($payload.schema_version, "1.0")

MERGE (d:Decision {decision_id: $payload.decision_id})
SET d.graph_id = $payload.graph_id,
    d.updated_at = $payload.updated_at,
    d.operation = coalesce($payload.operation, "assert"),
    d.schema_version = coalesce($payload.schema_version, "1.0"),
    d.provenance_json = apoc.convert.toJson(coalesce($payload.provenance, {}))
MERGE (d)-[:IN_GRAPH]->(g)

WITH g, d
UNWIND $payload.nodes AS nodeData
CALL apoc.merge.node(
  [nodeData.label],
  {node_id: nodeData.node_id},
  {
    node_type: nodeData.node_type,
    updated_at: $payload.updated_at,
    graph_id: $payload.graph_id
  },
  coalesce(nodeData.properties, {})
) YIELD node
SET node += coalesce(nodeData.properties, {})
MERGE (d)-[:TOUCHES]->(node)

WITH g, d, count(*) AS nodes_merged
UNWIND $payload.edges AS edgeData
WITH d, nodes_merged, edgeData,
     CASE
       WHEN edgeData.target IS NOT NULL THEN [edgeData.target]
       ELSE edgeData.targets
     END AS targetIds,
     coalesce(
       edgeData.relationship_type,
       edgeData.metadata.relationship_type,
       "CONNECTED_TO"
     ) AS relType
UNWIND targetIds AS targetId
MATCH (source {node_id: edgeData.source})
MATCH (target {node_id: targetId})
CALL apoc.merge.relationship(
  source,
  relType,
  {decision_id: $payload.decision_id},
  apoc.map.merge(coalesce(edgeData.metadata, {}), {relationship_type: relType}),
  target,
  {}
) YIELD rel AS forwardRel
SET forwardRel.relationship_type = relType,
    forwardRel.decision_id = $payload.decision_id

WITH d, nodes_merged, count(forwardRel) AS edges_merged
RETURN nodes_merged, edges_merged
