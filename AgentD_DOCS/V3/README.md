# AgentD V3 — Agent D

> Documentación de lo **realmente implementado** en la V3. No describe funcionalidades futuras.

AgentD V3 es un segundo front end, independiente de la versión clásica, sobre el mismo backend. Concepto: **Playful Premium Fintech**. La interfaz es sobria y de confianza; **Agent D**, la mascota del pack `AgentD_V3_HQ_Animaciones`, representa visualmente el trabajo del agente comprador y reacciona a los eventos **reales** de la negociación.

Principio de producto (sin cambios): *Your AI agent negotiates. You decide.*
Regla de oro de la V3: **libertad creativa en la presentación, ninguna sobre la verdad de las operaciones.**

## Rutas

| Ruta | Pantalla |
|---|---|
| `/v3` | Landing: hero con escena animada, 4 pasos, demo interactiva pregrabada, aprobación humana, PayPal Sandbox, transparencia |
| `/v3/brief` | «Tell Agent D»: brief conversacional con tarjeta de misión editable |
| `/v3/negotiation/[id]` | Negociación como escenario: tiendas, Agent D que se desplaza y reacciona, actividad, log persistido |
| `/v3/deals/[id]` | Revisión: «Agent D found your best deal», comparativa, aprobación explícita |
| `/v3/checkout/[id]` | Pago PayPal Sandbox con Agent D discreto; celebra solo un pago verificado |

La versión clásica sigue en `/`, `/negotiation/[id]`, `/deals/[id]`, `/checkout/[id]` (sin cambios de comportamiento). Navegar entre una y otra es una carga de página completa (son dos layouts raíz distintos). Enlaces cruzados: pie de V3 («Classic version») y CTA final de la landing.

## Cómo ejecutarla

```bash
npm install
npm run dev          # http://localhost:3000/v3
# o, versión de producción:
npm run build && npm start   # http://localhost:3000/v3
```

Las variables de entorno son las de siempre (`.env.example`); la V3 no añade ninguna. Si ya tenías un `next dev` abierto **antes** de esta reestructuración, reinícialo (ver *Estructura* en `IMPLEMENTATION.md`).

El motor lo decide el servidor, no la V3:
- por defecto corre el motor determinista V0 (la pantalla es un **replay** de eventos ya validados);
- con `MULTI_AGENT_NEGOTIATION=true` y clave de Gemini, corre el multiagente real y la pantalla muestra los eventos **a medida que se persisten** (polling de 1 s).

La landing y el brief consultan `/api/config` para describir el motor real; mientras no hay respuesta asumen el modo seguro (simulación por reglas).

## Assets de Agent D

El pack original se queda intacto en `AgentD_V3_HQ_Animaciones/`. La web usa una copia optimizada en `public/agent-d/v3/` (hojas de sprites y poses en WebP, sin redibujar ni redimensionar ningún fotograma) generada con:

```bash
node scripts/v3-prepare-agent-d.mjs [ruta-al-pack]   # por defecto ./AgentD_V3_HQ_Animaciones
```

Si el pack no está en el repo, el script falla con un mensaje que indica dónde descomprimir `AgentD_V3_HQ_Animaciones.zip`. Más detalle en `MOTION_AND_MASCOT.md`.

## Índice de esta carpeta

- `DESIGN_SYSTEM.md` — tokens, tipografía, contrastes, componentes.
- `UX_FLOWS.md` — pantallas, estados, responsive y accesibilidad.
- `MOTION_AND_MASCOT.md` — sistema de movimiento y motor de animación de Agent D.
- `EVENT_ANIMATION_MAPPING.md` — mapeo evento → animación/indicador/texto, con las reglas de honestidad.
- `IMPLEMENTATION.md` — arquitectura, archivos, pruebas, resultados y limitaciones.
