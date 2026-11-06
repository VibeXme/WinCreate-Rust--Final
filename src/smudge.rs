//! Wet smudge: drags a pigment carrier across the layer with the Rust wet-mix kernel.

use crate::engine::{blend_smudge_dab_rgba, plan_smudge_steps};
use crate::tiled::{IRect, Tiled};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct SmudgeSettings {
    pub strength: f32,
    pub pickup: f32,
    pub softness: f32,
    pub preserve_coverage: bool,
}

impl Default for SmudgeSettings {
    fn default() -> Self {
        Self::preset("blend")
    }
}

impl SmudgeSettings {
    pub const PRESETS: [(&'static str, &'static str); 4] = [
        ("blend", "Blend"),
        ("smear", "Long smear"),
        ("soft", "Soft blur"),
        ("push", "Push paint"),
    ];

    pub fn preset(name: &str) -> Self {
        match name {
            "smear" => Self {
                strength: 0.85,
                pickup: 0.12,
                softness: 0.45,
                preserve_coverage: false,
            },
            "soft" => Self {
                strength: 0.4,
                pickup: 0.55,
                softness: 0.85,
                preserve_coverage: true,
            },
            "push" => Self {
                strength: 0.95,
                pickup: 0.05,
                softness: 0.25,
                preserve_coverage: false,
            },
            _ => Self {
                strength: 0.6,
                pickup: 0.32,
                softness: 0.6,
                preserve_coverage: true,
            },
        }
    }
}

pub struct SmudgeStroke {
    pub settings: SmudgeSettings,
    radius: f32,
    size: usize,
    carrier: Vec<u8>,
    weights: Vec<f32>,
    last: Option<(f32, f32)>,
}

impl SmudgeStroke {
    pub fn new(settings: SmudgeSettings, brush_size: f32) -> Self {
        let radius = (brush_size * 0.5).clamp(1.0, 400.0);
        let size = (radius * 2.0).ceil() as usize + 2;
        let mut weights = vec![0f32; size * size];
        let c = size as f32 / 2.0;
        let hard = 1.0 - settings.softness.clamp(0.0, 0.98);
        for y in 0..size {
            for x in 0..size {
                let d = ((x as f32 + 0.5 - c).hypot(y as f32 + 0.5 - c)) / radius;
                weights[y * size + x] = if d >= 1.0 {
                    0.0
                } else if d <= hard {
                    1.0
                } else {
                    let t = (d - hard) / (1.0 - hard);
                    1.0 - t * t * (3.0 - 2.0 * t)
                };
            }
        }
        Self {
            settings,
            radius,
            size,
            carrier: vec![0; size * size * 4],
            weights,
            last: None,
        }
    }

    fn origin(&self, x: f32, y: f32) -> (i32, i32) {
        (
            (x - self.size as f32 / 2.0).round() as i32,
            (y - self.size as f32 / 2.0).round() as i32,
        )
    }

    fn read(&self, layer: &Tiled, ox: i32, oy: i32) -> Vec<u8> {
        layer.read_rect(IRect::new(
            ox,
            oy,
            ox + self.size as i32,
            oy + self.size as i32,
        ))
    }

    fn dab(&mut self, layer: &mut Tiled, x: f32, y: f32, pressure: f32) -> IRect {
        let (ox, oy) = self.origin(x, y);
        let rect = IRect::new(ox, oy, ox + self.size as i32, oy + self.size as i32);
        let mut dst = self.read(layer, ox, oy);
        let strength = self.settings.strength * pressure.clamp(0.05, 1.0);
        let changed = blend_smudge_dab_rgba(
            &mut dst,
            &mut self.carrier,
            &self.weights,
            strength,
            self.settings.pickup,
            self.settings.preserve_coverage,
        );
        if changed {
            let size = self.size;
            layer.for_each_mut(rect, |px, py, p| {
                let i = (((py - oy) as usize) * size + (px - ox) as usize) * 4;
                p.copy_from_slice(&dst[i..i + 4]);
            });
        }
        rect
    }

    pub fn move_to(&mut self, layer: &mut Tiled, x: f32, y: f32, pressure: f32) -> IRect {
        let Some((lx, ly)) = self.last else {
            let (ox, oy) = self.origin(x, y);
            self.carrier = self.read(layer, ox, oy);
            self.last = Some((x, y));
            return IRect::EMPTY;
        };
        let plan = plan_smudge_steps((x - lx) as f64, (y - ly) as f64, self.radius as f64, 0.1);
        if plan.distance <= 0.0 {
            return IRect::EMPTY;
        }
        let mut dirty = IRect::EMPTY;
        for i in 1..=plan.steps {
            let t = i as f32 / plan.steps as f32;
            dirty = dirty.union(&self.dab(layer, lx + (x - lx) * t, ly + (y - ly) * t, pressure));
        }
        self.last = Some((x, y));
        dirty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smudge_drags_colour_into_empty_area() {
        let mut layer = Tiled::new(128, 64);
        for y in 0..64 {
            for x in 0..40 {
                layer.put(x, y, [255, 0, 0, 255]);
            }
        }
        let mut s = SmudgeStroke::new(SmudgeSettings::preset("smear"), 20.0);
        s.move_to(&mut layer, 30.0, 32.0, 1.0);
        for i in 0..30 {
            s.move_to(&mut layer, 30.0 + i as f32 * 2.0, 32.0, 1.0);
        }
        assert!(layer.get(50, 32)[3] > 0, "paint was not dragged");
    }
}
