# WinCreate Studio

WinCreate Studio is a native Rust drawing and animation desktop application. The interface is built with `eframe`/`egui`; it does not require a browser or web runtime. The Rust library includes a copy-on-write tiled raster engine, brush renderer, smudge and fill tools, layer compositing, history, project storage, image adjustments, and export support.

## Build and run

```sh
cargo run --release
```

Pass a `.winc`, `.ora`, or supported image path to open it at startup:

```sh
cargo run --release -- picture.winc
```

On Linux, install the native windowing development libraries before building:

```sh
sudo apt install libgtk-3-dev libxkbcommon-dev libwayland-dev
```

## Current features

- Canvas presets and custom dimensions, transparent backgrounds, and animation documents
- Preset brushes, pressure-ready stroke rendering, erasing, smudging, eyedropper, and flood fill
- Tiled canvas rendering, zoom, pan, brush size/opacity controls, and symmetry
- Layer visibility, locking, opacity, blend modes, duplicate, delete, and merge
- Colour picker, hex/RGB controls, quick palettes, and adjustment filters
- Frame timeline with blank/duplicate/delete and frame navigation
- Local gallery, autosave recovery, `.winc` projects, image import, and PNG/JPEG/WebP/BMP, ORA, and PSD export
- Undo/redo and keyboard shortcuts

### Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` / `Ctrl+Shift+S` | Save to gallery / save `.winc` |
| `Ctrl+O` / `Ctrl+E` | Open / export |
| `B`, `E`, `S`, `G`, `I`, `U`, `V`, `H` | Brush, eraser, smudge, fill, picker, shape, move, hand tools |
| `[` / `]` | Decrease / increase brush size |
| `Ctrl+0` | Fit canvas to view |

Video export requires `ffmpeg` on `PATH`.

## Supported formats

- Project: `.winc`
- Layered interchange: `.ora`, `.psd`
- Import: `.winc`, `.ora`, PNG, JPEG, WebP, BMP, GIF
- Export: PNG, JPEG, WebP, BMP, ORA, PSD

## Checks

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```
