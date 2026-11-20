# Ideas and roadmap

Contributions are welcome. Open an issue first for anything large.

## Card

- **Visual editor:** a `getConfigElement()` so simple settings (title, peak, metrics, history) can be changed in the UI instead of YAML.
- **Underperformance highlighting:** outline any panel that is more than X % below its string's median right now, or over the day.
- **Day-vs-day overlay:** draw yesterday's (or a chosen day's) sparkline faintly behind today's in each panel.
- **Mismatch score per string:** the spread between the best and worst panel, as a single number on the string tile.
- **Landscape and rotated panels in drawing mode:** an optional `rotate:` per panel for arrays that aren't square to the plan.
- **Export:** download the current view as PNG, or the day's per-panel energy as CSV.
- **Translations:** labels are English only at present.

## Layout builder

- Snap-to-neighbour alignment guides, multi-select and move.
- Import directly from a Tigo installer layout export, if a format can be identified.

## Integrations

- **Other data sources:** `prefix` and `summary_prefix` already let the card read differently named sensors. Testing with taptap-to-MQTT setups and other optimiser integrations would make that official.
- **Automations to ship as blueprints:**
  - an optimiser-offline alert (already in `examples/`), as an importable blueprint;
  - an underperforming-panel alert, comparing each panel to its string median at midday;
  - Solcast-driven overnight battery charging.

## Project

- Get listed in the **HACS default store**, so users needn't add a custom repository. This needs a release, a repository description and topics, and the HACS validation action passing.
- Publish releases with a changelog, and attach `tigo-array-card.js` as a release asset.
- Add screenshots from real installations of different shapes (contributions welcome, with barcodes hidden).
