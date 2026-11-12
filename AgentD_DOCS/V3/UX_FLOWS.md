# V3 — Flujos UX

Flujo: **Landing → Brief → Negociación → Revisión → Pago**. El stepper del header (`Mission · Negotiation · Review · Pay`) es informativo (derivado de la ruta), nunca un atajo.

## 1. Landing (`/v3`)

- **Hero asimétrico**: titular «Agent D finds your next great deal.», CTA «Start negotiating» (→ `/v3/brief`) y «Watch Agent D in action» (→ ancla a la demo). A la derecha, `HeroScene`: Agent D corre a una tienda, mira el precio, recibe la oferta, piensa, contraoferta, consigue un precio menor, celebra y vuelve a su sitio.
  - Es una **ilustración guionizada de la muestra pregrabada** (`shared/sample-negotiation.ts`, la ejecución congelada del motor de reglas). Los precios son esos números reales; la etiqueta «Pre-recorded demo scene · not live store activity» siempre está visible. Pausa fuera de pantalla y con la pestaña oculta; con `prefers-reduced-motion` muestra la composición final.
- **Cuatro movimientos** (`HowItWorks`): Tell Agent D / explores / negotiates / You review and decide. Un solo Agent D animado a la vez; los pasos son botones reales (`aria-current`), avanzan solos hasta que el usuario elige uno.
- **Demo interactiva** (`LiveDemo`): la muestra pregrabada pasa por el **mismo** `Stage`, adaptador y director que la pantalla real, con pausa/velocidad/saltar/repetir. Etiquetada como demo.
- **Aprobación humana** (3 pasos separados), **PayPal Sandbox**, **Real vs. simulado** (la fila del motor sigue a `/api/config`) y CTA final.

## 2. Brief (`/v3/brief`)

«What are we hunting for today?» Misma extracción que la versión clásica (`lib/request-parse.ts`); lo único nuevo es la presentación (`lib/v3/brief.ts`).

- Agent D escucha: una reacción *thinking* por ráfaga de escritura (máx. una cada 900 ms), no por pulsación.
- Agent D **repite solo lo que entendió** («Got it: Running shoes…, up to €100.00.»). Sin presupuesto: pregunta cuánto; sin producto: lo pide. No inventa comprensión.
- **Tarjeta «Your mission»** siempre editable: Looking for, Maximum budget, What matters most (radio), Preferences (opcionales). Muestra «from your sentence» mientras el campo sigue a la frase.
- Validación idéntica al servidor (3–120 caracteres, €50–€10 000, enteros en céntimos). Los errores aparecen tras el primer intento; los del servidor (`fieldErrors`, `SCENARIO_UNAVAILABLE`) se muestran tal cual. Un intento inválido o un error provoca una reacción *surprised* (no un fallo comercial).
- Enter inicia, Shift+Enter nueva línea. Doble envío bloqueado. Semántica de presupuesto y preferencias **sin cambios**; el cuerpo es el mismo `POST /api/negotiations`.

## 3. Negociación (`/v3/negotiation/[id]`)

Fases (las que registra el backend): Understanding → Finding stores → Collecting offers → Negotiating → Evaluating → Complete. La barra de progreso nunca va por delante de la fase del último evento visible.

- **Escenario** (`Stage`): cuatro tiendas con toldo de su color, y debajo la «calle» por la que camina Agent D (transform con unidades de contenedor, no layout). La tienda donde está Agent D se destaca; la que gana se marca «Best match».
- **Cada tienda** muestra, según lo registrado: estado, precio inicial, precio vigente (con el anterior tachado si bajó), entrega, garantía, envío y **elegibilidad solo cuando existe el evento** (`Eligible · scored N/100` o `Not eligible: …`). Nada se adelanta a su evento.
- **Burbuja y panel de actividad**: una frase corta por evento registrado («Zefiro Express has replied: €266.99, down from €282.08.»). El **log persistido** (`feedText` literal) se muestra aparte y completo; las frases no lo sustituyen.
- **Fallback de IA / validación del servidor**: chip junto a Agent D (7 s) y, para siempre, en el log: «AI fallback · not a store decision», «Server validation · not a store decision». No cambian el gesto de la mascota.
- **Precio**: `PriceTracks` (apertura, actual y presupuesto) con las cifras impresas siempre.
- **Detalle de tienda**: términos, precio, último mensaje (solo si procede de IA/fallback), y su historial.
- **Motor V0 (replay)**: pausa, 1×/2×/4×, saltar al resultado, repetir. Velocidad por defecto 1× (cada reacción de Agent D cabe entre dos eventos). Si el usuario acelera, el sprite y el paseo se aceleran juntos hasta 2×.
- **Motor multiagente (live)**: sin controles de replay (es tiempo real). Los eventos aparecen al persistirse (polling 1 s). «Waiting for X to reply» solo con el estado registrado de petición sin respuesta.
- **Final**: tarjeta «Agent D's recommendation is ready» con CTA a la revisión. Aclara que **no se ha pagado nada**. Si falla: «No deal this time.» y enlace a nueva misión.

## 4. Revisión (`/v3/deals/[id]`)

- «Agent D found your best deal.» con Agent D presentando (*success*, una vez al abrir; recomendar no es autorizar).
- Recomendación: producto, tienda, precio final, desglose artículo + envío, entrega, garantía, envío, devoluciones.
- **Ahorro solo si es aritmética válida**: «€X lower than {tienda}'s opening price» (`discountCents`, si > 0) y «€Y under your budget». No hay «ahorro vs. mercado» ni métricas inventadas.
- Por qué: resumen, **ventajas** y **compensaciones**, etiquetados como *AI analysis* o *Rule-based explanation*; avisos de fallback del motor y de la explicación. Para multiagente, «How the agents ran».
- **Comparativa**: tabla en pantallas anchas (mejor para lector de pantalla) y una tarjeta por tienda en móvil; barras de apoyo con el valor siempre impreso; chips «Lowest price / Fastest / Longest warranty» solo marcan el mejor valor por fila; ordenación (Best match / Lowest price / Fastest) con no elegibles siempre al final.
- **Aprobación** (`ApprovalCard`): botón explícito sobre la oferta exacta, elegible y no expirada. Tras el 2xx del servidor que nombra esa oferta: «Approved. You haven't paid yet.» y botón «Continue to PayPal payment». **No hay redirección automática.** Agent D hace *accept* solo con esa confirmación. Estados: ya aprobada, pagada, expirada, error del servidor, negociación aún en curso, sin oferta.

## 5. Checkout (`/v3/checkout/[id]`)

Mismo flujo que el clásico (`lib/v3/use-paypal-checkout.ts` es un port fiel): SDK v6 Sandbox, elegibilidad EUR, `POST /api/paypal/orders` solo con el id de sesión, botón oficial `<paypal-button>`, captura al aprobar.

- Agent D, pequeño y quieto, junto al resumen del pedido; **nada animado cerca del botón**.
- Estados: `loading_sdk`, `ready`, `preparing`, `waiting`, `confirming`, `completed`, `cancelled`, `unconfirmed` (con «Check payment status» y el estado concreto: «PayPal has not confirmed the result yet», etc.), `error`, `unavailable`.
- Un pago es `completed` **solo si el registro del servidor dice `completed`** (más estricto que «la petición no falló»). Cualquier otra cosa queda `unconfirmed`. La aprobación en PayPal no es captura.
- Agent D celebra (*payment_approved*) una vez, solo para un pago `completed` (al verificarlo o al abrir una sesión ya pagada). Recibo con importe, orden PayPal y captura.

## Responsive

- **≥ 672 px de contenedor**: tiendas en 4 columnas y Agent D caminando por la calle.
- **< 672 px**: barra fija con Agent D y su frase; tiendas en un carrusel con *scroll-snap* (la visitada se centra sola); detalle de tienda en línea; panel de actividad compacto; comparativa en tarjetas.
- Comprobado en 1360 px y 375 px sin desbordamiento horizontal.

## Accesibilidad

- Contrastes AA (ver `DESIGN_SYSTEM.md`), foco visible, enlace «Skip to content», un `h1` por pantalla, landmarks, `lang="en"`.
- Estado siempre en texto; color e iconos solo refuerzan. Las animaciones nunca son el único canal.
- Regiones `role="status"` para la frase actual de Agent D, el brief y los avisos; el log es una lista normal (no `aria-live`) para no duplicar anuncios.
- Imágenes decorativas `aria-hidden`/`alt=""`; Agent D tiene nombre (`role="img"`) o es decorativo si hay un texto equivalente al lado.
- Objetivos táctiles ≥ 44 px (botones, chips interactivos, enlaces del pie).
- `prefers-reduced-motion`: ver `MOTION_AND_MASCOT.md`.
