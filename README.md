# Panasa MCP Server — PoC Joule + Cosito

## Qué hace
Expone datos simulados de inspección de bombas (Molino 2 - Panasa) como tools MCP
para consumo desde SAP Joule Studio.

## Tools disponibles
| Tool | Descripción |
|------|-------------|
| `get_pump_routes` | Lista rutas de inspección. Filtra por fecha o turno. |
| `get_route_detail` | Detalle completo de una ruta por ID. |
| `get_failures_summary` | Resumen de todas las alertas y fallas. |

---

## PASO A PASO COMPLETO

### Paso 1 — Instalar dependencias
```bash
npm install
```

### Paso 2 — Probar local
```bash
npm start
# Servidor en http://localhost:3000

# Test rápido:
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Paso 3 — Deploy en BTP Cloud Foundry

1. Instalar CF CLI: https://github.com/cloudfoundry/cli
2. Login:
```bash
cf login -a https://api.cf.us10.hana.ondemand.com
# (ajusta la región a la tuya)
```
3. Deploy:
```bash
cf push
```
4. Anotar la URL pública del app, ej:
   `https://panasa-mcp.cfapps.us10.hana.ondemand.com`

### Paso 4 — Registrar en BTP Cockpit como Destination

1. Ir a BTP Cockpit → Connectivity → Destinations → New Destination
2. Llenar:
   - **Name:** `PANASA_MCP`
   - **Type:** HTTP
   - **URL:** `https://panasa-mcp.cfapps.us10.hana.ondemand.com/mcp`
   - **Authentication:** NoAuthentication
3. Agregar Additional Property:
   - Key: `sap.mcp.enabled` | Value: `true`
4. Save

### Paso 5 — Crear Joule Agent en SAP Build

1. En SAP Build → Crear → Joule Agent and Skill
2. Nombre: `Panasa Pump Inspector`
3. Instructions (copiar exacto):
```
You are a maintenance assistant for Panasa, a paper manufacturer in Ecuador.
You have access to real-time pump inspection data from Molino 2.
When asked about pump status, inspections, alerts, or failures, always call the appropriate tool first.
Respond in Spanish. Be concise and highlight any ALERTA or FALLA status prominently.
```
4. En Tools → Add MCP Server → seleccionar destination `PANASA_MCP`
5. Los 3 tools aparecen automáticamente → activarlos todos
6. Save & Deploy

### Paso 6 — Probar queries en Joule

Queries de demo para el video:
- "¿Qué rutas de inspección se hicieron hoy?"
- "Dame el detalle de la ruta RUTA-BOM-M2-001"
- "¿Cuáles bombas tienen fallas o alertas?"
- "¿Qué observó Federico en el turno de mañana?"

---

## Alternativa Railway (si BTP tarda)

1. Ir a https://railway.app → New Project → Deploy from GitHub
2. Subir este repo
3. Railway auto-detecta Node.js y levanta el servidor
4. Copiar la URL pública generada
5. Usar esa URL en el Paso 4

---

## Datos simulados incluidos
- 2 rutas de inspección (21 y 20 de abril 2025)
- 4 bombas: P-201, P-202, P-203, P-204
- Parámetros: presión succión/descarga, temperatura rodamiento, vibración, amperaje
- P-202: temperatura rodamiento en FALLA (71°C)
- P-204: vibración en FALLA (5.1 mm/s)
