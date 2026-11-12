# V3 — Design system

Fuente de verdad: `app/v3/v3.css` (tokens y CSS encapsulado) y `components/v3/ui.tsx` (primitivas). Es independiente de `app/globals.css`: cada UI se importa solo en su layout raíz, así que ninguna puede afectar a la otra. Tailwind en V3 usa `source(none)` y solo escanea `app/v3`, `components/v3` y `lib/v3`.

## Dirección

- Fondos cálidos y superficies luminosas; azul índigo/eléctrico como identidad; violeta muy suave como tinte.
- Amarillo/naranja cálido **solo** como acento expresivo (la mochila de Agent D, el subrayado de titulares).
- Verde y rojo **reservados a estado real** (éxito/peligro). El ámbar de aviso también es semántico.
- Tarjetas con borde sutil y sombra controlada. Pixel art **selectivo**: nubes, tienda, moneda, chispa, toldos de las tiendas. Nunca tipografía pixelada ni UI pixelada.
- Un único gesto táctil: el botón primario tiene un borde inferior apilado (se «hunde» al pulsar).

## Tokens de color

Valores de `v3.css` (`--color-v3-*`, usados como `bg-v3-*`, `text-v3-*`, `border-v3-*`).

| Token | Valor | Uso |
|---|---|---|
| `bg` | `#FBFAF6` | Fondo de página |
| `sunken` | `#F3F1EA` | Pistas, segmentados, pie |
| `surface` | `#FFFFFF` | Tarjetas |
| `ink` | `#1B1B5A` | Texto principal |
| `ink2` | `#55547F` | Texto secundario |
| `line` / `line-strong` | `#E7E4F0` / `#CFCBE0` | Bordes |
| `control` | `#7C7BA3` | Contorno de inputs (≥3:1) |
| `primary` | `#3D5AF1` | Rellenos y botón primario |
| `primary-hover` | `#2A41C4` | Hover y borde apilado |
| `primary-ink` | `#3550E0` | Texto/iconos de acento sobre claro |
| `electric` | `#4C6BFF` | Solo decorativo |
| `soft` / `soft2` | `#E9E7FF` / `#F4F2FF` | Tintes violetas |
| `accent` / `accent-soft` | `#FFB347` / `#FFF1D6` | Acento de la mascota |
| `success` (+soft, line) | `#15803D` | Estado real positivo |
| `warn` (+soft, line) | `#8A4B08` | Avisos, fallbacks, validación del servidor |
| `danger` (+soft, line) | `#B91C1C` | Errores |

### Contrastes comprobados (calculados con la fórmula WCAG 2.x)

| Par | Ratio | Resultado |
|---|---:|---|
| `ink` sobre `bg` | 14.88 | AAA |
| `ink` sobre `surface` | 15.54 | AAA |
| `ink` sobre `soft` | 12.83 | AAA |
| `ink2` sobre `bg` / `soft` / `sunken` | 6.79 / 5.86 / 6.28 | AA |
| blanco sobre `primary` `#3D5AF1` | 5.34 | AA |
| `primary-ink` sobre `bg` / `soft` | 5.96 / 5.14 | AA |
| `ink` sobre `accent` | 8.73 | AAA |
| `success` sobre su fondo suave / blanco | 4.55 / 5.02 | AA |
| `danger` sobre su fondo suave / blanco | 5.66 / 6.47 | AA |
| `warn` sobre su fondo suave / blanco | 6.18 / 6.79 | AA |
| contorno de control `#7C7BA3` sobre blanco | 4.02 | ≥3:1 |

El azul de referencia `#4C6BFF` **no** pasa AA con texto blanco (4.33:1), por eso queda como decorativo y los rellenos usan `#3D5AF1`. El botón y los colores de PayPal los dibuja el SDK de PayPal; V3 solo le da espacio.

## Tipografía

`next/font/google`, autoalojadas:
- **Bricolage Grotesque** (display, variable con eje `opsz`): titulares (`.v3-display`, `.v3-h2`) y precios grandes. Peso 750–800, tracking negativo.
- **Figtree** (UI): todo lo demás. Cifras con `tabular-nums` (`.v3-num`) donde importan.

Información importante nunca va en tipografía decorativa.

## Componentes (`components/v3/`)

| Componente | Notas |
|---|---|
| `btn(kind, size)` | `primary` / `secondary` / `ghost`; `sm` = 44 px (objetivo táctil mínimo), `md` 48, `lg` 54 |
| `Chip` | `neutral/primary/accent/success/warn/danger`; siempre lleva texto |
| `Notice` | `info/warn/danger/success`; `role="status"` (`alert` en danger) |
| `StoreMark`, `awningOf` | Monograma original por tienda y color de toldo |
| `ProductImage` | Reserva su caja (sin layout shift) |
| `AgentD`, `AgentDActor`, `AgentDPose` | Ver `MOTION_AND_MASCOT.md` |
| `Stage`, `PhaseRail`, `ActivityPanel`, `EventLog`, `StoreDetail`, `PriceTracks`, `ReplayControls` | Negociación |
| `CompareBoard`, `ApprovalCard` | Revisión y aprobación |
| `OrderSummary`, `CheckoutExperience` | Checkout |
| `PixelCloud/Store/Coin/Spark/Tag` | Escenografía, siempre `aria-hidden` |

## Reglas de implementación

- El CSS propio (`.v3-*`) está **sin capa** y por tanto gana a las utilidades de Tailwind (que van en `@layer`) para la misma propiedad. No aplicar utilidades de `padding`/`display` a elementos que ya tienen clase `.v3-*` que las define; usar una clase modificadora (ej. `.v3-input--prefix`).
- Las reglas de `@container` que dependen del orden del archivo llevan especificidad doble (`.v3-rail .v3-snap`): el minificador puede fusionar at-rules idénticas y mover reglas.
- Foco visible: `outline 3px` primario con `offset 3px` en todo `.v3-root`.
- Radios: 10/14/22/30 px. Sombras: `shadow-v3-card`, `shadow-v3-lift`.
