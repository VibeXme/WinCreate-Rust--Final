export type EngineProfile = 'performance' | 'battery' | 'compatibility';

export interface DesktopRuntimeConfig {
  appId: string;
  productName: string;
  version: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  backgroundColor: string;
  engine: EngineProfile;
  backgroundRendering: boolean;
  dedicatedGpuForced: boolean;
  webviewGpuArgs: string[];
}

export interface EnginePerformanceBudgets {
  fps: number;
  undoMB: number;
  effectMB: number;
  gpuMB: number;
  rasterMB: number;
  scratchMB: number;
  maxBrushSize: number;
  maxCanvasDimension: number;
  maxFillGap: number;
}

export function parseEngineProfile(args: readonly string[]): EngineProfile {
  for (const arg of args) {
    if (arg.startsWith('--wincreate-engine=')) {
      const value = arg.slice('--wincreate-engine='.length).trim().toLowerCase();
      if (value === 'battery') return 'battery';
      if (value === 'compatibility') return 'compatibility';
      return 'performance';
    }
  }
  return 'performance';
}

export function getWebviewGpuArgs(engine: EngineProfile): string[] {
  if (engine === 'performance') {
    return [
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--enable-accelerated-2d-canvas',
      '--force-high-performance-gpu',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ];
  }
  if (engine === 'battery') {
    return ['--force-low-power-gpu'];
  }
  return ['--disable-gpu-rasterization'];
}

export function getUnlockedPerformanceBudgets(engine: EngineProfile = 'performance'): EnginePerformanceBudgets {
  if (engine === 'battery') {
    return {
      fps: 120,
      undoMB: 512,
      effectMB: 256,
      gpuMB: 512,
      rasterMB: 256,
      scratchMB: 192,
      maxBrushSize: 1600,
      maxCanvasDimension: 16384,
      maxFillGap: 32,
    };
  }
  return {
    fps: 360,
    undoMB: 2048,
    effectMB: 1024,
    gpuMB: 2048,
    rasterMB: 1024,
    scratchMB: 512,
    maxBrushSize: 1600,
    maxCanvasDimension: 16384,
    maxFillGap: 32,
  };
}

export function createDesktopRuntimeConfig(args: readonly string[] = []): DesktopRuntimeConfig {
  const engine = parseEngineProfile(args);
  return {
    appId: 'com.wincreate.studio',
    productName: 'WinCreate Studio',
    version: '6.6.0',
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0b0d12',
    engine,
    backgroundRendering: engine === 'performance',
    dedicatedGpuForced: engine === 'performance',
    webviewGpuArgs: getWebviewGpuArgs(engine),
  };
}

export function isAllowedDesktopNavigation(url: string): boolean {
  return (
    url.startsWith('tauri://') ||
    url.startsWith('https://tauri.localhost') ||
    url.startsWith('http://tauri.localhost') ||
    url.startsWith('http://localhost:3000') ||
    url.startsWith('http://127.0.0.1:8765') ||
    url === 'about:blank'
  );
}

/**
 * Computes continuous smudge dab spacing and sub-step coordinates so fast gestures
 * never leave gaps between dabs.
 */
export function computeSmudgeStepPlan(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  presetSpacing = 6
): { spacing: number; steps: Array<{ x: number; y: number }> } {
  const r = Math.max(2, radius);
  const spacing = Math.max(0.35, Math.min(2.2, (r * presetSpacing) / 140));
  const dist = Math.hypot(x1 - x0, y1 - y0);
  if (dist < 0.001) return { spacing, steps: [] };
  const count = Math.min(4096, Math.max(1, Math.ceil(dist / spacing)));
  const steps: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    steps.push({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
    });
  }
  return { spacing, steps };
}

/**
 * Preserves smudge carrier alpha and pigment when dragging across transparent gaps
 * so the smudge trail does not starve out mid-gap.
 */
export function blendSmudgeCarrierOverGap(
  carrierAlpha: number,
  destAlpha: number,
  pickupRate: number,
  dabWeight = 1
): number {
  const pickupScale = destAlpha < carrierAlpha ? Math.max(0.22, destAlpha / 255) : 1;
  const pick = Math.min(0.92, pickupRate * dabWeight * pickupScale);
  return carrierAlpha + (destAlpha - carrierAlpha) * pick;
}

/**
 * Watertight 4-connected Bresenham bridge + multi-angle & endpoint gap closing
 * followed by scanline flood fill.
 */
export function bridgeLineGapsAndFill(
  width: number,
  height: number,
  boundary: Uint8Array,
  seedX: number,
  seedY: number,
  gapRadius: number
): Uint8Array {
  const total = width * height;
  const closedBoundary = new Uint8Array(boundary);
  const maxGap = Math.max(0, Math.min(32, Math.round(gapRadius)));

  const localSeen = new Int32Array(total);
  const localQueue = new Int32Array(8192);
  let localTag = 1;
  const areLocallyConnected = (x0: number, y0: number, x1: number, y1: number): boolean => {
    const pad = 6;
    const lx0 = Math.max(0, Math.min(x0, x1) - pad);
    const lx1 = Math.min(width - 1, Math.max(x0, x1) + pad);
    const ly0 = Math.max(0, Math.min(y0, y1) - pad);
    const ly1 = Math.min(height - 1, Math.max(y0, y1) + pad);
    const start = y0 * width + x0;
    const goal = y1 * width + x1;
    if (start === goal) return true;
    const tag = ++localTag;
    localSeen[start] = tag;
    localQueue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail && tail < 8192) {
      const cur = localQueue[head++];
      if (cur === goal) return true;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < ly0 || ny > ly1) continue;
        const row = ny * width;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          if (nx < lx0 || nx > lx1) continue;
          const q = row + nx;
          if (localSeen[q] !== tag && closedBoundary[q]) {
            if (q === goal) return true;
            localSeen[q] = tag;
            localQueue[tail++] = q;
          }
        }
      }
    }
    return false;
  };

  const stampBridge = (x0: number, y0: number, x1: number, y1: number) => {
    if (areLocallyConnected(x0, y0, x1, y1)) return;
    let cx = x0 | 0;
    let cy = y0 | 0;
    const tx = x1 | 0;
    const ty = y1 | 0;
    const dx = Math.abs(tx - cx);
    const sx = cx < tx ? 1 : -1;
    const dy = -Math.abs(ty - cy);
    const sy = cy < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
        closedBoundary[cy * width + cx] = 1;
      }
      if (cx === tx && cy === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy && e2 <= dx) {
        if (cx + sx >= 0 && cx + sx < width && cy >= 0 && cy < height) {
          closedBoundary[cy * width + (cx + sx)] = 1;
        }
      }
      if (e2 >= dy) {
        err += dy;
        cx += sx;
      }
      if (e2 <= dx) {
        err += dx;
        cy += sy;
      }
    }
  };

  if (maxGap > 0) {
    const rayDirs: ReadonlyArray< readonly [number, number] > = [
      [1, 0], [0, 1], [1, 1], [1, -1],
      [2, 1], [1, 2], [2, -1], [1, -2],
      [3, 1], [1, 3], [3, -1], [1, -3],
      [3, 2], [2, 3], [3, -2], [2, -3],
    ];
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (!boundary[row + x]) continue;
        for (const [dx, dy] of rayDirs) {
          const stepLen = Math.hypot(dx, dy);
          const maxSteps = Math.max(1, Math.ceil(maxGap / stepLen));
          if (!boundary[(y + dy >= 0 && y + dy < height && x + dx >= 0 && x + dx < width) ? (y + dy) * width + (x + dx) : 0]) {
            let hitStep = 0;
            for (let s = 1; s <= maxSteps; s++) {
              const nx = x + dx * s;
              const ny = y + dy * s;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;
              if (boundary[ny * width + nx]) {
                hitStep = s;
                break;
              }
            }
            if (hitStep > 0) {
              stampBridge(x, y, x + dx * hitStep, y + dy * hitStep);
            }
          }
        }
      }
    }

    const endpoints: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        if (!boundary[row + x]) continue;
        const n0 = boundary[row - width + x];
        const n1 = boundary[row - width + x + 1];
        const n2 = boundary[row + x + 1];
        const n3 = boundary[row + width + x + 1];
        const n4 = boundary[row + width + x];
        const n5 = boundary[row + width + x - 1];
        const n6 = boundary[row + x - 1];
        const n7 = boundary[row - width + x - 1];
        const sum = n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7;
        const trans =
          (n0 === 0 && n1 === 1 ? 1 : 0) +
          (n1 === 0 && n2 === 1 ? 1 : 0) +
          (n2 === 0 && n3 === 1 ? 1 : 0) +
          (n3 === 0 && n4 === 1 ? 1 : 0) +
          (n4 === 0 && n5 === 1 ? 1 : 0) +
          (n5 === 0 && n6 === 1 ? 1 : 0) +
          (n6 === 0 && n7 === 1 ? 1 : 0) +
          (n7 === 0 && n0 === 1 ? 1 : 0);
        if (sum <= 3 && trans <= 1) {
          endpoints.push({ x, y });
        }
      }
    }
    const maxGapSq = (maxGap + 2) * (maxGap + 2);
    for (let i = 0; i < endpoints.length; i++) {
      const a = endpoints[i];
      let bestDistSq = maxGapSq;
      let bestPt: { x: number; y: number } | null = null;
      for (let j = 0; j < endpoints.length; j++) {
        if (i === j) continue;
        const b = endpoints[j];
        const d2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
        if (d2 >= 4 && d2 <= bestDistSq) {
          bestDistSq = d2;
          bestPt = b;
        }
      }
      if (bestPt) {
        stampBridge(a.x, a.y, bestPt.x, bestPt.y);
      }
    }
  }

  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let sp = 0;
  const startIdx = seedY * width + seedX;
  if (!closedBoundary[startIdx]) {
    visited[startIdx] = 1;
    stack[sp++] = startIdx;
  }
  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0 && !visited[idx - 1] && !closedBoundary[idx - 1]) {
      visited[idx - 1] = 1;
      stack[sp++] = idx - 1;
    }
    if (x < width - 1 && !visited[idx + 1] && !closedBoundary[idx + 1]) {
      visited[idx + 1] = 1;
      stack[sp++] = idx + 1;
    }
    if (y > 0 && !visited[idx - width] && !closedBoundary[idx - width]) {
      visited[idx - width] = 1;
      stack[sp++] = idx - width;
    }
    if (y < height - 1 && !visited[idx + width] && !closedBoundary[idx + width]) {
      visited[idx + width] = 1;
      stack[sp++] = idx + width;
    }
  }
  return visited;
}

/**
 * Procreate Hue, Saturation, Brightness (HSB) pixel buffer adjustment.
 * hueShiftDeg: -180..180, satDeltaPct: -100..100, brightDeltaPct: -100..100
 */
export function applyHSBAdjustment(
  src: Uint8ClampedArray,
  hueShiftDeg: number,
  satDeltaPct: number,
  brightDeltaPct: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const hShift = ((hueShiftDeg % 360) + 360) % 360;
  const sScale = Math.max(0, (100 + satDeltaPct) / 100);
  const bDelta = brightDeltaPct / 100;

  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) {
      out[i + 3] = 0;
      continue;
    }
    const r = src[i] / 255;
    const g = src[i + 1] / 255;
    const b = src[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d > 1e-6) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;

    const nh = (h + hShift) % 360;
    const ns = Math.max(0, Math.min(1, s * sScale));
    const nv = Math.max(0, Math.min(1, bDelta >= 0 ? v + (1 - v) * bDelta : v * (1 + bDelta)));

    const c = nv * ns;
    const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = nv - c;
    let nr = 0;
    let ng = 0;
    let nb = 0;
    if (nh < 60) { nr = c; ng = x; nb = 0; }
    else if (nh < 120) { nr = x; ng = c; nb = 0; }
    else if (nh < 180) { nr = 0; ng = c; nb = x; }
    else if (nh < 240) { nr = 0; ng = x; nb = c; }
    else if (nh < 300) { nr = x; ng = 0; nb = c; }
    else { nr = c; ng = 0; nb = x; }

    out[i] = Math.round((nr + m) * 255);
    out[i + 1] = Math.round((ng + m) * 255);
    out[i + 2] = Math.round((nb + m) * 255);
    out[i + 3] = a;
  }
  return out;
}

/**
 * Procreate Color Balance adjustment across Shadows, Midtones, and Highlights.
 * Each tuple is [cyanRed, magentaGreen, yellowBlue] in -100..100.
 */
export function applyColorBalanceAdjustment(
  src: Uint8ClampedArray,
  shadows: readonly [number, number, number],
  midtones: readonly [number, number, number],
  highlights: readonly [number, number, number],
  preserveLuma = true
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) {
      out[i + 3] = 0;
      continue;
    }
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    const sw = Math.max(0, 1 - luma * 2);
    const hw = Math.max(0, (luma - 0.5) * 2);
    const mw = 1 - Math.abs(luma - 0.5) * 2;

    const dr = (shadows[0] * sw + midtones[0] * mw + highlights[0] * hw) * 1.4;
    const dg = (shadows[1] * sw + midtones[1] * mw + highlights[1] * hw) * 1.4;
    const db = (shadows[2] * sw + midtones[2] * mw + highlights[2] * hw) * 1.4;

    let nr = Math.max(0, Math.min(255, r + dr));
    let ng = Math.max(0, Math.min(255, g + dg));
    let nb = Math.max(0, Math.min(255, b + db));

    if (preserveLuma) {
      const oldY = 0.299 * r + 0.587 * g + 0.114 * b;
      const newY = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      if (newY > 1 && oldY > 1) {
        const scale = Math.min(2.2, Math.max(0.45, oldY / newY));
        nr = Math.max(0, Math.min(255, nr * scale));
        ng = Math.max(0, Math.min(255, ng * scale));
        nb = Math.max(0, Math.min(255, nb * scale));
      }
    }

    out[i] = Math.round(nr);
    out[i + 1] = Math.round(ng);
    out[i + 2] = Math.round(nb);
    out[i + 3] = a;
  }
  return out;
}

/**
 * Procreate Curves / Levels 256-entry LUT tone mapping.
 */
export function applyLevelsCurveAdjustment(
  src: Uint8ClampedArray,
  blackPoint: number,
  gamma: number,
  whitePoint: number,
  contrastPct = 0
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const bp = Math.max(0, Math.min(254, blackPoint));
  const wp = Math.max(bp + 1, Math.min(255, whitePoint));
  const invRange = 1 / (wp - bp);
  const invGamma = 1 / Math.max(0.1, Math.min(5, gamma));
  const cFactor = (259 * (contrastPct + 255)) / (255 * (259 - contrastPct));

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const norm = Math.max(0, Math.min(1, (v - bp) * invRange));
    const gam = Math.pow(norm, invGamma) * 255;
    lut[v] = Math.max(0, Math.min(255, Math.round(cFactor * (gam - 128) + 128)));
  }

  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) continue;
    out[i] = lut[src[i]];
    out[i + 1] = lut[src[i + 1]];
    out[i + 2] = lut[src[i + 2]];
    out[i + 3] = a;
  }
  return out;
}

/**
 * Procreate Chromatic Aberration spatial R/B channel displacement.
 */
export function applyChromaticAberration(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  shiftPx: number,
  angleDeg = 0,
  falloffPct = 0
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const rad = (angleDeg * Math.PI) / 180;
  const dxBase = Math.cos(rad) * shiftPx;
  const dyBase = Math.sin(rad) * shiftPx;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxR = Math.hypot(cx, cy) || 1;
  const falloff = Math.max(0, Math.min(1, falloffPct / 100));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const radialFactor = falloff > 0 ? Math.pow(Math.hypot(x - cx, y - cy) / maxR, falloff * 2) : 1;
      const ox = Math.round(dxBase * radialFactor);
      const oy = Math.round(dyBase * radialFactor);

      const rx = Math.max(0, Math.min(width - 1, x - ox));
      const ry = Math.max(0, Math.min(height - 1, y - oy));
      const bx = Math.max(0, Math.min(width - 1, x + ox));
      const by = Math.max(0, Math.min(height - 1, y + oy));

      const rIdx = (ry * width + rx) * 4;
      const bIdx = (by * width + bx) * 4;

      const rVal = src[rIdx];
      const gVal = src[idx + 1];
      const bVal = src[bIdx + 2];
      const aVal = Math.max(src[idx + 3], Math.round((src[rIdx + 3] + src[bIdx + 3]) * 0.45));

      out[idx] = rVal;
      out[idx + 1] = gVal;
      out[idx + 2] = bVal;
      out[idx + 3] = aVal;
    }
  }
  return out;
}

export type LiquifyMode = 'push' | 'twirl_cw' | 'twirl_ccw' | 'pinch' | 'expand' | 'crystallize' | 'reconstruct';

/**
 * Procreate Bilinear Subpixel Liquify & Reconstruct step.
 */
export function stepBilinearLiquify(
  src: Uint8ClampedArray,
  original: Uint8ClampedArray | null,
  width: number,
  height: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  mode: LiquifyMode,
  radius: number,
  strength: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const r = Math.max(4, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));

  const sampleBilinear = (buf: Uint8ClampedArray, sx: number, sy: number, ch: number): number => {
    const clampedX = Math.max(0, Math.min(width - 1, sx));
    const clampedY = Math.max(0, Math.min(height - 1, sy));
    const ix = Math.floor(clampedX);
    const iy = Math.floor(clampedY);
    const fx = clampedX - ix;
    const fy = clampedY - iy;
    const ix1 = Math.min(width - 1, ix + 1);
    const iy1 = Math.min(height - 1, iy + 1);
    const p00 = buf[(iy * width + ix) * 4 + ch];
    const p10 = buf[(iy * width + ix1) * 4 + ch];
    const p01 = buf[(iy1 * width + ix) * 4 + ch];
    const p11 = buf[(iy1 * width + ix1) * 4 + ch];
    return (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
  };

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const wx = px - cx;
      const wy = py - cy;
      const dist = Math.hypot(wx, wy);
      if (dist >= r) continue;
      const q = 1 - dist / r;
      const f = q * q * (3 - 2 * q) * strength;
      const dIdx = (py * width + px) * 4;

      if (mode === 'reconstruct' && original) {
        const w = Math.min(1, f * 0.65);
        for (let c = 0; c < 4; c++) {
          out[dIdx + c] = Math.round(src[dIdx + c] + (original[dIdx + c] - src[dIdx + c]) * w);
        }
        continue;
      }

      let sx = px;
      let sy = py;
      if (mode === 'push') {
        sx = px - dx * f;
        sy = py - dy * f;
      } else if (mode === 'twirl_cw' || mode === 'twirl_ccw') {
        const dir = mode === 'twirl_cw' ? 1 : -1;
        const a = f * 0.55 * dir;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        sx = cx + (wx * cos - wy * sin);
        sy = cy + (wx * sin + wy * cos);
      } else if (mode === 'pinch') {
        sx = px + wx * f * 0.42;
        sy = py + wy * f * 0.42;
      } else if (mode === 'expand') {
        sx = px - wx * f * 0.42;
        sy = py - wy * f * 0.42;
      } else if (mode === 'crystallize') {
        const cell = Math.max(4, Math.round(r * 0.16));
        const gx = Math.floor(px / cell) * cell + cell * 0.5;
        const gy = Math.floor(py / cell) * cell + cell * 0.5;
        sx = px + (gx - px) * Math.min(1, f * 0.85);
        sy = py + (gy - py) * Math.min(1, f * 0.85);
      }

      for (let c = 0; c < 4; c++) {
        out[dIdx + c] = Math.round(sampleBilinear(src, sx, sy, c));
      }
    }
  }
  return out;
}

/**
 * Procreate Drawing Assist coordinate snapping for 2D Grid, Isometric, and Perspective guides.
 */
export function snapDrawingAssistPoint(
  start: { x: number; y: number },
  point: { x: number; y: number },
  mode: 'grid2d' | 'isometric' | 'perspective',
  vanishingPoints: ReadonlyArray<{ x: number; y: number }> = []
): { x: number; y: number } {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return { ...point };

  if (mode === 'grid2d') {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: point.x, y: start.y };
    }
    return { x: start.x, y: point.y };
  }

  if (mode === 'isometric') {
    const angles = [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6];
    let bestPt = { ...point };
    let bestErr = Infinity;
    for (const a of angles) {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const proj = dx * ux + dy * uy;
      const px = start.x + ux * proj;
      const py = start.y + uy * proj;
      const err = Math.hypot(point.x - px, point.y - py);
      if (err < bestErr) {
        bestErr = err;
        bestPt = { x: px, y: py };
      }
    }
    return bestPt;
  }

  if (mode === 'perspective' && vanishingPoints.length > 0) {
    let bestAxis: { x: number; y: number } | null = null;
    let bestErr = Infinity;
    for (const vp of vanishingPoints) {
      const vx = vp.x - start.x;
      const vy = vp.y - start.y;
      const vLen = Math.hypot(vx, vy);
      if (vLen < 1) continue;
      const ux = vx / vLen;
      const uy = vy / vLen;
      const err = Math.abs(dx * uy - dy * ux) / dist;
      if (err < bestErr) {
        bestErr = err;
        bestAxis = { x: ux, y: uy };
      }
    }
    if (bestAxis) {
      const proj = dx * bestAxis.x + dy * bestAxis.y;
      return { x: start.x + bestAxis.x * proj, y: start.y + bestAxis.y * proj };
    }
  }

  return { ...point };
}

/**
 * Fast 1-pass in-place bristle carrier diffusion for creamy Procreate-style wet blending
 * without running a 6-pass Float32 Gaussian blur over the destination tile on every dab.
 */
export function diffuseCarrierInPlace(
  carrier: Uint8ClampedArray,
  size: number,
  softnessRatio: number
): void {
  const mix = Math.max(0, Math.min(0.45, softnessRatio * 0.38));
  if (mix <= 0.01 || size < 3) return;
  const keep = 1 - mix;
  const quarter = mix * 0.25;
  const stride = size * 4;
  for (let y = 1; y < size - 1; y++) {
    let idx = (y * size + 1) * 4;
    for (let x = 1; x < size - 1; x++, idx += 4) {
      const a0 = carrier[idx + 3];
      const aL = carrier[idx - 4 + 3];
      const aR = carrier[idx + 4 + 3];
      const aU = carrier[idx - stride + 3];
      const aD = carrier[idx + stride + 3];
      if ((a0 | aL | aR | aU | aD) === 0) continue;
      if ((a0 & aL & aR & aU & aD) === 255) {
        carrier[idx] = carrier[idx] * keep + (carrier[idx - 4] + carrier[idx + 4] + carrier[idx - stride] + carrier[idx + stride]) * quarter;
        carrier[idx + 1] = carrier[idx + 1] * keep + (carrier[idx - 3] + carrier[idx + 5] + carrier[idx - stride + 1] + carrier[idx + stride + 1]) * quarter;
        carrier[idx + 2] = carrier[idx + 2] * keep + (carrier[idx - 2] + carrier[idx + 6] + carrier[idx - stride + 2] + carrier[idx + stride + 2]) * quarter;
      } else {
        const m0 = a0 * keep;
        const mN = (aL + aR + aU + aD) * quarter;
        const mass = m0 + mN;
        if (mass > 0.5) {
          const inv = 1 / mass;
          carrier[idx] = (carrier[idx] * m0 + (carrier[idx - 4] * aL + carrier[idx + 4] * aR + carrier[idx - stride] * aU + carrier[idx + stride] * aD) * quarter) * inv;
          carrier[idx + 1] = (carrier[idx + 1] * m0 + (carrier[idx - 3] * aL + carrier[idx + 5] * aR + carrier[idx - stride + 1] * aU + carrier[idx + stride + 1] * aD) * quarter) * inv;
          carrier[idx + 2] = (carrier[idx + 2] * m0 + (carrier[idx - 2] * aL + carrier[idx + 6] * aR + carrier[idx - stride + 2] * aU + carrier[idx + stride + 2] * aD) * quarter) * inv;
          carrier[idx + 3] = mass;
        }
      }
    }
  }
}

/**
 * Zero-copy, zero-allocation in-place wet smudge dab kernel.
 * Mutates `canvasPixels` and `carrier` directly without readTile/writeTile copies.
 */
export function stepInPlaceWetSmudge(
  canvasPixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  carrier: Uint8ClampedArray,
  weights: Float32Array,
  dabSize: number,
  tx: number,
  ty: number,
  strength: number,
  pickupRate: number,
  preserveCoverage = true
): { changed: boolean; x0: number; y0: number; x1: number; y1: number } {
  const r0 = Math.max(0, -ty);
  const r1 = Math.min(dabSize, canvasHeight - ty);
  const c0 = Math.max(0, -tx);
  const c1 = Math.min(dabSize, canvasWidth - tx);
  if (r1 <= r0 || c1 <= c0) {
    return { changed: false, x0: 0, y0: 0, x1: 0, y1: 0 };
  }

  let changed = false;
  for (let row = r0; row < r1; row++) {
    let dIdx = ((ty + row) * canvasWidth + (tx + c0)) * 4;
    let p = row * dabSize + c0;
    let cIdx = p * 4;
    for (let col = c0; col < c1; col++, dIdx += 4, p++, cIdx += 4) {
      const weight = weights[p];
      if (weight <= 0) continue;
      const a = canvasPixels[dIdx + 3];
      const ca = carrier[cIdx + 3];
      if ((a | ca) === 0) continue;

      const w = weight * strength;
      const dr = canvasPixels[dIdx];
      const dg = canvasPixels[dIdx + 1];
      const db = canvasPixels[dIdx + 2];
      const cr = carrier[cIdx];
      const cg = carrier[cIdx + 1];
      const cb = carrier[cIdx + 2];

      if ((a & ca) === 255) {
        const nr = dr + (cr - dr) * w;
        const ng = dg + (cg - dg) * w;
        const nb = db + (cb - db) * w;
        canvasPixels[dIdx] = nr;
        canvasPixels[dIdx + 1] = ng;
        canvasPixels[dIdx + 2] = nb;
        if (canvasPixels[dIdx] !== dr || canvasPixels[dIdx + 1] !== dg || canvasPixels[dIdx + 2] !== db) {
          changed = true;
        }
        const exchange = pickupRate * weight;
        carrier[cIdx] = cr + (dr - cr) * exchange;
        carrier[cIdx + 1] = cg + (dg - cg) * exchange;
        carrier[cIdx + 2] = cb + (db - cb) * exchange;
        continue;
      }

      const inv = 1 - w;
      const mass = a * inv + ca * w;
      if (mass > 0.001) {
        const invMass = 1 / mass;
        canvasPixels[dIdx] = (dr * a * inv + cr * ca * w) * invMass;
        canvasPixels[dIdx + 1] = (dg * a * inv + cg * ca * w) * invMass;
        canvasPixels[dIdx + 2] = (db * a * inv + cb * ca * w) * invMass;
      } else {
        canvasPixels[dIdx] = 0;
        canvasPixels[dIdx + 1] = 0;
        canvasPixels[dIdx + 2] = 0;
      }
      let outA = mass;
      if (outA < a && a > 0) {
        outA = preserveCoverage ? a : outA + (a - outA) * (a / 255) * (a / 255);
      }
      canvasPixels[dIdx + 3] = outA;
      if (
        canvasPixels[dIdx + 3] !== a ||
        ((a || canvasPixels[dIdx + 3]) &&
          (canvasPixels[dIdx] !== dr || canvasPixels[dIdx + 1] !== dg || canvasPixels[dIdx + 2] !== db))
      ) {
        changed = true;
      }

      const pickupScale = a < ca ? Math.max(0.22, a / 255) : 1;
      const exchange = pickupRate * weight * pickupScale;
      const remain = 1 - exchange;
      const newMass = ca * remain + a * exchange;
      if (newMass > 0.001) {
        const invNewMass = 1 / newMass;
        carrier[cIdx] = (cr * ca * remain + dr * a * exchange) * invNewMass;
        carrier[cIdx + 1] = (cg * ca * remain + dg * a * exchange) * invNewMass;
        carrier[cIdx + 2] = (cb * ca * remain + db * a * exchange) * invNewMass;
      } else {
        carrier[cIdx] = 0;
        carrier[cIdx + 1] = 0;
        carrier[cIdx + 2] = 0;
      }
      carrier[cIdx + 3] = newMass;
    }
  }

  return {
    changed,
    x0: tx + c0,
    y0: ty + r0,
    x1: tx + c1,
    y1: ty + r1,
  };
}

export interface DrawingGpuAccelerationState {
  gpuDrawingEnabled: boolean;
  gpuWetPaintEnabled: boolean;
  gpuEffectsEnabled: boolean;
  canvasBackend: 'accelerated' | 'readback';
  wetPaintMode: 'gpu' | 'cpu';
  effectsMode: 'gpu' | 'cpu';
  engineSummary: string;
  badgeLabel: string;
}

/**
 * Resolves the independent GPU acceleration configuration for the drawing engine,
 * decoupling Canvas 2D hardware acceleration, WebGL2 wet-paint shaders, and GPU layer effects.
 */
export function resolveDrawingGpuAccelerationState(
  gpuDrawingEnabled: boolean,
  gpuWetPaintEnabled = true,
  gpuEffectsEnabled = true
): DrawingGpuAccelerationState {
  const drawingOn = Boolean(gpuDrawingEnabled);
  const wetOn = drawingOn && Boolean(gpuWetPaintEnabled);
  const effectsOn = drawingOn && Boolean(gpuEffectsEnabled);
  return {
    gpuDrawingEnabled: drawingOn,
    gpuWetPaintEnabled: Boolean(gpuWetPaintEnabled),
    gpuEffectsEnabled: Boolean(gpuEffectsEnabled),
    canvasBackend: drawingOn ? 'accelerated' : 'readback',
    wetPaintMode: wetOn ? 'gpu' : 'cpu',
    effectsMode: effectsOn ? 'gpu' : 'cpu',
    engineSummary: drawingOn
      ? 'GPU Accelerated (Active)'
      : 'Software Readback (CPU Mode)',
    badgeLabel: drawingOn ? 'GPU ON' : 'CPU ONLY',
  };
}

export interface GpuProbeInput {
  gpuDrawingEnabled: boolean;
  gpuPreference: 'auto' | 'high-performance' | 'low-power';
  webglAvailable: boolean;
  webglRenderer: string;
  floatBufferSupported: boolean;
  maxTextureSize: number;
  webgpuAvailable: boolean;
  webgpuAdapterName: string;
  wetPaintBytes?: number;
  effectsBytes?: number;
  probeCount?: number;
}

export interface GpuProbeFormattedDiagnostics {
  engineStateLabel: string;
  webglStatusLabel: string;
  webgpuStatusLabel: string;
  floatBufferLabel: string;
  maxTextureLabel: string;
  memorySummary: string;
  probeCountLabel: string;
  probeStatusLine: string;
}

/**
 * Formats live WebGL2 and WebGPU probe results into deterministic UI status strings
 * for the Studio Preferences GPU settings pane.
 */
export function formatGpuProbeDiagnostics(input: GpuProbeInput): GpuProbeFormattedDiagnostics {
  const engineStateLabel = input.gpuDrawingEnabled
    ? 'GPU Accelerated (Active)'
    : 'Disabled · Software CPU Pipeline';
  const webglStatusLabel = input.webglAvailable
    ? `WebGL2 Ready · ${input.webglRenderer || 'Hardware Renderer'}`
    : 'WebGL2 Unavailable';
  const webgpuStatusLabel = input.webgpuAvailable
    ? `WebGPU Ready · ${input.webgpuAdapterName || 'Default Adapter'}`
    : 'WebGPU Unavailable (WebGL2/Canvas2D Active)';
  const floatBufferLabel = input.webglAvailable
    ? input.floatBufferSupported
      ? 'Supported (RGBA16F / RGBA32F)'
      : '8-bit RGBA Fallback'
    : 'Unavailable';
  const maxTextureLabel =
    input.maxTextureSize > 0 ? `${input.maxTextureSize} px` : 'Unknown';
  const totalBytes = Math.max(0, (input.wetPaintBytes || 0) + (input.effectsBytes || 0));
  const memorySummary = `${(totalBytes / 1048576).toFixed(1)} MB allocated`;
  const count = Math.max(1, input.probeCount || 1);
  const probeCountLabel = `Probe #${count}`;
  const prefLabel =
    input.gpuPreference === 'auto' ? 'system default' : input.gpuPreference;
  const probeStatusLine = input.gpuDrawingEnabled
    ? `GPU probe verified (${prefLabel}) · Drawing engine hardware acceleration enabled.`
    : `GPU probe verified (${prefLabel}) · Drawing engine pinned to CPU readback pipeline.`;

  return {
    engineStateLabel,
    webglStatusLabel,
    webgpuStatusLabel,
    floatBufferLabel,
    maxTextureLabel,
    memorySummary,
    probeCountLabel,
    probeStatusLine,
  };
}

export interface VectorStrokeNode {
  x: number;
  y: number;
  r: number;
}

export interface VectorStressTestMetrics {
  strokeCount: number;
  pointsPerStroke: number;
  totalPoints: number;
  totalTessellatedVertices: number;
  avgFrameTimeMs: number;
  minFrameTimeMs: number;
  maxFrameTimeMs: number;
  p95FrameTimeMs: number;
  effectiveFps: number;
  throughputPointsPerSec: number;
  lagSeverity: 'optimal' | 'moderate' | 'high';
  avgFrameTimeLabel: string;
  peakFrameTimeLabel: string;
  fpsLabel: string;
  workloadLabel: string;
  troubleshootingAdvice: string;
}

export interface RustCrossPlatformTargetConfig {
  appId: string;
  version: string;
  engine: EngineProfile;
  windows: {
    targets: string[];
    gpuBackend: string;
    installerFormats: string[];
    webviewRuntime: string;
    dedicatedGpuExports: string[];
  };
  android: {
    targets: string[];
    minSdkVersion: number;
    targetSdkVersion: number;
    gpuBackend: string;
    packageFormats: string[];
    mobileEntryPoint: string;
    stylusLowLatency: boolean;
  };
}

/**
 * Generates a deterministic batch of complex multi-frequency Lissajous/harmonic vector strokes
 * with dynamic stylus pressure radii for stressing the vector stroke engine.
 */
export function generateComplexVectorStrokeBatch(
  strokeCount = 24,
  pointsPerStroke = 180,
  width = 1920,
  height = 1080
): VectorStrokeNode[][] {
  const safeStrokes = Math.max(1, Math.min(256, Math.round(strokeCount)));
  const safePoints = Math.max(8, Math.min(2048, Math.round(pointsPerStroke)));
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = width * 0.38;
  const ry = height * 0.38;

  const strokes: VectorStrokeNode[][] = [];
  for (let s = 0; s < safeStrokes; s++) {
    const phase = (s / safeStrokes) * Math.PI * 2;
    const freqX = 3 + (s % 5);
    const freqY = 2 + ((s * 2) % 7);
    const baseRadius = 3 + (s % 9) * 1.75;
    const nodes: VectorStrokeNode[] = [];
    for (let i = 0; i < safePoints; i++) {
      const t = i / (safePoints - 1);
      const theta = t * Math.PI * 2;
      const harmonic = 0.82 + 0.18 * Math.sin(theta * 6 + phase);
      const x = cx + Math.cos(theta * freqX + phase) * rx * harmonic;
      const y = cy + Math.sin(theta * freqY + phase * 1.3) * ry * harmonic;
      const pressure = 0.2 + 0.8 * Math.pow(Math.sin(t * Math.PI), 0.85) * (0.75 + 0.25 * Math.cos(theta * 8 + s));
      const r = Math.max(0.5, baseRadius * pressure);
      nodes.push({ x, y, r });
    }
    strokes.push(nodes);
  }
  return strokes;
}

/**
 * Tessellates a pressure-sensitive vector stroke into cubic-interpolated envelope segments
 * and returns the SVG path string and vertex count, matching the Rust & Canvas vector ink pipeline.
 */
export function tessellatePressureVectorStroke(points: ReadonlyArray<VectorStrokeNode>): {
  svgPath: string;
  vertexCount: number;
  arcLength: number;
} {
  if (!points || points.length === 0) {
    return { svgPath: '', vertexCount: 0, arcLength: 0 };
  }
  if (points.length === 1) {
    const p = points[0];
    const r = Math.max(0.125, p.r);
    return {
      svgPath: `M ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x - r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} Z`,
      vertexCount: 8,
      arcLength: 0,
    };
  }

  let arcLength = 0;
  let vertexCount = 0;
  const parts: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const r = Math.max(0.125, p.r);
    parts.push(
      `M ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x - r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} Z`
    );
    vertexCount += 4;
    if (i === 0) continue;
    const q = points[i - 1];
    const qr = Math.max(0.125, q.r);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const len = Math.hypot(dx, dy);
    arcLength += len;
    if (len <= Math.abs(qr - r) + 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    const k = (qr - r) / len;
    const h = Math.sqrt(Math.max(0, 1 - k * k));
    const ax = ux * k - uy * h;
    const ay = uy * k + ux * h;
    const bx = ux * k + uy * h;
    const by = uy * k - ux * h;
    parts.push(
      `M ${(q.x + ax * qr).toFixed(2)} ${(q.y + ay * qr).toFixed(2)} L ${(p.x + ax * r).toFixed(2)} ${(p.y + ay * r).toFixed(2)} L ${(p.x + bx * r).toFixed(2)} ${(p.y + by * r).toFixed(2)} L ${(q.x + bx * qr).toFixed(2)} ${(q.y + by * qr).toFixed(2)} Z`
    );
    vertexCount += 4;
  }

  return {
    svgPath: parts.join(' '),
    vertexCount,
    arcLength,
  };
}

/**
 * Calculates average, p95, and peak frame times from a vector stroke stress test run
 * and produces actionable lag troubleshooting diagnostics.
 */
export function calculateVectorStressTestMetrics(
  frameTimesMs: ReadonlyArray<number>,
  strokeCount: number,
  pointsPerStroke: number,
  gpuDrawingEnabled = true,
  ssaaFactor = 2,
  totalTessellatedVertices = 0
): VectorStressTestMetrics {
  const validSamples = frameTimesMs.filter(v => Number.isFinite(v) && v >= 0);
  const sampleCount = Math.max(1, validSamples.length);
  const sanitized = validSamples.length > 0 ? validSamples.map(v => Math.max(0.05, v)) : [1.0];

  const sum = sanitized.reduce((acc, v) => acc + v, 0);
  const avgFrameTimeMs = +(sum / sampleCount).toFixed(2);
  const sorted = [...sanitized].sort((a, b) => a - b);
  const minFrameTimeMs = +sorted[0].toFixed(2);
  const maxFrameTimeMs = +sorted[sorted.length - 1].toFixed(2);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95FrameTimeMs = +sorted[p95Idx].toFixed(2);

  const effectiveFps = Math.min(360, Math.max(1, Math.round(1000 / Math.max(0.2, avgFrameTimeMs))));
  const totalPoints = Math.max(1, strokeCount * pointsPerStroke);
  const totalDurationSec = Math.max(0.001, sum / 1000);
  const throughputPointsPerSec = Math.round(totalPoints / totalDurationSec);
  const vertices = totalTessellatedVertices > 0 ? totalTessellatedVertices : totalPoints * 8;

  let lagSeverity: 'optimal' | 'moderate' | 'high' = 'optimal';
  let troubleshootingAdvice = '';

  if (avgFrameTimeMs <= 8.33) {
    lagSeverity = 'optimal';
    troubleshootingAdvice = gpuDrawingEnabled
      ? `Optimal (${avgFrameTimeMs.toFixed(2)} ms/frame · 120Hz+ ProMotion ready) — Complex vector strokes are rendering well inside the 8.33 ms frame budget with GPU acceleration active.`
      : `Optimal (${avgFrameTimeMs.toFixed(2)} ms/frame) — CPU readback pipeline is keeping up, though enabling Drawing Engine GPU Acceleration will further reduce peak frame jitter.`;
  } else if (avgFrameTimeMs <= 16.67) {
    lagSeverity = 'moderate';
    troubleshootingAdvice = !gpuDrawingEnabled
      ? `Moderate frame time (${avgFrameTimeMs.toFixed(2)} ms/frame · 60Hz budget) — Enable "Drawing Engine GPU Acceleration" above to offload vector compositing and reach 120Hz latency.`
      : ssaaFactor > 1
        ? `Moderate frame time (${avgFrameTimeMs.toFixed(2)} ms/frame · 60Hz budget) — Lower Stroke Supersampling from ${ssaaFactor}× SSAA to 1× Native in AA & Stroke settings for 120Hz stylus response.`
        : `Moderate frame time (${avgFrameTimeMs.toFixed(2)} ms/frame · 60Hz budget) — Switch Adapter Power Profile to "Prefer Dedicated GPU" to eliminate mid-stroke throttling.`;
  } else {
    lagSeverity = 'high';
    const fixes: string[] = [];
    if (!gpuDrawingEnabled) fixes.push('enable Drawing Engine GPU Acceleration');
    if (ssaaFactor > 1) fixes.push(`reduce SSAA from ${ssaaFactor}× to 1× Native`);
    fixes.push('set Adapter Power Profile to Prefer Dedicated GPU');
    troubleshootingAdvice = `Lag detected (${avgFrameTimeMs.toFixed(2)} ms/frame exceeds 16.67 ms 60Hz budget) — Recommended fixes: ${fixes.join(', ')}.`;
  }

  return {
    strokeCount,
    pointsPerStroke,
    totalPoints,
    totalTessellatedVertices: vertices,
    avgFrameTimeMs,
    minFrameTimeMs,
    maxFrameTimeMs,
    p95FrameTimeMs,
    effectiveFps,
    throughputPointsPerSec,
    lagSeverity,
    avgFrameTimeLabel: `${avgFrameTimeMs.toFixed(2)} ms / frame`,
    peakFrameTimeLabel: `P95 ${p95FrameTimeMs.toFixed(2)} ms · Peak ${maxFrameTimeMs.toFixed(2)} ms`,
    fpsLabel: `${effectiveFps} FPS (${(throughputPointsPerSec / 1000).toFixed(1)}k pts/s)`,
    workloadLabel: `${strokeCount} complex vector strokes · ${totalPoints.toLocaleString('en-US')} pressure nodes (${vertices.toLocaleString('en-US')} tris)`,
    troubleshootingAdvice,
  };
}

/**
 * Returns the complete Rust cross-platform configuration for Windows (Win32 / Direct3D11 / WebView2)
 * and Android (ARM64 / Vulkan / GLES3 / Tauri Mobile).
 */
export function createRustCrossPlatformTargets(
  engine: EngineProfile = 'performance'
): RustCrossPlatformTargetConfig {
  return {
    appId: 'com.wincreate.studio',
    version: '6.6.0',
    engine,
    windows: {
      targets: ['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc'],
      gpuBackend: 'Direct3D 11 / DXGI 1.6 SwapChain + ANGLE WebGL2/WebGPU',
      installerFormats: ['nsis', 'msi'],
      webviewRuntime: 'Microsoft Edge WebView2 (Evergreen Bootstrapper)',
      dedicatedGpuExports: ['NvOptimusEnablement=1', 'AmdPowerXpressRequestHighPerformance=1'],
    },
    android: {
      targets: ['aarch64-linux-android', 'armv7-linux-androideabi', 'x86_64-linux-android'],
      minSdkVersion: 26,
      targetSdkVersion: 35,
      gpuBackend: 'Vulkan 1.3 / OpenGL ES 3.2 Hardware Renderer',
      packageFormats: ['apk', 'aab'],
      mobileEntryPoint: '#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()',
      stylusLowLatency: true,
    },
  };
}




