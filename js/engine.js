// Farm Manager engine: thin Game facade over js/engine/* modules. Pure logic, no DOM.
import * as DEFAULT_DATA from './data.js';
import { hashSeed, round2 } from './engine/rng.js';
import { indexData } from './engine/defs.js';
import { rollWeather, applyWeatherToFields, weatherSummary, forecastView, fillForecast } from './engine/weather.js';
import * as seasons from './engine/seasons.js';
import * as worldEvents from './engine/events.js';
import { initMarket, stepMarket, marketView } from './engine/market.js';
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
import * as silo from './engine/silo.js';
import * as workers from './engine/workers.js';
import * as wear from './engine/wear.js';
import * as factories from './engine/factories.js';
import { factoriesView } from './engine/factoryView.js';
import * as missions from './engine/missions.js';
import * as rivals from './engine/rivals.js';
import * as ledger from './engine/ledger.js';
import * as orchard from './engine/orchard.js';
import * as greenhouse from './engine/greenhouse.js';
import * as logistics from './engine/logistics.js';
import * as logView from './engine/logisticsView.js';
import * as research from './engine/research.js';
import { SAVE_VERSION, MAX_CATCHUP_HOURS, HISTORY_SIZE, newStats, normalizeState, serializeState, parseSave,
  writeStorage, readStorage } from './engine/persist.js';

export const SPEEDS = [0, 1, 2, 5];
export const LOG_SIZE = 50;
const isFinancing = (category) => typeof category === 'string' && ledger.CATEGORY.get(category)?.group === 'financing';

export class Game {
  constructor(state, data = DEFAULT_DATA) {
    this.state = state;
    this.data = data;
    this.idx = indexData(data);
    this.listeners = new Set();
  }

  // ---- events ----
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, msg, extra = {}) {
    const ev = { type, msg, day: this.day, hour: this.hour, ...extra };
    this.state.log.push({ type, msg, day: ev.day, hour: ev.hour });
    if (this.state.log.length > LOG_SIZE) this.state.log.splice(0, this.state.log.length - LOG_SIZE);
    if (!type.startsWith('mission_')) missions.trackEvent(this, ev); // daily-mission progress (stream C)
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
  /** Offline progress (max 48 game hours at 1×). Returns 0 while paused. */
  catchUp(realSecondsElapsed) {
    if (!this.state.speed) return 0;
    const h = Math.min(MAX_CATCHUP_HOURS, Math.max(0, realSecondsElapsed / this.data.BALANCE.realSecondsPerGameHour));
    if (h > 0) this.advance(h);
    return h;
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
        runPlans(this);
      } else if (finished) runPlans(this);
    }
  }
  #dailyRollover() {
    const day = this.day;
    worldEvents.stepEventsDay(this, day); // before weather: storms/heatwaves override it
    rollWeather(this, day);
    applyWeatherToFields(this);
    seasons.stepSeasonsDay(this, day);
    stepMarket(this, day);
    animals.stepAnimalsDay(this);
    eco.chargeInterest(this);
    greenhouse.stepGreenhouseDay(this); // rumah kaca upkeep (listrik_rumah_kaca)
    workers.stepWorkersDay(this);
    contracts.stepContractsDay(this);
    const h = this.state.history;
    h.push({ day: day - 1, money: this.state.money, netWorth: eco.netWorth(this) });
    if (h.length > HISTORY_SIZE) h.splice(0, h.length - HISTORY_SIZE);
    rivals.stepRivalsDay(this, day);
    missions.stepMissionsDay(this, day);
    ledger.closeDay(this.state, day); // midnight costs (wages, interest, penalties) belong to the day that ended
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
  siloInfo() { return silo.siloInfo(this); }
  upgradeSilo() { return silo.upgradeSilo(this); }
  workersView() { return workers.workersView(this); }
  workerCandidates() { return workers.candidatesView(this); }
  hireWorker(candidateId) { return workers.hireWorker(this, candidateId); }
  fireWorker(id) { return workers.fireWorker(this, id); }
  sellProduct(productId, qty) { return eco.sellProduct(this, productId, qty); }
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
  siloView() { return views.siloView(this); }
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
  // ---- research tree (js/engine/research.js) ----
  researchView() { return research.researchView(this); }
  /** {earned, spent, available}: cheap points summary (topbar/badges). */
  researchPoints() { return research.researchPoints(this); }
  unlockResearch(nodeId) { return research.unlockResearch(this, nodeId); }
  respecResearch() { return research.respecResearch(this); }
  perk(key) { return research.perk(this, key); }

  // ---- persistence ----
  serialize() { return serializeState(this.state); }
  save(storage) { writeStorage(storage, this.serialize()); return { ok: true }; }
}

export function createGame({ seed, data = DEFAULT_DATA } = {}) {
  const S = data.STARTING;
  const state = {
    version: SAVE_VERSION, seed: seed ?? Date.now(), rng: hashSeed(seed ?? Date.now()),
    time: 6, speed: 1, money: S.money, xp: 0, level: 1, loan: 0, nextUid: 1,
    fields: {}, machines: [], silo: {}, animals: {}, weather: {}, market: {}, priceHistory: {},
    stats: { ...newStats(), level: 1 },
    achievements: [], log: [], history: [], contracts: [], feedReserve: {}, forecast: {}, events: [], nextEventId: 1,
    siloCapacity: silo.siloStart({ data }), workers: [], autoRepair: false, factories: {}, ledger: ledger.newLedger(1),
    shipments: [], nextTripId: 1, research: { unlocked: [], respecs: 0 },
  };
  const game = new Game(state, data);
  for (const id of S.fieldIds) state.fields[id] = newFieldState(game.idx.fields.get(id));
  for (const id of S.machineIds) eco.addMachine(game, id);
  rollWeather(game, 1);
  initMarket(game);
  workers.ensureWorkers(game);
  eco.syncCounts(game);
  missions.ensureMissions(game);
  rivals.ensureRivals(game);
  return game;
}

export function loadGame(json, { data = DEFAULT_DATA } = {}) {
  const game = new Game(parseSave(json), data);
  normalizeState(game.state, data, game.idx);
  fillForecast(game, game.day); // pre-F5 saves have no forecast yet
  eco.syncCounts(game);
  workers.ensureWorkers(game);
  logistics.ensureLogistics(game); // after ensureWorkers: re-marks trucks/drivers on the road
  research.ensureResearch(game);
  missions.ensureMissions(game); // pre-missions saves: today's missions + rival ranks
  rivals.ensureRivals(game);
  return game;
}

/** Returns a Game or null if nothing saved. Throws on corrupt save. */
export function loadFrom(storage, opts) {
  const json = readStorage(storage);
  return json ? loadGame(json, opts) : null;
}
