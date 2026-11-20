# FoxESS hybrid inverter over local RS485 (foxess_modbus)

This guide covers local monitoring and control of a FoxESS hybrid inverter (tested on a **KH10**) with a second Waveshare RS485-to-Ethernet adapter and the **[foxess_modbus](https://github.com/nathanmarlor/foxess_modbus)** integration. It isn't needed for the Tigo Array Card, but the two together make a complete local solar dashboard.

## Why RS485 rather than LAN?

Some newer KH-series units don't offer Modbus TCP on their network port. Others in the community report the same: a port scan shows only HTTPS and nothing on 502. The RS485 port always works.

## Waveshare settings

Configure the adapter as in the [Tigo guide](tigo-pytap-setup.md#1-configure-the-waveshare-adapter), but with these differences:

| Setting | Tigo bus | **FoxESS** |
|---|---|---|
| Baud rate | 38400 | **9600** |
| Data / parity / stop | 8 / None / 1 | 8 / None / 1 |
| Work mode | TCP Server | TCP Server |
| **Transfer Protocol** | None | **Modbus TCP ↔ RTU** |
| Port | 4196 | **502** (changes automatically when you pick Modbus TCP↔RTU) |
| More Advanced Settings | – | **RS485 bus conflict detection: on, about 20 ms** (recommended by the foxess_modbus wiki) |

Click **Modify Setting**, then **Restart Dev**.

> **The classic mistake:** leaving Transfer Protocol on *None* (the Tigo setting). The adapter then passes Home Assistant's Modbus **TCP** frames onto the RS485 bus unconverted, and the inverter ignores them. The integration reports *"No response received, expected at least 8 bytes (0 received)"*.

## Wiring

- Use the inverter's **Modbus/RS485** pair, not the meter or BMS bus. On a port shared with the inverter's own meter, the inverter is the master and won't answer Modbus requests.
- On some recent KH units the RS485 pair is on the same communications connector as the CT clamp; one owner reports **pins 3 and 4** for RS485 (CT on 7 and 8). Check your own inverter's manual, because layouts vary between hardware revisions.
- If you still get "0 bytes received", **swap A and B** first. Then check the inverter's Modbus address and baud rate under *Settings → Communication* on the inverter.
- Watching the adapter LEDs helps: if TX flashes but RX never does, requests are going out and the inverter isn't answering, which means wiring, baud rate or slave ID.

## Integration settings

**Settings → Devices & services → Add integration → FoxESS – Modbus**:

- Protocol: **Modbus TCP**
- Host: the adapter's IP
- Port: **502**
- Inverter slave ID: **247** (the FoxESS default; check it under *Settings → Communication* on the inverter)

## Energy dashboard

**Settings → Dashboards → Energy**:

| Section | foxess_modbus sensor |
|---|---|
| Grid → energy imported | `sensor.grid_consumption_energy_total` (*Grid Consumption Total*) |
| Grid → energy exported | `sensor.feed_in_energy_total` (*Feed-in Total*) |
| Solar production | `sensor.solar_energy_total` (*Solar Generation Total*), not the per-input *PVn Power Total* sensors, which may read 0 |
| Battery → energy going in | `sensor.battery_charge_total` |
| Battery → energy coming out | `sensor.battery_discharge_total` |

- **Cost tracking:** for live prices, pick *Use an entity with current price* and choose your tariff's current-rate sensor (e.g. from the Octopus Energy integration). Do the same under *Export compensation*.
- **Solar forecast:** add the Solcast integration as the forecast source under Solar production.
- New sensors take up to two hours to appear in the Energy charts, which are built from hourly statistics.

### "The energy flow looks wrong"

The Energy dashboard's flow (Sankey) chart is **estimated**. The inverter reports totals (solar generated, imported, battery in and out) but not *where* each kWh went. Home Assistant splits them hour by hour, and as far as we can tell it assigns solar to battery charging first in any hour when the battery charges. So on a day when the battery is topped up from the grid during daylight, solar can appear to flow only into the battery, with the house supplied from the grid. On a hybrid inverter that's often physically right anyway, since panels and battery share the DC side. The totals themselves are correct.

Alternatives, if you want a different view (all in HACS):

- **Sankey Chart Card** (MindFreeze): fully customisable; for example, solar split into strings and loads split into rooms.
- **Energy Sankey** (davet2001): a simpler energy-and-power Sankey that reads the Energy dashboard settings.
- **Sunsynk Power Flow Card** (slipx06): a live inverter-style flow screen that works with many inverter brands.
- **Power Flow Card Plus** (flixlix): animated live power circles (used in the example dashboard).
