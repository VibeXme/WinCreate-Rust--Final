//! WinCreate 6.6.0 — Pure Rust Drawing, Vector Tessellation, Wet-Mix Smudge & Pixel Engine
//!
//! This module implements the core drawing engine in Rust for both native Tauri targets
//! (Windows x86_64/ARM64 via Direct3D11/WebView2 and Android ARM64/ARMv7 via Vulkan/GLES3)
//! and WebAssembly (`wasm32-unknown-unknown`) via C-ABI linear-memory exports.

use serde::{Deserialize, Serialize};

pub const ENGINE_VERSION_CODE: u32 = 606_000;
pub const ENGINE_VERSION_STR: &str = "6.6.0-rust";

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrokePoint {
    pub x: f64,
    pub y: f64,
    pub r: f64,
    pub pressure: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmudgeStepPlan {
    pub distance: f64,
    pub steps: usize,
    pub step_size_px: f64,
    pub effective_spacing: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TessellatedStrokeEnvelope {
    pub vertex_count: usize,
    pub triangle_count: usize,
    pub bounds: [f64; 4],
    pub svg_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustEngineDiagnostics {
    pub version: &'static str,
    pub version_code: u32,
    pub backend: &'static str,
    pub simd_accelerated: bool,
    pub zero_gap_smudge: bool,
    pub vector_ribbon_tessellator: bool,
    pub linear_memory_kb: usize,
    pub platform: &'static str,
}

/// Computes a dense, sub-2.2px step plan for wet-mix smudge strokes so fast stylus
/// movements never leave unpainted gaps or stepping artifacts.
#[inline]
pub fn plan_smudge_steps(dx: f64, dy: f64, radius: f64, spacing_ratio: f64) -> SmudgeStepPlan {
    let dist = (dx * dx + dy * dy).sqrt();
    if !dist.is_finite() || dist < 0.05 {
        return SmudgeStepPlan {
            distance: 0.0,
            steps: 1,
            step_size_px: 0.0,
            effective_spacing: 0.35,
        };
    }
    let safe_r = radius.clamp(0.5, 800.0);
    let safe_ratio = spacing_ratio.clamp(0.02, 0.25);
    let raw_spacing = (safe_r * safe_ratio).min(safe_r * 0.11);
    let effective_spacing = raw_spacing.clamp(0.35, 2.2);
    let steps = (dist / effective_spacing).ceil() as usize;
    let clamped_steps = steps.clamp(1, 4096);
    SmudgeStepPlan {
        distance: dist,
        steps: clamped_steps,
        step_size_px: dist / (clamped_steps as f64),
        effective_spacing,
    }
}

/// Stabilizes a raw stylus sample using velocity-aware exponential smoothing.
#[inline]
pub fn stabilize_stroke_point(
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
    let stream = (streamline_pct / 100.0).clamp(0.0, 0.92);
    let base_follow = 1.0 - stream * 0.78;
    let speed_factor = (speed / 2.0).clamp(0.0, 1.0);
    let fast_atten = 1.0 - (fast_strength_pct / 100.0).clamp(0.0, 1.0) * speed_factor * 0.65;
    let alpha = (base_follow * fast_atten).clamp(0.12, 1.0);

    let x = prev_x + (raw_x - prev_x) * alpha;
    let y = prev_y + (raw_y - prev_y) * alpha;
    let gamma = pressure_gamma.clamp(0.2, 3.0);
    let adj_pressure = pressure.clamp(0.01, 1.0).powf(gamma);

    StrokePoint {
        x,
        y,
        r: 1.0,
        pressure: adj_pressure,
    }
}

/// Applies Chaikin corner-cutting subdivision and start/end tapering to a stroke.
pub fn chaikin_subdivide_stroke(
    points: &[StrokePoint],
    passes: usize,
    taper_start_pct: f64,
    taper_end_pct: f64,
) -> Vec<StrokePoint> {
    if points.is_empty() {
        return Vec::new();
    }
    let mut current = points.to_vec();
    let pass_count = passes.min(3);
    if current.len() > 4 && pass_count > 0 {
        let first = current[0];
        let last = *current.last().unwrap_or(&first);
        for _ in 0..pass_count {
            let mut next = Vec::with_capacity(current.len());
            next.push(first);
            for i in 1..(current.len() - 1) {
                let p_prev = current[i - 1];
                let p_curr = current[i];
                let p_next = current[i + 1];
                next.push(StrokePoint {
                    x: (p_prev.x + p_curr.x * 2.0 + p_next.x) * 0.25,
                    y: (p_prev.y + p_curr.y * 2.0 + p_next.y) * 0.25,
                    r: (p_prev.r + p_curr.r * 2.0 + p_next.r) * 0.25,
                    pressure: (p_prev.pressure + p_curr.pressure * 2.0 + p_next.pressure) * 0.25,
                });
            }
            next.push(last);
            current = next;
        }
    }

    let n = current.len();
    let ts = (taper_start_pct / 100.0).clamp(0.0, 1.0);
    let te = (taper_end_pct / 100.0).clamp(0.0, 1.0);
    if (ts > 0.0 || te > 0.0) && n > 1 {
        let nf = n as f64;
        for (i, pt) in current.iter_mut().enumerate() {
            let idx = i as f64;
            let start_f = if ts > 0.0 {
                ((idx + 1.0) / (nf * 0.25 * ts).max(1.0)).min(1.0)
            } else {
                1.0
            };
            let end_f = if te > 0.0 {
                (((nf - idx) / (nf * 0.25 * te).max(1.0))).min(1.0)
            } else {
                1.0
            };
            let factor = start_f.min(end_f);
            pt.r = (pt.r * factor).max(0.125);
        }
    }

    current
}

/// Snaps a stroke point to 2D orthogonal grid, 30-degree isometric axes, or vanishing-point rays.
pub fn snap_drawing_assist(
    mode: &str,
    start_x: f64,
    start_y: f64,
    x: f64,
    y: f64,
    vp1_x: f64,
    vp1_y: f64,
    vp2_x: f64,
    vp2_y: f64,
) -> (f64, f64) {
    let dx = x - start_x;
    let dy = y - start_y;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist < 1e-4 {
        return (x, y);
    }

    match mode {
        "grid2d" => {
            if dx.abs() >= dy.abs() {
                (x, start_y)
            } else {
                (start_x, y)
            }
        }
        "isometric" => {
            let angles = [
                std::f64::consts::PI / 6.0,
                5.0 * std::f64::consts::PI / 6.0,
                std::f64::consts::FRAC_PI_2,
            ];
            let mut best_x = x;
            let mut best_y = y;
            let mut best_err = f64::INFINITY;
            for a in angles {
                let ux = a.cos();
                let uy = a.sin();
                let proj = dx * ux + dy * uy;
                let px = start_x + ux * proj;
                let py = start_y + uy * proj;
                let err = (x - px).hypot(y - py);
                if err < best_err {
                    best_err = err;
                    best_x = px;
                    best_y = py;
                }
            }
            (best_x, best_y)
        }
        "perspective2p" | "perspective1p" => {
            let vps = if mode == "perspective2p" {
                vec![(vp1_x, vp1_y), (vp2_x, vp2_y), (start_x, start_y - 1000.0)]
            } else {
                vec![(vp1_x, vp1_y)]
            };
            let mut best_x = x;
            let mut best_y = y;
            let mut best_err = f64::INFINITY;
            for (vx, vy) in vps {
                let rx = vx - start_x;
                let ry = vy - start_y;
                let rlen = rx.hypot(ry);
                if rlen < 1.0 {
                    continue;
                }
                let ux = rx / rlen;
                let uy = ry / rlen;
                let proj = dx * ux + dy * uy;
                let px = start_x + ux * proj;
                let py = start_y + uy * proj;
                let err = (x - px).hypot(y - py);
                if err < best_err {
                    best_err = err;
                    best_x = px;
                    best_y = py;
                }
            }
            (best_x, best_y)
        }
        _ => (x, y),
    }
}

/// Tessellates a pressure-sensitive stroke into a continuous tangent-envelope SVG path
/// and triangle strip metrics in O(N) time without redundant per-sample SVG circle arcs.
pub fn tessellate_pressure_stroke(points: &[StrokePoint]) -> TessellatedStrokeEnvelope {
    if points.is_empty() {
        return TessellatedStrokeEnvelope {
            vertex_count: 0,
            triangle_count: 0,
            bounds: [0.0, 0.0, 0.0, 0.0],
            svg_path: String::new(),
        };
    }

    let n = points.len();
    if n == 1 {
        let p = points[0];
        let r = p.r.max(0.25);
        let svg_path = format!(
            "M {:.2} {:.2} A {:.2} {:.2} 0 1 0 {:.2} {:.2} A {:.2} {:.2} 0 1 0 {:.2} {:.2} Z",
            p.x + r,
            p.y,
            r,
            r,
            p.x - r,
            p.y,
            r,
            r,
            p.x + r,
            p.y
        );
        return TessellatedStrokeEnvelope {
            vertex_count: 16,
            triangle_count: 14,
            bounds: [p.x - r, p.y - r, p.x + r, p.y + r],
            svg_path,
        };
    }

    let mut left_pts = Vec::with_capacity(n);
    let mut right_pts = Vec::with_capacity(n);
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for i in 0..n {
        let curr = points[i];
        let prev = if i > 0 { points[i - 1] } else { points[0] };
        let next = if i + 1 < n { points[i + 1] } else { points[n - 1] };
        let tx = next.x - prev.x;
        let ty = next.y - prev.y;
        let len = tx.hypot(ty);
        let (nx, ny) = if len > 1e-5 {
            (-ty / len, tx / len)
        } else {
            (0.0, 1.0)
        };
        let r = curr.r.max(0.25);
        min_x = min_x.min(curr.x - r);
        min_y = min_y.min(curr.y - r);
        max_x = max_x.max(curr.x + r);
        max_y = max_y.max(curr.y + r);

        left_pts.push((curr.x + nx * r, curr.y + ny * r));
        right_pts.push((curr.x - nx * r, curr.y - ny * r));
    }

    let mut path = String::with_capacity(n * 36 + 64);
    let first = points[0];
    let last = points[n - 1];
    let r0 = first.r.max(0.25);
    let rn = last.r.max(0.25);

    path.push_str(&format!("M {:.2} {:.2}", left_pts[0].0, left_pts[0].1));
    for &(lx, ly) in &left_pts[1..] {
        path.push_str(&format!(" L {:.2} {:.2}", lx, ly));
    }
    path.push_str(&format!(
        " A {:.2} {:.2} 0 0 1 {:.2} {:.2}",
        rn,
        rn,
        right_pts[n - 1].0,
        right_pts[n - 1].1
    ));
    for &(rx, ry) in right_pts[..n - 1].iter().rev() {
        path.push_str(&format!(" L {:.2} {:.2}", rx, ry));
    }
    path.push_str(&format!(
        " A {:.2} {:.2} 0 0 1 {:.2} {:.2} Z",
        r0, r0, left_pts[0].0, left_pts[0].1
    ));

    let vertex_count = n * 8;
    let triangle_count = (n - 1) * 8 + 8;

    TessellatedStrokeEnvelope {
        vertex_count,
        triangle_count,
        bounds: [min_x, min_y, max_x, max_y],
        svg_path: path,
    }
}

/// Wet-mix smudge RGBA dab kernel in Rust.
/// Blends pigment between the canvas tile and brush carrier buffer while preserving
/// carrier pigment across transparent gaps (minimum 0.22 pickup floor over transparent pixels).
pub fn blend_smudge_dab_rgba(
    dst_rgba: &mut [u8],
    carrier_rgba: &mut [u8],
    weights: &[f32],
    strength: f32,
    pickup_rate: f32,
    preserve_coverage: bool,
) -> bool {
    let pixel_count = weights
        .len()
        .min(dst_rgba.len() / 4)
        .min(carrier_rgba.len() / 4);
    let mut changed = false;

    for p in 0..pixel_count {
        let weight = weights[p];
        if weight <= 0.0 {
            continue;
        }
        let idx = p * 4;
        let a = dst_rgba[idx + 3] as f32;
        let ca = carrier_rgba[idx + 3] as f32;
        if a == 0.0 && ca == 0.0 {
            continue;
        }

        let w = (weight * strength).clamp(0.0, 1.0);
        let dr = dst_rgba[idx] as f32;
        let dg = dst_rgba[idx + 1] as f32;
        let db = dst_rgba[idx + 2] as f32;
        let cr = carrier_rgba[idx] as f32;
        let cg = carrier_rgba[idx + 1] as f32;
        let cb = carrier_rgba[idx + 2] as f32;

        if a >= 254.5 && ca >= 254.5 {
            let nr = (dr + (cr - dr) * w + 0.5) as u8;
            let ng = (dg + (cg - dg) * w + 0.5) as u8;
            let nb = (db + (cb - db) * w + 0.5) as u8;
            if nr != dst_rgba[idx] || ng != dst_rgba[idx + 1] || nb != dst_rgba[idx + 2] {
                dst_rgba[idx] = nr;
                dst_rgba[idx + 1] = ng;
                dst_rgba[idx + 2] = nb;
                changed = true;
            }
            let ex = (pickup_rate * weight).clamp(0.0, 1.0);
            carrier_rgba[idx] = (cr + (dr - cr) * ex + 0.5) as u8;
            carrier_rgba[idx + 1] = (cg + (dg - cg) * ex + 0.5) as u8;
            carrier_rgba[idx + 2] = (cb + (db - cb) * ex + 0.5) as u8;
            continue;
        }

        let inv = 1.0 - w;
        let mass = a * inv + ca * w;
        let (nr, ng, nb) = if mass > 0.001 {
            let inv_mass = 1.0 / mass;
            (
                ((dr * a * inv + cr * ca * w) * inv_mass + 0.5).clamp(0.0, 255.0) as u8,
                ((dg * a * inv + cg * ca * w) * inv_mass + 0.5).clamp(0.0, 255.0) as u8,
                ((db * a * inv + cb * ca * w) * inv_mass + 0.5).clamp(0.0, 255.0) as u8,
            )
        } else {
            (0, 0, 0)
        };

        let mut out_a = mass;
        if out_a < a && a > 0.0 {
            out_a = if preserve_coverage {
                a
            } else {
                let norm_a = a / 255.0;
                out_a + (a - out_a) * norm_a * norm_a
            };
        }
        let na = (out_a + 0.5).clamp(0.0, 255.0) as u8;

        if na != dst_rgba[idx + 3]
            || ((dst_rgba[idx + 3] > 0 || na > 0)
                && (nr != dst_rgba[idx] || ng != dst_rgba[idx + 1] || nb != dst_rgba[idx + 2]))
        {
            changed = true;
        }
        dst_rgba[idx] = nr;
        dst_rgba[idx + 1] = ng;
        dst_rgba[idx + 2] = nb;
        dst_rgba[idx + 3] = na;

        // Retain carrier pigment across transparent gaps (minimum 0.22 pickup scale)
        let pickup_scale = if a < ca { (a / 255.0).max(0.22) } else { 1.0 };
        let exchange = (pickup_rate * weight * pickup_scale).clamp(0.0, 1.0);
        let remain = 1.0 - exchange;
        let new_mass = ca * remain + a * exchange;
        if new_mass > 0.001 {
            let inv_new = 1.0 / new_mass;
            carrier_rgba[idx] =
                ((cr * ca * remain + dr * a * exchange) * inv_new + 0.5).clamp(0.0, 255.0) as u8;
            carrier_rgba[idx + 1] =
                ((cg * ca * remain + dg * a * exchange) * inv_new + 0.5).clamp(0.0, 255.0) as u8;
            carrier_rgba[idx + 2] =
                ((cb * ca * remain + db * a * exchange) * inv_new + 0.5).clamp(0.0, 255.0) as u8;
        } else {
            carrier_rgba[idx] = 0;
            carrier_rgba[idx + 1] = 0;
            carrier_rgba[idx + 2] = 0;
        }
        carrier_rgba[idx + 3] = (new_mass + 0.5).clamp(0.0, 255.0) as u8;
    }

    changed
}

// =============================================================================
// C-ABI / WebAssembly (`wasm32-unknown-unknown`) Exports
// =============================================================================

#[no_mangle]
pub extern "C" fn wc_rust_engine_version() -> i32 {
    ENGINE_VERSION_CODE as i32
}

#[no_mangle]
pub extern "C" fn wc_rust_plan_smudge_steps(dx: f64, dy: f64, radius: f64, spacing: f64) -> i32 {
    plan_smudge_steps(dx, dy, radius, spacing).steps as i32
}

#[no_mangle]
pub extern "C" fn wc_rust_stabilize_coord(prev: f64, raw: f64, alpha: f64) -> f64 {
    let a = alpha.clamp(0.05, 1.0);
    prev + (raw - prev) * a
}
