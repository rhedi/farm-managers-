# Farm Manager Engine API

`js/engine.js` holds the game logic. It has no DOM and does not touch `localStorage` directly; storage is passed in. All player-visible strings are in Bahasa Indonesia.
Modules: `js/engine/{rng,defs,weather,market,fields,tasks,taskrun,animals,economy,purchase,plans,contracts,views,persist,storage,workers,wear,seasons,events,soil,missions,rivals,breeding,upgrades,ledger,orchard,greenhouse,logistics,logisticsView,dispatcher,research,staff,factoryManager,factoryPlanner}.js`. The UI should only need `engine.js`.

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
| `game.advance(hours)` | simulates in steps no longer than 1 hour: task and truck progress, hourly crop growth and factories, the daily rollover at each multiple of 24h, then the Manajer Pabrik pass (when due), field plans and the Manajer Logistik planner (every hour and after a task or trip finishes; plans first) |
| `game.setSpeed(0\|1\|2\|5)` | `{ok}`; 0 pauses |
| `game.clock()` | `{ time, day, hour, speed }`; `day = floor(time/24)+1`. A new game starts at day 1, 06:00 |
| `game.day`, `game.hour` | getters |

Daily rollover runs in this order: world events (`stepEventsDay`: expire finished ones, maybe start one), weather for each region (consuming the forecast), dry/wet day counters on growing fields and orchards, `season_change` events, market random walk, animal feeding and production (with animal XP), then breeding (stud genetics, births), loan interest, greenhouse electricity (`stepGreenhouseDay`, ledger `listrik_rumah_kaca`), worker wages and the weekly candidate refresh (`stepWorkersDay`), the Manajer Logistik wage (`stepDispatcherDay`), the Manajer Pabrik wage (`stepFactoryManagerDay`, also resets its `today`), contracts (`stepContractsDay`), a `state.history` entry, rival ranking (`rank_up`), new daily missions (`missions_new`), then a `weather` event. The Manajer Pabrik pass itself runs after the rollover in the same hour (see `advance`).

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
| `storageInfo(kind)` / `upgradeStorage(kind)` | `kind` = `'silo'` \| `'cold'` (Gudang dingin). One implementation in `js/engine/storage.js`, see **Storage** below. Info: `{kind, name, level /* 1-based */, upgrades, used, capacity, free, step, nextCapacity, nextUpgradeCost, overflowRate}` (t; `capacity`, `step`, `nextCapacity` include the research perk). Upgrade → `{ok, level, capacity, cost}`, booked to ledger `gudang` (capex), emits `${kind}_upgraded {kind, level, capacity, cost}`; fails with `'Uang tidak cukup.'` or `'Gudang tidak dikenal.'` |
| `workersView()` / `workerCandidates()` / `hireWorker(candidateId)` / `fireWorker(id)` | F9. Workers `[{id, name, skill 0–1, wage, busy:false\|fieldId, busyField, speedup}]`; 3 candidates `[{id, name, skill, wage}]`, re-rolled every 7 days. Hiring is free; the last worker and busy workers can't be fired |

**Workers (F9).** Every task except a rented harvest needs a free worker; otherwise it fails with `'Tidak ada pekerja bebas.'` (estimates still fill `hours`/`cost`). The most skilled free worker is used; skill makes the task up to 20% shorter (`hours × (1 − 0.2·skill)`) and grows by `1%·(1−skill)` per finished task. Wages are paid in the daily rollover; any shortfall is added to the loan with a `wages_unpaid` event. `estimateTask` also returns `{machineUids, workerId, workerName}`.

**Wear (F10).** `machines[i].condition` falls by `BALANCE.wear.perHour` (0.002) per working hour of each machine in the rig. Below 0.5 the task takes 25% longer (20% slower). Below 0.2, starting a task rolls a 5% breakdown: the task takes 50% longer and `machine_breakdown {uid, fieldId}` fires. Rented harvesters don't wear.

**Machine upgrades.** All task code uses upgraded stats (`js/engine/upgrades.js` `effectiveStats`): tractor `hp × (1 + 0.15·engine)` (hp check against `hpRequired`), `speed × (1 + 0.1·transmission)`; harvester `haPerHour × (1 + 0.1·engine)(1 + 0.1·transmission)`; implement `haPerHour × (1 + 0.1·transmission)` (implements have no engine/efficiency track); `fuelPerHour × (1 − 0.1·efficiency)`. `machinesView`, `availableMachinesFor` and `shopView().maxTractorHp` report the upgraded values.

Animals eat the cheapest accepted feed crop (by market price) first. Each day they give XP equal to `xpPerHarvestValue` × the value of their production at base price. A `low_feed` event fires only when a herd's feed status changes (ok → low → starving).

**Breeding** (`js/engine/breeding.js`, `BALANCE.breeding`). Each herd has genetics `breedQuality` 0.5–1.5 (1.0 = 3★, `stars = 1 + (bq − 0.5)·4`) that multiplies production and sale price. A day counts toward the species cycle (`BALANCE.breeding.animals[id] = {days, rate}`, e.g. chickens 4 d, cows 12 d) when the herd is fully fed, happiness > 0.7, ≥ 2 head and there is free barn room. At the end of a cycle `count·rate` (×4 intensive) newborns arrive (fraction carried over, capped by free room) with genes `bq ± 0.02` (separate RNG stream `state.breedRng`), giving `animals_born {animalId, n}` and `0.5 × xpPerHarvestValue × n·sellPrice` XP. A full barn stops births and emits `herd_full {animalId}` once (only for herds that breed). `breed_improved {animalId, breedQuality}` fires each time genetics first reach a new 0.1 step. Natural births are worth ≈ 6% of net production; selling newborns from intensive breeding earns less than plain production, so buy→breed→sell is no money loop.

**Storage (`js/engine/storage.js`).** Stock lives in `state.silo` (all products); two stores limit it, both in tons:
- `silo`: products with unit `'t'` (crops, fruit, processed goods in t). `cold`: products with `category: 'animal'`, weighed at 1 kg per L/kg or `PRODUCTS[].kgPerUnit` per pcs (eggs 0.06, duck eggs 0.07). Processed goods in kg take no space. `siloView()` items carry `storage` (`'silo'|'cold'|null`) and `tons`.
- Config `BALANCE.storage[kind] = {start, minStep, stepRate, costPerT, costGrowth, overflowRate}`; level `state.storageUpgrades[kind]` (upgrades bought). Built capacity: `start`, and upgrade n+1 adds `max(minStep, niceCeil(stepRate × capacity))` (nice = 1/1.2/1.5/2/2.5/3/4/5/6/8 × 10^k) for `step × costPerT × costGrowth^n` (3 significant digits). Silo 150 → 350 → 550 → 850 → 1350 → 2150 → 3350 → 5350 t … ($3000, $3150, $4960, $8680, $14,600 …); cold 10 → 20 → 30 → 45 → 70 → 110 t … ($5000, $5250, $8270, $14,500 …). Usable capacity = built × (1 + perk `silo`) for **both** stores (research Gudang Rapi). Exports `builtCapacity(cfg, n)`, `upgradeCost(cfg, n)`, `upgradesFor(cfg, tons)`.
- `storeProduct(game, productId, qty)` adds stock; the part that doesn't fit its store is sold at once at `overflowRate` (0.7) × market, booked by `saleCategory` (+ `stats.productsSold/salesValue`), and `${kind}_overflow {kind, productId, qty, earned}` fires. Used by harvests (silo) and daily animal production (cold). `roomFor(game, {productId: qty})` → `''` or `'Silo penuh: sisa ruang X t.'` / `'Gudang dingin penuh: sisa ruang X t.'`: `buyProduct` refuses, a finished factory batch waits at 100%.
- Load migration: a missing level becomes the first level whose built capacity holds `max(old siloCapacity, stock)` (silo) or the animal stock (cold); `siloCapacity` is dropped.

## Factories (stream B)
Modules `js/engine/factories.js` (actions, hourly step) and `js/engine/factoryView.js`; data `FACTORIES` in `js/data.js` (`{id, name, emoji, unlockLevel, price, upgradeCost, maxLevel, recipes:[{id, inputs:{productId:qty}, outputs:{productId:qty}, hours}]}`).

| Call | Returns |
|---|---|
| `factoriesView()` | `[{ id, name, emoji, unlockLevel, price, maxLevel, unlocked, owned, level (0 if not owned), speed, upgradeCost\|null, recipeId, recipe, recipes, running, queued, auto, progress 0–1, hoursLeft, blocked:reason\|null }]`. Recipe views: `{ id, name, emoji, inputs:[{id,name,emoji,unit,qty,stock,enough}], outputs:[…], baseHours, hours, inValue, outValue, valueAdd, canStart }` (values at base price; `stock` excludes the feed reserve) |
| `buyFactory(id)` | `{ok, cost}`; needs `unlockLevel`; selects the first recipe; emits `factory_bought {factoryId}` |
| `upgradeFactory(id)` | `{ok, level, cost}`; costs `upgradeCost × level`, up to `maxLevel`. Each level makes batches ×1.25 faster: `ceil(hours / 1.25^(level−1))` |
| `setRecipe(id, recipeId)` | `{ok, recipeId}`; not while a batch runs; clears the queue. Fails on a factory run by the Manajer Pabrik (`'🤖 Dikelola Manajer Pabrik. …'`) |
| `startBatch(id, count=1)` | `{ok, queued}`; queues batches. Fails with `'Bahan kurang: …'` when idle and the first batch's inputs are missing, and on a managed factory |
| `setFactoryAuto(id, on)` | `{ok, auto}`; auto mode starts a new batch whenever inputs are there. Fails on a managed factory |

A batch takes its inputs from the silo when it starts (the feed reserve is never used) and counts work at each full game hour (`Game.advance`, after crop growth). On completion the outputs are added and `factory_done {factoryId, productId, qty}` fires once per output product; XP = `xpPerHarvestValue` × output value at base price. When outputs don't fit their store (`roomFor`; only 't' goods use the silo), the batch waits at 100% (`'Silo penuh: …'`). `factory_blocked {factoryId, reason}` fires only when the blocked reason changes (missing inputs for a queued/auto batch, or silo full). No RNG is used. Processed goods are normal `PRODUCTS` and sell on the market.

## World: seasons, forecast, events, soil (F5/F6)
Modules `seasons.js` (derived from the day, no state/RNG), `events.js` (`state.events`), `soil.js` (field `ph`, `nutrients`, `lastCropId`); weather/forecast in `weather.js`.

| Call | Returns |
|---|---|
| `game.seasonOf(regionId)` | `{id, name, emoji, growthMult}` or `null`. Ids: temperate `spring\|summer\|autumn\|winter` (10 days each, `BALANCE.yearDays` 40, day 1 = spring; `climate.southern` regions such as Pampas run half a year shifted, temperature too); tropical regions (`climate.tropical`, Jawa Barat, Kalimantan, Mekong, Kenya, Mato Grosso) `wet\|dry` (wet days 1–10 and 31–40; rain chance ±0.2) |
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
- Categories (`CATEGORIES`: `{id, name, emoji, group}`): **income** `penjualan_panen` (crop sales incl. plan/harvest auto-sell and silo overflow; cold-store overflow books to `penjualan_ternak_produk`), `penjualan_ternak_produk`, `penjualan_olahan`, `penjualan_ternak`, `kontrak`, `hadiah` (achievements, level-up, missions, streak, subsidy), `penjualan_aset`, `lainnya_masuk`; **opex** `bbm`, `benih`, `pupuk_kapur_irigasi`, `sewa_pemanen`, `sewa_pemetik`, `perawatan_kebun`, `listrik_rumah_kaca`, `gaji`, `pakan` (`buyFeed`), `perbaikan`, `semprot_hama`, `bunga_pinjaman`, `penalti_kontrak`, `pembelian_produk`, `transportasi` (truck fuel), `riset` (research respec), `lainnya`; **capex** `beli_ladang`, `beli_mesin`, `upgrade_mesin`, `kandang`, `beli_ternak`, `indukan`, `gudang`, `pabrik`, `bibit_pohon`, `rumah_kaca`; **financing** `pinjaman_masuk`, `pelunasan_pinjaman`. Task costs are split: fuel → `bbm`, material → `benih`/`bibit_pohon`/`pupuk_kapur_irigasi`/`perawatan_kebun`, rented harvester → `sewa_pemanen`, rented pickers → `sewa_pemetik`.
- `financeReport(period)` (`'today'|'yesterday'|'7d'|'30d'|'all'`, default `'7d'`) → `{ period, days, income, opex, capex: {total, byCat:[{id,name,emoji,amount,pct}] /* desc */}, financing:{loanIn, repaid}, operatingProfit /* income − opex */, netCashFlow /* income − opex − capex + loanIn − repaid */, margin /* operatingProfit/income, null without income */, daily:[{day, income, opex, capex, profit}] }`. `7d`/`30d` include today; `all` uses all-time totals (`daily` = last 61 days). Midnight costs (wages, interest, penalties) belong to the day that ended.

## Logistics (`js/engine/logistics.js`, `logisticsView.js`)
Trucks are `MACHINES` with `type:'truck'` (`capacity` t, `speedKmh`, `fuelPerKm`; upgrades: engine +10% capacity, transmission +10% speed, efficiency −10% L/km). `data.CITIES`: `{id, name, emoji, unlockLevel, km:{regionId:km}, base, demand:{productId:mult}}`; route = nearest region with an owned field.
- `shipToCity(truckUid, cityId, cargo:{productId:qty})` → `{ok, id, hours, fuelCost, estValue}`. Module form `shipToCity(game, uid, cityId, cargo, {auto, bonus})`: `auto` marks the shipment (manager trip, no `delivery_start` event), `bonus` is added to the city multiplier (`cityMult(game, city, productId, bonus)`, crops still capped at `cropCap`) for the estimate and the sale. Cargo leaves the silo (feed reserve kept), fuel `2·km·fuelPerKm·fuelPrice·(1−perk fuel)` booked to `transportasi` at departure, truck + the least-skilled free worker get `busy = 'tripN'` for `hours = 2·km/speed` (×1.25 when worn). At `hours/2` the cargo sells at `market × cityMult` (income category = `saleCategory`, i.e. `penjualan_panen`/`penjualan_ternak_produk`/`penjualan_olahan`), event `delivery_done {cityId, value, gain, shipmentId}`; back home: `truck_returned`. Only unit `'t'` products count toward capacity; kg/L/pcs ride along free.
- `estimateShipment(...)` → full plan (`ok`, `reason`, `items`, `tons`, `capacity`, `km`, `hours`, `fuelCost`, `value`, `localValue`, `gain`, `wageCost`, `wearCost`, `profit`, `workerName`). `cityPrices(productId)` → `[{cityId,name,emoji,mult,price,km,reachable,unlocked}]` best first. `citiesView()`, `trucksView()`, `shipmentsView()` → `[{id, truckName, workerName, cityName, km, hours, done, progress, phase:'pergi'|'pulang', auto, sold, value, estValue, fuelCost, cargo, tons}]`.

## Manajer Logistik (`js/engine/dispatcher.js`)
A hired staff role (not in `state.workers`) that sends idle trucks with silo stock to the most profitable city. Tiers are `BALANCE.dispatcher.tiers` `[{id, name, title, emoji, skill /* ★ 1–3 */, unlockLevel, hireCost, wage, trucks /* max manager trips on the road */, radiusKm, bonus /* city price */}]`: `magang` (Lv 6, $3000, $150/day, 1 truck, 100 km, +0%), `senior` (Lv 9, $12,000, $450, 3, 300 km, +2%), `direktur` (Lv 14, $30,000, $900, 6, 1000 km, +4%). `BALANCE.dispatcher.tradeIn` (0.5): the share of the current tier's `hireCost` credited when replacing it.

| Call | Returns |
|---|---|
| `dispatcherView()` | `{unlockLevel, level, hired: null \| {id, name, title, emoji, stars, unlockLevel, hireCost, wage, trucks, radiusKm, bonus, hiredDay, wagePaid}, on, note /* why it is waiting, '' */, tradeIn, candidates:[{…tier, locked, current /* the hired tier */, price /* hireCost, or the replace cost when hired */, credit /* trade-in, 0 when not hired */, wageDiff /* wage after perk − the hired one's, 0 when not hired */, reason /* null = can hire / replace with it */}], settings, steps:{minProfit, minMargin, keepPct}, stats:{trips, extraProfit, value}, today:{trips, profit}, onRoad, recent:[{day, hour, shipmentId, truckUid, truckName, cityId, cityName, cityEmoji, cargo, cargoText, tons, value, estProfit}] /* ≤ 6, newest first */, trucks, workers, cities:[{id, name, emoji, km, allowed, inRange}] /* unlocked + reachable */, products:[{id, name, emoji, unit, category, qty, excluded, keepPct, held, groupOn}] /* in stock or configured */, sellPlans /* field plans with auto-sell */}` |
| `hireDispatcher(tierId)` | `{ok, cost}`; fails below the tier's level (`'Butuh level N.'`), while one is hired (use `replaceDispatcher`), or without money. Books `hireCost` to `gaji`, turns it on, emits `dispatcher_hired {tierId, cost}` and plans at once |
| `replaceDispatcher(tierId)` | `{ok, cost, credit, from, to}`; promote or downgrade the hired manager. `credit = tradeIn × current hireCost`, `cost = max(0, new hireCost − credit)` booked to `gaji` (nothing booked at $0). Fails without a manager (`'Belum ada manajer logistik.'`), for the same tier, an unknown id, below the tier's level (`'Butuh level N.'`) or without money; nothing changes on failure. Sets `hired = {tierId, hiredDay: today}`; settings, `on`, `held`/`seen`, `stats`, `today`, `recent` and trips on the road stay (they keep the bonus they left with); the new `trucks`/`radiusKm`/`bonus` apply from the planning pass run at once (when on). Emits `dispatcher_replaced {from, to, cost}`. The next daily rollover pays the new wage |
| `fireDispatcher()` | `{ok}`; trips on the road continue; settings stay. Emits `dispatcher_fired {tierId}` |
| `setDispatcherOn(on)` | `{ok, on}`; turning on plans at once. Needs a hired manager |
| `setDispatcherSettings(patch)` | `{ok, settings}`; partial patch, works without a manager. `groups:{crop, animal, processed}` (merged per key), `exclude:[productId]`, `keepPct:{productId: 0–90}`, `minProfit` $ (≥ 0), `minMargin` % of the local value (0–100), `blockedCities:[cityId]`, `reserveWorkers` (0–20), `maxTrucks` (0 = the tier's `trucks`). Values are clamped, unknown ids dropped |
| `runDispatcher()` | one planning pass now → `[{shipmentId, truckUid, cityId, cargo, estProfit}]` |

- **Stock the manager may load** (`dispatchableStock`): silo − feed reserve − remaining qty of active contracts − held "sisakan %", only allowed groups and non-excluded products with a market price. "Sisakan X%" is a ledger (`held`, `seen`): every increase of a product's stock since the last pass adds X% of it to `held` (capped at the stock); setting a new X restarts it at X% of the current stock.
- **Pass** (every game hour after `runPlans`, after a finished task/trip, and on hire/replace/on/settings): skip when not hired or paused. Trucks = owned, idle trucks with condition ≥ `wear.breakdownBelow` (0.2), largest capacity first then uid. For each: stop when `min(tier.trucks, maxTrucks || ∞)` manager trips are on the road or free workers ≤ `reserveWorkers`. For every unlocked, reachable, non-blocked city within `radiusKm`: cargo = goods whose `market × (cityMult(bonus) − 1) > 0`; ton goods by gain per ton until `capacity` (0.01 t floors), kg/L/pcs in full; `planShipment(…, {bonus})` must be `ok` and `profit ≥ minProfit` and `profit ≥ localValue × minMargin/100`. The highest profit wins (first city in `CITIES` order on ties) and leaves through `shipToCity(…, {auto:true, bonus})`, so the next truck sees the reduced stock. No RNG; 48 h catch-up = 48 cheap passes.
- Each dispatch updates `stats` (`trips`, `extraProfit` = Σ estimated profit, `value`), `today`, `recent`, and emits `auto_dispatch {truck, truckName, city, cityName, cargo, estProfit, shipmentId}`. The daily rollover pays `wage × (1 − perk wages)` to `gaji` via `payOrBorrow` (`wages_unpaid` on a shortfall).
- Load migration (`ensureDispatcher`): a missing `state.dispatcher` = not hired, default settings `{groups all on, exclude [], keepPct {}, minProfit 100, minMargin 3, blockedCities [], reserveWorkers 1, maxTrucks 0}`; unknown tiers/products/cities are dropped and values clamped.

## Manajer Pabrik (`js/engine/factoryManager.js`, `factoryPlanner.js`, shared staff helper `staff.js`)
A second staff role with the same hire / replace (trade-in) / fire rules as the Manajer Logistik (`staff.js`, ledger `gaji`). Tiers `BALANCE.factoryManager.tiers` `[{id, name, title, emoji, skill, unlockLevel, hireCost, wage, factories /* max controlled, null = all */, intervalHours, inputMult, outputMult, buyInputs}]`: `supervisor` (Lv 11, $4000, $100/day, 2, every 6 h), `kepala` (Lv 15, $14,000, $480, 5, 2 h, inputs ×0.95), `direktur` (Lv 25, $32,000, $950, all, 1 h, inputs ×0.95, outputs ×1.06, may buy inputs). `tradeIn` 0.5.

| Call | Returns |
|---|---|
| `factoryManagerView()` | `{unlockLevel, level, tradeIn, hired: null \| {id, name, title, emoji, stars, unlockLevel, hireCost, wage, factories, intervalHours, inputMult, outputMult, buyInputs, hiredDay, wagePaid}, on, note, candidates /* as dispatcherView */, settings, steps:{minMargin, reservePct, headroom}, stats:{runs, batches, estProfit, bought}, today:{runs, batches, profit}, nextPassHours, lastRun: null \| {hoursAgo, text /* '2× Tepung, 1× Gula' */, runs:[{factoryId, recipeId, batches, name, emoji}]}, queuedBatches, busy, recent:[{day, hour, factoryId, recipeId, batches, estProfit, buyCost, factoryName, factoryEmoji, recipeName, recipeEmoji}] /* ≤ 6 */, factories:[{id, name, emoji, allowed, overCap /* allowed but past the tier cap */, managed, running, queued, recipeName, recipeEmoji, wait /* WAIT reason or null */}], products:[{id, name, emoji, unit, qty, reservePct}], owned}` |
| `hireFactoryManager(tierId)` / `replaceFactoryManager(tierId)` / `fireFactoryManager()` | as the dispatcher calls (`'Butuh level N.'`, `'Sudah ada manajer pabrik…'`, `cost = max(0, hireCost − 0.5 × current hireCost)`); events `factory_manager_hired {tierId, cost}`, `factory_manager_replaced {from, to, cost}`, `factory_manager_fired {tierId}`. Hire / replace run a pass at once; firing releases the factories (running batches finish) |
| `setFactoryManagerOn(on)` | `{ok, on}`; paused = factories back to the player, turning on plans at once |
| `setFactoryManagerSettings(patch)` | `{ok, settings}`; `factories: null \| [factoryId]` (null = every owned factory), `reservePct:{productId: 0–90}` (replaces the map), `minMargin` % (0–100, default 5), `buyInputs` (only used by a `buyInputs` tier), `headroom` % store fill limit (50–100, default 90), `contracts` (keep active contract stock, default true). Clamped, unknown ids dropped |
| `runFactoryManager()` | one pass now → `[{factoryId, recipeId, batches, use, buy, buyCost, estProfit}]` |

- **Control**: controlled = owned ∩ `settings.factories`, the first `tier.factories` in `FACTORIES` order. They get `managed: true`, `auto: false` and the tier's `inMult` / `outMult` (a batch fixes `batchOut` when it starts); player recipe/batch/auto calls fail on them.
- **Pass** (`planPass`, pure): usable stock = sellable − inputs of queued-but-not-started batches − active contract remainder − Manajer Logistik `held` − `reservePct`. Every recipe of each controlled factory is scored by margin = outputs × market − inputs × market − wage share; contract outputs still short come first, then margin per hour. Each factory takes its best recipe that passes `minMargin` (% of inputs + wage share) with `k = min(queue room, stock)` batches, queue room = `ceil(intervalHours / batch hours)` minus running/queued; `k` shrinks until stores that grow stay ≤ `headroom`% (stores that shrink are never limited). A `buyInputs` tier with the setting on buys missing crop inputs (`market × 1.2`, ledger `pembelian_produk`) for the rest of the queue when the all-bought margin still passes and money and room allow. Waits: `WAIT.input` 'bahan kurang', `WAIT.room` 'gudang hampir penuh', `WAIT.margin` 'margin terlalu kecil'. Each queued plan emits `factory_manager_run {factory, recipe, batches, estProfit, buyCost}`.
- **Hold rule** (`factoryHold`): the Manajer Logistik's `dispatchableStock` also subtracts the inputs of the controlled factories' queued batches plus a dry run of the next pass, so planned inputs are not shipped.
- Wage at the daily rollover (`stepFactoryManagerDay`, after the logistics wage). Offline catch-up is bounded by the 48 h `catchUp` cap (≤ 48 / intervalHours passes). Load migration (`ensureFactoryManager`): missing = not hired with default settings; unknown tiers/factories/products dropped, values clamped.

## Research (`js/engine/research.js`)
Points = `level − 1` (derived, so old saves get them; 49 at Lv 50); `data.RESEARCH` nodes `{id, branch, name, emoji, cost, requires, minLevel?, effects:{key:frac}}` (tier 5: `minLevel` 32–47, `'Butuh level N.'` below it), `data.RESEARCH_BRANCHES`. `researchView()` → `{points:{earned,spent,available}, perks, branches:[{id,name,emoji,done,nodes:[{id,name,cost,desc,requires,minLevel,levelOk,status:'unlocked'|'ready'|'open'|'locked',reason}]}], respecCost, canRespec}`; `researchPoints()`; `unlockResearch(id)`; `respecResearch()` (cost `respecPerLevel × level`, ledger `riset`); `perk(key)` = summed effect, capped at `PERK_MAX` 0.5. Keys: `yield` (yieldFactors.research), `seedCost`, `fertCost`, `fuel` (tasks + trucks), `taskSpeed`, `feed`, `animalProd`, `births`, `wages`, `interest`, `contractPrice` (capped < 1.2 × market), `cityPrice`, `wear`, `silo` (silo and Gudang dingin capacity), `truckCap`. Events `research_unlocked`, `research_reset`; `level_up` carries `researchPoints`.

## Views (read-only plain objects)
- `getFieldView(id)`: the field data fields plus `{ region, owned, state:'unowned'|'idle'|'plowed'|'growing'|'ready'|'busy', baseState, task, hoursLeft, progress 0–1 (task progress when busy, growth otherwise), growth, crop:{id,name,emoji}|null, fertilized, irrigated, withering, witherFactor, dryDays, wetDays, predictedYield (t, without the random roll), yieldFactors:{soil,ph,fert,irrig,contamination,weather,wither}|null (multipliers, 1 = neutral; null without a crop), plan:{cropId,fertilize,irrigate,rent,repeat,blocked}|null, nextStep:task|null (next cycle step, plan-aware; null while busy or growing without irrigation to do), actions, weather }`. `actions` lists only tasks the player can run, meaning they own a tractor plus the matching implement; harvest is always possible through renting. `'sell'` is listed only on idle fields when more than one field is owned. Unowned fields have `actions:['buy']`.
- `fieldsView()`: `getFieldView` for every field in `FIELDS`.
- `marketView()`: `[{ id, name, emoji, unit, category, price, buyPrice (price * BUY_MARKUP), buyable (true for crops), basePrice, ratio, change (% vs yesterday), history:[≤30 prices], stock }]`.
- `siloView()`: `{ items:[{ id, name, emoji, unit, category, qty, price, value, reserve, sellable, isFeed }], totalValue }`. `category` comes from `PRODUCTS[].category`: `'crop'` (field and orchard harvest), `'animal'` (livestock products) or `'processed'` (factory goods); `ledger.saleCategory` books sales by the same grouping.
- `machinesView()`: owned machines as `[{ ...machineDef with upgraded hp/speed/haPerHour/fuelPerHour, base /* raw def */, uid, busy:false|fieldId, condition, repairCost, upgrades:{engine,transmission,efficiency}, upgradeLevel /* sum */, upgradeSpent, paint, sellValue }]` (`mv` in the tables above; `availableMachinesFor` items carry the upgraded stats plus `condition`, `upgrades`, `upgradeLevel`, `paint`).
- `shopView()`: `[{ ...machineDef, unlocked, affordable, owned:count, maxTractorHp /* upgraded */, hpOk }]`.
- `animalsView()`: `[{ ...animalDef, count, barns, capacity, quality, happiness, fed, productionPerDay, unlocked, feedNeedPerDay, feedStock, feedDaysLeft, breedQuality, stars, breeding, breedingActive, breedPaused /* reason text or null */, cycleDays, breedDays, nextBirthIn, expectedBirths, bornTotal, bornLast, lastBirthDay, bornToday, studTier, studMaxTier, studTarget, intensive:{births,feed,production}, nextStud:{tier, capacity, cost, target, reqLevel, reason}|null }]`.
- `weatherView()`: `[{ regionId, name, temp, rain, season:{id,name,emoji,growthMult} }]`.
- `levelInfo()`: `{ level, xp, current, next|null, maxed, progress }`. `LEVELS` has 50 entries; at level 50 `next` is null, `maxed` true, `progress` 1 and XP keeps accumulating without further `level_up`. Load migration: a save whose banked XP exceeds the next level's threshold (old Lv 30 cap) has XP cut to `LEVELS[level]`, so the next gain levels up once. Machine upgrade level requirements are capped at 50. Each level-up pays `BALANCE.levelReward × level` (summed over multi-level jumps; not counted in `totalEarned`).
- `loanInfo()`: `{ loan, cap, dailyRate }`.
- `netWorth()`: money + 0.7·land + machine resale (`(0.6·price + 0.5·upgrade spend)·condition`) + silo at market + 0.6·animal purchase price + 0.6·owned factories (price + upgrade costs paid, `upgradeCost·Σ(1..level−1)`) − loan.
- `achievementsView()`: `[{ ...achievementDef, unlocked, value }]`.

## Events
`game.on(fn)` returns an unsubscribe function. Events look like `{ type, msg, day, hour, ...extra }`. Types:
`task_done {fieldId, task, cropId?, tons?}`, `crop_ready {fieldId}`, `wither {fieldId}`, `achievement {achievementId}`, `level_up {level, reward, unlocks:{crops,machines,animals,fields,regions,factories:[ids]}}` (fields by effective unlock level; factories from `data.FACTORIES ?? []`), `weather {weather}`, `low_feed {animalId, fed}`, `sale {productId, qty, value}`, `purchase {productId, qty, cost}`, `field_bought {fieldId}`, `machine_bought {uid}`, `barn {animalId}`, `silo_overflow` / `cold_overflow {kind, productId, qty, earned}`, `silo_upgraded` / `cold_upgraded {kind, level, capacity, cost}`, `worker_hired {workerId}`, `wages_unpaid {amount}`, `machine_breakdown {uid, fieldId}`, `machine_repaired {uid, cost}`, `season_change {regionId, season:{id,name,emoji}}` (regions with owned fields only), `event_start {eventId, eventType, regionId?, fieldId?, productId?}`, `pest {eventId, eventType:'pest', fieldId, regionId}` (instead of event_start), `event_end {eventId, eventType}` (not for one-day storm/subsidy; also on `treatPest`), `mission_done {missionId}` (once per mission), `missions_new {missions:[ids]}`, `mission_streak {streak, money, xp}`, `rank_up {rank, prevRank, passed:[rivalIds]}` (daily, when the player passed rivals), plus the contract events from contracts.js. Engine messages format numbers id-ID ("38,91 t", "$1.234").
Breeding and upgrades: `animals_born {animalId, n}`, `herd_full {animalId}`, `breed_improved {animalId, breedQuality}`, `breeding_stock {animalId, tier, cost}`, `machine_upgraded {uid, track, level, cost}`.
Logistics: `delivery_start {shipmentId, cityId}` (manual trips), `delivery_done {cityId, value, gain, shipmentId}`, `truck_returned {shipmentId, truckUid}`, `auto_dispatch {truck, truckName, city, cityName, cargo, estProfit, shipmentId}`, `dispatcher_hired {tierId, cost}`, `dispatcher_replaced {from, to, cost}`, `dispatcher_fired {tierId}`. Manajer Pabrik: `factory_manager_run {factory, recipe, batches, estProfit, buyCost}`, `factory_manager_hired`, `factory_manager_replaced`, `factory_manager_fired`.
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
  silo: { [productId]: qty },                 // all stock: crops in t, animal products in their unit
  storageUpgrades: { silo, cold },            // upgrades bought per store (storage.js)
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
  shipments: [{ id, truckUid, workerId, cityId, regionId, km, cargo, hours, done, fuelCost, sold, value, departDay, auto?, bonus? }], nextTripId,
  dispatcher: { hired: null | { tierId, hiredDay }, on, settings /* see Manajer Logistik */, held: { [productId]: qty }, seen: { [productId]: qty },
                stats: { trips, extraProfit, value }, today: { day, trips, profit }, recent: [...≤6], note },
  factories: { [factoryId]: { level, recipeId, queued, progress /* work hours */, running, auto, blocked, managed?, inMult?, outMult?, batchOut? } }, // stream B; managed* = Manajer Pabrik
  factoryManager: { hired: null | { tierId, hiredDay }, on, settings: { factories: null | [id], reservePct: { [productId]: % }, minMargin, buyInputs, headroom, contracts },
                    lastPass /* game time of the last pass */, waits: { [factoryId]: reason }, stats: { runs, batches, estProfit, bought },
                    today: { day, runs, batches, profit }, recent: [...≤6], note, last: null | { time, runs: [{ factoryId, recipeId, batches }] } },
  missions: { day, streak, lastFullDay, list: [{ id, type, target, progress, base /* stat at creation */, reward, xp, done, claimed, cropId?, task? }] },
  rivals: { day, ranks: { [rivalId|'player']: rank } },   // last rollover ranking
  ledger: { since /* first tracked day */, cur: { day, cats: { [categoryId]: $ } }, days: [{ day, cats }] /* ≤60 closed days */, total: { [categoryId]: $ } },
  achievements: [achievementId], log: [...], savedAt? /* ms, set by serialize */
}
```
Treat `state` as read-only in the UI. Change it only through the methods above.
Engine constants are exported from the modules: market `PRICE_MIN 0.5`, `PRICE_MAX 1.8`, `MEAN_REVERSION 0.08`, `SEASONAL_AMP 0.08`; tasks `RENT_HA_PER_HOUR 1`; economy `FIELD_REFUND`, `MACHINE_REFUND`, `LOAN_CAP_PER_LEVEL`, `LOAN_DAILY_RATE` (default; `loanRate(game)` reads `BALANCE.loanDailyRate`); purchase `BUY_MARKUP 1.2`; fields `WITHER_AFTER_HOURS 72`, `WITHER_PER_DAY 0.1`; persist `HISTORY_SIZE 120`, `STATS_KEYS`; ledger `LEDGER_DAYS 60`, `CATEGORIES`.

### Peternakan ikan (`js/engine/fish.js`, `fishView.js`)
- `buildPond(pondId)` → `{ok, uid}` (ledger `kolam`; level gate + `climate` gate via `pondAccess`).
- `stockPond(uid, n?)` → `{ok, count, cost}` (empty pond only, `n` ≤ capacity, ledger `benih_ikan`).
- `changeWater(uid)` (ledger `air_kolam`), `buyAerator(uid)` (ledger `kolam`), `setPondAuto(uid, {water?, restock?})`.
- `harvestPond(uid)` → `{ok, kg, stored, overflow, earned}`; needs growth 1; kg → Gudang dingin via `storeProduct`.
- `pelletQuote(days)` → `{productId, qty, cost, affordable} | null`; `buyPellet(days)` (ledger `pakan`).
- `fishView()` → `{defs: [{...PONDS, unlocked, reason, owned, aeratorCost, economics}], ponds: [{uid, pondId, count, stocked, growth, water, fed, aerator, autoWater, autoRestock, ready, daysLeft, expectedKg, feedPerDay, growthRate, mortalityPct, survival, waterBad, def, product}], pellet: {stock, needPerDay, daysLeft}}`.
- Daily (`stepFishDay`, after animals): eat pelet, water decay, auto ganti air, mortality, growth, auto-harvest after `autoHarvestDays`.
- Events: `pond_built`, `pond_stocked`, `pond_water`, `pond_aerator`, `fish_ready`, `fish_harvest {kg, auto, overflow…}`, `pond_alert {alert: 'water'|'hungry'|'dead'}`.
- State: `state.ponds[]`, `state.nextPondUid`; old saves migrate to `[]`. `unlocksBetween` returns `ponds`; `PRODUCTS[].buyable` makes a non-crop buyable in the Pasar.
