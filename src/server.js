const express = require("express");
const { randomUUID } = require("crypto");

const app = express();
app.use(express.json());

const data = require("../data/bombas.json");

const TOOLS = [
  {
    name: "get_pump_routes",
    description:
      "Returns all pump inspection routes for Panasa Molino 2. Use this to list available inspection records, filter by date or shift (turno), and check overall route status.",
    inputSchema: {
      type: "object",
      properties: {
        fecha: {
          type: "string",
          description: "Filter by date (YYYY-MM-DD). Optional."
        },
        turno: {
          type: "string",
          description: "Filter by shift: Manana | Tarde. Optional."
        }
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
        route_id: {
          type: "string",
          description: "Route ID, e.g. RUTA-BOM-M2-001"
        }
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

function summarizeRoute(route) {
  return {
    id: route.id,
    nombre: route.nombre,
    molino: route.molino,
    turno: route.turno,
    operario: route.operario,
    fecha: route.fecha,
    estado: route.estado,
    total_bombas: route.bombas.length,
    alertas: route.bombas
      .flatMap((bomba) => bomba.inspecciones)
      .filter((inspeccion) => inspeccion.estado === "ALERTA").length,
    fallas: route.bombas
      .flatMap((bomba) => bomba.inspecciones)
      .filter((inspeccion) => inspeccion.estado === "FALLA").length
  };
}

function getFilteredRoutes(filters = {}) {
  let routes = data.routes;

  if (filters.fecha) {
    routes = routes.filter((route) => route.fecha === filters.fecha);
  }

  if (filters.turno) {
    routes = routes.filter((route) => route.turno === filters.turno);
  }

  return routes;
}

function getFailuresSummary() {
  const failures = [];

  for (const route of data.routes) {
    for (const bomba of route.bombas) {
      const problemas = bomba.inspecciones.filter(
        (inspeccion) => inspeccion.estado !== "OK"
      );

      if (problemas.length > 0) {
        failures.push({
          route_id: route.id,
          fecha: route.fecha,
          turno: route.turno,
          operario: route.operario,
          bomba_tag: bomba.tag,
          bomba_descripcion: bomba.descripcion,
          problemas,
          observaciones: bomba.observaciones
        });
      }
    }
  }

  return {
    total_anomalias: failures.length,
    detalle: failures
  };
}

function executeTool(name, args) {
  if (name === "get_pump_routes") {
    return getFilteredRoutes(args).map(summarizeRoute);
  }

  if (name === "get_route_detail") {
    const route = data.routes.find((item) => item.id === args.route_id);

    if (!route) {
      return { error: `Route ${args.route_id} not found` };
    }

    return route;
  }

  if (name === "get_failures_summary") {
    return getFailuresSummary();
  }

  return { error: `Unknown tool: ${name}` };
}

app.get("/", (req, res) => {
  res.json({
    service: "panasa-mcp",
    status: "ok",
    endpoints: {
      health: "/health",
      mcp: "/mcp",
      routes: "/routes",
      route_detail: "/routes/:route_id",
      failures: "/failures"
    }
  });
});

app.get("/routes", (req, res) => {
  const routes = getFilteredRoutes(req.query).map(summarizeRoute);
  res.json(routes);
});

app.get("/routes/:route_id", (req, res) => {
  const route = data.routes.find((item) => item.id === req.params.route_id);

  if (!route) {
    return res.status(404).json({
      error: `Route ${req.params.route_id} not found`
    });
  }

  return res.json(route);
});

app.get("/failures", (req, res) => {
  res.json(getFailuresSummary());
});

app.post("/mcp", (req, res) => {
  const sessionId = req.headers["mcp-session-id"] || randomUUID();
  res.setHeader("mcp-session-id", sessionId);
  res.setHeader("Content-Type", "application/json");

  const body = req.body;

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

  if (body.method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools: TOOLS }
    });
  }

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

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "panasa-mcp" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Panasa MCP + REST server running on port ${PORT}`);
});
