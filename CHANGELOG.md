# Changelog

## Layout builder update – 2026-11-20

- Import now uses a full YAML parser. It reads YAML re-saved by Home Assistant's card editor (block style, quotes,
  Windows line endings), a whole dashboard's raw configuration, grid-mode cards and older `x:/y:/w:/h:` layouts,
  and gives a clear message if the YAML can't be read.
- Double-click reliably finishes a roof line, including over a background image. Also new: **Finish line** and **Cancel line** buttons.
- Drawing panels no longer stutters or fails with large photos: the image isn't redrawn while you drag, and the
  browser can't start dragging the image itself.
- Roof lines are now editable in Select mode: click a line to select it, drag it to move it, drag a corner point
  to reshape it (Ctrl/Shift straightens it against its neighbour), double-click to add a point, and Delete to remove
  a point or the whole line. Closed shapes stay closed.
- The Finish/Cancel line bar only shows while a line is being drawn. Switching tool keeps a line in progress
  instead of discarding it, and Enter no longer also re-triggers whichever sidebar button was last clicked.
- Hold **Ctrl** or **Shift** to draw roof lines exactly horizontal or vertical, or to move a panel in a straight line.
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
