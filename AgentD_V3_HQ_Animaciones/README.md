# Agent D — HQ Animation Pack V3

Mascota seleccionada para **AgentD**: gorra azul con letra **D**, visor azul marino, cuerpo crema, mochila naranja y contorno de inspiración pixel art.

## Descubre el pack

- **14 estados animados y 112 fotogramas** (8 estados recientes + 6 reacciones nuevas).
- **PNG RGBA 512×512**, con transparencia real, en `frames/<estado>/00.png` ... `07.png`.
- **GIF 443×443**, 8 fotogramas cada uno, en `gifs/`. Mantienen el tamaño de los GIF recientes.
- **WebP animados 512×512**, transparencia y color completo, en `webp/` (preferibles a GIF en web).
- **Spritesheets PNG** de 4096×512 en `spritesheets/` (8 fotogramas de 512×512, horizontal).
- **14 imágenes PNG estáticas** en `png/`.
- `CATALOGO_V3.png` catálogo visual.
- `demo/index.html` demo 100% local (sin servidor ni dependencias).
- `react/AgentDSprite.tsx` React + TypeScript sin dependencias adicionales.
- `react/event-mapping.example.ts` mapeo de eventos sugerido.
- `manifest.json` datos de estado y duración.

## Estados y uso sugerido

| Estado | Duración por frame | Cuándo mostrarlo |
|---|---:|---|
| `idle` | 90 ms | Esperando acciones |
| `search` | 80 ms | Consultando precios |
| `thinking` | 100 ms | Comparando ofertas |
| `talk` | 80 ms | Negociando |
| `run` | 70 ms | Transición entre tiendas |
| `offer_received` | 80 ms | Llega una respuesta del vendedor |
| `counteroffer` | 75 ms | Se envía una contraoferta |
| `reject` | 75 ms | La oferta es rechazada |
| `accept` | 80 ms | **El usuario acepta la oferta** |
| `success` | 80 ms | Mejor oferta encontrada (sin pago) |
| `jump` | 80 ms | Celebración |
| `discount` | 80 ms | Descuento conseguido |
| `surprised` | 70 ms | Respuesta inesperada |
| `payment_approved` | 80 ms | **El backend confirma el pago** |

La duración de cada ciclo está entre 0,56 y 0,8 segundos. Las seis reacciones nuevas se construyeron a partir de poses y movimientos consistentes de Agent D; los efectos (cruces, checks, mensajes) son complementos gráficos. No se ha generado una interpolación física completa del esqueleto.

## Abrir la demo

1. Descomprime todo el ZIP manteniendo las carpetas.
2. Abre `ABRIR_DEMO.html` o `demo/index.html` en el navegador.
3. Pulsa «Reproducir historia» o haz clic en un estado de la mascota.
4. Prueba «Aceptar oferta», «Rechazar» y «Confirmar pago» por separado.

**La demo es visual y utiliza comercios y precios simulados**, sin transacciones reales. Integrar en producción exige mapear los estados con los eventos efectivos del backend. No hay integración automática con Gemini ni PayPal en este ZIP.

## Integrar en React

Copia `frames/` a `public/agentd-v3/frames/` y `react/AgentDSprite.tsx` a tu proyecto.

```tsx
import AgentDSprite from "./AgentDSprite";

<AgentDSprite state={agentVisualState} size={160} speed={1} assetBase="/agentd-v3" />
```

Propiedades disponibles: `state`, `size` (px visuales), `speed`, `assetBase`, `loop`, `alt`, `className`, `onComplete`.

## Calidad y transparencia

Los GIFs se reproducen a la cadencia de las animaciones recientes: entre 70 y 100 ms por frame. Las imágenes PNG y WebP 512×512 tienen más píxeles en el archivo mientras pueden seguirse mostrando a 160px CSS. **Esto no inventa detalle artístico nuevo por remuestreo**: la nitidez y los movimientos de base proceden de las animaciones más recientes, que ya son de mayor definición que V2. Algunos frames extra de los estados nuevos tienen movimiento y accesorios derivados, no fueron todos dibujados desde cero.

GIF admite 256 colores y transparencia binaria, por lo que puede mostrar algo de dentado; en la UI se recomienda `frames/` o `webp/`. Respeta `prefers-reduced-motion` si se integra con React.

## Estructura

```text
AgentD_V3_HQ_Animaciones/
  ABRIR_DEMO.html
  CATALOGO_V3.png
  README.md
  manifest.json
  png/                14 poses
  gifs/               14 animaciones GIF
  webp/               14 animaciones WebP
  frames/             14 carpetas × 8 fotogramas PNG
  spritesheets/       14 spritesheets (8 frames)
  react/              componente + ejemplo
  demo/index.html     prototipo interactivo
```
