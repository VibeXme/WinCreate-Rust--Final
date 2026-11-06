use crate::document::Document;
use crate::tiled::IRect;
use eframe::egui::{self, Color32, Pos2, Rect, TextureHandle, TextureOptions, Vec2};
use std::collections::HashMap;

const CHUNK: usize = 512;

#[derive(Default)]
pub struct CanvasView {
    pub zoom: f32,
    pub pan: Vec2,
    textures: HashMap<(usize, usize), TextureHandle>,
    dirty: Option<IRect>,
    full_dirty: bool,
}

impl CanvasView {
    pub fn invalidate(&mut self) {
        self.full_dirty = true;
        self.dirty = None;
    }

    pub fn invalidate_rect(&mut self, rect: IRect) {
        self.dirty = Some(self.dirty.map_or(rect, |dirty| dirty.union(&rect)));
    }

    pub fn fit(&mut self, viewport: Rect, w: usize, h: usize) {
        let width = (viewport.width() - 72.0).max(1.0);
        let height = (viewport.height() - 72.0).max(1.0);
        self.zoom = (width / w as f32).min(height / h as f32).clamp(0.015, 16.0);
        self.pan = Vec2::ZERO;
    }

    pub fn canvas_rect(&self, viewport: Rect, w: usize, h: usize) -> Rect {
        Rect::from_center_size(
            viewport.center() + self.pan,
            Vec2::new(w as f32 * self.zoom, h as f32 * self.zoom),
        )
    }

    pub fn screen_to_canvas(&self, point: Pos2, viewport: Rect, w: usize, h: usize) -> (f32, f32) {
        let center = viewport.center() + self.pan;
        (
            (point.x - center.x) / self.zoom + w as f32 * 0.5,
            (point.y - center.y) / self.zoom + h as f32 * 0.5,
        )
    }

    pub fn draw(&mut self, ui: &egui::Ui, ctx: &egui::Context, doc: &Document, viewport: Rect) {
        let painter = ui.painter().with_clip_rect(viewport);
        painter.rect_filled(viewport, 0.0, Color32::from_rgb(20, 21, 27));
        let canvas = self.canvas_rect(viewport, doc.w, doc.h);
        painter.rect_filled(canvas.expand(8.0), 4.0, Color32::from_black_alpha(65));

        let tile_size = 24.0 * self.zoom.max(0.25);
        let first_x = ((canvas.left() - viewport.left()) / tile_size).floor() as i32;
        let first_y = ((canvas.top() - viewport.top()) / tile_size).floor() as i32;
        let last_x = ((canvas.right() - viewport.left()) / tile_size).ceil() as i32;
        let last_y = ((canvas.bottom() - viewport.top()) / tile_size).ceil() as i32;
        for y in first_y.max(0)..last_y {
            for x in first_x.max(0)..last_x {
                let rect = Rect::from_min_size(
                    Pos2::new(
                        viewport.left() + x as f32 * tile_size,
                        viewport.top() + y as f32 * tile_size,
                    ),
                    Vec2::splat(tile_size),
                )
                .intersect(canvas);
                let shade = if (x + y) % 2 == 0 { 74 } else { 92 };
                painter.rect_filled(rect, 0.0, Color32::from_gray(shade));
            }
        }

        for cy in (0..doc.h).step_by(CHUNK) {
            for cx in (0..doc.w).step_by(CHUNK) {
                let key = (cx / CHUNK, cy / CHUNK);
                let chunk = IRect::new(
                    cx as i32,
                    cy as i32,
                    (cx + CHUNK).min(doc.w) as i32,
                    (cy + CHUNK).min(doc.h) as i32,
                );
                let update = self.full_dirty
                    || self
                        .dirty
                        .is_some_and(|dirty| !dirty.intersect(&chunk).is_empty())
                    || !self.textures.contains_key(&key);
                if update {
                    let pixels = doc.composite_rect_rgba(&doc.layers, chunk, true);
                    let image = egui::ColorImage::from_rgba_premultiplied(
                        [chunk.width() as usize, chunk.height() as usize],
                        &pixels,
                    );
                    let options = if self.zoom > 2.0 {
                        TextureOptions::NEAREST
                    } else {
                        TextureOptions::LINEAR
                    };
                    if let Some(texture) = self.textures.get_mut(&key) {
                        texture.set(image, options);
                    } else {
                        let texture =
                            ctx.load_texture(format!("canvas-{}-{}", key.0, key.1), image, options);
                        self.textures.insert(key, texture);
                    }
                }
                if let Some(texture) = self.textures.get(&key) {
                    let destination = Rect::from_min_max(
                        Pos2::new(
                            canvas.left() + cx as f32 * self.zoom,
                            canvas.top() + cy as f32 * self.zoom,
                        ),
                        Pos2::new(
                            canvas.left() + (cx + CHUNK).min(doc.w) as f32 * self.zoom,
                            canvas.top() + (cy + CHUNK).min(doc.h) as f32 * self.zoom,
                        ),
                    );
                    painter.image(
                        texture.id(),
                        destination,
                        Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                        Color32::WHITE,
                    );
                }
            }
        }
        self.dirty = None;
        self.full_dirty = false;
        painter.rect_stroke(
            canvas,
            0.0,
            egui::Stroke::new(1.0_f32, Color32::from_gray(176)),
            egui::StrokeKind::Inside,
        );
    }
}
