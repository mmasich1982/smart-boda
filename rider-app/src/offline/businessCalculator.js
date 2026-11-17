// rider-app/src/offline/businessCalculator.js
// SMART BIZNA New Sale/Service calculator (prototype v46): it behaves like a real pocket calculator.
//   + − × ÷ =, AC, backspace, decimals, chained sums (× and ÷ before + and −), "=" again repeats the last operation,
//   "5 + =" gives 10, a number typed after "=" starts a new sum, an operator after "=" carries on from the answer,
//   the answer cannot be backspaced, division by zero shows "Cannot divide by 0".
// The SALE AMOUNT is simply what the calculator currently shows as its total (rounded to cents). Plain arithmetic on the phone: no server, no network.
// State is a plain object {t, cur, res, eq, err, lop}; every key press returns a NEW state (easy to render, easy to test).
export const MINUS = '\u2212';
export const TIMES = '\u00d7';
export const DIVIDE = '\u00f7';
const OPS = ['+', MINUS, TIMES, DIVIDE];
const MAX_DIGITS = 12;

export const newCalc = () => ({ t: [], cur: '', res: null, eq: false, err: '', lop: null });
const isOp = (x) => typeof x === 'string';
const round = (n) => parseFloat(n.toPrecision(12));

export function compute(t) {
  const n = [t[0]], o = [];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], v = t[i + 1];
    if (op === TIMES) n[n.length - 1] *= v;
    else if (op === DIVIDE) { if (v === 0) return { err: 'Cannot divide by 0' }; n[n.length - 1] /= v; }
    else { o.push(op); n.push(v); }
  }
  let r = n[0];
  o.forEach((op, i) => { r = op === '+' ? r + n[i + 1] : r - n[i + 1]; });
  if (!isFinite(r)) return { err: 'Number too large' };
  return { v: round(r) };
}

function pending(c) {
  const t = c.t.slice();
  if (c.cur !== '') t.push(parseFloat(c.cur));
  else if (t.length && isOp(t[t.length - 1])) t.pop();
  if (!t.length) return null;
  return t.length === 1 ? { v: t[0] } : compute(t);
}

/** The sale/service amount: the calculator's current total in KSh, rounded to cents (0 when empty or in error). */
export function calcTotal(c) {
  if (c.err) return 0;
  if (c.eq) return Math.round(c.res * 100) / 100;
  const p = pending(c);
  return p && p.v !== undefined ? Math.round(p.v * 100) / 100 : 0;
}

const fmtEntry = (s) => { const p = s.split('.'); const i = (p[0] === '' ? '0' : p[0]).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.length > 1 ? `${i}.${p[1]}` : i; };
export const fmtNum = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 10 });

/** The big line. */
export function mainText(c) {
  if (c.err) return c.err;
  if (c.cur !== '') return fmtEntry(c.cur);
  if (c.eq) return fmtNum(c.res);
  for (let i = c.t.length - 1; i >= 0; i--) if (!isOp(c.t[i])) return fmtNum(c.t[i]);
  return '0';
}

/** The small line above it, e.g. "3 × 150 =". */
export function exprText(c) {
  if (c.err) return '';
  const parts = c.t.map((x) => (isOp(x) ? x : fmtNum(x)));
  if (c.cur !== '') parts.push(fmtEntry(c.cur));
  if (c.eq) parts.push('=');
  return parts.join(' ');
}

const normalise = (k) => (k === '-' ? MINUS : k === '*' || k === 'x' || k === 'X' ? TIMES : k === '/' ? DIVIDE : k === 'Enter' ? '=' : k);

/** Press a key: '0'-'9', '.', '+', '−' (or '-'), '×' (or '*'), '÷' (or '/'), '=', 'AC', 'back'. Returns the new state. */
export function press(state, rawKey) {
  const k = normalise(rawKey);
  const c = { ...state, t: state.t.slice(), lop: state.lop ? state.lop.slice() : null };
  const clear = () => { c.t = []; c.cur = ''; c.res = null; c.eq = false; c.err = ''; c.lop = null; };
  const num = /^[0-9]$/.test(k) || k === '.';
  const op = OPS.includes(k);
  if (c.err) { clear(); if (!num) return c; }                                     // any key after an error starts again
  if (k === 'AC') clear();
  else if (num) {
    if (c.eq) clear();                                                            // a number typed after = starts a new calculation
    if (k === '.') { if (c.cur.indexOf('.') < 0) c.cur = (c.cur === '' ? '0' : c.cur) + '.'; }
    else if (c.cur.replace('.', '').length < MAX_DIGITS) c.cur = c.cur === '0' ? k : c.cur + k;
  } else if (op) {
    if (c.eq) { c.t = [c.res]; c.cur = ''; c.eq = false; c.res = null; c.lop = null; }   // carry on from the answer
    if (c.cur !== '') { c.t.push(parseFloat(c.cur)); c.t.push(k); c.cur = ''; }
    else if (!c.t.length) { c.t.push(0); c.t.push(k); }
    else if (isOp(c.t[c.t.length - 1])) c.t[c.t.length - 1] = k;                  // changed your mind: replace the operator
    else c.t.push(k);
  } else if (k === '=') {
    if (c.eq && c.lop) {                                                          // = again repeats the last operation
      const r = compute([c.res, c.lop[0], c.lop[1]]);
      if (r.err) c.err = r.err; else { c.t = [c.res, c.lop[0], c.lop[1]]; c.res = r.v; }
    } else if (!c.eq) {
      const t = c.t.slice();
      if (c.cur !== '') t.push(parseFloat(c.cur));
      else if (t.length && isOp(t[t.length - 1])) t.push(t[t.length - 2]);        // 5 + = gives 10
      if (t.length === 1) { c.t = t; c.cur = ''; c.res = t[0]; c.eq = true; c.lop = null; }
      else if (t.length > 1) {
        const r = compute(t);
        if (r.err) c.err = r.err;
        else { c.t = t; c.cur = ''; c.res = r.v; c.eq = true; c.lop = [t[t.length - 2], t[t.length - 1]]; }
      }
    }
  } else if (k === 'back') {
    if (c.eq) { /* like a real calculator: the answer cannot be backspaced */ }
    else if (c.cur !== '') c.cur = c.cur.slice(0, -1);
    else if (c.t.length && isOp(c.t[c.t.length - 1])) { c.t.pop(); const n = c.t.pop(); c.cur = String(n); }
  }
  return c;
}

/** Press several keys in a row, e.g. pressAll(newCalc(), ['3','×','1','5','0']). */
export const pressAll = (state, keys) => keys.reduce(press, state);
export const KEY_LAYOUT = [['AC', 2, 'clear'], ['back', 1, ''], [DIVIDE, 1, 'op'], ['7', 1, ''], ['8', 1, ''], ['9', 1, ''], [TIMES, 1, 'op'], ['4', 1, ''],
  ['5', 1, ''], ['6', 1, ''], [MINUS, 1, 'op'], ['1', 1, ''], ['2', 1, ''], ['3', 1, ''], ['+', 1, 'op'], ['0', 2, ''], ['.', 1, ''], ['=', 1, 'eq']];
