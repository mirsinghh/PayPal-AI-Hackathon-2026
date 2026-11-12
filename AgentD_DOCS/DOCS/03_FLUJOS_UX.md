# 03 — Flujos UX, navegación y UX writing

**Objetivo UX:** el usuario debe entender en menos de 10 segundos qué hará su agente, en menos de 1 minuto qué cambió durante la negociación y antes del pago cuánto aceptará y por qué. Los sellers son simulados y esa condición se muestra en la interfaz.

## 1. Mapa de información

| Ruta propuesta | Pantalla | Información jerarquizada | Acción principal |
|---|---|---|---|
| `/` | S01 Discover | Promesa → búsqueda → presupuesto/prioridad → preferencias → aviso demo | `Find my best deal` |
| `/negotiation/[id]` | S02 Live Negotiation | Progreso → grafo → ofertas → actividad → estado | `View my best deal` |
| `/deals/[id]` | S03 Best Deal | Ganador → precio/ahorro simulado → argumentos → comparativa → disclaimer | `Approve & Continue to PayPal` |
| `/checkout/[id]` | S04 Checkout & Confirmation | Oferta aprobada → checkout PayPal → estado confirmado → IDs | `Pay with PayPal` / `Start again` |

No existe navegación de usuarios autenticados en V0. Un header discreto incluye marca, etiqueta «Sandbox Demo» y enlace a «About this demo» (explica simulación).

## 2. Flujo principal end-to-end (V0)

| Paso | Acción | Respuesta del sistema | Estado/resultado |
|---|---|---|---|
| 1 | Introduce «wireless noise-cancelling headphones» | Muestra sugerencia y valida longitud | S01 `editing` |
| 2 | Establece 350 EUR + prioridad `best_value` | Refleja límites en resumen | S01 `ready` |
| 3 | Pulsa Find my best deal | Valida, crea sesión y espera escenario | S01 `submitting` |
| 4 | Se abre negociación | Presenta cuatro vendedores simulados y eventos | S02 `playing` |
| 5 | Observa concesiones | Cambian precios, criterios y feed en sincronía | S02 `negotiating` |
| 6 | Termina evaluación | Ganador queda destacado y botón de resultado activo | S02 `finished` |
| 7 | Revisa Best Deal | Precio final, diferencia con precio inicial, por qué ganó | S03 `reviewing` |
| 8 | Aprueba expresamente | Bloquea el importe aprobado a sesión/oferta | S03 `approved` |
| 9 | Confirma en PayPal Sandbox | Crea orden del servidor; usuario autoriza; captura | S04 `capturing` |
| 10 | Obtiene respuesta confirmada | Estado COMPLETED, total, PayPal Order ID y Capture ID | S04 `completed` |

**Regla de diseño:** sin éxito prematuro. Una animación triunfal aparece al seleccionar oferta (éxito de negociación), no debe confundirse con haber pagado. El éxito de pago solo tras captura verificada.

## 3. Flujo alternativo A — sin presupuesto o entrada inválida

- El botón permanece deshabilitado cuando faltan datos obligatorios.
- Al perder foco se muestra error específico: `Enter a budget between €50 and €10,000.`
- Si la descripción es muy vaga, mostrar ayuda: `Add a product or key feature so your agent knows what to compare.`
- Mantener todos los valores del formulario; no navegar ni crear sesión.

## 4. Flujo alternativo B — no se puede generar una negociación coherente

- Mostrar estado de recuperación en S01 o S02, sin inventar silenciosamente una oferta válida.
- Copy: `We couldn't prepare a consistent demo scenario. Try adjusting your budget or product description.`
- CTA `Edit my search` y secundario `Retry`.
- Nunca llamar «unavailable from stores» a un fallo del simulador; no se han consultado tiendas reales.

## 5. Flujo alternativo C — IA no disponible

- Mantener ofertas validadas, grafo y resultado técnico con el fallback determinista.
- Etiqueta visible junto a recomendación: `Rule-based demo recommendation — AI analysis unavailable.`
- CTA `Try AI analysis again` no modifica precios/orden creada; repetir solo interpretación o explicación.
- Para la demo de hackathon debe existir otro flujo probado donde haya ejecución real de IA.

## 6. Flujo alternativo D — salida antes del pago

- `Not now` en S03 finaliza sin orden y ofrece `Start a new negotiation`.
- Si oferta caduca, deshabilitar checkout: `This demo offer has expired. Run a new negotiation.`
- Back desde S04 recupera la sesión; no crea nueva orden al navegar.

## 7. Flujo alternativo E — cancelación o error PayPal

| Situación | Mensaje | Acción |
|---|---|---|
| Usuario cierra PayPal | `Payment was cancelled. You haven't been charged.` | `Try again` si el estado servidor lo permite |
| Problema de conexión | `We couldn't confirm the payment status yet.` | `Check payment status` |
| Backend informa fallo | `Payment couldn't be completed in Sandbox.` | `Try again` / `Start again` |
| Ya capturada | `This Sandbox payment is already complete.` | Ver confirmación, no repetir captura |
| Popup bloqueado | `Your browser blocked the PayPal window.` | Instrucción de permitir popup / reintentar |

No afirmar «no se ha cobrado» ante un resultado de red desconocido: solo decir «no hemos podido confirmar todavía» y recuperar estado.

## 8. Flujo V1 — voz

1. Entrada S01: micrófono visible si el navegador soporta reconocimiento.
2. Clic en micrófono: petición de permiso explícita.
3. Transcripción en pantalla en tiempo real cuando soporte lo permita.
4. Extracción estructurada mediante IA, campos actualizados, etiqueta `Review before starting`.
5. Usuario confirma; se ejecuta **exactamente el flujo V0**.
6. Narración opcional: buyer agent lee 2–3 hitos y conclusión; feed y texto permanecen accesibles.
7. Micrófono denegado / navegador incompatible → inputs normales, sin bloqueo.

## 9. Especificación de copy (en inglés, tono de producto)

**Voz de marca:** directa, útil, precisa, optimista pero no triunfalista; sin antropomorfismo excesivo ni promesas de ahorro real.

| Contexto | Texto recomendado | Evitar |
|---|---|---|
| Hero | `Stop searching. Start negotiating.` | `Guaranteed lowest prices anywhere` |
| Subtítulo | `Tell your AI shopping agent what matters to you.` | `AI finds real sellers in seconds` |
| Campo producto | `What are you looking for?` | `Item query` |
| Presupuesto | `Maximum budget` | `You will pay` |
| Prioridad | `What matters most?` | `Algorithm weight` |
| CTA inicial | `Find my best deal` | `Buy now` |
| Estado de negociación | `Comparing simulated seller offers` | `Contacting live retailers` |
| Nuevo precio | `NOVA made a new offer: €299` | `Actual merchant agreed to €299` |
| Descarte | `VERTEX exceeds your budget` | `VERTEX lost` |
| Resultado | `Best match for your preferences` | `Cheapest product on the market` |
| Ahorro | `€30 lower than this seller's starting offer` | `You saved €30 vs market price` |
| Aprobación | `Approve & Continue to PayPal` | `Pay automatically` |
| Sandbox | `Test transaction. No real purchase or delivery.` | `Order shipped` |
| Pago completo | `Sandbox payment completed` | `Your product is on the way` |
| Error de IA | `AI analysis is unavailable; showing a rule-based demo.` | `AI completed the analysis` |

**Microcopy de transparencia fijo:** `Demo experience: seller agents, offers and product terms are simulated. PayPal transactions use Sandbox.` Visible en S01 y S03/S04 y accesible desde S02.

## 10. Navegación, foco y accesibilidad

- Ruta validada y pasos anteriores navegables sin recrear pagos ni cambiar silenciosamente la oferta.
- Foco se desplaza al `h1` al cambiar de página y al resumen de resultado al completar la negociación.
- En grafo: cada seller puede recorrerse por teclado y tiene equivalente de lista/tabla.
- Feed de eventos: anuncios `aria-live="polite"` solo en hitos importantes; no anunciar cada fotograma.
- Diálogos y permisos: foco atrapado mientras estén abiertos, escape para cerrar si no hay operación crítica.
- Contraste, estados con texto + icono, y controles accesibles con teclado/lector de pantalla.

## 11. Blueprint del vídeo (<3 minutos)

| Tiempo | Toma | Mensaje |
|---|---|---|
| 0:00–0:15 | Hero + problema | Compras online consumen tiempo |
| 0:15–0:35 | S01 búsqueda (voz si V1 disponible) | Un agente entiende necesidades |
| 0:35–1:27 | S02 con negociación acelerada/editada de forma honesta | Cuatro agentes compiten y conceden |
| 1:27–1:58 | S03 | Mejor oferta explicada, no solo más barata |
| 1:58–2:32 | S04 + PayPal Sandbox | Aprobación humana → pago de prueba confirmado |
| 2:32–2:42 | Confirmación / cierre | Transparencia y potencial del agentic commerce |

No mostrar un estado inexistente en la app ni editar el vídeo para simular una captura que no ocurrió; se permite condensar tiempos de espera con cortes claros.
