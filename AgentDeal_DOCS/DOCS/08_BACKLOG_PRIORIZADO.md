# 08 — Backlog priorizado y plan de entrega

**Contexto:** desarrollo individual para PayPal AI Hackathon. Prioridad por **dependencia técnica + evidencia de demo**, no por apariencia de la pantalla. **Deadline oficial:** 12/11/2026, 12:00 PST (21:00 CET / España peninsular). Confirmar zona al publicar.

## 1. Definición de prioridades

| Prioridad | Significado | Política |
|---|---|---|
| **P0** | Indispensable para V0 funcional y envío | No se elimina salvo degradación justificada |
| **P1** | Potencia UX pero no debe comprometer P0 | Implementar solo tras probar checkout E2E |
| **P2** | Evolución futura, fuera de entrega | Documentar, no iniciar |

**Tamaños:** S = trabajo acotado; M = varias piezas dependientes; L = integración de riesgo. No son estimaciones horarias ni promesas.

## 2. Backlog V0 — ruta crítica

| ID | Pri. | Tarea / entregable demostrable | Depende de | Esfuerzo | Terminado cuando… |
|---|---|---|---|---|---|
| B01 | P0 | Inicializar Next.js/TypeScript, Tailwind, estructura y repo | — | S | Build/preview y lint pasan |
| B02 | P0 | Configurar Design System y cuatro rutas S01–S04 | B01 | M | Navegación coherente, estados vacíos |
| B03 | P0 | Formulario de intención con validación | B02 | S | AC-F01 y QA-01 |
| B04 | P0 | Registro de 4 seller policies, monedas y validadores | B01 | M | Tests de invariantes pasan |
| B05 | P0 | ScenarioBuilder + elegibilidad/ranking determinista | B04 | M | Cuatro ofertas válidas, ganador correcto |
| B06 | P0 | Integrar proveedor IA y validar salida estructurada | B05 | M | Interpretación/explicación IA observables; fallback claro |
| B07 | P0 | EventComposer de 6 fases | B05, B06 | M | Eventos ordenados sin contradicción |
| B08 | P0 | Persistir sesión y crear APIs de negociación | B03–B07 | M | POST/GET, replay y TTL funcionan |
| B09 | P0 | S02: grafo de agentes y feed funcional | B07, B08 | L | Sincronía de precios, fases y eventos |
| B10 | P0 | S03: ganador, comparativa, aprobación en backend | B05, B06, B08 | M | AC-F05, importe y consentimiento registrados |
| B11 | P0 | Configurar PayPal Developer Sandbox merchant/buyer | — | S | Credenciales y aprobación de prueba disponibles |
| B12 | P0 | API Orders v2: create, capture, get-status + persistencia | B08, B10, B11 | L | Orden real Sandbox, captura idempotente y estado verificado |
| B13 | P0 | S04 PayPal JS SDK v6 + confirmación/error | B02, B12 | L | Flujo completo de PayPal en navegador |
| B14 | P0 | Estado recuperación/replay y expiración | B08, B12 | M | Refresh no recrea orden ni captura |
| B15 | P0 | Integrar disclaimer/UX copy, accesibilidad y responsive | B02, B09, B10, B13 | M | Grafo con alternativa textual; teclado/reduced motion |
| B16 | P0 | Pruebas E2E + errores reales PayPal/IA | B03–B15 | L | Checklist QA P0 verde, sin defectos bloqueantes |
| B17 | P0 | Despliegue HTTPS + verificación externa | B16 | M | URL pública / o setup reproducible desde repositorio |
| B18 | P0 | README, licencia visible, `.env.example`, descripción herramientas | B01, B12, B17 | M | Evaluador puede ejecutar el proyecto sin credenciales expuestas |
| B19 | P0 | Vídeo <3 min, YouTube público y envío Devpost | B16–B18 | M | URL vídeo visible, formulario enviado antes del cierre |

**Regla operacional:** B11–B13 (PayPal) deben avanzar en paralelo con B05–B09 (negociación visual). No reservar la integración PayPal para el final.

## 3. Backlog V1 — voz y polish

| ID | Pri. | Tarea | Depende de | Esfuerzo | Aceptación |
|---|---|---|---|---|---|
| B20 | P1 | Micrófono + SpeechRecognition / compatibilidad | B03 | M | AC-F09; fallback a texto |
| B21 | P1 | Transcripción editable + parsing de requisitos IA | B06, B20 | M | Confirmación antes de iniciar sesión |
| B22 | P1 | TTS comprador, mute, subtítulos y sync | B07, B09 | M | AC-F10; sin auto-play obligatorio |
| B23 | P1 | Refino motion/sonido y reducción de latencia percibida | B09, B16 | M | No baja usabilidad ni rendimiento |
| B24 | P1 | Webhook firmado y conciliación asíncrona de pago | B12 | M | Reintentos y eventos duplicados seguros |

## 4. Backlog V2 — explícitamente no iniciar ahora

- Integración de catálogos y vendedores reales con consentimiento y políticas comerciales.
- Multimerchant settlement/payouts y onboarding de vendedores.
- Agentes autónomos persistentes, negociación de varios turnos no guionada.
- Carrito multiartículo, múltiples monedas, pedidos, envíos, devoluciones y soporte.
- Audio conversacional en tiempo real con interrupciones y memoria del comprador.

## 5. Entrega por hitos

### Hito A — Corte funcional vertical

**Resultado:** texto → escenarios ficticios validados → recomendación → aprobación → orden/captura Sandbox, aunque la interfaz todavía sea básica.  
**Condición de avance:** cero importes manipulables y captura demostrable.

### Hito B — Experiencia de negociación

**Resultado:** cuatro sellers visualizados, 6 fases, feed, score y salida hacia resultado.  
**Condición de avance:** mismo ganador y mismos importes entre API, grafo y resultado.

### Hito C — Calidad de entrega

**Resultado:** responsive, accesibilidad, errores y recovery, build desplegado, repo público y README reproducible.  
**Condición de avance:** E2E en navegador real, incluyendo cancelación y reintento.

### Hito D — Narrativa de demo

**Resultado:** toma canónica de 2:30–2:45, upload público y entrega final.  
**Condición de avance:** vídeo muestra evidencia de IA y PayPal, no solo mockups.

### Hito E — Mejora opcional de voz

**Solo si A–D están asegurados:** incorporar F09/F10. Si no funciona de forma estable en navegador de grabación, **dejarlo fuera del vídeo**.

## 6. Orden de trabajo propuesto para una sola persona

1. Crear un «vertical slice» extremo a extremo con los endpoints y PayPal primero, aunque tenga UI mínima.
2. Construir y validar el motor de negociación con dos fixtures reproducibles.
3. Integrar un LLM real y validar salida; fallback explícito.
4. Desarrollar S02 como mayor inversión visual después de comprobar E2E.
5. Pulir S01/S03/S04; probar accesibilidad, errores y responsive.
6. Congelar funcionalidades; desplegar, documentar, grabar y enviar.
7. Si aún queda margen, activar voice con feature flag.

## 7. Recortes permitidos sin destruir el MVP

| Si falta tiempo… | Recortar primero | Conservar obligatoriamente |
|---|---|---|
| Grafo complejo | Física de nodos, partículas, glow avanzado | Cuatro sellers + eventos + cambios de precio + feed |
| Narrativa extensa | Muchas contraofertas por seller | Al menos una negociación/contraoferta visible y descartes |
| Personalización IA | Mensajes largos estilizados | Una inferencia real que interprete/evalúe y explique |
| Responsive avanzado | Layout del grafo en móvil | Lista comparativa usable y checkout funcional |
| Persistencia sofisticada | Historial, analíticas, perfiles | Sesión, oferta aprobada, order/capture y reintentos seguros |
| Voz | Toda V1 | V0 con texto completamente funcional |

**No recortable:** PayPal Sandbox real; intervención sustantiva de IA; consentimiento del comprador; transparencia de escenarios simulados; demo funcional; documentación y vídeo válidos.

## 8. Definition of Done por tarea

- Comportamiento implementado y visible en aplicación.
- Validaciones tanto en cliente como servidor cuando aplique.
- Estados loading/empty/error/retry definidos.
- Casos de prueba críticos ejecutados y documentados.
- Accesibilidad básica y responsive sin bloqueos.
- Sin secretos en repo/logs, sin claims falsos.
- README/contratos actualizados cuando cambie el comportamiento.

**Referencias:** [02 Features](02_FUNCIONALIDADES_Y_CARACTERISTICAS.md) · [09 QA](09_CRITERIOS_DE_ACEPTACION.md).
