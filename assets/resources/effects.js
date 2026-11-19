/* ================================================================
   CREEPERMINION ARMORY — SUBTLE ATMOSPHERIC DUST

   HOW TO CUSTOMIZE:
   Edit only the DUST settings below for most changes.
   This file is independent of script.js and weapons.json.

   Layer order: room -> dust -> dimmer -> guns -> information panel.
   The canvas ignores pointer events, so gun interactions still work.
   ================================================================ */

(() => {
  'use strict';

  const DUST = {
    maxParticles: 22,       // Target count on a full desktop-sized scene
    minParticles: 8,        // Don't overcrowd a narrow mobile scene
    densityReference: 1400 * 800, // CSS px area at which maxParticles applies
    minRadius: 0.8,        // Particle radius, CSS pixels
    maxRadius: 2.3,
    minOpacity: 0.09,     // 0 = invisible, 1 = fully opaque
    maxOpacity: 0.17,
    minFallSpeed: 3,       // CSS pixels per second
    maxFallSpeed: 11,
    horizontalDrift: 3,    // Max sideways drift, CSS pixels per second
    color: '205, 226, 241', // RGB string; faint blue-white
  };

  const scene = document.getElementById('scene');
  if (!scene) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return; // Respect visitor motion preference.

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = [
    'position:absolute',
    'inset:0',
    'width:100%',
    'height:100%',
    'z-index:0',       // Above #room, below #dimmer (z-index:1)
    'pointer-events:none',
    'display:block',
  ].join(';');

  // Insert immediately after the image, without changing the scene HTML.
  const room = scene.querySelector('#room');
  if (room) room.after(canvas);
  else scene.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { canvas.remove(); return; }

  let width = 0;
  let height = 0;
  let particles = [];
  let frame = 0;
  let lastTime = 0;
  let enabled = true;

  const random = (min, max) => min + Math.random() * (max - min);

  function createParticle(fromTop = false) {
    return {
      x: random(0, width),
      y: fromTop ? random(-25, 0) : random(0, height),
      radius: random(DUST.minRadius, DUST.maxRadius),
      alpha: random(DUST.minOpacity, DUST.maxOpacity),
      vy: random(DUST.minFallSpeed, DUST.maxFallSpeed),
      vx: random(-DUST.horizontalDrift, DUST.horizontalDrift),
      phase: random(0, Math.PI * 2),
    };
  }

  function resize() {
    const rect = scene.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width <= 0 || height <= 0) return;

    // High-DPI canvases stay crisp while coordinates remain CSS pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.max(
      DUST.minParticles,
      Math.min(DUST.maxParticles,
        Math.round((width * height / DUST.densityReference) * DUST.maxParticles))
    );
    particles = Array.from({ length: count }, () => createParticle());
  }

  function animate(time) {
    if (!enabled) return;
    // Limit the time step after returning from a background browser tab.
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      let p = particles[i];
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(time * 0.0003 + p.phase) * 1.1) * dt;
      if (p.y > height + 10 || p.x < -10 || p.x > width + 10) {
        particles[i] = p = createParticle(true);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${DUST.color}, ${p.alpha})`;
      ctx.fill();
    }

    frame = requestAnimationFrame(animate);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function start() {
    if (enabled && !document.hidden && !frame) {
      frame = requestAnimationFrame(animate);
    }
  }

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(scene);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  reducedMotion.addEventListener('change', event => {
    enabled = !event.matches;
    if (!enabled) {
      stop();
      ctx.clearRect(0, 0, width, height);
    } else start();
  });
  start();
})();
