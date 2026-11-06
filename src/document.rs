//! Document model: layers, animation frames and the tile compositor.

use crate::color::{composite_over, BlendMode};
use crate::tiled::{IRect, Tiled, TILE};

#[derive(Clone, Debug)]
pub struct Layer {
    pub id: u64,
    pub name: String,
    pub visible: bool,
    pub opacity: f32,
    pub blend: BlendMode,
    pub alpha_lock: bool,
    pub clip: bool,
    pub locked: bool,
    pub pixels: Tiled,
    /// Layer mask: alpha channel stores how much of the layer is hidden.
    pub mask: Option<Tiled>,
    pub mask_enabled: bool,
    pub rev: u64,
}

impl Layer {
    pub fn new(id: u64, name: impl Into<String>, w: usize, h: usize) -> Self {
        Self {
            id,
            name: name.into(),
            visible: true,
            opacity: 1.0,
            blend: BlendMode::Normal,
            alpha_lock: false,
            clip: false,
            locked: false,
            pixels: Tiled::new(w, h),
            mask: None,
            mask_enabled: true,
            rev: 0,
        }
    }

    pub fn touch(&mut self) {
        self.rev = self.rev.wrapping_add(1);
    }

    #[inline]
    fn mask_keep_tile(&self, tx: usize, ty: usize, i: usize) -> f32 {
        match (&self.mask, self.mask_enabled) {
            (Some(m), true) => match m.tile(tx, ty) {
                Some(t) => 1.0 - t[i + 3] as f32 / 255.0,
                None => 1.0,
            },
            _ => 1.0,
        }
    }

    #[inline]
    pub fn mask_keep(&self, x: i32, y: i32) -> f32 {
        match (&self.mask, self.mask_enabled) {
            (Some(m), true) => 1.0 - m.get(x, y)[3] as f32 / 255.0,
            _ => 1.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Frame {
    pub layers: Vec<Layer>,
    pub hold: u32,
    pub label: String,
}

#[derive(Clone, Debug)]
pub struct Animation {
    pub frames: Vec<Frame>,
    pub current: usize,
    pub fps: u32,
    pub looping: bool,
    pub onion: bool,
    pub onion_alpha: f32,
    pub onion_before: usize,
    pub onion_after: usize,
}

impl Animation {
    pub fn total_ticks(&self) -> u32 {
        self.frames.iter().map(|f| f.hold.max(1)).sum()
    }
}

#[derive(Clone, Debug)]
pub struct Document {
    pub title: String,
    pub w: usize,
    pub h: usize,
    pub bg: [u8; 3],
    pub bg_visible: bool,
    pub layers: Vec<Layer>,
    pub active: usize,
    pub next_id: u64,
    pub anim: Option<Animation>,
    pub brush_history: Vec<crate::project::BrushHistoryEntry>,
}

impl Document {
    pub fn new(title: impl Into<String>, w: usize, h: usize, bg: [u8; 3]) -> Self {
        let mut d = Self {
            title: title.into(),
            w,
            h,
            bg,
            bg_visible: true,
            layers: Vec::new(),
            active: 0,
            next_id: 1,
            anim: None,
            brush_history: Vec::new(),
        };
        d.add_layer();
        d
    }

    pub fn bounds(&self) -> IRect {
        IRect::new(0, 0, self.w as i32, self.h as i32)
    }

    pub fn alloc_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn active_layer(&self) -> Option<&Layer> {
        self.layers.get(self.active)
    }

    pub fn active_layer_mut(&mut self) -> Option<&mut Layer> {
        self.layers.get_mut(self.active)
    }

    pub fn add_layer(&mut self) -> usize {
        let id = self.alloc_id();
        let n = self.layers.len() + 1;
        let layer = Layer::new(id, format!("Layer {n}"), self.w, self.h);
        let at = if self.layers.is_empty() {
            0
        } else {
            self.active + 1
        };
        self.layers.insert(at, layer);
        self.active = at;
        at
    }

    pub fn add_layer_with(&mut self, name: &str, pixels: Tiled) -> usize {
        let idx = self.add_layer();
        self.layers[idx].name = name.to_string();
        self.layers[idx].pixels = pixels;
        idx
    }

    pub fn duplicate_layer(&mut self, idx: usize) {
        if idx >= self.layers.len() {
            return;
        }
        let mut l = self.layers[idx].clone();
        l.id = self.alloc_id();
        l.name = format!("{} copy", l.name);
        l.touch();
        self.layers.insert(idx + 1, l);
        self.active = idx + 1;
    }

    pub fn delete_layer(&mut self, idx: usize) {
        if self.layers.len() <= 1 || idx >= self.layers.len() {
            return;
        }
        self.layers.remove(idx);
        self.active = self.active.min(self.layers.len() - 1);
    }

    pub fn move_layer(&mut self, idx: usize, to: usize) {
        if idx >= self.layers.len() || to >= self.layers.len() || idx == to {
            return;
        }
        let l = self.layers.remove(idx);
        self.layers.insert(to, l);
        self.active = to;
    }

    /// Merge layer `idx` into the layer below it, baking opacity, blend, mask and clipping.
    pub fn merge_down(&mut self, idx: usize) -> bool {
        if idx == 0 || idx >= self.layers.len() {
            return false;
        }
        let top = self.layers[idx].clone();
        let clip_base = if top.clip {
            Some(self.layers[idx - 1].pixels.clone())
        } else {
            None
        };
        let below = &mut self.layers[idx - 1];
        let b = below.pixels.bounds();
        let below_mask = if below.mask_enabled {
            below.mask.take()
        } else {
            None
        };
        // Bake the lower layer's own mask first so it doesn't affect the merged top.
        if let Some(m) = &below_mask {
            below.pixels.for_each_mut(b, |x, y, p| {
                let keep = 1.0 - m.get(x, y)[3] as f32 / 255.0;
                p[3] = (p[3] as f32 * keep + 0.5) as u8;
            });
        }
        below.mask = None;
        below
            .pixels
            .for_each_mut(top.pixels.content_bounds(), |x, y, p| {
                let s = top.pixels.get(x, y);
                if s[3] == 0 {
                    return;
                }
                let mut a = s[3] as f32 / 255.0 * top.opacity * top.mask_keep(x, y);
                if let Some(cb) = &clip_base {
                    a *= cb.get(x, y)[3] as f32 / 255.0;
                }
                if a <= 0.0 {
                    return;
                }
                let da = p[3] as f32 / 255.0;
                let mut acc = [
                    p[0] as f32 / 255.0 * da,
                    p[1] as f32 / 255.0 * da,
                    p[2] as f32 / 255.0 * da,
                    da,
                ];
                composite_over(
                    &mut acc,
                    [
                        s[0] as f32 / 255.0,
                        s[1] as f32 / 255.0,
                        s[2] as f32 / 255.0,
                    ],
                    a,
                    top.blend,
                );
                write_premul(p, acc);
            });
        below.touch();
        self.layers.remove(idx);
        self.active = idx - 1;
        true
    }

    /// The layer whose alpha clips layer `idx` (the nearest non-clipping layer below).
    pub fn clip_base(&self, idx: usize) -> Option<usize> {
        let mut i = idx;
        while i > 0 {
            i -= 1;
            if !self.layers[i].clip {
                return Some(i);
            }
        }
        None
    }

    /// Composite one 64x64 tile into a premultiplied f32 buffer.
    pub fn composite_tile(
        &self,
        tx: usize,
        ty: usize,
        layers: &[Layer],
        with_bg: bool,
        out: &mut [[f32; 4]],
    ) {
        let bg = if with_bg && self.bg_visible {
            [
                self.bg[0] as f32 / 255.0,
                self.bg[1] as f32 / 255.0,
                self.bg[2] as f32 / 255.0,
                1.0,
            ]
        } else {
            [0.0; 4]
        };
        out.fill(bg);
        for (li, layer) in layers.iter().enumerate() {
            if !layer.visible || layer.opacity <= 0.0 {
                continue;
            }
            let Some(src) = layer.pixels.tile(tx, ty) else {
                continue;
            };
            let clip_tile = if layer.clip {
                match self.clip_base_in(layers, li) {
                    Some(bi) => {
                        let base = &layers[bi];
                        if !base.visible {
                            continue;
                        }
                        match base.pixels.tile(tx, ty) {
                            Some(t) => Some((t, bi)),
                            None => continue,
                        }
                    }
                    None => None,
                }
            } else {
                None
            };
            for (i, output) in out.iter_mut().enumerate() {
                let p = i * 4;
                let sa = src[p + 3];
                if sa == 0 {
                    continue;
                }
                let mut a = sa as f32 / 255.0 * layer.opacity * layer.mask_keep_tile(tx, ty, p);
                if let Some((ct, bi)) = clip_tile {
                    a *= ct[p + 3] as f32 / 255.0 * layers[bi].mask_keep_tile(tx, ty, p);
                }
                if a <= 0.0 {
                    continue;
                }
                composite_over(
                    output,
                    [
                        src[p] as f32 / 255.0,
                        src[p + 1] as f32 / 255.0,
                        src[p + 2] as f32 / 255.0,
                    ],
                    a,
                    layer.blend,
                );
            }
        }
    }

    fn clip_base_in(&self, layers: &[Layer], idx: usize) -> Option<usize> {
        let mut i = idx;
        while i > 0 {
            i -= 1;
            if !layers[i].clip {
                return Some(i);
            }
        }
        None
    }

    /// Composite a rectangle (any alignment) of the given layer stack into premultiplied RGBA8.
    pub fn composite_rect_rgba(&self, layers: &[Layer], rect: IRect, with_bg: bool) -> Vec<u8> {
        let r = rect.intersect(&self.bounds());
        let rw = rect.width() as usize;
        let mut out = vec![0u8; rw * rect.height() as usize * 4];
        if r.is_empty() {
            return out;
        }
        let mut buf = vec![[0f32; 4]; TILE * TILE];
        let tx0 = r.x0 as usize / TILE;
        let ty0 = r.y0 as usize / TILE;
        let tx1 = (r.x1 as usize - 1) / TILE;
        let ty1 = (r.y1 as usize - 1) / TILE;
        for ty in ty0..=ty1 {
            for tx in tx0..=tx1 {
                self.composite_tile(tx, ty, layers, with_bg, &mut buf);
                let bx = (tx * TILE) as i32;
                let by = (ty * TILE) as i32;
                for y in r.y0.max(by)..r.y1.min(by + TILE as i32) {
                    for x in r.x0.max(bx)..r.x1.min(bx + TILE as i32) {
                        let s = buf[((y - by) as usize) * TILE + (x - bx) as usize];
                        let o = ((y - rect.y0) as usize * rw + (x - rect.x0) as usize) * 4;
                        out[o] = (s[0] * 255.0 + 0.5) as u8;
                        out[o + 1] = (s[1] * 255.0 + 0.5) as u8;
                        out[o + 2] = (s[2] * 255.0 + 0.5) as u8;
                        out[o + 3] = (s[3] * 255.0 + 0.5) as u8;
                    }
                }
            }
        }
        out
    }

    /// Flattened artwork as straight-alpha RGBA8 (for export).
    pub fn flatten_layers(&self, layers: &[Layer], with_bg: bool) -> Vec<u8> {
        let mut px = self.composite_rect_rgba(layers, self.bounds(), with_bg);
        unpremultiply(&mut px);
        px
    }

    pub fn flatten(&self, with_bg: bool) -> Vec<u8> {
        self.flatten_layers(&self.layers, with_bg)
    }

    /// Straight RGBA of the composite at one pixel.
    pub fn sample(&self, x: i32, y: i32, with_bg: bool) -> [u8; 4] {
        let mut px =
            self.composite_rect_rgba(&self.layers, IRect::new(x, y, x + 1, y + 1), with_bg);
        unpremultiply(&mut px);
        [px[0], px[1], px[2], px[3]]
    }

    /// Bake a straight-alpha layer copy with opacity, mask and clipping applied (for export).
    pub fn baked_layer(&self, idx: usize) -> Vec<u8> {
        let l = &self.layers[idx];
        let mut flat = l.pixels.to_flat();
        let clip = if l.clip {
            self.clip_base(idx).map(|b| &self.layers[b])
        } else {
            None
        };
        for y in 0..self.h as i32 {
            for x in 0..self.w as i32 {
                let o = (y as usize * self.w + x as usize) * 4;
                if flat[o + 3] == 0 {
                    continue;
                }
                let mut k = l.mask_keep(x, y);
                if let Some(b) = clip {
                    k *= b.pixels.get(x, y)[3] as f32 / 255.0 * b.mask_keep(x, y);
                }
                flat[o + 3] = (flat[o + 3] as f32 * k + 0.5) as u8;
            }
        }
        flat
    }

    // ---------- animation ----------

    pub fn sync_frame(&mut self) {
        if let Some(a) = &mut self.anim {
            let cur = a.current;
            a.frames[cur].layers = self.layers.clone();
        }
    }

    pub fn enable_animation(&mut self) {
        if self.anim.is_none() {
            self.anim = Some(Animation {
                frames: vec![Frame {
                    layers: self.layers.clone(),
                    hold: 1,
                    label: String::new(),
                }],
                current: 0,
                fps: 12,
                looping: true,
                onion: true,
                onion_alpha: 0.25,
                onion_before: 1,
                onion_after: 1,
            });
        }
    }

    pub fn goto_frame(&mut self, idx: usize) {
        self.sync_frame();
        if let Some(a) = &mut self.anim {
            if idx < a.frames.len() {
                a.current = idx;
                self.layers = a.frames[idx].layers.clone();
                self.active = self.active.min(self.layers.len().saturating_sub(1));
            }
        }
    }

    /// Insert a new frame after the current one. `copy` duplicates the current drawing.
    pub fn add_frame(&mut self, copy: bool) {
        self.sync_frame();
        let template: Vec<Layer> = if copy {
            self.layers.clone()
        } else {
            let mut ls = self.layers.clone();
            for l in &mut ls {
                l.pixels = Tiled::new(self.w, self.h);
                l.mask = None;
                l.touch();
            }
            ls
        };
        if let Some(a) = &mut self.anim {
            let at = a.current + 1;
            a.frames.insert(
                at,
                Frame {
                    layers: template,
                    hold: 1,
                    label: String::new(),
                },
            );
            a.current = at;
            self.layers = a.frames[at].layers.clone();
        }
    }

    pub fn delete_frame(&mut self) {
        if let Some(a) = &mut self.anim {
            if a.frames.len() <= 1 {
                return;
            }
            a.frames.remove(a.current);
            a.current = a.current.min(a.frames.len() - 1);
            self.layers = a.frames[a.current].layers.clone();
            self.active = self.active.min(self.layers.len().saturating_sub(1));
        }
    }

    pub fn move_frame(&mut self, delta: i32) {
        self.sync_frame();
        if let Some(a) = &mut self.anim {
            let to = a.current as i32 + delta;
            if to < 0 || to as usize >= a.frames.len() {
                return;
            }
            a.frames.swap(a.current, to as usize);
            a.current = to as usize;
        }
    }

    /// Flattened straight-alpha RGBA of every frame (with holds expanded when `expand_holds`).
    pub fn frame_images(&mut self, expand_holds: bool) -> Vec<(Vec<u8>, u32)> {
        self.sync_frame();
        match &self.anim {
            None => vec![(self.flatten(true), 1)],
            Some(a) => {
                let mut out = Vec::new();
                for f in &a.frames {
                    let img = self.flatten_layers(&f.layers, true);
                    if expand_holds {
                        for _ in 0..f.hold.max(1) {
                            out.push((img.clone(), 1));
                        }
                    } else {
                        out.push((img, f.hold.max(1)));
                    }
                }
                out
            }
        }
    }

    /// Resize the canvas. `scale` resamples pixels, otherwise content is anchored centred.
    pub fn resize(&mut self, nw: usize, nh: usize, scale: bool) {
        self.sync_frame();
        let (ow, oh) = (self.w, self.h);
        let convert = |t: &Tiled| -> Tiled {
            let flat = t.to_flat();
            let out = if scale {
                crate::adjust::resample(&flat, ow, oh, nw, nh)
            } else {
                let mut out = vec![0u8; nw * nh * 4];
                let dx = (nw as i64 - ow as i64) / 2;
                let dy = (nh as i64 - oh as i64) / 2;
                for y in 0..nh as i64 {
                    let sy = y - dy;
                    if sy < 0 || sy >= oh as i64 {
                        continue;
                    }
                    for x in 0..nw as i64 {
                        let sx = x - dx;
                        if sx < 0 || sx >= ow as i64 {
                            continue;
                        }
                        let s = (sy as usize * ow + sx as usize) * 4;
                        let d = (y as usize * nw + x as usize) * 4;
                        out[d..d + 4].copy_from_slice(&flat[s..s + 4]);
                    }
                }
                out
            };
            Tiled::from_flat(nw, nh, &out)
        };
        let fix = |ls: &mut Vec<Layer>| {
            for l in ls.iter_mut() {
                l.pixels = convert(&l.pixels);
                l.mask = l.mask.as_ref().map(convert);
                l.touch();
            }
        };
        fix(&mut self.layers);
        if let Some(a) = &mut self.anim {
            for f in &mut a.frames {
                fix(&mut f.layers);
            }
        }
        self.w = nw;
        self.h = nh;
    }

    pub fn memory_bytes(&self) -> usize {
        self.layers
            .iter()
            .map(|l| l.pixels.bytes() + l.mask.as_ref().map_or(0, |m| m.bytes()))
            .sum()
    }
}

#[inline]
pub fn write_premul(p: &mut [u8], acc: [f32; 4]) {
    let a = acc[3];
    if a <= 0.0 {
        p.copy_from_slice(&[0, 0, 0, 0]);
        return;
    }
    p[0] = (acc[0] / a * 255.0 + 0.5).clamp(0.0, 255.0) as u8;
    p[1] = (acc[1] / a * 255.0 + 0.5).clamp(0.0, 255.0) as u8;
    p[2] = (acc[2] / a * 255.0 + 0.5).clamp(0.0, 255.0) as u8;
    p[3] = (a * 255.0 + 0.5).clamp(0.0, 255.0) as u8;
}

pub fn unpremultiply(px: &mut [u8]) {
    for p in px.chunks_exact_mut(4) {
        let a = p[3] as u32;
        if a == 0 {
            p[0] = 0;
            p[1] = 0;
            p[2] = 0;
        } else if a < 255 {
            for c in &mut p[..3] {
                *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composite_respects_opacity_and_bg() {
        let mut d = Document::new("t", 64, 64, [255, 255, 255]);
        d.layers[0].pixels = Tiled::filled(64, 64, [0, 0, 0, 255]);
        d.layers[0].opacity = 0.5;
        let px = d.sample(3, 3, true);
        assert!((px[0] as i32 - 128).abs() <= 1, "{px:?}");
        assert_eq!(px[3], 255);
    }

    #[test]
    fn clipping_uses_base_alpha() {
        let mut d = Document::new("t", 64, 64, [255, 255, 255]);
        d.layers[0].pixels.put(1, 1, [0, 0, 255, 255]);
        d.add_layer();
        d.layers[1].pixels = Tiled::filled(64, 64, [255, 0, 0, 255]);
        d.layers[1].clip = true;
        assert_eq!(d.sample(1, 1, false), [255, 0, 0, 255]);
        assert_eq!(d.sample(5, 5, false)[3], 0);
    }

    #[test]
    fn merge_down_bakes_layer() {
        let mut d = Document::new("t", 64, 64, [255, 255, 255]);
        d.add_layer();
        d.layers[1].pixels.put(2, 2, [10, 20, 30, 255]);
        assert!(d.merge_down(1));
        assert_eq!(d.layers.len(), 1);
        assert_eq!(d.layers[0].pixels.get(2, 2), [10, 20, 30, 255]);
    }

    #[test]
    fn frames_are_independent() {
        let mut d = Document::new("t", 64, 64, [255, 255, 255]);
        d.enable_animation();
        d.layers[0].pixels.put(0, 0, [1, 1, 1, 255]);
        d.add_frame(false);
        assert_eq!(d.layers[0].pixels.get(0, 0)[3], 0);
        d.goto_frame(0);
        assert_eq!(d.layers[0].pixels.get(0, 0), [1, 1, 1, 255]);
    }
}
