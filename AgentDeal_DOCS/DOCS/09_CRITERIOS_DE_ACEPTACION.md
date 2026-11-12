# 09 — Criterios de aceptación y plan de QA

**Objetivo:** lista verificable para aprobar el MVP. No basta con capturas de pantalla; los escenarios de pago, IA y estados deben funcionar desde la aplicación.

## 1. Entorno y datos de referencia

| Perfil | Datos |
|---|---|
| Escenario A (canónico) | `Wireless noise-cancelling headphones` · 350 EUR · `best_value` · preferencia garantía |
| Escenario B (variante) | `Laptop for work` · 1.200 EUR · `fast_delivery` |
| Escenario C (alternativo) | `Running shoes` · 180 EUR · `lowest_price` |
| Escenario D (límite) | Texto inválido, presupuesto fuera de 50–10.000 EUR |
| Sandbox | Merchant de prueba + buyer de prueba y credenciales de cuenta Developer separadas |
| Navegadores V0 | Chrome reciente desktop; segundo navegador moderno para smoke test; Safari móvil para reflow básico |
| IA | Proveedor real con logs técnicos saneados; fallback probado por error inducido |

**Fixture canónico ilustrativo** (no datos de tiendas): NOVA 329→299, ORBIT 339→315, PRISM 349→329, VERTEX 379→365. Con límite 350 EUR, VERTEX no es elegible. Los tests deben verificar reglas y puntuaciones, no depender de estos precios específicos en búsquedas libres.

## 2. Pruebas funcionales trazadas

| ID | Función | Dado / Cuando / Entonces | Resultado exigido |
|---|---|---|---|
| QA-01a | F01 | Dado input válido; al enviar | POST crea una sesión, navega a S02 con intención correcta |
| QA-01b | F01 | Dado presupuesto vacío, negativo, <50 o >10.000; al enviar | Validación inline, sin llamada de sesión |
| QA-01c | F01 | Dado doble clic rápido; al enviar | Una sola sesión o respuesta idempotente consistente |
| QA-02a | F02 | Dado producto y presupuesto válidos; al preparar | Exactamente 4 sellers NOVA/ORBIT/PRISM/VERTEX |
| QA-02b | F02 | Dado cada oferta; al validar | `min <= final <= initial`, descuento correcto, un elegible mínimo |
| QA-02c | F02 | Dado presupuesto imposible para reglas; al generar | Error coherente; nunca una oferta «real» inventada |
| QA-03a | F03 | Dado escenario `ready`; al reproducir | Seis fases ordenadas, precios solo cambian con eventos |
| QA-03b | F03 | Dada pausa a mitad de contraoferta; al reanudar | Sin eventos duplicados ni pérdida de sincronía |
| QA-03c | F03 | Dado replay o velocidad 2×; al terminar | Mismo ganador, precio y decisiones |
| QA-04a | F04 | Dado IA disponible; al evaluar | Se registra invocación real; explicación validada y coherente |
| QA-04b | F04 | Dado IA falla; al evaluar | Fallback etiquetado, ningún precio o condición inventados |
| QA-04c | F04 | Dado LLM intenta recomendar inelegible; al validar | Backend descarta recomendación y mantiene ranking correcto |
| QA-05a | F05 | Dado resultado; al abrir S03 | Winner, precio inicial/final, ahorro y términos coinciden con API |
| QA-05b | F05 | Dado usuario no aprueba; al salir | No se crea ninguna orden de PayPal |
| QA-05c | F05 | Dada oferta caducada; al aprobar | Se bloquea y solicita nueva negociación |
| QA-06a | F06 | Dada oferta aprobada; al crear orden | Orden PayPal Sandbox coincide exactamente en EUR/céntimos |
| QA-06b | F06 | Dado usuario aprueba en PayPal; al capturar | Estado completado verificado; Order ID y Capture ID guardados |
| QA-06c | F06 | Dado refresh o doble clic capture; al reintentar | Sin doble captura ni segundo éxito ficticio |
| QA-06d | F06 | Dado cancelación de comprador; al volver | Estado cancelado/pendiente, sin mensaje de pago completado |
| QA-06e | F06 | Dado timeout de red tras capture; al consultar | Muestra `unconfirmed` y reconcilia sin repetir cobro |
| QA-07a | F07 | Dada sesión existente; al refrescar | Recupera términos, evento/resultado y estado de pago |
| QA-07b | F07 | Dado replay; al ejecutar | No modifica backend, ofertas ni pagos |
| QA-07c | F07 | Dada URL desconocida o sesión expirada | Mensaje y CTA de recuperación coherentes |
| QA-08a | F08 | Dada S02; al recibir eventos | Feed textual reproduce hechos exactos de eventos |
| QA-08b | F08 | Dada S03; al comparar | Cuatro ofertas, motivo del descarte y criterios legibles |
| QA-08c | F08 | Dado mobile o lector de pantalla; al usar | Alternativa textual completa sin necesidad de grafo |

## 3. Pruebas V1 — voz (no bloquean V0)

| ID | Dado / Cuando / Entonces | Criterio |
|---|---|---|
| QA-09a | Micrófono disponible + consentimiento; dictado de producto y presupuesto | Transcripción visible y campos rellenados; usuario confirma |
| QA-09b | Permiso denegado o reconocimiento no soportado | Inputs tradicionales siguen funcionando |
| QA-09c | Reconocimiento ambiguo | Permitir editar texto sin iniciar automáticamente sesión |
| QA-10a | Audio activado por usuario + hito | Solo el buyer agent narra y el texto coincide |
| QA-10b | Mute/pausa/navegación | Audio se corta, no quedan clips en cola |
| QA-10c | TTS no soportado | Experiencia textual completa, sin errores bloqueantes |

## 4. Pruebas de negocio y seguridad

| ID | Prueba | Condición de aprobación |
|---|---|---|
| SEC-01 | Usuario modifica precio en DOM o request | Orden usa exclusivamente `finalPriceCents` persistido |
| SEC-02 | Usuario cambia `offerId` a no recomendado | 409/422; no order |
| SEC-03 | Usuario intenta pagar sin aprobación | Rechazo server-side; no order |
| SEC-04 | Usuario reintenta POST create/capture | Idempotencia local + PayPal, sin cobros duplicados |
| SEC-05 | Oferta de sesión distinta o expiración | Rechazo; no puede mezclar estados |
| SEC-06 | API key y PayPal secret en browser/repo | Nunca expuestos; variables privadas solamente servidor |
| SEC-07 | Entrada maliciosa / prompt injection | Salida tratada como datos; no modifica políticas, winner ni precios |
| SEC-08 | PayPal responde con importe/moneda inesperados | No marcar pago como completado; alerta y reconciliación |
| SEC-09 | Entorno `production` accidental | Despliegue V0 falla cerrado; no mueve dinero real |

## 5. Accesibilidad y responsive

| ID | Escenario | Expectativa |
|---|---|---|
| UI-01 | 1440, 1024, 768, 375 y 320 px | Layout sin contenido cortado ni scroll horizontal no justificado |
| UI-02 | Tab/Shift+Tab/Enter/Escape | Completar flujo hasta control PayPal según soporte SDK |
| UI-03 | Lector de pantalla | Labels, fases, errores, conclusión, alternativa a grafo |
| UI-04 | Preferencia `prefers-reduced-motion` | Sin pulsos continuos, zoom ni partículas; eventos aún legibles |
| UI-05 | Contraste de texto/controles | Objetivo 4.5:1 texto normal y 3:1 UI relevante |
| UI-06 | Audio desactivado o no disponible (V1) | Todos los contenidos permanecen disponibles en texto |
| UI-07 | Botones, campos y touch | Touch targets ~44×44 px y estados de foco claros |

## 6. Pruebas de motion e integridad

- A cada `COUNTEROFFER_RECEIVED` le corresponde exactamente una actualización del precio del seller correcto.
- `SELLER_REJECTED` nunca borra el seller de la comparativa ni cambia su precio.
- `WINNER_SELECTED` siempre refiere un `Offer.eligible` válido.
- El grafo, activity feed, S03 y PayPal muestran el mismo precio final y currency.
- En modo pausa, estado comercial queda fijo; en 2× el resultado no cambia.
- Durante loading de IA o PayPal, usar estados reales, sin generar eventos ficticios para aparentar progreso externo.

## 7. Criterios de aceptación de UX writing

- S01, S02, S03 y S04 dicen claramente **simulated sellers/offers** y **Sandbox** donde corresponda.
- Nunca aparecer «saving vs market», «real retailers contacted» ni «shipping confirmed».
- «Negotiation complete» se distingue visualmente y semánticamente de «Sandbox payment completed».
- En la pantalla de pago, el importe aprobado es visible antes de abrir PayPal.
- El error de pago incierto usa «We couldn't confirm the payment yet», no «not charged» sin evidencia.
- El resumen de IA explica **por qué** ganó, con referencia a al menos dos de precio/entrega/garantía cuando existan datos.

## 8. Go / No-go de release

| Check | Go si… | No-go si… |
|---|---|---|
| Core funcional | QA-01 a QA-08 críticos aprobados | Una pantalla bloquea el recorrido |
| IA | Existe una llamada de modelo real probada | Solo reglas y textos mock, sin IA sustantiva |
| PayPal | Pago Sandbox se crea, aprueba y captura | Es solo un botón/imagen o éxito falso |
| Integridad | Precio final coincide en todos los puntos | El cliente puede elegir el importe |
| Transparencia | Sellers y ofertas etiquetados como ficción | Demo aparenta acuerdos reales con tiendas |
| Seguridad | Sin secretos y sin duplicación de capture | Doble cobro posible o credenciales públicas |
| Entrega | Repo público/licencia/README + vídeo público <3min | No reproducible, no envío en plazo |

**Salida aceptable si V1 no está:** V0 completo con inputs y asistente visual; voz no es requisito de aceptación de hackathon.

## 9. Evidencias a guardar

- Captura de S01/S02/S03/S04 finales.
- Registro técnico saneado de ejecución de IA (modelo y status, sin token).
- ID de orden/captura Sandbox y resultado de API; ocultar cuentas/datos personales.
- Grabación de caso principal y de cancelación (esta última puede quedar solo en QA).
- URL hosted demo y pasos de arranque local completos.

**Relacionado:** [07 Contratos](07_MODELO_DE_DATOS_Y_APIS.md) · [08 Backlog](08_BACKLOG_PRIORIZADO.md).
