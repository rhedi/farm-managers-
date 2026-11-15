# Farm Manager — UX audit v9 (2026-11-15)

Player feedback: *"tata letaknya agak pusing / belum friendly untuk user atau gamer"*.

**Method.** Headless Chromium (Playwright), phone viewport 390×844, `isMobile`, touch, DPR 2; plus 360×760, 412×915 and landscape 800×400 for overflow. Two states:

- **new**: a fresh game (level 1, one field, tutorial on);
- **mid**: a fixed save built through the engine API: level 12, day 10, 8 fields (2 ready, 1 orchard, 1 greenhouse, 2 busy, 1 plowed, 1 idle), 3 herds, a mill on auto, 2 active contracts, a truck on the road, 7 research points, 3 active world events. The game is paused, so every screenshot shows the same state.

Each tab was measured for page height, the content above the fold, running CSS animations and the size of the text. Before screenshots are in `docs/shots/v9-before-*.png`, all captured at 390×844 unless the name says otherwise.

## Measurements (before)

Usable height between the top bar (82 px) and the bottom nav (62 px) is **700 px of 844**.

| Tab (mid save) | Page height | Screens | Above the fold | Running animations | Text < 12 px / 12–14 px / ≥ 14 px |
|---|---|---|---|---|---|
| Ladang | 2 885 px | **3.4** | event banner + top of the map; **0 field cards** | **70** | 36 / 58 / 106 |
| Garasi | 9 406 px | **11.1** | 3 owned machines | 0 | 18 / 216 / 137 |
| Pasar | 5 561 px | **6.6** | 2 contracts (not the stock) | 0 | 87 / 287 / 290 |
| Ternak | 4 941 px | **5.9** | one chicken card, 9 filled buttons in 3 colours | 0 | 12 / 107 / 96 |
| Gudang | 1 988 px | 2.4 | capacity card + 8 stock rows of crops, eggs, milk, wool and flour in one list | 0 | 7 / 67 / 37 |
| Prestasi | 9 621 px | **11.4** | research summary; missions start on screen 3 | 0 | 46 / 218 / 232 |
| New player: Ladang | 1 061 px | 1.3 | tutorial + map; **the field card with the 🪓 Bajak button is below the fold** | 11 | 28 / 24 / 12 |
| New player: Garasi | 7 379 px | 8.7 | — | 0 | — |
| New player: Prestasi | 6 771 px | 8.0 | — | 0 | — |

| Modal (mid save) | Height | Notes |
|---|---|---|
| Field (ready + pest) | 1 890 px (**2.2 screens**) | 10 stacked blocks: status, yield table, yield factors, greenhouse, forecast, plan, land |
| Task: harvest | 569 px | ok |
| Crop picker (Tanam) | 3 718 px (**4.4 screens**) | 27 buttons, in data order (not by profit) |
| Research | 2 648 px (**3.1 screens**) | 20 nodes always expanded |
| Finance | 1 368 px (1.6 screens) | ok, but loans live in Pasar |

**Core loop**: buying a field, then plow, seed, harvest and sell takes **10 taps**: pin, Beli, Bajak, Mulai, Tanam, Mulai, Panen, Mulai, tab Pasar, Jual semua. On top of that the player has to scroll past a full-screen map to reach the field card every time.

**Touch targets**: 30 of the 31 controls above the fold on the first screen are under 44 px. Small buttons are 32 px tall, map pins 34 px, the speed buttons 38×28 px and the toast ✕ 24 px.

**Contrast**: muted text `#8a8672` scores **3.5:1** on cards and 3.2:1 on the page background (AA needs 4.5:1), and it is used for every sub-line. White on the primary green `#4f8a2e` is 4.2:1. The "Siap panen" chip is 2.9:1.

**Overflow**: none at 360, 390, 412 or 800×400. In landscape, though, only 262 px of content remains between the bars (`v9-before-landscape-farm.png`).

## Findings, by priority

### P0: the first screen does not show what to do now
1. **Ladang opens with a full-screen map, not the fields** (`farm-top`). The map is ~440 px tall (aspect 5:6) and the "🌾 Ladangku" cards start at y≈720. Mid save: 0 field cards above the fold. New player: the tutorial says "Ketuk tombol 🪓 Bajak" and the 👆 marker sits on a button **off screen** (`firstrun-1`).
2. **Every tab is one long scroll of everything.** Prestasi stacks 9 sections (11.4 screens) with research first and missions on screen 3. Garasi lists all 30+ shop machines, locked ones included (11.1 screens). Pasar stacks contracts → shipping form → loans → stock → prices (6.6 screens), so the stock you want to sell is on screen 4.
3. **Storage mixes everything** (`silo-top`). Crops, eggs, milk, wool and flour sit in one list under one 150 t capacity bar, but animal products (L, pcs, kg) never use silo space. Nothing on screen explains that.

### P1: visual noise and inconsistency
4. **Too many loud buttons.** Secondary buttons are filled brown and destructive ones filled red, so a single herd card (`animals-top`) carries 9 filled buttons in three colours. Garasi shows a red "Jual $X" next to every machine (`garage-top`). Field cards show "💸 Jual" (sell the field) next to farming actions. Nothing tells the player which button is the next step.
5. **Constant motion**: 70 CSS animations run at once on Ladang (14 swaying sprites per ready plot, a shine sweep, the ready card icon swaying as well, a pulsing ready pin, bobbing busy pins, drifting clouds and rain, swaying event emojis). Every money/XP change floats one or two pills under the top bar, often several per second at 5×.
6. **Small text**: the top-bar XP text is 9.3 px and the season chip 8.7 px, bottom-nav labels 10.2 px, badges 11 px, `.small` 12.75 px, card sub-lines 12.3 px. Lock labels on map pins are 8.7 px.
7. **Low-contrast muted text** (3.2–3.5:1) carries most secondary information.
8. **Duplicated information and entry points**: stock + Jual exists in both Gudang and Pasar, with different layouts. The finance report opens from the top bar, the Prestasi card and the Pasar loans card. Research appears in the top-bar modal and at the top of Prestasi. The 🔬 badge shows in both the top bar and the Prestasi tab.
9. **Badges are not "things to do"**: Pasar counts *active contracts* even when none can be delivered. Ladang counts idle fields that run on an automatic plan.

### P2: comfort
10. **Top bar**: the XP text is cut off ("74.460/…"), the research chip squeezes the XP bar, and the speed control is small (28 px) and low contrast when paused. Settings (sound, save, install, reset) sit at the very bottom of Prestasi, 11 screens down.
11. **Field modal and crop picker are long** (2.2 and 4.4 screens). The plan editor, forecast, greenhouse and land data are always expanded, and crops are listed in data order instead of best profit first.
12. **Herd cards are 1.5 screens each**: details, economics, two bars, feed, buy/sell, barn, herd buttons, plus breeding **open by default**.
13. **Landscape** leaves 262 px for content.

## Plan (highest impact first)
1. A sticky sub-tab bar per tab; the chosen sub-tab is remembered. Ladang: 🌾 Ladangku | 🗺️ Peta. Garasi: Mesin | Pekerja | Toko. Pasar: Jual | Kontrak | Kirim | Harga. Ternak stays one page with compact herds. Gudang: 🌾 Pertanian | 🐄 Peternakan | 🏭 Olahan. Prestasi: Misi | Riset | Prestasi | Keuangan.
2. Ladangku first: fields split into "Perlu tindakan" and "Berjalan", the next step shown as the single primary button, field selling only in the detail dialog, and a short "Ladang dijual" list so buying a field still takes 2 taps.
3. Gudang split by `PRODUCTS[].category` (crop / animal / processed). Each group gets its own list, value and "Jual semua". The capacity line says which group uses the silo. Ternak gets a link to its storage.
4. Calmer components: outlined secondary and danger buttons (filled only in confirmations), 44 px targets, ≥ 13 px secondary text, muted colour with ≥ 4.5:1 contrast, collapsible sections for secondary content, locked items behind "lihat semua".
5. Calm motion: no duplicate sways, one merged money/XP pill at a time, a single toast stack, and `prefers-reduced-motion` respected (already global in CSS).
6. Top bar: full XP text, a larger speed control, and ⚙️ settings in the top bar (sound, save, install, tutorial, reset).
7. Badges only for things to act on: fields needing a step, deliverable contracts, hungry herds, a nearly full silo or a stopped factory, worn-out machines, claimable missions.
