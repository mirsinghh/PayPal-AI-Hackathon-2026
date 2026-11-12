# AgentD — Resumen simplificado

**Versión:** 1.0 · **Fecha:** 2026-11-11 · **Estado:** Propuesta cerrada para MVP de hackathon  
**Tagline:** *Stop searching. Start negotiating.*

| Campo | Definición |
|---|---|
| **Problema** | Comparar productos, vendedores, precios, garantías y envíos consume tiempo. El usuario negocia poco o nada. |
| **Usuario objetivo** | Compradores digitales que buscan una decisión informada con poco esfuerzo y control final sobre el pago. |
| **Propuesta de valor** | Un agente personal interpreta requisitos, negocia con cuatro agentes vendedores ficticios, explica la mejor oferta y conecta su aprobación con PayPal Sandbox. |
| **MVP (V0)** | Inputs de producto/presupuesto/preferencias; cuatro perfiles comerciales; ofertas y contraofertas simuladas y validadas; timeline animado; evaluación real con IA; explicación, aprobación y PayPal Checkout Sandbox; demo funcional y desplegada. |
| **Futuro (V1)** | Reconocimiento de voz, transcripción editable, voz del agente, narración y respuestas de varios turnos (esta última como evolución). |
| **Fuera de alcance** | Marketplace real, vendedores/inventario/logística externos, pagos multiparte, agentes autónomos persistentes, cuentas y compras con dinero real. |
| **Supuestos** | Marca provisional AgentD; UI/copy en inglés; documentación en español; EUR; desktop-first y responsive; cuatro vendedores NOVA, ORBIT, PRISM y VERTEX; una oferta recomendada en cada escenario válido; recorrido guiado con contenido variable. |
| **Riesgos** | Confundir simulación con ofertas de comercios reales; usar IA solo decorativa; inconsistencia de precios; fraude por importes manipulados; integración incompleta con PayPal; degradación de accesibilidad; soporte irregular de voz; poco tiempo de pruebas. |
| **Preguntas críticas (no bloqueantes)** | Marca final, proveedor/modelo de IA, navegador de grabación y si el despliegue será Vercel + Supabase. Se asumen las opciones anteriores hasta decidirlo. |

**Decisión principal:** experiencia controlada, pero con funcionalidad verificable. Los vendedores y sus términos son ficticios y se etiquetan como simulados; un modelo de IA interpreta y evalúa, el servidor valida la selección, y el pago se completa exclusivamente en Sandbox con aprobación humana.

**Éxito:** un juez puede introducir un producto, seguir la negociación, comprender por qué ganó un vendedor y realizar una compra simulada; el vídeo de demostración dura menos de tres minutos. Los detalles están en [DOCS/00_INDEX.md](DOCS/00_INDEX.md).
