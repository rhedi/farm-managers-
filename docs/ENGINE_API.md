# Farm Manager Engine API

`js/engine.js` holds the game logic. It has no DOM and does not touch `localStorage` directly; storage is passed in. All player-visible strings are in Bahasa Indonesia.
Modules: `js/engine/{rng,defs,weather,market,fields,tasks,taskrun,animals,economy,purchase,plans,contracts,views,persist,silo,workers,wear,seasons,events,soil,missions,rivals,breeding,upgrades,ledger,orchard,greenhouse,logistics,logisticsView,research}.js`. The UI should only need `engine.js`.

```js
import { createGame, loadGame, loadFrom, SPEEDS } from './engine.js';
const game = loadFrom(localStorage) ?? createGame({ seed: Date.now() });
game.catchUp((Date.now() - (game.state.savedAt ?? Date.now())) / 1000); // offline progress, max 48 game hours
game.on((ev) => toast(ev.msg));
// each animation frame: game.tick(dtSeconds); periodically: game.save(localStorage)
```

## Construction / persistence
| Call | Returns |
|---|---|
| `createGame({ seed?, data? })` | `Game` (data defaults to `js/data.js`) |
| `loadGame(json, { data? })` | `Game`; **throws** `Error` on a corrupt or wrong-version save. The parsed state is migrated by `normalizeState`, which fills missing keys, stats, market entries and herds, and drops machines, fields and animals whose definitions are gone |
| `loadFrom(storage, { data? })` | `Game`, or `null` if nothing is saved; throws on a corrupt save |
| `game.serialize()` | JSON string `{ ...state, version: 1, savedAt }` |
| `game.save(storage)` | `{ok:true}`; `storage.setItem('farm-manager-save', json)` |
| `game.catchUp(realSeconds)` | game hours simulated (`realSeconds / realSecondsPerGameHour`, capped at 48). Returns **0 and does nothing while paused** (`speed === 0`) |

## Results convention
Mutating player actions never throw. They return `{ ok: true, ...extra }` or `{ ok: false, reason: '<Indonesian text>' }`.

## Time
| Call | Notes |
|---|---|
| `game.tick(realDeltaSeconds)` | advances `dt / BALANCE.realSecondsPerGameHour * speed` game hours; returns the hours advanced |
| `game.advance(hours)` | simulates in steps no longer than 1 hour: task progress, hourly crop growth, the daily rollover at each multiple of 24h, and field plans (every hour and after a task finishes) |
| `game.setSpeed(0\|1\|2\|5)` | `{ok}`; 0 pauses |
| `game.clock()` | `{ time, day, hour, speed }`; `day = floor(time/24)+1`. A new game starts at day 1, 06:00 |
| `game.day`, `game.hour` | getters |

Daily rollover runs in this order: world events (`stepEventsDay`: expire finished ones, maybe start one), weather for each region (consuming the forecast), dry/wet day counters on growing fields and orchards, `season_change` events, market random walk, animal feeding and production (with animal XP), then breeding (stud genetics, births), loan interest, greenhouse electricity (`stepGreenhouseDay`, ledger `listrik_rumah_kaca`), worker wages and the weekly candidate refresh (`stepWorkersDay`), contracts (`stepContractsDay`), a `state.history` entry, rival ranking (`rank_up`), new daily missions (`missions_new`), then a `weather` event.

## Field tasks
Tasks: `'plow' | 'fertilize' | 'seed' | 'irrigate' | 'harvest' | 'lime' | 'prune' | 'clear'`. Lime runs on `idle` or `plowed` fields, needs a tractor plus an implement with `task:'lime'`, costs `BALANCE.limeCostPerHa ?? 90` per ha, and calls `soil.applyLime` on completion. It is not offered once pH is at 6.8 or the field was already limed this cycle (`fields[id].limed`, reset by plow and harvest).
Annual field states: `idle → plow → plowed → (fertilize) → seed → growing → (irrigate) → ready → harvest → idle`. Orchards instead use `plowed → seed(tree) → orchard ⇄ ready → harvest → orchard`; `clear` (tebang) returns them to `idle`. While a task runs, the view reports `'busy'`. A `ready` annual field whose crop has fully withered (`witherFactor 0`) may also be plowed, which clears it.

| Call | Returns |
|---|---|
| `game.startTask(fieldId, task, { tractorId?, implementId?, harvesterId?, cropId?, rent? })` | `{ok, hours, cost, payOnCompletion}` or `{ok:false, reason}` |
| `game.startTaskAll(task, opts)` | `{ok, started:[{fieldId,hours,cost}], skipped:[{fieldId,reason}], reason?}`. Starts `task` on every owned field whose `actions` include it, largest first. Harvest uses free owned harvesters first; with `opts.rent` the remaining fields are rented. `opts.cropId` is used for seed |
| `game.estimateTask(fieldId, task, opts)` | `{ ok, reason, hours, cost, fuelCost, materialCost, rentCost, canRent, payOnCompletion }`. When the only problem is money, `hours` and `cost` are still filled in |
| `game.estimateYield(fieldId, cropId, { fertilized?, irrigated? }?)` | expected tons (no random roll) of a crop on a field, for crop pickers |
| `game.availableMachinesFor(task)` | non-harvest: `{ tractors:[mv], implements:[mv] }`; harvest: `{ harvesters:[mv], canRent:true, rentPerHa, rentHaPerHour }` |
| `game.setFieldPlan(fieldId, { cropId, rotateCropId=null, fertilize=true, irrigate=false, rent=true, repeat=true, lime=false, sell=true } \| null)` | `{ok, plan}`. Sets or clears a field plan and runs plans immediately. With `lime`, a plowed field is limed (once per cycle, while pH ≠ 6.8 and a lime implement is owned) before fertilizing. With `rotateCropId`, the seed step alternates: it plants `rotateCropId` when the field's `lastCropId` is `cropId`, otherwise `cropId`. With `sell`, the stored part of each harvest is sold at market on completion (feed reserve respected; plans saved before this option default to off). Plan steps prefer machines at condition ≥ 0.2 when such a rig is free. `clearFieldPlan(id)` is shorthand for `null` |

- `tractorId`, `implementId` and `harvesterId` are **machine instance uids** (`'m1'`, ...), not data ids. If you omit them, the engine picks the fastest free rig whose tractor meets the implement's `hpRequired`.
- `seed` needs `cropId`. A crop is available once `crop.unlockLevel <= level`.
- Harvest uses an owned free harvester. If there is none, it fails with `canRent:true` in the estimate. Pass `{rent:true}` to rent at `STARTING.harvesterRentPerHa` per ha, working 1 ha/h with no fuel cost.
- Plow, fertilize, seed and irrigate charge their full cost (fuel + material) when the task starts.
- **Harvest is paid on completion** (`payOnCompletion: true`), so a ready field can always be harvested. Fuel and rent come out of money. If money is short, just enough of the crop is auto-sold at market price, ignoring the feed reserve. Anything still missing is added to the loan. The `task_done` message says what happened.
- XP is awarded when a task finishes: `xpPerTask`, plus `(BALANCE.xpPerHarvestValue ?? 0.01) × tons × basePrice` on harvest. A 0 t harvest of a withered crop adds nothing to the silo, stats or harvest XP. The harvest yield is rolled at start and added to the silo at completion.
- Plans (`fields[id].plan`) run every game hour and after each finished task. They start the field's `nextStep` (plow → fertilize if planned and an implement is owned → seed `cropId` → irrigate if planned and owned → harvest). When a step can't start, its Indonesian reason is stored in `plan.blocked`, and `null` once it runs.
  - Harvest with `rent:true` uses own harvesters first, then rents.
  - With `rent:false` the plan waits for an own harvester. It rents anyway if the player owns none, or once the crop has been ready for 48 h.
  - A plan with `repeat:false` clears itself after the harvest.
- Duration: `sizeHa / (implement.haPerHour * tractor.speed)`, or `sizeHa / harvester.haPerHour`.
- Yield: `sizeHa*baseYield*soilYield*phFactor*(1+fert)*(1+irrig)*(1-contamination)*weatherFactor*witherFactor*season*nutrients*rotation*pest*storm*rand(0.9–1.1)` (see World below).
  - `phFactor = max(0.3, 1 - distOutsideIdealPh*yieldPhPenaltyPerUnit)`, using the field's current `ph` (lime changes it).
  - `weatherFactor` compares the share of dry days with the crop's tolerance (low 0.8, med 0.6, high 0.4); every 20% over tolerance costs `dryPenalty`, with a floor of 0.4. Irrigation removes this penalty.
  - Withering: once a crop has been ready for more than 72h, it loses 10% per day.

## Perennial orchards (`js/engine/orchard.js`)
`data.TREES` contains seven perennial crops: orange, apple, mango, avocado, coconut, cherry and durian. They are indexed in `game.idx.crops` and `game.idx.trees`, and their products use unit `t`. Plant a tree with the normal `seed` task on a plowed field and `{cropId: treeId}`. Planting is manual (one worker, no seeder or fuel), costs `sizeHa × plantCostPerHa`, and books `bibit_pohon`. A tree cannot be planted in a greenhouse.

- On completion the field state is `orchard`; `fields[id].orchard = {plantedAt, harvests, pruned, matureNotified}`. After `maturityDays`, fruit accumulates `harvestEveryDays × 24` eligible hours. Eligibility requires the tree's fruiting `seasons` and `minTemp`; season yield and rotation factors are neutral for trees.
- Harvesting does not replant: it stores/sells the fruit, resets fertilizer/irrigation/weather cycle data, increments `harvests`, and returns to `orchard`. Use `{rent:true}` for rented pickers (`pickerRentPerHa`, `pickerHaPerHour`, no worker/fuel, ledger `sewa_pemetik`), or own a tractor plus an implement with `task:'pick'`.
- `prune` is manual, allowed once per fruit cycle on a mature, non-ready orchard. It costs `pruneCostPerHa`, books `perawatan_kebun`, and gives `pruneBonus` to that harvest (`yieldFactors.prune`). `clear` is manual and allowed on `orchard` or `ready`; it costs `clearCostPerHa`, books `perawatan_kebun`, returns to `idle`, and drops a plan for the cleared tree.
- After `lifespanDays`, `yieldFactors.age` declines by `oldAgeDecline × overage/lifespan`, floored at `minAgeFactor`. All defaults live in `BALANCE.orchard`.
- Orchard plans support fertilize/irrigate once per mature fruit cycle, own-or-rented harvest and auto-sell. Trees never rotate. `startTaskAll('harvest', {rent:true})` also supports orchards.

| Call | Returns |
|---|---|
| `game.orchardOutlook(fieldId, treeId)` | `{treeId, tons, harvestsPerYear, windowDays, windowSeasons, price, yearlyRevenue, yearlyCost, yearlyProfit, plantCost, maturityDays, harvestEveryDays, lifespanDays, paybackDays, cold, blocked}` for crop pickers; `null` for an unknown field/tree |

The field view's `orchard` block is `null` for annual crops, otherwise `{treeId, ageDays, maturityDays, lifespanDays, harvestEveryDays, mature, maturity, stage:'young'|'prime'|'old', vitality, fruit, fruitMult, windowOpen, nextWindowDay, windowSeasons, windowDays, hoursToRipe, harvests, pruned}`. `yieldFactors` includes `age` and `prune`. `orchard_mature` fires once when the tree starts fruiting.

## Greenhouses (`js/engine/greenhouse.js`)
A field's `greenhouse` is `null` or `{builtDay, cost}`. Configuration is `BALANCE.greenhouse`: unlock level 9, `costPerHa` 18000, `upkeepPerHaDay` 90, maximum 12 ha, `yieldBonus` 0.2 and removal `refund` 0.3. Greenhouses cannot be built on orchards or busy fields. Building books capex `rumah_kaca`; daily electricity books `listrik_rumah_kaca` and may borrow; removal books `penjualan_aset`.

Inside, annual growth ignores season and `minTemp`; `yieldFactors.weather` and `storm` are 1, `season` is at least 1, and `greenhouse` is `1 + yieldBonus`. Storm events skip the field. Removing the greenhouse leaves the current crop growing outdoors.

| Call | Returns |
|---|---|
| `game.greenhouseQuote(fieldId)` | `{ok, reason, cost, upkeepPerDay, refund, maxHa, unlockLevel, yieldBonus, built}`; numbers are available even when blocked |
| `game.buildGreenhouse(fieldId)` | `{ok, cost, upkeepPerDay}` or `{ok:false, reason}`; emits `greenhouse_built {fieldId}` |
| `game.removeGreenhouse(fieldId)` | `{ok, refund}` or `{ok:false, reason}`; fails if absent or busy |

The field view's `greenhouse` block is `null` outdoors, otherwise `{builtDay, cost, upkeepPerDay, refund, yieldBonus}`. Old saves normalize missing `orchard`/`greenhouse` keys to `null`; both survive serialize/load.

## Economy
| Call | Notes |
|---|---|
| `buyField(fieldId)` | creates an idle field state; refuses (`'Ladang ini terkunci sampai level N.'`) below the field's effective unlock level = max(`field.unlockLevel`, `region.unlockLevel`), default 1 (`defs.fieldUnlockLevel(data, def)`) |
| `sellField(fieldId)` | refunds 70%; the field must be idle and not busy; you cannot sell your last field |
| `buyMachine(machineDefId)` | `{ok, uid}`; requires the machine's unlock level |
| `sellMachine(uid)` | refunds `(60% × price + 50% × upgrade spend) × condition`; fails while the machine is busy |
| `repairMachine(uid)` | `{ok, cost}`; F10. Costs `price·(1−condition)·0.3` and sets condition to 1. Fails while busy or when there is nothing to repair |
| `setAutoRepair(on)` | `{ok, autoRepair}`; global setting `state.autoRepair` (default false). When on, every machine that finishes a task below 0.3 condition is repaired at once if money allows (`machine_repaired`) |
| `upgradeMachine(uid, track)` | `{ok, level, cost}` \| `{ok:false, reason}`. `track` = `'engine'` \| `'transmission'` \| `'efficiency'`, levels 0–3 per owned instance. Level L costs `price × [0.15, 0.25, 0.4][L−1]` and needs player level ≥ `unlockLevel + 2·(L−1)` (`'Butuh level N.'`). Fails while busy (`'Mesin sedang dipakai.'`), at max (`'Sudah level maksimal.'`), on tracks an implement lacks, or without money. Emits `machine_upgraded {uid, track, level, cost}` |
| `machineUpgradeInfo(uid)` | `{uid, defId, name, type, busy, paint, paints, stats /* upgraded */, upgrades, spent, resaleValue, tracks:[{id, name, applies, level, max:3, stat, unit, current, next, cost, reqLevel, reason /* null = can upgrade */}]}` or `null` |
| `paintMachine(uid, color)` | `{ok, paint}`; free cosmetic colour from `BALANCE.machineUpgrades.paints` (`null` = factory colour), stored as `machines[i].paint` |
| `sellProduct(productId, qty?)` | `{ok, earned, qty}`; sells at the current market price; omit `qty` to sell all **sellable** stock (silo minus the feed reserve). Adds to `stats.salesValue` |
| `setFeedReserve(cropId, tons)` | `{ok, reserve}`; keeps `tons` in the silo that `sellProduct` won't sell (`0` removes it). Animals may still eat reserved stock |
| `buyProduct(productId, qty)` | `{ok, cost, qty}`; crops only (ids in `CROPS`). `qty` in t, rounded to 0.01, must be > 0 and fit in the free silo space (`'Silo penuh: sisa ruang X t.'`). Costs `qty * price * BUY_MARKUP` (1.2), counted in `stats.totalSpent`; adds to the silo and emits `purchase` |
| `buyFeed(animalId, days)` | `{ok, productId, qty, cost}`; buys `count * feedPerDay * days` t (× 1.5 while intensive breeding runs; rounded up to 0.01) of the cheapest accepted feed crop via `buyProduct`. Fails with `'Belum ada ternak.'` when the herd is empty |
| `feedQuote(animalId, days)` | `{ productId, name, qty, cost, affordable }` for the same purchase without buying, or `null` when there are no animals |
| `buildBarn(animalId)` | `{ok, capacity}`; costs `barnCost` and adds `barnCapacity` |
| `buyAnimal(animalId, n)` | needs a barn, free capacity and the unlock level. Bought animals have genetics 1.0, so the herd's `breedQuality` becomes the head-weighted average |
| `sellAnimal(animalId, n)` | `{ok, earned}`; pays `sellPrice*(0.5+0.5*quality)*breedQuality` per animal |
| `setBreeding(animalId, on)` | `{ok, breeding}`; intensive breeding. While on **and** the herd has ≥ 2 head and free barn room: births ×4, feed ×1.5, production ×0.75. Pauses by itself (no extra cost) when the barn is full |
| `buyBreedingStock(animalId)` | `{ok, tier, cost, target}`; next stud tier k (1–5): costs `price × capacity × 0.2 × k`, needs level ≥ `unlockLevel + k`, a barn and ≥ 1 head. Target genetics `1 + 0.1·k`; the herd climbs 0.01/day toward it while fed. The target is diluted when the herd outgrows the capacity at purchase (`1 + 0.1·k·min(1, capacityAtPurchase/count)`) |
| `takeLoan(amount)` / `repayLoan(amount?)` | loan cap is `level*25000`. Interest is `BALANCE.loanDailyRate ?? 0.002` per day, taken from money, or added to the loan if money is short. `repayLoan()` without an amount pays `min(loan, money)` |
| `contractsView()` / `acceptContract(id)` / `deliverContract(id, qty?)` | contracts (F3), implemented in `js/engine/contracts.js` on `state.contracts`. Offer prices are based on `max(market, 0.9·basePrice)`; the view has `premium` (vs market) and `premiumBase` (vs base price) |
| `siloInfo()` / `upgradeSilo()` | F8. `{used, capacity, free, step, nextUpgradeCost, upgrades}`; only products with unit `'t'` count. Upgrade adds `BALANCE.silo.step` (200 t) for `upgradeCost·costGrowth^upgrades` ($3000 × 1.2ⁿ) and emits `silo_upgraded`. Harvest tons that don't fit are sold at once at 70% of market (`silo_overflow`) |
| `workersView()` / `workerCandidates()` / `hireWorker(candidateId)` / `fireWorker(id)` | F9. Workers `[{id, name, skill 0–1, wage, busy:false\|fieldId, busyField, speedup}]`; 3 candidates `[{id, name, skill, wage}]`, re-rolled every 7 days. Hiring is free; the last worker and busy workers can't be fired |

**Workers (F9).** Every task except a rented harvest needs a free worker; otherwise it fails with `'Tidak ada pekerja bebas.'` (estimates still fill `hours`/`cost`). The most skilled free worker is used; skill makes the task up to 20% shorter (`hours × (1 − 0.2·skill)`) and grows by `1%·(1−skill)` per finished task. Wages are paid in the daily rollover; any shortfall is added to the loan with a `wages_unpaid` event. `estimateTask` also returns `{machineUids, workerId, workerName}`.

**Wear (F10).** `machines[i].condition` falls by `BALANCE.wear.perHour` (0.002) per working hour of each machine in the rig. Below 0.5 the task takes 25% longer (20% slower). Below 0.2, starting a task rolls a 5% breakdown: the task takes 50% longer and `machine_breakdown {uid, fieldId}` fires. Rented harvesters don't wear.

**Machine upgrades.** All task code uses upgraded stats (`js/engine/upgrades.js` `effectiveStats`): tractor `hp × (1 + 0.15·engine)` (hp check against `hpRequired`), `speed × (1 + 0.1·transmission)`; harvester `haPerHour × (1 + 0.1·engine)(1 + 0.1·transmission)`; implement `haPerHour × (1 + 0.1·transmission)` (implements have no engine/efficiency track); `fuelPerHour × (1 − 0.1·efficiency)`. `machinesView`, `availableMachinesFor` and `shopView().maxTractorHp` report the upgraded values.

Animals eat the cheapest accepted feed crop (by market price) first. Each day they give XP equal to `xpPerHarvestValue` × the value of their production at base price. A `low_feed` event fires only when a herd's feed status changes (ok → low → starving).

**Breeding** (`js/engine/breeding.js`, `BALANCE.breeding`). Each herd has genetics `breedQuality` 0.5–1.5 (1.0 = 3★, `stars = 1 + (bq − 0.5)·4`) that multiplies production and sale price. A day counts toward the species cycle (`BALANCE.breeding.animals[id] = {days, rate}`, e.g. chickens 4 d, cows 12 d) when the herd is fully fed, happiness > 0.7, ≥ 2 head and there is free barn room. At the end of a cycle `count·rate` (×4 intensive) newborns arrive (fraction carried over, capped by free room) with genes `bq ± 0.02` (separate RNG stream `state.breedRng`), giving `animals_born {animalId, n}` and `0.5 × xpPerHarvestValue × n·sellPrice` XP. A full barn stops births and emits `herd_full {animalId}` once (only for herds that breed). `breed_improved {animalId, breedQuality}` fires each time genetics first reach a new 0.1 step. Natural births are worth ≈ 6% of net production; selling newborns from intensive breeding earns less than plain production, so buy→breed→sell is no money loop.

## Factories (stream B)
Modules `js/engine/factories.js` (actions, hourly step) and `js/engine/factoryView.js`; data `FACTORIES` in `js/data.js` (`{id, name, emoji, unlockLevel, price, upgradeCost, maxLevel, recipes:[{id, inputs:{productId:qty}, outputs:{productId:qty}, hours}]}`).

| Call | Returns |
|---|---|
| `factoriesView()` | `[{ id, name, emoji, unlockLevel, price, maxLevel, unlocked, owned, level (0 if not owned), speed, upgradeCost\|null, recipeId, recipe, recipes, running, queued, auto, progress 0–1, hoursLeft, blocked:reason\|null }]`. Recipe views: `{ id, name, emoji, inputs:[{id,name,emoji,unit,qty,stock,enough}], outputs:[…], baseHours, hours, inValue, outValue, valueAdd, canStart }` (values at base price; `stock` excludes the feed reserve) |
| `buyFactory(id)` | `{ok, cost}`; needs `unlockLevel`; selects the first recipe; emits `factory_bought {factoryId}` |
| `upgradeFactory(id)` | `{ok, level, cost}`; costs `upgradeCost × level`, up to `maxLevel`. Each level makes batches ×1.25 faster: `ceil(hours / 1.25^(level−1))` |
| `setRecipe(id, recipeId)` | `{ok, recipeId}`; not while a batch runs; clears the queue |
| `startBatch(id, count=1)` | `{ok, queued}`; queues batches. Fails with `'Bahan kurang: …'` when idle and the first batch's inputs are missing |
| `setFactoryAuto(id, on)` | `{ok, auto}`; auto mode starts a new batch whenever inputs are there |

A batch takes its inputs from the silo when it starts (the feed reserve is never used) and counts work at each full game hour (`Game.advance`, after crop growth). On completion the outputs are added and `factory_done {factoryId, productId, qty}` fires once per output product; XP = `xpPerHarvestValue` × output value at base price. When 't' outputs don't fit the silo, the batch waits at 100% (`'Silo penuh: …'`). `factory_blocked {factoryId, reason}` fires only when the blocked reason changes (missing inputs for a queued/auto batch, or silo full). No RNG is used. Processed goods are normal `PRODUCTS` and sell on the market.

## World: seasons, forecast, events, soil (F5/F6)
Modules `seasons.js` (derived from the day, no state/RNG), `events.js` (`state.events`), `soil.js` (field `ph`, `nutrients`, `lastCropId`); weather/forecast in `weather.js`.

| Call | Returns |
|---|---|
| `game.seasonOf(regionId)` | `{id, name, emoji, growthMult}` or `null`. Ids: temperate `spring\|summer\|autumn\|winter` (10 days each, `BALANCE.yearDays` 40, day 1 = spring); tropical regions (`climate.tropical`, Jawa Barat) `wet\|dry` (wet days 1–10 and 31–40; rain chance ±0.2) |
| `game.forecast(regionId)` | `[{day, temp, rain}×3]` for the next 3 days. Rolled ahead from the RNG into `state.forecast`; the actual day reuses it (temp ±~0.8 °C, rain right ~90%). Active heatwaves are already applied |
| `game.cropFit(regionId, cropId)` | `{fit:'good'\|'neutral'\|'off'\|'cold', growthMult, season, minTemp, coldDays, dryDays, days}` for crop pickers (forecast days below `minTemp` / without rain) |
| `game.activeEvents()` | `[{id, type, name, emoji, desc, regionId, fieldId, productId, endsDay, cost?, mult?, amount?}]`. `endsDay` is null for pests (they last until treated or harvested); `cost` = treat price on pests |
| `game.treatPest(fieldId)` / `game.treatPestCost(fieldId)` | `{ok, cost}`; instant, `sizeHa × BALANCE.pestTreatPerHa` (40) |

- **Seasons/growth.** Crops may list good `seasons` (temperate and/or tropical ids) and a `minTemp`. Each hour a growing crop advances `growHours` by: 0 when today's region temp < `minTemp`; 0.6 off-season (the crop lists seasons of that family but not this one); 1 in season; otherwise the season's `growthMult` (winter 0.7). A 🌈 *perfect* event multiplies by 1.25. `growHours` is therefore fractional.
- **Season yield factor** = average over growing hours of 1.1 (in season) / 1 / 0.95 (off-season). Crop prices tilt toward `basePrice × (1 ∓ 0.16·share)`: cheaper while the crop is in season on the temperate calendar, dearer otherwise (yearly average 1).
- **Events** (`BALANCE.events`; chance 0.25/day, one at most): `pest` (a growing field, yield ×0.75 until `treatPest`), `storm` (region: growing crops ×(0.85–0.95) as `fields[id].damage`, forced rain that day), `heatwave` (region, 3–4 days: +6 °C, no rain), `boom` (an unlocked crop ×1.3–1.5 for 3–5 days) / `crash` (×0.7), `subsidy` (money: max(800, 60 × owned ha)), `perfect` (region, 2–3 days, growth ×1.25). Boom/crash prices stay within the 0.5–1.8× band and are divided back out when they end.
- **Soil (F6).** `fields[id].ph` starts at the definition pH and `nutrients` at 0.8. `soil.applyLime` (lime task) moves pH 0.5 toward 6.8; `onFertilize` adds 0.4 (cap 1); `onHarvest` subtracts `crop.nutrientUse`, legumes (`legume:true`, soybean) add 0.15, and records `lastCropId`. Factors: `nutrients = 0.6 + 0.4·n`, `rotation = 0.9` when the crop equals `lastCropId`. Estimates with `{fertilized:true}` on an unfertilized field count the +0.4 nutrients.
- Field view extras: `unlockLevel` (effective), `locked` (unowned and level too low), `ph` (current), `soilState:{ph, nutrients, lastCropId}` (unowned: definition pH, 0.8; `soil` stays the definition's soil type), `pest`, `pestCost`, `season`, `growthMult` (null unless growing; 0 = stalled by cold); `yieldFactors` gains `season, nutrients, rotation, pest, storm`. `fields.resetCropCycle(f)` clears pest/damage/season data on seeding and harvest.

## Daily missions and rivals (stream C)
`js/engine/missions.js` and `js/engine/rivals.js`. Both use their own hash-seeded RNG (`seed|m|day`, `seed|rivalId|…`) and never consume `state.rng`.

| Call | Returns |
|---|---|
| `game.missionsView()` | `{ day, streak, streakGoal:7, streakBonus:{money, xp}, resetsInHours, claimable, list:[{ id, type, label, emoji, target, progress, frac, reward, xp, done, claimed, cropId, task }] }` |
| `game.claimMission(id)` | `{ok, reward, xp}`; only once, only when `done`. Unclaimed finished missions are paid automatically at the next rollover |
| `game.leaderboard()` | `[{ id, name, emoji, personality:'steady'\|'aggressive'\|'volatile'\|null, netWorth, isPlayer, rank, change }]` sorted by net worth (player id `'player'`); `change` = places gained since the last rollover ranking |

- **Missions**: 3 per game day with distinct types, picked by weight from what is possible right now and scaled to level, owned fields and net worth. Types: `harvest` (t of a crop that is ready or due within ~30 h), `sell` ($ via `stats.salesValue`, incl. plan auto-sell, minus market purchases made while it runs; target ≥ 2× base reward), `task` (N plow/seed/fertilize/irrigate/lime tasks), `tasks_any`, `xp` (XP gained), `feed` (t of crops an owned herd eats, bought at market; target ≥ max(1 t, 1 day of herd feed, 0.75× base reward at the cheapest feed buy price); only with animals and silo room), `contract` (only with an active contract), `factory` (N `factory_done` batches, only when `factoriesView()` shows an owned factory). Progress is fed by `Game.emit` → `missions.trackEvent`. Reward = `300·level + min(0.2%·netWorth, 300·level)` × type factor (≤ 600·level, no compounding); XP = `(20 + 0.004·levelGap)` × factor; the `xp` mission asks for max(30, 2–4% of the level gap).
- **Streak**: +1 on the day all 3 missions finish; reset if a day is missed. Every 7th streak day pays `streakBonus` (5× base reward, 3% of the level gap in XP) with `mission_streak`.
- **Rivals** (7, `RIVALS`): `points` = `[day, $]` keypoints, geometric (log-linear) between points and linear ($/day of the last segment) after the last one (`rivalCurve(r, day)`), times seeded wobble (steady ±1.5%, aggressive ±4%, volatile ±9%). Calibrated on a 900-day greedy bot with the Lv30 data: weak rivals fall in the first weeks, Iowa Golden Acres (#2) around day 120–180, and the elite Agro Nusantara Group (≈ $2.8M d200, $25M d400, $117M d800, still growing) is overtaken around Lv 20–23 (day ≈ 410–540) and stays within reach afterwards.

## Finance ledger (`js/engine/ledger.js`)
Every money movement goes through `game.spend(amount, category, {stat})` / `game.earn(amount, category, {stat})` (modules only; `category` = ledger id or a split map `{id: part}`, default `'lainnya'` / `'lainnya_masuk'`; unknown or wrong-direction ids fall back to those). Financing ids never count in `stats.totalSpent/totalEarned`; `{stat:false}` books to the ledger only (asset sales, level/achievement rewards, interest — unchanged stats behaviour). `game.payOrBorrow(amount, category)` pays even when broke: the shortfall is added to the loan and booked as `pinjaman_masuk` (harvest cost, wages, contract penalties); unpaid interest is capitalised the same way.
- Categories (`CATEGORIES`: `{id, name, emoji, group}`): **income** `penjualan_panen` (crop sales incl. plan/harvest auto-sell and silo overflow), `penjualan_ternak_produk`, `penjualan_olahan`, `penjualan_ternak`, `kontrak`, `hadiah` (achievements, level-up, missions, streak, subsidy), `penjualan_aset`, `lainnya_masuk`; **opex** `bbm`, `benih`, `pupuk_kapur_irigasi`, `sewa_pemanen`, `sewa_pemetik`, `perawatan_kebun`, `listrik_rumah_kaca`, `gaji`, `pakan` (`buyFeed`), `perbaikan`, `semprot_hama`, `bunga_pinjaman`, `penalti_kontrak`, `pembelian_produk`, `transportasi` (truck fuel), `riset` (research respec), `lainnya`; **capex** `beli_ladang`, `beli_mesin`, `upgrade_mesin`, `kandang`, `beli_ternak`, `indukan`, `gudang`, `pabrik`, `bibit_pohon`, `rumah_kaca`; **financing** `pinjaman_masuk`, `pelunasan_pinjaman`. Task costs are split: fuel → `bbm`, material → `benih`/`bibit_pohon`/`pupuk_kapur_irigasi`/`perawatan_kebun`, rented harvester → `sewa_pemanen`, rented pickers → `sewa_pemetik`.
- `financeReport(period)` (`'today'|'yesterday'|'7d'|'30d'|'all'`, default `'7d'`) → `{ period, days, income, opex, capex: {total, byCat:[{id,name,emoji,amount,pct}] /* desc */}, financing:{loanIn, repaid}, operatingProfit /* income − opex */, netCashFlow /* income − opex − capex + loanIn − repaid */, margin /* operatingProfit/income, null without income */, daily:[{day, income, opex, capex, profit}] }`. `7d`/`30d` include today; `all` uses all-time totals (`daily` = last 61 days). Midnight costs (wages, interest, penalties) belong to the day that ended.

## Logistics (`js/engine/logistics.js`, `logisticsView.js`)
Trucks are `MACHINES` with `type:'truck'` (`capacity` t, `speedKmh`, `fuelPerKm`; upgrades: engine +10% capacity, transmission +10% speed, efficiency −10% L/km). `data.CITIES`: `{id, name, emoji, unlockLevel, km:{regionId:km}, base, demand:{productId:mult}}`; route = nearest region with an owned field.
- `shipToCity(truckUid, cityId, cargo:{productId:qty})` → `{ok, id, hours, fuelCost, estValue}`. Cargo leaves the silo (feed reserve kept), fuel `2·km·fuelPerKm·fuelPrice·(1−perk fuel)` booked to `transportasi` at departure, truck + the least-skilled free worker get `busy = 'tripN'` for `hours = 2·km/speed` (×1.25 when worn). At `hours/2` the cargo sells at `market × cityMult` (income category = `saleCategory`, i.e. `penjualan_panen`/`penjualan_ternak_produk`/`penjualan_olahan`), event `delivery_done {cityId, value, gain, shipmentId}`; back home: `truck_returned`. Only unit `'t'` products count toward capacity; kg/L/pcs ride along free.
- `estimateShipment(...)` → full plan (`ok`, `reason`, `items`, `tons`, `capacity`, `km`, `hours`, `fuelCost`, `value`, `localValue`, `gain`, `wageCost`, `wearCost`, `profit`, `workerName`). `cityPrices(productId)` → `[{cityId,name,emoji,mult,price,km,reachable,unlocked}]` best first. `citiesView()`, `trucksView()`, `shipmentsView()` → `[{id, truckName, workerName, cityName, km, hours, done, progress, phase:'pergi'|'pulang', sold, value, estValue, fuelCost, cargo, tons}]`.

## Research (`js/engine/research.js`)
Points = `level − 1` (derived, so old saves get them); `data.RESEARCH` nodes `{id, branch, name, emoji, cost, requires, effects:{key:frac}}`, `data.RESEARCH_BRANCHES`. `researchView()` → `{points:{earned,spent,available}, perks, branches:[{id,name,emoji,done,nodes:[{id,name,cost,desc,requires,status:'unlocked'|'ready'|'open'|'locked',reason}]}], respecCost, canRespec}`; `researchPoints()`; `unlockResearch(id)`; `respecResearch()` (cost `respecPerLevel × level`, ledger `riset`); `perk(key)` = summed effect. Keys: `yield` (yieldFactors.research), `seedCost`, `fertCost`, `fuel` (tasks + trucks), `taskSpeed`, `feed`, `animalProd`, `births`, `wages`, `interest`, `contractPrice` (capped < 1.2 × market), `cityPrice`, `wear`, `silo`, `truckCap`. Events `research_unlocked`, `research_reset`; `level_up` carries `researchPoints`.

## Views (read-only plain objects)
- `getFieldView(id)`: the field data fields plus `{ region, owned, state:'unowned'|'idle'|'plowed'|'growing'|'ready'|'busy', baseState, task, hoursLeft, progress 0–1 (task progress when busy, growth otherwise), growth, crop:{id,name,emoji}|null, fertilized, irrigated, withering, witherFactor, dryDays, wetDays, predictedYield (t, without the random roll), yieldFactors:{soil,ph,fert,irrig,contamination,weather,wither}|null (multipliers, 1 = neutral; null without a crop), plan:{cropId,fertilize,irrigate,rent,repeat,blocked}|null, nextStep:task|null (next cycle step, plan-aware; null while busy or growing without irrigation to do), actions, weather }`. `actions` lists only tasks the player can run, meaning they own a tractor plus the matching implement; harvest is always possible through renting. `'sell'` is listed only on idle fields when more than one field is owned. Unowned fields have `actions:['buy']`.
- `fieldsView()`: `getFieldView` for every field in `FIELDS`.
- `marketView()`: `[{ id, name, emoji, unit, category, price, buyPrice (price * BUY_MARKUP), buyable (true for crops), basePrice, ratio, change (% vs yesterday), history:[≤30 prices], stock }]`.
- `siloView()`: `{ items:[{ id, name, emoji, unit, category, qty, price, value, reserve, sellable, isFeed }], totalValue }`. `category` comes from `PRODUCTS[].category`: `'crop'` (field and orchard harvest), `'animal'` (livestock products) or `'processed'` (factory goods); `ledger.saleCategory` books sales by the same grouping.
- `machinesView()`: owned machines as `[{ ...machineDef with upgraded hp/speed/haPerHour/fuelPerHour, base /* raw def */, uid, busy:false|fieldId, condition, repairCost, upgrades:{engine,transmission,efficiency}, upgradeLevel /* sum */, upgradeSpent, paint, sellValue }]` (`mv` in the tables above; `availableMachinesFor` items carry the upgraded stats plus `condition`, `upgrades`, `upgradeLevel`, `paint`).
- `shopView()`: `[{ ...machineDef, unlocked, affordable, owned:count, maxTractorHp /* upgraded */, hpOk }]`.
- `animalsView()`: `[{ ...animalDef, count, barns, capacity, quality, happiness, fed, productionPerDay, unlocked, feedNeedPerDay, feedStock, feedDaysLeft, breedQuality, stars, breeding, breedingActive, breedPaused /* reason text or null */, cycleDays, breedDays, nextBirthIn, expectedBirths, bornTotal, bornLast, lastBirthDay, bornToday, studTier, studMaxTier, studTarget, intensive:{births,feed,production}, nextStud:{tier, capacity, cost, target, reqLevel, reason}|null }]`.
- `weatherView()`: `[{ regionId, name, temp, rain, season:{id,name,emoji,growthMult} }]`.
- `levelInfo()`: `{ level, xp, current, next|null, maxed, progress }`. `LEVELS` has 30 entries; at level 30 `next` is null, `maxed` true, `progress` 1 and XP keeps accumulating without further `level_up`. Each level-up pays `BALANCE.levelReward × level` (summed over multi-level jumps; not counted in `totalEarned`).
- `loanInfo()`: `{ loan, cap, dailyRate }`.
- `netWorth()`: money + 0.7·land + machine resale (`(0.6·price + 0.5·upgrade spend)·condition`) + silo at market + 0.6·animal purchase price + 0.6·owned factories (price + upgrade costs paid, `upgradeCost·Σ(1..level−1)`) − loan.
- `achievementsView()`: `[{ ...achievementDef, unlocked, value }]`.

## Events
`game.on(fn)` returns an unsubscribe function. Events look like `{ type, msg, day, hour, ...extra }`. Types:
`task_done {fieldId, task, cropId?, tons?}`, `crop_ready {fieldId}`, `wither {fieldId}`, `achievement {achievementId}`, `level_up {level, reward, unlocks:{crops,machines,animals,fields,regions,factories:[ids]}}` (fields by effective unlock level; factories from `data.FACTORIES ?? []`), `weather {weather}`, `low_feed {animalId, fed}`, `sale {productId, qty, value}`, `purchase {productId, qty, cost}`, `field_bought {fieldId}`, `machine_bought {uid}`, `barn {animalId}`, `silo_overflow {productId, qty, earned}`, `silo_upgraded {capacity, cost}`, `worker_hired {workerId}`, `wages_unpaid {amount}`, `machine_breakdown {uid, fieldId}`, `machine_repaired {uid, cost}`, `season_change {regionId, season:{id,name,emoji}}` (regions with owned fields only), `event_start {eventId, eventType, regionId?, fieldId?, productId?}`, `pest {eventId, eventType:'pest', fieldId, regionId}` (instead of event_start), `event_end {eventId, eventType}` (not for one-day storm/subsidy; also on `treatPest`), `mission_done {missionId}` (once per mission), `missions_new {missions:[ids]}`, `mission_streak {streak, money, xp}`, `rank_up {rank, prevRank, passed:[rivalIds]}` (daily, when the player passed rivals), plus the contract events from contracts.js. Engine messages format numbers id-ID ("38,91 t", "$1.234").
Breeding and upgrades: `animals_born {animalId, n}`, `herd_full {animalId}`, `breed_improved {animalId, breedQuality}`, `breeding_stock {animalId, tier, cost}`, `machine_upgraded {uid, track, level, cost}`.
`state.log` keeps the last 50 events as `{ type, msg, day, hour }`.

## State shape (`game.state`, JSON-serializable)
```js
{
  version: 1, seed, rng /* mulberry32 state */, time /* game hours */, speed,
  money, xp, level, loan, nextUid,
  fields: { [fieldId]: { state, cropId, fertilized, irrigated, growHours, readyHours, dryDays, wetDays,
            limed /* lime done this cycle */, ph, nutrients /* 0–1 */, lastCropId, pest, damage /* storm, 1 = none */,
            seasonSum, seasonN /* season yield average */, plan: null | { cropId, rotateCropId, fertilize, irrigate, rent, repeat, lime, sell, blocked },
            orchard: null | { plantedAt, harvests, pruned, matureNotified },
            greenhouse: null | { builtDay, cost },
            busy: null | { task, hours, done, machineUids, cropId, rented, workerId, yieldTons?, cost?, costSplit? /* harvest, paid at completion */ } } },
  machines: [{ uid, defId, busy: false | fieldId, condition /* 0–1, F10 */, upgrades: { engine, transmission, efficiency } /* 0–3 */, paint? }],
  silo: { [productId]: qty },                 // crops in t, animal products in their unit
  siloCapacity,                               // t (F8)
  workers: [{ id, name, skill, wage, busy }], nextWorkerId, candidates: [{ id, name, skill, wage }], candidatesWeek, // F9
  animals: { [animalId]: { count, barns, quality 0.1–1, happiness 0–1, fed 0–1, feedAlert: 'ok'|'low'|'starving',
            breedQuality 0.5–1.5, breedPeak /* best 0.1 step announced ×10 */, breeding, breedDays, birthCarry, bornTotal, bornLast,
            lastBirthDay, studTier 0–5, studCap /* capacity at last stud purchase */, fullNotified } },
  breedRng,                                   // breeding RNG stream (created on first birth)
  weather: { [regionId]: { temp, rain } },
  forecast: { [regionId]: [{ day, temp, rain, u /* rain draw */ }×3] }, events: [{ id, type, startDay, endsDay, regionId?, fieldId?, productId?, mult?, damage?, amount? }], nextEventId,
  market: { [productId]: price }, priceHistory: { [productId]: number[≤30] },
  stats: { harvests, fieldsOwned, machinesOwned, machineModels /* distinct defIds */, animalsOwned,
           livestockOwned /* herds with ANIMALS.livestock */, totalEarned, totalSpent, tonsHarvested, level,
           productsSold, salesValue /* $ from sellProduct */, contractsDone, regionsOwned /* distinct regions with an owned field */ },
  history: [{ day, money, netWorth }],          // ≤120, one per daily rollover
  contracts: [...],                             // owned by js/engine/contracts.js
  feedReserve: { [cropId]: tons },
  factories: { [factoryId]: { level, recipeId, queued, progress /* work hours */, running, auto, blocked } }, // stream B
  missions: { day, streak, lastFullDay, list: [{ id, type, target, progress, base /* stat at creation */, reward, xp, done, claimed, cropId?, task? }] },
  rivals: { day, ranks: { [rivalId|'player']: rank } },   // last rollover ranking
  ledger: { since /* first tracked day */, cur: { day, cats: { [categoryId]: $ } }, days: [{ day, cats }] /* ≤60 closed days */, total: { [categoryId]: $ } },
  achievements: [achievementId], log: [...], savedAt? /* ms, set by serialize */
}
```
Treat `state` as read-only in the UI. Change it only through the methods above.
Engine constants are exported from the modules: market `PRICE_MIN 0.5`, `PRICE_MAX 1.8`, `MEAN_REVERSION 0.08`, `SEASONAL_AMP 0.08`; tasks `RENT_HA_PER_HOUR 1`; economy `FIELD_REFUND`, `MACHINE_REFUND`, `LOAN_CAP_PER_LEVEL`, `LOAN_DAILY_RATE` (default; `loanRate(game)` reads `BALANCE.loanDailyRate`); purchase `BUY_MARKUP 1.2`; fields `WITHER_AFTER_HOURS 72`, `WITHER_PER_DAY 0.1`; persist `HISTORY_SIZE 120`, `STATS_KEYS`; ledger `LEDGER_DAYS 60`, `CATEGORIES`.
