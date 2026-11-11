import assert from 'node:assert/strict';
import {
  toMonthly, toAnnual, daysUntil, contractAlerts, needsReview,
  savingFor, totalPotentialSaving, summarize, toCSV, parseDate, paidByMe, contractAnnual,
} from '../js/calc.js';

const today = new Date(2026, 10, 10); // 10-nov-2026
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('periodicidades', () => {
  assert.equal(toMonthly(120, 'annual'), 10);
  assert.equal(toMonthly(60, 'bimonthly'), 30);
  assert.equal(toAnnual(30, 'quarterly'), 120);
  assert.equal(toAnnual(10, 'monthly'), 120);
});

t('fechas', () => {
  assert.equal(daysUntil('2026-11-10', today), 0);
  assert.equal(daysUntil('2026-11-20', today), 10);
  assert.equal(daysUntil('2026-11-01', today), -9);
  assert.equal(daysUntil('', today), null);
  assert.equal(parseDate('2026-02-30') instanceof Date, true);
});

t('avisos y niveles', () => {
  const cs = [
    { id: 1, status: 'active', renewal_date: '2026-11-05', notice_days: 30 },
    { id: 2, status: 'active', permanence_end: '2026-11-25', notice_days: 30 },
    { id: 3, status: 'active', end_date: '2027-01-15', notice_days: 30 },
    { id: 4, status: 'active', renewal_date: '2028-01-01' },
    { id: 5, status: 'cancelled', renewal_date: '2026-11-12' },
  ];
  const a = contractAlerts(cs, today);
  assert.deepEqual(a.map((x) => [x.contract.id, x.level]), [[1, 'overdue'], [2, 'urgent'], [3, 'soon']]);
});

t('revisión anual', () => {
  assert.equal(needsReview({ status: 'active', last_reviewed: '2025-10-01' }, today), true);
  assert.equal(needsReview({ status: 'active', last_reviewed: '2026-06-01' }, today), false);
  assert.equal(needsReview({ status: 'active', start_date: '2024-01-01' }, today), true);
  assert.equal(needsReview({ status: 'cancelled', last_reviewed: '2020-01-01' }, today), false);
});

t('ahorro con ofertas', () => {
  const c = { id: 'a', status: 'active', price: 50, billing_period: 'monthly' };
  const offers = [
    { contract_id: 'a', price: 40, billing_period: 'monthly' },
    { contract_id: 'a', price: 450, billing_period: 'annual' },
    { contract_id: 'b', price: 1, billing_period: 'monthly' },
  ];
  const s = savingFor(c, offers);
  assert.equal(s.saving, 150); // 600 - 450
  assert.equal(totalPotentialSaving([c], offers), 150);
  assert.equal(savingFor(c, []), null);
});

t('resumen anual', () => {
  const data = {
    contracts: [
      { status: 'active', price: 50, billing_period: 'monthly', category: 'Luz' },
      { status: 'active', price: 120, billing_period: 'annual', category: 'Seguros' },
      { status: 'cancelled', price: 999, billing_period: 'monthly', category: 'Luz' },
    ],
    expenses: [
      { recurring: true, amount: 300, period: 'quarterly', date: '2026-01-01', category: 'Comunidad' },
      { recurring: false, amount: 200, date: '2026-05-10', category: 'Mantenimiento' },
      { recurring: false, amount: 999, date: '2025-05-10', category: 'Mantenimiento' },
    ],
    incomes: [
      { recurring: true, amount: 700, period: 'monthly', date: '2026-03-01' },
      { recurring: false, amount: 100, date: '2026-12-01' },
    ],
  };
  const s = summarize(data, today);
  // contratos: 600 + 120 = 720; comunidad: 100*12 = 1200; puntual: 200
  assert.equal(Math.round(s.annualExpenses), 2120);
  // alquiler marzo-dic = 10 meses * 700 + 100
  assert.equal(Math.round(s.annualIncome), 7100);
  assert.equal(Math.round(s.net), 4980);
  assert.equal(Math.round(s.monthlyNow), 160); // 50 + 10 + 100
  assert.equal(s.byMonth[4].expense - s.byMonth[3].expense, 200);
  assert.equal(s.byCategory[0].name, 'Comunidad');
});

t('recurrente con fecha fin', () => {
  const s = summarize({ expenses: [{ recurring: true, amount: 10, period: 'monthly', date: '2026-01-01', end_date: '2026-03-31' }] }, today);
  assert.equal(Math.round(s.annualExpenses), 30);
  assert.equal(s.monthlyNow, 0);
});

t('CSV', () => {
  const csv = toCSV([{ a: 'x;y', b: 'say "hi"' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
  assert.equal(csv, '﻿A;B\r\n"x;y";"say ""hi"""');
});

t('lo que paga el inquilino no cuenta como gasto mío', () => {
  assert.equal(paidByMe({}), true);
  assert.equal(paidByMe({ paid_by: 'me' }), true);
  assert.equal(paidByMe({ paid_by: 'tenant' }), false);
  const luz = { id: 'l', status: 'active', price: 80, billing_period: 'monthly', category: 'Luz', paid_by: 'tenant', last_reviewed: '2020-01-01' };
  const agua = { id: 'a', status: 'active', price: 30, billing_period: 'monthly', category: 'Agua' };
  const s = summarize({
    contracts: [luz, agua],
    expenses: [
      { recurring: true, amount: 90, period: 'quarterly', date: '2026-01-01', category: 'Comunidad', paid_by: 'tenant' },
      { recurring: false, amount: 500, date: '2026-05-10', category: 'Mantenimiento', paid_by: 'tenant' },
      { recurring: false, amount: 100, date: '2026-05-10', category: 'Mantenimiento' },
    ],
    incomes: [{ recurring: true, amount: 650, period: 'monthly', date: '2026-01-01' }],
  }, today);
  assert.equal(Math.round(s.annualExpenses), 460);   // 30*12 + 100
  assert.equal(Math.round(s.monthlyNow), 30);
  assert.equal(Math.round(s.net), 7340);             // 7800 - 460
  assert.equal(contractAnnual(luz), 0);
  assert.equal(needsReview(luz, today), false);      // no hay que buscar mejor precio de algo que no pagas
  assert.equal(savingFor(luz, [{ contract_id: 'l', price: 10, billing_period: 'monthly' }]), null);
  assert.equal(totalPotentialSaving([luz], [{ contract_id: 'l', price: 10, billing_period: 'monthly' }]), 0);
  // los avisos de renovación siguen funcionando
  assert.equal(contractAlerts([{ ...luz, renewal_date: '2026-11-20' }], today).length, 1);
});

console.log(`\n${n} grupos de pruebas OK`);
