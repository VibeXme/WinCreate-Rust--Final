use crate::brush::Symmetry;
use crate::document::Document;
use crate::tiled::IRect;
use eframe::egui::{self, Color32, Pos2, Rect, TextureHandle, TextureOptions, Vec2};
use std::collections::HashMap;

const CHUNK: usize = 512;

pub struct CanvasView {
    pub zoom: f32,
    pub pan: Vec2,
    pub rotation: f32,
    pub flip_x: bool,
    pub grid_visible: bool,
    pub grid_spacing: usize,
    pub trace: Option<TraceReference>,
    textures: HashMap<(usize, usize), TextureHandle>,
    onion_textures: HashMap<(usize, bool), TextureHandle>,
    dirty: Option<IRect>,
    full_dirty: bool,
    last_filter_nearest: Option<bool>,
}

pub struct TraceReference {
    pub size: [usize; 2],
    pub pixels: Vec<u8>,
    pub opacity: f32,
    pub scale: f32,
    pub offset: Vec2,
    pub locked: bool,
    texture: Option<TextureHandle>,
}

impl Default for CanvasView {
    fn default() -> Self {
        Self {
            zoom: 0.0,
            pan: Vec2::ZERO,
            rotation: 0.0,
            flip_x: false,
            grid_visible: false,
            grid_spacing: 64,
            trace: None,
            textures: HashMap::new(),
            onion_textures: HashMap::new(),
            dirty: None,
            full_dirty: true,
            last_filter_nearest: None,
        }
    }
}

impl CanvasView {
    pub fn invalidate(&mut self) {
        self.full_dirty = true;
        self.dirty = None;
        self.onion_textures.clear();
    }

    pub fn invalidate_rect(&mut self, rect: IRect) {
        self.dirty = Some(self.dirty.map_or(rect, |dirty| dirty.union(&rect)));
    }

    pub fn set_trace_reference(&mut self, size: [usize; 2], pixels: Vec<u8>) {
        self.trace = Some(TraceReference {
            size,
            pixels,
            opacity: 0.5,
            scale: 1.0,
            offset: Vec2::ZERO,
            locked: false,
            texture: None,
        });
    }

    pub fn fit(&mut self, viewport: Rect, w: usize, h: usize) {
        let (s, c) = self.rotation.sin_cos();
        let width = w as f32 * c.abs() + h as f32 * s.abs();
        let height = w as f32 * s.abs() + h as f32 * c.abs();
        let scale_x = (viewport.width() - 72.0).max(1.0) / width.max(1.0);
        let scale_y = (viewport.height() - 72.0).max(1.0) / height.max(1.0);
        self.zoom = scale_x.min(scale_y).clamp(0.015, 16.0);
        self.pan = Vec2::ZERO;
    }

    pub fn canvas_rect(&self, viewport: Rect, w: usize, h: usize) -> Rect {
        let corners = self.canvas_corners(viewport, w, h);
        Rect::from_points(&corners)
    }

    pub fn screen_to_canvas(&self, point: Pos2, viewport: Rect, w: usize, h: usize) -> (f32, f32) {
        let delta = point - (viewport.center() + self.pan);
        let (s, c) = self.rotation.sin_cos();
        let mut x = (delta.x * c + delta.y * s) / self.zoom;
        let y = (-delta.x * s + delta.y * c) / self.zoom;
        if self.flip_x {
            x = -x;
        }
        (x + w as f32 * 0.5, y + h as f32 * 0.5)
    }

    pub fn zoom_at(&mut self, point: Pos2, viewport: Rect, w: usize, h: usize, zoom: f32) {
        let canvas_point = self.screen_to_canvas(point, viewport, w, h);
        self.zoom = zoom.clamp(0.02, 16.0);
        let transformed = self.canvas_to_screen(canvas_point.0, canvas_point.1, viewport, w, h);
        self.pan += point - transformed;
    }

    pub(super) fn canvas_to_screen(
        &self,
        x: f32,
        y: f32,
        viewport: Rect,
        w: usize,
        h: usize,
    ) -> Pos2 {
        let mut dx = (x - w as f32 * 0.5) * self.zoom;
        let dy = (y - h as f32 * 0.5) * self.zoom;
        if self.flip_x {
            dx = -dx;
        }
        let (s, c) = self.rotation.sin_cos();
        viewport.center() + self.pan + Vec2::new(dx * c - dy * s, dx * s + dy * c)
    }

    fn canvas_corners(&self, viewport: Rect, w: usize, h: usize) -> [Pos2; 4] {
        [
            self.canvas_to_screen(0.0, 0.0, viewport, w, h),
            self.canvas_to_screen(w as f32, 0.0, viewport, w, h),
            self.canvas_to_screen(w as f32, h as f32, viewport, w, h),
            self.canvas_to_screen(0.0, h as f32, viewport, w, h),
        ]
    }

    fn draw_quad(
        painter: &egui::Painter,
        texture: &TextureHandle,
        points: [Pos2; 4],
        tint: Color32,
    ) {
        let mut mesh = egui::Mesh::with_texture(texture.id());
        mesh.vertices.extend([
            egui::epaint::Vertex {
                pos: points[0],
                uv: Pos2::new(0.0, 0.0),
                color: tint,
            },
            egui::epaint::Vertex {
                pos: points[1],
                uv: Pos2::new(1.0, 0.0),
                color: tint,
            },
            egui::epaint::Vertex {
                pos: points[2],
                uv: Pos2::new(1.0, 1.0),
                color: tint,
            },
            egui::epaint::Vertex {
                pos: points[3],
                uv: Pos2::new(0.0, 1.0),
                color: tint,
            },
        ]);
        mesh.indices.extend([0, 1, 2, 0, 2, 3]);
        painter.add(egui::Shape::mesh(mesh));
    }

    #[allow(clippy::too_many_arguments)]
    fn draw_onion_frame(
        &mut self,
        painter: &egui::Painter,
        ctx: &egui::Context,
        doc: &Document,
        frame_index: usize,
        after: bool,
        alpha: f32,
        viewport: Rect,
    ) {
        let Some(animation) = &doc.anim else { return };
        let Some(frame) = animation.frames.get(frame_index) else {
            return;
        };
        let key = (frame_index, after);
        if let std::collections::hash_map::Entry::Vacant(entry) = self.onion_textures.entry(key) {
            let pixels = doc.flatten_layers(&frame.layers, false);
            let mut tinted = pixels;
            for pixel in tinted.chunks_exact_mut(4) {
                let intensity = pixel[0].max(pixel[1]).max(pixel[2]);
                pixel[0] = if after { 0 } else { intensity };
                pixel[1] = if after { intensity } else { 0 };
                pixel[2] = 0;
            }
            let image = egui::ColorImage::from_rgba_unmultiplied([doc.w, doc.h], &tinted);
            let texture = ctx.load_texture(
                format!("onion-{frame_index}-{after}"),
                image,
                TextureOptions::LINEAR,
            );
            entry.insert(texture);
        }
        let Some(texture) = self.onion_textures.get(&key).cloned() else {
            return;
        };
        let points = self.canvas_corners(viewport, doc.w, doc.h);
        Self::draw_quad(
            painter,
            &texture,
            points,
            Color32::from_white_alpha((alpha.clamp(0.0, 1.0) * 255.0) as u8),
        );
    }

    fn draw_trace(
        &mut self,
        painter: &egui::Painter,
        ctx: &egui::Context,
        viewport: Rect,
        w: usize,
        h: usize,
    ) {
        let Some(reference) = self.trace.as_mut() else {
            return;
        };
        if reference.texture.is_none() {
            let image = egui::ColorImage::from_rgba_unmultiplied(reference.size, &reference.pixels);
            reference.texture =
                Some(ctx.load_texture("trace-reference", image, TextureOptions::LINEAR));
        }
        let (size, scale, offset, opacity, texture) = (
            reference.size,
            reference.scale,
            reference.offset,
            reference.opacity,
            reference.texture.clone(),
        );
        let Some(texture) = texture else { return };
        let cx = w as f32 * 0.5 + offset.x;
        let cy = h as f32 * 0.5 + offset.y;
        let half_w = size[0] as f32 * scale * 0.5;
        let half_h = size[1] as f32 * scale * 0.5;
        let points = [
            self.canvas_to_screen(cx - half_w, cy - half_h, viewport, w, h),
            self.canvas_to_screen(cx + half_w, cy - half_h, viewport, w, h),
            self.canvas_to_screen(cx + half_w, cy + half_h, viewport, w, h),
            self.canvas_to_screen(cx - half_w, cy + half_h, viewport, w, h),
        ];
        Self::draw_quad(
            painter,
            &texture,
            points,
            Color32::from_white_alpha((opacity.clamp(0.0, 1.0) * 255.0) as u8),
        );
    }

    pub fn draw(
        &mut self,
        ui: &egui::Ui,
        ctx: &egui::Context,
        doc: &Document,
        viewport: Rect,
        symmetry: Symmetry,
    ) {
        let painter = ui.painter().with_clip_rect(viewport);
        painter.rect_filled(viewport, 0.0, Color32::from_rgb(20, 21, 27));
        let _canvas = self.canvas_rect(viewport, doc.w, doc.h);
        let corners = self.canvas_corners(viewport, doc.w, doc.h);
        let shadow = corners.map(|point| point + Vec2::splat(8.0));
        painter.add(egui::Shape::convex_polygon(
            shadow.to_vec(),
            Color32::from_black_alpha(65),
            egui::Stroke::NONE,
        ));
        if doc.bg_visible {
            painter.add(egui::Shape::convex_polygon(
                corners.to_vec(),
                Color32::from_rgb(doc.bg[0], doc.bg[1], doc.bg[2]),
                egui::Stroke::NONE,
            ));
        } else {
            let tile = (48.0 / self.zoom.max(0.05)).clamp(16.0, 256.0);
            for y in (0..doc.h).step_by(tile as usize) {
                for x in (0..doc.w).step_by(tile as usize) {
                    let a = self.canvas_to_screen(x as f32, y as f32, viewport, doc.w, doc.h);
                    let b = self.canvas_to_screen(
                        (x as f32 + tile).min(doc.w as f32),
                        y as f32,
                        viewport,
                        doc.w,
                        doc.h,
                    );
                    let c = self.canvas_to_screen(
                        (x as f32 + tile).min(doc.w as f32),
                        (y as f32 + tile).min(doc.h as f32),
                        viewport,
                        doc.w,
                        doc.h,
                    );
                    let d = self.canvas_to_screen(
                        x as f32,
                        (y as f32 + tile).min(doc.h as f32),
                        viewport,
                        doc.w,
                        doc.h,
                    );
                    let shade = if (x / tile as usize + y / tile as usize) % 2 == 0 {
                        74
                    } else {
                        92
                    };
                    painter.add(egui::Shape::convex_polygon(
                        vec![a, b, c, d],
                        Color32::from_gray(shade),
                        egui::Stroke::NONE,
                    ));
                }
            }
        }

        self.draw_trace(&painter, ctx, viewport, doc.w, doc.h);
        if let Some(animation) = &doc.anim {
            if animation.onion {
                for offset in (1..=animation.onion_before.min(animation.frames.len())).rev() {
                    if let Some(index) = animation.current.checked_sub(offset) {
                        self.draw_onion_frame(
                            &painter,
                            ctx,
                            doc,
                            index,
                            false,
                            animation.onion_alpha,
                            viewport,
                        );
                    }
                }
                for offset in 1..=animation
                    .onion_after
                    .min(animation.frames.len().saturating_sub(animation.current + 1))
                {
                    self.draw_onion_frame(
                        &painter,
                        ctx,
                        doc,
                        animation.current + offset,
                        true,
                        animation.onion_alpha,
                        viewport,
                    );
                }
            }
        }

        let nearest = self.zoom > 2.0;
        if self.last_filter_nearest != Some(nearest) {
            self.full_dirty = true;
            self.last_filter_nearest = Some(nearest);
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
                    let options = if nearest {
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
                    let points = [
                        self.canvas_to_screen(cx as f32, cy as f32, viewport, doc.w, doc.h),
                        self.canvas_to_screen(
                            (cx + CHUNK).min(doc.w) as f32,
                            cy as f32,
                            viewport,
                            doc.w,
                            doc.h,
                        ),
                        self.canvas_to_screen(
                            (cx + CHUNK).min(doc.w) as f32,
                            (cy + CHUNK).min(doc.h) as f32,
                            viewport,
                            doc.w,
                            doc.h,
                        ),
                        self.canvas_to_screen(
                            cx as f32,
                            (cy + CHUNK).min(doc.h) as f32,
                            viewport,
                            doc.w,
                            doc.h,
                        ),
                    ];
                    Self::draw_quad(&painter, texture, points, Color32::WHITE);
                }
            }
        }
        self.dirty = None;
        self.full_dirty = false;
        if self.grid_visible && self.grid_spacing > 0 {
            let grid_color = Color32::from_rgba_unmultiplied(190, 190, 210, 80);
            for x in (0..=doc.w).step_by(self.grid_spacing) {
                painter.line_segment(
                    [
                        self.canvas_to_screen(x as f32, 0.0, viewport, doc.w, doc.h),
                        self.canvas_to_screen(x as f32, doc.h as f32, viewport, doc.w, doc.h),
                    ],
                    egui::Stroke::new(1.0_f32, grid_color),
                );
            }
            for y in (0..=doc.h).step_by(self.grid_spacing) {
                painter.line_segment(
                    [
                        self.canvas_to_screen(0.0, y as f32, viewport, doc.w, doc.h),
                        self.canvas_to_screen(doc.w as f32, y as f32, viewport, doc.w, doc.h),
                    ],
                    egui::Stroke::new(1.0_f32, grid_color),
                );
            }
        }
        let axis = Color32::from_rgba_unmultiplied(104, 197, 255, 150);
        if matches!(
            symmetry,
            Symmetry::Vertical | Symmetry::Quadrant | Symmetry::Radial
        ) {
            painter.line_segment(
                [
                    self.canvas_to_screen(doc.w as f32 * 0.5, 0.0, viewport, doc.w, doc.h),
                    self.canvas_to_screen(doc.w as f32 * 0.5, doc.h as f32, viewport, doc.w, doc.h),
                ],
                egui::Stroke::new(1.2_f32, axis),
            );
        }
        if matches!(
            symmetry,
            Symmetry::Horizontal | Symmetry::Quadrant | Symmetry::Radial
        ) {
            painter.line_segment(
                [
                    self.canvas_to_screen(0.0, doc.h as f32 * 0.5, viewport, doc.w, doc.h),
                    self.canvas_to_screen(doc.w as f32, doc.h as f32 * 0.5, viewport, doc.w, doc.h),
                ],
                egui::Stroke::new(1.2_f32, axis),
            );
        }
        painter.add(egui::Shape::closed_line(
            corners.to_vec(),
            egui::Stroke::new(1.0_f32, Color32::from_gray(176)),
        ));
    }
}

use super::*;

impl WinCreateApp {
    pub(super) fn show_canvas(&mut self, ctx: &egui::Context) {
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ctx, |ui| {
                let size = ui.available_size().max(Vec2::splat(100.0));
                let (viewport, response) = ui.allocate_exact_size(size, Sense::click_and_drag());
                let Some(doc) = self.doc.as_ref() else { return };
                if self.canvas.zoom <= 0.0 {
                    self.canvas.fit(viewport, doc.w, doc.h);
                }
                self.canvas.draw(ui, ctx, doc, viewport, self.symmetry);
                self.canvas_input(ctx, response);
            });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screen_canvas_transform_round_trips_with_rotation_and_flip() {
        let view = CanvasView {
            zoom: 1.75,
            pan: Vec2::new(31.0, -14.0),
            rotation: 0.63,
            flip_x: true,
            ..Default::default()
        };
        let viewport = Rect::from_min_size(Pos2::ZERO, Vec2::new(1200.0, 800.0));
        let screen = view.canvas_to_screen(117.25, 93.5, viewport, 320, 240);
        let canvas = view.screen_to_canvas(screen, viewport, 320, 240);
        assert!((canvas.0 - 117.25).abs() < 0.001);
        assert!((canvas.1 - 93.5).abs() < 0.001);
    }
}
