// Lógica pura (sin DOM ni red): periodos, fechas, avisos, resúmenes y CSV.

export const PERIODS = {
  monthly:    { label: 'Mensual',    months: 1 },
  bimonthly:  { label: 'Bimestral',  months: 2 },
  quarterly:  { label: 'Trimestral', months: 3 },
  semiannual: { label: 'Semestral',  months: 6 },
  annual:     { label: 'Anual',      months: 12 },
};

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const ALERT_KINDS = {
  renewal: 'Renovación',
  permanence: 'Fin de permanencia',
  end: 'Fin de contrato',
};

export const periodMonths = (p) => (PERIODS[p] || PERIODS.monthly).months;
export const toMonthly = (amount, period) => (Number(amount) || 0) / periodMonths(period);
export const toAnnual = (amount, period) => toMonthly(amount, period) * 12;

// ---------- Fechas (YYYY-MM-DD, siempre en hora local) ----------

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function toISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysUntil(s, today = new Date()) {
  const d = parseDate(s);
  if (!d) return null;
  return Math.round((d - startOfDay(today)) / 86400000);
}

// ---------- Contratos ----------

export const isActive = (c) => c.status !== 'cancelled';

// ¿Lo pago yo? Lo que paga otra persona (p. ej. el inquilino) no cuenta como gasto mío.
export const paidByMe = (x) => x.paid_by !== 'tenant';

export const contractMonthly = (c) => (isActive(c) && paidByMe(c) ? toMonthly(c.price, c.billing_period) : 0);
export const contractAnnual = (c) => contractMonthly(c) * 12;

export function contractAlerts(contracts, today = new Date(), horizonDays = 120) {
  const out = [];
  for (const c of contracts) {
    if (!isActive(c)) continue;
    const notice = c.notice_days ?? 30;
    for (const [kind, field] of [['renewal', 'renewal_date'], ['permanence', 'permanence_end'], ['end', 'end_date']]) {
      const days = daysUntil(c[field], today);
      if (days === null || days > horizonDays) continue;
      const level = days < 0 ? 'overdue' : days <= notice ? 'urgent' : 'soon';
      out.push({ contract: c, kind, date: c[field], days, level });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

// Contratos activos que llevan más de `months` meses sin revisarse.
export function needsReview(c, today = new Date(), months = 12) {
  if (!isActive(c) || !paidByMe(c)) return false;
  const ref = c.last_reviewed || c.start_date || (c.created_at ? c.created_at.slice(0, 10) : null);
  const days = daysUntil(ref, today);
  if (days === null) return false;
  return -days >= Math.round(months * 30.4);
}

export function savingFor(contract, offers) {
  const mine = offers.filter((o) => o.contract_id === contract.id);
  if (!mine.length || !isActive(contract) || !paidByMe(contract)) return null;
  const best = mine.reduce((a, b) =>
    toAnnual(a.price, a.billing_period) <= toAnnual(b.price, b.billing_period) ? a : b);
  const saving = contractAnnual(contract) - toAnnual(best.price, best.billing_period);
  return { offer: best, saving };
}

export function totalPotentialSaving(contracts, offers) {
  let total = 0;
  for (const c of contracts) {
    const s = savingFor(c, offers);
    if (s && s.saving > 0) total += s.saving;
  }
  return total;
}

// ---------- Gastos e ingresos recurrentes / puntuales ----------

// ¿Está activo un gasto/ingreso recurrente durante el mes (year, month0)?
function activeInMonth(item, year, month0) {
  const start = parseDate(item.date);
  const end = parseDate(item.end_date);
  const monthStart = new Date(year, month0, 1);
  const monthEnd = new Date(year, month0 + 1, 0);
  if (start && start > monthEnd) return false;
  if (end && end < monthStart) return false;
  return true;
}

function activeNow(item, today) {
  const start = parseDate(item.date);
  const end = parseDate(item.end_date);
  const t = startOfDay(today);
  if (start && start > t) return false;
  if (end && end < t) return false;
  return true;
}

/**
 * Resume el año indicado.
 * - Contratos activos: cuentan su importe prorrateado cada mes.
 * - Gastos/ingresos recurrentes: cuentan mensualizados en los meses en que están vigentes.
 * - Puntuales: cuentan en el mes de su fecha.
 */
export function summarize({ contracts = [], expenses = [], incomes = [] }, today = new Date(), year = today.getFullYear()) {
  const byMonth = Array.from({ length: 12 }, () => ({ expense: 0, income: 0 }));
  const byCategory = {};
  const addCat = (cat, amount) => { byCategory[cat || 'Otros'] = (byCategory[cat || 'Otros'] || 0) + amount; };

  let monthlyNow = 0;
  let incomeMonthlyNow = 0;

  for (const c of contracts) {
    if (!isActive(c) || !paidByMe(c)) continue;
    const m = toMonthly(c.price, c.billing_period);
    monthlyNow += m;
    for (let i = 0; i < 12; i++) byMonth[i].expense += m;
    addCat(c.category, m * 12);
  }

  for (const e of expenses) {
    if (!paidByMe(e)) continue;
    const amount = Number(e.amount) || 0;
    if (e.recurring) {
      const m = toMonthly(amount, e.period);
      if (activeNow(e, today)) monthlyNow += m;
      for (let i = 0; i < 12; i++) {
        if (activeInMonth(e, year, i)) { byMonth[i].expense += m; addCat(e.category, m); }
      }
    } else {
      const d = parseDate(e.date);
      if (d && d.getFullYear() === year) { byMonth[d.getMonth()].expense += amount; addCat(e.category, amount); }
    }
  }

  for (const inc of incomes) {
    const amount = Number(inc.amount) || 0;
    if (inc.recurring) {
      const m = toMonthly(amount, inc.period);
      if (activeNow(inc, today)) incomeMonthlyNow += m;
      for (let i = 0; i < 12; i++) if (activeInMonth(inc, year, i)) byMonth[i].income += m;
    } else {
      const d = parseDate(inc.date);
      if (d && d.getFullYear() === year) byMonth[d.getMonth()].income += amount;
    }
  }

  const annualExpenses = byMonth.reduce((s, m) => s + m.expense, 0);
  const annualIncome = byMonth.reduce((s, m) => s + m.income, 0);

  return {
    year,
    monthlyNow,
    incomeMonthlyNow,
    annualExpenses,
    annualIncome,
    net: annualIncome - annualExpenses,
    byMonth,
    byCategory: Object.entries(byCategory)
      .map(([name, total]) => ({ name, total }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total),
  };
}

// ---------- CSV ----------

export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}
