# 11 — Rediseño UX/UI (light, premium) y visualización de negociación

> Sustituye la dirección «dark AI-native» de `04_DISENO_UI_Y_DESIGN_SYSTEM.md`. Las rutas, contratos de API, lógica de PayPal, validación de aprobación, idempotencia, cálculo de precios y persistencia **no se han tocado**.

## 1. Auditoría (estado previo)

| Área | Hallazgo |
|---|---|
| Visual | Tema oscuro, acento morado «AI», tarjetas redondeadas de 24 px, badges de contorno de color. Aspecto de demo técnica. |
| Home | Formulario clásico de 4 campos; no parecía un asistente. |
| Negociación | Grafo SVG de 480×340 con texto de 12–17 px que se encogía a ~6 px en móvil; pulsos calculados a 100 ms; sin interacción. Cuatro tarjetas de vendedor repetían la misma información. |
| Ofertas | Una tarjeta ganadora + tabla de 7 columnas con scroll horizontal en móvil. Sin diferencias entre ofertas. |
| Producto | SVG oscuros con texto incrustado («Illustration · AgentDeal demo»). Las ofertas V0 no tenían imagen. |
| Seguridad (bundle) | Los componentes cliente importaban `server/agents/catalog.ts`, que contiene precios de reserva (`minPriceCents`) y personas de LLM. Ahora importan `shared/sellers.ts` (solo datos públicos). |
| Accesibilidad | Sin skip link; foco por defecto; estados dependían del color en el grafo. |

## 2. Design system (tokens en `app/globals.css`)

- **Color:** `canvas #FAFAF8`, `surface #FFFFFF`, `subtle #F4F4F2`, `line #E4E4E7`, `ink #18181B`, `ink-2 #66666F` (la referencia `#71717A` se oscureció para mantener AA sobre `subtle`: 5.2:1 vs 4.4:1), `primary #003087`. Semánticos con fondo suave: `success #15803D`, `warning #92400E`, `danger #B91C1C`. Contorno de controles `#85858E` (3.7:1, WCAG 1.4.11).
- **Marca con moderación:** el azul solo en acción primaria, paso actual, pulsos de mensaje y recomendación. Verde solo para ganador/pago completado. Ámbar/rojo solo para estados reales (set aside, error).
- **Tipografía:** Geist (ya en el repo). Escala `display / h1 / h2 / h3 / body / small / caption` como utilidades Tailwind (`text-display`…). Cifras con `tabular-nums`.
- **Radios:** 4 / 6 / 8 / 12 / 16 px como máximo; nada tipo píldora salvo puntos de estado.
- **Elevación:** planas por defecto; `shadow-xs` en controles; `shadow-pop` solo en capas flotantes y foco del compositor.
- **Botones:** `btnPrimary / btnSecondary / btnGhost` + modificadores `btnLarge / btnCompact` (variables CSS, sin conflictos de especificidad). Altura táctil ≥ 44 px.
- **Iconos:** `components/icons.tsx` (rejilla de 20 px, trazo 1.5). Sin emojis.
- **Motion tokens:** CSS (`--ease-out-soft`, `--dur-micro 150ms`, `--dur-ui 260ms`) y TS (`lib/motion.ts`: `duration`, `spring.snappy/soft/pop`).

## 3. Pantallas

1. **Home (`/`)** — Hero breve + compositor conversacional. El presupuesto se extrae de la frase (`lib/request-parse.ts`, conservador: solo con `€`/`EUR`) y se muestra editable con la nota «Taken from your request». La línea de estado resume lo que se enviará (producto limpio, presupuesto, prioridad). Los ejemplos del placeholder son categorías que el catálogo demo sí cubre (no «iPhone»: no existe en el catálogo y V0 etiqueta las ofertas con el texto del usuario).
2. **Negociación (`/negotiation/[id]`)** — ver §4.
3. **Ofertas + aprobación (`/deals/[id]`)** — Recomendación con imagen, precio y 4 condiciones; panel «Step 1 of 2 · AgentDeal approval» (sticky en escritorio, justo tras la recomendación en móvil); «Why this offer» con origen (AI / rules); comparador de 4 tarjetas con filas idénticas, marcas neutras «Lowest price / Fastest / Longest» y diferencias aritméticas respecto a la recomendada (sin colores buenos/malos); reordenación animada por *Best match / Lowest price / Fastest* (las no elegibles siempre al final).
4. **Pago y confirmación (`/checkout/[id]`)** — «Step 2 of 2 · PayPal payment», resumen del pedido aprobado y botón oficial de PayPal (ancho completo, zona con altura reservada). Estados reales del SDK intactos. Confirmación: importe, estado, Order ID, Capture ID y resumen; aviso explícito de que **no hay envío ni seguimiento**.

Diferenciación explícita: aprobar en AgentDeal «no mueve dinero»; el pago lo autoriza el usuario en PayPal.

## 4. Visualización de la negociación

- **Escenario:** nodo central (Buyer Agent) y cuatro tiendas ficticias en las esquinas. Nodos en HTML (texto legible desde 375 px) sobre aristas SVG; posiciones en %, misma composición móvil/escritorio.
- **Todo sale de eventos persistidos** (`lib/negotiation-view.ts`, función pura con tests):
  - `SELLER_DISCOVERED` → la arista crece desde el comprador.
  - `BUYER_MESSAGE` → punto azul viaja comprador→tienda.
  - `OFFER_RECEIVED` / `COUNTEROFFER_RECEIVED` → marcador con el precio viaja tienda→comprador; el precio del nodo «rueda» y se tacha el anterior.
  - `SELLER_REJECTED` → nodo atenuado, arista discontinua, motivo en texto.
  - `WINNER_SELECTED` → arista verde gruesa, check y el resto se atenúa.
  - «Awaiting reply» solo existe en ejecuciones *live* (multi-agente) mientras corren; en V0 no se inventa.
- **Interacción:** cada tienda es un `<button aria-pressed>`; abre un panel con oferta, producto, condiciones, último mensaje y su historial. El timeline narra en lenguaje natural (`role="log"`), con dirección («Buyer agent → Zefiro Express») y etiqueta de origen (AI / rules fallback).
- **Honestidad:** V0 muestra «Rule-based simulation» y el aviso «Replay of a rule-based simulation… not a live conversation». El replay arranca a 2× (1×/2×/4×, Pause, Skip, Replay). En modo live los eventos aparecen cuando el servidor los persiste, sin retraso artificial.
- **Reduced motion:** `MotionConfig reducedMotion="user"`, los marcadores se omiten con `useReducedMotion`, y una regla CSS global anula animaciones.

## 5. Imágenes

Ilustraciones originales por categoría (`public/products/*.svg`, sin texto incrustado, estilo claro). Representan la categoría, nunca un modelo concreto. V0 asocia la categoría con `shared/products.ts`; sin coincidencia se muestra el estado «No image» (sin salto de layout: caja de aspecto fijo). `next/image` con `unoptimized` porque SVG no se optimiza (Next lo rechaza por defecto).

## 6. Navegación futura (documentada, no fingida)

`lib/nav.ts` es la fuente de verdad. El header solo renderiza entradas `available` y muestra el menú cuando hay más de una. Pendientes, **sin enlaces** hasta que exista backend:

| Entrada | Requiere |
|---|---|
| Live negotiations | Endpoint de listado de sesiones por usuario |
| My orders / Order history | Persistencia de pedidos por usuario, paginación y retención |
| Preferences | Perfil de usuario (presupuesto/prioridad por defecto) |
| Account / PayPal login | Autenticación (Log in with PayPal) y modelo de usuario |

## 7. Archivos nuevos / modificados

`app/{globals.css,layout.tsx,template.tsx,loading.tsx,page.tsx}`, `app/negotiation/[id]/page.tsx`, `app/deals/[id]/page.tsx`, `app/checkout/[id]/Checkout.tsx` (solo JSX; la lógica de fases/SDK/captura es idéntica), `components/**`, `lib/{motion,nav,negotiation-view,offer-view,request-parse}.ts`, `shared/{sellers,products}.ts`, `tests/ui-models.test.ts`, `public/products/*.svg`. Dependencia nueva: `motion` (Motion for React).

## 8. Límites conocidos

- No se ha podido probar la visualización con agentes *live* (requiere `MULTI_AGENT_NEGOTIATION=true` y cuota de Gemini; los logs locales mostraban respuestas 429); la lógica está cubierta por tests con una sesión sintética, no por una ejecución real.
- El pago completo en PayPal Sandbox no se ha ejecutado desde esta sesión (requiere iniciar sesión con una cuenta Sandbox); se verificó hasta el botón oficial y la pantalla de confirmación con un pago ya completado en `.data`.
- `prefers-reduced-motion` verificado por revisión de código, no con emulación del sistema.

## 9. Motion system (aplicación de `AgentDeal_DOCS/SKILL.md`)

El skill está pensado para HTML/CSS/JS plano; aquí se adapta a Next + Motion for React conservando sus reglas. Los tokens viven en `app/globals.css` (`--ease`, `--ease-io`, `--d1 180ms`, `--d2 320ms`, `--d3 600ms`) y se reflejan en `lib/motion.ts`. Se sustituyó el set anterior (150/260 ms).

| Regla del skill | Cómo se aplica |
|---|---|
| Una curva, tres duraciones | Todo el CSS usa `var(--ease)` + `duration-(--d1/--d2/--d3)`; Motion usa `ease(duration.*)`. Fuera de ellas solo: marcador de mensaje del grafo (narrativa, 900 ms), titular (800 ms) y ambiental (anillo 2.4 s). |
| Solo `transform`/`opacity` | Marcadores del grafo ahora se mueven con `x/y` (transform) a partir del tamaño medido del escenario (antes `left/top`). Aristas: `stroke-dashoffset` (SVG, sin layout) como única excepción. Skeleton con `translate`, no `background-position`. |
| CSS anima, JS orquesta | Estado en atributos: `data-speaker` (asking / receiving / idle) en el nodo comprador y `data-status` en cada tienda; el CSS reacciona. El pie del comprador cambia con un keyframe `swap-in` (sin estado de salida que pueda bloquearse). |
| Pausar fuera de pantalla | `useInView` marca `data-inview` en el escenario; el anillo ambiental se pausa. El reloj del replay se pausa con la pestaña oculta, **no** al salir del escenario (en móvil el timeline que lo narra está debajo). |
| Reduced motion como diseño | CSS global del skill (+ `transition-delay: 0`); Motion con `reducedMotion="user"`; sin marcadores; el replay V0 **abre ya terminado** (historia completa y estado final) con «Replay» disponible. |
| Mejora progresiva | `<Reveal>` solo oculta, tras hidratar, lo que empieza bajo el pliegue; el HTML del servidor es visible. El titular (`SplitHeading`) es un keyframe CSS con `fill-mode: both`: sin JS termina visible. Se usó este enfoque en vez de la clase `.js` porque `<script>` en el árbol de React genera un error en React 19. No espera a `document.fonts.ready` (Geist va precargada con `next/font`). |
| Liberar el reveal | `Reveal` quita `data-reveal` tras `transitionend` (red de seguridad 1.8 s) para que el hover recupere los 180 ms. |
| Pill deslizante | `Segmented` (prioridad en Home, orden en Ofertas): una píldora con `layoutId` que se desliza al elegido; radios nativos ocultos. Barra de pasos del header: conector con `scaleX`. |
| Botones | Press `scale(.98)` en 75 ms; el primario sube 1 px con sombra teñida del azul de marca; la flecha se desplaza 3 px. |
| «Escribiendo…» (§2.12) | `TypingDots` solo para un estado **real**: agente en vivo al que se preguntó y aún no respondió (nodo + fila del timeline). Nunca en la simulación por reglas. |
| Lista viva (§2.11/2.19) | Timeline con entrada por elemento, scroll pegado al final y máscara degradada superior. |

**No se adoptó (a propósito):** spotlight con degradado bajo el cursor, brillo que cruza el botón, blobs de fondo, marquee y parallax. Contradicen la dirección del rediseño (sin gradientes decorativos, sin efectos que no comunican) y el propio skill pide «dejar respirar». Las springs se limitan a layout medido (reordenación, píldora, listas) y a la marca de pago completado.

**Pendiente de verificar (checklist §5):** emulación real de `prefers-reduced-motion`, navegación completa sin JS, y capturas de la visualización con agentes en vivo (no hay cuota de Gemini en este entorno). El panel de vista previa estaba oculto durante las pruebas, así que las animaciones se comprobaron por estado del DOM (secuencia de `data-speaker`, orden de tarjetas, liberación de `data-reveal`) y capturas intermedias, no a 60 fps.

## 10. Segunda pasada: lenguaje visual propio («el documento del trato»)

Con libertad creativa (manteniendo las reglas del brief: light, sin gradientes decorativos, sin neón, estados reales, flujo de pago intacto) se abandonó el aspecto genérico de SaaS por un sistema con una idea central:

**Un solo objeto recorre todo el producto: el documento del trato.** Un *Brief* (Home) pasa a *Deal slip* (revisión y aprobación) y termina como *Receipt* (pago). Mismo papel, mismas filas con puntos guía (`Item ........ €239`), cabecera mono y una marca de estado que cambia con el flujo (`Awaiting your approval` → `Approved by you` → `Paid · Sandbox`). Componente: `components/slip/Slip.tsx` (`DealSlip`, `LedgerRow`, `SlipTotal`). La referencia `AD-XXXXXX` se deriva del id de sesión; el número de pedido real es el de PayPal.

| Decisión | Detalle |
|---|---|
| Tipografía | Geist para toda la UI + **Instrument Serif** solo en momentos clave: titulares, precio recomendado, importes del documento y confirmación. Etiquetas de «mobiliario» del documento en Geist Mono mayúsculas (`.eyebrow`), nunca para frases. |
| Home | Titular editorial a dos columnas con el *Brief* que se escribe solo mientras el usuario escribe (producto limpio, presupuesto extraído, prioridad, preferencias). Constelación en reposo (sin actividad inventada) y las cuatro tiendas. |
| Negociación | Aristas **en arco** (todas curvan igual, efecto molinillo) con marcadores que viajan exactamente por el arco dibujado y ondas al aterrizar; rejilla de puntos tipo papel de dibujo; y el **Price board**: por tienda, punto hueco = precio de apertura, punto lleno = precio actual, línea = concesión, sobre una escala fija ligada a tu presupuesto (no se reescala, no salta). Todo sale de eventos persistidos. |
| Ofertas | Recomendación como página (imagen, precio en serif, condiciones en línea) con cita editorial del motivo (IA / reglas siempre etiquetado). Comparador **matriz** en escritorio: una columna por tienda, mismas filas, mejor valor de cada fila marcado con texto y diferencias neutras respecto a la recomendada; tarjetas en móvil. Reordenación animada por columnas. |
| Pago | La slip «aprobada» a la izquierda y la autorización de PayPal a la derecha, sin cajas anidadas. Confirmación = la misma slip convertida en recibo. |
| Header | Progreso de 4 pasos: Brief · Negotiate · Review · Pay. |

Reglas de CSS aprendidas: `.eyebrow` va en `@layer components` y el foco global en `@layer base`, para que las utilidades de Tailwind puedan sobrescribirlos (el CSS sin capa siempre gana).

**Pendiente de verificar:** como antes (reduced-motion real, sin JS, agentes en vivo). La nueva geometría de arcos y el Price board se comprobaron en escritorio y a 375 px con la simulación por reglas; el modo live comparte el mismo modelo de vista pero no se ha ejecutado.

## 11. Tercera pasada: diagrama de agentes y primera impresión (skill `hero-motion`)

El skill `AgentDeal_DOCS/hero-motion/SKILL.md` describe un hero donde el producto *se ve funcionando* (capas: texto, atmósfera, escenario, demo viva). Se aplicó a AgentDeal respetando la regla de honestidad: **no se inventa actividad**.

| Idea del skill | Aplicación en AgentDeal |
|---|---|
| Demo viva en el hero | `components/home/SampleStage.tsx`: la home reproduce en bucle una **ejecución congelada del motor de reglas real** (`shared/sample-negotiation.ts`, semilla 42), siempre etiquetada «Sample run · pre-recorded, rule engine». `tests/sample-negotiation.test.ts` falla si el motor deja de producir exactamente esa salida. Se pausa fuera de pantalla y con la pestaña oculta; con reduced-motion muestra el estado final sin bucle. |
| Ficha que se rellena sola | `DraftSlip` + `SlotRow`: cada fila es un esqueleto con shimmer hasta que ocurre el evento que la produce (tiendas, ofertas, «Lowest so far», «Recommended»). «Lowest so far» es aritmética sobre ofertas visibles, no recomendación; «Recommended» solo aparece con el evento `WINNER_SELECTED`. En el ejemplo, la más barata (Brisa) **no** es la recomendada (Atelier): explica «mejor valor ≠ más barato». Aparece también en la pantalla de negociación. |
| Máquina de estados por atributos | `data-speaker` (asking / receiving / idle) y `data-status` en el escenario. Dos anillos desfasados 0.6 s en el nodo comprador solo mientras viaja un mensaje registrado. |
| Atmósfera | Rejilla de puntos y 3 anillos «sonar» (10 s, desfase 3.33 s) **solo mientras el agente trabaja de verdad**, pausados fuera de pantalla. Sin orbes ni blur (contradicen la dirección visual). |
| Profundidad y parallax | Hook `useParallax` (inercia 0.08, solo puntero fino, se detiene solo). En el mapa solo se mueven las **capas de fondo** contra el primer plano: así las aristas no se despegan de los nodos. En el hero, los elementos del escenario usan `--depth` creciente (mapa 6, ficha 18, chip 28) con tres propiedades distintas (`translate` parallax, `transform` entrada, `translate` float tras 1.2 s). |
| Coreografía de entrada | `[data-hero]` con índice `--h` (900 ms, +90 ms por índice) para el texto y `stage-in` para el escenario. |
| Bucle con cierre elegante | `useReplay`: reproduce → mantiene el estado final 5.2 s → desvanece 500 ms → reinicia. Un único efecto posee intervalos y timeouts (equivalente a `runId`): reiniciar repetidamente no duplica ejecuciones. |

**Primera impresión para el jurado:** el hero muestra el producto trabajando en 5 segundos; una sección «What is real, what is simulated» enumera lo real (PayPal Sandbox, aprobación en servidor, validación de precios) y lo simulado, verificado contra el código; y el `README.md` raíz (antes el de `create-next-app`) explica el proyecto, cómo ejecutarlo y qué hace realmente la IA.

**Aviso de verificación:** en el panel de vista previa oculto, React difiere la hidratación de los límites Suspense hasta que hay una interacción, así que la secuencia del ejemplo se verificó tras un clic (se observaron: relleno progresivo, estampa «Ready for your review», pausa, desvanecido y reinicio). En un navegador visible no ocurre.
