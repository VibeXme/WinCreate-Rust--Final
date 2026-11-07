use super::*;

impl WinCreateApp {
    pub(super) fn show_home(&mut self, ctx: &egui::Context) {
        egui::CentralPanel::default().show(ctx, |ui| {
            if self.workspace.gradients && !self.workspace.high_contrast {
                let rect = ui.max_rect();
                let [r, g, b] = self.workspace.accent_rgb;
                workspace::gradient(ui.painter(), egui::Rect::from_min_size(
                    rect.min, Vec2::new(rect.width(), rect.height().min(340.0))),
                    Color32::from_rgb(16 + r / 12, 20 + g / 12, 27 + b / 12),
                    theme::BACKGROUND);
            }
            // Scroll contents have an unbounded height. Use the finite viewport instead.
            let viewport_height = ui.available_height();
            egui::ScrollArea::vertical().id_salt("home-page").show(ui, |ui| {
            let available = ui.available_size();
            let content_width = available.x.min(1200.0);
            let side_margin = ((available.x - content_width) * 0.5).max(0.0);
            let vertical_margin = ((viewport_height - 760.0) * 0.5).clamp(8.0, 64.0);
            ui.add_space(vertical_margin);
            ui.horizontal(|ui| {
                ui.add_space(side_margin);
                ui.allocate_ui_with_layout(
                    Vec2::new(content_width, (viewport_height - vertical_margin).max(0.0)),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| {
                        ui.horizontal(|ui| {
                            ui.label(egui::RichText::new("W / STUDIO")
                                .strong().color(self.workspace.text_accent()).size(15.0));
                            ui.label(
                                egui::RichText::new("NATIVE PAINT WORKSPACE")
                                    .small()
                                    .color(theme::MUTED),
                            );
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if ui.button("Open file...").clicked() {
                                        self.open_dialog();
                                    }
                                },
                            );
                        });
                        ui.add_space(24.0);
                        ui.label(egui::RichText::new("Make room for your next idea.")
                            .size(32.0).strong().color(theme::TEXT));
                        ui.label(egui::RichText::new(
                            "A blank canvas, a familiar project, or something entirely new.")
                            .color(theme::MUTED));
                        ui.add_space(22.0);
                        let stacked = content_width < 840.0;
                        let gallery_column = if stacked { 0 } else { 1 };
                        ui.columns(if stacked { 1 } else { 2 }, |columns| {
                            egui::Frame::group(columns[0].style())
                                .fill(theme::SURFACE)
                                .inner_margin(egui::Margin::same(16))
                                .show(&mut columns[0], |ui| {
                                ui.heading("New canvas");
                                ui.label(egui::RichText::new("Set up your next artwork.").small().color(theme::MUTED));
                                ui.add_space(8.0);
                                ui.horizontal(|ui| {
                                    ui.label("Title");
                                    ui.text_edit_singleline(&mut self.preset_title);
                                });
                                ui.horizontal(|ui| {
                                    ui.label("Width");
                                    ui.add(
                                        egui::DragValue::new(&mut self.width).range(64..=MAX_EDGE),
                                    );
                                    ui.label("Height");
                                    ui.add(
                                        egui::DragValue::new(&mut self.height).range(64..=MAX_EDGE),
                                    );
                                });
                                ui.horizontal(|ui| {
                                    ui.label("Backdrop");
                                    let mut background = Color32::from_rgb(
                                        self.new_background[0],
                                        self.new_background[1],
                                        self.new_background[2],
                                    );
                                    if ui.color_edit_button_srgba(&mut background).changed() {
                                        self.new_background =
                                            [background.r(), background.g(), background.b()];
                                    }
                                    ui.checkbox(&mut self.transparent, "Transparent");
                                });
                                ui.checkbox(&mut self.animation, "Animation");
                                ui.add_space(6.0);
                                ui.label("Canvas presets");
                                ui.horizontal_wrapped(|ui| {
                                    for (name, w, h, background) in [
                                        ("Full Screen White", 1920, 1080, [255, 255, 255]),
                                        ("Obsidian Dark", 1920, 1080, [12, 12, 18]),
                                        ("OLED Pitch Black", 1920, 1080, [0, 0, 0]),
                                        ("Warm Sketchbook", 1920, 1080, [253, 246, 227]),
                                        ("Square 1:1", 1080, 1080, [255, 255, 255]),
                                        ("Cinema 16:9", 1920, 1080, [255, 255, 255]),
                                        ("Story / Reel 9:16", 1080, 1920, [255, 255, 255]),
                                        ("A4 Print Portrait", 2480, 3508, [255, 255, 255]),
                                    ] {
                                        let (card, response) = ui.allocate_exact_size(
                                            Vec2::new(278.0, 76.0),
                                            egui::Sense::click(),
                                        );
                                        let painter = ui.painter();
                                        painter.rect_filled(
                                            card,
                                            8.0,
                                            if response.hovered() {
                                                Color32::from_rgb(43, 59, 70)
                                            } else {
                                                theme::RAISED
                                            },
                                        );
                                        let aspect = w as f32 / h as f32;
                                        let preview_size = if aspect >= 70.0 / 42.0 {
                                            Vec2::new(70.0, 70.0 / aspect)
                                        } else {
                                            Vec2::new(42.0 * aspect, 42.0)
                                        };
                                        let preview = egui::Rect::from_center_size(
                                            egui::pos2(card.left() + 46.0, card.center().y),
                                            preview_size,
                                        );
                                        painter.rect_filled(
                                            preview,
                                            3.0,
                                            Color32::from_rgb(
                                                background[0],
                                                background[1],
                                                background[2],
                                            ),
                                        );
                                        painter.text(
                                            egui::pos2(card.left() + 88.0, card.top() + 16.0),
                                            egui::Align2::LEFT_TOP,
                                            name,
                                            egui::FontId::proportional(14.0),
                                            Color32::WHITE,
                                        );
                                        painter.text(
                                            egui::pos2(card.left() + 88.0, card.top() + 43.0),
                                            egui::Align2::LEFT_TOP,
                                            format!("{w} x {h}"),
                                            egui::FontId::proportional(12.0),
                                            Color32::from_gray(180),
                                        );
                                        if response.clicked() {
                                            self.width = w;
                                            self.height = h;
                                            self.new_background = background;
                                        }
                                    }
                                });
                                ui.add_space(6.0);
                                if ui
                                    .add_sized(
                                        [ui.available_width(), 44.0],
                                        egui::Button::new(
                                            egui::RichText::new("Create canvas").strong()
                                                .color(self.workspace.accent_ink()))
                                            .fill(self.workspace.accent()),
                                    )
                                    .clicked()
                                {
                                    self.create_document(
                                        self.width,
                                        self.height,
                                        self.preset_title.clone(),
                                        self.transparent,
                                        self.animation,
                                    );
                                }
                            });
                            columns[gallery_column].add_space(if stacked { 16.0 } else { 0.0 });
                            egui::Frame::group(columns[gallery_column].style())
                                .fill(theme::SURFACE)
                                .inner_margin(egui::Margin::same(16))
                                .show(&mut columns[gallery_column], |ui| {
                                ui.heading("Your workspace");
                                ui.label(egui::RichText::new("Pick up where you left off.").small().color(theme::MUTED));
                                ui.add_space(8.0);
                                if let Some(entry) = self.recovery.clone() {
                                    ui.horizontal(|ui| {
                                        ui.label(format!("Recovery available: {}", entry.title));
                                        if ui.button("Restore").clicked() {
                                            if let Err(error) = self.load_path(&entry.project_path)
                                            {
                                                self.notify(format!("Restore failed: {error:#}"));
                                            } else {
                                                self.recovery = None;
                                            }
                                        }
                                        if ui.button("Discard").clicked() {
                                            storage::clear_recovery();
                                            self.recovery = None;
                                        }
                                    });
                                }
                                self.gallery = storage::list_gallery();
                                if self.gallery.is_empty() {
                                    ui.label("Your saved projects will appear here.");
                                }
                                egui::ScrollArea::vertical()
                                    .max_height(520.0)
                                    .show(ui, |ui| {
                                        ui.horizontal_wrapped(|ui| {
                                            for entry in self.gallery.clone() {
                                                ui.group(|ui| {
                                                    ui.set_width(280.0);
                                                    if let Some(texture) =
                                                        self.gallery_thumbnail(ctx, &entry)
                                                    {
                                                        ui.image((
                                                            texture.id(),
                                                            Vec2::new(256.0, 160.0),
                                                        ));
                                                    } else {
                                                        ui.allocate_ui(
                                                            Vec2::new(256.0, 160.0),
                                                            |ui| {
                                                                ui.centered_and_justified(|ui| {
                                                                    ui.label("Preview unavailable");
                                                                });
                                                            },
                                                        );
                                                    }
                                                    ui.label(
                                                        egui::RichText::new(&entry.title).strong(),
                                                    );
                                                    ui.label(format!(
                                                        "{} x {}{}",
                                                        entry.width,
                                                        entry.height,
                                                        if entry.animation {
                                                            " | Animation"
                                                        } else {
                                                            ""
                                                        }
                                                    ));
                                                    ui.horizontal(|ui| {
                                                        if ui.button("Open").clicked() {
                                                            if let Err(error) =
                                                                self.load_path(&entry.project_path)
                                                            {
                                                                self.notify(format!(
                                                                    "Open failed: {error:#}"
                                                                ));
                                                            } else {
                                                                self.gallery_id =
                                                                    Some(entry.id.clone());
                                                            }
                                                        }
                                                        if ui.button("Delete").clicked() {
                                                            self.delete_confirmation =
                                                                Some(entry.clone());
                                                        }
                                                    });
                                                });
                                            }
                                        });
                                    });
                                ui.add_space(8.0);
                                if ui.button("Import image as canvas...").clicked() {
                                    if let Some(path) = rfd::FileDialog::new()
                                        .add_filter(
                                            "Image",
                                            &["png", "jpg", "jpeg", "webp", "bmp", "gif"],
                                        )
                                        .pick_file()
                                    {
                                        if let Err(error) = self.load_path(&path) {
                                            self.notify(format!("Import failed: {error:#}"));
                                        }
                                    }
                                }
                            });
                        });
                        ui.add_space(14.0);
                        ui.label(
                            egui::RichText::new(
                                "Brush | layers | animation | .winc / ORA / PSD / image export",
                            )
                            .small().color(theme::MUTED),
                        );
                    },
                );
            });
            });
        });
        if let Some(entry) = self.delete_confirmation.clone() {
            let mut dismiss = false;
            egui::Window::new("Delete artwork?")
                .id(egui::Id::new("delete-gallery-entry"))
                .collapsible(false)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.label(format!("Delete \"{}\" from the gallery?", entry.title));
                    ui.horizontal(|ui| {
                        if ui.button("Cancel").clicked() {
                            dismiss = true;
                        }
                        if ui.button("Delete").clicked() {
                            match storage::delete_entry(&entry) {
                                Ok(()) => {
                                    self.gallery_thumbnails.remove(&entry.id);
                                    self.gallery = storage::list_gallery();
                                }
                                Err(error) => {
                                    self.notify(format!("Delete failed: {error:#}"));
                                }
                            }
                            dismiss = true;
                        }
                    });
                });
            if dismiss {
                self.delete_confirmation = None;
            }
        }
    }

    fn gallery_thumbnail(
        &mut self,
        ctx: &egui::Context,
        entry: &GalleryEntry,
    ) -> Option<egui::TextureHandle> {
        if let Some(texture) = self.gallery_thumbnails.get(&entry.id) {
            return Some(texture.clone());
        }
        let bytes = std::fs::read(&entry.thumb_path).ok()?;
        let image = image::load_from_memory(&bytes).ok()?.to_rgba8();
        let dimensions = [image.width() as usize, image.height() as usize];
        let texture = ctx.load_texture(
            format!("gallery-{}", entry.id),
            egui::ColorImage::from_rgba_unmultiplied(dimensions, image.as_raw()),
            egui::TextureOptions::LINEAR,
        );
        self.gallery_thumbnails
            .insert(entry.id.clone(), texture.clone());
        Some(texture)
    }

    pub(super) fn create_document(
        &mut self,
        width: usize,
        height: usize,
        title: String,
        transparent: bool,
        animation: bool,
    ) {
        let mut doc = Document::new(
            title,
            width.clamp(64, MAX_EDGE),
            height.clamp(64, MAX_EDGE),
            self.new_background,
        );
        doc.bg_visible = !transparent;
        if animation {
            doc.enable_animation();
        }
        self.begin_document(doc);
    }
}
