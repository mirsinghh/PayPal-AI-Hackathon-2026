# V3 — Mapeo evento → animación

Código: `lib/v3/mascot/event-map.ts` (decide), `lib/v3/mascot/choreography.ts` (sincroniza), `lib/v3/activity.ts` (frases). Pruebas: `tests/v3-mascot.test.ts`, `tests/v3-engines.test.ts`, `tests/v3-view.test.ts`.

## Reglas de honestidad

1. Solo se leen `NegotiationEvent` **persistidos**. Nunca se inventa un evento, una respuesta ni un precio.
2. La expresión sigue a lo que dice el *payload* (un «descuento» exige una bajada registrada; un precio mantenido es solo una respuesta).
3. Un guardarraíl del servidor o un fallback de IA es un **indicador informativo**, nunca un rechazo comercial ni un gesto de la mascota.
4. `accept` y `payment_approved` **no** se mapean desde ningún evento de negociación (hay un test que lo recorre para los 13 tipos).
5. El avance visual se limita a lo que los eventos permiten: la fase mostrada es la del último evento visible.
6. Los textos de ambientación nunca sustituyen al feed persistido: éste se muestra verbatim (`feedText`).

## Estado ambiental por fase (bucle debajo de las reacciones)

| Fase del último evento visible | Estado de Agent D | Sprite |
|---|---|---|
| (ninguno) / `initialize` | `thinking` | `thinking` |
| `discover`, `offers` | `searching` | `search` |
| `negotiate` | `negotiating` | `talk` |
| `evaluate` | `thinking` | `thinking` |
| `complete` | `idle` | `idle` |

## Eventos

«Paseo» = Agent D corre (`running`, 700 ms) hasta la tienda o al punto de comparación si no está ya allí. Ambos motores emiten los mismos tipos; el multiagente añade `BUYER_DECISION`, `AGENT_FALLBACK` y `OFFER_REJECTED_BY_SERVER` y campos extra (`held`, `source`, `round`…).

| Evento | Reacción de Agent D | Paseo a | Indicador | Frase de actividad (del payload) |
|---|---|---|---|---|
| `AGENT_INITIALIZED` | ninguna (ambiente `thinking`) | — | — | «Understood your mission.» |
| `SELLER_DISCOVERED` | `running` (es el paseo) | tienda | — | «Found {tienda}.» |
| `OFFER_RECEIVED` | `offer_received` | tienda | — | «{tienda} opened at {initialPriceCents}.» |
| `BUYER_MESSAGE` | `counteroffer` (2 pasadas) | tienda | — | «Sent a counteroffer to {tienda}[: target {targetPriceCents}…].» |
| `COUNTEROFFER_RECEIVED` con `newPriceCents < previousPriceCents` y `held ≠ true` | `discount` | tienda | — | «{tienda} has replied: {nuevo}, down from {anterior}.» |
| `COUNTEROFFER_RECEIVED` mantenido (`held: true`), sin cambio o sin datos | `offer_received` | tienda | — | «{tienda} has replied and kept {precio}.» / «…has replied.» |
| `REQUIREMENT_VERIFIED` | ninguna | centro | — | «Checked {tienda} against your budget: within/over budget.» |
| `OFFER_EVALUATED` | ninguna (ambiente `thinking`) | centro | — | «Scored {tienda}: N/100 for your priorities.» |
| `BUYER_DECISION` | ninguna | centro | — | «Decided how to approach this round.» / «Made the final choice among eligible offers.» |
| `SELLER_REJECTED` (`over_budget`, `invalid_policy`, otro) | `reject` | tienda (en `evaluate`: centro) | — | «Set {tienda} aside: over your budget / failed the policy check / not eligible.» |
| `SELLER_REJECTED` (`out_of_stock`) | `surprised` | tienda | — | «Set {tienda} aside: out of stock.» |
| `WINNER_SELECTED` | `success` | tienda ganadora | — | «Found the strongest eligible offer.» |
| `NEGOTIATION_COMPLETE` (ok) | ninguna (ambiente `idle`: recomendación lista, nada pagado) | — | — | «Recommendation ready. Nothing has been paid.» |
| `NEGOTIATION_COMPLETE` (`outcome: no_offer_within_budget`) | `reject` | — | — | «No offer fit your budget. Nothing was paid.» |
| `AGENT_FALLBACK` | **ninguna** | — | `fallback`: «Rules fallback used for one AI turn» | «{agente}: a rule-based move covered an AI turn. This is not a store decision.» |
| `OFFER_REJECTED_BY_SERVER` | **ninguna** | — | `validation`: «Server validation stopped a proposal» | «Server validation rejected a proposal…; the last valid price stands. This is not a store decision.» |

Etiquetas de origen: si `payload.source` es `gemini` el log muestra «AI reply»; si es `rules_fallback`, «Rules fallback». El motor V0 no emite `source` y no se etiqueta como IA.

Una pasada del sprite `once` dura 1 ciclo (560–800 ms); un sprite de bucle usado como reacción dura 2.

## Reacciones que **no** vienen de eventos de negociación

| Reacción | Única condición | Dónde |
|---|---|---|
| `success` al abrir la revisión | Existe una recomendación validada por el servidor. Es «presentar»; no autoriza nada | `DealExperience` |
| `accept` | La respuesta 2xx de `POST /api/negotiations/[id]/approve` trae `approvedOfferId` igual a la oferta aprobada (`cueForApproval`) | `DealExperience` |
| `payment_approved` | El registro de pago dice `status === "completed"` (captura verificada por el servidor, consulta de estado o sesión ya pagada) (`cueForPayment`) | `CheckoutExperience` |
| `surprised` en el brief | Intento de envío inválido o error del servidor al crear la negociación | `BriefExperience` |
| `thinking` en el brief | El usuario escribe (una por ráfaga) | `BriefExperience` |

Aprobar en PayPal **no** dispara `payment_approved`; pagos `capturing`, `approved`, `unknown_pending_reconciliation`, `failed`, `cancelled`… tampoco (hay un test por estado).

## Eventos simultáneos

El director (ver `MOTION_AND_MASCOT.md`) los ordena por prioridad con una cola de 3 y fusión de repetidos. Para el mismo conjunto de eventos el resultado es idéntico (`tests/v3-mascot.test.ts`, «is deterministic» y «queues a batch…»). En replay a 1× cada reacción cabe entre eventos; a 2×/4× (elección del usuario) la cola puede ir por detrás del texto, y los datos siguen apareciendo sin retraso.

## Modos

- **Replay V0**: los eventos visibles son los ≤ reloj; pausar/acelerar/saltar/repetir. Repetir reinicia el director (la lista visible se acorta).
- **Live multiagente**: los eventos visibles son todos los persistidos hasta ahora. Abrir la pantalla con una negociación en curso **hidrata** (sin reproducir el historial) y a partir de ahí reacciona a los nuevos.
