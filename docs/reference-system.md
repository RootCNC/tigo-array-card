# The reference installation

The card was built and tested on this system. Serial numbers, barcodes, addresses and account details have been left out on purpose.

## Hardware

| Part | Details |
|---|---|
| Location | UK, domestic, installed mid-2026 |
| Panels | 27 × 460 Wp (DM460G12RT-G48HBB), **12.42 kWp** |
| Optimisers | Tigo **TS4-A-O** on every panel (optimisation, monitoring and rapid shutdown) |
| Tigo comms | Tigo **CCA** plus **two TAPs**, mounted inside the loft at opposite sides of the array |
| Inverter | FoxESS **KH10** hybrid, with a FoxESS battery |
| Strings | MPPT 1 – **South**, 11 panels · MPPT 2 – **West**, 8 panels · MPPT 3 – **East**, 8 panels · MPPT 4 – unused |
| Local data | 2 × Waveshare RS485 TO POE ETH (B) on a PoE switch: one on the Tigo gateway bus, one on the inverter's RS485 port |
| Home Assistant | Home Assistant OS on an x86-64 machine (2026.11) |

### Roof

Three roof faces around a central flat section:

- **South:** one row of 11 portrait panels across the main roof.
- **West:** 5 panels on the left wing and 3 in a column on the centre-right.
- **East:** 5 panels on the right wing and 3 in a column on the centre-left.

East and West are each split across two parts of the roof. That's why the PyTap names are `East_1…5` plus `East_Middle_01…03`, and the same for West. The full drawing is [`examples/roof-drawing.yaml`](../examples/roof-drawing.yaml).

The Tigo app labels the same panels A1–A8 (East), B1–B11 (South) and C1–C8 (West). Note how they line up with the PyTap names when you compare the two apps.

## Data paths

```text
                 ┌────────── wireless ──────────┐
 27 × TS4-A-O ───┤                              ├── TAP #1 (left side) ──┐
                 └──────────────────────────────┴── TAP #2 (right side) ─┤ RS485 gateway bus
                                                                         │ (terminated at the CCA
                                         Waveshare #1  ◄── listens ──────┤  and at the last TAP)
                                         38400 8N1, raw TCP :4196        │
                                              │                        CCA ──► Tigo cloud / app
                                              ▼
 FoxESS KH10 ── RS485 ── Waveshare #2 ──► Home Assistant
                9600 8N1, Modbus TCP↔RTU :502    ├─ PyTap          → 27 optimisers + 3 strings + totals
                                                 ├─ foxess_modbus  → inverter, battery, grid, controls
                                                 ├─ Solcast        → forecast
                                                 └─ Octopus Energy → live tariff rate
```

## Integrations

| Integration | Version tested | Used for |
|---|---|---|
| [PyTap](https://github.com/azebro/pytap) | 1.2.0 | Per-optimiser data from the Tigo bus |
| [foxess_modbus](https://github.com/nathanmarlor/foxess_modbus) | 1.16.0 | Inverter, battery and grid data and controls |
| [Solcast PV Forecast](https://github.com/BJReplay/ha-solcast-solar) | 4.6.x | Solar forecast |
| [Octopus Energy](https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy) | 19.x | Live import rate for cost tracking |
| HACS cards | – | tigo-array-card, apexcharts-card, power-flow-card-plus, auto-entities |

## How it's configured

- **PyTap:** 27 modules, each with its barcode, a string (`South`/`East`/`West`), a name (`South_1`, `East_Middle_02`, …) and a peak power of 460 W.
- **Dashboard:** [`examples/solar-dashboard.yaml`](../examples/solar-dashboard.yaml), with the roof card full screen on its own tab.
- **Energy dashboard:** grid, solar and battery from foxess_modbus *Total* sensors, Solcast as the forecast, and the Octopus current-rate sensor for cost.
- **Extra sensors:** Solcast forecast-vs-actual snapshots and system savings, from [`examples/home-assistant/`](../examples/home-assistant).

## Lessons learned

1. **The Waveshare isn't on DHCP out of the box.** Use Vircom to find it at 192.168.1.200.
2. **The same adapter model needs opposite settings for the two jobs.** Raw passthrough at 38400 for Tigo, Modbus TCP↔RTU at 9600 for FoxESS.
3. **PyTap needs the CCA's node table.** Power-cycle the CCA once after setup.
4. **Two panels that "never reported" had correct barcodes.** They were out of radio range. A second TAP fixed it, but only after **re-running discovery**, because optimisers stay tied to the TAP they were discovered on.
5. **A TAP inside the loft works**, but the roof build-up (tiles, membranes, any foil insulation) costs signal. Put TAPs at opposite sides of a large array.
6. **On a three-face array the per-string and per-panel views pay off immediately.** East peaks in the morning, West in the afternoon, and a weak panel is obvious on the roof drawing.
