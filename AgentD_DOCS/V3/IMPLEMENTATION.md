# V3 — Implementación

## Decisiones de arquitectura

**Aislamiento real mediante dos layouts raíz.** El proyecto tenía un único `app/layout.tsx` con cabecera, contenedor y pie de la UI clásica; una ruta anidada `/v3` habría quedado envuelta por ellos. Next.js solo permite otro `<html>` con *route groups*, así que:

- Las páginas clásicas se **movieron sin cambios de contenido** a `app/(classic)/` (`layout`, `loading`, `template`, `page`, `negotiation`, `deals`, `checkout`). Un grupo no cambia la URL: `/`, `/negotiation/[id]`, `/deals/[id]` y `/checkout/[id]` son los mismos. Única edición de contenido: `import "./globals.css"` → `"../globals.css"` en el layout clásico.
- `app/v3/` tiene su propio `layout.tsx` (`<html>`, fuentes, `v3.css`). Se mantuvo el `app/v3/` pedido (sin grupo) porque, sin `app/layout.tsx` global, ese layout es raíz.
- `app/api/*`, `app/globals.css` y `app/favicon.ico` quedaron donde estaban.
- Consecuencia: ir de la UI clásica a la V3 es una carga de página completa (comportamiento documentado de Next.js para múltiples layouts raíz).

**Backend compartido, sin duplicar.** La V3 usa las mismas rutas `app/api/*`, `server/*`, `shared/contracts/types.ts`, validadores, almacenamiento y PayPal Sandbox. No se tocó ningún archivo de `server/` ni de `shared/` ni de `app/api/`.

**Pack y lint.** `eslint.config.mjs` ignora `AgentD_V3_HQ_Animaciones/**` y `tsconfig.json` lo excluye: el pack incluye un `AgentDSprite.tsx` de ejemplo (incumple una regla de React que el resto del proyecto cumple) y no es código de la app.

## Reutilizado, nuevo, intacto

| Reutilizado tal cual | `lib/request-parse.ts`, `lib/negotiation-view.ts` (`deriveSellers`, `deriveDraft`, `eventKind`), `lib/offer-view.ts`, `lib/api.ts` (`api`, `useSession`), `lib/use-motion-env.ts`, `shared/*` (contratos, vendedores, formato, muestra), `app/api/*`, `server/*` |
|---|---|
| **Nuevo (V3)** | `app/v3/*`, `components/v3/*`, `lib/v3/*`, `public/agent-d/v3/*`, `scripts/v3-prepare-agent-d.mjs`, `tests/v3-*.test.ts`, `AgentD_DOCS/V3/*` |
| **Portado** | `lib/v3/use-paypal-checkout.ts` replica el flujo de `Checkout.tsx` (mismos endpoints, orden y estados), con una comprobación más estricta: solo `status === "completed"` es éxito |
| **No reutilizado a propósito** | `components/negotiation/*`, `components/offers/*`, `components/slip/*`: están acoplados al lenguaje visual clásico (tokens `bg-primary`, `text-ink`…). La V3 comparte su **lógica** (view models) y rehace la presentación |
| **Intacto** | La UI clásica (solo movida de carpeta) y todo el backend |

## Estructura de la V3

```
app/v3/                      layout raíz, v3.css, loading, page (landing), brief/, negotiation/[id]/, deals/[id]/, checkout/[id]/
components/v3/
  ui.tsx icons.tsx PixelArt.tsx Chrome.tsx Footer.tsx
  mascot/AgentD.tsx          AgentD, AgentDActor, AgentDPose
  home/                      Hero, HeroScene, HowItWorks, LiveDemo, Sections, TransparencyLedger, EngineBadge
  brief/BriefExperience.tsx
  negotiation/               NegotiationExperience, Stage, PhaseRail, ActivityPanel (+EventLog), StoreDetail, PriceTracks, ReplayControls
  offers/                    DealExperience, CompareBoard, ApprovalCard
  checkout/                  CheckoutExperience, OrderSummary
lib/v3/
  mascot/manifest.ts director.ts event-map.ts choreography.ts hooks.ts
  activity.ts phase.ts stage.ts brief.ts use-playback.ts use-engine-mode.ts use-paypal-checkout.ts
public/agent-d/v3/           sheets/ poses/ manifest.json
```

Notas de Next.js 16 con `cacheComponents`: las páginas con `[id]` leen `params` dentro de un `<Suspense>` (patrón de `checkout` clásico); un `await params` suelto en la página produce el aviso «instant shell» en desarrollo.

## Pruebas

Añadidas **55 tests** en 5 archivos (la línea base era de 108 en 9 archivos; ahora 163 en 14):

| Archivo | Cubre |
|---|---|
| `v3-mascot.test.ts` (27) | manifiesto y cadencia; director (una vez por clave, prioridad/interrupción, cola, fusión, determinismo, `done` obsoleto, reset); mapeo de cada evento; descuento solo con bajada registrada; `SELLER_REJECTED`; indicadores; `accept`/`payment_approved` nunca desde eventos; coreografía (hidratar, reinicio de replay, lotes) |
| `v3-engines.test.ts` (7) | **ambos motores**: sesión real del motor V0 y ejecución real del orquestador multiagente con modelo guionizado (incl. rechazos del servidor, fallbacks y precios mantenidos): cada evento tiene frase, ninguna reacción prohibida, replay determinista, la barra de fases no se adelanta |
| `v3-brief.test.ts` (8) | extracción, edición, límites de presupuesto en céntimos, carga idéntica y aceptada por `parseIntent` |
| `v3-view.test.ts` (10) | fases, «finished» por motor, geometría del escenario, estados de tienda, frases, estado actual |
| `v3-assets.test.ts` (3) | archivos presentes y manifiesto sin deriva respecto al pack |

## Resultados de la validación (ejecutados en esta sesión)

| Comprobación | Resultado |
|---|---|
| `npm test` | 14 archivos, **163 tests pasan** |
| `npm run typecheck` | limpio |
| `npm run lint` | limpio (el único error previo lo causaba `AgentDSprite.tsx` del pack, ahora excluido) |
| `npm run build` | correcto; rutas clásicas y V3 compiladas |
| Humo sobre el build de producción | `/`, `/negotiation/[id]`, `/deals/[id]`, `/checkout/[id]`, `/v3`, `/v3/brief`, `/v3/negotiation/[id]`, `/v3/deals/[id]`, `/v3/checkout/[id]`, `/api/config` y los assets → 200; el HTML clásico no contiene nada de V3 |
| Navegador (build de producción) | Flujo real: brief → `POST /api/negotiations` → negociación (replay) → revisión → **aprobación** → checkout con el botón oficial de PayPal Sandbox cargado y elegible; landing completa; móvil 375 px sin desbordamiento; la UI clásica sigue igual |

## Limitaciones y pendientes (sin maquillar)

- **No se completó un pago de extremo a extremo.** El checkout se verificó hasta el botón oficial de PayPal Sandbox; autorizar y capturar exige iniciar sesión con una cuenta Sandbox, que debe hacer una persona. La celebración `payment_approved` y los estados `unconfirmed` están cubiertos por tests unitarios y por el port fiel del flujo, **no** ejercitados en vivo.
- **Multiagente con Gemini real no se ejecutó en vivo** (`MULTI_AGENT_NEGOTIATION` no está activo en `.env.local` y no se gastó cuota). La V3 se probó contra el orquestador real con un modelo guionizado y por el camino compartido de eventos; la ruta de polling de la pantalla *live* no se vio en el navegador.
- En las pruebas la explicación de IA cayó al fallback por reglas (se muestra etiquetado «Rule-based explanation»), por lo que el estado «AI analysis» no se vio en pantalla.
- No hay tests E2E ni de componentes React. La verificación visual fue manual, en el navegador integrado (Chromium) a 1360 px y 375 px. `prefers-reduced-motion` está implementado (pose estática, replay abierto ya terminado) pero no se probó en el navegador. La accesibilidad se comprobó con contrastes calculados e inspección del DOM; no se hizo una auditoría con lector de pantalla ni con herramientas automáticas.
- Con replay 2×/4× la cola de reacciones puede ir por detrás del texto (los datos no se retrasan).
- Las especificaciones antiguas (`DOCS/01`–`11`) citan rutas como `app/page.tsx`; ahora están bajo `app/(classic)/`.
- Si había un `next dev` abierto antes de mover `app/`, reiniciarlo.
- Fuera de alcance (no implementado, no simulado): cuentas, historial, voz.
