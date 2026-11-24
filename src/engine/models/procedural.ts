import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelDef, ModelParams, ProceduralRecipe } from '../../core/types';
import { awningTexture, corrugatedTexture, facadeTextures, radialTexture, signTexture, type FacadeKind } from './textures';

/**
 * Modelos procedurais. Convenção local (estilo three.js): Y para cima, a FACHADA fica em +Z,
 * origem no centro da base. Unidades em metros. O motor gira o grupo para o mundo (Z para cima).
 */

export interface BuildOpts {
  label: string;
  seed: number;
}

type Mat = THREE.Material;

const shade = (c: string, f: number) => '#' + new THREE.Color(c).multiplyScalar(f).getHexString();

function lam(color: string, extra: THREE.MeshLambertMaterialParameters = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

/** Material "emissivo puro": brilha à noite, apagado de dia (ver ThreeLayer.applyTheme). */
function glowBasic(color: string, extra: THREE.MeshBasicMaterialParameters = {}) {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.userData.glowBasic = new THREE.Color(color);
  return m;
}

function facadeMat(o: {
  wall: string;
  cols: number;
  rows: number;
  kind: FacadeKind;
  door?: boolean;
  seed: number;
  accent?: string;
}) {
  const { map, emissive } = facadeTextures(o);
  const m = new THREE.MeshLambertMaterial({ map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1 });
  m.userData.glow = 1;
  return m;
}

function mesh(g: THREE.BufferGeometry, m: Mat | Mat[]) {
  const o = new THREE.Mesh(g, m);
  o.frustumCulled = false;
  return o;
}

/** Caixa com base em y (centro em x,z). */
function box(w: number, h: number, d: number, m: Mat | Mat[], x = 0, y = 0, z = 0) {
  const o = mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  return o;
}

function cyl(rt: number, rb: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 10) {
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y + h / 2, z);
  return o;
}

/** Caja centrada en x/y/z (a diferencia de `box`, cuyo y es la base). */
function panel(w: number, h: number, d: number, m: Mat, x = 0, y = 0, z = 0) {
  const o = mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, m: Mat) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const o = mesh(new THREE.CylinderGeometry(r, r, len, 4), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return o;
}

/** Paredes: ordem das faces do BoxGeometry = [+x, -x, +y(topo), -y, +z(frente), -z]. */
function walls(w: number, h: number, d: number, front: Mat, side: Mat, back: Mat, top: Mat, y = 0) {
  return box(w, h, d, [side, side, top, top, front, back], 0, y, 0);
}

/** Telhado de duas águas com cumeeira ao longo de X, base em y=0. */
function gableRoof(w: number, d: number, rise: number, over: number, roofMat: Mat, gableMat: Mat) {
  const g = new THREE.Group();
  const run = d / 2 + over;
  const slope = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  const len = w + over * 2;
  for (const s of [1, -1]) {
    const geo = new THREE.BoxGeometry(len, 0.1, slope);
    scaleUV(geo, len / 1.2, slope / 4);
    const p = mesh(geo, roofMat);
    p.position.set(0, rise / 2 + 0.05, (s * run) / 2);
    p.rotation.x = s * ang;
    g.add(p);
  }
  const tri = new THREE.Shape();
  tri.moveTo(-d / 2, 0);
  tri.lineTo(d / 2, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  for (const s of [1, -1]) {
    const t = mesh(new THREE.ShapeGeometry(tri), gableMat);
    (gableMat as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    t.rotation.y = (s * Math.PI) / 2;
    t.position.x = s * (w / 2 + 0.01);
    g.add(t);
  }
  return g;
}

/** Telhado de quatro águas (pirâmide), usado pelas fachadas coloniais. */
function hipRoof(w: number, d: number, rise: number, over: number, roofMat: Mat, trimMat: Mat) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  const roof = mesh(geo, roofMat);
  roof.scale.set(w + over * 2, rise, d + over * 2);
  roof.position.y = rise / 2;
  g.add(roof);
  g.add(box(w + over * 2, 0.1, d + over * 2, trimMat, 0, -0.08, 0));
  return g;
}

function zincMat(color: string) {
  return lam(color, { map: corrugatedTexture(), side: THREE.DoubleSide });
}

function awning(w: number, len: number, accent: string, y: number, zFront: number) {
  const a = 0.42;
  const rep = Math.max(2, Math.round(w / 0.9));
  const stripes = lam('#ffffff', { map: awningTexture(accent, rep) });
  const plain = lam(shade(accent, 0.7));
  const o = mesh(new THREE.BoxGeometry(w, 0.07, len), [plain, plain, stripes, stripes, plain, plain]);
  o.position.set(0, y - (len * Math.sin(a)) / 2, zFront + (len * Math.cos(a)) / 2);
  o.rotation.x = a;
  return o;
}

function signBoard(text: string, accent: string, w: number, h: number, x: number, y: number, z: number) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ map: signTexture(text, accent) });
  m.userData.glowBasic = new THREE.Color('#ffffff');
  const plane = mesh(new THREE.PlaneGeometry(w, h), m);
  plane.position.set(x, y, z + 0.03);
  g.add(plane);
  g.add(box(w + 0.12, h + 0.12, 0.06, lam('#10181d'), x, y - h / 2 - 0.06, z - 0.01));
  return g;
}

/**
 * Los edificios de WORLD tienen muchas piezas pequeñas que comparten material.
 * Las fusionamos antes de `finish` para reducir draw calls por frame; no cambia
 * materiales, colores, posiciones ni el picking. Solo se usa en las recetas nuevas.
 */
function mergeStaticMeshes(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<Mat, Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry }>>();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    if (m.userData.noPick || m.renderOrder !== 0 || !m.visible) return;
    for (let p = m.parent; p && p !== root; p = p.parent) {
      if (p.userData.tick) return;
    }
    const src = m.geometry as THREE.BufferGeometry;
    if (src.userData.shared) return;
    const mat = m.material as Mat;
    if (mat.userData.night !== undefined) return;

    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    let g = src.clone();
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    g.applyMatrix4(rel);
    const list = groups.get(mat) ?? [];
    list.push({ mesh: m, geometry: g });
    groups.set(mat, list);
  });

  for (const [mat, entries] of groups) {
    if (entries.length < 2) {
      entries.forEach((e) => e.geometry.dispose());
      continue;
    }
    const merged = mergeGeometries(entries.map((e) => e.geometry), false);
    if (!merged) {
      entries.forEach((e) => e.geometry.dispose());
      continue;
    }
    root.add(mesh(merged, mat));
    for (const e of entries) {
      e.mesh.parent?.remove(e.mesh);
      e.mesh.geometry.dispose();
    }
  }
}

function finish(root: THREE.Group, p: ModelParams, shadowScale = 1.45) {
  const shadow = mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: radialTexture('shadow'), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.scale.set(p.width * shadowScale, p.depth * shadowScale, 1);
  shadow.userData.noPick = true;
  shadow.raycast = () => {};
  shadow.renderOrder = -1;
  root.add(shadow);
  root.userData.radius = Math.hypot(p.width, p.depth) / 2;
  return root;
}

/* ------------------------------------------------------------------------------------------------ */
/* Receitas                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

function houseZinc(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const front = facadeMat({ wall: p.wallColor, cols: Math.max(1, Math.round(w / 3.4)), rows: 1, kind: 'windows', door: true, seed: o.seed });
  const side = facadeMat({ wall: shade(p.wallColor, 0.94), cols: Math.max(1, Math.round(d / 4)), rows: 1, kind: 'plain', seed: o.seed + 1 });
  const back = facadeMat({ wall: shade(p.wallColor, 0.9), cols: Math.max(1, Math.round(w / 4)), rows: 1, kind: 'plain', seed: o.seed + 2 });
  g.add(walls(w, h, d, front, side, back, lam(shade(p.wallColor, 0.8))));
  const roof = gableRoof(w, d, Math.min(d * 0.24, 2.4), 0.45, zincMat(p.roofColor), lam(shade(p.wallColor, 0.95)));
  roof.position.y = h;
  g.add(roof);
  // varanda
  const pw = w * 0.56;
  g.add(box(pw, 0.14, 2.1, lam('#b9b2a4'), 0, 0, d / 2 + 1.05));
  for (const s of [-1, 1]) g.add(box(0.14, h * 0.86, 0.14, lam('#efe9dc'), s * (pw / 2 - 0.2), 0, d / 2 + 1.95));
  const shed = mesh(new THREE.BoxGeometry(pw + 0.5, 0.08, 2.5), lam(p.accentColor));
  shed.position.set(0, h * 0.9, d / 2 + 1.1);
  shed.rotation.x = 0.13;
  g.add(shed);
  return finish(g, p);
}

function shopAwning(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const front = facadeMat({ wall: p.wallColor, cols: 1, rows: 1, kind: 'shop', seed: o.seed });
  const side = facadeMat({ wall: shade(p.wallColor, 0.93), cols: Math.max(1, Math.round(d / 4)), rows: 1, kind: 'plain', seed: o.seed + 3 });
  const roofTop = lam(p.roofColor);
  g.add(walls(w, h, d, front, side, side, roofTop));
  // parapeito
  const par = lam(shade(p.wallColor, 0.85));
  g.add(box(w + 0.2, 0.45, 0.2, par, 0, h, d / 2 + 0.05));
  g.add(box(w + 0.2, 0.45, 0.2, par, 0, h, -d / 2 - 0.05));
  g.add(box(0.2, 0.45, d, par, w / 2 + 0.05, h, 0));
  g.add(box(0.2, 0.45, d, par, -w / 2 - 0.05, h, 0));
  g.add(awning(w * 0.92, 1.7, p.accentColor, h * 0.66, d / 2));
  g.add(signBoard(o.label, p.accentColor, Math.min(w * 0.8, 6.5), 0.85, 0, h * 0.99, d / 2 + 0.01));
  g.add(box(1.6, 0.9, 1.2, lam('#9aa5ac'), -w * 0.25, h + 0.01, -d * 0.2)); // ar-condicionado
  return finish(g, p);
}

function bodega(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const front = facadeMat({ wall: p.wallColor, cols: 1, rows: 1, kind: 'shop', seed: o.seed });
  const side = facadeMat({ wall: shade(p.wallColor, 0.93), cols: Math.max(1, Math.round(d / 4)), rows: 1, kind: 'plain', seed: o.seed + 3 });
  g.add(walls(w, h, d, front, side, side, lam(shade(p.wallColor, 0.8))));
  // cobertura inclinada (cai para a frente)
  const roofGeo = new THREE.BoxGeometry(w + 0.7, 0.12, d + 1.2);
  scaleUV(roofGeo, (w + 0.7) / 1.2, (d + 1.2) / 4);
  const roof = mesh(roofGeo, zincMat(p.roofColor));
  roof.position.set(0, h + 0.35, 0.35);
  roof.rotation.x = 0.12;
  g.add(roof);
  g.add(box(w + 0.7, 0.5, 0.12, lam(shade(p.roofColor, 0.8)), 0, h + 0.2, -d / 2 - 0.2));
  g.add(awning(w * 0.8, 1.1, p.accentColor, h * 0.66, d / 2));
  g.add(signBoard(o.label, p.accentColor, Math.min(w * 0.85, 5), 0.8, 0, h * 0.99, d / 2 + 0.01));
  // caixas na calçada
  g.add(box(0.7, 0.55, 0.7, lam('#b7894f'), w * 0.3, 0, d / 2 + 1.0));
  g.add(box(0.6, 0.45, 0.6, lam('#a9794a'), w * 0.3 + 0.7, 0, d / 2 + 1.1));
  return finish(g, p);
}

function twoStory(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const front = facadeMat({ wall: p.wallColor, cols: Math.max(2, Math.round(w / 3.4)), rows: 2, kind: 'windows', door: true, seed: o.seed });
  const side = facadeMat({ wall: shade(p.wallColor, 0.94), cols: Math.max(1, Math.round(d / 4)), rows: 2, kind: 'plain', seed: o.seed + 1 });
  g.add(walls(w, h, d, front, side, side, lam(p.roofColor)));
  const par = lam(shade(p.wallColor, 0.82));
  g.add(box(w + 0.3, 0.6, 0.22, par, 0, h, d / 2));
  g.add(box(w + 0.3, 0.6, 0.22, par, 0, h, -d / 2));
  g.add(box(0.22, 0.6, d, par, w / 2, h, 0));
  g.add(box(0.22, 0.6, d, par, -w / 2, h, 0));
  // sacada do 2º piso
  const bw = w * 0.62;
  const by = h * 0.5;
  g.add(box(bw, 0.16, 1.4, lam(shade(p.wallColor, 0.75)), 0, by - 0.1, d / 2 + 0.7));
  const rail = lam(p.accentColor);
  g.add(box(bw, 0.06, 0.06, rail, 0, by + 0.95, d / 2 + 1.35));
  for (let i = 0; i <= 6; i++) g.add(box(0.05, 0.9, 0.05, rail, -bw / 2 + (bw * i) / 6, by, d / 2 + 1.35));
  // caixa d'água
  const tank = lam('#5f6b73');
  g.add(cyl(0.9, 0.9, 1.3, tank, -w * 0.22, h + 0.6, -d * 0.18, 14));
  g.add(cyl(0.05, 0.9, 0.25, tank, -w * 0.22, h + 1.9, -d * 0.18, 14));
  g.add(box(w * 0.16, 0.12, 0.12, lam(p.accentColor), 0, h * 0.5 - 0.1, d / 2 + 0.06)); // frisos
  return finish(g, p);
}

function midrise(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const rows = Math.max(3, Math.round(h / 3.2));
  const front = facadeMat({ wall: p.wallColor, cols: Math.max(2, Math.round(w / 3)), rows, kind: 'windows', door: true, seed: o.seed });
  const side = facadeMat({ wall: shade(p.wallColor, 0.92), cols: Math.max(2, Math.round(d / 3)), rows, kind: 'windows', seed: o.seed + 2 });
  const back = facadeMat({ wall: shade(p.wallColor, 0.9), cols: Math.max(2, Math.round(w / 3)), rows, kind: 'windows', seed: o.seed + 4 });
  g.add(walls(w, h, d, front, side, back, lam(p.roofColor)));
  // coroa luminosa
  const crown = glowBasic(p.accentColor);
  g.add(box(w + 0.3, 0.28, d + 0.3, crown, 0, h, 0));
  g.add(box(w * 0.5, 2.2, d * 0.5, lam(shade(p.roofColor, 1.1)), -w * 0.1, h + 0.28, -d * 0.1));
  g.add(cyl(0.05, 0.05, 3.2, lam('#9aa5ac'), w * 0.3, h + 0.28, d * 0.25, 5));
  g.add(box(0.5, 0.5, 0.5, glowBasic('#ff5c5c'), w * 0.3 - 0.25, h + 3.4, d * 0.25 - 0.25));
  return finish(g, p, 1.3);
}

function warehouse(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const front = facadeMat({ wall: p.wallColor, cols: 1, rows: 1, kind: 'shutter', seed: o.seed });
  const side = facadeMat({ wall: shade(p.wallColor, 0.94), cols: Math.max(2, Math.round(d / 5)), rows: 1, kind: 'plain', seed: o.seed + 1 });
  g.add(walls(w, h, d, front, side, side, lam(p.roofColor)));
  const roof = gableRoof(w, d, d * 0.1, 0.5, zincMat(p.roofColor), lam(shade(p.wallColor, 0.95)));
  roof.position.y = h;
  g.add(roof);
  g.add(box(w + 0.05, 0.5, 0.05, glowBasic(p.accentColor), 0, h * 0.78, d / 2 + 0.03));
  g.add(box(2.2, 1.2, 1.8, lam('#9aa5ac'), w * 0.3, 0, -d / 2 - 0.9));
  return finish(g, p, 1.25);
}

function pavilion(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  g.add(box(w, 0.25, d, lam('#cfc8bb'), 0, 0, 0));
  const nx = Math.max(2, Math.round(w / 4.5) + 1);
  const nz = Math.max(2, Math.round(d / 5) + 1);
  const col = lam(shade(p.wallColor, 0.9));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
      g.add(box(0.38, h, 0.38, col, -w / 2 + 0.5 + ((w - 1) * i) / (nx - 1), 0.25, -d / 2 + 0.5 + ((d - 1) * j) / (nz - 1)));
    }
  const rise = Math.min(w, d) * 0.28;
  const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true);
  roofGeo.rotateY(Math.PI / 4);
  const roof = mesh(roofGeo, lam(p.roofColor, { side: THREE.DoubleSide }));
  roof.scale.set(w * 1.12, rise, d * 1.12);
  roof.position.y = h + 0.25 + rise / 2;
  g.add(roof);
  // faixa de beiral luminosa
  const f = glowBasic(p.accentColor);
  const ew = w * 1.12;
  const ed = d * 1.12;
  const ey = h + 0.25;
  g.add(box(ew, 0.12, 0.1, f, 0, ey, ed / 2));
  g.add(box(ew, 0.12, 0.1, f, 0, ey, -ed / 2));
  g.add(box(0.1, 0.12, ed, f, ew / 2, ey, 0));
  g.add(box(0.1, 0.12, ed, f, -ew / 2, ey, 0));
  // bancas
  const colors = [p.accentColor, '#4aa3a2', '#d65a6f', '#e8b34b'];
  for (let i = 0; i < 4; i++) {
    const x = -w * 0.3 + i * (w * 0.2);
    g.add(box(1.6, 0.9, 1.0, lam('#8b6b4a'), x, 0.25, -d * 0.12));
    g.add(box(1.8, 0.08, 1.3, lam(colors[i % colors.length]), x, 1.9, -d * 0.12));
    g.add(box(0.06, 1.0, 0.06, lam('#555'), x - 0.8, 1.0, -d * 0.12 + 0.55));
    g.add(box(0.06, 1.0, 0.06, lam('#555'), x + 0.8, 1.0, -d * 0.12 + 0.55));
    void o;
  }
  return finish(g, p, 1.2);
}

function chapel(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const side = facadeMat({ wall: p.wallColor, cols: Math.max(2, Math.round(d / 3.5)), rows: 1, kind: 'plain', seed: o.seed });
  const front = facadeMat({ wall: p.wallColor, cols: 1, rows: 1, kind: 'plain', seed: o.seed + 3 });
  g.add(walls(w, h, d, front, side, side, lam(p.roofColor)));
  const roof = gableRoof(d, w, w * 0.32, 0.4, zincMat(p.roofColor), lam(shade(p.wallColor, 0.97)));
  roof.rotation.y = Math.PI / 2;
  roof.position.y = h;
  g.add(roof);
  const bw = w * 0.5;
  const th = h * 1.7;
  const tz = d / 2 - bw / 2 + 0.3;
  const tFront = facadeMat({ wall: p.wallColor, cols: 1, rows: 2, kind: 'windows', door: true, seed: o.seed + 7 });
  const tSide = facadeMat({ wall: p.wallColor, cols: 1, rows: 2, kind: 'plain', seed: o.seed + 8 });
  g.add(box(bw, th, bw, [tSide, tSide, lam(p.roofColor), lam(p.roofColor), tFront, tSide], 0, 0, tz));
  const cone = mesh(new THREE.ConeGeometry(bw * 0.78, bw * 1.2, 4), lam(p.roofColor));
  cone.rotation.y = Math.PI / 4;
  cone.position.set(0, th + bw * 0.6, tz);
  g.add(cone);
  const cross = glowBasic(p.accentColor);
  g.add(box(0.12, 1.3, 0.12, cross, 0, th + bw * 1.2, tz));
  g.add(box(0.7, 0.12, 0.12, cross, 0, th + bw * 1.2 + 0.8, tz));
  return finish(g, p);
}

function signalTower(p: ModelParams) {
  const { width: w, height: H } = p;
  const g = new THREE.Group();
  const steel = lam(p.wallColor);
  const top = H * 0.92;
  const tw = w * 0.3;
  const r = Math.max(0.07, w * 0.028);
  const n = Math.max(4, Math.round(H / 5));
  const half = (i: number) => THREE.MathUtils.lerp(w / 2, tw / 2, i / n);
  const y = (i: number) => (top * i) / n;
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const [sx, sz] of corners) {
    g.add(strut(new THREE.Vector3(sx * half(0), 0, sz * half(0)), new THREE.Vector3(sx * half(n), y(n), sz * half(n)), r * 1.4, steel));
  }
  for (let i = 0; i <= n; i++) {
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      g.add(strut(new THREE.Vector3(ax * half(i), y(i), az * half(i)), new THREE.Vector3(bx * half(i), y(i), bz * half(i)), r * 0.7, steel));
      if (i < n) {
        g.add(strut(new THREE.Vector3(ax * half(i), y(i), az * half(i)), new THREE.Vector3(bx * half(i + 1), y(i + 1), bz * half(i + 1)), r * 0.5, steel));
      }
    }
  }
  g.add(box(tw * 1.8, 0.22, tw * 1.8, lam(p.roofColor), 0, top, 0));
  g.add(cyl(r * 0.8, r * 1.2, H - top + 2.2, steel, 0, top, 0, 6));
  for (const [sx, sz, a] of [[1, 0, Math.PI / 2], [0, 1, 0]] as const) {
    const dish = mesh(new THREE.CylinderGeometry(0.9, 0.2, 0.3, 12), lam('#e6edf0'));
    dish.position.set(sx * (tw * 1.1), top * 0.82, sz * (tw * 1.1));
    dish.rotation.z = sx ? -Math.PI / 2 : 0;
    dish.rotation.x = sz ? Math.PI / 2 : 0;
    void a;
    g.add(dish);
  }
  const beaconR = Math.max(0.35, w * 0.1);
  const beacon = mesh(new THREE.SphereGeometry(beaconR, 12, 10), glowBasic(p.accentColor));
  beacon.position.y = H + 2.2 + beaconR;
  g.add(beacon);
  const haloMat = new THREE.SpriteMaterial({
    map: radialTexture('glow'),
    color: p.accentColor,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  haloMat.userData.night = 0.9;
  const halo = new THREE.Sprite(haloMat);
  halo.raycast = () => {};
  halo.position.copy(beacon.position);
  halo.scale.setScalar(beaconR * 14);
  g.add(halo);
  g.userData.tick = (t: number) => {
    const k = 0.6 + 0.4 * Math.sin(t * 2.2);
    halo.scale.setScalar(beaconR * (10 + 6 * k));
  };
  return finish(g, p, 1.6);
}

const FROND_CACHE = new Map<string, THREE.BufferGeometry>();
function frondGeometry(len: number) {
  const key = len.toFixed(2);
  const hit = FROND_CACHE.get(key);
  if (hit) return hit;
  const n = 7;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * len;
    const y = 0.25 * len * Math.sin(t * 1.4) - 0.5 * len * t * t;
    const hw = 0.2 * len * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.8) * (1 - t * 0.35);
    pos.push(x, y, -hw, x, y, hw);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.shared = true;
  FROND_CACHE.set(key, g);
  return g;
}

function moriche(p: ModelParams, o: BuildOpts) {
  const { width: w, height: h } = p;
  const g = new THREE.Group();
  const lean = ((o.seed % 3) - 1) * 0.04;
  const palm = new THREE.Group();
  palm.rotation.z = lean;
  palm.add(cyl(w * 0.04, w * 0.07, h * 0.94, lam(p.wallColor), 0, 0, 0, 8));
  const crown = new THREE.Group();
  crown.position.y = h * 0.94;
  const fm = lam(p.roofColor, { side: THREE.DoubleSide });
  const fm2 = lam(shade(p.roofColor, 1.25), { side: THREE.DoubleSide });
  const len = Math.max(1.6, w * 0.8);
  const count = 11;
  for (let i = 0; i < count; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / count) * Math.PI * 2 + (i % 2) * 0.15;
    const f = mesh(frondGeometry(len), i % 3 === 0 ? fm2 : fm);
    f.rotation.z = 0.3 + (i % 3) * 0.14;
    pivot.add(f);
    crown.add(pivot);
  }
  const fruit = lam(p.accentColor);
  for (let i = 0; i < 6; i++) {
    const s = mesh(new THREE.SphereGeometry(0.17, 6, 5), fruit);
    s.position.set(Math.cos(i * 1.2) * 0.3, -0.35 - (i % 2) * 0.2, Math.sin(i * 1.2) * 0.3);
    crown.add(s);
  }
  palm.add(crown);
  g.add(palm);
  return finish(g, p, 0.9);
}

function tree(p: ModelParams, o: BuildOpts) {
  const { width: w, height: h } = p;
  const g = new THREE.Group();
  g.add(cyl(w * 0.04, w * 0.06, h * 0.45, lam(p.wallColor), 0, 0, 0, 7));
  const base = p.roofColor;
  const blobs: Array<[number, number, number, number, number]> = [
    [0, h * 0.62, 0, w * 0.34, 1],
    [w * 0.2, h * 0.5, w * 0.1, w * 0.22, 0.9],
    [-w * 0.2, h * 0.52, -w * 0.08, w * 0.24, 1.12],
    [w * 0.02, h * 0.82, -w * 0.05, w * 0.22, 1.2],
  ];
  blobs.forEach(([x, y, z, r, k], i) => {
    const m = mesh(new THREE.IcosahedronGeometry(r, 1), lam(shade(base, k), { flatShading: true }));
    m.position.set(x, y, z);
    m.rotation.y = (o.seed + i) * 0.7;
    g.add(m);
  });
  return finish(g, p, 0.9);
}

function streetLamp(p: ModelParams) {
  const { width: w, height: h } = p;
  const g = new THREE.Group();
  const pole = lam(p.wallColor);
  g.add(cyl(0.06 * w + 0.04, 0.09 * w + 0.05, h, pole, 0, 0, 0, 8));
  const armLen = 1.2;
  g.add(box(0.07, 0.07, armLen, pole, 0, h - 0.05, armLen / 2));
  const head = box(0.28, 0.1, 0.55, glowBasic(p.accentColor), 0, h - 0.14, armLen);
  g.add(head);
  const poolMat = new THREE.MeshBasicMaterial({
    map: radialTexture('glow'),
    color: p.accentColor,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  poolMat.userData.night = 0.5;
  const pool = mesh(new THREE.PlaneGeometry(1, 1), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.06, armLen);
  pool.scale.setScalar(h * 1.15);
  pool.raycast = () => {};
  g.add(pool);
  const haloMat = new THREE.SpriteMaterial({ map: radialTexture('glow'), color: p.accentColor, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  haloMat.userData.night = 0.75;
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(0, h - 0.2, armLen);
  halo.scale.setScalar(2.2);
  halo.raycast = () => {};
  g.add(halo);
  g.userData.radius = 1.2;
  return g;
}

function totem(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  g.add(box(w * 1.2, 0.18, d * 2.2, lam('#2a343b'), 0, 0, 0));
  g.add(box(w, h, d, lam(p.wallColor), 0, 0.18, 0));
  const panel = new THREE.MeshBasicMaterial({ map: signTexture(o.label, p.accentColor) });
  panel.userData.glowBasic = new THREE.Color('#ffffff');
  const pl = mesh(new THREE.PlaneGeometry(w * 0.86, Math.min(h * 0.4, w * 0.86 * 0.25 + 0.4)), panel);
  pl.position.set(0, h * 0.62, d / 2 + 0.01);
  g.add(pl);
  g.add(box(w * 1.02, 0.12, d * 1.02, glowBasic(p.accentColor), 0, h + 0.18, 0));
  return finish(g, p, 2.2);
}

/* ------------------------------------------------------------------------------------------------ */
/* Edifícios de WORLD adaptados de Tumeremo-3D (colonial / tecno / boutique).                      */
/* Mantêm proporções, fachadas e cores da referência, usando apenas os helpers deste motor.        */
/* ------------------------------------------------------------------------------------------------ */

function insetWindow(w: number, h: number, frame: Mat, glassMat: Mat, grille: boolean) {
  const g = new THREE.Group();
  g.add(panel(w + 0.16, h + 0.16, 0.08, frame));
  g.add(panel(w, h, 0.06, glassMat, 0, 0, 0.04));
  if (grille) {
    g.add(panel(0.05, h, 0.07, frame, 0, 0, 0.08));
    g.add(panel(w, 0.05, 0.07, frame, 0, 0, 0.08));
  }
  return g;
}

/** Arepera El Guayabo — colonial de 1 piso, pórtico de columnas, terraza e cobertura de 4 águas. */
function colonialBuilding(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d } = p;
  const g = new THREE.Group();
  const wall = lam(p.wallColor);
  const trim = lam(shade(p.wallColor, 0.78));
  const base = lam(shade(p.wallColor, 0.62));
  const dark = lam('#20272a');
  const glassMat = lam('#b9e6e1', { transparent: true, opacity: 0.75 });
  const accent = lam(p.accentColor);

  const portal = 1.7;
  const h1 = 3.8;
  const bodyD = d - portal;
  const fz = d / 2 - portal;
  g.add(box(w, h1, bodyD, wall, 0, 0, -portal / 2));
  g.add(box(w + 0.05, 0.7, bodyD + 0.05, base, 0, 0, -portal / 2));
  g.add(box(w, 0.06, portal, trim, 0, 0, d / 2 - portal / 2));

  const n = Math.max(2, Math.round(w / 2.1));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + sw * (i + 0.5);
    const isDoor = i === Math.floor(n / 2) || (n >= 4 && i === 1);
    if (isDoor) {
      g.add(panel(Math.min(1.3, sw - 0.5), 2.4, 0.1, dark, x, 1.2, fz + 0.04));
      g.add(panel(0.08, 0.08, 0.08, accent, x + 0.35, 1.1, fz + 0.11));
    } else {
      const win = insetWindow(Math.min(1.0, sw - 0.8), 1.6, trim, glassMat, true);
      win.position.set(x, 1.05, fz + 0.05);
      g.add(win);
    }
  }

  const colH = h1 - 0.9;
  const nc = Math.max(3, Math.round(w / 2) + 1);
  for (let i = 0; i < nc; i++) {
    const x = -w / 2 + 0.25 + ((w - 0.5) * i) / (nc - 1);
    g.add(cyl(0.16, 0.16, colH, trim, x, 0, d / 2 - 0.25, 8));
    g.add(box(0.46, 0.35, 0.46, base, x, 0, d / 2 - 0.25));
  }
  g.add(box(w + 0.1, 0.9, 0.36, accent, 0, colH, d / 2 - 0.25));
  g.add(signBoard(o.label, p.accentColor, w * 0.82, 0.62, 0, colH + 0.14, d / 2 - 0.06));
  g.add(box(w, 0.12, portal, wall, 0, h1 - 0.12, d / 2 - portal / 2));

  const roof = hipRoof(w, d, 1.7, 0.45, lam(p.roofColor, { side: THREE.DoubleSide }), lam(shade(p.wallColor, 0.9)));
  roof.position.y = h1;
  g.add(roof);

  // Terraza: mesas redondas con sombrillas verdes (accent).
  for (const s of [-1, 1]) {
    const x = s * w * 0.26;
    const z = d / 2 + 1.0;
    g.add(cyl(0.07, 0.07, 0.7, lam('#8b6b4a'), x, 0, z, 8));
    g.add(cyl(0.75, 0.75, 0.06, lam('#efe5d2'), x, 0.7, z, 12));
    g.add(cyl(0.05, 0.05, 1.45, lam('#8b6b4a'), x, 0.76, z, 6));
    const umbrella = mesh(new THREE.ConeGeometry(1.1, 0.45, 8), accent);
    umbrella.position.set(x, 2.2, z);
    g.add(umbrella);
  }
  mergeStaticMeshes(g);
  return finish(g, p, 1.6);
}

/** TecnoSelva Celulares — 2 pisos, escaparate de vidrio, LED y antena. */
function tecnoBuilding(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const wall = lam(p.wallColor);
  const dark = lam('#111827');
  const glassMat = lam('#9ad9f5', { transparent: true, opacity: 0.7 });
  const led = glowBasic(p.accentColor);
  const h1 = 3.9;
  const cg = Math.min(1.8, w * 0.3);

  g.add(box(w - cg, h, d, wall, cg / 2, 0, 0));
  g.add(box(cg, h, d - cg, wall, -w / 2 + cg / 2, 0, -cg / 2));
  g.add(box(cg, h - 0.2, cg, glassMat, -w / 2 + cg / 2, 0.2, d / 2 - cg / 2));
  for (let f = 0; f <= 2; f++) {
    const y = f === 0 ? 0 : Math.min(h - 0.18, h1 + (f - 1) * 3.3 - (f === 2 ? 0.2 : 0));
    g.add(panel(cg + 0.06, 0.18, cg + 0.06, dark, -w / 2 + cg / 2, y, d / 2 - cg / 2));
  }

  const sx0 = -w / 2 + cg + 0.2;
  const sx1 = w / 2 - 0.3;
  const sw = sx1 - sx0;
  g.add(panel(sw, 2.6, 0.1, glassMat, (sx0 + sx1) / 2, 1.5, d / 2 + 0.06));
  g.add(panel(sw, 0.2, 0.14, dark, (sx0 + sx1) / 2, 0.1, d / 2 + 0.03));
  g.add(panel(1.2, 2.4, 0.14, dark, sx1 - 0.8, 1.4, d / 2 + 0.05));
  g.add(panel(w + 0.02, 0.9, 0.3, dark, 0, 2.95, d / 2 + 0.12));
  g.add(signBoard(o.label, p.accentColor, w * 0.7, 0.6, cg * 0.25, 3.1, d / 2 + 0.28));
  g.add(panel(w + 0.06, 0.1, 0.34, led, 0, 2.9, d / 2 + 0.12));

  for (let f = 1; f < Math.max(2, Math.round(h / 3.3)); f++) {
    const y0 = h1 + (f - 1) * 3.3;
    if (y0 > h - 1) break;
    g.add(panel(sw, 2.4, 0.1, glassMat, (sx0 + sx1) / 2, y0 + 1.55, d / 2 + 0.06));
    g.add(panel(sw, 0.08, 0.14, dark, (sx0 + sx1) / 2, y0 + 1.6, d / 2 + 0.03));
    for (let i = 0; i <= 3; i++) g.add(panel(0.07, 2.6, 0.14, dark, sx0 + (sw * i) / 3, y0 + 1.55, d / 2 + 0.03));
  }
  g.add(panel(w + 0.08, 0.1, d + 0.08, led, 0, h - 0.12, 0));
  g.add(box(w + 0.06, 0.35, d + 0.06, dark, 0, h - 0.35, 0));
  g.add(cyl(0.08, 0.08, 2.6, lam('#c8d2d9'), w / 4, h, -d / 4, 8));
  const dish = mesh(new THREE.ConeGeometry(0.65, 0.4, 10), lam('#c8d2d9'));
  dish.position.set(-w / 4, h + 0.9, -d / 4);
  dish.rotation.z = -0.9;
  g.add(dish);
  g.add(panel(1.1, 0.7, 0.9, lam('#aeb9c0'), 0, h, -d / 3));
  mergeStaticMeshes(g);
  return finish(g, p, 1.5);
}

/** Boutique Orquídea — 2 pisos, escaparates, toldo de raya, varanda e tanque. */
function boutiqueBuilding(p: ModelParams, o: BuildOpts) {
  const { width: w, depth: d, height: h } = p;
  const g = new THREE.Group();
  const wall = lam(p.wallColor);
  const base = lam(shade(p.wallColor, 0.72));
  const accent = lam(p.accentColor);
  const trim = lam(p.roofColor);
  const dark = lam('#2a2a30');
  const glassMat = lam('#cfeaf2', { transparent: true, opacity: 0.72 });
  const h1 = 3.7;

  g.add(box(w, h, d, wall, 0, 0, 0));
  g.add(box(w + 0.04, 0.6, d + 0.04, base, 0, 0, 0));
  const dw = 1.3;
  const sw = (w - dw - 1.3) / 2;
  for (const s of [-1, 1]) {
    const x = s * (dw / 2 + 0.3 + sw / 2);
    g.add(panel(sw + 0.24, 2.5, 0.08, accent, x, 1.75, d / 2 + 0.1));
    g.add(panel(sw, 2.26, 0.1, glassMat, x, 1.75, d / 2 + 0.14));
  }
  g.add(panel(dw, 2.6, 0.12, dark, 0, 1.3, d / 2 + 0.06));
  g.add(awning(w - 0.3, 1.2, p.accentColor, 3.1, d / 2));
  g.add(signBoard(o.label, p.accentColor, w * 0.62, 0.48, 0, 3.17, d / 2 + 0.02));

  if (h > h1) {
    const nw = Math.max(2, Math.floor(w / 2.3));
    for (let i = 0; i < nw; i++) {
      const x = -w / 2 + (w / nw) * (i + 0.5);
      const win = insetWindow(0.95, 2.1, trim, glassMat, false);
      win.position.set(x, h1 + 1.4, d / 2 + 0.06);
      g.add(win);
      g.add(panel(0.22, 2.1, 0.08, accent, x - 0.58, h1 + 1.4, d / 2 + 0.12));
      g.add(panel(0.22, 2.1, 0.08, accent, x + 0.58, h1 + 1.4, d / 2 + 0.12));
    }
    g.add(panel(w - 0.5, 0.12, 0.8, trim, 0, h1 + 0.28, d / 2 + 0.4));
    g.add(panel(w - 0.5, 0.07, 0.07, accent, 0, h1 + 1.25, d / 2 + 0.77));
    const nb = Math.max(2, Math.round((w - 0.5) / 0.28));
    for (let b = 0; b <= nb; b++) g.add(panel(0.035, 0.92, 0.035, dark, -(w - 0.5) / 2 + ((w - 0.5) * b) / nb, h1 + 0.8, d / 2 + 0.77));
  }
  g.add(panel(w + 0.3, 0.3, d + 0.3, trim, 0, h + 0.15, 0));
  g.add(panel(w * 0.42, 0.75, 0.25, wall, 0, h + 0.68, d / 2 + 0.02));
  g.add(panel(w * 0.46, 0.12, 0.32, trim, 0, h + 1.1, d / 2 + 0.02));
  g.add(panel(w - 0.2, 0.06, d - 0.2, lam(p.roofColor), 0, h + 0.32, 0));
  g.add(cyl(0.65, 0.65, 1.0, lam('#5f6b73'), -w / 2 + 1.1, h + 0.32, -d / 2 + 1.2, 12));
  mergeStaticMeshes(g);
  return finish(g, p, 1.5);
}

export function buildProcedural(recipe: ProceduralRecipe, p: ModelParams, o: BuildOpts): THREE.Group {
  switch (recipe) {
    case 'house-zinc':
      return houseZinc(p, o);
    case 'shop-awning':
      return shopAwning(p, o);
    case 'bodega':
      return bodega(p, o);
    case 'two-story':
      return twoStory(p, o);
    case 'midrise':
      return midrise(p, o);
    case 'warehouse':
      return warehouse(p, o);
    case 'pavilion':
      return pavilion(p, o);
    case 'chapel':
      return chapel(p, o);
    case 'signal-tower':
      return signalTower(p);
    case 'moriche-palm':
      return moriche(p, o);
    case 'tree':
      return tree(p, o);
    case 'street-lamp':
      return streetLamp(p);
    case 'totem':
      return totem(p, o);
    case 'colonial':
      return colonialBuilding(p, o);
    case 'tecno':
      return tecnoBuilding(p, o);
    case 'boutique':
      return boutiqueBuilding(p, o);
  }
}

export function modelNeedsLabel(def: ModelDef): boolean {
  return !!def.hasSign;
}

/** Libera geometrias e materiais (texturas em cache são compartilhadas e permanecem). */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mat = m.material as Mat | Mat[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
