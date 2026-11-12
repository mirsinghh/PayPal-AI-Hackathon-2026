# V3 — Movimiento y mascota

## Sistema de movimiento

| Categoría | Qué | Valores |
|---|---|---|
| Micro | hover, foco, pulsación | `--v3-d1` 160 ms |
| Estado | paneles, chips, selección, tarjeta activa | `--v3-d2` 280 ms |
| Entrada | revelados de la landing | `--v3-d3` 520 ms |
| Narrativo | Agent D cruza el escenario; sprites | paseo 700 ms (`--v3-walk`), cadencia del pack |
| Ambiente | nubes, flotación | 7–110 s, **pausadas** fuera de pantalla |

Una curva (`cubic-bezier(0.22, 1, 0.36, 1)`), tres duraciones y movimiento narrativo atado a eventos reales. Solo `transform`, `translate`, `scale` y `opacity` (los marcadores de precio y Agent D se mueven con `translate` y unidades de contenedor, sin layout). Sin cadenas de GIF: un único Agent D animado por escena visible.

## Pack y assets

Estados del pack (14 × 8 fotogramas de 512×512, 70–100 ms por fotograma): `idle, search, thinking, talk, run, offer_received, counteroffer, reject, accept, success, jump, discount, surprised, payment_approved`.

`scripts/v3-prepare-agent-d.mjs` convierte `spritesheets/*.png` y `png/*.png` a WebP (calidad 92, alfa sin pérdida) en `public/agent-d/v3/{sheets,poses}` y copia `manifest.json`. Es solo cambio de contenedor: ningún fotograma se redibuja, redimensiona ni recolorea. ≈ 3,1 MB las 14 hojas y 0,4 MB las 14 poses (el pack en PNG pesa ≈ 15 MB solo en hojas). Cada hoja se descarga **bajo demanda** al usarse, o con `usePreloadAgentD`.

`tests/v3-assets.test.ts` falla si falta un archivo referenciado o si `lib/v3/mascot/manifest.ts` se desvía del manifiesto del pack (fotogramas, ms, `loop`/`once`).

## Motor de sprite (`components/v3/mascot/AgentD.tsx`)

- Una hoja de 4096×512 dentro de una caja cuadrada; se desliza con `animation: steps(8, jump-none)` de `0` a `-87.5%`. Cada fotograma dura exactamente 1/8 del ciclo, el último se mantiene en las reacciones y el movimiento es solo `transform` (sin renders de React por fotograma).
- Duración del ciclo = `frames × ms / speed`, con el ms propio de cada estado. **No se acelera todo por igual.** Bucles (`idle, thinking, search, talk, run, counteroffer`) frente a reacciones puntuales (`once`): una pasada y `onAnimationEnd`.
- Cambio de animación sin parpadeo: el sprite en pantalla solo cambia cuando la siguiente hoja está **decodificada** (`Image.decode()`); mientras tanto sigue la anterior.
- Tamaño fijo por contexto (el marco siempre es cuadrado), así no hay saltos de escala entre estados.
- **Pausa** si la pestaña está oculta o el sprite sale de pantalla.
- **`prefers-reduced-motion`**: muestra la **pose estática** del estado (más informativa que el fotograma 0) y, para no bloquear a quien espera `onComplete`, lo notifica tras una pausa breve.
- Accesibilidad: `role="img"` con nombre del estado, o `aria-hidden` (`label={null}`) cuando una frase ya lo cuenta.
- `AgentDPose`: avatar estático (logo, tarjetas) por el coste de una imagen pequeña.

## Director (`lib/v3/mascot/director.ts`)

Máquina de estados **pura** (sin React ni temporizadores). El renderizador avisa de que una reacción acabó (`done`) y el director responde con la siguiente.

- `base`: el bucle ambiental de la fase (siempre debajo).
- `reaction`: animación corta con clave de evento; **una vez por clave** (reenviar el mismo evento no la repite).
- Prioridad (`REACTION_PRIORITY`): 1 `running, counteroffer, offer_received` · 2 `surprised, reject, discount` · 3 `success` · 4 `accept, payment_approved`.
- Una reacción de mayor prioridad **interrumpe** y descarta la cola de menor rango; igual o menor **espera** en una cola FIFO.
- Cola corta y determinista: máximo 3, las reacciones idénticas consecutivas se **fusionan**, y al desbordar se descarta lo más antiguo de menor prioridad. Una ráfaga de eventos no se convierte en un desfile que va por detrás de los datos; **los datos nunca esperan a la mascota**.
- Un `done` de una animación ya sustituida se ignora (evita `animationend` obsoletos).
- Vuelve al estado ambiental al terminar la cola. Un bucle usado como reacción (p. ej. `counteroffer`) dura 2 pasadas.
- Recuerda dónde está Agent D (`lastSellerId`/`fromSellerId`) para el paseo y para mirar hacia el lado correcto (`running` se espeja solo al ir hacia la izquierda).

`lib/v3/mascot/choreography.ts` sincroniza el director con la lista de eventos **visibles**: procesa solo los nuevos; una lista más corta es un replay reiniciado; abrir una pantalla con eventos ya existentes **hidrata** sin reproducir el historial. `useAgentChoreography` lo aplica durante el render (patrón documentado de React, sin efectos).

## Usar a Agent D desde cualquier pantalla

```tsx
const agent = useAgentDirector("idle", { key: "present", state: "success" }); // 2º arg opcional: reacción de apertura
agent.react(cueForApproval(response, offerId));  // null se ignora
<AgentDActor director={agent.handle} size={150} />
// Sin director: <AgentD state="thinking" size={132} label={null} />
```

La lógica vive en un solo sitio; las pantallas solo cambian de estado.
