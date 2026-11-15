// Prestasi › 💰 Keuangan → 🏦 Pinjaman: loan status, interest hint, quick borrow/repay buttons (U7).
import { h, fmtMoney, fmtNum } from './dom.js';
import { app, act } from './app.js';

let loanInput = '';
const QUICK = [5000, 25000];

function numberInput(value, onInput, attrs = {}) {
  return h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value, style: { width: '7em' },
    oninput: (e) => onInput(e.target.value), ...attrs });
}

function borrow(game, amount) {
  if (!(amount > 0)) return act({ ok: false, reason: 'Isi jumlah pinjaman.' });
  loanInput = '';
  act(game.takeLoan(amount), `Pinjaman ${fmtMoney(amount)} diterima.`);
}

function repay(game, amount) {
  loanInput = '';
  const before = game.state.loan;
  act(game.repayLoan(amount), () => `Pinjaman dibayar ${fmtMoney(before - game.state.loan)}.`);
}

export function loansPanel() {
  const game = app.game;
  const li = game.loanInfo();
  const room = Math.max(0, li.cap - li.loan);
  const monthly = (1 + li.dailyRate) ** 30 - 1;
  const payable = Math.min(li.loan, Math.max(0, game.state.money));
  return h('section.section.eco-loans',
    h('div.section-title', '🏦 Pinjaman', h('span.small.muted', `${fmtMoney(li.loan)} / ${fmtMoney(li.cap)}`)),
    h('div.card',
      h('div.kv',
        h('span', 'Bunga'), h('span.num', `${fmtNum(li.dailyRate * 100, 2)}%/hari ≈ ${fmtNum(monthly * 100, 0)}%/bulan`),
        h('span', 'Bunga hari ini'), h('span.num', fmtMoney(li.loan * li.dailyRate)),
        h('span', 'Sisa batas'), h('span.num', fmtMoney(room))),
      h('p.small.muted.eco-hint', room > 0
        ? `Pinjam maks menambah bunga ${fmtMoney(room * li.dailyRate)}/hari. Pinjam hanya untuk investasi yang balik modal lebih cepat (ladang, mesin).`
        : 'Batas pinjaman tercapai. Naik level untuk menaikkan batas.'),
      h('div.card-actions',
        numberInput(loanInput, (v) => { loanInput = v; }, { placeholder: 'Jumlah', 'aria-label': 'Jumlah pinjaman' }),
        h('button.btn.btn-small.btn-primary', { disabled: room <= 0, onclick: () => borrow(game, Number(loanInput)) }, 'Pinjam'),
        h('button.btn.btn-small.btn-secondary', { disabled: li.loan <= 0, onclick: () => {
          const a = Number(loanInput);
          if (!(a > 0)) return act({ ok: false, reason: 'Isi jumlah pembayaran.' });
          repay(game, Math.min(a, li.loan));
        } }, 'Bayar')),
      h('div.card-actions.eco-quick',
        QUICK.filter((q) => q < room).map((q) => h('button.btn.btn-small.btn-secondary',
          { onclick: () => borrow(game, q) }, `+${fmtMoney(q)}`)),
        h('button.btn.btn-small.btn-secondary', { disabled: room <= 0, onclick: () => borrow(game, room) },
          `Pinjam maks ${fmtMoney(room)}`),
        h('span.spacer'),
        h('button.btn.btn-small.btn-primary', { disabled: payable <= 0, onclick: () => repay(game) },
          `Bayar maks ${fmtMoney(payable)}`))));
}

/** Render signature for the loans panel (re-render when these change). */
export const loansSig = (game) => {
  const li = game.loanInfo();
  return `${li.loan}|${li.cap}|${Math.floor(game.state.money / 100)}`;
};
