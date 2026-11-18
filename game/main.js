// SOLMARIS — an original open-world 3D coastal-city crime game.
// Sunset island city, chase camera, stealable cars, 6 missions, wanted system,
// police + helicopter searchlight, combat, cash economy, BUSTED / WASTED + Continue.
// All names, art, sound and story are original. three.js r152 vendored, no network.
'use strict';

// ---------------------------------------------------------------- constants
const WORLD = 280;            // half-size of the playable square
const AVENUES = [-160, -80, 0, 80, 160];
const STREETS = [-240, -160, -80, 0, 80, 160, 240];
const NORTH_DROPOFF = { x: 0, z: -210 };       // mission drop-off point
const PARKING_GARAGE = { x: 175, z: -105 };    // parking garage point
const HARBOR = { x: 210, z: -205 };            // harbor zone centre
const BANK = { x: 80, z: 80 };
const SAFEHOUSE = { x: -120, z: 160 };
const M4_MARK = { x: 40, z: 0 };
const SAVE_KEY = 'solmaris-save-v8';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261118);

// ---------------------------------------------------------------- audio (WebAudio, all synthesized, no files)
const AudioSys = {
  ctx: null, master: null, muted: false, engineOsc: null, engineOsc2: null,
  engineGain: null, sirenOsc: null, sirenGain: null, rotorGain: null, rotorSrc: null,
  started: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // engine: two detuned saws through a lowpass, gain driven by speed
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 28;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
    this.engineOsc.connect(lp); this.engineOsc2.connect(g2); g2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
    // police siren: two-tone oscillator, LFO flips frequency
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 750;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.9;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 220;
    lfo.connect(lfoG); lfoG.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); lfo.start();
    // helicopter rotor: looped noise through bandpass, amplitude wobble
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.rotorSrc = this.ctx.createBufferSource(); this.rotorSrc.buffer = buf; this.rotorSrc.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.8;
    this.rotorGain = this.ctx.createGain(); this.rotorGain.gain.value = 0;
    const rlfo = this.ctx.createOscillator(); rlfo.frequency.value = 13;
    const rlfoG = this.ctx.createGain(); rlfoG.gain.value = 0.05;
    rlfo.connect(rlfoG); rlfoG.connect(this.rotorGain.gain);
    this.rotorSrc.connect(bp); bp.connect(this.rotorGain); this.rotorGain.connect(this.master);
    this.rotorSrc.start(); rlfo.start();
    this.started = true;
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.11 : 0, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 190, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(26 + speed01 * 95, t, 0.05);
  },
  setSiren(on) { if (this.ctx) this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2); },
  setRotor(on) { if (this.ctx) this.rotorGain.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.3); },
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  },
  gunshot() { this.noise(0.16, 0.5, 2600); this.blip(140, 0.12, 'sine', 0.35, 45); },
  punch() { this.blip(160, 0.12, 'sine', 0.4, 55); this.noise(0.06, 0.2, 900); },
  pickup() { this.blip(660, 0.09, 'sine', 0.22); setTimeout(() => this.blip(880, 0.12, 'sine', 0.22), 80); },
  missionDone() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.25), i * 110)); },
  busted() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.18), i * 160)); },
  click() { this.blip(900, 0.05, 'square', 0.12); },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
    document.getElementById('muteBtn').textContent = m ? '🔇 Sound: OFF' : '🔊 Sound: ON';
  },
};

// ---------------------------------------------------------------- three.js setup
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff8a4d);
scene.fog = new THREE.Fog(0xff9a5c, 180, 620);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 8, 18);

const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a1a4a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
sun.position.set(-180, 90, -120); // low sun over the ocean, west
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
sun.shadow.camera.far = 800;
scene.add(sun);
// visible sun disc + glow
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(26, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
sunMesh.position.set(-420, 95, -260); scene.add(sunMesh);
const sunGlow = new THREE.Mesh(
  new THREE.SphereGeometry(42, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.35, fog: false }));
sunGlow.position.copy(sunMesh.position); scene.add(sunGlow);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- world building
const world = new THREE.Group(); scene.add(world);
const colliders = []; // {x,z,r} circles + {x,z,hx,hz} boxes for buildings

function box(w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...(opts || {}) }));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  world.add(m);
  return m;
}
function makeWindowTexture(base, lit) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) for (let x = 10; x < 118; x += 20) {
    g.fillStyle = rng() < 0.45 ? lit : 'rgba(20,16,40,0.9)';
    g.fillRect(x, y, 12, 14);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const buildingTextures = [
  makeWindowTexture('#e8b48a', '#ffe9a8'),
  makeWindowTexture('#c98f7a', '#ffd27a'),
  makeWindowTexture('#8fa8c9', '#bfe8ff'),
  makeWindowTexture('#d9c9a8', '#fff2c9'),
];

function buildCity() {
  // ground: grass/asphalt base
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2 + 120, WORLD * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x6f7d5a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  // beach (west) + ocean
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(70, WORLD * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9a }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(-WORLD - 35, 0.02, 0); beach.receiveShadow = true; world.add(beach);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, WORLD * 2 + 400),
    new THREE.MeshLambertMaterial({ color: 0x2a6f9e, transparent: true, opacity: 0.96 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(-WORLD - 70 - 210, 0.05, 0); world.add(ocean);
  // roads
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2e38 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  for (const x of AVENUES) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(14, WORLD * 2), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.06, 0); r.receiveShadow = true; world.add(r);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(20, WORLD * 2), walkMat);
    w.rotation.x = -Math.PI / 2; w.position.set(x, 0.04, 0); w.receiveShadow = true; world.add(w);
  }
  for (const z of STREETS) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, 14), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0.06, z); r.receiveShadow = true; world.add(r);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, 20), walkMat);
    w.rotation.x = -Math.PI / 2; w.position.set(0, 0.04, z); w.receiveShadow = true; world.add(w);
  }
  // road centre dashes
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd94a });
  for (const x of AVENUES) for (let z = -WORLD + 10; z < WORLD; z += 16) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5), dashMat);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.09, z); world.add(d);
  }
  // buildings inside blocks (skip road corridors and special zones)
  const palette = [0xd9a066, 0xc97f6a, 0x7a9cc6, 0xbfae8a, 0xa88ab5, 0x8fb5a0];
  for (let bx = -240; bx <= 240; bx += 80) {
    for (let bz = -240; bz <= 240; bz += 80) {
      const cx = bx + 40, cz = bz + 40;
      // skip harbor zone, beach, garage lot, drop-off plaza
      if (cx > 150 && cz < -140) continue;
      if (cx < -200) continue;
      if (Math.abs(cx - PARKING_GARAGE.x) < 45 && Math.abs(cz - PARKING_GARAGE.z) < 45) continue;
      if (Math.abs(cx - BANK.x) < 45 && Math.abs(cz - BANK.z) < 45) continue;
      const n = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const w = 16 + rng() * 14, d = 16 + rng() * 14, h = 12 + rng() * 46;
        const ox = cx + (rng() - 0.5) * (56 - w), oz = cz + (rng() - 0.5) * (56 - d);
        const tex = buildingTextures[Math.floor(rng() * buildingTextures.length)];
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ map: tex, color: palette[Math.floor(rng() * palette.length)] }));
        m.position.set(ox, h / 2, oz); m.castShadow = true; m.receiveShadow = true;
        world.add(m);
        colliders.push({ x: ox, z: oz, hx: w / 2 + 0.6, hz: d / 2 + 0.6 });
        // rooftop AC box
        if (rng() < 0.6) box(4, 2, 4, 0x666677, ox + w / 4, h + 1, oz, {});
      }
    }
  }
  // landmark: parking garage (multi-storey, open) at (175,-105)
  const garage = box(34, 16, 26, 0x8a8f9e, PARKING_GARAGE.x, 8, PARKING_GARAGE.z, {});
  box(36, 1.5, 28, 0x5a5f6e, PARKING_GARAGE.x, 16.5, PARKING_GARAGE.z, {});
  const garageSign = makeSign('PARKING', 0x2aff7a);
  garageSign.position.set(PARKING_GARAGE.x, 19, PARKING_GARAGE.z); world.add(garageSign);
  colliders.push({ x: PARKING_GARAGE.x, z: PARKING_GARAGE.z, hx: 18, hz: 14 });
  // landmark: bank at (80,80)
  box(26, 20, 20, 0xd9c9a8, BANK.x, 10, BANK.z, {});
  box(28, 2, 22, 0x8a7a5a, BANK.x, 21, BANK.z, {});
  const bankSign = makeSign('SOLMARIS BANK', 0xffd94a);
  bankSign.position.set(BANK.x, 24, BANK.z); world.add(bankSign);
  colliders.push({ x: BANK.x, z: BANK.z, hx: 14, hz: 11 });
  // landmark: north drop-off plaza (0,-210) — neon arch + pad
  const pad = new THREE.Mesh(new THREE.CircleGeometry(14, 32),
    new THREE.MeshLambertMaterial({ color: 0x4a4a5e }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(NORTH_DROPOFF.x, 0.1, NORTH_DROPOFF.z); world.add(pad);
  const archMat = new THREE.MeshBasicMaterial({ color: 0x2affc9 });
  const archL = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), archMat);
  archL.position.set(-9, 6, NORTH_DROPOFF.z); world.add(archL);
  const archR = archL.clone(); archR.position.x = 9; world.add(archR);
  const archT = new THREE.Mesh(new THREE.BoxGeometry(19, 1.2, 1), archMat);
  archT.position.set(0, 12, NORTH_DROPOFF.z); world.add(archT);
  const dropSign = makeSign('NORTH DROP-OFF', 0x2affc9);
  dropSign.position.set(0, 15, NORTH_DROPOFF.z); world.add(dropSign);
  // harbor: containers, cranes, dock at east-south
  buildHarbor();
  // palm trees along beach + avenue
  for (let z = -260; z <= 260; z += 26) {
    if (rng() < 0.85) makePalm(-252 + rng() * 8, z + rng() * 8);
    if (rng() < 0.5) makePalm(168 + rng() * 6, z + rng() * 10);
  }
  for (const x of AVENUES) for (let z = -220; z <= 220; z += 80) {
    if (rng() < 0.4) makePalm(x + 11, z + 6);
  }
  // street lamps
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const x of AVENUES) for (const z of STREETS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a3a44 }));
    pole.position.set(x + 8, 3.5, z + 8); pole.castShadow = true; world.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), lampMat);
    bulb.position.set(x + 8, 7.2, z + 8); world.add(bulb);
  }
}
function makeSign(text, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(10,8,24,0.9)'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 2),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
  return m;
}
function makePalm(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 7),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  trunk.position.y = 4.5; trunk.rotation.z = (rng() - 0.5) * 0.14; trunk.castShadow = true; g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.5, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.8, 9.4, Math.sin(a) * 1.8);
    leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    leaf.castShadow = true; g.add(leaf);
  }
  g.position.set(x, 0, z); world.add(g);
  colliders.push({ x, z, r: 0.9 });
}
function buildHarbor() {
  // dock platform
  const dock = new THREE.Mesh(new THREE.BoxGeometry(110, 2, 90),
    new THREE.MeshLambertMaterial({ color: 0x7a7468 }));
  dock.position.set(215, 1, -205); dock.receiveShadow = true; world.add(dock);
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(120, 100),
    new THREE.MeshLambertMaterial({ color: 0x1e5f8a }));
  water2.rotation.x = -Math.PI / 2; water2.position.set(290, 0.4, -205); world.add(water2);
  // containers
  const cCols = [0xd94a4a, 0x4a7ad9, 0x4ad97a, 0xd9a44a, 0x9a4ad9];
  for (let i = 0; i < 14; i++) {
    const w = 12, h = 2.6 + rng() * 2.4, d = 2.6;
    const x = 175 + (i % 5) * 14 + rng() * 3, z = -240 + Math.floor(i / 5) * 12 + rng() * 3;
    const c = box(w, h, d, cCols[i % cCols.length], x, 2 + h / 2, z, {});
    c.rotation.y = (rng() - 0.5) * 0.1;
    colliders.push({ x, z, hx: 6.5, hz: 2 });
  }
  // cranes
  for (const [cx, cz] of [[185, -170], [245, -235]]) {
    box(3, 26, 3, 0xd9a44a, cx, 13, cz, {});
    const arm = box(26, 2, 2, 0xd9a44a, cx + 10, 25, cz, {});
    arm.rotation.z = 0.06;
    box(4, 3, 4, 0x333333, cx + 20, 23, cz, {});
  }
  const hSign = makeSign('SOLMARIS HARBOR', 0x4ad9ff);
  hSign.position.set(215, 30, -168); world.add(hSign);
}
buildCity();

// ---------------------------------------------------------------- vehicles
const CAR_COLORS = [0xd94a4a, 0x4a7ad9, 0xd9a44a, 0x7ad94a, 0xd94ab5, 0xeeeeee, 0x222226, 0x4ad9c9];
function makeCar(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a22 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0x222230 : 0x1a2436 }));
  cabin.position.set(0, 1.18, -0.25); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  // headlights + taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), hl);
    h.position.set(sx, 0.7, 2.22); g.add(h);
  }
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tl);
    t.position.set(sx, 0.7, -2.22); g.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bar.position.set(0, 1.62, -0.25); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    bar2.position.set(0.35, 1.62, -0.25); g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.85; g.add(stripe);
    const plate = makeSign('SOLMARIS PD', 0x2a6aff);
    plate.scale.set(0.5, 0.5, 0.5); plate.position.set(0, 1.95, -0.25); g.add(plate);
  }
  scene.add(g);
  return { group: g, wheels, isPolice: !!isPolice };
}

const cars = [];       // all drivable cars (parked + traffic + police)
const trafficCars = [];
const policeCars = [];
let carIdSeq = 1;

function spawnCar(x, z, heading, opts) {
  const o = opts || {};
  const c = makeCar(o.color !== undefined ? o.color : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], o.police);
  c.group.position.set(x, 0, z);
  c.group.rotation.y = heading;
  const car = {
    id: carIdSeq++, mesh: c, x, z, heading, speed: 0,
    steer: 0, health: 100, parked: !!o.parked, traffic: !!o.traffic,
    police: !!o.police, stolen: false, wrecked: false,
    // traffic AI
    route: o.route || null, routeIdx: 0, routeDir: 1,
    targetSpeed: o.traffic ? 9 + rng() * 4 : 0,
    bustedTimer: 0, flashT: 0,
  };
  cars.push(car);
  if (o.traffic) trafficCars.push(car);
  if (o.police) policeCars.push(car);
  return car;
}
// parked cars along the central avenue + near garage (stealable)
spawnCar(6, 40, Math.PI, { parked: true, color: 0xd94a4a });
spawnCar(-6, 90, 0, { parked: true, color: 0x4a7ad9 });
spawnCar(6, -40, Math.PI, { parked: true, color: 0xd9a44a });
spawnCar(-6, -120, 0, { parked: true, color: 0x7ad94a });
spawnCar(168, -80, Math.PI / 2, { parked: true, color: 0xeeeeee });
spawnCar(-86, 150, 0, { parked: true, color: 0xd94ab5 });
spawnCar(86, -150, Math.PI, { parked: true, color: 0x4ad9c9 });
// traffic loops on avenues / streets
function loopRoute(axis, fixed, from, to) {
  const pts = [];
  for (let v = from; v <= to; v += 40) pts.push(axis === 'x' ? { x: v, z: fixed } : { x: fixed, z: v });
  return pts;
}
const trafficRoutes = [
  loopRoute('z', 0, -240, 240), loopRoute('x', -80, -160, 160),
  loopRoute('z', 80, -240, 240), loopRoute('x', 160, -160, 160),
  loopRoute('z', -160, -240, 240), loopRoute('x', 0, -240, 240),
];
for (let i = 0; i < 9; i++) {
  const r = trafficRoutes[i % trafficRoutes.length];
  const p = r[Math.floor(rng() * r.length)];
  const c = spawnCar(p.x + (rng() - 0.5) * 3, p.z + (rng() - 0.5) * 3, rng() * Math.PI * 2,
    { traffic: true, route: r, routeIdx: Math.floor(rng() * r.length) });
  c.routeDir = rng() < 0.5 ? 1 : -1;
}

// ---------------------------------------------------------------- pedestrians
const peds = [];
function makePed(x, z) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: [0xd94a6a, 0x4a9ad9, 0x9ad94a, 0xd9d94a, 0xffffff][Math.floor(rng() * 5)] });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.35), shirt);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.75; head.castShadow = true; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a2a3a }));
  legs.position.y = 0.35; g.add(legs);
  g.position.set(x, 0, z); scene.add(g);
  return { group: g, x, z, heading: rng() * Math.PI * 2, speed: 1 + rng() * 1.2, flee: 0, walkPhase: rng() * 6 };
}
for (let i = 0; i < 16; i++) {
  const ax = AVENUES[Math.floor(rng() * AVENUES.length)];
  const sz = STREETS[Math.floor(rng() * STREETS.length)];
  peds.push(makePed(ax + (rng() < 0.5 ? 10 : -10), sz + (rng() - 0.5) * 60));
}

// ---------------------------------------------------------------- player
const player = {
  x: 0, z: 60, y: 0, vy: 0, heading: Math.PI, health: 100, cash: 250,
  onGround: true, inCar: null, aiming: false, meleeCd: 0, shootCd: 0,
  speed: 0, walkPhase: 0, dead: false,
};
const playerGroup = new THREE.Group();
{
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2affc9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.38), jacket);
  body.position.y = 1.08; body.castShadow = true; playerGroup.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.82; head.castShadow = true; playerGroup.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xffd94a }));
  cap.position.y = 2.02; playerGroup.add(cap);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x22222e }));
  legs.position.y = 0.35; playerGroup.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.32, 1.25, 0.25); gun.name = 'gun'; gun.visible = false;
  playerGroup.add(gun);
  playerGroup.position.set(player.x, 0, player.z);
  scene.add(playerGroup);
}
// camera orbit state
const cam = { yaw: Math.PI, pitch: 0.32, dist: 9, targetYaw: Math.PI };

// ---------------------------------------------------------------- input
const keys = {};
let mouseDownL = false, mouseDownR = false, dragging = false, lastMX = 0, lastMY = 0;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') AudioSys.setMuted(!AudioSys.muted);
  if (e.code === 'KeyR' && game.running && !player.dead) restartMission();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  AudioSys.init(); AudioSys.resume();
  if (e.button === 0) mouseDownL = true;
  if (e.button === 2) mouseDownR = true;
  dragging = true; lastMX = e.clientX; lastMY = e.clientY;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDownL = false;
  if (e.button === 2) mouseDownR = false;
  dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  cam.yaw -= (e.clientX - lastMX) * 0.005;
  cam.pitch = clamp(cam.pitch + (e.clientY - lastMY) * 0.004, 0.05, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('muteBtn').addEventListener('click', () => {
  AudioSys.init(); AudioSys.resume(); AudioSys.setMuted(!AudioSys.muted);
});

// ---------------------------------------------------------------- game state
const game = {
  running: false, started: false, paused: false,
  missionIdx: 0, missionStep: 0, wanted: 0, wantedTimer: 0,
  cash: 250, completed: false, time: 0, msgTimer: 0,
  snapshot: null, heli: null, heliHealth: 100, heliActive: false,
  guards: [], crateTaken: false, bankCashTaken: false,
};
const MISSIONS = [
  { title: 'MISSION 1 — FIRST WHEELS', text: 'Steal a car (press E near one), then drive to the NORTH DROP-OFF (0, -210).', reward: 300 },
  { title: 'MISSION 2 — HARBOR RUN', text: 'Pick up the package at the HARBOR (210, -205), then deliver it to the PARKING GARAGE (175, -105).', reward: 400 },
  { title: 'MISSION 3 — LAY LOW', text: 'The cops are on you — WANTED 2. Reach the SAFEHOUSE (-120, 160) to lose the heat.', reward: 350 },
  { title: 'MISSION 4 — ON FOOT', text: 'Leave the car. Walk to the corner store marker (40, 0) — no wheels needed.', reward: 200 },
  { title: 'MISSION 5 — HARBOR HEIST', text: 'At the HARBOR, deal with the 2 guards (F to punch, aim + click to shoot) and grab the crate.', reward: 500 },
  { title: 'MISSION 6 — THE BIG SCORE', text: 'Hit SOLMARIS BANK (80, 80), grab the cash (E), then escape to the NORTH DROP-OFF while WANTED 3.', reward: 800 },
];
// mission marker beacon
const markerGroup = new THREE.Group(); scene.add(markerGroup);
{
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 30; beam.name = 'beam'; markerGroup.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.35, 10, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd94a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; ring.name = 'ring'; markerGroup.add(ring);
  const light = new THREE.PointLight(0xffd94a, 60, 60); light.position.y = 6; light.name = 'light';
  markerGroup.add(light);
}
function setMarker(x, z, visible) {
  markerGroup.position.set(x, 0, z);
  markerGroup.visible = visible !== false;
}
function showToast(text, color) {
  const t = document.getElementById('toast');
  t.textContent = text; t.style.color = color || '#7dff9a'; t.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.style.display = 'none'; }, 2600);
}
function showMsg(text, dur) {
  const m = document.getElementById('msg');
  m.textContent = text; m.style.display = 'block';
  game.msgTimer = dur || 3;
}
function updateMissionHUD() {
  const m = MISSIONS[game.missionIdx];
  document.getElementById('missionTitle').textContent = m ? m.title : 'ALL MISSIONS COMPLETE';
  document.getElementById('missionText').textContent = m ? m.text : 'You own Solmaris, Rico. The city is yours.';
}
function setWanted(n, silent) {
  game.wanted = clamp(Math.round(n), 0, 3);
  game.wantedTimer = 0;
  document.getElementById('stars').textContent = '★'.repeat(game.wanted) + '☆'.repeat(3 - game.wanted);
  if (game.wanted > 0 && !silent) showMsg('WANTED LEVEL ' + game.wanted + ' — the Solmaris PD is on you!', 3);
  if (game.wanted >= 3 && !game.heliActive) spawnHeli();
  if (game.wanted < 3 && game.heliActive) despawnHeli();
  AudioSys.setSiren(game.wanted > 0);
}
function addCash(n) {
  game.cash += n;
  document.getElementById('cash').textContent = '$' + game.cash;
}
function setHealth(n) {
  player.health = clamp(n, 0, 100);
  document.getElementById('healthfill').style.width = player.health + '%';
}
function takeSnapshot() {
  game.snapshot = {
    x: player.x, z: player.z, heading: player.heading, cash: game.cash,
    health: 100, wanted: game.wanted, missionIdx: game.missionIdx, missionStep: game.missionStep,
    inCar: false, guardsAlive: game.guards.map((g) => g.alive),
    crateTaken: game.crateTaken, bankCashTaken: game.bankCashTaken,
  };
}
function restoreSnapshot(keepPenalty) {
  const s = game.snapshot;
  if (!s) return;
  exitCar(true);
  player.x = s.x; player.z = s.z; player.y = 0; player.vy = 0; player.heading = s.heading;
  playerGroup.position.set(s.x, 0, s.z);
  if (!keepPenalty) { game.cash = s.cash; document.getElementById('cash').textContent = '$' + s.cash; }
  else { game.cash = Math.max(0, s.cash - (game.deathPenalty || 0)); document.getElementById('cash').textContent = '$' + game.cash; }
  setHealth(100);
  game.missionIdx = s.missionIdx; game.missionStep = s.missionStep;
  game.crateTaken = s.crateTaken; game.bankCashTaken = s.bankCashTaken;
  game.guards.forEach((g, i) => { g.alive = s.guardsAlive[i] !== false; g.group.visible = g.alive; g.health = 100; });
  setWanted(s.wanted || 0, true);
  updateMissionHUD(); updateMissionMarker();
  player.dead = false;
  document.getElementById('dead').style.display = 'none';
  game.running = true;
}
function die(kind) {
  if (player.dead || !game.running) return;
  player.dead = true; game.running = false;
  AudioSys.setEngine(0, false); AudioSys.setSiren(false); AudioSys.setRotor(false);
  AudioSys.busted();
  const penalty = kind === 'busted' ? 200 : 100;
  game.deathPenalty = penalty;
  game.cash = Math.max(0, game.cash - penalty);
  document.getElementById('cash').textContent = '$' + game.cash;
  document.getElementById('deadTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('deadTitle').style.color = kind === 'busted' ? '#5ab8ff' : '#ff5a5a';
  document.getElementById('deadText').textContent =
    (kind === 'busted' ? 'The Solmaris PD caught you. -$' + penalty + ' bail.' : 'You got taken out. -$' + penalty + ' hospital bill.') +
    ' Press CONTINUE to pick up exactly where the mission started.';
  document.getElementById('dead').style.display = 'flex';
}
function completeMission() {
  const m = MISSIONS[game.missionIdx];
  if (!m) return;
  addCash(m.reward);
  AudioSys.missionDone();
  showToast('MISSION COMPLETE  +$' + m.reward);
  game.missionIdx++;
  game.missionStep = 0;
  if (game.missionIdx >= MISSIONS.length) {
    game.completed = true;
    setMarker(0, 0, false);
    document.getElementById('missionTitle').textContent = '★ SOLMARIS IS YOURS ★';
    document.getElementById('missionText').textContent = 'All 6 missions complete. Final cash: $' + game.cash + '. Free-roam the city!';
    saveGame();
    return;
  }
  // mission-start side effects (exact start state is snapshotted right after)
  if (game.missionIdx === 2) setWanted(2); // M3: the heat is already on you
  if (game.missionIdx === 3) { // M4: on foot, short walk — drop the player at the avenue
    exitCar(true);
    player.x = 0; player.z = 0; player.heading = Math.PI / 2;
    playerGroup.position.set(0, 0, 0);
  }
  if (game.missionIdx === 4) spawnGuards();
  updateMissionHUD(); updateMissionMarker(); takeSnapshot(); saveGame();
}
function updateMissionMarker() {
  if (game.completed) { setMarker(0, 0, false); return; }
  const i = game.missionIdx, s = game.missionStep;
  if (i === 0) setMarker(NORTH_DROPOFF.x, NORTH_DROPOFF.z);
  else if (i === 1) setMarker(s === 0 ? HARBOR.x : PARKING_GARAGE.x, s === 0 ? HARBOR.z : PARKING_GARAGE.z);
  else if (i === 2) setMarker(SAFEHOUSE.x, SAFEHOUSE.z);
  else if (i === 3) setMarker(M4_MARK.x, M4_MARK.z);
  else if (i === 4) setMarker(HARBOR.x, HARBOR.z);
  else if (i === 5) setMarker(s === 0 ? BANK.x : NORTH_DROPOFF.x, s === 0 ? BANK.z : NORTH_DROPOFF.z);
}
function restartMission() {
  if (!game.snapshot) return;
  restoreSnapshot(false);
  showMsg('Mission restarted from its start point.', 2.5);
}
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash, missionIdx: game.missionIdx, missionStep: game.missionStep,
      x: player.x, z: player.z, completed: game.completed,
    }));
    const b = document.getElementById('continueBtn');
    if (b) b.style.display = 'inline-block';
  } catch (e) { /* storage unavailable */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && typeof s.cash === 'number' ? s : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- helicopter (wanted 3) + searchlight
function spawnHeli() {
  if (game.heli) return;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6.5),
    new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
  body.castShadow = true; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5),
    new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
  tail.position.set(0, 0.3, -5); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x333338 }));
  rotor.position.y = 1.1; rotor.name = 'rotor'; g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x333338 }));
  tailRotor.position.set(0.4, 0.4, -7.2); tailRotor.name = 'tailRotor'; g.add(tailRotor);
  // INTERACTIVE SEARCHLIGHT: spotlight + visible cone, tracks the player
  const spot = new THREE.SpotLight(0xfff6c9, 900, 120, 0.42, 0.45, 1.2);
  spot.position.set(0, -0.5, 0); spot.name = 'spot';
  g.add(spot); g.add(spot.target);
  const coneGeo = new THREE.ConeGeometry(9, 34, 20, 1, true);
  const cone = new THREE.Mesh(coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  cone.position.y = -17.5; cone.rotation.x = Math.PI; cone.name = 'cone'; g.add(cone);
  // light pool on the ground under the player
  const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.3, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.12; pool.name = 'pool';
  scene.add(pool);
  g.userData.pool = pool;
  scene.add(g);
  game.heli = g; game.heliActive = true; game.heliHealth = 100;
  AudioSys.setRotor(true);
  showMsg('🚁 POLICE HELICOPTER — its searchlight is on you! Shoot it to drive it off.', 4);
}
function despawnHeli() {
  if (!game.heli) return;
  scene.remove(game.heli.userData.pool);
  scene.remove(game.heli);
  game.heli = null; game.heliActive = false;
  AudioSys.setRotor(false);
}
function damageHeli(n) {
  if (!game.heliActive) return;
  game.heliHealth -= n;
  showMsg('Helicopter hit! Integrity ' + Math.max(0, game.heliHealth) + '%', 1.2);
  if (game.heliHealth <= 0) {
    despawnHeli();
    setWanted(2, true);
    showToast('HELICOPTER DRIVEN OFF — wanted down to 2');
    AudioSys.missionDone();
  }
}

// ---------------------------------------------------------------- guards (mission 5)
function spawnGuards() {
  if (game.guards.length) return;
  const spots = [[200, -195], [222, -215]];
  for (const [gx, gz] of spots) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.38),
      new THREE.MeshLambertMaterial({ color: 0x333338 }));
    body.position.y = 1.08; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xc99878 }));
    head.position.y = 1.82; g.add(head);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a5a2a }));
    vest.position.y = 1.15; g.add(vest);
    g.position.set(gx, 0, gz); scene.add(g);
    game.guards.push({ group: g, x: gx, z: gz, health: 100, alive: true, atkCd: 0, heading: 0 });
  }
}
function clearGuards() { game.guards.forEach((g) => { scene.remove(g.group); }); game.guards = []; }

// ---------------------------------------------------------------- collision helpers
function collideCircle(x, z, r) {
  // returns corrected {x,z} after pushing out of building boxes + palm circles
  let nx = x, nz = z;
  for (const c of colliders) {
    if (c.r !== undefined) {
      const d = dist2d(nx, nz, c.x, c.z);
      if (d < r + c.r && d > 0.001) {
        const push = (r + c.r - d);
        nx += ((nx - c.x) / d) * push; nz += ((nz - c.z) / d) * push;
      }
    } else {
      const dx = nx - c.x, dz = nz - c.z;
      const px = c.hx + r - Math.abs(dx), pz = c.hz + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) nx = c.x + Math.sign(dx || 1) * (c.hx + r);
        else nz = c.z + Math.sign(dz || 1) * (c.hz + r);
      }
    }
  }
  nx = clamp(nx, -WORLD, WORLD); nz = clamp(nz, -WORLD, WORLD);
  return { x: nx, z: nz };
}
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of cars) {
    if (c.wrecked) continue;
    const d = dist2d(player.x, player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------------------------------------------------------------- interactions
function enterCar(car) {
  if (!car || player.inCar) return;
  player.inCar = car;
  car.parked = false; car.traffic = false;
  if (!car.stolen) {
    car.stolen = true;
    // stealing in sight of police raises heat
    const copNear = policeCars.some((p) => dist2d(p.x, p.z, car.x, car.z) < 60);
    if (copNear || game.wanted === 0) setWanted(Math.max(game.wanted, 1));
    showMsg('You stole the car! WANTED 1 — lose the cops or finish the job.', 3);
    AudioSys.pickup();
  }
  player.x = car.x; player.z = car.z;
  playerGroup.visible = false;
  document.getElementById('carbar').style.display = 'block';
}
function exitCar(silent) {
  if (!player.inCar) return;
  const car = player.inCar;
  car.speed = 0;
  player.inCar = null;
  player.x = car.x + Math.sin(car.heading) * 2.5;
  player.z = car.z + Math.cos(car.heading) * 2.5;
  player.heading = car.heading;
  playerGroup.visible = true;
  playerGroup.position.set(player.x, 0, player.z);
  document.getElementById('carbar').style.display = 'none';
  if (!silent) AudioSys.click();
}
function tryInteract() {
  if (player.inCar) { exitCar(); return; }
  const car = nearestCar(4.2);
  if (car) { enterCar(car); return; }
  // mission interactions
  if (game.missionIdx === 5 && game.missionStep === 0 &&
    dist2d(player.x, player.z, BANK.x, BANK.z) < 18) {
    game.bankCashTaken = true; game.missionStep = 1;
    addCash(0); AudioSys.pickup();
    showMsg('Cash grabbed! Now escape to the NORTH DROP-OFF — WANTED 3!', 3.5);
    setWanted(3);
    updateMissionMarker();
    return;
  }
  if (game.missionIdx === 4 && game.guards.every((g) => !g.alive) &&
    !game.crateTaken && dist2d(player.x, player.z, HARBOR.x + 8, HARBOR.z) < 10) {
    game.crateTaken = true; AudioSys.pickup();
    showMsg('Crate secured!', 2);
  }
}
function melee() {
  if (player.meleeCd > 0 || player.inCar) return;
  player.meleeCd = 0.45;
  AudioSys.punch();
  // hit guards in front
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  for (const g of game.guards) {
    if (!g.alive) continue;
    const dx = g.x - player.x, dz = g.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.6 && (dx * fx + dz * fz) > 0) {
      g.health -= 34;
      showMsg('Guard hit! ' + Math.max(0, g.health) + ' HP left', 1);
      if (g.health <= 0) { g.alive = false; g.group.visible = false; AudioSys.pickup(); showMsg('Guard down!', 1.5); }
    }
  }
  // hit peds nearby (raises wanted)
  for (const p of peds) {
    if (dist2d(p.x, p.z, player.x, player.z) < 2.4) {
      p.flee = 6;
      if (game.wanted < 2) setWanted(game.wanted + 1);
    }
  }
}
function shoot() {
  if (player.shootCd > 0 || player.inCar) return;
  player.shootCd = 0.28;
  AudioSys.gunshot();
  if (game.wanted < 1) setWanted(1);
  // ray from camera through screen centre
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = 120;
  // heli?
  if (game.heliActive) {
    const hit = ray.intersectObject(game.heli, true);
    if (hit.length) { damageHeli(25); return; }
  }
  // guards
  for (const g of game.guards) {
    if (!g.alive) continue;
    const hit = ray.intersectObject(g.group, true);
    if (hit.length) {
      g.health -= 50;
      if (g.health <= 0) { g.alive = false; g.group.visible = false; showMsg('Guard down!', 1.5); }
      else showMsg('Guard hit! ' + g.health + ' HP left', 1);
      return;
    }
  }
  // muzzle flash light
  const fl = new THREE.PointLight(0xffe9a8, 120, 18);
  fl.position.copy(camera.position).add(new THREE.Vector3(0, -0.3, 0).applyQuaternion(camera.quaternion));
  scene.add(fl); setTimeout(() => scene.remove(fl), 60);
}

// ---------------------------------------------------------------- arcade car physics (smooth full-speed U-turn)
// Steering is deliberately arcade, not realistic: at full speed the front wheels
// bite hard and the car rotates fast, so a U-turn completes in ~1.5 s.
function updatePlayerCar(dt) {
  const car = player.inCar;
  const fwd = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const back = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const left = (keys.KeyA || keys.ArrowLeft) ? 1 : 0;
  const right = (keys.KeyD || keys.ArrowRight) ? 1 : 0;
  const handbrake = keys.Space ? 1 : 0;
  const maxSpeed = 34, maxReverse = 12;
  const accel = 22, brake = 30;
  if (fwd) car.speed += accel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? brake : accel * 0.7) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);
  // ARCADE STEERING: turn rate stays high at speed (realistic steering goes numb).
  const speed01 = clamp(Math.abs(car.speed) / maxSpeed, 0, 1);
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer = lerp(car.steer, steerTarget * (0.55 + 0.45 * speed01), Math.min(1, dt * 9));
  const dir = car.speed >= 0 ? 1 : -1;
  let turnRate = car.steer * (1.3 + 1.6 * speed01) * dir; // up to ~2.9 rad/s at full speed
  if (handbrake) turnRate *= 1.7;
  car.heading += turnRate * dt * (Math.abs(car.speed) > 0.4 ? 1 : 0);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideCircle(nx, nz, 1.6);
  if (fixed.x !== nx || fixed.z !== nz) car.speed *= 0.55; // scrape, keep sliding
  car.x = fixed.x; car.z = fixed.z;
  car.mesh.group.position.set(car.x, 0, car.z);
  car.mesh.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2.4;
  car.mesh.wheels.forEach((w) => { w.rotation.x += spin; });
  car.mesh.wheels[0].rotation.y = car.steer * 0.4;
  car.mesh.wheels[1].rotation.y = car.steer * 0.4;
  player.x = car.x; player.z = car.z; player.heading = car.heading;
  document.getElementById('carfill').style.width = Math.max(0, car.health) + '%';
  AudioSys.setEngine(speed01, true);
  // running over a ped = wanted
  for (const p of peds) {
    if (dist2d(p.x, p.z, car.x, car.z) < 2 && Math.abs(car.speed) > 4) {
      p.flee = 8;
      if (game.wanted < 3) setWanted(game.wanted + 1);
    }
  }
}
function updateTraffic(dt) {
  for (const c of trafficCars) {
    if (c.wrecked) continue;
    const route = c.route;
    const target = route[c.routeIdx];
    const dx = target.x - c.x, dz = target.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 6) { c.routeIdx = (c.routeIdx + c.routeDir + route.length) % route.length; continue; }
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - c.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    c.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    c.speed = lerp(c.speed, c.targetSpeed, dt * 0.8);
    const nx = c.x + Math.sin(c.heading) * c.speed * dt;
    const nz = c.z + Math.cos(c.heading) * c.speed * dt;
    // avoid the player's car
    if (player.inCar && dist2d(nx, nz, player.x, player.z) < 5) { c.speed *= 0.4; continue; }
    c.x = clamp(nx, -WORLD, WORLD); c.z = clamp(nz, -WORLD, WORLD);
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.heading;
    c.mesh.wheels.forEach((w) => { w.rotation.x += c.speed * dt * 2.4; });
  }
}
function updatePolice(dt) {
  // spawn / despawn police to match wanted level
  const wantCount = game.wanted === 0 ? 0 : game.wanted === 1 ? 2 : game.wanted === 2 ? 3 : 4;
  while (policeCars.length < wantCount) {
    const a = rng() * Math.PI * 2;
    spawnCar(player.x + Math.sin(a) * 90, player.z + Math.cos(a) * 90, a, { police: true });
  }
  while (policeCars.length > wantCount) {
    const p = policeCars.pop();
    cars.splice(cars.indexOf(p), 1);
    scene.remove(p.mesh.group);
  }
  for (const p of policeCars) {
    p.flashT += dt;
    const bar = p.mesh.group.children.find((ch) => ch.geometry && ch.geometry.type === 'BoxGeometry' && ch.position.y === 1.62);
    if (bar) bar.material.color.setHex(Math.floor(p.flashT * 4) % 2 === 0 ? 0xff2a2a : 0x2a6aff);
    const dx = player.x - p.x, dz = player.z - p.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const targetSpeed = d > 60 ? 30 : d > 12 ? 24 : 10;
    p.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    p.speed = lerp(p.speed, targetSpeed, dt);
    const nx = p.x + Math.sin(p.heading) * p.speed * dt;
    const nz = p.z + Math.cos(p.heading) * p.speed * dt;
    const fixed = collideCircle(nx, nz, 1.6);
    p.x = fixed.x; p.z = fixed.z;
    p.mesh.group.position.set(p.x, 0, p.z);
    p.mesh.group.rotation.y = p.heading;
    p.mesh.wheels.forEach((w) => { w.rotation.x += p.speed * dt * 2.4; });
    // ram damage + bust
    if (d < 3.4) {
      if (player.inCar) {
        player.inCar.health -= 18 * dt;
        player.inCar.speed *= 0.96;
        if (player.inCar.health <= 0 && !player.inCar.wrecked) {
          player.inCar.wrecked = true;
          showMsg('Your car is wrecked! Bail out!', 3);
          exitCar();
        }
      } else {
        p.bustedTimer += dt;
        if (p.bustedTimer > 1.6) { die('busted'); return; }
      }
    } else p.bustedTimer = Math.max(0, p.bustedTimer - dt);
  }
}
function updateHeli(dt) {
  if (!game.heli) return;
  const g = game.heli;
  const t = game.time;
  // hover above the player, slight lag + bob
  const hx = lerp(g.position.x, player.x + Math.sin(t * 0.5) * 6, dt * 0.9);
  const hz = lerp(g.position.z, player.z + Math.cos(t * 0.4) * 6, dt * 0.9);
  g.position.set(hx, 42 + Math.sin(t * 1.3) * 1.5, hz);
  g.rotation.y = Math.atan2(player.x - hx, player.z - hz);
  const rotor = g.getObjectByName('rotor');
  if (rotor) rotor.rotation.y += dt * 22;
  const tail = g.getObjectByName('tailRotor');
  if (tail) tail.rotation.x += dt * 30;
  // searchlight: spotlight + cone track the player (interactive — shootable)
  const spot = g.getObjectByName('spot');
  const cone = g.getObjectByName('cone');
  const pool = g.userData.pool;
  const px = player.x, pz = player.z;
  spot.target.position.set(px - hx, -42, pz - hz);
  spot.target.updateMatrixWorld();
  cone.lookAt(px, 0, pz);
  cone.rotateX(-Math.PI / 2);
  pool.position.set(px, 0.12, pz);
  // searchlight pins the player: wanted does not decay while lit
  game.wantedTimer = 0;
}
function updatePeds(dt) {
  for (const p of peds) {
    if (p.flee > 0) {
      p.flee -= dt;
      const dx = p.x - player.x, dz = p.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      p.heading = Math.atan2(dx, dz);
      p.x = clamp(p.x + Math.sin(p.heading) * 5.5 * dt, -WORLD, WORLD);
      p.z = clamp(p.z + Math.cos(p.heading) * 5.5 * dt, -WORLD, WORLD);
    } else {
      // wander along sidewalks; turn at intersections
      if (rng() < 0.002) p.heading += (rng() - 0.5) * Math.PI;
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      if (Math.abs(p.x) > WORLD - 5 || Math.abs(p.z) > WORLD - 5) p.heading += Math.PI;
    }
    p.walkPhase += dt * 6;
    p.group.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
    p.group.rotation.y = p.heading;
  }
}
function updateGuards(dt) {
  for (const g of game.guards) {
    if (!g.alive) continue;
    const d = dist2d(g.x, g.z, player.x, player.z);
    g.atkCd -= dt;
    if (d < 26) {
      // chase the player
      g.heading = Math.atan2(player.x - g.x, player.z - g.z);
      const sp = d > 3 ? 4.2 : 0;
      g.x += Math.sin(g.heading) * sp * dt;
      g.z += Math.cos(g.heading) * sp * dt;
      if (d < 2.4 && g.atkCd <= 0) {
        g.atkCd = 1.1;
        setHealth(player.health - 12);
        AudioSys.punch();
        showMsg('Guard hit you! -12 HP', 1.2);
        if (player.health <= 0) die('wasted');
      }
    } else {
      // patrol around the harbor
      g.heading += Math.sin(game.time * 0.3 + g.x) * 0.01;
      g.x += Math.sin(g.heading) * 1.2 * dt;
      g.z += Math.cos(g.heading) * 1.2 * dt;
    }
    g.group.position.set(g.x, 0, g.z);
    g.group.rotation.y = g.heading;
  }
}

// ---------------------------------------------------------------- on-foot movement
function updatePlayer(dt) {
  player.meleeCd = Math.max(0, player.meleeCd - dt);
  player.shootCd = Math.max(0, player.shootCd - dt);
  if (player.inCar) { updatePlayerCar(dt); return; }
  const fwd = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const back = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const left = (keys.KeyA || keys.ArrowLeft) ? 1 : 0;
  const right = (keys.KeyD || keys.ArrowRight) ? 1 : 0;
  const run = keys.ShiftLeft || keys.ShiftRight ? 1.7 : 1;
  const speed = 6.5 * run;
  // movement relative to camera yaw
  const mx = Math.sin(cam.yaw), mz = Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let dx = 0, dz = 0;
  if (fwd) { dx += mx; dz += mz; }
  if (back) { dx -= mx; dz -= mz; }
  if (right) { dx += rx; dz += rz; }
  if (left) { dx -= rx; dz -= rz; }
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    dx /= len; dz /= len;
    player.heading = Math.atan2(dx, dz);
    const nx = player.x + dx * speed * dt;
    const nz = player.z + dz * speed * dt;
    const fixed = collideCircle(nx, nz, 0.6);
    player.x = fixed.x; player.z = fixed.z;
    player.walkPhase += dt * 10 * run;
  }
  // jump (gravity)
  if (keys.Space && player.onGround) { player.vy = 8.5; player.onGround = false; AudioSys.blip(300, 0.1, 'sine', 0.08, 500); }
  if (!player.onGround) {
    player.vy -= 24 * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; }
  }
  playerGroup.position.set(player.x, player.y + Math.abs(Math.sin(player.walkPhase)) * 0.05, player.z);
  playerGroup.rotation.y = player.heading;
  // aim / shoot / melee
  player.aiming = mouseDownR;
  playerGroup.getObjectByName('gun').visible = player.aiming;
  document.getElementById('crosshair').style.display = player.aiming ? 'block' : 'none';
  if (mouseDownL && player.aiming) shoot();
  if (keys.KeyF) melee();
  if (keys.KeyE && !updatePlayer._eLock) { updatePlayer._eLock = true; tryInteract(); }
  if (!keys.KeyE) updatePlayer._eLock = false;
  // slow health regen
  if (player.health < 100 && game.wanted === 0) setHealth(player.health + 2 * dt);
  AudioSys.setEngine(0, false);
}

// ---------------------------------------------------------------- mission logic tick
function missionTick(dt) {
  if (game.completed || !game.running) return;
  const i = game.missionIdx, s = game.missionStep;
  const at = (x, z, r) => dist2d(player.x, player.z, x, z) < r;
  if (i === 0) {
    // steal a car, reach North Drop-off (must be IN a car)
    if (player.inCar && at(NORTH_DROPOFF.x, NORTH_DROPOFF.z, 10)) completeMission();
  } else if (i === 1) {
    if (s === 0 && at(HARBOR.x, HARBOR.z, 14)) {
      game.missionStep = 1; AudioSys.pickup();
      showMsg('Package picked up! Deliver it to the PARKING GARAGE (175, -105).', 3.5);
      updateMissionMarker();
    } else if (s === 1 && at(PARKING_GARAGE.x, PARKING_GARAGE.z, 22)) completeMission();
  } else if (i === 2) {
    if (at(SAFEHOUSE.x, SAFEHOUSE.z, 10)) {
      setWanted(0, true);
      showMsg('You lost them. The heat is off.', 3);
      completeMission();
    }
  } else if (i === 3) {
    // on foot only: walking to the store. (Driving there does NOT count — must be on foot.)
    if (!player.inCar && at(M4_MARK.x, M4_MARK.z, 7)) completeMission();
  } else if (i === 4) {
    if (game.guards.every((g) => !g.alive) && game.crateTaken) completeMission();
    else if (game.guards.every((g) => !g.alive) && !game.crateTaken) {
      showMsg('Guards down! Grab the crate at the harbor dock (press E near it).', 3);
    }
  } else if (i === 5) {
    if (s === 1 && player.inCar && at(NORTH_DROPOFF.x, NORTH_DROPOFF.z, 10)) completeMission();
  }
  // wanted decay: only when out of trouble and not lit by the heli
  if (game.wanted > 0 && !game.heliActive) {
    game.wantedTimer += dt;
    if (game.wantedTimer > 22) setWanted(game.wanted - 1, true);
  }
}

// ---------------------------------------------------------------- camera + minimap + HUD
function updateCamera(dt) {
  const px = player.x, pz = player.z;
  let tx, ty, tz, lookY;
  if (player.inCar) {
    const car = player.inCar;
    const back = 11 + Math.abs(car.speed) * 0.08;
    tx = car.x - Math.sin(car.heading) * back;
    tz = car.z - Math.cos(car.heading) * back;
    ty = 5.2 + Math.abs(car.speed) * 0.03;
    lookY = 1.6;
    cam.yaw = lerp(cam.yaw, car.heading, Math.min(1, dt * 1.2));
  } else if (player.aiming) {
    tx = px - Math.sin(player.heading) * 3.4;
    tz = pz - Math.cos(player.heading) * 3.4;
    ty = 2.4; lookY = 1.5;
  } else {
    tx = px - Math.sin(cam.yaw) * cam.dist;
    tz = pz - Math.cos(cam.yaw) * cam.dist;
    ty = 4 + cam.pitch * 7;
    lookY = 1.6;
  }
  camera.position.x = lerp(camera.position.x, tx, Math.min(1, dt * 7));
  camera.position.y = lerp(camera.position.y, ty, Math.min(1, dt * 7));
  camera.position.z = lerp(camera.position.z, tz, Math.min(1, dt * 7));
  camera.lookAt(px, lookY, pz);
}
const mm = document.getElementById('minimap').getContext('2d');
function drawMinimap() {
  const S = 170, scale = S / (WORLD * 2 + 60);
  const toX = (x) => (x + WORLD + 30) * scale;
  const toY = (z) => (z + WORLD + 30) * scale;
  mm.clearRect(0, 0, S, S);
  mm.fillStyle = '#101736'; mm.fillRect(0, 0, S, S);
  mm.fillStyle = '#2a6f9e'; mm.fillRect(0, 0, toX(-WORLD), S); // ocean west
  mm.fillStyle = '#e8cf9a'; mm.fillRect(toX(-WORLD), 0, 6, S); // beach
  mm.fillStyle = '#3a3a48';
  for (const x of AVENUES) mm.fillRect(toX(x) - 2, 0, 4, S);
  for (const z of STREETS) mm.fillRect(0, toY(z) - 2, S, 4);
  mm.fillStyle = '#7a7468'; mm.fillRect(toX(160), toY(-250), toX(270) - toX(160), toY(-160) - toY(-250)); // harbor
  // mission marker
  if (markerGroup.visible) {
    const pulse = 5 + Math.sin(game.time * 5) * 2;
    mm.fillStyle = '#ffd94a';
    mm.beginPath(); mm.arc(toX(markerGroup.position.x), toY(markerGroup.position.z), pulse, 0, 7); mm.fill();
    mm.strokeStyle = '#fff'; mm.lineWidth = 1.5; mm.stroke();
  }
  // cars
  for (const c of cars) {
    mm.fillStyle = c.police ? '#ff2a2a' : c === player.inCar ? '#7dff9a' : '#bbbbbb';
    mm.beginPath(); mm.arc(toX(c.x), toY(c.z), c.police ? 3 : 2, 0, 7); mm.fill();
  }
  // heli
  if (game.heli) {
    mm.fillStyle = '#ff2a2a';
    mm.beginPath(); mm.arc(toX(game.heli.position.x), toY(game.heli.position.z), 4, 0, 7); mm.fill();
  }
  // player arrow
  mm.save();
  mm.translate(toX(player.x), toY(player.z));
  mm.rotate(Math.atan2(Math.sin(player.heading), Math.cos(player.heading)) * -1 + Math.PI);
  mm.fillStyle = '#fff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath(); mm.fill();
  mm.restore();
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (game.running && !player.dead) {
    game.time += dt;
    updatePlayer(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updateHeli(dt);
    updatePeds(dt);
    updateGuards(dt);
    missionTick(dt);
    // mission 5 setup: guards spawn when the mission starts
    if (game.missionIdx === 4 && game.guards.length === 0) spawnGuards();
    if (game.missionIdx === 3 && player.inCar) { /* M4 hint */ }
    if (game.msgTimer > 0) {
      game.msgTimer -= dt;
      if (game.msgTimer <= 0) document.getElementById('msg').style.display = 'none';
    }
    // marker pulse
    const beam = markerGroup.getObjectByName('beam');
    if (beam) beam.material.opacity = 0.2 + Math.sin(game.time * 3) * 0.1;
    const ring = markerGroup.getObjectByName('ring');
    if (ring) ring.scale.setScalar(1 + Math.sin(game.time * 3) * 0.12);
    // ocean shimmer
    sunGlow.material.opacity = 0.3 + Math.sin(game.time * 0.8) * 0.08;
  }
  updateCamera(dt);
  drawMinimap();
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- UI wiring
function startNewGame(fromSave) {
  AudioSys.init(); AudioSys.resume(); AudioSys.click();
  const save = fromSave ? loadSave() : null;
  game.started = true; game.running = true; game.completed = false;
  game.missionIdx = save ? save.missionIdx : 0;
  game.missionStep = save ? save.missionStep : 0;
  game.cash = save ? save.cash : 250;
  game.wanted = 0; game.crateTaken = false; game.bankCashTaken = false;
  player.health = 100; player.dead = false; player.inCar = null;
  player.x = save ? save.x : 0; player.z = save ? save.z : 60; player.y = 0; player.vy = 0;
  player.heading = Math.PI;
  playerGroup.visible = true;
  playerGroup.position.set(player.x, 0, player.z);
  document.getElementById('cash').textContent = '$' + game.cash;
  setHealth(100); setWanted(0, true);
  clearGuards();
  if (game.missionIdx === 4) spawnGuards();
  document.getElementById('title').style.display = 'none';
  document.getElementById('dead').style.display = 'none';
  updateMissionHUD(); updateMissionMarker(); takeSnapshot();
  if (save) showMsg('Save loaded — welcome back to Solmaris.', 3);
  else showMsg('Steal a car and drive to the NORTH DROP-OFF!', 4);
}
document.getElementById('newGameBtn').addEventListener('click', () => startNewGame(false));
document.getElementById('continueBtn').addEventListener('click', () => startNewGame(true));
document.getElementById('continueDeadBtn').addEventListener('click', () => {
  AudioSys.click();
  if (game.snapshot) { restoreSnapshot(true); showMsg('Back on your feet. The mission continues.', 3); }
  else startNewGame(false);
});
if (loadSave()) document.getElementById('continueBtn').style.display = 'inline-block';
// first user gesture anywhere wakes audio (sound must actually be heard)
window.addEventListener('pointerdown', () => { AudioSys.init(); AudioSys.resume(); }, { once: false });
window.addEventListener('keydown', () => { AudioSys.init(); AudioSys.resume(); }, { once: false });

// ---------------------------------------------------------------- debug / test hooks (drives the play-test, harmless in play)
window.__SOL = {
  state() {
    return {
      running: game.running, cash: game.cash, health: player.health,
      wanted: game.wanted, missionIdx: game.missionIdx, missionStep: game.missionStep,
      x: player.x, z: player.z, y: player.y, inCar: !!player.inCar,
      carHealth: player.inCar ? player.inCar.health : null,
      carSpeed: player.inCar ? player.inCar.speed : null,
      completed: game.completed, dead: player.dead, time: game.time,
      heliActive: game.heliActive, heliHealth: game.heliHealth,
      guardsAlive: game.guards.filter((g) => g.alive).length,
      guardHp: game.guards.map((g) => (g.alive ? Math.round(g.health) : 0)),
      heliSearchlight: !!(game.heli && game.heli.getObjectByName('spot') && game.heli.getObjectByName('cone')),
      gunVisible: playerGroup.getObjectByName('gun').visible,
      crateTaken: game.crateTaken, bankCashTaken: game.bankCashTaken,
      audioRunning: AudioSys.ctx ? AudioSys.ctx.state : 'none',
      masterGain: AudioSys.master ? AudioSys.master.gain.value : 0,
      engineGain: AudioSys.engineGain ? AudioSys.engineGain.gain.value : 0,
      sirenGain: AudioSys.sirenGain ? AudioSys.sirenGain.gain.value : 0,
      rotorGain: AudioSys.rotorGain ? AudioSys.rotorGain.gain.value : 0,
      muted: AudioSys.muted,
    };
  },
  start() { startNewGame(false); },
  teleport(x, z, heading) {
    if (heading !== undefined) {
      player.heading = heading;
      if (player.inCar) player.inCar.heading = heading;
    }
    if (player.inCar) { player.inCar.x = x; player.inCar.z = z; player.inCar.mesh.group.position.set(x, 0, z); player.inCar.mesh.group.rotation.y = player.inCar.heading; }
    player.x = x; player.z = z; playerGroup.position.set(x, player.y, z);
    playerGroup.rotation.y = player.heading;
  },
  setMission(i, s) {
    game.missionIdx = i; game.missionStep = s || 0;
    if (i === 2) setWanted(2);
    if (i === 3) { exitCar(true); player.x = 0; player.z = 0; player.heading = Math.PI / 2; playerGroup.position.set(0, 0, 0); }
    if (i === 4) spawnGuards();
    updateMissionHUD(); updateMissionMarker(); takeSnapshot();
  },
  setWanted(n) { setWanted(n); },
  damage(n) { setHealth(player.health - n); if (player.health <= 0) die('wasted'); },
  bust() { die('busted'); },
  setCash(n) { game.cash = n; document.getElementById('cash').textContent = '$' + n; },
  enterNearestCar() { const c = nearestCar(30); if (c) enterCar(c); return !!player.inCar; },
  exitCar() { exitCar(); },
  aim(v) { player.aiming = !!v; document.getElementById('crosshair').style.display = v ? 'block' : 'none'; },
  shoot() { shoot(); },
  melee() { melee(); },
  pressKey(code, down) { keys[code] = !!down; },
  face(x, z) { player.heading = Math.atan2(x - player.x, z - player.z); cam.yaw = player.heading; },
  damageHeli(n) { damageHeli(n); },
  guardPos(i) { const g = game.guards[i]; return g ? { x: g.x, z: g.z, alive: g.alive } : null; },
  missionMarker() { return { x: markerGroup.position.x, z: markerGroup.position.z, visible: markerGroup.visible }; },
  heliPos() { return game.heli ? { x: game.heli.position.x, z: game.heli.position.z } : null; },
  carPos() { return player.inCar ? { x: player.inCar.x, z: player.inCar.z, heading: player.inCar.heading } : null; },
};
