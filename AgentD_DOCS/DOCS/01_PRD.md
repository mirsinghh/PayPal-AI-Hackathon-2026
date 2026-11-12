# 01 — Product Requirements Document (PRD)

**Producto:** AgentD · **Release:** V0 hackathon · **Propietario:** Product Lead · **Estado:** lista para construir.

## 1. Resumen

AgentD demuestra cómo una persona puede delegar la comparación y negociación de una compra a un asistente de IA. La búsqueda conduce a cuatro vendedores **ficticios** con políticas distintas. El sistema genera ofertas creíbles como escenario hipotético, negocia concesiones limitadas, evalúa criterios del usuario y presenta una elección verificable antes de solicitar una orden de prueba de PayPal.

**Visión:** pasar de «buscar y comparar por cuenta propia» a «declarar intención, dejar negociar y aprobar».

## 2. Problema y oportunidad

**Problema:** dispersión de información, múltiples fichas de producto difíciles de comparar, esfuerzo para negociar y escasa claridad sobre por qué una oferta es realmente conveniente.  
**Oportunidad:** mostrar el comercio asistido y la formación de ofertas entre agentes de manera comprensible y confiable.  
**Diferenciación:** negociación visual simultánea, políticas de venta diferenciadas, trazabilidad de decisiones y pago aprobado por humano.

**Límite de la tesis:** la demo no demuestra descuentos negociados con merchants existentes ni validez de precios comerciales. Demuestra el **patrón técnico y UX** para sistemas agent-to-agent commerce.

## 3. Usuarios

| Persona | Objetivo | Frustración | Momento de valor |
|---|---|---|---|
| Comprador pragmático (principal) | Encontrar buena oferta que cumpla presupuesto | Comparar múltiples tiendas consume tiempo | Recomendación justificable y transparente |
| Comprador orientado al valor | Equilibrar garantía/entrega y precio | La oferta más barata no siempre es mejor | Comparativa según sus prioridades |
| Juez/evaluador de hackathon | Comprender y probar la propuesta rápidamente | Demos falsas o imposibles de ejecutar | Flujo completo, repetible y pago Sandbox real |

### Jobs to be done

- «Cuando quiera comprar algo, quiero expresar mis requisitos una vez para ahorrar investigación.»
- «Cuando existan varias ofertas, quiero saber qué cumple y qué no, y por qué.»
- «Antes de pagar, quiero verificar el importe exacto y tener la última palabra.»

## 4. Objetivos y no objetivos

| Objetivo V0 | Evidencia de cumplimiento |
|---|---|
| Experiencia completa en una sesión | S01→S02→S03→S04 sin bloqueos |
| IA funcional y explicable | Análisis registrado con proveedor/modelo y explicación basada en ofertas |
| Cuatro estrategias reconocibles | Cada agente propone concesiones diferentes |
| Visualización de proceso | Secuencia sincronizada con la oferta y el feed |
| PayPal central | Orden creada con oferta validada, aprobación y captura Sandbox |
| Acceso externo | Hosted demo o pasos reproducibles de instalación |

**No objetivos:** marketplace multi-merchant real, precios actuales del mercado, distribución de fondos a vendedores, inventario, fulfillment, agentes persistentes, facturación, perfiles, carrito multiartículo, pagos reales, idiomas adicionales en V0.

## 5. Alcance V0 / V1 / V2

| V0 — Obligatorio | V1 — Después del core | V2 — Futuro fuera de hackathon |
|---|---|---|
| Búsqueda por texto, presupuesto y prioridades | Speech-to-text, transcripción, voz del agente | Conversación de voz de varios turnos y barge-in |
| Cuatro sellers simulados y política comercial | Narración sincronizada y controles de audio | Catálogos y vendedores reales con acuerdos comerciales |
| Orquestación de 6 fases, animaciones, feed | Mejoras de personalización visual | Autonomía persistente / negociación de acuerdos externos |
| Evaluación real mediante LLM, validación y fallback honesto | Compatibilidad ampliada de navegador | Marketplace payouts / operaciones reales |
| Aprobación humana, PayPal Sandbox, confirmación | Webhooks/verificación asíncrona más robusta si procede | Cuentas, órdenes comerciales, logística |

## 6. Contexto y requisitos de negocio

1. La búsqueda puede referirse a cualquier descripción de producto **para un escenario hipotético**. Nunca sugerir una oferta como precio real de tienda.
2. En todas las búsquedas válidas se generan exactamente cuatro vendedores y al menos una oferta elegible dentro del presupuesto. Si no se puede crear un escenario coherente, mostrar error reparable; no inventar un ganador a toda costa.
3. Una oferta elegible respeta presupuesto, descuentos permitidos y restricciones imprescindibles modeladas.
4. El mejor match depende de prioridad declarada y criterios; un vendedor no gana por diseño.
5. El LLM no autoriza cantidades de cobro: el backend solo usa datos validados y persistidos.
6. El usuario debe aprobar la oferta. Una recomendación nunca crea ni captura automáticamente un pago.
7. Solo PayPal **Sandbox**, un merchant de prueba que representa a vendedores simulados.
8. Las referencias a PayPal deben describir una integración, no sugerir patrocinio o producto oficial.

## 7. Métricas y definición de éxito

| Métrica | Objetivo de salida V0 | Instrumentación |
|---|---|---|
| Flujo principal E2E | 100 % en escenario canónico y dos variantes probadas | Test manual + logs |
| Transición S01→S03 | Sin callejones sin salida tras entradas válidas | Eventos de sesión |
| Orden/captura | Importe igual al seleccionado; sin capturas duplicadas en reintentos | Order ID, capture ID, estado |
| Comprensibilidad de demo | Propuesta visible en primeros 15 segundos | Ensayo de vídeo |
| Accesibilidad base | Navegación teclado, contraste y reducción de movimiento | Checklist de QA |
| Presentación | Vídeo de 2:30–2:45, siempre <3:00 | Exportación y publicación |

No fijar conversiones, GMV ni «ahorro promedio» como si fueran métricas reales; no existe un mercado real operando.

## 8. Restricciones no funcionales

- **Rendimiento:** respuesta visual inmediata a cada acción; carga del motor asíncrona con estados claros; animación fluida objetivo 60 fps en desktop medio.
- **Seguridad:** secretos PayPal/IA solo en servidor; importes en céntimos enteros; controles anti-replay; comprobación de captura en servidor.
- **Privacidad:** datos mínimos; sin cuenta; evitar PII en prompts y logs; voz V1 opt-in sin guardar audio.
- **Accesibilidad:** WCAG 2.2 AA como objetivo; alternativa textual del grafo; `prefers-reduced-motion` respetado; el audio no debe iniciar solo.
- **Fiabilidad:** fallback si falla LLM etiquetado; flujo de pago con errores recuperables y estado consultable.
- **Documentación:** README con sandbox y modelo de IA; demo reproducible sin credenciales privadas compartidas.

## 9. Experiencia narrativa para vídeo

1. **Hook (0:00–0:15):** «Stop searching. Start negotiating» y problema.
2. **Intento (0:15–0:35):** producto, presupuesto, prioridad; si V1 está lista, voz en vez de tipeo.
3. **Negociación (0:35–1:27):** cuatro agentes, preguntas, contraofertas, descarte, cambio de estado.
4. **Decisión (1:27–1:58):** IA argumenta y muestra por qué ganó el vendedor.
5. **Pago (1:58–2:32):** aprobación humana, PayPal Sandbox, captura.
6. **Cierre (2:32–2:42):** confirmación, valor y aclaración de prototipo.

Los tiempos son objetivo de montaje, no promesa de duración de API/red.

## 10. Dependencias, bloqueos y salida

**Dependencias:** credenciales sandbox, cuenta merchant/buyer de prueba, API key LLM, despliegue HTTPS, proyecto Supabase o almacenamiento equivalente.  
**Bloqueo de salida:** no hay checkout real de sandbox, faltan pruebas E2E o la demo da a entender que las ofertas son de comerciantes reales.  
**Trade-off aceptado:** orquestar un guion de eventos funcional y trazable en lugar de cuatro agentes autónomos; invertir tiempo en claridad, fiabilidad y buen diseño.

**Referencias internas:** [02 Funcionalidades](02_FUNCIONALIDADES_Y_CARACTERISTICAS.md) · [08 Backlog](08_BACKLOG_PRIORIZADO.md) · [09 Aceptación](09_CRITERIOS_DE_ACEPTACION.md).
