# Farm Manager — Audit (2026-11-13)

Scope: full read of `js/`, `css/`, `index.html`, `tests/`; play-test in headless Chromium (412×900 phone and 1280×800 desktop, ~30 in-game days with `__game.advance`); a node balance sim (greedy "optimal-ish" bot, 60–180 days, 3 seeds, 5 strategies). `npm test` passes (feed.test.js included). There were no console errors or page errors during the play-test.

Line numbers are for the tree as it was at audit time. Feed purchasing (`js/engine/purchase.js`) was being added at the same time, so line numbers in `engine.js` may move. Function names are given so each finding can still be located.

Severity: **P0** = data loss or the game can't be played · **P1** = wrong behaviour or a trap the player runs into · **P2** = minor or cosmetic.

---

## 1. Bugs

### B1 · P1 · Offline catch-up runs while the game is paused
`js/engine.js:61` `catchUp()` + `js/main.js:88` `loadOrCreate()`
- Repro: set speed ⏸, close the tab, wait, reopen. `createGame(); setSpeed(0); catchUp(3600)` advances **48 h** (checked in node). Crops wither and loan interest accrues while the player believes the game is paused.
- Fix: `catchUp` should return 0 when `state.speed === 0`. It could also scale by speed, capped at 1×, so offline play is never faster than 1×. Add a test for this.

### B2 · P1 · Harvest is paid up front, so a cash-poor player can be stuck with ripe crops
`js/engine/tasks.js:110` `planTask()` (cost > money → fail)
- Repro (sim, seeds 1 and 2): the bot buys a field and spends what's left on plowing, fertilizing and seeding. All 4 fields then become `ready` with $95 in cash. Rent costs $60/ha, so nothing can be harvested. The crops wither to 0 and money and XP stay frozen from day 64 to day 180. A player whose loan is already at the cap has only one way out: selling machines at 60%, and nothing in the game tells them that.
- Fix: for `harvest`, charge rent and fuel **at completion** and deduct it from the sale value of the harvest. Alternatively, let harvest start even when money is short and allow the balance to go negative up to the cost of the harvest. Either way, harvesting a ripe field must always be possible.

### B3 · P1 · A withered crop cannot be cleared except by paying for a harvest of 0 t
`js/engine/fields.js` `witherFactor()` (floor 0) + `tasks.js` REQUIRED_STATE (`plow` needs `idle`)
- Repro: let wheat sit for 72 h + 10 days. The view shows `witherFactor 0, predictedYield 0`, and the only action is `harvest`. Rent costs $240, the silo gets `{wheat: 0}` (a key with 0 left in it), and `stats.harvests++` still counts it, which also helps the 25-harvest achievement.
- Fix: allow `plow` from `ready` (this clears the crop), or let the withered state go back to `idle` after N days. Skip silo, stats and harvest XP when `tons <= 0`.

### B4 · P1 · "Airi" (irrigate) is shown when the player owns no irrigation implement
`js/engine/tasks.js:15` `availableActions()`
- Repro: a new game at level 1, wheat growing. The card shows **💧 Airi**. The modal says "Durasi 0m · Total biaya $0 ⚠️ Kamu tidak punya alat untuk mengairi". At level 1 the implement can't even be bought (irrigation unlocks at level 2).
- Fix: `availableActions` should list a task only if the player owns a matching implement (or, for harvest, a harvester or the rent option). Alternatively, show the button disabled with a "🔒 beli di Garasi (Lv 2)" hint. The task modal should hide the duration and cost rows when `est.hours === 0`.

### B5 · P1 · Animals eat the most plentiful feed crop, not the cheapest
`js/engine/animals.js:71` `stepAnimalsDay()` sort
- Repro: 20 cows, silo `{soybean: 10, barley: 5}`. After one day the silo is `soybean 9.5, barley 5`, so the cows ate $560/t soybean instead of $200/t barley. This also undercuts the new feed buying: `buyFeed` buys the *cheapest* crop, but the herd keeps eating whatever stock is largest, which may be the cash crop the player planned to sell.
- Fix: eat the cheapest crop by `state.market[c]` first. Better still, let the player reserve feed (see feature F6).

### B6 · P1 · The "Kolektor Mesin" achievement can be farmed for money
`js/data.js` ACHIEVEMENTS `machines_8`, `animals_20`
- Repro: on day 1, buy 4 × `fert_s` ($8,000). The achievement pays $10,000. Sell 3 of them back for $3,600. Net gain: **+$6,800** in the first minute, verified in node. `animals_20` works the same way: 20 chickens cost $300 and the reward is $3,000. `sold_50` counts eggs (pcs) and tons as the same "unit".
- Fix: count distinct machine *models*, or count only tractors and harvesters. Make `animals_20` require cows, sheep or pigs, or raise the reward threshold. Track `productsSold` by value or per product.

### B7 · P2 · "Lunasi" fails when money < loan instead of paying what it can
`js/engine/economy.js:104` `repayLoan()` / `js/ui/market.js:113`
- Repro: loan $25,000, cash $100 → "Uang tidak cukup."
- Fix: when `amount` is omitted, repay `min(loan, money)`. Label the button "Bayar maks".

### B8 · P2 · Time stops while the tab is hidden, but advances up to 48 h when the tab is closed
`js/main.js:105` (`dt` clamped to 1 s) + `:134` visibilitychange
- Repro: switch apps on a phone for 10 minutes and come back. 0 game hours have passed. Closing the tab and reopening it would have simulated about 4 h at 1×. The rules are inconsistent.
- Fix: on `visibilitychange → visible`, call `game.catchUp((now − hiddenAt)/1000)` and toast the result. Use the same rule as B1.

### B9 · P2 · A corrupt or incompatible save is silently overwritten after 10 s
`js/main.js:82`
- Repro: put an invalid JSON in `farm-manager-save` and reload. A new game starts and the autosave replaces the old data, so it can't be recovered.
- Fix: before starting fresh, copy the raw string to `farm-manager-save.bak-<ts>`.

### B10 · P2 · No save migration: data changes break old saves
`js/engine/persist.js:12` `parseSave()`
- New `PRODUCTS` entries have no `state.market[id]` until the next rollover, so `marketView` returns `price: undefined` and `buyPrice: NaN`. New stats keys are missing, and an unknown `machine.defId` throws in `machinesView` (`d.price`).
- Fix: add a `normalizeState(state, data)` step after parse. It fills missing market and history entries, stats keys and herds, and drops machines or fields whose definitions no longer exist. Keep `SAVE_VERSION` and write per-version migrations.

### B11 · P2 · The UI sells the last field, then shows an error
`js/engine/tasks.js:17` adds `'sell'` to every idle field
- Repro: in a new game, the only field shows a red **💸 Jual** button. Tapping it opens a confirm dialog, then an error toast.
- Fix: `availableActions` should omit `sell` when it is the only owned field.

### B12 · P2 · Text and formatting glitches
- `economy.js:27`: "Ladang **Ladang** Lembang dibeli" (the field name already starts with Ladang, Sawah, Kebun…). Use `${def.name} dibeli`.
- `taskrun.js` harvest toast: "38.91 t" uses a dot for decimals, while the rest of the UI uses id-ID format ("38,9 t"). Engine messages use `round2` and `toString`, so they need an id-ID number formatter in `defs.js`.
- `fieldModal.js:8` duplicates `FIELD_REFUND`, and `app.js` duplicates `SAVE_KEY`. Import both from the engine.
- The `purchase` event type has no icon in `achievements.js` `LOG_ICON`.

### B13 · P2 · Low-feed toast fires every day
`js/engine/animals.js:90-92`
- At 5× this means a warning toast every 12 s for as long as stock stays under 3 days, and the 50-entry log fills with the same message.
- Fix: emit only when the state changes (ok → low → starving), and store `h.lastFeedAlert`.

### B14 · P2 · Buying an implement the player can't use gives no warning
`js/ui/garage.js:40` `shopCard()`
- Repro: at level 3 with only the 75 HP tractor, `plow_m` (130 HP) and `seeder_m` (120 HP) can be bought. The bot did exactly this. Every task modal then auto-picks the small implement, and the new one is dead money until a 140 HP tractor is bought.
- Fix: in the shop card, show "⚠️ Butuh traktor ≥130 HP (punyamu 75 HP)" when no owned tractor is strong enough.

---

## 2. UX issues

### U1 · P1 · Toasts block the modal action buttons
`css/style.css:410-424` (`#toast-root` sits above the nav and `.toast {pointer-events:auto}`)
- Repro (phone screenshots): after any action, up to 4 stacked toasts sit over the bottom ~200 px for 3–4.5 s. That area is exactly where the bottom-sheet modal puts **Mulai / Beli / Panen**, and the toasts catch the taps. At 5× there is a constant stream of `task_done` and `crop_ready` toasts.
- Fix: move toasts to the top, under the topbar, or make them `pointer-events:none` with tap-to-dismiss on an icon only. Show fewer of them (max 2) and merge repeats ("3 tugas selesai"). Send the low-value events (`task_done`) to the log or a notification badge instead of a toast.

### U2 · P1 · The seed picker doesn't help the player choose a crop
`js/ui/taskModal.js:17` `cropPicker()`
- Each crop shows only seed cost, days, water need and ideal pH. It doesn't show the field's own pH, whether the crop fits it, the expected yield on this field, today's price or the expected profit. Locked crops (8 of 10 at level 1) push the estimate and the **Mulai** button below the fold on a phone (screenshot 04).
- Fix: show `≈ X t · ≈ $Y (untung $Z)` per crop using `expectedYield(..., {fertilized: f.fertilized})` × market price − seed cost, plus a ✅/⚠️ pH badge. Collapse locked crops into one line: "🔒 8 tanaman lagi di level 2–6". Make the modal footer sticky.

### U3 · P1 · Too many taps for every field cycle, and no batch actions
- One cycle takes 4 modals (Bajak → Pupuk → Tanam → Panen), each with a confirm. With 4 or more fields the player spends most of the time in modals, and fields sit idle whenever the player isn't looking (`blockedActs` in the sim: 60–134 field-hours lost in 60–120 days). See features F1 and F2 (task queue and "Kerjakan semua").

### U4 · P1 · The player can't see why the yield is low
`js/ui/fieldModal.js` `renderOwned()`
- The modal shows "Perkiraan hasil ±30,8 t" and "Hari kering / basah 4 / 1", but nothing connects the two. In this run the weather factor alone was −20% (wheat tolerates 60% dry days, the field had 80%). pH and contamination penalties aren't shown either.
- Fix: have `getFieldView` return `yieldFactors: {soil, ph, fert, irrig, contamination, weather, wither}`, and show them as a short list of percentages with colours. Suggest irrigation when `weather < 1`.

### U5 · P2 · Level-up doesn't say what was unlocked
`js/engine/economy.js:133` emits "Konten baru terbuka." with no details.
- Fix: list the newly unlocked crops, machines and animals in the event (`extra.unlocks`) and show them in a modal. The topbar should also show "XP 514/1.500". It is currently only a `title` tooltip, which phones never display.

### U6 · P2 · No "what should I do now" signals
- The tabs have no badges for ready fields, idle fields, low feed or a full barn. The top bar shows the weather for the first owned field's region only.
- Fix: add a count badge to the 🗺️ tab for ready + idle fields and a ⚠️ badge to the 🐄 tab for feed under 1 day. Add an "Aksi berikutnya" chip on each field card.

### U7 · P2 · Loans are hard to find
`js/ui/market.js:85` `loansPanel()` is rendered below 14 product cards, which is several screens of scrolling on a phone. It has no "Pinjam maks" button and gives no hint about cost (interest 0.2%/day ≈ 6%/month).
- Fix: move it to a "Keuangan" sub-section (or the stats tab) and add max/quick-amount buttons. Products with stock should come first, followed by a collapsed list of the others.

### U8 · P2 · Desktop layout wastes the screen
- At 1280 px the map fills the whole first viewport (about 490 px tall) and the field cards are squeezed below it, with titles wrapping ("Sawah / Cikole").
- Fix: from `min-width: 1000px`, use a two-column grid (map on the left, sticky; field cards on the right) and cap the map height at about 60vh.

### U9 · P2 · No onboarding or goals
- A new player sees a map with 19 locked pins and one "Bajak" button. Nothing explains the cycle, the pH, the dry days or why to fertilize, and the first harvest only comes on day 6.
- Fix: a 5-step guided checklist (Bajak → Pupuk → Tanam → percepat 5× → Panen → Jual) with arrows on the relevant buttons, stored in `state.tutorial`. Short-term goals could come from feature F3 (contracts).

### U10 · P2 · Other details
- The animal card shows no economics (product value/day, feed cost/day, net), so the player can't tell whether animals are worth buying. The quantity input defaults to 1, and buttons for "isi penuh" or "jual semua" would help.
- The silo **Jual** button sells the whole stock of a product without asking, including feed the animals need.
- The market sparkline has no base-price line, so "cheap or expensive?" is only shown as a ratio in text.
- The selected tab is not kept after a reload. A reload always opens 🗺️.
- The field card status for a growing crop ("panen ±4h 20j") uses `h` for days, which in Indonesian reads as "jam" next to `j`. Use "4 hr 20 j" or "4 hari 20 jam".

---

## 3. Balance findings

The sim script was a throwaway in `/tmp/pwaudit/sim.mjs` and has been deleted. It modelled a greedy bot that does the following every game hour:
- plow, then fertilize, then seed the crop with the best net value per day, then harvest (with an owned harvester, or rented);
- sell all produce right away;
- buy the field with the best ha per $ while keeping $5k in reserve;
- buy the bigger plow and seeder at level 3, a 2nd tractor at 3+ fields, and a harvester when it has more than $70k.

At 1×, 1 game day = 60 s of real time.

### Progression timeline (base bot, seeds 7 / 2 / 3)
| Milestone | Game day (≈ real minutes at 1×) |
|---|---|
| First harvest | day 6 (days 1–5 are just waiting) |
| Level 2 | day 18 (all seeds) |
| Level 3 | day 40 |
| Level 4 | day 73–81 |
| Level 5 | day 115–119 |
| Level 6 / 7 | day 146 / 177 (seed 3) |
| 2nd field (f2, $42k) | day 18 |
| 3rd field | day 40 |
| 7 fields | day 117 (seed 7, $696k total earned) |

Money curve (seed 7): d20 $7k after buying f2 · d60 $47k, 3 fields · d90 $55k, 4 fields · d120 $51k, 7 fields. All profit goes straight back into land. In 2 of the 3 seeds the bot hit the **harvest cash trap (B2)**: it was frozen from about day 64 with $95 in cash and every field ready.

**Verdict:** the early game is slow and empty. Level 2 takes 18 real minutes at 1× and contains about 3 harvests and about 12 identical modal confirmations. Level 3 takes 40 min. Most of the time is spent waiting for crops with nothing else to do (animals aren't worth it, see below). Recommendations:
- Halve the early level thresholds (`LEVELS = [0, 250, 900, 2200, 4500, …]`).
- Start with 2 small fields (or make f1 6 ha) so there is always something to do.
- Give XP for animal production and for contracts.
- Levels **7–10 unlock nothing**: the highest `unlockLevel` in `data.js` is 6. Either add content (crops, the big harvester, animal tiers, regions gated by level) or cut the cap to 6.

### Crops (base price, loam, fertilized; net = revenue − seed − fertilizer)
| Crop | Lv | Net $/ha/cycle | Grow days | **Net $/ha/day** | XP/ha/day |
|---|---|---|---|---|---|
| wheat | 1 | 1,798 | 5 | 315 | 3.4 |
| barley | 1 | 1,350 | 4 | 287 | 2.9 |
| corn | 2 | 2,301 | 6 | 343 | 4.5 |
| soybean | 2 | 2,335 | 6 | 349 | 1.6 |
| rice | 3 | 2,860 | 7 | 371 | 2.9 |
| potato | 3 | 2,665 | 7 | 346 | **14.3** |
| canola | 4 | 2,788 | 6 | 416 | 1.6 |
| sunflower | 4 | 2,805 | 6 | 419 | 1.4 |
| sugarcane | 5 | 4,486 | 10 | 419 | **18.0** |
| cotton | 6 | 4,120 | 8 | 474 | 1.3 |

- Barley never beats wheat, and potato never beats rice on money. Canola and sunflower are identical. The bot planted sunflower 35 times out of 63.
- XP depends on tonnage (`xpPerHarvestTon: 2`), so potato and sugarcane give 4–14× the XP of other crops. Give XP by value (for example 1 XP per $100 sold or harvested) or per hectare instead.
- Give crops a role so there is a real choice to make: barley could be the cheap, fast, drought-tolerant crop (lower its seed cost, add a dry bonus), potato could carry a pH niche or a higher price swing, and canola and sunflower could prefer different seasons (see F4).
- Fertilizer always pays: +$130 to +$900/ha net. Irrigation always pays: +15% plus the dry-penalty removal, for about $75/ha. Both are "always yes" choices. Making them conditional (weather forecast, soil nutrients, see F5) would give the player a real decision.

### Machines
- **Owning a harvester barely pays off.** Rent is $60/ha. The Massey Activa burns $36.7/ha in fuel, so it breaks even after **2,571 ha** of harvesting ($60k). The Claz Lexion breaks even after **5,106 ha** ($180k). In the sim the bot harvested about 600 ha in 120 days, so buying a harvester only buys speed. Fix: rent at $110–150/ha, have rental pickup wait 2–6 h, or limit rental to fields of 20 ha or less. Harvesters could also reduce wither or harvest losses.
- Bigger tractors use more fuel per ha (jd 10 L/ha against nh 11.7 L/ha with the same plow), and the only gain is time. That's fine, but it only matters with several fields because there is no task queue (F1).

### Animals
| Animal | Net $/day/head | Capex/head (incl. barn share) | Payback |
|---|---|---|---|
| chickens | 0.48 | 25 | 53 d |
| cows | 35.0 | 2,100 | 60 d |
| sheep | 4.8 | 500 | 104 d |
| pigs | 3.4 | 490 | 144 d |

- Land pays back in **8–35 days** (about 3–6% a day), while animals take 53–144 days and give **no XP**. The "animals" sim strategy (20 cows at about day 25) finished day 90 with $51.6k against $55k for the base strategy. Pigs and sheep are traps.
- Fix: have animals give XP per day, and add breeding (herd growth, F7) or manure → fertilizer synergy. Pork needs a higher base price (about 3×), or lower volatility (0.12 currently drives it to 54% of base).

### Economy
- Loans cost 0.2% a day while land returns about 3–6% a day, so borrowing the maximum is always right and carries no risk. Raise interest to about 0.5% a day, or add a repayment schedule.
- Achievement money exploit: see B6.
- Holding stock for a high price is weaker than selling at once (hold-at-1.08× bot: day-90 money 60 / 17k against 24k / 55k), because the money is tied up. This is fine. Storage is free and unlimited, though. A silo capacity limit (F8) would make the market more interesting.

---

## 4. Missing features (ranked by fun ÷ effort)

Effort: S ≈ under 1 day, M ≈ 1–3 days, L ≈ more than 3 days. Every feature keeps the "no deps, engine has no DOM" rule. Save changes go through the `normalizeState` migration (B10).

### F1 · Batch actions — fun ★★★★ · effort S
Tapping 4 modals per field per cycle is the biggest annoyance in the game.
- Engine: `game.startTaskAll(task, opts)` returns `{ok, started:[{fieldId,hours,cost}], skipped:[{fieldId,reason}]}`. It walks the owned fields that have `task` in `actions`, in order of size, and stops when machines or money run out. `opts.rent` applies to harvest, and `opts.cropId` to seed.
- UI: a "⚡ Aksi massal" bar above *Ladangku* with buttons that carry counts: **Panen semua (3)**, **Bajak semua (2)**, **Tanam semua…** (opens a crop picker that shows each field's pH fit). The result is one summary toast.

### F2 · Field plans / auto-continue — fun ★★★★★ · effort M
This is the core of the original game's "manager" feel: set it up once, then manage instead of clicking.
- State: `fields[id].plan = { cropId, fertilize:bool, irrigate:bool, rent:bool, repeat:bool } | null`.
- Engine: after each `completeTask`, and once an hour in `advance`, call `runPlans(game)`. For each field with a plan and no busy task, start the next step (plow → fertilize? → seed(cropId) → irrigate? → harvest), provided machines and money allow it. When a step can't start, store the reason in `plan.blocked`, so the UI can say "Menunggu traktor" or "Uang kurang". APIs: `setFieldPlan(id, plan)` and `clearFieldPlan(id)`. The view adds `plan` and `nextStep`.
- UI: a "🔁 Rencana" section in the field modal (crop select + 3 toggles + repeat). The field card shows a 🔁 chip and the blocked reason.
- Optional gating: unlock at level 2, or tie it to F10 workers (each running plan needs a worker).

### F3 · Contracts / orders — fun ★★★★ · effort M
This gives short-term goals and reasons to grow a variety of crops.
- State: `contracts: [{ id, productId, qty, price, dueDay, penalty, xp, status:'offer'|'active'|'done'|'failed' }]`.
- Engine: in `#dailyRollover`, keep 3 offers for products unlocked at the player's level. `qty` should be about 1–2 harvests of the player's average field, `price` 1.15–1.4× market, and `dueDay` today + 5–12. APIs: `acceptContract(id)` (max 3 active) and `deliverContract(id, qty?)`, which takes produce from the silo and pays on full delivery. Contracts past their due day fail and charge the penalty (10% of value). Events: `contract_offer`, `contract_done`, `contract_failed`.
- UI: a "📋 Kontrak" section at the top of Pasar, with a progress bar per active contract and a badge on the 📈 tab.

### F4 · Notifications, badges, net-worth chart, onboarding — fun ★★★ · effort S
- Badges on the tabs (U6). Level-up modal listing the unlocks (U5).
- `state.history: [{day, money, netWorth}]` (≤120 entries, pushed in the rollover). Net worth = money + 0.7·land + 0.6·machines + silo value + 0.6·animals − loan. The chart is an SVG polyline in the Prestasi tab, reusing `sparkline` from market.js.
- `state.tutorial = { step }`. The steps in order are Bajak → Pupuk → Tanam → 5× → Panen → Jual. Show a coach-mark banner at the top of the Ladang tab. It moves forward on `task_done` and `sale` events, and can be dismissed.

### F5 · Seasons and weather forecast — fun ★★★ · effort M
- Derived, no new state: `seasonOf(day, region)` from `seasonFactor`. Temperate regions get winter when `temp < 5`; Jawa Barat gets dry and wet seasons that change `rainChance` (±0.2).
- Crops get a `seasons:['spring','summer']` list or `minTemp`. Growth in `stepFieldsHour` is scaled ×0 below `minTemp` and ×0.5 off-season. The seed picker warns "⚠️ musim dingin di Hokkaido". The weather roll gives regions real character, so "where do I buy land" becomes a strategy question.
- Forecast: `state.forecast[regionId] = [3 days]`, generated ahead from the same RNG. Shown in the field modal, it helps the player decide on irrigation.

### F6 · Soil management (pH lime, nutrients, rotation) — fun ★★★ · effort M
- State: `fields[id].ph` (mutable, initialised from the definition) and `fields[id].nutrients` (0–1, start 0.8).
- Engine:
  - A new task `lime` needs a new implement (`lime_s`, Lv 2, 50 HP). It moves pH 0.5 toward 6.8 and costs about $90/ha in material.
  - Harvest takes `crop.nutrientUse` (0.1–0.3) off `nutrients`. Fertilizing raises them by 0.4.
  - Soybean is a legume and adds 0.15 instead of using nutrients.
  - Planting the same crop twice in a row costs 10%.
  - Yield gets a `(0.6 + 0.4·nutrients)` factor.
  - The yield breakdown (U4) shows all of these.
- This turns the field's fixed pH and the "always fertilize" habit into real choices.

### F7 · Feed reserve + animal depth — fun ★★ · effort S (reserve) / M (depth)
- `state.feedReserve: {cropId: tons}`. `sellProduct` and the silo's "sell all" can't sell below the reserve, and the UI shows "🔒 2 t dicadangkan". Animals eat the cheapest crop first (B5).
- Depth: XP per animal product sold or produced. A `manure` product from cows and pigs, which lets the player fertilize a field for free. Optional breeding (+1% herd growth a day when happiness > 0.8 and there is free capacity).

### F8 · Silo capacity + upgrades — fun ★★ · effort S
- `state.siloCapacity` (start 100 t), `buildSilo()` (+200 t, $8k, scaling). Harvest overflow goes to a forced sale at 70% of market, with a warning toast. This only works once batch selling (F1) and contracts (F3) exist.

### F9 · Workers — fun ★★ · effort M
- `state.workers: [{id, name, wagePerDay, skill}]`. Each running task or plan step needs a free worker, wages are paid in the rollover, and skill speeds up tasks by 0–20%. This adds a cost for scaling and a natural reason to buy bigger machines. Pair it with F2.

### F10 · Machine wear / maintenance — fun ★ · effort S
- `machines[i].condition` (1 → 0, falls 0.002 per working hour). Below 0.5 tasks run 20% slower; below 0.2 there is a 5% breakdown chance per task. `repairMachine(uid)` costs `price·(1−condition)·0.3`, and resale value is scaled by condition. This adds friction without adding much fun, so do it last.

---

## 5. Recommended implementation plan

Four packages, each owning its own files, so they can run in parallel. Work that crosses a boundary goes through the **shared contract** below. Agree on it first, since it is the only coupling. New CSS goes into per-package stylesheets, linked from `index.html` by WP4, so nobody edits `style.css` except WP4.

### Shared contract (agree before starting)
- `game.catchUp(sec)` returns 0 when `state.speed === 0`.
- `game.startTaskAll(task, opts)` returns `{ok, started:[{fieldId,hours,cost}], skipped:[{fieldId,reason}]}`.
- `game.setFieldPlan(fieldId, {cropId, fertilize, irrigate, rent, repeat} | null)` returns `{ok}`. The field view gains `plan`, `plan.blocked`, `nextStep`, and `yieldFactors:{soil,ph,fert,irrig,contamination,weather,wither}`. `actions` only contains tasks the player can actually run (owns the implement). `sell` is absent on the last field.
- The `level_up` event carries `unlocks:{crops:[ids],machines:[ids],animals:[ids]}`.
- `state.history:[{day,money,netWorth}]` (≤120) and `game.netWorth()`.
- Contracts: `game.contractsView()`, `acceptContract(id)`, `deliverContract(id, qty?)`. Events `contract_offer|contract_done|contract_failed`. Module `js/engine/contracts.js` exports `stepContractsDay(game)`, `contractsView(game)`, `acceptContract(game,id)` and `deliverContract(game,id,qty)`.
- `state.feedReserve:{cropId:t}`, `game.setFeedReserve(cropId, t)`. `sellProduct` respects the reserve.

### WP1 · Engine correctness + automation engine
**Files:** `js/engine.js`, `js/engine/{tasks,taskrun,fields,economy,animals,persist,purchase,defs,rng}.js`, new `js/engine/plans.js`, `tests/engine-fixes.test.js`, `tests/plans.test.js`, `docs/ENGINE_API.md`.
**Scope:**
- Bugs B1, B2 (harvest paid at completion), B3, B4/B11 (engine side, `actions`), B5, B7, B10 (`normalizeState`), B12 (engine messages and id-ID numbers), B13.
- F1 `startTaskAll`. F2 plans engine (`runPlans` called hourly and after `completeTask`).
- `yieldFactors`, `level_up.unlocks`, `state.history`, `netWorth`. F7 reserve, cheapest-first feeding, animal XP.
- Wire WP3's `contracts.js` into `#dailyRollover` and the facade (3–4 lines).

### WP2 · Field & task UI
**Files:** `js/ui/farm.js`, `js/ui/fieldModal.js`, `js/ui/taskModal.js`, `js/ui/dom.js`, new `css/fields.css`.
**Scope:**
- U2: crop picker with expected t/$/profit and a pH badge, locked crops collapsed, sticky footer.
- U3/F1: "Aksi massal" bar. F2: "🔁 Rencana" editor in the field modal and a plan chip with the blocked reason on cards.
- U4: yield breakdown. B4 UI: hide the 0-cost estimate.
- B12 UI: import `FIELD_REFUND` from the engine. `fmtHours` uses "hari" (U10).

### WP3 · Economy content, balance & market/animal/garage UI
**Files:** `js/data.js`, `js/engine/market.js`, `js/engine/weather.js`, `js/engine/views.js`, new `js/engine/contracts.js`, `js/ui/market.js`, `js/ui/garage.js`, `js/ui/animals.js`, `js/ui/silo.js`, new `css/economy.css`, `tests/contracts.test.js`, `tests/balance.test.js`.
**Scope:**
- Balance from §3: `LEVELS`, harvester rent (about $120/ha), crop roles (barley, potato, canola vs sunflower), XP by value (needs one `BALANCE` key; WP1 reads it in taskrun), animal prices and pork, loan rate, content for Lv 7–10.
- B6 achievement redefinition.
- F3 contracts module + "📋 Kontrak" UI.
- U7: loans panel moved, "Pinjam maks", market stock-first with others collapsed.
- B14: garage HP warning. U10: animal economics row and silo sell confirm, feed reserve control (F7 UI).
- Optional F5 seasons and forecast in `weather.js`.

### WP4 · App shell, notifications & layout
**Files:** `js/main.js`, `js/ui/app.js`, `js/ui/modal.js`, `js/ui/topbar.js`, `js/ui/achievements.js`, `css/style.css`, `index.html`, `README.md`.
**Scope:**
- U1: toasts moved to the top, non-blocking, merged, max 2.
- B8: catch-up on `visibilitychange`. B9: corrupt-save backup.
- U5: level-up modal with unlocks, XP numbers in the topbar.
- U6: tab badges (ready/idle fields, low feed, contracts).
- U8: desktop two-column layout. U9: onboarding coach-marks (`state.tutorial` is UI-owned; store it in `localStorage` separately so no engine change is needed).
- F4: net-worth chart in Prestasi. Remember the last tab. Add `<link>`s for `css/fields.css` and `css/economy.css`. Update README.

### Order / dependencies
- All four packages can start at once against the contract.
- WP2 and WP4 can stub missing engine fields with `?.`.
- WP3's contracts become live once WP1 wires the rollover.
- Integrate in this order: WP1 → WP3 → WP2 → WP4, then run `npm test` and one phone play-test pass.
- F6 (soil/lime), F8 (silo cap), F9 (workers) and F10 (wear) are a second wave once these four have landed.
