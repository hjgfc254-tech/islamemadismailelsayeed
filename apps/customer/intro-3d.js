/**
 * MODULE: intro-3d (V9 cinematic intro layer)
 * A genuine 3D scene behind the existing Customer intro (#intro): a slowly unfolding emerald "mashrabiya" lattice of
 * eight-point stars on a dome, champagne dust and a sweeping light, choreographed with GSAP.
 * Contract with the existing controller (apps/customer/app.js → Intro):
 *   • additive only — the DOM/CSS intro still works without this file (offline, no WebGL, script error);
 *   • starts when Intro adds `.go`, accelerates its exit on `.skip`, disposes itself when Intro removes #intro;
 *   • does nothing under prefers-reduced-motion, when the intro is not shown (`.no-intro`) or without WebGL.
 * Libraries are vendored and pinned: three@0.160.0 (MIT), gsap@3.12.5 (global `gsap`, loaded by index.html).
 * STATUS: IMPLEMENTED (FRONTEND VISUAL)
 */
const root = document.documentElement;
const intro = document.getElementById('intro');
const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();

if (intro && !root.classList.contains('no-intro') && !reduced && webgl) {
  import('../../assets/vendor/three.module.min.js').then(THREE => start(THREE)).catch(() => { /* CSS intro remains */ });
}

function start(THREE) {
  if (!intro.isConnected) return;
  const host = intro.querySelector('.in-fx') || intro;
  const canvas = document.createElement('canvas');
  canvas.className = 'in-3d';
  canvas.setAttribute('aria-hidden', 'true');
  intro.insertBefore(canvas, intro.firstChild);

  const small = innerWidth < 600;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b3e38, 0.075);
  const camera = new THREE.PerspectiveCamera(small ? 62 : 50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0.6, 16);

  /* Lattice: instanced eight-point stars on a dome (Egyptian mashrabiya motif) */
  const star = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = i % 2 ? 0.42 : 1;
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(star, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({ color: 0x135049, metalness: 0.55, roughness: 0.32, emissive: 0x0b3e38, emissiveIntensity: 0.35, transparent: true, opacity: 0 });
  const rings = small ? 4 : 6, perRing = small ? 18 : 26, count = rings * perRing;
  const lattice = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    const radius = 3.2 + r * 1.15, z = -r * 0.9;
    for (let i = 0; i < perRing; i++) {
      const a = (i / perRing) * Math.PI * 2 + r * 0.21;
      p.set(Math.cos(a) * radius, Math.sin(a) * radius, z);
      q.setFromUnitVectors(up, p.clone().setZ(z - 6).normalize().negate());
      const sc = 0.28 + (r / rings) * 0.22;
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      lattice.setMatrixAt(k++, m4);
    }
  }
  scene.add(lattice);

  /* Champagne dust */
  const dustN = small ? 260 : 520, pos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = (Math.random() - 0.5) * 18; pos[i * 3 + 2] = -Math.random() * 18 + 4; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xf1eadd, size: small ? 0.06 : 0.05, transparent: true, opacity: 0, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* Light: ambient emerald wash + a sweeping warm key light */
  scene.add(new THREE.HemisphereLight(0xaaf4e6, 0x0b3e38, 0.55));
  const key = new THREE.PointLight(0xf1eadd, 0, 40, 1.6);
  key.position.set(-8, 4, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xd17d32, 0, 30, 2);
  rim.position.set(7, -3, 2);
  scene.add(rim);

  const state = { spin: 0, unfold: 0 };
  let raf = 0, alive = true, tl = null, last = performance.now();

  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize);

  function frame(now) {
    if (!alive) return;
    if (!intro.isConnected) { dispose(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    lattice.rotation.z += dt * (0.08 + state.spin);
    lattice.rotation.x = -0.35 + state.unfold * 0.35;
    dust.rotation.z -= dt * 0.02;
    camera.lookAt(0, 0, -2);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function choreograph() {
    const g = window.gsap;
    if (!g) {                                   // no GSAP: simple timed reveal
      mat.opacity = 1; dustMat.opacity = 0.8; key.intensity = 60; rim.intensity = 18; state.unfold = 1;
      return;
    }
    tl = g.timeline({ defaults: { ease: 'power3.out' } });
    tl.to(mat, { opacity: 1, duration: 1.1 }, 0)
      .to(dustMat, { opacity: 0.85, duration: 1.4 }, 0.1)
      .to(camera.position, { z: small ? 9.5 : 8, y: 0, duration: 3.2, ease: 'power2.inOut' }, 0)
      .to(state, { unfold: 1, duration: 2.4, ease: 'expo.out' }, 0.3)
      .to(key, { intensity: 60, duration: 1.2 }, 0.2)
      .to(key.position, { x: 8, y: -2, duration: 3.2, ease: 'sine.inOut' }, 0.2)
      .to(rim, { intensity: 18, duration: 1.4 }, 0.8)
      .to(state, { spin: 0.55, duration: 0.6, ease: 'power2.in' }, 2.9)
      .to(camera.position, { z: 3.2, duration: 0.7, ease: 'power3.in' }, 3.0)
      .to(mat, { opacity: 0, duration: 0.5, ease: 'power1.in' }, 3.2)
      .to(dustMat, { opacity: 0, duration: 0.5 }, 3.2);
  }

  function skip() {
    if (tl) tl.kill();
    const g = window.gsap;
    if (g) { g.to([mat, dustMat], { opacity: 0, duration: 0.25 }); g.to(camera.position, { z: 3, duration: 0.25 }); }
  }

  function dispose() {
    alive = false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    if (tl) tl.kill();
    obs.disconnect();
    geo.dispose(); mat.dispose(); dustGeo.dispose(); dustMat.dispose();
    renderer.dispose();
    canvas.remove();
  }

  // Follow the existing controller's state classes (.go / .skip); removal is detected per frame.
  let started = false;
  const sync = () => {
    if (!started && intro.classList.contains('go')) { started = true; choreograph(); }
    if (intro.classList.contains('skip')) skip();
  };
  const obs = new MutationObserver(sync);
  obs.observe(intro, { attributes: true, attributeFilter: ['class'] });
  sync();
  raf = requestAnimationFrame(frame);
  void host;
}
