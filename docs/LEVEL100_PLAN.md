# Level 100 plan (v20)

Max level 50 → 100. Two owners:

- **Core (lv100core)**: `LEVELS`, `RESEARCH` tier 6–7, `ACHIEVEMENTS`, level-keyed `BALANCE` systems (staff tiers, projects stages 4–5, tender tiers, league division, legacy perks + star formula, saturation depth, diversify), engine/UI/tests/docs, balance bot.
- **Content (fast engineer)**: the data rows in section 3 (crops, trees, products, machines, animals, ponds, factories, regions, cities, fields) plus the small per-row companions listed in 3.10. Append to the existing arrays in `js/data.js` (exact formats in section 3), never reorder or edit existing rows, and use small edits. Units, ids and levels below are final; prices may still be tuned by the bot in phase 3.

## 1. XP curve Lv 51–100

Lv 1–50 thresholds are **unchanged** (`LEVELS[0..49]`), so no save loses a level or XP. For Lv 51+, each gap grows by a ratio that eases off:

```
gap(50) = LEVELS[49] − LEVELS[48] = 13,000,000
gap(L)  = gap(L−1) × (r0 − 0.0005 × (L − 51))      L = 51..100, r0 = 1.07 (draft; tuned in phase 3)
LEVELS[L−1] = sig3(LEVELS[L−2] + gap(L))            3 significant digits
```

| Lv | XP threshold | gap to this level |
|---|---|---|
| 50 | 115 M | 13 M |
| 55 | 195 M | 18 M |
| 60 | 306 M | 25 M |
| 65 | 457 M | 34 M |
| 70 | 662 M | 46 M |
| 75 | 937 M | 61 M |
| 80 | 1.30 B | 80 M |
| 85 | 1.77 B | 100 M |
| 90 | 2.38 B | 130 M |
| 95 | 3.16 B | 170 M |
| 100 | 4.16 B | 220 M |

**Time target (1×, 1 game day = 1 real minute):** Lv 50→100 ≈ **3,000 game days ≈ 50 real hours** for a dedicated player using plans + Mandor + managers. Offline catch-up (≤ 8 h per absence) does about half of that. A level should take 45–75 game days and never more than 2× the median. For reference, the greedy bot reaches Lv 50 around day 2,000, and Lv 44→50 takes 44–67 days per level. Phase 3 measures XP/day with the bot and tunes `r0` (and, if needed, the ease term) to hit the target.

The XP rate this curve needs is ≈ 0.19 M XP/day at Lv 50 ($19 M/day of base-value production) rising to ≈ 3–4 M XP/day at Lv 100. That growth comes from 41k ha of new land (2.2× the current 18.5k ha), crops worth ≈ 1.3–1.6× per ha, herds (barns scale with the larger saturation depth), the new factories and the higher project, tender and staff tiers.

**Old saves:** `level` is never lowered. The existing migration in `persist.normalizeState` stays and works for any cap: if banked XP ≥ `LEVELS[level+1]`, XP is cut to `LEVELS[level]`, so a maxed Lv 50 save with lots of banked XP levels up exactly once to 51 (with its modal) and never jumps several levels.

## 2. Unlock schedule Lv 51–100

Legend: **M** = meaningful (crop/tree/animal/factory/pond/region/staff tier/project stage/tender tier/league division). Every level has ≥ 1 unlock, and every 3-level window from 50 to 100 has an **M** (tested).

| Lv | Unlocks |
|---|---|
| 51 | machine `irrig_drip` (Netafin Irigasi Tetes Otomatis) |
| 52 | **M** 🌍 region `punjab` (Asia), field `pj1`, city `ludhiana` |
| 53 | **M** crop `basmati` 🍚, **M** staff: Manajer Logistik tier 4 `global` |
| 54 | tractor `fendtt_1300`, city `delhi` |
| 55 | **M** factory `winery` (Kilang Anggur) + recipes, truck `truk_road_120`, field `pj2` |
| 56 | harvester `nh_cr12_twin` |
| 57 | **M** tree `almond` 🌰, plow `plow_40`, research `ternak_otomatis` |
| 58 | **M** animal `unta` 🐪, picker `shaker_xxl`, field `pj3`, research `tani_panen5` |
| 59 | seeder `seeder_72` |
| 60 | **M** Tender tier 2 *Tender Raksasa*, lime `lime_36`, research `bisnis_global`, legacy perk `gudang_warisan` |
| 61 | **M** crop `quinoa` 🌾, field `pj4` |
| 62 | sprayer `fert_drone_swarm`, research `mesin_listrik` |
| 63 | **M** pond `kerapu` (Keramba Kerapu), field `pj5` |
| 64 | **M** 🌎 region `california` (Amerika), field `cv1`, city `fresno` |
| 65 | **M** staff: Manajer Pabrik tier 4 `ceo`; **M** Proyek Warisan stage 4 |
| 66 | tractor `kase_quadtrac_1400`, city `sanfrancisco`, research `tani_irigasi` |
| 67 | **M** factory `nut_factory` (Pabrik Kacang) + recipes, field `cv2` |
| 68 | **M** tree `pistachio` 🥜, research `ternak_vaksin` |
| 69 | harvester `jd_x9_2000` |
| 70 | **M** league division 💠 Master, truck `truk_autonom_160`, field `cv3`, legacy perk `tanah_luas` |
| 71 | **M** animal `kasmir` 🐐, research `bisnis_saham` |
| 72 | plow `plow_48` |
| 73 | **M** crop `ginseng` 🫚, field `cv4` |
| 74 | seeder `seeder_90`, research `mesin_robot` |
| 75 | field `cv5` |
| 76 | **M** 🌍 region `nil` (Delta Nil, Eropa & Afrika), field `nl1`, city `kairo` |
| 77 | **M** factory `perfumery` (Pabrik Parfum), **M** staff: Mandor tier 4 `agronom` |
| 78 | irrigation `irrig_smart` |
| 79 | **M** tree `kurma` 🌴, city `aleksandria` |
| 80 | tractor `jd_9rx_1600`, field `nl2`, legacy perk `dana_abadi` |
| 81 | **M** pond `lobster` (Tambak Lobster) |
| 82 | picker `shaker_drone`, research `ternak_genom` |
| 83 | **M** factory `bioethanol` (Pabrik Bioetanol), harvester `claz_trion_swarm` |
| 84 | field `nl3`, research `tani_panen6` |
| 85 | **M** Proyek Warisan stage 5, sprayer `fert_satelit` |
| 86 | truck `truk_listrik_220`, research `bisnis_merek` |
| 87 | **M** animal `manuka` 🐝 |
| 88 | plow `plow_60`, research `mesin_hidrogen` |
| 89 | field `nl4` |
| 90 | **M** Tender tier 3 *Tender Benua*, seeder `seeder_120`, legacy perk `mentor` |
| 91 | lime `lime_48` |
| 92 | **M** crop `wasabi` 🌿 |
| 93 | field `nl5`, research `ternak_pakan3` |
| 94 | truck `drone_kargo` |
| 95 | **M** factory `herbal` (Pabrik Farmasi Herbal), research `tani_satelit` |
| 96 | tractor `claz_xerion_nexus` |
| 97 | research `bisnis_konglo` |
| 98 | **M** tree `truffle` 🍄 |
| 99 | harvester `fendtt_ideal_robot`, research `mesin_swarm` |
| 100 | legacy perk `dinasti`, achievement *Legenda Seratus*, "Level maksimal" |

Totals: 3 regions, 15 fields, 6 cities, 4 crops, 4 trees, 3 animals, 5 factories, 2 ponds, 27 machines, 16 research nodes, 3 staff tiers, 2 project stages, 2 tender tiers, 1 league division, 5 legacy perks.

`unlocksBetween` (core) gains `cities`, `research`, `staff` (`dispatcher:<id>`, `factoryManager:<id>`, existing `mandors`), and `systems` (project stages, tender tiers, league division, legacy perks). The level-up modal lists them.

## 3. Content data (fast engineer): exact rows

Economy anchors at Lv 50: cash ≈ $0.7–1 B (projects soak the rest), production ≈ $19 M/day, best annual crop blueberry ≈ $1,150/ha/day net. Annual crop net: `(baseYield × basePrice × 1.375 − seedCostPerHa − 200) / growDays` (fertilized loam).

### 3.1 `CROPS` (append after `blueberry`) + `PRODUCTS` (category `'crop'`, unit `'t'`)
Format (existing): `{ id: 'blueberry', name: 'Bluberi', emoji: '🫐', seedCostPerHa: 2000, growDays: 9, baseYield: 2.4, idealPh: [4.5, 5.5], waterNeed: 'med', unlockLevel: 45, seasons: ['summer', 'autumn'], minTemp: 6, nutrientUse: 0.15 }`

| id | name | emoji | seed | days | yield | pH | water | Lv | seasons | minTemp | nutr | basePrice | vol | net/ha/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| basmati | Padi Basmati | 🍚 | 900 | 8 | 4.2 | [6.0, 7.5] | high | 53 | ['summer','autumn','wet'] | 14 | 0.25 | 1900 | 0.07 | ≈1235 |
| quinoa | Quinoa | 🌾 | 1200 | 9 | 3.7 | [6.0, 8.5] | low | 61 | ['spring','summer','dry'] | 4 | 0.2 | 2600 | 0.08 | ≈1315 |
| ginseng | Ginseng | 🫚 | 3000 | 16 | 0.36 | [5.0, 6.5] | med | 73 | ['spring','autumn'] | 2 | 0.25 | 52000 | 0.1 | ≈1410 |
| wasabi | Wasabi | 🌿 | 2600 | 14 | 1.0 | [6.0, 7.0] | high | 92 | ['spring','autumn','wet'] | 6 | 0.2 | 18000 | 0.1 | ≈1570 |

### 3.2 `TREES` (append after `durian`) + `PRODUCTS` (crop, t)
Format: `{ id: 'durian', name: 'Durian', emoji: '🍈', perennial: true, plantCostPerHa: 40000, maturityDays: 80, harvestEveryDays: 8, baseYield: 2.6, lifespanDays: 800, idealPh: [5.0, 6.5], waterNeed: 'high', unlockLevel: 26, seasons: ['summer', 'autumn', 'wet'], minTemp: 20, nutrientUse: 0.2 }`

| id | name | emoji | plant/ha | maturity | every | yield | life | pH | water | Lv | seasons | minTemp | basePrice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| almond | Almon | 🌰 | 52000 | 70 | 7 | 2.2 | 900 | [6.0, 8.0] | low | 57 | ['summer','autumn','dry'] | 4 | 7200 |
| pistachio | Pistachio | 🥜 | 60000 | 80 | 8 | 1.6 | 1000 | [7.0, 8.5] | low | 68 | ['summer','autumn','dry'] | 6 | 12500 |
| kurma | Kurma | 🌴 | 70000 | 90 | 8 | 4.0 | 1200 | [7.0, 8.5] | low | 79 | ['summer','autumn','dry'] | 12 | 5800 |
| truffle | Kebun Truffle | 🍄 | 120000 | 120 | 10 | 0.06 | 1500 | [7.5, 8.5] | med | 98 | ['autumn','winter'] | 0 | 600000 |

(The truffle product name is `Truffle`. Every tree has `nutrientUse: 0.15`. Products use vol 0.08, truffle 0.12.)

### 3.3 `ANIMALS` (append after `wagyu`) + `PRODUCTS` (category `'animal'`)
Format: `{ id: 'wagyu', name: 'Sapi Wagyu', emoji: '🐂', price: 9000, product: 'wagyu_beef', productPerDay: 3, feedPerDay: 0.28, feedCrops: ['corn', 'barley', 'soybean'], barnCost: 80000, barnCapacity: 20, sellPrice: 6000, unlockLevel: 42, livestock: true }`
Payback (price + barnCost/capacity) / net ≈ 40 days (diversify.test rule: 35–45 d, one barn > $5k/day).

| id | name | emoji | price | product (name, unit, basePrice) | /day | feed/day | feedCrops | barnCost | cap | sellPrice | Lv | livestock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| unta | Unta Perah | 🐪 | 9000 | camel_milk (Susu Unta, L, 16) | 20 | 0.12 | ['barley','wheat','quinoa'] | 240000 | 80 | 6000 | 58 | true |
| kasmir | Kambing Kasmir | 🐐 | 14000 | kasmir (Wol Kasmir, kg, 900) | 0.5 | 0.03 | ['barley','wheat','quinoa'] | 450000 | 120 | 9000 | 71 | true |
| manuka | Lebah Manuka | 🐝 | 30000 | madu_manuka (Madu Manuka, kg, 400) | 2.5 | 0.06 | ['sugarcane'] | 1200000 | 120 | 18000 | 87 | – |

`BALANCE.breeding.animals` add `unta: { days: 16, rate: 0.05 }`, `kasmir: { days: 12, rate: 0.045 }`, `manuka: { days: 6, rate: 0.05 }`. Product volatility is 0.07.

### 3.4 `PONDS` (append) + `PRODUCTS` (animal, kg)
Format: `{ id: 'salmon', name: 'Keramba Salmon', emoji: '🐟', product: 'salmon', unlockLevel: 22, climate: 'cold', anyRegionLevel: 40, buildCost: 75000, capacity: 2000, fryPrice: 2, growDays: 24, harvestKg: 2.5, fcr: 1.2, waterDecay: 6, waterCost: 600 }`

| id | name | emoji | product (name, basePrice/kg) | Lv | climate | anyRegionLevel | build | cap | fry | days | kg | fcr | decay | water |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kerapu | Keramba Kerapu | 🐠 | ikan_kerapu (Ikan Kerapu, 28) | 63 | tropical | 80 | 200000 | 6000 | 3 | 30 | 1.2 | 1.4 | 7 | 1500 |
| lobster | Tambak Lobster | 🦞 | lobster (Lobster, 60) | 81 | – | – | 450000 | 10000 | 6 | 28 | 0.8 | 1.5 | 8 | 3000 |

### 3.5 `FACTORIES` (append) + `PRODUCTS` (category `'processed'`)
Format: `{ id: 'chocolate_factory', name: 'Pabrik Cokelat', emoji: '🍫', unlockLevel: 48, price: 450000, upgradeCost: 120000, maxLevel: 5, recipes: [{ id: 'cokelat_susu', name: 'Cokelat susu', inputs: { cocoa: 2, milk: 1000, sugar: 1 }, outputs: { chocolate: 3.5 }, hours: 10 }, …] }`
Value-add at base price is in brackets; outputs in t use the silo, kg take no space.

| id | name | emoji | Lv | price | upgradeCost | recipes |
|---|---|---|---|---|---|---|
| winery | Kilang Anggur | 🍷 | 55 | 3,000,000 | 800,000 | `wine` "Anggur merah": grape 120 → wine 84 t, 10 h (+63%) · `jus_anggur` "Jus anggur": grape 60 → jus_anggur 48 t, 6 h (+47%) |
| nut_factory | Pabrik Kacang | 🥜 | 67 | 8,000,000 | 2,000,000 | `susu_almon` "Susu almon": almond 30 → susu_almon 90 t, 8 h (+62%) · `pasta_pistachio` "Pasta pistachio": pistachio 18 → pasta_pistachio 15 t, 10 h (+60%) |
| perfumery | Pabrik Parfum | 🌸 | 77 | 20,000,000 | 5,000,000 | `parfum_mawar` "Parfum mawar": rose 60 + lavender 15 → parfum 540 kg, 12 h (+64%) · `parfum_mewah` "Parfum mewah": saffron 0.3 + rose 30 → parfum_mewah 180 kg, 16 h (+71%) |
| bioethanol | Pabrik Bioetanol | ⛽ | 83 | 35,000,000 | 9,000,000 | `etanol_tebu` "Etanol tebu": sugarcane 4000 → bioetanol 300 t, 12 h (+56%) · `etanol_jagung` "Etanol jagung": corn 1200 → bioetanol 300 t, 12 h (+60%) |
| herbal | Pabrik Farmasi Herbal | 💊 | 95 | 60,000,000 | 15,000,000 | `ekstrak_ginseng` "Ekstrak ginseng": ginseng 6 → ekstrak_ginseng 1200 kg, 12 h (+65%) · `salep_manuka` "Salep manuka": madu_manuka 1200 + lavender 6 → salep_manuka 2400 kg, 10 h (+65%) |

New products (processed, vol 0.05): wine Anggur Merah 🍷 2100/t · jus_anggur Jus Anggur 🧃 1650/t · susu_almon Susu Almon 🥛 3900/t · pasta_pistachio Pasta Pistachio 🟩 24000/t · parfum Parfum Mawar 🧴 400/kg · parfum_mewah Parfum Mewah 💎 1600/kg · bioetanol Bioetanol ⛽ 1250/t · ekstrak_ginseng Ekstrak Ginseng 🧪 430/kg · salep_manuka Salep Manuka 🍯 340/kg.

### 3.6 `MACHINES` (append in one `// Lv 51–100` block before the fruit-harvest comment, trucks after `truk_scanya_s`)
Formats: tractor `{ id, name, brand, type: 'tractor', price, unlockLevel, hp, speed, fuelPerHour }` · harvester `{ …type: 'harvester', price, unlockLevel, haPerHour, fuelPerHour }` · implement `{ …type: 'implement', price, unlockLevel, task, hpRequired, haPerHour }` · truck `{ …type: 'truck', price, unlockLevel, capacity, speedKmh, fuelPerKm }`.

| id | name (brand) | type/task | Lv | price | stats |
|---|---|---|---|---|---|
| irrig_drip | Netafin Irigasi Tetes Otomatis (Netafin) | irrigate | 51 | 200,000 | hp 900, 21 ha/h |
| fendtt_1300 | Fendtt 1300 Vario Titan (Fendtt) | tractor | 54 | 2,400,000 | 1250 hp, speed 9, 105 L/h |
| truk_road_120 | Volvu FH Road Train 120t (Volvu) | truck | 55 | 650,000 | 120 t, 95 km/h, 0.85 L/km |
| nh_cr12_twin | New Hollow CR12 Twin Rotor (New Hollow) | harvester | 56 | 3,400,000 | 50 ha/h, 200 L/h |
| plow_40 | Fendtt Bajak 40-Mata (Fendtt) | plow | 57 | 440,000 | hp 1250, 27 ha/h |
| shaker_xxl | Kase Pemetik Buah Lengan Ganda (Kase) | pick | 58 | 300,000 | hp 600, 14 ha/h |
| seeder_72 | John Dear Penabur 72m (John Dear) | seed | 59 | 520,000 | hp 1250, 29 ha/h |
| lime_36 | Claz Penebar Kapur 36t (Claz) | lime | 60 | 150,000 | hp 900, 19 ha/h |
| fert_drone_swarm | Fendtt Kawanan Drone Penyemprot (Fendtt) | fertilize | 62 | 360,000 | hp 1100, 30 ha/h |
| kase_quadtrac_1400 | Kase Quadtrac 1400 (Kase) | tractor | 66 | 3,300,000 | 1400 hp, speed 10, 112 L/h |
| jd_x9_2000 | John Dear X9 2000 (John Dear) | harvester | 69 | 4,500,000 | 62 ha/h, 225 L/h |
| truk_autonom_160 | Scanya Truk Otonom 160t (Scanya) | truck | 70 | 950,000 | 160 t, 100 km/h, 1.0 L/km |
| plow_48 | Kase Bajak 48-Mata (Kase) | plow | 72 | 600,000 | hp 1400, 33 ha/h |
| seeder_90 | Claz Penabur 90m (Claz) | seed | 74 | 700,000 | hp 1400, 35 ha/h |
| irrig_smart | John Dear Irigasi Pintar Sensor (John Dear) | irrigate | 78 | 360,000 | hp 1250, 30 ha/h |
| jd_9rx_1600 | John Dear 9RX 1600 Hybrid (John Dear) | tractor | 80 | 4,600,000 | 1600 hp, speed 11.5, 118 L/h |
| shaker_drone | Fendtt Drone Pemetik Buah (Fendtt) | pick | 82 | 520,000 | hp 900, 22 ha/h |
| claz_trion_swarm | Claz Trion Swarm (Claz) | harvester | 83 | 6,000,000 | 76 ha/h, 250 L/h |
| fert_satelit | Claz Penyemprot Satelit 60000L (Claz) | fertilize | 85 | 520,000 | hp 1250, 40 ha/h |
| truk_listrik_220 | Teslo Semi Listrik 220t (Teslo) | truck | 86 | 1,400,000 | 220 t, 110 km/h, 0.9 L/km |
| plow_60 | Fendtt Bajak 60-Mata (Fendtt) | plow | 88 | 820,000 | hp 1600, 41 ha/h |
| seeder_120 | John Dear Penabur 120m (John Dear) | seed | 90 | 950,000 | hp 1600, 44 ha/h |
| lime_48 | Kase Penebar Kapur 48t (Kase) | lime | 91 | 260,000 | hp 1250, 26 ha/h |
| drone_kargo | Fendtt Drone Kargo 40t (Fendtt) | truck | 94 | 1,800,000 | 40 t, 250 km/h, 0.3 L/km |
| claz_xerion_nexus | Claz Xerion Nexus Otonom (Claz) | tractor | 96 | 6,500,000 | 1900 hp, speed 13, 125 L/h |
| fendtt_ideal_robot | Fendtt IDEAL Robot Panen (Fendtt) | harvester | 99 | 8,000,000 | 95 ha/h, 280 L/h |

Rules (checked by tests): an implement's `hpRequired` must be ≤ the best tractor already unlocked at its level (1100 hp until 54, 1250 until 66, 1400 until 80, 1600 until 96). Fuel per ha keeps falling.

### 3.7 `REGIONS` (append after `alberta`)
Format: `{ id: 'alberta', name: 'Alberta', continent: 'amerika', unlockLevel: 43, desc: 'Prairi dingin, musim tanam pendek: kanola, gandum, barley.', climate: { baseTemp: 7, rainChance: 0.25, tempSwing: 13 } }`

| id | name | continent | Lv | desc | climate |
|---|---|---|---|---|---|
| punjab | Punjab | asia | 52 | 'Lumbung India, aluvial subur: padi basmati, gandum, kapas.' | { baseTemp: 24, rainChance: 0.3, tempSwing: 11 } |
| california | Lembah California | amerika | 64 | 'Mediterania kering beririgasi: almon, pistachio, anggur, tomat.' | { baseTemp: 18, rainChance: 0.18, tempSwing: 8 } |
| nil | Delta Nil | eropa | 76 | 'Gurun beririgasi sungai, panas: kapas, tebu, kurma.' | { baseTemp: 25, rainChance: 0.12, tempSwing: 8 } |

No `tropical` flags (the 🌴 challenge list stays the same). `BALANCE.projects.skip` adds `punjab: 'pelabuhan', california: 'koperasi', nil: 'pasar'`.

### 3.8 `FIELDS` (5 per region; a region comment line like the existing ones)
Format: `{ id: 'al2', name: 'Lethbridge Prairie', regionId: 'alberta', sizeHa: 800, soil: 'clay', ph: 7.3, contamination: 'none', price: 6400000, x: 22, y: 6, unlockLevel: 44 }`. The first field of a region has no `unlockLevel` (it uses the region's). Prices are ≈ 20–28 days of payback with the best crop of that level.

Map: x/y are % on the continent map; keep x 3–97, y 3–91 and ≥ 8 % away from every other field. Free zones checked against the current coordinates: **Asia** bottom-left (x 8–42, y 62–88); **Amerika** left-middle (x 8–42, y 30–55); **Eropa & Afrika** left-bottom (x 8–40, y 48–86).

| id | name | region | ha | soil | pH | contam | price | x | y | Lv |
|---|---|---|---|---|---|---|---|---|---|---|
| pj1 | Khet Ludhiana | punjab | 1200 | loam | 7.4 | none | 19,000,000 | 12 | 66 | (52) |
| pj2 | Khet Amritsar | punjab | 1500 | silt | 7.2 | none | 23,000,000 | 25 | 64 | 55 |
| pj3 | Khet Bathinda | punjab | 1800 | sand | 7.9 | low | 22,000,000 | 38 | 68 | 58 |
| pj4 | Khet Jalandhar | punjab | 2200 | loam | 7.0 | none | 36,000,000 | 18 | 78 | 61 |
| pj5 | Khet Patiala | punjab | 2600 | clay | 7.6 | none | 42,000,000 | 32 | 82 | 63 |
| cv1 | Fresno Ranch | california | 1800 | loam | 7.0 | none | 32,000,000 | 12 | 34 | (64) |
| cv2 | Modesto Orchards | california | 2200 | silt | 7.3 | none | 40,000,000 | 26 | 32 | 67 |
| cv3 | Kern County Flats | california | 2600 | sand | 7.8 | low | 44,000,000 | 38 | 38 | 70 |
| cv4 | Sacramento Delta | california | 3000 | clay | 6.6 | none | 58,000,000 | 16 | 47 | 73 |
| cv5 | Tulare Basin | california | 3400 | loam | 7.5 | none | 66,000,000 | 30 | 51 | 75 |
| nl1 | Ghitan Kafr el-Sheikh | nil | 2500 | silt | 7.6 | none | 50,000,000 | 12 | 52 | (76) |
| nl2 | Ghitan Mansoura | nil | 3000 | clay | 7.8 | none | 62,000,000 | 26 | 55 | 80 |
| nl3 | Ghitan Fayoum | nil | 3600 | sand | 8.0 | low | 70,000,000 | 36 | 64 | 84 |
| nl4 | Ghitan Minya | nil | 4200 | loam | 7.4 | none | 90,000,000 | 14 | 70 | 89 |
| nl5 | Ghitan Luxor | nil | 5000 | silt | 7.7 | none | 110,000,000 | 28 | 80 | 93 |

Phase 3 checks the coordinates against `mapFx` lands and labels with a screenshot. If they collide with the Kenya pins (x 50–75, y 60–77) or the Pampas ones (x 14–38, y 69–86), shift them.

### 3.9 `CITIES` (append)
Format: `{ id: 'calgary', name: 'Calgary', emoji: '🤠', unlockLevel: 43, km: { alberta: 80 }, base: 1.03, demand: { canola: 1.1, … } }`. Crops ≤ 1.15, other goods ≤ 1.25.

| id | name | emoji | Lv | km | base | demand |
|---|---|---|---|---|---|---|
| ludhiana | Ludhiana | 🛕 | 52 | { punjab: 60 } | 1.03 | basmati 1.1, wheat 1.05, cotton 1.08, milk 1.15, camel_milk 1.12 |
| delhi | Delhi | 🕌 | 54 | { punjab: 320 } | 1.07 | basmati 1.15, sugar 1.18, tea 1.15, cooking_oil 1.2, kasmir 1.22, parfum 1.22, wine 1.15 |
| fresno | Fresno | 🌞 | 64 | { california: 50 } | 1.03 | almond 1.1, pistachio 1.1, grape 1.08, tomato 1.08, wine 1.12 |
| sanfrancisco | San Francisco | 🌉 | 66 | { california: 300 } | 1.08 | almond 1.15, wine 1.25, susu_almon 1.22, pasta_pistachio 1.25, wagyu_beef 1.22, ginseng 1.15, truffle 1.15, salep_manuka 1.22 |
| kairo | Kairo | 🐫 | 76 | { nil: 40 } | 1.03 | kurma 1.1, cotton 1.1, sugar 1.12, camel_milk 1.15, bioetanol 1.12 |
| aleksandria | Aleksandria | ⚓ | 79 | { nil: 220 } | 1.07 | kurma 1.15, cotton 1.15, fabric 1.2, parfum_mewah 1.25, bioetanol 1.2, ekstrak_ginseng 1.22, lobster 1.2 |

`BALANCE.tenders.ports` add `'sanfrancisco', 'aleksandria'`.

### 3.10 Small companions (content)
- `PRODUCTS` rows for every new crop, tree, animal, fish and factory output (tests check this).
- New goods in 1–2 existing late cities each (Vancouver, Paris, Buenos Aires, Mombasa), demand ≤ 1.25.
- Give `basmati`, `quinoa` and `wasabi` their crop roles in the header comment, in the same style as the existing lines.

## 4. Core systems (lv100core)

- **Research** (points stay `level − 1` = 99 at Lv 100, plus the bonus RP): tier 6 (`minLevel` 57–74) and tier 7 (82–99), 2 nodes per branch per tier, 68 points. The whole tree costs 120 points vs 99 earned, so a few nodes stay a choice without bonus RP. `PERK_MAX` stays 0.5; the tree is built so that no key exceeds it.
  - tani: `tani_panen5` Benih Unggul V 🧬 (58, 4, yield .05) → `tani_irigasi` Irigasi Cerdas 💧 (66, 3, seedCost .05 + fertCost .1) → `tani_panen6` Rekayasa Genom 🧪 (84, 5, yield .05) → `tani_satelit` Satelit Tani 🛰️ (95, 5, yield .05 + seedCost .05). Yield total .35.
  - ternak: `ternak_otomatis` Kandang Otomatis 🏭 (57, 3, animalProd .05 + feed .05) → `ternak_vaksin` Vaksin Modern 💉 (68, 4, births .1 + animalProd .05) → `ternak_genom` Genomik Ternak 🧬 (82, 5, animalProd .1) → `ternak_pakan3` Pakan Presisi AI 🤖 (93, 5, feed .1 + births .1). animalProd .5.
  - bisnis: `bisnis_global` Kantor Global 🌐 (60, 3, cityPrice .03) → `bisnis_saham` Pasar Modal 📈 (71, 4, interest .25 + contractPrice .03) → `bisnis_merek` Merek Dunia 🏷️ (86, 5, cityPrice .04 + contractPrice .04) → `bisnis_konglo` Konglomerasi 🏙️ (97, 5, wages .1 + silo .15).
  - mesin: `mesin_listrik` Mesin Listrik 🔋 (62, 3, fuel .1) → `mesin_robot` Robot Lapangan 🦾 (74, 4, taskSpeed .1) → `mesin_hidrogen` Hidrogen Hijau 💨 (88, 5, fuel .1 + wear .1) → `mesin_swarm` Armada Otonom 🛸 (99, 5, taskSpeed .1 + truckCap .15).
  - The UI tags tiers 6–7 with "Lv N" (existing) plus a tier chip "T6"/"T7".
- **Staff tier 4**:
  - Manajer Logistik `global`: Bu Kartika, *Direktur Logistik Global*, ★4, Lv 53, $2 M, $60k/day, 12 trucks, 3,000 km, +6%.
  - Manajer Pabrik `ceo`: Pak Wibowo, *CEO Industri*, ★4, Lv 65, $5 M, $120k/day, all factories, 1 h, inputs ×0.92, outputs ×1.1, buys inputs.
  - Mandor `agronom`: Dr. Ayu, *Agronom Kepala*, ★4, Lv 77, $8 M, $200k/day, all fields, speed +10%.
- **Proyek Warisan**: stage 4 ($20 B × regionScale, 40 d, Lv 65) and stage 5 ($150 B × scale, 60 d, Lv 85). Values: bendungan .5/.55, pelabuhan .11/.14, riset 1/1, koperasi .11/.14, pasar .07/.09 (`contractBonusMax` .12 → .15). `MAX_STAGE` becomes `stages.length`. Monumen still needs stage 3 everywhere; a Monumen already built stays built when a new region joins its continent.
- **Tender tiers** `BALANCE.tenders.tiers`: Lv 35 base; Lv 60 *Tender Raksasa* (farmShare .6, truckShare .65, premium .35, rp 5, durationDays 40); Lv 90 *Tender Benua* (farmShare .75, truckShare .8, premium .45, rp 7, durationDays 45). Each offer takes the tier of the level at the time it is offered, and the card shows the tier name.
- **Liga**: 5th division 💠 Master (strength 1.15, `minLevel` 70; promotion from Berlian needs Lv 70, otherwise you stay in Berlian). Juara 1 gets 4 RP.
- **Generasi Baru**: the star level term becomes `(min(level, 50) − 27) + 0.5 × max(0, level − 50)`, so Lv 100 gives 48 (was 73 uncapped). New perks with `minLevel` (best level ever reached, current run or museum): `gudang_warisan` (Lv 60, 5⭐, startSilo +2, requires `lumbung`), `tanah_luas` (Lv 70, 6⭐, startMoney +$250k, requires `celengan`), `dana_abadi` (Lv 80, 8⭐, startRp +2, requires `pustaka`), `mentor` (Lv 90, 10⭐, xp +.05, requires `bijak`), `dinasti` (Lv 100, 15⭐, missionSlot +1 + startRp +3, requires `misi`).
- **Market depth** (`BALANCE.market.saturation.depth`) adds [60, 100 M], [70, 160 M], [80, 250 M], [90, 380 M], [100, 550 M]. `diversify.city.max` goes .15 → .2.
- **Caps**:
  - Machine upgrade level requirement: already `min(LEVELS.length, …)`, so 100.
  - Loan cap stays `level × 25k`.
  - Respec stays `1500 × level`.
  - Missions and Kabar scale from `LEVELS` and the level (they already generalise).
  - `levelInfo.maxed` at 100.
  - Topbar shows MAX at 100.
  - The level-up modal shows "🏆 Level maksimal tercapai!" at 100.
- **Achievements**: `level_60` Raja Benua ($20 M, rp 2), `level_70` Penguasa Pangan Dunia ($40 M, rp 3), `level_80` Titan Agrikultur ($80 M, rp 3), `level_90` Dewa Panen ($150 M, rp 4), `level_100` Legenda Seratus ($300 M, rp 5); all with incomeDays 1. `level_50` desc drops "(maksimal)". Also `regions_16` Penguasa Planet (16 regions, $5 M, rp 2), `fields_75` Kaisar Tanah ($20 M), `tons_2500000` Lumbung Galaksi ($15 M, rp 1), `earned_10b` Raja Dunia ($100 M).
- **Bab Petani**: chapter 5 *Dinasti Dunia* with these steps:
  1. A field in Punjab (Lv 52).
  2. Hire the Manajer Logistik Global (Lv 53).
  3. A stage-4 project (Lv 65).
  4. A Tender Raksasa finished (Lv 60).
  5. Fields in all 16 regions.
- **Persist**: no new state for levels. Projects already clamp stages (now to `stages.length`). League divisions are clamped to the available ones. Legacy perks drop unknown ids.

## 5. Phase 3 checks
The balance bot runs in `/tmp` (investor + auto strategies, seeds 1–2, to Lv 100 or 6,000 days). It reports days and real hours to Lv 60/70/80/90/100, the cash curve, dead zones (a gap > 2× median between meaningful unlocks) and income share by source. Tune `r0` and content values to the target in section 1.

`tests/level100.test.js` covers:
- the curve is monotonic and Lv 1–50 is unchanged
- every level 2–100 unlocks something
- there is an **M** in every 3-level window from 50 to 100
- an old Lv 50 save with banked XP migrates to 51
- research gives 99 points at Lv 100
- the achievements exist
- the content rules hold (products, hp, map bounds)
