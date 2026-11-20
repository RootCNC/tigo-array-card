# Local Tigo monitoring with a Waveshare adapter and PyTap

This guide gets per-optimiser data from a Tigo TS4 system into Home Assistant **locally**, with no Tigo cloud. It's the groundwork for the Tigo Array Card.

## How it works

```text
 TS4 optimisers ))) wireless ((( TAP(s) ──RS485──┬── CCA (Tigo controller) ──► Tigo cloud (unchanged)
                                                 │
                                                 └── Waveshare RS485→Ethernet (listens only)
                                                          │ TCP
                                                          ▼
                                           Home Assistant ── PyTap integration ── sensors ── Tigo Array Card
```

The CCA polls the TAPs over a wired RS485 "gateway" bus. The adapter sits on the same pair of wires and **only listens**, so it doesn't interfere with the CCA or the Tigo app. PyTap decodes the traffic using the protocol work from the [taptap](https://github.com/willglynn/taptap) project.

## What you need

- A Tigo system with a **CCA** and one or more **TAPs**, and TS4 optimisers.
- An **RS485-to-Ethernet adapter**. This guide uses the **Waveshare RS485 TO POE ETH (B)**: powered over PoE, with a web page and Windows config tool. The non-PoE version works the same way.
- A short length of twisted-pair cable (a pair from Cat5/Cat6 is fine).
- Home Assistant with **HACS**.

## 1. Configure the Waveshare adapter

**The adapter won't appear on your network at first.** Out of the box it has a **fixed IP of 192.168.1.200 with DHCP turned off**, so your router never sees it ask for an address. Use one of these to reach it:

- **Vircom** (Windows, from the Waveshare wiki for your model): click **Device → Search**. It finds the unit by broadcast even if your network isn't 192.168.1.x. Double-click the device to open its settings.
- **Web page** ("B" models): give your PC a temporary static IP such as 192.168.1.50 / 255.255.255.0, then browse to `http://192.168.1.200`.

Set these values:

| Setting | Value | Why |
|---|---|---|
| IP Mode | **DHCP** (then reserve the address in your router) or a static IP on your network | So Home Assistant can always find it |
| Work Mode | **TCP Server** | PyTap connects to the adapter |
| Port | **4196** (Waveshare default; any free port works) | Use the same number in PyTap |
| Baud Rate | **38400** | Speed of the Tigo gateway bus |
| Data bits / Parity / Stop bits | **8 / None / 1** | 8N1 |
| Flow Control | **None** | |
| Transfer Protocol | **None** (raw / transparent) | The Tigo bus is **not** Modbus, so don't use Modbus TCP↔RTU here |
| Register Pkt / Enable send parameter | **Off** | These inject extra bytes into the data stream |
| Restart for no data (optional) | On, 300 s | A watchdog. The Tigo bus is never quiet, so it only fires if the adapter hangs |

Then click **Modify Setting** to write the settings, and **Restart Dev** to apply them. *Save As Default* only stores them as the factory defaults; it doesn't apply them.

After the restart the adapter asks your router for an address. Find it with Vircom's search again or in your router's client list; the device ID shown in Vircom is its MAC address.

**Factory reset:** hold the **Reload** button for about 5 seconds while it's powered.

## 2. Wire it to the CCA

- Connect the adapter's **A** and **B** to the CCA's **Gateway** RS485 terminals, **in parallel** with the existing cable to the TAP. Connect GND too if the adapter has it.
- **Don't add a termination resistor at the adapter.** The bus should be terminated only at the CCA and at the TAP furthest along the cable.
- The adapter's **RX LED should flicker constantly**: the CCA talks to the TAPs all the time. If it stays dark, swap A and B; nothing is damaged if they're reversed.

## 3. Install and configure PyTap

1. **HACS → ⋮ → Custom repositories**: add `https://github.com/azebro/pytap`, type **Integration**. Download **PyTap**, then restart Home Assistant.
2. **Settings → Devices & services → Add integration → PyTap.** Enter the adapter's IP address and port (4196).
3. Add each optimiser as a **module**:
   - **String:** the string or roof face it belongs to, e.g. `South`. Each string gets its own totals, `sensor.tigo_string_south_power` and so on.
   - **Name:** a name for the panel, e.g. `South_1`. This becomes the entity id: `sensor.tigo_ts4_south_1_power`.
   - **Barcode:** printed on the optimiser's label, in the form `4-XXXXXXX`.
   - **Peak power:** the panel's rating in W, used for the Performance %.

**Naming tip:** use a pattern such as `South_1 … South_11`, `East_1 …`, `West_Middle_01 …`. The card turns these into short labels (S1, E3, WM2), and the layout builder auto-numbers ids in the same way.

### Finding barcodes

- On each optimiser's label (photograph them before the panels go up, if you can).
- In the installer's layout report, or the Tigo app's system layout.
- From PyTap itself: once it's running, it logs any optimiser it hears that you haven't configured (*Discovered unconfigured Tigo optimizer barcode: …*). Its diagnostics list them under `discovered_barcodes`.

## 4. First start: "data arriving but no panels"

This is the most common first-day confusion.

Download PyTap's diagnostics (**Settings → Devices & services → PyTap → ⋮ → Download diagnostics**) and look at `connection_state`:

| What you see | Meaning |
|---|---|
| `pending_power_reports` counting up, `infra_received: false`, `nodes` empty | **The link is working.** PyTap is receiving power readings, but hasn't yet seen the table that maps each optimiser's short bus ID to its barcode, so it can't tell which reading belongs to which panel. |
| `infra_received: true`, `nodes` filled, `pending_power_reports` near 0 | Everything is working. |

The CCA only broadcasts that table **when it starts up and roughly once a day**. To get it straight away, **power-cycle the Tigo CCA** (not the Waveshare) while PyTap is running, then wait 10–15 minutes for it to boot and enumerate the optimisers. PyTap saves the mapping, so you only have to do this once.

## 5. Reading the diagnostics

| Field | What it tells you |
|---|---|
| `counters.crc_errors`, `runts`, `giants` | Bus health. These should stay at 0. Rising numbers point to wiring, a missing ground or double termination. |
| `gateways` | One entry per TAP the CCA talks to, with its radio address and firmware. Each TAP may appear twice, once with a version and once without. |
| `nodes.<barcode>.gateway_id` | Which TAP that optimiser is reporting through. |
| `nodes.<barcode>.readings_today` | How many readings arrived today. A healthy panel gets thousands by mid-afternoon; 0 or a few hundred means poor radio reception. |
| `nodes.<barcode>.last_update` | When that optimiser was last heard. |

## Panels missing or intermittent

**Check the barcode first.** If a panel *never* reports, not even an RSSI value, compare its barcode against the label and the PyTap log for unconfigured barcodes. One wrong character is enough.

**If it reports sometimes, it's radio reception.** The optimisers talk wirelessly to the TAP, and `readings_today` shows it clearly. Things that weaken the signal:

- **Foil-backed insulation or membranes** (PIR boards, foil breather membranes) between a TAP and the panels. This is the biggest one: it can block a whole area.
- Steel beams, purlins, ducting or water tanks in the path.
- Concrete roof tiles, worse when wet. A TAP inside the loft works, but every layer costs signal.
- Distance and angle. Tigo's guidance is to mount the TAP close to the optimisers it serves, under the array where possible.

### Adding a second TAP

If part of the array is out of reach, a second TAP on the same RS485 cable helps, but **only after re-running discovery**:

1. Fit the new TAP on the same RS485 bus, daisy-chained from the first.
2. **Move the termination** to whichever TAP is now furthest along the cable, and turn it **off** on the others.
3. **Re-run discovery** on the CCA, from the Tigo installer app (Tigo EI Pro) or the CCA's local setup. Each optimiser is tied to a TAP at discovery, so a new TAP won't take over any optimisers until discovery runs again. Homeowners may need their installer to trigger it.
4. Check the diagnostics: optimisers should now be split between two `gateway_id`s, with healthy `readings_today` on all of them.

Discovery can **renumber** the gateway IDs and node IDs. Compare TAPs by their `address`, not their number. PyTap tracks panels by barcode, so Home Assistant entities and the card are unaffected.

## Other symptoms

| Symptom | Cause / fix |
|---|---|
| Entity "unavailable" right after adding modules | Adding modules reloads PyTap. Each entity becomes available again at its next power report. |
| Tigo app and Home Assistant show the same panels missing | Confirms it's a radio or assignment problem, not PyTap. |
| PyTap shows nothing at all | Check the adapter's IP and port, that Transfer Protocol is **None** (not Modbus), the baud rate (38400), and the RX LED. |
| CRC errors climbing | A loose A/B connection, missing ground, a third terminator, or the cable run alongside AC wiring. |
