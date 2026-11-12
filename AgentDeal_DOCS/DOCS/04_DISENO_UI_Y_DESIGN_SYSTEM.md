# 04 — Diseño UI y design system

**Dirección:** dark AI-native fintech, sobria, tecnológica, centrada en decisiones. **Idioma de interfaz:** inglés. **Alcance visual:** V0 en escritorio y responsive; componentes de voz solo al implementarse V1.

## 1. Principios de producto y UI

1. **La intención primero:** iniciar con un objetivo claro, sin navegación irrelevante.
2. **Mostrar, no fingir:** visualizar eventos del orquestador; no hacer pasar sellers simulados por comercios reales.
3. **Confianza > espectáculo:** importes, condiciones, razones y Sandbox siempre claros.
4. **La IA trabaja; el humano decide:** ninguna pantalla sugiere pago automático.
5. **Una acción principal por estado:** la jerarquía guía el próximo paso.
6. **Motion funcional:** el movimiento explica preguntas, descuentos, descartes y selección.
7. **Accesible por defecto:** el grafo no es el único modo de entender la negociación.

## 2. Arquitectura de información

- **Header global:** marca AgentDeal, estado de paso, badge de Sandbox, enlace «About this demo».
- **S01 Discover:** hero, intención, presupuesto, prioridad, preferencias opcionales, CTA y transparencia.
- **S02 Live Negotiation:** header/progreso, panel de intención, red de agentes, feed, tabla/estado resumido y acción al resultado.
- **S03 Best Deal:** resultado, precio comparado del ganador, beneficios simulados, explicación, comparación de los cuatro, aprobación/declinación.
- **S04 Checkout & Confirmation:** importe aprobado + aclaración Sandbox, widget oficial PayPal, loading/error o confirmación del capture ID.
- No se requiere dashboard histórico, perfiles ni menú de productos.

## 3. Sistema de tokens

### 3.1 Colores

| Token | Hex | Uso |
|---|---|---|
| `color.bg.canvas` | `#080B12` | Fondo principal |
| `color.bg.surface` | `#151A26` | Tarjetas, paneles |
| `color.bg.raised` | `#1E2635` | Popovers, controles elevados |
| `color.border.default` | `#2D384B` | Contornos finos, divisores |
| `color.text.primary` | `#F8FAFC` | Titulares y números clave |
| `color.text.secondary` | `#B8C4D6` | Descripciones y detalles |
| `color.text.muted` | `#94A3B8` | Metadatos secundarios; verificar contraste |
| `color.action.primary` | `#2563EB` | CTA primario, foco activo |
| `color.ai.accent` | `#8B5CF6` | Identidad del comprador IA |
| `color.status.success` | `#10B981` | Oferta elegible / confirmado |
| `color.status.warning` | `#F59E0B` | Evaluación pendiente o límite |
| `color.status.danger` | `#F87171` | Descartado, error |
| `color.focus.ring` | `#93C5FD` | Anillo de foco sobre dark |

**Reglas:** nunca transmitir estados solo por color; acompañar de icono + etiqueta. Eliminar gradientes como fondo de texto largo. Evitar texto blanco sobre amarillo/verde claro; usar texto oscuro en badges brillantes. Probar contraste real antes de salir.

### 3.2 Tipografía

- Familia: **Geist Sans** (fallback `Inter, system-ui, sans-serif`). Monoespaciada Geist Mono o system mono solo para IDs y cifras técnicas.
- Escala desktop: Display 48/56 semibold; H1 36/44 semibold; H2 28/36; H3 20/28; Body 16/24; Body-small 14/20; Caption 12/18.
- Escala móvil: Display 36/42; H1 28/36; H2 24/32; cuerpo no inferior a 14 px (excepto metadata cuidadosamente contrastada).
- Cifras monetarias con números tabulares; separadores y símbolo EUR localizados de manera consistente (`€299.00` en copy inglés; datos almacenados en céntimos).
- Altura de línea amplia, máximo 68–76 caracteres en párrafos, evitar uppercase en textos largos.

### 3.3 Espaciado, radios, sombra y layout

| Token | Valor | Uso |
|---|---:|---|
| `space.1` | 4 px | Microseparaciones |
| `space.2` | 8 px | Icono-texto |
| `space.3` | 12 px | Filas densas |
| `space.4` | 16 px | Interior de controles |
| `space.6` | 24 px | Tarjetas |
| `space.8` | 32 px | Separaciones de sección |
| `space.12` | 48 px | Ritmo editorial |
| `radius.sm` | 8 px | Chips, campos pequeños |
| `radius.md` | 12 px | Inputs y botones |
| `radius.lg` | 16 px | Cards y paneles |
| `radius.xl` | 24 px | Superficies hero |
| `shadow.raised` | `0 8px 32px rgba(0,0,0,.24)` | Popovers/modals, no todas las cards |
| `shadow.glow` | `0 0 32px rgba(37,99,235,.16)` | Nodo AI activo, uso excepcional |

- Contenedor máximo: **1440 px**, padding desktop 32–48 px; tablet 24 px; móvil 16 px.
- Header 64–72 px; separación vertical de secciones 48–80 px.
- Targets táctiles **mínimo 44 × 44 px**; botones principales 48–52 px de alto.
- Líneas de borde 1 px, evitar glassmorphism excesivo y sombras pesadas.

## 4. Pantallas principales

### S01 — Discover

**Objetivo:** capturar intención en <30 s.  
**Jerarquía:** badge AI demo → H1 «Stop searching. Start negotiating.» → subtítulo → formulario dentro de superficie elevada → CTA → aviso visible.

| Región | Contenido | Comportamiento |
|---|---|---|
| Hero | Promesa de valor y ejemplo breve | Alineación centrada, entrada sutil |
| Input de producto | Placeholder: `e.g. Wireless noise-cancelling headphones` | Focus claro, longitud validada |
| Presupuesto | Número en EUR | Formato monetario y límites visibles |
| Prioridad | Lowest price / Fast delivery / Best value | Selección única; default `Best value` |
| Preferencias | Warranty / Fast delivery / Free shipping | Chips opcionales (no prometer verificación externa) |
| CTA | `Find my best deal` | Loading y prevención doble submit |
| Footer | Declaración de simulación | Accesible y legible |

**V1**: insertar «Speak your request» como opción equivalente al formulario, no como paso obligatorio. La funcionalidad de micrófono no aparece como activa en V0 si aún no funciona.

### S02 — Live Negotiation (pantalla hero)

**Layout ≥1200 px:** izquierda ~20 % (requisitos, presupuesto, progreso), centro ~55 % (grafo), derecha ~25 % (activity feed y ofertas).  
**Estructura:** header + fase/progreso → zona de trabajo → control replay/velocidad → CTA resultado.

- Buyer Agent en nodo destacado en el lado izquierdo del grafo; cuatro sellers a la derecha.
- Los sellers muestran nombre, estrategia, precio actual y estado, no párrafos completos.
- El feed recibe frases cortas, siempre asociadas a eventos.
- El color y la opacidad marcan evolución, **nunca son la única señal** de estado.
- Indicador `Simulated negotiation` visible a la vista; no badge `LIVE` que sugiera contacto real.
- No dejar el botón de S03 accesible hasta `negotiation_complete`.
- Alternativa accesible `View as list` con estados y eventos.

### S03 — Best Deal

**Objetivo:** decisión fundamentada antes del pago. Jerarquía:
1. `Negotiation complete` (no implica pago).
2. `Best match for your priorities` + seller ganador.
3. Precio final grande y precio inicial del **mismo vendedor** tachado.
4. Explicación IA + etiqueta de origen (AI / rule-based fallback).
5. Comparación de 4 sellers por precio final, garantía, entrega y cumplimiento de presupuesto.
6. Aviso Sandbox + CTA `Approve & Continue to PayPal`; secundario `Not now`.

**Nunca usar** «guaranteed saving», «market lowest price», «in stock» ni beneficios de envío como si se fueran a cumplir realmente.

### S04 — Checkout & Confirmation

- Columna izquierda: oferta aprobada, importe EUR y aviso «Test transaction. No real purchase or delivery.»
- Columna derecha: zona de integración PayPal; se respetan marca, botones y estados oficiales del SDK.
- Estados exclusivos: `Preparing secure checkout`, `Waiting for PayPal approval`, `Confirming payment`, `Sandbox payment completed`, `Unable to confirm payment`.
- Confirmación: identificadores Order ID y Capture ID, importe pagado, `Start a new negotiation`.
- Si captura incierta, no botón de «Buy again» hasta consultar estado.

## 5. Inventario de componentes

| Componente | Variantes | Estados críticos | Notas |
|---|---|---|---|
| `AppHeader` | Default, compact | Idle, navigation | Marca + badge Sandbox |
| `ProductSearchInput` | Text, future voice | Focus, invalid, disabled | Etiqueta persistente |
| `CurrencyInput` | EUR | Normal, invalid | Dos decimales, sin cálculos en float |
| `PrioritySelector` | 3 opciones | Selected, disabled | Radio group semántico |
| `PreferenceChip` | Selectable | Selected, hover, focus | No color-only |
| `PrimaryButton` | Primary, secondary, destructive | Hover, focus, loading, disabled | Spinner acompañado de texto |
| `AgentNode` | Buyer, Seller | Hidden, active, negotiating, rejected, winner | Nombre/importe/estado accesible |
| `AgentEdge` | Message, offer, rejected | Idle, transmitting, settled | Línea semántica, no decorativa |
| `PhaseProgress` | Steps y barra | Active, finished, error | Texto de fase siempre visible |
| `ActivityFeed` | List, compact | Empty, streaming, complete | Elementos unidos a event ID |
| `OfferCard` | Default, selected, rejected | Initial, countered, eligible, expired | Precio inicial y final distinguibles |
| `ComparisonTable` | Wide, stacked | Available, fallback | Cabeceras correctas y responsive |
| `AIReasoningCard` | AI, fallback | Loading, ready, error | No mostrar cadena interna de razonamiento |
| `ApprovalPanel` | Ready, expired | Disabled, approved | Muestra importe antes de consentir |
| `PayPalCheckoutZone` | Embedded SDK | Loading, approved, capturing, error | No imitar botón PayPal propio |
| `StatusBanner` | Info, success, warning, danger | All | Semántica y aria-live adecuada |
| `VoiceControl` (V1) | Listen, mute, replay | Permisos, unsupported, speaking | Opt-in y texto equivalente |

## 6. Responsive

| Viewport | Layout | Regla específica |
|---|---|---|
| Desktop ≥1200 px | Tres columnas en S02; 2 columnas en S04 | Grafo protagonista; feed fijo si cabe |
| Laptop 900–1199 px | S02 centro + panel lateral compacto | Panel de requisitos colapsable |
| Tablet 600–899 px | S02 grafo arriba y feed debajo | Sin scroll horizontal obligatorio |
| Mobile 320–599 px | Una columna; lista de sellers por defecto | Grafo opcional reordenable, CTA sticky sin ocultar contenido |

- Reflow sin pérdida de información hasta **320 px** de ancho.
- Los precios no se cortan; si no caben, se apilan verticalmente.
- El panel de comparación se convierte en tarjetas apiladas con campos etiquetados.
- El checkout de PayPal debe usar su contenedor responsivo y controles reales.

## 7. Accesibilidad

- Objetivo WCAG 2.2 AA: contraste mínimo **4.5:1** en texto normal y 3:1 en elementos de interfaz/gráficos relevantes.
- Orden de tabulación lógico, foco visible de al menos 2 px; navegación completa sin ratón.
- Labels persistentes, ayuda y errores asociados a campos; no depender del placeholder.
- Todos los nodos del grafo accesibles con resumen equivalente; pausar/reproducir por teclado.
- Actualizaciones de feed sin inundar el lector de pantalla; anunciar solo fases y estado final mediante región viva polite.
- Usar `prefers-reduced-motion` y permitir pausar animaciones continuas.
- Voz V1 completamente opcional, con transcripción/subtítulos y control de silencio.
- Modales con manejo de foco y cierre predecible; no robar foco durante actualizaciones de precios.

## 8. Estados vacíos, carga, éxito y error

| Contexto | Empty | Loading | Error | Recuperación |
|---|---|---|---|---|
| S01 | Placeholder y ejemplos | `Preparing your negotiation…` | Validación inline | Editar e intentar otra vez |
| S02 | `Discovering simulated sellers…` | Skeleton de nodos y progreso | `Couldn't prepare this scenario` | Retry / Edit search |
| S03 | No entrar sin resultado | `Evaluating offers…` | `Couldn't explain the result` | Ver ranking por reglas + etiqueta |
| S04 | `Ready to check out in Sandbox` | `Confirming payment…` | `Payment status unconfirmed` | Consultar estado, sin doble cargo |
| Voz V1 | `Tap to speak` | `Listening…` | `Microphone unavailable` | Text input |

## 9. Criterio de calidad visual

Antes de dar por terminado: una sola jerarquía principal por pantalla; contraste auditado; sin recortes en 320/768/1440 px; valores monetarios idénticos entre grafo, resultado, servidor y PayPal; todos los componentes con estados de carga/error; capturas visuales reales del build en el README cuando estén disponibles.
