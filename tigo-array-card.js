/*
 * Tigo Array Card - a roof-layout heatmap for Tigo TS4 optimisers in Home Assistant
 * https://github.com/RootCNC/tigo-array-card     (MIT licence)
 *
 * Reads the per-optimiser sensors created by the PyTap integration
 * (https://github.com/azebro/pytap) and draws each panel where it sits on your roof,
 * coloured by power, performance, energy, voltage, current, duty cycle, temperature or RSSI,
 * with a sparkline per panel, per-string summary tiles and a day-by-day history view.
 *
 * Full documentation: see README.md in the repository.
 *
 * Minimal config (grid mode):
 *   type: custom:tigo-array-card
 *   strings:
 *     - name: South
 *       rows:
 *         - [south_1, south_2, south_3]
 *
 * Drawing mode (exact roof plan): give view_box, outline and panels with at: [x, y, w, h].
 */

const METRICS = {
  power:            { label: "Power", unit: "W",   dp: 0, scale: "peak", agg: "max" },
  performance:      { label: "Perf",  unit: "%",   dp: 0, scale: "pct", agg: "max" },
  daily_energy:     { label: "Today", unit: "Wh",  dp: 0, scale: "rel", agg: "max", aggLabel: "day total" },
  total_energy:     { label: "Total", unit: "Wh",  dp: 0, scale: "rel", agg: "last" },
  voltage_in:       { label: "V in",  unit: "V",   dp: 1, scale: "rel", agg: "max" },
  voltage_out:      { label: "V out", unit: "V",   dp: 1, scale: "rel", agg: "max" },
  current_in:       { label: "I in",  unit: "A",   dp: 2, scale: "rel", agg: "max" },
  current_out:      { label: "I out", unit: "A",   dp: 2, scale: "rel", agg: "max" },
  dc_dc_duty_cycle: { label: "Duty",  unit: "%",   dp: 0, scale: "pct", agg: "mean" },
  temperature:      { label: "Temp",  unit: "\u00b0C", dp: 0, scale: "rel", hot: true, agg: "max" },
  rssi:             { label: "RSSI",  unit: "dBm", dp: 0, scale: "rel", agg: "mean" },
};
const AGG_LABEL = { max: "day peak", mean: "day average", last: "end of day" };
const fmtVal = (v, M) => (M.unit === "Wh" && v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(M.dp));

const VERSION = "1.0.0";
const PALETTE = ["#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#14b8a6", "#f97316", "#eab308", "#ec4899"];
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const shortName = (id) => {
  const m = String(id).match(/^([a-z]+)(_middle)?_0*(\d+)$/i);
  return m ? m[1][0].toUpperCase() + (m[2] ? "M" : "") + m[3] : id;
};

class TigoArrayCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.panels) && !(Array.isArray(config.strings) && config.strings.length)) {
      throw new Error("tigo-array-card: 'strings' or 'panels' is required");
    }
    this._cfg = {
      title: "Panels",
      peak: 460,
      metric: "power",
      aspect: 0.6,
      prefix: "sensor.tigo_ts4_",
      summary_prefix: "sensor.tigo_",
      history_hours: 24,
      max_height: "max(260px, calc(100vh - 330px))",
      panel_width: 96,
      ...config,
    };
    this._hours = Number(this._cfg.history_hours) || 0;
    this._hist = {};
    this._histKey = null;
    this._histAt = 0;
    this._strNames = config.panels
      ? (Object.keys(config.string_colours || {}).length
        ? Object.keys(config.string_colours)
        : [...new Set(config.panels.map((p) => p.string).filter(Boolean))])
      : config.strings.map((st) => st.name);
    this._sumKeys = this._cfg.summary === false ? [] : ["installation", ...this._strNames.map((n) => "string_" + slug(n))];
    this._histSum = {};
    this._ids = config.panels
      ? config.panels.map((p) => p.id).filter(Boolean)
      : config.strings.flatMap((st) => st.rows.flat().filter(Boolean));
    this._metric = METRICS[this._cfg.metric] ? this._cfg.metric : "power";
    this._lastKey = null;

    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const m = ev.target.closest("[data-m]");
        if (m) {
          this._metric = m.dataset.m;
          this._lastKey = null;
          this._render();
          this._loadHistory();
          return;
        }
        const dn = ev.target.closest("[data-d]");
        if (dn) {
          const d = Number(dn.dataset.d), t = new Date();
          t.setHours(0, 0, 0, 0);
          const today = t.getTime(), cur = this._day;
          const shift = (ms, n) => { const x = new Date(ms); x.setDate(x.getDate() + n); return x.getTime(); };
          if (d === 0) this._day = null;
          else if (d < 0) this._day = cur == null ? today : shift(cur, -1);
          else this._day = cur == null || cur >= today ? null : shift(cur, 1);
          this._lastKey = null;
          this._render();
          this._loadHistory();
          return;
        }
        if (ev.target.closest("[data-i]")) {
          this._showIds = !this._showIds;
          this._lastKey = null;
          this._render();
          return;
        }
        const sp = ev.target.closest("[data-s]");
        if (sp) {
          this._hours = Number(sp.dataset.s);
          this._lastKey = null;
          this._render();
          this._loadHistory();
          return;
        }
        const p = ev.target.closest("[data-e]");
        if (p) {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            detail: { entityId: p.dataset.e }, bubbles: true, composed: true,
          }));
        }
      });
    }
  }

  static getStubConfig() {
    return {
      title: "Panels",
      peak: 400,
      strings: [{ name: "South", rows: [["south_1", "south_2", "south_3"], ["south_4", "south_5", "south_6"]] }],
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    this._loadHistory();
  }

  // optimiser ID (barcode): panel config > entity attributes > device registry
  _ident(eid, p) {
    if (p && p.barcode) return String(p.barcode);
    const h = this._hass, a = h.states[eid]?.attributes || {};
    for (const k of ["barcode", "serial_number", "serial", "optimizer_id", "module_id"]) if (a[k]) return String(a[k]);
    const dev = h.devices?.[h.entities?.[eid]?.device_id];
    if (!dev) return "";
    if (dev.serial_number) return String(dev.serial_number);
    const idf = (dev.identifiers || []).map((i) => String(i[1] ?? i)).find(Boolean);
    return idf || dev.name || "";
  }

  async _loadHistory() {
    const hours = this._hours, hass = this._hass, day = this._day ?? null;
    if ((!hours && day == null) || !hass || !hass.callWS) return;
    const mk = this._metric, key = day != null ? mk + "|d" + day : mk + "|" + hours;
    if (this._histKey === key && (Date.now() - this._histAt < 300000 || (day != null && this._histAt > day + 90e6))) return;
    if (this._histBusy === key) return;
    this._histBusy = key;
    const pIds = this._ids.map((id) => `${this._cfg.prefix}${id}_${mk}`);
    const sIds = this._sumKeys.map((k) => `${this._cfg.summary_prefix}${k}_power`);
    const eIds = day != null ? this._sumKeys.map((k) => `${this._cfg.summary_prefix}${k}_daily_energy`) : [];
    const ids = [...pIds, ...sIds, ...eIds];
    const end = day != null ? new Date(Math.min(day + 864e5, Date.now())) : new Date();
    const start = day != null ? new Date(day) : new Date(end.getTime() - hours * 3600e3);
    const fin = (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
    const out = {};
    for (const period of day != null ? ["5minute", "hour"] : [hours <= 48 ? "5minute" : "hour"]) {
      try {
        const st = await hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: start.toISOString(), end_time: end.toISOString(),
          statistic_ids: ids, period, types: ["mean", "max", "state"],
        });
        ids.forEach((id) => {
          out[id] = (st[id] || []).map((r) => {
            const v = r.mean ?? r.state;
            return [new Date(r.start).getTime(), v, r.max ?? v];
          }).filter(fin);
        });
      } catch (e) { /* fall through to raw history */ }
      if (ids.some((id) => out[id] && out[id].length > 1)) break;
    }
    const missing = ids.filter((id) => !(out[id] && out[id].length > 1));
    if (missing.length) {
      try {
        const h = await hass.callWS({
          type: "history/history_during_period",
          start_time: start.toISOString(), end_time: end.toISOString(),
          entity_ids: missing, minimal_response: true, no_attributes: true, significant_changes_only: false,
        });
        missing.forEach((id) => {
          out[id] = (h[id] || []).map((x) => [(x.lu ?? x.lc) * 1000, parseFloat(x.s), parseFloat(x.s)]).filter(fin);
        });
      } catch (e) { /* no history available */ }
    }
    if (this._histBusy !== key) return;
    this._histBusy = null;
    if ((this._day != null ? mk + "|d" + this._day : mk + "|" + this._hours) !== key) return;
    // bucket every series onto a common time grid
    const N = 48, t0 = start.getTime(), span = day != null ? 864e5 : end.getTime() - t0, b = {};
    const agg = {};
    ids.forEach((id) => {
      const r = out[id] || [];
      if (!r.length) return;
      agg[id] = {
        max: Math.max(...r.map((x) => x[2])),
        mean: r.reduce((a, x) => a + x[1], 0) / r.length,
        last: r[r.length - 1][1],
      };
    });
    this._histAgg = agg;
    ids.forEach((id) => {
      const sum = new Array(N).fill(0), cnt = new Array(N).fill(0);
      (out[id] || []).forEach(([t, v]) => {
        const i = Math.min(N - 1, Math.max(0, Math.floor(((t - t0) / span) * N)));
        sum[i] += v; cnt[i]++;
      });
      b[id] = sum.map((x, i) => (cnt[i] ? x / cnt[i] : null));
    });
    this._hist = {}; this._histSum = {};
    pIds.forEach((id) => { this._hist[id] = b[id]; });
    sIds.forEach((id) => { this._histSum[id] = b[id]; });
    this._histN = N; this._histKey = key; this._histAt = Date.now();
    this._lastKey = null;
    this._render();
  }

  // sparkline as SVG path data inside the box x,y,w,h (shared scale across all panels)
  _spark(d, x, y, w, h, lo, hi) {
    if (!d) return null;
    const N = this._histN, pts = [];
    d.forEach((v, i) => {
      if (v === null) return;
      const f = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
      pts.push([x + (i / (N - 1)) * w, y + h - f * h]);
    });
    if (pts.length < 2) return null;
    const line = "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${y + h} L${pts[0][0].toFixed(1)} ${y + h} Z`;
    return { line, area };
  }

  getCardSize() {
    if (this._cfg.panels) return 8;
    return 2 + this._cfg.strings.reduce((n, s) => n + s.rows.length, 0);
  }
  getGridOptions() { return { columns: "full", min_columns: 6 }; }

  _num(eid) {
    const s = this._hass.states[eid];
    if (!s) return { state: "missing" };
    const v = parseFloat(s.state);
    return isNaN(v) ? { state: s.state } : { v };
  }

  _colour(f, hot) {
    f = Math.max(0, Math.min(1, f));
    if (hot) return { bg: `hsl(${210 - 210 * f},70%,42%)`, fg: "#fff" };
    return { bg: `hsl(42,95%,${8 + f * 52}%)`, fg: f > 0.6 ? "#1a1a1a" : "#fff" };
  }

  _render() {
    if (!this._hass || !this._cfg || !this.shadowRoot) return;
    const c = this._cfg, mk = this._metric, M = METRICS[mk];

    // gather values
    const panels = [];
    if (c.panels) c.panels.forEach((p) => p.id && panels.push(p.id));
    else c.strings.forEach((s) => s.rows.forEach((r) => r.forEach((id) => {
      if (id) panels.push(id);
    })));
    const stringNames = c.panels
      ? Object.keys(c.string_colours || {}).length
        ? Object.keys(c.string_colours)
        : [...new Set(c.panels.map((p) => p.string).filter(Boolean))]
      : c.strings.map((s) => s.name);
    const dayMode = this._day != null;
    const histOn = (dayMode || this._hours > 0) &&
      this._histKey === (dayMode ? mk + "|d" + this._day : mk + "|" + this._hours);
    const vals = {};
    panels.forEach((id) => {
      const eid = `${c.prefix}${id}_${mk}`;
      if (!dayMode) { vals[id] = this._num(eid); return; }
      const a = histOn ? (this._histAgg || {})[eid] : null;
      vals[id] = a ? { v: a[M.agg] } : { state: histOn ? "no data for this day" : "loading" };
    });
    const dayLabel = !dayMode ? "" : (() => {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      return this._day === t.getTime() ? "Today"
        : new Date(this._day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    })();
    let hLo = 0, hHi = 1;
    if (histOn) {
      const all = Object.values(this._hist).flat().filter((v) => v !== null);
      if (all.length) {
        hHi = Math.max(...all);
        hLo = M.scale === "rel" ? Math.min(...all) : 0;
        if (hHi <= hLo) hHi = hLo + 1;
      }
    }
    const key = (this._showIds ? "I" : "") + mk + this._hours + "d" + this._day + (histOn ? this._histAt : "") + JSON.stringify(vals) +
      this._sumKeys.map((k) => ["power", "daily_energy", "performance"].map((x) =>
        this._hass.states[`${this._cfg.summary_prefix}${k}_${x}`]?.state).join()).join() +
      stringNames.map((n) => this._hass.states[`${this._cfg.summary_prefix}string_${slug(n)}_power`]?.state).join();
    if (key === this._lastKey) return;
    this._lastKey = key;

    const nums = Object.values(vals).filter((x) => x.v !== undefined).map((x) => x.v);
    const lo = nums.length ? Math.min(...nums) : 0;
    const hi = nums.length ? Math.max(...nums) : 1;

    const frac = (v) => {
      if (M.scale === "peak") return v / c.peak;
      if (M.scale === "pct") return v / 100;
      return hi > lo ? (v - lo) / (hi - lo) : 0.5;
    };

    const tile = (id) => {
      if (!id) return `<div class="gap"></div>`;
      const eid = `${c.prefix}${id}_${mk}`;
      const x = vals[id];
      if (x.v === undefined) {
        return `<div class="p dead" data-e="${eid}" title="${eid}: ${x.state}">
                  <span class="n">${shortName(id)}</span><span class="v">\u2013</span></div>`;
      }
      const { bg, fg } = this._colour(frac(x.v), M.hot);
      return `<div class="p" data-e="${eid}" style="background:${bg};color:${fg}"
                   title="${this._hass.states[eid]?.attributes.friendly_name || eid} | ID: ${this._ident(eid)}">
                <span class="n">${shortName(id)}</span>
                <span class="v">${fmtVal(x.v, M)}</span>${(() => {
                  const sk = histOn && this._spark(this._hist[eid], 0, 0, 100, 40, hLo, hHi);
                  return sk ? `<svg class="spk" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <path d="${sk.area}" fill="${fg}" opacity=".18"/>
                    <path d="${sk.line}" fill="none" stroke="${fg}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>` : "";
                })()}</div>`;
    };

    const totalOf = (n) => {
      const t = this._hass.states[`${this._cfg.summary_prefix}string_${slug(n)}_power`];
      return t && !isNaN(parseFloat(t.state)) ? `${Math.round(parseFloat(t.state))} W` : "\u2013";
    };

    const sc0 = c.string_colours || {};
    const fmtP = (w) => (w >= 1000 ? (w / 1000).toFixed(2) + " kW" : Math.round(w) + " W");
    const fmtE = (wh) => (wh >= 1000 ? (wh / 1000).toFixed(2) + " kWh" : Math.round(wh) + " Wh");
    const summary = this._sumKeys.length ? `<div class="sum">${this._sumKeys.map((k, i) => {
      const name = i === 0 ? "Total" : stringNames[i - 1];
      const col = i === 0 ? "#f59e0b" : (sc0[name] || PALETTE[(i - 1) % PALETTE.length]);
      const pe = `${this._cfg.summary_prefix}${k}_power`;
      const P = this._num(pe), E = this._num(`${this._cfg.summary_prefix}${k}_daily_energy`), F = this._num(`${this._cfg.summary_prefix}${k}_performance`);
      const d = histOn ? this._histSum[pe] : null;
      const mx = d ? Math.max(1, ...d.filter((v) => v !== null)) : 1;
      const sk = d && this._spark(d, 0, 2, 100, 26, 0, mx);
      let sub = [E.v !== undefined ? fmtE(E.v) + " today" : null, F.v !== undefined ? F.v.toFixed(0) + " %" : null]
        .filter(Boolean).join(" \u00b7 ");
      let main = P.v !== undefined ? fmtP(P.v) : "\u2013";
      if (dayMode) {
        const A = histOn ? this._histAgg || {} : {};
        const a = A[pe], ea = A[`${this._cfg.summary_prefix}${k}_daily_energy`];
        const integ = d ? d.reduce((t, v) => t + (v || 0), 0) * (24 / this._histN) : null;
        const en = ea ? ea.max : integ;
        main = !histOn ? "\u2026" : (a && en != null ? fmtE(en) : "\u2013");
        sub = !histOn ? "loading" : (a ? "peak " + fmtP(a.max) : "no data");
      }
      return `<div class="st" data-e="${pe}" style="--c:${col}">
        <div class="sn"><i></i>${name}</div>
        <div class="sv">${main}</div>
        <div class="ss">${sub}</div>
        ${sk ? `<svg class="ssp" viewBox="0 0 100 30" preserveAspectRatio="none">
          <path d="${sk.area}" fill="var(--c)" opacity=".2"/>
          <path d="${sk.line}" fill="none" stroke="var(--c)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`
          : `<div class="ssp"></div>`}
      </div>`;
    }).join("")}</div>` : "";

    let body;
    if (c.panels) {
      const sc = c.string_colours || {};
      const esc = (t) => String(t).replace(/[<>&"]/g, "");
      const geo = (p) => {
        const a = Array.isArray(p.at) ? p.at : [p.x, p.y ?? p.true ?? p.Y, p.w, p.h];
        const [x, y, w, h] = a.map(Number);
        return { ...p, x, y, w, h, ok: [x, y, w, h].every(Number.isFinite) };
      };
      const geoPanels = c.panels.map(geo);
      const bad = geoPanels.filter((p) => !p.ok).length;
      const rects = geoPanels.filter((p) => p.ok).map((p) => {
        const eid = `${c.prefix}${p.id}_${mk}`;
        const x = vals[p.id];
        const stroke = sc[p.string] || "var(--primary-text-color)";
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const fs = Math.min(p.w, p.h) * 0.26;
        const name = p.label || shortName(p.id);
        let fill, fg, val;
        if (x.v === undefined) { fill = "url(#tac-hatch)"; fg = "#f87171"; val = "\u2013"; }
        else { ({ bg: fill, fg } = this._colour(frac(x.v), M.hot)); val = fmtVal(x.v, M); }
        const title = this._hass.states[eid]?.attributes.friendly_name || eid;
        let spark = "", ny = cy - fs * 0.55, vy = cy + fs * 0.75;
        const ident = this._ident(eid, p);
        if (histOn && x.v !== undefined && !this._showIds) {
          const top = p.y + fs * 2.35;
          const sk = this._spark(this._hist[eid], p.x + 5, top, p.w - 10, p.y + p.h - 5 - top, hLo, hHi);
          if (sk) {
            ny = p.y + fs * 0.75; vy = p.y + fs * 1.7;
            spark = `<path d="${sk.area}" fill="${fg}" opacity=".18"/>
                     <path d="${sk.line}" fill="none" stroke="${fg}" stroke-width="1.6" stroke-linejoin="round" opacity=".9"/>`;
          }
        }
        return `<g class="sp" data-e="${eid}"><title>${esc(title)}: ${x.v === undefined ? x.state : val + " " + M.unit}${ident ? "\nOptimiser ID: " + esc(ident) : ""}\nConfig id: ${esc(p.id)}</title>
          <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="${fill}"
                stroke="${stroke}" stroke-width="4"/>
          ${spark}
          <text x="${cx}" y="${ny}" font-size="${fs * 0.75}" fill="${fg}" opacity=".85">${esc(name)}</text>
          <text x="${cx}" y="${vy}" font-size="${this._showIds ? Math.min(fs, (p.w - 8) / (Math.max(4, (ident || "?").length) * 0.6)) : fs}" font-weight="700" fill="${fg}">${this._showIds ? esc(ident || "?") : val}</text></g>`;
      }).join("");
      const lines = (c.outline || []).map((d) => `<path d="${d}"/>`).join("");
      const chips = stringNames.map((n) =>
        `<span class="chip"><i style="background:${sc[n] || "var(--primary-color)"}"></i>${n} <b>${totalOf(n)}</b></span>`).join("");
      const warn = bad ? `<div class="warn">${bad} of ${geoPanels.length} panels have no valid position - use  at: [x, y, w, h]</div>` : "";
      body = `${summary ? "" : `<div class="chips">${chips}</div>`}${warn}
        <svg viewBox="${c.view_box || "0 0 1000 700"}" preserveAspectRatio="xMidYMid meet">
          <defs><pattern id="tac-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="#2a2a2a"/><rect width="5" height="10" fill="#3a3a3a"/></pattern></defs>
          <g class="roof">${lines}</g>${rects}</svg>`;
    } else {
    const strings = c.strings.map((s) => {
      const cols = Math.max(...s.rows.map((r) => r.length));
      const tot = this._hass.states[`${this._cfg.summary_prefix}string_${slug(s.name)}_power`];
      const totTxt = tot && !isNaN(parseFloat(tot.state)) ? `${Math.round(parseFloat(tot.state))} W` : "";
      const rows = s.rows.map((r) =>
        `<div class="row" style="grid-template-columns:repeat(${cols},minmax(0,${Number(c.panel_width) > 0 ? Number(c.panel_width) + "px" : "1fr"}))">
           ${r.map(tile).join("")}</div>`).join("");
      return `<div class="str"><div class="sh"><span>${s.name}</span><span class="tot">${totTxt}</span></div>${rows}</div>`;
    }).join("");
    body = strings;
    }

    const shown = Array.isArray(c.metrics) && c.metrics.length ? c.metrics.filter((k) => METRICS[k]) : Object.keys(METRICS);
    const tabs = shown.map((k) => [k, METRICS[k]]).map(([k, m]) =>
      `<button data-m="${k}" class="${k === mk ? "on" : ""}">${m.label}</button>`).join("");

    const legend = M.scale === "peak" ? `0 \u2013 ${c.peak} ${M.unit}`
      : M.scale === "pct" ? `0 \u2013 100 %`
      : `${lo.toFixed(M.dp)} \u2013 ${hi.toFixed(M.dp)} ${M.unit} (relative)`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding: 12px 12px 10px; }
        .hd { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        .t { font-size:1.1em; font-weight:500; }
        .tabs { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
        button { border:1px solid var(--divider-color); background:none; color:var(--primary-text-color);
                 border-radius:12px; padding:2px 10px; font-size:.8em; cursor:pointer; }
        button.on { background:var(--primary-color); color:var(--text-primary-color,#fff); border-color:var(--primary-color); }
        .str { margin-bottom:12px; }
        .sh { display:flex; justify-content:space-between; font-size:.85em; color:var(--secondary-text-color); margin-bottom:4px; }
        .tot { font-weight:600; color:var(--primary-text-color); }
        .row { display:grid; gap:4px; margin-bottom:4px; }
        .p, .gap { aspect-ratio:${c.aspect}; border-radius:4px; }
        .p { display:flex; flex-direction:column; justify-content:flex-start; align-items:center; gap:1px;
             padding:3px 0; cursor:pointer; box-sizing:border-box; transition:background .6s;
             box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); min-width:0; overflow:hidden; }
        .p:hover { outline:2px solid var(--primary-color); }
        .n { font-size:.65em; opacity:.85; }
        .v { font-size:.8em; font-weight:600; }
        .dead { background:repeating-linear-gradient(45deg,#3a3a3a 0 6px,#2a2a2a 6px 12px); color:#e66;
                box-shadow: inset 0 0 0 1px #e66; }
        svg { width:100%; height:auto; max-height:${c.max_height}; display:block; margin-bottom:6px; }
        .roof path { fill:none; stroke:var(--secondary-text-color); stroke-width:4; stroke-linejoin:round; opacity:.7; }
        .sp { cursor:pointer; }
        .sp rect { transition: fill .6s; }
        .sp:hover rect { stroke-width:7; }
        .sp text { text-anchor:middle; dominant-baseline:middle; font-family:var(--paper-font-body1_-_font-family, sans-serif); pointer-events:none; }
        .chips { display:flex; gap:12px; flex-wrap:wrap; font-size:.85em; color:var(--secondary-text-color); margin-bottom:6px; }
        .chip i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
        .chip b { color:var(--primary-text-color); margin-left:3px; }
        .warn { color:var(--error-color,#e66); font-size:.85em; margin-bottom:6px; }
        .sum { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; margin-bottom:12px; }
        .st { background:var(--secondary-background-color, rgba(127,127,127,.12)); border-radius:10px; padding:8px 10px 0;
              border-top:3px solid var(--c); cursor:pointer; overflow:hidden; display:flex; flex-direction:column; }
        .st:hover { filter:brightness(1.08); }
        .sn { font-size:.8em; color:var(--secondary-text-color); }
        .sn i { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--c); margin-right:6px; }
        .sv { font-size:1.45em; font-weight:600; line-height:1.3; }
        .ss { font-size:.75em; color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ssp { display:block; width:calc(100% + 20px); margin:4px -10px 0; height:34px; }
        .dl { min-width:84px; text-align:center; font-size:.85em; font-weight:600; align-self:center; }
        button:disabled { opacity:.35; cursor:default; }
        .ft .tabs { justify-content:flex-start; align-items:center; }
        .ft { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
        .p { position:relative; }
        .spk { position:absolute; left:3px; right:3px; bottom:3px; width:calc(100% - 6px); height:40%; pointer-events:none; }
        .lg { font-size:.75em; color:var(--secondary-text-color); text-align:right; }
      </style>
      <ha-card>
        <div class="hd"><span class="t">${c.title}</span><div class="tabs">${tabs}</div></div>
        ${summary}
        ${body}
        <div class="ft"><div class="tabs">
          <button data-d="-1" title="Previous day">\u25c0</button>
          <span class="dl">${dayMode ? dayLabel : "Live"}</span>
          <button data-d="1" title="Next day" ${dayMode ? "" : "disabled"}>\u25b6</button>
          ${dayMode ? `<button data-d="0">Live</button>` : [[0, "Off"], [3, "3h"], [24, "24h"], [72, "3d"], [168, "7d"]].map(([hv, l]) =>
          `<button data-s="${hv}" class="${hv === this._hours ? "on" : ""}">${l}</button>`).join("")}
          <button data-i class="${this._showIds ? "on" : ""}" style="margin-left:8px">IDs</button></div>
        <div class="lg">${M.label}: ${legend}${dayMode ? ` \u00b7 ${dayLabel}: ${M.aggLabel || AGG_LABEL[M.agg]}, 00:00\u201324:00`
          : histOn ? ` \u00b7 trend: last ${this._hours < 48 ? this._hours + " h" : this._hours / 24 + " d"}` : ""} \u00b7 tap a panel for detail</div></div>
      </ha-card>`;
  }
}

if (!customElements.get("tigo-array-card")) {
  customElements.define("tigo-array-card", TigoArrayCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "tigo-array-card",
    name: "Tigo Array Card",
    description: "Roof-layout heatmap of Tigo TS4 optimisers (PyTap)",
    preview: false,
    documentationURL: "https://github.com/RootCNC/tigo-array-card",
  });
  console.info(
    `%c TIGO-ARRAY-CARD %c v${VERSION} `,
    "color:#fff;background:#f59e0b;font-weight:700",
    "color:#f59e0b;background:#1f2937"
  );
}
