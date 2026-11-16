// Farm Manager — static game data. Pure data only: no logic, no DOM.

// Crop roles (net $/ha/day on fertilized loam at base price, before rent/fuel):
//  wheat   steady all-rounder ............. ≈360   barley  cheap + fast (3 d), drought-hardy, feed ≈415
//  corn    big feed yields, thirsty ....... ≈385   soybean faster cash crop, pricier swings ....... ≈375
//  rice    acid soils, thirsty ............ ≈410   potato  acid niche (pH 5–6), volatile price ..... ≈435
//  canola  fast oilseed (5 d) ............. ≈445   sunflower alkaline/dry soils, slower ............. ≈460
//  sugarcane long + capital heavy ......... ≈480   cotton  wide pH, dry-hardy ....................... ≈515
//  tomato (7) ≈520 · coffee (8, acid) ≈555 · strawberry (9) ≈585 · vanilla (10) ≈665
export const CROPS = [
  { id: 'wheat', name: 'Gandum', emoji: '🌾', seedCostPerHa: 120, growDays: 5, baseYield: 7, idealPh: [6.0, 7.5], waterNeed: 'med', unlockLevel: 1, seasons: ['spring', 'autumn'], nutrientUse: 0.2 },
  { id: 'barley', name: 'Barley', emoji: '🌿', seedCostPerHa: 60, growDays: 3, baseYield: 5.5, idealPh: [6.0, 8.0], waterNeed: 'low', unlockLevel: 1, seasons: ['spring', 'autumn', 'winter'], nutrientUse: 0.15 },
  { id: 'corn', name: 'Jagung', emoji: '🌽', seedCostPerHa: 180, growDays: 6, baseYield: 10, idealPh: [5.8, 7.0], waterNeed: 'high', unlockLevel: 2, seasons: ['summer', 'wet'], minTemp: 10, nutrientUse: 0.3 },
  { id: 'soybean', name: 'Kedelai', emoji: '🫘', seedCostPerHa: 160, growDays: 5, baseYield: 3, idealPh: [6.0, 7.0], waterNeed: 'med', unlockLevel: 2, seasons: ['spring', 'summer', 'wet'], minTemp: 10, nutrientUse: 0, legume: true },
  { id: 'rice', name: 'Padi', emoji: '🍚', seedCostPerHa: 240, growDays: 7, baseYield: 8, idealPh: [5.5, 6.5], waterNeed: 'high', unlockLevel: 3, seasons: ['summer', 'wet'], minTemp: 12, nutrientUse: 0.25 },
  { id: 'potato', name: 'Kentang', emoji: '🥔', seedCostPerHa: 600, growDays: 7, baseYield: 40, idealPh: [5.0, 6.0], waterNeed: 'med', unlockLevel: 3, seasons: ['spring', 'autumn', 'dry'], minTemp: 4, nutrientUse: 0.3 },
  { id: 'canola', name: 'Kanola', emoji: '🌼', seedCostPerHa: 140, growDays: 5, baseYield: 3, idealPh: [5.8, 7.2], waterNeed: 'med', unlockLevel: 4, seasons: ['autumn', 'winter'], minTemp: 0, nutrientUse: 0.2 },
  { id: 'sunflower', name: 'Bunga Matahari', emoji: '🌻', seedCostPerHa: 130, growDays: 7, baseYield: 3.4, idealPh: [6.5, 8.2], waterNeed: 'low', unlockLevel: 4, seasons: ['summer', 'dry'], minTemp: 8, nutrientUse: 0.15 },
  { id: 'sugarcane', name: 'Tebu', emoji: '🎋', seedCostPerHa: 800, growDays: 10, baseYield: 70, idealPh: [6.0, 7.5], waterNeed: 'high', unlockLevel: 5, seasons: ['summer', 'wet'], minTemp: 15, nutrientUse: 0.3 },
  { id: 'cotton', name: 'Kapas', emoji: '☁️', seedCostPerHa: 300, growDays: 8, baseYield: 4, idealPh: [5.8, 8.0], waterNeed: 'low', unlockLevel: 6, seasons: ['summer', 'dry'], minTemp: 15, nutrientUse: 0.2 },
  { id: 'tomato', name: 'Tomat', emoji: '🍅', seedCostPerHa: 1000, growDays: 6, baseYield: 30, idealPh: [6.0, 6.8], waterNeed: 'high', unlockLevel: 7, seasons: ['spring', 'summer', 'dry'], minTemp: 10, nutrientUse: 0.3 },
  { id: 'coffee', name: 'Kopi', emoji: '☕', seedCostPerHa: 700, growDays: 12, baseYield: 2.5, idealPh: [5.0, 6.0], waterNeed: 'med', unlockLevel: 8, minTemp: 12, nutrientUse: 0.15 },
  { id: 'strawberry', name: 'Stroberi', emoji: '🍓', seedCostPerHa: 1500, growDays: 5, baseYield: 12, idealPh: [5.5, 6.5], waterNeed: 'med', unlockLevel: 9, seasons: ['spring', 'dry'], minTemp: 5, nutrientUse: 0.2 },
  { id: 'vanilla', name: 'Vanili', emoji: '🌸', seedCostPerHa: 1200, growDays: 14, baseYield: 0.6, idealPh: [6.0, 7.0], waterNeed: 'med', unlockLevel: 10, seasons: ['wet'], minTemp: 18, nutrientUse: 0.1 },
  // Lv 11–30 (stream A). Net $/ha/day: tea ≈685 · cocoa ≈735 · oil palm ≈760 · grape ≈795 · lavender ≈820 · saffron ≈915.
  { id: 'tea', name: 'Teh', emoji: '🍵', seedCostPerHa: 800, growDays: 9, baseYield: 2, idealPh: [4.5, 5.5], waterNeed: 'high', unlockLevel: 11, seasons: ['spring', 'summer', 'wet'], minTemp: 10, nutrientUse: 0.2 },
  { id: 'cocoa', name: 'Kakao', emoji: '🍫', seedCostPerHa: 1000, growDays: 11, baseYield: 1.3, idealPh: [5.5, 7.0], waterNeed: 'high', unlockLevel: 14, seasons: ['wet'], minTemp: 20, nutrientUse: 0.2 },
  { id: 'oilpalm', name: 'Kelapa Sawit', emoji: '🌴', seedCostPerHa: 2500, growDays: 12, baseYield: 20.5, idealPh: [5.0, 6.5], waterNeed: 'high', unlockLevel: 17, seasons: ['wet', 'dry'], minTemp: 20, nutrientUse: 0.35 },
  { id: 'grape', name: 'Anggur', emoji: '🍇', seedCostPerHa: 2000, growDays: 10, baseYield: 8.2, idealPh: [6.5, 8.0], waterNeed: 'low', unlockLevel: 20, seasons: ['summer', 'autumn', 'dry'], minTemp: 10, nutrientUse: 0.15 },
  { id: 'lavender', name: 'Lavender', emoji: '💜', seedCostPerHa: 1800, growDays: 8, baseYield: 2.6, idealPh: [6.5, 8.5], waterNeed: 'low', unlockLevel: 23, seasons: ['summer', 'dry'], minTemp: 8, nutrientUse: 0.1 },
  { id: 'saffron', name: 'Saffron', emoji: '🌺', seedCostPerHa: 3500, growDays: 11, baseYield: 0.025, idealPh: [6.0, 8.0], waterNeed: 'low', unlockLevel: 27, seasons: ['autumn', 'dry'], minTemp: 0, nutrientUse: 0.1 },
  // Lv 31–50: pepper ≈975 · rose ≈1060 · blueberry ≈1150 (homes: Kalimantan/Mekong, Kenya, Alberta acid fields).
  { id: 'pepper', name: 'Lada', emoji: '🌶️', seedCostPerHa: 2400, growDays: 12, baseYield: 1.6, idealPh: [5.0, 6.5], waterNeed: 'high', unlockLevel: 32, seasons: ['wet', 'summer'], minTemp: 20, nutrientUse: 0.2 },
  { id: 'rose', name: 'Mawar', emoji: '🌹', seedCostPerHa: 4500, growDays: 8, baseYield: 6, idealPh: [6.0, 7.0], waterNeed: 'med', unlockLevel: 39, seasons: ['spring', 'summer', 'dry'], minTemp: 12, nutrientUse: 0.15 },
  { id: 'blueberry', name: 'Bluberi', emoji: '🫐', seedCostPerHa: 2000, growDays: 9, baseYield: 2.4, idealPh: [4.5, 5.5], waterNeed: 'med', unlockLevel: 45, seasons: ['summer', 'autumn'], minTemp: 6, nutrientUse: 0.15 },
];

// Kebun buah (perennial orchards, js/engine/orchard.js). Planted once on a plowed field (`seed` task with a tree,
// manual: worker + sapling cost plantCostPerHa, no seeder); trees bear fruit after maturityDays, then every
// harvestEveryDays of fruit-window time. `seasons` = fruiting window (season ids, like CROPS), `minTemp` stops fruit
// growth. After lifespanDays yield declines (−1.4 × overage/lifespan, floor 30%). Indexed into game.idx.crops.
// Steady net $/ha/day in the best region (fertilized, base price, rented pickers): orange ≈600 · apple ≈670 ·
// mango ≈855 · avocado ≈925 · coconut ≈1000 · cherry ≈1030 · durian ≈1140 (≈1.15–1.4× the best annual crop of the
// unlock level, with no seed/plow/seeding work), but saplings + juvenile years ⇒ payback ≈ 1.75–2.9 game years.
export const TREES = [
  { id: 'orange', name: 'Jeruk', emoji: '🍊', perennial: true, plantCostPerHa: 24000, maturityDays: 30, harvestEveryDays: 5, baseYield: 8.9, lifespanDays: 320, idealPh: [5.5, 7.0], waterNeed: 'med', unlockLevel: 6, seasons: ['winter', 'spring', 'dry'], minTemp: 2, nutrientUse: 0.15 },
  { id: 'apple', name: 'Apel', emoji: '🍎', perennial: true, plantCostPerHa: 23500, maturityDays: 40, harvestEveryDays: 6, baseYield: 9.6, lifespanDays: 400, idealPh: [6.0, 7.2], waterNeed: 'med', unlockLevel: 8, seasons: ['summer', 'autumn', 'dry'], minTemp: 0, nutrientUse: 0.15 },
  { id: 'mango', name: 'Mangga', emoji: '🥭', perennial: true, plantCostPerHa: 30000, maturityDays: 45, harvestEveryDays: 6, baseYield: 8.6, lifespanDays: 480, idealPh: [5.5, 7.5], waterNeed: 'low', unlockLevel: 12, seasons: ['spring', 'summer', 'dry'], minTemp: 14, nutrientUse: 0.15 },
  { id: 'avocado', name: 'Alpukat', emoji: '🥑', perennial: true, plantCostPerHa: 32500, maturityDays: 45, harvestEveryDays: 7, baseYield: 5.7, lifespanDays: 450, idealPh: [5.5, 7.0], waterNeed: 'high', unlockLevel: 15, seasons: ['summer', 'autumn', 'wet'], minTemp: 8, nutrientUse: 0.2 },
  { id: 'coconut', name: 'Kelapa', emoji: '🥥', perennial: true, plantCostPerHa: 35000, maturityDays: 60, harvestEveryDays: 5, baseYield: 11.6, lifespanDays: 700, idealPh: [5.5, 8.0], waterNeed: 'med', unlockLevel: 18, seasons: ['spring', 'summer', 'wet'], minTemp: 18, nutrientUse: 0.15 },
  { id: 'cherry', name: 'Ceri', emoji: '🍒', perennial: true, plantCostPerHa: 36000, maturityDays: 50, harvestEveryDays: 6, baseYield: 2.2, lifespanDays: 420, idealPh: [6.0, 7.5], waterNeed: 'med', unlockLevel: 22, seasons: ['spring', 'summer', 'dry'], minTemp: 2, nutrientUse: 0.15 },
  { id: 'durian', name: 'Durian', emoji: '🍈', perennial: true, plantCostPerHa: 40000, maturityDays: 80, harvestEveryDays: 8, baseYield: 2.6, lifespanDays: 800, idealPh: [5.0, 6.5], waterNeed: 'high', unlockLevel: 26, seasons: ['summer', 'autumn', 'wet'], minTemp: 20, nutrientUse: 0.2 },
];

// category: 'crop' (field and orchard harvest, stored in the silo), 'animal' (livestock products, Gudang dingin),
// 'processed' (factory goods). Groups the Gudang/Pasar UI; ledger.saleCategory books sales the same way.
// Storage (js/engine/storage.js): unit 't' → silo; animal products → Gudang dingin at 1 kg per L/kg or kgPerUnit
// per pcs; processed goods in kg take no space.
export const PRODUCTS = [
  { id: 'wheat', name: 'Gandum', emoji: '🌾', basePrice: 220, unit: 't', category: 'crop', volatility: 0.04 },
  { id: 'barley', name: 'Barley', emoji: '🌿', basePrice: 200, unit: 't', category: 'crop', volatility: 0.04 },
  { id: 'corn', name: 'Jagung', emoji: '🌽', basePrice: 195, unit: 't', category: 'crop', volatility: 0.05 },
  { id: 'soybean', name: 'Kedelai', emoji: '🫘', basePrice: 540, unit: 't', category: 'crop', volatility: 0.07 },
  { id: 'rice', name: 'Padi', emoji: '🍚', basePrice: 300, unit: 't', category: 'crop', volatility: 0.05 },
  { id: 'potato', name: 'Kentang', emoji: '🥔', basePrice: 70, unit: 't', category: 'crop', volatility: 0.11 },
  { id: 'canola', name: 'Kanola', emoji: '🌼', basePrice: 620, unit: 't', category: 'crop', volatility: 0.07 },
  { id: 'sunflower', name: 'Bunga Matahari', emoji: '🌻', basePrice: 760, unit: 't', category: 'crop', volatility: 0.06 },
  { id: 'sugarcane', name: 'Tebu', emoji: '🎋', basePrice: 60, unit: 't', category: 'crop', volatility: 0.06 },
  { id: 'cotton', name: 'Kapas', emoji: '☁️', basePrice: 840, unit: 't', category: 'crop', volatility: 0.1 },
  { id: 'tomato', name: 'Tomat', emoji: '🍅', basePrice: 105, unit: 't', category: 'crop', volatility: 0.1 },
  { id: 'coffee', name: 'Kopi', emoji: '☕', basePrice: 2200, unit: 't', category: 'crop', volatility: 0.08 },
  { id: 'strawberry', name: 'Stroberi', emoji: '🍓', basePrice: 280, unit: 't', category: 'crop', volatility: 0.12 },
  { id: 'vanilla', name: 'Vanili', emoji: '🌸', basePrice: 13000, unit: 't', category: 'crop', volatility: 0.1 },
  { id: 'milk', name: 'Susu', emoji: '🥛', basePrice: 2.2, unit: 'L', category: 'animal', volatility: 0.03 },
  { id: 'eggs', name: 'Telur', emoji: '🥚', basePrice: 0.9, unit: 'pcs', kgPerUnit: 0.06, category: 'animal', volatility: 0.02 },
  { id: 'wool', name: 'Wol', emoji: '🧶', basePrice: 32, unit: 'kg', category: 'animal', volatility: 0.06 },
  { id: 'pork', name: 'Daging Babi', emoji: '🥩', basePrice: 9.5, unit: 'kg', category: 'animal', volatility: 0.05 },
  { id: 'cheese', name: 'Keju Kambing', emoji: '🧀', basePrice: 48, unit: 'kg', category: 'animal', volatility: 0.05 },
  { id: 'honey', name: 'Madu', emoji: '🍯', basePrice: 30, unit: 'kg', category: 'animal', volatility: 0.06 },
  // Processed goods (stream B factories): ~30–55% over their inputs at base price.
  { id: 'flour', name: 'Tepung', emoji: '🥣', basePrice: 400, unit: 't', category: 'processed', volatility: 0.04 },
  { id: 'malt', name: 'Malt', emoji: '🍺', basePrice: 360, unit: 't', category: 'processed', volatility: 0.04 },
  { id: 'butter', name: 'Mentega', emoji: '🧈', basePrice: 70, unit: 'kg', category: 'processed', volatility: 0.04 },
  { id: 'cow_cheese', name: 'Keju Sapi', emoji: '🧀', basePrice: 34, unit: 'kg', category: 'processed', volatility: 0.04 },
  { id: 'sugar', name: 'Gula', emoji: '🍬', basePrice: 700, unit: 't', category: 'processed', volatility: 0.05 },
  { id: 'oil', name: 'Minyak Nabati', emoji: '🫗', basePrice: 2000, unit: 't', category: 'processed', volatility: 0.05 },
  { id: 'bread', name: 'Roti', emoji: '🍞', basePrice: 1150, unit: 't', category: 'processed', volatility: 0.03 },
  { id: 'cake', name: 'Kue', emoji: '🍰', basePrice: 5500, unit: 't', category: 'processed', volatility: 0.04 },
  { id: 'fabric', name: 'Kain Katun', emoji: '🧵', basePrice: 1.5, unit: 'kg', category: 'processed', volatility: 0.05 },
  { id: 'yarn', name: 'Benang Wol', emoji: '🪡', basePrice: 50, unit: 'kg', category: 'processed', volatility: 0.05 },
  // Lv 11–30 crops and animals (stream A)
  { id: 'tea', name: 'Teh', emoji: '🍵', basePrice: 2600, unit: 't', category: 'crop', volatility: 0.06 },
  { id: 'cocoa', name: 'Kakao', emoji: '🍫', basePrice: 5200, unit: 't', category: 'crop', volatility: 0.09 },
  { id: 'oilpalm', name: 'Kelapa Sawit', emoji: '🌴', basePrice: 420, unit: 't', category: 'crop', volatility: 0.07 },
  { id: 'grape', name: 'Anggur', emoji: '🍇', basePrice: 900, unit: 't', category: 'crop', volatility: 0.08 },
  { id: 'lavender', name: 'Lavender', emoji: '💜', basePrice: 2400, unit: 't', category: 'crop', volatility: 0.08 },
  { id: 'saffron', name: 'Saffron', emoji: '🌺', basePrice: 400000, unit: 't', category: 'crop', volatility: 0.12 },
  { id: 'duck_eggs', name: 'Telur Bebek', emoji: '🪺', basePrice: 1.6, unit: 'pcs', kgPerUnit: 0.07, category: 'animal', volatility: 0.03 },
  { id: 'buffalo_milk', name: 'Susu Kerbau', emoji: '🍼', basePrice: 4.5, unit: 'L', category: 'animal', volatility: 0.04 },
  { id: 'alpaca_wool', name: 'Wol Alpaka', emoji: '🧶', basePrice: 75, unit: 'kg', category: 'animal', volatility: 0.06 },
  // Palm oil chain (Pabrik Kelapa Sawit, Lv 19)
  { id: 'palm_cpo', name: 'Minyak Sawit Mentah (CPO)', emoji: '🛢️', basePrice: 2350, unit: 't', category: 'processed', volatility: 0.07 },
  { id: 'palm_kernel', name: 'Inti Sawit', emoji: '🥥', basePrice: 1400, unit: 't', category: 'processed', volatility: 0.06 },
  { id: 'palm_kernel_oil', name: 'Minyak Inti Sawit (PKO)', emoji: '🫙', basePrice: 4350, unit: 't', category: 'processed', volatility: 0.07 },
  { id: 'cooking_oil', name: 'Minyak Goreng', emoji: '🍳', basePrice: 3950, unit: 't', category: 'processed', volatility: 0.04 },
  // Kebun buah (TREES)
  { id: 'orange', name: 'Jeruk', emoji: '🍊', basePrice: 520, unit: 't', category: 'crop', volatility: 0.07 },
  { id: 'apple', name: 'Apel', emoji: '🍎', basePrice: 640, unit: 't', category: 'crop', volatility: 0.06 },
  { id: 'mango', name: 'Mangga', emoji: '🥭', basePrice: 900, unit: 't', category: 'crop', volatility: 0.08 },
  { id: 'avocado', name: 'Alpukat', emoji: '🥑', basePrice: 1700, unit: 't', category: 'crop', volatility: 0.08 },
  { id: 'coconut', name: 'Kelapa', emoji: '🥥', basePrice: 650, unit: 't', category: 'crop', volatility: 0.05 },
  { id: 'cherry', name: 'Ceri', emoji: '🍒', basePrice: 4200, unit: 't', category: 'crop', volatility: 0.09 },
  { id: 'durian', name: 'Durian', emoji: '🍈', basePrice: 5200, unit: 't', category: 'crop', volatility: 0.1 },
  // Lv 31–50 crops
  { id: 'pepper', name: 'Lada', emoji: '🌶️', basePrice: 6500, unit: 't', category: 'crop', volatility: 0.09 },
  { id: 'rose', name: 'Mawar', emoji: '🌹', basePrice: 1600, unit: 't', category: 'crop', volatility: 0.1 },
  { id: 'blueberry', name: 'Bluberi', emoji: '🫐', basePrice: 3800, unit: 't', category: 'crop', volatility: 0.09 },
  // Peternakan ikan (PONDS, js/engine/fish.js): harvest in kg → Gudang dingin. Pelet ikan = pond feed (silo, t).
  { id: 'ikan_lele', name: 'Ikan Lele', emoji: '🐟', basePrice: 4, unit: 'kg', category: 'animal', volatility: 0.06 },
  { id: 'ikan_nila', name: 'Ikan Nila', emoji: '🐟', basePrice: 5.5, unit: 'kg', category: 'animal', volatility: 0.06 },
  { id: 'ikan_mas', name: 'Ikan Mas', emoji: '🐟', basePrice: 6.5, unit: 'kg', category: 'animal', volatility: 0.06 },
  { id: 'udang', name: 'Udang', emoji: '🦐', basePrice: 16, unit: 'kg', category: 'animal', volatility: 0.08 },
  { id: 'salmon', name: 'Salmon', emoji: '🐟', basePrice: 12, unit: 'kg', category: 'animal', volatility: 0.07 },
  { id: 'pelet_ikan', name: 'Pelet Ikan', emoji: '🟤', basePrice: 450, unit: 't', category: 'processed', volatility: 0.04, buyable: true },
];

export const MACHINES = [
  // Tractors
  { id: 'jd_5075', name: 'John Dear 5075E', brand: 'John Dear', type: 'tractor', price: 15000, unlockLevel: 1, hp: 75, speed: 1.0, fuelPerHour: 8 },
  { id: 'nh_t6', name: 'New Hollow T6.140', brand: 'New Hollow', type: 'tractor', price: 45000, unlockLevel: 2, hp: 140, speed: 1.5, fuelPerHour: 14 },
  { id: 'fendtt_724', name: 'Fendtt 724 Vario', brand: 'Fendtt', type: 'tractor', price: 110000, unlockLevel: 4, hp: 240, speed: 2.1, fuelPerHour: 22 },
  { id: 'claz_xerion', name: 'Claz Xerion 4000', brand: 'Claz', type: 'tractor', price: 220000, unlockLevel: 6, hp: 400, speed: 3.0, fuelPerHour: 35 },
  // Harvesters
  { id: 'mf_activa', name: 'Massey Fergus Activa 7345', brand: 'Massey Fergus', type: 'harvester', price: 60000, unlockLevel: 2, haPerHour: 1.5, fuelPerHour: 25 },
  { id: 'claz_lexion', name: 'Claz Lexion 8900', brand: 'Claz', type: 'harvester', price: 180000, unlockLevel: 5, haPerHour: 4, fuelPerHour: 45 },
  // Implements — plow
  { id: 'plow_s', name: 'Kase Bajak 3-Mata', brand: 'Kase', type: 'implement', price: 2500, unlockLevel: 1, task: 'plow', hpRequired: 60, haPerHour: 0.8 },
  { id: 'plow_m', name: 'Massey Fergus Bajak 5-Mata', brand: 'Massey Fergus', type: 'implement', price: 9000, unlockLevel: 3, task: 'plow', hpRequired: 130, haPerHour: 2 },
  { id: 'plow_l', name: 'Fendtt Bajak 8-Mata', brand: 'Fendtt', type: 'implement', price: 25000, unlockLevel: 5, task: 'plow', hpRequired: 230, haPerHour: 4 },
  // Implements — seed
  { id: 'seeder_s', name: 'John Dear Penabur 3m', brand: 'John Dear', type: 'implement', price: 3000, unlockLevel: 1, task: 'seed', hpRequired: 60, haPerHour: 1 },
  { id: 'seeder_m', name: 'New Hollow Penabur 6m', brand: 'New Hollow', type: 'implement', price: 12000, unlockLevel: 3, task: 'seed', hpRequired: 120, haPerHour: 2.5 },
  { id: 'seeder_l', name: 'Claz Penabur 12m', brand: 'Claz', type: 'implement', price: 30000, unlockLevel: 5, task: 'seed', hpRequired: 220, haPerHour: 5 },
  // Implements — fertilize
  { id: 'fert_s', name: 'Kase Penyebar Pupuk 800L', brand: 'Kase', type: 'implement', price: 2000, unlockLevel: 1, task: 'fertilize', hpRequired: 50, haPerHour: 1.5 },
  { id: 'fert_l', name: 'Fendtt Penyemprot Pupuk 3000L', brand: 'Fendtt', type: 'implement', price: 10000, unlockLevel: 3, task: 'fertilize', hpRequired: 130, haPerHour: 4 },
  // Implements — irrigate
  { id: 'irrig_s', name: 'New Hollow Irigasi Gulung', brand: 'New Hollow', type: 'implement', price: 2500, unlockLevel: 2, task: 'irrigate', hpRequired: 50, haPerHour: 1.2 },
  { id: 'irrig_l', name: 'John Dear Irigasi Pivot', brand: 'John Dear', type: 'implement', price: 11000, unlockLevel: 4, task: 'irrigate', hpRequired: 120, haPerHour: 3 },
  // Implements — lime (F6: moves field pH 0.5 toward 6.8, material BALANCE.limeCostPerHa)
  { id: 'lime_s', name: 'Kase Penebar Kapur 1t', brand: 'Kase', type: 'implement', price: 3000, unlockLevel: 2, task: 'lime', hpRequired: 50, haPerHour: 1.5 },
  { id: 'lime_l', name: 'Fendtt Penebar Kapur 6t', brand: 'Fendtt', type: 'implement', price: 14000, unlockLevel: 5, task: 'lime', hpRequired: 130, haPerHour: 4 },
  // Late game (Lv 7–10)
  { id: 'jd_s790', name: 'John Dear S790', brand: 'John Dear', type: 'harvester', price: 320000, unlockLevel: 7, haPerHour: 6, fuelPerHour: 60 },
  { id: 'fert_xl', name: 'Claz Penyemprot 6000L', brand: 'Claz', type: 'implement', price: 28000, unlockLevel: 7, task: 'fertilize', hpRequired: 230, haPerHour: 7 },
  { id: 'jd_9rx', name: 'John Dear 9RX 640', brand: 'John Dear', type: 'tractor', price: 380000, unlockLevel: 8, hp: 640, speed: 4.2, fuelPerHour: 50 },
  { id: 'plow_xl', name: 'Kase Bajak 12-Mata', brand: 'Kase', type: 'implement', price: 60000, unlockLevel: 8, task: 'plow', hpRequired: 400, haPerHour: 7 },
  { id: 'seeder_xl', name: 'John Dear Penabur 18m', brand: 'John Dear', type: 'implement', price: 65000, unlockLevel: 9, task: 'seed', hpRequired: 380, haPerHour: 8 },
  { id: 'irrig_xl', name: 'Fendtt Irigasi Linear', brand: 'Fendtt', type: 'implement', price: 32000, unlockLevel: 9, task: 'irrigate', hpRequired: 220, haPerHour: 6 },
  { id: 'nh_cr11', name: 'New Hollow CR11', brand: 'New Hollow', type: 'harvester', price: 450000, unlockLevel: 10, haPerHour: 10, fuelPerHour: 75 },
  // Lv 11–30 (stream A): tractors > 640 hp, faster harvesters (fuel/ha stays < rent/2), XXL implements
  { id: 'lime_xl', name: 'Claz Penebar Kapur 12t', brand: 'Claz', type: 'implement', price: 45000, unlockLevel: 12, task: 'lime', hpRequired: 230, haPerHour: 8 },
  { id: 'fert_xxl', name: 'John Dear Penyemprot 12000L', brand: 'John Dear', type: 'implement', price: 70000, unlockLevel: 13, task: 'fertilize', hpRequired: 400, haPerHour: 11 },
  { id: 'plow_xxl', name: 'Fendtt Bajak 16-Mata', brand: 'Fendtt', type: 'implement', price: 95000, unlockLevel: 14, task: 'plow', hpRequired: 600, haPerHour: 10 },
  { id: 'fendtt_1167', name: 'Fendtt 1167 Vario MT', brand: 'Fendtt', type: 'tractor', price: 520000, unlockLevel: 16, hp: 680, speed: 4.8, fuelPerHour: 60 },
  { id: 'claz_lexion_tt', name: 'Claz Lexion 8900 TT', brand: 'Claz', type: 'harvester', price: 620000, unlockLevel: 17, haPerHour: 13, fuelPerHour: 90 },
  { id: 'seeder_xxl', name: 'Claz Penabur 24m', brand: 'Claz', type: 'implement', price: 110000, unlockLevel: 18, task: 'seed', hpRequired: 600, haPerHour: 10 },
  { id: 'nh_cr11_twin', name: 'New Hollow CR11 Twin', brand: 'New Hollow', type: 'harvester', price: 800000, unlockLevel: 21, haPerHour: 16, fuelPerHour: 105 },
  { id: 'kase_steiger', name: 'Kase Steiger 715 Quadtrac', brand: 'Kase', type: 'tractor', price: 700000, unlockLevel: 22, hp: 715, speed: 5.4, fuelPerHour: 68 },
  { id: 'irrig_xxl', name: 'New Hollow Irigasi Pivot Raksasa', brand: 'New Hollow', type: 'implement', price: 75000, unlockLevel: 24, task: 'irrigate', hpRequired: 350, haPerHour: 10 },
  { id: 'jd_9rx_830', name: 'John Dear 9RX 830', brand: 'John Dear', type: 'tractor', price: 950000, unlockLevel: 26, hp: 830, speed: 6.2, fuelPerHour: 78 },
  { id: 'plow_xxxl', name: 'Kase Bajak 20-Mata', brand: 'Kase', type: 'implement', price: 140000, unlockLevel: 27, task: 'plow', hpRequired: 800, haPerHour: 13 },
  { id: 'jd_x9', name: 'John Dear X9 1100', brand: 'John Dear', type: 'harvester', price: 1050000, unlockLevel: 28, haPerHour: 20, fuelPerHour: 120 },
  { id: 'seeder_xxxl', name: 'Fendtt Penabur 36m', brand: 'Fendtt', type: 'implement', price: 180000, unlockLevel: 30, task: 'seed', hpRequired: 800, haPerHour: 14 },
  // Lv 31–50: tractors to 1100 hp, harvesters to 40 ha/h (fuel/ha keeps falling), XXXL implements for 500–1600 ha fields
  { id: 'fert_xxxl', name: 'Claz Penyemprot 24000L', brand: 'Claz', type: 'implement', price: 150000, unlockLevel: 31, task: 'fertilize', hpRequired: 600, haPerHour: 16 },
  { id: 'claz_xerion_12', name: 'Claz Xerion 12.650', brand: 'Claz', type: 'tractor', price: 1250000, unlockLevel: 33, hp: 950, speed: 7, fuelPerHour: 88 },
  { id: 'irrig_xxxl', name: 'John Dear Irigasi Pivot Ganda', brand: 'John Dear', type: 'implement', price: 120000, unlockLevel: 34, task: 'irrigate', hpRequired: 500, haPerHour: 15 },
  { id: 'claz_lexion_terra', name: 'Claz Lexion 8900 Terra', brand: 'Claz', type: 'harvester', price: 1400000, unlockLevel: 35, haPerHour: 25, fuelPerHour: 140 },
  { id: 'lime_xxl', name: 'Fendtt Penebar Kapur 24t', brand: 'Fendtt', type: 'implement', price: 90000, unlockLevel: 36, task: 'lime', hpRequired: 400, haPerHour: 13 },
  { id: 'plow_24', name: 'Fendtt Bajak 24-Mata', brand: 'Fendtt', type: 'implement', price: 210000, unlockLevel: 38, task: 'plow', hpRequired: 950, haPerHour: 17 },
  { id: 'seeder_48', name: 'John Dear Penabur 48m', brand: 'John Dear', type: 'implement', price: 260000, unlockLevel: 40, task: 'seed', hpRequired: 950, haPerHour: 19 },
  { id: 'jd_9rx_1050', name: 'John Dear 9RX 1050 Autonom', brand: 'John Dear', type: 'tractor', price: 1700000, unlockLevel: 42, hp: 1100, speed: 8, fuelPerHour: 95 },
  { id: 'nh_cr12', name: 'New Hollow CR12 Revelation', brand: 'New Hollow', type: 'harvester', price: 1900000, unlockLevel: 44, haPerHour: 32, fuelPerHour: 165 },
  { id: 'fert_drone', name: 'Fendtt Penyemprot Drone 30000L', brand: 'Fendtt', type: 'implement', price: 240000, unlockLevel: 46, task: 'fertilize', hpRequired: 900, haPerHour: 22 },
  { id: 'plow_32', name: 'Kase Bajak 32-Mata', brand: 'Kase', type: 'implement', price: 320000, unlockLevel: 48, task: 'plow', hpRequired: 1100, haPerHour: 22 },
  { id: 'seeder_60', name: 'Claz Penabur 60m', brand: 'Claz', type: 'implement', price: 380000, unlockLevel: 49, task: 'seed', hpRequired: 1100, haPerHour: 24 },
  { id: 'claz_trion_x', name: 'Claz Trion X Otonom', brand: 'Claz', type: 'harvester', price: 2600000, unlockLevel: 50, haPerHour: 40, fuelPerHour: 180 },
  // Fruit harvest (orchards): tractor-mounted tree shakers (task 'pick'); without one, pickers are rented per ha.
  { id: 'shaker_s', name: 'Kase Pengguncang Pohon', brand: 'Kase', type: 'implement', price: 16000, unlockLevel: 7, task: 'pick', hpRequired: 70, haPerHour: 1.2 },
  { id: 'shaker_l', name: 'Fendtt Pemetik Buah Otomatis', brand: 'Fendtt', type: 'implement', price: 70000, unlockLevel: 16, task: 'pick', hpRequired: 230, haPerHour: 4 },
  { id: 'shaker_xl', name: 'Claz Pemetik Buah Robotik', brand: 'Claz', type: 'implement', price: 160000, unlockLevel: 39, task: 'pick', hpRequired: 400, haPerHour: 8 },
  // Trucks (js/engine/logistics.js): deliver silo stock to CITIES. capacity t, speedKmh, fuelPerKm L.
  // Upgrades: engine = capacity +10%/lvl, transmission = speed +10%/lvl, efficiency = fuel −10%/lvl.
  { id: 'truk_elf', name: 'Isuzi Elf Bak 4t', brand: 'Isuzi', type: 'truck', price: 9000, unlockLevel: 2, capacity: 4, speedKmh: 60, fuelPerKm: 0.13 },
  { id: 'truk_canter', name: 'Mitsubichi Canter 8t', brand: 'Mitsubichi', type: 'truck', price: 24000, unlockLevel: 4, capacity: 8, speedKmh: 70, fuelPerKm: 0.2 },
  { id: 'truk_hinu', name: 'Hinu 500 Tronton 20t', brand: 'Hinu', type: 'truck', price: 65000, unlockLevel: 7, capacity: 20, speedKmh: 75, fuelPerKm: 0.32 },
  { id: 'truk_scanya', name: 'Scanya R500 Trailer 35t', brand: 'Scanya', type: 'truck', price: 140000, unlockLevel: 12, capacity: 35, speedKmh: 85, fuelPerKm: 0.4 },
  { id: 'truk_volvu', name: 'Volvu FH16 Road Train 60t', brand: 'Volvu', type: 'truck', price: 260000, unlockLevel: 20, capacity: 60, speedKmh: 90, fuelPerKm: 0.52 },
  { id: 'truk_scanya_s', name: 'Scanya S770 Road Train 90t', brand: 'Scanya', type: 'truck', price: 420000, unlockLevel: 35, capacity: 90, speedKmh: 90, fuelPerKm: 0.7 },
];

export const ANIMALS = [
  // Payback incl. barn share ≈ 30–40 days at base prices (land ≈ 8–35). `livestock` marks large animals (achievement).
  { id: 'chickens', name: 'Ayam', emoji: '🐔', price: 15, product: 'eggs', productPerDay: 1, feedPerDay: 0.00012, feedCrops: ['wheat', 'corn', 'barley', 'soybean'], barnCost: 2000, barnCapacity: 200, sellPrice: 8, unlockLevel: 1 },
  { id: 'cows', name: 'Sapi Perah', emoji: '🐄', price: 1400, product: 'milk', productPerDay: 28, feedPerDay: 0.025, feedCrops: ['wheat', 'corn', 'barley', 'soybean'], barnCost: 12000, barnCapacity: 20, sellPrice: 850, unlockLevel: 2, livestock: true },
  { id: 'sheep', name: 'Domba', emoji: '🐑', price: 300, product: 'wool', productPerDay: 0.45, feedPerDay: 0.003, feedCrops: ['wheat', 'barley', 'corn'], barnCost: 6000, barnCapacity: 40, sellPrice: 180, unlockLevel: 3, livestock: true },
  { id: 'pigs', name: 'Babi', emoji: '🐖', price: 250, product: 'pork', productPerDay: 1.4, feedPerDay: 0.004, feedCrops: ['corn', 'barley', 'soybean', 'potato'], barnCost: 10000, barnCapacity: 50, sellPrice: 160, unlockLevel: 4, livestock: true },
  { id: 'goats', name: 'Kambing', emoji: '🐐', price: 600, product: 'cheese', productPerDay: 0.5, feedPerDay: 0.004, feedCrops: ['wheat', 'barley', 'corn', 'soybean'], barnCost: 10000, barnCapacity: 40, sellPrice: 380, unlockLevel: 7, livestock: true },
  { id: 'bees', name: 'Lebah', emoji: '🐝', price: 200, product: 'honey', productPerDay: 0.8, feedPerDay: 0.0005, feedCrops: ['sugarcane'], barnCost: 15000, barnCapacity: 30, sellPrice: 120, unlockLevel: 9 },
  { id: 'ducks', name: 'Bebek', emoji: '🦆', price: 25, product: 'duck_eggs', productPerDay: 0.9, feedPerDay: 0.00015, feedCrops: ['rice', 'corn', 'barley'], barnCost: 4000, barnCapacity: 150, sellPrice: 14, unlockLevel: 15 },
  { id: 'buffalo', name: 'Kerbau', emoji: '🐃', price: 1500, product: 'buffalo_milk', productPerDay: 14, feedPerDay: 0.03, feedCrops: ['rice', 'sugarcane', 'corn'], barnCost: 16000, barnCapacity: 20, sellPrice: 900, unlockLevel: 20, livestock: true },
  { id: 'alpaca', name: 'Alpaka', emoji: '🦙', price: 1200, product: 'alpaca_wool', productPerDay: 0.6, feedPerDay: 0.004, feedCrops: ['barley', 'wheat', 'lavender'], barnCost: 12000, barnCapacity: 30, sellPrice: 700, unlockLevel: 25, livestock: true },
];

// Peternakan ikan (js/engine/fish.js). One pond = one batch: tebar benih (`fryPrice`/ekor, up to `capacity`), grow
// `growDays` eating pelet (count × harvestKg × fcr / growDays kg/day), harvest `harvestKg`/ekor → Gudang dingin.
// `waterDecay`: kualitas air points lost per day. `climate`: needs an owned field in a 'tropical' region
// (climate.tropical) or a 'cold' one (baseTemp ≤ FISH_BALANCE.coldTemp) until level `anyRegionLevel`.
// Profit/day at base prices (pelet bought ×1.2, ~2 water changes/cycle) ≈ 150–2400; payback 30–40 days.
export const PONDS = [
  { id: 'lele', name: 'Kolam Lele', emoji: '🐟', product: 'ikan_lele', unlockLevel: 3, buildCost: 5000, capacity: 4000, fryPrice: 0.12, growDays: 12, harvestKg: 0.2, fcr: 1.0, waterDecay: 9, waterCost: 150 },
  { id: 'nila', name: 'Kolam Nila', emoji: '🐟', product: 'ikan_nila', unlockLevel: 8, buildCost: 10000, capacity: 4000, fryPrice: 0.2, growDays: 16, harvestKg: 0.35, fcr: 1.3, waterDecay: 8, waterCost: 200 },
  { id: 'udang', name: 'Tambak Udang', emoji: '🦐', product: 'udang', unlockLevel: 12, climate: 'tropical', anyRegionLevel: 30, buildCost: 25000, capacity: 50000, fryPrice: 0.05, growDays: 14, harvestKg: 0.02, fcr: 1.4, waterDecay: 12, waterCost: 400 },
  { id: 'mas', name: 'Kolam Ikan Mas', emoji: '🐟', product: 'ikan_mas', unlockLevel: 14, buildCost: 12000, capacity: 3000, fryPrice: 0.3, growDays: 18, harvestKg: 0.5, fcr: 1.5, waterDecay: 8, waterCost: 250 },
  { id: 'salmon', name: 'Keramba Salmon', emoji: '🐟', product: 'salmon', unlockLevel: 22, climate: 'cold', anyRegionLevel: 40, buildCost: 75000, capacity: 2000, fryPrice: 2, growDays: 24, harvestKg: 2.5, fcr: 1.2, waterDecay: 6, waterCost: 600 },
];
// Kualitas air: growth ×1 at ≥ goodWater, falling to ×minGrowth at 0; below badWater fish die up to
// badWaterMortality/day (+ hungerMortality × unfed share). Aerator (buildCost × aeratorRate) multiplies decay.
export const FISH_BALANCE = { feed: 'pelet_ikan', coldTemp: 12, goodWater: 50, badWater: 40, minGrowth: 0.4,
  baseMortality: 0.003, badWaterMortality: 0.06, hungerMortality: 0.04, aeratorRate: 0.4, aeratorDecay: 0.5,
  autoWaterBelow: 50, autoHarvestDays: 1 };

// Factories (stream B, js/engine/factories.js). A batch pulls `inputs` from the silo (feed reserve kept),
// runs `hours / 1.25^(level-1)` and adds `outputs`. Value-add at base price is noted per recipe.
export const FACTORIES = [
  { id: 'mill', name: 'Penggilingan', emoji: '⚙️', unlockLevel: 11, price: 25000, upgradeCost: 8000, maxLevel: 5, recipes: [
    { id: 'flour', inputs: { wheat: 10 }, outputs: { flour: 7.5 }, hours: 6 }, // +36%
    { id: 'malt', inputs: { barley: 10 }, outputs: { malt: 7.5 }, hours: 8 }, // +35%
  ] },
  { id: 'dairy', name: 'Pabrik Susu', emoji: '🏭', unlockLevel: 13, price: 40000, upgradeCost: 12000, maxLevel: 5, recipes: [
    { id: 'butter', inputs: { milk: 1000 }, outputs: { butter: 45 }, hours: 8 }, // +43%
    { id: 'cow_cheese', inputs: { milk: 1000 }, outputs: { cow_cheese: 100 }, hours: 12 }, // +55%
  ] },
  { id: 'sugar_mill', name: 'Pabrik Gula', emoji: '🎋', unlockLevel: 15, price: 55000, upgradeCost: 16000, maxLevel: 5, recipes: [
    { id: 'sugar', inputs: { sugarcane: 40 }, outputs: { sugar: 4.8 }, hours: 10 }, // +40%
  ] },
  { id: 'oil_press', name: 'Pabrik Minyak', emoji: '🛢️', unlockLevel: 18, price: 75000, upgradeCost: 22000, maxLevel: 5, recipes: [
    { id: 'oil_canola', name: 'Minyak (kanola)', inputs: { canola: 5 }, outputs: { oil: 2.1 }, hours: 8 }, // +35%
    { id: 'oil_sunflower', name: 'Minyak (bunga matahari)', inputs: { sunflower: 5 }, outputs: { oil: 2.5 }, hours: 8 }, // +32%
  ] },
  // TBS → CPO ≈ 22% + kernel 5% of bunch weight; kernel → PKO ≈ 45%; CPO refined → ≈ 80% olein (minyak goreng).
  { id: 'palm_mill', name: 'Pabrik Kelapa Sawit', emoji: '🌴', unlockLevel: 19, price: 110000, upgradeCost: 32000, maxLevel: 5, recipes: [
    { id: 'palm_cpo', name: 'CPO + inti sawit', inputs: { oilpalm: 10 }, outputs: { palm_cpo: 2.2, palm_kernel: 0.5 }, hours: 8 }, // +40%
    { id: 'palm_pko', name: 'Minyak inti sawit (PKO)', inputs: { palm_kernel: 2 }, outputs: { palm_kernel_oil: 0.9 }, hours: 6 }, // +40%
    { id: 'cooking_oil', name: 'Minyak goreng', inputs: { palm_cpo: 2 }, outputs: { cooking_oil: 1.6 }, hours: 8 }, // +34%
  ] },
  { id: 'bakery', name: 'Toko Roti', emoji: '🥖', unlockLevel: 21, price: 95000, upgradeCost: 28000, maxLevel: 5, recipes: [
    { id: 'bread', inputs: { flour: 3, eggs: 2000, sugar: 0.3 }, outputs: { bread: 4 }, hours: 6 }, // +43%
    { id: 'cake', inputs: { flour: 1, sugar: 0.5, butter: 30, eggs: 1500 }, outputs: { cake: 1.2 }, hours: 10 }, // +57%
  ] },
  { id: 'textile', name: 'Pabrik Tekstil', emoji: '🧶', unlockLevel: 24, price: 120000, upgradeCost: 35000, maxLevel: 5, recipes: [
    { id: 'fabric', inputs: { cotton: 10 }, outputs: { fabric: 7500 }, hours: 8 }, // +34%
    { id: 'yarn', inputs: { wool: 250 }, outputs: { yarn: 225 }, hours: 6 }, // +41%
  ] },
  // Pelet ikan for the kolam (fish.js); also buyable in the Pasar at ×1.2.
  { id: 'feed_mill', name: 'Pabrik Pakan Ikan', emoji: '🟤', unlockLevel: 11, price: 30000, upgradeCost: 9000, maxLevel: 5, recipes: [
    { id: 'pelet_ikan', name: 'Pelet ikan', inputs: { soybean: 2, corn: 3 }, outputs: { pelet_ikan: 5 }, hours: 6 }, // +35%
  ] },
];

// Peta (js/ui/farm.js) shows one continent at a time; FIELDS x/y are % positions on their continent's map.
export const CONTINENTS = [
  { id: 'asia', name: 'Asia & Oseania', short: 'Asia', emoji: '🌏' },
  { id: 'eropa', name: 'Eropa & Afrika', short: 'Eropa', emoji: '🌍' },
  { id: 'amerika', name: 'Amerika', short: 'Amerika', emoji: '🌎' },
];

export const REGIONS = [
  { id: 'jabar', name: 'Jawa Barat', continent: 'asia', climate: { baseTemp: 27, rainChance: 0.45, tempSwing: 4, tropical: true } },
  { id: 'bavaria', name: 'Bavaria', continent: 'eropa', climate: { baseTemp: 14, rainChance: 0.3, tempSwing: 8 } },
  { id: 'iowa', name: 'Iowa', continent: 'amerika', climate: { baseTemp: 18, rainChance: 0.25, tempSwing: 10 } },
  { id: 'normandia', name: 'Normandia', continent: 'eropa', climate: { baseTemp: 13, rainChance: 0.4, tempSwing: 6 } },
  { id: 'hokkaido', name: 'Hokkaido', continent: 'asia', climate: { baseTemp: 10, rainChance: 0.35, tempSwing: 9 } },
  // Late regions (stream A): every field there opens at max(field.unlockLevel, region.unlockLevel).
  { id: 'matogrosso', name: 'Mato Grosso', continent: 'amerika', unlockLevel: 12, climate: { baseTemp: 26, rainChance: 0.4, tempSwing: 4, tropical: true } },
  { id: 'queensland', name: 'Queensland', continent: 'asia', unlockLevel: 19, climate: { baseTemp: 22, rainChance: 0.25, tempSwing: 7, tropical: false } },
  // Lv 10–43 expansion. `southern`: temperate seasons run half a year shifted (Pampas spring = northern autumn).
  { id: 'kalimantan', name: 'Kalimantan', continent: 'asia', unlockLevel: 10, desc: 'Tropis basah, tanah gambut asam: sawit, kakao, lada.',
    climate: { baseTemp: 27, rainChance: 0.55, tempSwing: 3, tropical: true } },
  { id: 'ukraina', name: 'Ukraina', continent: 'eropa', unlockLevel: 22, desc: 'Kontinental, chernozem subur: gandum, bunga matahari.',
    climate: { baseTemp: 10, rainChance: 0.28, tempSwing: 13 } },
  { id: 'mekong', name: 'Delta Mekong', continent: 'asia', unlockLevel: 31, desc: 'Tropis delta, sawah aluvial: padi, tebu, lada, kopi.',
    climate: { baseTemp: 28, rainChance: 0.5, tempSwing: 3, tropical: true } },
  { id: 'pampas', name: 'Pampas', continent: 'amerika', unlockLevel: 34, desc: 'Sedang, belahan selatan: kedelai, jagung, gandum.',
    climate: { baseTemp: 17, rainChance: 0.3, tempSwing: 8, southern: true } },
  { id: 'kenya', name: 'Kenya', continent: 'eropa', unlockLevel: 38, desc: 'Dataran tinggi tropis sejuk: teh, kopi, mawar.',
    climate: { baseTemp: 19, rainChance: 0.42, tempSwing: 4, tropical: true } },
  { id: 'alberta', name: 'Alberta', continent: 'amerika', unlockLevel: 43, desc: 'Prairi dingin, musim tanam pendek: kanola, gandum, barley.',
    climate: { baseTemp: 7, rainChance: 0.25, tempSwing: 13 } },
];

// Cities for truck deliveries (js/engine/logistics.js). `km`: road distance from each region it can be reached
// from (the nearest region with an owned field is used). Sale price = market × (demand[id] ?? base). Crops
// (buyable at market ×1.2) are capped at ×1.15 so buy-and-ship never profits. Near = small premium, far = big;
// processed/animal goods top out at ×1.25 (only far cities), so trucks add margin without replacing factories.
export const CITIES = [
  { id: 'bandung', name: 'Bandung', emoji: '🏙️', unlockLevel: 2, km: { jabar: 40 }, base: 1.03,
    demand: { rice: 1.08, tomato: 1.1, strawberry: 1.12, tea: 1.08, eggs: 1.08, ikan_mas: 1.08, ikan_nila: 1.08, potato: 0.95 } },
  { id: 'jakarta', name: 'Jakarta', emoji: '🌆', unlockLevel: 5, km: { jabar: 150 }, base: 1.05,
    demand: { milk: 1.15, eggs: 1.12, ikan_lele: 1.12, udang: 1.15, bread: 1.15, cake: 1.18, sugar: 1.12, oil: 1.12, cooking_oil: 1.15, rice: 1.1, coffee: 1.12, cotton: 0.95 } },
  { id: 'desmoines', name: 'Des Moines', emoji: '🏢', unlockLevel: 4, km: { iowa: 45 }, base: 1.02,
    demand: { corn: 1.06, soybean: 1.08, pork: 1.08, wheat: 0.95 } },
  { id: 'munchen', name: 'München', emoji: '🍺', unlockLevel: 4, km: { bavaria: 70 }, base: 1.03,
    demand: { barley: 1.1, malt: 1.15, butter: 1.1, cow_cheese: 1.08, honey: 1.1, wheat: 0.95 } },
  { id: 'sapporo', name: 'Sapporo', emoji: '❄️', unlockLevel: 5, km: { hokkaido: 120 }, base: 1.04,
    demand: { milk: 1.15, butter: 1.15, cow_cheese: 1.15, salmon: 1.12, potato: 1.12, rice: 1.1, wheat: 0.95 } },
  { id: 'paris', name: 'Paris', emoji: '🗼', unlockLevel: 7, km: { normandia: 240, bavaria: 830 }, base: 1.06,
    demand: { cow_cheese: 1.25, cheese: 1.25, butter: 1.2, bread: 1.2, cake: 1.25, salmon: 1.2, flour: 1.15, grape: 1.15, lavender: 1.15 } },
  { id: 'chicago', name: 'Chicago', emoji: '🌃', unlockLevel: 8, km: { iowa: 560 }, base: 1.08,
    demand: { flour: 1.2, pork: 1.2, milk: 1.15, bread: 1.25, cake: 1.25, soybean: 1.15, corn: 1.15 } },
  { id: 'cuiaba', name: 'Cuiabá', emoji: '🌇', unlockLevel: 12, km: { matogrosso: 60 }, base: 1.03,
    demand: { soybean: 1.08, sugar: 1.15, oil: 1.15, coffee: 1.12, cotton: 1.1, cocoa: 0.9 } },
  { id: 'brisbane', name: 'Brisbane', emoji: '🦘', unlockLevel: 19, km: { queensland: 160 }, base: 1.04,
    demand: { sugar: 1.15, cotton: 1.1, avocado: 1.12, mango: 1.1, milk: 1.12, wheat: 0.95 } },
  // Lv 10–45 expansion regions: a near city (small premium) and, for most, a far port/metropolis (big premium).
  { id: 'banjarmasin', name: 'Banjarmasin', emoji: '🛶', unlockLevel: 10, km: { kalimantan: 90 }, base: 1.03,
    demand: { rice: 1.08, oilpalm: 1.1, cocoa: 1.08, pepper: 1.1, palm_cpo: 1.15, cooking_oil: 1.15, coconut: 1.1, ikan_nila: 1.1, udang: 1.1 } },
  { id: 'kyiv', name: 'Kyiv', emoji: '🏛️', unlockLevel: 22, km: { ukraina: 130 }, base: 1.03,
    demand: { bread: 1.15, butter: 1.12, pork: 1.12, potato: 1.1, sugar: 1.12, wheat: 0.95 } },
  { id: 'odesa', name: 'Odesa', emoji: '⚓', unlockLevel: 24, km: { ukraina: 450 }, base: 1.07,
    demand: { wheat: 1.12, sunflower: 1.15, barley: 1.1, corn: 1.1, oil: 1.22, flour: 1.2, malt: 1.18 } },
  { id: 'hcmc', name: 'TP Ho Chi Minh', emoji: '🛵', unlockLevel: 31, km: { mekong: 110 }, base: 1.04,
    demand: { rice: 1.1, coffee: 1.12, pepper: 1.12, durian: 1.12, mango: 1.1, sugar: 1.15, cooking_oil: 1.18, duck_eggs: 1.15, udang: 1.12, ikan_nila: 1.1 } },
  { id: 'rosario', name: 'Rosario', emoji: '🌉', unlockLevel: 34, km: { pampas: 70 }, base: 1.03,
    demand: { soybean: 1.1, corn: 1.08, sunflower: 1.08, oil: 1.15, wheat: 1.05 } },
  { id: 'buenosaires', name: 'Buenos Aires', emoji: '💃', unlockLevel: 36, km: { pampas: 300 }, base: 1.06,
    demand: { milk: 1.15, cow_cheese: 1.22, butter: 1.18, bread: 1.2, cake: 1.25, grape: 1.15, flour: 1.18, pork: 1.15 } },
  { id: 'nairobi', name: 'Nairobi', emoji: '🦒', unlockLevel: 38, km: { kenya: 140 }, base: 1.04,
    demand: { tea: 1.1, coffee: 1.1, rose: 1.12, avocado: 1.12, milk: 1.15, sugar: 1.12 } },
  { id: 'mombasa', name: 'Mombasa', emoji: '🚢', unlockLevel: 41, km: { kenya: 480 }, base: 1.07,
    demand: { tea: 1.15, coffee: 1.15, rose: 1.15, cooking_oil: 1.2, sugar: 1.2, cocoa: 1.12, coconut: 1.12, udang: 1.18 } },
  { id: 'calgary', name: 'Calgary', emoji: '🤠', unlockLevel: 43, km: { alberta: 80 }, base: 1.03,
    demand: { canola: 1.1, barley: 1.08, malt: 1.15, wheat: 1.05, pork: 1.1, blueberry: 1.1 } },
  { id: 'vancouver', name: 'Vancouver', emoji: '🏔️', unlockLevel: 45, km: { alberta: 970 }, base: 1.08,
    demand: { canola: 1.15, oil: 1.25, flour: 1.2, blueberry: 1.15, cherry: 1.15, apple: 1.12, honey: 1.2, cake: 1.25, salmon: 1.22 } },
];

// Research tree (js/engine/research.js). Points: 1 per level-up (old saves: level − 1, derived from the level).
// `effects` are summed per key over unlocked nodes (perk(key), each key capped at PERK_MAX); see research.js PERK_KEYS.
// Tier 5 (`minLevel` 32–47): 2 nodes per branch, 52 points in total vs 49 earned by Lv 50, so one node stays a choice.
export const RESEARCH_BRANCHES = [
  { id: 'tani', name: 'Pertanian', emoji: '🌾' }, { id: 'ternak', name: 'Peternakan', emoji: '🐄' },
  { id: 'bisnis', name: 'Bisnis', emoji: '💼' }, { id: 'mesin', name: 'Mekanik', emoji: '🚜' },
];
export const RESEARCH = [
  { id: 'tani_panen1', branch: 'tani', name: 'Benih Unggul I', emoji: '🌱', cost: 1, requires: [], effects: { yield: 0.05 } },
  { id: 'tani_benih', branch: 'tani', name: 'Petani Hemat', emoji: '💵', cost: 1, requires: ['tani_panen1'], effects: { seedCost: 0.1 } },
  { id: 'tani_pupuk', branch: 'tani', name: 'Pupuk Grosir', emoji: '🧪', cost: 1, requires: ['tani_panen1'], effects: { fertCost: 0.2 } },
  { id: 'tani_panen2', branch: 'tani', name: 'Benih Unggul II', emoji: '🌾', cost: 2, requires: ['tani_benih', 'tani_pupuk'], effects: { yield: 0.05 } },
  { id: 'tani_panen3', branch: 'tani', name: 'Benih Unggul III', emoji: '🏆', cost: 3, requires: ['tani_panen2'], effects: { yield: 0.05 } },
  { id: 'tani_presisi', branch: 'tani', name: 'Pertanian Presisi', emoji: '🛰️', cost: 2, minLevel: 32, requires: ['tani_panen3'], effects: { seedCost: 0.1, fertCost: 0.1 } },
  { id: 'tani_panen4', branch: 'tani', name: 'Benih Unggul IV', emoji: '🌟', cost: 3, minLevel: 40, requires: ['tani_presisi'], effects: { yield: 0.05 } },
  { id: 'ternak_pakan1', branch: 'ternak', name: 'Ransum Efisien', emoji: '🌽', cost: 1, requires: [], effects: { feed: 0.1 } },
  { id: 'ternak_produksi1', branch: 'ternak', name: 'Perawatan Ternak', emoji: '🥛', cost: 1, requires: ['ternak_pakan1'], effects: { animalProd: 0.1 } },
  { id: 'ternak_lahir', branch: 'ternak', name: 'Inseminasi', emoji: '🐣', cost: 1, requires: ['ternak_pakan1'], effects: { births: 0.2 } },
  { id: 'ternak_produksi2', branch: 'ternak', name: 'Kandang Modern', emoji: '🏠', cost: 2, requires: ['ternak_produksi1'], effects: { animalProd: 0.1 } },
  { id: 'ternak_pakan2', branch: 'ternak', name: 'Nutrisi Presisi', emoji: '🧬', cost: 3, requires: ['ternak_produksi2', 'ternak_lahir'], effects: { feed: 0.1 } },
  { id: 'ternak_genetika', branch: 'ternak', name: 'Genetika Unggul', emoji: '🐂', cost: 2, minLevel: 33, requires: ['ternak_pakan2'], effects: { births: 0.15 } },
  { id: 'ternak_produksi3', branch: 'ternak', name: 'Peternakan Pintar', emoji: '🤖', cost: 3, minLevel: 42, requires: ['ternak_genetika'], effects: { animalProd: 0.1 } },
  { id: 'bisnis_gaji', branch: 'bisnis', name: 'Manajemen SDM', emoji: '👷', cost: 1, requires: [], effects: { wages: 0.1 } },
  { id: 'bisnis_kontrak', branch: 'bisnis', name: 'Negosiator', emoji: '📋', cost: 1, requires: ['bisnis_gaji'], effects: { contractPrice: 0.05 } },
  { id: 'bisnis_bunga', branch: 'bisnis', name: 'Relasi Bank', emoji: '🏦', cost: 2, requires: ['bisnis_gaji'], effects: { interest: 0.25 } },
  { id: 'bisnis_gudang', branch: 'bisnis', name: 'Gudang Rapi', emoji: '🏚️', cost: 1, requires: ['bisnis_bunga'], effects: { silo: 0.1 } },
  { id: 'bisnis_kota', branch: 'bisnis', name: 'Jaringan Kota', emoji: '🏙️', cost: 3, requires: ['bisnis_kontrak'], effects: { cityPrice: 0.05 } },
  { id: 'bisnis_ekspor', branch: 'bisnis', name: 'Jalur Ekspor', emoji: '🚢', cost: 2, minLevel: 35, requires: ['bisnis_kota'], effects: { cityPrice: 0.03, contractPrice: 0.03 } },
  { id: 'bisnis_korporat', branch: 'bisnis', name: 'Korporasi Agribisnis', emoji: '🏢', cost: 3, minLevel: 45, requires: ['bisnis_ekspor', 'bisnis_gudang'], effects: { wages: 0.1, silo: 0.1 } },
  { id: 'mesin_bbm1', branch: 'mesin', name: 'Mesin Hemat', emoji: '⛽', cost: 1, requires: [], effects: { fuel: 0.1 } },
  { id: 'mesin_aus', branch: 'mesin', name: 'Perawatan Berkala', emoji: '🔧', cost: 1, requires: ['mesin_bbm1'], effects: { wear: 0.2 } },
  { id: 'mesin_cepat', branch: 'mesin', name: 'Operator Terlatih', emoji: '⏱️', cost: 2, requires: ['mesin_bbm1'], effects: { taskSpeed: 0.1 } },
  { id: 'mesin_truk', branch: 'mesin', name: 'Bak Truk Panjang', emoji: '🚚', cost: 1, requires: ['mesin_aus'], effects: { truckCap: 0.15 } },
  { id: 'mesin_bbm2', branch: 'mesin', name: 'Mesin Hemat II', emoji: '🛢️', cost: 3, requires: ['mesin_cepat', 'mesin_truk'], effects: { fuel: 0.1 } },
  { id: 'mesin_gps', branch: 'mesin', name: 'Autopilot GPS', emoji: '📡', cost: 2, minLevel: 37, requires: ['mesin_bbm2'], effects: { taskSpeed: 0.1 } },
  { id: 'mesin_armada', branch: 'mesin', name: 'Armada Modern', emoji: '🚛', cost: 3, minLevel: 47, requires: ['mesin_gps'], effects: { wear: 0.15, truckCap: 0.1 } },
];

// x/y: % position on the region's continent map (CONTINENTS). Lv 10–48 expansion fields are priced for a payback
// similar to the existing fields of their level (README "Wilayah"); colder/harsher regions are cheaper per ha.
export const FIELDS = [
  // ── 🌏 Asia & Oseania ──
  // Jawa Barat (left middle)
  { id: 'f1', name: 'Sawah Cikole', regionId: 'jabar', sizeHa: 6, soil: 'loam', ph: 6.5, contamination: 'none', price: 12000, x: 14, y: 44 },
  { id: 'f2', name: 'Ladang Lembang', regionId: 'jabar', sizeHa: 8, soil: 'clay', ph: 5.6, contamination: 'low', price: 42000, x: 22, y: 49 },
  { id: 'f3', name: 'Kebun Ciwidey', regionId: 'jabar', sizeHa: 12, soil: 'silt', ph: 5.9, contamination: 'none', price: 90000, x: 10, y: 53 },
  { id: 'f4', name: 'Sawah Subang', regionId: 'jabar', sizeHa: 20, soil: 'loam', ph: 6.2, contamination: 'none', price: 210000, x: 26, y: 40 },
  // Hokkaido (top right)
  { id: 'f17', name: 'Hatake Furano', regionId: 'hokkaido', sizeHa: 9, soil: 'sand', ph: 5.4, contamination: 'none', price: 54000, x: 68, y: 9 },
  { id: 'f18', name: 'Hatake Biei', regionId: 'hokkaido', sizeHa: 16, soil: 'silt', ph: 5.8, contamination: 'none', price: 135000, x: 80, y: 7 },
  { id: 'f19', name: 'Tokachi Daichi', regionId: 'hokkaido', sizeHa: 38, soil: 'loam', ph: 6.3, contamination: 'none', price: 420000, x: 90, y: 15 },
  { id: 'f20', name: 'Obihiro Heigen', regionId: 'hokkaido', sizeHa: 50, soil: 'clay', ph: 5.2, contamination: 'low', price: 285000, x: 76, y: 19 },
  // Queensland (bottom right; alkaline, dry, Lv 19+)
  { id: 'q1', name: 'Darling Downs', regionId: 'queensland', sizeHa: 120, soil: 'clay', ph: 7.6, contamination: 'none', price: 1100000, x: 66, y: 78 },
  { id: 'q2', name: 'Toowoomba Plains', regionId: 'queensland', sizeHa: 140, soil: 'loam', ph: 7.0, contamination: 'none', price: 1500000, x: 78, y: 74 },
  { id: 'q3', name: 'Emerald Station', regionId: 'queensland', sizeHa: 180, soil: 'sand', ph: 6.6, contamination: 'low', price: 1300000, x: 90, y: 78, unlockLevel: 22 },
  { id: 'q4', name: 'Bundaberg Flats', regionId: 'queensland', sizeHa: 250, soil: 'silt', ph: 6.8, contamination: 'none', price: 2600000, x: 72, y: 88, unlockLevel: 25 },
  { id: 'q5', name: 'Longreach Station', regionId: 'queensland', sizeHa: 400, soil: 'loam', ph: 7.2, contamination: 'none', price: 4400000, x: 85, y: 88, unlockLevel: 30 },
  // Kalimantan (right middle; acid peat, wet, Lv 10+)
  { id: 'k1', name: 'Kebun Sampit', regionId: 'kalimantan', sizeHa: 40, soil: 'clay', ph: 4.9, contamination: 'none', price: 260000, x: 58, y: 42 },
  { id: 'k2', name: 'Lahan Palangka Raya', regionId: 'kalimantan', sizeHa: 70, soil: 'clay', ph: 4.6, contamination: 'low', price: 420000, x: 70, y: 39, unlockLevel: 13 },
  { id: 'k3', name: 'Perkebunan Ketapang', regionId: 'kalimantan', sizeHa: 120, soil: 'loam', ph: 5.4, contamination: 'none', price: 1300000, x: 82, y: 43, unlockLevel: 18 },
  { id: 'k4', name: 'Kebun Kutai', regionId: 'kalimantan', sizeHa: 220, soil: 'silt', ph: 5.2, contamination: 'none', price: 2200000, x: 63, y: 53, unlockLevel: 26 },
  { id: 'k5', name: 'Perkebunan Berau', regionId: 'kalimantan', sizeHa: 350, soil: 'loam', ph: 5.6, contamination: 'none', price: 4000000, x: 77, y: 54, unlockLevel: 33 },
  // Delta Mekong (top left; alluvial paddies, Lv 31+)
  { id: 'mk1', name: 'Ruộng Cần Thơ', regionId: 'mekong', sizeHa: 250, soil: 'silt', ph: 5.8, contamination: 'none', price: 3000000, x: 10, y: 10 },
  { id: 'mk2', name: 'Ruộng Long An', regionId: 'mekong', sizeHa: 320, soil: 'clay', ph: 5.2, contamination: 'low', price: 3000000, x: 22, y: 7, unlockLevel: 33 },
  { id: 'mk3', name: 'Vườn Bến Tre', regionId: 'mekong', sizeHa: 420, soil: 'silt', ph: 6.0, contamination: 'none', price: 5500000, x: 34, y: 11, unlockLevel: 37 },
  { id: 'mk4', name: 'Ruộng An Giang', regionId: 'mekong', sizeHa: 550, soil: 'loam', ph: 5.9, contamination: 'none', price: 7700000, x: 15, y: 21, unlockLevel: 42 },
  { id: 'mk5', name: 'Đồng Tháp Mười', regionId: 'mekong', sizeHa: 700, soil: 'clay', ph: 5.0, contamination: 'medium', price: 7000000, x: 28, y: 22, unlockLevel: 46 },
  // ── 🌍 Eropa & Afrika ──
  // Normandia (top left)
  { id: 'f13', name: 'Champ de Caen', regionId: 'normandia', sizeHa: 6, soil: 'silt', ph: 7.4, contamination: 'none', price: 48000, x: 10, y: 12 },
  { id: 'f14', name: 'Prairie de Bayeux', regionId: 'normandia', sizeHa: 14, soil: 'loam', ph: 7.1, contamination: 'none', price: 150000, x: 22, y: 9 },
  { id: 'f15', name: 'Clos de Rouen', regionId: 'normandia', sizeHa: 22, soil: 'clay', ph: 7.8, contamination: 'low', price: 120000, x: 14, y: 23 },
  { id: 'f16', name: 'Terre de Lisieux', regionId: 'normandia', sizeHa: 40, soil: 'sand', ph: 6.0, contamination: 'medium', price: 186000, x: 27, y: 20 },
  // Bavaria (centre)
  { id: 'f5', name: 'Feld Rosenheim', regionId: 'bavaria', sizeHa: 10, soil: 'loam', ph: 6.8, contamination: 'none', price: 105000, x: 42, y: 27 },
  { id: 'f6', name: 'Acker Landshut', regionId: 'bavaria', sizeHa: 18, soil: 'clay', ph: 7.2, contamination: 'low', price: 108000, x: 54, y: 24 },
  { id: 'f7', name: 'Hof Ingolstadt', regionId: 'bavaria', sizeHa: 25, soil: 'silt', ph: 6.9, contamination: 'none', price: 225000, x: 46, y: 38 },
  { id: 'f8', name: 'Wiese Erding', regionId: 'bavaria', sizeHa: 35, soil: 'sand', ph: 7.6, contamination: 'medium', price: 165000, x: 58, y: 35 },
  // Ukraina (top right; chernozem, continental, Lv 22+)
  { id: 'u1', name: 'Pole Poltava', regionId: 'ukraina', sizeHa: 160, soil: 'loam', ph: 7.0, contamination: 'none', price: 1400000, x: 70, y: 9 },
  { id: 'u2', name: 'Pole Vinnytsia', regionId: 'ukraina', sizeHa: 220, soil: 'silt', ph: 6.8, contamination: 'none', price: 1900000, x: 82, y: 7, unlockLevel: 24 },
  { id: 'u3', name: 'Step Kherson', regionId: 'ukraina', sizeHa: 300, soil: 'sand', ph: 7.6, contamination: 'low', price: 2000000, x: 93, y: 13, unlockLevel: 28 },
  { id: 'u4', name: 'Chornozem Cherkasy', regionId: 'ukraina', sizeHa: 450, soil: 'loam', ph: 6.9, contamination: 'none', price: 4800000, x: 75, y: 19, unlockLevel: 36 },
  { id: 'u5', name: 'Lan Kharkiv', regionId: 'ukraina', sizeHa: 600, soil: 'clay', ph: 7.2, contamination: 'none', price: 5600000, x: 88, y: 22, unlockLevel: 41 },
  // Kenya (bottom; cool tropical highlands, Lv 38+)
  { id: 'ke1', name: 'Shamba Kericho', regionId: 'kenya', sizeHa: 300, soil: 'loam', ph: 5.0, contamination: 'none', price: 3600000, x: 50, y: 64 },
  { id: 'ke2', name: 'Shamba Nyeri', regionId: 'kenya', sizeHa: 380, soil: 'silt', ph: 5.6, contamination: 'none', price: 4500000, x: 62, y: 60, unlockLevel: 40 },
  { id: 'ke3', name: 'Shamba Naivasha', regionId: 'kenya', sizeHa: 500, soil: 'loam', ph: 6.4, contamination: 'none', price: 7500000, x: 75, y: 64, unlockLevel: 43 },
  { id: 'ke4', name: 'Shamba Kiambu', regionId: 'kenya', sizeHa: 650, soil: 'clay', ph: 5.4, contamination: 'low', price: 8000000, x: 56, y: 75, unlockLevel: 45 },
  { id: 'ke5', name: 'Shamba Nakuru', regionId: 'kenya', sizeHa: 800, soil: 'loam', ph: 6.2, contamination: 'none', price: 12000000, x: 69, y: 77, unlockLevel: 48 },
  // ── 🌎 Amerika ──
  // Iowa (top right)
  { id: 'f9', name: 'Cedar Creek Farm', regionId: 'iowa', sizeHa: 15, soil: 'loam', ph: 6.6, contamination: 'none', price: 165000, x: 64, y: 11 },
  { id: 'f10', name: 'Ames North Field', regionId: 'iowa', sizeHa: 30, soil: 'silt', ph: 6.4, contamination: 'low', price: 225000, x: 76, y: 8 },
  { id: 'f11', name: 'Des Moines Bottoms', regionId: 'iowa', sizeHa: 45, soil: 'clay', ph: 7.0, contamination: 'none', price: 360000, x: 88, y: 13 },
  { id: 'f12', name: 'Story County Plains', regionId: 'iowa', sizeHa: 60, soil: 'loam', ph: 6.7, contamination: 'none', price: 705000, x: 72, y: 21 },
  // Mato Grosso (centre right; acid cerrado soils, Lv 12+)
  { id: 'mg1', name: 'Fazenda Cuiabá', regionId: 'matogrosso', sizeHa: 80, soil: 'loam', ph: 5.6, contamination: 'none', price: 640000, x: 52, y: 45 },
  { id: 'mg2', name: 'Fazenda Rondonópolis', regionId: 'matogrosso', sizeHa: 110, soil: 'clay', ph: 5.0, contamination: 'low', price: 800000, x: 64, y: 42 },
  { id: 'mg3', name: 'Fazenda Lucas', regionId: 'matogrosso', sizeHa: 150, soil: 'silt', ph: 5.4, contamination: 'none', price: 1200000, x: 76, y: 46, unlockLevel: 14 },
  { id: 'mg4', name: 'Fazenda Sinop', regionId: 'matogrosso', sizeHa: 200, soil: 'sand', ph: 5.2, contamination: 'medium', price: 1100000, x: 58, y: 56, unlockLevel: 16 },
  { id: 'mg5', name: 'Fazenda Sorriso', regionId: 'matogrosso', sizeHa: 300, soil: 'loam', ph: 5.8, contamination: 'none', price: 2900000, x: 71, y: 57, unlockLevel: 29 },
  // Alberta (top left; cold prairie, short season, Lv 43+)
  { id: 'al1', name: 'Red Deer Farm', regionId: 'alberta', sizeHa: 600, soil: 'loam', ph: 6.6, contamination: 'none', price: 5500000, x: 10, y: 9 },
  { id: 'al2', name: 'Lethbridge Prairie', regionId: 'alberta', sizeHa: 800, soil: 'clay', ph: 7.3, contamination: 'none', price: 6400000, x: 22, y: 6, unlockLevel: 44 },
  { id: 'al3', name: 'Peace River Muskeg', regionId: 'alberta', sizeHa: 1000, soil: 'sand', ph: 5.2, contamination: 'none', price: 6500000, x: 34, y: 10, unlockLevel: 46 },
  { id: 'al4', name: 'Camrose Section', regionId: 'alberta', sizeHa: 1300, soil: 'loam', ph: 6.8, contamination: 'none', price: 12000000, x: 16, y: 20, unlockLevel: 47 },
  { id: 'al5', name: 'Vulcan Plains', regionId: 'alberta', sizeHa: 1600, soil: 'silt', ph: 7.0, contamination: 'none', price: 14000000, x: 29, y: 21, unlockLevel: 48 },
  // Pampas (bottom left; southern-hemisphere seasons, Lv 34+)
  { id: 'pa1', name: 'Estancia Pergamino', regionId: 'pampas', sizeHa: 400, soil: 'loam', ph: 6.6, contamination: 'none', price: 5000000, x: 14, y: 72 },
  { id: 'pa2', name: 'Estancia Junín', regionId: 'pampas', sizeHa: 500, soil: 'silt', ph: 6.4, contamination: 'none', price: 5800000, x: 26, y: 69, unlockLevel: 35 },
  { id: 'pa3', name: 'Campo Venado Tuerto', regionId: 'pampas', sizeHa: 650, soil: 'loam', ph: 6.8, contamination: 'none', price: 8500000, x: 38, y: 73, unlockLevel: 39 },
  { id: 'pa4', name: 'Estancia Tandil', regionId: 'pampas', sizeHa: 800, soil: 'clay', ph: 7.0, contamination: 'low', price: 9000000, x: 20, y: 84, unlockLevel: 44 },
  { id: 'pa5', name: 'Campo Pehuajó', regionId: 'pampas', sizeHa: 1000, soil: 'sand', ph: 6.9, contamination: 'none', price: 10000000, x: 33, y: 86, unlockLevel: 47 },
];

export const STARTING = {
  money: 25000,
  fieldIds: ['f1'],
  machineIds: ['jd_5075', 'plow_s', 'seeder_s', 'fert_s'],
  harvesterRentPerHa: 120,
};

// LEVELS[i] = XP for level i + 1 (50 entries, max level 50). Lv 1–10 unchanged; 11–20 ×1.27 and 21–30 ×1.29 per
// level; 31–50 ×1.19 easing to ×1.127 (land income grows slower than exponential once regions run out). Greedy bot
// (plans, land/machine buying, daily missions; 3 seeds): Lv 20 ≈ day 425–445, Lv 30 ≈ day 800–855 (≈ 13–14 h at 1×),
// Lv 40 ≈ day 1325–1390, Lv 50 ≈ day 1985–2040 (Lv 30→50 ≈ 1180 days ≈ 20 h at 1×, 44 → 67 days per level).
export const LEVELS = [0, 250, 900, 2200, 4500, 8000, 13000, 20000, 30000, 45000,
  57000, 73000, 92000, 117000, 149000, 189000, 240000, 305000, 387000, 491000,
  634000, 817000, 1050000, 1360000, 1750000, 2260000, 2920000, 3770000, 4860000, 6270000,
  7460000, 8850000, 10500000, 12400000, 14500000, 17000000, 19900000, 23200000, 26900000, 31200000,
  36000000, 41500000, 47600000, 54500000, 62100000, 70700000, 80100000, 90500000, 102000000, 115000000];

// Stats used here (WP1 tracks them in state.stats): machineModels = distinct machine defIds owned;
// livestockOwned = head count of ANIMALS with `livestock: true`; salesValue = cumulative $ from sellProduct;
// contractsDone = completed contracts (incremented by engine/contracts.js).
// Rewards stay below the round-trip loss of buying + reselling to reach them (B6).
export const ACHIEVEMENTS = [
  { id: 'first_harvest', name: 'Panen Perdana', desc: 'Selesaikan panen pertamamu.', reward: 1000, condition: { stat: 'harvests', gte: 1 } },
  { id: 'harvest_25', name: 'Petani Rajin', desc: 'Selesaikan 25 kali panen.', reward: 10000, condition: { stat: 'harvests', gte: 25 } },
  { id: 'tons_100', name: 'Seratus Ton', desc: 'Panen total 100 ton hasil bumi.', reward: 5000, condition: { stat: 'tonsHarvested', gte: 100 } },
  { id: 'tons_1000', name: 'Lumbung Penuh', desc: 'Panen total 1.000 ton hasil bumi.', reward: 25000, condition: { stat: 'tonsHarvested', gte: 1000 } },
  { id: 'fields_3', name: 'Tuan Tanah', desc: 'Miliki 3 ladang.', reward: 5000, condition: { stat: 'fieldsOwned', gte: 3 } },
  { id: 'fields_10', name: 'Raja Lahan', desc: 'Miliki 10 ladang.', reward: 50000, condition: { stat: 'fieldsOwned', gte: 10 } },
  { id: 'machines_8', name: 'Kolektor Mesin', desc: 'Miliki 8 model mesin yang berbeda.', reward: 8000, condition: { stat: 'machineModels', gte: 8 } },
  { id: 'animals_20', name: 'Peternak Muda', desc: 'Miliki 20 ekor ternak besar (sapi, domba, babi, kambing).', reward: 3000, condition: { stat: 'livestockOwned', gte: 20 } },
  { id: 'sold_50', name: 'Pedagang Pasar', desc: 'Jual produk senilai 50.000 di pasar.', reward: 2000, condition: { stat: 'salesValue', gte: 50000 } },
  { id: 'contracts_5', name: 'Pemasok Andal', desc: 'Selesaikan 5 kontrak.', reward: 5000, condition: { stat: 'contractsDone', gte: 5 } },
  { id: 'contracts_25', name: 'Mitra Tepercaya', desc: 'Selesaikan 25 kontrak.', reward: 25000, condition: { stat: 'contractsDone', gte: 25 } },
  { id: 'earned_100k', name: 'Untung Besar', desc: 'Raih total pendapatan 100.000.', reward: 10000, condition: { stat: 'totalEarned', gte: 100000 } },
  { id: 'earned_1m', name: 'Jutawan Desa', desc: 'Raih total pendapatan 1.000.000.', reward: 100000, condition: { stat: 'totalEarned', gte: 1000000 } },
  { id: 'level_5', name: 'Manajer Andal', desc: 'Capai level 5.', reward: 20000, condition: { stat: 'level', gte: 5 } },
  { id: 'level_10', name: 'Legenda Pertanian', desc: 'Capai level 10.', reward: 150000, condition: { stat: 'level', gte: 10 } },
  { id: 'level_20', name: 'Maestro Agribisnis', desc: 'Capai level 20.', reward: 400000, condition: { stat: 'level', gte: 20 } },
  { id: 'level_30', name: 'Raja Agrikultur Dunia', desc: 'Capai level 30.', reward: 1500000, condition: { stat: 'level', gte: 30 } },
  { id: 'level_40', name: 'Kaisar Agribisnis', desc: 'Capai level 40.', reward: 4000000, condition: { stat: 'level', gte: 40 } },
  { id: 'level_50', name: 'Legenda Abadi', desc: 'Capai level 50 (maksimal).', reward: 10000000, condition: { stat: 'level', gte: 50 } },
  // Land round trips lose 30% of the price, far above these rewards.
  { id: 'regions_7', name: 'Penjelajah Benua', desc: 'Miliki ladang di 7 wilayah.', reward: 200000, condition: { stat: 'regionsOwned', gte: 7 } },
  { id: 'regions_13', name: 'Penguasa Dunia', desc: 'Miliki ladang di ke-13 wilayah.', reward: 1000000, condition: { stat: 'regionsOwned', gte: 13 } },
  { id: 'fields_25', name: 'Baron Tanah', desc: 'Miliki 25 ladang.', reward: 250000, condition: { stat: 'fieldsOwned', gte: 25 } },
  { id: 'fields_50', name: 'Taipan Tanah', desc: 'Miliki 50 ladang.', reward: 2000000, condition: { stat: 'fieldsOwned', gte: 50 } },
  { id: 'tons_25000', name: 'Lumbung Dunia', desc: 'Panen total 25.000 ton hasil bumi.', reward: 150000, condition: { stat: 'tonsHarvested', gte: 25000 } },
  { id: 'tons_250000', name: 'Lumbung Planet', desc: 'Panen total 250.000 ton hasil bumi.', reward: 1500000, condition: { stat: 'tonsHarvested', gte: 250000 } },
];

export const BALANCE = {
  realSecondsPerGameHour: 2.5,
  fuelPrice: 2.2,
  fertilizerCostPerHa: 200,
  irrigateCostPerHa: 60,
  yieldPhPenaltyPerUnit: 0.15,
  fertilizerBonus: 0.25,
  irrigationBonus: 0.15,
  dryPenalty: 0.2,
  contaminationPenalty: { none: 0, low: 0.1, medium: 0.25 },
  soilYield: { clay: 0.95, loam: 1.1, sand: 0.85, silt: 1.0 },
  xpPerTask: 20,
  xpPerHarvestValue: 0.01, // XP per $ of harvest (and daily animal production) at base price
  levelReward: 1000, // money paid on reaching level L: levelReward × L
  loanDailyRate: 0.005, // 0.5%/day ≈ 16%/month; land still returns more, but max borrowing is no longer free
  // F3 contracts. priceMax stays below BUY_MARKUP (1.2) so buying from the market to deliver never profits.
  contracts: { offers: 3, maxActive: 3, offerDays: 3, dueMin: 5, dueMax: 12, priceMin: 1.1, priceMax: 1.19,
    harvestsMin: 1, harvestsMax: 2, penaltyRate: 0.1, xpPerValue: 0.01 },
  // F5/F6 world sim (stream W). yearDays: one in-game year (4 temperate seasons / wet+dry in the tropics).
  limeCostPerHa: 90, pestTreatPerHa: 40, yearDays: 40,
  events: { chancePerDay: 0.25, weights: { pest: 3, storm: 2, heatwave: 2, boom: 2, crash: 2, subsidy: 1, perfect: 2 },
    pestYield: 0.75, subsidyPerHa: 60, subsidyMin: 800, perfectGrowth: 1.25 },
  // Storage (js/engine/storage.js): silo = tons of 't' products, cold = Gudang dingin for animal products (t, by weight).
  // Upgrade n+1 adds max(minStep, niceCeil(stepRate × capacity)) t (nice = 1/1.2/1.5/2/2.5/3/4/5/6/8 × 10^k) for
  // step × costPerT × costGrowth^n. What doesn't fit is force-sold at overflowRate × market. Sim (land bought with
  // ~30% of revenue, average crop mix fertilized): holding 1.5 harvest cycles costs ≈ 9–17% of the land's price;
  // the cold store starts at ≈ 17 days of one cow + one chicken barn; ≈ 2–3% of herd spend buys a week of output.
  storage: {
    silo: { start: 150, minStep: 200, stepRate: 0.5, costPerT: 15, costGrowth: 1.05, overflowRate: 0.7 },
    cold: { start: 10, minStep: 10, stepRate: 0.5, costPerT: 500, costGrowth: 1.05, overflowRate: 0.7 },
  },
  // workers: wage = wageBase + wagePerSkill·skill (± $10) per day; skill 1 = tasks 20% faster.
  workers: { candidates: 3, skillMin: 0.1, skillMax: 0.9, wageBase: 60, wagePerSkill: 140, starterSkill: 0.3, skillPerTask: 0.01 },
  // wear: condition −perHour per working hour; < slowBelow ⇒ ×1.25 hours; < breakdownBelow ⇒ breakdownChance of ×1.5.
  wear: { perHour: 0.002, slowBelow: 0.5, breakdownBelow: 0.2, breakdownChance: 0.05, breakdownFactor: 1.5, repairRate: 0.3 },
  // Breeding (js/engine/breeding.js). Every `days` qualifying days (fed, happiness > minHappiness, free barn room,
  // ≥ 2 head) a herd gets count·rate newborns (fraction carried over). Natural births ≈ 6% of net production value
  // (newborn sold at sellPrice); intensive mode: births ×4, feed ×1.5, production ×0.75 → selling newborns ≈ break-even,
  // but a calf/chick costs ≈ 60–80% of the buy price → worth it only to fill barns. Newborn genes = herd ± drift.
  // Studs (indukan unggul) tier k: target breedQuality 1 + k·step, cost price·capacity·costFactor·k, level ≥ unlock + k;
  // herd quality climbs perDay toward the target (scaled by stud coverage = capacity at purchase / head count).
  breeding: { minHappiness: 0.7, drift: 0.02, min: 0.5, max: 1.5, xpFactor: 0.5,
    intensive: { births: 4, feed: 1.5, production: 0.75 },
    stud: { maxTier: 5, step: 0.1, costFactor: 0.2, perDay: 0.01 },
    animals: { chickens: { days: 4, rate: 0.026 }, cows: { days: 12, rate: 0.048 }, sheep: { days: 10, rate: 0.046 },
      pigs: { days: 8, rate: 0.038 }, goats: { days: 10, rate: 0.037 }, bees: { days: 5, rate: 0.06 },
      ducks: { days: 4, rate: 0.024 }, buffalo: { days: 14, rate: 0.057 }, alpaca: { days: 14, rate: 0.053 } } },
  // Machine upgrades (js/engine/upgrades.js), per owned instance, levels 0–3 per track. Level L costs price·costs[L−1]
  // and needs player level ≥ unlockLevel + levelGap·(L−1). engine: tractor hp +15%/lvl, harvester ha/h +10%/lvl;
  // transmission: tractor speed / harvester & implement ha/h +10%/lvl; efficiency: fuel −10%/lvl (implements: transmission only).
  // Resale adds resale × upgrade spend (× condition).
  machineUpgrades: { costs: [0.15, 0.25, 0.4], levelGap: 2, resale: 0.5, engineHp: 0.15, engineHa: 0.1, transmission: 0.1,
    efficiency: 0.1, paints: ['#c0392b', '#27ae60', '#f1c40f', '#2980b9', '#e67e22', '#2c3e50'] },
  // Kebun buah (js/engine/orchard.js). Manual tasks (worker, no machine): plant/prune/clear at *HaPerHour.
  // Rented pickers: pickerRentPerHa at pickerHaPerHour (no worker, no fuel). Pruning: +pruneBonus yield this cycle.
  orchard: { plantHaPerHour: 1.5, pruneHaPerHour: 3, pruneCostPerHa: 70, pruneBonus: 0.15, clearHaPerHour: 2,
    clearCostPerHa: 150, pickerRentPerHa: 160, pickerHaPerHour: 0.75, oldAgeDecline: 1.4, minAgeFactor: 0.3 },
  // Rumah kaca (js/engine/greenhouse.js): costPerHa × ha to build (capex 'rumah_kaca'), upkeepPerHaDay × ha daily
  // (opex 'listrik_rumah_kaca'), fields ≤ maxHa only, not on orchards. Inside: growth ×1 (no season/minTemp), season
  // yield ≥ 1, no dry-day penalty, no storm damage, yield +yieldBonus. Removing refunds `refund` of the build cost.
  // Sim (vanilla/strawberry, ≤ 12 ha): greenhouse beats the same field outdoors after ≈ 40–60 days.
  greenhouse: { unlockLevel: 9, costPerHa: 18000, upkeepPerHaDay: 90, maxHa: 12, yieldBonus: 0.2, refund: 0.3 },
  // Truck deliveries (js/engine/logistics.js): trip hours = 2·km / speedKmh, fuel = 2·km·fuelPerKm·fuelPrice (booked
  // at departure), trucks wear wearPerHour on the road. Only 't' products fill the truck (capacity in t); kg/L/pcs
  // goods ride along without using capacity (like the silo). Crop city multipliers are capped at cropCap (< 1.2 buy markup).
  logistics: { wearPerHour: 0.0006, cropCap: 1.15 },
  // Manajer Logistik (js/engine/dispatcher.js): staff role, not a field worker. hireCost once + wage per day (both
  // ledger 'gaji'). skill = ★; trucks = most trucks it keeps on the road at once; radiusKm = farthest city it plans
  // for; bonus = negotiated extra city price on its own trips (crops still capped at cropCap). Sim (Lv 12, 3 trucks, 30 days): see README "Manajer Logistik".
  // tradeIn: replacing the manager costs the new hireCost − tradeIn × the current tier's hireCost (never below 0).
  dispatcher: {
    tradeIn: 0.5,
    tiers: [
      { id: 'magang', name: 'Dimas', title: 'Manajer Magang', emoji: '🧑‍💼', skill: 1, unlockLevel: 6, hireCost: 3000, wage: 150, trucks: 1, radiusKm: 100, bonus: 0 },
      { id: 'senior', name: 'Bu Ratna', title: 'Manajer Senior', emoji: '👩‍💼', skill: 2, unlockLevel: 9, hireCost: 12000, wage: 450, trucks: 3, radiusKm: 300, bonus: 0.02 },
      { id: 'direktur', name: 'Pak Hartono', title: 'Direktur Logistik', emoji: '👨‍💼', skill: 3, unlockLevel: 14, hireCost: 30000, wage: 900, trucks: 6, radiusKm: 1000, bonus: 0.04 },
    ],
  },
  // Manajer Pabrik (js/engine/factoryManager.js + factoryPlanner.js): staff role like the dispatcher (hire/replace/fire
  // via js/engine/staff.js, ledger 'gaji'). Unlocks Lv 11 (factories are buyable by then) / 15 / 25.
  // factories = most factories it runs (null = all); intervalHours = planning pass period; inputMult/outputMult scale
  // its batches; buyInputs = may buy missing crop inputs at market ×1.2 when still above the min margin.
  factoryManager: {
    tradeIn: 0.5,
    tiers: [
      { id: 'supervisor', name: 'Mbak Sari', title: 'Supervisor', emoji: '👩‍🔧', skill: 1, unlockLevel: 11, hireCost: 4000, wage: 100, factories: 2, intervalHours: 6, inputMult: 1, outputMult: 1, buyInputs: false },
      { id: 'kepala', name: 'Pak Joko', title: 'Kepala Produksi', emoji: '👷', skill: 2, unlockLevel: 15, hireCost: 14000, wage: 480, factories: 5, intervalHours: 2, inputMult: 0.95, outputMult: 1, buyInputs: false },
      { id: 'direktur', name: 'Bu Lestari', title: 'Direktur Pabrik', emoji: '👩‍🏭', skill: 3, unlockLevel: 25, hireCost: 32000, wage: 950, factories: null, intervalHours: 1, inputMult: 0.95, outputMult: 1.06, buyInputs: true },
    ],
  },
  // Research (js/engine/research.js): respec (reset all nodes, points back) costs respecPerLevel × level.
  research: { respecPerLevel: 1500 },
};
