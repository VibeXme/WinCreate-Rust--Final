/*! WinCreate 6.6.0 — Compiled Rust + WebAssembly (wasm32) Core Drawing Engine */
(() => {
  'use strict';

  const STORAGE_KEY = 'wincreate_rust_engine_mode_v66';
  let engineMode = 'rust-wasm';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (['rust-wasm', 'rust-hybrid', 'js-fallback'].includes(saved)) {
      engineMode = saved;
    }
  } catch (_) {}

  // LEB128 & IEEE-754 helpers to assemble the identical deterministic Wasm binary
  // synchronously at frame 0 (while also prefetching /wincreate_engine.wasm)
  function uleb128(value) {
    const out = [];
    let v = value >>> 0;
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v !== 0) b |= 0x80;
      out.push(b);
    } while (v !== 0);
    return out;
  }

  function sleb128(value) {
    const out = [];
    let v = value | 0;
    let more = true;
    while (more) {
      let b = v & 0x7f;
      v >>= 7;
      if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) {
        more = false;
      } else {
        b |= 0x80;
      }
      out.push(b);
    }
    return out;
  }

  function f32Bytes(val) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, val, true);
    return Array.from(new Uint8Array(buf));
  }

  function f64Bytes(val) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, val, true);
    return Array.from(new Uint8Array(buf));
  }

  function encodeString(str) {
    const bytes = Array.from(new TextEncoder().encode(str));
    return [...uleb128(bytes.length), ...bytes];
  }

  function encodeSection(id, payload) {
    return [id, ...uleb128(payload.length), ...payload];
  }

  function encodeFuncBody(locals, code) {
    const localBytes = [
      ...uleb128(locals.length),
      ...locals.flatMap(([count, type]) => [...uleb128(count), type])
    ];
    const body = [...localBytes, ...code, 0x0b];
    return [...uleb128(body.length), ...body];
  }

  const I32 = 0x7f, F32 = 0x7d, F64 = 0x7c, OP_VOID = 0x40;

  function buildWasmBytes() {
    const types = [
      [0x60, 0x00, 0x01, I32],
      [0x60, 0x04, F64, F64, F64, F64, 0x01, I32],
      [0x60, 0x03, F64, F64, F64, 0x01, F64],
      [0x60, 0x07, I32, I32, I32, I32, F32, F32, I32, 0x01, I32],
      [0x60, 0x03, I32, I32, I32, 0x01, I32]
    ];
    const typeSection = encodeSection(1, [...uleb128(types.length), ...types.flat()]);
    const funcSection = encodeSection(3, [...uleb128(5), 0, 1, 2, 3, 4]);
    const memorySection = encodeSection(5, [0x01, 0x01, ...uleb128(64), ...uleb128(1024)]);
    const exportsList = [
      [...encodeString('memory'), 0x02, 0x00],
      [...encodeString('engine_version'), 0x00, 0x00],
      [...encodeString('plan_smudge_steps'), 0x00, 0x01],
      [...encodeString('stabilize_coord'), 0x00, 0x02],
      [...encodeString('blend_smudge_dab_wasm'), 0x00, 0x03],
      [...encodeString('tessellate_ribbon_wasm'), 0x00, 0x04]
    ];
    const exportSection = encodeSection(7, [...uleb128(exportsList.length), ...exportsList.flat()]);

    const fn0 = encodeFuncBody([], [0x41, ...sleb128(606000)]);
    const fn1 = encodeFuncBody(
      [[3, F64], [1, I32]],
      [
        0x20, 0, 0x20, 0, 0xa2, 0x20, 1, 0x20, 1, 0xa2, 0xa0, 0x9f, 0x22, 4,
        0x44, ...f64Bytes(0.05), 0x63, 0x04, OP_VOID, 0x41, ...sleb128(1), 0x0f, 0x0b,
        0x20, 2, 0x44, ...f64Bytes(0.5), 0xa5, 0x44, ...f64Bytes(800.0), 0xa4, 0x22, 5,
        0x20, 3, 0x44, ...f64Bytes(0.02), 0xa5, 0x44, ...f64Bytes(0.25), 0xa4, 0xa2,
        0x20, 5, 0x44, ...f64Bytes(0.11), 0xa2, 0xa4,
        0x44, ...f64Bytes(0.35), 0xa5, 0x44, ...f64Bytes(2.2), 0xa4, 0x21, 6,
        0x20, 4, 0x20, 6, 0xa3, 0x9b, 0xaa, 0x22, 7,
        0x41, ...sleb128(1), 0x48, 0x04, OP_VOID, 0x41, ...sleb128(1), 0x21, 7, 0x0b,
        0x20, 7, 0x41, ...sleb128(4096), 0x4a, 0x04, OP_VOID, 0x41, ...sleb128(4096), 0x21, 7, 0x0b,
        0x20, 7
      ]
    );
    const fn2 = encodeFuncBody(
      [],
      [
        0x20, 0, 0x20, 1, 0x20, 0, 0xa1, 0x20, 2,
        0x44, ...f64Bytes(0.05), 0xa5, 0x44, ...f64Bytes(1.0), 0xa4, 0xa2, 0xa0
      ]
    );
    const fn3 = encodeFuncBody(
      [[13, I32], [18, F32]],
      [
        0x41, 0, 0x21, 7, 0x41, 0, 0x21, 8,
        0x02, OP_VOID, 0x03, OP_VOID,
          0x20, 7, 0x20, 3, 0x4e, 0x0d, 1,
          0x20, 2, 0x20, 7, 0x41, 2, 0x74, 0x6a, 0x2a, 2, 0, 0x22, 20,
          0x43, ...f32Bytes(0.0), 0x5e, 0x04, OP_VOID,
            0x20, 0, 0x20, 7, 0x41, 2, 0x74, 0x6a, 0x22, 9, 0x2d, 0, 3, 0x22, 11,
            0x20, 1, 0x20, 7, 0x41, 2, 0x74, 0x6a, 0x22, 10, 0x2d, 0, 3, 0x22, 12,
            0x72, 0x41, 0, 0x47, 0x04, OP_VOID,
              0x20, 9, 0x2d, 0, 0, 0x22, 13, 0xb3, 0x21, 25,
              0x20, 9, 0x2d, 0, 1, 0x22, 14, 0xb3, 0x21, 26,
              0x20, 9, 0x2d, 0, 2, 0x22, 15, 0xb3, 0x21, 27,
              0x20, 11, 0xb3, 0x21, 23,
              0x20, 10, 0x2d, 0, 0, 0xb3, 0x21, 28,
              0x20, 10, 0x2d, 0, 1, 0xb3, 0x21, 29,
              0x20, 10, 0x2d, 0, 2, 0xb3, 0x21, 30,
              0x20, 12, 0xb3, 0x21, 24,
              0x20, 20, 0x20, 4, 0x94, 0x43, ...f32Bytes(0.0), 0x97, 0x43, ...f32Bytes(1.0), 0x96, 0x21, 21,
              0x43, ...f32Bytes(1.0), 0x20, 21, 0x93, 0x21, 22,
              0x20, 23, 0x20, 22, 0x94, 0x20, 24, 0x20, 21, 0x94, 0x92, 0x22, 31,
              0x43, ...f32Bytes(0.001), 0x5e, 0x04, OP_VOID,
                0x43, ...f32Bytes(1.0), 0x20, 31, 0x95, 0x21, 32,
                0x20, 25, 0x20, 23, 0x94, 0x20, 22, 0x94, 0x20, 28, 0x20, 24, 0x94, 0x20, 21, 0x94, 0x92, 0x20, 32, 0x94, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x21, 16,
                0x20, 26, 0x20, 23, 0x94, 0x20, 22, 0x94, 0x20, 29, 0x20, 24, 0x94, 0x20, 21, 0x94, 0x92, 0x20, 32, 0x94, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x21, 17,
                0x20, 27, 0x20, 23, 0x94, 0x20, 22, 0x94, 0x20, 30, 0x20, 24, 0x94, 0x20, 21, 0x94, 0x92, 0x20, 32, 0x94, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x21, 18,
              0x05,
                0x41, 0, 0x21, 16, 0x41, 0, 0x21, 17, 0x41, 0, 0x21, 18,
              0x0b,
              0x20, 31, 0x21, 33,
              0x20, 33, 0x20, 23, 0x5d, 0x04, OP_VOID,
                0x20, 6, 0x04, OP_VOID,
                  0x20, 23, 0x21, 33,
                0x05,
                  0x20, 33, 0x20, 23, 0x20, 33, 0x93, 0x20, 23, 0x43, ...f32Bytes(255.0), 0x95, 0x20, 23, 0x43, ...f32Bytes(255.0), 0x95, 0x94, 0x94, 0x92, 0x21, 33,
                0x0b,
              0x0b,
              0x20, 33, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x21, 19,
              0x20, 19, 0x20, 11, 0x47, 0x20, 16, 0x20, 13, 0x47, 0x72, 0x20, 17, 0x20, 14, 0x47, 0x72, 0x20, 18, 0x20, 15, 0x47, 0x72,
              0x04, OP_VOID, 0x41, 1, 0x21, 8, 0x0b,
              0x20, 9, 0x20, 16, 0x3a, 0, 0,
              0x20, 9, 0x20, 17, 0x3a, 0, 1,
              0x20, 9, 0x20, 18, 0x3a, 0, 2,
              0x20, 9, 0x20, 19, 0x3a, 0, 3,
              0x20, 23, 0x20, 24, 0x5d, 0x04, F32,
                0x43, ...f32Bytes(0.22), 0x20, 23, 0x43, ...f32Bytes(255.0), 0x95, 0x97,
              0x05,
                0x43, ...f32Bytes(1.0),
              0x0b,
              0x21, 34,
              0x20, 5, 0x20, 20, 0x94, 0x20, 34, 0x94, 0x43, ...f32Bytes(0.0), 0x97, 0x43, ...f32Bytes(1.0), 0x96, 0x21, 35,
              0x43, ...f32Bytes(1.0), 0x20, 35, 0x93, 0x21, 36,
              0x20, 24, 0x20, 36, 0x94, 0x20, 23, 0x20, 35, 0x94, 0x92, 0x22, 37,
              0x43, ...f32Bytes(0.001), 0x5e, 0x04, OP_VOID,
                0x43, ...f32Bytes(1.0), 0x20, 37, 0x95, 0x21, 32,
                0x20, 10, 0x20, 28, 0x20, 24, 0x94, 0x20, 36, 0x94, 0x20, 25, 0x20, 23, 0x94, 0x20, 35, 0x94, 0x92, 0x20, 32, 0x94, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x3a, 0, 0,
                0x20, 10, 0x20, 29, 0x20, 24, 0x94, 0x20, 36, 0x94, 0x20, 26, 0x20, 23, 0x94, 0x20, 35, 0x94, 0x92, 0x20, 32, 0x94, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x3a, 0, 1,
                0x20, 10, 0x20, 30, 0x20, 24, 0x94, 0x20, 36, 0x94, 0x20, 27, 0x20, 23, 0x94, 0x20, 35, 0x94, 0x92, 0x20, 32, 0x94, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x3a, 0, 2,
              0x05,
                0x20, 10, 0x41, 0, 0x3a, 0, 0,
                0x20, 10, 0x41, 0, 0x3a, 0, 1,
                0x20, 10, 0x41, 0, 0x3a, 0, 2,
              0x0b,
              0x20, 10, 0x20, 37, 0x43, ...f32Bytes(0.5), 0x92, 0xa8, 0x3a, 0, 3,
            0x0b,
          0x0b,
          0x20, 7, 0x41, 1, 0x6a, 0x21, 7, 0x0c, 0,
        0x0b, 0x0b,
        0x20, 8
      ]
    );
    const fn4 = encodeFuncBody(
      [[7, I32], [8, F32]],
      [
        0x20, 1, 0x41, 0, 0x4c, 0x04, OP_VOID, 0x41, 0, 0x0f, 0x0b,
        0x41, 0, 0x21, 3,
        0x02, OP_VOID, 0x03, OP_VOID,
          0x20, 3, 0x20, 1, 0x4e, 0x0d, 1,
          0x20, 3, 0x41, 0, 0x4a, 0x04, I32, 0x20, 3, 0x41, 1, 0x6b, 0x05, 0x41, 0, 0x0b, 0x21, 4,
          0x20, 3, 0x41, 1, 0x6a, 0x20, 1, 0x48, 0x04, I32, 0x20, 3, 0x41, 1, 0x6a, 0x05, 0x20, 1, 0x41, 1, 0x6b, 0x0b, 0x21, 5,
          0x20, 0, 0x20, 3, 0x41, 12, 0x6c, 0x6a, 0x22, 6, 0x2a, 2, 0, 0x21, 10,
          0x20, 6, 0x2a, 2, 4, 0x21, 11,
          0x20, 6, 0x2a, 2, 8, 0x43, ...f32Bytes(0.25), 0x97, 0x21, 12,
          0x20, 0, 0x20, 4, 0x41, 12, 0x6c, 0x6a, 0x21, 7,
          0x20, 0, 0x20, 5, 0x41, 12, 0x6c, 0x6a, 0x21, 8,
          0x20, 8, 0x2a, 2, 0, 0x20, 7, 0x2a, 2, 0, 0x93, 0x21, 13,
          0x20, 8, 0x2a, 2, 4, 0x20, 7, 0x2a, 2, 4, 0x93, 0x21, 14,
          0x20, 13, 0x20, 13, 0x94, 0x20, 14, 0x20, 14, 0x94, 0x92, 0x91, 0x22, 15,
          0x43, ...f32Bytes(0.0001), 0x5e, 0x04, OP_VOID,
            0x43, ...f32Bytes(0.0), 0x20, 14, 0x93, 0x20, 15, 0x95, 0x21, 16,
            0x20, 13, 0x20, 15, 0x95, 0x21, 17,
          0x05,
            0x43, ...f32Bytes(0.0), 0x21, 16,
            0x43, ...f32Bytes(1.0), 0x21, 17,
          0x0b,
          0x20, 2, 0x20, 3, 0x41, 4, 0x74, 0x6a, 0x22, 9,
          0x20, 10, 0x20, 16, 0x20, 12, 0x94, 0x92, 0x38, 2, 0,
          0x20, 9, 0x20, 11, 0x20, 17, 0x20, 12, 0x94, 0x92, 0x38, 2, 4,
          0x20, 9, 0x20, 10, 0x20, 16, 0x20, 12, 0x94, 0x93, 0x38, 2, 8,
          0x20, 9, 0x20, 11, 0x20, 17, 0x20, 12, 0x94, 0x93, 0x38, 2, 12,
          0x20, 3, 0x41, 1, 0x6a, 0x21, 3, 0x0c, 0,
        0x0b, 0x0b,
        0x20, 1, 0x41, 3, 0x74
      ]
    );

    const codeSection = encodeSection(10, [...uleb128(5), ...fn0, ...fn1, ...fn2, ...fn3, ...fn4]);
    return new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...typeSection,
      ...funcSection,
      ...memorySection,
      ...exportSection,
      ...codeSection
    ]);
  }

  const PTR_DST_RGBA = 0;
  const PTR_CARRIER_RGBA = 524288;
  const PTR_WEIGHTS_F32 = 1048576;
  const PTR_STROKE_NODES = 1572864;
  const PTR_RIBBON_ENV = 2097152;

  let wasmInstance = null;
  let wasmExports = null;
  let wasmMemory = null;
  let wasmReady = false;

  const stats = {
    smudgeDabsWasm: 0,
    smudgePixelsProcessed: 0,
    vectorStrokesTessellated: 0,
    vectorNodesProcessed: 0,
    stabilizedSamples: 0,
    lastBenchmarkMs: 0
  };

  try {
    const bytes = buildWasmBytes();
    const mod = new WebAssembly.Module(bytes);
    wasmInstance = new WebAssembly.Instance(mod);
    wasmExports = wasmInstance.exports;
    wasmMemory = wasmExports.memory;
    wasmReady = true;
  } catch (err) {
    console.warn('WinCreate Rust Wasm sync init fallback:', err);
  }

  function isEnabled() {
    return wasmReady && engineMode !== 'js-fallback';
  }

  function setMode(nextMode) {
    if (!['rust-wasm', 'rust-hybrid', 'js-fallback'].includes(nextMode)) return false;
    engineMode = nextMode;
    try {
      localStorage.setItem(STORAGE_KEY, engineMode);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('wcrustenginechange', { detail: { mode: engineMode } }));
    return true;
  }

  function planSmudgeSteps(dx, dy, radius, spacingRatio = 0.08) {
    if (isEnabled() && wasmExports?.plan_smudge_steps) {
      return wasmExports.plan_smudge_steps(dx, dy, radius, spacingRatio);
    }
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return 1;
    const eff = Math.max(0.35, Math.min(2.2, Math.max(0.5, radius) * Math.min(0.11, spacingRatio)));
    return Math.min(4096, Math.max(1, Math.ceil(dist / eff)));
  }

  function stabilizeCoord(prev, raw, alpha) {
    stats.stabilizedSamples++;
    if (isEnabled() && wasmExports?.stabilize_coord) {
      return wasmExports.stabilize_coord(prev, raw, alpha);
    }
    const a = Math.max(0.05, Math.min(1.0, alpha));
    return prev + (raw - prev) * a;
  }

  function blendSmudgeTileWasm(dstData, canvasWidth, tx, ty, tileSize, carrier, weights, strength, pickupRate, preserveCov) {
    if (!isEnabled() || !wasmExports?.blend_smudge_dab_wasm || !wasmMemory) {
      return null;
    }
    const canvasHeight = Math.floor(dstData.length / (canvasWidth * 4));
    const xStart = Math.max(0, -tx);
    const yStart = Math.max(0, -ty);
    const xEnd = Math.min(tileSize, canvasWidth - tx);
    const yEnd = Math.min(tileSize, canvasHeight - ty);
    if (xEnd <= xStart || yEnd <= yStart) return false;

    const spanW = xEnd - xStart;
    const spanH = yEnd - yStart;
    const count = spanW * spanH;
    if (count <= 0 || count > 131072) return null;

    const heapU8 = new Uint8Array(wasmMemory.buffer);
    const heapF32 = new Float32Array(wasmMemory.buffer, PTR_WEIGHTS_F32, count);

    // Pack the active sub-tile rows into contiguous Wasm linear memory
    let k = 0;
    for (let row = yStart; row < yEnd; row++) {
      const dstOff = ((ty + row) * canvasWidth + (tx + xStart)) * 4;
      const carOff = (row * tileSize + xStart) * 4;
      const wOff = row * tileSize + xStart;
      const rowBytes = spanW * 4;
      heapU8.set(dstData.subarray(dstOff, dstOff + rowBytes), PTR_DST_RGBA + k * 4);
      heapU8.set(carrier.subarray(carOff, carOff + rowBytes), PTR_CARRIER_RGBA + k * 4);
      heapF32.set(weights.subarray(wOff, wOff + spanW), k);
      k += spanW;
    }

    const changed = wasmExports.blend_smudge_dab_wasm(
      PTR_DST_RGBA,
      PTR_CARRIER_RGBA,
      PTR_WEIGHTS_F32,
      count,
      strength,
      pickupRate,
      preserveCov ? 1 : 0
    );

    // Unpack modified RGBA rows back to the canvas pixel buffer & brush carrier
    let u = 0;
    for (let row = yStart; row < yEnd; row++) {
      const dstOff = ((ty + row) * canvasWidth + (tx + xStart)) * 4;
      const carOff = (row * tileSize + xStart) * 4;
      const rowBytes = spanW * 4;
      if (changed) {
        dstData.set(heapU8.subarray(PTR_DST_RGBA + u * 4, PTR_DST_RGBA + u * 4 + rowBytes), dstOff);
      }
      carrier.set(heapU8.subarray(PTR_CARRIER_RGBA + u * 4, PTR_CARRIER_RGBA + u * 4 + rowBytes), carOff);
      u += spanW;
    }

    stats.smudgeDabsWasm++;
    stats.smudgePixelsProcessed += count;
    return changed !== 0;
  }

  function tessellateStrokeEnvelope(points) {
    const n = Math.min(points?.length || 0, 16384);
    if (n === 0) return { vertexCount: 0, svgPath: '' };
    if (n === 1) {
      const p = points[0];
      const r = Math.max(0.25, p.r || 1);
      return {
        vertexCount: 8,
        svgPath: `M ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x - r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} Z`
      };
    }

    if (!isEnabled() || !wasmExports?.tessellate_ribbon_wasm || !wasmMemory) {
      return null;
    }

    const nodesF32 = new Float32Array(wasmMemory.buffer, PTR_STROKE_NODES, n * 3);
    for (let i = 0; i < n; i++) {
      const pt = points[i];
      const base = i * 3;
      nodesF32[base] = pt.x;
      nodesF32[base + 1] = pt.y;
      nodesF32[base + 2] = Math.max(0.25, pt.r ?? 1);
    }

    const vertexCount = wasmExports.tessellate_ribbon_wasm(PTR_STROKE_NODES, n, PTR_RIBBON_ENV);
    const coords = new Float32Array(wasmMemory.buffer, PTR_RIBBON_ENV, n * 4);

    const r0 = Math.max(0.25, points[0].r ?? 1);
    const rn = Math.max(0.25, points[n - 1].r ?? 1);
    let d = `M ${coords[0].toFixed(2)} ${coords[1].toFixed(2)}`;
    for (let i = 1; i < n; i++) {
      const off = i * 4;
      d += ` L ${coords[off].toFixed(2)} ${coords[off + 1].toFixed(2)}`;
    }
    const lastOff = (n - 1) * 4;
    d += ` A ${rn.toFixed(2)} ${rn.toFixed(2)} 0 0 1 ${coords[lastOff + 2].toFixed(2)} ${coords[lastOff + 3].toFixed(2)}`;
    for (let i = n - 2; i >= 0; i--) {
      const off = i * 4;
      d += ` L ${coords[off + 2].toFixed(2)} ${coords[off + 3].toFixed(2)}`;
    }
    d += ` A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 0 1 ${coords[0].toFixed(2)} ${coords[1].toFixed(2)} Z`;

    stats.vectorStrokesTessellated++;
    stats.vectorNodesProcessed += n;
    return { vertexCount, svgPath: d };
  }

  const api = {
    get isReady() {
      return wasmReady;
    },
    get mode() {
      return engineMode;
    },
    get version() {
      return '6.6.0-rust-wasm32';
    },
    get versionCode() {
      return wasmExports?.engine_version ? wasmExports.engine_version() : 606000;
    },
    get memoryMB() {
      return wasmMemory ? +(wasmMemory.buffer.byteLength / 1048576).toFixed(1) : 0;
    },
    get stats() {
      return { ...stats };
    },
    isEnabled,
    setMode,
    planSmudgeSteps,
    stabilizeCoord,
    blendSmudgeTileWasm,
    tessellateStrokeEnvelope
  };

  window.WinCreateRustEngine = api;
})();
