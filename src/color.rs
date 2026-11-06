//! Colour parsing, HSV conversion and the 16 W3C separable/non-separable blend modes.

use serde::{Deserialize, Serialize};

pub fn parse_hex(s: &str) -> Option<[u8; 3]> {
    let s = s.trim().trim_start_matches('#');
    if s.len() != 6 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let v = u32::from_str_radix(s, 16).ok()?;
    Some([(v >> 16) as u8, (v >> 8) as u8, v as u8])
}

pub fn to_hex(c: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}

/// h in [0,360), s,v in [0,1]
pub fn hsv_to_rgb(h: f32, s: f32, v: f32) -> [f32; 3] {
    let h = h.rem_euclid(360.0) / 60.0;
    let c = v * s;
    let x = c * (1.0 - ((h % 2.0) - 1.0).abs());
    let (r, g, b) = match h as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    [r + m, g + m, b + m]
}

pub fn rgb_to_hsv(c: [f32; 3]) -> (f32, f32, f32) {
    let [r, g, b] = c;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let d = max - min;
    let h = if d <= 1e-6 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / d).rem_euclid(6.0))
    } else if max == g {
        60.0 * ((b - r) / d + 2.0)
    } else {
        60.0 * ((r - g) / d + 4.0)
    };
    let s = if max <= 1e-6 { 0.0 } else { d / max };
    (h, s, max)
}

pub fn u8_to_f(c: [u8; 3]) -> [f32; 3] {
    [
        c[0] as f32 / 255.0,
        c[1] as f32 / 255.0,
        c[2] as f32 / 255.0,
    ]
}

pub fn f_to_u8(c: [f32; 3]) -> [u8; 3] {
    [
        (c[0].clamp(0.0, 1.0) * 255.0 + 0.5) as u8,
        (c[1].clamp(0.0, 1.0) * 255.0 + 0.5) as u8,
        (c[2].clamp(0.0, 1.0) * 255.0 + 0.5) as u8,
    ]
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum BlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl BlendMode {
    pub const ALL: [BlendMode; 16] = [
        BlendMode::Normal,
        BlendMode::Multiply,
        BlendMode::Screen,
        BlendMode::Overlay,
        BlendMode::Darken,
        BlendMode::Lighten,
        BlendMode::ColorDodge,
        BlendMode::ColorBurn,
        BlendMode::HardLight,
        BlendMode::SoftLight,
        BlendMode::Difference,
        BlendMode::Exclusion,
        BlendMode::Hue,
        BlendMode::Saturation,
        BlendMode::Color,
        BlendMode::Luminosity,
    ];

    pub fn label(self) -> &'static str {
        match self {
            BlendMode::Normal => "Normal",
            BlendMode::Multiply => "Multiply",
            BlendMode::Screen => "Screen",
            BlendMode::Overlay => "Overlay",
            BlendMode::Darken => "Darken",
            BlendMode::Lighten => "Lighten",
            BlendMode::ColorDodge => "Color Dodge",
            BlendMode::ColorBurn => "Color Burn",
            BlendMode::HardLight => "Hard Light",
            BlendMode::SoftLight => "Soft Light",
            BlendMode::Difference => "Difference",
            BlendMode::Exclusion => "Exclusion",
            BlendMode::Hue => "Hue",
            BlendMode::Saturation => "Saturation",
            BlendMode::Color => "Color",
            BlendMode::Luminosity => "Luminosity",
        }
    }

    pub fn css(self) -> &'static str {
        match self {
            BlendMode::Normal => "normal",
            BlendMode::Multiply => "multiply",
            BlendMode::Screen => "screen",
            BlendMode::Overlay => "overlay",
            BlendMode::Darken => "darken",
            BlendMode::Lighten => "lighten",
            BlendMode::ColorDodge => "color-dodge",
            BlendMode::ColorBurn => "color-burn",
            BlendMode::HardLight => "hard-light",
            BlendMode::SoftLight => "soft-light",
            BlendMode::Difference => "difference",
            BlendMode::Exclusion => "exclusion",
            BlendMode::Hue => "hue",
            BlendMode::Saturation => "saturation",
            BlendMode::Color => "color",
            BlendMode::Luminosity => "luminosity",
        }
    }

    pub fn from_css(s: &str) -> BlendMode {
        BlendMode::ALL
            .iter()
            .copied()
            .find(|m| m.css() == s)
            .unwrap_or_default()
    }

    /// ORA / SVG composite-op name.
    pub fn ora(self) -> String {
        match self {
            BlendMode::Normal => "svg:src-over".into(),
            m => format!("svg:{}", m.css()),
        }
    }

    /// Photoshop 4-char blend key.
    pub fn psd_key(self) -> &'static [u8; 4] {
        match self {
            BlendMode::Normal => b"norm",
            BlendMode::Multiply => b"mul ",
            BlendMode::Screen => b"scrn",
            BlendMode::Overlay => b"over",
            BlendMode::Darken => b"dark",
            BlendMode::Lighten => b"lite",
            BlendMode::ColorDodge => b"div ",
            BlendMode::ColorBurn => b"idiv",
            BlendMode::HardLight => b"hLit",
            BlendMode::SoftLight => b"sLit",
            BlendMode::Difference => b"diff",
            BlendMode::Exclusion => b"smud",
            BlendMode::Hue => b"hue ",
            BlendMode::Saturation => b"sat ",
            BlendMode::Color => b"colr",
            BlendMode::Luminosity => b"lum ",
        }
    }

    #[inline]
    fn sep(self, b: f32, s: f32) -> f32 {
        match self {
            BlendMode::Multiply => b * s,
            BlendMode::Screen => b + s - b * s,
            BlendMode::Overlay => BlendMode::HardLight.sep(s, b),
            BlendMode::Darken => b.min(s),
            BlendMode::Lighten => b.max(s),
            BlendMode::ColorDodge => {
                if b <= 0.0 {
                    0.0
                } else if s >= 1.0 {
                    1.0
                } else {
                    (b / (1.0 - s)).min(1.0)
                }
            }
            BlendMode::ColorBurn => {
                if b >= 1.0 {
                    1.0
                } else if s <= 0.0 {
                    0.0
                } else {
                    1.0 - ((1.0 - b) / s).min(1.0)
                }
            }
            BlendMode::HardLight => {
                if s <= 0.5 {
                    b * 2.0 * s
                } else {
                    let s2 = 2.0 * s - 1.0;
                    b + s2 - b * s2
                }
            }
            BlendMode::SoftLight => {
                if s <= 0.5 {
                    b - (1.0 - 2.0 * s) * b * (1.0 - b)
                } else {
                    let d = if b <= 0.25 {
                        ((16.0 * b - 12.0) * b + 4.0) * b
                    } else {
                        b.sqrt()
                    };
                    b + (2.0 * s - 1.0) * (d - b)
                }
            }
            BlendMode::Difference => (b - s).abs(),
            BlendMode::Exclusion => b + s - 2.0 * b * s,
            _ => s,
        }
    }

    /// Mix function B(cb, cs) on straight colours.
    #[inline]
    pub fn mix(self, cb: [f32; 3], cs: [f32; 3]) -> [f32; 3] {
        match self {
            BlendMode::Normal => cs,
            BlendMode::Hue => set_lum(set_sat(cs, sat(cb)), lum(cb)),
            BlendMode::Saturation => set_lum(set_sat(cb, sat(cs)), lum(cb)),
            BlendMode::Color => set_lum(cs, lum(cb)),
            BlendMode::Luminosity => set_lum(cb, lum(cs)),
            m => [
                m.sep(cb[0], cs[0]),
                m.sep(cb[1], cs[1]),
                m.sep(cb[2], cs[2]),
            ],
        }
    }
}

#[inline]
fn lum(c: [f32; 3]) -> f32 {
    0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
}
fn clip_color(c: [f32; 3]) -> [f32; 3] {
    let l = lum(c);
    let n = c[0].min(c[1]).min(c[2]);
    let x = c[0].max(c[1]).max(c[2]);
    let mut o = c;
    if n < 0.0 {
        for v in &mut o {
            *v = l + (*v - l) * l / (l - n).max(1e-6);
        }
    }
    if x > 1.0 {
        for v in &mut o {
            *v = l + (*v - l) * (1.0 - l) / (x - l).max(1e-6);
        }
    }
    o
}
fn set_lum(c: [f32; 3], l: f32) -> [f32; 3] {
    let d = l - lum(c);
    clip_color([c[0] + d, c[1] + d, c[2] + d])
}
fn sat(c: [f32; 3]) -> f32 {
    c[0].max(c[1]).max(c[2]) - c[0].min(c[1]).min(c[2])
}
fn set_sat(c: [f32; 3], s: f32) -> [f32; 3] {
    let mx = c[0].max(c[1]).max(c[2]);
    let mn = c[0].min(c[1]).min(c[2]);
    if mx - mn <= 1e-6 {
        return [0.0; 3];
    }
    let mut o = [0.0; 3];
    for i in 0..3 {
        o[i] = (c[i] - mn) * s / (mx - mn);
    }
    o
}

/// Composite a straight-alpha source pixel over a premultiplied accumulator.
/// `acc` is premultiplied RGBA in [0,1]; `src` straight RGB with alpha `sa`.
#[inline]
pub fn composite_over(acc: &mut [f32; 4], src: [f32; 3], sa: f32, mode: BlendMode) {
    if sa <= 0.0 {
        return;
    }
    let ab = acc[3];
    let cs = if mode == BlendMode::Normal || ab <= 0.0 {
        src
    } else {
        let cb = [acc[0] / ab, acc[1] / ab, acc[2] / ab];
        let m = mode.mix(cb, src);
        [
            (1.0 - ab) * src[0] + ab * m[0],
            (1.0 - ab) * src[1] + ab * m[1],
            (1.0 - ab) * src[2] + ab * m[2],
        ]
    };
    let inv = 1.0 - sa;
    acc[0] = cs[0] * sa + acc[0] * inv;
    acc[1] = cs[1] * sa + acc[1] * inv;
    acc[2] = cs[2] * sa + acc[2] * inv;
    acc[3] = sa + ab * inv;
}

/// Straight-alpha source-over of `src` onto `dst` (both u8 RGBA), with source alpha scale `k`.
#[inline]
pub fn over_u8(dst: &mut [u8], src: [u8; 4], k: f32) {
    let sa = src[3] as f32 / 255.0 * k;
    if sa <= 0.0 {
        return;
    }
    let da = dst[3] as f32 / 255.0;
    let oa = sa + da * (1.0 - sa);
    if oa <= 0.0 {
        return;
    }
    for i in 0..3 {
        let c = (src[i] as f32 * sa + dst[i] as f32 * da * (1.0 - sa)) / oa;
        dst[i] = (c + 0.5).clamp(0.0, 255.0) as u8;
    }
    dst[3] = (oa * 255.0 + 0.5) as u8;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip() {
        assert_eq!(parse_hex("#6366f1"), Some([0x63, 0x66, 0xf1]));
        assert_eq!(to_hex([0x63, 0x66, 0xf1]), "#6366f1");
        assert_eq!(parse_hex("zz"), None);
    }

    #[test]
    fn hsv_roundtrip() {
        let c = [0.2, 0.6, 0.9];
        let (h, s, v) = rgb_to_hsv(c);
        let back = hsv_to_rgb(h, s, v);
        for i in 0..3 {
            assert!((c[i] - back[i]).abs() < 1e-4);
        }
    }

    #[test]
    fn multiply_and_screen() {
        assert_eq!(BlendMode::Multiply.mix([0.5; 3], [0.5; 3]), [0.25; 3]);
        assert_eq!(BlendMode::Screen.mix([0.5; 3], [0.5; 3]), [0.75; 3]);
        assert_eq!(BlendMode::from_css("color-dodge"), BlendMode::ColorDodge);
    }

    #[test]
    fn over_opaque_replaces() {
        let mut d = [10, 20, 30, 255];
        over_u8(&mut d, [200, 100, 50, 255], 1.0);
        assert_eq!(d, [200, 100, 50, 255]);
    }
}
