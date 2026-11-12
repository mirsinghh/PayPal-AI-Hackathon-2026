# AgentD — Estado actual del proyecto (documento de contexto para un modelo de IA)

**Fecha del snapshot:** 2026-11-12 · **Proyecto:** `paypal-AI-hackaton` · **Nombre de producto:** AgentD
**Tagline:** *Your AI agent negotiates. You decide.*
**Contexto:** MVP para el hackathon de PayPal con IA. Todo es una **demo**: tiendas ficticias, pagos solo en **PayPal Sandbox**.

> Cómo usar este documento: pégalo entero a otro modelo como contexto. Describe qué es el producto, cómo está construido, qué funciona hoy, qué es real vs. simulado, el diseño visual, los datos, las pruebas y lo que falta. Las rutas de archivo son relativas a la raíz del repo. No contiene secretos.

---

## 1. Resumen ejecutivo

AgentD es un flujo de compra asistido por IA. El usuario describe en lenguaje natural lo que quiere comprar y su presupuesto; un **agente comprador** negocia con **cuatro tiendas ficticias**; el usuario ve en directo cada mensaje y oferta sobre un mapa animado, revisa **una sola oferta recomendada**, la **aprueba explícitamente** y paga con **PayPal Sandbox**.

Principios de diseño del producto:

1. **La IA propone, el servidor valida, el humano decide.** Ningún precio generado por un modelo llega a pagarse sin validación server-side y aprobación humana explícita.
2. **La UI nunca muestra actividad que el backend no registró.** Mapa, tablero de precios, timeline y "deal slip" se derivan de eventos persistidos.
3. **Honestidad sobre la simulación.** Siempre se etiqueta qué es simulado, qué es IA real y qué es fallback por reglas.
4. **Dinero en céntimos enteros (EUR)**, nunca floats; el navegador jamás envía un importe a pagar.

## 2. Estado actual (resumen)

| Área | Estado |
|---|---|
| Flujo completo Brief → Negociación → Revisión → Pago | **Funcional de extremo a extremo** |
| Motor determinista (V0, reglas) | **Funcional, es el motor por defecto** |
| Negociación multi-agente real con Gemini (Fase 2) | **Implementada, detrás de flag** `MULTI_AGENT_NEGOTIATION=true` (desactivada por defecto; en `.env.local` actual no está activada) |
| Explicación IA de la oferta ganadora | Funcional con Gemini; fallback por reglas etiquetado si no hay clave/falla |
| PayPal Sandbox (crear/capturar orden, JS SDK v6 + Orders v2) | Funcional, con idempotencia y verificación de importe |
| Persistencia | JSON local (`.data/`) o Supabase (obligatorio en Vercel) |
| Tests | **108 tests pasando en 9 archivos** (vitest 5.1.0, ejecutado hoy) |
| Typecheck (`tsc --noEmit`) | Sin errores (ejecutado hoy) |
| Cuentas/usuarios, historial de pedidos, preferencias, voz | **No existen** (planificados, ver §13) |
| Control de versiones | El directorio **no es un repo git** |
| Despliegue en Vercel | Diseñado (Supabase requerido) pero no verificado en este snapshot |

## 3. Stack técnico

- **Next.js 16.4.6** (App Router, `cacheComponents: true`, `partialPrefetching: true`, Turbopack con loader de Tailwind), **React 19.3.0**, **TypeScript 5**.
- **Tailwind CSS 4.3.3** (tokens en `app/globals.css`), **Motion for React** (`motion` ^14.12) solo para el mapa de agentes; el resto es CSS.
- **Zod 4.6** para validación de entrada y salidas estructuradas de los modelos.
- **Vitest 5.1** (tests), ESLint 9.
- **Gemini** (Google) por REST sin SDK (`AI_MODEL` por defecto `gemini-3.5-flash`), clave en cabecera `x-goog-api-key`, nunca en URL.
- **PayPal**: REST Sandbox (`https://api-m.sandbox.paypal.com`) en servidor + JS SDK v6 (`https://www.sandbox.paypal.com/web-sdk/v6/core`) en cliente.
- **Supabase** (Postgres vía REST, service role) en producción; ficheros JSON en local.
- **Aviso importante (AGENTS.md):** este Next.js tiene cambios incompatibles con versiones conocidas; antes de escribir código hay que leer la guía en `node_modules/next/dist/docs/`.

Scripts: `npm run dev | build | start | lint | test | typecheck`. Config de preview: `.claude/launch.json` (`agentd-dev` → `npm run dev`, puerto 3000).

## 4. Flujo de usuario (4 pantallas)

| # | Ruta | Pantalla | Qué hace |
|---|---|---|---|
| 1 | `/` | **Brief / Discover** | El usuario escribe en lenguaje natural. `lib/request-parse.ts` extrae presupuesto (y la query) mientras escribe; "el brief se escribe solo". Campos: prompt, presupuesto, prioridad (`lowest_price`/`fast_delivery`/`best_value`), preferencias (`warranty`/`fast_delivery`/`free_shipping`). Ejemplos sugeridos solo de categorías que el catálogo sirve. Hero con `SampleStage` (animación de una negociación congelada y etiquetada "sample"). Consulta `/api/config` para saber si el modo es multi-agente. |
| 2 | `/negotiation/[id]` | **Negociación en vivo** | Mapa de agentes con arcos y marcadores de mensajes viajando, **price board** (concesión de cada tienda vs. presupuesto), **deal slip** que se rellena, **timeline** en lenguaje llano, detalle por tienda (`SellerDetail`). Fases: Understanding → Finding stores → Collecting offers → Negotiating → Evaluating → Complete. En V0 es un *replay* de eventos ya validados (velocidad 1x/2x/4x, pausa, replay); en multi-agente es *live* (la página hace polling cada 1 s mientras `status === "negotiating"`). Con `prefers-reduced-motion` abre ya terminada. |
| 3 | `/deals/[id]` | **Revisión** | Oferta recomendada, motivo (IA o reglas, siempre etiquetado), `CompareMatrix` con las 4 ofertas, `ApprovalPanel`. Aquí se **aprueba**; no se mueve dinero. |
| 4 | `/checkout/[id]` | **Pago** | Carga el SDK v6, comprueba elegibilidad PayPal en EUR, crea la orden en servidor, muestra `paypal-button`, captura al aprobar. El deal slip se convierte en recibo. Estados: loading_sdk, preparing, ready, capturing, completed, unconfirmed (con botón "Check payment status" para no cobrar dos veces). |

Navegación (`lib/nav.ts`): solo "AI Assistant" (`/`) está disponible. "Live negotiations", "My orders", "Order history", "Preferences", "Account / PayPal login" figuran como `planned` con el requisito técnico documentado y **no se enlazan ni se simulan** en la UI.

## 5. Las cuatro tiendas ficticias

Claves internas estables (`SellerId`): `nova`, `orbit`, `prism`, `vertex`. Marcas y estrategias:

| id | Marca | Estrategia | Entrega | Garantía | Devolución | Envío | Descuento máx. (V0) |
|---|---|---|---|---|---|---|---|
| nova | **Brisa Outlet** | price_fighter (barato, cede fácil, lento) | 6 d | 12 m | 14 d | de pago | 12 % |
| orbit | **Zefiro Express** | fast_delivery (rápido, concesiones pequeñas) | 1 d | 12 m | 30 d | gratis | 8 % |
| prism | **Atelier Norden** | premium_value (garantía larga, casi no descuenta) | 4 d | 36 m | 30 d | gratis | 5 % |
| vertex | **Korvan Direct** | hard_negotiator (precios firmes, poco stock) | 3 d | 24 m | 14 d | de pago | 3 % |

Cada una tiene color y monograma original (sin logos reales). Identidad pública en `shared/sellers.ts` (segura para el bundle del cliente); datos comerciales sensibles (precio mínimo/reserva, personas LLM) solo en `server/agents/catalog.ts`.

**Catálogo (modo multi-agente):** 6 categorías × 4 tiendas = 24 SKUs: `headphones`, `laptop`, `smartphone`, `smartwatch`, `running-shoes`, `monitor`. Cada ítem tiene precio de lista, **precio de reserva (nunca se envía al comprador ni a la UI)**, envío fijo y stock. Detección de categoría por regex (inglés/español) en `matchCategory`. Imágenes: ilustraciones SVG originales de la *categoría* en `public/products/` (nunca de un modelo real).

## 6. Motores de negociación

### 6.1 V0 — Motor determinista (por defecto)
Ficheros: `server/negotiation/*`.
- `scenario.ts`: construye 4 ofertas hipotéticas con PRNG determinista (mulberry32, semilla = hash de `query|presupuesto`). Precio de referencia = 88–97 % del presupuesto; apertura por tienda en bps (`OPENING_PRICE_BPS`: nova 97 %, orbit 100 %, prism 104 %, vertex 112 %), jitter ±2 %, concede entre 60–100 % de su descuento máximo. Reintenta una vez si ninguna oferta cabe en el presupuesto; si no, falla honestamente (`ScenarioError`) en vez de inventar un ganador.
- `policies.ts`: políticas fijas por tienda (`POLICY_VERSION = 2026-11-v1`); el LLM no puede cambiarlas.
- `validator.ts`: invariantes monetarias (enteros seguros, final ≤ inicial, final ≥ suelo, descuento ≤ máx. con aritmética entera). Elegibilidad: `invalid_policy` y `over_budget` (el presupuesto es restricción dura).
- `ranking.ts`: puntuación ponderada determinista según prioridad (lowest_price 65/15/20, fast_delivery 25/60/15, best_value 45/25/30 para precio/entrega/garantía), normalizada entre las 4 ofertas; solo ofertas elegibles; desempate por precio y luego `sellerId`.
- `events.ts`: convierte ofertas+ranking en un timeline ordenado (0–52 000 ms a 1x). Los eventos solo describen decisiones ya tomadas.
- `service.ts → prepareSession`: genera todo antes de reproducir, llama a `explain` (IA o reglas) y devuelve una sesión `ready`.

### 6.2 Fase 2 — Multi-agente real (flag `MULTI_AGENT_NEGOTIATION=true`)
Ficheros: `server/agents/*`.
- **1 Buyer Agent + 4 Seller Agents** en Gemini, cada uno con su propio contexto/memoria privada (`Agent` en `model.ts`). Hasta `maxRounds = 2` rondas tras las cotizaciones de apertura (4 vendedores en paralelo); el comprador contraoferta por vendedor (`counter`/`pass`), los vendedores responden (`quote`/`concede`/`hold`), decisión final del comprador.
- **Salidas estructuradas** validadas con Zod (`schemas.ts`) y luego con validadores de negocio (`validate.ts`): precio ≥ reserva, ≤ lista, nunca sube, `hold` mantiene precio, concesión ≤ `maxConcessionPerRoundBps` por ronda (nova 6 %, orbit 4 %, prism 3 %, vertex 1,5 %), la oferta de apertura debe ser `quote`, y **grounding de importes**: todo € mencionado en un mensaje debe ser un valor conocido por el servidor, si no se rechaza (`ungrounded_amount`).
- **Fallbacks etiquetados**: si un turno falla o es rechazado, entra un movimiento por reglas (`rulesSellerReply`, `rulesBuyerRound`) y se registra un evento `AGENT_FALLBACK` / `OFFER_REJECTED_BY_SERVER` (la timeline muestra actividad real de guardarraíles).
- **Control de coste y cuota** (`config.ts`): máx. 16 llamadas/negociación, timeout 12 s por intento, 2 intentos por turno, 8 fallos de transporte tolerados, tokens de salida 450 (comprador 800), deadline 40 s (`MULTI_AGENT_DEADLINE_MS`, subir a ~300 000 en free tier), `AI_RPM_LIMIT` (5 en free tier) con `RateLimiter` de ventana deslizante, **circuit breaker de cuota** (si hay 429 de cuota diaria, las siguientes ejecuciones van directas a V0), tope de 40 ejecuciones/hora en proceso.
- **Selección de motor** (`service.ts → startNegotiation`): usa multi-agente solo si el flag está activo **y** hay clave, categoría en catálogo, presupuesto alcanzable, cuota libre y hueco de ejecución. Si no, corre V0 y registra `fallbackReason` (`no_api_key`, `no_catalog_match`, `budget_below_catalog`, `model_quota_exhausted`, `cost_cap`).
- **Ejecución asíncrona**: `POST /api/negotiations` devuelve 201 con sesión `negotiating` y la ejecución continúa con `after(run)`; la página hace polling de los eventos persistidos. Una ejecución huérfana (más de `deadline + 60 s`) se cierra como `failed` en el siguiente `GET`.
- Modo de prueba `MULTI_AGENT_ENGINE=single_call` (`single.ts`): **una** llamada a Gemini escribe todo el guion; el orquestador lo "interpreta" pasando por los mismos validadores. Se etiqueta como guion de una llamada, no como agentes independientes.
- En multi-agente `finalPriceCents` de la oferta es el **total pagable** = precio del ítem + envío; `Offer.catalog` lleva `sku`, `productName`, `imageUrl`, `itemPriceCents`, `shippingCents`, `stock`, `returnDays`.

### 6.3 Explicación IA (`server/ai/explain.ts`)
El servidor ya eligió la oferta ganadora; Gemini solo la **explica** (`summary`, `reasons` 1–3, `tradeoffs` 0–3, `references`). El prompt prohíbe inventar datos, obliga a usar los importes ya formateados y trata todo el JSON como datos. Salida validada; si falla o no hay clave → `rulesFallback` y `aiStatus = "fallback"`. `Evaluation.source` = `llm` | `rules_fallback`.

## 7. Contratos de datos (`shared/contracts/types.ts`)

Todo el dinero son **céntimos enteros en EUR**. Tipos principales:
- `ProductIntent` {productQuery, budgetCents, currency: "EUR", priority, preferences, language: "en"}. Validación (`server/negotiation/intent.ts`): query 3–120 chars sin `<`/`>`, presupuesto 5 000–1 000 000 céntimos (€50–€10 000).
- `Offer` {offerId, sessionId, sellerId, productLabel, initial/final/min PriceCents, discountCents, deliveryDays, warrantyMonths, freeShipping, eligible, ineligibilityReasons, offerExpiresAt (TTL 30 min), policyVersion, catalog?}.
- `NegotiationEvent` {eventId, sessionId, sequence, atMs, phase, type, sellerId, payload, feedText}. Tipos: `AGENT_INITIALIZED, SELLER_DISCOVERED, OFFER_RECEIVED, BUYER_MESSAGE, COUNTEROFFER_RECEIVED, REQUIREMENT_VERIFIED, SELLER_REJECTED, OFFER_EVALUATED, WINNER_SELECTED, NEGOTIATION_COMPLETE` + Fase 2: `BUYER_DECISION, AGENT_FALLBACK, OFFER_REJECTED_BY_SERVER`.
- `Evaluation`, `NegotiationSession` (status `preparing|ready|negotiating|completed|failed`; `aiStatus` `pending|succeeded|fallback|failed`; `mode` `v0_rules|multi_agent`; `fallbackReason`; `agentRun`: modelo, llamadas intentadas/exitosas, fallbacks, propuestas rechazadas, tokens, `stoppedReason`, `buyerChoseTopRanked`, engine). TTL de sesión 24 h.
- `PaymentAttempt` con estados `creating → created → approval_pending → approved → capturing → completed`, más `cancelled`, `failed`, `unknown_pending_reconciliation`; guarda `createRequestId`/`captureRequestId` para idempotencia.
- `ApiError` {code, message, requestId, retryable, fieldErrors?}.

## 8. API (App Router, `app/api/`)

| Método y ruta | Función |
|---|---|
| `GET /api/config` | `{ multiAgent: boolean }`, leído por petición (`connection()`), para que la UI describa qué es real. |
| `POST /api/negotiations` | Valida intent (rate limit 10/min/IP), arranca el motor, guarda la sesión, responde 201 con sesión, eventos, ofertas, evaluación, modo y `fallbackReason`. Errores: 400 `INVALID_INTENT`, 422 `SCENARIO_UNAVAILABLE`, 429 `RATE_LIMITED`, 500. `maxDuration = 60`. |
| `GET /api/negotiations/[id]` | Devuelve la sesión + pago completado (si lo hay). Cierra como `failed` las ejecuciones huérfanas. 404 / 410 `SESSION_EXPIRED`. |
| `POST /api/negotiations/[id]/approve` | Aprobación humana. Con lock por sesión: solo la oferta **recomendada por el servidor** y **elegible**, no expirada, sin pago completado, sesión `ready|completed`. Registra `approvedOfferId/approvedAt`. |
| `POST /api/paypal/orders` | Crea (o devuelve idempotentemente) la orden Sandbox. **El body no tiene campo `amount`**: el importe sale de la oferta aprobada almacenada. Rate limit 20/min. |
| `GET /api/paypal/orders/[orderId]` | Estado persistido; reconcilia con PayPal si el resultado es incierto. |
| `POST /api/paypal/orders/[orderId]/capture` | Captura; segura de repetir (un pago completado se devuelve tal cual). |

`server/http.ts`: `apiError` unificado, rate limiter en memoria (demo; en producción habría que usar un almacén compartido), `readJsonBody` con límite de 8 000 bytes.

## 9. Pagos (PayPal Sandbox) — `server/paypal/`

- `client.ts`: cliente REST fino; **`assertSandbox()` rechaza cualquier entorno distinto de `PAYPAL_ENV=sandbox`** y exige client id/secret; token OAuth en caché; errores distintos `PayPalHttpError` (HTTP) y `PayPalNetworkError` (resultado desconocido).
- `payments.ts`:
  - `createPaymentOrder`: lock por sesión; exige sesión no expirada, aprobación previa, que `offerId` coincida con el aprobado, oferta elegible y recomendada, sin pago completado, oferta no expirada; reutiliza órdenes existentes (`created/approval_pending/approved/cancelled`); importe = `offer.finalPriceCents`; `customId` = `paymentAttemptId`.
  - `captureOrder`: lock por orden; verifica sesión/oferta; **verifica que PayPal capturó exactamente lo esperado** (estado COMPLETED, moneda, valor con `centsToValue`, `custom_id`); si hay discrepancia → `unknown_pending_reconciliation` / `AMOUNT_MISMATCH`; maneja `ORDER_ALREADY_CAPTURED` verificando con GET; `ORDER_NOT_APPROVED`/`PAYER_ACTION_REQUIRED` → vuelve a `approval_pending`; en timeout/5xx nunca declara éxito ni fallo (reconciliación).
  - `getPaymentStatus`: reconcilia con PayPal cuando el estado es `capturing` o `unknown_pending_reconciliation`.
- Aprobación y autorización PayPal son pasos separados; sin aprobar la oferta exacta no se crea ninguna orden.

## 10. Persistencia — `server/db/store.ts` y `supabase/schema.sql`

- Dos backends tras una interfaz: **Supabase** (si `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) y **ficheros JSON en `./.data`** (por defecto, `DATA_DIR` configurable). En Vercel (FS de solo lectura) se niega a arrancar sin Supabase.
- Escritura atómica por fichero temporal + rename, con reintentos ante bloqueos de Windows (EPERM/EBUSY); validación de ids (`/^[A-Za-z0-9_-]{1,80}$/`); `withLock` para exclusión mutua por clave.
- SQL: tablas `sessions(id, data jsonb, expires_at, created_at)` y `payments(id, session_id, paypal_order_id, data jsonb, …)` con índices (incl. único parcial sobre `paypal_order_id`); **RLS activado sin políticas** (la clave anon no lee nada; solo el servidor con service role).
- **Estado de los datos locales hoy** (`.data/`): ~815 ficheros de sesión y ~348 de pago, con restos `.tmp`. Sesiones: 442 V0 con aiStatus `fallback`, 5 V0 `succeeded`, 121 multi-agente `succeeded`, 183 multi-agente `fallback`, 76 multi-agente colgadas en `negotiating/pending` (ejecuciones interrumpidas en desarrollo), 19 `failed`. Pagos: 139 `completed`, 167 `approval_pending`, 47 `unknown_pending_reconciliation`, 1 `failed`. Son datos de desarrollo/pruebas acumulados (probablemente también de la suite de tests); conviene limpiarlos antes de la demo.

## 11. Diseño (UI / UX / motion)

Referencia en `AgentD_DOCS/DOCS/04_DISENO_UI_Y_DESIGN_SYSTEM.md`, `05_MOTION_DESIGN.md`, `11_REDISENO_UX_UI.md`, `AgentD_DOCS/SKILL.md` y `hero-motion/SKILL.md`. Tokens reales en `app/globals.css`.

- **Light-first y sobrio.** Superficies: canvas `#fafaf8`, surface `#ffffff`, subtle `#f4f4f2`, líneas `#e4e4e7`/`#d4d4d8`, contorno de controles `#85858e` (3:1, WCAG 1.4.11). Texto `--ink #18181b`, `--ink-2 #66666f` (AA también sobre `--subtle`).
- **Un único color de marca: azul navy PayPal `#003087`** (hover `#00266b`, soft `#eef2fa`), reservado a acciones primarias y estado activo. Colores semánticos (éxito `#15803d`, aviso `#92400e`, peligro `#b91c1c`, con soft/line) **solo para reportar estado real**. Foco `#003087`.
- **Tipografía:** Geist Sans/Mono + una **serif editorial** (`--font-display`, fallback Iowan Old Style/Georgia) para momentos clave (importes, recibo).
- **Formas:** radios pequeños y consistentes (4–16 px), nada con forma de píldora salvo puntos de estado; elevación plana, `--shadow-pop` solo en capas flotantes.
- **Motion system:** **una curva (`cubic-bezier(0.22,1,0.36,1)`) y tres duraciones** (d1 180 ms micro, d2 320 ms estado, d3 600 ms entrada) en `app/globals.css` y espejadas en `lib/motion.ts`. Fuera de eso solo hay movimiento narrativo (700–1000 ms, marcadores de mensaje en el grafo, ligados a eventos registrados) y bucles ambientales CSS (pausados fuera de pantalla). Springs solo donde Motion mide layout; la única con rebote es la marca de pago confirmado. `prefers-reduced-motion` respetado en todas partes (el replay abre en estado final). La pestaña oculta pausa los relojes (`usePageVisible`).
- **Accesibilidad:** contrastes AA, foco visible, roles `status`, componentes UI propios (`components/ui.tsx`: Badge, Card, StatusBanner, LoadingState, ErrorState, botones).
- **Componentes clave:** `components/negotiation/{Stage,PriceBoard,DraftSlip,Timeline,SellerDetail}`, `components/offers/{OfferCard,CompareMatrix,ApprovalPanel}`, `components/slip/Slip` (deal slip/recibo), `components/home/SampleStage`, `SellerMark`, `ProductImage`, `AnimatedMoney`, `Reveal`, `SplitHeading`, `Segmented`, `DotGrid`, `AppHeader`.
- **Capa de vista pura y testeada:** `lib/negotiation-view.ts` (eventos → mapa/price board/deal slip), `lib/offer-view.ts`, `lib/stage-geometry.ts`, `lib/request-parse.ts`, `shared/sample-negotiation.ts` (run congelado para el hero).
- **Avisos de demo:** `DEMO_NOTICE` y `AI_DEMO_NOTICE` (cuando los agentes son IA real) en `shared/format.ts`.

## 12. Seguridad y garantías (resumen)

- El importe a pagar **sale del servidor** (oferta aprobada), nunca del navegador; verificación post-captura de importe/moneda/custom_id.
- Aprobación humana obligatoria y específica (solo la oferta recomendada y elegible); idempotencia en crear/capturar; locks por sesión/orden.
- Modelos: salidas con esquema estricto + validadores de negocio + grounding de importes; el LLM nunca ve precios de reserva ni modifica políticas; todo texto del usuario/datos se trata como dato (anti prompt-injection); la query no admite HTML.
- Sandbox forzado (`assertSandbox`); claves en variables de entorno (`.env.local` está en `.gitignore`); clave Gemini en cabecera.
- Limitaciones conocidas: rate limiter en memoria (no compartido entre instancias), cap de ejecuciones y circuit breaker también en memoria; sin autenticación ni propiedad de sesión (cualquiera con el id de sesión puede verla).

## 13. Pruebas y calidad

`npm test` → **9 archivos, 108 tests, todos pasan**; `npm run typecheck` limpio. Cobertura por archivo (`tests/`): `agents.test.ts` (multi-agente, validadores, fallbacks, ~560 líneas), `ai.test.ts` (explicación IA), `negotiation.test.ts` (motor V0, ranking), `payments.test.ts` (crear/capturar/idempotencia/discrepancias), `store-supabase.test.ts`, `ui-models.test.ts`, `sample-negotiation.test.ts`, `stage-geometry.test.ts`, `motion-state.test.ts`. No hay tests E2E de navegador ni de componentes React. No se ha ejecutado `npm run lint` ni `npm run build` en este snapshot.

## 14. Variables de entorno (`.env.example`)

`PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` · `AI_API_KEY`, `AI_MODEL` (por defecto `gemini-3.5-flash`) · `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` · `DATA_DIR` · `MULTI_AGENT_NEGOTIATION` (false), `AI_RPM_LIMIT` (5), `MULTI_AGENT_DEADLINE_MS` (40000; ~300000 en free tier), `MULTI_AGENT_ENGINE=single_call` (solo test) · `APP_BASE_URL`, `NEXT_PUBLIC_APP_NAME`. El `.env.local` actual define PayPal Sandbox, `AI_API_KEY`/`AI_MODEL`, `APP_BASE_URL` y `NEXT_PUBLIC_APP_NAME`, **sin** las variables multi-agente ni Supabase → hoy corre V0 con datos en `.data/`.

## 15. Estructura del repositorio

```
app/                 páginas (/, /negotiation/[id], /deals/[id], /checkout/[id]) + app/api/*
components/          UI (negotiation/, offers/, slip/, home/, ui.tsx, icons.tsx, …)
lib/                 hooks y view-models del cliente (api, motion, nav, negotiation-view, offer-view, request-parse, use-*)
server/
  negotiation/       motor V0: intent, scenario, policies, validator, ranking, events, service
  agents/            multi-agente: catalog, config, model, run, single, schemas, validate, recorder
  ai/explain.ts      explicación IA + fallback por reglas
  paypal/            client.ts, payments.ts
  db/store.ts        JSON local / Supabase
  http.ts            errores API, rate limit, lectura de body
shared/              contratos, formato, productos, marcas de tiendas, sample-negotiation
supabase/schema.sql  tablas con RLS
tests/               vitest (9 archivos)
public/products/     SVG de categorías
AgentD_DOCS/      especificaciones (ES): PRD, funcionalidades, flujos, diseño, motion, arquitectura, datos/API, backlog, criterios, riesgos, rediseño
```

## 16. Documentación existente (en español, `AgentD_DOCS/`)

`DOCS/00_INDEX.md` (índice), `01_PRD`, `02_FUNCIONALIDADES_Y_CARACTERISTICAS`, `03_FLUJOS_UX`, `04_DISENO_UI_Y_DESIGN_SYSTEM`, `05_MOTION_DESIGN`, `06_ARQUITECTURA_TECNICA`, `07_MODELO_DE_DATOS_Y_APIS`, `08_BACKLOG_PRIORIZADO`, `09_CRITERIOS_DE_ACEPTACION`, `10_RIESGOS_DECISIONES_Y_PREGUNTAS_ABIERTAS`, `11_REDISENO_UX_UI` (rediseño vigente), `RESUMEN_SIMPLIFICADO.md`, `SKILL.md` y `hero-motion/SKILL.md` (reglas de motion). **Atención:** parte de las specs 01–10 se escribieron antes de la Fase 2 (multi-agente) y del rediseño; el **código y este documento son la fuente de verdad** cuando discrepan.

## 17. Real vs. simulado (para no confundirse)

- **Real:** órdenes y capturas PayPal Sandbox; aprobación humana forzada en servidor; validación de precios contra política/presupuesto; (opcional) agentes comprador y vendedores como llamadas reales a Gemini; explicación IA.
- **Simulado:** comercios, inventario, precios de lista, envío, garantías, entregas; en V0 las tiendas las "juega" el motor de reglas y la pantalla de negociación es un replay de ese run (y lo dice); la animación del home es un run congelado etiquetado "sample". No se envía nada ni se mueve dinero real.

## 18. Pendiente / siguientes pasos sugeridos

1. **Decidir y validar el modo para la demo**: activar `MULTI_AGENT_NEGOTIATION=true` con `AI_RPM_LIMIT`/`MULTI_AGENT_DEADLINE_MS` acordes al plan de Gemini y medir tasa de fallbacks (hoy hay muchas sesiones en `fallback` y 76 ejecuciones colgadas en datos locales).
2. **Despliegue**: configurar Supabase (`schema.sql`), variables en Vercel, verificar `npm run build`, `lint` y la ruta de pagos en producción Sandbox.
3. **Limpiar `.data/`** y los `.tmp` antes de grabar la demo; revisar pagos en `unknown_pending_reconciliation` (47) y `approval_pending` (167).
4. **Higiene de código/docs:** un comentario en `shared/products.ts`/`shared/sellers.ts` cita `tests/sellers.test.ts`, que **no existe** (falta el test que evita deriva entre `shared/sellers.ts` y `server/agents/catalog.ts`; además `SELLER_BRANDS` y `SELLER_PROFILES` difieren en algunos colores, p. ej. nova `#C2410C` vs `#EA580C`); alinear docs 06/07 con la Fase 2; inicializar git.
5. **Tests E2E** del flujo de navegador (brief → pago Sandbox) y de componentes críticos.
6. **Roadmap de producto (no implementado, deliberadamente sin enlazar en la UI):** cuentas / Log in with PayPal, historial y "My orders" (requiere persistencia por usuario), listado de negociaciones, preferencias de usuario, voz (V1: reconocimiento, transcripción editable, voz del agente), negociación multi-turno con el usuario, rate limiting compartido.
7. **Fuera de alcance explícito:** marketplace real, proveedores/inventario/logística externos, pagos multiparte, agentes persistentes, dinero real.

---
*Generado a partir de la lectura del código, la configuración y los datos locales del repositorio, y de la ejecución de `vitest` y `tsc --noEmit` el 2026-11-12.*
