---
name: motion-system
description: Proceso y primitivas para diseñar e implementar motion design en webs HTML/CSS/JS sin librerías (reveals, titulares animados, bucles ambientales, componentes con vida propia, demos narrativas, scroll-linked, hover reactivo). Úsalo cuando se pida "animaciones", "motion", "que se sienta vivo/premium" o al construir cualquier landing o interfaz donde el movimiento deba ser coherente, rápido y accesible.
---

# Skill · Sistema de motion para interfaces web

Este documento no describe unas animaciones concretas: describe **cómo se piensa, se construye y se verifica** un motion system, para que puedas replicarlo en cualquier proyecto. Los fragmentos de código son plantillas genéricas; cambia nombres y valores, conserva la estructura.

Origen: se extrajo de una landing estática (HTML + CSS + JS plano, sin dependencias) con ~10 componentes animados, y está validada en desktop y 390 px.

---

## 0 · Filosofía (las 7 reglas que lo gobiernan todo)

1. **Un sistema, no efectos sueltos.** Una sola curva de easing y tres duraciones para toda la web. Si una animación necesita una curva o duración propia, probablemente sobra.
2. **El movimiento comunica, no decora.** Cada animación responde a una pregunta: ¿qué ha aparecido? ¿qué ha cambiado? ¿dónde estoy? ¿esto está vivo? Si no responde ninguna, se elimina.
3. **Solo `transform` y `opacity`** (más `clip/mask` y variables CSS que alimentan transform). Nunca animar `width/height/top/left/margin`. Excepción controlada: `max-height` para acordeones pequeños.
4. **CSS anima, JS orquesta.** El JS no mueve píxeles frame a frame salvo en motores especiales (ondas, parallax con inercia). Normalmente solo cambia una clase (`is-in`, `is-on`), un atributo `data-*` o una variable CSS (`--p`, `--mx`), y el CSS hace la transición.
5. **Todo lo que se repite, se pausa fuera de pantalla** (y con la pestaña oculta). Un bucle invisible es CPU gastada.
6. **`prefers-reduced-motion` es un diseño, no un parche.** La versión sin movimiento muestra el estado final completo (no vacío).
7. **Mejora progresiva.** Sin JS, todo el contenido debe ser visible. Los estados ocultos de entrada solo existen bajo `.js`.

---

## 1 · Proceso paso a paso

Sigue este orden. No saltes a escribir keyframes.

### Paso 1 · Inventario de componentes
Lista cada sección y su componente visual principal. Para cada uno escribe una frase: *"qué debe sentir el usuario al verlo"* (vivo, rápido, ordenado, inteligente…). Esa frase decide el tipo de motion.

### Paso 2 · Definir tokens de motion (una sola vez, en `:root`)
```css
:root {
  --ease:    cubic-bezier(0.22, 1, 0.36, 1);   /* salida suave y larga: la curva de TODO */
  --ease-io: cubic-bezier(0.65, 0, 0.35, 1);   /* solo para recorridos de ida y vuelta / bucles largos */
  --d1: 180ms;  /* micro: hover, color, press */
  --d2: 320ms;  /* estado: abrir/cerrar, cambios de panel, pill del nav */
  --d3: 600ms;  /* entrada: reveals, aparición de bloques */
}
```
Fuera de estas tres duraciones solo hay dos familias permitidas:
- **Narrativas/hero** (700–1000 ms): entrada del hero, mensajes, titulares palabra a palabra (800 ms).
- **Ambientales** (6–40 s): derivas de fondo, flotación, marquee, barridos. Lentas para que se perciban como atmósfera, nunca como "algo que se mueve".

### Paso 3 · Clasificar cada animación en una de 5 categorías
| Categoría | Cuándo | Disparador | Ejemplo de técnica |
|---|---|---|---|
| **Entrada** | un elemento aparece al hacer scroll | IntersectionObserver (una vez) | reveal, layers, titular por palabras |
| **Ambiental** | la página "respira" | CSS `infinite`, lento | drift de blobs, float, pulse-ring, marquee, sweep |
| **Reactiva** | responde al puntero/foco | `pointermove`/hover/focus | spotlight, pill del nav, botón con brillo, parallax |
| **Viva (bucle de datos)** | un componente simula actividad real | `setInterval` solo si visible | historial que añade filas, notificaciones apiladas, tabs que rotan |
| **Narrativa** | cuenta una historia secuenciada | guion async + cancelación | demo de llamada con transcripción, ficha que se rellena |
| **Scroll-linked** | el progreso del scroll mueve algo | scroll + rAF throttled | línea de progreso de "cómo funciona" |

### Paso 4 · Asignar a cada sección: 1 entrada + 1 componente vivo (máx.)
Regla de densidad: una sección = una entrada (reveal/layers) + como mucho **un** movimiento protagonista. Si hay dos cosas moviéndose a la vez compitiendo, quita una.

### Paso 5 · Implementar con las primitivas de la sección 2
Reutiliza primitivas; no reinventes. Los atributos `data-*` son la API: el HTML declara la intención (`data-reveal`, `data-split`, `data-spot`, `data-count`, `data-wave`), el JS la descubre.

### Paso 6 · Escribir el contrato de movimiento reducido (sección 3)

### Paso 7 · Verificar (sección 5)

---

## 2 · Primitivas (con plantilla de código)

### 2.1 Utilidades base y guardia `.js`
```html
<!-- en <head>, antes del CSS que oculta estados de entrada -->
<script>document.documentElement.classList.add('js')</script>
```
```js
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** cb(visible) cada vez que el elemento entra o sale del viewport */
function watch(el, cb, margin = '80px') {
  if (!('IntersectionObserver' in window)) return cb(true);
  new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { rootMargin: margin }).observe(el);
}

/** setInterval que solo corre mientras el elemento es visible */
function whileVisible(el, fn, ms) {
  if (reduce) return;
  let id = 0;
  watch(el, v => { clearInterval(id); if (v) id = setInterval(fn, ms); });
}
```
`watch` + `whileVisible` son la base del principio "se pausa fuera de pantalla". Todo bucle JS pasa por ellos.

### 2.2 Reveal al entrar (entrada)
HTML: `<div data-reveal style="--i:2">` (`--i` = índice de escalonado; `data-reveal="fade"` o `"scale"` para variantes).
```css
.js [data-reveal] {
  opacity: 0;
  transform: translate3d(0, 18px, 0);
  transition: opacity var(--d3) var(--ease) calc(var(--i, 0) * 80ms),
              transform var(--d3) var(--ease) calc(var(--i, 0) * 80ms);
}
.js [data-reveal].is-in { opacity: 1; transform: none; }
.js [data-reveal="fade"]  { transform: none; }
.js [data-reveal="scale"] { transform: translate3d(0, 14px, 0) scale(.97); }
.js [data-reveal="scale"].is-in { transform: none; }
```
```js
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  io.unobserve(e.target);          // una sola vez
  reveal(e.target);
}), { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });  // dispara algo ANTES de estar totalmente dentro
$$('[data-reveal], [data-split], .layers').forEach(el => io.observe(el));
```
**Lección clave — liberar el reveal.** El `transition-delay` del reveal choca con las transiciones de hover del mismo elemento (el hover llegaría con retardo y duración de 600 ms). Solución: tras terminar el reveal, quitar el atributo:
```js
function reveal(el) {
  el.classList.add('is-in');
  if (el.hasAttribute('data-reveal')) {
    let done = false;
    const release = () => { if (!done) { done = true; el.removeAttribute('data-reveal'); } };
    el.addEventListener('transitionend', e => e.target === el && e.propertyName === 'opacity' && release());
    setTimeout(release, 1800);   // red de seguridad si transitionend no llega
  }
}
```
Al quitar `data-reveal` el elemento pasa a sus estilos normales (`opacity:1; transform:none`) y recupera sus propias transiciones.

### 2.3 Layers (interfaces de demostración que se montan por capas)
Para mini-UIs dentro de tarjetas: los hijos directos aparecen en cascada con `--l`.
```css
.js .layers > * {
  opacity: 0; transform: translate3d(0, 10px, 0) scale(.985);
  transition: opacity var(--d3) var(--ease) calc(var(--l, 0) * 90ms + 180ms),
              transform var(--d3) var(--ease) calc(var(--l, 0) * 90ms + 180ms);
}
.js .layers.is-in > * { opacity: 1; transform: none; }
.js .layers.is-settled > * { transition-delay: 0ms; }  /* tras montarse, responden sin retardo */
```
```js
if (el.classList.contains('layers')) setTimeout(() => el.classList.add('is-settled'), 2200);
```
En el HTML: `<div class="layers"><div style="--l:0">…</div><div style="--l:1">…</div></div>`.

### 2.4 Titulares palabra a palabra (máscara + subida)
Cada palabra va en una **caja con `overflow:hidden`** y el texto interior sube desde 112 %. Efecto editorial, barato (solo transform).
```js
function splitWords(el) {
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim()); // accesibilidad: el lector lee la frase entera
  let i = 0;
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) {                       // texto
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(' '));
        const w = document.createElement('span'), s = document.createElement('span');
        w.className = 'w'; w.setAttribute('aria-hidden', 'true');
        s.textContent = part; s.style.setProperty('--w', i++);
        w.appendChild(s); frag.appendChild(w);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);   // recorre <span class="muted"> internos
  });
  walk(el);
}
$$('[data-split]').forEach(splitWords);
```
```css
.w { display:inline-block; overflow:hidden; vertical-align:top; padding-bottom:.12em; margin-bottom:-.12em; } /* no corta descendentes (g, y, p) */
.w > span { display:inline-block; will-change: transform; }
.js [data-split] .w > span { transform: translate3d(0,112%,0);
  transition: transform 800ms var(--ease) calc(var(--w,0) * 55ms + var(--base,0ms)); }
.js [data-split].is-in .w > span { transform: none; }
```
- Conservar el recorrido de nodos (no `innerHTML`) para respetar `<span>` internos con estilos.
- `--base` permite retrasar el titular del hero (`style="--base:150ms"`).
- **Hero:** se revela al cargar, no al hacer scroll, y **cuando la fuente ya está lista** para evitar el salto tipográfico:
```js
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))])
  .then(() => requestAnimationFrame(() => heroTitle.classList.add('is-in')));
```
(Excluir el h1 del observer genérico.)

### 2.5 Spotlight bajo el cursor (reactiva, solo puntero fino)
JS mínimo: escribe la posición relativa en variables; el CSS pinta un degradado radial y un borde luminoso.
```js
if (finePointer) $$('[data-spot]').forEach(el =>
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', e.clientX - r.left + 'px');
    el.style.setProperty('--my', e.clientY - r.top + 'px');
  }));
```
```css
[data-spot] { position: relative; isolation: isolate; }
[data-spot]::before, [data-spot]::after { content:""; position:absolute; pointer-events:none; opacity:0; transition: opacity var(--d2) var(--ease); }
[data-spot]::before { inset:0; z-index:-1; border-radius:inherit;
  background: radial-gradient(440px circle at var(--mx,50%) var(--my,50%), rgba(63,70,242,.09), transparent 62%); }
/* borde luminoso: degradado enmascarado para que solo se vea en el contorno */
[data-spot]::after { inset:-1px; border-radius:inherit; padding:1px;
  background: radial-gradient(240px circle at var(--mx,50%) var(--my,50%), rgba(63,70,242,.55), transparent 70%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
[data-spot]:hover::before, [data-spot]:hover::after { opacity: 1; }
```

### 2.6 Pill deslizante en el navbar (reactiva)
Una única píldora absoluta que se desplaza y redimensiona al enlace con hover/focus. **Truco:** la primera vez que aparece se coloca sin transición (si no, volaría desde 0).
```js
let pillVisible = false;
const movePill = a => {
  if (!pillVisible) pill.style.transition = 'none';
  pill.style.width = a.offsetWidth + 'px';
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
  if (!pillVisible) { pill.getBoundingClientRect(); pill.style.transition = ''; pillVisible = true; } // forzar reflow y restaurar
  pill.style.opacity = '1';
};
// pointerenter + focus → movePill ; pointerleave/focusout del contenedor → opacity 0, pillVisible=false
```

### 2.7 Navbar con estado de scroll + scroll-spy
- `scrollY > 8` → clase `is-scrolled` (reduce altura, `backdrop-filter`, sombra, línea inferior). Listener `{ passive: true }`.
- Scroll-spy: **una línea de referencia al 40 % del viewport**; la sección cuyo rect la contiene es la activa. Throttle con rAF (patrón en 2.10).
- Menú móvil: panel con `opacity + translateY(-8px) scale(.985)` y `transform-origin: top`; **`visibility` con retardo** en el cierre (`visibility 0s linear var(--d2)`) para que no se pueda tabular al panel cerrado; los enlaces entran escalonados con `transition-delay: calc(var(--i)*45ms + 60ms)`.

### 2.8 Contadores
Ease-out cuártico (`1 - (1-p)^4`), 1000 ms, se dispara cuando el 80 % es visible, con 250 ms de espera. Con `reduce`, el valor final se queda tal cual en el HTML.
```js
const step = t => {
  const p = clamp((t - t0) / 1000, 0, 1);
  el.textContent = Math.round(end * (1 - Math.pow(1 - p, 4)));
  if (p < 1) requestAnimationFrame(step);
};
```
Usar `font-variant-numeric: tabular-nums` para que el número no "baile".

### 2.9 Motor de ondas de voz / barras (único bucle rAF compartido)
Patrón reutilizable para **cualquier visualización que anime muchos elementos** (ecualizadores, barras, partículas simples):
- **Un solo `requestAnimationFrame`** para todas las instancias, que solo dibuja las que están visibles.
- Cada barra: `transform: scaleY(v)` (nunca `height`).
- `v = nivel × envolvente × ruido`. Envolvente senoidal para que el centro sea más alto que los bordes; ruido = dos senos con frecuencia/fase aleatoria por barra (`seeds`).
- **Interpolación del nivel** (`level += (target - level) * 0.14`) → pasa de "escucha" a "habla" con inercia, sin saltos. Quien controla la historia solo cambia `wave.target`.
- Solo escribir en el DOM si el valor cambió más de un umbral (`> 0.008`).
- Parar el bucle si nada es visible o `document.hidden`; reanudarlo con `visibilitychange` y con el `watch`.
```js
const env = Math.pow(Math.sin(Math.PI * (i + .5) / n), .7);
const a = .5 + .5 * Math.sin(t * s.f1 + s.p + i * .42);
const b = .55 + .45 * Math.sin(t * s.f2 * .8 + i * 1.3);
const v = clamp(w.level * env * (.25 + .75 * a * b) * 1.4, .09, 1);
```
Modos: `data-mode="ambient"` (nivel constante, siempre "viva") vs. controlada por JS (nivel dirigido por la narrativa). Con `reduce`: dibujar **un fotograma estático** y no arrancar el bucle.

### 2.10 Scroll-linked con variable CSS (`--p`) y throttle rAF
JS calcula progreso 0‒1 y lo escribe en una variable; el CSS lo consume (`scaleX(var(--p))`, etc.). Nada de animar en JS.
```js
let ticking = false;
const update = () => {
  ticking = false;
  const r = wrap.getBoundingClientRect(), vh = innerHeight;
  const p = reduce ? 1 : clamp((vh * .72 - r.top) / (r.height * .75 + vh * .1), 0, 1);
  wrap.style.setProperty('--p', p.toFixed(3));
  steps.forEach((s, i) => {                       // umbrales por paso: activo y "ya pasado"
    s.classList.toggle('is-active', p >= th[i]);
    s.classList.toggle('is-passed', p >= th[i + 1]);
  });
};
const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
addEventListener('scroll', req, { passive: true });
addEventListener('resize', req);
update();
```
```css
.line-fill { transform-origin: left; transform: scaleX(var(--p, 0)); }   /* o scaleY según la orientación */
```
Con `reduce`, `p = 1`: la línea llega completa y todos los pasos aparecen activos.

### 2.11 FLIP para listas que crecen (chat, feeds)
Cuando se añade un elemento y el resto debe desplazarse con suavidad (no dar un salto):
```js
function push(el) {
  const before = track.offsetHeight;          // First
  track.appendChild(el);
  const delta = track.offsetHeight - before;  // Last → diferencia
  track.style.transition = 'none';
  track.style.transform = `translate3d(0, ${delta}px, 0)`;   // Invert
  track.getBoundingClientRect();              // fuerza reflow
  track.style.transition = 'transform 560ms var(--ease)';
  track.style.transform = '';                 // Play
}
```
El contenedor tiene `overflow:hidden` + una máscara degradada arriba (`mask-image: linear-gradient(to bottom, transparent 0, #000 44px)`) para que los mensajes viejos se desvanezcan al salir, y los antiguos reciben clase `is-old` (menos opacidad).

### 2.12 Texto que aparece palabra a palabra sincronizado (narrativa)
Cada palabra es un `<span class="wd">` con `opacity:0 → 1` (280 ms). El JS añade `.on` a intervalos. **Sincronizar con la duración real** del audio si existe:
```js
const per = dur ? Math.max(60, (dur * .88) / words.length) : (who === 'bot' ? 100 : 85);
```
Antes del texto, un indicador "escribiendo…" (tres puntos con `animation: typing 1s infinite` y retardos escalonados) durante 600–700 ms: da sensación de turno humano.

### 2.13 Narrativa con guion y cancelación (`runId`)
Para demos secuenciadas (conversación, onboarding animado, tour):
- **Datos separados de la orquestación:** un array `SCRIPT` de pasos `{ who, text, rows, event }`. Cambiar la historia no toca la lógica.
- **Una función async lineal** con `await sleep(ms, id)`.
- **Cancelación segura:** cada ejecución incrementa `runId`; `sleep` resuelve `false` si el id ya no es el vigente, y cada `await` se comprueba (`if (!(await sleep(..., id))) return;`). Así reiniciar la demo no deja temporizadores huérfanos mezclados.
- **Máquina de estados en atributos:** `call.dataset.state = 'ringing|active'`, `call.dataset.speaker = 'bot|client|idle'`. El CSS reacciona al atributo (colores, anillos, ecualizador) → el JS nunca toca estilos.
- **`reset()` idempotente** que devuelve todo al estado inicial (usa `dataset.init` para guardar el HTML original de cada campo).
- **Bucle con cierre elegante:** al terminar, pausa ~5 s, desvanece el chat (500 ms) y reinicia.
- **Arranque y pausa por visibilidad:** empieza cuando el componente entra en pantalla (una vez) y el audio se corta al salir.
- **Rellenado de campos:** la ficha se rellena a medida que la conversación dice cada dato (`is-set` por fila); cambios de valor con fundido (cambio de HTML a los 280 ms).
- **Eventos del sistema** (consultando agenda…): fila con spinner → a los ~1.6 s clase `is-done` cambia spinner por check.
- **Versión reducida** (`renderStatic`): construye el mismo DOM con el estado final y sin timers.

### 2.14 Audio en demos (si lo hay)
- Desactivado por defecto (autoplay bloqueado). Se activa con botón o con el clic que inicia la demo (**el clic es el gesto**).
- `preload='auto'` y esperar `loadedmetadata` (con timeout de 1.5 s) antes de calcular duraciones.
- **iOS:** "desbloquear" cada audio la primera vez reproduciéndolo en silencio (`muted`) dentro del gesto, luego pausar y `currentTime = 0`.
- Si el usuario activa sonido a mitad de frase, entrar en el punto exacto (`currentTime = transcurrido`).
- Cortar el audio al salir del viewport o ocultar la pestaña. Capturar `play().catch()` y volver a "sonido desactivado".

### 2.15 Parallax con inercia (reactiva, puntero fino)
Objetivo (`tx,ty`) en −1…1 según el cursor; posición actual interpolada (`cx += (tx-cx)*.08`) escrita en `--px/--py`; el CSS usa `translate3d(calc(var(--px)*Npx), …)` con **N distinto por capa** para dar profundidad. El rAF **se detiene solo** cuando `|t-c| < 0.002` y se reactiva con el siguiente `pointermove`. Al salir (`pointerleave`) el objetivo vuelve a 0.

### 2.16 Auto-rotación con prioridad del usuario
Tabs / paneles que rotan solos hasta que el usuario interactúa:
```js
let manual = false;
tabs.forEach(t => t.addEventListener('click', () => { manual = true; select(i); }));
whileVisible(ask, () => !manual && select((cur + 1) % tabs.length), 5200);
```
Misma idea para el calendario de demo (se autoselecciona un hueco a los 1.5 s **solo si** `!touched`). Accesibilidad: roles `tab`, `aria-selected`, `tabIndex` roving y flechas ←/→.

### 2.17 Barra de progreso CSS que dirige el siguiente paso (sin timers JS)
Lista de beneficios con panel asociado: el elemento activo tiene una barra con `animation: fill 6s linear forwards`. **El evento `animationend` avanza al siguiente** → el timing vive en CSS (se puede pausar con `animation-play-state: paused` en `:hover`).
```js
list.addEventListener('animationend', e => { if (e.animationName === 'bn-fill') set((cur + 1) % n); });
```
Hover/focus/clic sobre un ítem lo selecciona de inmediato; el panel resalta la región correspondiente con `data-bn` ↔ `is-hl` (el elemento y su contraparte visual se iluminan juntos). La clase `is-run` solo está activa mientras la lista es visible.

### 2.18 Pila de tarjetas (notificaciones apiladas)
Cada tarjeta usa `--p` (posición en la pila) para componer su transform: 
```css
transform: translate3d(0, calc(var(--p,0) * 14px), 0) scale(calc(1 - var(--p,0) * .06));
opacity: calc(1 - var(--p,0) * .3);
```
Rotar = `order.push(order.shift())` y reescribir `--p` y `z-index`. El CSS hace toda la animación; un único setInterval en `whileVisible`.

### 2.19 Lista viva (feed que añade filas)
`prepend` de un clon con clase `is-new` (`row-in`: `opacity 0 → 1`, `translateY(-14px) scale(.97) → none`, 650 ms), y retirar el último cuando hay más de N. Mantener N constante evita saltos de layout.

### 2.20 Ambientales CSS (la atmósfera)
Todas con transform/opacity y duraciones largas; nunca más de 1–2 por pantalla:
- **Drift de blobs de fondo:** dos halos con `animation: drift-a 32s ease-in-out infinite alternate` / `drift-b 38s` (duraciones distintas para que nunca se sincronicen), sobre un fondo enmascarado con `mask-image: radial-gradient(...)`.
- **Float:** tarjetas flotantes, `9s ease-in-out infinite`, pequeñas amplitudes (6–10 px).
- **Pulse / ring-out:** punto de estado con `::after` que escala ×3 y se desvanece (`2.4s`); anillos concéntricos con retardo (0.6 s) para el "latido".
- **Marquee:** `animation: marquee var(--dur, 40s) linear infinite` sobre contenido duplicado, con máscara lateral (`linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)`).
- **Sweep radar:** `conic-gradient` enmascarado + `rotate` 12 s linear.
- **Ecualizador CSS:** `animation: eq 900ms ease-in-out infinite alternate` con `animation-delay` distinto por barra (`nth-child`).
- **Shimmer** de carga: gradiente que viaja con `translateX` (1.8 s linear).
- **Pausa:** en la landing original los ambientales CSS solo se anulan con `prefers-reduced-motion` (son baratos: transform/opacity). Si añades uno costoso (blur grande, muchos elementos), conmuta además `animation-play-state` con `watch()` para pausarlo fuera de pantalla; es una mejora recomendada, no algo que ya hiciera el original.

### 2.21 Botones
- Press: `:active { transform: translateY(0) scale(.98); transition-duration: 80ms }`.
- Hover: `translateY(-1px)` + sombra más profunda. Icono flecha `translateX(3px)`.
- **Brillo que atraviesa el botón primario:** `::before` con `linear-gradient(105deg, transparent 30%, rgba(255,255,255,.22) 50%, transparent 70%)`, `translateX(-120%) → 120%` en 700 ms al hover; `overflow:hidden; isolation:isolate` en el botón y `z-index:-1` en el pseudo.
- Sombras tintadas del color de marca, nunca negro puro.

### 2.22 Micro-transformaciones de iconos
Icono de menú ↔ cerrar: ambos absolutos y superpuestos, `opacity` + `rotate(±45deg) scale(.7)` en 320 ms. Logo: al hover, cada barra del logotipo hace `scaleY(1.35)` con retardo escalonado (`calc(var(--d)*60ms)`).

---

## 3 · Contrato de `prefers-reduced-motion`

Dos capas:

**Capa CSS (red de seguridad global)** — al final de `base.css`:
```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; transition-delay: 0ms !important;
  }
  .js [data-reveal], .js .layers > *, .js [data-split] .w > span { opacity: 1 !important; transform: none !important; }
}
```
**Capa JS (estado final significativo)** — cada componente decide cómo se ve "ya terminado":
| Componente | Versión sin movimiento |
|---|---|
| Reveals / titulares | visibles desde el inicio (`is-in` sin observer) |
| Contadores | valor final directamente |
| Ondas | un fotograma estático, sin bucle rAF |
| Demo narrativa | `renderStatic()`: transcripción completa + ficha rellenada + estado final |
| Calendario / tabs | selección por defecto ya hecha |
| Línea de progreso | `p = 1` |
| Barra de beneficios | sin autoavance; solo selección manual |
| Intervalos | `whileVisible` no arranca (`if (reduce) return`) |

Regla: **nunca** dejes un componente vacío o a medias en reduced-motion.

---

## 4 · Patrones de decisión rápidos

**¿Qué técnica uso?**
- ¿Aparece al hacer scroll? → `data-reveal` (bloques), `.layers` (mini-UI), `data-split` (titulares).
- ¿Debe responder al ratón? → `data-spot` (tarjetas), pill (nav), parallax (hero). Siempre tras `finePointer`.
- ¿Simula actividad? → `whileVisible` + clon/rotación con clase CSS que anima.
- ¿Cuenta una historia? → guion + `runId` + `data-state`.
- ¿Progreso ligado al scroll? → `--p` + rAF throttle.
- ¿Muchos elementos animados a la vez? → un solo rAF, `scaleY`/`transform`, escribir solo cambios.
- ¿Atmósfera? → ambiental CSS lenta (30+ s), enmascarada, de bajo contraste.

**Temporización:** hover/color → 180 ms · cambios de estado → 320 ms · entradas → 600 ms · titulares → 800 ms (+55 ms/palabra) · escalonado de reveals → 80 ms/índice · layers → 90 ms/capa · bucles de datos → 3.4–5.2 s por ciclo · ambientales → 6–40 s.

**Escalonado:** siempre vía variable CSS (`--i`, `--l`, `--w`, `--k`) asignada en el HTML o JS, nunca con timeouts encadenados.

---

## 5 · Checklist de verificación (obligatoria antes de dar por hecho)

1. **Consola limpia** y sin errores de red (audio/sprites cargan).
2. **Sin JS** (desactivar o forzar): todo el contenido visible.
3. **`prefers-reduced-motion`**: emular y recorrer la página; ningún componente vacío, nada se mueve.
4. **Móvil 390 px y tablet**: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), spotlight/parallax desactivados en táctil, menú móvil funcional.
5. **Rendimiento:** ningún bucle activo fuera de pantalla (comprobar con DevTools → Performance o con logs en `watch`); solo `transform`/`opacity` animados; `will-change` solo en elementos con transición larga y repetida (titulares, track de chat).
6. **Reinicio/robustez:** pulsar "reiniciar demo" repetidamente no duplica mensajes ni temporizadores; cambiar de pestaña y volver no rompe nada.
7. **Hover tras reveal:** una tarjeta ya revelada responde al hover en 180 ms (no en 600 ms + retardo).
8. **Foco por teclado:** el pill y los estados `:focus-visible` funcionan igual que el hover.
9. **Atención visual:** en cualquier scroll, no más de un movimiento protagonista por pantalla.
10. **Capturas** en desktop y móvil como evidencia.

---

## 6 · Anti-patrones (no hacer)

- Curvas y duraciones distintas por componente ("cada animación a su aire").
- Animar `height`, `width`, `top`, `left`, `box-shadow` pesado o `filter: blur` en bucle.
- `setInterval` global sin condición de visibilidad.
- Reveals con `transition-delay` que se quedan activos y estropean el hover (olvidar `release`).
- Ocultar contenido con CSS sin la guardia `.js`.
- Partir texto en spans sin `aria-label` en el padre (lectores de pantalla deletrean palabra a palabra).
- Titulares con `overflow:hidden` por palabra sin `padding-bottom` compensado (corta g/y/p).
- Esperar al `load` para el hero sin esperar a las fuentes (salto tipográfico visible).
- Parallax o spotlight en táctil.
- Animación sin propósito (rebotes, rotaciones gratuitas, entradas distintas en cada bloque).
- Dos o tres bucles ambientales sincronizados (usar duraciones primas/distintas).
- Reduced-motion que simplemente "apaga" y deja estados vacíos u ocultos.
- Temporizadores encadenados con `setTimeout` anidados para narrativas (usar `async/await` + `runId`).

---

## 7 · Plantilla de arranque para un proyecto nuevo

1. Crear `base.css` con tokens (`--ease`, `--ease-io`, `--d1/2/3`), reveals, layers, split, y el bloque `prefers-reduced-motion`.
2. Crear `core.js` con `$`, `$$`, `reduce`, `finePointer`, `clamp`, `watch`, `whileVisible`, `splitWords`, observer de reveal, navbar (scroll + pill + spy + menú), spotlight, contadores y (si hay visualizaciones) el motor de ondas. Exponerlos en un único global (`window.App = {…}`) para que `sections.js` los reutilice.
3. En HTML, declarar intención con atributos: `data-reveal` (+ `style="--i:n"`), `data-split`, `data-spot`, `data-count`, `data-wave`, `.layers` (+ `--l`).
4. Un archivo JS por dominio: `hero.js` (narrativa/parallax), `sections.js` (componentes vivos), `form.js`.
5. Pasar la checklist de la sección 5.

## 8 · Ajustes de "dirección de arte" asociados (para que el motion no parezca genérico)
- Cada sección tiene **su propia composición** y un componente visual diseñado para el producto (no tarjetas idénticas de plantilla).
- El motion refuerza el **concepto del producto** (aquí: voz → ondas, llamadas → transcripción, reservas → calendario) en vez de efectos abstractos.
- Sombras y brillos **tintados del color de marca**; contraste de atmósfera bajo para que el contenido manda.
- Si dudas entre añadir otra animación o dejar respirar el diseño: deja respirar.
