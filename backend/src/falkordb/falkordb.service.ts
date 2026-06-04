import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/** Official FalkorDB Node client (npm: `falkordb`; same API as @falkordb/falkordb). */

import { FalkorDB } from 'falkordb';

import type { DecisionEvent } from '../schemas/decision.schema';

import { escapeCypher, graphName, normalizeDecision } from '../lib/normalize';

import { executeCypherDelta } from './cypher-delta';
import { parseFalkorRows, rowString } from './falkordb-rows';
import { computeGraphDelta, snapshotFromRows } from './graph-delta';



@Injectable()

export class FalkorDbService implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(FalkorDbService.name);

  private client!: Awaited<ReturnType<typeof FalkorDB.connect>>;



  async onModuleInit() {

    const host = process.env.FALKORDB_HOST ?? 'localhost';

    const port = Number(process.env.FALKORDB_PORT ?? 6380);

    this.client = await FalkorDB.connect({ socket: { host, port } });

    this.logger.log(`Connected to FalkorDB at ${host}:${port}`);

  }



  async onModuleDestroy() {

    await this.client?.close();

  }



  /** MERGE CoT delta — two-layer Cypher (nodes, then edges) per trade payload. */

  async mergeCotDelta(raw: DecisionEvent) {

    const data = normalizeDecision(raw);

    const graphKey = graphName(data.graph_id);

    const graph = this.client.selectGraph(graphKey);

    const snapshotRows = await this.getGraphSnapshot(data.graph_id, 10_000);

    const snapshot = snapshotFromRows(snapshotRows.nodes, snapshotRows.edges);

    const delta = computeGraphDelta(snapshot, data);

    const payload: DecisionEvent = { ...data, nodes: delta.nodes };

    if (delta.nodes.length === 0 && delta.edgeOps.length === 0) {
      return {
        graph: graphKey,
        nodes: 0,
        edges: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        nodesSkipped: delta.stats.nodesSkipped,
        edgeOpsSkipped: delta.stats.edgeOpsSkipped,
      };
    }

    const result = await executeCypherDelta(
      (cypher, options) => graph.query(cypher, options),
      payload,
      {
        edgeOps: delta.edgeOps,
        nodesSkipped: delta.stats.nodesSkipped,
        edgeOpsSkipped: delta.stats.edgeOpsSkipped,
      },
    );

    return { graph: graphKey, ...result };

  }



  /** @deprecated Use mergeCotDelta */

  async ingestDecision(raw: DecisionEvent) {

    return this.mergeCotDelta(raw);

  }



  /**

   * Structural + graph Cypher checks before seeker MERGE (isolated seeker graph).

   */

  async verifyCotDelta(graphId: string, payload: DecisionEvent) {

    const nodeIds = new Set(payload.nodes.map((n) => n.node_id));

    for (const edge of payload.edges) {

      if (!nodeIds.has(edge.source)) {

        return { verified: false, reason: 'orphan_edge_source', graph_id: graphId };

      }

      const targets = edge.target ? [edge.target] : [...(edge.targets ?? [])];

      for (const t of targets) {

        if (!nodeIds.has(t)) {

          return { verified: false, reason: 'orphan_edge_target', graph_id: graphId };

        }

      }

    }



    const graphKey = graphName(graphId);

    const graph = this.client.selectGraph(graphKey);

    const ids = payload.nodes.map((n) => `'${escapeCypher(n.node_id)}'`).join(', ');

    const countResult = await graph.query(

      `MATCH (n) WHERE n.node_id IN [${ids}] RETURN count(n) AS matched`,

    );

    const row = countResult.data?.[0];

    const matched = Number(

      Array.isArray(row) ? row[0] : (row as { matched?: number } | undefined)?.matched ?? 0,

    );



    return {

      verified: true,

      graph_id: graphId,

      expected_nodes: payload.nodes.length,

      matched_nodes: matched,

      structural_ok: true,

    };

  }



  async getGraphSnapshot(graphId: string, limit = 500) {

    const graph = this.client.selectGraph(graphName(graphId));

    const nodesResult = await graph.query(

      `MATCH (n) WHERE n.node_id IS NOT NULL ` +

        `RETURN n.node_id AS id, coalesce(n.node_type, toLower(labels(n)[0])) AS type LIMIT ${limit}`,

    );

    const edgesResult = await graph.query(

      `MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND b.node_id IS NOT NULL ` +

        `RETURN a.node_id AS source, b.node_id AS target, type(r) AS type LIMIT ${limit}`,

    );



    return {

      graph_id: graphId,

      nodes: parseFalkorRows(nodesResult).map((row) => ({

        id: rowString(row, 'id', 'n.node_id'),

        type: rowString(row, 'type') || 'Entity',

      })),

      edges: parseFalkorRows(edgesResult).map((row) => ({

        source: rowString(row, 'source', 'a.node_id'),

        target: rowString(row, 'target', 'b.node_id'),

        type: rowString(row, 'type', 'type(r)') || 'REL',

      })),

    };

  }



  async listGraphs() {

    return this.client.list();

  }

}

