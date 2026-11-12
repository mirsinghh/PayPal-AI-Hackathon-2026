# 07 — Modelo de datos y contratos API

**Criterio:** persistencia mínima, contratos explícitos y precios seguros. Las entidades son **diseño lógico**; pueden implementarse como tablas o registros JSON versionados. No introducir una migración compleja solo por un diagrama ideal.

## 1. Relaciones

- `NegotiationSession` tiene **1** `ProductIntent` normalizado y **4** `SellerAgent` referenciados por snapshot.
- Cada sesión tiene **4** `Offer` (cada una con oferta inicial y oferta final), **N** `NegotiationEvent` y **1** `Evaluation` final.
- `Evaluation` recomienda **1** oferta elegible; `NegotiationSession.approvedOfferId` puede ser nulo.
- Una sesión puede tener varios `PaymentAttempt` fallidos/cancelados, pero **máximo uno completado**, sin doble captura.
- `VoiceTranscript` y `VoiceUtterance` de V1 son **datos efímeros en cliente** por defecto.

## 2. Entidad ProductIntent

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `productQuery` | string | Sí | 3–120 chars, sin HTML ejecutable |
| `productCategory` | string/null | No | Normalización IA sin afirmar un catálogo real |
| `budgetCents` | integer | Sí | 5.000–1.000.000 (50–10.000 EUR) |
| `currency` | enum | Sí | Solo `EUR` |
| `priority` | enum | Sí | `lowest_price`, `fast_delivery`, `best_value` |
| `preferences` | string[] | No | Subconjunto permitido: `warranty`, `fast_delivery`, `free_shipping` |
| `language` | string | Sí | `en` V0 |

**Importante:** los requisitos de presupuesto son vinculantes; preferencias son criterios blandos en V0.

## 3. Entidad SellerAgent (registro estático + snapshot)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `sellerId` | enum | Sí | `nova`, `orbit`, `prism`, `vertex` |
| `displayName` | string | Sí | Nombre de ficción no vinculado a empresa real |
| `strategy` | enum | Sí | `price_fighter`, `fast_delivery`, `premium_value`, `hard_negotiator` |
| `policyVersion` | string | Sí | Congelada por sesión |
| `maxDiscountBps` | integer | Sí | Máximo descuento en basis points (0–10.000) |
| `deliveryDays` | integer/null | Sí | Días **simulados** |
| `warrantyMonths` | integer/null | Sí | Cobertura **simulada** |
| `freeShipping` | boolean | Sí | Condición ficticia |
| `minPriceCents` | integer | Sí | Suelo autorizado de la oferta ficticia |

V0 conserva estas políticas en configuración de servidor y guarda una copia aplicada por sesión; no se permite que IA las modifique.

## 4. Entidad Offer

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `offerId` | opaque ID | Sí | Única por sesión/seller |
| `sessionId` | opaque ID | Sí | FK a negociación |
| `sellerId` | enum | Sí | Uno de los cuatro |
| `productLabel` | string | Sí | Derivado de intención |
| `initialPriceCents` | integer | Sí | >0 |
| `finalPriceCents` | integer | Sí | Entre `minPriceCents` e `initialPriceCents` |
| `discountCents` | integer | Sí | `initialPriceCents - finalPriceCents` |
| `deliveryDays` | integer/null | Sí | Término simulado |
| `warrantyMonths` | integer/null | Sí | Término simulado |
| `freeShipping` | boolean | Sí | Término simulado |
| `eligible` | boolean | Sí | Calculado en backend |
| `ineligibilityReasons` | string[] | Sí | `over_budget`, `invalid_policy`, otros |
| `offerExpiresAt` | UTC datetime | Sí | 30 minutos después de creada |
| `policyVersion` | string | Sí | Auditoría de reglas |

**Invariante monetaria:** `initialPriceCents >= finalPriceCents >= minPriceCents > 0`; `discountCents` coincide exactamente con diferencia; todos los valores se muestran usando formateo EUR, nunca desde `float` como base de verdad.

## 5. Entidad NegotiationSession

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `sessionId` | opaque ID | Sí | UUID o similar |
| `createdAt` | UTC datetime | Sí | Creación |
| `expiresAt` | UTC datetime | Sí | 24 horas para consultar sesión |
| `status` | enum | Sí | `preparing`, `ready`, `negotiating`, `completed`, `failed` |
| `intent` | ProductIntent | Sí | Snapshot de búsqueda |
| `offers` | Offer[] | Sí | Exactamente 4 al llegar a ready |
| `events` | NegotiationEvent[] | Sí | Array ordenado y versionado |
| `evaluationId` | ID/null | No | Disponible tras preparación |
| `recommendedOfferId` | ID/null | No | Solo oferta elegible |
| `approvedOfferId` | ID/null | No | Se fija tras consentimiento |
| `approvedAt` | UTC datetime/null | No | Consentimiento explícito |
| `aiStatus` | enum | Sí | `pending`, `succeeded`, `fallback`, `failed` |
| `schemaVersion` | string | Sí | `1.0` V0 |

**Separación importante:** el estado `completed` de negociación **no implica** estado completado de pago. `playbackStatus` (`playing`, `paused`, `finished`) vive en frontend y **no** determina la validez comercial de una oferta.

## 6. Entidad NegotiationEvent

| Campo | Tipo | Obligatorio | Uso |
|---|---|---|---|
| `eventId` | opaque ID | Sí | Clave idempotente visual |
| `sessionId` | opaque ID | Sí | Sesión asociada |
| `sequence` | integer | Sí | Orden estricto creciente |
| `atMs` | integer | Sí | Tiempo relativo a animación 0–52.000 ms |
| `phase` | enum | Sí | `initialize`, `discover`, `offers`, `negotiate`, `evaluate`, `complete` |
| `type` | enum | Sí | Taxonomía de sección 7 |
| `sellerId` | enum/null | No | Identificador si evento sobre vendedor |
| `payload` | objeto tipado | Sí | Solo datos pertinentes al tipo |
| `feedText` | string | Sí | Copy visible y accesible |

### Taxonomía de eventos

| Tipo | Payload requerido | Efecto de UX |
|---|---|---|
| `AGENT_INITIALIZED` | `productQuery`, `budgetCents` | Aparece buyer agent |
| `SELLER_DISCOVERED` | `sellerId`, `strategy` | Aparece seller |
| `OFFER_RECEIVED` | `offerId`, `initialPriceCents` | Precio inicial |
| `BUYER_MESSAGE` | `sellerId`, `message` | Pulso buyer→seller |
| `COUNTEROFFER_RECEIVED` | `offerId`, `previousPriceCents`, `newPriceCents`, `message` | Actualizar precio |
| `REQUIREMENT_VERIFIED` | `offerId`, `requirement`, `passed` | Criterio visible |
| `SELLER_REJECTED` | `offerId`, `reasonCode` | Nodo atenuado + razón |
| `OFFER_EVALUATED` | `offerId`, `score`, `reason` | Ranking mostrado |
| `WINNER_SELECTED` | `offerId`, `reason` | Resaltar ganador |
| `NEGOTIATION_COMPLETE` | `recommendedOfferId` | Habilitar S03 |

**Reglas de eventos:** `sequence` único y ordenado, `atMs` no decreciente, cada referencia debe existir, `COUNTEROFFER_RECEIVED` solo después de `OFFER_RECEIVED`, `WINNER_SELECTED` solo si `eligible`, y un solo `NEGOTIATION_COMPLETE` final. Los eventos no inician pagos.

## 7. Entidad Evaluation

| Campo | Tipo | Regla |
|---|---|---|
| `evaluationId` | opaque ID | Único |
| `sessionId` | opaque ID | FK |
| `rankedOfferIds` | string[] | Orden de elegibles por scoring |
| `recommendedOfferId` | ID | Coincide con primer elegible validado |
| `scores` | {offerId: integer} | 0–100, calculado por reglas |
| `aiSummary` | string | 1–3 frases con hechos comprobables |
| `aiReasons` | string[] | Máx. 3 razones basadas en datos |
| `tradeoffs` | string[] | Qué se sacrifica frente a otras ofertas |
| `source` | enum | `llm` o `rules_fallback` |
| `modelName` | string/null | Modelo realmente invocado, no inventado |
| `validatedAt` | UTC datetime | Auditoría |

El backend verifica referencias, importes, garantía/envío y que el LLM no «cambió» la elección. Si falla, mostrar resumen rule-based y etiqueta de fallback.

## 8. Entidad PaymentAttempt

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `paymentAttemptId` | opaque ID | Sí | Único |
| `sessionId` | ID | Sí | FK |
| `offerId` | ID | Sí | Debe coincidir con oferta aprobada |
| `amountCents` | integer | Sí | Igual a `Offer.finalPriceCents` |
| `currency` | enum | Sí | EUR |
| `status` | enum | Sí | `creating`, `created`, `approval_pending`, `approved`, `capturing`, `completed`, `cancelled`, `failed`, `unknown_pending_reconciliation` |
| `paypalOrderId` | string/null | No | Devuelto por PayPal |
| `paypalCaptureId` | string/null | No | Solo si hubo captura |
| `createRequestId` | opaque ID | Sí | Clave de idempotencia create |
| `captureRequestId` | opaque ID | Sí | Clave de idempotencia capture |
| `createdAt`, `updatedAt` | UTC datetime | Sí | Auditoría |
| `failureCode` | string/null | No | Error técnico saneado |

**Restricciones de datos:** índice único de `paypalOrderId` no nulo; índice único de `paypalCaptureId` no nulo; impedir dos intentos `completed` por sesión; idempotencia de create/capture; comparación importe/moneda server-side.

## 9. Contratos REST internos (V0)

**Base:** `/api`; JSON UTF-8; IDs opacos; errores estándar sin detalles secretos; respuestas 200/201/400/404/409/422/429/500/502 según situación. Todos los importes son `*Cents` integer.

### POST `/api/negotiations`

- **Request:** `productQuery` (string), `budgetCents` (int), `currency` (`EUR`), `priority` (enum), `preferences` (array), `language` (`en`).
- **Response 201:** `sessionId`, `status=ready`, `intent`, `offers` (4), `events`, `evaluation`, `createdAt`, `expiresAt`.
- **Errores:** 400 validación; 422 escenario inconsistente; 429 demasiadas solicitudes; 502 proveedor IA no disponible si no se puede completar con fallback.
- **Seguridad:** rate limit, sanitize y no confiar en campos desconocidos.

### GET `/api/negotiations/:id`

- **Response 200:** sesión, ofertas, eventos, evaluación y estado comercial, nunca credenciales ni mensajes secretos de IA.
- **Errores:** 404 sin sesión; 410 si la sesión de 24 h ya ha caducado.
- **Uso:** recarga y replay idéntico sin regenerar ofertas.

### POST `/api/negotiations/:id/approve`

- **Request:** `offerId` recomendado.
- **Response 200:** `sessionId`, `approvedOfferId`, `approvedAt`, `amountCents`, `currency`, `offerExpiresAt`.
- **Validación:** solo la recomendada y elegible, vigente; un consentimiento no causa creación/captura automática.
- **Errores:** 409 aprobación conflictiva o intento completado; 410 oferta caducada; 422 oferta inelegible.

### POST `/api/paypal/orders`

- **Request:** `sessionId`, `offerId` (opcional si consta `approvedOfferId`); **nunca** `amount`.
- **Response 201/200 idempotente:** `paymentAttemptId`, `orderId`, `status`, `amountCents`, `currency`.
- **Efecto:** crear orden en PayPal Sandbox basada en oferta aprobada y persistida.
- **Errores:** 401/403 si corresponde a controles de sesión; 409 oferta distinta/orden ya completada; 410 caducada; 502 PayPal inaccesible.
- **SDK v6:** adaptar respuesta para que `createOrder()` entregue `{ orderId }`.

### POST `/api/paypal/orders/:orderId/capture`

- **Request:** vacío o solo identificador de intento; el servidor resuelve importe/moneda por orden guardada.
- **Response 200:** `orderId`, `captureId`, `status` (`completed` si verificado), `amountCents`, `currency`.
- **Precondición:** aprobación en PayPal; verificar la orden y el importe; idempotencia por `captureRequestId`.
- **Errores:** 409 si conflicto; 422 orden no aprobada; 502 timeout; si respuesta incierta, estado `unknown_pending_reconciliation` (no declarar fracaso ni éxito definitivo).

### GET `/api/paypal/orders/:orderId`

- **Response 200:** `paymentAttemptId`, `orderId`, `captureId` (si procede), `status`, `amountCents`, `currency`, `updatedAt`.
- **Uso:** recuperación tras refresh, timeout o error de red. Puede consultar PayPal de forma controlada para reconciliar.
- **Errores:** 404 desconocida; 502 cuando verificación remota falla; conservar estado incierto.

### (V1) POST `/api/paypal/webhooks`

- Receptor de eventos de PayPal; validar autenticidad y firma, persistir estado idempotente, reconciliar capturas. No necesario para V0 si se verifica la captura síncrona y se ofrece consulta de estado.

## 10. Errores de contrato y mensajes

| Error interno | HTTP sugerido | Mensaje UI |
|---|---:|---|
| `INVALID_INTENT` | 400 | Check your product and budget. |
| `SCENARIO_UNAVAILABLE` | 422 | We couldn't prepare a consistent demo scenario. |
| `SESSION_EXPIRED` | 410 | Your demo session has expired. |
| `OFFER_EXPIRED` | 410 | This demo offer has expired. |
| `OFFER_MISMATCH` | 409 | The selected deal has changed; please review it. |
| `AI_FALLBACK_USED` | 200 con status | Rule-based demo recommendation — AI analysis unavailable. |
| `PAYPAL_NOT_APPROVED` | 422 | Complete approval in PayPal to continue. |
| `PAYPAL_UNCONFIRMED` | 502 o 202 | We couldn't confirm the payment yet. |
| `PAYPAL_ALREADY_CAPTURED` | 200 idempotente | Sandbox payment already completed. |
| `RATE_LIMITED` | 429 | Too many attempts. Try again shortly. |

Formato de error: `code`, `message`, `requestId`, `retryable`, `fieldErrors` (si aplica). Nunca incluir tokens, respuestas sensibles sin filtrar o stack traces públicos.

## 11. Reglas de consistencia transversal

1. `Offer.finalPriceCents == PaymentAttempt.amountCents == PayPal order purchase amount`.
2. Moneda EUR en todo el recorrido.
3. `approvedOfferId == recommendedOfferId` V0; no se cambia ganador desde el cliente.
4. `winner` debe existir y estar elegible en la sesión y contar con evento de selección.
5. El estado de sesión negociadora **no equivale** a captura PayPal.
6. 1 offer por seller, 4 por sesión, un ganador, un evento completion, máximo un pago completado.
7. El frontend nunca usa importes calculados de la UI para crear órdenes.
8. Reproducir el timeline no desencadena mutaciones de negocio.
9. Cambiar prioridad/entrada requiere nueva sesión; no muta ofertas ya aprobadas.
10. Todos los términos de garantía/entrega son hipótesis de demo, no compromisos comerciales.

## 12. Retención y privacidad

- **Sesión demo:** 24 h accesible; una tarea de limpieza posterior elimina o anonimiza datos según disponibilidad.
- **Oferta:** 30 min para iniciar orden; caducidad controlada en servidor.
- **Pago:** conservar identificadores y estados técnicos necesarios para verificar la demo sin PII ni credenciales.
- **Voz V1:** texto transcrito puede usarse temporalmente para completar `ProductIntent`; audio no se almacena.

**Referencias:** [06 Arquitectura](06_ARQUITECTURA_TECNICA.md) · [02 Funcionalidades](02_FUNCIONALIDADES_Y_CARACTERISTICAS.md).
