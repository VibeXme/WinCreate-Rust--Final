//! `.winc` project files (`WINCREATE_PROJECT_V1` JSON), compatible with WinCreate 6.x.
//!
//! Older projects may contain editable vector strokes, shapes and vector erasures;
//! these are rasterised into their layer on import.

use crate::brush::{self, CoverageMask, InputPoint, StrokeMode, StrokeParams, Symmetry, Tip};
use crate::color::{parse_hex, to_hex, BlendMode};
use crate::document::{Animation, Document, Frame, Layer};
use crate::tiled::{IRect, Tiled};
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const MAGIC: &str = "WINCREATE_PROJECT_V1";
pub const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;
pub const MAX_EDGE: usize = 16384;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrushHistoryEntry {
    pub brush_id: String,
    pub brush_name: String,
    pub color: String,
    pub size: f32,
    pub opacity: f32,
    pub stream: f32,
    pub taper: f32,
}

// ------------------------------------------------------------------ PNG helpers

pub fn encode_png(flat: &[u8], w: usize, h: usize) -> Result<Vec<u8>> {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    use image::ImageEncoder;
    let mut out = Vec::new();
    PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::Adaptive)
        .write_image(flat, w as u32, h as u32, image::ExtendedColorType::Rgba8)?;
    Ok(out)
}

pub fn png_data_url(flat: &[u8], w: usize, h: usize) -> Result<String> {
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(encode_png(flat, w, h)?)
    ))
}

pub fn decode_image_bytes(bytes: &[u8]) -> Result<(Vec<u8>, usize, usize)> {
    let img = image::load_from_memory(bytes).context("unsupported or damaged image")?;
    let (w, h) = (img.width() as usize, img.height() as usize);
    if w == 0 || h == 0 || w > MAX_EDGE || h > MAX_EDGE {
        bail!("image dimensions out of range ({w}x{h})");
    }
    Ok((img.into_rgba8().into_raw(), w, h))
}

fn decode_data_url(s: &str) -> Result<(Vec<u8>, usize, usize)> {
    let comma = s.find(',').ok_or_else(|| anyhow!("invalid image data"))?;
    if !s[..comma].contains(";base64") {
        bail!("invalid image encoding");
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(s[comma + 1..].trim())
        .context("invalid base64 image")?;
    decode_image_bytes(&bytes)
}

// ------------------------------------------------------------------ save

fn layer_json(l: &Layer, w: usize, h: usize) -> Result<Value> {
    let mut v = json!({
        "id": format!("layer_{}", l.id),
        "name": l.name,
        "isFolder": false,
        "visible": l.visible,
        "opacity": (l.opacity * 100.0).round(),
        "blend": l.blend.css(),
        "parentId": Value::Null,
        "alphaLock": l.alpha_lock,
        "clipMask": l.clip,
        "layerMask": Value::Null,
        "vectorStrokes": [],
        "pngData": png_data_url(&l.pixels.to_flat(), w, h)?,
        "locked": l.locked,
    });
    if let Some(m) = &l.mask {
        v["wcMask"] = json!(png_data_url(&m.to_flat(), w, h)?);
        v["wcMaskEnabled"] = json!(l.mask_enabled);
    }
    Ok(v)
}

fn layers_json(ls: &[Layer], w: usize, h: usize) -> Result<Vec<Value>> {
    ls.iter().map(|l| layer_json(l, w, h)).collect()
}

pub fn serialize(doc: &mut Document) -> Result<String> {
    doc.sync_frame();
    let (w, h) = (doc.w, doc.h);
    let mut root = json!({
        "magic": MAGIC,
        "documentType": if doc.anim.is_some() { "animation" } else { "drawing" },
        "title": doc.title,
        "width": w,
        "height": h,
        "bgColor": to_hex(doc.bg),
        "bgVisible": doc.bg_visible,
        "artworkBrushHistory": doc.brush_history,
        "layers": layers_json(&doc.layers, w, h)?,
        "activeLayerIndex": doc.active,
        "app": "WinCreate Studio (Rust)",
        "appVersion": env!("CARGO_PKG_VERSION"),
    });
    if let Some(a) = &doc.anim {
        let active_id = doc
            .layers
            .get(doc.active)
            .map(|l| format!("layer_{}", l.id));
        let mut frames = Vec::new();
        for (i, f) in a.frames.iter().enumerate() {
            frames.push(json!({
                "id": format!("frame_{i}"),
                "celId": Value::Null,
                "label": f.label,
                "group": "",
                "hold": f.hold.max(1),
                "key": Value::Null,
                "snap": {
                    "type": "full", "WIDTH": w, "HEIGHT": h, "activeLayerId": active_id,
                    "bgColor": to_hex(doc.bg), "bgVisible": doc.bg_visible,
                    "layers": layers_json(&f.layers, w, h)?,
                }
            }));
        }
        root["animation"] = json!({
            "version": 1, "frames": frames, "fps": a.fps, "loop": a.looping, "index": a.current,
            "shared": [], "motion": Value::Null, "audio": Value::Null, "audioOffset": 0,
            "audioMuted": false, "audioLoop": false,
            "onion": a.onion, "onionAlpha": a.onion_alpha,
        });
    }
    Ok(serde_json::to_string(&root)?)
}

pub fn save_file(doc: &mut Document, path: &std::path::Path) -> Result<()> {
    let data = serialize(doc)?;
    let tmp = path.with_extension("winc.tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

// ------------------------------------------------------------------ load

fn num(v: &Value, key: &str, default: f64) -> f64 {
    v.get(key)
        .and_then(|x| x.as_f64())
        .filter(|x| x.is_finite())
        .unwrap_or(default)
}

fn id_key(v: &Value) -> String {
    match v.get("id") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

struct LayerCtx<'a> {
    w: usize,
    h: usize,
    folders: &'a [(String, bool, f32)],
}

fn parse_layers(arr: &[Value], doc: &mut Document) -> Result<Vec<Layer>> {
    if arr.is_empty() || arr.len() > 512 {
        bail!("Project rejected: layer count");
    }
    let folders: Vec<(String, bool, f32)> = arr
        .iter()
        .filter(|l| l.get("isFolder").and_then(|v| v.as_bool()) == Some(true))
        .map(|l| {
            (
                id_key(l),
                l.get("visible").and_then(|v| v.as_bool()) != Some(false),
                (num(l, "opacity", 100.0) / 100.0) as f32,
            )
        })
        .collect();
    let ctx = LayerCtx {
        w: doc.w,
        h: doc.h,
        folders: &folders,
    };
    let mut out = Vec::new();
    for l in arr {
        if l.get("isFolder").and_then(|v| v.as_bool()) == Some(true) {
            continue;
        }
        let id = doc.alloc_id();
        out.push(parse_layer(l, id, &ctx)?);
    }
    if out.is_empty() {
        let id = doc.alloc_id();
        out.push(Layer::new(id, "Layer 1", doc.w, doc.h));
    }
    Ok(out)
}

fn image_to_tiled(flat: Vec<u8>, iw: usize, ih: usize, w: usize, h: usize) -> Tiled {
    if iw == w && ih == h {
        Tiled::from_flat(w, h, &flat)
    } else {
        Tiled::from_flat(w, h, &crate::adjust::resample(&flat, iw, ih, w, h))
    }
}

fn parse_layer(l: &Value, id: u64, ctx: &LayerCtx) -> Result<Layer> {
    let (w, h) = (ctx.w, ctx.h);
    let mut layer = Layer::new(
        id,
        l.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Layer")
            .chars()
            .take(200)
            .collect::<String>(),
        w,
        h,
    );
    layer.visible = l.get("visible").and_then(|v| v.as_bool()) != Some(false);
    layer.opacity = (num(l, "opacity", 100.0).clamp(0.0, 100.0) / 100.0) as f32;
    layer.blend = BlendMode::from_css(l.get("blend").and_then(|v| v.as_str()).unwrap_or("normal"));
    layer.alpha_lock = l.get("alphaLock").and_then(|v| v.as_bool()) == Some(true);
    layer.clip = l.get("clipMask").and_then(|v| v.as_bool()) == Some(true);
    layer.locked = l.get("locked").and_then(|v| v.as_bool()) == Some(true);
    if let Some(parent) = l.get("parentId").filter(|v| !v.is_null()) {
        let pid = match parent {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        if let Some((_, vis, op)) = ctx.folders.iter().find(|f| f.0 == pid) {
            layer.visible &= *vis;
            layer.opacity *= *op;
        }
    }
    if let Some(png) = l.get("pngData").and_then(|v| v.as_str()) {
        let (flat, iw, ih) = decode_data_url(png).context("Project rejected: invalid layer PNG")?;
        layer.pixels = image_to_tiled(flat, iw, ih, w, h);
    }
    if let Some(strokes) = l.get("vectorStrokes").and_then(|v| v.as_array()) {
        for st in strokes.iter().take(100_000) {
            render_legacy_stroke(&mut layer.pixels, st);
        }
    }
    if let Some(mask) = l.get("wcMask").and_then(|v| v.as_str()) {
        let (flat, iw, ih) = decode_data_url(mask)?;
        layer.mask = Some(image_to_tiled(flat, iw, ih, w, h));
        layer.mask_enabled = l.get("wcMaskEnabled").and_then(|v| v.as_bool()) != Some(false);
    } else if let Some(m) = l.get("layerMask").filter(|v| v.is_object()) {
        layer.mask = legacy_mask(m, w, h);
        layer.mask_enabled = m.get("enabled").and_then(|v| v.as_bool()) != Some(false);
    }
    Ok(layer)
}

fn points_of(v: &Value) -> Vec<(f32, f32, Option<f32>)> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|p| {
                    let x = p.get("x")?.as_f64()? as f32;
                    let y = p.get("y")?.as_f64()? as f32;
                    Some((x, y, p.get("r").and_then(|r| r.as_f64()).map(|r| r as f32)))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn round_params(size: f32, color: [u8; 3], mode: StrokeMode) -> StrokeParams {
    StrokeParams {
        tip: Tip::Round,
        size,
        opacity: 1.0,
        flow: 1.0,
        spacing: 0.05,
        stream: 0.0,
        taper_start: 0.0,
        taper_end: 0.0,
        color,
        mode,
        pressure_size: 1.0,
        pressure_opacity: 0.0,
        pressure_gamma: 1.0,
        symmetry: Symmetry::Off,
        alpha_lock: false,
        jitter: 0.0,
    }
}

/// Coverage of a round-tipped polyline with optional per-point radii.
fn polyline_coverage(
    w: usize,
    h: usize,
    pts: &[(f32, f32, Option<f32>)],
    width: f32,
) -> CoverageMask {
    let max_r = pts
        .iter()
        .map(|p| p.2.unwrap_or(width / 2.0))
        .fold(width / 2.0, f32::max)
        .max(0.25);
    let mut s = brush::Stroke::new(
        round_params(max_r * 2.0, [0, 0, 0], StrokeMode::Paint),
        Tiled::new(w, h),
        1,
    );
    let input: Vec<InputPoint> = pts
        .iter()
        .map(|p| InputPoint {
            x: p.0,
            y: p.1,
            pressure: (p.2.unwrap_or(width / 2.0) / max_r).clamp(0.0, 1.0),
        })
        .collect();
    s.set_exact_points(input);
    s.mask
}

fn render_legacy_stroke(target: &mut Tiled, st: &Value) {
    let (w, h) = (target.w, target.h);
    let opacity = num(st, "opacity", 1.0).clamp(0.0, 1.0) as f32;
    let color = st
        .get("color")
        .and_then(|c| c.as_str())
        .and_then(parse_hex)
        .unwrap_or([0, 0, 0]);
    let width = num(st, "width", 1.0).clamp(0.0, 3200.0) as f32;
    let pts = points_of(st.get("points").unwrap_or(&Value::Null));
    // Source pixels for this stroke: (coverage, optional raster patch).
    let mut patch: Option<Tiled> = None;
    let mut cov = CoverageMask::new(w, h);
    if st.get("kind").and_then(|k| k.as_str()) == Some("raster") {
        let Some(data) = st.get("pngData").and_then(|v| v.as_str()) else {
            return;
        };
        let Ok((flat, iw, ih)) = decode_data_url(data) else {
            return;
        };
        let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for p in &pts {
            x0 = x0.min(p.0);
            y0 = y0.min(p.1);
            x1 = x1.max(p.0);
            y1 = y1.max(p.1);
        }
        if pts.is_empty() {
            (x0, y0, x1, y1) = (0.0, 0.0, iw as f32, ih as f32);
        }
        let (bw, bh) = (
            ((x1 - x0).round() as usize).max(1),
            ((y1 - y0).round() as usize).max(1),
        );
        let scaled = if bw == iw && bh == ih {
            flat
        } else {
            crate::adjust::resample(&flat, iw, ih, bw, bh)
        };
        let mut t = Tiled::new(w, h);
        let (ox, oy) = (x0.round() as i32, y0.round() as i32);
        t.for_each_mut(
            IRect::new(ox, oy, ox + bw as i32, oy + bh as i32),
            |x, y, p| {
                let i = (((y - oy) as usize) * bw + (x - ox) as usize) * 4;
                p.copy_from_slice(&scaled[i..i + 4]);
            },
        );
        patch = Some(t);
    } else if let Some(path) = st.get("svgPath").and_then(|v| v.as_str()) {
        let tr = st.get("svgTransform");
        let (sx, sy, dx, dy) = tr
            .map(|t| {
                (
                    num(t, "sx", 1.0) as f32,
                    num(t, "sy", 1.0) as f32,
                    num(t, "dx", 0.0) as f32,
                    num(t, "dy", 0.0) as f32,
                )
            })
            .unwrap_or((1.0, 1.0, 0.0, 0.0));
        let subpaths: Vec<Vec<(f32, f32)>> = parse_svg_path(path)
            .into_iter()
            .map(|sp| {
                sp.into_iter()
                    .map(|(x, y)| (x * sx + dx, y * sy + dy))
                    .collect()
            })
            .collect();
        let fill = st.get("fill").and_then(|v| v.as_bool()) == Some(true);
        let outline_only = st.get("outline").and_then(|v| v.as_bool()) == Some(true);
        if fill {
            for sp in &subpaths {
                cov.fill_polygon(sp);
            }
        }
        if !outline_only {
            for sp in &subpaths {
                let p: Vec<(f32, f32, Option<f32>)> =
                    sp.iter().map(|&(x, y)| (x, y, None)).collect();
                let m = polyline_coverage(w, h, &p, width.max(0.25));
                merge_cov(&mut cov, &m);
            }
        }
    } else if !pts.is_empty() {
        cov = polyline_coverage(w, h, &pts, width.max(0.25));
        if st.get("fill").and_then(|v| v.as_bool()) == Some(true) {
            let poly: Vec<(f32, f32)> = pts.iter().map(|p| (p.0, p.1)).collect();
            cov.fill_polygon(&poly);
        }
    } else {
        return;
    }
    // Vector erasures cut the stroke without touching other paint.
    let mut erase = CoverageMask::new(w, h);
    let mut has_erase = false;
    if let Some(ers) = st.get("erasures").and_then(|v| v.as_array()) {
        for er in ers.iter().take(4096) {
            let eo = num(er, "opacity", 1.0).clamp(0.0, 1.0) as f32;
            let m = if er.get("kind").and_then(|k| k.as_str()) == Some("selection") {
                let poly: Vec<(f32, f32)> =
                    points_of(er.get("selectionPoints").unwrap_or(&Value::Null))
                        .iter()
                        .map(|p| (p.0, p.1))
                        .collect();
                let mut m = CoverageMask::new(w, h);
                m.fill_polygon(&poly);
                m
            } else {
                let ep = points_of(er.get("points").unwrap_or(&Value::Null));
                if ep.is_empty() {
                    continue;
                }
                polyline_coverage(w, h, &ep, num(er, "width", 1.0) as f32)
            };
            let b = m.bounds;
            for y in b.y0..b.y1 {
                for x in b.x0..b.x1 {
                    let v = m.get(x, y) * eo;
                    if v > 0.0 {
                        erase.add(x, y, v, true);
                    }
                }
            }
            erase.bounds = erase.bounds.union(&b);
            has_erase = true;
        }
    }
    let keep = |x: i32, y: i32| {
        if has_erase {
            1.0 - erase.get(x, y)
        } else {
            1.0
        }
    };
    if let Some(p) = patch {
        target.for_each_mut(p.content_bounds(), |x, y, px| {
            let s = p.get(x, y);
            crate::color::over_u8(px, s, opacity * keep(x, y));
        });
    } else {
        let b = cov.bounds;
        target.for_each_mut(b, |x, y, px| {
            let c = cov.get(x, y) * opacity * keep(x, y);
            if c > 0.0 {
                crate::color::over_u8(px, [color[0], color[1], color[2], 255], c);
            }
        });
    }
}

fn merge_cov(dst: &mut CoverageMask, src: &CoverageMask) {
    let b = src.bounds;
    for y in b.y0..b.y1 {
        for x in b.x0..b.x1 {
            let v = src.get(x, y);
            if v > 0.0 {
                dst.add(x, y, v, false);
            }
        }
    }
    dst.bounds = dst.bounds.union(&b);
}

/// Legacy vector mask records → raster mask (alpha = hidden amount).
fn legacy_mask(m: &Value, w: usize, h: usize) -> Option<Tiled> {
    let base = num(m, "base", 1.0).clamp(0.0, 1.0) as f32;
    let inverted = m.get("inverted").and_then(|v| v.as_bool()) == Some(true);
    let commands = m
        .get("commands")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if commands.is_empty() && base >= 1.0 && !inverted {
        return None;
    }
    // visibility value per pixel in [0,1]
    let mut vis = vec![base; w * h];
    for c in commands.iter().take(4096) {
        let value = num(c, "value", 1.0).clamp(0.0, 1.0) as f32;
        let op = num(c, "opacity", 1.0).clamp(0.0, 1.0) as f32;
        let Some(path) = c.get("path").and_then(|v| v.as_str()) else {
            continue;
        };
        let mut cov = CoverageMask::new(w, h);
        let (sx, sy, dx, dy) = c
            .get("transform")
            .map(|t| {
                (
                    num(t, "sx", 1.0) as f32,
                    num(t, "sy", 1.0) as f32,
                    num(t, "dx", 0.0) as f32,
                    num(t, "dy", 0.0) as f32,
                )
            })
            .unwrap_or((1.0, 1.0, 0.0, 0.0));
        for sp in parse_svg_path(path) {
            let sp: Vec<(f32, f32)> = sp
                .into_iter()
                .map(|(x, y)| (x * sx + dx, y * sy + dy))
                .collect();
            cov.fill_polygon(&sp);
        }
        let b = cov.bounds;
        for y in b.y0.max(0)..b.y1.min(h as i32) {
            for x in b.x0.max(0)..b.x1.min(w as i32) {
                let k = cov.get(x, y) * op;
                let i = y as usize * w + x as usize;
                vis[i] += (value - vis[i]) * k;
            }
        }
    }
    let mut flat = vec![0u8; w * h * 4];
    for (i, v) in vis.iter().enumerate() {
        let v = if inverted { 1.0 - v } else { *v };
        flat[i * 4 + 3] = ((1.0 - v).clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
    }
    Some(Tiled::from_flat(w, h, &flat))
}

pub fn deserialize(text: &str) -> Result<Document> {
    let v: Value = serde_json::from_str(text).context("Project rejected: not valid JSON")?;
    from_value(&v)
}

pub fn from_value(v: &Value) -> Result<Document> {
    if v.get("magic").and_then(|m| m.as_str()) != Some(MAGIC) {
        bail!("Project rejected: unknown format");
    }
    let w = num(v, "width", 0.0);
    let h = num(v, "height", 0.0);
    if !(64.0..=MAX_EDGE as f64).contains(&w)
        || !(64.0..=MAX_EDGE as f64).contains(&h)
        || w.fract() != 0.0
        || h.fract() != 0.0
    {
        bail!("Project rejected: dimensions");
    }
    let (w, h) = (w as usize, h as usize);
    let bg = v
        .get("bgColor")
        .and_then(|c| c.as_str())
        .and_then(parse_hex)
        .unwrap_or([255, 255, 255]);
    let title = v
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("Untitled Artwork")
        .to_string();
    let mut doc = Document::new(title, w, h, bg);
    doc.layers.clear();
    doc.next_id = 1;
    doc.bg_visible = v.get("bgVisible").and_then(|b| b.as_bool()) != Some(false);
    if let Some(hist) = v.get("artworkBrushHistory") {
        doc.brush_history = serde_json::from_value(hist.clone()).unwrap_or_default();
    }
    let layers = v
        .get("layers")
        .and_then(|l| l.as_array())
        .ok_or_else(|| anyhow!("Project rejected: layer count"))?;
    doc.layers = parse_layers(layers, &mut doc)?;
    doc.active = (num(v, "activeLayerIndex", (doc.layers.len() - 1) as f64) as usize)
        .min(doc.layers.len() - 1);
    if let Some(a) = v.get("animation").filter(|a| a.is_object()) {
        let frames_v = a
            .get("frames")
            .and_then(|f| f.as_array())
            .ok_or_else(|| anyhow!("Project rejected: animation frames"))?;
        if frames_v.is_empty() || frames_v.len() > 4800 {
            bail!("Project rejected: animation frames");
        }
        let sources: std::collections::HashMap<String, &Value> = frames_v
            .iter()
            .filter_map(|f| {
                Some((
                    f.get("celId")?.as_str()?.to_string(),
                    f.get("snap").filter(|s| s.is_object())?,
                ))
            })
            .collect();
        let mut frames = Vec::new();
        for f in frames_v {
            let snap = match f.get("snap").filter(|s| s.is_object()) {
                Some(s) => s,
                None => f
                    .get("snapRef")
                    .and_then(|r| r.as_str())
                    .and_then(|r| sources.get(r).copied())
                    .ok_or_else(|| anyhow!("Project rejected: animation snapshot"))?,
            };
            let arr = snap
                .get("layers")
                .and_then(|l| l.as_array())
                .ok_or_else(|| anyhow!("Project rejected: frame layers"))?;
            let mut ls = parse_layers(arr, &mut doc)?;
            // Keep layer identity stable across frames so the layer panel stays in sync.
            for (i, l) in ls.iter_mut().enumerate() {
                if let Some(base) = doc.layers.get(i) {
                    l.id = base.id;
                }
            }
            frames.push(Frame {
                layers: ls,
                hold: num(f, "hold", 1.0).clamp(1.0, 10_000.0) as u32,
                label: f
                    .get("label")
                    .and_then(|l| l.as_str())
                    .unwrap_or("")
                    .to_string(),
            });
        }
        let current = (num(a, "index", 0.0) as usize).min(frames.len() - 1);
        doc.layers = frames[current].layers.clone();
        doc.active = doc.active.min(doc.layers.len() - 1);
        doc.anim = Some(Animation {
            frames,
            current,
            fps: num(a, "fps", 12.0).clamp(1.0, 120.0) as u32,
            looping: a.get("loop").and_then(|l| l.as_bool()) != Some(false),
            onion: a.get("onion").and_then(|l| l.as_bool()) != Some(false),
            onion_alpha: num(a, "onionAlpha", 0.25).clamp(0.05, 0.9) as f32,
            onion_before: 1,
            onion_after: 1,
        });
    }
    Ok(doc)
}

pub fn load_file(path: &std::path::Path) -> Result<Document> {
    let meta = std::fs::metadata(path)?;
    if meta.len() > MAX_FILE_BYTES {
        bail!("Project rejected: file over 512 MiB");
    }
    let text = std::fs::read_to_string(path)?;
    let mut doc = deserialize(&text)?;
    if doc.title == "Untitled Artwork" {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            doc.title = stem.to_string();
        }
    }
    Ok(doc)
}

pub fn document_from_image(name: &str, bytes: &[u8]) -> Result<Document> {
    let (flat, w, h) = decode_image_bytes(bytes)?;
    let (w2, h2) = (w.max(64), h.max(64));
    let mut doc = Document::new(name, w2, h2, [255, 255, 255]);
    doc.layers[0].name = "Photo".into();
    doc.layers[0].pixels = image_to_tiled(flat, w, h, w2, h2);
    Ok(doc)
}

// ------------------------------------------------------------------ minimal SVG path flattening

pub fn parse_svg_path(d: &str) -> Vec<Vec<(f32, f32)>> {
    let mut toks: Vec<Tok> = Vec::new();
    let bytes = d.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c.is_ascii_alphabetic() && c != 'e' && c != 'E' {
            toks.push(Tok::Cmd(c));
            i += 1;
        } else if c == '-' || c == '+' || c == '.' || c.is_ascii_digit() {
            let start = i;
            i += 1;
            let mut seen_dot = c == '.';
            while i < bytes.len() {
                let ch = bytes[i] as char;
                if ch.is_ascii_digit() {
                    i += 1;
                } else if ch == '.' && !seen_dot {
                    seen_dot = true;
                    i += 1;
                } else if (ch == 'e' || ch == 'E') && i + 1 < bytes.len() {
                    i += 1;
                    if bytes[i] == b'-' || bytes[i] == b'+' {
                        i += 1;
                    }
                } else {
                    break;
                }
            }
            if let Ok(v) = d[start..i].parse::<f32>() {
                toks.push(Tok::Num(v));
            }
        } else {
            i += 1;
        }
    }
    let mut out: Vec<Vec<(f32, f32)>> = Vec::new();
    let mut cur: Vec<(f32, f32)> = Vec::new();
    let (mut x, mut y, mut sx, mut sy) = (0f32, 0f32, 0f32, 0f32);
    let mut last_ctrl: Option<(f32, f32)> = None;
    let mut cmd = 'M';
    let mut k = 0;
    let nums = |k: &mut usize, n: usize| -> Option<Vec<f32>> {
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            match toks.get(*k) {
                Some(Tok::Num(f)) => {
                    v.push(*f);
                    *k += 1;
                }
                _ => return None,
            }
        }
        Some(v)
    };
    loop {
        match toks.get(k) {
            None => break,
            Some(Tok::Cmd(c)) => {
                cmd = *c;
                k += 1;
                if cmd == 'Z' || cmd == 'z' {
                    if !cur.is_empty() {
                        cur.push((sx, sy));
                        out.push(std::mem::take(&mut cur));
                    }
                    x = sx;
                    y = sy;
                    continue;
                }
            }
            Some(Tok::Num(_)) => {}
        }
        let rel = cmd.is_ascii_lowercase();
        let (ox, oy) = if rel { (x, y) } else { (0.0, 0.0) };
        match cmd.to_ascii_uppercase() {
            'M' => {
                let Some(v) = nums(&mut k, 2) else { break };
                if cur.len() > 1 {
                    out.push(std::mem::take(&mut cur));
                }
                cur.clear();
                x = v[0] + ox;
                y = v[1] + oy;
                sx = x;
                sy = y;
                cur.push((x, y));
                cmd = if rel { 'l' } else { 'L' };
                last_ctrl = None;
            }
            'L' => {
                let Some(v) = nums(&mut k, 2) else { break };
                x = v[0] + ox;
                y = v[1] + oy;
                cur.push((x, y));
                last_ctrl = None;
            }
            'H' => {
                let Some(v) = nums(&mut k, 1) else { break };
                x = v[0] + ox;
                cur.push((x, y));
                last_ctrl = None;
            }
            'V' => {
                let Some(v) = nums(&mut k, 1) else { break };
                y = v[0] + oy;
                cur.push((x, y));
                last_ctrl = None;
            }
            'C' | 'S' => {
                let s = cmd.eq_ignore_ascii_case(&'S');
                let Some(v) = nums(&mut k, if s { 4 } else { 6 }) else {
                    break;
                };
                let (c1, rest) = if s {
                    (
                        last_ctrl
                            .map(|(cx, cy)| (2.0 * x - cx, 2.0 * y - cy))
                            .unwrap_or((x, y)),
                        &v[..],
                    )
                } else {
                    ((v[0] + ox, v[1] + oy), &v[2..])
                };
                let c2 = (rest[0] + ox, rest[1] + oy);
                let p = (rest[2] + ox, rest[3] + oy);
                for i in 1..=16 {
                    let t = i as f32 / 16.0;
                    let u = 1.0 - t;
                    cur.push((
                        u * u * u * x
                            + 3.0 * u * u * t * c1.0
                            + 3.0 * u * t * t * c2.0
                            + t * t * t * p.0,
                        u * u * u * y
                            + 3.0 * u * u * t * c1.1
                            + 3.0 * u * t * t * c2.1
                            + t * t * t * p.1,
                    ));
                }
                last_ctrl = Some(c2);
                x = p.0;
                y = p.1;
            }
            'Q' | 'T' => {
                let t_cmd = cmd.eq_ignore_ascii_case(&'T');
                let Some(v) = nums(&mut k, if t_cmd { 2 } else { 4 }) else {
                    break;
                };
                let (c, p) = if t_cmd {
                    (
                        last_ctrl
                            .map(|(cx, cy)| (2.0 * x - cx, 2.0 * y - cy))
                            .unwrap_or((x, y)),
                        (v[0] + ox, v[1] + oy),
                    )
                } else {
                    ((v[0] + ox, v[1] + oy), (v[2] + ox, v[3] + oy))
                };
                for i in 1..=12 {
                    let t = i as f32 / 12.0;
                    let u = 1.0 - t;
                    cur.push((
                        u * u * x + 2.0 * u * t * c.0 + t * t * p.0,
                        u * u * y + 2.0 * u * t * c.1 + t * t * p.1,
                    ));
                }
                last_ctrl = Some(c);
                x = p.0;
                y = p.1;
            }
            'A' => {
                let Some(v) = nums(&mut k, 7) else { break };
                x = v[5] + ox;
                y = v[6] + oy;
                cur.push((x, y));
                last_ctrl = None;
            }
            _ => {
                k += 1;
            }
        }
    }
    if cur.len() > 1 {
        out.push(cur);
    }
    out
}

enum Tok {
    Cmd(char),
    Num(f32),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_preserves_layers_and_pixels() {
        let mut d = Document::new("Test", 128, 96, [10, 20, 30]);
        d.layers[0].pixels.put(5, 6, [200, 100, 50, 255]);
        d.add_layer();
        d.layers[1].blend = BlendMode::Multiply;
        d.layers[1].opacity = 0.5;
        d.layers[1].clip = true;
        let text = serialize(&mut d).unwrap();
        let back = deserialize(&text).unwrap();
        assert_eq!((back.w, back.h, back.bg), (128, 96, [10, 20, 30]));
        assert_eq!(back.layers.len(), 2);
        assert_eq!(back.layers[0].pixels.get(5, 6), [200, 100, 50, 255]);
        assert_eq!(back.layers[1].blend, BlendMode::Multiply);
        assert!(back.layers[1].clip);
        assert!((back.layers[1].opacity - 0.5).abs() < 0.01);
    }

    #[test]
    fn animation_roundtrip() {
        let mut d = Document::new("Anim", 64, 64, [255, 255, 255]);
        d.enable_animation();
        d.add_frame(false);
        d.layers[0].pixels.put(1, 1, [0, 0, 0, 255]);
        let text = serialize(&mut d).unwrap();
        let mut back = deserialize(&text).unwrap();
        let a = back.anim.as_ref().unwrap();
        assert_eq!(a.frames.len(), 2);
        assert_eq!(a.current, 1);
        assert_eq!(back.layers[0].pixels.get(1, 1)[3], 255);
        back.goto_frame(0);
        assert_eq!(back.layers[0].pixels.get(1, 1)[3], 0);
    }

    #[test]
    fn rejects_unknown_files() {
        assert!(deserialize("{}").is_err());
        assert!(deserialize(
            r#"{"magic":"WINCREATE_PROJECT_V1","width":10,"height":10,"layers":[]}"#
        )
        .is_err());
    }

    #[test]
    fn imports_legacy_vector_strokes_and_erasures() {
        let blank = png_data_url(&vec![0u8; 64 * 64 * 4], 64, 64).unwrap();
        let text = json!({
            "magic": MAGIC, "width": 64, "height": 64, "bgColor": "#ffffff",
            "layers": [{
                "id": 1, "name": "Ink", "pngData": blank,
                "vectorStrokes": [
                    {"points": [{"x": 5, "y": 32, "r": 3}, {"x": 60, "y": 32, "r": 3}], "width": 6, "opacity": 1, "color": "#ff0000",
                     "erasures": [{"points": [{"x": 32, "y": 20}, {"x": 32, "y": 44}], "width": 8, "opacity": 1}]},
                    {"svgPath": "M 10 50 L 30 50 L 30 60 Z", "width": 1, "opacity": 1, "color": "#0000ff", "fill": true, "points": []}
                ]
            }]
        })
        .to_string();
        let d = deserialize(&text).unwrap();
        let px = &d.layers[0].pixels;
        assert_eq!(px.get(15, 32), [255, 0, 0, 255]);
        assert_eq!(px.get(32, 32)[3], 0, "erasure should cut the stroke");
        assert_eq!(px.get(27, 54)[2], 255);
    }

    #[test]
    fn svg_path_parser() {
        let p = parse_svg_path("M0,0 L10,0 l0,10 H0 Z M 5 5 C 5 6 6 7 8 8");
        assert_eq!(p.len(), 2);
        assert_eq!(
            p[0][..4],
            [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
        );
        assert_eq!(*p[1].last().unwrap(), (8.0, 8.0));
    }
}
