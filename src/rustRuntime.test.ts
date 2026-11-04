import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEngineProfile,
  createDesktopRuntimeConfig,
  isAllowedDesktopNavigation,
  getWebviewGpuArgs,
  getUnlockedPerformanceBudgets,
  computeSmudgeStepPlan,
  blendSmudgeCarrierOverGap,
  bridgeLineGapsAndFill,
  applyHSBAdjustment,
  applyColorBalanceAdjustment,
  applyLevelsCurveAdjustment,
  applyChromaticAberration,
  stepBilinearLiquify,
  snapDrawingAssistPoint,
} from './rustRuntime';

test('parseEngineProfile defaults to performance and parses CLI flags', () => {
  assert.equal(parseEngineProfile([]), 'performance');
  assert.equal(parseEngineProfile(['--wincreate-engine=battery']), 'battery');
  assert.equal(parseEngineProfile(['--wincreate-engine=compatibility']), 'compatibility');
  assert.equal(parseEngineProfile(['--wincreate-engine=performance']), 'performance');
});

test('createDesktopRuntimeConfig enables full GPU acceleration in performance mode', () => {
  const perf = createDesktopRuntimeConfig([]);
  assert.equal(perf.appId, 'com.wincreate.studio');
  assert.equal(perf.productName, 'WinCreate Studio');
  assert.equal(perf.version, '6.6.0');
  assert.equal(perf.width, 1440);
  assert.equal(perf.height, 900);
  assert.equal(perf.minWidth, 900);
  assert.equal(perf.minHeight, 620);
  assert.equal(perf.backgroundColor, '#0b0d12');
  assert.equal(perf.backgroundRendering, true);
  assert.equal(perf.dedicatedGpuForced, true);
  assert.ok(perf.webviewGpuArgs.includes('--force-high-performance-gpu'));
  assert.ok(perf.webviewGpuArgs.includes('--enable-gpu-rasterization'));
  assert.ok(perf.webviewGpuArgs.includes('--enable-zero-copy'));

  const battery = createDesktopRuntimeConfig(['--wincreate-engine=battery']);
  assert.equal(battery.engine, 'battery');
  assert.equal(battery.backgroundRendering, false);
  assert.equal(battery.dedicatedGpuForced, false);
  assert.deepEqual(getWebviewGpuArgs('battery'), ['--force-low-power-gpu']);
});

test('getUnlockedPerformanceBudgets returns unlocked 360 FPS and multi-GB memory budgets', () => {
  const budgets = getUnlockedPerformanceBudgets('performance');
  assert.equal(budgets.fps, 360);
  assert.equal(budgets.undoMB, 2048);
  assert.equal(budgets.gpuMB, 2048);
  assert.equal(budgets.effectMB, 1024);
  assert.equal(budgets.rasterMB, 1024);
  assert.equal(budgets.scratchMB, 512);
  assert.equal(budgets.maxBrushSize, 1600);
  assert.equal(budgets.maxCanvasDimension, 16384);
  assert.equal(budgets.maxFillGap, 32);
});

test('isAllowedDesktopNavigation blocks external navigation and allows local Tauri origins', () => {
  assert.equal(isAllowedDesktopNavigation('tauri://localhost/index.html'), true);
  assert.equal(isAllowedDesktopNavigation('https://tauri.localhost/index.html'), true);
  assert.equal(isAllowedDesktopNavigation('http://127.0.0.1:8765/index.html'), true);
  assert.equal(isAllowedDesktopNavigation('https://example.com'), false);
  assert.equal(isAllowedDesktopNavigation('javascript:alert(1)'), false);
});

test('computeSmudgeStepPlan produces dense sub-2.2px steps with zero gaps on fast strokes', () => {
  const plan = computeSmudgeStepPlan(100, 100, 340, 280, 28, 6);
  assert.ok(plan.spacing <= 2.2 && plan.spacing >= 0.35);
  assert.ok(plan.steps.length >= 135);
  let prev = { x: 100, y: 100 };
  for (const pt of plan.steps) {
    const stepDist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
    assert.ok(stepDist <= plan.spacing + 1e-6, `stepDist ${stepDist} exceeded spacing ${plan.spacing}`);
    prev = pt;
  }
  assert.equal(plan.steps.at(-1)?.x, 340);
  assert.equal(plan.steps.at(-1)?.y, 280);
});

test('blendSmudgeCarrierOverGap retains carrier pigment across transparent gaps', () => {
  let carrierAlpha = 255;
  for (let i = 0; i < 12; i++) {
    carrierAlpha = blendSmudgeCarrierOverGap(carrierAlpha, 0, 0.25, 0.5);
  }
  // Carrier alpha should remain strong (> 175) across 12 transparent dabs instead of starving out
  assert.ok(carrierAlpha > 175, `Expected carrierAlpha > 175 after crossing gap, got ${carrierAlpha}`);
});

test('bridgeLineGapsAndFill seals angled and multi-pixel contour gaps without leaking outside', () => {
  const w = 40;
  const h = 40;
  const boundary = new Uint8Array(w * h);

  // Draw a box from (8,8) to (30,30), leaving an angled 7px break along the top-right edge
  for (let x = 8; x <= 30; x++) {
    if (x < 18 || x > 24) boundary[8 * w + x] = 1; // 6px horizontal gap at y=8, x=18..24
    boundary[30 * w + x] = 1;
  }
  for (let y = 8; y <= 30; y++) {
    boundary[y * w + 8] = 1;
    if (y < 14 || y > 19) boundary[y * w + 30] = 1; // 5px vertical gap at x=30, y=14..19
  }

  // With gapRadius = 0, flood fill from center (19, 19) leaks to (0, 0)
  const leaked = bridgeLineGapsAndFill(w, h, boundary, 19, 19, 0);
  assert.equal(leaked[0], 1, 'Expected fill to leak when gap closing is disabled');

  // With gapRadius = 8, both gaps are bridged, fill stays strictly inside the box, and 90° corners stay sharp
  const sealed = bridgeLineGapsAndFill(w, h, boundary, 19, 19, 8);
  assert.equal(sealed[19 * w + 19], 1, 'Center of contour should be filled');
  assert.equal(sealed[9 * w + 9], 1, 'Top-left 90° interior corner (9,9) must be filled without corner rounding');
  assert.equal(sealed[29 * w + 9], 1, 'Bottom-left 90° interior corner (9,29) must be filled without corner rounding');
  assert.equal(sealed[29 * w + 29], 1, 'Bottom-right 90° interior corner (29,29) must be filled without corner rounding');
  assert.equal(sealed[0], 0, 'Exterior corner (0,0) must not be filled');
  assert.equal(sealed[2 * w + 20], 0, 'Exterior above top gap must not be filled');
  assert.equal(sealed[16 * w + 36], 0, 'Exterior right of side gap must not be filled');
});

test('applyHSBAdjustment shifts hue, saturation, and brightness accurately while preserving alpha', () => {
  // Pure red pixel (255, 0, 0, 200) shifted +120 deg -> pure green (0, 255, 0, 200)
  const src = new Uint8ClampedArray([255, 0, 0, 200, 0, 0, 0, 0]);
  const shifted = applyHSBAdjustment(src, 120, 0, 0);
  assert.equal(shifted[0], 0);
  assert.equal(shifted[1], 255);
  assert.equal(shifted[2], 0);
  assert.equal(shifted[3], 200);
  assert.equal(shifted[7], 0, 'Transparent pixels must remain untouched');

  // Desaturate -100% -> grayscale
  const desat = applyHSBAdjustment(src, 0, -100, 0);
  assert.equal(desat[0], 255);
  assert.equal(desat[1], 255);
  assert.equal(desat[2], 255);
});

test('applyColorBalanceAdjustment and applyLevelsCurveAdjustment transform tonal ranges', () => {
  const midGray = new Uint8ClampedArray([128, 128, 128, 255]);
  const warmMid = applyColorBalanceAdjustment(midGray, [0, 0, 0], [40, -10, -30], [0, 0, 0], false);
  assert.ok(warmMid[0] > 160, 'Red channel should increase in midtones');
  assert.ok(warmMid[2] < 100, 'Blue channel should decrease in midtones');

  const curved = applyLevelsCurveAdjustment(midGray, 20, 1.5, 220, 25);
  assert.ok(curved[0] > 140, 'Gamma > 1 and white point compression should brighten mid-gray');
  assert.equal(curved[3], 255);
});

test('applyChromaticAberration displaces red and blue channels along angle', () => {
  const w = 12;
  const h = 5;
  const src = new Uint8ClampedArray(w * h * 4);
  // White vertical line at x=6
  for (let y = 0; y < h; y++) {
    const idx = (y * w + 6) * 4;
    src[idx] = 255;
    src[idx + 1] = 255;
    src[idx + 2] = 255;
    src[idx + 3] = 255;
  }
  const ca = applyChromaticAberration(src, w, h, 2, 0, 0);
  // At x=6, green remains 255 while red moved to x=8 and blue moved to x=4
  assert.equal(ca[(2 * w + 6) * 4 + 1], 255, 'Green stays centered at x=6');
  assert.equal(ca[(2 * w + 8) * 4], 255, 'Red shifted +2px to x=8');
  assert.equal(ca[(2 * w + 4) * 4 + 2], 255, 'Blue shifted -2px to x=4');
});

test('stepBilinearLiquify warps and reconstructs pixels smoothly', () => {
  const w = 20;
  const h = 20;
  const orig = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    orig[i * 4] = (i % w) * 12;
    orig[i * 4 + 1] = Math.floor(i / w) * 12;
    orig[i * 4 + 2] = 180;
    orig[i * 4 + 3] = 255;
  }
  const pushed = stepBilinearLiquify(orig, orig, w, h, 10, 10, 4, 0, 'push', 8, 0.9);
  const centerIdx = (10 * w + 10) * 4;
  assert.notEqual(pushed[centerIdx], orig[centerIdx], 'Push Liquify must displace center pixel');

  // Reconstruct repeatedly should bring center pixel back toward original
  let recon = pushed;
  for (let step = 0; step < 8; step++) {
    recon = stepBilinearLiquify(recon, orig, w, h, 10, 10, 0, 0, 'reconstruct', 8, 1.0);
  }
  assert.ok(
    Math.abs(recon[centerIdx] - orig[centerIdx]) <= 1,
    `Expected reconstructed pixel ${recon[centerIdx]} to match original ${orig[centerIdx]}`
  );
});

test('snapDrawingAssistPoint snaps strokes to 2D grid, isometric, and perspective axes', () => {
  const gridH = snapDrawingAssistPoint({ x: 100, y: 100 }, { x: 180, y: 112 }, 'grid2d');
  assert.deepEqual(gridH, { x: 180, y: 100 });

  const gridV = snapDrawingAssistPoint({ x: 100, y: 100 }, { x: 108, y: 210 }, 'grid2d');
  assert.deepEqual(gridV, { x: 100, y: 210 });

  const persp = snapDrawingAssistPoint(
    { x: 100, y: 100 },
    { x: 200, y: 195 },
    'perspective',
    [{ x: 300, y: 300 }]
  );
  // Should snap onto the 45-degree ray toward (300,300) -> x === y
  assert.ok(Math.abs(persp.x - persp.y) < 1e-5, `Expected x===y on 45° vanishing ray, got (${persp.x}, ${persp.y})`);
});

test('stepInPlaceWetSmudge smears pigment across gaps with sub-millisecond frame latency', async () => {
  const { stepInPlaceWetSmudge, diffuseCarrierInPlace } = await import('./rustRuntime');
  const W = 1280;
  const H = 720;
  const canvasPixels = new Uint8ClampedArray(W * H * 4);
  const dabSize = 48;
  const radius = 22;
  const carrier = new Uint8ClampedArray(dabSize * dabSize * 4);
  const weights = new Float32Array(dabSize * dabSize);

  const center = (dabSize - 1) * 0.5;
  for (let y = 0; y < dabSize; y++) {
    for (let x = 0; x < dabSize; x++) {
      const d = Math.hypot(x - center, y - center) / radius;
      if (d < 1) {
        const t = 1 - d;
        weights[y * dabSize + x] = t * t * (3 - 2 * t);
      }
      const cIdx = (y * dabSize + x) * 4;
      carrier[cIdx] = 255;
      carrier[cIdx + 1] = 64;
      carrier[cIdx + 2] = 128;
      carrier[cIdx + 3] = 255;
    }
  }

  const t0 = performance.now();
  for (let step = 0; step < 120; step++) {
    if ((step & 1) === 0) diffuseCarrierInPlace(carrier, dabSize, 0.45);
    const res = stepInPlaceWetSmudge(
      canvasPixels,
      W,
      H,
      carrier,
      weights,
      dabSize,
      100 + step * 3,
      200,
      0.65,
      0.32,
      true
    );
    assert.equal(res.changed, true);
  }
  const elapsedMs = performance.now() - t0;
  // Verify pigment was deposited continuously along the smear trail
  const midIdx = ((200 + 24) * W + (100 + 60 * 3 + 24)) * 4;
  assert.ok(canvasPixels[midIdx + 3] > 80, `Expected strong smeared pigment alpha at trail midpoint, got ${canvasPixels[midIdx + 3]}`);
  assert.ok(elapsedMs < 60, `Expected 120 dabs of 48x48 smudge to complete in <60ms, took ${elapsedMs.toFixed(2)}ms`);
});

test('resolveDrawingGpuAccelerationState toggles drawing engine GPU acceleration independently', async () => {
  const { resolveDrawingGpuAccelerationState } = await import('./rustRuntime');

  const gpuOn = resolveDrawingGpuAccelerationState(true, true, true);
  assert.equal(gpuOn.gpuDrawingEnabled, true);
  assert.equal(gpuOn.canvasBackend, 'accelerated');
  assert.equal(gpuOn.wetPaintMode, 'gpu');
  assert.equal(gpuOn.effectsMode, 'gpu');
  assert.equal(gpuOn.badgeLabel, 'GPU ON');

  const gpuOff = resolveDrawingGpuAccelerationState(false, true, true);
  assert.equal(gpuOff.gpuDrawingEnabled, false);
  assert.equal(gpuOff.canvasBackend, 'readback');
  assert.equal(gpuOff.wetPaintMode, 'cpu');
  assert.equal(gpuOff.effectsMode, 'cpu');
  assert.equal(gpuOff.badgeLabel, 'CPU ONLY');

  const drawingGpuOnly = resolveDrawingGpuAccelerationState(true, false, true);
  assert.equal(drawingGpuOnly.canvasBackend, 'accelerated');
  assert.equal(drawingGpuOnly.wetPaintMode, 'cpu');
  assert.equal(drawingGpuOnly.effectsMode, 'gpu');
});

test('formatGpuProbeDiagnostics formats WebGL2 and WebGPU probe readouts accurately', async () => {
  const { formatGpuProbeDiagnostics } = await import('./rustRuntime');

  const diag = formatGpuProbeDiagnostics({
    gpuDrawingEnabled: true,
    gpuPreference: 'high-performance',
    webglAvailable: true,
    webglRenderer: 'ANGLE (NVIDIA GeForce RTX 4080)',
    floatBufferSupported: true,
    maxTextureSize: 16384,
    webgpuAvailable: true,
    webgpuAdapterName: 'nvidia / blackwell / RTX',
    wetPaintBytes: 4 * 1048576,
    effectsBytes: 2.5 * 1048576,
    probeCount: 3,
  });

  assert.equal(diag.engineStateLabel, 'GPU Accelerated (Active)');
  assert.equal(diag.webglStatusLabel, 'WebGL2 Ready · ANGLE (NVIDIA GeForce RTX 4080)');
  assert.equal(diag.webgpuStatusLabel, 'WebGPU Ready · nvidia / blackwell / RTX');
  assert.equal(diag.floatBufferLabel, 'Supported (RGBA16F / RGBA32F)');
  assert.equal(diag.maxTextureLabel, '16384 px');
  assert.equal(diag.memorySummary, '6.5 MB allocated');
  assert.equal(diag.probeCountLabel, 'Probe #3');
  assert.ok(diag.probeStatusLine.includes('high-performance'));
});

test('generateComplexVectorStrokeBatch and tessellatePressureVectorStroke build complex pressure-sensitive vector geometry', async () => {
  const { generateComplexVectorStrokeBatch, tessellatePressureVectorStroke } = await import('./rustRuntime');

  const batch = generateComplexVectorStrokeBatch(24, 180, 1920, 1080);
  assert.equal(batch.length, 24);
  assert.equal(batch[0].length, 180);

  let totalVertices = 0;
  let totalArcLen = 0;
  for (const stroke of batch) {
    const tess = tessellatePressureVectorStroke(stroke);
    assert.ok(tess.svgPath.startsWith('M '), 'Expected valid SVG path data');
    assert.ok(tess.vertexCount > 1000, `Expected >1000 vertices per complex stroke, got ${tess.vertexCount}`);
    assert.ok(tess.arcLength > 500, `Expected significant arc length, got ${tess.arcLength}`);
    totalVertices += tess.vertexCount;
    totalArcLen += tess.arcLength;
  }
  assert.ok(totalVertices >= 24 * 1000);
  assert.ok(totalArcLen > 20000);
});

test('calculateVectorStressTestMetrics computes average frame time, p95/peak, FPS, and lag troubleshooting advice', async () => {
  const { calculateVectorStressTestMetrics } = await import('./rustRuntime');

  // Optimal case (<8.33ms average)
  const optimal = calculateVectorStressTestMetrics([1.8, 2.1, 2.4, 1.9, 2.3], 24, 180, true, 2, 34560);
  assert.equal(optimal.avgFrameTimeMs, 2.1);
  assert.equal(optimal.minFrameTimeMs, 1.8);
  assert.equal(optimal.maxFrameTimeMs, 2.4);
  assert.equal(optimal.lagSeverity, 'optimal');
  assert.equal(optimal.avgFrameTimeLabel, '2.10 ms / frame');
  assert.ok(optimal.effectiveFps >= 120);
  assert.ok(optimal.troubleshootingAdvice.includes('120Hz+'));

  // Moderate lag case (between 8.33ms and 16.67ms with GPU off)
  const moderate = calculateVectorStressTestMetrics([11.2, 12.5, 13.1, 12.0], 24, 180, false, 2, 34560);
  assert.equal(moderate.lagSeverity, 'moderate');
  assert.ok(moderate.avgFrameTimeMs > 8.33 && moderate.avgFrameTimeMs <= 16.67);
  assert.ok(moderate.troubleshootingAdvice.includes('Enable "Drawing Engine GPU Acceleration"'));

  // High lag case (>16.67ms)
  const highLag = calculateVectorStressTestMetrics([22.4, 25.0, 28.2, 24.4], 24, 180, false, 4, 34560);
  assert.equal(highLag.lagSeverity, 'high');
  assert.equal(highLag.avgFrameTimeMs, 25);
  assert.equal(highLag.effectiveFps, 40);
  assert.ok(highLag.troubleshootingAdvice.includes('Lag detected'));
  assert.ok(highLag.troubleshootingAdvice.includes('enable Drawing Engine GPU Acceleration'));
  assert.ok(highLag.troubleshootingAdvice.includes('reduce SSAA from 4× to 1× Native'));
});

test('createRustCrossPlatformTargets configures Windows and Android native Rust targets', async () => {
  const { createRustCrossPlatformTargets } = await import('./rustRuntime');

  const cfg = createRustCrossPlatformTargets('performance');
  assert.equal(cfg.appId, 'com.wincreate.studio');
  assert.equal(cfg.version, '6.6.0');
  assert.ok(cfg.windows.targets.includes('x86_64-pc-windows-msvc'));
  assert.ok(cfg.windows.targets.includes('aarch64-pc-windows-msvc'));
  assert.deepEqual(cfg.windows.installerFormats, ['nsis', 'msi']);
  assert.ok(cfg.android.targets.includes('aarch64-linux-android'));
  assert.ok(cfg.android.targets.includes('armv7-linux-androideabi'));
  assert.deepEqual(cfg.android.packageFormats, ['apk', 'aab']);
  assert.equal(cfg.android.stylusLowLatency, true);
});

test('buildRustEngineWasmBinary and createRustEngineWasmRuntime compile and execute Wasm drawing engine kernels', async () => {
  const { buildRustEngineWasmBinary, createRustEngineWasmRuntime } = await import('./rustEngineWasm');

  const wasmBytes = buildRustEngineWasmBinary();
  assert.ok(wasmBytes.byteLength > 200, 'Expected non-empty Wasm binary');
  assert.equal(WebAssembly.validate(wasmBytes as BufferSource), true, 'Expected valid WebAssembly module bytes');

  const runtime = createRustEngineWasmRuntime();
  assert.equal(runtime.isWasmReady, true);
  assert.equal(runtime.versionCode, 606000);

  // 1. Test Wasm smudge step planner
  const steps = runtime.planSmudgeSteps(120, 90, 24, 0.08);
  assert.ok(steps >= 68, `Expected dense sub-2.2px steps from Wasm, got ${steps}`);

  // 2. Test Wasm stroke coordinate stabilization
  const smoothed = runtime.stabilizeCoord(100, 200, 0.5);
  assert.ok(Math.abs(smoothed - 150) < 1e-6);

  // 3. Test Wasm linear-memory smudge RGBA blending across transparent gap
  const dst = new Uint8ClampedArray([
    0, 0, 0, 0,       // pixel 0: transparent gap
    20, 40, 200, 255, // pixel 1: blue paint
  ]);
  const carrier = new Uint8ClampedArray([
    240, 80, 40, 255, // pixel 0 carrier: warm orange
    240, 80, 40, 255, // pixel 1 carrier: warm orange
  ]);
  const weights = new Float32Array([1.0, 0.75]);

  const changed = runtime.blendSmudgeDabInMemory(dst, carrier, weights, 0.65, 0.5, true);
  assert.equal(changed, true, 'Expected Wasm smudge kernel to report pixel changes');
  assert.ok(dst[3] > 140, `Expected transparent gap pixel to receive pigment in Wasm, got alpha=${dst[3]}`);
  assert.ok(carrier[3] >= 190, `Expected carrier to retain pigment across gap in Wasm, got alpha=${carrier[3]}`);

  // 4. Test Wasm linear-memory pressure ribbon tessellation
  const env = runtime.tessellateStrokeEnvelope([
    { x: 100, y: 100, r: 6 },
    { x: 150, y: 120, r: 10 },
    { x: 210, y: 110, r: 4 },
  ]);
  assert.equal(env.vertexCount, 24);
  assert.equal(env.leftRightCoords.length, 12);
  assert.ok(env.svgPath.startsWith('M ') && env.svgPath.endsWith(' Z'));
});
