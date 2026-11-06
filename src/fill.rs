//! Flood fill with colour tolerance, gap closing and under-ink expansion.

#[derive(Clone, Copy, Debug)]
pub struct FillOptions {
    pub tolerance: f32,
    pub gap: u32,
    pub expand: u32,
}

impl Default for FillOptions {
    fn default() -> Self {
        Self {
            tolerance: 42.0,
            gap: 4,
            expand: 3,
        }
    }
}

#[inline]
fn similar(a: &[u8], b: &[u8], tol: f32) -> bool {
    if a[3] < 8 && b[3] < 8 {
        return true;
    }
    let da = (a[3] as f32 - b[3] as f32).abs();
    let ka = a[3] as f32 / 255.0;
    let kb = b[3] as f32 / 255.0;
    let mut m = da;
    for i in 0..3 {
        // Compare colours composited over white so faint pixels don't read as their raw RGB.
        let ca = 255.0 + (a[i] as f32 - 255.0) * ka;
        let cb = 255.0 + (b[i] as f32 - 255.0) * kb;
        m = m.max((ca - cb).abs());
    }
    m <= tol
}

/// Chamfer (3-4) distance to the nearest `true` cell, in pixels.
pub fn distance_to(mask: &[bool], w: usize, h: usize) -> Vec<f32> {
    const INF: i32 = i32::MAX / 4;
    let mut d: Vec<i32> = mask.iter().map(|&m| if m { 0 } else { INF }).collect();
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let mut v = d[i];
            if x > 0 {
                v = v.min(d[i - 1] + 3);
            }
            if y > 0 {
                v = v.min(d[i - w] + 3);
                if x > 0 {
                    v = v.min(d[i - w - 1] + 4);
                }
                if x + 1 < w {
                    v = v.min(d[i - w + 1] + 4);
                }
            }
            d[i] = v;
        }
    }
    for y in (0..h).rev() {
        for x in (0..w).rev() {
            let i = y * w + x;
            let mut v = d[i];
            if x + 1 < w {
                v = v.min(d[i + 1] + 3);
            }
            if y + 1 < h {
                v = v.min(d[i + w] + 3);
                if x + 1 < w {
                    v = v.min(d[i + w + 1] + 4);
                }
                if x > 0 {
                    v = v.min(d[i + w - 1] + 4);
                }
            }
            d[i] = v;
        }
    }
    d.into_iter().map(|v| v as f32 / 3.0).collect()
}

fn flood(passable: &[bool], w: usize, h: usize, sx: usize, sy: usize) -> Vec<bool> {
    let mut region = vec![false; w * h];
    if !passable[sy * w + sx] {
        return region;
    }
    let mut stack = vec![(sx, sy)];
    while let Some((x, y)) = stack.pop() {
        let row = y * w;
        if region[row + x] || !passable[row + x] {
            continue;
        }
        let mut l = x;
        while l > 0 && passable[row + l - 1] && !region[row + l - 1] {
            l -= 1;
        }
        let mut r = x;
        while r + 1 < w && passable[row + r + 1] && !region[row + r + 1] {
            r += 1;
        }
        for i in l..=r {
            region[row + i] = true;
            if y > 0 && passable[row - w + i] && !region[row - w + i] {
                stack.push((i, y - 1));
            }
            if y + 1 < h && passable[row + w + i] && !region[row + w + i] {
                stack.push((i, y + 1));
            }
        }
    }
    region
}

/// Returns per-pixel fill coverage (0..=255) or `None` when the seed is outside.
pub fn flood_fill(
    reference: &[u8],
    w: usize,
    h: usize,
    sx: i32,
    sy: i32,
    opts: FillOptions,
) -> Option<Vec<u8>> {
    if sx < 0 || sy < 0 || sx as usize >= w || sy as usize >= h {
        return None;
    }
    let (sx, sy) = (sx as usize, sy as usize);
    let si = (sy * w + sx) * 4;
    let seed = [
        reference[si],
        reference[si + 1],
        reference[si + 2],
        reference[si + 3],
    ];
    let open: Vec<bool> = reference
        .chunks_exact(4)
        .map(|p| similar(p, &seed, opts.tolerance))
        .collect();
    let mut region = Vec::new();
    if opts.gap > 0 {
        let barrier: Vec<bool> = open.iter().map(|o| !o).collect();
        let dist = distance_to(&barrier, w, h);
        let passable: Vec<bool> = dist.iter().map(|&d| d > opts.gap as f32).collect();
        if passable[sy * w + sx] {
            region = flood(&passable, w, h, sx, sy);
        }
    }
    if region.is_empty() || !region.iter().any(|&r| r) {
        region = flood(&open, w, h, sx, sy);
    }
    let grow = if opts.gap > 0 {
        opts.gap + opts.expand
    } else {
        opts.expand
    } as f32;
    let mut out = vec![0u8; w * h];
    if grow > 0.0 {
        let dist = distance_to(&region, w, h);
        for (i, d) in dist.iter().enumerate() {
            if *d <= grow {
                out[i] = 255;
            } else if *d <= grow + 1.0 {
                out[i] = ((grow + 1.0 - d) * 255.0) as u8;
            }
        }
    } else {
        for (i, r) in region.iter().enumerate() {
            if *r {
                out[i] = 255;
            }
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canvas_with_ring(gap: bool) -> (Vec<u8>, usize, usize) {
        let (w, h) = (100, 100);
        let mut px = vec![0u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let on_ring = (20..=80).contains(&x)
                    && (20..=80).contains(&y)
                    && (x <= 22 || x >= 78 || y <= 22 || y >= 78);
                let in_gap = gap && x >= 78 && (48..=50).contains(&y);
                if on_ring && !in_gap {
                    let i = (y * w + x) * 4;
                    px[i + 3] = 255;
                }
            }
        }
        (px, w, h)
    }

    #[test]
    fn fills_inside_closed_shape_only() {
        let (px, w, h) = canvas_with_ring(false);
        let m = flood_fill(
            &px,
            w,
            h,
            50,
            50,
            FillOptions {
                tolerance: 30.0,
                gap: 0,
                expand: 0,
            },
        )
        .unwrap();
        assert_eq!(m[50 * w + 50], 255);
        assert_eq!(m[5 * w + 5], 0);
    }

    #[test]
    fn gap_closing_stops_leaks() {
        let (px, w, h) = canvas_with_ring(true);
        let leak = flood_fill(
            &px,
            w,
            h,
            50,
            50,
            FillOptions {
                tolerance: 30.0,
                gap: 0,
                expand: 0,
            },
        )
        .unwrap();
        assert_eq!(
            leak[5 * w + 5],
            255,
            "without gap closing the fill should leak"
        );
        let closed = flood_fill(
            &px,
            w,
            h,
            50,
            50,
            FillOptions {
                tolerance: 30.0,
                gap: 3,
                expand: 1,
            },
        )
        .unwrap();
        assert_eq!(closed[50 * w + 50], 255);
        assert_eq!(closed[5 * w + 5], 0);
    }
}
