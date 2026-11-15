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
5. **Constant motion** (measured, but kept: the player likes the animations, so v9 changes no animation; only floats/toasts were moved off the sub-tab bar): 70 CSS animations run at once on Ladang (14 swaying sprites per ready plot, a shine sweep, the ready card icon swaying as well, a pulsing ready pin, bobbing busy pins, drifting clouds and rain, swaying event emojis). Every money/XP change floats one or two pills under the top bar, often several per second at 5×.
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
5. ~~Calm motion~~: dropped at the player's request; all animations stay. Toasts and floating money/XP texts now appear below the sticky sub-tab bar so they never cover a sub-tab. `prefers-reduced-motion` stays as it was.
6. Top bar: full XP text, a larger speed control, and ⚙️ settings in the top bar (sound, save, install, tutorial, reset).
7. Badges only for things to act on: fields needing a step, deliverable contracts, hungry herds, a nearly full silo or a stopped factory, worn-out machines, claimable missions.

## After (v9)

Screenshots: `docs/shots/v9-after-*.png`, the same views as before. Each sub-tab has its own `-top` shot, and the first sub-tab of each tab also has a `-scrolled` shot. There are also `modal-settings` and `firstrun-*`. Same harness, same saves.

| Tab (mid save) | Before | After: page height per sub-tab (screens) |
|---|---|---|
| Ladang | 3.42 (2 885 px), 0 field cards above the fold | **Ladangku 3.36** (1 actionable card above the fold below 3 events; 4 for a new player) · Peta 1.00 |
| Garasi | 11.14 (9 406 px) | **Mesin 1.64** · Pekerja 1.30 · Toko 1.28 (locked machines folded) |
| Pasar | 6.59 (5 561 px) | **Jual 1.26** · Kontrak 1.16 · Kirim 3.15 · Harga 2.19 |
| Ternak | 5.85 (4 941 px) | **2.67** |
| Gudang | 2.36 (1 988 px) | **Pertanian 1.00** · Peternakan 1.00 · Olahan 1.05 |
| Prestasi | 11.40 (9 621 px) | **Misi 1.37** · Riset 2.75 · Prestasi 1.46 · Keuangan 1.47 |
| New player: Garasi / Prestasi | 8.74 / 8.02 | 1.00 / 1.37 (longest sub-tab) |

| Dialog | Before | After |
|---|---|---|
| Field (ready + pest) | 2.24 screens | **0.92** (plan, yield factors, greenhouse, forecast, land folded) |
| Crop picker | 4.41 | **2.09** (top 5 by profit, crops that can't grow now last, trees folded) |
| Research | 3.14 | 2.65 (nodes on one line, "Teliti" inline, reset moved to the bottom) |
| Task / sell / finance | 0.67 / 0.21 / 1.62 | 0.68 / 0.24 / 1.63 (unchanged) |

- **Core loop**: still **10 taps** (row in "🛒 Ladang dijual", Beli, Bajak, Mulai, Tanam, Mulai, Panen, Mulai, tab Pasar, Jual $…), but nothing needs scrolling now. Before, every step after buying meant scrolling past the full-screen map.
- **First run**: the tutorial's 🪓 Bajak target sits on the first screen (`firstrun-1`). Step 6 points at the Gudang tab.
- **Touch targets** (controls under 44 px above the fold): Ladang 21 → **1**, Garasi 7 → 0, Pasar 3 → 0, Ternak 8 → 0, Gudang 9 → 0. Map pins stay 34 px.
- **Text under 12 px** (mid save): Ladangku 36 → 2, Pasar 87 → 2 (Jual), Prestasi 46 → 1. Muted text is now `#6f6b58` (4.6–5.2:1) and white on the primary green 4.85:1.
- **Animations**: unchanged at the player's request. Ladangku runs 55 and the map 14, the same total as before; they now sit on two sub-tabs.
- **Overflow**: none at 360×760, 390×844, 412×915 or 800×400. Landscape uses a one-row top bar and a 50 px nav. No console errors.

### Gudang split (new requirement)
`PRODUCTS[].category` in `js/data.js` (`crop` / `animal` / `processed`) drives the grouping. A test checks that it matches `ledger.saleCategory`, the engine's existing split for booking sales. The engine already stores animal products (L, pcs, kg) outside the silo, so v9 does **not** add a capacity:

- 🌾 Pertanian shows the silo bar, with the crop and processed-ton shares named;
- 🐄 Peternakan says "tidak memakai kapasitas silo";
- 🏭 Olahan notes that ton products use the silo and kg products don't.

*Proposal, not implemented*: a separate "Gudang dingin" capacity for animal products, with upgrades, would make the split symmetric. It is a balance change, because today animal products have unlimited storage.

### Leftovers
- Pasar › Kirim is still 3.2 screens: the city list with demand chips is long. A city picker in steps would shorten it.
- Map pins are 34 px on a 366 px map. Making them bigger would make the 30 pins overlap.
- Ladangku with 8 fields is 3.4 screens. Each field card is ~210 px including the animated plot, which stays at the player's request.
