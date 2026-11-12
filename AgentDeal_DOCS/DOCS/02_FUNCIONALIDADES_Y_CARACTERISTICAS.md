# 02 — Funcionalidades y características

**Convenciones:** F01–F08 = **V0 / MVP**; F09–F10 = **V1 / Futuro**. Cada ficha tiene historia de usuario, recorrido, reglas, estados, errores y aceptación. Las pruebas detalladas se identifican en [09](09_CRITERIOS_DE_ACEPTACION.md).

## F01 · Captura de intención de compra

| Campo | Especificación |
|---|---|
| **Descripción** | Recoger nombre/descripción de producto, presupuesto EUR, prioridad principal y preferencias opcionales; normalizar intención con IA. |
| **User story** | Como comprador, quiero expresar qué necesito y mis límites para que el sistema compare ofertas según mis criterios. |
| **Prioridad** | **V0 / P0** |
| **Pantalla** | S01 Discover |
| **Flujo principal** | Escribe producto → introduce presupuesto → elige prioridad → opcionalmente preferencias → pulsa «Find my best deal» → validación → creación de sesión. |
| **Reglas de negocio** | Producto no vacío (3–120 caracteres); presupuesto entre 50 y 10.000 EUR, máximo dos decimales; prioridad única `lowest_price`, `fast_delivery` o `best_value`; preferencias no vinculantes en V0 salvo presupuesto; no inferir especificaciones inexistentes como certificadas. |
| **Estados** | `idle`, `editing`, `invalid`, `submitting`, `created`, `error`. |
| **Errores y límites** | Nombre vacío, importe inválido, cifra fuera de rango, doble clic, timeout, término ambiguo: mostrar error junto al campo, retener entradas, desactivar envío duplicado, permitir reintento. |
| **Criterios de aceptación** | **AC-F01:** validar campos, bloquear envíos inválidos, crear sesión con los mismos requisitos normalizados y pasar a S02; el formulario conserva datos tras error. |

## F02 · Preparación de escenario y agentes vendedores

| Campo | Especificación |
|---|---|
| **Descripción** | Generar cuatro personajes con políticas de concesión, ofertas iniciales y finales y un escenario hipotético adaptado al producto. |
| **User story** | Como comprador, quiero recibir propuestas de distintos vendedores para comparar alternativas dentro de mis límites. |
| **Prioridad** | **V0 / P0** |
| **Pantalla** | S02 Live Negotiation |
| **Flujo principal** | Crear sesión → normalizar producto → instanciar NOVA, ORBIT, PRISM, VERTEX → generar precios/condiciones de prueba → validar políticas → generar eventos de negociación. |
| **Reglas de negocio** | Exactamente cuatro vendedores; políticas inmutables por sesión; importes enteros en céntimos; `minPrice <= finalPrice <= initialPrice`; al menos un `finalPrice <= budget`; descuento jamás supera máximo configurado; las condiciones no son garantías comerciales reales; si el escenario es inconsistente, regenerar una vez o error recuperable. |
| **Estados** | `generating`, `ready`, `invalid_scenario`, `failed`. |
| **Errores y límites** | Precio negativo, incoherencia entre descuento anunciado y real, seller duplicado, IA inventa términos, presupuesto poco plausible: aplicar validación server-side, bloquear afirmaciones de precio de mercado y señalar el carácter ficticio. |
| **Criterios de aceptación** | **AC-F02:** cuatro agentes distintos con estrategias reconocibles, políticas respetadas, ofertas coherentes, una opción elegible y aviso «Simulated sellers & offers». |

## F03 · Negociación guiada y reproducción de eventos

| Campo | Especificación |
|---|---|
| **Descripción** | Visualizar seis fases de negociación con grafo, nodos, enlaces, precios cambiantes y feed textual sincronizado. |
| **User story** | Como comprador, quiero entender qué pregunta mi agente, qué conceden los vendedores y por qué descarta opciones. |
| **Prioridad** | **V0 / P0** |
| **Pantalla** | S02 Live Negotiation |
| **Flujo principal** | Sesión lista → `Initialize` → `Discover` → `Receive offers` → `Negotiate` → `Evaluate` → `Complete` → CTA para S03. |
| **Reglas de negocio** | Eventos ordenados por `atMs` y `sequence`; nunca mostrar precio cambiado antes de contraoferta; no habilitar S03 antes de sesión completa; reproducción de ~52 s a 1×, control 2× y pausa opcional; no declarar procesamiento concurrente real si es guionado. |
| **Estados** | `loading`, `playing`, `paused`, `finished`, `replay`, `failed`. |
| **Errores y límites** | Evento desconocido: omitir y loguear; feed largo: scroll controlado; pantalla pequeña: sustituir grafo por lista accesible; pestaña oculta: reanudar por índice lógico, evitar acumular animaciones. |
| **Criterios de aceptación** | **AC-F03:** eventos producen cambios visuales/textuales sincronizados, no se duplican al re-renderizar, finaliza en estado estable, admite replay y reduced motion. |

## F04 · Evaluación real asistida por IA

| Campo | Especificación |
|---|---|
| **Descripción** | Usar modelo de IA para interpretar prioridades y elaborar explicación comparativa; ranking elegible y selección final se verifican en servidor. |
| **User story** | Como comprador, quiero una recomendación explicada según lo que pedí, no solamente el precio menor. |
| **Prioridad** | **V0 / P0** |
| **Pantallas** | S02, S03 |
| **Flujo principal** | Ofertas finales validadas → filtrar inelegibles → calcular ranking consistente → pedir al LLM análisis en formato estructurado → comprobar referencias y hechos → presentar argumentos sustentados. |
| **Reglas de negocio** | Solo citar vendedores, precios y condiciones incluidos en payload confiable; presupuesto = restricción dura; prioridades ponderan los elegibles; el LLM no puede cambiar importes ni adjudicar ganador inelegible; guardar `aiStatus` y `modelName` para diagnóstico. |
| **Estados** | `pending`, `analyzing`, `validated`, `fallback`, `failed`. |
| **Errores y límites** | Timeout, JSON incompleto, hallucination, sugerencia sin soporte: reintentar una vez, usar explicación determinista **etiquetada como simulada** si el LLM falla. Para la entrega debe demostrarse al menos una evaluación realmente ejecutada por IA. |
| **Criterios de aceptación** | **AC-F04:** explicación alineada con criterios, referencias válidas, ningún dato económico inventado y registro auditable de una llamada de IA real en el escenario de demo. |

## F05 · Presentación de mejor oferta y aprobación humana

| Campo | Especificación |
|---|---|
| **Descripción** | Mostrar ganador, precio final, precio inicial del mismo vendedor, ahorro simulado, condiciones y razones; solicitar consentimiento de pago. |
| **User story** | Como comprador, quiero revisar la oferta elegida antes de permitir el cobro. |
| **Prioridad** | **V0 / P0** |
| **Pantalla** | S03 Best Deal |
| **Flujo principal** | Termina negociación → mostrar resumen ganador → comparar otros tres → «Approve & Continue to PayPal» → registrar aprobación y abrir S04. |
| **Reglas de negocio** | El botón se muestra solo para oferta elegible vigente; resultado solo de sesión concreta; ahorro = inicial menos final del vendedor ganador; mostrar moneda, importe, prueba Sandbox y simulación. Aprobar no significa capturar ni cobrar. |
| **Estados** | `ready`, `reviewing`, `approved`, `declined`, `expired`, `error`. |
| **Errores y límites** | Sesión expirada, oferta ausente, precios desalineados, usuario rechaza: no generar orden; CTA «Start a new negotiation»; la UI nunca reclama descuento real de mercado. |
| **Criterios de aceptación** | **AC-F05:** ganador y datos coinciden con sesión validada, consentimiento explícito y ausencia de creación de orden antes de aprobar. |

## F06 · Checkout y confirmación mediante PayPal Sandbox

| Campo | Especificación |
|---|---|
| **Descripción** | Crear una orden PayPal para la oferta aprobada, obtener consentimiento de comprador sandbox, capturar y confirmar servidor a servidor. |
| **User story** | Como comprador, quiero aceptar el precio exacto y conocer el estado real del pago de prueba. |
| **Prioridad** | **V0 / P0 crítico** |
| **Pantalla** | S04 Checkout & Confirmation |
| **Flujo principal** | Aprobación registrada → backend valida oferta, importe y expiración → crea orden → PayPal JS SDK v6 inicia aprobación → backend captura → persiste respuesta → muestra éxito solo si pago capturado. |
| **Reglas de negocio** | Intent `CAPTURE`; solo Sandbox; EUR; cantidad derivada del servidor; una sesión/oferta aprobada, merchant de prueba; idempotencia en creación/captura; guardar Order ID y Capture ID; ni secretos ni importe autoritativo del navegador. El callback `createOrder` en SDK v6 resuelve `{ orderId }`. |
| **Estados** | `not_started`, `creating`, `awaiting_approval`, `approved`, `capturing`, `completed`, `cancelled`, `failed`, `unknown_pending_reconciliation`. |
| **Errores y límites** | Cancelación, popup bloqueado, token caducado, red interrumpida, orden ya capturada, importe inconsistente: no declarar éxito sin respuesta verificada; consultar estado, permitir reintento idempotente o nuevo intento controlado. |
| **Criterios de aceptación** | **AC-F06:** creación y captura reales en Sandbox, importe exacto, confirmación con IDs, no doble cargo por reintento, no cobro sin aprobación humana. |

## F07 · Persistencia ligera, reintento y modo demo

| Campo | Especificación |
|---|---|
| **Descripción** | Mantener sesión/resultado y estado de pago para recarga; reproducir negociación guardada y facilitar escenario de referencia ensayado. |
| **User story** | Como evaluador, quiero repetir el recorrido sin perder estado, incluso si recargo o alguna API responde con retraso. |
| **Prioridad** | **V0 / P0** |
| **Pantallas** | S01–S04 |
| **Flujo principal** | Crear sesión persistente → abrir URL de sesión → replay sin regenerar precios → recuperar estado de orden al refrescar → reiniciar experiencia para una nueva sesión. |
| **Reglas de negocio** | Sesión y oferta se conservan 24 h para prueba; **oferta caduca a los 30 min** antes de crear nueva orden; replay no crea pagos; ejemplo precargado no implica hardcodeo de un resultado. |
| **Estados** | `available`, `expired`, `not_found`, `replaying`, `recovering`. |
| **Errores y límites** | URL rota, storage inaccesible, refresh durante captura, red caída: mostrar recuperación y verificación del estado de pago; nunca duplicar captura por refresh. |
| **Criterios de aceptación** | **AC-F07:** replay visual del escenario idéntico, recarga muestra sesión correcta y estado de pago real, rutas inválidas resuelven a recuperación clara. |

## F08 · Transparencia, comparativa y activity feed

| Campo | Especificación |
|---|---|
| **Descripción** | Mostrar el rastro de eventos, cumplimiento de criterios, comparación entre agentes y motivos de elección o descarte. |
| **User story** | Como comprador, quiero saber qué sucedió y por qué una oferta superó a las demás. |
| **Prioridad** | **V0 / P0** |
| **Pantallas** | S02 y S03 |
| **Flujo principal** | Durante reproducción, se agregan mensajes al feed → al terminar, se muestra tabla con cuatro ofertas y estados → cada criterio tiene explicación breve. |
| **Reglas de negocio** | Cada entrada está asociada a un evento; no publicar afirmaciones no sustentadas; etiquetas «simulated» visibles; sin colores como única forma de indicar aceptación/rechazo; comparar por precio final, entrega y garantía simuladas. |
| **Estados** | `empty`, `updating`, `complete`, `degraded_text_only`. |
| **Errores y límites** | Duplicados, datos ausentes, pantalla pequeña, lector de pantalla: feed paginado/resumido, alternativa tabular accesible y placeholders no engañosos. |
| **Criterios de aceptación** | **AC-F08:** todos los vendedores comparables, descarte con motivo, actividad sincronizada, lectura utilizable sin grafo ni audio. |

## F09 · Captura de voz y transcripción editable (V1)

| Campo | Especificación |
|---|---|
| **Descripción** | Reconocer voz del usuario para rellenar inputs de la intención y permitir corrección antes de iniciar. |
| **User story** | Como comprador, quiero describir lo que necesito hablando en lugar de escribirlo. |
| **Prioridad** | **V1 / P1; no bloquea demo V0** |
| **Pantalla** | S01 |
| **Flujo principal** | Pulsar micrófono → consentimiento del navegador → escucha → transcripción → IA extrae producto/presupuesto/preferencias → usuario revisa y confirma. |
| **Reglas de negocio** | Solo opt-in; escucha limitada y detenible; texto siempre editable; no almacenar audio; no iniciar negociación sin confirmación; fallback a inputs si SpeechRecognition no está disponible. |
| **Estados** | `unsupported`, `idle`, `permission_requested`, `listening`, `transcribing`, `review`, `error`. |
| **Errores y límites** | Micrófono denegado, ruido, idioma incorrecto, resultado ambiguo o cero voz: mostrar fallback texto y control de reintento; no asumir que SpeechRecognition funciona igual en todos los navegadores. |
| **Criterios de aceptación** | **AC-F09:** dicta, transcribe y completa formulario validable; editar transcripción; nunca inicia captura de micrófono sin acción expresa. |

## F10 · Voz del agente y narración controlada (V1)

| Campo | Especificación |
|---|---|
| **Descripción** | Reproducir respuestas habladas breves del agente comprador durante inicio, hitos y resultado. |
| **User story** | Como comprador, quiero escuchar los hallazgos relevantes sin perderme entre mensajes del grafo. |
| **Prioridad** | **V1 / P1; no bloquea demo V0** |
| **Pantallas** | S01, S02, S03 |
| **Flujo principal** | Usuario activa sonido → agente confirma intención → narra 2–3 hitos → lee recomendación → pausa y silenciado disponibles. |
| **Reglas de negocio** | Solo habla buyer agent; nunca cuatro sellers a la vez; narración basada en eventos validados; sin reproducción automática no solicitada; textos visibles aunque falle audio; no leer información financiera sensible. |
| **Estados** | `muted`, `ready`, `speaking`, `paused`, `error`, `unsupported`. |
| **Errores y límites** | Voz no disponible, silencio de navegador, navegación de ruta, solapamiento de clips: cancelar colas previas, mantener subtítulos y ofrecer mute. |
| **Criterios de aceptación** | **AC-F10:** audios sincronizados con hechos, control de volumen/mute, nunca hablan varios sellers, experiencia usable sin sonido. |

## Dependencias principales

F01 → F02 → F03 → F04 → F05 → F06.  
F07 sostiene recuperación de F02–F06. F08 consume eventos de F03 y datos de F04–F05.  
F09 amplía entrada F01; F10 consume estados/eventos de F03–F05 sin alterar reglas ni pagos.
