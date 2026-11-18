// Farm Manager engine: thin Game facade over js/engine/* modules. Pure logic, no DOM.
import * as DEFAULT_DATA from './data.js';
import { hashSeed, round2 } from './engine/rng.js';
import { indexData } from './engine/defs.js';
import { rollWeather, applyWeatherToFields, weatherSummary, forecastView, fillForecast } from './engine/weather.js';
import * as seasons from './engine/seasons.js';
import * as worldEvents from './engine/events.js';
import { initMarket, stepMarket, marketView } from './engine/market.js';
import * as saturation from './engine/saturation.js'; // 📉 pasar jenuh
import { newFieldState, stepFieldsHour, getFieldView, expectedYield, cropFitView } from './engine/fields.js';
import { planTask, startTask, startTaskAll, availableMachinesFor } from './engine/tasks.js';
import { stepTasks } from './engine/taskrun.js';
import { setFieldPlan, runPlans } from './engine/plans.js';
import * as contracts from './engine/contracts.js';
import * as animals from './engine/animals.js';
import * as breeding from './engine/breeding.js';
import * as upgrades from './engine/upgrades.js';
import * as eco from './engine/economy.js';
import * as purchase from './engine/purchase.js';
import * as views from './engine/views.js';
import * as storage from './engine/storage.js';
import * as workers from './engine/workers.js';
import * as wear from './engine/wear.js';
import * as factories from './engine/factories.js';
import { factoriesView } from './engine/factoryView.js';
import * as missions from './engine/missions.js';
import * as rivals from './engine/rivals.js';
import * as chapters from './engine/chapters.js';
import { recentIncome } from './engine/rewards.js';
import * as ledger from './engine/ledger.js';
import * as orchard from './engine/orchard.js';
import * as greenhouse from './engine/greenhouse.js';
import * as logistics from './engine/logistics.js';
import * as logView from './engine/logisticsView.js';
import * as dispatcher from './engine/dispatcher.js';
import * as factoryManager from './engine/factoryManager.js';
import * as research from './engine/research.js';
import * as fish from './engine/fish.js';
import * as fishView from './engine/fishView.js';
import * as autoFeed from './engine/autoFeed.js';
import * as overflowLog from './engine/overflow.js';
import * as calendar from './engine/calendar.js';
import * as offline from './engine/offline.js';
import * as mandor from './engine/mandor.js';
import * as report from './engine/report.js';
import * as stockKeep from './engine/stockKeep.js';
import * as kabar from './engine/kabar.js'; // v17 📰 Kabar Desa + ⚠️ Bencana Besar
import * as projects from './engine/projects.js'; // v17 🏛️ Proyek Warisan
import { projectsView } from './engine/projectsView.js';
import * as quality from './engine/quality.js'; // v18 ⭐ Kualitas & Rekor
import * as encyclopedia from './engine/encyclopedia.js'; // v18 📖 Ensiklopedia Tani
import * as tenders from './engine/tenders.js'; // v18 🚢 Tender Ekspor
import * as legacyMod from './engine/legacy.js'; // v18 🌳 Generasi Baru (legacy block outside the run state)
import * as league from './engine/league.js'; // v18 🏆 Liga Musiman
import { SAVE_VERSION, MAX_CATCHUP_HOURS, HISTORY_SIZE, newStats, normalizeState, serializeState, parseSave,
  writeStorage, readStorage, liftXp, writeLegacy, readLegacy } from './engine/persist.js';

export const SPEEDS = [0, 1, 2, 5];
export const LOG_SIZE = 50;
const isFinancing = (category) => typeof category === 'string' && ledger.CATEGORY.get(category)?.group === 'financing';

export class Game {
  constructor(state, data = DEFAULT_DATA) {
    this.state = state;
    this.data = data;
    this.idx = indexData(data);
    this.listeners = new Set();
    this.legacy = legacyMod.newLegacy(); // 🌳 createGame / loadGame replace it with the saved block
  }

  // ---- events ----
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, msg, extra = {}) {
    const ev = { type, msg, day: this.day, hour: this.hour, ...extra };
    this.state.log.push({ type, msg, day: ev.day, hour: ev.hour });
    if (this.state.log.length > LOG_SIZE) this.state.log.splice(0, this.state.log.length - LOG_SIZE);
    if (this.tally) this.tally[type] = (this.tally[type] || 0) + 1; // catch-up report (catchUpReport)
    if (!type.startsWith('mission_')) missions.trackEvent(this, ev); // daily-mission progress (stream C)
    encyclopedia.trackEvent(this, ev); // v18 📖 stamp counters (harvests, batches, ponds, city trips)
    league.trackEvent(this, ev); // v18 🏆 harvested t/ha for the league yield metric
    if (this.muted) return ev; // coarse offline days: no toast flood; the morning report sums them up
    for (const fn of this.listeners) { try { fn(ev); } catch { /* listener errors never break the sim */ } }
    return ev;
  }

  // ---- money / xp (used by modules) ----
  // `category`: a ledger id (js/engine/ledger.js CATEGORIES) or a split map {id: part}. Financing ids
  // (loans) never count in stats.totalSpent/totalEarned; `{ stat: false }` books to the ledger only.
  spend(amount, category = 'lainnya', { stat = true } = {}) {
    if (amount > this.state.money + 1e-9) return false;
    this.state.money = round2(this.state.money - amount);
    if (stat && !isFinancing(category)) this.state.stats.totalSpent = round2(this.state.stats.totalSpent + amount);
    this.#book(category, amount, false);
    return true;
  }
  earn(amount, category = 'lainnya_masuk', { stat = true } = {}) {
    this.state.money = round2(this.state.money + amount);
    if (stat && !isFinancing(category)) this.state.stats.totalEarned = round2(this.state.stats.totalEarned + amount);
    this.#book(category, amount, true);
  }
  /** Pay `amount` even when broke: the shortfall is borrowed (loan + ledger 'pinjaman_masuk'). Returns the shortfall. */
  payOrBorrow(amount, category, opts) {
    const short = round2(amount - this.state.money);
    if (short > 0) {
      this.state.loan = round2(this.state.loan + short);
      this.earn(short, 'pinjaman_masuk');
    }
    this.spend(amount, category, opts);
    return Math.max(0, short);
  }
  #book(category, amount, income) {
    if (!category || typeof category !== 'object') { ledger.record(this.state, category, amount, income); return; }
    const parts = Object.entries(category).filter(([, v]) => v > 0);
    let left = amount;
    parts.forEach(([id, v], i) => {
      const part = i === parts.length - 1 ? round2(left) : Math.min(v, left);
      ledger.record(this.state, id, part, income);
      left -= part;
    });
    if (!parts.length) ledger.record(this.state, null, amount, income);
  }
  /** Income & expense report; `period`: 'today' | 'yesterday' | '7d' | '30d' | 'all'. */
  financeReport(period) { return ledger.financeReport(this.state, period); }
  addXp(n) { eco.addXp(this, n); }
  checkAchievements() { return eco.checkAchievements(this); }

  // ---- time ----
  get day() { return Math.floor(this.state.time / 24) + 1; }
  get hour() { return Math.floor(this.state.time % 24); }
  clock() { return { time: this.state.time, day: this.day, hour: this.hour, speed: this.state.speed }; }
  setSpeed(s) { if (!SPEEDS.includes(s)) return { ok: false, reason: 'Kecepatan tidak valid.' }; this.state.speed = s; return { ok: true }; }
  tick(realDeltaSeconds) {
    const h = (realDeltaSeconds / this.data.BALANCE.realSecondsPerGameHour) * this.state.speed;
    if (h > 0) this.advance(h);
    return h;
  }
  /**
   * Offline progress, 0 while paused. The first MAX_CATCHUP_HOURS (48) game hours are simulated exactly, the rest
   * (up to BALANCE.offline.maxRealHours = 8 real hours away in total) in coarse daily steps at 50% efficiency
   * ("mode hemat", js/engine/offline.js; listeners are muted there). Returns the game hours simulated;
   * `lastCatchUp` = {exactHours, coarseHours, coarseDays}.
   */
  catchUp(realSecondsElapsed) {
    this.lastCatchUp = { exactHours: 0, coarseHours: 0, coarseDays: 0 };
    if (!this.state.speed) return 0;
    const cfg = offline.offlineCfg(this);
    const total = Math.min(cfg.maxRealHours * 3600, Math.max(0, Number(realSecondsElapsed) || 0)) / this.data.BALANCE.realSecondsPerGameHour;
    const exact = Math.min(MAX_CATCHUP_HOURS, total), coarse = total - exact;
    if (exact > 0) this.advance(exact);
    let coarseDays = 0;
    if (coarse > 1e-9) {
      const was = this.muted;
      this.muted = true;
      try { coarseDays = offline.runCoarse(this, coarse, { rollover: (light) => this.#dailyRollover(light), advance: (h) => this.advance(h) }); }
      finally { this.muted = was; }
    }
    this.lastCatchUp = { exactHours: exact, coarseHours: coarse, coarseDays };
    return total;
  }
  /** catchUp plus a "Laporan Pagi" {hours, report} built from before/after snapshots (js/engine/report.js). */
  catchUpReport(realSecondsElapsed) {
    const before = report.snapshot(this);
    this.tally = {};
    let hours = 0;
    try { hours = this.catchUp(realSecondsElapsed); } finally { this.tallied = this.tally; this.tally = null; }
    return { hours, ...this.lastCatchUp, report: report.buildReport(this, before, this.tallied, this.lastCatchUp) };
  }
  advance(hours) {
    let left = hours;
    while (left > 1e-9) {
      const t = this.state.time;
      const nextHour = Math.floor(t + 1e-9) + 1;
      const step = Math.min(left, nextHour - t);
      const finished = stepTasks(this, step) + logistics.stepShipments(this, step); // field tasks + returning trucks
      this.state.time = Math.round((t + step) * 1e6) / 1e6;
      left -= step;
      if (Math.abs(this.state.time - nextHour) < 1e-6) {
        this.state.time = nextHour;
        stepFieldsHour(this);
        factories.stepFactoriesHour(this);
        if (nextHour % 24 === 0) this.#dailyRollover();
        factoryManager.runFactoryManager(this); // every tier.intervalHours; before the dispatcher (it holds the inputs)
        runPlans(this);
        tenders.runTenderAuto(this); // 🚢 idle trucks → export port (before the Manajer Logistik takes them)
        dispatcher.runDispatcher(this); // after plans: field work gets the free workers first
      } else if (finished) { runPlans(this); tenders.runTenderAuto(this); dispatcher.runDispatcher(this); }
    }
  }
  /** `light`: a coarse offline day (offline.js) that is not the last one — no daily missions or rival ranking. */
  #dailyRollover(light = false) {
    const day = this.day;
    worldEvents.stepEventsDay(this, day); // before weather: storms/heatwaves override it
    rollWeather(this, day);
    applyWeatherToFields(this);
    seasons.stepSeasonsDay(this, day);
    stepMarket(this, day);
    saturation.stepSaturationDay(this); // 📉 recent sales pressure fades (before today's production overflow)
    autoFeed.stepAutoFeedDay(this); // 🛒 Beli pakan otomatis: before the animals eat
    animals.stepAnimalsDay(this);
    fish.stepFishDay(this); // kolam ikan: pelet, kualitas air, panen otomatis
    eco.chargeInterest(this);
    greenhouse.stepGreenhouseDay(this); // rumah kaca upkeep (listrik_rumah_kaca)
    workers.stepWorkersDay(this);
    dispatcher.stepDispatcherDay(this); // Manajer Logistik wage ('gaji')
    factoryManager.stepFactoryManagerDay(this); // Manajer Pabrik wage ('gaji')
    mandor.stepMandorDay(this); // 👷 Mandor Ladang wage ('gaji')
    contracts.stepContractsDay(this);
    kabar.stepKabarDay(this, day); // 📰 after contracts: bonuses for finished contracts, disasters, dilemma deadline/new
    projects.stepProjectsDay(this); // 🏛️ finished builds
    tenders.stepTendersDay(this, day); // 🚢 v18: port loading, deadline, offers
    encyclopedia.stepEncyclopediaDay(this); // 📖 v18: herd peaks, stamps, cosmetics
    league.stepLeagueDay(this, day); // 🏆 v18: sample the ended day; season end/start at a new game year (also coarse days)
    legacyMod.stepLegacyDay(this); // 🌳 v18: challenge completed at Lv 30
    const h = this.state.history;
    h.push({ day: day - 1, money: this.state.money, netWorth: eco.netWorth(this) });
    if (h.length > HISTORY_SIZE) h.splice(0, h.length - HISTORY_SIZE);
    if (!light) {
      rivals.stepRivalsDay(this, day);
      missions.stepMissionsDay(this, day);
    }
    ledger.closeDay(this.state, day); // midnight costs (wages, interest, penalties) belong to the day that ended
    overflowLog.closeOverflowDay(this, day - 1); // one storage_overflow_summary per day (incl. midnight production)
    calendar.pruneBoosters(this);
    const rainy = this.data.REGIONS.filter((r) => this.state.weather[r.id]?.rain).map((r) => r.name);
    this.emit('weather', rainy.length ? `Hari ${day}: hujan di ${rainy.join(', ')}.` : `Hari ${day}: cerah di semua wilayah.`, { weather: this.state.weather });
  }

  // ---- tasks ----
  startTask(fieldId, task, opts) { return startTask(this, fieldId, task, opts); }
  /** `{ok, started:[{fieldId,hours,cost}], skipped:[{fieldId,reason}]}`; harvest with `rent` rents when no own harvester is free. */
  startTaskAll(task, opts) { return startTaskAll(this, task, opts); }
  estimateTask(fieldId, task, opts) {
    const p = planTask(this, fieldId, task, opts);
    return { ok: p.ok, reason: p.reason ?? null, hours: p.hours ?? 0, cost: p.cost ?? 0,
      fuelCost: p.fuelCost ?? 0, materialCost: p.materialCost ?? 0, rentCost: p.rentCost ?? 0, canRent: !!p.canRent,
      payOnCompletion: !!p.payOnCompletion, machineUids: p.machineUids ?? [], workerId: p.workerId ?? null,
      workerName: p.workerName ?? null };
  }
  /** Expected tons (no random roll) of `cropId` on a field; `assume` = {fertilized?, irrigated?}. */
  estimateYield(fieldId, cropId, assume) { return expectedYield(this, fieldId, cropId, assume); }
  availableMachinesFor(task) { return availableMachinesFor(this, task); }
  setFieldPlan(fieldId, plan) { return setFieldPlan(this, fieldId, plan); }
  clearFieldPlan(fieldId) { return setFieldPlan(this, fieldId, null); }

  // ---- economy ----
  buyField(id) { return eco.buyField(this, id); }
  sellField(id) { return eco.sellField(this, id); }
  buyMachine(defId) { return eco.buyMachine(this, defId); }
  sellMachine(uid) { return eco.sellMachine(this, uid); }
  repairMachine(uid) { return wear.repairMachine(this, uid); }
  /** `track`: 'engine' | 'transmission' | 'efficiency' → {ok, level, cost}; fails while busy, at max or below the level gate. */
  upgradeMachine(uid, track) { return upgrades.upgradeMachine(this, uid, track); }
  machineUpgradeInfo(uid) {
    const m = this.state.machines.find((x) => x.uid === uid);
    return m ? upgrades.machineUpgradeInfo(this, uid, round2(eco.machineResale(this, m))) : null;
  }
  /** Free cosmetic colour from BALANCE.machineUpgrades.paints (null = factory colour). */
  paintMachine(uid, color) { return upgrades.paintMachine(this, uid, color); }
  /** Global setting: auto-repair machines that finish a task below 30% condition (if affordable). */
  setAutoRepair(on) { this.state.autoRepair = !!on; return { ok: true, autoRepair: this.state.autoRepair }; }
  /** kind: 'silo' (t goods) | 'cold' (Gudang dingin, animal products). */
  storageInfo(kind) { return storage.storageInfo(this, kind); }
  upgradeStorage(kind) { return storage.upgradeStorage(this, kind); }
  workersView() { return workers.workersView(this); }
  workerCandidates() { return workers.candidatesView(this); }
  hireWorker(candidateId) { return workers.hireWorker(this, candidateId); }
  fireWorker(id) { return workers.fireWorker(this, id); }
  sellProduct(productId, qty) { return eco.sellProduct(this, productId, qty); }
  /** 📉 Price effect of selling `qty` now (`{steady:true}`: the same qty every day) → {dip, dipAfter, mult, price, value, recoverDays, today}. */
  saleQuote(productId, qty, opts) { return saturation.saleQuote(this, productId, qty, opts); }
  setFeedReserve(cropId, tons) { return eco.setFeedReserve(this, cropId, tons); }
  buyProduct(productId, qty) { return purchase.buyProduct(this, productId, qty); }
  buyFeed(animalId, days) { return purchase.buyFeed(this, animalId, days); }
  feedQuote(animalId, days) { return purchase.feedQuote(this, animalId, days); }
  takeLoan(amount) { return eco.takeLoan(this, amount); }
  repayLoan(amount) { return eco.repayLoan(this, amount); }
  buyAnimal(id, n) { return animals.buyAnimal(this, id, n); }
  sellAnimal(id, n) { return animals.sellAnimal(this, id, n); }
  buildBarn(id) { return animals.buildBarn(this, id); }
  /** Intensive breeding on/off: births ×4, feed ×1.5, production ×0.75 while it can breed. */
  setBreeding(id, on) { return breeding.setBreeding(this, animals.herdOf, id, on); }
  /** Next stud tier (indukan unggul) → {ok, tier, cost, target}; herd genetics climb toward the target daily. */
  buyBreedingStock(id) { return breeding.buyBreedingStock(this, animals.herdOf, id); }

  // ---- peternakan ikan (js/engine/fish.js, fishView.js) ----
  fishView() { return fishView.fishView(this); }
  buildPond(pondId) { return fish.buildPond(this, pondId); }
  /** Tebar benih into an empty pond; `n` defaults to full capacity. */
  stockPond(uid, n) { return fish.stockPond(this, uid, n); }
  changeWater(uid) { return fish.changeWater(this, uid); }
  buyAerator(uid) { return fish.buyAerator(this, uid); }
  /** `{water?, restock?}`: ganti air otomatis / tebar ulang setelah panen. */
  setPondAuto(uid, opts) { return fish.setPondAuto(this, uid, opts); }
  harvestPond(uid) { return fish.harvestPond(this, uid); }
  pelletQuote(days) { return fishView.pelletQuote(this, days); }
  buyPellet(days) { return fishView.buyPellet(this, days); }
  // ---- 🛒 Beli pakan otomatis (js/engine/autoFeed.js) ----
  /** {animals, fish, days, steps}: herds/ponds kept at ≥ `days` days of feed, bought daily at market ×1.2 (ledger 'pakan'). */
  autoFeedView() { return autoFeed.autoFeedView(this); }
  /** Partial patch {animals?, fish?, days?} → {ok, autoFeed}. */
  setAutoFeed(patch) { return autoFeed.setAutoFeed(this, patch); }
  // ---- Gudang penuh (js/engine/overflow.js) + kept stock (js/engine/stockKeep.js) ----
  /** Yesterday's / today's force-sold overflow per store with the next upgrade, or null. */
  overflowView() { return overflowLog.overflowView(this); }
  /** {productId: qty} kept from auto/bulk selling (feed, contracts, Manajer Pabrik hold). */
  keptStock() { return stockKeep.keptStock(this); }
  // ---- 📅 Kalender Panen + boosters (js/engine/calendar.js); `date` = local 'YYYY-MM-DD', `nowMs` = Date.now() ----
  calendarView(date, nowMs) { return calendar.calendarView(this, date, nowMs); }
  claimCalendar(date, nowMs) { return calendar.claimCalendar(this, date, nowMs); }
  activeBoosters() { return calendar.activeBoosters(this); }

  // ---- contracts (js/engine/contracts.js) ----
  contractsView() { return contracts.contractsView(this); }
  acceptContract(id) { return contracts.acceptContract(this, id); }
  deliverContract(id, qty) { return contracts.deliverContract(this, id, qty); }

  // ---- factories (js/engine/factories.js) ----
  factoriesView() { return factoriesView(this); }
  buyFactory(id) { return factories.buyFactory(this, id); }
  upgradeFactory(id) { return factories.upgradeFactory(this, id); }
  setRecipe(id, recipeId) { return factories.setRecipe(this, id, recipeId); }
  startBatch(id, count) { return factories.startBatch(this, id, count); }
  setFactoryAuto(id, on) { return factories.setFactoryAuto(this, id, on); }

  // ---- views ----
  getFieldView(id) { return getFieldView(this, id); }
  fieldsView() { return this.data.FIELDS.map((f) => getFieldView(this, f.id)); }
  marketView() { return marketView(this); }
  animalsView() { return animals.animalsView(this); }
  weatherView() { return weatherSummary(this); }
  // ---- world: seasons, forecast, events (F5) ----
  seasonOf(regionId) { return this.idx.regions.has(regionId) ? seasons.seasonOf(this, regionId) : null; }
  forecast(regionId) { return forecastView(this, regionId); }
  cropFit(regionId, cropId) { return cropFitView(this, regionId, cropId); }
  activeEvents() { return worldEvents.activeEventsView(this); }
  treatPest(fieldId) { return worldEvents.treatPest(this, fieldId); }
  treatPestCost(fieldId) { return worldEvents.treatPestCost(this, fieldId); }
  /** Stock items; `kept`/`bulk` = stock "Jual semua" keeps / sells (stockKeep.js). */
  siloView() { return stockKeep.withBulk(this, views.siloView(this)); }
  machinesView() { return views.machinesView(this); }
  shopView() { return views.shopView(this); }
  levelInfo() { return views.levelInfo(this); }
  loanInfo() { return { ...views.loanInfo(this), dailyRate: eco.loanRate(this) }; }
  netWorth() { return eco.netWorth(this); }
  achievementsView() { return views.achievementsView(this); }
  // ---- daily missions + rivals (stream C) ----
  missionsView() { return missions.missionsView(this); }
  claimMission(id) { return missions.claimMission(this, id); }
  leaderboard() { return rivals.leaderboard(this); }
  // ---- Bab Petani chapter chain (js/engine/chapters.js) ----
  chaptersView() { return chapters.chaptersView(this); }
  /** Claim the current step once its goal is met → {ok, stepId, money, xp, rp}. */
  claimChapterStep(stepId) { return chapters.claimChapterStep(this, stepId); }
  /** Steps an old save completed silently on load (once; 0 afterwards). */
  takeChapterNotice() { return chapters.takeChapterNotice(this); }
  /** Average daily production income of the last 3 closed game days (rewards.js, Hadiah Berskala). */
  recentIncome() { return recentIncome(this); }
  // ---- kebun buah + rumah kaca (js/engine/orchard.js, greenhouse.js) ----
  /** Planting outlook for a tree on a field: tons/harvest, harvestsPerYear, yearly revenue/cost/profit, paybackDays… */
  orchardOutlook(fieldId, treeId) { return orchard.orchardOutlook(this, fieldId, treeId); }
  greenhouseQuote(fieldId) { return greenhouse.greenhouseQuote(this, fieldId); }
  buildGreenhouse(fieldId) { return greenhouse.buildGreenhouse(this, fieldId); }
  removeGreenhouse(fieldId) { return greenhouse.removeGreenhouse(this, fieldId); }
  // ---- logistics: trucks deliver to cities (js/engine/logistics.js) ----
  citiesView() { return logView.citiesView(this); }
  cityPrices(productId) { return logView.cityPrices(this, productId); }
  trucksView() { return logView.trucksView(this); }
  shipmentsView() { return logView.shipmentsView(this); }
  /** Full trip estimate (numbers filled even when `ok` is false): hours, fuelCost, value, localValue, gain, profit… */
  estimateShipment(truckUid, cityId, cargo) { return logistics.planShipment(this, truckUid, cityId, cargo); }
  shipToCity(truckUid, cityId, cargo) { return logistics.shipToCity(this, truckUid, cityId, cargo); }
  // ---- Manajer Logistik: automatic deliveries (js/engine/dispatcher.js) ----
  dispatcherView() { return dispatcher.dispatcherView(this); }
  /** Products the manager loaded in the last 48 game hours (Gudang / Pasar › Jual "🚚 Dikirim Manajer Logistik"). */
  autoShippedView(opts) { return dispatcher.autoShippedView(this, opts); }
  /** Hire a tier from BALANCE.dispatcher.tiers → {ok, cost}; hire cost and the daily wage book to 'gaji'. */
  hireDispatcher(tierId) { return dispatcher.hireDispatcher(this, tierId); }
  /** Switch the hired manager to another tier → {ok, cost, credit, from, to}; cost = hireCost − tradeIn × current hireCost. */
  replaceDispatcher(tierId) { return dispatcher.replaceDispatcher(this, tierId); }
  fireDispatcher() { return dispatcher.fireDispatcher(this); }
  setDispatcherOn(on) { return dispatcher.setDispatcherOn(this, on); }
  /** Partial settings patch (groups, exclude, keepPct, minProfit, minMargin, blockedCities, reserveWorkers, maxTrucks). */
  setDispatcherSettings(patch) { return dispatcher.setDispatcherSettings(this, patch); }
  /** One planning pass now (also runs every game hour) → trips sent. */
  runDispatcher() { return dispatcher.runDispatcher(this); }
  // ---- Manajer Pabrik: automatic factory runs (js/engine/factoryManager.js + factoryPlanner.js) ----
  factoryManagerView() { return factoryManager.factoryManagerView(this); }
  /** Hire a tier from BALANCE.factoryManager.tiers → {ok, cost}; hire cost and the daily wage book to 'gaji'. */
  hireFactoryManager(tierId) { return factoryManager.hireFactoryManager(this, tierId); }
  /** Switch tier → {ok, cost, credit, from, to}; cost = max(0, hireCost − tradeIn × current hireCost). */
  replaceFactoryManager(tierId) { return factoryManager.replaceFactoryManager(this, tierId); }
  fireFactoryManager() { return factoryManager.fireFactoryManager(this); }
  setFactoryManagerOn(on) { return factoryManager.setFactoryManagerOn(this, on); }
  /** Partial settings patch (factories, reservePct, minMargin, buyInputs, headroom, contracts). */
  setFactoryManagerSettings(patch) { return factoryManager.setFactoryManagerSettings(this, patch); }
  /** One planning pass now (also runs every tier.intervalHours) → runs queued. */
  runFactoryManager() { return factoryManager.runFactoryManager(this, { force: true }); }
  // ---- 👷 Mandor Ladang: field plans past BALANCE.mandor.freeFields (js/engine/mandor.js) ----
  mandorView() { return mandor.mandorView(this); }
  /** Hire a tier from BALANCE.mandor.tiers → {ok, cost}; hire cost and the daily wage book to 'gaji'. */
  hireMandor(tierId) { return mandor.hireMandor(this, tierId); }
  /** Switch tier → {ok, cost, credit, from, to}; cost = max(0, hireCost − tradeIn × current hireCost). */
  replaceMandor(tierId) { return mandor.replaceMandor(this, tierId); }
  fireMandor() { return mandor.fireMandor(this); }
  /** 📌 Prioritise a planned field for the Mandor cap (`on` false drops the pin) → {ok, pins, paused}. */
  pinMandorField(fieldId, on) { return mandor.pinMandorField(this, fieldId, on); }
  /** Old save grandfathered with a free Mandor: true once (one toast). */
  takeMandorNotice() { return mandor.takeMandorNotice(this); }
  // ---- research tree (js/engine/research.js) ----
  researchView() { return research.researchView(this); }
  /** {earned, spent, available}: cheap points summary (topbar/badges). */
  researchPoints() { return research.researchPoints(this); }
  unlockResearch(nodeId) { return research.unlockResearch(this, nodeId); }
  respecResearch() { return research.respecResearch(this); }
  perk(key) { return research.perk(this, key); }
  // ---- v17 📰 Kabar Desa (js/engine/kabar*.js) + 🏛️ Proyek Warisan (js/engine/projects*.js) ----
  /** {unlocked, open, disaster, history, rep, share, stats, scale}: open dilemma, disaster forecast, last 10 decisions. */
  kabarView() { return kabar.kabarView(this); }
  /** Decide the open dilemma → {ok, id, option, outcome:{text, good}}. */
  chooseDilemma(optionId) { return kabar.chooseDilemma(this, optionId); }
  /** Preparation for a forecast Bencana Besar (paid now) → {ok, id, option}. */
  prepareDisaster(optionId) { return kabar.prepareDisaster(this, optionId); }
  projectsView() { return projectsView(this); }
  /** Build the next stage of a regional project → {ok, stage, cost, days}. */
  startProject(regionId, typeId) { return projects.startProject(this, regionId, typeId); }
  startMonument(continentId) { return projects.startMonument(this, continentId); }
  /** Project effect hook (like perk): 'rainFloor'|'damStage'|'koperasi' (regionId), 'cityPrice'|'portStage' (continentId), 'wages', 'contractBonus'. */
  projectPerk(key, scope) { return projects.projectPerk(this, key, scope); }
  // ---- v18 ⭐ Kualitas & Rekor · 📖 Ensiklopedia Tani · 🚢 Tender Ekspor ----
  /** 📒 Buku Rekor: every crop/tree with best t/ha, best grade (field, day), harvests; harvested first. */
  recordsView() { return quality.recordsView(this); }
  /** Grade a crop on a field would get now → {score, grade, label, mult, parts}. */
  qualityPreview(fieldId, cropId) { return quality.scoreHarvest(this, fieldId, cropId ?? this.state.fields[fieldId]?.cropId); }
  /** Stock grade of a crop product ({id, label, mult}) or null for non-crops. */
  stockGrade(productId) { return quality.stockGrade(this, productId); }
  encyclopediaView() { return encyclopedia.encyclopediaView(this); }
  /** `kind` 'banner' | 'barn', `id` an unlocked cosmetic (null = none) → {ok, [kind]}. */
  setCosmetic(kind, id) { return encyclopedia.setCosmetic(this, kind, id); }
  /** Active banner / barn cosmetic def, or null. */
  activeCosmetic(kind) { return encyclopedia.activeCosmetic(this, kind); }
  tenderView() { return tenders.tenderView(this); }
  acceptTender() { return tenders.acceptTender(this); }
  declineTender() { return tenders.declineTender(this); }
  /** Send every idle truck (keeping reserve workers) to the export port → {ok, trips, tons}. */
  shipTender() { return tenders.shipTender(this); }
  setTenderAuto(on) { return tenders.setTenderAuto(this, on); }
  // ---- v18 🌳 Generasi Baru (js/engine/legacy.js) + 🏆 Liga Musiman (js/engine/league.js) ----
  /** Stars, perk tree, star preview, challenge, museum, emblem for the 🌳 Warisan sub-tab. */
  legacyView() { return legacyMod.legacyView(this); }
  /** ⭐ inheritFarm would grant now: {parts, raw, mult, total, challenge, canInherit, reason}. */
  legacyPreview() { return legacyMod.legacyPreview(this); }
  /** Spend stars → {ok, perkId, stars, applied}; start effects are also given at once for this run. */
  buyLegacyPerk(id) { return legacyMod.buyLegacyPerk(this, id); }
  /** Cosmetic emblem {icon?, color?} (needs Lambang Keluarga). */
  setEmblem(emblem) { return legacyMod.setEmblem(this, emblem); }
  /** Give up this generation's challenge (rules off, no star multiplier). */
  forfeitChallenge() { return legacyMod.forfeitChallenge(this); }
  /**
   * "Wariskan pertanian" (Lv ≥ 30): {ok, stars, entry, game} where `game` is the fresh Lv 1 run carrying the new legacy
   * block. This game is left untouched (the caller switches to the new one and saves). `opts` = {challengeId, regionId,
   * buy: [perkId], emblem, seed}.
   */
  inheritFarm(opts = {}) {
    const plan = legacyMod.planInheritance(this, opts);
    if (!plan.ok) return plan;
    const seed = opts.seed ?? hashSeed(`${this.state.seed}|gen|${plan.legacy.generation}`);
    const next = createGame({ seed, data: this.data, legacy: plan.legacy, challenge: plan.challenge });
    // v18 collections stay with the family (hall of fame): 📖 encyclopedia, ⭐ harvest records, 🚢 tender trophies/done.
    const copy = (v) => JSON.parse(JSON.stringify(v ?? null));
    const s = this.state, n = next.state;
    if (s.encyclopedia) n.encyclopedia = copy(s.encyclopedia);
    if (s.quality?.records) n.quality.records = copy(s.quality.records);
    if (s.tenders) Object.assign(n.tenders, { trophies: copy(s.tenders.trophies) ?? {}, done: s.tenders.done || 0 });
    quality.ensureQuality(n, next.idx);
    encyclopedia.ensureEncyclopedia(n, this.data, next.idx);
    tenders.ensureTenders(n);
    next.emit('generation_start', `🌳 Generasi ${plan.legacy.generation} dimulai dengan ${plan.legacy.stars} ⭐ Bintang Warisan.`, { generation: plan.legacy.generation, stars: plan.stars });
    return { ok: true, stars: plan.stars, entry: plan.entry, game: next };
  }
  /** Division, season (metric, countdown), live standings, rewards, history and the trophy shelf. */
  leagueView() { return league.leagueView(this); }
  /** Season results not shown yet (end-of-season modal); returns and clears them. */
  takeLeagueResults() { return league.takeLeagueResults(this); }

  // ---- persistence ----
  serialize() { liftXp(this.state, this.data.LEVELS || []); return serializeState(this.state, this.legacy); }
  /** Writes the save and mirrors the 🌳 legacy block to its own key (survives ⚙️ Reset game). */
  save(storage) { writeStorage(storage, this.serialize()); writeLegacy(storage, this.legacy); return { ok: true }; }
}

/**
 * New run. `legacy` (🌳 block from a save / inheritance / the mirrored key) keeps stars, perks and museum and applies the
 * perks' start effects; `challenge` = this generation's challenge id (inheritFarm). Without them: a plain new game.
 */
export function createGame({ seed, data = DEFAULT_DATA, legacy = null, challenge = null } = {}) {
  const S = data.STARTING;
  const state = {
    version: SAVE_VERSION, seed: seed ?? Date.now(), rng: hashSeed(seed ?? Date.now()),
    time: 6, speed: 1, money: S.money, xp: 0, level: 1, loan: 0, nextUid: 1,
    fields: {}, machines: [], silo: {}, animals: {}, weather: {}, market: {}, priceHistory: {},
    stats: { ...newStats(), level: 1 },
    achievements: [], log: [], history: [], contracts: [], feedReserve: {}, forecast: {}, events: [], nextEventId: 1,
    storageUpgrades: { silo: 0, cold: 0 }, workers: [], autoRepair: false, factories: {}, ledger: ledger.newLedger(1),
    shipments: [], nextTripId: 1, research: { unlocked: [], respecs: 0 }, ponds: [], nextPondUid: 1,
  };
  const game = new Game(state, data);
  game.legacy = legacyMod.normalizeLegacy(legacy, data);
  for (const id of S.fieldIds) state.fields[id] = newFieldState(game.idx.fields.get(id));
  for (const id of S.machineIds) eco.addMachine(game, id);
  legacyMod.applyLegacyStart(game, { challenge }); // 🌳 state.generation + start perks (money, RP, silo, region, paint)
  rollWeather(game, 1);
  initMarket(game);
  workers.ensureWorkers(game);
  dispatcher.ensureDispatcher(game);
  factoryManager.ensureFactoryManager(game);
  mandor.ensureMandor(game);
  eco.syncCounts(game);
  autoFeed.ensureAutoFeed(state); // v16 state (also migrated by persist.normalizeState)
  overflowLog.ensureOverflow(state);
  calendar.ensureCalendar(state);
  missions.ensureMissions(game);
  rivals.ensureRivals(game);
  chapters.ensureChapters(game);
  kabar.ensureKabar(state); // v17 (also migrated by persist.normalizeState)
  projects.ensureProjects(state, data);
  quality.ensureQuality(state); // v18 (also migrated by persist.normalizeState)
  encyclopedia.ensureEncyclopedia(state, data); // no idx: a new game starts with an empty book (no back-fill)
  tenders.ensureTenders(state);
  league.ensureLeague(state, data); // 🏆 v18 (the first season starts lazily: a warm-up below the unlock level)
  return game;
}

/** `legacy`: fallback 🌳 block for a save without one (loadFrom passes the mirrored key). */
export function loadGame(json, { data = DEFAULT_DATA, legacy = null } = {}) {
  const { legacy: saved, ...state } = parseSave(json); // the legacy block lives outside the run state
  const game = new Game(state, data);
  game.legacy = legacyMod.normalizeLegacy(saved ?? legacy, data);
  normalizeState(game.state, data, game.idx);
  fillForecast(game, game.day); // pre-F5 saves have no forecast yet
  eco.syncCounts(game);
  workers.ensureWorkers(game);
  logistics.ensureLogistics(game); // after ensureWorkers: re-marks trucks/drivers on the road
  dispatcher.ensureDispatcher(game); // old saves: no manager hired
  factoryManager.ensureFactoryManager(game); // old saves: no factory manager hired
  mandor.ensureMandor(game); // old saves: migrated (and grandfathered) by normalizeState
  research.ensureResearch(game);
  missions.ensureMissions(game); // pre-missions saves: today's missions + rival ranks
  rivals.ensureRivals(game);
  chapters.ensureChapters(game); // pre-v16 saves: already-met chapter steps complete silently (one notice)
  return game;
}

/** Returns a Game or null if nothing saved. Throws on corrupt save. */
export function loadFrom(storage, opts) {
  const json = readStorage(storage);
  return json ? loadGame(json, { ...opts, legacy: opts?.legacy ?? readLegacy(storage) }) : null;
}

/** 🌳 The mirrored legacy block (normalized; a fresh one when missing): new games after ⚙️ Reset or a corrupt save. */
export function loadLegacy(storage, { data = DEFAULT_DATA } = {}) {
  return legacyMod.normalizeLegacy(readLegacy(storage), data);
}
