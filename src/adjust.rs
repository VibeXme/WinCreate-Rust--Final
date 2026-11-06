//! Pixel adjustments and filters on flat straight-alpha RGBA buffers.

use crate::color::{hsv_to_rgb, rgb_to_hsv};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Filter {
    Hsb,
    BrightnessContrast,
    ColorBalance,
    Levels,
    GaussianBlur,
    MotionBlur,
    Sharpen,
    Noise,
    Bloom,
    Chromatic,
    Halftone,
    Posterize,
    Invert,
    Grayscale,
    Sepia,
}

impl Filter {
    pub const ALL: [Filter; 15] = [
        Filter::Hsb,
        Filter::BrightnessContrast,
        Filter::ColorBalance,
        Filter::Levels,
        Filter::GaussianBlur,
        Filter::MotionBlur,
        Filter::Sharpen,
        Filter::Noise,
        Filter::Bloom,
        Filter::Chromatic,
        Filter::Halftone,
        Filter::Posterize,
        Filter::Invert,
        Filter::Grayscale,
        Filter::Sepia,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Filter::Hsb => "Hue / Saturation / Brightness",
            Filter::BrightnessContrast => "Brightness / Contrast",
            Filter::ColorBalance => "Colour Balance",
            Filter::Levels => "Levels / Curves",
            Filter::GaussianBlur => "Gaussian Blur",
            Filter::MotionBlur => "Motion Blur",
            Filter::Sharpen => "Sharpen",
            Filter::Noise => "Film Grain",
            Filter::Bloom => "Bloom",
            Filter::Chromatic => "Chromatic Aberration",
            Filter::Halftone => "Halftone",
            Filter::Posterize => "Posterize",
            Filter::Invert => "Invert",
            Filter::Grayscale => "Grayscale",
            Filter::Sepia => "Sepia",
        }
    }

    /// (label, min, max, default)
    pub fn params(self) -> &'static [(&'static str, f32, f32, f32)] {
        match self {
            Filter::Hsb => &[
                ("Hue shift", -180.0, 180.0, 0.0),
                ("Saturation", -100.0, 100.0, 0.0),
                ("Brightness", -100.0, 100.0, 0.0),
            ],
            Filter::BrightnessContrast => &[
                ("Brightness", -100.0, 100.0, 0.0),
                ("Contrast", -100.0, 100.0, 0.0),
            ],
            Filter::ColorBalance => &[
                ("Cyan ↔ Red", -100.0, 100.0, 0.0),
                ("Magenta ↔ Green", -100.0, 100.0, 0.0),
                ("Yellow ↔ Blue", -100.0, 100.0, 0.0),
            ],
            Filter::Levels => &[
                ("Black point", 0.0, 254.0, 0.0),
                ("White point", 1.0, 255.0, 255.0),
                ("Gamma", 0.1, 4.0, 1.0),
            ],
            Filter::GaussianBlur => &[("Radius", 0.0, 100.0, 6.0)],
            Filter::MotionBlur => &[
                ("Distance", 0.0, 200.0, 20.0),
                ("Angle", -180.0, 180.0, 0.0),
            ],
            Filter::Sharpen => &[("Amount", 0.0, 300.0, 80.0), ("Radius", 0.5, 10.0, 1.5)],
            Filter::Noise => &[("Amount", 0.0, 100.0, 15.0), ("Monochrome", 0.0, 1.0, 1.0)],
            Filter::Bloom => &[
                ("Threshold", 0.0, 255.0, 180.0),
                ("Radius", 1.0, 80.0, 16.0),
                ("Intensity", 0.0, 300.0, 120.0),
            ],
            Filter::Chromatic => &[("Offset", 0.0, 40.0, 4.0)],
            Filter::Halftone => &[("Cell size", 3.0, 60.0, 8.0)],
            Filter::Posterize => &[("Levels", 2.0, 32.0, 6.0)],
            Filter::Invert | Filter::Grayscale | Filter::Sepia => &[],
        }
    }

    pub fn defaults(self) -> Vec<f32> {
        self.params().iter().map(|p| p.3).collect()
    }
}

pub fn apply(filter: Filter, px: &mut [u8], w: usize, h: usize, v: &[f32]) {
    let g = |i: usize| v.get(i).copied().unwrap_or(0.0);
    match filter {
        Filter::Hsb => per_pixel(px, |c| {
            let (hh, s, b) = rgb_to_hsv(c);
            let s = (s * (1.0 + g(1) / 100.0)).clamp(0.0, 1.0);
            let b = (b * (1.0 + g(2) / 100.0)).clamp(0.0, 1.0);
            hsv_to_rgb(hh + g(0), s, b)
        }),
        Filter::BrightnessContrast => {
            let br = g(0) / 100.0;
            let k = (1.0 + g(1) / 100.0).max(0.0).powi(2);
            per_pixel(px, |c| {
                c.map(|x| ((x - 0.5) * k + 0.5 + br).clamp(0.0, 1.0))
            })
        }
        Filter::ColorBalance => {
            let s = [g(0) / 400.0, g(1) / 400.0, g(2) / 400.0];
            per_pixel(px, |c| {
                [c[0] + s[0], c[1] + s[1], c[2] + s[2]].map(|x| x.clamp(0.0, 1.0))
            })
        }
        Filter::Levels => {
            let (lo, hi, gamma) = (
                g(0) / 255.0,
                (g(1) / 255.0).max(g(0) / 255.0 + 0.004),
                g(2).max(0.05),
            );
            per_pixel(px, |c| {
                c.map(|x| (((x - lo) / (hi - lo)).clamp(0.0, 1.0)).powf(1.0 / gamma))
            })
        }
        Filter::GaussianBlur => gaussian_blur(px, w, h, g(0)),
        Filter::MotionBlur => motion_blur(px, w, h, g(0), g(1)),
        Filter::Sharpen => {
            let orig = px.to_vec();
            let mut blurred = px.to_vec();
            gaussian_blur(&mut blurred, w, h, g(1));
            let amt = g(0) / 100.0;
            for i in (0..px.len()).step_by(4) {
                for c in 0..3 {
                    let v = orig[i + c] as f32 + (orig[i + c] as f32 - blurred[i + c] as f32) * amt;
                    px[i + c] = v.clamp(0.0, 255.0) as u8;
                }
            }
        }
        Filter::Noise => {
            let amt = g(0) / 100.0 * 128.0;
            let mono = g(1) >= 0.5;
            for (i, p) in px.chunks_exact_mut(4).enumerate() {
                if p[3] == 0 {
                    continue;
                }
                let x = (i % w) as i32;
                let y = (i / w) as i32;
                for (c, channel) in p.iter_mut().take(3).enumerate() {
                    let n = crate::brush::hash(x, y, if mono { 11 } else { 11 + c as u32 }) - 0.5;
                    *channel = (*channel as f32 + n * amt).clamp(0.0, 255.0) as u8;
                }
            }
        }
        Filter::Bloom => {
            let th = g(0);
            let mut bright = px.to_vec();
            for p in bright.chunks_exact_mut(4) {
                let l = 0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32;
                if l < th {
                    p[3] = 0;
                }
            }
            gaussian_blur(&mut bright, w, h, g(1));
            let k = g(2) / 100.0;
            for (p, b) in px.chunks_exact_mut(4).zip(bright.chunks_exact(4)) {
                let a = b[3] as f32 / 255.0 * k;
                for c in 0..3 {
                    p[c] = (p[c] as f32 + b[c] as f32 * a).min(255.0) as u8;
                }
                p[3] = p[3].max((b[3] as f32 * k).min(255.0) as u8);
            }
        }
        Filter::Chromatic => {
            let off = g(0).round() as i32;
            let src = px.to_vec();
            let get = |x: i32, y: i32, c: usize| -> u8 {
                let x = x.clamp(0, w as i32 - 1) as usize;
                let y = y.clamp(0, h as i32 - 1) as usize;
                src[(y * w + x) * 4 + c]
            };
            for y in 0..h as i32 {
                for x in 0..w as i32 {
                    let i = (y as usize * w + x as usize) * 4;
                    px[i] = get(x - off, y, 0);
                    px[i + 2] = get(x + off, y, 2);
                    px[i + 3] = get(x - off, y, 3).max(src[i + 3]).max(get(x + off, y, 3));
                }
            }
        }
        Filter::Halftone => {
            let cell = g(0).max(2.0);
            let src = px.to_vec();
            for y in 0..h {
                for x in 0..w {
                    let cx = ((x as f32 / cell).floor() + 0.5) * cell;
                    let cy = ((y as f32 / cell).floor() + 0.5) * cell;
                    let si = ((cy as usize).min(h - 1) * w + (cx as usize).min(w - 1)) * 4;
                    let l = 1.0
                        - (0.299 * src[si] as f32
                            + 0.587 * src[si + 1] as f32
                            + 0.114 * src[si + 2] as f32)
                            / 255.0;
                    let r = cell * 0.5 * l.sqrt() * 1.2;
                    let d = (x as f32 + 0.5 - cx).hypot(y as f32 + 0.5 - cy);
                    let k = (r - d + 0.5).clamp(0.0, 1.0);
                    let i = (y * w + x) * 4;
                    for c in 0..3 {
                        px[i + c] = (255.0 - (255.0 - src[si + c] as f32 * 0.25) * k) as u8;
                    }
                    px[i + 3] = src[i + 3];
                }
            }
        }
        Filter::Posterize => {
            let n = g(0).round().max(2.0) - 1.0;
            per_pixel(px, |c| c.map(|x| (x * n).round() / n))
        }
        Filter::Invert => per_pixel(px, |c| c.map(|x| 1.0 - x)),
        Filter::Grayscale => per_pixel(px, |c| {
            let l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
            [l; 3]
        }),
        Filter::Sepia => per_pixel(px, |c| {
            [
                0.393 * c[0] + 0.769 * c[1] + 0.189 * c[2],
                0.349 * c[0] + 0.686 * c[1] + 0.168 * c[2],
                0.272 * c[0] + 0.534 * c[1] + 0.131 * c[2],
            ]
            .map(|x| x.min(1.0))
        }),
    }
}

fn per_pixel(px: &mut [u8], f: impl Fn([f32; 3]) -> [f32; 3]) {
    for p in px.chunks_exact_mut(4) {
        if p[3] == 0 {
            continue;
        }
        let c = f([
            p[0] as f32 / 255.0,
            p[1] as f32 / 255.0,
            p[2] as f32 / 255.0,
        ]);
        p[0] = (c[0].clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
        p[1] = (c[1].clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
        p[2] = (c[2].clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
    }
}

fn to_premul(px: &[u8]) -> Vec<f32> {
    let mut out = Vec::with_capacity(px.len());
    for p in px.chunks_exact(4) {
        let a = p[3] as f32 / 255.0;
        out.extend_from_slice(&[
            p[0] as f32 * a,
            p[1] as f32 * a,
            p[2] as f32 * a,
            p[3] as f32,
        ]);
    }
    out
}

fn from_premul(src: &[f32], px: &mut [u8]) {
    for (p, s) in px.chunks_exact_mut(4).zip(src.chunks_exact(4)) {
        let a = s[3].clamp(0.0, 255.0);
        p[3] = (a + 0.5) as u8;
        if a <= 0.01 {
            p[0] = 0;
            p[1] = 0;
            p[2] = 0;
        } else {
            let k = 255.0 / a;
            for c in 0..3 {
                p[c] = (s[c] * k + 0.5).clamp(0.0, 255.0) as u8;
            }
        }
    }
}

fn box_pass(src: &[f32], dst: &mut [f32], w: usize, h: usize, r: usize, horizontal: bool) {
    let (len, lines) = if horizontal { (w, h) } else { (h, w) };
    let idx = |line: usize, i: usize| {
        if horizontal {
            (line * w + i) * 4
        } else {
            (i * w + line) * 4
        }
    };
    let div = (2 * r + 1) as f32;
    for line in 0..lines {
        let mut acc = [0f32; 4];
        for k in 0..=(2 * r) {
            let i = (k as isize - r as isize).clamp(0, len as isize - 1) as usize;
            let p = idx(line, i);
            for c in 0..4 {
                acc[c] += src[p + c];
            }
        }
        for i in 0..len {
            let o = idx(line, i);
            for c in 0..4 {
                dst[o + c] = acc[c] / div;
            }
            let add = idx(line, (i + r + 1).min(len - 1));
            let sub = idx(line, (i as isize - r as isize).max(0) as usize);
            for c in 0..4 {
                acc[c] += src[add + c] - src[sub + c];
            }
        }
    }
}

pub fn gaussian_blur(px: &mut [u8], w: usize, h: usize, radius: f32) {
    if radius < 0.5 || w == 0 || h == 0 {
        return;
    }
    let mut a = to_premul(px);
    let mut b = vec![0f32; a.len()];
    // Three box passes approximate a gaussian with sigma ≈ radius / 2.
    let r = ((radius * 0.58).round() as usize).max(1);
    for _ in 0..3 {
        box_pass(&a, &mut b, w, h, r, true);
        box_pass(&b, &mut a, w, h, r, false);
    }
    from_premul(&a, px);
}

pub fn motion_blur(px: &mut [u8], w: usize, h: usize, dist: f32, angle_deg: f32) {
    if dist < 1.0 {
        return;
    }
    let src = to_premul(px);
    let mut dst = vec![0f32; src.len()];
    let (dx, dy) = (angle_deg.to_radians().cos(), angle_deg.to_radians().sin());
    let n = dist.ceil() as i32;
    for y in 0..h as i32 {
        for x in 0..w as i32 {
            let mut acc = [0f32; 4];
            let mut cnt: f32 = 0.0;
            for k in -n / 2..=n / 2 {
                let sx = (x as f32 + dx * k as f32).round() as i32;
                let sy = (y as f32 + dy * k as f32).round() as i32;
                if sx < 0 || sy < 0 || sx >= w as i32 || sy >= h as i32 {
                    continue;
                }
                let i = (sy as usize * w + sx as usize) * 4;
                for c in 0..4 {
                    acc[c] += src[i + c];
                }
                cnt += 1.0;
            }
            let o = (y as usize * w + x as usize) * 4;
            for c in 0..4 {
                dst[o + c] = acc[c] / cnt.max(1.0);
            }
        }
    }
    from_premul(&dst, px);
}

/// Area-averaging downscale / bilinear upscale of straight RGBA.
pub fn resample(src: &[u8], sw: usize, sh: usize, dw: usize, dh: usize) -> Vec<u8> {
    let mut out = vec![0u8; dw * dh * 4];
    if sw == 0 || sh == 0 || dw == 0 || dh == 0 {
        return out;
    }
    let pm = to_premul(src);
    let sx = sw as f32 / dw as f32;
    let sy = sh as f32 / dh as f32;
    let mut acc_buf = vec![0f32; dw * dh * 4];
    for y in 0..dh {
        for x in 0..dw {
            let o = (y * dw + x) * 4;
            if sx > 1.0 || sy > 1.0 {
                let x0 = (x as f32 * sx) as usize;
                let x1 = (((x + 1) as f32 * sx).ceil() as usize).clamp(x0 + 1, sw);
                let y0 = (y as f32 * sy) as usize;
                let y1 = (((y + 1) as f32 * sy).ceil() as usize).clamp(y0 + 1, sh);
                let mut acc = [0f32; 4];
                for yy in y0..y1 {
                    for xx in x0..x1 {
                        let i = (yy * sw + xx) * 4;
                        for c in 0..4 {
                            acc[c] += pm[i + c];
                        }
                    }
                }
                let n = ((x1 - x0) * (y1 - y0)) as f32;
                for c in 0..4 {
                    acc_buf[o + c] = acc[c] / n;
                }
            } else {
                let fx = ((x as f32 + 0.5) * sx - 0.5).max(0.0);
                let fy = ((y as f32 + 0.5) * sy - 0.5).max(0.0);
                let (x0, y0) = (fx as usize, fy as usize);
                let (x1, y1) = ((x0 + 1).min(sw - 1), (y0 + 1).min(sh - 1));
                let (tx, ty) = (fx - x0 as f32, fy - y0 as f32);
                for c in 0..4 {
                    let a = pm[(y0 * sw + x0) * 4 + c];
                    let b = pm[(y0 * sw + x1) * 4 + c];
                    let cc = pm[(y1 * sw + x0) * 4 + c];
                    let d = pm[(y1 * sw + x1) * 4 + c];
                    acc_buf[o + c] = (a + (b - a) * tx) * (1.0 - ty) + (cc + (d - cc) * tx) * ty;
                }
            }
        }
    }
    from_premul(&acc_buf, &mut out);
    out
}

pub fn flip_h(px: &mut [u8], w: usize, h: usize) {
    for y in 0..h {
        for x in 0..w / 2 {
            let a = (y * w + x) * 4;
            let b = (y * w + (w - 1 - x)) * 4;
            for c in 0..4 {
                px.swap(a + c, b + c);
            }
        }
    }
}

pub fn flip_v(px: &mut [u8], w: usize, h: usize) {
    for y in 0..h / 2 {
        let (top, bot) = px.split_at_mut((h - 1 - y) * w * 4);
        top[y * w * 4..(y + 1) * w * 4].swap_with_slice(&mut bot[..w * 4]);
    }
}

/// Affine transform (scale & rotate around the canvas centre, then translate) with bilinear sampling.
pub fn transform(
    src: &[u8],
    w: usize,
    h: usize,
    dx: f32,
    dy: f32,
    scale: f32,
    rot_deg: f32,
) -> Vec<u8> {
    let mut out = vec![0u8; w * h * 4];
    let pm = to_premul(src);
    let mut acc = vec![0f32; w * h * 4];
    let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
    let (c, s) = (rot_deg.to_radians().cos(), rot_deg.to_radians().sin());
    let inv = 1.0 / scale.max(0.01);
    for y in 0..h {
        for x in 0..w {
            let px = x as f32 + 0.5 - cx - dx;
            let py = y as f32 + 0.5 - cy - dy;
            let ux = (px * c + py * s) * inv + cx - 0.5;
            let uy = (-px * s + py * c) * inv + cy - 0.5;
            if ux < -1.0 || uy < -1.0 || ux >= w as f32 || uy >= h as f32 {
                continue;
            }
            let (x0, y0) = (ux.floor() as i32, uy.floor() as i32);
            let (tx, ty) = (ux - x0 as f32, uy - y0 as f32);
            let get = |xx: i32, yy: i32, ch: usize| -> f32 {
                if xx < 0 || yy < 0 || xx >= w as i32 || yy >= h as i32 {
                    0.0
                } else {
                    pm[(yy as usize * w + xx as usize) * 4 + ch]
                }
            };
            let o = (y * w + x) * 4;
            for ch in 0..4 {
                let a = get(x0, y0, ch);
                let b = get(x0 + 1, y0, ch);
                let cc = get(x0, y0 + 1, ch);
                let d = get(x0 + 1, y0 + 1, ch);
                acc[o + ch] = (a + (b - a) * tx) * (1.0 - ty) + (cc + (d - cc) * tx) * ty;
            }
        }
    }
    from_premul(&acc, &mut out);
    out
}

/// Sobel edge map rendered as coloured line art on transparency.
pub fn edge_lines(src: &[u8], w: usize, h: usize, sensitivity: f32, color: [u8; 3]) -> Vec<u8> {
    let lum: Vec<f32> = src
        .chunks_exact(4)
        .map(|p| {
            let a = p[3] as f32 / 255.0;
            let c = |v: u8| 255.0 + (v as f32 - 255.0) * a;
            0.299 * c(p[0]) + 0.587 * c(p[1]) + 0.114 * c(p[2])
        })
        .collect();
    let mut out = vec![0u8; w * h * 4];
    let th = (100.0 - sensitivity.clamp(0.0, 100.0)) * 4.0 + 20.0;
    for y in 1..h.saturating_sub(1) {
        for x in 1..w.saturating_sub(1) {
            let l = |dx: isize, dy: isize| {
                lum[((y as isize + dy) as usize) * w + (x as isize + dx) as usize]
            };
            let gx = -l(-1, -1) - 2.0 * l(-1, 0) - l(-1, 1) + l(1, -1) + 2.0 * l(1, 0) + l(1, 1);
            let gy = -l(-1, -1) - 2.0 * l(0, -1) - l(1, -1) + l(-1, 1) + 2.0 * l(0, 1) + l(1, 1);
            let m = gx.hypot(gy);
            if m > th * 0.5 {
                let o = (y * w + x) * 4;
                out[o..o + 3].copy_from_slice(&color);
                out[o + 3] = (((m - th * 0.5) / (th * 0.5)).clamp(0.0, 1.0) * 255.0) as u8;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invert_and_grayscale() {
        let mut px = vec![255, 0, 0, 255];
        apply(Filter::Invert, &mut px, 1, 1, &[]);
        assert_eq!(px, vec![0, 255, 255, 255]);
        apply(Filter::Grayscale, &mut px, 1, 1, &[]);
        assert_eq!(px[0], px[1]);
    }

    #[test]
    fn blur_spreads_alpha() {
        let (w, h) = (21, 21);
        let mut px = vec![0u8; w * h * 4];
        let c = (10 * w + 10) * 4;
        px[c..c + 4].copy_from_slice(&[255, 0, 0, 255]);
        gaussian_blur(&mut px, w, h, 4.0);
        assert!(px[(10 * w + 12) * 4 + 3] > 0);
        assert_eq!(
            px[(10 * w + 12) * 4],
            255,
            "blur must not darken colour via transparent pixels"
        );
    }

    #[test]
    fn resample_halves() {
        let px = vec![255u8; 4 * 4 * 4];
        let out = resample(&px, 4, 4, 2, 2);
        assert_eq!(out.len(), 16);
        assert!(out.iter().all(|&v| v == 255));
    }

    #[test]
    fn flips_are_involutions() {
        let mut px: Vec<u8> = (0..(3 * 2 * 4)).map(|v| v as u8).collect();
        let orig = px.clone();
        flip_h(&mut px, 3, 2);
        assert_ne!(px, orig);
        flip_h(&mut px, 3, 2);
        flip_v(&mut px, 3, 2);
        flip_v(&mut px, 3, 2);
        assert_eq!(px, orig);
    }
}
