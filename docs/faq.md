# FAQ

Questions that came up while building the reference system, with the answers that worked.

## Waveshare adapter

**The adapter doesn't get an IP address.**
It ships with a static 192.168.1.200 and DHCP off. Find it with Vircom (Windows) using *Device → Search*, set IP Mode to DHCP, then click *Modify Setting* and *Restart Dev*.

**Which button saves the settings?**
**Modify Setting** writes them to the device, and **Restart Dev** applies them. *Save As Default* only changes the factory defaults.

**What settings for the Tigo bus?**
TCP Server, port 4196, 38400 baud, 8N1, no flow control, Transfer Protocol **None**, Register Pkt and Send parameter off. See [the PyTap guide](tigo-pytap-setup.md#1-configure-the-waveshare-adapter).

**What settings for a FoxESS inverter?**
9600 baud, 8N1, Transfer Protocol **Modbus TCP ↔ RTU**, port 502, and RS485 bus conflict detection at about 20 ms. See [the FoxESS guide](foxess-modbus.md).

**foxess_modbus says "No response received, expected at least 8 bytes (0 received)".**
The adapter is reachable but the inverter isn't answering. It's nearly always Transfer Protocol left on *None* (and port 4196 instead of 502). Otherwise, swap A/B, then check the slave ID (247 by default) and the baud rate.

## PyTap

**How do I know it's working?**
Download its diagnostics. A rising `pending_power_reports` with `infra_received: false` means data is arriving but the barcode table hasn't come through yet. `infra_received: true` with `nodes` filled in means it's fully working.

**I power-cycled and nothing changed.**
Power-cycle the **Tigo CCA**, not the Waveshare, and give it 10–15 minutes. The CCA sends the barcode table at startup and about once a day.

**I added modules and the entities say "unavailable" but the history shows data.**
Adding modules reloads the integration, and each entity comes back with its next power report. If it stays unavailable, check for a duplicate entity (`…_2`) in *Settings → Entities*.

**Two panels never show any data.**
First check the barcode for a typo, and look in the HA log for *Discovered unconfigured Tigo optimizer barcode*. If the barcode is right, it's radio range. See [Panels missing or intermittent](tigo-pytap-setup.md#panels-missing-or-intermittent).

**I added a second TAP and things got worse.**
Optimisers stay tied to the TAP they were discovered on. Re-run discovery from the Tigo installer app or CCA, and move the bus termination to the last TAP. Then check that the diagnostics show optimisers split across two `gateway_id`s.

**What is "Performance %"?**
Current power ÷ rated peak (the *peak power* you entered per module). 10 % at a dull November midday is normal.

**Where is the optimiser's barcode in Home Assistant?**
In the PyTap device's *Serial number* (Settings → Devices). The card's **IDs** button reads it from there.

## The card

**It doesn't fill the section.**
Add `grid_options: columns: full` to the card, and widen the section's *Column span*. Or put it alone in a **Panel (single card)** view.

**It's too tall on my monitor.**
It limits its height to the window by default. Set `max_height: 60vh` or smaller.

**The outline drew but the panels didn't.**
Use `at: [x, y, w, h]`. Separate `y:` keys can be read as "yes" by YAML.

**How do I check the panels are in the right places?**
Press **IDs** and compare the barcodes against the installer's layout or the Tigo app. Swap `id:` values where they differ.

**What do the colours mean?**
Power is scaled 0–`peak` and Perf/Duty 0–100 %. Everything else is relative to the other panels, to make outliers obvious. Temperature is blue (cool) to red (hot). Hatched with a red outline means no data.

**Can I compare days?**
Yes. Use ◀ ▶ under the roof. Each panel shows that day's peak, total or average, with a midnight-to-midnight sparkline.

**After updating, I still see the old card.**
For a manual install, bump `?v=` on the resource URL. For HACS, redownload. Then Ctrl+F5 (or reset the frontend cache in the phone app).

## Home Assistant general

**Where is "Developer tools"?**
In recent versions it's **Settings → Tools**: the *States*, *Template*, *YAML* and *Actions* tabs. Pressing `c` anywhere and typing the name also works.

**How do I list all my entities?**
Paste [`examples/home-assistant/list-entities.jinja`](../examples/home-assistant/list-entities.jinja) into **Settings → Tools → Template**.

**Where do I add `template:` sensors without breaking things?**
In `configuration.yaml` (the File editor add-on is easiest). Add them under the existing `template:` key if there is one. Then **Tools → YAML → Check configuration**, then restart. `utility_meter:` needs a **full** restart.

**Do template sensors have a trace?**
No. Traces are for automations and scripts. Check *Last updated* in **Tools → States**, and look in the logs for template errors.

**Does Home Assistant track solar savings?**
It tracks generation automatically, and import cost and export income once you give the Energy dashboard a price. A "saved by the system" figure needs the sensors in [system-savings.yaml](../examples/home-assistant/system-savings.yaml).

**The Energy flow chart shows solar only going to the battery.**
The chart's split is an estimate made from totals. See [the FoxESS guide](foxess-modbus.md#the-energy-flow-looks-wrong).
