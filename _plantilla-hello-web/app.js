/* ═══════════════════════════════════════════════════════════════
   HELLO WEB · app.js · v4 (inmersiva)
   JavaScript sin frameworks. Dependencia opcional: Lenis (scroll suave).
   - Loader de cortina doble con contador
   - Hero: letras + shader de anillos de luz (WebGL), zoom al hacer scroll
   - Motor de scroll con suavizado para las secciones fijadas
   - "hello." que se abre desde el centro, escultura de partículas (WebGL2),
     secuencia de frames del MacBook, paneles de proyectos apilables,
     proceso horizontal, coverflow 3D, animaciones ligadas al scroll
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ───────── Configuración ───────── */
const CONFIG = {
    // TODO: número real con lada internacional, solo dígitos (52 + 10 dígitos)
    whatsapp: '520000000000',
    whatsappText: 'Hola, Hello Web. Me gustaría información sobre un sitio web.',
    loaderMin: 1600,
    loaderMax: 4500,
    coverInterval: 4800,
    heroSpeed: 0.06,          // velocidad base de la luz del hero (independiente de los Hz de la pantalla)
    frames: {
        count: 941,
        path: i => `https://raw.githubusercontent.com/duthiljean/hero-apple/main/frames/frame_${String(i).padStart(4, '0')}.jpg`,
        eager: 110,
        steps: [
            { from: 0.02, to: 0.28 },
            { from: 0.28, to: 0.55 },
            { from: 0.55, to: 0.82 },
            { from: 0.82, to: 1.01 }
        ]
    },
    sculpture: {
        wide: 'https://cdn.21st.dev/assets/mirror/a1/a1fa387b6e417b26a25f317559c87cce4d241c1052c52a2b3bc2966b2aaf9b65.webp',
        tall: 'https://cdn.21st.dev/assets/mirror/9a/9a82cb59be1bfde59855b79d7a565e487155a89f4d52eac74dcc10e267b2b6d1.webp',
        background: '#111111'
    }
};

/* ───────── Utilidades ───────── */
const html = document.documentElement;
html.classList.remove('no-js');
html.classList.add('js');

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const MOBILE = window.innerWidth < 768;
if (REDUCED) html.classList.add('is-static');

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

let NAV_H = 68;
const readNavH = () => { NAV_H = parseFloat(getComputedStyle(html).getPropertyValue('--nav-h')) || 68; };
readNavH();

/* Ganchos que el motor de scroll ejecuta en cada frame: fn(scrollY, vh, velocidad) */
const frameHooks = [];
const shared = { lenis: null, heroShader: null, fshOpen: false };

/* ═══════════════════════════════════════════
   SCROLL SUAVE (Lenis): inercia tipo "cámara lenta"
   ═══════════════════════════════════════════ */
function initSmoothScroll() {
    if (REDUCED || typeof window.Lenis !== 'function') return;
    let lenis;
    try {
        lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false });
    } catch (e) { return; }
    shared.lenis = lenis;
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // Los enlaces internos viajan con la misma inercia
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]');
        if (!a || a.classList.contains('skip')) return;
        const id = a.getAttribute('href');
        if (id.length < 2) return;
        const el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { duration: 1.6 });
    });
}

function lockScroll(on) {
    document.body.classList.toggle('is-locked', on);
    if (shared.lenis) { if (on) shared.lenis.stop(); else shared.lenis.start(); }
}

/* ═══════════════════════════════════════════
   LOADER (cortina doble)
   ═══════════════════════════════════════════ */
function initLoader() {
    const loader = $('#loader');
    const count = $('#loaderCount');
    const fill = $('#loaderFill');
    const ready = () => {
        document.body.classList.add('is-ready');
        document.dispatchEvent(new CustomEvent('hw:ready'));
    };
    if (!loader || REDUCED) {
        if (loader) loader.remove();
        ready();
        return;
    }
    const start = performance.now();
    let loaded = document.readyState === 'complete';
    let done = false;
    let value = 0;
    window.addEventListener('load', () => { loaded = true; }, { once: true });
    lockScroll(true);
    const finish = () => {
        if (done) return;
        done = true;
        count.textContent = '100';
        fill.style.width = '100%';
        setTimeout(() => {
            loader.classList.add('is-done');
            lockScroll(false);
            ready();
            setTimeout(() => loader.remove(), 1500);
        }, 420);
    };
    const tick = now => {
        const t = now - start;
        const target = loaded ? 100 : Math.min(92, (t / CONFIG.loaderMin) * 92);
        value = lerp(value, target, loaded ? 0.16 : 0.08);
        count.textContent = String(Math.round(value)).padStart(3, '0');
        fill.style.width = value + '%';
        if ((loaded && t >= CONFIG.loaderMin && value > 99.2) || t >= CONFIG.loaderMax) finish();
        else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════
   SHADER WEBGL: anillos cromáticos
   Fragment shader del componente original con: doble pasada desfasada
   (siempre hay luz en pantalla), ganancia de brillo, centro y zoom.
   ═══════════════════════════════════════════ */
const VERT = 'attribute vec2 position; void main(){ gl_Position = vec4(position, 0.0, 1.0); }';
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define TWO_PI 6.2831853072
#define PI 3.14159265359
uniform vec2 resolution;
uniform float time;
uniform vec2 center;
uniform float gain;
uniform float zoom;
void main(void) {
    vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
    uv = (uv - center) / zoom;
    float t = time * 0.05;
    float lineWidth = 0.002 * gain;
    vec3 color = vec3(0.0);
    for (int k = 0; k < 2; k++) {
        float tk = t + 0.5 * float(k);
        for (int j = 0; j < 3; j++) {
            for (int i = 0; i < 5; i++) {
                color[j] += lineWidth * float(i * i) / abs(fract(tk - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
            }
        }
    }
    gl_FragColor = vec4(color, 1.0);
}`;

function createShader(canvas, dprCap) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[hello web] shader:', gl.getShaderInfoLog(s)); return null; }
        return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    const uRes = u('resolution'), uTime = u('time'), uCenter = u('center'), uGain = u('gain'), uZoom = u('zoom');
    gl.uniform2f(uCenter, 0, 0);
    gl.uniform1f(uGain, 1.6);
    gl.uniform1f(uZoom, 1);
    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
    };
    return {
        resize,
        render: time => { gl.uniform1f(uTime, time); gl.drawArrays(gl.TRIANGLES, 0, 6); },
        setGain: g => gl.uniform1f(uGain, g),
        setZoom: z => gl.uniform1f(uZoom, z)
    };
}

function runShader(canvas, { step = CONFIG.heroSpeed, gain = 1.6 } = {}) {
    if (!canvas) return null;
    let sh = null;
    try { sh = createShader(canvas, MOBILE ? 1 : 1.5); } catch (e) { sh = null; }
    if (!sh) return null;
    sh.setGain(gain);
    let time = 1.0, running = false, visible = false, raf = 0;
    let boost = 0, boostTarget = 0, zoom = 1, last = 0;
    const frame = now => {
        if (!running) return;
        // dt en "cuadros de 60 Hz": el pulso dura lo mismo en cualquier monitor
        const dt = last ? clamp((now - last) / 16.667, 0.25, 3) : 1;
        last = now;
        boost = lerp(boost, boostTarget, 0.08);
        boostTarget *= Math.pow(0.9, dt);
        time += (step + boost) * dt;
        sh.render(time);
        raf = requestAnimationFrame(frame);
    };
    const start = () => { if (running || REDUCED) return; running = true; last = 0; raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    sh.resize(); sh.render(time);
    canvas.classList.add('is-on');
    new ResizeObserver(() => { sh.resize(); if (!running) sh.render(time); }).observe(canvas);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); }, { threshold: 0.01 }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible) start(); });
    return {
        start, stop,
        setZoom: z => { if (Math.abs(z - zoom) < 0.0005) return; zoom = z; sh.setZoom(z); if (!running) sh.render(time); },
        boost: v => { boostTarget = Math.max(boostTarget, v); }
    };
}

function initShaders() {
    const heroCanvas = $('#heroCanvas');
    if (heroCanvas) {
        shared.heroShader = runShader(heroCanvas, { step: CONFIG.heroSpeed, gain: 1.7 });
        if (!shared.heroShader) $('#inicio').classList.add('no-gl');
        else frameHooks.push((y, vh, vel) => {
            // La luz acelera cuando haces scroll y vuelve a su ritmo al detenerte
            if (y < vh * 2.4) shared.heroShader.boost(Math.min(Math.abs(vel) * 0.0016, 0.12));
        });
    }
    const finalCanvas = $('#finalCanvas');
    if (finalCanvas) runShader(finalCanvas, { step: 0.05, gain: 1.4 });
}

/* ═══════════════════════════════════════════
   NAVEGACIÓN: estado, ocultar al bajar, menú móvil
   ═══════════════════════════════════════════ */
function initNav() {
    const nav = $('#nav');
    const burger = $('#navBurger');
    const menu = $('#menu');
    const links = $$('.nav__links a');
    if (!nav) return;
    let hidden = false;
    const show = () => { if (hidden) { hidden = false; nav.classList.remove('is-hidden'); } };
    frameHooks.push((y, vh, vel) => {
        nav.classList.toggle('is-scrolled', y > 8);
        if (document.body.classList.contains('menu-open') || y < vh * 0.6) { show(); return; }
        if (vel > 4 && !hidden) { hidden = true; nav.classList.add('is-hidden'); }
        else if (vel < -4) show();
    });
    nav.addEventListener('focusin', show);
    const open = () => {
        menu.classList.add('is-open'); menu.setAttribute('aria-hidden', 'false');
        burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Cerrar menú');
        document.body.classList.add('menu-open');
        lockScroll(true);
    };
    const close = () => {
        if (!menu.classList.contains('is-open')) return;
        menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true');
        burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menú');
        document.body.classList.remove('menu-open');
        lockScroll(false);
    };
    burger.addEventListener('click', () => (menu.classList.contains('is-open') ? close() : open()));
    $$('a', menu).forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', e => { if (e.matches) close(); });
    const sections = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
    const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) links.forEach(a => a.classList.toggle('is-active', a.dataset.nav === en.target.id)); });
    }, { rootMargin: '-35% 0px -55% 0px' });
    sections.forEach(s => io.observe(s));
}

/* ═══════════════════════════════════════════
   HERO: letras, palabra rotativa, parallax del cursor y zoom al hacer scroll
   ═══════════════════════════════════════════ */
function splitChars() {
    $$('[data-chars]').forEach(el => {
        const chars = Array.from(el.textContent);
        const mid = (chars.length - 1) / 2;
        el.textContent = '';
        chars.forEach((ch, i) => {
            const s = document.createElement('span');
            s.className = 'char' + (ch === ' ' ? ' char--space' : '');
            s.style.setProperty('--i', i);
            s.style.setProperty('--d', (i - mid).toFixed(1));
            s.textContent = ch === ' ' ? ' ' : ch;
            el.appendChild(s);
        });
    });
    // Al terminar la entrada, las letras pueden salir de su renglón al separarse
    document.addEventListener('hw:ready', () => setTimeout(() => {
        const t = $('#heroTitle');
        if (t) t.classList.add('is-settled');
    }, 2200), { once: true });
}

function initHeroSwap() {
    const words = $$('#heroSwap .swap__word');
    if (words.length < 2 || REDUCED) return;
    let i = 0;
    const step = () => {
        const cur = words[i], nxt = words[(i + 1) % words.length];
        cur.classList.remove('is-active'); cur.classList.add('is-leaving');
        nxt.classList.remove('is-leaving'); nxt.classList.add('is-active');
        setTimeout(() => cur.classList.remove('is-leaving'), 950);
        i = (i + 1) % words.length;
    };
    document.addEventListener('hw:ready', () => setInterval(step, 2900), { once: true });
}

function initHeroPointer() {
    if (!FINE_POINTER || REDUCED) return;
    const hero = $('#heroStage');
    const inner = $('#heroInner');
    if (!hero || !inner) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const loop = () => {
        cx = lerp(cx, tx, 0.08); cy = lerp(cy, ty, 0.08);
        inner.style.setProperty('--px', cx.toFixed(2) + 'px');
        inner.style.setProperty('--py', cy.toFixed(2) + 'px');
        if (Math.abs(cx - tx) > 0.05 || Math.abs(cy - ty) > 0.05) raf = requestAnimationFrame(loop); else raf = 0;
    };
    hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * -18;
        ty = ((e.clientY - r.top) / r.height - 0.5) * -12;
        if (!raf) raf = requestAnimationFrame(loop);
    });
    hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
}

/* ═══════════════════════════════════════════
   CURSOR PERSONALIZADO Y TEXTO QUE SE "DECODIFICA"
   ═══════════════════════════════════════════ */
function initCursor() {
    if (!FINE_POINTER || REDUCED) return;
    const cur = $('#cursor');
    if (!cur) return;
    const ring = $('.cursor__ring', cur), dot = $('.cursor__dot', cur), label = $('#cursorLabel');
    document.body.classList.add('has-cursor');
    let x = window.innerWidth / 2, y = window.innerHeight / 2, cx = x, cy = y, raf = 0;
    const loop = () => {
        cx = lerp(cx, x, 0.2); cy = lerp(cy, y, 0.2);
        const tr = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) translate(-50%, -50%)`;
        ring.style.transform = tr; label.style.transform = tr;
        dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        if (Math.abs(cx - x) > 0.2 || Math.abs(cy - y) > 0.2) raf = requestAnimationFrame(loop); else raf = 0;
    };
    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        x = e.clientX; y = e.clientY; cur.style.opacity = '1';
        if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('pointerover', e => {
        const lab = e.target.closest('[data-cursor]');
        const hot = e.target.closest('a, button, summary, label, .cover__scene, input, select, textarea');
        cur.classList.toggle('is-label', !!lab);
        cur.classList.toggle('is-hover', !!hot && !lab);
        if (lab) label.textContent = lab.dataset.cursor;
    });
    document.addEventListener('mouseleave', () => { cur.style.opacity = '0'; });
}

function initScramble() {
    if (!FINE_POINTER || REDUCED) return;
    const glyphs = 'abcdefghijklmnopqrstuvwxyz0123456789#%&*+=/<>';
    $$('[data-scramble]').forEach(el => {
        const text = el.textContent;
        let raf = 0;
        el.addEventListener('mouseenter', () => {
            cancelAnimationFrame(raf);
            el.style.width = el.getBoundingClientRect().width + 'px';
            const t0 = performance.now(), dur = 420;
            const tick = now => {
                const p = (now - t0) / dur;
                const n = Math.floor(p * text.length);
                el.textContent = Array.from(text).map((c, i) => (i < n || c === ' ' ? c : glyphs[(Math.random() * glyphs.length) | 0])).join('');
                if (p < 1) raf = requestAnimationFrame(tick);
                else { el.textContent = text; el.style.width = ''; }
            };
            raf = requestAnimationFrame(tick);
        });
    });
}

/* ═══════════════════════════════════════════
   MARQUEE Y BANDA CINÉTICA
   ═══════════════════════════════════════════ */
function initMarquee() {
    $$('[data-marquee]').forEach(m => {
        const track = m.firstElementChild;
        if (!track) return;
        const inner = document.createElement('div');
        inner.className = 'marquee__inner';
        m.appendChild(inner);
        inner.appendChild(track);
        const clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        inner.appendChild(clone);
    });
}

function initKinetic() {
    const rows = $$('[data-kinetic]');
    if (!rows.length || REDUCED) return;
    const section = rows[0].parentElement;
    const state = rows.map(r => ({ el: r, dir: parseFloat(r.dataset.kinetic) || 1, x: 0, half: 1, skew: 0 }));
    const measure = () => state.forEach(s => { s.half = Math.max(1, s.el.scrollWidth / 2); });
    measure();
    window.addEventListener('resize', measure);
    let raf = 0, running = false, prevY = window.scrollY, vel = 0, last = 0;
    const loop = now => {
        if (!running) return;
        const dt = last ? clamp((now - last) / 16.667, 0.25, 3) : 1;
        last = now;
        const y = window.scrollY;
        vel = lerp(vel, y - prevY, 0.12);
        prevY = y;
        state.forEach(s => {
            s.x -= 0.7 * s.dir * dt;
            let m = (s.x - y * 0.35 * s.dir) % s.half;
            if (m > 0) m -= s.half;
            s.skew = lerp(s.skew, clamp(-vel * 0.35, -14, 14), 0.1);
            s.el.style.transform = `translate3d(${m.toFixed(1)}px, 0, 0) skewX(${s.skew.toFixed(2)}deg)`;
        });
        raf = requestAnimationFrame(loop);
    };
    new IntersectionObserver(([e]) => {
        running = e.isIntersecting && !document.hidden;
        if (running) { prevY = window.scrollY; last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
    }, { rootMargin: '10% 0px' }).observe(section);
}

/* ═══════════════════════════════════════════
   REVEALS, TITULARES POR PALABRA, SCROLL-SCRUB, PARALLAX, TILT
   ═══════════════════════════════════════════ */
function splitWords() {
    $$('[data-split]').forEach(el => {
        if (el.dataset.splitDone) return;
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        el.setAttribute('aria-label', text);
        el.innerHTML = text.split(' ').map((w, j) =>
            `<span class="split__w" aria-hidden="true"><span class="split__i" style="--j:${j}">${w}</span></span>`).join(' ');
        el.dataset.splitDone = '1';
    });
}

function initReveal() {
    const els = $$('[data-reveal], [data-split], #compareGrid');
    if (REDUCED) { els.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(el => io.observe(el));
}

/* Cada [data-scrub] entra desde abajo con rotación 3D y vuelve a su sitio
   según su posición en pantalla. Funciona en ambos sentidos del scroll. */
function initScrub() {
    const els = $$('[data-scrub]');
    if (!els.length || REDUCED) return;
    const state = els.map(el => ({ el, v: -1 }));
    frameHooks.push((y, vh) => {
        for (const s of state) {
            const r = s.el.getBoundingClientRect();
            if (r.top > vh + 40 || r.bottom < -40) continue;
            const e = easeOutCubic(clamp((vh - r.top) / (vh * 0.5), 0, 1));
            if (Math.abs(e - s.v) > 0.002) { s.v = e; s.el.style.setProperty('--sp', e.toFixed(3)); }
        }
    });
}

function initParallax() {
    const els = $$('[data-parallax]');
    if (!els.length || REDUCED) return;
    frameHooks.push((y, vh) => {
        els.forEach(el => {
            const r = el.parentElement.getBoundingClientRect();
            if (r.bottom < -100 || r.top > vh + 100) return;
            const d = (r.top + r.height / 2 - vh / 2) / vh;
            el.style.transform = `translate3d(0, ${(d * (parseFloat(el.dataset.parallax) || 0.1) * vh * 0.4).toFixed(1)}px, 0)`;
        });
    });
}

function initTiltAndSpotlight() {
    if (!FINE_POINTER) return;
    $$('[data-spot], [data-tilt]').forEach(card => {
        const tilt = card.hasAttribute('data-tilt') && !REDUCED;
        card.addEventListener('pointermove', e => {
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
            card.style.setProperty('--mx', (px * r.width).toFixed(1) + 'px');
            card.style.setProperty('--my', (py * r.height).toFixed(1) + 'px');
            if (tilt) {
                card.style.setProperty('--rx', ((0.5 - py) * 8).toFixed(2) + 'deg');
                card.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
            }
        });
        card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
}

function initMagnetic() {
    if (!FINE_POINTER || REDUCED) return;
    $$('[data-magnetic]').forEach(el => {
        el.addEventListener('pointermove', e => {
            const r = el.getBoundingClientRect();
            const x = (e.clientX - (r.left + r.width / 2)) * 0.28;
            const y = (e.clientY - (r.top + r.height / 2)) * 0.28;
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        });
        el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
}

/* ═══════════════════════════════════════════
   CONTADORES, MEDIDOR, VIDEO DIFERIDO, WHATSAPP
   ═══════════════════════════════════════════ */
function animateNumber(el, end, { prefix = '', suffix = '', duration = 1800 } = {}) {
    if (REDUCED) { el.textContent = prefix + end + suffix; return; }
    const t0 = performance.now();
    const tick = now => {
        const p = clamp((now - t0) / duration, 0, 1);
        el.textContent = prefix + Math.round(easeOutExpo(p) * end) + suffix;
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function initCounters() {
    const els = $$('[data-count]');
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const el = e.target;
            animateNumber(el, parseFloat(el.dataset.count), { prefix: el.dataset.prefix || '', suffix: el.dataset.suffix || '' });
            io.unobserve(el);
        });
    }, { threshold: 0.5 });
    els.forEach(el => io.observe(el));
}

function initGauge() {
    $$('[data-gauge]').forEach(g => {
        const fill = $('.gauge__fill', g), val = $('.gauge__value', g), end = parseFloat(g.dataset.gauge);
        const io = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            io.disconnect();
            fill.style.strokeDashoffset = (326.7 * (1 - end / 100)).toFixed(1);
            animateNumber(val, end, { duration: 2000 });
        }, { threshold: 0.4 });
        io.observe(g);
    });
}

function initLazyVideo() {
    const vids = $$('[data-lazy-video]');
    if (!vids.length || REDUCED) return;
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            const v = e.target;
            if (e.isIntersecting) {
                if (!v.dataset.loaded) { v.dataset.loaded = '1'; v.preload = 'auto'; v.load(); }
                v.play().then(() => v.classList.add('is-playing')).catch(() => {});
            } else v.pause();
        });
    }, { rootMargin: '20% 0px' });
    vids.forEach(v => io.observe(v));
}

function formatPhone(n) {
    const d = n.replace(/\D/g, '');
    if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
    return '+' + d;
}
function waLink(text) { return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text || CONFIG.whatsappText)}`; }
function initWhatsApp() {
    $$('[data-wa]').forEach(a => {
        a.href = waLink(a.dataset.waText);
        if (a.hasAttribute('data-wa-label')) a.textContent = formatPhone(CONFIG.whatsapp);
    });
    const fl = $('#waFloat');
    if (fl && !REDUCED) setTimeout(() => { fl.classList.add('show-tip'); setTimeout(() => fl.classList.remove('show-tip'), 4500); }, 7000);
}

/* ═══════════════════════════════════════════
   EXPERIENCIA: "hello." centrado que se abre desde el medio
   El zoom nace en el trazo de la "l" más cercana al centro de la palabra;
   la palabra se ajusta lo mínimo para que ese punto quede al centro exacto
   de la pantalla. Así crece en su lugar y la imagen llena todo.
   ═══════════════════════════════════════════ */
function initRevealMask() {
    const spacer = $('[data-pin="reveal"]');
    if (!spacer || REDUCED) return;
    const svg = $('#revealSvg'), text = $('#revealText'), hole = $('#revealHole'), media = $('#revealMedia'), copy = $('#revealCopy');
    let cx = 0, cy = 0, maxScale = 60, maxR = 1000;
    const measure = () => {
        const r = svg.getBoundingClientRect();
        if (!r.width) return;
        cx = r.width / 2; cy = r.height / 2;
        maxR = Math.hypot(cx, cy) * 1.04;
        if (hole) { hole.setAttribute('cx', cx.toFixed(1)); hole.setAttribute('cy', cy.toFixed(1)); }
        text.setAttribute('x', cx.toFixed(1));
        text.setAttribute('y', cy.toFixed(1));
        try {
            // Tinta real de la "l" medida con canvas: su centro respecto al origen del carácter y su grosor
            const cs = getComputedStyle(text);
            const fs = parseFloat(cs.fontSize) || 200;
            const c2 = document.createElement('canvas').getContext('2d');
            c2.font = `${cs.fontWeight || 700} ${fs}px ${cs.fontFamily}`;
            const m = c2.measureText('l');
            const inkL = -(m.actualBoundingBoxLeft || 0), inkR = m.actualBoundingBoxRight || 0;
            const inkMid = (inkL + inkR) / 2;
            const stem = (inkR - inkL) || fs * 0.09;
            const content = text.textContent;
            const bb = text.getBBox();
            const mid = bb.x + bb.width / 2;
            let best = null;
            for (let i = 0; i < content.length; i++) {
                if (content[i] !== 'l') continue;
                const start = text.getStartPositionOfChar(i);
                const ext = text.getExtentOfChar(i);
                const lx = start.x + inkMid, ly = ext.y + ext.height / 2;
                if (!best || Math.abs(lx - mid) < Math.abs(best.lx - mid)) best = { lx, ly };
            }
            if (best) {
                text.setAttribute('x', (cx + (cx - best.lx)).toFixed(2));
                text.setAttribute('y', (cy + (cy - best.ly)).toFixed(2));
            }
            maxScale = clamp((Math.max(r.width, r.height) / Math.max(stem, 2)) * 1.4, 20, 600);
        } catch (e) { /* el texto queda centrado aunque falle la medición */ }
    };
    addPin(spacer, {
        measure,
        update(p) {
            const z = smooth(clamp((p - 0.04) / 0.58, 0, 1));
            const s = 1 + Math.pow(z, 2.6) * (maxScale - 1);
            text.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${s.toFixed(3)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`);
            // Un círculo de luz se abre desde el centro exacto de la pantalla mientras las letras crecen
            if (hole) hole.setAttribute('r', (smooth(clamp((p - 0.16) / 0.44, 0, 1)) * maxR).toFixed(1));
            svg.style.opacity = p > 0.6 ? clamp(1 - (p - 0.6) / 0.08, 0, 1).toFixed(3) : '1';
            media.style.transform = `scale(${(1.14 - 0.14 * z).toFixed(4)})`;
            const c = clamp((p - 0.66) / 0.2, 0, 1);
            copy.style.opacity = c.toFixed(3);
            copy.style.transform = `translateY(${(30 * (1 - c)).toFixed(1)}px)`;
        }
    });
}

/* ═══════════════════════════════════════════
   ESCULTURA LÍQUIDA
   Basado en "Sculpture Hero" de guglielmogiannattasio.it (21st.dev),
   portado de TypeScript/React a JavaScript sin dependencias.
   La escultura se reconstruye con ~100 mil partículas simuladas en la GPU
   (WebGL2), muestreadas de sus propios píxeles. El cursor vuelve líquido el
   material y luego regresa a la imagen nítida. Sin WebGL2 se muestra la imagen.
   ═══════════════════════════════════════════ */
const SC_NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
vec2 ambientField(vec2 uv, float t){
  vec2 q = uv*vec2(3.2,1.7);
  vec2 a = vec2(vnoise(q+vec2(t*0.11,0.0))-0.5, vnoise(q+vec2(5.2,t*0.08)+3.1)-0.5);
  vec2 q2 = uv*vec2(7.5,4.0) + vec2(-t*0.19, t*0.13);
  vec2 b = vec2(vnoise(q2+1.7)-0.5, vnoise(q2+9.3)-0.5);
  return a + b*0.45;
}
`;

const SC_ENERGY = `
float energyAt(vec2 rectPx, vec2 mouse, float radius, float presence, float wakeEnergy){
  vec2 d = rectPx - mouse;
  float f = exp(-dot(d,d)/(radius*radius))*presence;
  return smoothstep(0.06, 0.5, f*1.15 + wakeEnergy*1.7);
}
`;

const SC_QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }
`;

const SC_FLOW_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec2 uMouse;
uniform vec2 uVel;
uniform vec2 uSize;
uniform float uRadius;
uniform float uPresence;
uniform float uDecay;
vec2 decV(vec4 c){ return (c.rg*255.0-128.0)/127.0; }
void main(){
  vec2 v0 = decV(texture(uPrev, vUv));
  vec2 uv = vUv - v0*uTexel*2.5;
  vec4 c = texture(uPrev, uv)*0.52
    + 0.12*(texture(uPrev, uv+vec2(uTexel.x,0.0)) + texture(uPrev, uv-vec2(uTexel.x,0.0))
          + texture(uPrev, uv+vec2(0.0,uTexel.y)) + texture(uPrev, uv-vec2(0.0,uTexel.y)));
  vec2 v = decV(c);
  float p = c.b;
  vec2 d = (vUv-uMouse)*uSize;
  float f = exp(-dot(d,d)/(uRadius*uRadius))*uPresence;
  float sp = clamp(length(uVel)*2.5, 0.0, 1.0);
  v += uVel*f*0.22;
  p = max(p, f*sp);
  v *= uDecay;
  p *= uDecay;
  v = sign(v)*max(abs(v)-1.2/127.0, 0.0);
  p = max(p-1.2/255.0, 0.0);
  v = clamp(v, -1.0, 1.0);
  o = vec4((v*127.0+128.0)/255.0, p, 1.0);
}
`;

const SC_SIM_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uState;
uniform sampler2D uHome;
uniform sampler2D uFlow;
uniform vec2 uSize;
uniform vec2 uMouse;
uniform float uRadius;
uniform float uPresence;
uniform float uStrength;
uniform float uSpread;
uniform float uTurb;
uniform float uReturn;
uniform float uTime;
uniform float uDt;
uniform float uIntro;
${SC_NOISE}
vec2 curl(vec2 p){
  const float e = 0.35;
  float a = vnoise(p+vec2(0.0,e)) - vnoise(p-vec2(0.0,e));
  float b = vnoise(p+vec2(e,0.0)) - vnoise(p-vec2(e,0.0));
  return vec2(a, -b)/(2.0*e);
}
void main(){
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 hm = texelFetch(uHome, ij, 0);
  if(hm.w <= 0.0){ o = vec4(0.0); return; }
  vec4 st = texelFetch(uState, ij, 0);
  vec2 off = st.xy;
  vec2 vel = st.zw;
  float sd = hm.z;
  float light = 0.45 + sd*1.1;
  vec2 p = hm.xy*uSize + off;
  vec4 fl = texture(uFlow, clamp(p/uSize, 0.0, 1.0));
  vec2 wake = (fl.rg*255.0-128.0)/127.0;
  float pr = fl.b;
  vec2 toM = p - uMouse;
  float r2 = dot(toM,toM);
  float f = exp(-r2/(uRadius*uRadius))*uPresence;
  vec2 n = toM*inversesqrt(r2+1.0);
  float e = clamp(pr*2.0 + f, 0.0, 1.0);
  vec2 acc = vec2(0.0);
  acc += n*f*1.25*uStrength*uSpread*light;
  acc += vec2(-n.y, n.x)*f*1.45*uStrength*uSpread*(0.4+sd);
  acc += (wake*42.0*uSpread*light - vel)*e*0.08;
  vec2 q = p*0.0095 + vec2(uTime*0.35, -uTime*0.2);
  vec2 c = curl(q) + 0.5*curl(q*2.3 + 7.1);
  acc += c*(e*1.2*uSpread + uIntro*1.5)*uTurb*light;
  float k = (0.006 + 0.02*uReturn)*(0.65+sd*0.7)*(1.0 - uIntro*0.75);
  acc -= off*k;
  vel += acc*uDt;
  vel *= pow(mix(0.93, 0.955, e), uDt);
  off += vel*uDt;
  if(dot(off,off) < 0.0004 && dot(vel,vel) < 0.0004){ off = vec2(0.0); vel = vec2(0.0); }
  o = vec4(off, vel);
}
`;

// Paleta de la escultura (la misma con la que se recolorea la imagen): de navy a azul eléctrico y blanco hielo
const SC_LUT = `
vec3 lut(float t){
  t = clamp(t, 0.0, 1.0);
  if(t < 0.06) return mix(vec3(0.0667), vec3(0.0549, 0.0902, 0.2), t / 0.06);
  if(t < 0.22) return mix(vec3(0.0549, 0.0902, 0.2), vec3(0.0902, 0.1922, 0.5608), (t - 0.06) / 0.16);
  if(t < 0.42) return mix(vec3(0.0902, 0.1922, 0.5608), vec3(0.1843, 0.3882, 0.9412), (t - 0.22) / 0.2);
  if(t < 0.62) return mix(vec3(0.1843, 0.3882, 0.9412), vec3(0.3686, 0.5843, 1.0), (t - 0.42) / 0.2);
  if(t < 0.8) return mix(vec3(0.3686, 0.5843, 1.0), vec3(0.6627, 0.7843, 1.0), (t - 0.62) / 0.18);
  return mix(vec3(0.6627, 0.7843, 1.0), vec3(0.9608, 0.9725, 1.0), (t - 0.8) / 0.2);
}
`;

// Eje de la cinta: una ola que cruza la pantalla y avanza de izquierda a derecha, con giro de hélice
const SC_RIB_GEOM = `
uniform vec4 uWave;
uniform vec2 uSpan;
uniform vec2 uShape;
uniform vec2 uPtr;
uniform float uPtrOn;
const float RTAU = 6.2831853;
void ribFrame(float s, float time, out vec2 cen, out vec2 tang, out float th, out float hw){
  float ph = uWave.w + time * 0.42;
  float a1 = RTAU * uShape.x * s - ph;
  float a2 = RTAU * uShape.x * 1.9 * s - ph * 1.35 + 1.7;
  float span = uSpan.y - uSpan.x;
  cen = vec2(uSpan.x + span * s, uWave.x + uWave.y * (0.72 * sin(a1) + 0.28 * sin(a2)));
  tang = normalize(vec2(span, uWave.y * RTAU * uShape.x * (0.72 * cos(a1) + 0.532 * cos(a2))));
  th = RTAU * uShape.y * s - ph * 0.8 + 0.6;
  hw = uWave.z * (0.92 + 0.08 * sin(s * RTAU * 3.0 + time * 0.5));
}
vec2 ptrPush(vec2 p){
  if(uPtrOn < 0.001) return p;
  vec2 dp = p - uPtr;
  float fd = exp(-dot(dp, dp) / (130.0 * 130.0)) * uPtrOn;
  return p + normalize(dp + vec2(0.0001)) * fd * 36.0;
}
`;

// Luz del haz de fibras: sección curva, cara posterior más oscura y brillo de canto al girar
const SC_RIB_LIGHT = `
float ribLight(vec2 tang, float th, float c, out float spec, out float rim){
  vec2 n2 = vec2(-tang.y, tang.x);
  float ct = cos(th), st = sin(th);
  vec3 A = vec3(n2 * ct, st);
  vec3 N = vec3(-n2 * st, ct);
  float back = step(N.z, 0.0);
  N = N.z < 0.0 ? -N : N;
  vec3 Nc = normalize(N + A * c * 1.6);
  vec3 L = normalize(vec3(-0.35, -0.62, 0.7));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(Nc, L), 0.0);
  spec = pow(max(dot(Nc, H), 0.0), 22.0);
  rim = pow(1.0 - abs(ct), 4.0);
  return (0.28 + 0.5 * diff + 0.24 * rim) * mix(1.0, 0.74, back);
}
`;

// Superficie de la cinta (modo 0), su sombra (1) y los filamentos sueltos que la envuelven (2)
const SC_RIB_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 aSC;
uniform vec2 uRes;
uniform float uTime;
uniform int uMode;
uniform float uFilK;
${SC_RIB_GEOM}
out vec2 vSC;
out float vTh;
out vec2 vTang;
out vec2 vPos;
out float vFront;
out float vW;
out float vHW;
// filamento suelto: una hélice irregular alrededor del eje que pasa por delante y por detrás de la cinta
vec2 filAt(float s, float k, out float front, out vec2 tang, out float th, out float hw){
  vec2 cen;
  ribFrame(s, uTime, cen, tang, th, hw);
  vec2 nrm = vec2(-tang.y, tang.x);
  float a = RTAU * (s * (1.2 + 0.45 * k) + k * 0.31) + uTime * (0.3 + 0.09 * k);
  float R = hw * (0.52 + 0.08 * k) * (0.85 + 0.3 * sin(s * RTAU * 1.7 + k * 2.1 + uTime * 0.2));
  float ct = cos(th);
  front = (ct < 0.0 ? -1.0 : 1.0) * sin(a - th);
  return cen + nrm * (cos(a) * R);
}
void main(){
  float s = aSC.x, c = aSC.y;
  vec2 pos, tang;
  float th, hw;
  vFront = 1.0;
  if(uMode == 2){
    float fr0, fr1, th1, hw1;
    vec2 t1;
    vec2 p0 = filAt(s, uFilK, fr0, tang, th, hw);
    vec2 p1 = filAt(s + 0.0015, uFilK, fr1, t1, th1, hw1);
    vFront = fr0;
    vec2 ft = normalize(p1 - p0 + vec2(1e-5));
    float lw = 1.6 - 0.18 * uFilK;
    pos = p0 + vec2(-ft.y, ft.x) * c * (lw + 2.0);
    vW = lw + 2.0;
  } else {
    vec2 cen;
    ribFrame(s, uTime, cen, tang, th, hw);
    vec2 nrm = vec2(-tang.y, tang.x);
    float w = cos(th) * hw;
    w = (w < 0.0 ? -1.0 : 1.0) * max(abs(w), 1.4);
    pos = cen + nrm * (c * w);
    vW = abs(w);
    if(uMode == 1){
      pos += vec2(12.0, 30.0) + nrm * (c * w * 0.5);
      vW = abs(w) * 1.5;
    }
  }
  pos = ptrPush(pos);
  vSC = aSC;
  vTh = th;
  vTang = tang;
  vHW = hw;
  vPos = pos;
  vec2 clip = pos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const SC_RIB_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vSC;
in float vTh;
in vec2 vTang;
in vec2 vPos;
in float vFront;
in float vW;
in float vHW;
uniform int uMode;
uniform int uFrontPass;
uniform float uTime;
uniform float uFlowOff;
uniform float uG;
uniform float uDraw;
uniform vec4 uOcc[8];
uniform float uOccF[8];
uniform int uOccN;
uniform float uDpr;
uniform float uFilK;
out vec4 o;
${SC_LUT}
${SC_RIB_LIGHT}
float h11(float x){ x = fract(x * 0.1031); x *= x + 33.33; x *= x + x; return fract(x); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn1(float x){ float i = floor(x), f = fract(x); float u = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), u); }
float sdCard(vec2 p, vec4 rc){
  vec2 h = rc.zw * 0.5;
  vec2 q = abs(p - (rc.xy + h)) - max(h - 20.0, vec2(0.0));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 20.0;
}
// al atarse el nudo la cinta se deshace desde el centro hacia las puntas, igual que las partículas
float untie(float s, float r){
  float tm = clamp((uG - abs(s - 0.5) * 0.55 - r * 0.05) / 0.42, 0.0, 1.0);
  return 1.0 - smoothstep(0.0, 0.05, tm);
}
void main(){
  float s = vSC.x, c = vSC.y;
  float sF = s - uFlowOff;
  // tarjetas: sombra sobre las que tiene detrás y penumbra al hundirse bajo las que la tapan
  float onFront = 0.0, nearOver = 0.0;
  for(int i = 0; i < 8; i++){
    if(i >= uOccN) break;
    float d = sdCard(vPos, uOcc[i]);
    if(uOccF[i] > 0.5) onFront = max(onFront, 1.0 - smoothstep(-1.0, 1.0, d));
    else nearOver = max(nearOver, 1.0 - smoothstep(0.0, 80.0, d));
  }
  if(uMode == 1){
    float a = 0.36 * exp(-c * c * 9.0) * onFront * (1.0 - smoothstep(uDraw - 0.05, uDraw, s)) * untie(s, 0.5);
    if(a < 0.003) discard;
    o = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  if(uMode == 2){
    if((uFrontPass == 1) != (vFront > 0.0)) discard;
    // tramos sueltos: cada filamento aparece y se pierde a lo largo de la cinta
    float seg = smoothstep(0.28, 0.5, vn1(s * 5.0 + uFilK * 13.7 + uTime * 0.04));
    float lw = vW - 2.0;
    float a = clamp((lw * 0.5 - abs(c) * vW) * uDpr + 0.5, 0.0, 1.0) * seg * 0.85
      * (1.0 - smoothstep(uDraw - 0.05, uDraw, s)) * untie(s, h21(vec2(uFilK * 7.0, floor(s * 900.0))));
    if(a < 0.003) discard;
    float t = 0.58 + 0.28 * vn1(s * 40.0 - uTime * 0.4 + uFilK * 3.0) - 0.16 * nearOver;
    o = vec4(lut(t) * a, a);
    return;
  }
  // haz de hebras, como las bandas de la escultura: ondulan un poco y se cruzan
  float cc = c + 0.012 * sin(sF * 21.0 + c * 7.0) + 0.006 * sin(sF * 53.0 - c * 15.0);
  float nf = max(vHW / 2.6, 8.0);
  float fx = (cc + 0.5) * nf;
  fx += 0.9 * vn1(fx * 0.21 + 4.1);
  float fi = floor(fx), ff = fract(fx);
  float fb = h11(fi + 3.7);
  float fx2 = (cc + 0.5) * nf * 2.6 + 1.6 * vn1(sF * 5.0 + fx * 0.37);
  // si las hebras quedan más finas que un pixel se promedian (sin aliasing)
  float aa = clamp(fwidth(fx) * 1.3, 0.0, 1.0);
  float aa2 = clamp(fwidth(fx2) * 1.3, 0.0, 1.0);
  // la punta se dibuja como un pincel: cada hebra termina en un punto distinto
  float drawA = 1.0 - smoothstep(uDraw - 0.03, uDraw, s + (h11(fi + 23.0) - 0.5) * 0.06);
  // al atarse, cada hebra se rompe en polvo fino (las partículas salen de ahí mismo)
  float baseA = drawA * untie(s, h21(vec2(fi, floor(s * 900.0))));
  if(baseA < 0.003) discard;
  float spec, rim;
  float t = ribLight(vTang, vTh, c, spec, rim);
  // perfil de cada hebra: núcleo brillante y separación más oscura
  float fw = 0.5 + 0.35 * h11(fi + 9.1);
  float core = 1.0 - smoothstep(fw - 0.4, fw + 0.1, abs(ff - 0.5) * 2.0);
  float strand = mix(core, 0.62, aa);
  // a lo largo, cada hebra se aviva y se apaga
  float run = vn1(sF * (16.0 + 18.0 * fb) + fi * 7.31);
  float strandL = (0.78 + 0.36 * fb) * (0.8 + 0.36 * run);
  float gapL = 0.46 * (0.85 + 0.3 * vn1(sF * 12.0 + fx * 0.35));
  float lum = mix(gapL, strandL, strand);
  // pelusa fina encima de las hebras
  float f2 = mix(1.0 - 0.45 * smoothstep(0.15, 0.5, abs(fract(fx2) - 0.5)), 0.84, aa2);
  lum *= 0.88 + 0.2 * f2;
  // brillo satinado partido en hebras, con destello blanco en lo más alto
  float sp = spec * lum * (0.8 + 0.5 * mix(0.5, run, strand));
  float tt = t * lum + sp * 0.7 + pow(spec, 5.0) * 0.32;
  tt *= 1.0 - 0.26 * nearOver;
  tt *= 1.0 + 0.05 * onFront;
  // orilla suave a 1 pixel físico con una ondulación lenta (sin escalones)
  float edge = 0.5 - 0.022 * vn1(sF * 34.0 + (c < 0.0 ? 5.0 : 0.0));
  float a = clamp((edge - abs(c)) * vW * uDpr + 0.5, 0.0, 1.0) * baseA;
  if(a < 0.003) discard;
  o = vec4(lut(tt) * a, a);
}
`;

// Esferas brillantes como las de la escultura: incrustadas en el haz y desprendiéndose de sus orillas
const SC_BEAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform vec2 uRes;
uniform float uTime;
uniform float uG;
uniform float uDraw;
${SC_RIB_GEOM}
out vec2 vL;
out float vA;
out float vT;
out float vR;
float hb(float n){ n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
void main(){
  float id = float(gl_InstanceID);
  float r1 = hb(id * 1.7 + 0.13), r2 = hb(id * 2.3 + 1.71), r3 = hb(id * 3.1 + 3.37), r4 = hb(id * 4.7 + 5.91), r5 = hb(id * 5.3 + 7.77);
  // una cuarta parte es el rocío que acompaña a la punta mientras la cinta se dibuja
  bool tip = r1 < 0.25;
  float s = tip ? uDraw - 0.08 + r3 * 0.1 : r3;
  float life = fract(r4 + uTime * (0.045 + 0.05 * r5));
  vec2 cen, tang;
  float th, hw;
  ribFrame(s, uTime, cen, tang, th, hw);
  vec2 nrm = vec2(-tang.y, tang.x);
  float side = r2 < 0.5 ? -1.0 : 1.0;
  float edge = 0.5 * abs(cos(th)) * hw;
  // pegadas a las orillas y algunas incrustadas en el haz; con el tiempo se desprenden
  vec2 p = cen + nrm * side * (edge * mix(0.35, 1.06, sqrt(r5)) + life * (5.0 + 24.0 * r1)) + tang * (life - 0.5) * 26.0;
  p = ptrPush(p);
  float big = step(0.9, r1);
  float size = mix(1.0, 3.4, r4 * r4) + big * mix(2.8, 7.0, r5);
  float drawA = tip ? smoothstep(0.0, 0.04, uDraw) * (1.0 - smoothstep(1.0, 1.1, uDraw)) : 1.0 - smoothstep(uDraw - 0.05, uDraw, s);
  float tm = clamp((uG - abs(s - 0.5) * 0.55 - r2 * 0.05) / 0.42, 0.0, 1.0);
  vA = sin(3.14159 * life) * drawA * (1.0 - smoothstep(0.0, 0.05, tm)) * (0.7 + 0.3 * r3);
  vT = 0.5 + 0.35 * r5;
  vR = size;
  vL = aPos;
  vec2 world = p + aPos * (size + 1.0);
  vec2 clip = world / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const SC_BEAD_FS = `#version 300 es
precision highp float;
in vec2 vL;
in float vA;
in float vT;
in float vR;
out vec4 o;
${SC_LUT}
void main(){
  vec2 q = vL * (vR + 1.0);
  float d = length(q);
  float a = clamp(vR + 0.5 - d, 0.0, 1.0) * vA;
  if(a < 0.003) discard;
  vec2 u = q / max(vR, 0.5);
  float z = sqrt(max(1.0 - dot(u, u), 0.0));
  vec3 N = vec3(u, z);
  vec3 L = normalize(vec3(-0.35, -0.62, 0.7));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 36.0);
  float fres = pow(1.0 - z, 2.0);
  // esfera brillante como las de la escultura: cuerpo azul, canto claro y destello blanco
  float t = vT * (0.32 + 0.62 * diff) + 0.26 * fres + spec * 0.85;
  o = vec4(lut(t) * a, a);
}
`;

const SC_PART_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform sampler2D uState;
uniform sampler2D uHome;
uniform sampler2D uCol;
uniform sampler2D uFlow;
uniform sampler2D uAux;
uniform int uTexW;
uniform vec4 uRect;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uRadius;
uniform float uPresence;
uniform float uDot;
uniform float uTime;
uniform float uRibTime;
uniform float uAmbient;
uniform float uStreak;
uniform float uIntroVis;
uniform float uRest;
uniform vec3 uTint;
uniform float uScatter;
uniform float uFade;
uniform float uGV;
uniform float uAlong;
uniform float uFiber;
${SC_RIB_GEOM}
${SC_RIB_LIGHT}
${SC_LUT}
out vec2 vLocal;
out float vHalfLen;
out float vR;
out vec3 vCol;
out float vA;
${SC_NOISE}
${SC_ENERGY}
void main(){
  int id = gl_InstanceID;
  ivec2 ij = ivec2(id % uTexW, id / uTexW);
  vec4 hm = texelFetch(uHome, ij, 0);
  if(hm.w <= 0.0){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  // posición de la partícula en la cinta (coordenadas ecualizadas: densidad pareja)
  vec4 ax = texelFetch(uAux, ij, 0);
  float r1 = ax.z, r2 = ax.w;
  float s = mix(ax.x, ax.y, uAlong);
  float c = mix(ax.y, ax.x, uAlong) - 0.5;
  // el nudo se ata desde el centro de la cinta hacia las puntas
  float G = 1.0 - uScatter;
  float tl = clamp((G - abs(s - 0.5) * 0.55 - r1 * 0.05) / 0.42, 0.0, 1.0);
  // mientras es cinta, la superficie la dibuja su propio programa: la partícula solo aparece al despegar
  if(tl <= 0.0 && uScatter > 0.0005){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  float t = tl * tl * (3.0 - 2.0 * tl);
  float sc = 1.0 - t;
  vec4 st = texelFetch(uState, ij, 0);
  vec4 cl = texelFetch(uCol, ij, 0);

  float aKnot = 0.0;
  if(uScatter < 0.06){
    float wakeE = texture(uFlow, hm.xy).b;
    float E = energyAt(hm.xy*uRect.zw, uMouse, uRadius, uPresence, wakeE);
    float lift = smoothstep(0.35, 2.5, length(st.xy));
    aKnot = max(max(E, lift), max(uRest, 1.0-uIntroVis));
  }
  float a = mix(aKnot, uFade, smoothstep(0.0, 0.06, uScatter));
  if(a < 0.01){ gl_Position = vec4(2.0,2.0,2.0,1.0); return; }

  vec2 home = uRect.xy + hm.xy*uRect.zw + st.xy;
  home -= ambientField(hm.xy, uTime)*10.0*uAmbient;
  vec2 base = home;
  vec2 dpath = vec2(0.0);
  float tR = 0.5;
  if(sc > 0.0005){
    // despega exactamente desde su lugar en la cinta y vuela en curva a su lugar en el nudo
    vec2 cen, tang;
    float th, hw;
    ribFrame(s, uRibTime, cen, tang, th, hw);
    vec2 nrm = vec2(-tang.y, tang.x);
    vec2 rib = ptrPush(cen + nrm * (c * cos(th) * hw));
    float spec, rim;
    tR = ribLight(tang, th, c, spec, rim) * 0.88 + spec * 0.6;
    vec2 ctrl = mix(rib, home, 0.5) + vec2(-(home.y - rib.y), home.x - rib.x) * 0.12 * (r2 - 0.5);
    base = sc*sc*rib + 2.0*sc*t*ctrl + t*t*home;
    dpath = 2.0*sc*(ctrl - rib) + 2.0*t*(home - ctrl);
  }

  vec2 v = st.zw;
  float spd = length(v);
  vec2 dir = spd > 0.001 ? v/spd : vec2(1.0,0.0);
  float len = min(spd*1.25, 18.0)*uStreak;
  float fl = length(dpath) * abs(uGV) * 1.6 * (4.0 * t * sc);
  if(fl > len){ len = min(fl, 14.0); dir = normalize(dpath + vec2(0.0001)) * (uGV < 0.0 ? -1.0 : 1.0); }
  float flyL = uFiber * 0.5 * (4.0 * t * sc);
  if(flyL > len){ len = flyL; dir = normalize(dpath + vec2(0.0001)); }
  float r = uDot*hm.w*0.5*mix(1.0, 1.2, sc);
  vec2 lc = aCorner*vec2(r + len*0.5 + 1.0, r + 1.0);
  vec2 center = base - dir*len*0.5;
  vec2 world = center + dir*lc.x + vec2(-dir.y, dir.x)*lc.y;
  vec2 clip = world/uRes*2.0-1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vLocal = lc;
  vHalfLen = len*0.5;
  vR = r;
  vec3 col = cl.rgb*uTint;
  float glint = smoothstep(2.0, 16.0, max(spd, fl));
  col = mix(col, min(col*1.18 + vec3(0.07,0.075,0.085), vec3(1.0)), glint*0.75);
  // al despegar conserva el color de la cinta y en el nudo toma el de la escultura
  col = mix(col, lut(tR), smoothstep(0.0, 0.4, sc));
  vCol = col;
  vA = a;
}
`;

const SC_PART_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vHalfLen;
in float vR;
in vec3 vCol;
in float vA;
uniform float uDpr;
out vec4 o;
void main(){
  vec2 q = vec2(max(abs(vLocal.x)-vHalfLen, 0.0), vLocal.y);
  float d = length(q) - vR;
  float a = clamp(0.5 - d*uDpr, 0.0, 1.0);
  float tail = vHalfLen > 0.0 ? clamp(0.5 - vLocal.x/(2.0*(vHalfLen+vR)), 0.0, 1.0) : 0.0;
  a *= 1.0 - tail*0.55;
  a *= vA;
  if(a < 0.004) discard;
  o = vec4(vCol*a, a);
}
`;

const SC_IMAGE_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uImg;
uniform sampler2D uFlow;
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uRect;
uniform vec3 uBg;
uniform vec3 uImgBg;
uniform vec2 uMouse;
uniform float uPresence;
uniform float uRadius;
uniform float uStrength;
uniform float uTime;
uniform float uAmbient;
uniform float uIntroVis;
uniform float uRest;
uniform float uAlphaMode;
uniform float uScatter;
${SC_NOISE}
${SC_ENERGY}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y)/uDpr;
  vec2 size = uRect.zw;
  vec2 uv = (px-uRect.xy)/size;
  if(uv.x < -0.05 || uv.x > 1.05 || uv.y < -0.12 || uv.y > 1.12){ o = vec4(0.0); return; }
  vec4 fl = texture(uFlow, clamp(uv,0.0,1.0));
  vec2 vel = (fl.rg*255.0-128.0)/127.0;
  vec2 rp = uv*size;
  vec2 toM = rp - uMouse;
  float fall = exp(-dot(toM,toM)/(uRadius*uRadius))*uPresence;
  vec2 disp = -toM*0.22*uStrength*fall - vel*10.0*uStrength;
  disp += ambientField(uv, uTime)*10.0*uAmbient;
  vec2 suv = uv + disp/size;
  vec4 tx = texture(uImg, suv);
  vec3 col = tx.rgb;
  vec2 e = smoothstep(vec2(0.0), vec2(0.004,0.01), suv) * (1.0 - smoothstep(vec2(0.996,0.99), vec2(1.0), suv));
  float key = uAlphaMode > 0.5 ? tx.a : smoothstep(0.012, 0.05, length(col-uImgBg));
  float k = key*e.x*e.y;
  float E = energyAt(rp, uMouse, uRadius, uPresence, fl.b);
  float show = (1.0 - max(E, uRest))*uIntroVis*(1.0 - smoothstep(0.0, 0.06, uScatter));
  vec3 mat = uAlphaMode > 0.5 ? col : col*(uBg/max(uImgBg, vec3(0.001)));
  float A = k*show;
  o = vec4(mat*A, A);
}
`;

function scCompile(gl, vs, fs) {
    const make = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error('Shader: ' + log);
        }
        return sh;
    };
    const p = gl.createProgram();
    const v = make(gl.VERTEX_SHADER, vs);
    const f = make(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        if (info) u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
}

function scHexToRgb(hex, fallback) {
    const s = String(hex || '').trim();
    let m = s.match(/^#?([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map(c => parseInt(c + c, 16) / 255);
    m = s.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) { const n = parseInt(m[1], 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    return fallback;
}

const SC_TEX_W = 1024;
const SC_SETTLE_FRAMES = 270;

class LiquidEngine {
    constructor(canvas, opts, onFail) {
        this.canvas = canvas;
        this.opts = opts;
        this.onFail = onFail;
        this.lastImage = null;
        this.onFirstFrame = null;
        this.lowPower = false;
        this.stateFormat = { internal: 0, type: 0 };
        this.imgTex = null;
        this.flowTex = []; this.flowFb = [];
        this.flowW = 256; this.flowH = 104; this.flowIdx = 0; this.flowDirty = false;
        this.homeTex = null; this.colTex = null; this.homeData = null;
        this.stateTex = []; this.stateFb = []; this.stateIdx = 0;
        this.texH = 1; this.n = 0; this.gridW = 1; this.stateDirty = false;
        this.alphaMode = false; this.imgBg = [0.918, 0.914, 0.906]; this.flowing = 0;
        this.aspect = 2.5; this.rect = { x: 0, y: 0, w: 1, h: 1 }; this.cssW = 1; this.cssH = 1;
        this.target = { x: -9999, y: -9999 }; this.mouse = { x: -9999, y: -9999 }; this.prevMouse = { x: -9999, y: -9999 };
        this.mvel = { x: 0, y: 0 };
        this.presence = 0; this.presenceTarget = 0; this.burst = 0;
        this.lastInput = -1e9; this.settle = 1e9; this.touchRelease = 0;
        this.time = 0; this.introT = 1; this.raf = 0; this.running = false; this.last = 0; this.skip = 0;
        this.visible = true; this.ready = false; this.destroyed = false; this.lost = false;
        // historia de scroll: dispersión, visibilidad del polvo, velocidad del ensamblaje y puntero
        this.scatter = 0; this.fade = 0; this.gv = 0; this.lastG = 1;
        // forma de la cinta (escultura desenrollada) y tarjetas de Servicios que la tapan
        this.wave = [0, 0, 0, 0]; this.span = [0, 1]; this.shape = [1, 1]; this.along = 0;
        // elementos de Servicios que cruza la cinta: rectángulo y si quedan detrás de ella (1) o encima (0)
        this.occ = new Float32Array(32); this.occF = new Float32Array(8); this.occN = 0;
        // flujo del material, avance del dibujo, largo de estela, sombra, reloj real y gancho por cuadro
        this.flowOff = 0; this.drawP = 1.2; this.fiber = 8; this.fx = true; this.rtime = 0; this.onFrame = null; this.auxTex = null;
        this.rectMoved = false;
        this.ptr = { x: -9999, y: -9999 }; this.ptrOn = 0; this.ptrTarget = 0;
        this.frame = this.frame.bind(this);
        this.onLost = e => { e.preventDefault(); this.lost = true; this.stop(); this.onFail(); };

        const gl = canvas.getContext('webgl2', {
            alpha: true, antialias: false, depth: false, stencil: false,
            premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance'
        });
        if (!gl) throw new Error('WebGL2 unavailable');
        this.gl = gl;
        const nav = navigator;
        this.lowPower = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4 || window.matchMedia('(pointer: coarse)').matches;
        this.initGL();
        canvas.addEventListener('webglcontextlost', this.onLost, false);
    }

    initGL() {
        const gl = this.gl;
        const full = gl.getExtension('EXT_color_buffer_float');
        const half = full ? null : gl.getExtension('EXT_color_buffer_half_float');
        if (!full && !half) throw new Error('No float render targets');
        this.stateFormat = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
        this.pFlow = scCompile(gl, SC_QUAD_VS, SC_FLOW_FS);
        this.pSim = scCompile(gl, SC_QUAD_VS, SC_SIM_FS);
        this.pPart = scCompile(gl, SC_PART_VS, SC_PART_FS);
        this.pImg = scCompile(gl, SC_QUAD_VS, SC_IMAGE_FS);
        this.pRib = scCompile(gl, SC_RIB_VS, SC_RIB_FS);
        this.pBead = scCompile(gl, SC_BEAD_VS, SC_BEAD_FS);
        // malla de la cinta: una tira de triángulos (s a lo largo, c a lo ancho)
        const seg = this.lowPower ? 420 : 720;
        const strip = new Float32Array((seg + 1) * 4);
        for (let i = 0; i <= seg; i++) {
            strip[i * 4] = i / seg; strip[i * 4 + 1] = -0.5;
            strip[i * 4 + 2] = i / seg; strip[i * 4 + 3] = 0.5;
        }
        this.ribN = (seg + 1) * 2;
        this.ribVao = gl.createVertexArray();
        gl.bindVertexArray(this.ribVao);
        this.ribVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.ribVbo);
        gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        for (let i = 0; i < 2; i++) {
            const t = this.makeTex(gl.RGBA8, this.flowW, this.flowH, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
            const fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
            this.flowTex.push(t);
            this.flowFb.push(fb);
        }
        this.clearFlow();
    }

    makeTex(internal, w, h, format, type, data, filter) {
        const gl = this.gl;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    clearFlow() {
        const gl = this.gl;
        for (const fb of this.flowFb) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.viewport(0, 0, this.flowW, this.flowH);
            gl.clearColor(128 / 255, 128 / 255, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.flowDirty = false;
    }

    clearState() {
        const gl = this.gl;
        for (const fb of this.stateFb) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.viewport(0, 0, SC_TEX_W, this.texH);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.stateDirty = false;
    }

    setImage(img) {
        if (this.destroyed || this.lost) return;
        const gl = this.gl;
        this.lastImage = img;
        this.aspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height) || 2.5;
        // la cinta sigue el eje largo de la escultura (horizontal en escritorio, vertical en celular)
        this.along = this.aspect >= 1 ? 0 : 1;
        this.flowH = Math.max(32, Math.round(this.flowW / this.aspect));
        for (const t of this.flowTex) {
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.flowW, this.flowH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        this.clearFlow();
        if (this.imgTex) gl.deleteTexture(this.imgTex);
        this.imgTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.buildParticles(img);
        this.ready = true;
        if (this.opts.intro && !this.opts.reducedMotion) this.startIntro();
        this.wake();
    }

    buildParticles(img) {
        const gl = this.gl;
        const baseGrid = this.lowPower ? 640 : 1000;
        const gw = Math.round(baseGrid * Math.sqrt(clamp(this.opts.density, 0.15, 2)));
        const gh = Math.max(1, Math.round(gw / this.aspect));
        this.gridW = gw;
        let data;
        try {
            const c = document.createElement('canvas');
            c.width = gw; c.height = gh;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, gw, gh);
            data = ctx.getImageData(0, 0, gw, gh).data;
        } catch (e) {
            throw new Error('Image is not CORS-readable');
        }
        let transparent = 0;
        for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) transparent++;
        this.alphaMode = transparent > data.length / (4 * 7) / 20;
        if (this.opts.imgBg) this.imgBg = this.opts.imgBg;
        else if (!this.alphaMode) {
            let r = 0, g = 0, b = 0, n = 0;
            const pw = Math.max(2, Math.round(gw * 0.012));
            for (const [cx, cy] of [[0, 0], [gw - pw, 0], [0, gh - pw], [gw - pw, gh - pw]]) {
                for (let y = cy; y < cy + pw; y++) {
                    for (let x = cx; x < cx + pw; x++) {
                        const i = (y * gw + x) * 4;
                        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
                    }
                }
            }
            this.imgBg = [r / n / 255, g / n / 255, b / n / 255];
        }
        const home = [];
        const col = [];
        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                const i = (y * gw + x) * 4;
                const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
                if (this.alphaMode) {
                    const a = data[i + 3] / 255;
                    if (a < 0.12) continue;
                    if (a < 0.5 && Math.random() > a * 2) continue;
                } else {
                    const dev = Math.hypot(r - this.imgBg[0], g - this.imgBg[1], b - this.imgBg[2]);
                    if (dev < 0.03) continue;
                    if (dev < 0.07 && Math.random() > (dev - 0.03) / 0.04) continue;
                }
                const jx = (Math.random() - 0.5) * 0.6;
                const jy = (Math.random() - 0.5) * 0.6;
                home.push((x + 0.5 + jx) / gw, (y + 0.5 + jy) / gh, Math.random(), 0.85 + Math.random() * 0.3);
                col.push(data[i], data[i + 1], data[i + 2], 255);
            }
        }
        const n = home.length / 4;
        this.n = n;
        this.texH = Math.max(1, Math.ceil(n / SC_TEX_W));
        const total = SC_TEX_W * this.texH;
        const homeArr = new Float32Array(total * 4);
        homeArr.set(home);
        // Rango de cada partícula a lo largo (eje largo) y, dentro de su tramo, a lo ancho: así la
        // cinta desenrollada tiene densidad pareja y cada partícula sabe de qué punto de la cinta despega.
        const L = this.aspect >= 1 ? 0 : 1, C = 1 - L;
        const BINS = 4096;
        const cntL = new Uint32Array(BINS);
        const bin = v => Math.min(BINS - 1, Math.max(0, Math.floor(v * BINS)));
        for (let i = 0; i < n; i++) cntL[bin(home[i * 4 + L])]++;
        const cumL = new Float64Array(BINS);
        for (let b = 1; b < BINS; b++) cumL[b] = cumL[b - 1] + cntL[b - 1];
        const auxArr = new Float32Array(total * 4);
        for (let i = 0; i < n; i++) {
            const v = home[i * 4 + L], b = bin(v);
            auxArr[i * 4 + L] = (cumL[b] + clamp(v * BINS - b, 0, 1) * cntL[b]) / n;
            auxArr[i * 4 + 2] = Math.random();
            auxArr[i * 4 + 3] = Math.random();
        }
        const COLS = 512;
        const colOf = new Uint16Array(n), colCount = new Uint32Array(COLS);
        for (let i = 0; i < n; i++) {
            const b = Math.min(COLS - 1, Math.floor(auxArr[i * 4 + L] * COLS));
            colOf[i] = b;
            colCount[b]++;
        }
        const colStart = new Uint32Array(COLS + 1);
        for (let b = 0; b < COLS; b++) colStart[b + 1] = colStart[b] + colCount[b];
        const fill = colStart.slice(0, COLS), order = new Uint32Array(n);
        for (let i = 0; i < n; i++) order[fill[colOf[i]]++] = i;
        for (let b = 0; b < COLS; b++) {
            const a0 = colStart[b], m = colStart[b + 1] - a0;
            if (!m) continue;
            const idx = Array.from(order.subarray(a0, a0 + m));
            idx.sort((p, q) => home[p * 4 + C] - home[q * 4 + C]);
            for (let k = 0; k < m; k++) auxArr[idx[k] * 4 + C] = (k + 0.5) / m;
        }
        const colArr = new Uint8Array(total * 4);
        colArr.set(col);
        for (const t of [this.homeTex, this.colTex, this.auxTex, ...this.stateTex]) if (t) gl.deleteTexture(t);
        for (const f of this.stateFb) gl.deleteFramebuffer(f);
        this.stateTex = [];
        this.stateFb = [];
        this.homeTex = this.makeTex(gl.RGBA32F, SC_TEX_W, this.texH, gl.RGBA, gl.FLOAT, homeArr, gl.NEAREST);
        this.colTex = this.makeTex(gl.RGBA8, SC_TEX_W, this.texH, gl.RGBA, gl.UNSIGNED_BYTE, colArr, gl.NEAREST);
        this.auxTex = this.makeTex(gl.RGBA32F, SC_TEX_W, this.texH, gl.RGBA, gl.FLOAT, auxArr, gl.NEAREST);
        for (let i = 0; i < 2; i++) {
            const t = this.makeTex(this.stateFormat.internal, SC_TEX_W, this.texH, gl.RGBA, this.stateFormat.type, null, gl.NEAREST);
            const fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float FBO incomplete');
            this.stateTex.push(t);
            this.stateFb.push(fb);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.homeData = homeArr;
        this.clearState();
    }

    startIntro() {
        const gl = this.gl;
        const home = this.homeData;
        if (!home) return;
        const w = this.rect.w > 10 ? this.rect.w : 1300;
        const total = SC_TEX_W * this.texH;
        const st = new Float32Array(total * 4);
        for (let i = 0; i < this.n; i++) {
            const hx = home[i * 4] - 0.5;
            const hy = home[i * 4 + 1] - 0.5;
            const sd = home[i * 4 + 2];
            const ang = (Math.random() - 0.5) * 0.9 + (hx > 0 ? 0 : Math.PI);
            const dist = w * (0.04 + Math.random() * 0.14) * (0.5 + Math.abs(hx) * 1.4);
            st[i * 4] = Math.cos(ang) * dist + hx * w * 0.25 * sd;
            st[i * 4 + 1] = Math.sin(ang) * dist * 0.55 + hy * 120 * (Math.random() - 0.5);
        }
        gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.stateFormat.internal, SC_TEX_W, this.texH, 0, gl.RGBA, gl.FLOAT, st);
        this.introT = 0;
        this.stateDirty = true;
    }

    resize(cssW, cssH, rect) {
        this.cssW = Math.max(1, cssW);
        this.cssH = Math.max(1, cssH);
        this.rect = rect;
        let dpr = Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.5 : 2);
        const px = this.cssW * this.cssH * dpr * dpr;
        if (px > 4.5e6) dpr = Math.max(1, Math.sqrt(4.5e6 / (this.cssW * this.cssH)));
        const w = Math.round(this.cssW * dpr);
        const h = Math.round(this.cssH * dpr);
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        this.draw();
    }

    // el canvas cubre la pantalla y el rectángulo de la escultura se mueve con el scroll
    setRect(rect) {
        const o = this.rect;
        if (o.x !== rect.x || o.y !== rect.y || o.w !== rect.w || o.h !== rect.h) this.rectMoved = true;
        this.rect = rect;
        if (!this.running) this.draw();
    }

    // y del eje, amplitud de la ola, grosor, fase, extremos en x, ondas y vueltas de giro
    setRibbon(y, amp, thick, phase, x0, x1, waves, twist) {
        const wv = this.wave;
        wv[0] = y; wv[1] = amp; wv[2] = thick; wv[3] = phase;
        this.span[0] = x0; this.span[1] = x1;
        this.shape[0] = waves; this.shape[1] = twist;
    }

    setWeave(rects, flags, n) {
        this.occ.set(rects);
        this.occF.set(flags);
        this.occN = n;
    }

    // flujo del material a lo largo de la cinta, avance del dibujo y largo de las estelas al volar
    setFlow(off, draw, fiber) {
        this.flowOff = off;
        this.drawP = draw;
        this.fiber = fiber;
    }

    setScatter(sc, fade) {
        this.scatter = sc;
        this.fade = fade;
        if (sc > 0.0005 && fade > 0.001) this.wake();
    }

    setPointer(x, y, on) {
        this.ptr.x = x;
        this.ptr.y = y;
        this.ptrTarget = on ? 1 : 0;
    }

    setVisible(v) {
        this.visible = v;
        if (v) this.wake(); else this.stop();
    }

    pointer(type, x, y, touch) {
        if (!this.opts.interactive || this.lost) return;
        const now = performance.now();
        if (type === 'leave' || type === 'up') {
            if (touch) this.touchRelease = now + 260;
            else this.presenceTarget = 0;
            this.wake();
            return;
        }
        if (this.mouse.x < -9000 || type === 'down') {
            this.mouse.x = this.prevMouse.x = x;
            this.mouse.y = this.prevMouse.y = y;
        }
        this.target.x = x;
        this.target.y = y;
        this.presenceTarget = 1;
        this.lastInput = now;
        this.settle = 0;
        if (type === 'down') { this.burst = 1; this.touchRelease = 0; }
        this.wake();
    }

    wake() {
        if (!this.ready || this.running || !this.visible || this.destroyed || this.lost) {
            if (this.ready && !this.running) this.draw();
            return;
        }
        this.running = true;
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.frame);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
    }

    radiusPx() { return this.opts.radius * clamp(this.rect.w / 1400, 0.6, 1.25); }
    strength() { return this.opts.strength * (this.opts.reducedMotion ? 0.5 : 1); }

    frame(now) {
        if (!this.running) return;
        // la página actualiza la cinta (scroll, tarjetas) en el mismo cuadro en que se dibuja
        if (this.onFrame) {
            this.onFrame();
            if (!this.running) return;
        }
        const rawMs = now - this.last;
        this.rtime += Math.min(Math.max(rawMs, 0), 100) / 1000;
        const dt = clamp(rawMs / 16.6667, 0.25, 3);
        this.last = now;
        const o = this.opts;
        const ambientOn = o.ambient && !o.reducedMotion;
        if (this.touchRelease && now > this.touchRelease) { this.presenceTarget = 0; this.touchRelease = 0; }
        const ease = 1 - Math.pow(1 - 0.22, dt);
        this.mouse.x += (this.target.x - this.mouse.x) * ease;
        this.mouse.y += (this.target.y - this.mouse.y) * ease;
        const vx = (this.mouse.x - this.prevMouse.x) / dt;
        const vy = (this.mouse.y - this.prevMouse.y) / dt;
        this.prevMouse.x = this.mouse.x;
        this.prevMouse.y = this.mouse.y;
        this.mvel.x += (clamp(vx, -60, 60) - this.mvel.x) * 0.5;
        this.mvel.y += (clamp(vy, -60, 60) - this.mvel.y) * 0.5;
        const pk = this.presenceTarget > this.presence ? 0.1 : 0.035;
        this.presence += (this.presenceTarget - this.presence) * (1 - Math.pow(1 - pk, dt));
        if (this.presence < 0.001 && this.presenceTarget === 0) this.presence = 0;
        const fk = this.presenceTarget > this.flowing ? 0.05 : 0.018;
        this.flowing += (this.presenceTarget - this.flowing) * (1 - Math.pow(1 - fk, dt));
        if (this.flowing < 0.002 && this.presenceTarget === 0) this.flowing = 0;
        if (this.introT < 1) this.introT = Math.min(1, this.introT + Math.min(rawMs, 100) / 3200);
        const interacting = this.presence > 0.001 || this.burst > 0;
        this.settle = interacting ? 0 : this.settle + dt;
        const simActive = interacting || this.settle < SC_SETTLE_FRAMES || this.introT < 1;
        const scatterOn = this.scatter > 0.0005 && this.fade > 0.001;
        const G = 1 - this.scatter;
        this.gv += ((G - this.lastG) / dt - this.gv) * 0.25;
        this.lastG = G;
        this.ptrOn += (this.ptrTarget - this.ptrOn) * (1 - Math.pow(0.9, dt));
        const active = simActive || scatterOn;
        if (!active) {
            if (this.flowDirty) this.clearFlow();
            if (this.stateDirty) this.clearState();
            if (!ambientOn) {
                this.draw();
                this.firstFrame();
                this.stop();
                return;
            }
            this.raf = requestAnimationFrame(this.frame);
            this.time += (dt * o.speed) / 60;
            // en reposo dibuja a medio ritmo; mientras se mueve con el scroll, cada cuadro
            if (this.skip++ % 2 && !this.rectMoved) return;
            this.rectMoved = false;
            this.draw();
            this.firstFrame();
            return;
        }
        this.raf = requestAnimationFrame(this.frame);
        this.time += (dt * o.speed * (1 + this.flowing * 1.6)) / 60;
        if (simActive) {
            this.stepFlow(dt);
            this.stepSim(dt);
            this.burst = Math.max(0, this.burst - 0.1 * dt);
        }
        this.draw();
        this.firstFrame();
    }

    firstFrame() {
        if (this.onFirstFrame) {
            const cb = this.onFirstFrame;
            this.onFirstFrame = null;
            requestAnimationFrame(() => cb());
        }
    }

    stepFlow(dt) {
        const gl = this.gl, P = this.pFlow, dst = 1 - this.flowIdx, r = this.rect;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFb[dst]);
        gl.viewport(0, 0, this.flowW, this.flowH);
        gl.disable(gl.BLEND);
        gl.useProgram(P.p);
        gl.bindVertexArray(this.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
        gl.uniform1i(P.u.uPrev, 0);
        gl.uniform2f(P.u.uTexel, 1 / this.flowW, 1 / this.flowH);
        gl.uniform2f(P.u.uMouse, (this.mouse.x - r.x) / r.w, (this.mouse.y - r.y) / r.h);
        gl.uniform2f(P.u.uVel, clamp(this.mvel.x / 40, -1, 1), clamp(this.mvel.y / 40, -1, 1));
        gl.uniform2f(P.u.uSize, r.w, r.h);
        gl.uniform1f(P.u.uRadius, this.radiusPx());
        gl.uniform1f(P.u.uPresence, Math.max(this.presence, this.burst));
        gl.uniform1f(P.u.uDecay, Math.pow(0.968, dt));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.flowIdx = dst;
        this.flowDirty = true;
    }

    stepSim(dt) {
        if (!this.n) return;
        const gl = this.gl, P = this.pSim, o = this.opts, r = this.rect, dst = 1 - this.stateIdx;
        const intro = o.reducedMotion || !o.intro ? 0 : Math.pow(1 - this.introT, 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateFb[dst]);
        gl.viewport(0, 0, SC_TEX_W, this.texH);
        gl.disable(gl.BLEND);
        gl.useProgram(P.p);
        gl.bindVertexArray(this.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]);
        gl.uniform1i(P.u.uState, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.homeTex);
        gl.uniform1i(P.u.uHome, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
        gl.uniform1i(P.u.uFlow, 2);
        gl.uniform2f(P.u.uSize, r.w, r.h);
        gl.uniform2f(P.u.uMouse, this.mouse.x - r.x, this.mouse.y - r.y);
        gl.uniform1f(P.u.uRadius, this.radiusPx());
        gl.uniform1f(P.u.uPresence, Math.max(this.presence, this.burst));
        gl.uniform1f(P.u.uStrength, this.strength() * (1 + this.burst * 1.5));
        gl.uniform1f(P.u.uSpread, clamp(o.spread, 0, 2));
        gl.uniform1f(P.u.uTurb, clamp(o.turbulence, 0, 2) * (o.reducedMotion ? 0.3 : 1));
        gl.uniform1f(P.u.uReturn, clamp(o.returnSpeed, 0, 2));
        gl.uniform1f(P.u.uTime, this.time);
        gl.uniform1f(P.u.uDt, dt);
        gl.uniform1f(P.u.uIntro, intro);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.stateIdx = dst;
        this.stateDirty = true;
    }

    draw() {
        if (!this.ready || this.lost || this.destroyed) return;
        const gl = this.gl, o = this.opts, r = this.rect, rm = o.reducedMotion;
        const introVis = rm || !o.intro ? 1 : Math.pow(this.introT, 2.2);
        const base = o.ambient && !rm ? clamp(o.ambientIntensity, 0, 2) : 0;
        const amb = base + this.flowing * 0.85 * clamp(o.liquid, 0, 2) * (rm ? 0.3 : 1);
        const rest = o.restStyle === 'particles' ? 1 : 0;
        const [br, bg, bb] = o.bg;
        const [ir, ig, ib] = this.imgBg;
        const dpr = this.canvas.width / this.cssW;
        const pres = Math.max(this.presence, this.burst);
        const mx = this.mouse.x - r.x, my = this.mouse.y - r.y;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.bindVertexArray(this.vao);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const scatterOn = this.scatter > 0.0005 && this.fade > 0.001;

        // la imagen nítida solo se dibuja cuando la escultura está armada
        if (this.scatter < 0.06) {
        const I = this.pImg;
        gl.useProgram(I.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
        gl.uniform1i(I.u.uImg, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
        gl.uniform1i(I.u.uFlow, 1);
        gl.uniform2f(I.u.uRes, this.cssW, this.cssH);
        gl.uniform1f(I.u.uDpr, dpr);
        gl.uniform4f(I.u.uRect, r.x, r.y, r.w, r.h);
        gl.uniform3f(I.u.uBg, br, bg, bb);
        gl.uniform3f(I.u.uImgBg, ir, ig, ib);
        gl.uniform2f(I.u.uMouse, mx, my);
        gl.uniform1f(I.u.uPresence, pres);
        gl.uniform1f(I.u.uRadius, this.radiusPx());
        gl.uniform1f(I.u.uStrength, this.strength());
        gl.uniform1f(I.u.uTime, this.time);
        gl.uniform1f(I.u.uAmbient, amb);
        gl.uniform1f(I.u.uIntroVis, introVis);
        gl.uniform1f(I.u.uRest, rest);
        gl.uniform1f(I.u.uAlphaMode, this.alphaMode ? 1 : 0);
        gl.uniform1f(I.u.uScatter, this.scatter);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // la cinta (escultura desenrollada): superficie de fibras, sombra, filamentos y esferas
        if (scatterOn && this.ribVao) this.drawRibbon();

        if (!this.n || (!this.stateDirty && rest === 0 && introVis >= 1 && !scatterOn)) return;
        // mientras es solo cinta no hace falta el pase de partículas
        if (scatterOn && this.scatter >= 0.9995) return;

        const P = this.pPart;
        gl.useProgram(P.p);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.stateTex[this.stateIdx]);
        gl.uniform1i(P.u.uState, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.homeTex);
        gl.uniform1i(P.u.uHome, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.colTex);
        gl.uniform1i(P.u.uCol, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.flowTex[this.flowIdx]);
        gl.uniform1i(P.u.uFlow, 3);
        gl.uniform1i(P.u.uTexW, SC_TEX_W);
        gl.uniform4f(P.u.uRect, r.x, r.y, r.w, r.h);
        gl.uniform2f(P.u.uRes, this.cssW, this.cssH);
        gl.uniform2f(P.u.uMouse, mx, my);
        gl.uniform1f(P.u.uRadius, this.radiusPx());
        gl.uniform1f(P.u.uPresence, pres);
        const spacing = r.w / this.gridW;
        gl.uniform1f(P.u.uDot, spacing * 1.45 * clamp(o.dotSize, 0.2, 3));
        gl.uniform1f(P.u.uTime, this.time);
        gl.uniform1f(P.u.uAmbient, amb);
        gl.uniform1f(P.u.uStreak, (o.streaks ? 1 : 0) * (0.45 + 0.55 * introVis));
        gl.uniform1f(P.u.uIntroVis, introVis);
        gl.uniform1f(P.u.uRest, rest);
        gl.uniform1f(P.u.uDpr, dpr);
        if (this.alphaMode) gl.uniform3f(P.u.uTint, 1, 1, 1);
        else gl.uniform3f(P.u.uTint, br / Math.max(ir, 0.001), bg / Math.max(ig, 0.001), bb / Math.max(ib, 0.001));
        gl.uniform1f(P.u.uScatter, this.scatter);
        gl.uniform1f(P.u.uFade, 1);
        gl.uniform1f(P.u.uGV, this.gv);
        gl.uniform2f(P.u.uPtr, this.ptr.x, this.ptr.y);
        gl.uniform1f(P.u.uPtrOn, this.ptrOn);
        gl.uniform1f(P.u.uAlong, this.along);
        gl.uniform4f(P.u.uWave, this.wave[0], this.wave[1], this.wave[2], this.wave[3]);
        gl.uniform2f(P.u.uSpan, this.span[0], this.span[1]);
        gl.uniform2f(P.u.uShape, this.shape[0], this.shape[1]);
        gl.uniform1f(P.u.uRibTime, this.rtime);
        gl.uniform1f(P.u.uFiber, this.fiber);
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this.auxTex);
        gl.uniform1i(P.u.uAux, 4);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
        gl.disable(gl.BLEND);
    }

    drawRibbon() {
        const gl = this.gl;
        const G = 1 - this.scatter;
        const wv = this.wave;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const R = this.pRib;
        gl.useProgram(R.p);
        gl.bindVertexArray(this.ribVao);
        gl.uniform2f(R.u.uRes, this.cssW, this.cssH);
        gl.uniform1f(R.u.uTime, this.rtime);
        gl.uniform4f(R.u.uWave, wv[0], wv[1], wv[2], wv[3]);
        gl.uniform2f(R.u.uSpan, this.span[0], this.span[1]);
        gl.uniform2f(R.u.uShape, this.shape[0], this.shape[1]);
        gl.uniform2f(R.u.uPtr, this.ptr.x, this.ptr.y);
        gl.uniform1f(R.u.uPtrOn, this.ptrOn);
        gl.uniform1f(R.u.uFlowOff, this.flowOff);
        gl.uniform1f(R.u.uG, G);
        gl.uniform1f(R.u.uDraw, this.drawP);
        gl.uniform4fv(R.u['uOcc[0]'], this.occ);
        gl.uniform1fv(R.u['uOccF[0]'], this.occF);
        gl.uniform1i(R.u.uOccN, this.occN);
        gl.uniform1f(R.u.uDpr, this.canvas.width / this.cssW);
        const n = this.ribN;
        // 1) sombra sobre las tarjetas que la cinta tiene detrás
        if (this.fx) {
            gl.uniform1i(R.u.uMode, 1);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, n);
        }
        // 2) tramos de los filamentos que pasan por detrás de la cinta
        gl.uniform1i(R.u.uMode, 2);
        gl.uniform1i(R.u.uFrontPass, 0);
        for (let k = 0; k < 5; k++) { gl.uniform1f(R.u.uFilK, k); gl.drawArrays(gl.TRIANGLE_STRIP, 0, n); }
        // 3) la cinta
        gl.uniform1i(R.u.uMode, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n);
        // 4) tramos de los filamentos que pasan por delante
        gl.uniform1i(R.u.uMode, 2);
        gl.uniform1i(R.u.uFrontPass, 1);
        for (let k = 0; k < 5; k++) { gl.uniform1f(R.u.uFilK, k); gl.drawArrays(gl.TRIANGLE_STRIP, 0, n); }
        // 5) esferas
        const B = this.pBead;
        gl.useProgram(B.p);
        gl.bindVertexArray(this.vao);
        gl.uniform2f(B.u.uRes, this.cssW, this.cssH);
        gl.uniform1f(B.u.uTime, this.rtime);
        gl.uniform1f(B.u.uG, G);
        gl.uniform1f(B.u.uDraw, this.drawP);
        gl.uniform4f(B.u.uWave, wv[0], wv[1], wv[2], wv[3]);
        gl.uniform2f(B.u.uSpan, this.span[0], this.span[1]);
        gl.uniform2f(B.u.uShape, this.shape[0], this.shape[1]);
        gl.uniform2f(B.u.uPtr, this.ptr.x, this.ptr.y);
        gl.uniform1f(B.u.uPtrOn, this.ptrOn);
        const beads = Math.round(clamp(this.cssW * 0.24, 110, this.lowPower ? 250 : 470));
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, beads);
        gl.disable(gl.BLEND);
    }

    destroy() {
        this.destroyed = true;
        this.stop();
        this.canvas.removeEventListener('webglcontextlost', this.onLost);
        const gl = this.gl;
        if (!this.lost) {
            gl.deleteBuffer(this.quad);
            gl.deleteVertexArray(this.vao);
            for (const t of [...this.flowTex, ...this.stateTex, this.imgTex, this.homeTex, this.colTex, this.auxTex]) if (t) gl.deleteTexture(t);
            for (const f of [...this.flowFb, ...this.stateFb]) gl.deleteFramebuffer(f);
            for (const p of [this.pFlow, this.pSim, this.pPart, this.pImg, this.pRib, this.pBead]) if (p) gl.deleteProgram(p.p);
            if (this.ribVbo) gl.deleteBuffer(this.ribVbo);
            if (this.ribVao) gl.deleteVertexArray(this.ribVao);
        }
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
    }
}

/* La escultura se centra en la franja libre entre la parte superior y el texto. */
function scComputeRect(w, h, aspect, band, p) {
    const bandH = Math.max(80, band.bottom - band.top);
    let rw, maxH;
    if (w >= 1024) { rw = w * 1.02 * p.scale; maxH = bandH * 1.1 * p.scale; }
    else if (w >= 640) { rw = w * 1.3 * p.scale; maxH = bandH * 1.15 * p.scale; }
    else if (aspect < 1.3) { rw = w * 1.0 * p.mobileScale; maxH = bandH * 1.0 * p.mobileScale; }
    else { rw = w * 1.9 * p.mobileScale; maxH = bandH * 1.2 * p.mobileScale; }
    if (rw / aspect > maxH) rw = maxH * aspect;
    const rh = rw / aspect;
    const cx = w * (0.5 + p.x / 100);
    const cy = (band.top + band.bottom) / 2 + h * (p.y / 100);
    return { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh };
}

function initSculpture() {
    const root = $('#estudio');
    if (!root) return;
    const services = $('#servicios');
    const canvas = $('#sculptCanvas'), fallback = $('#sculptFallback'), content = $('#sculptContent');
    const backdrop = $('#sculptBackdrop'), hint = $('#sculptHint');
    const cfg = CONFIG.sculpture;
    const pickSrc = () => (window.innerWidth < 640 ? cfg.tall : cfg.wide);
    let src = pickSrc();
    let aspect = src === cfg.tall ? 1024 / 1300 : 1983 / 793;
    let engine = null, started = false, failed = false, shown = null;
    let local = { x: 0, y: 0, w: 1, h: 1 };

    const fail = err => {
        if (err) console.warn('[hello web] escultura sin WebGL2, se muestra la imagen:', err && err.message ? err.message : err);
        failed = true;
        root.dataset.gl = 'off';
        canvas.classList.remove('is-shown');
        if (engine) { try { engine.destroy(); } catch (e) { /* nada */ } engine = null; }
    };

    // rectángulo de la escultura en coordenadas de pantalla (el canvas es fijo)
    const viewRect = rr => ({ x: rr.left + local.x, y: rr.top + local.y, w: local.w, h: local.h });

    const layout = () => {
        const w = root.clientWidth, h = root.clientHeight;
        const top = NAV_H + 12;
        const bottom = Math.max(top + 160, content.offsetTop - 8);
        local = scComputeRect(w, h, aspect, { top, bottom }, { scale: 1, mobileScale: 1, x: 0, y: 0 });
        fallback.classList.add('is-placed');
        fallback.style.left = local.x + 'px';
        fallback.style.top = local.y + 'px';
        fallback.style.width = local.w + 'px';
        fallback.style.height = local.h + 'px';
        backdrop.style.top = ((top + bottom) / 2) + 'px';
        backdrop.style.fontSize = Math.min(w * 0.34, (bottom - top) * 0.95) + 'px';
        hint.style.top = (bottom - 22) + 'px';
        if (engine) engine.resize(window.innerWidth, window.innerHeight, viewRect(root.getBoundingClientRect()));
    };

    if (REDUCED) {
        // sin animación: se muestra la escultura fija, ya recoloreada con CSS
        root.dataset.gl = 'off';
        layout();
        new ResizeObserver(layout).observe(root);
        return;
    }

    // Recoloreado a la paleta de la marca: la luminancia se mapea a un degradado azul
    // (sombras navy, medios azul eléctrico, brillos blanco hielo). El fondo queda intacto.
    const LUT = (() => {
        const stops = [[0, [17, 17, 17]], [0.06, [14, 23, 51]], [0.22, [23, 49, 143]], [0.42, [47, 99, 240]], [0.62, [94, 149, 255]], [0.8, [169, 200, 255]], [1, [245, 248, 255]]];
        const lut = new Uint8ClampedArray(256 * 3);
        for (let L = 0; L < 256; L++) {
            const t = L <= 17 ? 0 : Math.pow((L - 17) / 238, 0.92);
            let k = 1;
            while (k < stops.length - 1 && stops[k][0] < t) k++;
            const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
            const f = clamp((t - t0) / ((t1 - t0) || 1), 0, 1);
            for (let c = 0; c < 3; c++) lut[L * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f);
        }
        return lut;
    })();
    const recolor = img => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h);
        const d = data.data;
        for (let i = 0; i < d.length; i += 4) {
            const k = ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) | 0) * 3;
            d[i] = LUT[k];
            d[i + 1] = LUT[k + 1];
            d[i + 2] = LUT[k + 2];
        }
        ctx.putImageData(data, 0, 0);
        return c;
    };

    // Si el navegador tenía en caché una copia sin permisos CORS, se reintenta una vez sin caché
    const loadImage = (url, retry = true) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
            if (!engine) return;
            let source;
            try { source = recolor(img); } catch (e) { fail(e); return; }
            aspect = source.width / source.height || aspect;
            layout();
            try { engine.setImage(source); } catch (e) { fail(e); }
        };
        img.onerror = () => {
            if (retry) loadImage(url + (url.includes('?') ? '&' : '?') + 'cors=1', false);
            else fail(new Error('no se pudo cargar la imagen'));
        };
        img.src = url;
    };

    const start = () => {
        if (started || failed) return;
        started = true;
        const opts = {
            interactive: true, strength: 1, radius: 130, density: 1, dotSize: 1, spread: 1, turbulence: 1,
            returnSpeed: 1, streaks: true, restStyle: 'image', ambient: true, ambientIntensity: 0.5, speed: 1,
            intro: false, reducedMotion: false, bg: scHexToRgb(cfg.background, [0.067, 0.067, 0.067]), imgBg: null, liquid: 1
        };
        try { engine = new LiquidEngine(canvas, opts, fail); } catch (e) { fail(e); return; }
        if (engine.lowPower) engine.opts.density = 0.6;
        // sombra de la cinta solo en equipos con potencia; la cinta se actualiza en cada cuadro
        engine.fx = !engine.lowPower;
        engine.onFrame = update;
        engine.onFirstFrame = () => { root.dataset.gl = 'on'; };
        engine.setVisible(false);
        layout();
        loadImage(src);
        requestFrame();
    };

    // La historia: la escultura entra desenrollada, como una cinta de fibras que se teje entre los
    // elementos de Servicios: pasa por detrás de unos (quedan por encima del canvas y la tapan por
    // completo) y por delante de otros, donde proyecta su sombra. Al llegar su sección baja a su
    // encuentro y se ata en el nudo, desde el centro hacia las puntas.
    const cells = services ? $$('.cell', services) : [];
    // en escritorio la tapan Landing pages, E-commerce y SEO; en pantallas angostas, una sí y una no
    const DESK_OVER = ['cell--a', 'cell--d', 'cell--e'];
    let wideLayout = null;
    const assignWeave = () => {
        const wide = window.innerWidth >= 1024;
        if (wide === wideLayout) return;
        wideLayout = wide;
        cells.forEach((el, i) => el.classList.toggle('is-over', wide ? DESK_OVER.some(k => el.classList.contains(k)) : i % 2 === 0));
    };
    assignWeave();
    const occ = new Float32Array(32), occF = new Float32Array(8);
    let sm = null, lastT = performance.now(), flowDrift = 0;
    function update() {
        if (!engine || failed) return;
        assignWeave();
        const vh = window.innerHeight, W = window.innerWidth;
        const rr = root.getBoundingClientRect();
        const sr = services ? services.getBoundingClientRect() : rr;
        const narrow = W < 700;
        const now = performance.now(), gap = now - lastT, dts = Math.min(0.1, Math.max(0, gap / 1000));
        lastT = now;
        // la línea se dibuja mientras Servicios entra en pantalla
        const fadeT = clamp((vh - sr.top) / (vh * 0.8), 0, 1);
        // se termina de atar justo cuando la sección llena la pantalla
        const G = clamp(1 - (rr.top - vh * 0.06) / (vh * 0.86), 0, 1);
        const spT = clamp((vh - sr.top) / (sr.height + vh * 0.5), 0, 1);
        // suavizado con inercia: la cinta sigue al scroll sin saltos
        if (!sm || gap > 400) sm = { sp: spT, fade: fadeT };
        const k = 1 - Math.exp(-dts * 6);
        sm.sp += (spT - sm.sp) * k;
        sm.fade += (fadeT - sm.fade) * k;
        const vr = viewRect(rr);
        // la cinta sube con Servicios, flota a media pantalla y baja a encontrarse con el nudo
        let yc = Math.max(vh * (0.52 + 0.08 * Math.sin(sm.sp * Math.PI * 2.4)), sr.top + vh * 0.42);
        yc = lerp(yc, vr.y + vr.h / 2, smooth(clamp(G / 0.6, 0, 1)));
        engine.setRibbon(
            yc,
            vh * (narrow ? 0.06 : 0.1),
            clamp(vh * 0.16, 64, 150) * (narrow ? 0.62 : 1),
            sm.sp * Math.PI * 3.2,
            -0.06 * W, 1.06 * W,
            narrow ? 0.75 : 1.15,
            narrow ? 1.1 : 1.6
        );
        // el material fluye de izquierda a derecha, con el tiempo y con el scroll
        flowDrift += dts * 0.03;
        engine.setFlow(flowDrift + sm.sp * 0.6, Math.max(sm.fade, G * 2) * 1.12, narrow ? 7 : 10);
        // tarjetas que cruza: las que la tapan y las que quedan detrás de ella
        let n = 0;
        if (sr.bottom > 0 && sr.top < vh) {
            for (const el of cells) {
                if (n >= 8) break;
                const r = el.getBoundingClientRect();
                if (r.bottom < -60 || r.top > vh + 60 || r.width < 2) continue;
                occ[n * 4] = r.left;
                occ[n * 4 + 1] = r.top;
                occ[n * 4 + 2] = r.width;
                occ[n * 4 + 3] = r.height;
                occF[n] = el.classList.contains('is-over') ? 0 : 1;
                n++;
            }
        }
        engine.setWeave(occ, occF, n);
        engine.setScatter(1 - G, sm.fade);
        engine.setRect(vr);
        const vis = sr.top < vh && rr.bottom > 0;
        if (vis !== shown) {
            shown = vis;
            engine.setVisible(vis && !document.hidden);
            canvas.classList.toggle('is-shown', vis);
        }
    }
    frameHooks.push(() => { if (!engine || !engine.running) update(); });
    document.addEventListener('visibilitychange', () => { if (engine) engine.setVisible(!!shown && !document.hidden); });

    const touched = () => { if (root.dataset.touched !== '1') root.dataset.touched = '1'; };
    const send = type => e => {
        if (!engine) return;
        engine.pointer(type, e.clientX, e.clientY, e.pointerType === 'touch');
        if (type === 'move' || type === 'down') touched();
    };
    root.addEventListener('pointermove', send('move'));
    root.addEventListener('pointerdown', send('down'));
    root.addEventListener('pointerup', send('up'));
    root.addEventListener('pointercancel', send('up'));
    root.addEventListener('pointerleave', send('leave'));
    // el polvo disperso se aparta del cursor mientras recorres Servicios
    if (FINE_POINTER) {
        window.addEventListener('pointermove', e => { if (engine) engine.setPointer(e.clientX, e.clientY, true); }, { passive: true });
        document.documentElement.addEventListener('mouseleave', () => { if (engine) engine.setPointer(-9999, -9999, false); });
    }

    // se prepara (imagen + partículas) un poco antes de llegar a Servicios
    new IntersectionObserver(([e], obs) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        start();
    }, { rootMargin: '150% 0px' }).observe(services || root);

    let rt = 0;
    const onResize = () => {
        cancelAnimationFrame(rt);
        rt = requestAnimationFrame(() => {
            const next = pickSrc();
            if (next !== src) {
                src = next;
                aspect = src === cfg.tall ? 1024 / 1300 : 1983 / 793;
                fallback.src = src;
                if (engine && !failed) loadImage(src);
            }
            layout();
            requestFrame();
        });
    };
    new ResizeObserver(onResize).observe(root);
    window.addEventListener('resize', onResize);
    if (window.innerWidth < 640) fallback.src = src;
    layout();
}

/* ═══════════════════════════════════════════
   MOTOR DE SCROLL (un listener pasivo + rAF, progreso suavizado)
   ═══════════════════════════════════════════ */
const pins = [];
let rafId = 0;
let lastY = window.scrollY;

function addPin(spacer, handlers) {
    const pin = {
        spacer, top: 0, dist: 1, ps: 0, first: true, last: -1,
        measure() {
            if (handlers.measure) handlers.measure();
            const r = spacer.getBoundingClientRect();
            pin.top = r.top + window.scrollY;
            pin.dist = Math.max(1, spacer.offsetHeight - window.innerHeight);
        },
        tick() {
            const raw = clamp((window.scrollY - pin.top) / pin.dist, 0, 1);
            if (pin.first) { pin.ps = raw; pin.first = false; }
            else pin.ps = lerp(pin.ps, raw, 0.2);
            if (Math.abs(pin.ps - raw) < 0.0006) pin.ps = raw;
            if (pin.ps !== pin.last) { handlers.update(pin.ps, raw); pin.last = pin.ps; }
            return pin.ps === raw;
        }
    };
    pins.push(pin);
    pin.measure();
    return pin;
}
function measure() { readNavH(); pins.forEach(p => p.measure()); }
function engineFrame() {
    rafId = 0;
    const y = window.scrollY, vh = window.innerHeight, vel = y - lastY;
    lastY = y;
    frameHooks.forEach(fn => fn(y, vh, vel));
    let settled = true;
    pins.forEach(pin => { if (!pin.tick()) settled = false; });
    if (!settled) rafId = requestAnimationFrame(engineFrame);
}
function requestFrame() { if (!rafId) rafId = requestAnimationFrame(engineFrame); }
function initEngine() {
    const bar = $('#progressBar');
    if (bar) frameHooks.push((y, vh) => {
        const max = document.documentElement.scrollHeight - vh;
        bar.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1).toFixed(4) : 0})`;
    });
    window.addEventListener('scroll', requestFrame, { passive: true });
    window.addEventListener('resize', () => { measure(); requestFrame(); });
    window.addEventListener('load', () => { measure(); requestFrame(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); requestFrame(); });
    if ('ResizeObserver' in window) {
        let t = 0;
        new ResizeObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(() => { measure(); requestFrame(); }); }).observe(document.body);
    }
    measure();
    requestFrame();
}

/* ═══════════════════════════════════════════
   HERO FIJADO: al hacer scroll atraviesas la luz
   ═══════════════════════════════════════════ */
function initHeroPin() {
    const spacer = $('[data-pin="hero"]');
    if (!spacer || REDUCED) return;
    const stage = $('#heroStage');
    addPin(spacer, {
        update(p) {
            stage.style.setProperty('--hp', p.toFixed(4));
            if (shared.heroShader) shared.heroShader.setZoom(1 + p * 1.6);
        }
    });
}

/* ═══════════════════════════════════════════
   SECUENCIA DE FRAMES (MacBook Neo)
   La imagen vertical se dibuja completa dentro de .fsh__slot para que se
   vea cómo suben todas las laptops. Al acercarte se abre un iris blanco.
   ═══════════════════════════════════════════ */
function initFrames() {
    const spacer = $('[data-pin="fsh"]'), stage = $('#fshStage'), canvas = $('#fshCanvas'), slot = $('#fshSlot');
    if (!spacer || !canvas || !slot) return;
    const ctx = canvas.getContext('2d');
    const cfg = CONFIG.frames;
    const every = MOBILE ? 3 : 2;
    const idxs = [];
    for (let i = 1; i <= cfg.count; i += every) idxs.push(i);
    const n = idxs.length;
    const eager = Math.min(cfg.eager, n);
    const cache = new Array(n);
    let loadedCount = 0, started = false;
    const loaderEl = $('#fshLoader'), loaderText = $('#fshLoaderText'), loaderFill = $('#fshLoaderFill');
    const cards = $$('.fsh__card', spacer);
    const ticks = cards.map(c => $$('.fsh__ticks span', c));
    const indexItems = $$('#fshIndex li');
    const sub = $('#fshSub'), bar = $('#fshProgress');
    const dpr = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
    let target = 0, display = 0, shown = -1, rafActive = false;
    let box = { x: 0, y: 0, w: 1, h: 1 };

    const ok = img => img && img.complete && img.naturalWidth > 0;
    // La parte superior de cada frame es blanca: se recorta para que las laptops
    // se vean grandes y completas, siempre dentro de la columna central.
    const CROP_TOP = 0.2, CROP_BOTTOM = 0.985;
    // Zoom suave: en los cuadros en reposo las laptops empiezan al 24 % de la altura.
    // Esa línea queda fija, así nada se recorta arriba y la pila crece hacia abajo y a los lados.
    const ZOOM = 1.12, ANCHOR_ROW = 0.24;
    const paint = img => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const visH = (CROP_BOTTOM - CROP_TOP) * ih;
        const s = Math.min(box.w / iw, box.h / visH);
        const w = iw * s, h = ih * s;
        const x = box.x + (box.w - w) / 2;
        const y = box.y + (box.h - visH * s) / 2 - CROP_TOP * h;
        const ax = box.x + box.w / 2, ay = y + ANCHOR_ROW * h;
        const zx = ax + (x - ax) * ZOOM, zy = ay + (y - ay) * ZOOM;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, zx * dpr, zy * dpr, w * ZOOM * dpr, h * ZOOM * dpr);
    };
    const draw = i => {
        let img = cache[i];
        if (!ok(img)) {
            img = null;
            for (let k = 1; k < n && !img; k++) {
                if (ok(cache[i - k])) img = cache[i - k];
                else if (ok(cache[i + k])) img = cache[i + k];
            }
            if (!img) return;
        }
        paint(img);
        shown = i;
    };
    const resize = () => {
        const cr = canvas.getBoundingClientRect(), sr = slot.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(cr.width * dpr));
        canvas.height = Math.max(1, Math.floor(cr.height * dpr));
        box = { x: sr.left - cr.left, y: sr.top - cr.top, w: Math.max(1, sr.width), h: Math.max(1, sr.height) };
        shown = -1;
        draw(clamp(Math.round(display), 0, n - 1));
    };
    const loadOne = i => {
        const img = new Image();
        img.decoding = 'async';
        const settle = () => {
            loadedCount++;
            const pct = Math.round((loadedCount / n) * 100);
            if (loaderText) loaderText.textContent = pct < 100 ? `Cargando · ${pct}%` : 'Listo';
            if (loaderFill) loaderFill.style.width = pct + '%';
            if (loadedCount === eager) {
                loaderEl.classList.add('is-done');
                for (let j = eager; j < n; j++) loadOne(j);
            }
            const want = clamp(Math.round(display), 0, n - 1);
            if (shown === -1 || i === want) draw(want);
        };
        img.onload = settle;
        img.onerror = settle;
        img.src = cfg.path(idxs[i]);
        cache[i] = img;
    };
    const begin = () => { if (started) return; started = true; for (let i = 0; i < eager; i++) loadOne(i); };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) begin(); }, { rootMargin: '150% 0px' }).observe(spacer);

    const loop = () => {
        if (rafActive) return;
        rafActive = true;
        const tick = () => {
            const diff = target - display;
            if (Math.abs(diff) < 0.08) display = target; else display += diff * 0.28;
            const idx = clamp(Math.round(display), 0, n - 1);
            if (idx !== shown) draw(idx);
            if (display !== target) requestAnimationFrame(tick); else rafActive = false;
        };
        requestAnimationFrame(tick);
    };

    resize();
    new ResizeObserver(resize).observe(canvas);
    if (REDUCED) { shared.fshOpen = true; begin(); cards.forEach(c => c.classList.add('is-active')); return; }

    // Iris: se abre al acercarte y se cierra al terminar la secuencia
    let irisFull = null;
    frameHooks.push((y, vh) => {
        const r = spacer.getBoundingClientRect();
        if (r.top > vh || r.bottom < 0) { shared.fshOpen = false; return; }
        const a = clamp(1 - r.top / vh, 0, 1);
        const dist = Math.max(1, spacer.offsetHeight - vh);
        const out = clamp((-r.top / dist - 0.93) / 0.07, 0, 1);
        const k = Math.min(Math.pow(a, 1.6), Math.pow(1 - out, 1.6));
        shared.fshOpen = k > 0.97;
        if (k >= 0.999) { if (irisFull !== true) { stage.style.clipPath = 'none'; irisFull = true; } return; }
        irisFull = false;
        const R = k * Math.hypot(stage.clientWidth / 2, stage.clientHeight / 2) * 1.02;
        stage.style.clipPath = `circle(${R.toFixed(1)}px at 50% 50%)`;
    });

    addPin(spacer, {
        measure: resize,
        update(p, raw) {
            target = raw * (n - 1);
            loop();
            if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
            if (sub) sub.classList.toggle('is-hidden', raw > 0.01);
            let idx = -1, local = 0;
            cfg.steps.forEach((s, i) => { if (p >= s.from && p < s.to) { idx = i; local = (p - s.from) / (s.to - s.from); } });
            cards.forEach((c, i) => {
                c.classList.toggle('is-active', i === idx);
                c.classList.toggle('is-prev', idx >= 0 && i < idx);
            });
            indexItems.forEach((li, i) => {
                li.classList.toggle('is-active', i === idx);
                li.classList.toggle('is-done', idx >= 0 && i < idx);
            });
            if (idx >= 0) ticks[idx].forEach((t, j) => { t.style.transform = `scaleX(${j < idx ? 1 : (j === idx ? clamp(local, 0, 1).toFixed(3) : 0)})`; });
        }
    });
}

/* ═══════════════════════════════════════════
   PROYECTOS: galería 3D que vuela hacia ti
   Los casos esperan en profundidad, en zigzag. Al hacer scroll avanzas por el
   pasillo: cada caso llega al frente y después pasa a tu lado y desaparece.
   ═══════════════════════════════════════════ */
function initWork() {
    const spacer = $('[data-pin="work"]');
    if (!spacer) return;
    const stage = $('#workStage'), head = $('#workHead'), floor = $('#workFloor');
    const cases = $$('[data-case]', spacer);
    const count = $('#workCount'), nameEl = $('#workName'), bar = $('#workProgress');
    const n = cases.length;
    if (!n) return;
    const colors = cases.map(c => c.style.getPropertyValue('--c').trim() || '#3d7bff');
    const names = cases.map(c => { const h = $('.case__name', c); return h ? h.textContent : ''; });
    if (REDUCED) { cases.forEach(c => c.classList.add('is-active')); return; }

    let current = -1, active = -2;
    const narrow = window.matchMedia('(max-width: 899px)');
    addPin(spacer, {
        update(p) {
            const intro = smooth(clamp(p / 0.1, 0, 1));
            const c = clamp((p - 0.1) / 0.82, 0, 1) * (n - 1);
            const spread = narrow.matches ? 0.4 : 1;
            // el título se aleja mientras el primer caso llega al frente
            const ho = 1 - smooth(clamp((p - 0.02) / 0.07, 0, 1));
            head.style.opacity = ho.toFixed(3);
            head.style.transform = `translate3d(0, ${(-(1 - ho) * 60).toFixed(1)}px, 0) scale(${(1 - (1 - ho) * 0.06).toFixed(3)})`;
            head.style.visibility = ho < 0.01 ? 'hidden' : '';
            let nearest = 0, best = 1e9;
            cases.forEach((el, i) => {
                const d = i - c + (1 - intro) * 1.25;
                const side = i % 2 ? 1 : -1;
                let x, y, z, ry, rx, op;
                if (d >= 0) {
                    // en espera: al fondo, alternando lados (más abajo mientras se lee el título)
                    z = -d * 950; x = side * d * 240 * spread; y = -d * 46 + (1 - intro) * 190; ry = -side * d * 15; rx = d * 3;
                    op = clamp(1.15 - d * 0.5, 0, 1);
                } else {
                    // ya visto: pasa junto a la cámara y se desvanece
                    z = -d * 1250; x = side * d * 120 * spread; y = d * 30; ry = side * d * 8; rx = -d * 6;
                    op = clamp(1 + d * 1.7, 0, 1);
                }
                el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
                el.style.opacity = op.toFixed(3);
                el.style.visibility = op < 0.01 ? 'hidden' : '';
                el.style.pointerEvents = Math.abs(d) < 0.4 ? '' : 'none';
                el.style.setProperty('--d', d.toFixed(3));
                if (Math.abs(d) < best) { best = Math.abs(d); nearest = i; }
            });
            if (nearest !== current) {
                current = nearest;
                if (count) count.textContent = String(nearest + 1).padStart(2, '0');
                if (nameEl) nameEl.textContent = names[nearest];
                stage.style.setProperty('--wc', colors[nearest]);
            }
            const act = best < 0.45 ? nearest : -1;
            if (act !== active) {
                active = act;
                cases.forEach((el, i) => el.classList.toggle('is-active', i === act));
            }
            if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
            if (floor) floor.style.setProperty('--fy', (p * 2200).toFixed(1) + 'px');
        }
    });

    // inclinación 3D del caso activo y paralaje de sus capas al mover el mouse
    if (FINE_POINTER) {
        let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
        const loop = () => {
            cx = lerp(cx, tx, 0.08);
            cy = lerp(cy, ty, 0.08);
            stage.style.setProperty('--mx', cx.toFixed(3));
            stage.style.setProperty('--my', cy.toFixed(3));
            if (Math.abs(cx - tx) > 0.001 || Math.abs(cy - ty) > 0.001) raf = requestAnimationFrame(loop); else raf = 0;
        };
        stage.addEventListener('pointermove', e => {
            const r = stage.getBoundingClientRect();
            tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
            ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
            if (!raf) raf = requestAnimationFrame(loop);
        });
        stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
    }
}

/* ═══════════════════════════════════════════
   PROCESO: horizontal con perspectiva en escritorio
   ═══════════════════════════════════════════ */
function initProcess() {
    const spacer = $('[data-pin="process"]');
    if (!spacer || REDUCED) return;
    const track = $('#processTrack'), bar = $('#processProgress'), steps = $$('[data-step]', spacer);
    const n = steps.length;
    if (!n) return;
    const mq = window.matchMedia('(min-width: 900px)');
    // ángulo entre tarjetas en el tambor
    const THETA = 42;
    steps.forEach((st, i) => st.style.setProperty('--k', i));
    // el giro se detiene un instante en cada tarjeta para poder leerla
    const dwell = x => x - 0.62 * Math.sin(2 * Math.PI * x) / (2 * Math.PI);
    const flat = () => {
        ['--R', '--theta', '--rot'].forEach(v => track.style.removeProperty(v));
        steps.forEach(st => {
            ['--sl', '--sr'].forEach(v => st.style.removeProperty(v));
            st.classList.remove('is-center');
            $('img', st).style.removeProperty('--px');
        });
    };
    addPin(spacer, {
        measure() {
            if (!mq.matches) { spacer.style.height = ''; flat(); return; }
            // radio para que las tarjetas vecinas no se encimen en la cara del cilindro
            const w = track.offsetWidth || 880;
            const gap = Math.max(36, w * 0.06);
            const R = (w + gap) / (2 * Math.sin((THETA * Math.PI) / 360));
            track.style.setProperty('--R', R.toFixed(1) + 'px');
            track.style.setProperty('--theta', THETA + 'deg');
            spacer.style.height = Math.round(window.innerHeight * (1 + (n - 1) * 0.9)) + 'px';
        },
        update(p) {
            if (!mq.matches) return;
            const x = p * (n - 1);
            const b = Math.min(Math.floor(x), n - 2);
            const k = n > 1 ? b + dwell(x - b) : 0;
            // girar el tambor hace que las tarjetas avancen de derecha a izquierda
            track.style.setProperty('--rot', (-k * THETA).toFixed(3) + 'deg');
            if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
            steps.forEach((st, i) => {
                const d = i - k;
                const ad = Math.abs(d);
                // luz: el borde que se aleja hacia el fondo del tambor se oscurece
                st.style.setProperty('--sl', (d < 0 ? Math.min(ad, 1.6) * 0.42 : ad * 0.08).toFixed(3));
                st.style.setProperty('--sr', (d > 0 ? Math.min(ad, 1.6) * 0.42 : ad * 0.08).toFixed(3));
                st.classList.toggle('is-center', ad < 0.35);
                $('img', st).style.setProperty('--px', (clamp(d, -1.2, 1.2) * 60).toFixed(1) + 'px');
            });
        }
    });
    mq.addEventListener('change', () => { measure(); requestFrame(); });
}

/* ═══════════════════════════════════════════
   TEMA DE LA NAVEGACIÓN, BLOQUE CLARO, MANIFIESTO, MURO DE TESTIMONIOS
   ═══════════════════════════════════════════ */
function initTheme() {
    const lights = $$('[data-theme-light]');
    if (!lights.length) return;
    frameHooks.push(() => {
        const on = lights.some(el => {
            if (el.id === 'nivel' && !shared.fshOpen) return false;
            const r = el.getBoundingClientRect();
            return r.top <= NAV_H && r.bottom >= NAV_H;
        });
        document.body.classList.toggle('theme-light', on);
    });
}

function initLightClip() {
    const light = $('#manifiesto');
    if (!light || REDUCED) return;
    light.style.setProperty('--lc', '1');
    let last = -1;
    frameHooks.push((y, vh) => {
        const r = light.getBoundingClientRect();
        if (r.top > vh || r.bottom < 0) return;
        const p = clamp((vh - r.top) / (vh * 0.85), 0, 1);
        const lc = Math.pow(1 - p, 2);
        if (Math.abs(lc - last) > 0.002) { last = lc; light.style.setProperty('--lc', lc.toFixed(3)); }
    });
}

function initManifesto() {
    const p = $('#manifesto');
    if (!p) return;
    const words = p.textContent.trim().split(/\s+/);
    p.innerHTML = words.map(w => `<span class="w">${w}</span>`).join(' ');
    const spans = $$('.w', p);
    if (REDUCED) { spans.forEach(s => s.classList.add('is-lit')); return; }
    let lit = -1;
    frameHooks.push((y, vh) => {
        const r = p.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const start = vh * 0.85, end = vh * 0.35;
        const prog = clamp((start - r.top) / (start - end + r.height), 0, 1);
        const count = Math.round(prog * spans.length);
        if (count === lit) return;
        lit = count;
        spans.forEach((s, i) => s.classList.toggle('is-lit', i < count));
    });
}

function initWall() {
    const wall = $('#wall');
    if (!wall) return;
    // cada columna se duplica para que el desplazamiento sea un ciclo continuo
    $$('.wall__col', wall).forEach(col => {
        Array.from(col.children).forEach(card => {
            const clone = card.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            col.appendChild(clone);
        });
        col.style.setProperty('--dur', (parseFloat(col.dataset.speed) || 44) + 's');
    });
    if (REDUCED) return;
    new IntersectionObserver(([e]) => wall.classList.toggle('is-idle', !e.isIntersecting), { rootMargin: '10% 0px' }).observe(wall);
    // el plano 3D se endereza mientras lo recorres
    let last = -1;
    frameHooks.push((y, vh) => {
        const r = wall.getBoundingClientRect();
        if (r.top > vh || r.bottom < 0) return;
        const t = clamp((vh - r.top) / (vh + r.height), 0, 1);
        if (Math.abs(t - last) > 0.002) { last = t; wall.style.setProperty('--wt', t.toFixed(3)); }
    });
}

/* ═══════════════════════════════════════════
   FAQ Y FORMULARIO → WHATSAPP
   ═══════════════════════════════════════════ */
function initFaq() {
    $$('.faq__item').forEach(item => {
        const summary = $('summary', item), body = $('.faq__body', item);
        if (!summary || !body) return;
        let busy = false;
        summary.addEventListener('click', e => {
            e.preventDefault();
            if (busy) return;
            if (REDUCED || !body.animate) { item.open = !item.open; return; }
            busy = true;
            const pad = getComputedStyle(body).paddingBottom;
            if (item.open) {
                const h = body.offsetHeight;
                body.animate([{ height: h + 'px', paddingBottom: pad, opacity: 1 }, { height: '0px', paddingBottom: '0px', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.65,0,.35,1)' })
                    .onfinish = () => { item.open = false; busy = false; };
            } else {
                item.open = true;
                const h = body.offsetHeight;
                body.animate([{ height: '0px', paddingBottom: '0px', opacity: 0 }, { height: h + 'px', paddingBottom: pad, opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' })
                    .onfinish = () => { busy = false; };
            }
        });
    });
}

function initForm() {
    const form = $('#contactForm');
    if (!form) return;
    const success = $('#formSuccess'), fallback = $('#formFallback');
    const f = { name: $('#fName'), biz: $('#fBiz'), type: $('#fType'), budget: $('#fBudget'), msg: $('#fMsg') };
    const rules = [[f.name, v => v.trim().length >= 2], [f.type, v => v !== ''], [f.msg, v => v.trim().length >= 10]];
    const validate = () => {
        let firstBad = null;
        rules.forEach(([el, test]) => {
            const ok = test(el.value);
            el.closest('.field').classList.toggle('is-invalid', !ok);
            if (!ok && !firstBad) firstBad = el;
        });
        if (firstBad) firstBad.focus();
        return !firstBad;
    };
    Object.values(f).forEach(el => {
        if (!el) return;
        ['input', 'change'].forEach(ev => el.addEventListener(ev, () => el.closest('.field').classList.remove('is-invalid')));
    });
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!validate()) return;
        const name = f.name.value.trim(), biz = f.biz.value.trim();
        const lines = [
            `Hola, Hello Web. Soy ${name}${biz ? ` de ${biz}` : ''}.`,
            `Necesito: ${f.type.value}.`,
            f.budget.value ? `Presupuesto estimado: ${f.budget.value}.` : '',
            `Mi idea: ${f.msg.value.trim()}`
        ].filter(Boolean);
        const url = waLink(lines.join('\n'));
        fallback.href = url;
        success.hidden = false;
        const win = window.open(url, '_blank');
        if (win) win.opener = null;
        form.reset();
        success.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
    });
}

/* ═══════════════════════════════════════════
   FOOTER: se revela por debajo y el logotipo gigante sube letra por letra
   ═══════════════════════════════════════════ */
function initFooter() {
    const footer = $('#footer'), main = $('#main'), giant = $('#footerGiant');
    if (!footer) return;
    const check = () => {
        const fits = !REDUCED && window.innerWidth >= 900 && footer.offsetHeight < window.innerHeight - 40;
        document.body.classList.toggle('footer-reveal', fits);
    };
    check();
    window.addEventListener('resize', check);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
    if (!giant || REDUCED) return;
    giant.style.setProperty('--fp', '0');
    let last = -1;
    frameHooks.push((y, vh) => {
        const g = giant.getBoundingClientRect();
        if (g.top > vh + 50) return;
        let fp;
        if (document.body.classList.contains('footer-reveal')) {
            const mb = main.getBoundingClientRect().bottom;
            fp = clamp((g.bottom - mb) / (g.height + 60), 0, 1);
        } else {
            fp = clamp((vh - g.top) / (g.height + vh * 0.12), 0, 1);
        }
        if (Math.abs(fp - last) > 0.002) { last = fp; giant.style.setProperty('--fp', fp.toFixed(3)); }
    });
}

/* ═══════════════════════════════════════════
   CARTEL QUE SE RASGA
   Basado en "Tiger Tear Reveal" (21st.dev), portado de React a JavaScript y
   adaptado a la marca. El scroll agrieta la palabra, el papel se rompe en dos,
   las mitades se separan y un tigre de ojos azules se asoma por el hueco.
   Sus ojos siguen al cursor, parpadean y se entrecierran al hacer clic.
   Todo es SVG generado con números: sin imágenes.
   ═══════════════════════════════════════════ */
const TT_CX = 500, TT_CY = 318, TT_FAR = 4000;
const TT_EYES = [[-138, 6], [138, -4]];
const TT_ALMOND = 'M-78 10 C-52 -40 30 -56 80 -8 C44 40 -30 50 -78 10Z';
const TT_CURLS = {
    top: [[300, 44, 30], [575, 30, 20], [790, 52, 34]],
    bottom: [[205, 50, 32], [470, 34, 22], [690, 40, 28]]
};

function ttRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const tt01 = x => (x <= 0 ? 0 : x > 1 ? 1 : x);
const ttStep = (a, b, x) => { const t = tt01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ttBack = t => { const c = 1.70158; const u = tt01(t) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const ttD = (pts, close = true) => 'M' + pts.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + (close ? 'Z' : '');
// un solo valor de scroll mueve cinco tiempos
const ttStages = p => ({
    crack: ttStep(0.03, 0.2, p),
    open: ttStep(0.18, 0.62, p),
    rise: ttStep(0.26, 0.74, p),
    pop: ttStep(0.58, 0.88, p),
    shake: ttStep(0.16, 0.22, p) * (1 - ttStep(0.26, 0.36, p))
});
function ttTearLine(seed = 11, from = -800, to = 1800, step = 9, cx = 500, cy = 318, angle = -7) {
    const r = ttRng(seed);
    const slope = Math.tan((angle * Math.PI) / 180);
    const out = [];
    for (let x = from; x <= to; x += step) {
        const fibre = (r() - 0.5) * 5;
        const tooth = r() < 0.09 ? (r() - 0.5) * 26 : 0;
        const wander = Math.sin(x * 0.019 + seed) * 10 + Math.sin(x * 0.053 + seed * 2) * 4;
        out.push([x, cy + (x - cx) * slope + wander + fibre + tooth]);
    }
    return out;
}
const ttPiece = open => ({
    top: { dx: -10 * open, dy: -82 * open, rot: -2.6 * open },
    bottom: { dx: 12 * open, dy: 78 * open, rot: 2.1 * open }
});
function ttFibres(n, open, seed) {
    const r = ttRng(seed);
    const k = Math.min(1, open * 4);
    return Array.from({ length: n }, (_, i) => k * (2.5 + 6 * (0.5 + 0.5 * Math.sin(i * 0.37 + seed)) * (0.6 + r() * 0.8)));
}
// ruido de valor determinista: bordes rugosos de las rayas sin filtros SVG costosos
function ttNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (i, j) => {
        let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
    return a + (b - a) * v;
}
const ttRough = (x, y) => [x + (ttNoise(x * 0.08, y * 0.08) - 0.5) * 9, y + (ttNoise(x * 0.08 + 37.1, y * 0.08 + 11.3) - 0.5) * 9];
function ttStripe(p0, p1, p2, w, n = 26) {
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, m = 1 - t;
        const x = m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0];
        const y = m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1];
        const dx = 2 * m * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
        const dy = 2 * m * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const l = Math.hypot(dx, dy) || 1;
        const h = (w / 2) * Math.pow(Math.sin(Math.PI * t), 0.6);
        left.push(ttRough(x - (dy / l) * h, y + (dx / l) * h));
        right.push(ttRough(x + (dy / l) * h, y - (dx / l) * h));
    }
    return ttD(left.concat(right.reverse()));
}
function ttBuildStripes() {
    const r = ttRng(29);
    const j = a => (r() - 0.5) * a;
    const out = [];
    for (const k of [-2, -1, 0, 1, 2]) {
        out.push(ttStripe([k * 27 + j(8), -205], [k * 21 + j(6), -140], [k * 11, -72 + Math.abs(k) * 10], 13 - Math.abs(k) * 2));
    }
    for (const sd of [-1, 1]) {
        out.push(ttStripe([sd * 50, -108], [sd * 138, -140 + j(8)], [sd * 228, -96], 13));
        out.push(ttStripe([sd * 72, -158], [sd * 150, -188 + j(8)], [sd * 250, -150], 11));
        for (const y of [-160, -104, -48, 14, 76, 138]) {
            out.push(ttStripe([sd * 350, y + j(10)], [sd * 292, y + j(26)], [sd * (222 + r() * 30), y + j(34)], 18 + r() * 8));
        }
        out.push(ttStripe([sd * 212, 38], [sd * 256, 72], [sd * 330, 98], 14));
        out.push(ttStripe([sd * 182, 74], [sd * 226, 120], [sd * 312, 156], 12));
        out.push(ttStripe([sd * 64, 22], [sd * 50, 88], [sd * 42, 178], 8));
        for (let k = 0; k < 16; k++) {
            const x = sd * (390 + k * 70 + j(30));
            out.push(ttStripe([x + j(40), -330], [x + sd * 30 + j(40), j(60)], [x + sd * 10 + j(40), 330], 20 + r() * 14));
        }
    }
    return out.join('');
}
function ttBuildHairs() {
    const r = ttRng(53);
    const tones = ['', '', ''];
    for (let i = 0; i < 2600; i++) {
        const x = (r() - 0.5) * 1900;
        const y = (r() - 0.5) * 480;
        const a = Math.atan2(y - 150, x) + (r() - 0.5) * 0.5;
        const l = 9 + r() * 12;
        const seg = 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + 'l' + (Math.cos(a) * l).toFixed(1) + ' ' + (Math.sin(a) * l).toFixed(1);
        tones[r() < 0.45 ? 0 : r() < 0.7 ? 1 : 2] += seg;
    }
    return tones;
}
function ttBuildFibres() {
    const r = ttRng(71);
    let out = '';
    for (let i = 0; i < 56; i++) {
        const a = (i / 56) * Math.PI * 2 + r() * 0.08;
        const r0 = 12 + r() * 4;
        const r1 = 30 + r() * 5;
        out += 'M' + (Math.cos(a) * r0).toFixed(1) + ' ' + (Math.sin(a) * r0).toFixed(1) + 'L' + (Math.cos(a) * r1).toFixed(1) + ' ' + (Math.sin(a) * r1).toFixed(1);
    }
    return out;
}

function initTear() {
    const spacer = $('[data-pin="tear"]');
    const stage = $('#tearStage'), art = $('#tearArt'), cta = $('#tearCta');
    if (!spacer || !stage || !art) return;
    const o = {
        tagline: 'OLVÍDATE DE LO', word: 'GENÉRICO',
        ink: '#2f6bff', paper: '#f1f1f3', tagColor: '#2a2a2a', fur: '#d9832c',
        font: "'Geist', ui-sans-serif, system-ui, sans-serif", mono: "'Geist Mono', ui-monospace, monospace"
    };
    const id = 'ttr';
    const line = ttTearLine();
    const hairs = ttBuildHairs();
    const fibres = ttBuildFibres();

    const sheet = `<rect x="${-TT_FAR}" y="${-TT_FAR}" width="${TT_FAR * 2 + 1000}" height="${TT_FAR * 2}" fill="${o.paper}"/>`
        + `<text x="${TT_CX}" y="150" text-anchor="middle" fill="${o.tagColor}" style="font:500 30px ${o.mono};letter-spacing:.42em">${o.tagline}</text>`
        + `<text x="${TT_CX}" y="404" text-anchor="middle" textLength="880" lengthAdjust="spacingAndGlyphs" fill="${o.ink}" style="font-family:${o.font};font-size:250px;font-weight:700;letter-spacing:0">${o.word}</text>`;
    const shapeTop = ttD([[line[0][0], -TT_FAR], [line[line.length - 1][0], -TT_FAR], ...line.slice().reverse()]);
    const shapeBot = ttD([...line, [line[line.length - 1][0], TT_FAR], [line[0][0], TT_FAR]]);
    const lineOpen = ttD(line, false);
    const half = side => `<g class="tt-half" data-side="${side}">`
        + `<g class="tt-shadow" opacity="0" transform="translate(0 ${side === 'top' ? 10 : -10})">`
        + `<path d="${lineOpen}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="40"/>`
        + `<path d="${lineOpen}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="24"/>`
        + `<path d="${lineOpen}" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="10"/></g>`
        + `<clipPath id="${id}-clip-${side}"><path d="${side === 'top' ? shapeTop : shapeBot}"/></clipPath>`
        + `<g clip-path="url(#${id}-clip-${side})">${sheet}</g>`
        + `<path class="tt-core" fill="#ffffff" d="M0 0"/>`
        + [0, 1, 2].map(() => `<path class="tt-curl" fill="url(#${id}-curl-${side})" stroke="#fff" stroke-width="1" d="M0 0"/>`).join('')
        + `</g>`;
    const eye = (i, x, y) => {
        const flip = i === 0;
        return `<g class="tt-eye" transform="translate(${x} ${y}) scale(${flip ? -0.9 : 0.9} 0.9)">`
            + `<ellipse class="tt-glow" rx="128" ry="84" fill="url(#${id}-glow)" opacity="0"/>`
            + `<clipPath id="${id}-almond${i}"><path d="${TT_ALMOND}"/></clipPath>`
            + `<path d="${TT_ALMOND}" fill="#0c0603" stroke="#0c0603" stroke-width="11" stroke-linejoin="round"/>`
            + `<path d="M-80 8 C-86 20 -96 30 -98 44 C-90 34 -80 24 -70 18Z" fill="#0c0603"/>`
            + `<g clip-path="url(#${id}-almond${i})">`
            + `<ellipse rx="80" ry="52" fill="#3d1a05"/>`
            + `<g class="tt-iris" transform="translate(0 4)">`
            + `<circle r="38" fill="url(#${id}-iris)"/>`
            + `<path d="${fibres}" stroke="#123080" stroke-width="1" opacity=".35"/>`
            + `<circle r="38" fill="none" stroke="#0a1640" stroke-width="3" opacity=".8"/>`
            + `<circle class="tt-pupil" r="16.9" fill="#050302"/>`
            + `<ellipse cx="-12" cy="-13" rx="7.5" ry="5.5" fill="#fff" opacity=".92"/>`
            + `<circle cx="9" cy="10" r="2.6" fill="#fff" opacity=".6"/>`
            + `</g>`
            + `<ellipse cy="-46" rx="90" ry="34" fill="url(#${id}-lid)"/>`
            + `<g class="tt-lid" transform="translate(0 10)"><rect x="-90" y="-80" width="180" height="80" fill="#9c5212"/><path d="M-90 0 H90" stroke="#0c0603" stroke-width="8"/></g>`
            + `</g></g>`;
    };
    const fur = `<rect x="-2600" y="-420" width="5200" height="840" fill="${o.fur}"/>`
        + `<rect x="-2600" y="-420" width="5200" height="840" fill="url(#${id}-shade)"/>`
        + `<rect x="-2600" y="-420" width="5200" height="840" fill="url(#${id}-vignette)"/>`
        + `<g fill="url(#${id}-patch)">`
        + TT_EYES.map(([x, y]) => `<ellipse cx="${x}" cy="${y - 52}" rx="98" ry="40"/><ellipse cx="${x}" cy="${y + 44}" rx="82" ry="32" opacity=".9"/>`).join('')
        + `<ellipse cx="0" cy="188" rx="116" ry="70" opacity=".85"/></g>`
        + `<path d="${ttBuildStripes()}" fill="#140b05"/>`
        + `<path d="${hairs[0]}" stroke="#3b1c07" stroke-width="1.4" opacity=".35" stroke-linecap="round"/>`
        + `<path d="${hairs[1]}" stroke="#f7c46e" stroke-width="1.2" opacity=".35" stroke-linecap="round"/>`
        + `<path d="${hairs[2]}" stroke="#fff6e4" stroke-width="1" opacity=".22" stroke-linecap="round"/>`;
    const defs = '<defs>'
        + `<linearGradient id="${id}-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1203" stop-opacity=".45"/><stop offset=".45" stop-color="#ffd08a" stop-opacity=".12"/><stop offset="1" stop-color="#2a1203" stop-opacity=".5"/></linearGradient>`
        + `<radialGradient id="${id}-vignette" cx=".5" cy=".5" r=".5" gradientTransform="translate(0.5 0.5) scale(0.25 1) translate(-0.5 -0.5)"><stop offset=".5" stop-color="#1a0a02" stop-opacity="0"/><stop offset="1" stop-color="#1a0a02" stop-opacity=".55"/></radialGradient>`
        + `<radialGradient id="${id}-iris"><stop offset="0" stop-color="#eef4ff"/><stop offset=".35" stop-color="#8ab4ff"/><stop offset=".78" stop-color="#2f63f0"/><stop offset="1" stop-color="#0b1a4d"/></radialGradient>`
        + `<radialGradient id="${id}-glow"><stop offset="0" stop-color="#5e95ff" stop-opacity=".6"/><stop offset=".5" stop-color="#3d7bff" stop-opacity=".22"/><stop offset="1" stop-color="#3d7bff" stop-opacity="0"/></radialGradient>`
        + `<radialGradient id="${id}-patch"><stop offset="0" stop-color="#fbf6ec"/><stop offset=".55" stop-color="#fbf6ec"/><stop offset="1" stop-color="#fbf6ec" stop-opacity="0"/></radialGradient>`
        + `<linearGradient id="${id}-lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`
        + `<linearGradient id="${id}-curl-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d4cb"/></linearGradient>`
        + `<linearGradient id="${id}-curl-bottom" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d4cb"/></linearGradient>`
        + '</defs>';
    art.insertAdjacentHTML('beforeend', `<svg viewBox="36 6 928 506" preserveAspectRatio="xMidYMid meet" focusable="false">${defs}`
        + `<g class="tt-shake">`
        + `<g class="tt-tiger" display="none">${fur}<g>${TT_EYES.map(([x, y], i) => eye(i, x, y)).join('')}</g></g>`
        + `<g class="tt-whole">${sheet}</g>`
        + `<g class="tt-halves" display="none">${half('top')}${half('bottom')}</g>`
        + `<path class="tt-crack" d="M0 0" fill="none" stroke="#1d0f07" stroke-width="2.4" stroke-linejoin="bevel" opacity="0"/>`
        + `</g></svg>`);

    const svg = $('svg', art);
    const q = sel => svg.querySelector(sel);
    const el = {
        shake: q('.tt-shake'), tiger: q('.tt-tiger'), whole: q('.tt-whole'), halves: q('.tt-halves'), crack: q('.tt-crack'),
        eyes: Array.from(svg.querySelectorAll('.tt-eye')).map(g => ({
            g, glow: g.querySelector('.tt-glow'), iris: g.querySelector('.tt-iris'), pupil: g.querySelector('.tt-pupil'), lid: g.querySelector('.tt-lid')
        }))
    };
    const H = {};
    svg.querySelectorAll('.tt-half').forEach(h => {
        H[h.dataset.side] = { g: h, shadow: h.querySelector('.tt-shadow'), core: h.querySelector('.tt-core'), curls: Array.from(h.querySelectorAll('.tt-curl')) };
    });
    // solo se escribe en el DOM lo que cambió
    const memo = new WeakMap();
    const setA = (node, name, val) => {
        let c = memo.get(node);
        if (!c) { c = {}; memo.set(node, c); }
        if (c[name] !== val) { c[name] = val; node.setAttribute(name, val); }
    };

    let lastOpen = -1;
    const updateHalves = open => {
        if (Math.abs(open - lastOpen) < 1e-4) return;
        lastOpen = open;
        const motion = ttPiece(open);
        ['top', 'bottom'].forEach(side => {
            const up = side === 'top';
            const mm = motion[side], P = H[side];
            setA(P.g, 'transform', `translate(${mm.dx.toFixed(2)} ${mm.dy.toFixed(2)}) rotate(${mm.rot.toFixed(3)} ${TT_CX} ${TT_CY})`);
            setA(P.shadow, 'opacity', Math.min(1, open * 3).toFixed(3));
            const widths = ttFibres(line.length, open, up ? 5 : 8);
            const core = line.concat(line.map(([x, y], i) => [x, y + (up ? -widths[i] : widths[i])]).reverse());
            setA(P.core, 'd', ttD(core));
            TT_CURLS[side].forEach(([cx, hw, depth], k) => {
                const pts = line.filter(([x]) => Math.abs(x - cx) <= hw);
                const back = pts.map(([x, y]) => {
                    const c = Math.cos(((x - cx) / hw) * (Math.PI / 2));
                    return [x + (up ? 6 : -6) * c * open, y + (up ? 1 : -1) * depth * c * c * Math.min(1, open * 2.5)];
                });
                setA(P.curls[k], 'd', ttD(pts.concat(back.reverse())));
            });
        });
    };

    let p = REDUCED ? 1 : 0;
    let look = [0, 0], idle = [0, 0], nextIdle = 0, nextBlink = performance.now() + 2500;
    let pointer = null, squintAt = -1e9, visible = false, raf = 0;
    const render = (blinkNow, squint) => {
        const st = ttStages(p);
        const pop = REDUCED ? st.pop : ttBack(st.pop);
        const eyeScale = 0.9 + 0.1 * pop;
        const pupil = 1.3 - 0.5 * st.pop + 0.35 * squint;
        // los ojos siguen cerrados hasta que el tigre sube, luego se abren
        const blink = Math.max(1 - tt01(pop), blinkNow, squint * 0.45);
        const rise = (1 - st.rise) * 150;
        const shake = REDUCED ? 0 : Math.sin(p * 900) * 6 * st.shake;
        setA(el.shake, 'transform', `translate(${shake.toFixed(2)} ${(shake * 0.4).toFixed(2)})`);
        const opened = st.open > 0;
        setA(el.whole, 'display', opened ? 'none' : 'inline');
        setA(el.halves, 'display', opened ? 'inline' : 'none');
        setA(el.tiger, 'display', opened ? 'inline' : 'none');
        if (opened) {
            setA(el.tiger, 'transform', `translate(${TT_CX} ${(TT_CY + rise).toFixed(2)}) rotate(-7) scale(${(1.34 - 0.06 * st.rise).toFixed(4)})`);
            updateHalves(st.open);
            el.eyes.forEach((e, i) => {
                const flip = i === 0;
                const [x, y] = TT_EYES[i];
                const lx = look[0] * (flip ? -1 : 1);
                setA(e.g, 'transform', `translate(${x} ${y}) scale(${(flip ? -eyeScale : eyeScale).toFixed(4)} ${eyeScale.toFixed(4)})`);
                setA(e.glow, 'opacity', (tt01(pop) * 0.95).toFixed(3));
                setA(e.iris, 'transform', `translate(${(lx * 13).toFixed(2)} ${(4 + look[1] * 7).toFixed(2)})`);
                setA(e.pupil, 'r', (13 * pupil).toFixed(2));
                setA(e.lid, 'transform', `translate(0 ${(-62 + blink * 72).toFixed(2)})`);
            });
        }
        // la grieta corre desde el centro de la palabra antes de romperse
        if (st.crack > 0 && st.open < 0.15) {
            const reach = st.crack * 620;
            const crack = line.filter(([x]) => Math.abs(x - TT_CX) <= reach);
            setA(el.crack, 'd', crack.length > 1 ? ttD(crack, false) : 'M0 0');
            setA(el.crack, 'opacity', (1 - st.open / 0.15).toFixed(3));
        } else setA(el.crack, 'opacity', '0');
        const co = REDUCED ? 1 : ttStep(0.8, 0.95, p);
        if (cta) {
            cta.style.setProperty('--co', co.toFixed(3));
            cta.classList.toggle('is-on', co > 0.5);
        }
    };

    const tick = now => {
        raf = 0;
        if (!visible) return;
        let want;
        if (pointer) {
            const r = stage.getBoundingClientRect();
            want = [
                clamp((pointer.x - r.left - r.width / 2) / (r.width * 0.35), -1, 1),
                clamp((pointer.y - r.top - r.height * 0.54) / (r.height * 0.35), -1, 1)
            ];
        } else {
            // sin cursor, la mirada vaga por su cuenta
            if (now > nextIdle) {
                const g = ttRng(Math.floor(now));
                idle = [(g() - 0.5) * 1.4, (g() - 0.5) * 0.8];
                nextIdle = now + 1400 + g() * 1800;
            }
            want = idle;
        }
        look = [look[0] + (want[0] - look[0]) * 0.14, look[1] + (want[1] - look[1]) * 0.14];
        let blink = 0;
        const since = now - nextBlink;
        if (since > 0) blink = since < 90 ? since / 90 : since < 200 ? 1 - (since - 90) / 110 : 0;
        if (since > 200) nextBlink = now + 2600 + Math.random() * 3200;
        const squint = Math.max(0, 1 - (now - squintAt) / 900);
        render(blink, squint);
        raf = requestAnimationFrame(tick);
    };

    render(0, 0);
    if (REDUCED) return;
    addPin(spacer, { update(ps) { p = ps; } });
    new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(tick);
    }).observe(stage);
    stage.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; });
    stage.addEventListener('pointerleave', () => { pointer = null; });
    stage.addEventListener('pointerdown', () => { if (ttStages(p).pop > 0.5) squintAt = performance.now(); });
}

/* ═══════════════════════════════════════════
   ARRANQUE
   ═══════════════════════════════════════════ */
function initYear() { const y = $('#year'); if (y) y.textContent = new Date().getFullYear(); }
function safe(fn) { try { fn(); } catch (err) { console.error('[hello web]', fn.name, err); } }

function boot() {
    safe(initSmoothScroll);
    safe(initLoader);
    safe(initWhatsApp);
    safe(initMarquee);
    safe(splitChars);
    safe(splitWords);
    safe(initNav);
    safe(initShaders);
    safe(initHeroSwap);
    safe(initHeroPointer);
    safe(initCursor);
    safe(initScramble);
    safe(initKinetic);
    safe(initReveal);
    safe(initScrub);
    safe(initParallax);
    safe(initTiltAndSpotlight);
    safe(initMagnetic);
    safe(initCounters);
    safe(initGauge);
    safe(initLazyVideo);
    safe(initHeroPin);
    safe(initRevealMask);
    safe(initSculpture);
    safe(initFrames);
    safe(initWork);
    safe(initProcess);
    safe(initTheme);
    safe(initLightClip);
    safe(initManifesto);
    safe(initWall);
    safe(initTear);
    safe(initFaq);
    safe(initForm);
    safe(initFooter);
    safe(initYear);
    safe(initEngine);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
