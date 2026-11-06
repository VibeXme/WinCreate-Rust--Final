//! Brush presets, procedural brush tips and the stroke renderer.
//!
//! A stroke accumulates coverage into a sparse mask, and the target layer is
//! recomputed from its pre-stroke snapshot. Opacity therefore never stacks
//! inside a single stroke, and strokes can be re-rendered (end taper, QuickShape).

use crate::engine;
use crate::tiled::{IRect, Tiled, TILE};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Tip {
    Round,
    Dry,
    Bristle,
    Graphite,
    Grain,
    Marker,
    Gouache,
    Watercolor,
    Air,
    Spray,
    Splatter,
    Chisel,
    Ribbon,
    Stipple,
    Halftone,
    Foliage,
    Pixel,
    Neon,
    Pastel,
}

impl Tip {
    pub fn builds_up(self) -> bool {
        matches!(
            self,
            Tip::Air | Tip::Watercolor | Tip::Spray | Tip::Pastel | Tip::Stipple
        )
    }
}

#[derive(Clone, Debug)]
pub struct BrushPreset {
    pub id: &'static str,
    pub name: &'static str,
    pub category: &'static str,
    pub spacing: f32,
    pub alpha: f32,
    pub stream: f32,
    pub taper: f32,
    pub tip: Tip,
}

macro_rules! b {
    ($cat:expr, $id:expr, $name:expr, $sp:expr, $al:expr, $st:expr, $ta:expr, $tip:ident) => {
        BrushPreset {
            id: $id,
            name: $name,
            category: $cat,
            spacing: $sp,
            alpha: $al,
            stream: $st,
            taper: $ta,
            tip: Tip::$tip,
        }
    };
}

pub const CATEGORIES: [&str; 6] = [
    "Inking",
    "Sketching",
    "Painting",
    "Airbrushing",
    "Calligraphy",
    "Textures",
];

pub fn presets() -> &'static [BrushPreset] {
    use std::sync::OnceLock;
    static P: OnceLock<Vec<BrushPreset>> = OnceLock::new();
    P.get_or_init(|| {
        vec![
            b!(
                "Inking",
                "studio",
                "Studio Pen",
                0.06,
                1.0,
                35.0,
                20.0,
                Round
            ),
            b!(
                "Inking",
                "technical",
                "Technical Pen",
                0.05,
                1.0,
                45.0,
                10.0,
                Round
            ),
            b!(
                "Inking",
                "micro_liner",
                "Micro Liner",
                0.04,
                1.0,
                50.0,
                0.0,
                Round
            ),
            b!(
                "Inking",
                "fountain",
                "Fountain Ink",
                0.06,
                0.94,
                42.0,
                38.0,
                Round
            ),
            b!("Inking", "monoline", "Monoline", 0.05, 1.0, 60.0, 0.0, Round),
            b!("Inking", "dry_ink", "Dry Ink", 0.11, 0.9, 25.0, 15.0, Dry),
            b!(
                "Inking",
                "brush_ink",
                "Brush Ink",
                0.075,
                0.94,
                35.0,
                56.0,
                Bristle
            ),
            b!(
                "Sketching",
                "2h",
                "2H Drafting Pencil",
                0.11,
                0.45,
                20.0,
                4.0,
                Graphite
            ),
            b!(
                "Sketching",
                "hb",
                "HB Graphite",
                0.12,
                0.66,
                20.0,
                5.0,
                Graphite
            ),
            b!(
                "Sketching",
                "6b",
                "6B Pencil",
                0.13,
                0.76,
                15.0,
                5.0,
                Graphite
            ),
            b!(
                "Sketching",
                "graphite",
                "Graphite Shading",
                0.16,
                0.48,
                17.0,
                0.0,
                Graphite
            ),
            b!(
                "Sketching",
                "peppermint",
                "Loose Sketch",
                0.16,
                0.6,
                15.0,
                5.0,
                Graphite
            ),
            b!(
                "Sketching",
                "conte",
                "Conte Crayon",
                0.14,
                0.75,
                15.0,
                0.0,
                Grain
            ),
            b!(
                "Painting",
                "acrylic",
                "Flat Marker",
                0.12,
                0.8,
                20.0,
                0.0,
                Marker
            ),
            b!(
                "Painting",
                "gouache",
                "Opaque Gouache",
                0.13,
                0.85,
                25.0,
                0.0,
                Gouache
            ),
            b!(
                "Painting",
                "watercolor",
                "Watercolor Wash",
                0.2,
                0.28,
                25.0,
                0.0,
                Watercolor
            ),
            b!(
                "Painting",
                "oil_brush",
                "Oil Bristles",
                0.14,
                0.8,
                20.0,
                0.0,
                Bristle
            ),
            b!(
                "Painting",
                "dry_brush",
                "Dry Bristle",
                0.17,
                0.65,
                20.0,
                0.0,
                Dry
            ),
            b!(
                "Painting",
                "chalk",
                "Soft Chalk",
                0.15,
                0.65,
                12.0,
                0.0,
                Grain
            ),
            b!(
                "Painting",
                "charcoal",
                "Charcoal Block",
                0.17,
                0.7,
                10.0,
                0.0,
                Grain
            ),
            b!(
                "Painting",
                "pastel",
                "Soft Pastel",
                0.15,
                0.56,
                14.0,
                0.0,
                Pastel
            ),
            b!(
                "Painting",
                "oil_pastel",
                "Oil Pastel",
                0.12,
                0.78,
                20.0,
                0.0,
                Grain
            ),
            b!(
                "Airbrushing",
                "soft_air",
                "Soft Airbrush",
                0.18,
                0.18,
                20.0,
                0.0,
                Air
            ),
            b!(
                "Airbrushing",
                "hard_air",
                "Hard Airbrush",
                0.08,
                0.88,
                25.0,
                10.0,
                Round
            ),
            b!(
                "Airbrushing",
                "spray",
                "Spray Paint",
                0.26,
                0.47,
                15.0,
                0.0,
                Spray
            ),
            b!(
                "Airbrushing",
                "splatter",
                "Paint Splatter",
                0.38,
                0.8,
                14.0,
                0.0,
                Splatter
            ),
            b!(
                "Calligraphy",
                "script",
                "Chisel Script",
                0.06,
                1.0,
                55.0,
                45.0,
                Chisel
            ),
            b!(
                "Calligraphy",
                "ribbon",
                "Ribbon Lettering",
                0.055,
                0.92,
                48.0,
                25.0,
                Ribbon
            ),
            b!(
                "Calligraphy",
                "soft_marker",
                "Calligraphy Marker",
                0.09,
                0.8,
                35.0,
                20.0,
                Marker
            ),
            b!(
                "Textures",
                "stipple",
                "Stipple Dots",
                0.25,
                0.82,
                16.0,
                0.0,
                Stipple
            ),
            b!("Textures", "halftone", "Halftone", 0.29, 0.85, 14.0, 0.0, Halftone),
            b!("Textures", "foliage", "Foliage", 0.32, 0.83, 15.0, 0.0, Foliage),
            b!(
                "Textures",
                "pixel",
                "Pixel Brush",
                0.12,
                1.0,
                0.0,
                0.0,
                Pixel
            ),
            b!(
                "Textures",
                "neon",
                "Neon Light",
                0.08,
                0.95,
                36.0,
                10.0,
                Neon
            ),
        ]
    })
}

pub fn preset(id: &str) -> &'static BrushPreset {
    presets()
        .iter()
        .find(|p| p.id == id)
        .unwrap_or(&presets()[0])
}

pub const MIN_SIZE: f32 = 0.25;
pub const MAX_SIZE: f32 = 1600.0;

pub fn size_to_slider(size: f32) -> f32 {
    (size.clamp(MIN_SIZE, MAX_SIZE) / MIN_SIZE).ln() / (MAX_SIZE / MIN_SIZE).ln()
}
pub fn slider_to_size(r: f32) -> f32 {
    MIN_SIZE * (MAX_SIZE / MIN_SIZE).powf(r.clamp(0.0, 1.0))
}

// ---------------------------------------------------------------- noise

#[inline]
pub fn hash(x: i32, y: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x8da6_b343)
        ^ (y as u32).wrapping_mul(0xd816_3841)
        ^ seed.wrapping_mul(0xcb1a_b31f);
    h ^= h >> 13;
    h = h.wrapping_mul(0x5bd1_e995);
    h ^= h >> 15;
    (h & 0xff_ffff) as f32 / 16_777_215.0
}

#[inline]
fn smooth_noise(x: f32, y: f32, seed: u32) -> f32 {
    let xi = x.floor() as i32;
    let yi = y.floor() as i32;
    let fx = x - xi as f32;
    let fy = y - yi as f32;
    let sx = fx * fx * (3.0 - 2.0 * fx);
    let sy = fy * fy * (3.0 - 2.0 * fy);
    let a = hash(xi, yi, seed);
    let b = hash(xi + 1, yi, seed);
    let c = hash(xi, yi + 1, seed);
    let d = hash(xi + 1, yi + 1, seed);
    let top = a + (b - a) * sx;
    let bot = c + (d - c) * sx;
    top + (bot - top) * sy
}

/// Paper grain fixed to canvas coordinates, so texture stays put between dabs.
#[inline]
pub fn paper(x: f32, y: f32, scale: f32) -> f32 {
    0.65 * smooth_noise(x / scale, y / scale, 7)
        + 0.35 * smooth_noise(x / (scale * 0.45), y / (scale * 0.45), 19)
}

struct Rng(u32);
impl Rng {
    fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 & 0xff_ffff) as f32 / 16_777_215.0
    }
}

#[inline]
fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

// ---------------------------------------------------------------- coverage mask

/// Sparse per-pixel stroke coverage in [0,1].
#[derive(Clone)]
pub struct CoverageMask {
    w: usize,
    h: usize,
    tw: usize,
    tiles: Vec<Option<Box<[f32]>>>,
    pub bounds: IRect,
}

impl CoverageMask {
    pub fn new(w: usize, h: usize) -> Self {
        let tw = w.div_ceil(TILE);
        let th = h.div_ceil(TILE);
        Self {
            w,
            h,
            tw,
            tiles: vec![None; tw * th],
            bounds: IRect::EMPTY,
        }
    }

    pub fn clear(&mut self) {
        self.tiles.fill(None);
        self.bounds = IRect::EMPTY;
    }

    #[inline]
    pub fn get(&self, x: i32, y: i32) -> f32 {
        if x < 0 || y < 0 || x as usize >= self.w || y as usize >= self.h {
            return 0.0;
        }
        let (x, y) = (x as usize, y as usize);
        match &self.tiles[(y / TILE) * self.tw + x / TILE] {
            Some(t) => t[(y % TILE) * TILE + x % TILE],
            None => 0.0,
        }
    }

    #[inline]
    pub fn add(&mut self, x: i32, y: i32, c: f32, build: bool) {
        if c <= 0.0 || x < 0 || y < 0 || x as usize >= self.w || y as usize >= self.h {
            return;
        }
        let (ux, uy) = (x as usize, y as usize);
        let slot = &mut self.tiles[(uy / TILE) * self.tw + ux / TILE];
        let t = slot.get_or_insert_with(|| vec![0f32; TILE * TILE].into_boxed_slice());
        let v = &mut t[(uy % TILE) * TILE + ux % TILE];
        let c = c.min(1.0);
        *v = if build { *v + c * (1.0 - *v) } else { v.max(c) };
    }

    fn include(&mut self, r: IRect) {
        self.bounds =
            self.bounds
                .union(&r.intersect(&IRect::new(0, 0, self.w as i32, self.h as i32)));
    }

    /// Fill a polygon (even-odd) with full coverage.
    pub fn fill_polygon(&mut self, pts: &[(f32, f32)]) -> IRect {
        if pts.len() < 3 {
            return IRect::EMPTY;
        }
        let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for &(x, y) in pts {
            minx = minx.min(x);
            miny = miny.min(y);
            maxx = maxx.max(x);
            maxy = maxy.max(y);
        }
        let r = IRect::new(
            minx.floor() as i32,
            miny.floor() as i32,
            maxx.ceil() as i32 + 1,
            maxy.ceil() as i32 + 1,
        )
        .intersect(&IRect::new(0, 0, self.w as i32, self.h as i32));
        const SS: usize = 4;
        let mut xs: Vec<f32> = Vec::new();
        for y in r.y0..r.y1 {
            let mut row = vec![0f32; r.width() as usize];
            for s in 0..SS {
                let sy = y as f32 + (s as f32 + 0.5) / SS as f32;
                xs.clear();
                for i in 0..pts.len() {
                    let (x0, y0) = pts[i];
                    let (x1, y1) = pts[(i + 1) % pts.len()];
                    if (y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy) {
                        xs.push(x0 + (sy - y0) / (y1 - y0) * (x1 - x0));
                    }
                }
                xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
                for pair in xs.chunks_exact(2) {
                    let (a, b) = (pair[0].max(r.x0 as f32), pair[1].min(r.x1 as f32));
                    let mut x = a;
                    while x < b {
                        let px = x.floor();
                        let cover = (b.min(px + 1.0) - x).max(0.0);
                        let i = (px as i32 - r.x0) as usize;
                        if i < row.len() {
                            row[i] += cover / SS as f32;
                        }
                        x = px + 1.0;
                    }
                }
            }
            for (i, c) in row.iter().enumerate() {
                if *c > 0.0 {
                    self.add(r.x0 + i as i32, y, *c, false);
                }
            }
        }
        self.include(r);
        r
    }
}

// ---------------------------------------------------------------- dabs

#[derive(Clone, Copy, Debug)]
pub struct Dab {
    pub x: f32,
    pub y: f32,
    pub r: f32,
    pub angle: f32,
    pub flow: f32,
    pub seed: u32,
}

pub fn stamp(mask: &mut CoverageMask, tip: Tip, d: Dab, stroke_seed: u32) -> IRect {
    let build = tip.builds_up();
    let r = d.r.max(0.25);
    let mut rng = Rng(d.seed.wrapping_mul(2_654_435_761).wrapping_add(stroke_seed) | 1);
    let reach = match tip {
        Tip::Splatter => r * 1.8,
        Tip::Neon => r * 1.6,
        _ => r,
    };
    let rect = IRect::from_center(d.x, d.y, reach);
    let (ca, sa) = (d.angle.cos(), d.angle.sin());
    let flow = d.flow;
    match tip {
        Tip::Spray | Tip::Splatter | Tip::Stipple | Tip::Foliage => {
            let count = match tip {
                Tip::Spray => (r * r * 0.12).clamp(6.0, 500.0) as usize,
                Tip::Splatter => 2 + (rng.next() * 5.0) as usize,
                Tip::Stipple => 2 + (rng.next() * 4.0) as usize,
                _ => 2 + (rng.next() * 3.0) as usize,
            };
            for _ in 0..count {
                let ang = rng.next() * std::f32::consts::TAU;
                let rad = match tip {
                    Tip::Spray => rng.next().sqrt() * r,
                    Tip::Splatter => rng.next().powf(0.7) * r * 1.6,
                    _ => rng.next().sqrt() * r * 0.85,
                };
                let (px, py) = (d.x + ang.cos() * rad, d.y + ang.sin() * rad);
                match tip {
                    Tip::Foliage => {
                        let la = rng.next() * std::f32::consts::TAU;
                        let rx = r * (0.25 + rng.next() * 0.2);
                        ellipse(
                            mask,
                            px,
                            py,
                            rx,
                            rx * 0.38,
                            la,
                            flow * (0.7 + rng.next() * 0.3),
                            build,
                        );
                    }
                    Tip::Spray => {
                        let dr = 0.5 + rng.next() * (r * 0.025).clamp(0.3, 1.6);
                        disc(mask, px, py, dr, flow * (0.5 + rng.next() * 0.5), true);
                    }
                    Tip::Splatter => {
                        let dr = r * (0.06 + rng.next() * 0.22);
                        disc(mask, px, py, dr, flow, build);
                    }
                    _ => {
                        let dr = (r * (0.08 + rng.next() * 0.08)).max(0.6);
                        disc(mask, px, py, dr, flow, build);
                    }
                }
            }
        }
        Tip::Chisel => {
            ellipse(
                mask,
                d.x,
                d.y,
                r,
                r * 0.22,
                std::f32::consts::FRAC_PI_4,
                flow,
                build,
            );
        }
        Tip::Ribbon => {
            ellipse(mask, d.x, d.y, r, r * 0.32, -0.52, flow, build);
        }
        _ => {
            for y in rect.y0..rect.y1 {
                for x in rect.x0..rect.x1 {
                    let dx = x as f32 + 0.5 - d.x;
                    let dy = y as f32 + 0.5 - d.y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    let c = match tip {
                        Tip::Round => (r - dist + 0.5).clamp(0.0, 1.0),
                        Tip::Air => {
                            let t = (dist / r).min(1.0);
                            let f = 1.0 - t * t;
                            f * f
                        }
                        Tip::Graphite => {
                            let edge = (r - dist + 0.5).clamp(0.0, 1.0);
                            let g = paper(x as f32, y as f32, 1.6);
                            edge * smoothstep(0.22, 0.72, g + (1.0 - (dist / r).min(1.0)) * 0.15)
                        }
                        Tip::Grain => {
                            let edge = smoothstep(r + 0.5, r * 0.82 - 0.5, dist);
                            let g = paper(x as f32, y as f32, 3.2);
                            edge * smoothstep(0.32, 0.58, g)
                        }
                        Tip::Pastel => {
                            let t = (dist / r).min(1.0);
                            let edge = 1.0 - t.powi(4);
                            edge * smoothstep(0.3, 0.62, paper(x as f32, y as f32, 2.4))
                        }
                        Tip::Dry | Tip::Bristle => {
                            let edge = (r - dist + 0.5).clamp(0.0, 1.0);
                            let perp = -dx * sa + dy * ca;
                            let lane = (perp / (r * 0.12).max(0.8)).floor() as i32;
                            let n = hash(lane, 0, stroke_seed);
                            if tip == Tip::Dry {
                                edge * if n > 0.38 { 1.0 } else { 0.05 }
                                    * (0.75 + 0.25 * paper(x as f32, y as f32, 2.0))
                            } else {
                                edge * (0.45 + 0.55 * n)
                            }
                        }
                        Tip::Marker => {
                            let lx = (dx * ca + dy * sa).abs();
                            let ly = (-dx * sa + dy * ca).abs();
                            let k = r * 0.78;
                            ((k - lx + 0.5).clamp(0.0, 1.0)) * ((k - ly + 0.5).clamp(0.0, 1.0))
                        }
                        Tip::Gouache => {
                            let a = dy.atan2(dx);
                            let wob = 0.9
                                + 0.1
                                    * smooth_noise(
                                        a * 3.0 + 10.0,
                                        d.seed as f32 * 0.37,
                                        stroke_seed,
                                    );
                            (r * wob - dist + 0.5).clamp(0.0, 1.0)
                        }
                        Tip::Watercolor => {
                            let t = (dist / r).min(1.0);
                            let body = smoothstep(1.0, 0.85, t);
                            body * (0.55 + 0.45 * t * t * t)
                                * (0.8 + 0.2 * paper(x as f32, y as f32, 6.0))
                        }
                        Tip::Halftone => {
                            let cell = (r * 0.38).clamp(3.0, 28.0);
                            let gx = (x as f32 / cell).floor();
                            let gy = (y as f32 / cell).floor();
                            let cx = (gx + 0.5) * cell;
                            let cy = (gy + 0.5) * cell;
                            let fall = 1.0 - ((cx - d.x).hypot(cy - d.y) / r).min(1.0);
                            let dot_r = cell * 0.5 * fall.sqrt();
                            let dd = (x as f32 + 0.5 - cx).hypot(y as f32 + 0.5 - cy);
                            (dot_r - dd + 0.5).clamp(0.0, 1.0)
                        }
                        Tip::Pixel => {
                            let half = r.max(0.5);
                            let px = x as f32 + 0.5;
                            let py = y as f32 + 0.5;
                            if (px - d.x.round()).abs() <= half && (py - d.y.round()).abs() <= half
                            {
                                1.0
                            } else {
                                0.0
                            }
                        }
                        Tip::Neon => {
                            let core = (r * 0.42 - dist + 0.5).clamp(0.0, 1.0);
                            let t = dist / (r * 1.6);
                            let glow = (-t * t * 4.0).exp() * 0.55;
                            core.max(glow)
                        }
                        _ => 0.0,
                    };
                    if c > 0.0 {
                        mask.add(x, y, c * flow, build);
                    }
                }
            }
        }
    }
    mask.include(rect);
    rect.intersect(&IRect::new(0, 0, mask.w as i32, mask.h as i32))
}

fn disc(mask: &mut CoverageMask, cx: f32, cy: f32, r: f32, flow: f32, build: bool) {
    let rect = IRect::from_center(cx, cy, r);
    for y in rect.y0..rect.y1 {
        for x in rect.x0..rect.x1 {
            let d = (x as f32 + 0.5 - cx).hypot(y as f32 + 0.5 - cy);
            let c = (r - d + 0.5).clamp(0.0, 1.0);
            if c > 0.0 {
                mask.add(x, y, c * flow, build);
            }
        }
    }
    mask.include(rect);
}

#[allow(clippy::too_many_arguments)]
fn ellipse(
    mask: &mut CoverageMask,
    cx: f32,
    cy: f32,
    rx: f32,
    ry: f32,
    ang: f32,
    flow: f32,
    build: bool,
) {
    let rect = IRect::from_center(cx, cy, rx.max(ry));
    let (c, s) = (ang.cos(), ang.sin());
    let ry = ry.max(0.6);
    for y in rect.y0..rect.y1 {
        for x in rect.x0..rect.x1 {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let lx = dx * c + dy * s;
            let ly = -dx * s + dy * c;
            let k = ((lx / rx).powi(2) + (ly / ry).powi(2)).sqrt();
            let cov = ((1.0 - k) * ry + 0.5).clamp(0.0, 1.0);
            if cov > 0.0 {
                mask.add(x, y, cov * flow, build);
            }
        }
    }
    mask.include(rect);
}

// ---------------------------------------------------------------- symmetry

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Symmetry {
    #[default]
    Off,
    Vertical,
    Horizontal,
    Quadrant,
    Radial,
}

impl Symmetry {
    pub const ALL: [Symmetry; 5] = [
        Symmetry::Off,
        Symmetry::Vertical,
        Symmetry::Horizontal,
        Symmetry::Quadrant,
        Symmetry::Radial,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Symmetry::Off => "Off",
            Symmetry::Vertical => "Vertical",
            Symmetry::Horizontal => "Horizontal",
            Symmetry::Quadrant => "Quadrant",
            Symmetry::Radial => "Radial (8-way)",
        }
    }
    pub fn mirror(self, x: f32, y: f32, cx: f32, cy: f32) -> Vec<(f32, f32)> {
        match self {
            Symmetry::Off => vec![(x, y)],
            Symmetry::Vertical => vec![(x, y), (2.0 * cx - x, y)],
            Symmetry::Horizontal => vec![(x, y), (x, 2.0 * cy - y)],
            Symmetry::Quadrant => vec![
                (x, y),
                (2.0 * cx - x, y),
                (x, 2.0 * cy - y),
                (2.0 * cx - x, 2.0 * cy - y),
            ],
            Symmetry::Radial => {
                let (dx, dy) = (x - cx, y - cy);
                (0..8)
                    .map(|i| {
                        let a = i as f32 * std::f32::consts::TAU / 8.0;
                        let (c, s) = (a.cos(), a.sin());
                        (cx + dx * c - dy * s, cy + dx * s + dy * c)
                    })
                    .collect()
            }
        }
    }
}

// ---------------------------------------------------------------- stroke

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StrokeMode {
    Paint,
    Erase,
}

#[derive(Clone, Copy, Debug)]
pub struct InputPoint {
    pub x: f32,
    pub y: f32,
    pub pressure: f32,
}

#[derive(Clone, Debug)]
pub struct StrokeParams {
    pub tip: Tip,
    pub size: f32,
    pub opacity: f32,
    pub flow: f32,
    pub spacing: f32,
    pub stream: f32,
    pub taper_start: f32,
    pub taper_end: f32,
    pub color: [u8; 3],
    pub mode: StrokeMode,
    pub pressure_size: f32,
    pub pressure_opacity: f32,
    pub pressure_gamma: f32,
    pub symmetry: Symmetry,
    pub alpha_lock: bool,
    pub jitter: f32,
}

pub struct Stroke {
    pub params: StrokeParams,
    pub seed: u32,
    pub base: Tiled,
    pub mask: CoverageMask,
    pub points: Vec<InputPoint>,
    smoothed: Vec<engine::StrokePoint>,
    carry: f32,
    travelled: f32,
    dab_index: u32,
    total_len: Option<f32>,
    canvas: (usize, usize),
}

impl Stroke {
    pub fn new(params: StrokeParams, base: Tiled, seed: u32) -> Self {
        let (w, h) = (base.w, base.h);
        Self {
            params,
            seed,
            mask: CoverageMask::new(w, h),
            base,
            points: Vec::new(),
            smoothed: Vec::new(),
            carry: 0.0,
            travelled: 0.0,
            dab_index: 0,
            total_len: None,
            canvas: (w, h),
        }
    }

    fn taper_len(&self, pct: f32) -> f32 {
        pct / 100.0 * (self.params.size * 6.0).max(60.0)
    }

    fn radius_at(&self, pressure: f32, at: f32) -> f32 {
        let p = &self.params;
        let pr = 1.0 - p.pressure_size * (1.0 - pressure);
        let mut k = pr;
        if p.taper_start > 0.0 {
            let l = self.taper_len(p.taper_start);
            k *= 0.15 + 0.85 * smoothstep(0.0, l, at);
        }
        if let (Some(total), true) = (self.total_len, p.taper_end > 0.0) {
            let l = self.taper_len(p.taper_end).min(total * 0.5);
            k *= 0.15 + 0.85 * smoothstep(0.0, l, total - at);
        }
        (p.size * 0.5 * k).max(0.25)
    }

    /// Add an input point; returns the dirty rect touched on the coverage mask.
    pub fn add_point(&mut self, pt: InputPoint) -> IRect {
        self.points.push(pt);
        self.advance(pt)
    }

    fn advance(&mut self, pt: InputPoint) -> IRect {
        let p = self.params.clone();
        let next = match self.smoothed.last() {
            None => engine::StrokePoint {
                x: pt.x as f64,
                y: pt.y as f64,
                r: 1.0,
                pressure: pt.pressure as f64,
            },
            Some(prev) => {
                let speed = ((pt.x as f64 - prev.x).hypot(pt.y as f64 - prev.y)) / 8.0;
                engine::stabilize_stroke_point(
                    prev.x,
                    prev.y,
                    pt.x as f64,
                    pt.y as f64,
                    pt.pressure as f64,
                    speed,
                    p.stream as f64,
                    30.0,
                    p.pressure_gamma as f64,
                )
            }
        };
        let mut dirty = IRect::EMPTY;
        match self.smoothed.last().copied() {
            None => {
                dirty = self.dab_at(next.x as f32, next.y as f32, next.pressure as f32, 0.0);
            }
            Some(prev) => {
                let (x0, y0, x1, y1) = (prev.x as f32, prev.y as f32, next.x as f32, next.y as f32);
                let seg = (x1 - x0).hypot(y1 - y0);
                if seg > 0.0 {
                    let angle = (y1 - y0).atan2(x1 - x0);
                    let mut t = self.carry;
                    loop {
                        let pr = prev.pressure as f32
                            + (next.pressure as f32 - prev.pressure as f32) * (t / seg).min(1.0);
                        let r = self.radius_at(pr, self.travelled + t);
                        let step = if p.tip == Tip::Pixel {
                            (r * 2.0 * p.spacing).max(1.0)
                        } else {
                            (r * 2.0 * p.spacing).max(0.5)
                        };
                        if t > seg {
                            self.carry = t - seg;
                            break;
                        }
                        let f = t / seg;
                        let rect = self.dab_full(
                            x0 + (x1 - x0) * f,
                            y0 + (y1 - y0) * f,
                            pr,
                            self.travelled + t,
                            angle,
                        );
                        dirty = dirty.union(&rect);
                        t += step;
                    }
                    self.travelled += seg;
                }
            }
        }
        self.smoothed.push(next);
        dirty
    }

    fn dab_at(&mut self, x: f32, y: f32, pressure: f32, at: f32) -> IRect {
        self.dab_full(x, y, pressure, at, 0.0)
    }

    fn dab_full(&mut self, x: f32, y: f32, pressure: f32, at: f32, angle: f32) -> IRect {
        let p = &self.params;
        let r = self.radius_at(pressure, at);
        let flow = p.flow * (1.0 - p.pressure_opacity * (1.0 - pressure));
        let (cx, cy) = (self.canvas.0 as f32 / 2.0, self.canvas.1 as f32 / 2.0);
        let mut dirty = IRect::EMPTY;
        let idx = self.dab_index;
        self.dab_index += 1;
        let (jx, jy) = if p.jitter > 0.0 {
            let j = p.jitter * r;
            (
                (hash(idx as i32, 1, self.seed) - 0.5) * 2.0 * j,
                (hash(idx as i32, 2, self.seed) - 0.5) * 2.0 * j,
            )
        } else {
            (0.0, 0.0)
        };
        let tip = p.tip;
        for (mx, my) in p.symmetry.mirror(x + jx, y + jy, cx, cy) {
            let rect = stamp(
                &mut self.mask,
                tip,
                Dab {
                    x: mx,
                    y: my,
                    r,
                    angle,
                    flow,
                    seed: idx,
                },
                self.seed,
            );
            dirty = dirty.union(&rect);
        }
        dirty
    }

    /// Re-render the whole stroke (used for end taper and QuickShape replacement).
    pub fn rerender(&mut self, finished: bool) -> IRect {
        let old = self.mask.bounds;
        self.mask.clear();
        self.smoothed.clear();
        self.carry = 0.0;
        self.dab_index = 0;
        if finished {
            // Total length of the smoothed path is approximated by the raw path.
            let mut len = 0.0;
            for w in self.points.windows(2) {
                len += (w[1].x - w[0].x).hypot(w[1].y - w[0].y);
            }
            self.total_len = Some(len * 0.98);
        }
        self.travelled = 0.0;
        let pts = std::mem::take(&mut self.points);
        let mut dirty = old;
        for pt in &pts {
            dirty = dirty.union(&self.advance(*pt));
        }
        self.points = pts;
        dirty
    }

    /// Replace the input with exact points (QuickShape / shape tool) without smoothing.
    pub fn set_exact_points(&mut self, pts: Vec<InputPoint>) -> IRect {
        let stream = self.params.stream;
        self.params.stream = 0.0;
        self.points = pts;
        let r = self.rerender(false);
        self.params.stream = stream;
        r
    }

    /// Write `base ⊕ mask` into `target` for the given rect.
    pub fn apply(&self, target: &mut Tiled, rect: IRect) {
        let p = &self.params;
        let [cr, cg, cb] = p.color;
        let opacity = p.opacity;
        let base = &self.base;
        let mask = &self.mask;
        target.for_each_mut(rect, |x, y, px| {
            let b = base.get(x, y);
            let m = mask.get(x, y) * opacity;
            if m <= 0.0 {
                px.copy_from_slice(&b);
                return;
            }
            match p.mode {
                StrokeMode::Erase => {
                    px.copy_from_slice(&b);
                    px[3] = (b[3] as f32 * (1.0 - m) + 0.5) as u8;
                }
                StrokeMode::Paint if p.alpha_lock => {
                    px[0] = (b[0] as f32 + (cr as f32 - b[0] as f32) * m + 0.5) as u8;
                    px[1] = (b[1] as f32 + (cg as f32 - b[1] as f32) * m + 0.5) as u8;
                    px[2] = (b[2] as f32 + (cb as f32 - b[2] as f32) * m + 0.5) as u8;
                    px[3] = b[3];
                }
                StrokeMode::Paint => {
                    px.copy_from_slice(&b);
                    crate::color::over_u8(px, [cr, cg, cb, 255], m);
                }
            }
        });
    }
}

// ---------------------------------------------------------------- QuickShape

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeKind {
    Line,
    Rect,
    Ellipse,
    Triangle,
    Polygon,
}

fn rdp(pts: &[(f32, f32)], eps: f32, out: &mut Vec<(f32, f32)>) {
    if pts.len() < 3 {
        out.extend_from_slice(pts);
        return;
    }
    let (a, b) = (pts[0], pts[pts.len() - 1]);
    let (mut best, mut idx) = (0.0, 0);
    for (i, p) in pts.iter().enumerate().skip(1).take(pts.len() - 2) {
        let d = point_line_dist(*p, a, b);
        if d > best {
            best = d;
            idx = i;
        }
    }
    if best > eps {
        let mut left = Vec::new();
        rdp(&pts[..=idx], eps, &mut left);
        left.pop();
        out.extend(left);
        rdp(&pts[idx..], eps, out);
    } else {
        out.push(a);
        out.push(b);
    }
}

fn point_line_dist(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len = dx.hypot(dy);
    if len < 1e-4 {
        return (p.0 - a.0).hypot(p.1 - a.1);
    }
    ((p.0 - a.0) * dy - (p.1 - a.1) * dx).abs() / len
}

/// Detect a geometric shape in a freehand stroke and return replacement vertices.
pub fn detect_shape(points: &[InputPoint]) -> Option<(ShapeKind, Vec<(f32, f32)>)> {
    if points.len() < 2 {
        return None;
    }
    let pts: Vec<(f32, f32)> = points.iter().map(|p| (p.x, p.y)).collect();
    let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    let mut len = 0.0;
    for (i, &(x, y)) in pts.iter().enumerate() {
        minx = minx.min(x);
        miny = miny.min(y);
        maxx = maxx.max(x);
        maxy = maxy.max(y);
        if i > 0 {
            len += (x - pts[i - 1].0).hypot(y - pts[i - 1].1);
        }
    }
    let diag = (maxx - minx).hypot(maxy - miny).max(1.0);
    if len < 8.0 {
        return None;
    }
    let first = pts[0];
    let last = *pts.last().unwrap();
    let max_dev = pts
        .iter()
        .map(|p| point_line_dist(*p, first, last))
        .fold(0.0, f32::max);
    let closed = (first.0 - last.0).hypot(first.1 - last.1) < diag * 0.22;
    if !closed {
        if max_dev < len * 0.08 {
            return Some((ShapeKind::Line, vec![first, last]));
        }
        let mut simp = Vec::new();
        rdp(&pts, diag * 0.06, &mut simp);
        return Some((ShapeKind::Polygon, simp));
    }
    let mut simp = Vec::new();
    rdp(&pts, diag * 0.09, &mut simp);
    if simp.len() > 1
        && (simp[0].0 - simp[simp.len() - 1].0).hypot(simp[0].1 - simp[simp.len() - 1].1)
            < diag * 0.22
    {
        simp.pop();
    }
    // Ellipse check: radial deviation around the centroid.
    let (cx, cy) = ((minx + maxx) / 2.0, (miny + maxy) / 2.0);
    let (rx, ry) = (
        ((maxx - minx) / 2.0).max(1.0),
        ((maxy - miny) / 2.0).max(1.0),
    );
    let ell_err = pts
        .iter()
        .map(|&(x, y)| ((((x - cx) / rx).powi(2) + ((y - cy) / ry).powi(2)).sqrt() - 1.0).abs())
        .sum::<f32>()
        / pts.len() as f32;
    match simp.len() {
        3 if ell_err > 0.12 => Some((ShapeKind::Triangle, simp)),
        4 if ell_err > 0.09 => Some((
            ShapeKind::Rect,
            vec![(minx, miny), (maxx, miny), (maxx, maxy), (minx, maxy)],
        )),
        _ if ell_err < 0.2 => Some((ShapeKind::Ellipse, ellipse_points(cx, cy, rx, ry, 0.0))),
        n if n >= 3 => Some((ShapeKind::Polygon, simp)),
        _ => None,
    }
}

pub fn ellipse_points(cx: f32, cy: f32, rx: f32, ry: f32, rot: f32) -> Vec<(f32, f32)> {
    let n = ((rx + ry) * 0.6).clamp(24.0, 720.0) as usize;
    let (c, s) = (rot.cos(), rot.sin());
    (0..n)
        .map(|i| {
            let a = i as f32 / n as f32 * std::f32::consts::TAU;
            let (x, y) = (a.cos() * rx, a.sin() * ry);
            (cx + x * c - y * s, cy + x * s + y * c)
        })
        .collect()
}

/// Densify a polyline into evenly spaced input points.
pub fn densify(vertices: &[(f32, f32)], closed: bool, pressure: f32) -> Vec<InputPoint> {
    let mut out = Vec::new();
    if vertices.is_empty() {
        return out;
    }
    let mut vs = vertices.to_vec();
    if closed {
        vs.push(vertices[0]);
    }
    out.push(InputPoint {
        x: vs[0].0,
        y: vs[0].1,
        pressure,
    });
    for w in vs.windows(2) {
        let (a, b) = (w[0], w[1]);
        let len = (b.0 - a.0).hypot(b.1 - a.1);
        let n = (len / 2.0).ceil().max(1.0) as usize;
        for i in 1..=n {
            let t = i as f32 / n as f32;
            out.push(InputPoint {
                x: a.0 + (b.0 - a.0) * t,
                y: a.1 + (b.1 - a.1) * t,
                pressure,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(tip: Tip) -> StrokeParams {
        StrokeParams {
            tip,
            size: 10.0,
            opacity: 1.0,
            flow: 1.0,
            spacing: 0.1,
            stream: 0.0,
            taper_start: 0.0,
            taper_end: 0.0,
            color: [255, 0, 0],
            mode: StrokeMode::Paint,
            pressure_size: 0.0,
            pressure_opacity: 0.0,
            pressure_gamma: 1.0,
            symmetry: Symmetry::Off,
            alpha_lock: false,
            jitter: 0.0,
        }
    }

    #[test]
    fn round_stroke_paints_continuous_line() {
        let mut layer = Tiled::new(200, 100);
        let mut s = Stroke::new(params(Tip::Round), layer.clone(), 1);
        let mut dirty = IRect::EMPTY;
        for i in 0..=10 {
            dirty = dirty.union(&s.add_point(InputPoint {
                x: 20.0 + i as f32 * 15.0,
                y: 50.0,
                pressure: 1.0,
            }));
        }
        s.apply(&mut layer, dirty);
        for x in 25..165 {
            assert_eq!(layer.get(x, 50), [255, 0, 0, 255], "gap at {x}");
        }
        assert_eq!(layer.get(100, 70)[3], 0);
    }

    #[test]
    fn eraser_removes_paint() {
        let mut layer = Tiled::filled(100, 100, [0, 0, 0, 255]);
        let mut p = params(Tip::Round);
        p.mode = StrokeMode::Erase;
        let mut s = Stroke::new(p, layer.clone(), 1);
        let r = s.add_point(InputPoint {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
        });
        s.apply(&mut layer, r);
        assert_eq!(layer.get(50, 50)[3], 0);
        assert_eq!(layer.get(5, 5)[3], 255);
    }

    #[test]
    fn opacity_does_not_stack_within_stroke() {
        let mut layer = Tiled::new(100, 100);
        let mut p = params(Tip::Round);
        p.opacity = 0.5;
        let mut s = Stroke::new(p, layer.clone(), 1);
        let mut d = IRect::EMPTY;
        for _ in 0..5 {
            d = d.union(&s.add_point(InputPoint {
                x: 50.0,
                y: 50.0,
                pressure: 1.0,
            }));
        }
        s.apply(&mut layer, d);
        assert!((layer.get(50, 50)[3] as i32 - 128).abs() <= 1);
    }

    #[test]
    fn every_tip_marks_the_canvas() {
        for p in presets() {
            let mut layer = Tiled::new(160, 160);
            let mut pr = params(p.tip);
            pr.size = 40.0;
            pr.flow = p.alpha;
            let mut s = Stroke::new(pr, layer.clone(), 3);
            let mut d = IRect::EMPTY;
            for i in 0..10 {
                d = d.union(&s.add_point(InputPoint {
                    x: 40.0 + i as f32 * 8.0,
                    y: 80.0,
                    pressure: 1.0,
                }));
            }
            s.apply(&mut layer, d);
            assert!(!layer.is_blank(), "{} painted nothing", p.id);
        }
    }

    #[test]
    fn detects_line_and_rect() {
        let line: Vec<InputPoint> = (0..50)
            .map(|i| InputPoint {
                x: i as f32 * 4.0,
                y: 10.0 + (i % 3) as f32,
                pressure: 1.0,
            })
            .collect();
        assert_eq!(detect_shape(&line).unwrap().0, ShapeKind::Line);
        let mut rect = Vec::new();
        for (a, b) in [
            ((0.0, 0.0), (200.0, 0.0)),
            ((200.0, 0.0), (200.0, 120.0)),
            ((200.0, 120.0), (0.0, 120.0)),
            ((0.0, 120.0), (0.0, 2.0)),
        ] {
            for i in 0..40 {
                let t = i as f32 / 40.0;
                rect.push(InputPoint {
                    x: a.0 + (b.0 - a.0) * t,
                    y: a.1 + (b.1 - a.1) * t,
                    pressure: 1.0,
                });
            }
        }
        assert_eq!(detect_shape(&rect).unwrap().0, ShapeKind::Rect);
        let circle: Vec<InputPoint> = ellipse_points(100.0, 100.0, 60.0, 60.0, 0.0)
            .into_iter()
            .map(|(x, y)| InputPoint {
                x,
                y,
                pressure: 1.0,
            })
            .collect();
        assert_eq!(detect_shape(&circle).unwrap().0, ShapeKind::Ellipse);
    }

    #[test]
    fn symmetry_mirrors() {
        assert_eq!(
            Symmetry::Vertical.mirror(10.0, 5.0, 50.0, 50.0),
            vec![(10.0, 5.0), (90.0, 5.0)]
        );
        assert_eq!(Symmetry::Radial.mirror(60.0, 50.0, 50.0, 50.0).len(), 8);
    }

    #[test]
    fn size_slider_is_logarithmic_and_invertible() {
        for s in [0.25, 1.0, 20.0, 1600.0] {
            assert!((slider_to_size(size_to_slider(s)) - s).abs() / s < 1e-3);
        }
    }
}
