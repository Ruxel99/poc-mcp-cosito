const express = require("express");
const { randomUUID } = require("crypto");

const app = express();
app.use(express.json());

// ─── In-memory data ────────────────────────────────────────────────────────
const data = require("../data/bombas.json");

// ─── MCP Tool definitions ───────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_pump_routes",
    description:
      "Returns all pump inspection routes for Panasa Molino 2. Use this to list available inspection records, filter by date or shift (turno), and check overall route status.",
    inputSchema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Filter by date (YYYY-MM-DD). Optional." },
        turno: { type: "string", description: "Filter by shift: Mañana | Tarde. Optional." }
      },
      required: []
    }
  },
  {
    name: "get_route_detail",
    description:
      "Returns full inspection detail for a specific route including all pump readings, parameter status (OK / ALERTA / FALLA), and operator observations.",
    inputSchema: {
      type: "object",
      properties: {
        route_id: { type: "string", description: "Route ID, e.g. RUTA-BOM-M2-001" }
      },
      required: ["route_id"]
    }
  },
  {
    name: "get_failures_summary",
    description:
      "Returns a summary of all pumps with ALERTA or FALLA status across all routes. Useful for maintenance prioritization and quick anomaly detection.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// ─── Tool execution ─────────────────────────────────────────────────────────
function executeTool(name, args) {
  if (name === "get_pump_routes") {
    let routes = data.routes;
    if (args.fecha) routes = routes.filter(r => r.fecha === args.fecha);
    if (args.turno) routes = routes.filter(r => r.turno === args.turno);
    return routes.map(r => ({
      id: r.id,
      molino: r.molino,
      turno: r.turno,
      operario: r.operario,
      fecha: r.fecha,
      estado: r.estado,
      total_bombas: r.bombas.length,
      alertas: r.bombas.flatMap(b => b.inspecciones).filter(i => i.estado === "ALERTA").length,
      fallas: r.bombas.flatMap(b => b.inspecciones).filter(i => i.estado === "FALLA").length
    }));
  }

  if (name === "get_route_detail") {
    const route = data.routes.find(r => r.id === args.route_id);
    if (!route) return { error: `Route ${args.route_id} not found` };
    return route;
  }

  if (name === "get_failures_summary") {
    const failures = [];
    for (const route of data.routes) {
      for (const bomba of route.bombas) {
        const problemas = bomba.inspecciones.filter(i => i.estado !== "OK");
        if (problemas.length > 0) {
          failures.push({
            route_id: route.id,
            fecha: route.fecha,
            turno: route.turno,
            operario: route.operario,
            bomba_tag: bomba.tag,
            bomba_descripcion: bomba.descripcion,
            problemas: problemas,
            observaciones: bomba.observaciones
          });
        }
      }
    }
    return { total_anomalias: failures.length, detalle: failures };
  }

  return { error: `Unknown tool: ${name}` };
}

// ─── MCP Streamable HTTP endpoint ───────────────────────────────────────────
// Joule Studio requires streamable HTTP transport on a single endpoint

const sessions = {};

app.post("/mcp", (req, res) => {
  const sessionId = req.headers["mcp-session-id"] || randomUUID();
  res.setHeader("mcp-session-id", sessionId);
  res.setHeader("Content-Type", "application/json");

  const body = req.body;

  // Initialize / ping
  if (body.method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "panasa-mcp", version: "1.0.0" }
      }
    });
  }

  if (body.method === "notifications/initialized") {
    return res.status(204).end();
  }

  // List tools
  if (body.method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: TOOLS }
    });
  }

  // Call tool
  if (body.method === "tools/call") {
    const { name, arguments: args } = body.params;
    const result = executeTool(name, args || {});
    return res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      }
    });
  }

  return res.status(400).json({
    jsonrpc: "2.0",
    id: body.id,
    error: { code: -32601, message: "Method not found" }
  });
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "panasa-mcp" }));

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panasa MCP server running on port ${PORT}`));
