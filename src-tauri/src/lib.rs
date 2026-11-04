use serde::Serialize;
use std::env;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub mod engine;
use engine::{
    plan_smudge_steps, snap_drawing_assist, stabilize_stroke_point, tessellate_pressure_stroke,
    RustEngineDiagnostics, SmudgeStepPlan, StrokePoint, TessellatedStrokeEnvelope,
    ENGINE_VERSION_CODE, ENGINE_VERSION_STR,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineProfile {
    Performance,
    Battery,
    Compatibility,
}

impl EngineProfile {
    pub fn from_args<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        for arg in args {
            let s = arg.as_ref();
            if let Some(val) = s.strip_prefix("--wincreate-engine=") {
                return match val.trim().to_ascii_lowercase().as_str() {
                    "battery" => Self::Battery,
                    "compatibility" => Self::Compatibility,
                    _ => Self::Performance,
                };
            }
        }
        Self::Performance
    }

    pub fn background_rendering(self) -> bool {
        matches!(self, Self::Performance)
    }

    pub fn webview_gpu_args(self) -> &'static str {
        match self {
            Self::Performance => {
                "--ignore-gpu-blocklist \
                 --enable-gpu-rasterization \
                 --enable-zero-copy \
                 --enable-accelerated-2d-canvas \
                 --force-high-performance-gpu \
                 --disable-renderer-backgrounding \
                 --disable-background-timer-throttling"
            }
            Self::Battery => "--force-low-power-gpu",
            Self::Compatibility => "--disable-gpu-rasterization",
        }
    }
}

pub fn configure_native_gpu_environment(engine: EngineProfile) {
    // Configure native WebView2 (Windows) / WebKitGTK (Linux) hardware acceleration
    if env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            engine.webview_gpu_args(),
        );
    }
    if matches!(engine, EngineProfile::Performance) {
        if env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            env::set_var("WEBKIT_FORCE_ACCELERATED_COMPOSITING", "1");
        }
        // Prefer discrete GPU on Mesa/Vulkan/DRI systems (Linux)
        if env::var_os("DRI_PRIME").is_none() {
            env::set_var("DRI_PRIME", "1");
        }
        if env::var_os("__NV_PRIME_RENDER_OFFLOAD").is_none() {
            env::set_var("__NV_PRIME_RENDER_OFFLOAD", "1");
            env::set_var("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
        }
    }
}

pub fn desktop_platform_id() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        env::consts::OS
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct RustVectorNode {
    pub x: f64,
    pub y: f64,
    pub r: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RustVectorStressReport {
    pub stroke_count: usize,
    pub points_per_stroke: usize,
    pub total_points: usize,
    pub total_vertices: usize,
    pub avg_frame_time_ms: f64,
    pub min_frame_time_ms: f64,
    pub max_frame_time_ms: f64,
    pub p95_frame_time_ms: f64,
    pub effective_fps: u32,
    pub platform: &'static str,
}

pub fn execute_rust_vector_stress_test(
    stroke_count: usize,
    points_per_stroke: usize,
) -> RustVectorStressReport {
    let strokes = stroke_count.clamp(1, 256);
    let pts_per_stroke = points_per_stroke.clamp(8, 2048);
    let frames = 12usize;
    let mut frame_times = Vec::with_capacity(frames);
    let mut total_vertices = 0usize;

    for frame_idx in 0..frames {
        let start = std::time::Instant::now();
        let mut frame_verts = 0usize;
        for s in 0..strokes {
            let phase = ((s + frame_idx) as f64 / strokes as f64) * std::f64::consts::TAU;
            let freq_x = (3 + (s % 5)) as f64;
            let freq_y = (2 + ((s * 2) % 7)) as f64;
            let base_r = 3.0 + (s % 9) as f64 * 1.75;
            let mut prev = RustVectorNode {
                x: 960.0,
                y: 540.0,
                r: base_r,
            };
            for i in 0..pts_per_stroke {
                let t = i as f64 / (pts_per_stroke - 1) as f64;
                let theta = t * std::f64::consts::TAU;
                let harmonic = 0.82 + 0.18 * (theta * 6.0 + phase).sin();
                let x = 960.0 + (theta * freq_x + phase).cos() * 729.6 * harmonic;
                let y = 540.0 + (theta * freq_y + phase * 1.3).sin() * 410.4 * harmonic;
                let pressure = 0.2
                    + 0.8
                        * (t * std::f64::consts::PI).sin().powf(0.85)
                        * (0.75 + 0.25 * (theta * 8.0 + s as f64).cos());
                let r = (base_r * pressure).max(0.5);
                if i > 0 {
                    let dx = x - prev.x;
                    let dy = y - prev.y;
                    let len = (dx * dx + dy * dy).sqrt();
                    if len > (prev.r - r).abs() + 1e-6 {
                        frame_verts += 8;
                    } else {
                        frame_verts += 4;
                    }
                } else {
                    frame_verts += 4;
                }
                prev = RustVectorNode { x, y, r };
            }
        }
        total_vertices = frame_verts;
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
        frame_times.push(elapsed_ms.max(0.05));
    }

    let sum: f64 = frame_times.iter().sum();
    let avg = sum / frame_times.len() as f64;
    frame_times.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let min_ms = frame_times[0];
    let max_ms = *frame_times.last().unwrap_or(&avg);
    let p95_idx = ((frame_times.len() as f64 * 0.95).floor() as usize)
        .min(frame_times.len().saturating_sub(1));
    let p95_ms = frame_times[p95_idx];
    let fps = (1000.0 / avg.max(0.2)).round().clamp(1.0, 360.0) as u32;

    RustVectorStressReport {
        stroke_count: strokes,
        points_per_stroke: pts_per_stroke,
        total_points: strokes * pts_per_stroke,
        total_vertices,
        avg_frame_time_ms: (avg * 100.0).round() / 100.0,
        min_frame_time_ms: (min_ms * 100.0).round() / 100.0,
        max_frame_time_ms: (max_ms * 100.0).round() / 100.0,
        p95_frame_time_ms: (p95_ms * 100.0).round() / 100.0,
        effective_fps: fps,
        platform: desktop_platform_id(),
    }
}

pub fn preload_initialization_script(engine: EngineProfile) -> String {
    let platform = desktop_platform_id();
    let engine_name = match engine {
        EngineProfile::Performance => "performance",
        EngineProfile::Battery => "battery",
        EngineProfile::Compatibility => "compatibility",
    };
    let is_perf = matches!(engine, EngineProfile::Performance);
    format!(
        r#"(() => {{
  'use strict';
  if (!window.WinCreateDesktop) {{
    Object.defineProperty(window, 'WinCreateDesktop', {{
      value: Object.freeze({{
        platform: '{platform}',
        version: '6.6.0',
        engine: '{engine_name}',
        runtime: 'rust-tauri',
        targets: Object.freeze(['windows-x86_64-msvc', 'windows-aarch64-msvc', 'android-arm64-v8a', 'android-armeabi-v7a']),
        dedicatedGpuForced: {is_perf}
      }}),
      writable: false,
      configurable: false,
      enumerable: true
    }});
  }}
  if ('{platform}' === 'android' && !window.WinCreateAndroid) {{
    Object.defineProperty(window, 'WinCreateAndroid', {{
      value: Object.freeze({{
        platform: 'android',
        runtime: 'rust-tauri-mobile',
        getSafeAreaInsets: () => JSON.stringify({{ top: 24, right: 0, bottom: 16, left: 0 }}),
        setImmersiveMode: () => true
      }}),
      writable: false,
      configurable: false,
      enumerable: true
    }});
  }}
}})();"#
    )
}

pub fn is_allowed_navigation(url_str: &str) -> bool {
    url_str.starts_with("tauri://")
        || url_str.starts_with("https://tauri.localhost")
        || url_str.starts_with("http://tauri.localhost")
        || url_str.starts_with("http://localhost:3000")
        || url_str.starts_with("http://127.0.0.1:8765")
        || url_str == "about:blank"
}

#[tauri::command]
fn get_desktop_info() -> serde_json::Value {
    let engine = EngineProfile::from_args(env::args());
    serde_json::json!({
        "platform": desktop_platform_id(),
        "version": "6.6.0",
        "engine": engine,
        "backgroundRendering": engine.background_rendering(),
        "webviewGpuArgs": engine.webview_gpu_args(),
        "runtime": "rust",
        "supportedTargets": {
            "windows": ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"],
            "android": ["aarch64-linux-android", "armv7-linux-androideabi", "x86_64-linux-android"]
        }
    })
}

#[tauri::command]
fn run_vector_stress_test(
    stroke_count: Option<usize>,
    points_per_stroke: Option<usize>,
) -> RustVectorStressReport {
    execute_rust_vector_stress_test(
        stroke_count.unwrap_or(24),
        points_per_stroke.unwrap_or(180),
    )
}

#[tauri::command]
fn get_rust_engine_status() -> RustEngineDiagnostics {
    RustEngineDiagnostics {
        version: ENGINE_VERSION_STR,
        version_code: ENGINE_VERSION_CODE,
        backend: "rust-native-wasm-hybrid",
        simd_accelerated: true,
        zero_gap_smudge: true,
        vector_ribbon_tessellator: true,
        linear_memory_kb: 4096,
        platform: desktop_platform_id(),
    }
}

#[tauri::command]
fn rust_plan_smudge_steps(dx: f64, dy: f64, radius: f64, spacing_ratio: f64) -> SmudgeStepPlan {
    plan_smudge_steps(dx, dy, radius, spacing_ratio)
}

#[tauri::command]
fn rust_tessellate_vector_stroke(points: Vec<StrokePoint>) -> TessellatedStrokeEnvelope {
    tessellate_pressure_stroke(&points)
}

#[tauri::command]
fn rust_stabilize_point(
    prev_x: f64,
    prev_y: f64,
    raw_x: f64,
    raw_y: f64,
    pressure: f64,
    speed: f64,
    streamline_pct: f64,
    fast_strength_pct: f64,
    pressure_gamma: f64,
) -> StrokePoint {
    stabilize_stroke_point(
        prev_x,
        prev_y,
        raw_x,
        raw_y,
        pressure,
        speed,
        streamline_pct,
        fast_strength_pct,
        pressure_gamma,
    )
}

#[tauri::command]
fn rust_snap_assist_point(
    mode: String,
    start_x: f64,
    start_y: f64,
    x: f64,
    y: f64,
    vp1_x: f64,
    vp1_y: f64,
    vp2_x: f64,
    vp2_y: f64,
) -> (f64, f64) {
    snap_drawing_assist(
        &mode, start_x, start_y, x, y, vp1_x, vp1_y, vp2_x, vp2_y,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = EngineProfile::from_args(env::args());
    configure_native_gpu_environment(engine);
    let init_script = preload_initialization_script(engine);

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_desktop_info,
            run_vector_stress_test,
            get_rust_engine_status,
            rust_plan_smudge_steps,
            rust_tessellate_vector_stroke,
            rust_stabilize_point,
            rust_snap_assist_point
        ])
        .setup(move |app| {
            if let Some(existing) = app.get_webview_window("main") {
                let _ = existing.eval(&init_script);
            } else {
                let builder =
                    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                        .initialization_script(&init_script)
                        .on_navigation(|url| is_allowed_navigation(url.as_str()));

                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                let builder = builder
                    .title("WinCreate 6.6.0 — Rust Studio (Windows & Android)")
                    .inner_size(1440.0, 900.0)
                    .min_inner_size(900.0, 620.0)
                    .additional_browser_args(engine.webview_gpu_args());

                builder.build()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WinCreate Studio Rust application");
}
