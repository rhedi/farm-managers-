# Cross-package decisions (binding)

Source: docs/AUDIT.md §5. These decisions apply to all four packages (WP1–WP4).

## Scope
- Out of scope for this round: F5 (seasons/forecast), F6 (soil), F8 (silo capacity), F9 (workers), F10 (machine wear).

## Data keys (WP3 owns js/data.js; the engine reads them with fallbacks)
- XP is based on value. WP3 adds `BALANCE.xpPerHarvestValue` (≈ 0.01 XP per $ at base price) and removes `xpPerHarvestTon`.
  - Harvest XP: `(BALANCE.xpPerHarvestValue ?? 0.01) × tons × product.basePrice`, computed in taskrun.
  - Animal XP: the same factor × the value of each day's production at base price, awarded in the daily rollover.
- WP3 adds `BALANCE.loanDailyRate`. economy.js reads `BALANCE.loanDailyRate ?? 0.002`.
- WP3 sets `STARTING.harvesterRentPerHa` to about 120. The engine just reads the data.

## Contracts (F3)
- WP3 writes `js/engine/contracts.js`. It exports `stepContractsDay(game)`, `contractsView(game)`, `acceptContract(game, id)` and `deliverContract(game, id, qty)`, all using `state.contracts`.
- WP1 initializes and normalizes `state.contracts` (default `[]`), wires the facade (`game.contractsView()`, `acceptContract(id)`, `deliverContract(id, qty?)`) and calls `stepContractsDay` in the daily rollover.
- Until WP3 lands, WP1 ships a stub module with the same exports. WP3 overwrites it.

## Harvest payment (B2)
- Harvest costs nothing at start. Fuel and rent are charged when the harvest completes.
- If money is short, enough of the harvest is auto-sold at market price to cover the cost, and the event message says so.
- A ready field can always be harvested.

## Save migration (B10)
- `normalizeState` runs on every load. It fills in `contracts`, `feedReserve`, `history`, `field.plan`, missing `stats` keys, `market`/`priceHistory` entries, and herds. It drops machines and fields whose data definitions no longer exist.

## Shared engine contract (verbatim from AUDIT §5)
- `game.catchUp(sec)` returns 0 when `state.speed === 0`.
- `game.startTaskAll(task, opts)` returns `{ok, started:[{fieldId,hours,cost}], skipped:[{fieldId,reason}]}`.
- `game.setFieldPlan(fieldId, {cropId, fertilize, irrigate, rent, repeat} | null)` returns `{ok}`.
  - The field view gains `plan`, `plan.blocked` (an Indonesian reason), `nextStep`, and `yieldFactors:{soil,ph,fert,irrig,contamination,weather,wither}`.
  - `actions` only lists tasks the player can run, meaning they own the implement; harvest is always possible through renting.
  - `sell` is absent on the last field.
- The `level_up` event carries `unlocks:{crops:[ids],machines:[ids],animals:[ids]}`.
- `state.history:[{day,money,netWorth}]` (≤120 entries) and `game.netWorth()`.
- `state.feedReserve:{cropId:t}` and `game.setFeedReserve(cropId, t)`. `sellProduct` respects the reserve; animals still eat reserved stock. Animals eat the cheapest crop first.
- Plans run every game hour and after each completed task.

## Achievements
- WP3 sends new achievement stat keys to the director, who relays them to WP1. WP1 tracks them in `state.stats`.

## CSS / files
- WP2 → `css/fields.css`. WP3 → `css/economy.css`. WP4 owns `css/style.css` and the `<link>` tags in `index.html`.
- UI packages call new engine APIs with optional chaining (`game.startTaskAll?.(…)`, `f.yieldFactors?.ph`), so the UI keeps working before WP1 lands.

## New stats keys (requested by WP3, tracked by WP1; normalizeState defaults each to 0)
- `machineModels`: the number of distinct owned machine defIds. Recomputed in `syncCounts`. Used by the `machines_8` achievement.
- `livestockOwned`: the total herd count over animals whose definition has `livestock: true`. Recomputed wherever `animalsOwned` is.
- `salesValue`: cumulative $ received from `sellProduct`, including B2 auto-sales.
- `contractsDone`: incremented by contracts.js (WP3). WP1 only sets the default.
- These stay on the facade for contracts.js: `game.earn`, `game.emit`, `game.checkAchievements`, `game.addXp`.
