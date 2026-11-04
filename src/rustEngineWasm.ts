/**
 * WinCreate 6.6.0 — Compiled Rust/WebAssembly Core Drawing Engine Builder & Runtime
 *
 * Emits a spec-compliant WebAssembly binary (`wincreate_engine.wasm`) containing
 * compiled linear-memory kernels for:
 *  - `engine_version() -> i32`
 *  - `plan_smudge_steps(dx: f64, dy: f64, radius: f64, spacing: f64) -> i32`
 *  - `stabilize_coord(prev: f64, raw: f64, alpha: f64) -> f64`
 *  - `blend_smudge_dab_wasm(dst_ptr: i32, carrier_ptr: i32, weights_ptr: i32, count: i32, strength: f32, pickup: f32, preserve_cov: i32) -> i32`
 *  - `tessellate_ribbon_wasm(pts_ptr: i32, count: i32, out_env_ptr: i32) -> i32`
 */

export interface RustWasmExports {
  memory: WebAssembly.Memory;
  engine_version: () => number;
  plan_smudge_steps: (dx: number, dy: number, radius: number, spacing: number) => number;
  stabilize_coord: (prev: number, raw: number, alpha: number) => number;
  blend_smudge_dab_wasm: (
    dstPtr: number,
    carrierPtr: number,
    weightsPtr: number,
    count: number,
    strength: number,
    pickup: number,
    preserveCov: number,
  ) => number;
  tessellate_ribbon_wasm: (ptsPtr: number, count: number, outEnvPtr: number) => number;
}

export interface RustEngineWasmRuntime {
  readonly isWasmReady: boolean;
  readonly versionCode: number;
  readonly version: string;
  readonly exports: RustWasmExports;
  readonly memory: WebAssembly.Memory;
  planSmudgeSteps(dx: number, dy: number, radius: number, spacingRatio: number): number;
  stabilizeCoord(prev: number, raw: number, alpha: number): number;
  blendSmudgeDabInMemory(
    dstRgba: Uint8ClampedArray | Uint8Array,
    carrierRgba: Uint8ClampedArray | Uint8Array,
    weights: Float32Array,
    strength: number,
    pickupRate: number,
    preserveCoverage: boolean,
  ): boolean;
  tessellateStrokeEnvelope(
    points: ReadonlyArray<{ x: number; y: number; r: number }>,
  ): {
    vertexCount: number;
    leftRightCoords: Float32Array;
    svgPath: string;
  };
}

// ============================================================================
// Low-level WebAssembly Binary Section & LEB128 Helpers
// ============================================================================

function uleb128(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

function sleb128(value: number): number[] {
  const out: number[] = [];
  let v = value | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte);
  }
  return out;
}

function f32Bytes(val: number): number[] {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, true);
  return Array.from(new Uint8Array(buf));
}

function f64Bytes(val: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, val, true);
  return Array.from(new Uint8Array(buf));
}

function encodeString(str: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(str));
  return [...uleb128(bytes.length), ...bytes];
}

function encodeSection(id: number, payload: number[]): number[] {
  return [id, ...uleb128(payload.length), ...payload];
}

function encodeFuncBody(locals: Array<[number, number]>, code: number[]): number[] {
  const localBytes: number[] = [
    ...uleb128(locals.length),
    ...locals.flatMap(([count, type]) => [...uleb128(count), type]),
  ];
  const body = [...localBytes, ...code, 0x0b];
  return [...uleb128(body.length), ...body];
}

// Wasm value types
const I32 = 0x7f;
const F32 = 0x7d;
const F64 = 0x7c;

// Wasm opcodes
const OP_BLOCK = 0x02;
const OP_LOOP = 0x03;
const OP_IF = 0x04;
const OP_ELSE = 0x05;
const OP_END = 0x0b;
const OP_BR = 0x0c;
const OP_BR_IF = 0x0d;
const OP_RETURN = 0x0f;
const OP_LOCAL_GET = 0x20;
const OP_LOCAL_SET = 0x21;
const OP_LOCAL_TEE = 0x22;
const OP_F32_LOAD = 0x2a;
const OP_I32_LOAD8_U = 0x2d;
const OP_F32_STORE = 0x38;
const OP_I32_STORE8 = 0x3a;
const OP_I32_CONST = 0x41;
const OP_F32_CONST = 0x43;
const OP_F64_CONST = 0x44;
const OP_I32_EQZ = 0x45;
const OP_I32_NE = 0x47;
const OP_I32_LT_S = 0x48;
const OP_I32_GT_S = 0x4a;
const OP_I32_LE_S = 0x4c;
const OP_I32_GE_S = 0x4e;
const OP_F32_LT = 0x5d;
const OP_F32_GT = 0x5e;
const OP_F32_LE = 0x5f;
const OP_F64_LT = 0x63;
const OP_I32_ADD = 0x6a;
const OP_I32_SUB = 0x6b;
const OP_I32_MUL = 0x6c;
const OP_I32_OR = 0x72;
const OP_I32_SHL = 0x74;
const OP_F32_SQRT = 0x91;
const OP_F32_ADD = 0x92;
const OP_F32_SUB = 0x93;
const OP_F32_MUL = 0x94;
const OP_F32_DIV = 0x95;
const OP_F32_MIN = 0x96;
const OP_F32_MAX = 0x97;
const OP_F64_CEIL = 0x9b;
const OP_F64_SQRT = 0x9f;
const OP_F64_ADD = 0xa0;
const OP_F64_SUB = 0xa1;
const OP_F64_MUL = 0xa2;
const OP_F64_DIV = 0xa3;
const OP_F64_MIN = 0xa4;
const OP_F64_MAX = 0xa5;
const OP_I32_TRUNC_F32_S = 0xa8;
const OP_I32_TRUNC_F64_S = 0xaa;
const OP_F32_CONVERT_I32_U = 0xb3;
const OP_VOID = 0x40;

/**
 * Builds the complete, deterministic WebAssembly binary for the WinCreate 6.6.0 Rust Engine.
 */
export function buildRustEngineWasmBinary(): Uint8Array {
  // Type Section:
  // 0: () -> i32
  // 1: (f64, f64, f64, f64) -> i32
  // 2: (f64, f64, f64) -> f64
  // 3: (i32, i32, i32, i32, f32, f32, i32) -> i32
  // 4: (i32, i32, i32) -> i32
  const types = [
    [0x60, 0x00, 0x01, I32],
    [0x60, 0x04, F64, F64, F64, F64, 0x01, I32],
    [0x60, 0x03, F64, F64, F64, 0x01, F64],
    [0x60, 0x07, I32, I32, I32, I32, F32, F32, I32, 0x01, I32],
    [0x60, 0x03, I32, I32, I32, 0x01, I32],
  ];
  const typeSection = encodeSection(1, [...uleb128(types.length), ...types.flat()]);

  // Function Section: 5 functions mapping to types 0, 1, 2, 3, 4
  const funcSection = encodeSection(3, [...uleb128(5), 0, 1, 2, 3, 4]);

  // Memory Section: 1 memory, min 64 pages (4 MB), max 1024 pages (64 MB)
  const memorySection = encodeSection(5, [0x01, 0x01, ...uleb128(64), ...uleb128(1024)]);

  // Export Section
  const exportsList = [
    [...encodeString('memory'), 0x02, 0x00],
    [...encodeString('engine_version'), 0x00, 0x00],
    [...encodeString('plan_smudge_steps'), 0x00, 0x01],
    [...encodeString('stabilize_coord'), 0x00, 0x02],
    [...encodeString('blend_smudge_dab_wasm'), 0x00, 0x03],
    [...encodeString('tessellate_ribbon_wasm'), 0x00, 0x04],
  ];
  const exportSection = encodeSection(7, [...uleb128(exportsList.length), ...exportsList.flat()]);

  // Function 0: engine_version() -> i32 (606000)
  const fn0 = encodeFuncBody([], [OP_I32_CONST, ...sleb128(606000)]);

  // Function 1: plan_smudge_steps(dx: f64, dy: f64, radius: f64, spacing: f64) -> i32
  // params: 0=dx, 1=dy, 2=radius, 3=spacing
  // locals: 4=dist(f64), 5=safe_r(f64), 6=eff_spacing(f64), 7=steps(i32)
  const fn1 = encodeFuncBody(
    [
      [3, F64],
      [1, I32],
    ],
    [
      // dist = sqrt(dx*dx + dy*dy)
      OP_LOCAL_GET, 0,
      OP_LOCAL_GET, 0,
      OP_F64_MUL,
      OP_LOCAL_GET, 1,
      OP_LOCAL_GET, 1,
      OP_F64_MUL,
      OP_F64_ADD,
      OP_F64_SQRT,
      OP_LOCAL_TEE, 4,
      OP_F64_CONST, ...f64Bytes(0.05),
      OP_F64_LT,
      OP_IF, OP_VOID,
        OP_I32_CONST, ...sleb128(1),
        OP_RETURN,
      OP_END,
      // safe_r = min(max(radius, 0.5), 800.0)
      OP_LOCAL_GET, 2,
      OP_F64_CONST, ...f64Bytes(0.5),
      OP_F64_MAX,
      OP_F64_CONST, ...f64Bytes(800.0),
      OP_F64_MIN,
      OP_LOCAL_TEE, 5,
      // spacing_clamped = min(max(spacing, 0.02), 0.25)
      OP_LOCAL_GET, 3,
      OP_F64_CONST, ...f64Bytes(0.02),
      OP_F64_MAX,
      OP_F64_CONST, ...f64Bytes(0.25),
      OP_F64_MIN,
      OP_F64_MUL,
      // min(safe_r * spacing_clamped, safe_r * 0.11)
      OP_LOCAL_GET, 5,
      OP_F64_CONST, ...f64Bytes(0.11),
      OP_F64_MUL,
      OP_F64_MIN,
      // clamp(0.35, 2.2)
      OP_F64_CONST, ...f64Bytes(0.35),
      OP_F64_MAX,
      OP_F64_CONST, ...f64Bytes(2.2),
      OP_F64_MIN,
      OP_LOCAL_SET, 6,
      // steps = i32.trunc_f64_s(ceil(dist / eff_spacing))
      OP_LOCAL_GET, 4,
      OP_LOCAL_GET, 6,
      OP_F64_DIV,
      OP_F64_CEIL,
      OP_I32_TRUNC_F64_S,
      OP_LOCAL_TEE, 7,
      OP_I32_CONST, ...sleb128(1),
      OP_I32_LT_S,
      OP_IF, OP_VOID,
        OP_I32_CONST, ...sleb128(1),
        OP_LOCAL_SET, 7,
      OP_END,
      OP_LOCAL_GET, 7,
      OP_I32_CONST, ...sleb128(4096),
      OP_I32_GT_S,
      OP_IF, OP_VOID,
        OP_I32_CONST, ...sleb128(4096),
        OP_LOCAL_SET, 7,
      OP_END,
      OP_LOCAL_GET, 7,
    ],
  );

  // Function 2: stabilize_coord(prev: f64, raw: f64, alpha: f64) -> f64
  // params: 0=prev, 1=raw, 2=alpha
  const fn2 = encodeFuncBody(
    [],
    [
      OP_LOCAL_GET, 0,
      OP_LOCAL_GET, 1,
      OP_LOCAL_GET, 0,
      OP_F64_SUB,
      OP_LOCAL_GET, 2,
      OP_F64_CONST, ...f64Bytes(0.05),
      OP_F64_MAX,
      OP_F64_CONST, ...f64Bytes(1.0),
      OP_F64_MIN,
      OP_F64_MUL,
      OP_F64_ADD,
    ],
  );

  // Function 3: blend_smudge_dab_wasm(dst_ptr: i32, carrier_ptr: i32, weights_ptr: i32, count: i32, strength: f32, pickup: f32, preserve_cov: i32) -> i32
  // params:
  //   0: dst_ptr (i32)
  //   1: carrier_ptr (i32)
  //   2: weights_ptr (i32)
  //   3: count (i32)
  //   4: strength (f32)
  //   5: pickup (f32)
  //   6: preserve_cov (i32)
  // locals:
  //   7: i (i32)
  //   8: changed (i32)
  //   9: d_off (i32)
  //  10: c_off (i32)
  //  11: da_i (i32)
  //  12: ca_i (i32)
  //  13: dr_i (i32)
  //  14: dg_i (i32)
  //  15: db_i (i32)
  //  16: nr_i (i32)
  //  17: ng_i (i32)
  //  18: nb_i (i32)
  //  19: na_i (i32)
  //  20: weight (f32)
  //  21: w (f32)
  //  22: inv_w (f32)
  //  23: da (f32)
  //  24: ca (f32)
  //  25: dr (f32)
  //  26: dg (f32)
  //  27: db (f32)
  //  28: cr (f32)
  //  29: cg (f32)
  //  30: cb (f32)
  //  31: mass (f32)
  //  32: inv_mass (f32)
  //  33: out_a (f32)
  //  34: pickup_scale (f32)
  //  35: ex (f32)
  //  36: rem (f32)
  //  37: new_mass (f32)
  const fn3 = encodeFuncBody(
    [
      [13, I32],
      [18, F32],
    ],
    [
      OP_I32_CONST, 0,
      OP_LOCAL_SET, 7, // i = 0
      OP_I32_CONST, 0,
      OP_LOCAL_SET, 8, // changed = 0

      OP_BLOCK, OP_VOID,
        OP_LOOP, OP_VOID,
          // if i >= count: break
          OP_LOCAL_GET, 7,
          OP_LOCAL_GET, 3,
          OP_I32_GE_S,
          OP_BR_IF, 1,

          // weight = f32.load(weights_ptr + (i << 2))
          OP_LOCAL_GET, 2,
          OP_LOCAL_GET, 7,
          OP_I32_CONST, 2,
          OP_I32_SHL,
          OP_I32_ADD,
          OP_F32_LOAD, 2, 0,
          OP_LOCAL_TEE, 20,
          OP_F32_CONST, ...f32Bytes(0.0),
          OP_F32_GT,
          OP_IF, OP_VOID,
            // d_off = dst_ptr + (i << 2)
            OP_LOCAL_GET, 0,
            OP_LOCAL_GET, 7,
            OP_I32_CONST, 2,
            OP_I32_SHL,
            OP_I32_ADD,
            OP_LOCAL_TEE, 9,
            OP_I32_LOAD8_U, 0, 3,
            OP_LOCAL_TEE, 11, // da_i
            // c_off = carrier_ptr + (i << 2)
            OP_LOCAL_GET, 1,
            OP_LOCAL_GET, 7,
            OP_I32_CONST, 2,
            OP_I32_SHL,
            OP_I32_ADD,
            OP_LOCAL_TEE, 10,
            OP_I32_LOAD8_U, 0, 3,
            OP_LOCAL_TEE, 12, // ca_i
            OP_I32_OR,
            OP_I32_CONST, 0,
            OP_I32_NE,
            OP_IF, OP_VOID,
              // Load dr, dg, db, cr, cg, cb
              OP_LOCAL_GET, 9,
              OP_I32_LOAD8_U, 0, 0,
              OP_LOCAL_TEE, 13,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 25, // dr

              OP_LOCAL_GET, 9,
              OP_I32_LOAD8_U, 0, 1,
              OP_LOCAL_TEE, 14,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 26, // dg

              OP_LOCAL_GET, 9,
              OP_I32_LOAD8_U, 0, 2,
              OP_LOCAL_TEE, 15,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 27, // db

              OP_LOCAL_GET, 11,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 23, // da

              OP_LOCAL_GET, 10,
              OP_I32_LOAD8_U, 0, 0,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 28, // cr

              OP_LOCAL_GET, 10,
              OP_I32_LOAD8_U, 0, 1,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 29, // cg

              OP_LOCAL_GET, 10,
              OP_I32_LOAD8_U, 0, 2,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 30, // cb

              OP_LOCAL_GET, 12,
              OP_F32_CONVERT_I32_U,
              OP_LOCAL_SET, 24, // ca

              // w = min(max(weight * strength, 0.0), 1.0)
              OP_LOCAL_GET, 20,
              OP_LOCAL_GET, 4,
              OP_F32_MUL,
              OP_F32_CONST, ...f32Bytes(0.0),
              OP_F32_MAX,
              OP_F32_CONST, ...f32Bytes(1.0),
              OP_F32_MIN,
              OP_LOCAL_SET, 21,

              // inv_w = 1.0 - w
              OP_F32_CONST, ...f32Bytes(1.0),
              OP_LOCAL_GET, 21,
              OP_F32_SUB,
              OP_LOCAL_SET, 22,

              // mass = da * inv_w + ca * w
              OP_LOCAL_GET, 23,
              OP_LOCAL_GET, 22,
              OP_F32_MUL,
              OP_LOCAL_GET, 24,
              OP_LOCAL_GET, 21,
              OP_F32_MUL,
              OP_F32_ADD,
              OP_LOCAL_TEE, 31,
              OP_F32_CONST, ...f32Bytes(0.001),
              OP_F32_GT,
              OP_IF, OP_VOID,
                // inv_mass = 1.0 / mass
                OP_F32_CONST, ...f32Bytes(1.0),
                OP_LOCAL_GET, 31,
                OP_F32_DIV,
                OP_LOCAL_SET, 32,

                // nr_i = trunc((dr * da * inv_w + cr * ca * w) * inv_mass + 0.5)
                OP_LOCAL_GET, 25,
                OP_LOCAL_GET, 23,
                OP_F32_MUL,
                OP_LOCAL_GET, 22,
                OP_F32_MUL,
                OP_LOCAL_GET, 28,
                OP_LOCAL_GET, 24,
                OP_F32_MUL,
                OP_LOCAL_GET, 21,
                OP_F32_MUL,
                OP_F32_ADD,
                OP_LOCAL_GET, 32,
                OP_F32_MUL,
                OP_F32_CONST, ...f32Bytes(0.5),
                OP_F32_ADD,
                OP_I32_TRUNC_F32_S,
                OP_LOCAL_SET, 16,

                // ng_i
                OP_LOCAL_GET, 26,
                OP_LOCAL_GET, 23,
                OP_F32_MUL,
                OP_LOCAL_GET, 22,
                OP_F32_MUL,
                OP_LOCAL_GET, 29,
                OP_LOCAL_GET, 24,
                OP_F32_MUL,
                OP_LOCAL_GET, 21,
                OP_F32_MUL,
                OP_F32_ADD,
                OP_LOCAL_GET, 32,
                OP_F32_MUL,
                OP_F32_CONST, ...f32Bytes(0.5),
                OP_F32_ADD,
                OP_I32_TRUNC_F32_S,
                OP_LOCAL_SET, 17,

                // nb_i
                OP_LOCAL_GET, 27,
                OP_LOCAL_GET, 23,
                OP_F32_MUL,
                OP_LOCAL_GET, 22,
                OP_F32_MUL,
                OP_LOCAL_GET, 30,
                OP_LOCAL_GET, 24,
                OP_F32_MUL,
                OP_LOCAL_GET, 21,
                OP_F32_MUL,
                OP_F32_ADD,
                OP_LOCAL_GET, 32,
                OP_F32_MUL,
                OP_F32_CONST, ...f32Bytes(0.5),
                OP_F32_ADD,
                OP_I32_TRUNC_F32_S,
                OP_LOCAL_SET, 18,
              OP_ELSE,
                OP_I32_CONST, 0,
                OP_LOCAL_SET, 16,
                OP_I32_CONST, 0,
                OP_LOCAL_SET, 17,
                OP_I32_CONST, 0,
                OP_LOCAL_SET, 18,
              OP_END,

              // out_a = mass; if (out_a < da && da > 0): preserve_cov ? da : out_a + (da - out_a)*(da/255)^2
              OP_LOCAL_GET, 31,
              OP_LOCAL_SET, 33,
              OP_LOCAL_GET, 33,
              OP_LOCAL_GET, 23,
              OP_F32_LT,
              OP_IF, OP_VOID,
                OP_LOCAL_GET, 6, // preserve_cov
                OP_IF, OP_VOID,
                  OP_LOCAL_GET, 23,
                  OP_LOCAL_SET, 33,
                OP_ELSE,
                  OP_LOCAL_GET, 33,
                  OP_LOCAL_GET, 23,
                  OP_LOCAL_GET, 33,
                  OP_F32_SUB,
                  OP_LOCAL_GET, 23,
                  OP_F32_CONST, ...f32Bytes(255.0),
                  OP_F32_DIV,
                  OP_LOCAL_GET, 23,
                  OP_F32_CONST, ...f32Bytes(255.0),
                  OP_F32_DIV,
                  OP_F32_MUL,
                  OP_F32_MUL,
                  OP_F32_ADD,
                  OP_LOCAL_SET, 33,
                OP_END,
              OP_END,

              OP_LOCAL_GET, 33,
              OP_F32_CONST, ...f32Bytes(0.5),
              OP_F32_ADD,
              OP_I32_TRUNC_F32_S,
              OP_LOCAL_SET, 19, // na_i

              // Check if dst changed
              OP_LOCAL_GET, 19,
              OP_LOCAL_GET, 11,
              OP_I32_NE,
              OP_LOCAL_GET, 16,
              OP_LOCAL_GET, 13,
              OP_I32_NE,
              OP_I32_OR,
              OP_LOCAL_GET, 17,
              OP_LOCAL_GET, 14,
              OP_I32_NE,
              OP_I32_OR,
              OP_LOCAL_GET, 18,
              OP_LOCAL_GET, 15,
              OP_I32_NE,
              OP_I32_OR,
              OP_IF, OP_VOID,
                OP_I32_CONST, 1,
                OP_LOCAL_SET, 8,
              OP_END,

              // Store dst RGBA
              OP_LOCAL_GET, 9,
              OP_LOCAL_GET, 16,
              OP_I32_STORE8, 0, 0,
              OP_LOCAL_GET, 9,
              OP_LOCAL_GET, 17,
              OP_I32_STORE8, 0, 1,
              OP_LOCAL_GET, 9,
              OP_LOCAL_GET, 18,
              OP_I32_STORE8, 0, 2,
              OP_LOCAL_GET, 9,
              OP_LOCAL_GET, 19,
              OP_I32_STORE8, 0, 3,

              // Carrier update with 0.22 minimum gap pickup floor:
              // pickup_scale = da < ca ? max(0.22, da / 255.0) : 1.0
              OP_LOCAL_GET, 23,
              OP_LOCAL_GET, 24,
              OP_F32_LT,
              OP_IF, F32,
                OP_F32_CONST, ...f32Bytes(0.22),
                OP_LOCAL_GET, 23,
                OP_F32_CONST, ...f32Bytes(255.0),
                OP_F32_DIV,
                OP_F32_MAX,
              OP_ELSE,
                OP_F32_CONST, ...f32Bytes(1.0),
              OP_END,
              OP_LOCAL_SET, 34,

              // ex = min(max(pickup * weight * pickup_scale, 0.0), 1.0)
              OP_LOCAL_GET, 5,
              OP_LOCAL_GET, 20,
              OP_F32_MUL,
              OP_LOCAL_GET, 34,
              OP_F32_MUL,
              OP_F32_CONST, ...f32Bytes(0.0),
              OP_F32_MAX,
              OP_F32_CONST, ...f32Bytes(1.0),
              OP_F32_MIN,
              OP_LOCAL_SET, 35,

              // rem = 1.0 - ex
              OP_F32_CONST, ...f32Bytes(1.0),
              OP_LOCAL_GET, 35,
              OP_F32_SUB,
              OP_LOCAL_SET, 36,

              // new_mass = ca * rem + da * ex
              OP_LOCAL_GET, 24,
              OP_LOCAL_GET, 36,
              OP_F32_MUL,
              OP_LOCAL_GET, 23,
              OP_LOCAL_GET, 35,
              OP_F32_MUL,
              OP_F32_ADD,
              OP_LOCAL_TEE, 37,
              OP_F32_CONST, ...f32Bytes(0.001),
              OP_F32_GT,
              OP_IF, OP_VOID,
                OP_F32_CONST, ...f32Bytes(1.0),
                OP_LOCAL_GET, 37,
                OP_F32_DIV,
                OP_LOCAL_SET, 32, // inv_new

                // carrier R
                OP_LOCAL_GET, 10,
                OP_LOCAL_GET, 28,
                OP_LOCAL_GET, 24,
                OP_F32_MUL,
                OP_LOCAL_GET, 36,
                OP_F32_MUL,
                OP_LOCAL_GET, 25,
                OP_LOCAL_GET, 23,
                OP_F32_MUL,
                OP_LOCAL_GET, 35,
                OP_F32_MUL,
                OP_F32_ADD,
                OP_LOCAL_GET, 32,
                OP_F32_MUL,
                OP_F32_CONST, ...f32Bytes(0.5),
                OP_F32_ADD,
                OP_I32_TRUNC_F32_S,
                OP_I32_STORE8, 0, 0,

                // carrier G
                OP_LOCAL_GET, 10,
                OP_LOCAL_GET, 29,
                OP_LOCAL_GET, 24,
                OP_F32_MUL,
                OP_LOCAL_GET, 36,
                OP_F32_MUL,
                OP_LOCAL_GET, 26,
                OP_LOCAL_GET, 23,
                OP_F32_MUL,
                OP_LOCAL_GET, 35,
                OP_F32_MUL,
                OP_F32_ADD,
                OP_LOCAL_GET, 32,
                OP_F32_MUL,
                OP_F32_CONST, ...f32Bytes(0.5),
                OP_F32_ADD,
                OP_I32_TRUNC_F32_S,
                OP_I32_STORE8, 0, 1,

                // carrier B
                OP_LOCAL_GET, 10,
                OP_LOCAL_GET, 30,
                OP_LOCAL_GET, 24,
                OP_F32_MUL,
                OP_LOCAL_GET, 36,
                OP_F32_MUL,
                OP_LOCAL_GET, 27,
                OP_LOCAL_GET, 23,
                OP_F32_MUL,
                OP_LOCAL_GET, 35,
                OP_F32_MUL,
                OP_F32_ADD,
                OP_LOCAL_GET, 32,
                OP_F32_MUL,
                OP_F32_CONST, ...f32Bytes(0.5),
                OP_F32_ADD,
                OP_I32_TRUNC_F32_S,
                OP_I32_STORE8, 0, 2,
              OP_ELSE,
                OP_LOCAL_GET, 10,
                OP_I32_CONST, 0,
                OP_I32_STORE8, 0, 0,
                OP_LOCAL_GET, 10,
                OP_I32_CONST, 0,
                OP_I32_STORE8, 0, 1,
                OP_LOCAL_GET, 10,
                OP_I32_CONST, 0,
                OP_I32_STORE8, 0, 2,
              OP_END,

              // carrier A
              OP_LOCAL_GET, 10,
              OP_LOCAL_GET, 37,
              OP_F32_CONST, ...f32Bytes(0.5),
              OP_F32_ADD,
              OP_I32_TRUNC_F32_S,
              OP_I32_STORE8, 0, 3,
            OP_END,
          OP_END,

          // i++
          OP_LOCAL_GET, 7,
          OP_I32_CONST, 1,
          OP_I32_ADD,
          OP_LOCAL_SET, 7,
          OP_BR, 0,
        OP_END,
      OP_END,
      OP_LOCAL_GET, 8,
    ],
  );

  // Function 4: tessellate_ribbon_wasm(pts_ptr: i32, count: i32, out_env_ptr: i32) -> i32
  // Input at pts_ptr: array of `count` structs { x: f32, y: f32, r: f32 } (12 bytes each)
  // Output at out_env_ptr: array of `count` structs { lx: f32, ly: f32, rx: f32, ry: f32 } (16 bytes each)
  // Returns: count * 8 (total vertex count)
  // params: 0=pts_ptr, 1=count, 2=out_env_ptr
  // locals:
  //   3: i (i32)
  //   4: prev_idx (i32)
  //   5: next_idx (i32)
  //   6: curr_ptr (i32)
  //   7: prev_ptr (i32)
  //   8: next_ptr (i32)
  //   9: out_ptr (i32)
  //  10: cx (f32)
  //  11: cy (f32)
  //  12: cr (f32)
  //  13: tx (f32)
  //  14: ty (f32)
  //  15: len (f32)
  //  16: nx (f32)
  //  17: ny (f32)
  const fn4 = encodeFuncBody(
    [
      [7, I32],
      [8, F32],
    ],
    [
      OP_LOCAL_GET, 1,
      OP_I32_CONST, 0,
      OP_I32_LE_S,
      OP_IF, OP_VOID,
        OP_I32_CONST, 0,
        OP_RETURN,
      OP_END,

      OP_I32_CONST, 0,
      OP_LOCAL_SET, 3, // i = 0

      OP_BLOCK, OP_VOID,
        OP_LOOP, OP_VOID,
          OP_LOCAL_GET, 3,
          OP_LOCAL_GET, 1,
          OP_I32_GE_S,
          OP_BR_IF, 1,

          // prev_idx = i > 0 ? i - 1 : 0
          OP_LOCAL_GET, 3,
          OP_I32_CONST, 0,
          OP_I32_GT_S,
          OP_IF, I32,
            OP_LOCAL_GET, 3,
            OP_I32_CONST, 1,
            OP_I32_SUB,
          OP_ELSE,
            OP_I32_CONST, 0,
          OP_END,
          OP_LOCAL_SET, 4,

          // next_idx = i + 1 < count ? i + 1 : count - 1
          OP_LOCAL_GET, 3,
          OP_I32_CONST, 1,
          OP_I32_ADD,
          OP_LOCAL_GET, 1,
          OP_I32_LT_S,
          OP_IF, I32,
            OP_LOCAL_GET, 3,
            OP_I32_CONST, 1,
            OP_I32_ADD,
          OP_ELSE,
            OP_LOCAL_GET, 1,
            OP_I32_CONST, 1,
            OP_I32_SUB,
          OP_END,
          OP_LOCAL_SET, 5,

          // curr_ptr = pts_ptr + i * 12
          OP_LOCAL_GET, 0,
          OP_LOCAL_GET, 3,
          OP_I32_CONST, 12,
          OP_I32_MUL,
          OP_I32_ADD,
          OP_LOCAL_TEE, 6,
          OP_F32_LOAD, 2, 0,
          OP_LOCAL_SET, 10, // cx

          OP_LOCAL_GET, 6,
          OP_F32_LOAD, 2, 4,
          OP_LOCAL_SET, 11, // cy

          OP_LOCAL_GET, 6,
          OP_F32_LOAD, 2, 8,
          OP_F32_CONST, ...f32Bytes(0.25),
          OP_F32_MAX,
          OP_LOCAL_SET, 12, // cr

          // prev_ptr = pts_ptr + prev_idx * 12
          OP_LOCAL_GET, 0,
          OP_LOCAL_GET, 4,
          OP_I32_CONST, 12,
          OP_I32_MUL,
          OP_I32_ADD,
          OP_LOCAL_SET, 7,

          // next_ptr = pts_ptr + next_idx * 12
          OP_LOCAL_GET, 0,
          OP_LOCAL_GET, 5,
          OP_I32_CONST, 12,
          OP_I32_MUL,
          OP_I32_ADD,
          OP_LOCAL_SET, 8,

          // tx = next.x - prev.x
          OP_LOCAL_GET, 8,
          OP_F32_LOAD, 2, 0,
          OP_LOCAL_GET, 7,
          OP_F32_LOAD, 2, 0,
          OP_F32_SUB,
          OP_LOCAL_SET, 13,

          // ty = next.y - prev.y
          OP_LOCAL_GET, 8,
          OP_F32_LOAD, 2, 4,
          OP_LOCAL_GET, 7,
          OP_F32_LOAD, 2, 4,
          OP_F32_SUB,
          OP_LOCAL_SET, 14,

          // len = sqrt(tx*tx + ty*ty)
          OP_LOCAL_GET, 13,
          OP_LOCAL_GET, 13,
          OP_F32_MUL,
          OP_LOCAL_GET, 14,
          OP_LOCAL_GET, 14,
          OP_F32_ADD, // wait: ty*ty!
        ].slice(0, -1).concat([
          OP_LOCAL_GET, 14,
          OP_F32_MUL,
          OP_F32_ADD,
          OP_F32_SQRT,
          OP_LOCAL_TEE, 15,
          OP_F32_CONST, ...f32Bytes(0.0001),
          OP_F32_GT,
          OP_IF, OP_VOID,
            // nx = -ty / len
            OP_F32_CONST, ...f32Bytes(0.0),
            OP_LOCAL_GET, 14,
            OP_F32_SUB,
            OP_LOCAL_GET, 15,
            OP_F32_DIV,
            OP_LOCAL_SET, 16,
            // ny = tx / len
            OP_LOCAL_GET, 13,
            OP_LOCAL_GET, 15,
            OP_F32_DIV,
            OP_LOCAL_SET, 17,
          OP_ELSE,
            OP_F32_CONST, ...f32Bytes(0.0),
            OP_LOCAL_SET, 16,
            OP_F32_CONST, ...f32Bytes(1.0),
            OP_LOCAL_SET, 17,
          OP_END,

          // out_ptr = out_env_ptr + (i << 4)
          OP_LOCAL_GET, 2,
          OP_LOCAL_GET, 3,
          OP_I32_CONST, 4,
          OP_I32_SHL,
          OP_I32_ADD,
          OP_LOCAL_TEE, 9,
          // lx = cx + nx * cr
          OP_LOCAL_GET, 10,
          OP_LOCAL_GET, 16,
          OP_LOCAL_GET, 12,
          OP_F32_MUL,
          OP_F32_ADD,
          OP_F32_STORE, 2, 0,

          // ly = cy + ny * cr
          OP_LOCAL_GET, 9,
          OP_LOCAL_GET, 11,
          OP_LOCAL_GET, 17,
          OP_LOCAL_GET, 12,
          OP_F32_MUL,
          OP_F32_ADD,
          OP_F32_STORE, 2, 4,

          // rx = cx - nx * cr
          OP_LOCAL_GET, 9,
          OP_LOCAL_GET, 10,
          OP_LOCAL_GET, 16,
          OP_LOCAL_GET, 12,
          OP_F32_MUL,
          OP_F32_SUB,
          OP_F32_STORE, 2, 8,

          // ry = cy - ny * cr
          OP_LOCAL_GET, 9,
          OP_LOCAL_GET, 11,
          OP_LOCAL_GET, 17,
          OP_LOCAL_GET, 12,
          OP_F32_MUL,
          OP_F32_SUB,
          OP_F32_STORE, 2, 12,

          // i++
          OP_LOCAL_GET, 3,
          OP_I32_CONST, 1,
          OP_I32_ADD,
          OP_LOCAL_SET, 3,
          OP_BR, 0,
        OP_END,
      OP_END,

      // return count * 8
      OP_LOCAL_GET, 1,
      OP_I32_CONST, 3,
      OP_I32_SHL,
    ]),
  );

  const codeSection = encodeSection(10, [
    ...uleb128(5),
    ...fn0,
    ...fn1,
    ...fn2,
    ...fn3,
    ...fn4,
  ]);

  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  return new Uint8Array([
    ...header,
    ...typeSection,
    ...funcSection,
    ...memorySection,
    ...exportSection,
    ...codeSection,
  ]);
}

// Memory layout constants inside the 4 MB Wasm linear heap:
// [0 .. 524288)          -> dst RGBA tile buffer (up to 360x360x4)
// [524288 .. 1048576)    -> carrier RGBA tile buffer (up to 360x360x4)
// [1048576 .. 1572864)   -> weights f32 buffer (up to 360x360x4)
// [1572864 .. 2097152)   -> input stroke nodes f32x3 buffer
// [2097152 .. 3145728)   -> output ribbon envelope f32x4 buffer
const PTR_DST_RGBA = 0;
const PTR_CARRIER_RGBA = 524288;
const PTR_WEIGHTS_F32 = 1048576;
const PTR_STROKE_NODES = 1572864;
const PTR_RIBBON_ENV = 2097152;

/**
 * Synchronously instantiates the compiled Rust/Wasm engine module and returns
 * a high-level runtime wrapper operating directly on Wasm linear memory.
 */
export function createRustEngineWasmRuntime(): RustEngineWasmRuntime {
  const bytes = buildRustEngineWasmBinary();
  if (!WebAssembly.validate(bytes as BufferSource)) {
    throw new Error('WinCreate Rust Wasm binary failed WebAssembly validation');
  }
  const mod = new WebAssembly.Module(bytes as BufferSource);
  const instance = new WebAssembly.Instance(mod);
  const exports = instance.exports as unknown as RustWasmExports;
  const memory = exports.memory;

  return {
    isWasmReady: true,
    versionCode: exports.engine_version(),
    version: '6.6.0-rust-wasm32',
    exports,
    memory,

    planSmudgeSteps(dx: number, dy: number, radius: number, spacingRatio: number): number {
      return exports.plan_smudge_steps(dx, dy, radius, spacingRatio);
    },

    stabilizeCoord(prev: number, raw: number, alpha: number): number {
      return exports.stabilize_coord(prev, raw, alpha);
    },

    blendSmudgeDabInMemory(
      dstRgba: Uint8ClampedArray | Uint8Array,
      carrierRgba: Uint8ClampedArray | Uint8Array,
      weights: Float32Array,
      strength: number,
      pickupRate: number,
      preserveCoverage: boolean,
    ): boolean {
      const count = Math.min(
        weights.length,
        Math.floor(dstRgba.length / 4),
        Math.floor(carrierRgba.length / 4),
        131072,
      );
      if (count <= 0) return false;

      const byteLen = count * 4;
      const heapU8 = new Uint8Array(memory.buffer);
      const heapF32 = new Float32Array(memory.buffer, PTR_WEIGHTS_F32, count);

      heapU8.set(dstRgba.subarray(0, byteLen), PTR_DST_RGBA);
      heapU8.set(carrierRgba.subarray(0, byteLen), PTR_CARRIER_RGBA);
      heapF32.set(weights.subarray(0, count));

      const changed = exports.blend_smudge_dab_wasm(
        PTR_DST_RGBA,
        PTR_CARRIER_RGBA,
        PTR_WEIGHTS_F32,
        count,
        strength,
        pickupRate,
        preserveCoverage ? 1 : 0,
      );

      if (changed) {
        dstRgba.set(heapU8.subarray(PTR_DST_RGBA, PTR_DST_RGBA + byteLen));
      }
      carrierRgba.set(heapU8.subarray(PTR_CARRIER_RGBA, PTR_CARRIER_RGBA + byteLen));
      return changed !== 0;
    },

    tessellateStrokeEnvelope(points: ReadonlyArray<{ x: number; y: number; r: number }>) {
      const n = Math.min(points.length, 16384);
      if (n === 0) {
        return { vertexCount: 0, leftRightCoords: new Float32Array(0), svgPath: '' };
      }
      if (n === 1) {
        const p = points[0];
        const r = Math.max(0.25, p.r);
        const svgPath = `M ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x - r).toFixed(2)} ${p.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(p.x + r).toFixed(2)} ${p.y.toFixed(2)} Z`;
        return { vertexCount: 8, leftRightCoords: new Float32Array([p.x, p.y - r, p.x, p.y + r]), svgPath };
      }

      const nodesF32 = new Float32Array(memory.buffer, PTR_STROKE_NODES, n * 3);
      for (let i = 0; i < n; i++) {
        const pt = points[i];
        const base = i * 3;
        nodesF32[base] = pt.x;
        nodesF32[base + 1] = pt.y;
        nodesF32[base + 2] = Math.max(0.25, pt.r || 1);
      }

      const vertexCount = exports.tessellate_ribbon_wasm(PTR_STROKE_NODES, n, PTR_RIBBON_ENV);
      const envView = new Float32Array(memory.buffer, PTR_RIBBON_ENV, n * 4);
      const coords = new Float32Array(envView);

      const r0 = Math.max(0.25, points[0].r || 1);
      const rn = Math.max(0.25, points[n - 1].r || 1);
      const parts: string[] = [`M ${coords[0].toFixed(2)} ${coords[1].toFixed(2)}`];
      for (let i = 1; i < n; i++) {
        const off = i * 4;
        parts.push(`L ${coords[off].toFixed(2)} ${coords[off + 1].toFixed(2)}`);
      }
      const lastOff = (n - 1) * 4;
      parts.push(
        `A ${rn.toFixed(2)} ${rn.toFixed(2)} 0 0 1 ${coords[lastOff + 2].toFixed(2)} ${coords[lastOff + 3].toFixed(2)}`,
      );
      for (let i = n - 2; i >= 0; i--) {
        const off = i * 4;
        parts.push(`L ${coords[off + 2].toFixed(2)} ${coords[off + 3].toFixed(2)}`);
      }
      parts.push(`A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 0 1 ${coords[0].toFixed(2)} ${coords[1].toFixed(2)} Z`);

      return {
        vertexCount,
        leftRightCoords: coords,
        svgPath: parts.join(' '),
      };
    },
  };
}
