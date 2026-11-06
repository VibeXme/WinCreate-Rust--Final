//! Sparse, copy-on-write tiled RGBA images.
//!
//! Tiles are shared through `Arc`, so cloning an image (for undo history or
//! animation frames) is cheap and only touched tiles are ever duplicated.

use std::sync::Arc;

pub const TILE: usize = 64;
pub const TILE_BYTES: usize = TILE * TILE * 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct IRect {
    pub x0: i32,
    pub y0: i32,
    pub x1: i32,
    pub y1: i32,
}

impl IRect {
    pub const EMPTY: IRect = IRect {
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
    };

    pub fn new(x0: i32, y0: i32, x1: i32, y1: i32) -> Self {
        Self { x0, y0, x1, y1 }
    }
    pub fn from_center(x: f32, y: f32, r: f32) -> Self {
        Self::new(
            (x - r).floor() as i32 - 1,
            (y - r).floor() as i32 - 1,
            (x + r).ceil() as i32 + 2,
            (y + r).ceil() as i32 + 2,
        )
    }
    pub fn is_empty(&self) -> bool {
        self.x1 <= self.x0 || self.y1 <= self.y0
    }
    pub fn width(&self) -> i32 {
        (self.x1 - self.x0).max(0)
    }
    pub fn height(&self) -> i32 {
        (self.y1 - self.y0).max(0)
    }
    pub fn union(&self, o: &IRect) -> IRect {
        if self.is_empty() {
            return *o;
        }
        if o.is_empty() {
            return *self;
        }
        IRect::new(
            self.x0.min(o.x0),
            self.y0.min(o.y0),
            self.x1.max(o.x1),
            self.y1.max(o.y1),
        )
    }
    pub fn intersect(&self, o: &IRect) -> IRect {
        let r = IRect::new(
            self.x0.max(o.x0),
            self.y0.max(o.y0),
            self.x1.min(o.x1),
            self.y1.min(o.y1),
        );
        if r.is_empty() {
            IRect::EMPTY
        } else {
            r
        }
    }
    pub fn expand(&self, by: i32) -> IRect {
        IRect::new(self.x0 - by, self.y0 - by, self.x1 + by, self.y1 + by)
    }
}

#[derive(Clone)]
pub struct Tiled {
    pub w: usize,
    pub h: usize,
    pub tw: usize,
    pub th: usize,
    tiles: Vec<Option<Arc<Vec<u8>>>>,
}

impl std::fmt::Debug for Tiled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Tiled({}x{}, {} tiles used)",
            self.w,
            self.h,
            self.used_tiles()
        )
    }
}

impl Tiled {
    pub fn new(w: usize, h: usize) -> Self {
        let tw = w.div_ceil(TILE);
        let th = h.div_ceil(TILE);
        Self {
            w,
            h,
            tw,
            th,
            tiles: vec![None; tw * th],
        }
    }

    pub fn filled(w: usize, h: usize, px: [u8; 4]) -> Self {
        let mut t = Self::new(w, h);
        if px[3] == 0 {
            return t;
        }
        let mut tile = vec![0u8; TILE_BYTES];
        for p in tile.chunks_exact_mut(4) {
            p.copy_from_slice(&px);
        }
        let shared = Arc::new(tile);
        for slot in &mut t.tiles {
            *slot = Some(shared.clone());
        }
        t
    }

    pub fn bounds(&self) -> IRect {
        IRect::new(0, 0, self.w as i32, self.h as i32)
    }

    pub fn used_tiles(&self) -> usize {
        self.tiles.iter().filter(|t| t.is_some()).count()
    }

    pub fn tile(&self, tx: usize, ty: usize) -> Option<&[u8]> {
        self.tiles[ty * self.tw + tx]
            .as_deref()
            .map(|v| v.as_slice())
    }

    pub fn same_tile(&self, other: &Tiled, tx: usize, ty: usize) -> bool {
        match (
            &self.tiles[ty * self.tw + tx],
            &other.tiles[ty * other.tw + tx],
        ) {
            (None, None) => true,
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            _ => false,
        }
    }

    pub fn tile_mut(&mut self, tx: usize, ty: usize) -> &mut [u8] {
        let slot = &mut self.tiles[ty * self.tw + tx];
        if slot.is_none() {
            *slot = Some(Arc::new(vec![0u8; TILE_BYTES]));
        }
        Arc::make_mut(slot.as_mut().unwrap()).as_mut_slice()
    }

    pub fn clear_tile(&mut self, tx: usize, ty: usize) {
        self.tiles[ty * self.tw + tx] = None;
    }

    pub fn set_tile_from(&mut self, other: &Tiled, tx: usize, ty: usize) {
        self.tiles[ty * self.tw + tx] = other.tiles[ty * other.tw + tx].clone();
    }

    #[inline]
    pub fn get(&self, x: i32, y: i32) -> [u8; 4] {
        if x < 0 || y < 0 || x as usize >= self.w || y as usize >= self.h {
            return [0; 4];
        }
        let (x, y) = (x as usize, y as usize);
        match &self.tiles[(y / TILE) * self.tw + x / TILE] {
            None => [0; 4],
            Some(t) => {
                let i = ((y % TILE) * TILE + x % TILE) * 4;
                [t[i], t[i + 1], t[i + 2], t[i + 3]]
            }
        }
    }

    #[inline]
    pub fn put(&mut self, x: i32, y: i32, px: [u8; 4]) {
        if x < 0 || y < 0 || x as usize >= self.w || y as usize >= self.h {
            return;
        }
        let (x, y) = (x as usize, y as usize);
        if px[3] == 0 && self.tiles[(y / TILE) * self.tw + x / TILE].is_none() {
            return;
        }
        let t = self.tile_mut(x / TILE, y / TILE);
        let i = ((y % TILE) * TILE + x % TILE) * 4;
        t[i..i + 4].copy_from_slice(&px);
    }

    /// Visit every pixel inside `rect` (clipped to the image) with mutable access.
    /// Return `false` from the closure when no write is needed so empty tiles stay sparse.
    pub fn for_each_mut(&mut self, rect: IRect, mut f: impl FnMut(i32, i32, &mut [u8])) {
        let r = rect.intersect(&self.bounds());
        if r.is_empty() {
            return;
        }
        let tx0 = r.x0 as usize / TILE;
        let ty0 = r.y0 as usize / TILE;
        let tx1 = (r.x1 as usize - 1) / TILE;
        let ty1 = (r.y1 as usize - 1) / TILE;
        for ty in ty0..=ty1 {
            for tx in tx0..=tx1 {
                let bx = (tx * TILE) as i32;
                let by = (ty * TILE) as i32;
                let lx0 = (r.x0 - bx).max(0) as usize;
                let ly0 = (r.y0 - by).max(0) as usize;
                let lx1 = ((r.x1 - bx) as usize).min(TILE);
                let ly1 = ((r.y1 - by) as usize).min(TILE);
                let tile = self.tile_mut(tx, ty);
                for ly in ly0..ly1 {
                    for lx in lx0..lx1 {
                        let i = (ly * TILE + lx) * 4;
                        f(bx + lx as i32, by + ly as i32, &mut tile[i..i + 4]);
                    }
                }
            }
        }
        self.compact_rect(r);
    }

    /// Drop tiles inside `rect` that became fully transparent.
    pub fn compact_rect(&mut self, rect: IRect) {
        let r = rect.intersect(&self.bounds());
        if r.is_empty() {
            return;
        }
        for ty in (r.y0 as usize / TILE)..=((r.y1 as usize - 1) / TILE) {
            for tx in (r.x0 as usize / TILE)..=((r.x1 as usize - 1) / TILE) {
                let idx = ty * self.tw + tx;
                if let Some(t) = &self.tiles[idx] {
                    if t.chunks_exact(4).all(|p| p[3] == 0) {
                        self.tiles[idx] = None;
                    }
                }
            }
        }
    }

    pub fn read_rect(&self, rect: IRect) -> Vec<u8> {
        let mut out = vec![0u8; (rect.width() * rect.height()) as usize * 4];
        let w = rect.width() as usize;
        for y in rect.y0..rect.y1 {
            for x in rect.x0..rect.x1 {
                let i = ((y - rect.y0) as usize * w + (x - rect.x0) as usize) * 4;
                out[i..i + 4].copy_from_slice(&self.get(x, y));
            }
        }
        out
    }

    pub fn to_flat(&self) -> Vec<u8> {
        let mut out = vec![0u8; self.w * self.h * 4];
        for ty in 0..self.th {
            for tx in 0..self.tw {
                if let Some(t) = self.tile(tx, ty) {
                    let x0 = tx * TILE;
                    let y0 = ty * TILE;
                    let cw = TILE.min(self.w - x0);
                    for ly in 0..TILE.min(self.h - y0) {
                        let src = &t[ly * TILE * 4..(ly * TILE + cw) * 4];
                        let di = ((y0 + ly) * self.w + x0) * 4;
                        out[di..di + cw * 4].copy_from_slice(src);
                    }
                }
            }
        }
        out
    }

    pub fn from_flat(w: usize, h: usize, data: &[u8]) -> Self {
        let mut t = Self::new(w, h);
        t.write_flat(data);
        t
    }

    /// Replace the contents with a flat RGBA buffer, keeping unchanged tiles shared.
    pub fn write_flat(&mut self, data: &[u8]) {
        assert_eq!(data.len(), self.w * self.h * 4);
        let mut buf = vec![0u8; TILE_BYTES];
        for ty in 0..self.th {
            for tx in 0..self.tw {
                buf.fill(0);
                let x0 = tx * TILE;
                let y0 = ty * TILE;
                let cw = TILE.min(self.w - x0);
                let mut any = false;
                for ly in 0..TILE.min(self.h - y0) {
                    let si = ((y0 + ly) * self.w + x0) * 4;
                    let src = &data[si..si + cw * 4];
                    if !any && src.chunks_exact(4).any(|p| p[3] != 0) {
                        any = true;
                    }
                    buf[ly * TILE * 4..(ly * TILE + cw) * 4].copy_from_slice(src);
                }
                let idx = ty * self.tw + tx;
                if !any {
                    self.tiles[idx] = None;
                } else if self.tiles[idx]
                    .as_deref()
                    .map(|v| v.as_slice() != buf.as_slice())
                    .unwrap_or(true)
                {
                    self.tiles[idx] = Some(Arc::new(buf.clone()));
                }
            }
        }
    }

    /// Bounding box of all non-transparent pixels.
    pub fn content_bounds(&self) -> IRect {
        let mut r = IRect::EMPTY;
        for ty in 0..self.th {
            for tx in 0..self.tw {
                if let Some(t) = self.tile(tx, ty) {
                    for ly in 0..TILE {
                        for lx in 0..TILE {
                            if t[(ly * TILE + lx) * 4 + 3] != 0 {
                                let x = (tx * TILE + lx) as i32;
                                let y = (ty * TILE + ly) as i32;
                                r = r.union(&IRect::new(x, y, x + 1, y + 1));
                            }
                        }
                    }
                }
            }
        }
        r.intersect(&self.bounds())
    }

    pub fn is_blank(&self) -> bool {
        self.tiles.iter().all(|t| t.is_none())
    }

    /// Rectangles (in pixels) of tiles that differ from `other`.
    pub fn diff_rect(&self, other: &Tiled) -> IRect {
        let mut r = IRect::EMPTY;
        if self.w != other.w || self.h != other.h {
            return self.bounds();
        }
        for ty in 0..self.th {
            for tx in 0..self.tw {
                if !self.same_tile(other, tx, ty) {
                    let x = (tx * TILE) as i32;
                    let y = (ty * TILE) as i32;
                    r = r.union(&IRect::new(x, y, x + TILE as i32, y + TILE as i32));
                }
            }
        }
        r.intersect(&self.bounds())
    }

    /// Approximate unique memory held by this image in bytes.
    pub fn bytes(&self) -> usize {
        self.used_tiles() * TILE_BYTES
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn put_get_and_flat_roundtrip() {
        let mut t = Tiled::new(130, 70);
        t.put(129, 69, [1, 2, 3, 4]);
        t.put(5, 5, [9, 9, 9, 255]);
        assert_eq!(t.get(129, 69), [1, 2, 3, 4]);
        let flat = t.to_flat();
        let t2 = Tiled::from_flat(130, 70, &flat);
        assert_eq!(t2.get(5, 5), [9, 9, 9, 255]);
        assert_eq!(t2.used_tiles(), 2);
    }

    #[test]
    fn clones_share_tiles_until_written() {
        let mut a = Tiled::filled(128, 128, [255, 0, 0, 255]);
        let b = a.clone();
        a.put(0, 0, [0, 0, 0, 255]);
        assert_eq!(b.get(0, 0), [255, 0, 0, 255]);
        assert!(!a.same_tile(&b, 0, 0));
        assert!(a.same_tile(&b, 1, 1));
        assert_eq!(a.diff_rect(&b), IRect::new(0, 0, 64, 64));
    }

    #[test]
    fn transparent_tiles_are_dropped() {
        let mut t = Tiled::new(64, 64);
        t.put(1, 1, [1, 1, 1, 255]);
        t.for_each_mut(t.bounds(), |_, _, p| p[3] = 0);
        assert!(t.is_blank());
    }
}
