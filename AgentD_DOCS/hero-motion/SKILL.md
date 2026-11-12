---
name: hero-motion
description: Receta exacta para construir un hero animado con "escenario" de producto vivo (titular palabra a palabra, entrada coreografiada, tarjetas flotantes con parallax, componente central con demo narrativa en bucle, onda de voz, transcripción progresiva y ficha que se rellena sola). Úsalo cuando se pida un hero "como el de Mirvia" o un hero donde el producto se vea funcionando en vivo.
---

# Skill · Cómo se construye el hero animado

Este documento describe **cómo está hecho el hero de la landing y en qué orden se construye**, con los valores reales (duraciones, retardos, profundidades). Para las primitivas generales (tokens, `watch`, reveals, reduced-motion) consulta `skills/motion-system/SKILL.md`; aquí solo se cubre el hero.

Archivos de referencia: `index.html` (sección hero), `css/hero.css`, `js/hero.js`, y de `js/core.js`: `splitWords`, `watch`, motor de ondas.

---

## 1 · Idea central

El hero no es "un titular con animación de entrada". Son **cuatro capas** que se activan en cascada y viven en paralelo:

| Capa | Qué es | Quién la mueve |
|---|---|---|
| **A. Texto** | estado, titular, subtítulo, CTA, notas | CSS (`hero-in`) + `splitWords` |
| **B. Atmósfera** | rejilla de puntos, dos orbes difuminados, anillos concéntricos | CSS ambiental puro, lento |
| **C. Escenario** | 5 elementos posicionados (tarjeta central + 2 paneles + 2 chips) | CSS (entrada + float) + parallax JS |
| **D. Demo viva** | la tarjeta central cuenta una historia en bucle | JS: guion async + atributos de estado |

Regla: **A, B y C son CSS casi puro; solo D tiene lógica**. La demo D solo cambia atributos/clases y el CSS reacciona.

La clave de que se sienta "premium" es la **coreografía**: todo entra con la misma curva y un retardo calculado por un índice (`--h`), y después el escenario nunca se queda quieto (float, anillos, orbes, onda, transcripción), pero con amplitudes muy pequeñas.

---

## 2 · Estructura HTML (esqueleto)

```html
<section class="hero">
  <div class="hero__bg" aria-hidden="true">
    <div class="hero__grid"></div>
    <div class="hero__orb hero__orb--a"></div>
    <div class="hero__orb hero__orb--b"></div>
  </div>

  <div class="container hero__inner">
    <p class="hero__status" data-hero style="--h:0">…punto pulsante + "Atendiendo llamadas ahora"…</p>

    <h1 class="hero__title" id="heroTitle" data-split style="--base:150ms">
      Texto con <br class="hide-sm"> saltos <span class="muted">y un tramo atenuado.</span>
    </h1>

    <p class="hero__sub" data-hero style="--h:4">…</p>
    <div class="hero__cta" data-hero style="--h:5">…botón primario + botón "Escuchar demo"…</div>
    <p class="hero__note" data-hero style="--h:6">…3 garantías con check…</p>

    <!-- ESCENARIO -->
    <div class="stage" id="stage">
      <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>

      <div class="stage__item stage__item--lines"> <aside class="panel lines" style="--h:7">…</aside> </div>
      <div class="stage__item stage__item--call">  <article class="panel call" id="call" data-speaker="idle" data-state="ringing">…</article> </div>
      <div class="stage__item stage__item--ficha"> <aside class="panel ficha" style="--h:6">…</aside> </div>
      <div class="stage__item stage__item--float stage__item--247"><div class="chip" style="--h:8">…</div></div>
      <div class="stage__item stage__item--sent"><div class="chip">…</div></div>
    </div>
  </div>
</section>
```
Convenciones importantes:
- **Dos niveles por elemento del escenario:** `.stage__item` (wrapper posicionado, lo mueve el parallax) y su hijo directo (`.panel`, `.chip`; lo animan entrada y float). Así tres movimientos distintos nunca pelean por la misma propiedad (ver §5).
- `--h` es el índice de coreografía. En el HTML, no en JS.
- La tarjeta central es una **máquina de estados en atributos**: `data-state="ringing|active"` y `data-speaker="idle|bot|client"`.
- Los campos que la demo modifica llevan ids o `data-*` (`#callTimer`, `#callStatus`, `#speakerLabel`, `#chatTrack`, `.f-row[data-f="…"]`).
- El escenario se declara con `aria-label` descriptivo; las partes decorativas, `aria-hidden`.

---

## 3 · Capa A · Entrada del texto (coreografía)

### 3.1 Elementos con `data-hero`
```css
[data-hero] {
  animation: hero-in 900ms var(--ease) both;
  animation-delay: calc(var(--h, 0) * 90ms + 120ms);
}
@keyframes hero-in { from { opacity: 0; transform: translate3d(0, 16px, 0); } }  /* sin "to": parte del estado natural */
```
Índices reales: estado `--h:0`, subtítulo `4`, CTA `5`, nota `6`. (Los índices 1–3 quedan reservados al titular, que tiene su propio tempo; así el subtítulo entra cuando el titular ya va por la mitad.)

Se usa `animation … both` (no transition) porque el hero debe animar **al cargar** sin esperar a ninguna clase; `from` sin `to` evita duplicar el estado final.

### 3.2 Titular palabra a palabra
- Atributo `data-split` + `style="--base:150ms"`.
- `splitWords()` envuelve cada palabra en `.w` (máscara `overflow:hidden`) con un `<span>` interior que sube desde `translate3d(0,112%,0)`; `--w` = índice de palabra.
- Transición: `800ms var(--ease)` con retardo `calc(var(--w) * 55ms + var(--base))`.
- Se excluye del `IntersectionObserver` genérico (`el.id !== 'heroTitle'`) y se revela **al cargar, cuando la fuente está lista**:
```js
const go = () => requestAnimationFrame(() => heroTitle.classList.add('is-in'));
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))]).then(go);
```
(`race` con 700 ms: si la fuente tarda, el titular sale igualmente.)
- `aria-label` en el h1 con el texto completo y las palabras sueltas `aria-hidden`.
- El tramo atenuado (`.muted`, color `--ink-3`) funciona porque `splitWords` recorre los nodos hijos sin destruirlos.

Cronología resultante (aprox.): 120 ms estado → 150 ms empieza el titular (cada palabra +55 ms) → 480 ms subtítulo → 570 ms CTA → 660 ms nota → ~900 ms después empieza el escenario.

---

## 4 · Capa B · Atmósfera (ambiental, nunca protagonista)

```css
.hero { position: relative; overflow: clip; }
.hero__bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.hero__inner { position: relative; z-index: 1; }

/* rejilla de puntos que se desvanece hacia los bordes */
.hero__grid {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(20,21,26,.16) 1px, transparent 1.3px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 72% 58% at 50% 34%, #000 0%, transparent 74%);
}
/* dos orbes de color muy difuminados que derivan lentamente */
.hero__orb { position: absolute; border-radius: 50%; filter: blur(90px); }
.hero__orb--a { width:560px; height:560px; left:50%; top:-220px; margin-left:-560px;
  background: rgba(63,70,242,.15); animation: drift-a 32s ease-in-out infinite alternate; }
.hero__orb--b { width:480px; height:480px; left:50%; top:80px; margin-left:140px;
  background: rgba(124,77,245,.11); animation: drift-b 38s ease-in-out infinite alternate; }
@keyframes drift-a { to { transform: translate3d( 90px, 40px, 0); } }
@keyframes drift-b { to { transform: translate3d(-100px, 30px, 0); } }
```
Por qué funciona:
- **Duraciones distintas (32 s y 38 s) y direcciones opuestas** → nunca se sincronizan; la atmósfera "respira" sin patrón.
- Opacidad baja (11–15 %): es color ambiente, no un elemento.
- La máscara de la rejilla concentra el detalle detrás del titular y lo disuelve al salir.
- `blur(90px)` es costoso: **se desactiva la animación en móvil** (`@media (max-width:720px){ .hero__orb{ animation:none; opacity:.7 } }`).

### Anillos concéntricos detrás de la tarjeta central
Tres aros que nacen pequeños y se expanden mientras se desvanecen, desfasados un tercio del ciclo (efecto sonar/llamada):
```css
.rings { position:absolute; left:50%; top:290px; width:0; height:0; pointer-events:none; }
.rings i { position:absolute; left:-270px; top:-270px; width:540px; height:540px; border-radius:50%;
  border:1px solid rgba(63,70,242,.24); opacity:0; animation: ring 10s linear infinite; }
.rings i:nth-child(2){ animation-delay:3.33s } .rings i:nth-child(3){ animation-delay:6.66s }
@keyframes ring { 0%{transform:scale(.55);opacity:0} 18%{opacity:.9} 100%{transform:scale(1.7);opacity:0} }
```
Receta: `delay = duración / n` para n aros equiespaciados; `linear` para ritmo constante; la opacidad sube rápido (18 %) y cae despacio.

---

## 5 · Capa C · El escenario (composición + entrada + float + parallax)

### 5.1 Composición
`.stage` es un contenedor de **altura fija (600 px) y ancho máx. 1120 px**; cada pieza es `position:absolute` con coordenadas propias. Composición asimétrica con la tarjeta central como ancla:

| Pieza | Posición | `--depth` | `--h` | z |
|---|---|---|---|---|
| Tarjeta de llamada (centro) | `left:50%; top:0; width:480px; margin-left:-240px` | 6 | 5 (def.) | 3 |
| Panel "llamadas simultáneas" | `left:0; top:218px; width:252px` | 16 | 7 | 2 |
| Ficha de solicitud | `right:0; top:52px; width:268px` | 20 | 6 | 2 |
| Chip "Disponible 24/7" | `left:54px; top:96px` | 28 | 8 | 4 |
| Chip "Resumen enviado" | `right:18px; top:458px` | 26 | 9 | 4 |

Lectura de profundidad: lo más cercano al usuario (chips) tiene el `--depth` más alto, lo lejano (tarjeta central) el más bajo. Los paneles laterales se solapan con la central (z distinto) para dar sensación de capas, no de rejilla.

### 5.2 Tres movimientos, tres propiedades distintas (el truco)
Un mismo elemento recibe entrada, flotación y parallax **sin interferencias** porque cada uno usa una propiedad CSS diferente y/o un nivel del DOM diferente:

| Movimiento | Dónde | Propiedad |
|---|---|---|
| Parallax (puntero) | `.stage__item` (wrapper) | `translate` |
| Entrada | hijo directo | `transform` (en `@keyframes stage-in`) |
| Float | hijo directo | `translate` (en `@keyframes float`) |

```css
.stage__item { position:absolute;
  translate: calc(var(--px,0) * var(--depth,0) * 1px) calc(var(--py,0) * var(--depth,0) * 1px); }

.stage__item > * { animation: stage-in 1000ms var(--ease) both;
  animation-delay: calc(var(--h,5) * 90ms + 120ms); }
@keyframes stage-in { from { opacity:0; transform: translate3d(0,32px,0) scale(.97); } }

.stage__item--float > * {
  animation: stage-in 1000ms var(--ease) both, float 9s ease-in-out infinite;
  animation-delay: calc(var(--h,5)*90ms + 120ms), calc(var(--h,5)*90ms + 1200ms); /* float empieza 1.2 s DESPUÉS de entrar */
}
@keyframes float { 0%,100%{ translate:0 0 } 50%{ translate:0 -7px } }   /* amplitud mínima */
```
Detalles que importan:
- Los CSS individual transform properties (`translate`, `rotate`, `scale`) componen con `transform`, por eso float (translate) + entrada (transform) conviven.
- El float arranca con un retardo propio para no solaparse con la entrada.
- Solo los chips flotan (`stage__item--float`); las tarjetas con contenido no, para no marear al leer.
- `--h` más alto = entra más tarde: orden 5 (central) → 6 (ficha) → 7 (líneas) → 8, 9 (chips). El ojo recorre primero lo importante.

### 5.3 Parallax con inercia (JS, solo puntero fino y sin reduced-motion)
```js
let tx=0, ty=0, cx=0, cy=0, raf=0;
const frame = () => {
  cx += (tx - cx) * .08;  cy += (ty - cy) * .08;                 // lerp: inercia
  stage.style.setProperty('--px', cx.toFixed(3));
  stage.style.setProperty('--py', cy.toFixed(3));
  raf = Math.abs(tx-cx) + Math.abs(ty-cy) > .002 ? requestAnimationFrame(frame) : 0;  // se apaga solo
};
const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
hero.addEventListener('pointermove', e => {
  const r = stage.getBoundingClientRect();
  tx = clamp(((e.clientX - r.left)/r.width  - .5) * 2, -1, 1);
  ty = clamp(((e.clientY - r.top )/r.height - .5) * 2, -1, 1);
  kick();
});
hero.addEventListener('pointerleave', () => { tx = ty = 0; kick(); });
```
Cómo se traduce a píxeles: `translate = --px × --depth px`. Con `--depth:28` el chip se mueve como máximo ±28 px; la tarjeta central (6) casi no se mueve. **La diferencia entre profundidades es lo que crea la sensación 3D**, no la amplitud absoluta.
Escucha el `pointermove` en todo el `.hero` pero normaliza respecto al `.stage`.

---

## 6 · Capa D · La demo viva (tarjeta central)

### 6.1 Anatomía de la tarjeta
1. **Cabecera:** orbe con gradiente + nombre + píldora de estado (cambia de azul "Llamada entrante" a verde "Llamada activa").
2. **Fila de llamante:** avatar, nombre, teléfono parcial, **cronómetro** (`tabular-nums`).
3. **Zona de voz:** etiqueta de quién habla + botón de sonido + **onda de 46 barras**.
4. **Transcripción:** contenedor de 250 px con máscara superior, `track` anclado abajo.
5. **Pie:** punto parpadeante "Transcripción en directo" + selector de idioma.

### 6.2 Máquina de estados por atributos (el CSS reacciona, el JS no toca estilos)
```js
call.dataset.state   = 'ringing' | 'active';
call.dataset.speaker = 'idle' | 'bot' | 'client';
```
```css
.call[data-state="ringing"] .call__status { background: var(--blue-50); color: var(--blue-700); }  /* vs verde por defecto */
.call[data-speaker="bot"]    .wave i { background: var(--blue); }
.call[data-speaker="client"] .wave i { background: var(--ink); }
.call[data-speaker="bot"] .orb::before { animation: orb-ring 1.8s var(--ease) infinite; }
.call[data-speaker="bot"] .orb::after  { animation: orb-ring 1.8s var(--ease) .6s infinite; }  /* dos ondas desfasadas */
.call[data-speaker="client"] .call__speaker .i { color: var(--ink); }
.call[data-speaker="idle"]   .call__speaker .i { color: var(--ink-3); }
```
`setSpeaker(who)` hace tres cosas a la vez: cambia el atributo, fija `wave.target = LEVEL[who]` (bot .95, cliente .62, reposo .07) y actualiza el texto "Lía está hablando". **Un único punto de verdad cambia 4 señales visuales sincronizadas** (color de onda, anillos del orbe, icono, etiqueta).

### 6.3 Onda de voz (46 barras)
Mismo motor descrito en `motion-system` §2.9: un `requestAnimationFrame` compartido, barra = `scaleY(v)`, `v = nivel × envolvente senoidal × ruido de 2 senos por barra`, y **`level` interpolado hacia `target` (×0.14 por frame)**. La narrativa solo toca `wave.target`; la inercia hace que el paso de "escucha" a "habla" sea orgánico. Las barras empiezan en `scaleY(.1)` y heredan color del `data-speaker`.

### 6.4 Guion de datos (separado de la lógica)
```js
const SCRIPT = [
  { who:'bot',    text:'Hola, te atiende Lía…' },
  { who:'client', text:'Quería saber si tenéis cita mañana.', rows:[{ k:'reason' }] },        // rellena la ficha tras decirlo
  { who:'bot',    text:'Voy a consultar la disponibilidad.',
    event:{ wait:'Consultando disponibilidad…', done:'Hueco libre · mañana 10:30',
            rows:[{ k:'status', html: H.pending1 }] } },                                       // evento "del sistema"
  …
  { who:'bot', text:'La registro ahora mismo.', event:{ …, final:true } }                       // final:true dispara el cierre
];
```
- `rows` = campos de la ficha que se rellenan **cuando termina de decirse la frase**.
- `event` = fila de sistema con spinner → check.
- Para adaptar el hero a otro producto **solo se cambia este array y los textos de la ficha**; la orquestación no se toca.
- Diseñar el guion con un pequeño giro (aquí: la clienta rechaza la hora 10:30 y propone 11:15). Un recorrido perfecto parece falso; una corrección natural lo hace creíble y enseña capacidad del producto.

### 6.5 Orquestación (función async lineal)
Secuencia por paso, con tiempos reales:

1. `sleep(450)` pausa entre intervenciones.
2. Se construye el mensaje (`buildMessage`): burbuja con indicador de "escribiendo" (3 puntos) y todas las palabras como `<span class="wd">` con `opacity:0`.
3. `setSpeaker(who)` + `push(el)` (FLIP, ver 6.6).
4. `sleep(700 bot / 600 cliente)` mostrando los puntos "escribiendo".
5. Se quita `is-typing` y se revelan las palabras una a una (`.wd.on`, fundido 280 ms) a ritmo `per`:
   - sin audio: 100 ms/palabra (bot), 85 ms (cliente);
   - con audio: `max(60, duración·0.88 / nº palabras)` → el texto **termina un poco antes que la voz**, y se espera el resto + 200 ms.
6. `applyRows(step.rows)` rellena la ficha.
7. `setSpeaker('idle')`. Si hay `event`: `sleep(500)` → fila con spinner → `sleep(1600)` → `is-done` (spinner se desvanece, check entra con `scale(.5→1)`) → `applyRows(event.rows)`.
8. Tras el último paso: se activa `stage.is-done` (aparece el chip "Resumen enviado a tu equipo" con fundido 600 ms), se espera 5200 ms, se **desvanece el chat 500 ms** y `play()` reinicia en bucle.

Inicio: arranca **700 ms después de que la tarjeta entre en el viewport** (una sola vez), con 1200 ms previos en estado "Llamada entrante" antes de "conectar" y activar el cronómetro.

**Cancelación (imprescindible):** `runId` global; `sleep(ms,id)` resuelve `false` si `id !== runId`; cada `await` se comprueba y retorna. Pulsar "Escuchar demo" llama `play()`, que incrementa `runId` y deja morir la ejecución anterior sin timers huérfanos. `reset()` restaura DOM, cronómetro, ficha (`dataset.init` guarda el HTML original), estado y audio.

### 6.6 Transcripción: scroll suave con FLIP + máscara
```css
.chat { height:250px; overflow:hidden; mask-image: linear-gradient(to bottom, transparent 0, #000 44px); }
.chat__track { position:absolute; left:0; right:0; bottom:0; display:flex; flex-direction:column; gap:10px; padding:0 16px 14px; will-change:transform; }
.msg { animation: msg-in 520ms var(--ease) both; transition: opacity 500ms var(--ease); max-width:88%; }
.msg.is-old { opacity:.4; }
@keyframes msg-in { from { opacity:0; transform: translate3d(0,10px,0) scale(.97); } }
.msg--client { align-self:flex-start; transform-origin:left bottom; }
.msg--bot    { align-self:flex-end;   transform-origin:right bottom; }   /* el mensaje "crece" desde su esquina */
```
- El `track` está **anclado abajo**: al añadir un mensaje el contenido crecería hacia arriba de golpe. El FLIP (§2.11 de `motion-system`) mide el delta de altura y anima el track desde `translateY(delta)` a 0 en **560 ms** → el scroll es continuo.
- La máscara de 44 px hace que lo viejo se difumine al salir por arriba; además, todo menos los dos últimos elementos recibe `is-old` (opacidad .4) para guiar la vista a lo reciente.
- Burbujas asimétricas: cliente a la izquierda (gris, esquina inferior izquierda recta), bot a la derecha (azul tenue con borde interior, esquina inferior derecha recta) → se lee "quién habla" sin leer la etiqueta.
- Burbuja del bot con `box-shadow: inset 0 0 0 1px` en lugar de `border` (no altera el layout).

### 6.7 La ficha que se rellena sola
Cada fila tiene el valor (`.fv`, `opacity:0; translateY(6px)`) y un **esqueleto de carga** (`.sk`) superpuesto con `shimmer` (gradiente que se desplaza, 1.8 s linear). Al añadir `is-set`: el valor aparece (600 ms) y el esqueleto se desvanece (320 ms).
- Alternar anchos del esqueleto (`:nth-of-type(odd)` 48 % vs 62 %) evita el aspecto de plantilla.
- **Cambio de un valor ya relleno** (la hora pasa de 10:30 a 11:15): se quita `is-set` (fundido de salida), a los **280 ms** se reescribe el HTML y se vuelve a poner `is-set`. Hay que comprobar `runId` dentro del `setTimeout` para no escribir tras un reinicio.
- El estado final usa una etiqueta verde ("Reserva confirmada"); los intermedios, azul ("Pendiente de confirmar"). **El color cuenta el progreso** sin necesidad de texto adicional.

### 6.8 Pequeños relojes y piezas "vivas" del escenario
- Cronómetro de la llamada + espejo en el panel "Llamadas simultáneas" (`[data-mirror-timer]`) + segundo contador independiente con base 72 s (`line2Base + s`): **tres relojes derivados de un único `callStart`**, cero deriva entre ellos.
- Mini ecualizadores CSS de 4 barras con `animation-delay` y `duration` distintos por barra (`-250ms`, `-500ms`, 800/1000/1200 ms).
- Punto parpadeante del pie (`blink 1.6s`) y puntos pulsantes (`pulse` 2.4 s).
- Botón "Escuchar demo": al reproducir, el icono ▶ se reduce (`scale .5`, opacity 0) y aparece un mini ecualizador blanco en el mismo círculo.

### 6.9 Sonido (opcional pero muy potente)
Un MP3 por intervención del bot (`assets/1.mp3…8.mp3`); la clienta solo en texto. Desactivado por defecto: el botón de sonido invita con un anillo pulsante (`sound-hint` 2.8 s) y al activarlo pasa a verde con ecualizador que se expande cuando habla el bot. Reglas (detalle en `motion-system` §2.14): el clic es el gesto, desbloqueo silencioso para iOS, entrar a mitad de frase en el punto exacto, cortar al salir del viewport. En reduced-motion el botón se oculta (`display:none`).

---

## 7 · Responsive

| Ancho | Cambio |
|---|---|
| ≤ 1020 px | `.stage` pasa a columna (`height:auto; flex-direction:column; gap:14px`); todas las piezas a `position:relative`, `translate:none`; se **ocultan** panel de líneas, chips y anillos; la ficha pasa a 2 columnas; el float se sustituye por la entrada simple (no hay parallax en táctil) |
| ≤ 720 px | orbes sin animación (opacity .7); CTA en columna a ancho completo; cabecera de la tarjeta en 2 columnas; chat 270 px; ficha en 1 columna |

Principio: en móvil se conserva **el producto funcionando** (tarjeta + ficha) y se retira la decoración.

---

## 8 · Movimiento reducido

- Los keyframes de entrada se anulan por la regla global.
- `renderStatic()`: construye todos los mensajes con palabras visibles, los eventos con estado `is-done`, rellena toda la ficha, activa `stage.is-done` y fija el cronómetro en `00:58`. Resultado: **un fotograma final legible**, no un hero vacío.
- No se arrancan ni la demo, ni el bucle de ondas, ni el parallax, ni el audio.
- El botón "Escuchar demo" solo hace scroll al escenario.

---

## 9 · Receta para reproducirlo en otro producto (orden de trabajo)

1. **Elegir el "momento mágico" del producto** que se pueda ver en 40–60 s (aquí: una llamada que acaba en reserva). Escribirlo como guion: quién habla, qué dato nace, qué acción del sistema ocurre.
2. **Definir 3–5 piezas del escenario:** 1 protagonista (donde ocurre la historia) + 2 paneles que muestran el *resultado* (ficha, métricas, estado) + 1–2 chips con promesas/confirmaciones.
3. **Maquetar estático primero** (composición asimétrica, solapes con z-index, sombras tintadas). Debe verse bien sin ninguna animación.
4. **Añadir tokens y estados por atributo** (`data-state`, `data-speaker` o equivalentes) y escribir TODO el CSS reactivo antes de la lógica.
5. **Entrada:** `--h` en HTML, `hero-in` para texto, `stage-in` para escenario, `splitWords` para el titular (esperando fuentes).
6. **Atmósfera:** rejilla enmascarada + 2 orbes con duraciones distintas + anillos (si el concepto es voz/señal/radar).
7. **Float + parallax** con `--depth` creciente hacia el usuario; float solo en chips.
8. **Motor de la visualización protagonista** (onda, gráfico, etc.) con `target` + inercia.
9. **Guion + orquestación async** con `runId`, `reset()` y `renderStatic()`. Primero el guion funcionando sin audio.
10. **Audio** (si aplica) al final, como mejora opcional.
11. **Responsive** (≤1020 y ≤720) y **reduced-motion**.
12. **Verificar:** consola limpia, reinicios repetidos sin duplicados, 390 px sin scroll horizontal, reduced-motion con el estado final completo, demo pausada fuera de viewport.

---

## 10 · Valores de referencia (copiar y ajustar)

| Concepto | Valor |
|---|---|
| Curva | `cubic-bezier(.22,1,.36,1)` |
| Texto del hero | 900 ms, `translateY(16px)`, delay `h·90+120` ms |
| Titular | 800 ms, 55 ms/palabra, `--base:150ms`, sube 112 % |
| Escenario | 1000 ms, `translateY(32px) scale(.97)`, delay `h·90+120` ms |
| Float | 9 s, −7 px, empieza `h·90+1200` ms |
| Parallax | lerp .08, `--depth` 6 / 16 / 20 / 26 / 28 px |
| Orbes | blur 90 px, 32 s y 38 s, alternate, 90–100 px de recorrido |
| Anillos | 3 × 10 s, escala .55→1.7, desfase 3.33 s |
| Orbe de la llamada | 2 anillos, 1.8 s, escala 1→1.7, desfase .6 s |
| Onda | 46 barras, inercia .14, ancho máx. 4 px, 56 px de alto |
| Mensaje | `msg-in` 520 ms · FLIP 560 ms · palabra 280 ms · máscara 44 px · antiguos .4 |
| Pausas del guion | 1200 inicial · 450 entre pasos · 700/600 "escribiendo" · 500 + 1600 evento · 5200 final · 500 + 600 fade de reinicio |
| Ficha | valor 600 ms, esqueleto 320 ms, cambio de valor a los 280 ms |

---

## 11 · Errores a evitar (específicos del hero)

- Usar `transform` en el wrapper y en el hijo para cosas distintas (entrada/parallax) → se pisan. Separar por nivel o usar `translate`.
- Arrancar el float a la vez que la entrada.
- Dejar el titular esperando a `window.load` o animarlo antes de que la fuente esté lista.
- Mover el parallax también en táctil o con reduced-motion.
- Que el texto termine después que el audio (calcular `per` con el 88 % de la duración).
- Rellenar la ficha **antes** de que se diga el dato (rompe la causalidad que vende el producto).
- Guion sin ninguna fricción: se percibe como falso.
- Mensajes que hacen saltar la lista (olvidar el FLIP).
- Reinicios que mezclan ejecuciones (sin `runId`).
- Dejar blur grande animado en móvil.
- Un hero reducido en movimiento que muestre la tarjeta vacía.
