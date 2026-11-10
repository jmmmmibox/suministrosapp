// Pantallas de la app. Cada vista devuelve un elemento DOM.
import {
  summarize, contractAlerts, needsReview, savingFor, totalPotentialSaving, contractAnnual, toAnnual,
  toMonthly, parseDate, toISO, isActive, MONTHS, ALERT_KINDS, PERIODS, toCSV,
} from './calc.js';
import {
  store, scoped, byId, update, deleteDocument, openDocument, sb,
} from './db.js';
import {
  h, eur, eur0, fmtDate, fmtSize, catIcon, propName, propChip, alertBadge, card, kpi, empty, btn,
  pageHead, toast, errMsg, periodLabel, bus, download,
} from './ui.js';
import {
  propertyForm, contractForm, priceChangeForm, offerForm, expenseForm, incomeForm, documentForm, categoryForm,
  PROPERTY_TYPES, docKindLabel,
} from './forms.js';

const PER_SHORT = { monthly: '/mes', bimonthly: '/2 meses', quarterly: '/trimestre', semiannual: '/semestre', annual: '/año' };
const perShort = (p) => PER_SHORT[p] || '/mes';
const typeLabel = (t) => PROPERTY_TYPES.find((x) => x.value === t)?.label || 'Otra';
const go = (hash) => () => { location.hash = hash; };
const link = (href, ...kids) => h('a', { href, class: 'link' }, ...kids);
const KIND_ICON = { contrato: '📑', factura: '🧾', poliza: '🛡️', escritura: '🏠', certificado: '📜', otro: '📎' };

// ---------- Helpers ----------

function offersOf(contracts) {
  const ids = new Set(contracts.map((c) => c.id));
  return store.data.offers.filter((o) => ids.has(o.contract_id));
}

function dataFor(propertyId) {
  const pick = (t) => store.data[t].filter((r) => (propertyId === 'personal' ? !r.property_id : r.property_id === propertyId));
  return { contracts: pick('contracts'), expenses: pick('expenses'), incomes: pick('incomes') };
}

function bars(items, total) {
  return h('div', { class: 'hbars' }, items.map((it) =>
    h('div', { class: 'hbar' },
      h('div', { class: 'hbar-top' }, h('span', {}, `${catIcon(it.name)} ${it.name}`), h('b', {}, eur0(it.total))),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${Math.max(2, (it.total / total) * 100)}%` } })))));
}

function monthChart(byMonth) {
  const max = Math.max(1, ...byMonth.flatMap((m) => [m.expense, m.income]));
  const nowM = new Date().getMonth();
  return h('div', {},
    h('div', { class: 'chart' }, byMonth.map((m, i) =>
      h('div', { class: `col ${i === nowM ? 'now' : ''}`, title: `${MONTHS[i]}: gastos ${eur(m.expense)}${m.income ? ` · ingresos ${eur(m.income)}` : ''}` },
        h('div', { class: 'bars' },
          h('div', { class: 'bar exp', style: { height: `${(m.expense / max) * 100}%` } }),
          m.income > 0 ? h('div', { class: 'bar inc', style: { height: `${(m.income / max) * 100}%` } }) : null),
        h('span', { class: 'lbl' }, MONTHS[i])))),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'sw exp' }), 'Gastos'), h('span', {}, h('i', { class: 'sw inc' }), 'Ingresos')));
}

function docList(docs, { showWhere = false } = {}) {
  if (!docs.length) return h('p', { class: 'muted' }, 'Sin documentos.');
  return h('ul', { class: 'list' }, [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((d) =>
    h('li', { class: 'row' },
      h('span', { class: 'big-icon sm' }, KIND_ICON[d.kind] || '📎'),
      h('div', { class: 'grow' },
        h('strong', {}, d.name),
        h('small', {}, [docKindLabel(d.kind), fmtDate(d.created_at), fmtSize(d.size_bytes),
          showWhere ? (d.contract_id ? byId('contracts', d.contract_id)?.provider : propName(d.property_id)) : null]
          .filter(Boolean).join(' · '))),
      h('div', { class: 'row-actions' },
        btn('Abrir', async () => { try { await openDocument(d); } catch (e) { toast(errMsg(e), 'error'); } }, 'sm'),
        btn('✕', async () => {
          if (!confirm(`¿Eliminar "${d.name}"?`)) return;
          try { await deleteDocument(d); toast('Documento eliminado'); bus.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
        }, 'sm danger')))));
}

function propertyRows(year) {
  const rows = store.data.properties.map((p) => ({ id: p.id, p, ...dataFor(p.id) }));
  const personal = dataFor('personal');
  if (personal.contracts.length || personal.expenses.length || personal.incomes.length) rows.push({ id: 'personal', p: null, ...personal });
  return rows.map((r) => {
    const s = summarize(r, new Date(), year);
    return { ...r, s, perM2: r.p?.surface_m2 ? s.annualExpenses / r.p.surface_m2 : null };
  });
}

function propertyTable(year) {
  const rows = propertyRows(year);
  if (!rows.length) return empty('Aún no hay datos por propiedad.');
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Propiedad', 'Gasto anual', 'Ingresos', 'Neto', '€/m²'].map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {},
      h('td', {}, link(`#/propiedad/${r.id}`, propChip(r.p ? r.id : null))),
      h('td', { class: 'num' }, eur0(r.s.annualExpenses)),
      h('td', { class: 'num' }, r.s.annualIncome ? eur0(r.s.annualIncome) : '—'),
      h('td', { class: `num ${r.s.net < 0 ? 'neg' : r.s.net > 0 ? 'pos' : ''}` }, r.s.annualIncome || r.s.annualExpenses ? eur0(r.s.net) : '—'),
      h('td', { class: 'num' }, r.perM2 ? `${r.perM2.toFixed(1)} €` : '—'))))));
}

// ---------- Panel ----------

export function dashboardView() {
  const today = new Date();
  const contracts = scoped('contracts');
  const expenses = scoped('expenses');
  const incomes = scoped('incomes');
  const offers = offersOf(contracts);
  const s = summarize({ contracts, expenses, incomes }, today);
  const alerts = contractAlerts(contracts, today, 120);
  const reviews = contracts.filter((c) => needsReview(c, today));
  const saving = totalPotentialSaving(contracts, offers);

  const root = h('div', { class: 'view' });
  root.append(pageHead('Panel', btn('+ Contrato', () => contractForm(), 'primary')));

  if (!store.data.properties.length && !contracts.length) {
    root.append(card('Empieza aquí', h('div', {},
      h('p', {}, 'Crea tu primera propiedad (tu casa, otro piso…) y añade sus suministros. Lo personal (móvil, streaming) va en "Personal".'),
      h('div', { class: 'row-actions' }, btn('Crear propiedad', () => propertyForm(), 'primary'), btn('Añadir contrato personal', () => contractForm())))));
  }

  root.append(h('div', { class: 'kpis' },
    kpi('Gasto mensual ahora', eur0(s.monthlyNow), { sub: 'contratos + recurrentes' }),
    kpi(`Gasto ${s.year}`, eur0(s.annualExpenses)),
    kpi(`Ingresos ${s.year}`, eur0(s.annualIncome), { tone: s.annualIncome ? 'pos' : '' }),
    kpi('Neto', eur0(s.net), { tone: s.net < 0 ? 'neg' : s.annualIncome ? 'pos' : '' }),
    kpi('Ahorro posible', eur0(saving), { tone: saving > 0 ? 'pos' : '', sub: saving > 0 ? 'según tus ofertas' : 'añade ofertas' })));

  const attention = alerts.slice(0, 6).map((a) =>
    h('li', { class: 'row' },
      h('span', { class: 'big-icon sm' }, catIcon(a.contract.category)),
      h('div', { class: 'grow' }, link(`#/contrato/${a.contract.id}`, h('strong', {}, a.contract.provider)),
        h('small', {}, `${fmtDate(a.date)} · ${propName(a.contract.property_id)}`)),
      alertBadge(a)));
  root.append(card('Requiere atención',
    attention.length || reviews.length
      ? h('div', {},
        attention.length ? h('ul', { class: 'list' }, attention) : null,
        reviews.length ? h('p', { class: 'muted pad' }, `${reviews.length} contrato${reviews.length > 1 ? 's' : ''} sin revisar hace más de un año. `, link('#/avisos', 'Ver')) : null)
      : h('p', { class: 'muted' }, 'Todo en orden: no hay vencimientos en los próximos 4 meses.'),
    link('#/avisos', 'Ver todos')));

  root.append(h('div', { class: 'two' },
    card(`Gasto e ingresos por mes · ${s.year}`, monthChart(s.byMonth)),
    card('Gasto por categoría', s.byCategory.length ? bars(s.byCategory.slice(0, 8), s.byCategory[0].total) : empty('Sin gastos todavía.'))));

  if (store.filter === 'all') root.append(card('Por propiedad', propertyTable(s.year)));

  const top = contracts.filter(isActive).sort((a, b) => contractAnnual(b) - contractAnnual(a)).slice(0, 6);
  if (top.length) {
    root.append(card('Contratos que más cuestan', h('ul', { class: 'list' }, top.map((c) =>
      h('li', { class: 'row' },
        h('span', { class: 'big-icon sm' }, catIcon(c.category)),
        h('div', { class: 'grow' }, link(`#/contrato/${c.id}`, h('strong', {}, c.provider)), h('small', {}, `${c.name || c.category} · ${propName(c.property_id)}`)),
        h('div', { class: 'amount' }, h('b', {}, eur0(contractAnnual(c))), h('small', {}, '/año')))))));
  }
  return root;
}

// ---------- Contratos ----------

const cState = { q: '', cat: '', status: 'active' };

export function contractsView() {
  const root = h('div', { class: 'view' });
  const host = h('div');
  const today = new Date();

  const draw = () => {
    const all = scoped('contracts');
    const alerts = contractAlerts(all, today, 400);
    const firstAlert = new Map();
    for (const a of alerts) if (!firstAlert.has(a.contract.id)) firstAlert.set(a.contract.id, a);
    const offers = offersOf(all);

    const list = all.filter((c) =>
      (cState.status === 'all' || (cState.status === 'active' ? isActive(c) : !isActive(c)))
      && (!cState.cat || c.category === cState.cat)
      && (!cState.q || [c.provider, c.name, c.contract_number, c.holder, c.category].some((x) => (x || '').toLowerCase().includes(cState.q))));

    host.replaceChildren();
    if (!list.length) {
      host.append(empty(all.length ? 'Ningún contrato coincide con el filtro.' : 'Aún no tienes contratos en esta vista.',
        all.length ? null : btn('+ Añadir el primero', () => contractForm(), 'primary')));
      return;
    }
    const groups = new Map();
    for (const c of list) {
      const k = c.property_id || 'personal';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const [k, items] of [...groups].sort((a, b) => propName(a[0] === 'personal' ? null : a[0]).localeCompare(propName(b[0] === 'personal' ? null : b[0]), 'es'))) {
      const monthly = items.filter(isActive).reduce((sum, c) => sum + toMonthly(c.price, c.billing_period), 0);
      if (store.filter === 'all') {
        host.append(h('div', { class: 'group-head' }, propChip(k === 'personal' ? null : k), h('small', {}, `${eur0(monthly)}/mes`)));
      }
      host.append(h('div', { class: 'grid cards' }, items.sort((a, b) => a.provider.localeCompare(b.provider, 'es')).map((c) => {
        const al = firstAlert.get(c.id);
        const sv = savingFor(c, offers);
        return h('a', { class: `card contract ${isActive(c) ? '' : 'off'}`, href: `#/contrato/${c.id}` },
          h('div', { class: 'contract-top' },
            h('span', { class: 'big-icon' }, catIcon(c.category)),
            h('div', { class: 'grow' }, h('strong', {}, c.provider), h('small', {}, c.name || c.category))),
          h('div', { class: 'price' }, eur(c.price), h('small', {}, ` ${perShort(c.billing_period)}`)),
          h('div', { class: 'badges' },
            isActive(c) ? null : h('span', { class: 'badge muted' }, 'Dado de baja'),
            al && al.days <= 120 ? alertBadge(al) : null,
            needsReview(c, today) ? h('span', { class: 'badge soon' }, 'Revisar') : null,
            sv && sv.saving > 0 ? h('span', { class: 'badge good' }, `Ahorro ${eur0(sv.saving)}/año`) : null));
      })));
    }
  };

  const search = h('input', { type: 'search', placeholder: 'Buscar compañía, nº contrato…', value: cState.q, oninput: (e) => { cState.q = e.target.value.toLowerCase(); draw(); } });
  const cat = h('select', { onchange: (e) => { cState.cat = e.target.value; draw(); } },
    h('option', { value: '' }, 'Todas las categorías'),
    store.data.categories.map((c) => h('option', { value: c.name, selected: c.name === cState.cat }, `${c.icon} ${c.name}`)));
  const status = h('select', { onchange: (e) => { cState.status = e.target.value; draw(); } },
    [['active', 'Activos'], ['cancelled', 'Dados de baja'], ['all', 'Todos']].map(([v, l]) => h('option', { value: v, selected: v === cState.status }, l)));

  root.append(pageHead('Contratos', btn('+ Nuevo', () => contractForm(), 'primary')), h('div', { class: 'toolbar' }, search, cat, status), host);
  draw();
  return root;
}

function infoItem(label, value) {
  return h('div', { class: 'info' }, h('dt', {}, label), h('dd', {}, value || '—'));
}

export function contractDetailView(id) {
  const c = byId('contracts', id);
  if (!c) return empty('Contrato no encontrado.', btn('Volver', go('#/contratos')));
  const today = new Date();
  const alerts = contractAlerts([c], today, 400);
  const root = h('div', { class: 'view' });

  root.append(h('a', { href: '#/contratos', class: 'back' }, '← Contratos'));
  root.append(h('div', { class: 'detail-head' },
    h('span', { class: 'big-icon lg' }, catIcon(c.category)),
    h('div', { class: 'grow' },
      h('h2', {}, c.provider), h('p', { class: 'muted' }, [c.name, c.category].filter(Boolean).join(' · ')),
      h('div', { class: 'badges' }, propChip(c.property_id), isActive(c) ? null : h('span', { class: 'badge muted' }, 'Dado de baja'),
        alerts.map(alertBadge))),
    h('div', { class: 'row-actions' },
      btn('Editar', () => contractForm(c)),
      btn(isActive(c) ? 'Dar de baja' : 'Reactivar', async () => {
        try { await update('contracts', c.id, { status: isActive(c) ? 'cancelled' : 'active' }); toast('Actualizado'); bus.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
      }))));

  root.append(h('div', { class: 'kpis' },
    kpi('Importe', eur(c.price), { sub: periodLabel(c.billing_period) }),
    kpi('Coste anual', eur0(toAnnual(c.price, c.billing_period))),
    kpi('Penalización por baja', c.penalty ? eur0(c.penalty) : '—'),
    kpi('Última revisión', c.last_reviewed ? fmtDate(c.last_reviewed) : 'Nunca', { tone: needsReview(c, today) ? 'neg' : '' })));

  root.append(card('Datos del contrato', h('div', {},
    h('dl', { class: 'info-grid' },
      infoItem('Nº contrato / CUPS / póliza', c.contract_number), infoItem('Titular', c.holder),
      infoItem('Alta', c.start_date && fmtDate(c.start_date)), infoItem('Próxima renovación', c.renewal_date && fmtDate(c.renewal_date)),
      infoItem('Fin de permanencia', c.permanence_end && fmtDate(c.permanence_end)), infoItem('Fin de contrato', c.end_date && fmtDate(c.end_date)),
      infoItem('Aviso previo', `${c.notice_days ?? 30} días`), infoItem('Renovación automática', c.auto_renew ? 'Sí' : 'No')),
    c.notes ? h('p', { class: 'notes' }, c.notes) : null,
    h('div', { class: 'row-actions pad' }, btn('✔ Marcar como revisado hoy', async () => {
      try { await update('contracts', c.id, { last_reviewed: toISO(new Date()) }); toast('Marcado como revisado'); bus.rerender(); } catch (e) { toast(errMsg(e), 'error'); }
    })))));

  // Ofertas
  const offers = store.data.offers.filter((o) => o.contract_id === c.id)
    .sort((a, b) => toAnnual(a.price, a.billing_period) - toAnnual(b.price, b.billing_period));
  const cur = contractAnnual(c);
  root.append(card('Comparador de ofertas', offers.length
    ? h('ul', { class: 'list' }, offers.map((o) => {
      const diff = cur - toAnnual(o.price, o.billing_period);
      return h('li', { class: 'row' },
        h('div', { class: 'grow' },
          h('strong', {}, o.provider), h('small', {}, `${eur(o.price)} ${perShort(o.billing_period)} · ${fmtDate(o.date)}${o.conditions ? ' · ' + o.conditions : ''}`),
          o.url ? h('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer', class: 'link' }, 'Ver oferta') : null),
        h('span', { class: `badge ${diff > 0 ? 'good' : diff < 0 ? 'overdue' : 'muted'}` }, diff === 0 ? 'Igual' : `${diff > 0 ? 'Ahorras' : 'Pagas'} ${eur0(Math.abs(diff))}/año`),
        btn('Editar', () => offerForm(c, o), 'sm'));
    }))
    : h('p', { class: 'muted' }, 'Anota aquí las ofertas que encuentres para ver cuánto ahorrarías al año.'),
  btn('+ Oferta', () => offerForm(c), 'sm')));

  // Historial de precios
  const hist = store.data.price_history.filter((p) => p.contract_id === c.id).sort((a, b) => b.date.localeCompare(a.date));
  root.append(card('Historial de precio', hist.length
    ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Desde'), h('th', { class: 'num' }, 'Importe'), h('th', { class: 'num' }, 'Variación'), h('th', {}, 'Nota'))),
      h('tbody', {}, hist.map((p, i) => {
        const prev = hist[i + 1];
        const d = prev ? ((p.price - prev.price) / prev.price) * 100 : null;
        return h('tr', {}, h('td', {}, fmtDate(p.date)), h('td', { class: 'num' }, eur(p.price)),
          h('td', { class: `num ${d > 0 ? 'neg' : d < 0 ? 'pos' : ''}` }, d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)} %`), h('td', {}, p.note || ''));
      }))))
    : h('p', { class: 'muted' }, 'Sin cambios registrados.'),
  btn('Registrar cambio', () => priceChangeForm(c), 'sm')));

  // Documentos
  const docs = store.data.documents.filter((d) => d.contract_id === c.id);
  root.append(card('Documentos', docList(docs), btn('+ Subir', () => documentForm({ contract_id: c.id, property_id: c.property_id || '' }), 'sm')));
  return root;
}

// ---------- Avisos ----------

export function alertsView() {
  const today = new Date();
  const contracts = scoped('contracts');
  const all = contractAlerts(contracts, today, 365);
  const reviews = contracts.filter((c) => needsReview(c, today));
  const root = h('div', { class: 'view' }, pageHead('Avisos y calendario'));

  const row = (a) => h('li', { class: 'row' },
    h('span', { class: 'big-icon sm' }, catIcon(a.contract.category)),
    h('div', { class: 'grow' }, link(`#/contrato/${a.contract.id}`, h('strong', {}, a.contract.provider)),
      h('small', {}, `${ALERT_KINDS[a.kind]} · ${fmtDate(a.date)} · ${propName(a.contract.property_id)} · ${eur(a.contract.price)} ${perShort(a.contract.billing_period)}`)),
    alertBadge(a));

  const sections = [
    ['Vencidos (actualiza la fecha o da de baja)', all.filter((a) => a.level === 'overdue')],
    ['Urgente: dentro de tu plazo de aviso', all.filter((a) => a.level === 'urgent')],
    ['Próximos', all.filter((a) => a.level === 'soon')],
  ];
  let any = false;
  for (const [title, items] of sections) {
    if (!items.length) continue;
    any = true;
    root.append(card(title, h('ul', { class: 'list' }, items.map(row))));
  }
  if (reviews.length) {
    root.append(card('Para revisar y buscar mejor precio (más de 12 meses)', h('ul', { class: 'list' }, reviews.map((c) =>
      h('li', { class: 'row' }, h('span', { class: 'big-icon sm' }, catIcon(c.category)),
        h('div', { class: 'grow' }, link(`#/contrato/${c.id}`, h('strong', {}, c.provider)),
          h('small', {}, `${propName(c.property_id)} · ${eur(c.price)} ${perShort(c.billing_period)} · última revisión: ${c.last_reviewed ? fmtDate(c.last_reviewed) : 'nunca'}`)))))));
    any = true;
  }
  if (!any) root.append(empty('No hay avisos: ningún vencimiento en los próximos 12 meses.'));
  return root;
}

export function alertCount() {
  const today = new Date();
  return contractAlerts(scoped('contracts'), today, 120).filter((a) => a.level !== 'soon').length;
}

// ---------- Gastos ----------

const eState = { tab: 'recurring', year: new Date().getFullYear() };

function moneyRow({ icon, title, sub, amount, small, onClick, chip }) {
  return h('li', { class: 'row click', onclick: onClick },
    h('span', { class: 'big-icon sm' }, icon),
    h('div', { class: 'grow' }, h('strong', {}, title), h('small', {}, sub), chip || null),
    h('div', { class: 'amount' }, h('b', {}, amount), small ? h('small', {}, small) : null));
}

export function expensesView() {
  const root = h('div', { class: 'view' });
  const all = scoped('expenses');
  const years = [...new Set([eState.year, ...all.filter((e) => !e.recurring).map((e) => parseDate(e.date)?.getFullYear()).filter(Boolean)])].sort((a, b) => b - a);

  const tabs = h('div', { class: 'tabs' }, [['recurring', 'Recurrentes'], ['oneoff', 'Puntuales']].map(([v, l]) =>
    h('button', { type: 'button', class: v === eState.tab ? 'active' : '', onclick: () => { eState.tab = v; bus.rerender(); } }, l)));
  root.append(pageHead('Gastos', btn('+ Gasto', () => expenseForm(), 'primary')), tabs);

  if (eState.tab === 'recurring') {
    const list = all.filter((e) => e.recurring).sort((a, b) => b.amount * 12 / PERIODS[b.period].months - a.amount * 12 / PERIODS[a.period].months);
    const monthly = list.filter((e) => { const end = parseDate(e.end_date); return !end || end >= new Date(); }).reduce((s, e) => s + toMonthly(e.amount, e.period), 0);
    root.append(h('div', { class: 'kpis' }, kpi('Recurrentes al mes', eur0(monthly)), kpi('Recurrentes al año', eur0(monthly * 12))));
    root.append(list.length ? h('ul', { class: 'list card' }, list.map((e) => moneyRow({
      icon: catIcon(e.category), title: e.concept, sub: `${e.category} · desde ${fmtDate(e.date)}${e.end_date ? ' hasta ' + fmtDate(e.end_date) : ''}`,
      amount: eur(e.amount), small: periodLabel(e.period).toLowerCase(), onClick: () => expenseForm(e), chip: propChip(e.property_id),
    }))) : empty('No hay gastos recurrentes (comunidad, IBI, hipoteca…).', btn('+ Añadir', () => expenseForm(), 'primary')));
  } else {
    const yearSel = h('select', { onchange: (e) => { eState.year = Number(e.target.value); bus.rerender(); } },
      years.map((y) => h('option', { value: y, selected: y === eState.year }, y)));
    const list = all.filter((e) => !e.recurring && parseDate(e.date)?.getFullYear() === eState.year).sort((a, b) => b.date.localeCompare(a.date));
    root.append(h('div', { class: 'toolbar' }, yearSel, h('strong', {}, `Total ${eState.year}: ${eur(list.reduce((s, e) => s + Number(e.amount), 0))}`)));
    root.append(list.length ? h('ul', { class: 'list card' }, list.map((e) => moneyRow({
      icon: catIcon(e.category), title: e.concept, sub: `${e.category} · ${fmtDate(e.date)}`, amount: eur(e.amount),
      onClick: () => expenseForm(e), chip: propChip(e.property_id),
    }))) : empty('Sin gastos puntuales este año (reparaciones, derramas, mobiliario…).', btn('+ Añadir', () => expenseForm(), 'primary')));
  }
  return root;
}

// ---------- Ingresos ----------

export function incomesView() {
  const root = h('div', { class: 'view' });
  const all = scoped('incomes').sort((a, b) => b.date.localeCompare(a.date));
  const s = summarize({ incomes: all, expenses: [], contracts: [] });
  root.append(pageHead('Ingresos', btn('+ Ingreso', () => incomeForm(), 'primary')));
  root.append(h('div', { class: 'kpis' }, kpi('Ingresos al mes ahora', eur0(s.incomeMonthlyNow)), kpi(`Ingresos ${s.year}`, eur0(s.annualIncome))));
  root.append(all.length ? h('ul', { class: 'list card' }, all.map((i) => moneyRow({
    icon: '💶', title: i.concept + (i.tenant ? ` · ${i.tenant}` : ''),
    sub: i.recurring ? `desde ${fmtDate(i.date)}${i.end_date ? ' hasta ' + fmtDate(i.end_date) : ''}` : fmtDate(i.date),
    amount: eur(i.amount), small: i.recurring ? periodLabel(i.period).toLowerCase() : 'puntual', onClick: () => incomeForm(i), chip: propChip(i.property_id),
  }))) : empty('Registra aquí el alquiler que cobras u otros ingresos.', btn('+ Añadir', () => incomeForm(), 'primary')));
  if (store.filter === 'all' && store.data.properties.length) root.append(card(`Neto por propiedad · ${s.year}`, propertyTable(s.year)));
  return root;
}

// ---------- Propiedades ----------

export function propertiesView() {
  const year = new Date().getFullYear();
  const rows = propertyRows(year);
  const root = h('div', { class: 'view' }, pageHead('Propiedades', btn('+ Propiedad', () => propertyForm(), 'primary')));
  if (!rows.length) {
    root.append(empty('Crea tu primera propiedad para agrupar sus suministros y gastos.', btn('+ Añadir', () => propertyForm(), 'primary')));
    return root;
  }
  root.append(h('div', { class: 'grid cards' }, rows.map((r) =>
    h('a', { class: 'card prop', href: `#/propiedad/${r.id}`, style: { borderTopColor: r.p ? r.p.color : '#8a94a6' } },
      h('strong', {}, r.p ? r.p.name : 'Personal'),
      h('small', {}, r.p ? [typeLabel(r.p.type), r.p.address].filter(Boolean).join(' · ') : 'Móvil, streaming y otros gastos sin propiedad'),
      h('div', { class: 'prop-nums' },
        h('div', {}, h('small', {}, 'Gasto anual'), h('b', {}, eur0(r.s.annualExpenses))),
        r.s.annualIncome ? h('div', {}, h('small', {}, 'Neto'), h('b', { class: r.s.net < 0 ? 'neg' : 'pos' }, eur0(r.s.net))) : null),
      h('small', {}, `${r.contracts.filter(isActive).length} contratos activos`)))));
  return root;
}

export function propertyDetailView(id) {
  const isPersonal = id === 'personal';
  const p = isPersonal ? null : byId('properties', id);
  if (!isPersonal && !p) return empty('Propiedad no encontrada.', btn('Volver', go('#/propiedades')));
  const d = dataFor(isPersonal ? 'personal' : id);
  const s = summarize(d);
  const docs = store.data.documents.filter((x) => !x.contract_id && (isPersonal ? !x.property_id : x.property_id === id));
  const root = h('div', { class: 'view' });

  root.append(h('a', { href: '#/propiedades', class: 'back' }, '← Propiedades'));
  root.append(h('div', { class: 'detail-head' },
    h('span', { class: 'big-icon lg', style: { background: isPersonal ? '#8a94a6' : p.color } }, isPersonal ? '👤' : '🏠'),
    h('div', { class: 'grow' }, h('h2', {}, isPersonal ? 'Personal' : p.name),
      h('p', { class: 'muted' }, isPersonal ? 'Contratos y gastos sin propiedad' : [typeLabel(p.type), p.address, p.surface_m2 ? `${p.surface_m2} m²` : null, p.occupants ? `${p.occupants} personas` : null].filter(Boolean).join(' · '))),
    isPersonal ? null : h('div', { class: 'row-actions' }, btn('Editar', () => propertyForm(p)))));

  root.append(h('div', { class: 'kpis' },
    kpi('Gasto mensual', eur0(s.monthlyNow)), kpi(`Gasto ${s.year}`, eur0(s.annualExpenses)),
    s.annualIncome ? kpi(`Ingresos ${s.year}`, eur0(s.annualIncome), { tone: 'pos' }) : null,
    s.annualIncome ? kpi('Neto', eur0(s.net), { tone: s.net < 0 ? 'neg' : 'pos' }) : null,
    !isPersonal && p.surface_m2 ? kpi('€/m² al año', `${(s.annualExpenses / p.surface_m2).toFixed(1)} €`) : null,
    !isPersonal && p.occupants ? kpi('€/persona al mes', eur0(s.monthlyNow / p.occupants)) : null));

  const act = d.contracts.filter(isActive).sort((a, b) => contractAnnual(b) - contractAnnual(a));
  const addHere = () => contractForm(null, { property_id: isPersonal ? '' : id });
  root.append(card('Contratos y suministros', act.length
    ? h('ul', { class: 'list' }, act.map((c) => h('li', { class: 'row' }, h('span', { class: 'big-icon sm' }, catIcon(c.category)),
      h('div', { class: 'grow' }, link(`#/contrato/${c.id}`, h('strong', {}, c.provider)), h('small', {}, c.name || c.category)),
      h('div', { class: 'amount' }, h('b', {}, eur(c.price)), h('small', {}, perShort(c.billing_period))))))
    : h('p', { class: 'muted' }, 'Sin contratos todavía.'), btn('+ Contrato', addHere, 'sm')));

  if (s.byCategory.length) root.append(card('Gasto por categoría', bars(s.byCategory.slice(0, 8), s.byCategory[0].total)));

  const ex = d.expenses.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const inc = d.incomes.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  root.append(h('div', { class: 'two' },
    card('Gastos', ex.length ? h('ul', { class: 'list' }, ex.map((e) => moneyRow({ icon: catIcon(e.category), title: e.concept, sub: e.recurring ? 'Recurrente' : fmtDate(e.date), amount: eur(e.amount), small: e.recurring ? periodLabel(e.period).toLowerCase() : '', onClick: () => expenseForm(e) }))) : h('p', { class: 'muted' }, 'Sin gastos.'),
      h('div', { class: 'row-actions' }, link('#/gastos', 'Ver todos'))),
    card('Ingresos', inc.length ? h('ul', { class: 'list' }, inc.map((i) => moneyRow({ icon: '💶', title: i.concept, sub: i.tenant || (i.recurring ? 'Recurrente' : fmtDate(i.date)), amount: eur(i.amount), small: i.recurring ? periodLabel(i.period).toLowerCase() : '', onClick: () => incomeForm(i) }))) : h('p', { class: 'muted' }, 'Sin ingresos.'),
      h('div', { class: 'row-actions' }, link('#/ingresos', 'Ver todos')))));

  root.append(card('Documentos de la propiedad', docList(docs), btn('+ Subir', () => documentForm({ property_id: isPersonal ? '' : id, kind: 'escritura' }), 'sm')));
  return root;
}

// ---------- Documentos ----------

const dState = { q: '', kind: '' };

export function documentsView() {
  const root = h('div', { class: 'view' });
  const host = h('div');
  const draw = () => {
    const docs = scoped('documents').filter((d) => (!dState.kind || d.kind === dState.kind)
      && (!dState.q || (d.name + ' ' + (byId('contracts', d.contract_id)?.provider || '')).toLowerCase().includes(dState.q)));
    host.replaceChildren(docs.length ? h('div', { class: 'card' }, docList(docs, { showWhere: true })) : empty('No hay documentos. Sube contratos, facturas, pólizas…'));
  };
  root.append(pageHead('Documentos', btn('+ Subir', () => documentForm(), 'primary')),
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: 'Buscar…', value: dState.q, oninput: (e) => { dState.q = e.target.value.toLowerCase(); draw(); } }),
      h('select', { onchange: (e) => { dState.kind = e.target.value; draw(); } },
        h('option', { value: '' }, 'Todos los tipos'),
        ['contrato', 'factura', 'poliza', 'escritura', 'certificado', 'otro'].map((k) => h('option', { value: k, selected: k === dState.kind }, docKindLabel(k))))),
    host);
  draw();
  return root;
}

// ---------- Ajustes ----------

export function settingsView() {
  const root = h('div', { class: 'view' }, pageHead('Ajustes'));

  const cats = [...store.data.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  root.append(card('Categorías', h('div', { class: 'chips' }, cats.map((c) =>
    h('button', { type: 'button', class: 'chip btn', onclick: () => categoryForm(c) }, `${c.icon} ${c.name}`))),
  btn('+ Categoría', () => categoryForm(), 'sm')));

  const dl = (name, cols, rows) => () => download(`${name}-${toISO(new Date())}.csv`, toCSV(rows, cols));
  const per = (p) => PERIODS[p]?.label || '';
  root.append(card('Exportar datos', h('div', { class: 'row-actions wrap' },
    btn('Contratos (CSV)', dl('contratos', [
      { label: 'Propiedad', get: (c) => propName(c.property_id) }, { label: 'Categoría', key: 'category' }, { label: 'Compañía', key: 'provider' },
      { label: 'Tarifa', key: 'name' }, { label: 'Nº contrato', key: 'contract_number' }, { label: 'Titular', key: 'holder' },
      { label: 'Importe', key: 'price' }, { label: 'Periodicidad', get: (c) => per(c.billing_period) },
      { label: 'Coste anual', get: (c) => contractAnnual(c).toFixed(2) }, { label: 'Alta', key: 'start_date' },
      { label: 'Renovación', key: 'renewal_date' }, { label: 'Fin permanencia', key: 'permanence_end' }, { label: 'Fin contrato', key: 'end_date' },
      { label: 'Penalización', key: 'penalty' }, { label: 'Estado', get: (c) => (isActive(c) ? 'Activo' : 'Baja') }, { label: 'Notas', key: 'notes' },
    ], store.data.contracts)),
    btn('Gastos (CSV)', dl('gastos', [
      { label: 'Propiedad', get: (e) => propName(e.property_id) }, { label: 'Concepto', key: 'concept' }, { label: 'Categoría', key: 'category' },
      { label: 'Importe', key: 'amount' }, { label: 'Fecha', key: 'date' }, { label: 'Recurrente', get: (e) => (e.recurring ? 'Sí' : 'No') },
      { label: 'Periodicidad', get: (e) => (e.recurring ? per(e.period) : '') }, { label: 'Hasta', key: 'end_date' },
    ], store.data.expenses)),
    btn('Ingresos (CSV)', dl('ingresos', [
      { label: 'Propiedad', get: (i) => propName(i.property_id) }, { label: 'Concepto', key: 'concept' }, { label: 'Pagador', key: 'tenant' },
      { label: 'Importe', key: 'amount' }, { label: 'Fecha', key: 'date' }, { label: 'Recurrente', get: (i) => (i.recurring ? 'Sí' : 'No') },
      { label: 'Periodicidad', get: (i) => (i.recurring ? per(i.period) : '') }, { label: 'Hasta', key: 'end_date' },
    ], store.data.incomes)),
    btn('Copia completa (JSON)', () => download(`suministros-backup-${toISO(new Date())}.json`, JSON.stringify(store.data, null, 2), 'application/json')))));

  const theme = document.documentElement.dataset.theme || 'auto';
  root.append(card('Cuenta y apariencia', h('div', {},
    h('p', {}, `Sesión: ${store.user?.email || ''}`),
    h('div', { class: 'row-actions wrap' },
      btn(`Tema: ${theme === 'dark' ? 'oscuro' : theme === 'light' ? 'claro' : 'automático'}`, () => {
        const next = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
        if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
        try { localStorage.setItem('sm_theme', next); } catch { /* sin almacenamiento */ }
        bus.rerender();
      }),
      btn('Cerrar sesión', async () => { await sb.auth.signOut(); }, 'danger')))));
  return root;
}
