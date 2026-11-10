// Acceso a Supabase y estado en memoria de la app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { toISO } from './calc.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const TABLES = [
  'properties', 'categories', 'contracts', 'price_history',
  'expenses', 'incomes', 'offers', 'documents',
];

export const DEFAULT_CATEGORIES = [
  ['Luz', '💡'], ['Gas', '🔥'], ['Agua', '💧'], ['Internet', '🌐'], ['Móvil', '📱'],
  ['Seguros', '🛡️'], ['Streaming', '🎬'], ['Suscripciones', '🔁'], ['Comunidad', '🏢'],
  ['Impuestos', '🏛️'], ['Hipoteca', '🏦'], ['Alquiler', '🔑'], ['Mantenimiento', '🔧'],
  ['Alarma', '🚨'], ['Otros', '📄'],
];

export const store = {
  user: null,
  filter: localStorage.getItem('sm_filter') || 'all', // 'all' | 'personal' | <property id>
  data: Object.fromEntries(TABLES.map((t) => [t, []])),
};

export function setFilter(f) {
  store.filter = f;
  try { localStorage.setItem('sm_filter', f); } catch { /* sin almacenamiento local */ }
}

export function inScope(item) {
  const f = store.filter;
  if (f === 'all') return true;
  if (f === 'personal') return !item.property_id;
  return item.property_id === f;
}

export const scoped = (table) => store.data[table].filter(inScope);
export const byId = (table, id) => store.data[table].find((r) => r.id === id);

// ---------- Carga ----------

export async function loadAll() {
  const res = await Promise.all(TABLES.map((t) => sb.from(t).select('*')));
  res.forEach((r, i) => {
    if (r.error) throw r.error;
    store.data[TABLES[i]] = r.data;
  });
  if (store.filter !== 'all' && store.filter !== 'personal' && !byId('properties', store.filter)) {
    setFilter('all');
  }
}

export async function seedCategoriesIfEmpty() {
  if (store.data.categories.length) return;
  const rows = DEFAULT_CATEGORIES.map(([name, icon]) => ({ name, icon }));
  const { data, error } = await sb.from('categories').insert(rows).select();
  if (error) throw error;
  store.data.categories = data;
}

// ---------- CRUD genérico ----------

export async function create(table, values) {
  const { data, error } = await sb.from(table).insert(values).select().single();
  if (error) throw error;
  store.data[table].push(data);
  return data;
}

export async function update(table, id, values) {
  const { data, error } = await sb.from(table).update(values).eq('id', id).select().single();
  if (error) throw error;
  const arr = store.data[table];
  const i = arr.findIndex((r) => r.id === id);
  if (i >= 0) arr[i] = data;
  return data;
}

export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
  store.data[table] = store.data[table].filter((r) => r.id !== id);
}

// Borrar una propiedad o un contrato arrastra datos (cascada en la BD) y archivos.
export async function removeWithFiles(table, id) {
  const docs = store.data.documents.filter((d) =>
    table === 'properties' ? d.property_id === id : d.contract_id === id);
  if (docs.length) await sb.storage.from('documentos').remove(docs.map((d) => d.path));
  await remove(table, id);
  await loadAll();
}

// ---------- Contratos con historial de precio ----------

export async function createContract(values) {
  const c = await create('contracts', values);
  await create('price_history', {
    contract_id: c.id, price: c.price, date: c.start_date || toISO(new Date()), note: 'Precio inicial',
  });
  return c;
}

export async function updateContract(id, values, { note = 'Cambio de precio', date } = {}) {
  const prev = byId('contracts', id);
  const c = await update('contracts', id, values);
  if (prev && values.price !== undefined && Number(prev.price) !== Number(values.price)) {
    await create('price_history', { contract_id: id, price: values.price, date: date || toISO(new Date()), note });
  }
  return c;
}

// ---------- Documentos (Storage) ----------

const BUCKET = 'documentos';
const safeName = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);

export async function uploadDocument(file, { property_id = null, contract_id = null, kind = 'contrato', name }) {
  if (file.size > 25 * 1024 * 1024) throw new Error('El archivo supera los 25 MB.');
  const path = `${store.user.id}/${property_id || 'personal'}/${Date.now()}-${safeName(file.name)}`;
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw up.error;
  try {
    return await create('documents', {
      property_id, contract_id, kind, path,
      name: name || file.name, size_bytes: file.size, mime_type: file.type || null,
    });
  } catch (e) {
    await sb.storage.from(BUCKET).remove([path]);
    throw e;
  }
}

export async function openDocument(doc) {
  const w = window.open('', '_blank'); // abrir antes de la llamada async evita bloqueos de pop-up
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(doc.path, 300);
  if (error) { if (w) w.close(); throw error; }
  if (w) w.location = data.signedUrl; else window.location.href = data.signedUrl;
}

export async function deleteDocument(doc) {
  const { error } = await sb.storage.from(BUCKET).remove([doc.path]);
  if (error) throw error;
  await remove('documents', doc.id);
}
