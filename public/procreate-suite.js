/*! WinCreate 6.6.0 — Procreate Parity Performance & Creative Suite */
WinCreate.use(app => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));

  // =========================================================================
  // 1. PURE SIMD-FRIENDLY TYPED-ARRAY PIXEL ADJUSTMENT KERNELS
  // =========================================================================

  function computeContentBounds(imgData, width, height) {
    const d = imgData.data;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (d[(row + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0 || y1 < y0) return null;
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function applyHSB(src, hueShiftDeg, satDeltaPct, brightDeltaPct) {
    const out = new Uint8ClampedArray(src.length);
    const hShift = ((hueShiftDeg % 360) + 360) % 360;
    const sScale = Math.max(0, (100 + satDeltaPct) / 100);
    const bDelta = brightDeltaPct / 100;

    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a === 0) continue;
      const r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
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
      let nr = 0, ng = 0, nb = 0;
      if (nh < 60) { nr = c; ng = x; }
      else if (nh < 120) { nr = x; ng = c; }
      else if (nh < 180) { ng = c; nb = x; }
      else if (nh < 240) { ng = x; nb = c; }
      else if (nh < 300) { nr = x; nb = c; }
      else { nr = c; nb = x; }

      out[i] = Math.round((nr + m) * 255);
      out[i + 1] = Math.round((ng + m) * 255);
      out[i + 2] = Math.round((nb + m) * 255);
      out[i + 3] = a;
    }
    return out;
  }

  function applyColorBalance(src, shadows, midtones, highlights, preserveLuma = true) {
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a === 0) continue;
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sw = Math.max(0, 1 - luma * 2);
      const hw = Math.max(0, (luma - 0.5) * 2);
      const mw = 1 - Math.abs(luma - 0.5) * 2;

      const dr = (shadows[0] * sw + midtones[0] * mw + highlights[0] * hw) * 1.4;
      const dg = (shadows[1] * sw + midtones[1] * mw + highlights[1] * hw) * 1.4;
      const db = (shadows[2] * sw + midtones[2] * mw + highlights[2] * hw) * 1.4;

      let nr = clamp(r + dr, 0, 255);
      let ng = clamp(g + dg, 0, 255);
      let nb = clamp(b + db, 0, 255);

      if (preserveLuma) {
        const oldY = 0.299 * r + 0.587 * g + 0.114 * b;
        const newY = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        if (newY > 1 && oldY > 1) {
          const s = clamp(oldY / newY, 0.45, 2.2);
          nr = clamp(nr * s, 0, 255);
          ng = clamp(ng * s, 0, 255);
          nb = clamp(nb * s, 0, 255);
        }
      }
      out[i] = Math.round(nr);
      out[i + 1] = Math.round(ng);
      out[i + 2] = Math.round(nb);
      out[i + 3] = a;
    }
    return out;
  }

  function applyLevelsCurve(src, blackPoint, gamma, whitePoint, contrastPct = 0, channel = 'rgb') {
    const out = new Uint8ClampedArray(src.length);
    const bp = clamp(blackPoint, 0, 254);
    const wp = clamp(whitePoint, bp + 1, 255);
    const invRange = 1 / (wp - bp);
    const invGamma = 1 / clamp(gamma, 0.1, 5);
    const cFactor = (259 * (contrastPct + 255)) / (255 * (259 - contrastPct));

    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const norm = clamp((v - bp) * invRange, 0, 1);
      const gam = Math.pow(norm, invGamma) * 255;
      lut[v] = clamp(Math.round(cFactor * (gam - 128) + 128), 0, 255);
    }

    const doR = channel === 'rgb' || channel === 'r';
    const doG = channel === 'rgb' || channel === 'g';
    const doB = channel === 'rgb' || channel === 'b';

    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a === 0) continue;
      out[i] = doR ? lut[src[i]] : src[i];
      out[i + 1] = doG ? lut[src[i + 1]] : src[i + 1];
      out[i + 2] = doB ? lut[src[i + 2]] : src[i + 2];
      out[i + 3] = a;
    }
    return { out, lut };
  }

  function applyChromaticAberration(src, width, height, shiftPx, angleDeg = 0, falloffPct = 0) {
    const out = new Uint8ClampedArray(src.length);
    const rad = (angleDeg * Math.PI) / 180;
    const dxBase = Math.cos(rad) * shiftPx;
    const dyBase = Math.sin(rad) * shiftPx;
    const cx = width * 0.5, cy = height * 0.5;
    const maxR = Math.hypot(cx, cy) || 1;
    const falloff = clamp(falloffPct / 100, 0, 1);

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (row + x) * 4;
        const radial = falloff > 0 ? Math.pow(Math.hypot(x - cx, y - cy) / maxR, falloff * 2) : 1;
        const ox = Math.round(dxBase * radial);
        const oy = Math.round(dyBase * radial);
        const rx = clamp(x - ox, 0, width - 1), ry = clamp(y - oy, 0, height - 1);
        const bx = clamp(x + ox, 0, width - 1), by = clamp(y + oy, 0, height - 1);
        const rIdx = (ry * width + rx) * 4;
        const bIdx = (by * width + bx) * 4;
        out[idx] = src[rIdx];
        out[idx + 1] = src[idx + 1];
        out[idx + 2] = src[bIdx + 2];
        out[idx + 3] = Math.max(src[idx + 3], Math.round((src[rIdx + 3] + src[bIdx + 3]) * 0.45));
      }
    }
    return out;
  }

  function applyDirectionalMotionBlur(src, width, height, distancePx, angleDeg = 0) {
    const dist = clamp(distancePx, 0, 120);
    if (dist < 0.5) return new Uint8ClampedArray(src);
    const out = new Uint8ClampedArray(src.length);
    const rad = (angleDeg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const samples = Math.min(31, Math.max(3, Math.round(dist) | 1));
    const half = (samples - 1) / 2;
    const step = dist / Math.max(1, samples - 1);

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let k = -half; k <= half; k++) {
          const sx = clamp(Math.round(x + ux * k * step), 0, width - 1);
          const sy = clamp(Math.round(y + uy * k * step), 0, height - 1);
          const si = (sy * width + sx) * 4;
          const a = src[si + 3];
          sr += src[si] * a;
          sg += src[si + 1] * a;
          sb += src[si + 2] * a;
          sa += a;
        }
        const idx = (row + x) * 4;
        const meanA = sa / samples;
        out[idx + 3] = Math.round(meanA);
        if (sa > 0) {
          out[idx] = Math.round(sr / sa);
          out[idx + 1] = Math.round(sg / sa);
          out[idx + 2] = Math.round(sb / sa);
        }
      }
    }
    return out;
  }

  function applyBloomGlow(srcCanvas, width, height, thresholdPct, radiusPx, intensityPct) {
    const work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    const wCtx = work.getContext('2d', { willReadFrequently: true });
    wCtx.drawImage(srcCanvas, 0, 0);
    const baseData = wCtx.getImageData(0, 0, width, height);
    const d = baseData.data;

    const thresh = (thresholdPct / 100) * 255;
    const hiCanvas = document.createElement('canvas');
    hiCanvas.width = width;
    hiCanvas.height = height;
    const hiCtx = hiCanvas.getContext('2d');
    const hiImg = hiCtx.createImageData(width, height);
    const hd = hiImg.data;

    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (luma >= thresh) {
        const boost = (luma - thresh) / Math.max(1, 255 - thresh);
        hd[i] = d[i];
        hd[i + 1] = d[i + 1];
        hd[i + 2] = d[i + 2];
        hd[i + 3] = Math.min(255, Math.round(a * (0.35 + boost * 0.65)));
      }
    }
    hiCtx.putImageData(hiImg, 0, 0);

    const blurred = window.WC65Effects
      ? window.WC65Effects.blur(hiCanvas, { x: radiusPx, y: radiusPx, quality: 'balanced' })
      : hiCanvas;

    const bData = blurred.getContext('2d').getImageData(0, 0, width, height).data;
    const mult = (intensityPct / 100) * 1.45;
    const out = new Uint8ClampedArray(d.length);

    for (let i = 0; i < d.length; i += 4) {
      const ba = (bData[i + 3] / 255) * mult;
      const gr = Math.min(255, bData[i] * ba);
      const gg = Math.min(255, bData[i + 1] * ba);
      const gb = Math.min(255, bData[i + 2] * ba);
      // Screen blend highlight glow over original pixel
      out[i] = Math.round(255 - ((255 - d[i]) * (255 - gr)) / 255);
      out[i + 1] = Math.round(255 - ((255 - d[i + 1]) * (255 - gg)) / 255);
      out[i + 2] = Math.round(255 - ((255 - d[i + 2]) * (255 - gb)) / 255);
      out[i + 3] = Math.min(255, Math.round(d[i + 3] + bData[i + 3] * Math.min(1, mult * 0.5)));
    }
    return out;
  }

  function applyHalftoneScreen(src, width, height, dotSize, style = 'screen') {
    const out = new Uint8ClampedArray(src.length);
    const cell = clamp(dotSize, 3, 28);
    const half = cell * 0.5;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const gy = Math.floor(y / cell) * cell + half;
      for (let x = 0; x < width; x++) {
        const idx = (row + x) * 4;
        const a = src[idx + 3];
        if (a === 0) continue;
        const gx = Math.floor(x / cell) * cell + half;
        const dist = Math.hypot(x - gx, y - gy) / (half * 1.35);
        const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (style === 'cmyk') {
          const rx = Math.floor((x + 1.5) / cell) * cell + half;
          const bx = Math.floor((x - 1.5) / cell) * cell + half;
          const dr = Math.hypot(x - rx, y - gy) / (half * 1.35);
          const db = Math.hypot(x - bx, y - gy) / (half * 1.35);
          out[idx] = dr <= r * 1.05 ? src[idx] : Math.round(src[idx] * 0.28);
          out[idx + 1] = dist <= g * 1.05 ? src[idx + 1] : Math.round(src[idx + 1] * 0.28);
          out[idx + 2] = db <= b * 1.05 ? src[idx + 2] : Math.round(src[idx + 2] * 0.28);
          out[idx + 3] = a;
        } else if (style === 'line') {
          const wave = (Math.sin(((x + y) / cell) * Math.PI * 2) + 1) * 0.5;
          const keep = luma > wave * 0.85 ? 1 : 0.22;
          out[idx] = Math.round(src[idx] * keep);
          out[idx + 1] = Math.round(src[idx + 1] * keep);
          out[idx + 2] = Math.round(src[idx + 2] * keep);
          out[idx + 3] = a;
        } else {
          const keep = dist <= (1 - luma * 0.72) ? 1 : 0.35;
          out[idx] = Math.round(src[idx] * keep);
          out[idx + 1] = Math.round(src[idx + 1] * keep);
          out[idx + 2] = Math.round(src[idx + 2] * keep);
          out[idx + 3] = a;
        }
      }
    }
    return out;
  }

  function applyNoiseAndSharpen(src, width, height, noisePct, monoNoise, sharpenPct) {
    const out = new Uint8ClampedArray(src);
    const sAmt = (sharpenPct / 100) * 1.6;
    const nAmt = (noisePct / 100) * 95;

    if (sAmt > 0.01) {
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const idx = (row + x) * 4;
          if (src[idx + 3] === 0) continue;
          const up = ((y - 1) * width + x) * 4;
          const dn = ((y + 1) * width + x) * 4;
          const lf = (row + x - 1) * 4;
          const rt = (row + x + 1) * 4;
          for (let c = 0; c < 3; c++) {
            const lap = 4 * src[idx + c] - src[up + c] - src[dn + c] - src[lf + c] - src[rt + c];
            out[idx + c] = clamp(Math.round(src[idx + c] + lap * sAmt * 0.35), 0, 255);
          }
        }
      }
    }

    if (nAmt > 0.2) {
      for (let i = 0; i < out.length; i += 4) {
        if (out[i + 3] === 0) continue;
        const p = i >> 2;
        const h1 = Math.sin(p * 12.9898 + 78.233) * 43758.5453;
        const r1 = (h1 - Math.floor(h1) - 0.5) * 2 * nAmt;
        if (monoNoise) {
          out[i] = clamp(Math.round(out[i] + r1), 0, 255);
          out[i + 1] = clamp(Math.round(out[i + 1] + r1), 0, 255);
          out[i + 2] = clamp(Math.round(out[i + 2] + r1), 0, 255);
        } else {
          const h2 = Math.sin(p * 39.346 + 11.135) * 43758.5453;
          const h3 = Math.sin(p * 73.156 + 52.235) * 43758.5453;
          out[i] = clamp(Math.round(out[i] + r1), 0, 255);
          out[i + 1] = clamp(Math.round(out[i + 1] + (h2 - Math.floor(h2) - 0.5) * 2 * nAmt), 0, 255);
          out[i + 2] = clamp(Math.round(out[i + 2] + (h3 - Math.floor(h3) - 0.5) * 2 * nAmt), 0, 255);
        }
      }
    }
    return out;
  }

  // =========================================================================
  // 2. PROCREATE ADJUSTMENTS MODAL (LIVE PREVIEW + NON-DESTRUCTIVE RESET/APPLY)
  // =========================================================================
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    #wcProcreateAdjustModal {
      position: fixed; right: 320px; top: 56px; width: 356px; max-width: calc(100vw - 24px);
      background: rgba(18, 20, 28, 0.94); backdrop-filter: blur(22px);
      border: 1px solid rgba(165, 180, 252, 0.22); border-radius: 16px;
      box-shadow: 0 22px 54px rgba(0,0,0,0.62); color: #f3f4f6; z-index: 4200;
      display: none; flex-direction: column; overflow: hidden; font-family: Inter, system-ui, sans-serif;
    }
    #wcProcreateAdjustModal.open { display: flex; }
    .wcp-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
      cursor: grab; user-select: none; background: rgba(255,255,255,0.02);
    }
    .wcp-head strong { font-size: 13px; letter-spacing: -0.01em; display: flex; align-items: center; gap: 6px; }
    .wcp-head-badge { font-size: 10px; padding: 2px 6px; border-radius: 6px; background: rgba(99, 102, 241, 0.22); color: #a5b4fc; font-weight: 700; }
    .wcp-tabs {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
      padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); background: rgba(0,0,0,0.22);
    }
    .wcp-tabs button {
      border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03);
      color: #cbd5e1; border-radius: 8px; padding: 6px 4px; font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all 0.14s ease; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .wcp-tabs button.active {
      background: #6366f1; color: #fff; border-color: #818cf8; box-shadow: 0 2px 10px rgba(99,102,241,0.35);
    }
    .wcp-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; max-height: 62vh; overflow-y: auto; }
    .wcp-pane { display: none; flex-direction: column; gap: 9px; }
    .wcp-pane.active { display: flex; }
    .wcp-row { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: #cbd5e1; }
    .wcp-row-top { display: flex; justify-content: space-between; align-items: center; }
    .wcp-row-top output { font-family: ui-monospace, monospace; font-size: 11px; color: #a5b4fc; font-weight: 700; }
    .wcp-row input[type="range"] { width: 100%; accent-color: #6366f1; cursor: pointer; }
    .wcp-pills { display: flex; gap: 5px; flex-wrap: wrap; }
    .wcp-pills button {
      flex: 1; min-width: 64px; padding: 5px 8px; border-radius: 7px; font-size: 11px; font-weight: 600;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: #e2e8f0; cursor: pointer;
    }
    .wcp-pills button.active { background: rgba(99,102,241,0.28); border-color: #818cf8; color: #fff; }
    .wcp-footer {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.26);
    }
    .wcp-btn {
      padding: 7px 12px; border-radius: 9px; font-size: 12px; font-weight: 700; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #fff;
    }
    .wcp-btn.primary { background: #6366f1; border-color: #818cf8; flex: 1; }
    .wcp-btn.danger { color: #fca5a5; border-color: rgba(248,113,113,0.3); }
    #wcHeaderAssistBtn.active, #wcHeaderAdjustBtn.active {
      background: rgba(99, 102, 241, 0.26) !important; border-color: #818cf8 !important; color: #fff !important;
    }
    .wcp-curve-box {
      position: relative; width: 100%; height: 128px; border-radius: 10px;
      background: #0b0d14; border: 1px solid rgba(255,255,255,0.1); overflow: hidden;
    }
    .wcp-dynamics-card {
      margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);
      display: flex; flex-direction: column; gap: 6px;
    }
  `;
  document.head.appendChild(styleEl);

  const adjModal = document.createElement('section');
  adjModal.id = 'wcProcreateAdjustModal';
  adjModal.setAttribute('role', 'dialog');
  adjModal.setAttribute('aria-label', 'Procreate Adjustments Studio');
  adjModal.innerHTML = `
    <header class="wcp-head">
      <strong><span>✦ Adjustments Studio</span><span class="wcp-head-badge">LIVE</span></strong>
      <button type="button" id="wcpCloseBtn" class="pop-close-btn" title="Close">✕</button>
    </header>
    <nav class="wcp-tabs" aria-label="Adjustment categories">
      <button type="button" data-adj="hsb" class="active">HSB</button>
      <button type="button" data-adj="balance">Balance</button>
      <button type="button" data-adj="curves">Curves</button>
      <button type="button" data-adj="blur">Motion Blur</button>
      <button type="button" data-adj="bloom">Bloom</button>
      <button type="button" data-adj="ca">Chromatic</button>
      <button type="button" data-adj="halftone">Halftone</button>
      <button type="button" data-adj="noise">Grain/Sharp</button>
    </nav>
    <div class="wcp-body">
      <!-- HSB -->
      <div class="wcp-pane active" data-pane="hsb">
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Hue Shift</span><output id="wcpHueVal">0°</output></div>
          <input type="range" id="wcpHue" min="-180" max="180" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Saturation</span><output id="wcpSatVal">0%</output></div>
          <input type="range" id="wcpSat" min="-100" max="100" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Brightness</span><output id="wcpBriVal">0%</output></div>
          <input type="range" id="wcpBri" min="-100" max="100" value="0">
        </div>
        <div class="wcp-pills">
          <button type="button" data-hsb-preset="vivid">Vivid Pop</button>
          <button type="button" data-hsb-preset="warm">Golden Warm</button>
          <button type="button" data-hsb-preset="cyber">Cyber Shift</button>
          <button type="button" data-hsb-preset="mono">Noir B&amp;W</button>
        </div>
      </div>

      <!-- COLOR BALANCE -->
      <div class="wcp-pane" data-pane="balance">
        <div class="wcp-pills" id="wcpBalanceTonePills">
          <button type="button" data-tone="shadows">Shadows</button>
          <button type="button" data-tone="midtones" class="active">Midtones</button>
          <button type="button" data-tone="highlights">Highlights</button>
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Cyan ↔ Red</span><output id="wcpBalCRVal">0</output></div>
          <input type="range" id="wcpBalCR" min="-100" max="100" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Magenta ↔ Green</span><output id="wcpBalMGVal">0</output></div>
          <input type="range" id="wcpBalMG" min="-100" max="100" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Yellow ↔ Blue</span><output id="wcpBalYBVal">0</output></div>
          <input type="range" id="wcpBalYB" min="-100" max="100" value="0">
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#cbd5e1">
          <input type="checkbox" id="wcpBalLuma" checked> Preserve Luminosity
        </label>
      </div>

      <!-- CURVES & LEVELS -->
      <div class="wcp-pane" data-pane="curves">
        <div class="wcp-pills" id="wcpCurveChannelPills">
          <button type="button" data-ch="rgb" class="active">RGB</button>
          <button type="button" data-ch="r">Red</button>
          <button type="button" data-ch="g">Green</button>
          <button type="button" data-ch="b">Blue</button>
        </div>
        <div class="wcp-curve-box">
          <canvas id="wcpCurveCanvas" width="320" height="128" style="width:100%;height:128px"></canvas>
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Shadows (Black Point)</span><output id="wcpLvlBlackVal">0</output></div>
          <input type="range" id="wcpLvlBlack" min="0" max="220" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Midtone Gamma</span><output id="wcpLvlGammaVal">1.00</output></div>
          <input type="range" id="wcpLvlGamma" min="0.25" max="3.00" step="0.05" value="1.00">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Highlights (White Point)</span><output id="wcpLvlWhiteVal">255</output></div>
          <input type="range" id="wcpLvlWhite" min="35" max="255" value="255">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Contrast S-Curve</span><output id="wcpLvlContrastVal">0%</output></div>
          <input type="range" id="wcpLvlContrast" min="-80" max="80" value="0">
        </div>
      </div>

      <!-- MOTION & GAUSSIAN BLUR -->
      <div class="wcp-pane" data-pane="blur">
        <div class="wcp-pills" id="wcpBlurModePills">
          <button type="button" data-bmode="motion" class="active">Motion Blur</button>
          <button type="button" data-bmode="gaussian">Gaussian Blur</button>
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Blur Distance / Radius</span><output id="wcpBlurDistVal">0 px</output></div>
          <input type="range" id="wcpBlurDist" min="0" max="80" value="0">
        </div>
        <div class="wcp-row" id="wcpBlurAngleRow">
          <div class="wcp-row-top"><span>Directional Angle</span><output id="wcpBlurAngleVal">0°</output></div>
          <input type="range" id="wcpBlurAngle" min="-180" max="180" value="0">
        </div>
      </div>

      <!-- BLOOM & GLOW -->
      <div class="wcp-pane" data-pane="bloom">
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Glow Intensity</span><output id="wcpBloomIntVal">0%</output></div>
          <input type="range" id="wcpBloomInt" min="0" max="150" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Highlight Threshold</span><output id="wcpBloomThreshVal">45%</output></div>
          <input type="range" id="wcpBloomThresh" min="0" max="95" value="45">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Spread Radius</span><output id="wcpBloomRadVal">18 px</output></div>
          <input type="range" id="wcpBloomRad" min="2" max="64" value="18">
        </div>
      </div>

      <!-- CHROMATIC ABERRATION -->
      <div class="wcp-pane" data-pane="ca">
        <div class="wcp-row">
          <div class="wcp-row-top"><span>RGB Channel Shift</span><output id="wcpCaShiftVal">0 px</output></div>
          <input type="range" id="wcpCaShift" min="0" max="40" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Dispersion Angle</span><output id="wcpCaAngleVal">0°</output></div>
          <input type="range" id="wcpCaAngle" min="-180" max="180" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Lens Edge Falloff</span><output id="wcpCaFalloffVal">0%</output></div>
          <input type="range" id="wcpCaFalloff" min="0" max="100" value="0">
        </div>
      </div>

      <!-- HALFTONE -->
      <div class="wcp-pane" data-pane="halftone">
        <div class="wcp-pills" id="wcpHalftoneStylePills">
          <button type="button" data-hstyle="screen" class="active">Screen Print</button>
          <button type="button" data-hstyle="cmyk">CMYK Newsprint</button>
          <button type="button" data-hstyle="line">Woodcut Lines</button>
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Screen Dot Scale (0 = Off)</span><output id="wcpHalftoneDotVal">0 px</output></div>
          <input type="range" id="wcpHalftoneDot" min="0" max="24" value="0">
        </div>
      </div>

      <!-- NOISE & SHARPEN -->
      <div class="wcp-pane" data-pane="noise">
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Crisp Sharpen (Unsharp)</span><output id="wcpSharpenVal">0%</output></div>
          <input type="range" id="wcpSharpen" min="0" max="100" value="0">
        </div>
        <div class="wcp-row">
          <div class="wcp-row-top"><span>Film Grain / Noise</span><output id="wcpNoiseVal">0%</output></div>
          <input type="range" id="wcpNoise" min="0" max="100" value="0">
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#cbd5e1">
          <input type="checkbox" id="wcpNoiseMono" checked> Monochromatic Film Grain
        </label>
      </div>
    </div>
    <footer class="wcp-footer">
      <button type="button" class="wcp-btn danger" id="wcpResetBtn">Reset</button>
      <button type="button" class="wcp-btn" id="wcpCancelBtn">Cancel</button>
      <button type="button" class="wcp-btn primary" id="wcpApplyBtn">Apply to Layer ✓</button>
    </footer>
  `;
  document.body.appendChild(adjModal);
  if (typeof makeElementDraggable === 'function') {
    makeElementDraggable(adjModal, '.wcp-head');
  }

  let activeAdjTab = 'hsb';
  let adjSession = null; // { layer, baseCanvas, baseData, dirty, tone, curveChannel, blurMode, halftoneStyle }
  const balanceState = {
    shadows: [0, 0, 0],
    midtones: [0, 0, 0],
    highlights: [0, 0, 0],
  };

  function captureAdjustmentSession() {
    const l = app.getActiveLayer();
    if (!l || l.isFolder) {
      app.msg('Select a paint layer to adjust');
      return null;
    }
    const w = app.state.WIDTH, h = app.state.HEIGHT;
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = w;
    baseCanvas.height = h;
    const bCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    bCtx.drawImage(l.canvas, 0, 0);
    app.paintVectorStrokesToContext(bCtx, l);
    const baseData = bCtx.getImageData(0, 0, w, h);
    return {
      layer: l,
      width: w,
      height: h,
      baseCanvas,
      baseData,
      hadVectors: (l.vectorStrokes?.length || 0) > 0,
      savedVectors: structuredClone(l.vectorStrokes || []),
      savedRaster: l.ctx.getImageData(0, 0, w, h),
      dirty: false,
      tone: 'midtones',
      curveChannel: 'rgb',
      blurMode: 'motion',
      halftoneStyle: 'screen',
    };
  }

  function resetControlsUI() {
    $('wcpHue').value = 0; $('wcpHueVal').textContent = '0°';
    $('wcpSat').value = 0; $('wcpSatVal').textContent = '0%';
    $('wcpBri').value = 0; $('wcpBriVal').textContent = '0%';
    balanceState.shadows = [0, 0, 0];
    balanceState.midtones = [0, 0, 0];
    balanceState.highlights = [0, 0, 0];
    $('wcpBalCR').value = 0; $('wcpBalCRVal').textContent = '0';
    $('wcpBalMG').value = 0; $('wcpBalMGVal').textContent = '0';
    $('wcpBalYB').value = 0; $('wcpBalYBVal').textContent = '0';
    $('wcpLvlBlack').value = 0; $('wcpLvlBlackVal').textContent = '0';
    $('wcpLvlGamma').value = 1; $('wcpLvlGammaVal').textContent = '1.00';
    $('wcpLvlWhite').value = 255; $('wcpLvlWhiteVal').textContent = '255';
    $('wcpLvlContrast').value = 0; $('wcpLvlContrastVal').textContent = '0%';
    $('wcpBlurDist').value = 0; $('wcpBlurDistVal').textContent = '0 px';
    $('wcpBlurAngle').value = 0; $('wcpBlurAngleVal').textContent = '0°';
    $('wcpBloomInt').value = 0; $('wcpBloomIntVal').textContent = '0%';
    $('wcpBloomThresh').value = 45; $('wcpBloomThreshVal').textContent = '45%';
    $('wcpBloomRad').value = 18; $('wcpBloomRadVal').textContent = '18 px';
    $('wcpCaShift').value = 0; $('wcpCaShiftVal').textContent = '0 px';
    $('wcpCaAngle').value = 0; $('wcpCaAngleVal').textContent = '0°';
    $('wcpCaFalloff').value = 0; $('wcpCaFalloffVal').textContent = '0%';
    $('wcpHalftoneDot').value = 0; $('wcpHalftoneDotVal').textContent = '0 px';
    $('wcpSharpen').value = 0; $('wcpSharpenVal').textContent = '0%';
    $('wcpNoise').value = 0; $('wcpNoiseVal').textContent = '0%';
    drawCurveHistogram(null);
  }

  function restoreSessionOriginal() {
    if (!adjSession) return;
    const { layer, savedRaster, savedVectors } = adjSession;
    layer.ctx.putImageData(savedRaster, 0, 0);
    layer.vectorStrokes = structuredClone(savedVectors);
    app.renderVectorLayer(layer);
    adjSession.dirty = false;
  }

  function drawCurveHistogram(lut) {
    const cv = $('wcpCurveCanvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 4, 0); ctx.lineTo((w * i) / 4, h);
      ctx.moveTo(0, (h * i) / 4); ctx.lineTo(w, (h * i) / 4);
      ctx.stroke();
    }

    // Histogram from baseData
    if (adjSession?.baseData) {
      const bins = new Uint32Array(64);
      const d = adjSession.baseData.data;
      let maxBin = 1;
      for (let i = 0; i < d.length; i += 16) {
        if (d[i + 3] === 0) continue;
        const luma = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const b = Math.min(63, (luma >> 2));
        if (++bins[b] > maxBin) maxBin = bins[b];
      }
      ctx.fillStyle = 'rgba(129, 140, 248, 0.22)';
      const bw = w / 64;
      for (let i = 0; i < 64; i++) {
        const bh = (bins[i] / maxBin) * (h - 14);
        ctx.fillRect(i * bw, h - bh, bw - 1, bh);
      }
    }

    // Tone curve line
    const chColor = adjSession?.curveChannel === 'r' ? '#f87171' : adjSession?.curveChannel === 'g' ? '#4ade80' : adjSession?.curveChannel === 'b' ? '#60a5fa' : '#a5b4fc';
    ctx.strokeStyle = chColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let x = 0; x < 256; x++) {
      const px = (x / 255) * w;
      const val = lut ? lut[x] : x;
      const py = h - (val / 255) * (h - 8) - 4;
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function renderAdjustmentPreview() {
    if (!adjSession) return;
    const { layer, width, height, baseData, baseCanvas } = adjSession;
    const src = baseData.data;
    let outPixels = null;

    if (activeAdjTab === 'hsb') {
      const h = +$('wcpHue').value || 0;
      const s = +$('wcpSat').value || 0;
      const b = +$('wcpBri').value || 0;
      $('wcpHueVal').textContent = `${h}°`;
      $('wcpSatVal').textContent = `${s}%`;
      $('wcpBriVal').textContent = `${b}%`;
      if (h === 0 && s === 0 && b === 0) {
        restoreSessionOriginal();
        return;
      }
      outPixels = applyHSB(src, h, s, b);
    } else if (activeAdjTab === 'balance') {
      const tone = adjSession.tone || 'midtones';
      const cr = +$('wcpBalCR').value || 0;
      const mg = +$('wcpBalMG').value || 0;
      const yb = +$('wcpBalYB').value || 0;
      balanceState[tone] = [cr, mg, yb];
      $('wcpBalCRVal').textContent = String(cr);
      $('wcpBalMGVal').textContent = String(mg);
      $('wcpBalYBVal').textContent = String(yb);
      const any = [...balanceState.shadows, ...balanceState.midtones, ...balanceState.highlights].some(v => v !== 0);
      if (!any) {
        restoreSessionOriginal();
        return;
      }
      outPixels = applyColorBalance(src, balanceState.shadows, balanceState.midtones, balanceState.highlights, $('wcpBalLuma').checked);
    } else if (activeAdjTab === 'curves') {
      const bp = +$('wcpLvlBlack').value || 0;
      const gm = +$('wcpLvlGamma').value || 1;
      const wp = +$('wcpLvlWhite').value || 255;
      const ct = +$('wcpLvlContrast').value || 0;
      $('wcpLvlBlackVal').textContent = String(bp);
      $('wcpLvlGammaVal').textContent = gm.toFixed(2);
      $('wcpLvlWhiteVal').textContent = String(wp);
      $('wcpLvlContrastVal').textContent = `${ct}%`;
      const res = applyLevelsCurve(src, bp, gm, wp, ct, adjSession.curveChannel || 'rgb');
      drawCurveHistogram(res.lut);
      if (bp === 0 && Math.abs(gm - 1) < 0.01 && wp === 255 && ct === 0) {
        restoreSessionOriginal();
        return;
      }
      outPixels = res.out;
    } else if (activeAdjTab === 'blur') {
      const dist = +$('wcpBlurDist').value || 0;
      const ang = +$('wcpBlurAngle').value || 0;
      $('wcpBlurDistVal').textContent = `${dist} px`;
      $('wcpBlurAngleVal').textContent = `${ang}°`;
      if (dist <= 0) {
        restoreSessionOriginal();
        return;
      }
      if (adjSession.blurMode === 'gaussian' && window.WC65Effects) {
        const blurred = window.WC65Effects.blur(baseCanvas, { x: dist, y: dist, quality: 'balanced' });
        outPixels = blurred.getContext('2d').getImageData(0, 0, width, height).data;
      } else {
        outPixels = applyDirectionalMotionBlur(src, width, height, dist, ang);
      }
    } else if (activeAdjTab === 'bloom') {
      const inten = +$('wcpBloomInt').value || 0;
      const thresh = +$('wcpBloomThresh').value || 45;
      const rad = +$('wcpBloomRad').value || 18;
      $('wcpBloomIntVal').textContent = `${inten}%`;
      $('wcpBloomThreshVal').textContent = `${thresh}%`;
      $('wcpBloomRadVal').textContent = `${rad} px`;
      if (inten <= 0) {
        restoreSessionOriginal();
        return;
      }
      outPixels = applyBloomGlow(baseCanvas, width, height, thresh, rad, inten);
    } else if (activeAdjTab === 'ca') {
      const shift = +$('wcpCaShift').value || 0;
      const ang = +$('wcpCaAngle').value || 0;
      const fall = +$('wcpCaFalloff').value || 0;
      $('wcpCaShiftVal').textContent = `${shift} px`;
      $('wcpCaAngleVal').textContent = `${ang}°`;
      $('wcpCaFalloffVal').textContent = `${fall}%`;
      if (shift <= 0) {
        restoreSessionOriginal();
        return;
      }
      outPixels = applyChromaticAberration(src, width, height, shift, ang, fall);
    } else if (activeAdjTab === 'halftone') {
      const dot = +$('wcpHalftoneDot').value || 0;
      $('wcpHalftoneDotVal').textContent = `${dot} px`;
      if (dot < 2) {
        restoreSessionOriginal();
        return;
      }
      outPixels = applyHalftoneScreen(src, width, height, dot, adjSession.halftoneStyle || 'screen');
    } else if (activeAdjTab === 'noise') {
      const sharp = +$('wcpSharpen').value || 0;
      const noise = +$('wcpNoise').value || 0;
      $('wcpSharpenVal').textContent = `${sharp}%`;
      $('wcpNoiseVal').textContent = `${noise}%`;
      if (sharp <= 0 && noise <= 0) {
        restoreSessionOriginal();
        return;
      }
      outPixels = applyNoiseAndSharpen(src, width, height, noise, $('wcpNoiseMono').checked, sharp);
    }

    if (!outPixels) return;

    // Preview on layer canvas (respecting active selection if present)
    if (adjSession.hadVectors && layer.vectorStrokes?.length) {
      layer.vectorStrokes = [];
      app.renderVectorLayer(layer);
    }
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = width;
    patchCanvas.height = height;
    patchCanvas.getContext('2d').putImageData(new ImageData(outPixels, width, height), 0, 0);

    layer.ctx.clearRect(0, 0, width, height);
    if (app.selectionPath) {
      layer.ctx.drawImage(adjSession.baseCanvas, 0, 0);
      layer.ctx.save();
      layer.ctx.clip(app.selectionPath);
      layer.ctx.clearRect(0, 0, width, height);
      layer.ctx.drawImage(patchCanvas, 0, 0);
      layer.ctx.restore();
    } else {
      layer.ctx.drawImage(patchCanvas, 0, 0);
    }
    adjSession.dirty = true;
  }

  function openProcreateAdjustments(initialTab = 'hsb') {
    if (adjSession?.dirty) restoreSessionOriginal();
    adjSession = captureAdjustmentSession();
    if (!adjSession) return;
    resetControlsUI();
    switchAdjTab(initialTab);
    adjModal.classList.add('open');
    $('wcHeaderAdjustBtn')?.classList.add('active');
    drawCurveHistogram(null);
  }

  function closeProcreateAdjustments(commit = false) {
    if (!adjModal.classList.contains('open')) return;
    if (adjSession) {
      if (commit && adjSession.dirty) {
        const modified = adjSession.layer.ctx.getImageData(0, 0, adjSession.width, adjSession.height);
        restoreSessionOriginal();
        app.saveUndo();
        adjSession.layer.vectorStrokes = [];
        app.renderVectorLayer(adjSession.layer);
        adjSession.layer.ctx.putImageData(modified, 0, 0);
        adjSession.layer.rasterRevision = (adjSession.layer.rasterRevision || 0) + 1;
        adjSession.layer.thumbDirty = true;
        app.renderLayers();
        app.markUnsavedChanges();
        app.msg(`Applied ${activeAdjTab.toUpperCase()} Adjustment`);
      } else {
        restoreSessionOriginal();
      }
      adjSession = null;
    }
    adjModal.classList.remove('open');
    $('wcHeaderAdjustBtn')?.classList.remove('active');
  }

  function switchAdjTab(tab) {
    if (adjSession?.dirty) {
      restoreSessionOriginal();
      resetControlsUI();
    }
    activeAdjTab = tab;
    adjModal.querySelectorAll('[data-adj]').forEach(b => b.classList.toggle('active', b.dataset.adj === tab));
    adjModal.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
    if (tab === 'curves') drawCurveHistogram(null);
  }

  adjModal.querySelectorAll('[data-adj]').forEach(btn => {
    btn.onclick = () => switchAdjTab(btn.dataset.adj);
  });

  [
    'wcpHue', 'wcpSat', 'wcpBri',
    'wcpBalCR', 'wcpBalMG', 'wcpBalYB', 'wcpBalLuma',
    'wcpLvlBlack', 'wcpLvlGamma', 'wcpLvlWhite', 'wcpLvlContrast',
    'wcpBlurDist', 'wcpBlurAngle',
    'wcpBloomInt', 'wcpBloomThresh', 'wcpBloomRad',
    'wcpCaShift', 'wcpCaAngle', 'wcpCaFalloff',
    'wcpHalftoneDot',
    'wcpSharpen', 'wcpNoise', 'wcpNoiseMono',
  ].forEach(id => {
    $(id)?.addEventListener('input', renderAdjustmentPreview);
    $(id)?.addEventListener('change', renderAdjustmentPreview);
  });

  adjModal.querySelectorAll('[data-hsb-preset]').forEach(btn => {
    btn.onclick = () => {
      const p = btn.dataset.hsbPreset;
      if (p === 'vivid') { $('wcpHue').value = 0; $('wcpSat').value = 42; $('wcpBri').value = 8; }
      else if (p === 'warm') { $('wcpHue').value = -14; $('wcpSat').value = 26; $('wcpBri').value = 6; }
      else if (p === 'cyber') { $('wcpHue').value = 65; $('wcpSat').value = 48; $('wcpBri').value = 10; }
      else if (p === 'mono') { $('wcpHue').value = 0; $('wcpSat').value = -100; $('wcpBri').value = 4; }
      renderAdjustmentPreview();
    };
  });

  adjModal.querySelectorAll('#wcpBalanceTonePills [data-tone]').forEach(btn => {
    btn.onclick = () => {
      if (!adjSession) return;
      adjSession.tone = btn.dataset.tone;
      adjModal.querySelectorAll('#wcpBalanceTonePills button').forEach(b => b.classList.toggle('active', b === btn));
      const [cr, mg, yb] = balanceState[adjSession.tone];
      $('wcpBalCR').value = cr; $('wcpBalCRVal').textContent = String(cr);
      $('wcpBalMG').value = mg; $('wcpBalMGVal').textContent = String(mg);
      $('wcpBalYB').value = yb; $('wcpBalYBVal').textContent = String(yb);
    };
  });

  adjModal.querySelectorAll('#wcpCurveChannelPills [data-ch]').forEach(btn => {
    btn.onclick = () => {
      if (!adjSession) return;
      adjSession.curveChannel = btn.dataset.ch;
      adjModal.querySelectorAll('#wcpCurveChannelPills button').forEach(b => b.classList.toggle('active', b === btn));
      renderAdjustmentPreview();
    };
  });

  adjModal.querySelectorAll('#wcpBlurModePills [data-bmode]').forEach(btn => {
    btn.onclick = () => {
      if (!adjSession) return;
      adjSession.blurMode = btn.dataset.bmode;
      adjModal.querySelectorAll('#wcpBlurModePills button').forEach(b => b.classList.toggle('active', b === btn));
      $('wcpBlurAngleRow').style.display = adjSession.blurMode === 'motion' ? 'flex' : 'none';
      renderAdjustmentPreview();
    };
  });

  adjModal.querySelectorAll('#wcpHalftoneStylePills [data-hstyle]').forEach(btn => {
    btn.onclick = () => {
      if (!adjSession) return;
      adjSession.halftoneStyle = btn.dataset.hstyle;
      adjModal.querySelectorAll('#wcpHalftoneStylePills button').forEach(b => b.classList.toggle('active', b === btn));
      renderAdjustmentPreview();
    };
  });

  $('wcpResetBtn').onclick = () => {
    restoreSessionOriginal();
    resetControlsUI();
    app.msg('Adjustment Reset');
  };
  $('wcpCancelBtn').onclick = () => closeProcreateAdjustments(false);
  $('wcpCloseBtn').onclick = () => closeProcreateAdjustments(false);
  $('wcpApplyBtn').onclick = () => closeProcreateAdjustments(true);

  // Add shortcut button inside existing #adjustPopover as well
  const legacyAdjust = $('adjustPopover');
  if (legacyAdjust) {
    const proBtn = document.createElement('button');
    proBtn.type = 'button';
    proBtn.className = 'ios-menu-item';
    proBtn.style.cssText = 'color:#a5b4fc;font-weight:700;background:rgba(99,102,241,0.14);border-radius:8px;margin-bottom:4px';
    proBtn.innerHTML = '<span>✦ Open Full Procreate Adjustments (HSB, Curves, Bloom, Chromatic)...</span>';
    proBtn.onclick = () => {
      app.closePops();
      openProcreateAdjustments('hsb');
    };
    legacyAdjust.insertBefore(proBtn, legacyAdjust.children[1]);
  }

  // =========================================================================
  // 3. PROCREATE BILINEAR SUBPIXEL LIQUIFY & RECONSTRUCT UPGRADE
  // =========================================================================
  const liqPop = $('liquifyStudioPopover');
  let liqOriginalSnapshot = null;
  let liqMomentum = 0.35;
  let liqDistortion = 0.55;

  if (liqPop) {
    const group = liqPop.querySelector('.settings-group');
    if (group) {
      group.innerHTML = `
        <div class="settings-group-title">Procreate Liquify Modes (Bilinear Subpixel)</div>
        <div class="ios-blend-pills" id="liqModePills" style="flex-wrap:wrap">
          <button type="button" class="blend-chip active" data-lmode="off">Off</button>
          <button type="button" class="blend-chip" data-lmode="push">Push</button>
          <button type="button" class="blend-chip" data-lmode="twirl">Twirl CW</button>
          <button type="button" class="blend-chip" data-lmode="twirl_ccw">Twirl CCW</button>
          <button type="button" class="blend-chip" data-lmode="pinch">Pinch</button>
          <button type="button" class="blend-chip" data-lmode="bloat">Expand</button>
          <button type="button" class="blend-chip" data-lmode="crystallize">Crystals</button>
          <button type="button" class="blend-chip" data-lmode="reconstruct">Reconstruct</button>
        </div>
        <div class="setting-row"><span>Size (<span id="liqRadLbl">65px</span>)</span><input type="range" id="liqRadSlider" min="12" max="320" value="65" style="width:120px;accent-color:var(--ios-blue)"></div>
        <div class="setting-row"><span>Pressure (<span id="liqStrLbl">65%</span>)</span><input type="range" id="liqStrSlider" min="5" max="100" value="65" style="width:120px;accent-color:var(--ios-blue)"></div>
        <div class="setting-row"><span>Momentum (<span id="liqMomLbl">35%</span>)</span><input type="range" id="liqMomSlider" min="0" max="90" value="35" style="width:120px;accent-color:var(--ios-blue)"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          <button type="button" class="ai-action-btn secondary" id="liqResetAllBtn">Reconstruct All</button>
          <button type="button" class="ai-action-btn" id="liqDoneBtn">Done ✓</button>
        </div>
      `;
    }
  }

  let proLiqMode = 'off', proLiqRadius = 65, proLiqStrength = 0.65, proLiqActive = false, proLiqLast = null, proLiqVel = { x: 0, y: 0 };

  function setProLiqMode(mode) {
    proLiqMode = mode;
    app.editingMode = mode === 'off' ? null : 'liquify';
    document.querySelectorAll('#liqModePills [data-lmode]').forEach(b => b.classList.toggle('active', b.dataset.lmode === mode));
    $('liquifyToolBtn')?.classList.toggle('active', mode !== 'off');
    if (mode !== 'off') {
      const l = app.getActiveLayer();
      if (l && !l.isFolder) {
        app.flattenVectorLayer(l);
        liqOriginalSnapshot = l.ctx.getImageData(0, 0, app.state.WIDTH, app.state.HEIGHT);
      }
      app.msg(`Liquify: ${mode.toUpperCase()}`);
    }
  }

  document.querySelectorAll('#liqModePills [data-lmode]').forEach(btn => {
    btn.onclick = () => setProLiqMode(btn.dataset.lmode);
  });
  $('liqRadSlider')?.addEventListener('input', e => {
    proLiqRadius = +e.target.value || 65;
    if ($('liqRadLbl')) $('liqRadLbl').textContent = `${proLiqRadius}px`;
  });
  $('liqStrSlider')?.addEventListener('input', e => {
    proLiqStrength = (+e.target.value || 65) / 100;
    if ($('liqStrLbl')) $('liqStrLbl').textContent = `${e.target.value}%`;
  });
  $('liqMomSlider')?.addEventListener('input', e => {
    liqMomentum = (+e.target.value || 35) / 100;
    if ($('liqMomLbl')) $('liqMomLbl').textContent = `${e.target.value}%`;
  });
  $('liqResetAllBtn')?.addEventListener('click', () => {
    const l = app.getActiveLayer();
    if (l && liqOriginalSnapshot && liqOriginalSnapshot.width === app.state.WIDTH) {
      app.saveUndo();
      l.ctx.putImageData(liqOriginalSnapshot, 0, 0);
      l.thumbDirty = true;
      app.renderLayers();
      app.msg('Liquify Reconstructed');
    }
  });
  $('liqDoneBtn')?.addEventListener('click', () => {
    setProLiqMode('off');
    app.closePops();
  });

  function stepProLiquify(layer, cx, cy, dx, dy) {
    if (!layer || layer.isFolder || proLiqMode === 'off') return;
    const W = app.state.WIDTH, H = app.state.HEIGHT;
    const r = proLiqRadius;
    const x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w <= 2 || h <= 2) return;

    const srcImg = layer.ctx.getImageData(x0, y0, w, h);
    const src = srcImg.data;
    const outImg = layer.ctx.createImageData(w, h);
    const dst = outImg.data;
    dst.set(src);

    const origData = liqOriginalSnapshot?.data;

    const sampleBilinear = (sx, sy, ch) => {
      const cxp = clamp(sx, 0, w - 1), cyp = clamp(sy, 0, h - 1);
      const ix = Math.floor(cxp), iy = Math.floor(cyp);
      const fx = cxp - ix, fy = cyp - iy;
      const ix1 = Math.min(w - 1, ix + 1), iy1 = Math.min(h - 1, iy + 1);
      const p00 = src[(iy * w + ix) * 4 + ch];
      const p10 = src[(iy * w + ix1) * 4 + ch];
      const p01 = src[(iy1 * w + ix) * 4 + ch];
      const p11 = src[(iy1 * w + ix1) * 4 + ch];
      return (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
    };

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const wx = x0 + px - cx, wy = y0 + py - cy;
        const dist = Math.hypot(wx, wy);
        if (dist >= r) continue;
        const q = 1 - dist / r;
        const f = q * q * (3 - 2 * q) * proLiqStrength;
        const dIdx = (py * w + px) * 4;

        if (proLiqMode === 'reconstruct' && origData) {
          const gIdx = ((y0 + py) * W + (x0 + px)) * 4;
          const rw = Math.min(1, f * 0.65);
          for (let c = 0; c < 4; c++) {
            dst[dIdx + c] = Math.round(src[dIdx + c] + (origData[gIdx + c] - src[dIdx + c]) * rw);
          }
          continue;
        }

        let sx = px, sy = py;
        if (proLiqMode === 'push') {
          sx = px - dx * f;
          sy = py - dy * f;
        } else if (proLiqMode === 'twirl' || proLiqMode === 'twirl_ccw') {
          const dir = proLiqMode === 'twirl' ? 1 : -1;
          const a = f * 0.52 * dir;
          const cos = Math.cos(a), sin = Math.sin(a);
          sx = (wx * cos - wy * sin) + (cx - x0);
          sy = (wx * sin + wy * cos) + (cy - y0);
        } else if (proLiqMode === 'pinch') {
          sx = px + wx * f * 0.42;
          sy = py + wy * f * 0.42;
        } else if (proLiqMode === 'bloat') {
          sx = px - wx * f * 0.42;
          sy = py - wy * f * 0.42;
        } else if (proLiqMode === 'crystallize') {
          const cell = Math.max(4, Math.round(r * 0.16));
          const gx = Math.floor(px / cell) * cell + cell * 0.5;
          const gy = Math.floor(py / cell) * cell + cell * 0.5;
          sx = px + (gx - px) * Math.min(1, f * 0.85);
          sy = py + (gy - py) * Math.min(1, f * 0.85);
        }

        for (let c = 0; c < 4; c++) {
          dst[dIdx + c] = Math.round(sampleBilinear(sx, sy, c));
        }
      }
    }
    layer.ctx.putImageData(outImg, x0, y0);
    layer.thumbDirty = true;
  }

  viewportEl.addEventListener('pointerdown', e => {
    if (proLiqMode === 'off' || touchPinchDist > 0 || e.target.closest('.floating-ui,.popover,.ios-layer-menu-sheet,#wcProcreateAdjustModal')) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const l = app.getActiveLayer();
    if (!l || l.isFolder) return;
    app.saveUndo();
    app.flattenVectorLayer(l);
    if (!liqOriginalSnapshot || liqOriginalSnapshot.width !== app.state.WIDTH) {
      liqOriginalSnapshot = l.ctx.getImageData(0, 0, app.state.WIDTH, app.state.HEIGHT);
    }
    proLiqActive = true;
    proLiqLast = getCanvasPoint(e);
    proLiqVel = { x: 0, y: 0 };
    stepProLiquify(l, proLiqLast.x, proLiqLast.y, 0, 0);
  }, true);

  window.addEventListener('pointermove', e => {
    if (!proLiqActive || proLiqMode === 'off') return;
    e.stopImmediatePropagation();
    const pt = getCanvasPoint(e);
    const dx = pt.x - proLiqLast.x, dy = pt.y - proLiqLast.y;
    proLiqVel.x = proLiqVel.x * liqMomentum + dx * (1 - liqMomentum);
    proLiqVel.y = proLiqVel.y * liqMomentum + dy * (1 - liqMomentum);
    stepProLiquify(app.getActiveLayer(), pt.x, pt.y, proLiqVel.x, proLiqVel.y);
    proLiqLast = pt;
  }, true);

  window.addEventListener('pointerup', () => {
    if (proLiqActive) {
      proLiqActive = false;
      app.markUnsavedChanges();
      app.renderLayers();
    }
  }, true);

  app.on('toolChange', () => {
    if (proLiqMode !== 'off') setProLiqMode('off');
  });

  // =========================================================================
  // 4. PROCREATE AUTOMATIC SELECTION (MAGIC WAND), INVERT & DUPLICATE SELECTION
  // =========================================================================
  const selPop = $('selectionStudioPopover');
  let magicWandActive = false;
  let magicWandTolerance = 36;

  if (selPop) {
    const pills = selPop.querySelector('#selModePills');
    if (pills && !pills.querySelector('[data-smode="wand"]')) {
      const wandBtn = document.createElement('button');
      wandBtn.type = 'button';
      wandBtn.className = 'blend-chip';
      wandBtn.dataset.smode = 'wand';
      wandBtn.textContent = 'Auto Wand';
      pills.appendChild(wandBtn);

      wandBtn.onclick = () => {
        magicWandActive = true;
        app.editingMode = 'selection';
        pills.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === wandBtn));
        $('selectToolBtn')?.classList.add('active');
        app.msg('Automatic Selection: Tap any region on canvas');
      };
      pills.querySelectorAll('button:not([data-smode="wand"])').forEach(b => {
        b.addEventListener('click', () => { magicWandActive = false; });
      });
    }

    const group = selPop.querySelector('.settings-group');
    if (group && !group.querySelector('#wcpCopySelectionLayerBtn')) {
      const actionsRow = document.createElement('div');
      actionsRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px';
      actionsRow.innerHTML = `
        <button type="button" class="ai-action-btn secondary" id="wcpInvertSelectionBtn">Invert Mask</button>
        <button type="button" class="ai-action-btn" id="wcpCopySelectionLayerBtn">Copy to Layer</button>
      `;
      group.appendChild(actionsRow);

      $('wcpInvertSelectionBtn').onclick = () => {
        if (!app.selectionPoints?.length) {
          app.msg('Create a selection first');
          return;
        }
        const W = app.state.WIDTH, H = app.state.HEIGHT;
        const p = new Path2D();
        p.rect(0, 0, W, H);
        const pts = app.selectionPoints;
        p.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
        p.closePath();
        app.selectionPath = p;
        app.msg('Selection Inverted');
      };

      $('wcpCopySelectionLayerBtn').onclick = () => {
        const srcLayer = app.getActiveLayer();
        if (!srcLayer || srcLayer.isFolder) return;
        if (!app.selectionPath) {
          app.msg('Select an area first');
          return;
        }
        app.saveFullStateUndo();
        const comp = app.createLayerComposite(srcLayer);
        const nl = app.createLayer(`${srcLayer.name} · Selection`);
        nl.ctx.save();
        nl.ctx.clip(app.selectionPath);
        nl.ctx.drawImage(comp, 0, 0);
        nl.ctx.restore();
        nl.thumbDirty = true;
        app.syncLayers();
        app.renderLayers();
        app.markUnsavedChanges();
        app.msg('Copied Selection to New Layer');
      };
    }
  }

  // Magic Wand flood contour builder on canvas click
  viewportEl.addEventListener('pointerdown', e => {
    if (!magicWandActive || e.button > 0 || e.target.closest('.floating-ui,.popover,.ios-layer-menu-sheet,#wcProcreateAdjustModal')) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const pt = getCanvasPoint(e);
    const W = app.state.WIDTH, H = app.state.HEIGHT;
    const sx = clamp(Math.floor(pt.x), 0, W - 1), sy = clamp(Math.floor(pt.y), 0, H - 1);
    const l = app.getActiveLayer();
    if (!l || l.isFolder) return;
    const comp = app.createLayerComposite(l);
    const data = comp.getContext('2d').getImageData(0, 0, W, H).data;
    const seedIdx = (sy * W + sx) * 4;
    const sr = data[seedIdx], sg = data[seedIdx + 1], sb = data[seedIdx + 2], sa = data[seedIdx + 3];
    const tol = magicWandTolerance * 3;

    const visited = new Uint8Array(W * H);
    const stack = [sy * W + sx];
    visited[sy * W + sx] = 1;
    let minX = sx, maxX = sx, minY = sy, maxY = sy;

    while (stack.length > 0) {
      const cur = stack.pop();
      const cx = cur % W, cy = (cur - cx) / W;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      const neighbors = [];
      if (cx > 0) neighbors.push(cur - 1);
      if (cx < W - 1) neighbors.push(cur + 1);
      if (cy > 0) neighbors.push(cur - W);
      if (cy < H - 1) neighbors.push(cur + W);
      for (const n of neighbors) {
        if (visited[n]) continue;
        const ni = n * 4;
        const d = Math.abs(data[ni] - sr) + Math.abs(data[ni + 1] - sg) + Math.abs(data[ni + 2] - sb) + Math.abs(data[ni + 3] - sa);
        if (d <= tol) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    // Build bounding polygon path from the flood-selected region
    const pts = [
      { x: minX, y: minY },
      { x: maxX + 1, y: minY },
      { x: maxX + 1, y: maxY + 1 },
      { x: minX, y: maxY + 1 },
    ];
    const path = new Path2D();
    path.rect(minX, minY, Math.max(1, maxX - minX + 1), Math.max(1, maxY - minY + 1));
    app.selectionPoints = pts;
    app.selectionPath = path;
    magicWandActive = false;
    $('selectToolBtn')?.classList.remove('active');
    app.msg(`Auto-Selected Region (${maxX - minX + 1}×${maxY - minY + 1}px)`);
  }, true);

  // =========================================================================
  // 5. PROCREATE DRAWING ASSIST & COLOR DYNAMICS IN BRUSH PROPERTIES
  // =========================================================================
  const colorDynamics = {
    hueJitter: 0,
    satJitter: 0,
    briJitter: 0,
    assistMode: 'off', // 'off' | 'grid2d' | 'isometric' | 'perspective' | 'sym_v' | 'sym_quad' | 'sym_radial'
  };

  const origBrushStamp = window.WC65?.brushStamp;
  if (window.WC65 && origBrushStamp) {
    window.WC65.brushStamp = function(id, x, y, r, color, ctx) {
      const res = origBrushStamp.call(this, id, x, y, r, color, ctx);
      if ((colorDynamics.hueJitter > 0 || colorDynamics.satJitter > 0 || colorDynamics.briJitter > 0) && /^#[0-9a-f]{6}$/i.test(res.color)) {
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const rand = (seed - Math.floor(seed)) * 2 - 1;
        const num = parseInt(res.color.slice(1), 16);
        const src = new Uint8ClampedArray([(num >> 16) & 255, (num >> 8) & 255, num & 255, 255]);
        const jOut = applyHSB(
          src,
          rand * colorDynamics.hueJitter * 1.8,
          rand * colorDynamics.satJitter,
          rand * colorDynamics.briJitter
        );
        res.color = '#' + [jOut[0], jOut[1], jOut[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      }
      return res;
    };
  }

  // Upgrade WC65.assist to support 2D Grid & Isometric orthogonal/axis locking
  let assistStrokeStart = null;
  let assistLockedAxis = null;
  const origBeginStroke = window.WC65?.beginStroke;
  const origAssist = window.WC65?.assist;
  if (window.WC65 && origBeginStroke && origAssist) {
    window.WC65.beginStroke = function(pt) {
      assistStrokeStart = pt ? { ...pt } : null;
      assistLockedAxis = null;
      return origBeginStroke.call(this, pt);
    };
    window.WC65.assist = function(pt) {
      if (colorDynamics.assistMode === 'grid2d' && assistStrokeStart && currentTool === 'brush') {
        const dx = pt.x - assistStrokeStart.x, dy = pt.y - assistStrokeStart.y;
        if (Math.hypot(dx, dy) < 3) return pt;
        if (!assistLockedAxis) {
          assistLockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        }
        return assistLockedAxis === 'h'
          ? { ...pt, x: pt.x, y: assistStrokeStart.y }
          : { ...pt, x: assistStrokeStart.x, y: pt.y };
      }
      if (colorDynamics.assistMode === 'isometric' && assistStrokeStart && currentTool === 'brush') {
        const dx = pt.x - assistStrokeStart.x, dy = pt.y - assistStrokeStart.y;
        if (Math.hypot(dx, dy) < 3) return pt;
        const angles = [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6];
        if (!assistLockedAxis) {
          let bestA = angles[0], bestErr = Infinity;
          for (const a of angles) {
            const ux = Math.cos(a), uy = Math.sin(a);
            const proj = dx * ux + dy * uy;
            const err = Math.hypot(dx - ux * proj, dy - uy * proj);
            if (err < bestErr) { bestErr = err; bestA = a; }
          }
          assistLockedAxis = bestA;
        }
        const ux = Math.cos(assistLockedAxis), uy = Math.sin(assistLockedAxis);
        const proj = dx * ux + dy * uy;
        return { ...pt, x: assistStrokeStart.x + ux * proj, y: assistStrokeStart.y + uy * proj };
      }
      return origAssist.call(this, pt);
    };
  }

  function setDrawingAssistMode(mode) {
    colorDynamics.assistMode = mode;
    if (['sym_v', 'sym_quad', 'sym_radial', 'grid2d'].includes(mode)) {
      guideType = mode;
      drawGuides();
      window.WC65.settings.assist = 'off';
    } else if (mode === 'isometric') {
      guideType = 'grid2d';
      drawGuides();
      window.WC65.settings.assist = 'off';
    } else if (mode === 'perspective') {
      guideType = 'off';
      drawGuides();
      window.WC65.settings.assist = 'two';
      if ($('wc65Assist')) {
        $('wc65Assist').value = 'two';
        $('wc65Assist').dispatchEvent(new Event('change'));
      }
    } else {
      guideType = 'off';
      drawGuides();
      window.WC65.settings.assist = 'off';
      if ($('wc65Assist')) {
        $('wc65Assist').value = 'off';
        $('wc65Assist').dispatchEvent(new Event('change'));
      }
    }
    const headerAssist = $('wcHeaderAssistBtn');
    if (headerAssist) {
      headerAssist.classList.toggle('active', mode !== 'off');
      headerAssist.querySelector('span').textContent = mode === 'off' ? 'Assist' : `Assist: ${mode.replace('sym_', '').toUpperCase()}`;
    }
    if ($('wcpAssistSelect')) $('wcpAssistSelect').value = mode;
    app.msg(mode === 'off' ? 'Drawing Assist Off' : `Drawing Assist: ${mode.toUpperCase()}`);
  }

  // Inject Procreate Color Dynamics & Drawing Assist controls into #studioProperties
  const propsPane = $('studioProperties');
  if (propsPane) {
    const dynSection = document.createElement('div');
    dynSection.className = 'inspector-section';
    dynSection.innerHTML = `
      <div class="inspector-heading"><span>Procreate Assist &amp; Dynamics</span> <span>PRO</span></div>
      <label class="studio-field">Drawing Assist
        <select id="wcpAssistSelect" class="setting-select" style="width:100%;margin-top:4px">
          <option value="off">Off (Freehand)</option>
          <option value="grid2d">2D Orthogonal Grid Lock</option>
          <option value="isometric">Isometric 30° Axis Lock</option>
          <option value="perspective">2-Point Perspective Lock</option>
          <option value="sym_v">Vertical Mirror Symmetry</option>
          <option value="sym_quad">Quadrant 4-Way Symmetry</option>
          <option value="sym_radial">Radial 8-Way Mandala</option>
        </select>
      </label>
      <div class="wcp-dynamics-card">
        <label class="studio-field">Hue Jitter <output id="wcpDynHueVal">0%</output>
          <input id="wcpDynHue" type="range" min="0" max="100" value="0">
        </label>
        <label class="studio-field">Saturation Jitter <output id="wcpDynSatVal">0%</output>
          <input id="wcpDynSat" type="range" min="0" max="100" value="0">
        </label>
        <label class="studio-field">Brightness Jitter <output id="wcpDynBriVal">0%</output>
          <input id="wcpDynBri" type="range" min="0" max="100" value="0">
        </label>
      </div>
    `;
    propsPane.insertBefore(dynSection, propsPane.lastElementChild);

    $('wcpAssistSelect')?.addEventListener('change', e => setDrawingAssistMode(e.target.value));
    $('wcpDynHue')?.addEventListener('input', e => {
      colorDynamics.hueJitter = +e.target.value || 0;
      $('wcpDynHueVal').textContent = `${colorDynamics.hueJitter}%`;
    });
    $('wcpDynSat')?.addEventListener('input', e => {
      colorDynamics.satJitter = +e.target.value || 0;
      $('wcpDynSatVal').textContent = `${colorDynamics.satJitter}%`;
    });
    $('wcpDynBri')?.addEventListener('input', e => {
      colorDynamics.briJitter = +e.target.value || 0;
      $('wcpDynBriVal').textContent = `${colorDynamics.briJitter}%`;
    });
  }

  // =========================================================================
  // 6. PROCREATE REFERENCE COMPANION UPGRADE (CANVAS MIRROR + AUTO PALETTE)
  // =========================================================================
  const refWin = $('floatingRefWindow');
  let refMode = 'canvas'; // 'canvas' | 'image'
  let refMirrorFlip = false;
  if (refWin) {
    const pipCanvas = refWin.querySelector('#pipRefCanvas');
    const pipCtx = pipCanvas?.getContext('2d', { willReadFrequently: true });
    const header = refWin.querySelector('.pip-header');
    if (header) {
      const controls = header.querySelector('div');
      if (controls) {
        const mirrorBtn = document.createElement('button');
        mirrorBtn.type = 'button';
        mirrorBtn.className = 'blend-chip active';
        mirrorBtn.id = 'pipCanvasMirrorBtn';
        mirrorBtn.style.cssText = 'padding:2px 7px;font-size:10px';
        mirrorBtn.textContent = 'Canvas';
        controls.insertBefore(mirrorBtn, controls.firstChild);

        mirrorBtn.onclick = () => {
          refMode = refMode === 'canvas' ? 'image' : 'canvas';
          mirrorBtn.classList.toggle('active', refMode === 'canvas');
          mirrorBtn.textContent = refMode === 'canvas' ? 'Canvas' : 'Image';
          if (refMode === 'canvas') updateReferenceCanvasMirror();
        };
      }
    }

    const swatchRow = document.createElement('div');
    swatchRow.id = 'pipAutoPalette';
    swatchRow.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:2px';
    refWin.appendChild(swatchRow);

    function extractReferenceSwatches() {
      if (!pipCanvas || !pipCtx) return;
      swatchRow.innerHTML = '';
      const pts = [[30, 30], [100, 30], [170, 30], [45, 110], [115, 110], [175, 110]];
      pts.forEach(([px, py]) => {
        const d = pipCtx.getImageData(px, py, 1, 1).data;
        const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = `height:18px;border-radius:5px;border:1px solid rgba(255,255,255,0.22);background:${hex};cursor:pointer`;
        b.title = `Use ${hex}`;
        b.onclick = () => app.setColor(hex);
        swatchRow.appendChild(b);
      });
    }

    function updateReferenceCanvasMirror() {
      if (!refWin || refWin.style.display === 'none' || refMode !== 'canvas' || !pipCtx) return;
      try {
        const flat = createFlattenedArtworkCanvas();
        pipCtx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
        pipCtx.fillStyle = '#090a0f';
        pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
        const r = Math.min(pipCanvas.width / flat.width, pipCanvas.height / flat.height);
        const dw = flat.width * r, dh = flat.height * r;
        pipCtx.save();
        if (refMirrorFlip) {
          pipCtx.translate(pipCanvas.width, 0);
          pipCtx.scale(-1, 1);
        }
        pipCtx.drawImage(flat, (pipCanvas.width - dw) / 2, (pipCanvas.height - dh) / 2, dw, dh);
        pipCtx.restore();
        extractReferenceSwatches();
      } catch (_) {}
    }

    app.on('strokeCommit', () => {
      if (refWin.style.display !== 'none' && refMode === 'canvas') {
        requestAnimationFrame(updateReferenceCanvasMirror);
      }
    });
    extractReferenceSwatches();
  }

  // =========================================================================
  // 7. STUDIO HEADER QUICK BUTTONS (ADJUSTMENTS & DRAWING ASSIST)
  // =========================================================================
  const headerActions = $('studioHeader')?.querySelector('.studio-header-actions');
  if (headerActions) {
    const assistBtn = document.createElement('button');
    assistBtn.id = 'wcHeaderAssistBtn';
    assistBtn.type = 'button';
    assistBtn.className = 'studio-secondary';
    assistBtn.title = 'Cycle Procreate Drawing Assist (2D Grid, Isometric, Perspective, Symmetry)';
    assistBtn.innerHTML = '<span>Assist</span>';
    assistBtn.onclick = () => {
      const order = ['off', 'sym_v', 'sym_quad', 'sym_radial', 'grid2d', 'isometric', 'perspective'];
      const next = order[(order.indexOf(colorDynamics.assistMode) + 1) % order.length];
      setDrawingAssistMode(next);
    };

    const adjustBtn = document.createElement('button');
    adjustBtn.id = 'wcHeaderAdjustBtn';
    adjustBtn.type = 'button';
    adjustBtn.className = 'studio-secondary';
    adjustBtn.title = 'Procreate Adjustments Studio (HSB, Color Balance, Curves, Bloom, Chromatic Aberration)';
    adjustBtn.innerHTML = '<span>✦ Adjustments</span>';
    adjustBtn.onclick = () => {
      if (adjModal.classList.contains('open')) closeProcreateAdjustments(false);
      else openProcreateAdjustments('hsb');
    };

    headerActions.prepend(adjustBtn);
    headerActions.prepend(assistBtn);
  }

  app.procreateSuite = {
    openAdjustments: openProcreateAdjustments,
    closeAdjustments: closeProcreateAdjustments,
    setDrawingAssist: setDrawingAssistMode,
    setLiquifyMode: setProLiqMode,
    computeContentBounds,
    applyHSB,
    applyColorBalance,
    applyLevelsCurve,
    applyChromaticAberration,
    applyDirectionalMotionBlur,
    applyBloomGlow,
    applyHalftoneScreen,
    applyNoiseAndSharpen,
  };
});
