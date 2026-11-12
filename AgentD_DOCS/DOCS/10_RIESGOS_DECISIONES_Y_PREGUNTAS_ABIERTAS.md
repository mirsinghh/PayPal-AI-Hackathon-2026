# 10 — Riesgos, decisiones y preguntas abiertas

**Versión:** 1.0 · **Propietario:** Product/Tech · **Estado:** supuestos adoptados para no bloquear el desarrollo.

## 1. Registro de riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación/plan de contingencia |
|---|---|---|---|---|
| R01 | Integración de PayPal demasiado superficial | Media | Crítico | Orders v2 create + capture, approval + IDs y estado de pago visible |
| R02 | Parece fake AI (solo plantillas) | Alta si se recorta | Crítico | LLM real interpreta/evalúa, registrar status, fallback etiquetado |
| R03 | El usuario cree que ofertas provienen de tiendas reales | Alta | Alto | Disclaimers en todas las fases, términos «simulated» y nombres ficticios |
| R04 | LLM inventa condiciones/precios | Media | Alto | Guardarraíles de schema, servidor calcula y valida ofertas |
| R05 | Precios/ganador incoherentes entre pantallas | Media | Crítico | Fuente única server, contratos cents y pruebas invariantes |
| R06 | Pago duplicado por reintento | Media | Crítico | Idempotency keys, unique constraints y reconciliación de orden |
| R07 | Se confunde aprobación con pago capturado | Media | Alto | Estados separados, éxito solo con respuesta capture verificada |
| R08 | Poco tiempo para implementar completo | Alta | Crítico | Vertical slice E2E, P0 antes de animación avanzada y voz |
| R09 | Animación pesada / pantalla confusa | Media | Medio | Layout estable, un hito a la vez, reduced motion/lista alternativa |
| R10 | Sesión o estado PayPal perdido al recargar | Media | Alto | Persistencia mínima y GET de estado; no órdenes por replay |
| R11 | Reconocimiento de voz incompatible | Alta | Medio | V1 opt-in + fallback universal a texto |
| R12 | Fallo API de IA durante la demo | Media | Alto | Retry controlado; escenario de referencia probado, fallback visible |
| R13 | Presupuesto arbitrario produce precio ficticio inverosímil | Media | Alto | Etiqueta de escenario hipotético, límites de entrada y rechazo si no hay coherencia |
| R14 | API o SDK PayPal cambia / ambiente mal configurado | Media | Alto | Versión SDK documentada, pruebas Sandbox y configuración solo sandbox |
| R15 | Falta un entregable Devpost (vídeo, licencia, README) | Media | Crítico | Checklist P0 B18/B19 y congelar features antes de cierre |
| R16 | Filtración de keys o PII | Baja/Media | Crítico | Variables secretas server, logs saneados, no datos de tarjeta |
| R17 | Sesgos de puntuación hacen ganar siempre al mismo seller | Media | Medio | Pesos publicados, escenarios con distintas prioridades, test B |
| R18 | El vídeo exagera lo que hace el prototipo | Media | Alto | Mostrar flujo operativo, etiquetar pruebas y evitar claims de retailers reales |

**Tratamiento:** Riesgos críticos que impactan pago, IA, veracidad o entrega son **bloqueantes**. Los riesgos de polish visual/voz pueden mitigarse por recorte de alcance.

## 2. Decisiones registradas (ADR compactas)

| ID | Decisión | Motivo | Alternativa descartada | Revisión |
|---|---|---|---|---|
| D01 | Marca provisional **AgentD** | Evitar sugerir producto oficial PayPal | «PayPal AI Marketplace» como marca principal | Antes de publicar |
| D02 | Vendedores siempre simulados | Demo verificable sin acuerdos con comercios | Conectar sellers reales ahora | V2 |
| D03 | Cuatro sellers fijos | Experiencia repetible y comparación visual | Número variable de agentes | V2 |
| D04 | Orquestador por eventos; no cuatro LLM autónomos | Control, coste y tiempos predecibles | Multiagente totalmente autónomo | V2 |
| D05 | Una IA real para interpretar y explicar | Cumplir uso significativo, reducir complejidad | IA totalmente decorativa | V0 |
| D06 | Ranking/validación deterministas server-side | Coherencia y seguridad de importes | Ganador seleccionado libremente por LLM | V0 |
| D07 | Una oferta recomendada por sesión válida | Recorrido compacto y demostrable | «No match» en todos los casos ambiguos | Ajustar si escenario incoherente |
| D08 | Flujo V0 con inputs; voz V1 | No arriesgar E2E por compatibilidad | Voz obligatoria de entrada | V1 |
| D09 | Solo buyer agent habla | Claridad de narración | Audio simultáneo de 4 sellers | V1 |
| D10 | PayPal Orders v2 + JS SDK v6 en Sandbox | Integración significativa y comprobable | Checkout ficticio o real-money | V0 |
| D11 | Un merchant Sandbox representa las compras de prueba | Evitar onboarding multimerchant | Payouts a merchants reales | V2 |
| D12 | App Next.js monolítica modular | Menos piezas y despliegue rápido | Microservicios/colas/agentes distribuidos | Después del MVP |
| D13 | Persistir sesiones, ofertas aprobadas y pagos | Reconciliación fiable ante reload | Memoria solo cliente | V0 |
| D14 | Visualización desktop-first con fallback mobile y texto | Demo hero sin excluir usuarios | Desktop-only no funcional en móvil | V0 |
| D15 | Copy en inglés, especificación en español | Alcance de hackathon global | Doble localización en V0 | V2 |
| D16 | EUR, precios enteros en céntimos | Integridad monetaria | Múltiples divisas y floats | V2 |

## 3. Supuestos de trabajo

- **S01:** fechas y alcance están condicionados al deadline del 12/11/2026; el roadmap V1 puede quedar fuera de la entrega.
- **S02:** se dispone o se creará cuenta PayPal Developer con merchant y buyer Sandbox.
- **S03:** se elegirá un proveedor LLM que acepte salida estructurada o JSON validable.
- **S04:** la implementación usa Next.js + Vercel + Supabase salvo que el desarrollador ya tenga stack funcionando.
- **S05:** el usuario puede introducir cualquier nombre de producto **como escenario hipotético**, pero no se afirmará precio o inventario de mercado.
- **S06:** presupuestos válidos 50–10.000 EUR; cuando ningún escenario cumpla coherencia, se mostrará error y nueva búsqueda.
- **S07:** hay un navegador escritorio reciente y conexión a internet para grabar/demo.
- **S08:** ningún dato personal o financiero real es necesario para probar la compra en sandbox.
- **S09:** la voz no es requisito de V0 ni condición de release.

## 4. Preguntas abiertas, con propuesta por defecto

| ID | Pregunta | Propuesta por defecto | Fecha/condición para resolver | Bloquea V0 |
|---|---|---|---|---|
| Q01 | ¿Se mantiene AgentD como nombre? | Sí, provisional hasta publicar | Antes de vídeo/repo | No |
| Q02 | ¿Qué proveedor/modelo de IA? | Uno fiable con JSON estructurado y clave disponible | Antes B06 | **Sí para integración**, no para diseñar |
| Q03 | ¿Qué navegador para grabar? | Chrome desktop reciente | Antes de pruebas vídeo | No |
| Q04 | ¿Dónde desplegar? | Vercel + Supabase | Antes de B17 | No |
| Q05 | ¿Se usará un catálogo externo (Channel3)? | No en V0 | Solo tras E2E | No |
| Q06 | ¿Voz en el vídeo? | Solo si F09/F10 están terminadas y probadas | Antes de grabar | No |
| Q07 | ¿Se piden criterios duros adicionales a presupuesto? | No en V0; garantía/envío son preferencias | Planificación V2 | No |
| Q08 | ¿Se habilitará seleccionar otro seller manualmente? | No; se muestra comparación, solo ganador aprobado | Planificación V2 | No |
| Q09 | ¿Hace falta webhooks en V0? | No si capture + recuperación funcionan; V1 recomendable | Tras probar pago | No |
| Q10 | ¿Qué licencia open source utilizar? | MIT si no existen dependencias que lo impidan | Antes de publicar repositorio | Sí para entrega |

## 5. Política de cambios de alcance

- Cualquier propuesta nueva debe indicar: objetivo de usuario, impacto demo, dependencia con PayPal/IA, esfuerzo, riesgo y si desplaza P0.
- Si desplaza B12/B13/B16/B17/B18/B19, **rechazar para V0**.
- Voice puede añadir capacidades de entrada/salida, pero nunca sustituye inputs, validación o consentimiento PayPal.
- Cambios a reglas de precio, scoring o disponibilidad deben actualizar **02**, **06**, **07** y **09** conjuntamente.
- Cambios visuales que alteren eventos o tiempos deben actualizar **03**, **04** y **05**.

## 6. Checklist previo a publicación

- [ ] URL accesible sin login personal ni secretos.
- [ ] Cuatro sellers y negociación reales en la app (simulación etiquetada).
- [ ] IA real demostrable, no solo pantallas con mensajes precargados.
- [ ] PayPal Sandbox create → approve → capture verificable.
- [ ] Nunca se crea orden o captura sin consentimiento humano.
- [ ] Importe coincide en resumen, backend y PayPal.
- [ ] Cancelación, error y refresh no crean pagos duplicados.
- [ ] No hay afirmaciones de descuentos/inventario de comercios reales.
- [ ] README, setup, env example, licencia y repo público listos.
- [ ] Vídeo público en YouTube, duración inferior a 3 minutos.
- [ ] Formulario Devpost enviado antes del deadline.

## 7. Fuentes externas

- Hackathon (reglas, entrega, criterios): https://paypalaihackathon.devpost.com/rules
- PayPal JS SDK v6: https://developer.paypal.com/sdk/js/set-up/
- PayPal Orders v2: https://developer.paypal.com/api/rest/integration/orders-api
- PayPal idempotency: https://developer.paypal.com/api/make-api-requests
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

**Relacionados:** [00 Índice](00_INDEX.md) · [01 PRD](01_PRD.md) · [08 Backlog](08_BACKLOG_PRIORIZADO.md).
