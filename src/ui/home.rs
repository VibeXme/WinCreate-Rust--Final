use super::*;

impl WinCreateApp {
    pub(super) fn show_home(&mut self, ctx: &egui::Context) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.add_space(12.0);
            ui.horizontal(|ui| {
                ui.heading("WinCreate Studio");
                ui.label(
                    egui::RichText::new("NATIVE PAINT WORKSPACE")
                        .small()
                        .color(Color32::from_rgb(140, 150, 180)),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("Open file…").clicked() {
                        self.open_dialog();
                    }
                });
            });
            ui.add_space(12.0);
            ui.columns(2, |columns| {
                let ui = &mut columns[0];
                ui.group(|ui| {
                    ui.heading("Start a canvas");
                    ui.horizontal(|ui| {
                        ui.label("Title");
                        ui.text_edit_singleline(&mut self.preset_title);
                    });
                    ui.horizontal(|ui| {
                        ui.label("Width");
                        ui.add(egui::DragValue::new(&mut self.width).range(64..=MAX_EDGE));
                        ui.label("Height");
                        ui.add(egui::DragValue::new(&mut self.height).range(64..=MAX_EDGE));
                    });
                    ui.horizontal(|ui| {
                        ui.label("Backdrop");
                        let mut background = Color32::from_rgb(
                            self.new_background[0],
                            self.new_background[1],
                            self.new_background[2],
                        );
                        if ui.color_edit_button_srgba(&mut background).changed() {
                            self.new_background = [background.r(), background.g(), background.b()];
                        }
                        ui.checkbox(&mut self.transparent, "Transparent");
                    });
                    ui.checkbox(&mut self.animation, "Animation");
                    ui.add_space(8.0);
                    ui.label("Canvas presets");
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
                        if ui.button(format!("{name}  ·  {w} × {h}")).clicked() {
                            self.width = w;
                            self.height = h;
                            self.new_background = background;
                        }
                    }
                    ui.add_space(8.0);
                    if ui
                        .button(egui::RichText::new("Create canvas").strong())
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
                let ui = &mut columns[1];
                ui.group(|ui| {
                    ui.heading("Gallery");
                    if let Some(entry) = self.recovery.clone() {
                        ui.horizontal(|ui| {
                            ui.label(format!("Recovery available: {}", entry.title));
                            if ui.button("Restore").clicked() {
                                if let Err(error) = self.load_path(&entry.project_path) {
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
                        .max_height(460.0)
                        .show(ui, |ui| {
                            ui.horizontal_wrapped(|ui| {
                                for entry in self.gallery.clone() {
                                    ui.group(|ui| {
                                        ui.set_width(176.0);
                                        if let Some(texture) = self.gallery_thumbnail(ctx, &entry) {
                                            ui.image((texture.id(), Vec2::new(160.0, 105.0)));
                                        } else {
                                            ui.allocate_ui(Vec2::new(160.0, 105.0), |ui| {
                                                ui.centered_and_justified(|ui| {
                                                    ui.label("Preview unavailable");
                                                });
                                            });
                                        }
                                        ui.label(egui::RichText::new(&entry.title).strong());
                                        ui.label(format!(
                                            "{} × {}{}",
                                            entry.width,
                                            entry.height,
                                            if entry.animation { " · Animation" } else { "" }
                                        ));
                                        ui.horizontal(|ui| {
                                            if ui.button("Open").clicked() {
                                                if let Err(error) =
                                                    self.load_path(&entry.project_path)
                                                {
                                                    self.notify(format!("Open failed: {error:#}"));
                                                } else {
                                                    self.gallery_id = Some(entry.id.clone());
                                                }
                                            }
                                            if ui.button("Delete").clicked() {
                                                self.delete_confirmation = Some(entry.clone());
                                            }
                                        });
                                    });
                                }
                            });
                        });
                    ui.add_space(8.0);
                    if ui.button("Import image as canvas…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("Image", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
                            .pick_file()
                        {
                            if let Err(error) = self.load_path(&path) {
                                self.notify(format!("Import failed: {error:#}"));
                            }
                        }
                    }
                });
            });
            ui.add_space(20.0);
            ui.label(
                egui::RichText::new(
                    "Brush • layers • animation • .winc / ORA / PSD / image export",
                )
                .color(Color32::GRAY),
            );
        });
        if let Some(entry) = self.delete_confirmation.clone() {
            let mut dismiss = false;
            egui::Window::new("Delete artwork?")
                .id(egui::Id::new("delete-gallery-entry"))
                .collapsible(false)
                .resizable(false)
                .show(ctx, |ui| {
                    ui.label(format!("Delete “{}” from the gallery?", entry.title));
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
