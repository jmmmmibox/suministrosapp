// Utilidades de interfaz: creación de elementos, formato, modales y formularios.
import { parseDate, PERIODS, ALERT_KINDS } from './calc.js';
import { store, byId } from './db.js';

export const bus = { rerender: () => {} };

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- Formato ----------

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eurFmt0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const eur = (n) => eurFmt.format(Number(n) || 0);
export const eur0 = (n) => eurFmt0.format(Number(n) || 0);

export function fmtDate(s) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function daysText(d) {
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  const a = Math.abs(d);
  const t = a >= 60 ? `${Math.round(a / 30)} meses` : `${a} días`;
  return d < 0 ? `hace ${t}` : `en ${t}`;
}

export const fmtSize = (b) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ---------- Datos de apoyo ----------

export const periodOptions = () => Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }));
export const periodLabel = (p) => (PERIODS[p] || PERIODS.monthly).label;

export function categoryOptions(extra) {
  const names = store.data.categories.map((c) => c.name);
  if (extra && !names.includes(extra)) names.push(extra);
  return names.sort((a, b) => a.localeCompare(b, 'es')).map((n) => ({ value: n, label: `${catIcon(n)} ${n}` }));
}

export const catIcon = (name) => store.data.categories.find((c) => c.name === name)?.icon || '📄';

export function propertyOptions({ personal = true } = {}) {
  const props = [...store.data.properties].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((p) => ({ value: p.id, label: p.name }));
  return personal ? [{ value: '', label: 'Personal (sin propiedad)' }, ...props] : props;
}

export function contractOptions() {
  const list = [...store.data.contracts].sort((a, b) => a.provider.localeCompare(b.provider, 'es'))
    .map((c) => ({ value: c.id, label: `${c.provider}${c.name ? ' · ' + c.name : ''} (${propName(c.property_id)})` }));
  return [{ value: '', label: '— Ninguno —' }, ...list];
}

export const propName = (id) => (id ? byId('properties', id)?.name || 'Propiedad' : 'Personal');
export const propColor = (id) => (id ? byId('properties', id)?.color || '#4f8cff' : '#8a94a6');
export const defaultPropertyId = () => (['all', 'personal'].includes(store.filter) ? '' : store.filter);

// ---------- Componentes ----------

export const propChip = (id) =>
  h('span', { class: 'chip' }, h('i', { class: 'dot', style: { background: propColor(id) } }), propName(id));

export function alertBadge(a) {
  return h('span', { class: `badge ${a.level}` }, `${ALERT_KINDS[a.kind]} · ${daysText(a.days)}`);
}

export const card = (title, body, actions) =>
  h('section', { class: 'card' },
    title || actions ? h('div', { class: 'card-head' }, h('h3', {}, title), actions || null) : null,
    body);

export const kpi = (label, value, { tone, sub } = {}) =>
  h('div', { class: `kpi ${tone || ''}` }, h('span', { class: 'kpi-label' }, label), h('strong', {}, value),
    sub ? h('small', {}, sub) : null);

export const empty = (text, action) =>
  h('div', { class: 'empty' }, h('p', {}, text), action || null);

export const btn = (label, onClick, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, onclick: onClick }, label);

export function pageHead(title, ...actions) {
  return h('div', { class: 'page-head' }, h('h2', {}, title), h('div', { class: 'row-actions' }, actions));
}

// ---------- Toast ----------

export function toast(msg, kind = '') {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div', { id: 'toasts' }); document.body.append(host); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  host.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 2800);
}

export const errMsg = (e) => e?.message || String(e);

// ---------- Modal ----------

export function modal(title, content, { wide = false } = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', {}, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, '✕')),
      content));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  overlay.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea')?.focus();
  return { close };
}

// ---------- Formularios ----------

/**
 * fields: [{ name, label, type, options, required, step, placeholder, default, half, hint }]
 * onSubmit(values) recibe un objeto con '' -> null y números convertidos.
 */
export function openForm({ title, fields, values = {}, submitLabel = 'Guardar', onSubmit, onDelete, deleteLabel = 'Eliminar' }) {
  const inputs = {};
  const form = h('form', { class: 'form', novalidate: true });

  for (const f of fields) {
    const v = values[f.name] ?? f.default ?? '';
    let input;
    if (f.type === 'select') {
      input = h('select', { name: f.name },
        f.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(v) }, o.label)));
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.name, rows: 3, placeholder: f.placeholder }, v);
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', name: f.name, checked: Boolean(values[f.name] ?? f.default ?? false) });
    } else if (f.type === 'file') {
      input = h('input', { type: 'file', name: f.name, accept: f.accept });
    } else {
      input = h('input', {
        type: f.type || 'text', name: f.name, value: v, placeholder: f.placeholder, step: f.step,
        min: f.min, inputmode: f.type === 'number' ? 'decimal' : null, autocomplete: 'off',
      });
    }
    inputs[f.name] = input;
    const label = f.type === 'checkbox'
      ? h('label', { class: 'field check' }, input, h('span', {}, f.label))
      : h('label', { class: `field ${f.half ? 'half' : ''}` },
        h('span', {}, f.label, f.required ? ' *' : ''), input, f.hint ? h('small', {}, f.hint) : null);
    form.append(label);
  }

  const collect = () => {
    const out = {};
    for (const f of fields) {
      const el = inputs[f.name];
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'file') out[f.name] = el.files[0] || null;
      else {
        let val = el.value.trim();
        if (f.type === 'number') val = val === '' ? null : Number(val.replace(',', '.'));
        else if (val === '') val = null;
        out[f.name] = val;
      }
    }
    return out;
  };

  const saveBtn = h('button', { type: 'submit', class: 'btn primary' }, submitLabel);
  const actions = h('div', { class: 'form-actions' },
    onDelete ? h('button', {
      type: 'button', class: 'btn danger',
      onclick: async () => {
        if (!confirm('¿Seguro que quieres eliminarlo? Esta acción no se puede deshacer.')) return;
        try { await onDelete(); m.close(); } catch (e) { toast(errMsg(e), 'error'); }
      },
    }, deleteLabel) : null,
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, 'Cancelar'),
    saveBtn);
  form.append(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = collect();
    const missing = fields.find((f) => f.required && (vals[f.name] === null || vals[f.name] === '' || Number.isNaN(vals[f.name])));
    if (missing) {
      inputs[missing.name].focus();
      toast(`Falta: ${missing.label}`, 'error');
      return;
    }
    saveBtn.disabled = true;
    try {
      await onSubmit(vals);
      m.close();
    } catch (err) {
      toast(errMsg(err), 'error');
      saveBtn.disabled = false;
    }
  });

  const m = modal(title, form);
  return m;
}

// ---------- Descargas ----------

export function download(filename, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
