
/* ============================================================
 * OPEN CITY -- District 0 web prototype (original work).
 * On-foot city slice: procedural district, day/night, peds.
 * No imports: three.js r170 (vendored above) is in scope.
 * ========================================================== */
{
'use strict';

// ---------- deterministic RNG (stable layout) ----------
let ocSeed = 1337;
function ocRand() {
  ocSeed |= 0; ocSeed = (ocSeed + 0x6D2B79F5) | 0;
  let t = Math.imul(ocSeed ^ (ocSeed >>> 15), 1 | ocSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ocRange(a, b) { return a + (b - a) * ocRand(); }
function ocPick(arr) { return arr[Math.floor(ocRand() * arr.length) % arr.length]; }

// ---------- helpers ----------
function ocClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function ocLerp(a, b, t) { return a + (b - a) * t; }
function ocSmoothstep(a, b, v) {
  const t = ocClamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function ocLerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * ocClamp(t, 0, 1);
}

// ---------- procedural textures (guarded: null on stub DOM) ----------
let ocTexSeed = 4242;
function ocTexRand() {
  ocTexSeed |= 0; ocTexSeed = (ocTexSeed + 0x6D2B79F5) | 0;
  let t = Math.imul(ocTexSeed ^ (ocTexSeed >>> 15), 1 | ocTexSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ocDrawAsphalt(ctx, s) {
  ctx.fillStyle = '#23262b';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = ocTexRand() < 0.5 ? '#1e2228' : '#292e35';
    ctx.fillRect(Math.floor(ocTexRand() * s), Math.floor(ocTexRand() * s), 1 + Math.floor(ocTexRand() * 2), 1 + Math.floor(ocTexRand() * 2));
  }
  ctx.fillStyle = '#191c21';
  for (let i = 0; i < 3; i++) {
    let x = ocTexRand() * s, y = ocTexRand() * s;
    for (let k = 0; k < 9; k++) {
      ctx.fillRect(x, y, 3, 1);
      x += 4;
      y += (ocTexRand() - 0.5) * 6;
    }
  }
}
function ocDrawSidewalk(ctx, s) {
  ctx.fillStyle = '#2e3238';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = ocTexRand() < 0.5 ? '#2a2e34' : '#33373e';
    ctx.fillRect(Math.floor(ocTexRand() * s), Math.floor(ocTexRand() * s), 2, 2);
  }
  ctx.fillStyle = '#23262c';
  const step = Math.floor(s / 4);
  for (let x = 0; x <= s; x += step) ctx.fillRect(x, 0, 1, s);
  for (let y = 0; y <= s; y += step) ctx.fillRect(0, y, s, 1);
}
function ocDrawGround(ctx, s) {
  ctx.fillStyle = '#171a1f';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = ocTexRand() < 0.5 ? '#14171c' : '#1b1f25';
    ctx.fillRect(Math.floor(ocTexRand() * s), Math.floor(ocTexRand() * s), 2, 2);
  }
}
function ocCanvasTex(size, draw, rx, ry) {
  try {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    draw(ctx, size);
    const tx = new CanvasTexture(cv);
    tx.wrapS = RepeatWrapping;
    tx.wrapT = RepeatWrapping;
    tx.repeat.set(rx || 1, ry || 1);
    tx.colorSpace = SRGBColorSpace;
    tx.anisotropy = ocMaxAniso || 1;
    return tx;
  } catch (e) {
    return null;
  }
}

// ---------- district layout ----------
const OC_ROADS = [-60, -20, 20, 60];
const OC_ROAD_W = 8;
const OC_HALF = 80;
const OC_CYCLE = 240; // seconds per full day
const OC_T0 = 1 / 12; // start at 08:00 (t=0 is 06:00 sunrise)

function ocOnRoadX(x) {
  for (let i = 0; i < OC_ROADS.length; i++) {
    if (Math.abs(x - OC_ROADS[i]) < OC_ROAD_W / 2) return true;
  }
  return false;
}
function ocGroundY(x, z) {
  if (ocOnRoadX(x) || ocOnRoadX(z)) return 0.02;
  return 0.12;
}

// block bands between roads (same spacing on x and z)
const OC_BANDS = (function () {
  const edges = [-OC_HALF];
  for (let i = 0; i < OC_ROADS.length; i++) {
    edges.push(OC_ROADS[i] - OC_ROAD_W / 2, OC_ROADS[i] + OC_ROAD_W / 2);
  }
  edges.push(OC_HALF);
  const bands = [];
  for (let i = 0; i < edges.length; i += 2) bands.push([edges[i], edges[i + 1]]);
  return bands;
})();

// ---------- collision (circle vs AABB list) ----------
const ocColliders = []; // {x0,z0,x1,z1}
function ocAddCollider(cx, cz, w, d, margin) {
  const m = margin === undefined ? 0.3 : margin;
  ocColliders.push({ x0: cx - w / 2 - m, z0: cz - d / 2 - m, x1: cx + w / 2 + m, z1: cz + d / 2 + m });
}
function ocResolveCollisions(px, pz, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < ocColliders.length; i++) {
      const c = ocColliders[i];
      const nx = ocClamp(px, c.x0, c.x1);
      const nz = ocClamp(pz, c.z0, c.z1);
      const dx = px - nx, dz = pz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * r;
          pz = nz + (dz / d) * r;
        } else {
          const ex0 = px - c.x0, ex1 = c.x1 - px;
          const ez0 = pz - c.z0, ez1 = c.z1 - pz;
          const m = Math.min(ex0, ex1, ez0, ez1);
          if (m === ex0) px = c.x0 - r;
          else if (m === ex1) px = c.x1 + r;
          else if (m === ez0) pz = c.z0 - r;
          else pz = c.z1 + r;
        }
      }
    }
  }
  return [px, pz];
}

// ---------- shared state ----------
let ocRenderer = null;
let ocScene = null;
let ocCamera = null;
let ocSun = null, ocMoon = null, ocHemi = null;
let ocSkyU = null, ocStars = null, ocSunDisc = null, ocMoonDisc = null;
let ocLitWinMat = null, ocLampGlowMat = null, ocLampPoolMat = null;
let ocHeadMat = null, ocTailMat = null, ocLampHeadMat = null;
let ocStoreMat = null, ocBeamMat = null, ocCloudMat = null;
let ocBarGlowA = null, ocBarGlowB = null;
let ocMaxAniso = 1;
const ocClouds = [];
const OC_WHITE = new Color(0xffffff);
let ocTime = OC_T0;      // day-cycle position 0..1
let ocDayF = 1, ocDuskF = 0, ocNightF = 0;
let ocFrame = 0;
let ocFpsEma = 60;
const ocPeds = [];
const ocBuildings2D = []; // {x0,z0,x1,z1} for minimap

function ocInitRenderer(canvas) {
  try {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const r = new WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, ocIsMobile() ? 1.5 : 2));
    r.setSize(window.innerWidth || 800, window.innerHeight || 600);
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFSoftShadowMap;
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = SRGBColorSpace;
    try { ocMaxAniso = r.capabilities.getMaxAnisotropy(); } catch (e) { ocMaxAniso = 1; }
    return r;
  } catch (e) {
    return null;
  }
}

function ocInitScene() {
  ocScene = new Scene();
  ocScene.background = new Color(0x87a6c0);
  ocScene.fog = new Fog(0xbfd9e8, 60, 340);

  ocCamera = new PerspectiveCamera(60, (window.innerWidth || 800) / (window.innerHeight || 600), 0.1, 900);

  ocHemi = new HemisphereLight(0xbfd9e8, 0x2a2620, 0.7);
  ocScene.add(ocHemi);
  ocScene.add(new AmbientLight(0xffffff, 0.06));

  ocSun = new DirectionalLight(0xfff4e0, 2.2);
  ocSun.castShadow = true;
  const ocShadowSize = ocIsMobile() ? 1024 : 2048;
  ocSun.shadow.mapSize.width = ocShadowSize;
  ocSun.shadow.mapSize.height = ocShadowSize;
  ocSun.shadow.camera.left = -70;
  ocSun.shadow.camera.right = 70;
  ocSun.shadow.camera.top = 70;
  ocSun.shadow.camera.bottom = -70;
  ocSun.shadow.camera.near = 10;
  ocSun.shadow.camera.far = 400;
  ocSun.shadow.bias = -0.0001;
  ocSun.shadow.normalBias = 0.02;
  ocScene.add(ocSun);
  ocScene.add(ocSun.target);

  ocMoon = new DirectionalLight(0x9db8e8, 0.0);
  ocMoon.position.set(-60, 80, -40);
  ocScene.add(ocMoon);
  ocScene.add(ocMoon.target);

  // gradient sky dome with sun glow, horizon haze, and dithering
  ocSkyU = {
    topColor: { value: new Color(0x3a7bd5) },
    botColor: { value: new Color(0xbfd9e8) },
    sunDir: { value: new Vector3(0, 1, 0) },
    glowColor: { value: new Color(0xfff4e0) }
  };
  const skyMat = new ShaderMaterial({
    uniforms: ocSkyU,
    side: BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 ocPos;\nvoid main() {\n  ocPos = position;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
    fragmentShader: 'uniform vec3 topColor;\nuniform vec3 botColor;\nuniform vec3 sunDir;\nuniform vec3 glowColor;\nvarying vec3 ocPos;\nvoid main() {\n  vec3 nrm = normalize(ocPos);\n  float h = nrm.y;\n  vec3 col = mix(botColor, topColor, pow(max(h, 0.0), 0.55));\n  col = mix(col, botColor * 0.45, clamp(-h * 3.0, 0.0, 1.0));\n  float hz = 1.0 - abs(h);\n  col = mix(col, botColor, hz * hz * 0.35);\n  float s = max(dot(nrm, normalize(sunDir)), 0.0);\n  col += glowColor * (pow(s, 120.0) * 0.9 + pow(s, 10.0) * 0.28);\n  float dth = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);\n  col += (dth - 0.5) / 255.0;\n  gl_FragColor = vec4(col, 1.0);\n}'
  });
  ocScene.add(new Mesh(new SphereGeometry(380, 24, 16), skyMat));

  // stars (upper hemisphere)
  const starCount = 600;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const th = ocRand() * Math.PI * 2;
    const ph = Math.acos(ocRand() * 0.92);
    const rr = 355;
    sp[i * 3] = rr * Math.sin(ph) * Math.cos(th);
    sp[i * 3 + 1] = rr * Math.cos(ph) + 10;
    sp[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new BufferAttribute(sp, 3));
  ocStars = new Points(sg, new PointsMaterial({
    color: 0xcfe0ff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0, fog: false, depthWrite: false
  }));
  ocScene.add(ocStars);

  // sun / moon discs
  ocSunDisc = new Mesh(new CircleGeometry(14, 24), new MeshBasicMaterial({ color: 0xfff3c4, fog: false, transparent: true }));
  ocMoonDisc = new Mesh(new CircleGeometry(9, 24), new MeshBasicMaterial({ color: 0xdfe8ff, fog: false, transparent: true, opacity: 0 }));
  ocScene.add(ocSunDisc);
  ocScene.add(ocMoonDisc);
}

function ocInitClouds() {
  ocCloudMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  const puff = new SphereGeometry(1, 10, 8);
  for (let i = 0; i < 8; i++) {
    const cl = new Group();
    const n = 3 + Math.floor(ocRand() * 3);
    for (let k = 0; k < n; k++) {
      const m = new Mesh(puff, ocCloudMat);
      const s = ocRange(4, 9);
      m.scale.set(s * ocRange(1.2, 1.9), s * 0.55, s);
      m.position.set(k * ocRange(4, 7) - n * 2.5, ocRange(-1, 1.5), ocRange(-3, 3));
      cl.add(m);
    }
    cl.position.set(ocRange(-300, 300), ocRange(95, 140), ocRange(-300, 300));
    cl.userData.v = ocRange(1.0, 2.4);
    ocScene.add(cl);
    ocClouds.push(cl);
  }
}

function ocInitStreets() {
  const g = ocScene;
  const groundTex = ocCanvasTex(128, ocDrawGround, 90, 90);
  const ground = new Mesh(
    new PlaneGeometry(760, 760),
    new MeshStandardMaterial({ color: groundTex ? 0xffffff : 0x171a1f, roughness: 1, metalness: 0 })
  );
  if (groundTex) ground.material.map = groundTex;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  const roadTexX = ocCanvasTex(128, ocDrawAsphalt, 40, 2);
  const roadTexZ = ocCanvasTex(128, ocDrawAsphalt, 2, 40);
  const roadMatX = new MeshStandardMaterial({ color: roadTexX ? 0xffffff : 0x23262b, roughness: 0.95, metalness: 0 });
  const roadMatZ = new MeshStandardMaterial({ color: roadTexZ ? 0xffffff : 0x23262b, roughness: 0.95, metalness: 0 });
  if (roadTexX) roadMatX.map = roadTexX;
  if (roadTexZ) roadMatZ.map = roadTexZ;
  const roadGeoX = new PlaneGeometry(OC_HALF * 2, OC_ROAD_W);
  const roadGeoZ = new PlaneGeometry(OC_ROAD_W, OC_HALF * 2);
  for (let i = 0; i < OC_ROADS.length; i++) {
    const c = OC_ROADS[i];
    const rx = new Mesh(roadGeoX, roadMatX);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.02, c);
    rx.receiveShadow = true;
    g.add(rx);
    const rz = new Mesh(roadGeoZ, roadMatZ);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(c, 0.025, 0);
    rz.receiveShadow = true;
    g.add(rz);
  }

  // block slabs (sidewalk level)
  const slabTex = ocCanvasTex(128, ocDrawSidewalk, 6, 6);
  const slabMat = new MeshStandardMaterial({ color: slabTex ? 0xffffff : 0x2e3238, roughness: 0.9, metalness: 0 });
  if (slabTex) slabMat.map = slabTex;
  for (let bi = 0; bi < OC_BANDS.length; bi++) {
    for (let bj = 0; bj < OC_BANDS.length; bj++) {
      const bx = OC_BANDS[bi], bz = OC_BANDS[bj];
      const w = bx[1] - bx[0], d = bz[1] - bz[0];
      const slab = new Mesh(new BoxGeometry(w, 0.12, d), slabMat);
      slab.position.set((bx[0] + bx[1]) / 2, 0.06, (bz[0] + bz[1]) / 2);
      slab.receiveShadow = true;
      g.add(slab);
    }
  }

  // solid edge lines along road borders (instanced)
  const edgeXf = [];
  const dummy = new Object3D();
  for (let i = 0; i < OC_ROADS.length; i++) {
    const c = OC_ROADS[i];
    for (let s = -OC_HALF + 4; s < OC_HALF - 4; s += 4) {
      if (ocOnRoadX(s)) continue; // skip intersections
      const e = OC_ROAD_W / 2 - 0.5;
      edgeXf.push({ p: [c - e, 0.035, s], alongX: false });
      edgeXf.push({ p: [c + e, 0.035, s], alongX: false });
      edgeXf.push({ p: [s, 0.035, c - e], alongX: true });
      edgeXf.push({ p: [s, 0.035, c + e], alongX: true });
    }
  }
  const edgeGeo = new PlaneGeometry(0.18, 3.9);
  const edgeMat = new MeshBasicMaterial({ color: 0x9aa0a8 });
  const edges = new InstancedMesh(edgeGeo, edgeMat, edgeXf.length);
  for (let i = 0; i < edgeXf.length; i++) {
    dummy.position.set(edgeXf[i].p[0], edgeXf[i].p[1], edgeXf[i].p[2]);
    dummy.rotation.set(-Math.PI / 2, 0, edgeXf[i].alongX ? Math.PI / 2 : 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    edges.setMatrixAt(i, dummy.matrix);
  }
  edges.instanceMatrix.needsUpdate = true;
  edges.receiveShadow = true;
  g.add(edges);

  // lane dashes (instanced)
  const dashXf = [];
  for (let i = 0; i < OC_ROADS.length; i++) {
    const c = OC_ROADS[i];
    for (let s = -OC_HALF + 4; s < OC_HALF - 4; s += 4) {
      if (ocOnRoadX(s)) continue; // skip intersections
      dummy.position.set(c, 0.035, s);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashXf.push({ p: [c, 0.035, s], alongX: false });
      dummy.position.set(s, 0.035, c);
      dummy.updateMatrix();
      dashXf.push({ p: [s, 0.035, c], alongX: true });
    }
  }
  const dashGeo = new PlaneGeometry(0.25, 2);
  const dashMat = new MeshBasicMaterial({ color: 0xbfae5a });
  const dashes = new InstancedMesh(dashGeo, dashMat, dashXf.length);
  for (let i = 0; i < dashXf.length; i++) {
    dummy.position.set(dashXf[i].p[0], dashXf[i].p[1], dashXf[i].p[2]);
    dummy.rotation.set(-Math.PI / 2, 0, dashXf[i].alongX ? Math.PI / 2 : 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  dashes.instanceMatrix.needsUpdate = true;
  dashes.receiveShadow = true;
  g.add(dashes);

  // crosswalks at intersections (instanced stripes)
  const stripeXf = [];
  for (let i = 0; i < OC_ROADS.length; i++) {
    for (let j = 0; j < OC_ROADS.length; j++) {
      const cx = OC_ROADS[i], cz = OC_ROADS[j];
      for (let s = -2.5; s <= 2.5; s += 1) {
        stripeXf.push({ p: [cx + s, 0.035, cz - OC_ROAD_W / 2 + 1.2], alongX: true });
        stripeXf.push({ p: [cx + OC_ROAD_W / 2 - 1.2, 0.035, cz + s], alongX: false });
      }
    }
  }
  const stripeGeo = new PlaneGeometry(0.55, 2.4);
  const stripeMat = new MeshBasicMaterial({ color: 0xcfd3d8 });
  const stripes = new InstancedMesh(stripeGeo, stripeMat, stripeXf.length);
  for (let i = 0; i < stripeXf.length; i++) {
    dummy.position.set(stripeXf[i].p[0], stripeXf[i].p[1], stripeXf[i].p[2]);
    dummy.rotation.set(-Math.PI / 2, 0, stripeXf[i].alongX ? Math.PI / 2 : 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    stripes.setMatrixAt(i, dummy.matrix);
  }
  stripes.instanceMatrix.needsUpdate = true;
  stripes.receiveShadow = true;
  g.add(stripes);
}

function ocPushWindows(sx, sz, fw, fd, y0, h, glassXf, litXf) {
  const floors = Math.max(1, Math.floor((h - 2) / 3.2));
  const colsX = Math.max(1, Math.floor(fw / 2.4));
  const colsZ = Math.max(1, Math.floor(fd / 2.4));
  for (let f = 0; f < floors; f++) {
    const wy = y0 + 2.2 + f * 3.2;
    if (wy > y0 + h - 1.2) break;
    for (let cxi = 0; cxi < colsX; cxi++) {
      const wx = sx + (cxi + 0.5 - colsX / 2) * (fw / colsX);
      const rec = ocRand() < 0.45 ? litXf : glassXf;
      rec.push({ p: [wx, wy, sz + fd / 2 + 0.06], ry: 0 });
      rec.push({ p: [wx, wy, sz - fd / 2 - 0.06], ry: Math.PI });
    }
    for (let czi = 0; czi < colsZ; czi++) {
      const wz = sz + (czi + 0.5 - colsZ / 2) * (fd / colsZ);
      const rec = ocRand() < 0.45 ? litXf : glassXf;
      rec.push({ p: [sx + fw / 2 + 0.06, wy, wz], ry: Math.PI / 2 });
      rec.push({ p: [sx - fw / 2 - 0.06, wy, wz], ry: -Math.PI / 2 });
    }
  }
}

function ocInitBuildings() {
  const g = ocScene;
  const dummy = new Object3D();
  const facades = [0x8a8f96, 0x9c8d7a, 0x7d8a99, 0xa3a3a3, 0x8c7f74, 0x6f7f8c].map(function (c) {
    return new MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 });
  });
  const roofMat = new MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95, metalness: 0 });
  const trimMat = new MeshStandardMaterial({ color: 0x2c3138, roughness: 0.9, metalness: 0 });

  const glassXf = []; // {p:[x,y,z], ry}
  const litXf = [];
  const storeXf = []; // {p:[x,y,z], ry, w}

  for (let bi = 0; bi < OC_BANDS.length; bi++) {
    for (let bj = 0; bj < OC_BANDS.length; bj++) {
      const bx = OC_BANDS[bi], bz = OC_BANDS[bj];
      const bw = bx[1] - bx[0], bd = bz[1] - bz[0];
      const cols = Math.max(1, Math.round((bw - 4) / 15));
      const rows = Math.max(1, Math.round((bd - 4) / 15));
      const fw = Math.min(12, (bw - 4) / cols - 3);
      const fd = Math.min(12, (bd - 4) / rows - 3);
      for (let ci = 0; ci < cols; ci++) {
        for (let cj = 0; cj < rows; cj++) {
          const sx = cols > 1 ? bx[0] + 2 + fw / 2 + ci * ((bw - 4 - fw) / (cols - 1)) : (bx[0] + bx[1]) / 2;
          const sz = rows > 1 ? bz[0] + 2 + fd / 2 + cj * ((bd - 4 - fd) / (rows - 1)) : (bz[0] + bz[1]) / 2;
          const distC = Math.sqrt(sx * sx + sz * sz);
          const hBase = 10 + (1 - Math.min(1, distC / 120)) * 30;
          const h = ocClamp(hBase * ocRange(0.7, 1.3), 6, 46);
          const tiered = h > 24;
          const hLow = tiered ? h * 0.62 : h;
          const b = new Mesh(new BoxGeometry(fw, hLow, fd), ocPick(facades));
          b.position.set(sx, 0.12 + hLow / 2, sz);
          b.castShadow = true;
          b.receiveShadow = true;
          g.add(b);
          let topW = fw, topD = fd, topY = 0.12 + hLow;
          if (tiered) {
            topW = fw * 0.68;
            topD = fd * 0.68;
            const hUp = h - hLow;
            const up = new Mesh(new BoxGeometry(topW, hUp, topD), ocPick(facades));
            up.position.set(sx, 0.12 + hLow + hUp / 2, sz);
            up.castShadow = true;
            up.receiveShadow = true;
            g.add(up);
            const lip = new Mesh(new BoxGeometry(fw + 0.3, 0.35, fd + 0.3), roofMat);
            lip.position.set(sx, 0.12 + hLow + 0.17, sz);
            g.add(lip);
            ocPushWindows(sx, sz, topW, topD, 0.12 + hLow, hUp, glassXf, litXf);
            topY = 0.12 + h;
          }
          const cap = new Mesh(new BoxGeometry(topW + 0.4, 0.5, topD + 0.4), roofMat);
          cap.position.set(sx, topY + 0.25, sz);
          cap.castShadow = true;
          g.add(cap);
          // rooftop props
          const nProp = Math.floor(ocRand() * 3);
          for (let k = 0; k < nProp; k++) {
            if (ocRand() < 0.5) {
              const ac = new Mesh(new BoxGeometry(1.6, 1.1, 1.6), trimMat);
              ac.position.set(sx + ocRange(-topW / 4, topW / 4), topY + 0.5 + 0.55, sz + ocRange(-topD / 4, topD / 4));
              ac.castShadow = true;
              g.add(ac);
            } else {
              const tank = new Mesh(new CylinderGeometry(1, 1, 2.4, 10), trimMat);
              tank.position.set(sx + ocRange(-topW / 4, topW / 4), topY + 0.5 + 1.2, sz + ocRange(-topD / 4, topD / 4));
              tank.castShadow = true;
              g.add(tank);
            }
          }
          ocAddCollider(sx, sz, fw, fd, 0.3);
          ocBuildings2D.push({ x0: sx - fw / 2, z0: sz - fd / 2, x1: sx + fw / 2, z1: sz + fd / 2 });

          ocPushWindows(sx, sz, fw, fd, 0.12, hLow, glassXf, litXf);

          // ground-floor storefront band (glows at night)
          if (ocRand() < 0.55) {
            storeXf.push({ p: [sx, 1.05, sz + fd / 2 + 0.07], ry: 0, w: fw * 0.78 });
            storeXf.push({ p: [sx, 1.05, sz - fd / 2 - 0.07], ry: Math.PI, w: fw * 0.78 });
            storeXf.push({ p: [sx + fw / 2 + 0.07, 1.05, sz], ry: Math.PI / 2, w: fd * 0.78 });
            storeXf.push({ p: [sx - fw / 2 - 0.07, 1.05, sz], ry: -Math.PI / 2, w: fd * 0.78 });
          }
        }
      }
    }
  }

  const winGeo = new PlaneGeometry(1.2, 1.6);
  const ocTint = new Color();
  const glassMat = new MeshStandardMaterial({ color: 0x1a2530, roughness: 0.25, metalness: 0.6 });
  const glass = new InstancedMesh(winGeo, glassMat, Math.max(1, glassXf.length));
  for (let i = 0; i < glassXf.length; i++) {
    dummy.position.set(glassXf[i].p[0], glassXf[i].p[1], glassXf[i].p[2]);
    dummy.rotation.set(0, glassXf[i].ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    glass.setMatrixAt(i, dummy.matrix);
    ocTint.setHSL(0.58, ocRange(0.05, 0.3), ocRange(0.7, 1.0));
    glass.setColorAt(i, ocTint);
  }
  glass.count = glassXf.length;
  glass.instanceMatrix.needsUpdate = true;
  if (glass.instanceColor) glass.instanceColor.needsUpdate = true;
  g.add(glass);

  ocLitWinMat = new MeshBasicMaterial({ color: 0xffca7a, transparent: true, opacity: 0 });
  const lit = new InstancedMesh(winGeo, ocLitWinMat, Math.max(1, litXf.length));
  for (let i = 0; i < litXf.length; i++) {
    dummy.position.set(litXf[i].p[0], litXf[i].p[1], litXf[i].p[2]);
    dummy.rotation.set(0, litXf[i].ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lit.setMatrixAt(i, dummy.matrix);
    ocTint.setHSL(0.09, ocRange(0.45, 0.75), ocRange(0.55, 0.8));
    lit.setColorAt(i, ocTint);
  }
  lit.count = litXf.length;
  lit.instanceMatrix.needsUpdate = true;
  if (lit.instanceColor) lit.instanceColor.needsUpdate = true;
  g.add(lit);

  ocStoreMat = new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 });
  const store = new InstancedMesh(new PlaneGeometry(1, 1.7), ocStoreMat, Math.max(1, storeXf.length));
  for (let i = 0; i < storeXf.length; i++) {
    dummy.position.set(storeXf[i].p[0], storeXf[i].p[1], storeXf[i].p[2]);
    dummy.rotation.set(0, storeXf[i].ry, 0);
    dummy.scale.set(storeXf[i].w, 1, 1);
    dummy.updateMatrix();
    store.setMatrixAt(i, dummy.matrix);
  }
  store.count = storeXf.length;
  store.instanceMatrix.needsUpdate = true;
  g.add(store);
}

function ocInitLamps() {
  const g = ocScene;
  const dummy = new Object3D();
  const spots = [];
  for (let i = 0; i < OC_ROADS.length; i++) {
    const c = OC_ROADS[i];
    for (let s = -70; s <= 70; s += 20) {
      if (ocOnRoadX(s)) continue;
      const side = ((s / 20) % 2 === 0) ? 1 : -1;
      spots.push({ x: c + side * (OC_ROAD_W / 2 + 1.2), z: s, dx: -side, dz: 0 });
      spots.push({ x: s, z: c - side * (OC_ROAD_W / 2 + 1.2), dx: 0, dz: side });
    }
  }
  const poleGeo = new CylinderGeometry(0.1, 0.14, 4.6, 8);
  const poleMat = new MeshStandardMaterial({ color: 0x30353c, roughness: 0.7, metalness: 0.4 });
  const poles = new InstancedMesh(poleGeo, poleMat, spots.length);
  const armGeo = new CylinderGeometry(0.07, 0.07, 1.7, 8);
  const arms = new InstancedMesh(armGeo, poleMat, spots.length);
  const shades = new InstancedMesh(new ConeGeometry(0.45, 0.4, 10), poleMat, spots.length);
  ocLampHeadMat = new MeshBasicMaterial({ color: 0xffe2b0 });
  const heads = new InstancedMesh(new SphereGeometry(0.26, 10, 8), ocLampHeadMat, spots.length);
  ocLampGlowMat = new MeshBasicMaterial({
    color: 0xffbe78, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false, fog: false
  });
  const glows = new InstancedMesh(new SphereGeometry(0.95, 10, 8), ocLampGlowMat, spots.length);
  ocLampPoolMat = new MeshBasicMaterial({
    color: 0xffbe78, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false
  });
  const pools = new InstancedMesh(new CircleGeometry(3, 16), ocLampPoolMat, spots.length);
  for (let i = 0; i < spots.length; i++) {
    const sx = spots[i].x, sz = spots[i].z;
    const dx = spots[i].dx, dz = spots[i].dz;
    const gy = ocGroundY(sx, sz);
    const hx = sx + dx * 1.5, hz = sz + dz * 1.5;
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(sx, gy + 2.3, sz);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    if (dx !== 0) dummy.rotation.set(0, 0, Math.PI / 2);
    else dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.position.set(sx + dx * 0.8, gy + 4.55, sz + dz * 0.8);
    dummy.updateMatrix();
    arms.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(hx, gy + 4.72, hz);
    dummy.updateMatrix();
    shades.setMatrixAt(i, dummy.matrix);
    dummy.position.set(hx, gy + 4.52, hz);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    glows.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.position.set(hx, gy + 0.06, hz);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  }
  poles.instanceMatrix.needsUpdate = true;
  arms.instanceMatrix.needsUpdate = true;
  shades.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  glows.instanceMatrix.needsUpdate = true;
  pools.instanceMatrix.needsUpdate = true;
  poles.castShadow = true;
  g.add(poles);
  g.add(arms);
  g.add(shades);
  g.add(heads);
  g.add(glows);
  g.add(pools);
}

function ocInitTrees() {
  const g = ocScene;
  const dummy = new Object3D();
  const spots = [];
  for (let bi = 0; bi < OC_BANDS.length; bi++) {
    for (let bj = 0; bj < OC_BANDS.length; bj++) {
      const bx = OC_BANDS[bi], bz = OC_BANDS[bj];
      spots.push([bx[0] + 1.6, bz[0] + 1.6]);
      spots.push([bx[1] - 1.6, bz[0] + 1.6]);
      spots.push([bx[0] + 1.6, bz[1] - 1.6]);
      spots.push([bx[1] - 1.6, bz[1] - 1.6]);
    }
  }
  const trunkMat = new MeshStandardMaterial({ color: 0x5a4432, roughness: 1, metalness: 0 });
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.16, 0.24, 2.2, 7),
    trunkMat,
    spots.length
  );
  const crownMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true });
  const crowns = new InstancedMesh(
    new IcosahedronGeometry(1.6, 0),
    crownMat,
    spots.length
  );
  const crowns2 = new InstancedMesh(
    new IcosahedronGeometry(1.05, 0),
    crownMat,
    spots.length
  );
  const ocLeaf = new Color();
  for (let i = 0; i < spots.length; i++) {
    const s = ocRange(0.8, 1.25);
    dummy.rotation.set(0, ocRand() * Math.PI, 0);
    dummy.scale.set(s, s, s);
    dummy.position.set(spots[i][0], 0.12 + 1.1 * s, spots[i][1]);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spots[i][0], 0.12 + (2.2 + 1.1) * s, spots[i][1]);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    ocLeaf.setHSL(0.32, ocRange(0.35, 0.55), ocRange(0.26, 0.38));
    crowns.setColorAt(i, ocLeaf);
    dummy.position.set(spots[i][0] + 0.7 * s, 0.12 + (2.2 + 2.4) * s, spots[i][1] + 0.3 * s);
    dummy.updateMatrix();
    crowns2.setMatrixAt(i, dummy.matrix);
    ocLeaf.setHSL(0.34, ocRange(0.3, 0.5), ocRange(0.2, 0.3));
    crowns2.setColorAt(i, ocLeaf);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  crowns2.instanceMatrix.needsUpdate = true;
  if (crowns2.instanceColor) crowns2.instanceColor.needsUpdate = true;
  trunks.castShadow = true;
  crowns.castShadow = true;
  crowns2.castShadow = true;
  g.add(trunks);
  g.add(crowns);
  g.add(crowns2);
}

function ocInitCars() {
  const g = ocScene;
  const palette = [0xb03a2e, 0x2e5fa3, 0xc7c9cc, 0x3b3f45, 0x7a4fa3, 0x3f8f5f, 0xc7a23a];
  for (let i = 0; i < 10; i++) {
    const road = OC_ROADS[i % OC_ROADS.length];
    const alongZ = i % 2 === 0;
    const band = OC_BANDS[1 + (i % 3)];
    const s = (band[0] + band[1]) / 2 + ocRange(-4, 4);
    const side = i % 4 < 2 ? 1 : -1;
    const px = alongZ ? road + side * (OC_ROAD_W / 2 - 1.3) : s;
    const pz = alongZ ? s : road + side * (OC_ROAD_W / 2 - 1.3);
    const built = ocBuildSedan(palette[i % palette.length]);
    const car = built.group;
    car.position.set(px, 0.02, pz);
    if (!alongZ) car.rotation.y = Math.PI / 2;
    g.add(car);
    ocAddCollider(px, pz, alongZ ? 2.1 : 4.4, alongZ ? 4.4 : 2.1, 0.25);
  }
}

// ---------- low-poly people ----------
function ocMakePerson(opt) {
  const group = new Group();
  const skin = new MeshStandardMaterial({ color: opt.skin, roughness: 0.8, metalness: 0 });
  const jacket = new MeshStandardMaterial({ color: opt.jacket, roughness: 0.85, metalness: 0 });
  const pants = new MeshStandardMaterial({ color: opt.pants, roughness: 0.9, metalness: 0 });
  const hatM = new MeshStandardMaterial({ color: opt.hat, roughness: 0.9, metalness: 0 });

  const legGeo = new BoxGeometry(0.22, 0.75, 0.24);
  legGeo.translate(0, -0.375, 0);
  const legL = new Mesh(legGeo, pants);
  legL.position.set(-0.14, 0.75, 0);
  const legR = new Mesh(legGeo, pants);
  legR.position.set(0.14, 0.75, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  group.add(legL);
  group.add(legR);
  const shoeGeo = new BoxGeometry(0.24, 0.12, 0.36);
  const shoeM = new MeshStandardMaterial({ color: 0x141518, roughness: 0.9, metalness: 0 });
  const shoeL = new Mesh(shoeGeo, shoeM);
  shoeL.position.set(0, -0.69, 0.05);
  legL.add(shoeL);
  const shoeR = new Mesh(shoeGeo, shoeM);
  shoeR.position.set(0, -0.69, 0.05);
  legR.add(shoeR);

  const torso = new Mesh(new CapsuleGeometry(0.24, 0.45, 4, 10), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);

  const armGeo = new BoxGeometry(0.17, 0.62, 0.19);
  armGeo.translate(0, -0.31, 0);
  const armL = new Mesh(armGeo, jacket);
  armL.position.set(-0.4, 1.5, 0);
  const armR = new Mesh(armGeo, jacket);
  armR.position.set(0.4, 1.5, 0);
  armL.castShadow = true;
  armR.castShadow = true;
  group.add(armL);
  group.add(armR);
  const handGeo = new SphereGeometry(0.1, 10, 8);
  const handL = new Mesh(handGeo, skin);
  handL.position.set(0, -0.62, 0);
  armL.add(handL);
  const handR = new Mesh(handGeo, skin);
  handR.position.set(0, -0.62, 0);
  armR.add(handR);

  const head = new Mesh(new SphereGeometry(0.22, 14, 12), skin);
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);
  const brim = new Mesh(new BoxGeometry(0.3, 0.06, 0.26), hatM);
  brim.position.set(0, 1.99, 0.16);
  group.add(brim);
  const crown = new Mesh(new CylinderGeometry(0.2, 0.22, 0.14, 12), hatM);
  crown.position.set(0, 2.06, 0);
  group.add(crown);

  return { group: group, legL: legL, legR: legR, armL: armL, armR: armR, phase: ocRand() * 6.28 };
}

function ocAnimatePerson(p, speedF, dt) {
  p.phase += dt * (2 + 9 * speedF);
  const sw = Math.sin(p.phase) * 0.6 * speedF;
  p.legL.rotation.x = sw;
  p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.75;
  p.armR.rotation.x = sw * 0.75;
  p.group.position.y = p.baseY + Math.abs(Math.sin(p.phase)) * 0.06 * speedF;
}

// ---------- player ----------
const ocPlayer = {
  p: null, vel: { x: 0, z: 0 }, vy: 0, yaw: Math.PI,
  grounded: true, sprinting: false, moving: false
};

function ocInitPlayer() {
  ocPlayer.p = ocMakePerson({ skin: 0xcaa07a, jacket: 0x2e8b8b, pants: 0x23252c, hat: 0x2a2118 });
  ocPlayer.p.group.position.set(20, ocGroundY(20, 40), 40);
  ocPlayer.p.baseY = ocGroundY(20, 40);
  ocPlayer.p.group.rotation.y = ocPlayer.yaw;
  ocScene.add(ocPlayer.p.group);
}

// ---------- pedestrians ----------
const OC_PED_STYLE = [
  { skin: 0x8a5f43, jacket: 0x7a3b2e, pants: 0x2c2f36, hat: 0x1d1d22 },
  { skin: 0xd9b08c, jacket: 0x3e5f8a, pants: 0x3a3f45, hat: 0x4a3220 },
  { skin: 0xcaa07a, jacket: 0x5f8a3e, pants: 0x23252c, hat: 0x22242a },
  { skin: 0x6e4a35, jacket: 0x8a6f3e, pants: 0x2c2f36, hat: 0x5a1f1f },
  { skin: 0xe0c09a, jacket: 0x666f7a, pants: 0x1f2228, hat: 0x2e4a5a }
];

function ocInitPeds() {
  for (let i = 0; i < 10; i++) {
    const style = OC_PED_STYLE[i % OC_PED_STYLE.length];
    const p = ocMakePerson(style);
    const s = ocRange(0.93, 1.05);
    p.group.scale.set(s, s, s);
    // loop waypoints around a block sidewalk
    const bx = OC_BANDS[1 + (i % 3)], bz = OC_BANDS[1 + ((i + 1) % 3)];
    const m = 1.6;
    const wps = [
      [bx[0] + m, bz[0] + m], [bx[1] - m, bz[0] + m],
      [bx[1] - m, bz[1] - m], [bx[0] + m, bz[1] - m]
    ];
    const start = i % 4;
    p.group.position.set(wps[start][0], 0.12, wps[start][1]);
    p.baseY = 0.12;
    ocScene.add(p.group);
    ocPeds.push({ p: p, wps: wps, wi: (start + 1) % 4, speed: ocRange(1.0, 1.9), yaw: 0, flee: false });
  }
}

function ocUpdatePeds(dt, playerPos, spotted) {
  for (let i = 0; i < ocPeds.length; i++) {
    const ped = ocPeds[i];
    const gp = ped.p.group.position;
    const dxp = gp.x - playerPos.x, dzp = gp.z - playerPos.z;
    const pd = Math.sqrt(dxp * dxp + dzp * dzp);
    ped.flee = spotted && pd < 14;
    let mvx, mvz, sp;
    if (ped.flee && pd > 0.01) {
      mvx = dxp / pd; mvz = dzp / pd; sp = 4.5;
    } else {
      const wp = ped.wps[ped.wi];
      const dx = wp[0] - gp.x, dz = wp[1] - gp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.7) {
        ped.wi = (ped.wi + 1) % ped.wps.length;
        mvx = 0; mvz = 0; sp = 0;
      } else {
        mvx = dx / d; mvz = dz / d; sp = ped.speed;
      }
    }
    if (sp > 0) {
      let nx = gp.x + mvx * sp * dt;
      let nz = gp.z + mvz * sp * dt;
      nx = ocClamp(nx, -OC_HALF + 1, OC_HALF - 1);
      nz = ocClamp(nz, -OC_HALF + 1, OC_HALF - 1);
      const res = ocResolveCollisions(nx, nz, 0.4);
      gp.x = res[0];
      gp.z = res[1];
      ped.yaw = ocLerpAngle(ped.yaw, Math.atan2(mvx, mvz), dt * 8);
      ped.p.group.rotation.y = ped.yaw;
    }
    ped.p.baseY = ocGroundY(gp.x, gp.z);
    ocAnimatePerson(ped.p, sp > 0 ? Math.min(1, sp / 5) : 0, dt);
  }
}

// ---------- touch: tap-to-move ----------
let ocTapTarget = null; // {x, z}
let ocTapMarker = null;
let ocLastTapT = 0;

function ocIsMobile() {
  try {
    if (typeof window !== 'undefined' && window && ('ontouchstart' in window)) return true;
    if (typeof navigator !== 'undefined' && navigator && navigator.maxTouchPoints > 0) return true;
  } catch (e) { /* assume desktop */ }
  return false;
}

function ocTapRay(cx, cy) {
  const w = (window.innerWidth || 800), h = (window.innerHeight || 600);
  const r = new Raycaster();
  r.setFromCamera(new Vector2((cx / w) * 2 - 1, -(cy / h) * 2 + 1), ocCamera);
  return r;
}

function ocTapWorld(cx, cy) {
  const r = ocTapRay(cx, cy);
  const o = r.ray.origin, d = r.ray.direction;
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (0.12 - o.y) / d.y;
  if (t < 0) return null;
  return {
    x: ocClamp(o.x + d.x * t, -OC_HALF + 1, OC_HALF - 1),
    z: ocClamp(o.z + d.z * t, -OC_HALF + 1, OC_HALF - 1)
  };
}

function ocInitTapMarker() {
  ocTapMarker = new Mesh(new TorusGeometry(0.7, 0.08, 8, 24), new MeshBasicMaterial({ color: 0xffd34d }));
  ocTapMarker.rotation.x = -Math.PI / 2;
  ocTapMarker.visible = false;
  ocScene.add(ocTapMarker);
}

function ocShowTapMarker(x, z) {
  if (!ocTapMarker) return;
  ocTapMarker.position.set(x, ocGroundY(x, z) + 0.15, z);
  ocTapMarker.visible = true;
}

function ocHideTapMarker() {
  if (ocTapMarker) ocTapMarker.visible = false;
}

function ocHandleTap(cx, cy) {
  const now = Date.now();
  const dbl = (now - ocLastTapT < 350);
  ocLastTapT = now;
  // tap on the car while on foot + nearby: enter
  if (!ocCar.occupied) {
    const hits = ocTapRay(cx, cy).intersectObject(ocCar.group, true);
    if (hits.length > 0) {
      const pp = ocPlayer.p.group.position, cp = ocCar.group.position;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 3.5 && ocPlayer.grounded) {
        ocTapTarget = null;
        ocHideTapMarker();
        ocTryInteract();
        return;
      }
    }
  }
  if (dbl) {
    if (ocCar.occupied) {
      ocTapTarget = null;
      ocHideTapMarker();
      ocTryInteract(); // exit when slow, else "stop first" toast
    } else if (ocPlayer.grounded) {
      ocPlayer.vy = 7;
      ocPlayer.grounded = false;
      ocKeys.Space = false;
      ocAttention = Math.min(1, ocAttention + 0.06);
    }
    return;
  }
  const w = ocTapWorld(cx, cy);
  if (w) {
    ocTapTarget = w;
    ocShowTapMarker(w.x, w.z);
  }
}

// ---------- input + camera rig ----------
const ocKeys = {};
const ocCam = { yaw: Math.PI, pitch: 0.42, dist: 9.5 };
const ocCamPos = { x: 20, y: 6, z: 50 };

function ocSetKey(code, down) {
  ocKeys[code] = down;
  if (down && code === 'KeyN') ocTime = 17 / 24; // skip to night
  if (down && code === 'KeyE') ocTryInteract();
}

function ocInitInput(canvas) {
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyE' && e.repeat) return;
    ocSetKey(e.code, true);
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) {
      if (e.preventDefault) e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) { ocSetKey(e.code, false); });
  const ocPointers = {};
  let ocPointerN = 0;
  let ocTapCand = null; // {x, y, t, touch}
  let ocPinchD = 0;
  canvas.addEventListener('pointerdown', function (e) {
    const id = e.pointerId === undefined ? 0 : e.pointerId;
    ocPointers[id] = { x: e.clientX || 0, y: e.clientY || 0 };
    ocPointerN++;
    if (ocPointerN === 2) {
      const ks = Object.keys(ocPointers);
      const a = ocPointers[ks[0]], b = ocPointers[ks[1]];
      ocPinchD = Math.hypot(a.x - b.x, a.y - b.y);
      ocTapCand = null;
    } else if (ocPointerN === 1) {
      ocTapCand = { x: e.clientX || 0, y: e.clientY || 0, t: Date.now(), touch: e.pointerType === 'touch' };
    }
  });
  function ocPtrEnd(e) {
    const id = e && e.pointerId !== undefined ? e.pointerId : 0;
    if (ocPointers[id] !== undefined) { delete ocPointers[id]; ocPointerN--; }
    if (ocPointerN < 0) ocPointerN = 0;
    if (ocPointerN === 0 && ocTapCand && ocTapCand.touch) {
      const cx = (e && e.clientX) || ocTapCand.x, cy = (e && e.clientY) || ocTapCand.y;
      const moved = Math.hypot(cx - ocTapCand.x, cy - ocTapCand.y);
      if (moved < 12 && Date.now() - ocTapCand.t < 350) ocHandleTap(cx, cy);
    }
    if (ocPointerN === 0) ocTapCand = null;
  }
  window.addEventListener('pointerup', ocPtrEnd);
  window.addEventListener('pointercancel', ocPtrEnd);
  window.addEventListener('pointermove', function (e) {
    const id = e.pointerId === undefined ? 0 : e.pointerId;
    if (ocPointers[id] === undefined) return;
    const cx = e.clientX || 0, cy = e.clientY || 0;
    const prev = ocPointers[id];
    ocPointers[id] = { x: cx, y: cy };
    if (ocPointerN >= 2) {
      const ks = Object.keys(ocPointers);
      if (ks.length >= 2) {
        const a = ocPointers[ks[0]], b = ocPointers[ks[1]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (ocPinchD > 0) ocCam.dist = ocClamp(ocCam.dist - (d - ocPinchD) * 0.03, 5, 16);
        ocPinchD = d;
      }
      return;
    }
    if (ocTapCand && Math.hypot(cx - ocTapCand.x, cy - ocTapCand.y) > 12) ocTapCand = null;
    ocCam.yaw -= (cx - prev.x) * 0.005;
    ocCam.pitch = ocClamp(ocCam.pitch + (cy - prev.y) * 0.005, 0.1, 1.1);
  });
  canvas.addEventListener('wheel', function (e) {
    ocCam.dist = ocClamp(ocCam.dist + ((e.deltaY || 0) > 0 ? 1 : -1), 5, 16);
    if (e.preventDefault) e.preventDefault();
  });
  if (canvas.style) canvas.style.touchAction = 'none';
  window.addEventListener('resize', function () {
    if (!ocRenderer) return;
    ocCamera.aspect = (window.innerWidth || 800) / (window.innerHeight || 600);
    ocCamera.updateProjectionMatrix();
    ocRenderer.setSize(window.innerWidth || 800, window.innerHeight || 600);
  });
}

function ocUpdatePlayer(dt) {
  const keyFwd = (ocKeys.KeyW || ocKeys.ArrowUp ? 1 : 0) - (ocKeys.KeyS || ocKeys.ArrowDown ? 1 : 0);
  const keyStrafe = (ocKeys.KeyD || ocKeys.ArrowRight ? 1 : 0) - (ocKeys.KeyA || ocKeys.ArrowLeft ? 1 : 0);
  let fwd = keyFwd, strafe = keyStrafe, autoDist = 0;
  if (keyFwd !== 0 || keyStrafe !== 0) {
    ocTapTarget = null;
    ocHideTapMarker();
  } else if (ocTapTarget) {
    const gp0 = ocPlayer.p.group.position;
    const tdx = ocTapTarget.x - gp0.x, tdz = ocTapTarget.z - gp0.z;
    autoDist = Math.sqrt(tdx * tdx + tdz * tdz);
    if (autoDist < 0.9) {
      ocTapTarget = null;
      ocHideTapMarker();
      autoDist = 0;
    } else {
      const sy0 = Math.sin(ocCam.yaw), cy0 = Math.cos(ocCam.yaw);
      fwd = (-sy0 * tdx - cy0 * tdz) / autoDist;
      strafe = (cy0 * tdx - sy0 * tdz) / autoDist;
    }
  }
  ocPlayer.sprinting = autoDist > 0 ? autoDist > 12 : (!!(ocKeys.ShiftLeft || ocKeys.ShiftRight) && fwd > 0);
  ocPlayer.moving = (fwd !== 0 || strafe !== 0);
  const speed = ocPlayer.sprinting ? 9 : 5;
  // camera-relative move direction
  const sy = Math.sin(ocCam.yaw), cy = Math.cos(ocCam.yaw);
  let mx = -sy * fwd + cy * strafe;
  let mz = -cy * fwd - sy * strafe;
  const ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0.01) { mx /= ml; mz /= ml; } else { mx = 0; mz = 0; }
  const k = Math.min(1, dt * 12);
  ocPlayer.vel.x += (mx * speed - ocPlayer.vel.x) * k;
  ocPlayer.vel.z += (mz * speed - ocPlayer.vel.z) * k;

  const gp = ocPlayer.p.group.position;
  let nx = ocClamp(gp.x + ocPlayer.vel.x * dt, -OC_HALF + 1, OC_HALF - 1);
  let nz = ocClamp(gp.z + ocPlayer.vel.z * dt, -OC_HALF + 1, OC_HALF - 1);
  const res = ocResolveCollisions(nx, nz, 0.5);
  gp.x = res[0];
  gp.z = res[1];

  const gy = ocGroundY(gp.x, gp.z);
  if (ocKeys.Space && ocPlayer.grounded) {
    ocPlayer.vy = 7;
    ocPlayer.grounded = false;
    ocKeys.Space = false;
    ocAttention = Math.min(1, ocAttention + 0.06);
  }
  if (!ocPlayer.grounded) {
    ocPlayer.vy -= 20 * dt;
    ocPlayer.p.baseY += ocPlayer.vy * dt;
    if (ocPlayer.p.baseY <= gy) {
      ocPlayer.p.baseY = gy;
      ocPlayer.vy = 0;
      ocPlayer.grounded = true;
    }
  } else {
    ocPlayer.p.baseY = gy;
  }

  const hv = Math.sqrt(ocPlayer.vel.x * ocPlayer.vel.x + ocPlayer.vel.z * ocPlayer.vel.z);
  if (hv > 0.5) {
    ocPlayer.yaw = ocLerpAngle(ocPlayer.yaw, Math.atan2(ocPlayer.vel.x, ocPlayer.vel.z), dt * 10);
    ocPlayer.p.group.rotation.y = ocPlayer.yaw;
  }
  ocAnimatePerson(ocPlayer.p, ocClamp(hv / 9, 0, 1), dt);
}

function ocUpdateCamera(dt) {
  const gp = ocCar.occupied ? ocCar.group.position : ocPlayer.p.group.position;
  const tx = gp.x, ty = gp.y + (ocCar.occupied ? 1.8 : 1.6), tz = gp.z;
  const cp = Math.cos(ocCam.pitch), sp2 = Math.sin(ocCam.pitch);
  const dx = Math.sin(ocCam.yaw) * cp, dz = Math.cos(ocCam.yaw) * cp;
  const wantX = tx + dx * ocCam.dist;
  const wantY = Math.max(0.6, ty + sp2 * ocCam.dist);
  const wantZ = tz + dz * ocCam.dist;
  const k = Math.min(1, dt * 10);
  ocCamPos.x += (wantX - ocCamPos.x) * k;
  ocCamPos.y += (wantY - ocCamPos.y) * k;
  ocCamPos.z += (wantZ - ocCamPos.z) * k;
  ocCamera.position.set(ocCamPos.x, ocCamPos.y, ocCamPos.z);
  ocCamera.lookAt(tx, ty, tz);
}

// ---------- HUD + minimap ----------
let ocElClock = null, ocElPhase = null, ocElFps = null, ocElMode = null;
let ocElBadge = null, ocElBadgeText = null, ocElNogl = null;
let ocMapCtx = null;
let ocHudTimer = 0;

function ocInitHud() {
  ocElClock = document.getElementById('clock');
  ocElPhase = document.getElementById('phase');
  ocElFps = document.getElementById('fps');
  ocElMode = document.getElementById('mode');
  ocElBadge = document.getElementById('badge');
  ocElBadgeText = document.getElementById('badge-text');
  ocElNogl = document.getElementById('nogl');
  ocElMission = document.getElementById('mission');
  ocElPrompt = document.getElementById('prompt');
  ocElStars = document.getElementById('stars');
  const mm = document.getElementById('minimap');
  if (mm && typeof mm.getContext === 'function') {
    try { ocMapCtx = mm.getContext('2d'); } catch (e) { ocMapCtx = null; }
  }
  if (ocElMode && ocRenderer === null && ocElNogl && ocElNogl.style) {
    ocElNogl.style.display = 'block';
  }
  if (ocIsMobile()) {
    const help = document.getElementById('help');
    if (help) help.innerHTML = '<b>tap</b> move &middot; <b>tap car</b> enter &middot; <b>double-tap</b> jump &middot; <b>drag</b> orbit &middot; <b>pinch</b> zoom';
  }
}

function ocPhaseName(hour) {
  if (hour < 5 || hour >= 21) return 'Night';
  if (hour < 7) return 'Dawn';
  if (hour < 11) return 'Morning';
  if (hour < 15) return 'Midday';
  if (hour < 18) return 'Afternoon';
  if (hour < 21) return 'Dusk';
  return 'Night';
}

function ocUpdateHud(dt) {
  ocHudTimer -= dt;
  const hour = (ocTime * 24 + 6) % 24;
  if (ocHudTimer <= 0) {
    ocHudTimer = 0.5;
    if (ocElClock) {
      const hh = Math.floor(hour), mnt = Math.floor((hour - hh) * 60);
      ocElClock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mnt < 10 ? '0' : '') + mnt;
    }
    if (ocElPhase) ocElPhase.textContent = ocPhaseName(hour);
    if (ocElFps) ocElFps.textContent = String(Math.round(ocFpsEma));
    if (ocElMode) ocElMode.textContent = ocRenderer === null ? 'headless' : 'webgl';
  }
  if (ocElBadge && ocElBadgeText) {
    if (ocAttention > 0.03) {
      ocElBadge.style.display = 'block';
      if (ocAttention >= 1) {
        ocElBadgeText.textContent = 'SPOTTED — LAY LOW';
        ocElBadge.style.color = '#ff7d7d';
      } else {
        ocElBadgeText.textContent = 'ATTENTION ' + Math.round(ocAttention * 100) + '%';
        ocElBadge.style.color = '#ffc857';
      }
    } else {
      ocElBadge.style.display = 'none';
    }
  }
  if (ocElMission) {
    if (ocMission.stage === 'pickup') ocElMission.textContent = 'Objective: pick up the package';
    else if (ocMission.stage === 'deliver') ocElMission.textContent = 'Objective: deliver to the drop-off';
    else ocElMission.textContent = 'Deliveries: ' + ocMission.deliveries + ' — next run soon';
  }
  if (ocElStars) {
    const n = Math.min(3, Math.floor(ocWanted));
    ocElStars.textContent = n > 0 ? '★'.repeat(n) + '☆'.repeat(3 - n) : '';
  }
  if (ocPromptTimer > 0) {
    ocPromptTimer -= dt;
    if (ocPromptTimer <= 0 && ocElPrompt) ocElPrompt.style.display = 'none';
  }
  if (ocElPrompt && ocPromptTimer <= 0) {
    const near = !ocCar.occupied && ocPlayer.grounded &&
      Math.hypot(ocPlayer.p.group.position.x - ocCar.group.position.x,
        ocPlayer.p.group.position.z - ocCar.group.position.z) < 3.5;
    if (near) {
      ocElPrompt.textContent = 'E — enter vehicle';
      ocElPrompt.style.display = 'block';
    } else {
      ocElPrompt.style.display = 'none';
    }
  }
  ocDrawMinimap();
}

function ocDrawMinimap() {
  if (!ocMapCtx) return;
  const S = 148, sc = S / (OC_HALF * 2);
  function wx(x) { return (x + OC_HALF) * sc; }
  function wz(z) { return (z + OC_HALF) * sc; }
  ocMapCtx.fillStyle = '#10141a';
  ocMapCtx.fillRect(0, 0, S, S);
  ocMapCtx.fillStyle = '#262b33';
  for (let bi = 0; bi < OC_BANDS.length; bi++) {
    for (let bj = 0; bj < OC_BANDS.length; bj++) {
      const bx = OC_BANDS[bi], bz = OC_BANDS[bj];
      ocMapCtx.fillRect(wx(bx[0]), wz(bz[0]), (bx[1] - bx[0]) * sc, (bz[1] - bz[0]) * sc);
    }
  }
  ocMapCtx.fillStyle = '#171b21';
  for (let i = 0; i < ocBuildings2D.length; i++) {
    const b = ocBuildings2D[i];
    ocMapCtx.fillRect(wx(b.x0), wz(b.z0), Math.max(1, (b.x1 - b.x0) * sc), Math.max(1, (b.z1 - b.z0) * sc));
  }
  ocMapCtx.fillStyle = '#8f96a3';
  for (let i = 0; i < ocPeds.length; i++) {
    const gp = ocPeds[i].p.group.position;
    ocMapCtx.beginPath();
    ocMapCtx.arc(wx(gp.x), wz(gp.z), 1.6, 0, 6.2832);
    ocMapCtx.fill();
  }
  const tgt = ocMissionTarget();
  if (tgt) {
    ocMapCtx.fillStyle = '#ffd34d';
    ocMapCtx.beginPath();
    ocMapCtx.arc(wx(tgt.x), wz(tgt.z), 3.4, 0, 6.2832);
    ocMapCtx.fill();
  }
  const cp = ocCar.group.position;
  ocMapCtx.fillStyle = '#e08a3c';
  ocMapCtx.fillRect(wx(cp.x) - 2, wz(cp.z) - 2, 4, 4);
  if (ocPatrol.active) {
    const qp = ocPatrol.group.position;
    ocMapCtx.fillStyle = (Math.floor(ocFrame / 12) % 2 === 0) ? '#ff5555' : '#5599ff';
    ocMapCtx.fillRect(wx(qp.x) - 2, wz(qp.z) - 2, 4, 4);
  }
  const pp = ocCar.occupied ? ocCar.group.position : ocPlayer.p.group.position;
  ocMapCtx.fillStyle = '#ffffff';
  ocMapCtx.beginPath();
  ocMapCtx.arc(wx(pp.x), wz(pp.z), 2.6, 0, 6.2832);
  ocMapCtx.fill();
}

// ---------- wanted-lite attention ----------
let ocAttention = 0;

function ocUpdateAttention(dt) {
  const pp = ocCar.occupied ? ocCar.group.position : ocPlayer.p.group.position;
  let nearest = 1e9;
  for (let i = 0; i < ocPeds.length; i++) {
    const gp = ocPeds[i].p.group.position;
    const dx = gp.x - pp.x, dz = gp.z - pp.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < nearest) nearest = d;
  }
  const gaining = ocPlayer.sprinting && ocPlayer.moving && nearest < 9;
  const reckless = ocCar.occupied && Math.abs(ocCar.speed) > 10 && nearest < 6;
  if (gaining || reckless) ocAttention += (reckless ? 0.5 : 0.45) * dt;
  else ocAttention -= (ocAttention >= 1 ? 0.08 : 0.12) * dt;
  ocAttention = ocClamp(ocAttention, 0, 1);
}

// ---------- day/night director ----------
const OC_SKY = {
  dayTop: new Color(0x3a7bd5), dayBot: new Color(0xbfd9e8),
  duskTop: new Color(0x3b3f6b), duskBot: new Color(0xf0a35e),
  nightTop: new Color(0x05070f), nightBot: new Color(0x0d1524),
  sunDay: new Color(0xfff4e0), sunDusk: new Color(0xff9a4d)
};
const ocTmpA = new Color(), ocTmpB = new Color();

function ocBlend3(out, day, dusk, night, t1, t2, t3) {
  out.setRGB(
    day.r * t1 + dusk.r * t2 + night.r * t3,
    day.g * t1 + dusk.g * t2 + night.g * t3,
    day.b * t1 + dusk.b * t2 + night.b * t3
  );
}

function ocUpdateDayNight(dt) {
  ocTime = (ocTime + dt / OC_CYCLE) % 1;
  const ang = ocTime * Math.PI * 2;
  const elev = Math.sin(ang);
  ocDayF = ocSmoothstep(-0.02, 0.35, elev);
  const duskRaw = ocSmoothstep(-0.3, -0.03, elev);
  const t1 = ocDayF, t2 = (1 - ocDayF) * duskRaw, t3 = (1 - ocDayF) * (1 - duskRaw);
  ocDuskF = t2;
  ocNightF = t3;

  ocSun.position.set(Math.cos(ang) * 130, Math.sin(ang) * 130 + 12, 45);
  ocSun.color.lerpColors(OC_SKY.sunDusk, OC_SKY.sunDay, ocDayF);
  ocSun.intensity = 2.4 * t1 + 0.9 * t2;
  ocSun.castShadow = (t1 + t2) > 0.04;
  ocMoon.intensity = 0.35 * t3;
  ocHemi.intensity = 0.75 * t1 + 0.3 * t2 + 0.12 * t3;

  ocBlend3(ocTmpA, OC_SKY.dayTop, OC_SKY.duskTop, OC_SKY.nightTop, t1, t2, t3);
  ocBlend3(ocTmpB, OC_SKY.dayBot, OC_SKY.duskBot, OC_SKY.nightBot, t1, t2, t3);
  ocSkyU.topColor.value.copy(ocTmpA);
  ocSkyU.botColor.value.copy(ocTmpB);
  ocHemi.color.copy(ocTmpA);
  ocScene.fog.color.copy(ocTmpB);
  ocScene.background.copy(ocTmpB);

  ocStars.material.opacity = t3;
  const sd = ocSun.position;
  const sl = Math.sqrt(sd.x * sd.x + sd.y * sd.y + sd.z * sd.z) || 1;
  ocSunDisc.position.set(sd.x / sl * 350, sd.y / sl * 350, sd.z / sl * 350);
  ocSunDisc.lookAt(0, 0, 0);
  ocSunDisc.material.opacity = ocClamp(t1 + t2, 0, 1);
  ocMoonDisc.position.set(-180, 200, -140);
  ocMoonDisc.lookAt(0, 0, 0);
  ocMoonDisc.material.opacity = t3;

  ocSkyU.sunDir.value.copy(ocSun.position).normalize();
  ocSkyU.glowColor.value.copy(ocSun.color).multiplyScalar(ocClamp(t1 + t2, 0, 1));
  ocLitWinMat.opacity = ocClamp(t3 + t2 * 0.4, 0, 1) * 0.95;
  ocLampGlowMat.opacity = t3 * 0.55 + t2 * 0.2;
  ocLampPoolMat.opacity = t3 * 0.32;
  if (ocStoreMat) ocStoreMat.opacity = ocClamp(t3 * 0.9 + t2 * 0.35, 0, 1);
  if (ocCloudMat) {
    ocCloudMat.opacity = 0.08 + t1 * 0.5 + t2 * 0.3;
    ocCloudMat.color.copy(ocTmpB).lerp(OC_WHITE, 0.7);
    for (let ci = 0; ci < ocClouds.length; ci++) {
      const cl = ocClouds[ci];
      cl.position.x += cl.userData.v * dt;
      if (cl.position.x > 330) cl.position.x = -330;
    }
  }
  ocHeadMat.emissiveIntensity = 0.15 + t3 * 2.5 + t2 * 0.8;
  ocTailMat.emissiveIntensity = 0.4 + t3 * 1.6;
  if (ocRenderer) ocRenderer.toneMappingExposure = 1.0 - t3 * 0.12;
}

// ---------- drivable vehicle ----------
const ocCar = {
  group: null, wheels: [], frontPivots: [],
  heading: Math.PI, speed: 0, occupied: false,
  vel: { x: 0, z: 0 }
};
const OC_CAR_HOME = { x: 22.7, z: 30 };

function ocBuildSedan(bodyColor) {
  if (!ocHeadMat) ocHeadMat = new MeshStandardMaterial({ color: 0x444444, emissive: 0xfff2cc, emissiveIntensity: 0.15 });
  if (!ocTailMat) ocTailMat = new MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0.4 });
  const group = new Group();
  const paint = new MeshStandardMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.65 });
  const glassMat = new MeshStandardMaterial({ color: 0x10161d, roughness: 0.12, metalness: 0.8 });
  const darkMat = new MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.8, metalness: 0.2 });
  function ocPart(geo, mat, x, y, z, rx) {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    m.castShadow = true;
    group.add(m);
    return m;
  }
  ocPart(new BoxGeometry(1.9, 0.5, 4.2), paint, 0, 0.6, 0);
  ocPart(new BoxGeometry(1.8, 0.2, 1.15), paint, 0, 0.9, 1.5);
  ocPart(new BoxGeometry(1.8, 0.2, 0.95), paint, 0, 0.9, -1.6);
  ocPart(new BoxGeometry(1.6, 0.5, 1.9), glassMat, 0, 1.12, -0.25);
  ocPart(new BoxGeometry(1.5, 0.06, 0.95), glassMat, 0, 1.1, 1.08, -0.45);
  ocPart(new BoxGeometry(1.5, 0.06, 0.85), glassMat, 0, 1.08, -1.32, 0.42);
  ocPart(new BoxGeometry(1.95, 0.22, 0.28), darkMat, 0, 0.42, 2.12);
  ocPart(new BoxGeometry(1.95, 0.22, 0.28), darkMat, 0, 0.42, -2.12);
  ocPart(new BoxGeometry(1.0, 0.16, 0.08), darkMat, 0, 0.62, 2.12);
  ocPart(new BoxGeometry(0.12, 0.1, 0.2), paint, -1.0, 1.12, 0.55);
  ocPart(new BoxGeometry(0.12, 0.1, 0.2), paint, 1.0, 1.12, 0.55);
  const tireMat = new MeshStandardMaterial({ color: 0x0c0d0f, roughness: 1, metalness: 0 });
  const rimMat = new MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.35, metalness: 0.8 });
  const wheelGeo = new CylinderGeometry(0.36, 0.36, 0.3, 12);
  const rimGeo = new CylinderGeometry(0.2, 0.2, 0.32, 10);
  const wheels = [], pivots = [];
  const spots = [[-0.85, 1.35, true], [0.85, 1.35, true], [-0.85, -1.35, false], [0.85, -1.35, false]];
  for (let i = 0; i < 4; i++) {
    const pivot = new Group();
    pivot.position.set(spots[i][0], 0.36, spots[i][1]);
    const w = new Mesh(wheelGeo, tireMat);
    w.rotation.z = Math.PI / 2;
    w.add(new Mesh(rimGeo, rimMat));
    pivot.add(w);
    group.add(pivot);
    wheels.push(w);
    if (spots[i][2]) pivots.push(pivot);
  }
  const lampGeo = new BoxGeometry(0.4, 0.22, 0.1);
  for (let l = 0; l < 2; l++) {
    const hl = new Mesh(lampGeo, ocHeadMat);
    hl.position.set(l === 0 ? -0.68 : 0.68, 0.62, 2.12);
    group.add(hl);
    const tl = new Mesh(lampGeo, ocTailMat);
    tl.position.set(l === 0 ? -0.68 : 0.68, 0.62, -2.12);
    group.add(tl);
  }
  return { group: group, wheels: wheels, pivots: pivots };
}

function ocInitCar() {
  const built = ocBuildSedan(0xd06018);
  ocCar.group = built.group;
  ocCar.wheels = built.wheels;
  ocCar.frontPivots = built.pivots;
  ocCar.group.position.set(OC_CAR_HOME.x, 0.02, OC_CAR_HOME.z);
  ocCar.group.rotation.y = ocCar.heading;
  ocBeamMat = new MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide });
  ocCar.beams = [];
  const beamGeo = new ConeGeometry(1.15, 7, 12, 1, true);
  for (let bi = 0; bi < 2; bi++) {
    const beam = new Mesh(beamGeo, ocBeamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(bi === 0 ? -0.6 : 0.6, 0.62, 2.3 + 3.4);
    beam.visible = false;
    ocCar.group.add(beam);
    ocCar.beams.push(beam);
  }
  ocScene.add(ocCar.group);
}

function ocTryInteract() {
  const pp = ocPlayer.p.group.position;
  const cp = ocCar.group.position;
  ocKeys.Space = false;
  if (!ocCar.occupied) {
    const d = Math.hypot(pp.x - cp.x, pp.z - cp.z);
    if (d < 3.5 && ocPlayer.grounded) {
      ocCar.occupied = true;
      ocCar.speed = 0;
      ocCar.vel.x = 0;
      ocCar.vel.z = 0;
      ocPlayer.vel.x = 0;
      ocPlayer.vel.z = 0;
      ocPlayer.p.group.visible = false;
      ocCam.dist = Math.min(16, ocCam.dist + 3);
      ocToast('Driving — W/S throttle, A/D steer, E to exit', 4);
    }
  } else if (Math.abs(ocCar.speed) < 1.5) {
    const sideX = Math.cos(ocCar.heading), sideZ = -Math.sin(ocCar.heading);
    const ex = ocClamp(cp.x + sideX * 2.2, -OC_HALF + 1, OC_HALF - 1);
    const ez = ocClamp(cp.z + sideZ * 2.2, -OC_HALF + 1, OC_HALF - 1);
    const res = ocResolveCollisions(ex, ez, 0.5);
    ocPlayer.p.group.position.set(res[0], ocGroundY(res[0], res[1]), res[1]);
    ocPlayer.p.baseY = ocGroundY(res[0], res[1]);
    ocPlayer.vel.x = 0;
    ocPlayer.vel.z = 0;
    ocCar.occupied = false;
    ocCar.speed = 0;
    ocPlayer.p.group.visible = true;
    ocCam.dist = Math.max(5, ocCam.dist - 3);
  } else {
    ocToast('Stop the car first', 1.5);
  }
}

function ocUpdateCar(dt) {
  const cp = ocCar.group.position;
  if (ocCar.occupied) {
    const keyTh = (ocKeys.KeyW || ocKeys.ArrowUp ? 1 : 0) - (ocKeys.KeyS || ocKeys.ArrowDown ? 1 : 0);
    const keySt = (ocKeys.KeyD || ocKeys.ArrowRight ? 1 : 0) - (ocKeys.KeyA || ocKeys.ArrowLeft ? 1 : 0);
    let th = keyTh, st = keySt;
    if (keyTh !== 0 || keySt !== 0) {
      ocTapTarget = null;
      ocHideTapMarker();
    } else if (ocTapTarget) {
      const cdx = ocTapTarget.x - cp.x, cdz = ocTapTarget.z - cp.z;
      const cd = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cd < 2.6) {
        ocTapTarget = null;
        ocHideTapMarker();
      } else {
        let diff = (Math.atan2(cdx, cdz) - ocCar.heading) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        st = diff > 0.08 ? 1 : (diff < -0.08 ? -1 : 0);
        th = Math.abs(diff) > 2.5 ? -1 : 1;
      }
    }
    if (th > 0) ocCar.speed += 12 * dt;
    else if (th < 0) ocCar.speed -= (ocCar.speed > 1 ? 20 : 10) * dt;
    ocCar.speed -= ocCar.speed * 1.1 * dt;
    if (th === 0 && Math.abs(ocCar.speed) < 0.4) ocCar.speed = 0;
    ocCar.speed = ocClamp(ocCar.speed, -8, 22);
    const grip = Math.min(1, Math.abs(ocCar.speed) / 5);
    ocCar.heading += st * 2.0 * dt * (ocCar.speed >= 0 ? 1 : -1) * grip;
    for (let i = 0; i < ocCar.frontPivots.length; i++) ocCar.frontPivots[i].rotation.y = st * 0.4;
    const fx = Math.sin(ocCar.heading), fz = Math.cos(ocCar.heading);
    const k = Math.min(1, dt * 6);
    ocCar.vel.x += (fx * ocCar.speed - ocCar.vel.x) * k;
    ocCar.vel.z += (fz * ocCar.speed - ocCar.vel.z) * k;
    let nx = ocClamp(cp.x + ocCar.vel.x * dt, -OC_HALF + 1, OC_HALF - 1);
    let nz = ocClamp(cp.z + ocCar.vel.z * dt, -OC_HALF + 1, OC_HALF - 1);
    let hit = false;
    for (let c = 0; c < 2; c++) {
      const off = c === 0 ? 1.4 : -1.4;
      const px = nx + fx * off, pz = nz + fz * off;
      const res = ocResolveCollisions(px, pz, 1.05);
      nx += res[0] - px;
      nz += res[1] - pz;
      if (Math.abs(res[0] - px) + Math.abs(res[1] - pz) > 0.001) hit = true;
    }
    if (hit) ocCar.speed *= 0.4;
    cp.x = nx;
    cp.z = nz;
    cp.y = 0.02;
    ocCar.group.rotation.y = ocCar.heading;
    if (Math.abs(ocCar.speed) > 3) ocCam.yaw = ocLerpAngle(ocCam.yaw, ocCar.heading, dt * 1.5);
  }
  const beamOn = ocCar.occupied && (ocNightF > 0.25 || ocDuskF > 0.5);
  if (ocBeamMat) ocBeamMat.opacity = beamOn ? (ocNightF * 0.16 + ocDuskF * 0.05) : 0;
  if (ocCar.beams) for (let bi = 0; bi < ocCar.beams.length; bi++) ocCar.beams[bi].visible = beamOn;
  for (let i = 0; i < ocCar.wheels.length; i++) {
    ocCar.wheels[i].rotation.x += (ocCar.speed / 0.36) * dt;
  }
}

// ---------- courier mission (pickup -> deliver -> reward) ----------
const OC_PICKUP = { x: 0, z: 40 };
const OC_DROPOFF = { x: -40, z: -40 };
const ocMission = { stage: 'pickup', deliveries: 0, resetTimer: 0 };
let ocBeacon = null, ocBeaconMat = null, ocRing = null, ocDiamond = null;

function ocInitMission() {
  ocBeaconMat = new MeshBasicMaterial({
    color: 0xffd34d, transparent: true, opacity: 0.35,
    blending: AdditiveBlending, depthWrite: false, fog: false
  });
  ocBeacon = new Mesh(new CylinderGeometry(1.6, 1.6, 30, 16, 1, true), ocBeaconMat);
  ocBeacon.position.set(OC_PICKUP.x, 15, OC_PICKUP.z);
  ocScene.add(ocBeacon);
  ocRing = new Mesh(new TorusGeometry(2.4, 0.18, 8, 32), new MeshBasicMaterial({ color: 0xffd34d }));
  ocRing.rotation.x = -Math.PI / 2;
  ocRing.position.set(OC_PICKUP.x, ocGroundY(OC_PICKUP.x, OC_PICKUP.z) + 0.1, OC_PICKUP.z);
  ocScene.add(ocRing);
  ocDiamond = new Mesh(new OctahedronGeometry(0.55), new MeshBasicMaterial({ color: 0xffe9a8 }));
  ocDiamond.position.set(OC_PICKUP.x, 4, OC_PICKUP.z);
  ocScene.add(ocDiamond);
}

function ocMissionTarget() {
  if (ocMission.stage === 'pickup') return OC_PICKUP;
  if (ocMission.stage === 'deliver') return OC_DROPOFF;
  return null;
}

function ocMoveBeacon(p) {
  ocBeacon.position.set(p.x, 15, p.z);
  ocRing.position.set(p.x, ocGroundY(p.x, p.z) + 0.1, p.z);
  ocDiamond.position.set(p.x, 4, p.z);
}

function ocMissionBeacon(on) {
  ocBeacon.visible = on;
  ocRing.visible = on;
  ocDiamond.visible = on;
}

function ocResetMission() {
  ocMission.stage = 'pickup';
  ocMission.resetTimer = 0;
  ocMoveBeacon(OC_PICKUP);
  ocMissionBeacon(true);
}

function ocUpdateMission(dt, effPos) {
  if (ocTapMarker && ocTapMarker.visible) {
    const ms = 1 + 0.08 * Math.sin(ocFrame * 0.15);
    ocTapMarker.scale.set(ms, ms, 1);
  }
  if (ocMission.stage === 'done') {
    ocMission.resetTimer -= dt;
    if (ocMission.resetTimer <= 0) {
      ocMission.stage = 'pickup';
      ocMissionBeacon(true);
    }
    return;
  }
  const tgt = ocMissionTarget();
  ocBeaconMat.opacity = 0.3 + 0.12 * Math.sin(ocFrame * 0.08);
  ocDiamond.rotation.y += dt * 2;
  ocDiamond.position.y = 4 + Math.sin(ocFrame * 0.06) * 0.5;
  const d = Math.hypot(effPos.x - tgt.x, effPos.z - tgt.z);
  if (ocMission.stage === 'pickup' && d < 3.2) {
    ocMission.stage = 'deliver';
    ocMoveBeacon(OC_DROPOFF);
    ocToast('Package secured — deliver to the drop-off', 4);
  } else if (ocMission.stage === 'deliver' && d < 3.2) {
    ocMission.stage = 'done';
    ocMission.deliveries++;
    ocMission.resetTimer = 8;
    ocMissionBeacon(false);
    ocToast('Delivered! +$250 (run ' + ocMission.deliveries + ')', 5);
  }
}

// ---------- wanted level + patrol cruiser ----------
let ocWanted = 0;
let ocBusted = 0;
const ocPatrol = {
  group: null, heading: 0, active: false,
  speed: 0, bustT: 0, calmT: 0, barA: null, barB: null
};

function ocInitPatrol() {
  const built = ocBuildSedan(0x1f3a6e);
  ocPatrol.group = built.group;
  ocPatrol.barA = new Mesh(new BoxGeometry(0.5, 0.18, 0.3), new MeshBasicMaterial({ color: 0xff3333 }));
  ocPatrol.barA.position.set(-0.35, 1.44, -0.2);
  ocPatrol.barB = new Mesh(new BoxGeometry(0.5, 0.18, 0.3), new MeshBasicMaterial({ color: 0x3388ff }));
  ocPatrol.barB.position.set(0.35, 1.44, -0.2);
  ocPatrol.group.add(ocPatrol.barA);
  ocPatrol.group.add(ocPatrol.barB);
  ocBarGlowA = new MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
  ocBarGlowB = new MeshBasicMaterial({ color: 0x4499ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
  const barGlowGeo = new SphereGeometry(0.55, 10, 8);
  const glowA = new Mesh(barGlowGeo, ocBarGlowA);
  glowA.position.set(-0.35, 1.5, -0.2);
  const glowB = new Mesh(barGlowGeo, ocBarGlowB);
  glowB.position.set(0.35, 1.5, -0.2);
  ocPatrol.group.add(glowA);
  ocPatrol.group.add(glowB);
  ocPatrol.group.visible = false;
  ocScene.add(ocPatrol.group);
}

function ocUpdateWanted(dt, effPos) {
  const speeding = ocCar.occupied && Math.abs(ocCar.speed) > 10;
  if (ocAttention >= 1) ocWanted = Math.min(3, ocWanted + 0.35 * dt);
  else if (speeding) ocWanted = Math.min(3, ocWanted + 0.15 * dt);
  else ocWanted = Math.max(0, ocWanted - 0.08 * dt);

  const pp = ocPatrol.group.position;
  if (ocWanted >= 1 && !ocPatrol.active) {
    ocPatrol.active = true;
    ocPatrol.bustT = 0;
    ocPatrol.calmT = 0;
    ocPatrol.speed = 0;
    pp.set(ocClamp(effPos.x + 18, -70, 70), 0.02, ocClamp(effPos.z, -70, 70));
    ocPatrol.group.visible = true;
    ocToast('Patrol alerted — break line of sight!', 3);
  }
  if (!ocPatrol.active) return;
  const ph = Math.floor(ocFrame / 12) % 2 === 0;
  ocPatrol.barA.visible = ph;
  ocPatrol.barB.visible = !ph;
  ocBarGlowA.opacity = ph ? 0.7 : 0;
  ocBarGlowB.opacity = ph ? 0 : 0.7;
  const dx = effPos.x - pp.x, dz = effPos.z - pp.z;
  const d = Math.hypot(dx, dz) || 0.001;
  ocPatrol.heading = ocLerpAngle(ocPatrol.heading, Math.atan2(dx, dz), dt * 3);
  ocPatrol.speed = ocLerp(ocPatrol.speed, d > 4 ? 8.5 : 0, Math.min(1, dt * 2));
  const nx = ocClamp(pp.x + Math.sin(ocPatrol.heading) * ocPatrol.speed * dt, -OC_HALF + 1, OC_HALF - 1);
  const nz = ocClamp(pp.z + Math.cos(ocPatrol.heading) * ocPatrol.speed * dt, -OC_HALF + 1, OC_HALF - 1);
  const res = ocResolveCollisions(nx, nz, 1.2);
  pp.x = res[0];
  pp.z = res[1];
  ocPatrol.group.rotation.y = ocPatrol.heading;
  if (!ocCar.occupied && d < 3) {
    ocPatrol.bustT += dt;
    if (ocPatrol.bustT > 1.5) {
      ocBusted++;
      ocWanted = 0;
      ocAttention = 0;
      ocResetMission();
      ocPlayer.p.group.position.set(20, ocGroundY(20, 40), 40); // spawn
      ocPlayer.p.baseY = ocGroundY(20, 40);
      ocPlayer.vel.x = 0;
      ocPlayer.vel.z = 0;
      ocToast('BUSTED — back to start', 4);
      ocPatrol.active = false;
      ocPatrol.group.visible = false;
      ocPatrol.bustT = 0;
      return;
    }
  } else {
    ocPatrol.bustT = 0;
  }
  if (ocCar.occupied && d < 3.4) {
    ocCar.speed *= (1 - Math.min(1, dt * 3));
  }
  if (ocWanted < 0.5) {
    ocPatrol.calmT += dt;
    if (ocPatrol.calmT > 5) {
      ocPatrol.active = false;
      ocPatrol.group.visible = false;
    }
  } else {
    ocPatrol.calmT = 0;
  }
}

// ---------- toast prompt ----------
let ocElMission = null, ocElPrompt = null, ocElStars = null;
let ocPromptTimer = 0;

function ocToast(text, secs) {
  if (!ocElPrompt) return;
  ocElPrompt.textContent = text;
  ocElPrompt.style.display = 'block';
  ocPromptTimer = secs || 3;
}

// ---------- main loop ----------
let ocLast = -1;

function ocTick(t) {
  const dt = ocLast < 0 ? 1 / 60 : Math.min(Math.max((t - ocLast) / 1000, 0.0001), 0.1);
  ocLast = t;
  ocFrame++;
  ocFpsEma += (1 / dt - ocFpsEma) * Math.min(1, dt * 2);

  ocUpdateDayNight(dt);
  if (!ocCar.occupied) ocUpdatePlayer(dt);
  ocUpdateCar(dt);
  ocUpdateAttention(dt);
  const spotted = ocAttention >= 1;
  const effPos = ocCar.occupied ? ocCar.group.position : ocPlayer.p.group.position;
  ocUpdatePeds(dt, effPos, spotted);
  ocUpdateMission(dt, effPos);
  ocUpdateWanted(dt, effPos);
  ocUpdateCamera(dt);
  ocUpdateHud(dt);

  if (ocRenderer) ocRenderer.render(ocScene, ocCamera);
  window.requestAnimationFrame(ocTick);
}

// ---------- boot ----------
function ocBoot() {
  const canvas = document.getElementById('game-canvas');
  ocRenderer = ocInitRenderer(canvas);
  ocInitScene();
  ocInitClouds();
  ocInitStreets();
  ocInitBuildings();
  ocInitLamps();
  ocInitTrees();
  ocInitCars();
  ocInitCar();
  ocInitMission();
  ocInitTapMarker();
  ocInitPatrol();
  ocInitPlayer();
  ocInitPeds();
  ocInitInput(canvas);
  ocInitHud();

  window.__game = {
    version: '0.1.0',
    frame: function () { return ocFrame; },
    headless: function () { return ocRenderer === null; },
    timeOfDay: function () { return ocTime; },
    setTimeOfDay: function (t) { ocTime = ((t % 1) + 1) % 1; },
    nightFactor: function () { return ocNightF; },
    dayFactor: function () { return ocDayF; },
    attention: function () { return ocAttention; },
    spotted: function () { return ocAttention >= 1; },
    key: function (code, down) { ocSetKey(code, down !== false); },
    teleport: function (x, z) {
      const gp = ocPlayer.p.group.position;
      gp.x = ocClamp(x, -OC_HALF + 1, OC_HALF - 1);
      gp.z = ocClamp(z, -OC_HALF + 1, OC_HALF - 1);
      ocPlayer.p.baseY = ocGroundY(gp.x, gp.z);
      gp.y = ocPlayer.p.baseY;
      ocPlayer.vel.x = 0;
      ocPlayer.vel.z = 0;
      ocPlayer.vy = 0;
      ocPlayer.grounded = true;
    },
    playerPos: function () {
      const p = ocPlayer.p.group.position;
      return [p.x, p.y, p.z];
    },
    grounded: function () { return ocPlayer.grounded; },
    pedPos: function (i) {
      const p = ocPeds[i].p.group.position;
      return [p.x, p.y, p.z];
    },
    pedCount: function () { return ocPeds.length; },
    buildingCount: function () { return ocBuildings2D.length; },
    buildingCenter: function (i) {
      const b = ocBuildings2D[i];
      return [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
    },
    colliderCount: function () { return ocColliders.length; },
    driving: function () { return ocCar.occupied; },
    carPos: function () {
      const c = ocCar.group.position;
      return [c.x, c.y, c.z];
    },
    carSpeed: function () { return ocCar.speed; },
    mission: function () { return ocMission.stage; },
    missionTarget: function () {
      const t = ocMissionTarget();
      return t ? [t.x, t.z] : null;
    },
    deliveries: function () { return ocMission.deliveries; },
    wanted: function () { return ocWanted; },
    setWanted: function (w) { ocWanted = ocClamp(w, 0, 3); },
    patrolActive: function () { return ocPatrol.active; },
    patrolPos: function () {
      const q = ocPatrol.group.position;
      return [q.x, q.y, q.z];
    },
    busted: function () { return ocBusted; },
    setCamera: function (yaw, pitch, dist) {
      ocCam.yaw = yaw;
      ocCam.pitch = ocClamp(pitch, 0.1, 1.1);
      ocCam.dist = ocClamp(dist, 5, 16);
    },
    fps: function () { return ocFpsEma; },
    tapTarget: function () { return ocTapTarget ? [ocTapTarget.x, ocTapTarget.z] : null; }
  };

  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker &&
        typeof window !== 'undefined' && window.location &&
        (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      navigator.serviceWorker.register('./sw.js');
    }
  } catch (e) { /* offline single file still works */ }

  window.requestAnimationFrame(ocTick);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ocBoot);
else ocBoot();

}
