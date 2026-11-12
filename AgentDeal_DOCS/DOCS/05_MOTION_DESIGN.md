# 05 — Motion design y sistema de animaciones

**Propósito:** transformar eventos del orquestador en una narración comprensible. El movimiento debe explicar decisiones y aportar ritmo a la demo, sin fingir actividad externa ni bloquear la accesibilidad.

## 1. Principios

1. **Causa → efecto:** cada animación responde a un evento identificado.
2. **Ritmo legible:** un hito principal por vez; eventos simultáneos no compiten por atención.
3. **Continuidad espacial:** los nodos conservan lugar y identidad; evitar saltos bruscos.
4. **Feedback verificable:** los cambios monetarios tienen correspondencia exacta con el estado del servidor.
5. **No teatro de IA:** no añadir mensajes falsos para mantener la pantalla animada.
6. **Accesible y pausado:** toda acción tiene texto equivalente y reducción de movimiento.
7. **La interfaz llega antes del efecto:** un usuario lento de red no espera por una animación decorativa.

## 2. Tokens de motion

| Token | Duración | Easing sugerido | Aplicación |
|---|---:|---|---|
| `motion.instant` | 80 ms | Linear | Indicadores mínimos |
| `motion.fast` | 120 ms | Ease-out | Hover/foco ligero |
| `motion.base` | 200 ms | `cubic-bezier(.2,.8,.2,1)` | Botones, badges |
| `motion.medium` | 300 ms | `cubic-bezier(.2,.8,.2,1)` | Cards, cambios de precio |
| `motion.slow` | 450 ms | `cubic-bezier(.16,1,.3,1)` | Entrada de nodos, paneles |
| `motion.emphasis` | 600 ms | `cubic-bezier(.16,1,.3,1)` | Elegir ganador |
| `motion.route` | 700–1000 ms | Ease-in-out | Paquete visual viajando por edge |
| `motion.layout` | 250–350 ms | Ease-in-out | Reorganizar paneles |

**Reglas:** no mezclar tres easings distintos en una misma escena; respetar al menos ~200 ms entre eventos muy relevantes para permitir lectura. Duración de reproducción de la negociación: **52 s a 1×**; velocidad 2× disponible para demo.

## 3. Catálogo de transiciones y microinteracciones

| ID | Disparador | Efecto | Duración | Regla de consistencia |
|---|---|---|---|---|
| M01 | Entrada S01 | Hero fade + translateY 8 px | 450 ms | No retrasar inputs |
| M02 | Focus input | Border + focus ring | 120 ms | Visible por teclado |
| M03 | Toggle chip | Fondo y check icon | 200 ms | Cambia aria-pressed |
| M04 | Submit intención | Button loading + fase preparación | 200 ms | Deshabilita doble envío |
| M05 | `AGENT_INITIALIZED` | Buyer scale .96→1 + opacity | 450 ms | Nodo estable tras entrada |
| M06 | `SELLER_DISCOVERED` | Seller fade/slide 12 px | 350–450 ms | Uno por evento |
| M07 | `OFFER_RECEIVED` | Edge pulse + reveal precio | 700 ms | Solo al recibir oferta |
| M08 | `BUYER_MESSAGE` | Pulso del edge buyer→seller | 700–900 ms | Tooltip de mensaje sincronizado |
| M09 | `COUNTEROFFER_RECEIVED` | Precio anterior fade out, nuevo count/reveal | 300 ms | Muestra ambos valores en feed |
| M10 | `REQUIREMENT_VERIFIED` | Icono check + etiqueta | 200 ms | Sin solo color |
| M11 | `SELLER_REJECTED` | Nodo opacity 1→.38 + etiqueta Rejected | 300 ms | No eliminar del resumen |
| M12 | `OFFER_EVALUATED` | Panel score/justificación reveal | 300 ms | Puntuación si existe y validada |
| M13 | `WINNER_SELECTED` | Borde/acento ganador y zoom leve 1→1.03→1 | 600 ms | Respetar espacio, no reflow brusco |
| M14 | `NEGOTIATION_COMPLETE` | Progreso complete + CTA habilitado | 300 ms | Anunciar fin en texto |
| M15 | S02→S03 | Fade + translateY 12 px | 250–350 ms | Foco pasa a H1 |
| M16 | S03 aprobar | Botón a estado procesando, luego S04 | 200 ms | No sugerir pago ya completado |
| M17 | PayPal creando orden | Skeleton/checklist breve | 200 ms | SDK oficial sin estilos invasivos |
| M18 | Captura completa verificada | Check icon, resumen aparece | 400 ms | Nunca antes de respuesta backend |
| M19 | Error | Icono + borde + mensaje inline | 200 ms | No shake fuerte |
| M20 | Replay | Reset instantáneo de escena → secuencia | 0 + normal | No regenerar datos ni órdenes |

## 4. Coreografía S02: fases y eventos

| Fase | Ventana a 1× | Qué aparece primero | Evidencia que debe quedar visible |
|---|---|---|---|
| 1. Initialize | 0–4 s | Buyer node + objetivos | Presupuesto, prioridades |
| 2. Discover | 4–10 s | NOVA, ORBIT, PRISM, VERTEX | Cuatro nombres/perfiles |
| 3. Offers | 10–20 s | Primeras ofertas y términos | Precio inicial de cada uno |
| 4. Negotiate | 20–38 s | Solicitud → respuesta → contraoferta | Precio inicial y final diferenciados |
| 5. Evaluate | 38–46 s | Criterios, rechazo(s), explicación IA | Elegibilidad y razones |
| 6. Complete | 46–52 s | Ganador enfatizado y CTA | Oferta final seleccionada |

La lógica no depende de temporizadores para calcular quién gana. Los `atMs` solo gobiernan representación. Si la generación aún no termina, mostrar loading honesto y **no arrancar el reloj de 52 s** hasta tener una sesión consistente.

## 5. Motion por pantalla

### S01 — Discover
- Entrance discreto del hero, sin parallax.
- Focus y validación inmediatos; loading en botón tras submit.
- En V1: halo del micrófono solo mientras escucha; animación de waveform local solo si hay audio capturado real o voz reproducida real.

### S02 — Live Negotiation
- Nodos colocados en un layout estable y conexiones semánticas.
- Flujos de pulso solo para mensajes y ofertas representados en eventos.
- El precio cambia al recibir contraoferta. No contar cifras ficticias intermedias que parezcan descuentos reales.
- Feed revela un elemento cada vez; viewport estable y scroll no agresivo.
- Vendedor descartado permanece visible, pero atenuado.
- Pausa congela tanto timeline lógico como animación; replay respeta los mismos eventos.

### S03 — Best Deal
- Entrada de tarjeta ganadora 300–450 ms.
- Resaltar diferencia inicial→final **sin alterar importes**.
- Tabla comparativa se revela después del resumen, sin «confetti» ni exageración financiera.
- CTA de aprobación sin movimiento llamativo o urgente.

### S04 — PayPal
- Sólo feedback local de interfaz; no modificar transiciones ni branding del SDK de PayPal.
- Separar claramente `approved` del estado `captured`.
- Éxito: check sutil **solo después** de confirmación del servidor.
- Ante estado incierto, loader informativo + botón para consultar; sin spinners infinitos.

## 6. Accesibilidad y reducción de movimiento

| Preferencia/condición | Comportamiento obligatorio |
|---|---|
| `prefers-reduced-motion: reduce` | Desactivar partículas, pulsos repetitivos, traslaciones largas y escalados; cambios inmediatos o fade ≤100 ms |
| Usuario pulsa Pause | Congelar avance del timeline y mensajes nuevos visibles; reanudar en mismo índice |
| Uso con teclado | Acciones de pausa, velocidad, replay y vista lista accesibles |
| Lector de pantalla | Anunciar fases, ofertas relevantes y ganador; no narrar todos los fotogramas ni cada pulso |
| Audición reducida o mute | Todo mensaje/narración siempre visible en texto |
| Móvil de bajo rendimiento | Usar lista de agentes y transiciones ligeras; no WebGL ni canvas pesado |

**Seguridad visual:** evitar flash >3 veces/segundo, movimientos de cámara excesivos y zoom que desplace contenido sensible. Respetar la opción de reduced-motion incluso en demo.

## 7. Qué evitar

- Partículas viajando continuamente sin evento real.
- Cuatro conversaciones completas moviéndose simultáneamente.
- Efecto de «pensamiento» infinito que disimule fallos de API.
- Cambiar precios en UI antes de validar escenario.
- Mostrar descuentos «en tiempo real» si solo son números animados arbitrarios.
- Éxito de compra anticipado a captura.
- Reproducir voces automáticamente o varios TTS superpuestos.
- Prolongar la negociación artificialmente cuando usuario elige 2× o reduced-motion.

## 8. Implementación y QA de motion

**Fuente única de verdad:** `NegotiationEvent` con ID, `sequence`, `atMs`, `type`, `sellerId` y `payload`. `PlaybackController` emite cambios de estado; los componentes se suscriben al estado derivado, no a timers independientes.  
**Rendimiento:** preferir transform y opacity; evitar animar dimensiones, sombras difusas grandes o layout de todo el grafo.  
**Verificación:** pausar a mitad de una contraoferta; cambiar de pestaña; navegar atrás; entrar directamente a la URL; reducir movimiento; 2×; replay; móvil. El resultado económico debe permanecer idéntico en todas las modalidades.
