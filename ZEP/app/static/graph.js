// ─── colour maps ──────────────────────────────────────────────────────────────

const NODE_COLORS = {
  User:       "#4fe0a0",
  Thing:      "#6eb5ff",
  Influencer: "#e0a04f",
  Event:      "#c49bff",
  Company:    "#5fd4d4",
  Preference: "#8a8f96",
  Location:   "#ff8fa3",
  Topic:      "#b8d4a8",
  Organization: "#ffb347",
  Entity:     "#8a8f96",
};

const EDGE_COLORS = {
  INFLUENCES:          "#e0a04f",
  INTERESTED:          "#4fe0a0",
  CO_RELATES:          "#6eb5ff",
  CORRELATES:          "#6eb5ff",
  HIGHLY_INFLUENCED_BY:"#ff8fa3",
  INFLUENCED_BY:       "#ffb347",
  TRADES_IN:           "#c49bff",
  TRACKS:              "#5fd4d4",
};

function labelColor(label) {
  return NODE_COLORS[label] || NODE_COLORS.Entity;
}

function edgeColor(name) {
  return EDGE_COLORS[name] || "#555b64";
}

// ─── state ────────────────────────────────────────────────────────────────────

let graphState = { nodes: [], edges: [], simNodes: [] };
let positionCache = {};           // id → {x, y}  — survive refreshes

let canvas = null;
let ctx    = null;
let wrap   = null;
let metaEl = null;
let legendEl = null;
let detailPanel = null;
let detailContent = null;

let animationId   = null;
let hoveredNode   = null;
let hoveredEdge   = null;
let draggingNode  = null;
let selectedNode  = null;
let selectedEdge  = null;
let dragMoved     = false;      // distinguish click vs drag

// ─── init ─────────────────────────────────────────────────────────────────────

function initGraphView() {
  canvas       = document.getElementById("graph-canvas");
  wrap         = document.getElementById("graph-canvas-wrap");
  metaEl       = document.getElementById("graph-meta");
  legendEl     = document.getElementById("graph-legend");
  detailPanel  = document.getElementById("detail-panel");
  detailContent= document.getElementById("detail-panel-content");

  const closeBtn = document.getElementById("detail-panel-close");
  if (closeBtn) closeBtn.addEventListener("click", closeDetailPanel);

  if (!canvas || !wrap) return;
  ctx = canvas.getContext("2d");

  window.addEventListener("resize", resizeCanvas);
  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mouseleave", onPointerLeave);
  canvas.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mouseup",   onPointerUp);
  canvas.addEventListener("click",     onCanvasClick);

  resizeCanvas();
}

function resizeCanvas() {
  if (!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width  = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGraph();
}

// ─── layout toggle ────────────────────────────────────────────────────────────

function setSplitLayout(enabled) {
  const shell     = document.getElementById("shell");
  const graphPane = document.getElementById("graph-pane");
  if (!shell || !graphPane) return;
  shell.classList.toggle("shell--split", enabled);
  graphPane.hidden = !enabled;
  if (enabled) { resizeCanvas(); startSimulation(); }
  else         { stopSimulation(); }
}

// ─── legend ───────────────────────────────────────────────────────────────────

function updateLegend(labels) {
  if (!legendEl) return;
  legendEl.innerHTML = "";
  labels.forEach((label) => {
    const item = document.createElement("span");
    item.className = "graph-legend__item";
    item.innerHTML = `<span class="graph-legend__dot" style="background:${labelColor(label)}"></span>${label}`;
    legendEl.appendChild(item);
  });
}

// ─── positions ────────────────────────────────────────────────────────────────

function seedPositions(nodes, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const r  = Math.min(width, height) * 0.32;
  return nodes.map((node, i) => {
    const cached = positionCache[node.id];
    const angle  = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    return {
      ...node,
      x:  cached ? cached.x : cx + Math.cos(angle) * r,
      y:  cached ? cached.y : cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });
}

function savePositions() {
  graphState.simNodes.forEach((n) => {
    positionCache[n.id] = { x: n.x, y: n.y };
  });
}

// ─── simulation ───────────────────────────────────────────────────────────────

function startSimulation() {
  stopSimulation();
  if (!graphState.simNodes.length) return;
  const tick = () => {
    runSimulationStep();
    drawGraph();
    animationId = requestAnimationFrame(tick);
  };
  animationId = requestAnimationFrame(tick);
}

function stopSimulation() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
}

function runSimulationStep() {
  const nodes = graphState.simNodes;
  const edges = graphState.edges;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const cx = W / 2, cy = H / 2;

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 1;
      const f = 5200 / (dist * dist);
      a.vx += (dx / dist) * f; a.vy += (dy / dist) * f;
      b.vx -= (dx / dist) * f; b.vy -= (dy / dist) * f;
    }
  }

  // Attraction along edges
  edges.forEach((edge) => {
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    if (!src || !tgt) return;
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;
    const f = (dist - 120) * 0.02;
    src.vx += (dx / dist) * f; src.vy += (dy / dist) * f;
    tgt.vx -= (dx / dist) * f; tgt.vy -= (dy / dist) * f;
  });

  // Gravity + damping
  nodes.forEach((n) => {
    if (n === draggingNode) return;
    n.vx += (cx - n.x) * 0.002;
    n.vy += (cy - n.y) * 0.002;
    n.vx *= 0.86; n.vy *= 0.86;
    n.x += n.vx;  n.y += n.vy;
    n.x = Math.max(44, Math.min(W - 44, n.x));
    n.y = Math.max(44, Math.min(H - 44, n.y));
  });
}

// ─── drawing ──────────────────────────────────────────────────────────────────

function drawGraph() {
  if (!ctx || !canvas) return;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);

  // Edges
  graphState.edges.forEach((edge) => {
    const src = graphState.simNodes.find((n) => n.id === edge.source);
    const tgt = graphState.simNodes.find((n) => n.id === edge.target);
    if (!src || !tgt) return;

    const isSelected = edge === selectedEdge;
    const isHovered  = edge === hoveredEdge;

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = edgeColor(edge.name);
    ctx.globalAlpha = isSelected ? 1 : isHovered ? 0.85 : 0.5;
    ctx.lineWidth   = isSelected ? 2.5 : isHovered ? 2 : 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Edge label at midpoint
    const mx = (src.x + tgt.x) / 2;
    const my = (src.y + tgt.y) / 2;
    const label = truncate(edge.name.replace(/_/g, " "), 16);
    ctx.font = "9px JetBrains Mono, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Small background pill
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(11,13,15,0.75)";
    ctx.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 14);

    ctx.fillStyle = isSelected || isHovered ? edgeColor(edge.name) : "#8a8f96";
    ctx.fillText(label, mx, my);
    ctx.textBaseline = "alphabetic";
  });

  // Nodes
  graphState.simNodes.forEach((node) => {
    const isSelected = node === selectedNode;
    const isHovered  = node === hoveredNode;
    const radius = isSelected ? 12 : isHovered ? 10 : 8;
    const color  = labelColor(node.label);

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = color + "33";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.font = "11px JetBrains Mono, Menlo, Consolas, monospace";
    ctx.fillStyle = isSelected ? "#ffffff" : "#edeae2";
    ctx.textAlign = "center";
    ctx.fillText(truncate(node.name, 18), node.x, node.y + 22);
  });
}

// ─── hit testing ─────────────────────────────────────────────────────────────

function nodeAt(x, y) {
  return graphState.simNodes.find((n) => Math.hypot(n.x - x, n.y - y) <= 12) || null;
}

function edgeAt(x, y) {
  const THRESH = 10;
  for (const edge of graphState.edges) {
    const src = graphState.simNodes.find((n) => n.id === edge.source);
    const tgt = graphState.simNodes.find((n) => n.id === edge.target);
    if (!src || !tgt) continue;
    const dist = pointToSegmentDist(x, y, src.x, src.y, tgt.x, tgt.y);
    if (dist < THRESH) return edge;
  }
  return null;
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ─── pointer events ───────────────────────────────────────────────────────────

function canvasXY(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onPointerMove(event) {
  const { x, y } = canvasXY(event);

  if (draggingNode) {
    dragMoved = true;
    draggingNode.x = x;
    draggingNode.y = y;
    draggingNode.vx = 0;
    draggingNode.vy = 0;
    drawGraph();
    return;
  }

  hoveredNode = nodeAt(x, y);
  hoveredEdge = hoveredNode ? null : edgeAt(x, y);
  canvas.style.cursor = (hoveredNode || hoveredEdge) ? "pointer" : "grab";
  drawGraph();
}

function onPointerLeave() {
  hoveredNode = null;
  hoveredEdge = null;
  canvas.style.cursor = "grab";
  drawGraph();
}

function onPointerDown(event) {
  const { x, y } = canvasXY(event);
  dragMoved    = false;
  draggingNode = nodeAt(x, y);
}

function onPointerUp() {
  draggingNode = null;
  if (!dragMoved) savePositions();
}

function onCanvasClick(event) {
  if (dragMoved) return;            // was a drag, not a click
  const { x, y } = canvasXY(event);

  const node = nodeAt(x, y);
  if (node) { showNodeDetail(node); return; }

  const edge = edgeAt(x, y);
  if (edge) { showEdgeDetail(edge); return; }

  closeDetailPanel();
}

// ─── detail panel ─────────────────────────────────────────────────────────────

function closeDetailPanel() {
  selectedNode = null;
  selectedEdge = null;
  if (detailPanel) detailPanel.hidden = true;
  drawGraph();
}

function showNodeDetail(node) {
  selectedNode = node;
  selectedEdge = null;
  drawGraph();

  if (!detailPanel || !detailContent) return;

  const color = labelColor(node.label);
  const edges = graphState.edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );

  // Build properties rows (skip nullish)
  const attrs = { ...node.attributes };
  const propsHtml = Object.entries(attrs)
    .filter(([, v]) => v != null && v !== "None" && v !== "")
    .map(([k, v]) => `
      <div class="dp-prop-row">
        <span class="dp-prop-key">${esc(k)}</span>
        <span class="dp-prop-val">${esc(String(v))}</span>
      </div>`)
    .join("");

  // Build edge items
  const edgesHtml = edges.length
    ? edges.map((e) => {
        const other = e.source === node.id
          ? graphState.simNodes.find((n) => n.id === e.target)
          : graphState.simNodes.find((n) => n.id === e.source);
        const otherName = other ? other.name : "…";
        const arrow = e.source === node.id
          ? `${esc(node.name)} → ${esc(otherName)}`
          : `${esc(otherName)} → ${esc(node.name)}`;
        return `
          <div class="dp-edge-item" data-edge-id="${esc(e.id)}">
            <div class="dp-edge-name">${esc(e.name)}</div>
            <div style="font-size:10px;color:var(--text-dim);margin-bottom:3px">${arrow}</div>
            <div class="dp-edge-fact">${esc(truncate(e.fact, 120))}</div>
          </div>`;
      }).join("")
    : `<p class="dp-summary" style="color:var(--text-dim);font-style:italic">No edges yet</p>`;

  detailContent.innerHTML = `
    <div class="dp-type-badge" style="background:${color}22;color:${color}">${esc(node.label)}</div>
    <p class="dp-name">${esc(node.name)}</p>
    <p class="dp-uuid">${esc(node.id)}</p>

    ${node.summary ? `
    <div class="dp-section">
      <p class="dp-section-title">Summary</p>
      <p class="dp-summary">${esc(node.summary)}</p>
    </div>` : ""}

    ${propsHtml ? `
    <div class="dp-section">
      <p class="dp-section-title">Properties</p>
      ${propsHtml}
    </div>` : ""}

    <div class="dp-section">
      <p class="dp-section-title">Relationships (${edges.length})</p>
      ${edgesHtml}
    </div>`;

  // Edge items in detail panel can be clicked to show edge detail
  detailContent.querySelectorAll(".dp-edge-item").forEach((el) => {
    el.addEventListener("click", () => {
      const edgeId = el.dataset.edgeId;
      const edge = graphState.edges.find((e) => e.id === edgeId);
      if (edge) showEdgeDetail(edge);
    });
  });

  detailPanel.hidden = false;
}

function showEdgeDetail(edge) {
  selectedEdge = edge;
  selectedNode = null;
  drawGraph();

  if (!detailPanel || !detailContent) return;

  const src = graphState.simNodes.find((n) => n.id === edge.source);
  const tgt = graphState.simNodes.find((n) => n.id === edge.target);
  const srcName = src ? src.name : edge.source.slice(0, 8) + "…";
  const tgtName = tgt ? tgt.name : edge.target.slice(0, 8) + "…";
  const color = edgeColor(edge.name);

  const attrsHtml = Object.entries(edge.attributes || {})
    .filter(([, v]) => v != null && v !== "None" && v !== "")
    .map(([k, v]) => `
      <div class="dp-prop-row">
        <span class="dp-prop-key">${esc(k)}</span>
        <span class="dp-prop-val">${esc(String(v))}</span>
      </div>`)
    .join("");

  detailContent.innerHTML = `
    <div class="dp-type-badge" style="background:${color}22;color:${color}">Relationship</div>
    <p class="dp-rel-label">${esc(edge.name)}</p>
    <div class="dp-arrow">${esc(srcName)} → ${esc(tgtName)}</div>

    ${edge.fact ? `
    <div class="dp-section">
      <p class="dp-section-title">Fact</p>
      <p class="dp-summary">${esc(edge.fact)}</p>
    </div>` : ""}

    ${attrsHtml ? `
    <div class="dp-section">
      <p class="dp-section-title">Attributes</p>
      ${attrsHtml}
    </div>` : ""}

    <div class="dp-section">
      <p class="dp-section-title">Endpoints</p>
      <div class="dp-prop-row">
        <span class="dp-prop-key">source</span>
        <span class="dp-prop-val">${esc(srcName)}</span>
      </div>
      <div class="dp-prop-row">
        <span class="dp-prop-key">target</span>
        <span class="dp-prop-val">${esc(tgtName)}</span>
      </div>
    </div>`;

  detailPanel.hidden = false;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ─── data ingestion ───────────────────────────────────────────────────────────

function renderGraphData(payload) {
  savePositions();                   // preserve before replacing simNodes

  graphState.nodes = payload.nodes || [];
  graphState.edges = payload.edges || [];

  if (metaEl) {
    metaEl.textContent = `${payload.node_count || 0} nodes · ${payload.edge_count || 0} edges`;
  }

  const labels = [...new Set(graphState.nodes.map((n) => n.label))].sort();
  updateLegend(labels);

  const W = canvas?.clientWidth  || 800;
  const H = canvas?.clientHeight || 600;
  graphState.simNodes = seedPositions(graphState.nodes, W, H);

  // Keep selected node/edge in sync after refresh
  if (selectedNode) {
    selectedNode = graphState.simNodes.find((n) => n.id === selectedNode.id) || null;
  }
  if (selectedEdge) {
    selectedEdge = graphState.edges.find((e) => e.id === selectedEdge.id) || null;
  }

  setSplitLayout(Boolean(payload.has_graph));
  drawGraph();
  if (payload.has_graph) startSimulation();
}

async function refreshGraph() {
  try {
    const response = await fetch("/api/graph");
    const data = await response.json();
    if (!response.ok && !data.nodes) return;
    renderGraphData(data);
  } catch {
    // Keep current layout if polling fails transiently.
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

window.GraphView = { init: initGraphView, refresh: refreshGraph, render: renderGraphData };

document.addEventListener("DOMContentLoaded", () => {
  initGraphView();
  if (document.body.dataset.configReady === "true") {
    refreshGraph();
    window.setInterval(refreshGraph, 20000);
  }
});
