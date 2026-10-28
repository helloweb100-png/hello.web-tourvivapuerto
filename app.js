/* ═══════════════════════════════════════════════════════════════════════
   VIVA PUERTO ESCONDIDO TOURS · app.js
   Dependencias (CDN, ver index.html): GSAP + ScrollTrigger y Lenis.
   El cielo WebGL, el loader, el panel de detalles, el visor de cartels, el menú
   y el formulario funcionan aunque las librerías no carguen.

   Idea central: la página sigue un día completo en Puerto Escondido.
   El shader del cielo recibe la HORA y cambia de amanecer a noche
   mientras recorres las experiencias (sección "journey").
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ───────── Configuración ───────── */
const CONFIG = {
    whatsapp: '529541327997',                       // 954 132 7997 con lada de México
    defaultText: 'Hola, me gustaría información de los tours en Puerto Escondido.',
    heroHour: 5.7,                                  // hora del cielo en el hero (amanecer)
    loaderMin: 1900,
    loaderMax: 6500
};

/* ───────── Utilidades ───────── */
const html = document.documentElement;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const MOBILE = window.innerWidth < 760;
const HAS_GSAP = typeof window.gsap === 'object' && typeof window.ScrollTrigger === 'function';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

if (REDUCED || !HAS_GSAP) html.classList.add('is-static');
if (HAS_GSAP) {
    html.classList.add('gsap');
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
}

const shared = { lenis: null, ready: false, locks: 0 };
const waLink = text => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text || CONFIG.defaultText)}`;

/* ═══════════════════════════════════════════
   SCROLL SUAVE (Lenis) y bloqueo de scroll
   ═══════════════════════════════════════════ */
function initSmoothScroll() {
    if (REDUCED || !HAS_GSAP || typeof window.Lenis !== 'function') return;
    try {
        const lenis = new window.Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false });
        shared.lenis = lenis;
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(t => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
        lenis.stop(); // se libera cuando termina el loader
    } catch (e) { shared.lenis = null; }
}

function lockScroll(on) {
    shared.locks = Math.max(0, shared.locks + (on ? 1 : -1));
    const locked = shared.locks > 0;
    document.body.style.overflow = locked ? 'hidden' : '';
    if (shared.lenis) { if (locked) shared.lenis.stop(); else if (shared.ready) shared.lenis.start(); }
}

function scrollToTarget(target, opts = {}) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    const navH = parseFloat(getComputedStyle(html).getPropertyValue('--nav-h')) || 64;
    if (shared.lenis) shared.lenis.scrollTo(el, { offset: opts.offset ?? -navH + 1, duration: opts.duration ?? 1.7, easing: t => 1 - Math.pow(1 - t, 4) });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
}

function initAnchors() {
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]');
        if (!a || a.classList.contains('skip')) return;
        const id = a.getAttribute('href');
        if (id.length < 2) return;
        const el = $(id);
        if (!el) return;
        e.preventDefault();
        scrollToTarget(el);
    });
}

/* ═══════════════════════════════════════════
   CIELO WEBGL: amanecer a noche según la hora
   ═══════════════════════════════════════════ */
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
/* Hitos del día: color del cielo en el cenit, a media altura y en el horizonte,
   color del mar, color y elevación del sol (o la luna), estrellas e intensidad. */
const KF = [
    { h: 4.5,  top: '#030818', mid: '#0b1a4a', hor: '#1d2f7a', sea: '#050f2e', sun: '#ffb36b', sunY: -0.14, sunI: 0.5, stars: 1.0 },
    { h: 5.9,  top: '#0b1b52', mid: '#6a2f7e', hor: '#ff7a45', sea: '#0a1a47', sun: '#ffb347', sunY: 0.03,  sunI: 1.0, stars: 0.35 },
    { h: 7.5,  top: '#123c9a', mid: '#4d8be0', hor: '#ffcf8a', sea: '#0b3d86', sun: '#fff0c8', sunY: 0.20,  sunI: 1.0, stars: 0.0 },
    { h: 11,   top: '#0a56c8', mid: '#3aa0ee', hor: '#bfeaff', sea: '#0a5ab0', sun: '#ffffff', sunY: 0.55,  sunI: 1.0, stars: 0.0 },
    { h: 14.5, top: '#0b4fb8', mid: '#4aa8e8', hor: '#d7f0ff', sea: '#0a4f9e', sun: '#fff7dc', sunY: 0.45,  sunI: 1.0, stars: 0.0 },
    { h: 17.2, top: '#16307f', mid: '#c8468a', hor: '#ffa13a', sea: '#112a6a', sun: '#ffc860', sunY: 0.07,  sunI: 1.0, stars: 0.0 },
    { h: 18.8, top: '#0a1442', mid: '#6e2a7c', hor: '#ff5a3a', sea: '#0b1a4d', sun: '#ff8a4a', sunY: -0.06, sunI: 0.9, stars: 0.3 },
    { h: 21,   top: '#02061a', mid: '#071a4a', hor: '#10306e', sea: '#030a22', sun: '#cfe0ff', sunY: 0.30,  sunI: 0.55, stars: 1.0 },
    { h: 22,   top: '#01040f', mid: '#05103a', hor: '#0c2860', sea: '#02071a', sun: '#cfe0ff', sunY: 0.34,  sunI: 0.5, stars: 1.0 }
].map(k => ({ ...k, top: hex(k.top), mid: hex(k.mid), hor: hex(k.hor), sea: hex(k.sea), sun: hex(k.sun) }));

function paletteAt(hour) {
    const h = clamp(hour, KF[0].h, KF[KF.length - 1].h);
    let i = 0;
    while (i < KF.length - 2 && h > KF[i + 1].h) i++;
    const a = KF[i], b = KF[i + 1];
    const t = smooth(clamp((h - a.h) / (b.h - a.h), 0, 1));
    const mix3 = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
    return {
        top: mix3(a.top, b.top), mid: mix3(a.mid, b.mid), hor: mix3(a.hor, b.hor), sea: mix3(a.sea, b.sea), sun: mix3(a.sun, b.sun),
        sunY: lerp(a.sunY, b.sunY, t), sunI: lerp(a.sunI, b.sunI, t), stars: lerp(a.stars, b.stars, t)
    };
}

const SKY_VS = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
const SKY_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime;
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uSea; uniform vec3 uSunCol;
uniform vec3 uSun;          // x: posicion horizontal (-1..1), y: elevacion sobre el horizonte, z: intensidad
uniform float uHorizon; uniform float uStars; uniform float uMotes; uniform vec2 uMouse;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.02 + vec2(7.1, 3.7); a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * asp, uv.y);
  vec2 m = uMouse - 0.5;
  float H = uHorizon + m.y * 0.012;
  float t = uTime;
  vec2 sp = vec2(uSun.x * 0.5 * asp + m.x * 0.03, H + uSun.y);
  float sunOn = uSun.z;
  float dist = length(p - sp);
  vec3 col;

  if(uv.y >= H){
    float sy = (uv.y - H) / (1.0 - H);
    vec3 sky = mix(uHor, uMid, smoothstep(0.0, 0.38, sy));
    sky = mix(sky, uTop, smoothstep(0.22, 1.0, sy));
    float hg = exp(-sy * 5.5) * (0.45 + 0.55 * exp(-abs(p.x - sp.x) * 1.4));
    sky += uHor * hg * 0.55;
    float halo = exp(-dist * 4.2) * 0.55 + exp(-dist * 16.0) * 0.9;
    sky += uSunCol * halo * sunOn * 0.8;
    // nubes que derivan despacio
    vec2 cq = vec2(p.x * 1.1 + t * 0.012, sy * 2.6);
    float c = fbm(cq * vec2(1.4, 2.6) + vec2(0.0, 3.0));
    float band = smoothstep(0.42, 0.78, c) * smoothstep(0.03, 0.2, sy) * (1.0 - smoothstep(0.35, 0.95, sy));
    vec3 cloudCol = mix(uMid, uHor, 0.65) * 1.2 + uSunCol * 0.22 * halo;
    sky = mix(sky, cloudCol, band * 0.5);
    // estrellas con parpadeo
    if(uStars > 0.01){
      vec2 sg = p * 70.0 + vec2(3.1, 7.7);
      vec2 id = floor(sg); vec2 f = fract(sg) - 0.5;
      float r = hash21(id);
      float tw = 0.5 + 0.5 * sin(t * (1.5 + r * 3.0) + r * 40.0);
      vec2 off = (vec2(hash21(id + 1.7), hash21(id + 8.3)) - 0.5) * 0.6;
      float s = (1.0 - smoothstep(0.0, 0.08, length(f - off))) * step(0.93, r) * tw;
      sky += vec3(0.9, 0.95, 1.0) * s * uStars * smoothstep(0.1, 0.5, sy);
    }
    float discFade = 1.0 - smoothstep(0.28, 0.5, uSun.y);   // al mediodía el sol deslumbra: solo queda su resplandor
    float disc = (1.0 - smoothstep(0.05, 0.068, dist)) * discFade;
    sky = mix(sky, uSunCol * 1.1, disc * sunOn);
    col = sky;
  } else {
    float dy = H - uv.y;
    float depth = dy / max(H, 0.001);
    float z = 1.0 / (dy * 2.6 + 0.05);
    vec2 q = vec2(p.x * z * 0.85 + m.x * 0.4, z * 1.15 - t * 0.28);
    float w1 = vnoise(q * vec2(1.2, 0.9) + vec2(t * 0.05, 0.0));
    float w2 = vnoise(q * vec2(3.2, 2.6) + vec2(-t * 0.12, 0.0));
    float w3 = vnoise(q * vec2(7.5, 6.0) + vec2(t * 0.2, t * 0.07));
    float wave = w1 * 0.5 + w2 * 0.32 + w3 * 0.18;
    vec3 refl = mix(uHor * 0.75 + uSea * 0.35, uSea, smoothstep(0.0, 0.55, depth));
    vec3 sea = mix(refl, uSea, smoothstep(0.0, 1.0, depth) * 0.55);
    sea *= 0.78 + 0.5 * wave;
    // estela de luz del sol sobre el agua
    float pw = 0.025 + dy * 0.5;
    float dxp = (p.x - sp.x) / pw;
    float path = exp(-dxp * dxp);
    float facets = smoothstep(0.55, 0.85, w3 * 0.7 + w2 * 0.5);
    float elev = clamp(uSun.y * 8.0 + 0.45, 0.0, 1.0);
    sea += uSunCol * path * (0.18 + 1.7 * facets) * sunOn * elev * (1.0 - depth * 0.35);
    sea += uHor * smoothstep(0.7, 0.95, w2) * 0.12 * (1.0 - depth);
    sea = mix(sea, uHor, exp(-dy * 34.0) * 0.65);
    col = sea;
  }
  col += uHor * exp(-abs(uv.y - H) * 70.0) * 0.25;

  // destellos flotantes (polvo de luz / bioluminiscencia)
  float mote = 0.0;
  for(int i = 0; i < 3; i++){
    float fi = float(i);
    vec2 g = vec2(p.x, uv.y) * 11.0 * (1.0 + fi * 0.55) + vec2(fi * 13.7, -t * (0.04 + 0.025 * fi));
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float r = hash21(id + fi * 7.3);
    vec2 off = (vec2(hash21(id + 1.3), hash21(id + 4.1)) - 0.5) * 0.6;
    float tw = 0.5 + 0.5 * sin(t * (1.0 + r * 2.0) + r * 20.0);
    mote += (1.0 - smoothstep(0.0, 0.05, length(f - off))) * tw * step(0.82, r);
  }
  col += mix(vec3(0.35, 0.85, 1.0), uSunCol, 0.35) * mote * uMotes * 0.9;

  vec2 vq = (uv - 0.5) * vec2(1.0, 0.85);
  col *= 1.0 - 0.8 * dot(vq, vq);
  col = pow(max(col, 0.0), vec3(0.93));
  col += (hash21(gl_FragCoord.xy + fract(t)) - 0.5) * 0.014;
  gl_FragColor = vec4(col, 1.0);
}`;

const journey = { st: null, goTo: null, active: false, passed: false };
const sky = {
    hour: CONFIG.heroHour, horizon: MOBILE ? 0.55 : 0.42, motes: 1, veil: 0, veilTarget: 0, sunVis: 1,
    gl: null, active: true, dirty: true, time: 0, mouse: [0.5, 0.5], mouseT: [0.5, 0.5], heavy: true, lastCss: -1
};

function initSky() {
    const canvas = $('#sky');
    if (!canvas) return;
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) { html.classList.add('no-gl'); return; }
    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[cielo] shader:', gl.getShaderInfoLog(s)); return null; }
        return s;
    };
    const vs = compile(gl.VERTEX_SHADER, SKY_VS), fs = compile(gl.FRAGMENT_SHADER, SKY_FS);
    if (!vs || !fs) { html.classList.add('no-gl'); return; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { html.classList.add('no-gl'); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uTime', 'uTop', 'uMid', 'uHor', 'uSea', 'uSunCol', 'uSun', 'uHorizon', 'uStars', 'uMotes', 'uMouse'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    sky.gl = gl;

    const scale = MOBILE ? 0.5 : 0.7;
    let lastW = 0, lastH = 0;
    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
        const w = Math.max(2, Math.floor(window.innerWidth * dpr)), h = Math.max(2, Math.floor(window.innerHeight * dpr));
        if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < Math.floor(80 * dpr)) return;
        lastW = w; lastH = h;
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        sky.dirty = true;
    };
    resize();
    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(resize, 180); });

    sky.render = () => {
        const pal = paletteAt(sky.hour);
        // El sol nace a la derecha del hero y se queda detrás del arco de la ruta
        const sunX = lerp(0.28, 0.6, smooth(clamp((sky.hour - CONFIG.heroHour) / 1.6, 0, 1)));
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform1f(U.uTime, sky.time);
        gl.uniform3fv(U.uTop, pal.top); gl.uniform3fv(U.uMid, pal.mid); gl.uniform3fv(U.uHor, pal.hor);
        gl.uniform3fv(U.uSea, pal.sea); gl.uniform3fv(U.uSunCol, pal.sun);
        gl.uniform3f(U.uSun, sunX, pal.sunY, pal.sunI * sky.sunVis);
        gl.uniform1f(U.uHorizon, sky.horizon);
        gl.uniform1f(U.uStars, pal.stars);
        gl.uniform1f(U.uMotes, sky.motes);
        gl.uniform2f(U.uMouse, sky.mouse[0], sky.mouse[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    if (FINE && !REDUCED) {
        window.addEventListener('pointermove', e => { sky.mouseT = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]; }, { passive: true });
    }
    document.addEventListener('visibilitychange', () => { sky.active = !document.hidden; });
    canvas.classList.add('is-on');
}

/* Color del cielo también en CSS (respaldo sin WebGL y acentos de interfaz) */
function syncSkyCss() {
    if (Math.abs(sky.hour - sky.lastCss) < 0.03) return;
    sky.lastCss = sky.hour;
    const pal = paletteAt(sky.hour);
    const css = c => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;
    html.style.setProperty('--sky-top', css(pal.top));
    html.style.setProperty('--sky-mid', css(pal.mid));
    html.style.setProperty('--sky-hor', css(pal.hor));
}

let lastFrame = 0, frameCount = 0, accTime = 0, lastVeil = -1;
function skyTick(timeMs) {
    const now = timeMs;
    const dt = lastFrame ? Math.min(now - lastFrame, 80) : 16;
    lastFrame = now;
    frameCount++;
    sky.veil = lerp(sky.veil, sky.veilTarget, 0.06);
    sky.sunVis = lerp(sky.sunVis, journey.passed ? 0 : 1, 0.05);
    if (Math.abs(sky.veil - lastVeil) > 0.002) { lastVeil = sky.veil; html.style.setProperty('--veil', sky.veil.toFixed(3)); }
    syncSkyCss();
    if (!sky.gl || !sky.active) return;
    accTime += dt;
    // El cielo se dibuja a pleno ritmo en el hero y en el journey; en el resto, a un tercio
    sky.heavy = window.scrollY < window.innerHeight * 1.3 || journey.active;
    if (!sky.heavy && frameCount % 3 !== 0 && !sky.dirty) return;
    if (!REDUCED) sky.time += accTime / 1000;
    accTime = 0;
    sky.mouse[0] = lerp(sky.mouse[0], sky.mouseT[0], 0.05);
    sky.mouse[1] = lerp(sky.mouse[1], sky.mouseT[1], 0.05);
    if (REDUCED && !sky.dirty && Math.abs(sky.hour - (sky._lastHour ?? -1)) < 0.01) return;
    sky._lastHour = sky.hour;
    sky.render();
    sky.dirty = false;
}

/* ═══════════════════════════════════════════
   LOADER: amanecer con anillo de progreso
   ═══════════════════════════════════════════ */
function initLoader(onDone) {
    const loader = $('#loader');
    if (!loader) { onDone(); return; }
    const count = $('#loaderCount'), ring = $('#loaderRing'), sun = $('#loaderSun'), ticks = $('.loader__ticks', loader);
    if (ticks) {
        const ns = 'http://www.w3.org/2000/svg';
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2, long = i % 5 === 0;
            const r1 = long ? 98.5 : 99.6, r2 = 103.5;
            const l = document.createElementNS(ns, 'line');
            l.setAttribute('x1', (100 + Math.cos(a) * r1).toFixed(2)); l.setAttribute('y1', (100 + Math.sin(a) * r1).toFixed(2));
            l.setAttribute('x2', (100 + Math.cos(a) * r2).toFixed(2)); l.setAttribute('y2', (100 + Math.sin(a) * r2).toFixed(2));
            if (long) l.setAttribute('class', 'is-long');
            ticks.appendChild(l);
        }
    }
    const finish = () => {
        loader.classList.add('is-done');
        shared.ready = true;
        html.classList.add('is-ready');
        lockScroll(false);
        onDone();
        setTimeout(() => loader.remove(), 1500);
    };
    if (REDUCED) { loader.remove(); shared.ready = true; html.classList.add('is-ready'); onDone(); return; }

    lockScroll(true);
    const start = performance.now();
    let loaded = document.readyState === 'complete';
    window.addEventListener('load', () => { loaded = true; }, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { loaded = loaded || document.readyState === 'complete'; });
    let value = 0, done = false;
    const tick = now => {
        const t = now - start;
        const target = loaded && t > CONFIG.loaderMin * 0.55 ? 100 : Math.min(90, (t / CONFIG.loaderMin) * 90);
        value = lerp(value, target, loaded ? 0.13 : 0.07);
        const v = clamp(value, 0, 100);
        count.textContent = String(Math.round(v)).padStart(3, '0');
        ring.style.strokeDashoffset = (590.6 * (1 - v / 100)).toFixed(1);
        sun.style.setProperty('--rise', (lerp(62, -4, v / 100)).toFixed(1) + '%');
        sun.style.setProperty('--grow', lerp(0.55, 1.15, v / 100).toFixed(3));
        if (!done && ((loaded && t >= CONFIG.loaderMin && v > 99.3) || t >= CONFIG.loaderMax)) {
            done = true;
            count.textContent = '100';
            ring.style.strokeDashoffset = '0';
            setTimeout(finish, 450);
            return;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════
   TEXTO: partir en palabras y revelar
   ═══════════════════════════════════════════ */
function splitWords(el) {
    if (!el || el.dataset.splitDone) return [];
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    if (el.matches('h2, h3')) el.setAttribute('aria-label', text);
    el.innerHTML = text.split(' ').map(w => `<span class="w" aria-hidden="true"><span class="wi">${w}</span></span>`).join(' ');
    el.dataset.splitDone = '1';
    return $$('.wi', el);
}

function initTextSplits() {
    if (!HAS_GSAP || REDUCED) return;
    // Titulares del hero: se preparan ocultos y entran cuando termina el loader
    $$('.hero [data-words]').forEach(el => splitWords(el));
    gsap.set('.hero .wi', { yPercent: 118, rotate: 5, transformOrigin: '0% 100%' });
    gsap.set('[data-hero-in]', { opacity: 0, y: 26 });

    // Titulares de sección: se preparan aquí y se activan en initReveals()
    $$('[data-split]').forEach(el => {
        const words = splitWords(el);
        gsap.set(words, { yPercent: 118, rotate: 4, transformOrigin: '0% 100%' });
    });
}

/* Se crea después de las secciones fijadas para que ScrollTrigger calcule bien las posiciones */
function initReveals() {
    if (!HAS_GSAP || REDUCED) return;
    $$('[data-split]').forEach(el => {
        const words = $$('.wi', el);
        ScrollTrigger.create({
            trigger: el, start: 'top 88%', once: true,
            onEnter: () => gsap.to(words, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'expo.out', stagger: 0.055 })
        });
    });
    ScrollTrigger.batch('[data-reveal]', {
        start: 'top 90%', once: true,
        onEnter: els => gsap.to(els, {
            opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, overwrite: true,
            // Al terminar se libera el elemento para que sus hover con CSS no peleen con GSAP
            onComplete: () => els.forEach(el => { el.classList.add('is-in'); gsap.set(el, { clearProps: 'opacity,transform' }); })
        })
    });
}

function heroIntro() {
    if (!HAS_GSAP || REDUCED) return;
    gsap.to('.hero .wi', { yPercent: 0, rotate: 0, duration: 1.5, ease: 'expo.out', stagger: 0.1, delay: 0.1 });
    gsap.to('[data-hero-in]', { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: 0.13, delay: 0.55, clearProps: 'transform' });
}

/* ═══════════════════════════════════════════
   NAVEGACIÓN
   ═══════════════════════════════════════════ */
function initNav() {
    const nav = $('#nav'), burger = $('#navBurger'), menu = $('#menu');
    if (!nav) return;
    const links = $$('.nav__links a');
    let hidden = false;
    const setHidden = v => { if (hidden !== v) { hidden = v; nav.classList.toggle('is-hidden', v); } };

    const onScroll = (y, dir) => {
        nav.classList.toggle('is-scrolled', y > 12);
        if (document.body.classList.contains('menu-open') || y < window.innerHeight * 0.5) { setHidden(false); return; }
        if (dir === 1 && y > window.innerHeight * 0.8) setHidden(true);
        else if (dir === -1) setHidden(false);
    };
    if (HAS_GSAP) ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => onScroll(self.scroll(), self.direction) });
    else { let py = 0; window.addEventListener('scroll', () => { const y = window.scrollY; onScroll(y, y > py ? 1 : -1); py = y; }, { passive: true }); }
    nav.addEventListener('focusin', () => setHidden(false));

    const openMenu = () => {
        menu.classList.add('is-open'); menu.setAttribute('aria-hidden', 'false');
        burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Cerrar menú');
        document.body.classList.add('menu-open'); lockScroll(true);
    };
    const closeMenu = () => {
        if (!menu.classList.contains('is-open')) return;
        menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true');
        burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menú');
        document.body.classList.remove('menu-open'); lockScroll(false);
    };
    burger.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu() : openMenu()));
    $$('a', menu).forEach(a => a.addEventListener('click', () => { closeMenu(); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    window.matchMedia('(min-width: 1180px)').addEventListener('change', e => { if (e.matches) closeMenu(); });

    // Enlace activo según la sección visible
    if (HAS_GSAP) {
        links.forEach(a => {
            const sec = $(a.getAttribute('href'));
            if (!sec) return;
            ScrollTrigger.create({ trigger: sec, start: 'top 45%', end: 'bottom 45%', onToggle: self => { a.classList.toggle('is-active', self.isActive); } });
        });
    }
}

/* ═══════════════════════════════════════════
   HERO: el cielo responde al scroll
   ═══════════════════════════════════════════ */
function initHeroScroll() {
    if (!HAS_GSAP || REDUCED) return;
    const inner = $('#heroInner'), seal = $('.seal');
    ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: self => {
            const p = self.progress;
            sky.horizon = lerp(MOBILE ? 0.55 : 0.42, 0.27, smooth(p));
            sky.veilTarget = lerp(0, 0.42, smooth(p));
            sky.motes = 1 - p * 0.5;
            if (inner) { inner.style.transform = `translate3d(0, ${(-p * 90).toFixed(1)}px, 0)`; inner.style.opacity = (1 - clamp(p * 1.35, 0, 1)).toFixed(3); }
            if (seal) seal.style.opacity = (1 - clamp(p * 2.2, 0, 1)).toFixed(3);
        }
    });
}

/* ═══════════════════════════════════════════
   BANDA CINÉTICA (único marquee): la velocidad del scroll la empuja
   ═══════════════════════════════════════════ */
function initBand() {
    const rail = $('#bandRail'), band = $('.band');
    if (!rail || !HAS_GSAP || REDUCED) return;
    const tween = gsap.to(rail, { xPercent: -50, ease: 'none', duration: 40, repeat: -1 });
    let visible = false, prevY = window.scrollY, vel = 0;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) tween.pause(); else tween.resume(); }, { rootMargin: '10% 0px' }).observe(band);
    gsap.ticker.add(() => {
        if (!visible) return;
        const y = window.scrollY;
        vel = lerp(vel, y - prevY, 0.12); prevY = y;
        tween.timeScale(1 + clamp(vel * 0.12, -5, 8));
        gsap.set(rail, { skewX: clamp(-vel * 0.35, -9, 9) });
    });
}

/* ═══════════════════════════════════════════
   APERTURA: la foto se abre desde un arco hasta llenar la pantalla
   ═══════════════════════════════════════════ */
function animateCount(el) {
    const end = parseFloat(el.dataset.count), prefix = el.dataset.prefix || '', obj = { v: 0 };
    if (!HAS_GSAP || REDUCED) { el.textContent = prefix + end; return; }
    gsap.to(obj, { v: end, duration: 2.1, ease: 'power3.out', onUpdate: () => { el.textContent = prefix + Math.round(obj.v); } });
}

function initOpening() {
    const stage = $('#openingStage');
    if (!stage || !HAS_GSAP || REDUCED) {
        $$('#openingStats [data-count]').forEach(el => { el.textContent = (el.dataset.prefix || '') + el.dataset.count; });
        return;
    }
    const media = $('#openingMedia'), img = $('img', media), copy = $('#openingCopy');
    const words = splitWords($('#openingTitle'));
    const wide = window.matchMedia('(min-width: 760px)').matches;
    // El recorte se calcula a mano (arco -> pantalla completa). Interpolar el texto de clip-path
    // con GSAP puede desordenar los valores, así que se anima un número y se construye la cadena.
    const A = wide ? { t: 15, r: 34, b: 12, l: 34, rt: 999, rb: 34 } : { t: 17, r: 11, b: 20, l: 11, rt: 999, rb: 28 };
    const prog = { v: 0 };
    const applyClip = () => {
        const k = 1 - prog.v;
        media.style.clipPath = `inset(${(A.t * k).toFixed(2)}% ${(A.r * k).toFixed(2)}% ${(A.b * k).toFixed(2)}% ${(A.l * k).toFixed(2)}% round ${(A.rt * k).toFixed(1)}px ${(A.rt * k).toFixed(1)}px ${(A.rb * k).toFixed(1)}px ${(A.rb * k).toFixed(1)}px)`;
    };
    applyClip();
    const reveal = [$('#openingLead'), $('#openingStats'), $('.btn', copy)];
    const shade = $('.opening__shade', media);
    gsap.set(img, { scale: 1.4 });
    gsap.set(shade, { opacity: 0.2 });
    gsap.set(words, { opacity: 0.16, yPercent: 0 });
    gsap.set(reveal, { opacity: 0, y: 34 });

    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    tl.to(prog, { v: 1, ease: 'power2.inOut', duration: 1, onUpdate: applyClip }, 0)
      .to(img, { scale: 1, ease: 'power2.out', duration: 1.1 }, 0)
      .to(shade, { opacity: 1, ease: 'power1.in', duration: 0.9 }, 0)
      .to(words, { opacity: 1, stagger: 0.14, duration: 0.3, ease: 'power1.out' }, 0.05)
      .to(reveal, { opacity: 1, y: 0, stagger: 0.12, duration: 0.3, ease: 'power2.out' }, 0.78);

    let counted = false;
    ScrollTrigger.create({
        trigger: stage, start: 'top top', end: '+=170%', pin: true, scrub: 0.7, animation: tl, anticipatePin: 1,
        onUpdate: self => {
            if (!counted && self.progress > 0.8) { counted = true; $$('#openingStats [data-count]').forEach(animateCount); }
        }
    });
}

/* ═══════════════════════════════════════════
   JOURNEY: un día entero en Puerto Escondido
   Sección fijada: cada experiencia aparece a su hora y el cielo cambia con ella.
   ═══════════════════════════════════════════ */


function initJourney() {
    const section = $('#experiencias');
    const pin = $('#journeyPin');
    const wrap = $('#journeyScenes');
    const nav = $('#journeyNav');
    const clock = $('#journeyClock span');
    if (!section || !pin || !wrap) return;
    const scenes = $$('.scene', wrap);
    const N = scenes.length;
    const hours = scenes.map(s => parseFloat(s.dataset.hour));

    // Navegación inferior (también sirve como índice clicable)
    nav.innerHTML = scenes.map((s, i) =>
        `<button class="jn" type="button" data-i="${i}" aria-label="Ir a ${s.dataset.label}"><span class="jn__hour">${s.dataset.clock}</span><span class="jn__label">${s.dataset.label}</span></button>`).join('');
    const jns = $$('.jn', nav);

    if (!HAS_GSAP || REDUCED) { nav.remove(); return; }

    section.classList.add('is-pinned');
    const parts = scenes.map(s => ({ arch: $('.scene__arch', s), img: $('.scene__arch img', s), kids: $$('.scene__body > *', s) }));
    scenes.forEach((s, i) => gsap.set(s, { autoAlpha: i === 0 ? 1 : 0 }));

    const HOLD = 0.5;                          // fracción de cada tramo en que la escena se queda quieta
    const total = N - 1 + HOLD;
    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    tl.set({}, {}, total);                     // fija la duración total
    for (let i = 0; i < N - 1; i++) {
        const a = parts[i], b = parts[i + 1], T = i + HOLD;
        // sale la escena actual
        tl.to(a.kids, { y: -30, autoAlpha: 0, stagger: 0.012, duration: 0.18, ease: 'power2.in', immediateRender: false }, T)
          .to(a.arch, { yPercent: -6, scale: 0.95, autoAlpha: 0, duration: 0.24, ease: 'power2.in', immediateRender: false }, T)
          .set(scenes[i], { autoAlpha: 0 }, T + 0.25)
          // entra la siguiente
          .set(scenes[i + 1], { autoAlpha: 1 }, T + 0.2)
          .fromTo(b.arch, { clipPath: 'inset(100% 0% 0% 0%)', yPercent: 6, scale: 1.05, autoAlpha: 1 }, { clipPath: 'inset(0% 0% 0% 0%)', yPercent: 0, scale: 1, duration: 0.3, ease: 'power2.out' }, T + 0.2)
          .fromTo(b.img, { scale: 1.4 }, { scale: 1, duration: 0.45, ease: 'power2.out' }, T + 0.2)
          .fromTo(b.kids, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.025, duration: 0.2, ease: 'power2.out' }, T + 0.3);
    }

    let activeIdx = -1;
    const setActive = (idx) => {
        if (idx === activeIdx) return;
        activeIdx = idx;
        jns.forEach((b, i) => { b.classList.toggle('is-active', i === idx); if (i === idx) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
        if (clock) {
            const txt = scenes[idx].dataset.clock;
            gsap.timeline()
                .to(clock, { yPercent: -105, autoAlpha: 0, duration: 0.22, ease: 'power2.in', overwrite: true })
                .add(() => { clock.textContent = txt; })
                .fromTo(clock, { yPercent: 105, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out' });
        }
    };
    setActive(0);

    const st = ScrollTrigger.create({
        trigger: pin, start: 'top top',
        end: () => '+=' + Math.round(Math.max(window.innerHeight * 0.95, 640) * total),
        pin: true, scrub: 0.8, animation: tl, anticipatePin: 1, invalidateOnRefresh: true,
        onToggle: self => { journey.active = self.isActive; },
        onLeave: () => { journey.passed = true; },
        onEnterBack: () => { journey.passed = false; },
        onUpdate: self => {
            const pos = self.progress * total;
            const i = Math.min(N - 1, Math.floor(pos));
            const local = pos - i;
            let hour = hours[i], idx = i;
            if (i < N - 1 && local > HOLD) {
                const k = smooth((local - HOLD) / (1 - HOLD));
                hour = lerp(hours[i], hours[i + 1], k);
                idx = k > 0.45 ? i + 1 : i;
            }
            sky.hour = hour;
            sky.motes = hour > 19 ? 1.6 : 0.8;
            setActive(idx);
            jns.forEach((b, j) => {
                const f = j === 0 ? 1 : clamp((pos - (j - 1 + HOLD)) / (1 - HOLD), 0, 1);
                b.style.setProperty('--p', f.toFixed(3));
            });
        }
    });
    journey.st = st;
    journey.goTo = idx => {
        // Escena `idx` ya completa: justo después de su transición de entrada
        const target = idx === 0 ? st.start + 2 : st.start + ((idx - 1 + HOLD + 0.67) / total) * (st.end - st.start);
        if (shared.lenis) shared.lenis.scrollTo(target, { duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
        else window.scrollTo({ top: target, behavior: 'smooth' });
    };
    jns.forEach(b => b.addEventListener('click', () => journey.goTo(parseInt(b.dataset.i, 10))));

    // El cielo recupera el protagonismo mientras dura la sección
    ScrollTrigger.create({
        trigger: section, start: 'top 60%', end: 'bottom top',
        onToggle: self => { if (self.isActive) sky.veilTarget = 0.16; }
    });
}

/* ═══════════════════════════════════════════
   PANEL DE DETALLES (drawer) y VISOR DE CARTELS
   ═══════════════════════════════════════════ */
function modalOpen(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    lockScroll(true);
    requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')));
}
function modalClose(dlg) {
    if (!dlg.open) return;
    dlg.classList.remove('is-open');
    setTimeout(() => { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); lockScroll(false); }, REDUCED ? 0 : 520);
}

const cartels = [];
let lb = null;

function initLightbox() {
    const dlg = $('#lightbox');
    if (!dlg) return;
    const img = $('#lbImg'), cap = $('#lbTitle'), cta = $('#lbCta');
    $$('[data-lightbox]').forEach((btn, i) => {
        cartels.push({ slug: btn.dataset.lightbox, title: btn.dataset.title, src: $('img', btn).getAttribute('src'), alt: $('img', btn).alt, btn });
        btn.dataset.idx = i;
    });
    let cur = 0;
    const show = i => {
        cur = (i + cartels.length) % cartels.length;
        const c = cartels[cur];
        img.src = c.src; img.alt = c.alt; cap.textContent = c.title;
        cta.href = waLink(`Hola, vi el cartel de «${c.title}» y quiero reservar. ¿Qué fechas tienen disponibles?`);
    };
    lb = {
        open: slugOrIdx => {
            const idx = typeof slugOrIdx === 'number' ? slugOrIdx : Math.max(0, cartels.findIndex(c => c.slug === slugOrIdx));
            show(idx); modalOpen(dlg);
        }
    };
    cartels.forEach((c, i) => c.btn.addEventListener('click', () => { if (c.btn.closest('.rail__track')?.dataset.moved === '1') return; lb.open(i); }));
    $('#lbPrev').addEventListener('click', () => show(cur - 1));
    $('#lbNext').addEventListener('click', () => show(cur + 1));
    $('#lbClose').addEventListener('click', () => modalClose(dlg));
    dlg.addEventListener('click', e => { if (e.target === dlg) modalClose(dlg); });
    dlg.addEventListener('cancel', e => { e.preventDefault(); modalClose(dlg); });
    dlg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
}

function initDrawer() {
    const dlg = $('#drawer');
    if (!dlg) return;
    const img = $('#drawerImg'), place = $('#drawerPlace'), title = $('#drawerTitle'), body = $('#drawerBody'), cta = $('#drawerCta');
    const open = scene => {
        const det = $('.scene__details', scene);
        const arch = $('.scene__arch img', scene);
        img.src = (arch.currentSrc || arch.src); img.alt = arch.alt;
        place.innerHTML = $('.scene__place', scene).innerHTML;
        title.textContent = $('.scene__title', scene).textContent;
        let inner = det.innerHTML;
        if (det.dataset.cartel) {
            inner += `<button class="d-cartel" type="button" data-open-cartel="${det.dataset.cartel}"><img src="img/cartels/${det.dataset.cartel}.jpg" alt="" width="120" height="120" loading="lazy"><span>Ver el cartel original<small>Horarios y precios en imagen</small></span><i class="ph ph-arrow-up-right"></i></button>`;
        }
        body.innerHTML = inner;
        $('.btn__label', cta).textContent = det.dataset.cta || 'Quiero este tour';
        cta.href = waLink(det.dataset.waText);
        $('.drawer__content', dlg).scrollTop = 0;
        modalOpen(dlg);
    };
    $$('[data-details]').forEach(b => b.addEventListener('click', () => open(b.closest('.scene'))));
    $('#drawerClose').addEventListener('click', () => modalClose(dlg));
    dlg.addEventListener('click', e => { if (e.target === dlg) modalClose(dlg); });
    dlg.addEventListener('cancel', e => { e.preventDefault(); modalClose(dlg); });
    body.addEventListener('click', e => {
        const c = e.target.closest('[data-open-cartel]');
        if (!c || !lb) return;
        modalClose(dlg);
        setTimeout(() => lb.open(c.dataset.openCartel), 560);
    });
}

/* ═══════════════════════════════════════════
   BENTO: foco de luz y leve inclinación 3D
   ═══════════════════════════════════════════ */
function initCells() {
    if (!FINE) return;
    $$('.cell').forEach(cell => {
        cell.addEventListener('pointermove', e => {
            const r = cell.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
            cell.style.setProperty('--mx', (px * r.width).toFixed(0) + 'px');
            cell.style.setProperty('--my', (py * r.height).toFixed(0) + 'px');
            if (!REDUCED) { cell.style.setProperty('--rx', ((0.5 - py) * 4).toFixed(2) + 'deg'); cell.style.setProperty('--ry', ((px - 0.5) * 5).toFixed(2) + 'deg'); }
        });
        cell.addEventListener('pointerleave', () => { cell.style.setProperty('--rx', '0deg'); cell.style.setProperty('--ry', '0deg'); });
    });
}

/* ═══════════════════════════════════════════
   CÓMO RESERVAR: la línea se enciende con el scroll
   ═══════════════════════════════════════════ */
function initSteps() {
    const line = $('.steps__line'), steps = $$('.step');
    if (!line || !steps.length) return;
    if (!HAS_GSAP || REDUCED) { steps.forEach(s => s.classList.add('is-lit')); line.style.setProperty('--p', 1); return; }
    ScrollTrigger.create({
        trigger: '.steps__track', start: 'top 72%', end: 'bottom 62%', scrub: true,
        onUpdate: self => {
            const p = self.progress;
            line.style.setProperty('--p', p.toFixed(3));
            steps.forEach((s, i) => s.classList.toggle('is-lit', p >= (i / (steps.length - 1)) * 0.9 + 0.03));
        }
    });
}

/* ═══════════════════════════════════════════
   CARTELERA: carrusel 3D arrastrable
   ═══════════════════════════════════════════ */
function initRail() {
    const track = $('#railTrack');
    if (!track) return;
    const items = $$('.rail__item', track);
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '10% 0px' }).observe(track);

    const update = () => {
        const half = track.clientWidth / 2, sl = track.scrollLeft;
        items.forEach(it => {
            const c = it.offsetLeft + it.offsetWidth / 2 - sl;
            const off = clamp((c - half) / half, -1.4, 1.4);
            it.style.setProperty('--ry', (-off * 24).toFixed(2) + 'deg');
            it.style.setProperty('--s', (1 - Math.abs(off) * 0.09).toFixed(3));
            it.style.setProperty('--o', (1 - Math.min(Math.abs(off), 1.2) * 0.32).toFixed(3));
        });
    };
    update();
    if (!REDUCED) {
        const loop = () => { if (visible) update(); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
    }
    // Arrastre con mouse (en táctil se usa el scroll nativo)
    let down = false, sx = 0, sl = 0, moved = 0;
    track.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') return;
        down = true; sx = e.clientX; sl = track.scrollLeft; moved = 0; track.dataset.moved = '0';
    });
    window.addEventListener('pointermove', e => {
        if (!down) return;
        const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
        if (moved > 5) { track.classList.add('is-drag'); track.dataset.moved = '1'; }
        track.scrollLeft = sl - dx;
    });
    window.addEventListener('pointerup', () => {
        if (!down) return;
        down = false; track.classList.remove('is-drag');
        setTimeout(() => { track.dataset.moved = '0'; }, 60);
    });
    const step = dir => { const w = items[0].offsetWidth + 24; track.scrollBy({ left: dir * w, behavior: REDUCED ? 'auto' : 'smooth' }); };
    $('#railPrev').addEventListener('click', () => step(-1));
    $('#railNext').addEventListener('click', () => step(1));
    // Empezar centrado en el segundo cartel para que se aprecie el efecto 3D
    requestAnimationFrame(() => { if (items[1]) track.scrollLeft = items[1].offsetLeft + items[1].offsetWidth / 2 - track.clientWidth / 2; update(); });
}

/* ═══════════════════════════════════════════
   PREGUNTAS FRECUENTES (acordeón animado)
   ═══════════════════════════════════════════ */
function initFaq() {
    if (!HAS_GSAP || REDUCED) return;
    $$('.faq details').forEach(d => {
        const sum = $('summary', d), ans = $('.faq__a', d);
        sum.addEventListener('click', e => {
            e.preventDefault();
            if (d.open) {
                gsap.to(ans, { height: 0, duration: 0.45, ease: 'power3.inOut', onComplete: () => { d.open = false; gsap.set(ans, { clearProps: 'height' }); } });
            } else {
                d.open = true;
                gsap.fromTo(ans, { height: 0 }, { height: 'auto', duration: 0.65, ease: 'power3.out', clearProps: 'height' });
            }
        });
    });
}

/* ═══════════════════════════════════════════
   FORMULARIO → WHATSAPP
   ═══════════════════════════════════════════ */
function initForm() {
    const form = $('#bookForm');
    if (!form) return;
    const fields = $('#formFields'), done = $('#formDone'), btn = $('#formSubmit');
    const f = { nombre: $('#f-nombre'), tour: $('#f-tour'), personas: $('#f-personas'), fecha: $('#f-fecha'), hotel: $('#f-hotel'), nota: $('#f-nota') };
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    f.fecha.min = today.toISOString().slice(0, 10);

    const setErr = (key, msg) => {
        const el = $('#e-' + key), field = f[key].closest('.field');
        if (!el) return;
        el.textContent = msg || '';
        field.classList.toggle('has-error', !!msg);
        f[key].setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (msg) f[key].setAttribute('aria-describedby', 'e-' + key); else f[key].removeAttribute('aria-describedby');
    };
    const validate = () => {
        let first = null;
        const check = (key, bad, msg) => { setErr(key, bad ? msg : ''); if (bad && !first) first = f[key]; };
        check('nombre', f.nombre.value.trim().length < 2, 'Escribe el nombre de la reservación.');
        check('tour', !f.tour.value, 'Elige la experiencia que quieres vivir.');
        const n = parseInt(f.personas.value, 10);
        check('personas', !(n >= 1 && n <= 30), 'Indica de 1 a 30 personas.');
        check('fecha', !f.fecha.value || f.fecha.value < f.fecha.min, 'Elige una fecha de hoy en adelante.');
        return first;
    };
    ['nombre', 'tour', 'personas', 'fecha'].forEach(k => f[k].addEventListener('input', () => setErr(k, '')));

    const bump = d => { const n = clamp((parseInt(f.personas.value, 10) || 1) + d, 1, 30); f.personas.value = n; setErr('personas', ''); };
    $('#pMinus').addEventListener('click', () => bump(-1));
    $('#pPlus').addEventListener('click', () => bump(1));

    let lastUrl = '';
    form.addEventListener('submit', e => {
        e.preventDefault();
        const bad = validate();
        if (bad) { bad.focus(); return; }
        const fecha = new Date(f.fecha.value + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const lines = [
            'Hola, quiero reservar con Viva Puerto Escondido Tours.',
            '',
            `*Nombre de la reservación:* ${f.nombre.value.trim()}`,
            `*Experiencia:* ${f.tour.value}`,
            `*Personas:* ${f.personas.value}`,
            `*Fecha deseada:* ${fecha}`
        ];
        if (f.hotel.value.trim()) lines.push(`*Hotel u hospedaje:* ${f.hotel.value.trim()}`);
        if (f.nota.value.trim()) lines.push(`*Comentarios:* ${f.nota.value.trim()}`);
        lastUrl = waLink(lines.join('\n'));
        btn.classList.add('is-loading'); btn.disabled = true;
        $('.btn__label', btn).textContent = 'Preparando tu mensaje';
        window.open(lastUrl, '_blank', 'noopener');
        setTimeout(() => {
            btn.classList.remove('is-loading'); btn.disabled = false;
            $('.btn__label', btn).textContent = 'Enviar mi reserva por WhatsApp';
            fields.hidden = true; done.hidden = false;
            $('#formAgain').href = lastUrl;
            if (HAS_GSAP && !REDUCED) gsap.from(done.children, { y: 24, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out' });
            $('h3', done).setAttribute('tabindex', '-1'); $('h3', done).focus({ preventScroll: true });
        }, 900);
    });
    $('#formReset').addEventListener('click', () => { form.reset(); f.personas.value = 2; done.hidden = true; fields.hidden = false; f.nombre.focus(); });
}

/* ═══════════════════════════════════════════
   WHATSAPP: enlaces, botón flotante, imanes
   ═══════════════════════════════════════════ */
function initWhatsApp() {
    $$('[data-wa]').forEach(a => { a.href = waLink(a.dataset.waText); });
    const fl = $('#waFloat');
    if (fl && !REDUCED) {
        setTimeout(() => { fl.classList.add('is-tip'); setTimeout(() => fl.classList.remove('is-tip'), 5200); }, 9000);
    }
}

function initMagnetic() {
    if (!FINE || REDUCED || !HAS_GSAP) return;
    $$('[data-magnetic]').forEach(el => {
        const qx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
        const qy = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
        el.addEventListener('pointermove', e => {
            const r = el.getBoundingClientRect();
            qx((e.clientX - (r.left + r.width / 2)) * 0.22);
            qy((e.clientY - (r.top + r.height / 2)) * 0.3);
        });
        el.addEventListener('pointerleave', () => { qx(0); qy(0); });
    });
}

/* ═══════════════════════════════════════════
   PROGRESO, VELO POR SECCIÓN, FOOTER
   ═══════════════════════════════════════════ */
function initPageScroll() {
    const bar = $('#progressBar');
    if (HAS_GSAP) {
        ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => { if (bar) bar.style.transform = `scaleX(${self.progress.toFixed(4)})`; } });
        // Cuánto se oscurece el cielo detrás de cada sección para cuidar la lectura
        const veilFor = { atardecer: 0.55, 'por-que': 0.82, como: 0.84, cartelera: 0.86, faq: 0.86, reserva: 0.7 };
        Object.entries(veilFor).forEach(([id, v]) => {
            const el = document.getElementById(id);
            if (!el) return;
            ScrollTrigger.create({
                trigger: el, start: 'top 55%', end: 'bottom 55%',
                onToggle: self => { if (self.isActive) sky.veilTarget = v; }
            });
        });
        const giant = $('.footer__giant');
        if (giant) ScrollTrigger.create({ trigger: '.footer', start: 'top 85%', end: 'bottom bottom', scrub: true, onUpdate: self => giant.style.setProperty('--fill', clamp(self.progress * 1.25, 0, 1).toFixed(3)) });
    } else {
        const g = $('.footer__giant');
        if (g) g.style.setProperty('--fill', 1);
    }
}

/* ═══════════════════════════════════════════
   ARRANQUE
   ═══════════════════════════════════════════ */
function boot() {
    // Con secciones fijadas es más seguro empezar siempre arriba
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    initSmoothScroll();
    initAnchors();
    initSky();
    initWhatsApp();
    initLightbox();
    initDrawer();
    initForm();
    initTextSplits();

    // El orden de creación importa: las secciones fijadas se calculan de arriba hacia abajo
    initHeroScroll();
    initBand();
    initOpening();
    initJourney();
    initNav();
    initCells();
    initSteps();
    initRail();
    initFaq();
    initPageScroll();
    initReveals();
    initMagnetic();

    if (HAS_GSAP) {
        gsap.ticker.add((t) => skyTick(t * 1000));
    } else {
        const raf = t => { skyTick(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
    }

    initLoader(() => {
        heroIntro();
        if (HAS_GSAP) { ScrollTrigger.refresh(); }
    });
    window.addEventListener('load', () => { if (HAS_GSAP) ScrollTrigger.refresh(); });
    if (document.fonts && document.fonts.ready && HAS_GSAP) document.fonts.ready.then(() => ScrollTrigger.refresh());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
