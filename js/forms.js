// Formularios de alta y edición de cada entidad.
import { toISO, paidByMe } from './calc.js';
import {
  store, byId, create, update, remove, removeWithFiles, createContract, updateContract,
  uploadDocument, sb, loadAll,
} from './db.js';
import {
  openForm, toast, bus, periodOptions, categoryOptions, propertyOptions, contractOptions, defaultPropertyId,
} from './ui.js';

const today = () => toISO(new Date());
const done = (msg = 'Guardado') => { toast(msg); bus.rerender(); };

export const PROPERTY_TYPES = [
  { value: 'vivienda', label: 'Vivienda habitual' },
  { value: 'alquilada', label: 'Vivienda en alquiler' },
  { value: 'local', label: 'Local' },
  { value: 'otra', label: 'Otra' },
];

const PAID_BY_FIELD = {
  name: 'paid_by', label: 'Lo paga otra persona (opcional)', placeholder: 'Déjalo vacío si lo pagas tú. Ej.: Inquilino, Pedro…',
  hint: 'Si pones un nombre, no cuenta en tus gastos ni en tu neto, pero te seguirá avisando de renovaciones y revisiones.',
};
const payerValues = (x) => ({ ...x, paid_by: paidByMe(x) ? '' : x.paid_by });

export const DOC_KINDS = [
  { value: 'contrato', label: 'Contrato' },
  { value: 'factura', label: 'Factura' },
  { value: 'poliza', label: 'Póliza' },
  { value: 'escritura', label: 'Escritura' },
  { value: 'certificado', label: 'Certificado' },
  { value: 'otro', label: 'Otro' },
];
export const docKindLabel = (k) => DOC_KINDS.find((d) => d.value === k)?.label || 'Otro';

// ---------- Propiedades ----------

export function propertyForm(p) {
  openForm({
    title: p ? 'Editar propiedad' : 'Nueva propiedad',
    values: p || { type: 'vivienda', color: '#4f8cff' },
    fields: [
      { name: 'name', label: 'Nombre', required: true, placeholder: 'Mi casa, Piso Calle Arroyo…' },
      { name: 'type', label: 'Tipo', type: 'select', options: PROPERTY_TYPES, half: true },
      { name: 'color', label: 'Color', type: 'color', half: true },
      { name: 'address', label: 'Dirección' },
      { name: 'surface_m2', label: 'Superficie (m²)', type: 'number', step: '0.01', half: true },
      { name: 'occupants', label: 'Personas que viven', type: 'number', step: '1', half: true },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      if (p) await update('properties', p.id, v); else await create('properties', v);
      done();
    },
    onDelete: p ? async () => {
      await removeWithFiles('properties', p.id);
      location.hash = '#/propiedades';
      done('Propiedad eliminada');
    } : null,
  });
}

// ---------- Contratos ----------

export function contractForm(c, defaults = {}) {
  openForm({
    title: c ? 'Editar contrato' : 'Nuevo contrato o suscripción',
    values: c ? payerValues(c) : { property_id: defaultPropertyId(), billing_period: 'monthly', notice_days: 30, auto_renew: true, ...defaults },
    fields: [
      { name: 'provider', label: 'Compañía', required: true, placeholder: 'Iberdrola, Movistar, Netflix…' },
      { name: 'category', label: 'Categoría', type: 'select', options: categoryOptions(c?.category), half: true, default: 'Otros' },
      { name: 'property_id', label: 'Propiedad', type: 'select', options: propertyOptions(), half: true },
      { name: 'name', label: 'Tarifa / nombre', placeholder: 'Tarifa 2.0TD, Fibra 600…' },
      { name: 'contract_number', label: 'Nº contrato / CUPS / póliza', half: true },
      { name: 'holder', label: 'Titular', half: true },
      PAID_BY_FIELD,
      { name: 'price', label: 'Importe (€)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'billing_period', label: 'Periodicidad', type: 'select', options: periodOptions(), half: true },
      { name: 'start_date', label: 'Fecha de alta', type: 'date', half: true },
      { name: 'renewal_date', label: 'Próxima renovación', type: 'date', half: true },
      { name: 'permanence_end', label: 'Fin de permanencia', type: 'date', half: true },
      { name: 'end_date', label: 'Fin de contrato', type: 'date', half: true },
      { name: 'penalty', label: 'Penalización por baja (€)', type: 'number', step: '0.01', half: true },
      { name: 'notice_days', label: 'Avisarme con (días)', type: 'number', step: '1', half: true },
      { name: 'auto_renew', label: 'Se renueva automáticamente', type: 'checkbox' },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      v.notice_days = v.notice_days ?? 30;
      if (c) await updateContract(c.id, v); else await createContract(v);
      done();
    },
    onDelete: c ? async () => {
      await removeWithFiles('contracts', c.id);
      location.hash = '#/contratos';
      done('Contrato eliminado');
    } : null,
  });
}

export function priceChangeForm(c) {
  openForm({
    title: `Cambio de precio · ${c.provider}`,
    values: { price: c.price, date: today() },
    fields: [
      { name: 'price', label: 'Nuevo importe (€)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'date', label: 'Desde', type: 'date', required: true, half: true },
      { name: 'note', label: 'Motivo', placeholder: 'Subida de tarifa, nueva oferta…' },
    ],
    submitLabel: 'Registrar',
    onSubmit: async (v) => {
      if (Number(v.price) === Number(c.price)) throw new Error('El importe es igual al actual.');
      await updateContract(c.id, { price: v.price }, { note: v.note || 'Cambio de precio', date: v.date });
      done();
    },
  });
}

// ---------- Ofertas ----------

export function offerForm(contract, o) {
  openForm({
    title: o ? 'Editar oferta' : `Nueva oferta para ${contract.provider}`,
    values: o || { billing_period: contract.billing_period, date: today() },
    fields: [
      { name: 'provider', label: 'Compañía', required: true, placeholder: 'Quién la ofrece' },
      { name: 'price', label: 'Importe (€)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'billing_period', label: 'Periodicidad', type: 'select', options: periodOptions(), half: true },
      { name: 'conditions', label: 'Condiciones', type: 'textarea', placeholder: 'Permanencia, bonos, precio del kWh…' },
      { name: 'url', label: 'Enlace', type: 'url', half: true },
      { name: 'date', label: 'Fecha de la oferta', type: 'date', half: true },
    ],
    onSubmit: async (v) => {
      if (o) await update('offers', o.id, v); else await create('offers', { ...v, contract_id: contract.id });
      done();
    },
    onDelete: o ? async () => { await remove('offers', o.id); done('Oferta eliminada'); } : null,
  });
}

// ---------- Gastos ----------

export function expenseForm(e) {
  openForm({
    title: e ? 'Editar gasto' : 'Nuevo gasto',
    values: e ? payerValues(e) : { property_id: defaultPropertyId(), date: today(), period: 'monthly', category: 'Otros' },
    fields: [
      { name: 'concept', label: 'Concepto', required: true, placeholder: 'Comunidad, IBI, reparación caldera…' },
      { name: 'amount', label: 'Importe (€)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'category', label: 'Categoría', type: 'select', options: categoryOptions(e?.category), half: true },
      { name: 'property_id', label: 'Propiedad', type: 'select', options: propertyOptions(), half: true },
      { name: 'contract_id', label: 'Contrato relacionado', type: 'select', options: contractOptions(), half: true },
      PAID_BY_FIELD,
      { name: 'date', label: 'Fecha (o inicio si es recurrente)', type: 'date', required: true, half: true },
      { name: 'recurring', label: 'Es un gasto recurrente', type: 'checkbox' },
      { name: 'period', label: 'Se repite cada', type: 'select', options: periodOptions(), half: true },
      { name: 'end_date', label: 'Hasta (opcional)', type: 'date', half: true },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      if (e) await update('expenses', e.id, v); else await create('expenses', v);
      done();
    },
    onDelete: e ? async () => { await remove('expenses', e.id); done('Gasto eliminado'); } : null,
  });
}

// ---------- Ingresos ----------

export function incomeForm(i) {
  openForm({
    title: i ? 'Editar ingreso' : 'Nuevo ingreso',
    values: i || { property_id: defaultPropertyId(), date: today(), period: 'monthly', concept: 'Alquiler', recurring: true },
    fields: [
      { name: 'concept', label: 'Concepto', required: true },
      { name: 'tenant', label: 'Inquilino / pagador', half: true },
      { name: 'property_id', label: 'Propiedad', type: 'select', options: propertyOptions(), half: true },
      { name: 'amount', label: 'Importe (€)', type: 'number', step: '0.01', required: true, half: true },
      { name: 'date', label: 'Fecha (o inicio si es recurrente)', type: 'date', required: true, half: true },
      { name: 'recurring', label: 'Es un ingreso recurrente', type: 'checkbox' },
      { name: 'period', label: 'Se repite cada', type: 'select', options: periodOptions(), half: true },
      { name: 'end_date', label: 'Hasta (opcional)', type: 'date', half: true },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
    onSubmit: async (v) => {
      if (i) await update('incomes', i.id, v); else await create('incomes', v);
      done();
    },
    onDelete: i ? async () => { await remove('incomes', i.id); done('Ingreso eliminado'); } : null,
  });
}

// ---------- Documentos ----------

export function documentForm({ property_id = '', contract_id = '', kind = 'contrato' } = {}) {
  openForm({
    title: 'Subir documento',
    values: { property_id, contract_id, kind },
    fields: [
      { name: 'file', label: 'Archivo (PDF, foto…)', type: 'file', required: true, accept: 'application/pdf,image/*,.doc,.docx,.xls,.xlsx' },
      { name: 'name', label: 'Nombre (opcional)', placeholder: 'Contrato luz 2026' },
      { name: 'kind', label: 'Tipo', type: 'select', options: DOC_KINDS, half: true },
      { name: 'property_id', label: 'Propiedad', type: 'select', options: propertyOptions(), half: true },
      { name: 'contract_id', label: 'Contrato', type: 'select', options: contractOptions(), hint: 'Si eliges contrato, se usa su propiedad.' },
    ],
    submitLabel: 'Subir',
    onSubmit: async (v) => {
      const pid = v.contract_id ? byId('contracts', v.contract_id)?.property_id ?? null : v.property_id;
      await uploadDocument(v.file, { property_id: pid, contract_id: v.contract_id, kind: v.kind, name: v.name });
      done('Documento subido');
    },
  });
}

// ---------- Categorías ----------

export function categoryForm(cat) {
  openForm({
    title: cat ? 'Editar categoría' : 'Nueva categoría',
    values: cat || { icon: '📄' },
    fields: [
      { name: 'name', label: 'Nombre', required: true, half: true },
      { name: 'icon', label: 'Icono (emoji)', required: true, half: true },
    ],
    onSubmit: async (v) => {
      const dup = store.data.categories.find((c) => c.name.toLowerCase() === v.name.toLowerCase() && c.id !== cat?.id);
      if (dup) throw new Error('Ya existe una categoría con ese nombre.');
      if (!cat) { await create('categories', v); return done(); }
      const renamed = cat.name !== v.name;
      await update('categories', cat.id, v);
      if (renamed) {
        for (const t of ['contracts', 'expenses']) {
          const r = await sb.from(t).update({ category: v.name }).eq('category', cat.name);
          if (r.error) throw r.error;
        }
        await loadAll();
      }
      done();
    },
    onDelete: cat ? async () => {
      const used = store.data.contracts.some((c) => c.category === cat.name)
        || store.data.expenses.some((e) => e.category === cat.name);
      if (used) throw new Error('La categoría está en uso. Cámbiala en esos contratos o gastos primero.');
      await remove('categories', cat.id);
      done('Categoría eliminada');
    } : null,
  });
}
