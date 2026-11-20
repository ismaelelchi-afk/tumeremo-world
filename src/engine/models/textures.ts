import * as THREE from 'three';

/** Texturas procedurais (canvas) com cache. Compartilhadas entre instâncias — não descartar. */

const cache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type FacadeKind = 'windows' | 'shop' | 'plain' | 'shutter';

export interface FacadeOpts {
  wall: string;
  cols: number;
  rows: number;
  kind: FacadeKind;
  door?: boolean;
  seed: number;
  accent?: string;
}

/** Fachada: devolve mapa de cor + mapa emissivo (janelas acesas). */
export function facadeTextures(o: FacadeOpts): { map: THREE.Texture; emissive: THREE.Texture } {
  const key = `f|${o.wall}|${o.cols}|${o.rows}|${o.kind}|${o.door ? 1 : 0}|${o.seed % 6}|${o.accent ?? ''}`;
  const hit = cache.get(key + '|m');
  if (hit) return { map: hit, emissive: cache.get(key + '|e')! };

  const cw = o.kind === 'shop' || o.kind === 'shutter' ? 96 : 48;
  const ch = o.kind === 'shop' || o.kind === 'shutter' ? 160 : 60;
  const W = Math.min(1024, o.cols * cw);
  const H = Math.min(1024, o.rows * ch);
  const [c1, g] = makeCanvas(W, H);
  const [c2, e] = makeCanvas(W, H);
  const cellW = W / o.cols;
  const cellH = H / o.rows;
  const rand = rng(o.seed % 6 + 1);

  g.fillStyle = o.wall;
  g.fillRect(0, 0, W, H);
  // leve variação de reboco
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${0.015 + rand() * 0.025})`;
    g.fillRect(rand() * W, rand() * H, 6 + rand() * 30, 3 + rand() * 18);
  }
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  const glass = '#1b2a36';

  if (o.kind === 'windows' || o.kind === 'plain') {
    for (let r = 0; r < o.rows; r++) {
      for (let col = 0; col < o.cols; col++) {
        const isDoor = !!o.door && r === o.rows - 1 && col === Math.floor(o.cols / 2) && o.kind === 'windows';
        const x = col * cellW;
        const y = r * cellH;
        if (isDoor) {
          const dw = cellW * 0.46;
          const dh = cellH * 0.78;
          g.fillStyle = '#5a3d2b';
          g.fillRect(x + (cellW - dw) / 2, y + cellH - dh, dw, dh);
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.fillRect(x + (cellW - dw) / 2 + dw * 0.78, y + cellH - dh * 0.5, 3, 3);
          continue;
        }
        if (o.kind === 'plain' && rand() > 0.6) continue;
        const ww = cellW * 0.46;
        const wh = cellH * 0.5;
        const wx = x + (cellW - ww) / 2;
        const wy = y + cellH * 0.2;
        const lit = rand() < 0.38;
        g.fillStyle = '#e8eef2';
        g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        // a cor base é sempre vidro; o brilho quente vem do mapa emissivo (só à noite)
        grad.addColorStop(0, lit ? '#3b5468' : '#2c4254');
        grad.addColorStop(1, lit ? '#26394a' : glass);
        g.fillStyle = grad;
        g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (lit) {
          e.fillStyle = '#ffc56a';
          e.fillRect(wx, wy, ww, wh);
        }
      }
    }
  } else {
    // vitrine de loja: faixa de letreiro no topo + vidro grande
    const bandH = H * 0.22;
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 0, W, bandH);
    const gx = W * 0.07;
    const gy = bandH + H * 0.07;
    const gw = W * 0.86;
    const gh = H - gy - H * 0.04;
    g.fillStyle = '#d8dde0';
    g.fillRect(gx - 4, gy - 4, gw + 8, gh + 8);
    const grad = g.createLinearGradient(0, gy, 0, gy + gh);
    grad.addColorStop(0, '#3a5062');
    grad.addColorStop(1, '#22323e');
    g.fillStyle = grad;
    g.fillRect(gx, gy, gw, gh);
    e.fillStyle = '#ffbf66';
    e.fillRect(gx, gy, gw, gh);
    if (o.kind === 'shop') {
      // porta + montantes
      g.fillStyle = 'rgba(30,30,30,0.7)';
      const px = gx + gw * 0.62;
      g.fillRect(px, gy, 5, gh);
      g.fillRect(px + gw * 0.16, gy, 5, gh);
      g.fillRect(gx + gw * 0.3, gy, 4, gh);
      e.fillStyle = '#000';
      e.fillRect(px, gy, 5, gh);
      e.fillRect(px + gw * 0.16, gy, 5, gh);
      e.fillRect(gx + gw * 0.3, gy, 4, gh);
    } else {
      // portão de enrolar
      g.fillStyle = '#7d8a93';
      g.fillRect(gx, gy, gw, gh);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = gy; y < gy + gh; y += 7) g.fillRect(gx, y, gw, 2);
      e.fillStyle = '#000';
      e.fillRect(gx, gy, gw, gh);
      // janelinha acesa ao lado
      e.fillStyle = '#ffbf66';
      e.fillRect(gx + gw * 0.76, gy + gh * 0.1, gw * 0.18, gh * 0.3);
      g.fillStyle = '#3a5062';
      g.fillRect(gx + gw * 0.76, gy + gh * 0.1, gw * 0.18, gh * 0.3);
    }
  }

  const map = toTexture(c1);
  const emissive = toTexture(c2);
  cache.set(key + '|m', map);
  cache.set(key + '|e', emissive);
  return { map, emissive };
}

/** Chapa de zinco ondulada (tons de cinza; multiplicada pela cor do telhado). */
export function corrugatedTexture(): THREE.Texture {
  const hit = cache.get('zinc');
  if (hit) return hit;
  const [c, g] = makeCanvas(128, 16);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, i % 2 ? '#8c8c8c' : '#f2f2f2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 16);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set('zinc', t);
  return t;
}

/** Listras de toldo (a cor de acento é aplicada pelo canvas). */
export function awningTexture(accent: string, repeatsX: number): THREE.Texture {
  const key = `awn|${accent}|${repeatsX}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(repeatsX * 32, 32);
  for (let i = 0; i < repeatsX * 2; i++) {
    g.fillStyle = i % 2 ? '#f6f1e6' : accent;
    g.fillRect(i * 16, 0, 16, 32);
  }
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Letreiro com texto (emissivo). */
export function signTexture(text: string, accent: string): THREE.Texture {
  const key = `sign|${text}|${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 128);
  g.fillStyle = '#10181d';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(5, 5, 502, 118);
  let size = 64;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const label = text.length > 28 ? text.slice(0, 27) + '…' : text;
  do {
    g.font = `700 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
    size -= 4;
  } while (g.measureText(label).width > 460 && size > 18);
  g.fillStyle = '#ffffff';
  g.fillText(label, 256, 68);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Gradiente radial para sombra de contato / halo de luz. */
export function radialTexture(kind: 'shadow' | 'glow'): THREE.Texture {
  const hit = cache.get('radial-' + kind);
  if (hit) return hit;
  const [c, g] = makeCanvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  if (kind === 'shadow') {
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = toTexture(c);
  cache.set('radial-' + kind, t);
  return t;
}
