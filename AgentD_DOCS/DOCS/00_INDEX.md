# 00 — Índice y guía de implementación

**Proyecto:** AgentD · **Versión:** 1.0 · **Fecha:** 11/11/2026 · **Idioma del producto:** inglés · **Idioma de las especificaciones:** español.  
**Estado:** especificación de MVP de demostración, no documentación de un producto comercial operativo.

## 1. Qué construimos

AgentD es una web de compra asistida por IA. El usuario describe un producto y preferencias. Cuatro **agentes vendedores simulados** responden con ofertas y concesiones dentro de políticas predefinidas. Un agente comprador las evalúa mediante IA, un motor determinista comprueba elegibilidad y condiciones, y el usuario decide si pagar la oferta elegida mediante **PayPal Sandbox**. Todo el proceso se representa con una red animada de agentes y un feed de actividad.

**Principio de honestidad de producto:** «negociación» significa negociación **simulada y regida por políticas**, no contacto con comercios reales; «ahorro» es la diferencia entre precio inicial y final del mismo vendedor simulado, no ahorro frente a un precio real de mercado. «Mejor oferta» se refiere a las cuatro ofertas simuladas de esa sesión.

## 2. Documentos y responsabilidades

| Archivo | Contenido | Lector principal |
|---|---|---|
| [01_PRD.md](01_PRD.md) | Problema, usuario, objetivos, métricas, límites | Product / stakeholders |
| [02_FUNCIONALIDADES_Y_CARACTERISTICAS.md](02_FUNCIONALIDADES_Y_CARACTERISTICAS.md) | F01–F10: historias, reglas, estados y aceptación | Product / ingeniería / QA |
| [03_FLUJOS_UX.md](03_FLUJOS_UX.md) | Recorridos, alternativas, navegación y copy | UX / frontend |
| [04_DISENO_UI_Y_DESIGN_SYSTEM.md](04_DISENO_UI_Y_DESIGN_SYSTEM.md) | Pantallas, componentes, tokens, responsive, a11y | Diseño / frontend |
| [05_MOTION_DESIGN.md](05_MOTION_DESIGN.md) | Coreografía, eventos y motion accesible | Motion / frontend |
| [06_ARQUITECTURA_TECNICA.md](06_ARQUITECTURA_TECNICA.md) | Stack, responsabilidades, IA, pagos, seguridad | Tech lead / backend |
| [07_MODELO_DE_DATOS_Y_APIS.md](07_MODELO_DE_DATOS_Y_APIS.md) | Entidades, contratos y validaciones | Backend / frontend / QA |
| [08_BACKLOG_PRIORIZADO.md](08_BACKLOG_PRIORIZADO.md) | Orden y dependencias de implementación | Product / developer |
| [09_CRITERIOS_DE_ACEPTACION.md](09_CRITERIOS_DE_ACEPTACION.md) | Escenarios verificables y pruebas de entrega | QA / product |
| [10_RIESGOS_DECISIONES_Y_PREGUNTAS_ABIERTAS.md](10_RIESGOS_DECISIONES_Y_PREGUNTAS_ABIERTAS.md) | Registro de riesgos, ADRs y supuestos | Todo el equipo |

[Resumen de una página](../RESUMEN_SIMPLIFICADO.md).

## 3. Decisiones transversales, fuente única de verdad

| Clave | Decisión |
|---|---|
| Marca provisional | AgentD (no sugiere afiliación oficial con PayPal) |
| Versiones | **V0 = MVP obligatorio**; **V1 = voz opcional**; **V2 = conversación multimodal y comercio real, fuera de hackathon** |
| Pantallas | **S01 Discover**, **S02 Live Negotiation**, **S03 Best Deal**, **S04 Checkout & Confirmation** |
| Vendedores | Exactamente **4**: NOVA (precio), ORBIT (entrega), PRISM (valor/garantía), VERTEX (negociación dura) |
| Orquestación | Secuencia controlada de **6 fases** y eventos estructurados; no agentes autónomos persistentes |
| IA | LLM real interpreta la intención y genera explicación comercial; backend valida y determina el ganador elegible |
| Resultado | Una oferta recomendada por sesión válida, pero no un vendedor ganador fijo |
| Pagos | PayPal Orders v2, JS SDK v6, **Sandbox**; importe del servidor, aprobación explícita |
| Persistencia | Sesiones/órdenes en Supabase; sin cuentas personales en V0 |
| Formatos | EUR, precios en céntimos enteros, fechas ISO 8601 UTC, IDs opacos |
| Experiencia | UI dark-first, desktop-first, responsive, ingles; accesibilidad WCAG 2.2 AA como objetivo |
| Demo | Escenario de referencia ensayado + búsqueda libre; 2:30–2:45 minutos de vídeo objetivo |

## 4. Trazabilidad

| Funcionalidad | Pantallas | Entidades principales | Pruebas |
|---|---|---|---|
| F01 Intención de compra | S01 | ProductIntent | AC-F01, QA-01 |
| F02 Escenario y vendedores | S02 | SellerAgent, Offer, NegotiationSession | AC-F02, QA-02 |
| F03 Reproducción de negociación | S02 | NegotiationEvent | AC-F03, QA-03 |
| F04 Evaluación de IA | S02, S03 | Evaluation | AC-F04, QA-04 |
| F05 Oferta y aprobación humana | S03 | SelectedOffer, NegotiationSession | AC-F05, QA-05 |
| F06 Pago PayPal Sandbox | S04 | PaymentAttempt | AC-F06, QA-06 |
| F07 Recuperación, replay y demo | S02–S04 | NegotiationSession | AC-F07, QA-07 |
| F08 Transparencia y comparativa | S02, S03 | Offer, NegotiationEvent | AC-F08, QA-08 |
| F09 Dictado y transcripción (V1) | S01 | VoiceTranscript (efímero) | AC-F09, QA-09 |
| F10 Respuestas habladas (V1) | S01–S03 | VoiceUtterance (efímero) | AC-F10, QA-10 |

## 5. Convenciones

- **MUST / obligatorio**: condición imprescindible para considerar la implementación correcta.
- **SHOULD / recomendable**: alta prioridad si no compromete la entrega.
- **V0**: ejecutable en navegador, no simple maqueta. **V1/V2**: no bloquearán V0.
- **Términos:** *oferta inicial*, *contraoferta final*, *oferta elegible*, *oferta recomendada*, *pago capturado*. No usar «compra realizada» antes de confirmar la captura.
- Los mensajes del feed representan eventos reales del **orquestador simulado**. No presentarlos como conversaciones reales con tiendas.
- Un diagrama es una visualización; todos los cambios relevantes deben estar disponibles también en texto accesible.

## 6. Entregables de hackathon

- Sitio web funcional y URL pública, o guía reproducible de ejecución completa.
- Código público con README, instrucciones de configuración, variables de entorno de ejemplo, licencia abierta visible y ningún secreto expuesto.
- Descripción del proyecto y de qué hace realmente la IA.
- Vídeo en YouTube, público, con duración **inferior a 3 minutos**; recorrido funcionando y no solo mockups.
- Evidencia verificable de orden y captura de PayPal Sandbox, con identificadores saneados cuando corresponda.

## 7. Fuentes de implementación verificadas (11/11/2026)

- Reglas y criterios: https://paypalaihackathon.devpost.com/rules
- PayPal SDK JavaScript v6: https://developer.paypal.com/sdk/js/set-up/
- PayPal REST / Orders v2: https://developer.paypal.com/api/rest/integration/orders-api
- Idempotencia: https://developer.paypal.com/api/make-api-requests
- Web Speech API (V1): https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

Las fuentes externas pueden actualizarse. En caso de diferencia, comprobar la documentación vigente antes de integrar.

## 8. Rediseño UX/UI

La dirección visual vigente (light, tokens, visualización de negociación, navegación futura) está en `11_REDISENO_UX_UI.md` y sustituye a la parte «dark» de `04_DISENO_UI_Y_DESIGN_SYSTEM.md`.
