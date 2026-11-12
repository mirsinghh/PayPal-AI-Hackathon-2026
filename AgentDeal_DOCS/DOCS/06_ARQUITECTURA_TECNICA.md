# 06 — Arquitectura técnica del MVP

**Principio:** arquitectura monolítica modular y funcional, optimizada para que una persona pueda implementarla, desplegarla y depurarla. No hay cuatro procesos de IA autónomos; hay una **orquestación determinista** que genera eventos y un **modelo de IA real** que interpreta/explica.

## 1. Stack y justificación

| Capa | Tecnología propuesta | Razón | Alternativa |
|---|---|---|---|
| Web + API | Next.js App Router + TypeScript | Proyecto único, despliegue rápido | React + Express si ya está iniciado |
| Estilos | Tailwind CSS + shadcn/ui | Consistencia y velocidad | CSS modules |
| Motion | Motion for React | Gestos, reveals y estados | CSS transitions |
| Grafo | React Flow (`@xyflow/react`) | Nodos/edges personalizados, composición | SVG/HTML en V0 muy urgente |
| IA | LLM con salida estructurada | Interpretación y explicación real | Otro proveedor con adaptador |
| Base de datos | Supabase/PostgreSQL | Persistir sesiones y pagos; bajo overhead | Postgres gestionado existente |
| Pagos | PayPal Orders v2 + JavaScript SDK v6 | Sandbox verificable y pago aprobado | Ninguna sustitución para V0 |
| Hosting | Vercel + Supabase | Entrega web pública | Render u otro hosting HTTPS |
| Voz V1 | Web Speech API | Añadir dictado/TTS con coste bajo | Speech API externa |

**Evitar:** colas distribuidas, microservicios, vector DB, scraping de retailers, agentes multi-framework y sockets en tiempo real. La «actividad en directo» corresponde al timeline de la simulación local, no a un canal remoto de vendedores.

## 2. Diagrama lógico en texto

**Navegador** → página S01 → **API de sesión** → `IntentNormalizer` (LLM) → `ScenarioBuilder` (políticas sellers) → `OfferValidator` → `RankingEngine` → `ExplanationGenerator` (LLM) → **PostgreSQL**.  
**Navegador** ← obtiene `NegotiationSession` + `events` → `PlaybackController` → grafo, feed y comparación.  
**Navegador** → aprobación expresa S03 → **API de pagos** → oferta guardada y validada → **PayPal Orders v2 Sandbox** → JS SDK v6 aprobación → captura en API → verificación de resultado → **PostgreSQL** → S04 confirmación.

La IA participa en comprensión y evaluación, pero nunca decide el importe que será cargado.

## 3. Módulos y responsabilidades

| Módulo | Responsabilidad | No debe hacer |
|---|---|---|
| `IntentNormalizer` | Convertir entrada humana a estructura de producto y preferencias; normalizar idioma | Inventar presupuesto o cambiar límites del usuario |
| `SellerPolicyRegistry` | Exponer 4 perfiles y límites de concesión | Consultar tiendas externas o afirmar contratos comerciales |
| `ScenarioBuilder` | Generar ofertas iniciales/finales plausibles para un escenario hipotético | Prometer precios de mercado reales |
| `OfferValidator` | Verificar céntimos, monotonía de descuento, policy floor, budget y términos | Confiar en salida libre del LLM |
| `RankingEngine` | Filtrar elegibilidad, puntuar y resolver empates | Elegir siempre el mismo seller |
| `ExplanationGenerator` | Producir razones concretas desde ofertas validadas | Añadir garantías o entregas no declaradas |
| `EventComposer` | Crear timeline a partir de ofertas y decisiones | Mostrar eventos contradictorios |
| `PlaybackController` (cliente) | Reproducir por orden/tiempo, pause/speed/replay, estado UI | Modificar precios o ganador persistidos |
| `PaymentService` | Crear/capturar orden en Sandbox de oferta aprobada | Aceptar importes del cliente |
| `OrderStatusRepository` | Guardar IDs e idempotencia; resolver estados | Marcar completado por respuesta visual del SDK |
| `VoiceAdapter` (V1) | Dictado opt-in y TTS del buyer agent | Grabar o subir audio sin explicación/consentimiento |

## 4. Preparación de sesión (sin agentes autónomos)

1. El backend valida intención y crea un identificador opaco.
2. Llama al LLM para normalizar categoría/atributos si es necesario; las entradas explícitas del usuario tienen prioridad.
3. Genera cuatro `SellerAgent` virtuales con políticas versionadas.
4. Construye ofertas iniciales y finales **ficticias**, respetando políticas y presupuesto, usando aritmética entera. Establece al menos una oferta elegible si puede hacerlo coherentemente.
5. Valida cada oferta. Rechaza o regenera escenarios inconsistentes; no aceptar precios arbitrarios del LLM.
6. Calcula elegibilidad/ranking según prioridad y reglas declaradas.
7. Solicita al LLM una explicación basada en los datos ya validados; valida los hechos y referencias.
8. Compone eventos con `sequence` y `atMs`, guarda la sesión y devuelve el resultado listo para reproducir.

**Optimización de la demo:** generar todo el escenario antes de iniciar animación; durante la preparación mostrar loading real. Así el timeline funciona sin esperas intermedias y nunca necesita que cuatro LLM respondan al ritmo de la UI.

## 5. IA: contrato de comportamiento y calidad

### Entradas permitidas al modelo
- Descripción de producto y preferencias normalizadas, sin datos personales innecesarios.
- Ofertas finales validadas, cantidades y términos (los sellers son inventados).
- Restricciones: no citar retailers reales como agentes participantes, no prometer envío real y no crear hechos no suministrados.

### Salidas esperadas
- Interpretación estructurada de intención (categoría/atributos).
- Justificación de ganador elegido por reglas (`summary`, `reasons`, `tradeoffs`, `references`).
- Mensajes cortos de negociación que se puedan asociar a un evento, sin alterar términos validados.

### Guardarraíles
- Schema estrictamente validado; límites de longitud; escapar contenido antes de representar; nunca ejecutar texto del LLM como instrucciones.
- La recomendación estructurada del LLM es **explicativa**. El `RankingEngine` decide la oferta seleccionable.
- Timeout y hasta un reintento; fallback determinista con etiqueta de interfaz y log `ai_status=fallback`.
- Evitar el término «real AI analysis» cuando el fallback se activó. Para acreditar integración real en hackathon, probar el escenario canónico con LLM funcionando.

## 6. Reglas económicas y ranking

### Políticas estáticas por perfil

| Seller | Comportamiento | Atributo principal |
|---|---|---|
| `nova` | Reduce más agresivamente dentro de suelo autorizado | Precio |
| `orbit` | Concesión moderada y entrega más rápida simulada | Rapidez |
| `prism` | Reduce poco pero ofrece mejores términos de garantía simulada | Valor |
| `vertex` | Concede poco, posibilidad de quedar fuera del presupuesto | Firmeza |

**Restricciones:** precio final >0; precio final ≤ inicial; precio final ≥ precio mínimo del seller; descuento ≤ límite de esa política; ningún número se declara «descuento de un comercio real». El presupuesto es hard constraint.

### Ranking orientativo V0

| Prioridad | Precio | Entrega | Garantía |
|---|---:|---:|---:|
| Lowest price | 65 % | 15 % | 20 % |
| Fast delivery | 25 % | 60 % | 15 % |
| Best value | 45 % | 25 % | 30 % |

- Se normalizan precio, días de entrega y meses de garantía al rango [0,100] para **las cuatro alternativas de esa sesión**, sin comparar mercados externos.
- Las ponderaciones se aplican solo a ofertas elegibles; los criterios no representados se omiten y se redistribuyen pesos proporcionalmente.
- Desempate: puntuación mayor → precio final menor → seller ID lexicográfico, para determinismo.
- El presupuesto es siempre restricción dura. Garantía/entrega en V0 son criterios de valoración, **no compromisos de logística reales**.
- La recomendación no debe forzarse a un seller concreto ni cambiar si el usuario reproduce la sesión.

## 7. PayPal — integración central real

**Flujo técnico:**

1. S03 pide aprobación explícita; servidor guarda `approvedOfferId` vinculado a `sessionId`.
2. S04 envía únicamente `sessionId`/`offerId` o un identificador de intención de pago; **nunca el importe como fuente autoritativa**.
3. Backend revisa sesión, expiración (oferta 30 min), elegibilidad, consentimiento y que no exista un intento completado.
4. Backend llama a `POST /v2/checkout/orders` en **Sandbox** con `intent=CAPTURE`, descripción del producto de prueba, importe y moneda EUR.
5. Cliente inicia el flujo con **PayPal JS SDK v6**. `createOrder()` debe resolver una promesa con forma `{ orderId: "..." }` (no cadena sola). Las credenciales secretas y los tokens privados los maneja el servidor.
6. Tras aprobación de PayPal, backend llama a `POST /v2/checkout/orders/{orderId}/capture` usando identificador idempotente de solicitud.
7. Backend verifica que el capture esté en estado completado y que importe/moneda correspondan a lo aprobado; persiste Order ID, Capture ID y estado. No basta con un callback visual del frontend.
8. S04 consulta el estado persistido; muestra éxito únicamente en `completed`.

**Idempotencia:** encabezado `PayPal-Request-Id` cuando lo admita la API, claves únicas locales por intento, y control de reintentos. Si una llamada a capture queda incierta, recuperar estado de PayPal antes de lanzar otra.

**Webhooks:** complemento **V1 / P1** para reconciliar eventos tardíos; V0 se apoya en confirmación de captura del servidor y endpoint de recuperación. Si se implementan, validar su firma antes de procesarlos.

**Importante:** no es un marketplace con payout a cuatro merchants. Un solo merchant sandbox representa una compra hipotética; se muestra esa limitación en UI y README. No se crean órdenes comerciales reales ni envíos.

## 8. Seguridad, privacidad y fiabilidad

- Validación y rate limit en endpoints de creación de sesión y pago.
- Configuración exclusivamente Sandbox para V0; fallar al arrancar si variables indican entorno de producción.
- Secretos IA/PayPal solo en API server; jamás en bundle frontend ni repositorio.
- IDs de sesión y orden opacos; no usar IDs autoincrementales previsibles en URLs públicas.
- No guardar email, dirección, datos de tarjeta ni credenciales PayPal del comprador.
- Normalizar y escapar texto de entradas, prompts y mensajes; restringir tamaño/payload.
- En logs: trazas técnicas, IDs opacos, eventos, latencias y códigos de error; sin prompts completos ni identificadores del comprador.
- HTTPS en deploy; configurar origen/variables separadas; rotar claves si se filtran.
- Estados de pago recuperables, sin repetir captura en refresh o retry.

## 9. Propuesta de organización modular (sin código)

| Área | Responsabilidad |
|---|---|
| `app/` | S01–S04, estados de carga/error y navegación |
| `components/ui/` | Botones, inputs, badges, avisos |
| `components/negotiation/` | Diagrama, nodos, edges, activity feed y playback |
| `features/intent/` | Formulario y validaciones |
| `features/deals/` | Resumen, criterios y tabla |
| `features/checkout/` | SDK de PayPal y estado visual |
| `server/negotiation/` | Políticas, escenarios, validación, ranking, composición de eventos |
| `server/ai/` | Adaptador proveedor y verificación de salidas |
| `server/paypal/` | Creación/captura/reconciliación |
| `server/db/` | Repositorios y migraciones |
| `shared/contracts/` | Entidades, enums y contratos compartidos |
| `tests/` | Unitarios, integración y E2E |

## 10. Variables de entorno (nombres, sin valores)

| Variable | Uso | Exposición |
|---|---|---|
| `PAYPAL_ENV` | Debe ser `sandbox` | Servidor |
| `PAYPAL_CLIENT_ID` | Identificación de app; usar mecanismo seguro de SDK | Config según integración |
| `PAYPAL_CLIENT_SECRET` | API auth | **Servidor exclusivamente** |
| `AI_API_KEY` | Proveedor LLM | **Servidor exclusivamente** |
| `AI_MODEL` | Nombre del modelo | Servidor |
| `DATABASE_URL` | Conexión a DB | **Servidor exclusivamente** |
| `APP_BASE_URL` | Origen público HTTPS | Config de servidor |
| `NEXT_PUBLIC_APP_NAME` | Marca UI | Pública |

El archivo `.env.example` llevará solo nombres/valores ficticios; README explicará cómo crear cuentas sandbox merchant y buyer. Para JS SDK v6, verificar también requisitos de client token antes de integrar.

## 11. Observabilidad, pruebas y despliegue

- **Eventos de producto:** `intent_submitted`, `session_ready`, `negotiation_started`, `negotiation_completed`, `offer_approved`, `paypal_order_created`, `paypal_capture_completed`, `paypal_capture_failed`.
- **Correlación:** `sessionId` → `selectedOfferId` → `paymentAttemptId` → `paypalOrderId`/`captureId`.
- **Pruebas unitarias:** validadores, ranking, precios, desempate, fallback y expiración.
- **Pruebas integración:** LLM salida estructurada; PayPal Sandbox create/capture; idempotencia.
- **E2E mínimo:** escenario canónico, variante ganadora por entrega, escenario con error IA y una cancelación de PayPal.
- **Despliegue:** variables en proveedor, migraciones, CORS/origin apropiado, HTTPS, URL pública, smoke test y documento de ejecución local.

## 12. Documentación de referencia

- https://developer.paypal.com/sdk/js/set-up/ — SDK v6 y `{ orderId }`.
- https://developer.paypal.com/api/rest/integration/orders-api — Orders v2 crear/capturar.
- https://developer.paypal.com/api/make-api-requests — idempotencia en requests.
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition — soporte limitado en V1.

**Relacionado:** [07 Modelo y APIs](07_MODELO_DE_DATOS_Y_APIS.md) · [09 QA](09_CRITERIOS_DE_ACEPTACION.md).
