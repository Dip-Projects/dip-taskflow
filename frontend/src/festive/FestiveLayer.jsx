import { useEffect } from 'react';
import { isFestiveActive } from './festive';
import './festive.css';

const SPARK_COLORS = ['#FF9933', '#FFD54A', '#F59E0B', '#C0392B', '#138808', '#FFFFFF'];
const RIBBON_COLORS = ['#FF9933', '#FFD54A', '#E11D48', '#22C55E', '#3B82F6', '#A855F7', '#FFFFFF'];
const FIREWORK_COLORS = ['#FF4D6D', '#FFD54A', '#60A5FA', '#34D399', '#C084FC', '#FB923C'];
const SPARK_COUNT = 14;
const FIREWORK_SPARKS = 40;
const FIREWORK_DELAYS_MS = [0, 250, 500, 750, 1000, 1250, 1550, 1850, 2150];
const RIBBON_INTERVAL_MS = 150;
const RIBBON_DURATION_MS = 2500; // celebration stops this long after hovering starts
const MAX_RIBBONS = 60;
const HOVER_TARGETS =
  'button, .nav-section-toggle, [role="menuitem"], .sidebar a, .site-sidebar a, .hr-sidebar a, .cp-sidebar a';

// The diya lamp artwork.
const DIYA_SVG = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="festive-flame-grad" cx="50%" cy="80%" r="70%">
      <stop offset="0" stop-color="#FFF7AE" />
      <stop offset="0.45" stop-color="#FFB020" />
      <stop offset="1" stop-color="#F04E0C" />
    </radialGradient>
  </defs>
  <path class="festive-flame" d="M32 6 C25 16 22 23 32 33 C42 23 39 16 32 6Z" fill="url(#festive-flame-grad)" />
  <path class="festive-flame festive-flame-inner" d="M32 20 C29 25 28 28 32 32 C36 28 35 25 32 20Z" fill="#FFF7AE" />
  <ellipse cx="32" cy="34" rx="16" ry="4" fill="#7C2D12" />
  <path d="M8 36 Q32 58 56 36 Q50 44 32 46 Q14 44 8 36Z" fill="#B45309" />
  <path d="M14 40 Q32 50 50 40" stroke="#D97706" stroke-width="1.2" fill="none" />
</svg>`;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function burst(x, y) {
  const layer = document.createElement('div');
  layer.className = 'festive-burst';
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  for (let i = 0; i < SPARK_COUNT; i++) {
    const spark = document.createElement('span');
    const angle = (Math.PI * 2 * i) / SPARK_COUNT + Math.random() * 0.4;
    const dist = 28 + Math.random() * 30;
    spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    spark.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
    layer.appendChild(spark);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 800);
}

// "Happy Diwali" text that rises from the given point.
function greet(x, y) {
  const text = document.createElement('div');
  text.className = 'festive-greeting';
  text.textContent = 'Happy Diwali 🪔';
  text.style.left = `${x}px`;
  text.style.top = `${y}px`;
  document.body.appendChild(text);
  setTimeout(() => text.remove(), 2000);
}

// One falling streamer released from somewhere across the hovered element.
function releaseRibbon(el) {
  if (document.querySelectorAll('.festive-ribbon').length >= MAX_RIBBONS) return;
  const rect = el.getBoundingClientRect();
  const ribbon = document.createElement('span');
  ribbon.className = 'festive-ribbon';
  ribbon.style.left = `${rect.left + Math.random() * rect.width}px`;
  ribbon.style.top = `${rect.top + rect.height / 2}px`;
  ribbon.style.background = pick(RIBBON_COLORS);
  ribbon.style.setProperty('--sway', `${(Math.random() - 0.5) * 100}px`);
  ribbon.style.setProperty('--spin', `${(Math.random() - 0.5) * 720}deg`);
  ribbon.style.animationDuration = `${1.2 + Math.random() * 0.9}s`;
  document.body.appendChild(ribbon);
  setTimeout(() => ribbon.remove(), 2200);
}

// Circular burst of sparks in the sky.
function explode(x, y) {
  const layer = document.createElement('div');
  layer.className = 'festive-firework';
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  const color = pick(FIREWORK_COLORS);
  for (let i = 0; i < FIREWORK_SPARKS; i++) {
    const spark = document.createElement('span');
    const angle = (Math.PI * 2 * i) / FIREWORK_SPARKS;
    const radius = 160 + Math.random() * 120;
    spark.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
    spark.style.background = Math.random() < 0.25 ? '#FFFFFF' : color;
    spark.style.color = spark.style.background;
    layer.appendChild(spark);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1900);
}

// A rocket that climbs from the bottom of the screen, then bursts at (x, y).
function launchRocket(x, bottom, y) {
  const rocket = document.createElement('span');
  rocket.className = 'festive-rocket';
  rocket.style.left = `${x}px`;
  rocket.style.top = `${bottom}px`;
  rocket.style.setProperty('--rise', `${bottom - y}px`);
  document.body.appendChild(rocket);
  setTimeout(() => {
    rocket.remove();
    explode(x, y);
  }, 600);
}

// Several bursts across the sky, staggered, shown after a task is verified.
function fireworkShow() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  FIREWORK_DELAYS_MS.forEach((delay) => {
    setTimeout(() => {
      const x = width * (0.15 + Math.random() * 0.7);
      const y = height * (0.12 + Math.random() * 0.35);
      launchRocket(x, height, y);
    }, delay);
  });
}

// Puts the navbar garland just past the logo and brand text, so it does not
// sit on top of them. Each navbar gets its own --festive-inset value.
function layoutNavbars() {
  document.querySelectorAll('.topbar, .app-navbar').forEach((nav) => {
    const brand = nav.querySelector('.topbar-brand, .navbar-left');
    if (!brand) return;
    const inset = brand.getBoundingClientRect().right - nav.getBoundingClientRect().left + 14;
    nav.style.setProperty('--festive-inset', `${Math.max(0, inset)}px`);
  });
}

function onDiyaClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  burst(x, y);
  greet(x, y);
}

// The diya lamp in the bottom-right corner. Its flame flickers through CSS in festive.css.
function Diya() {
  return (
    <button
      type="button"
      className="festive-diya"
      aria-label="Happy Diwali"
      title="Happy Diwali"
      onClick={onDiyaClick}
      dangerouslySetInnerHTML={{ __html: DIYA_SVG }}
    />
  );
}

// Renders the bottom-right diya and, during the Diwali window, adds the
// festive-diwali class to <html>, the cracker cursor, the click blast, ribbon
// streamers on hover, the fireworks, and the navbar garland placement.
export default function FestiveLayer() {
  const active = isFestiveActive();

  useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let hovered = null;
    let interval = null;
    let stopTimer = null;
    let layoutFrame = null;

    const endCelebration = () => {
      clearInterval(interval);
      interval = null;
    };

    const stopRibbons = () => {
      endCelebration();
      clearTimeout(stopTimer);
      stopTimer = null;
      hovered = null;
    };

    const onPointerDown = (e) => {
      // The diya has its own click burst, so skip the general one for it.
      if (e.button !== 0 || reduceMotion || e.target.closest?.('.festive-diya')) return;
      burst(e.clientX, e.clientY);
    };

    const onPointerOver = (e) => {
      if (reduceMotion) return;
      const target = e.target.closest?.(HOVER_TARGETS) || null;
      if (target === hovered) return;
      stopRibbons();
      if (!target) return;
      hovered = target;
      for (let i = 0; i < 3; i++) releaseRibbon(target);
      interval = setInterval(() => {
        if (!document.contains(hovered)) return stopRibbons();
        releaseRibbon(hovered);
      }, RIBBON_INTERVAL_MS);
      // Stop after a short celebration. `hovered` stays set, so moving within
      // the same element does not restart it.
      stopTimer = setTimeout(endCelebration, RIBBON_DURATION_MS);
    };

    const scheduleLayout = () => {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        layoutNavbars();
      });
    };

    const observer = new MutationObserver(scheduleLayout);

    root.classList.add('festive-diwali');
    layoutNavbars();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleLayout);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerover', onPointerOver);
    // Dispatched by the verify actions in the Taskflow pages after a task is verified.
    const onVerified = () => {
      if (!reduceMotion) fireworkShow();
    };
    window.addEventListener('festive:verified', onVerified);
    root.addEventListener('pointerleave', stopRibbons);
    return () => {
      root.classList.remove('festive-diwali');
      observer.disconnect();
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      window.removeEventListener('resize', scheduleLayout);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerover', onPointerOver);
      window.removeEventListener('festive:verified', onVerified);
      root.removeEventListener('pointerleave', stopRibbons);
      stopRibbons();
    };
  }, [active]);

  return active ? <Diya /> : null;
}
