# Changelog

## Layout builder update – 2026-11-20

- Import now uses a full YAML parser. It reads YAML re-saved by Home Assistant's card editor (block style, quotes,
  Windows line endings), a whole dashboard's raw configuration, grid-mode cards and older `x:/y:/w:/h:` layouts,
  and gives a clear message if the YAML can't be read.
- Double-click reliably finishes a roof line, including over a background image. Also new: **Finish line** and **Cancel line** buttons.
- Drawing panels no longer stutters or fails with large photos: the image isn't redrawn while you drag, and the
  browser can't start dragging the image itself.
- The canvas scales to fit the window, and new panel ids carry on from the highest existing number after an import.

## 1.0.0 – first public release

- Two layouts: **grid mode** (rows per string, no coordinates) and **drawing mode** (exact roof plan with SVG outline).
- 11 metrics from PyTap: power, performance, energy today, total energy, voltage in/out, current in/out,
  DC-DC duty cycle, temperature, RSSI – switchable with buttons on the card.
- Per-panel sparklines over 3 h / 24 h / 3 d / 7 d, read from Home Assistant's recorder.
- Summary tiles: installation and per-string power, energy today, performance and trend.
- Day view: step back through previous days to compare each panel's peak, total or average.
- IDs view: shows each optimiser's barcode (from the PyTap device's serial number) to check panel positions.
- Panels with no data are drawn hatched with a red outline.
- Fits the window height on desktop (`max_height`), fills Sections layouts with `grid_options: columns: full`.
- Layout builder (`tools/layout-builder.html`): draw panels over a roof plan image and export the card YAML.
