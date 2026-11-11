// Prueba de humo: arranca la app en jsdom con un Supabase falso y recorre todas las pantallas.
import { register } from 'node:module';
import assert from 'node:assert/strict';
register('./stub-loader.mjs', import.meta.url);

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'location', 'localStorage', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? globalThis[k], configurable: true, writable: true });
}
globalThis.confirm = () => true;
dom.window.scrollTo = () => {};
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);

const { tables } = await import('./supabase-stub.mjs');
const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };
tables.properties = [
  { id: 'p1', user_id: 'u1', name: 'Mi casa', type: 'vivienda', color: '#4f8cff', surface_m2: 90, occupants: 3, created_at: '2026-01-01' },
  { id: 'p2', user_id: 'u1', name: 'Piso 2', type: 'alquilada', color: '#e0803a', surface_m2: 60, created_at: '2026-01-01' },
];
tables.contracts = [
  { id: 'c1', property_id: 'p1', category: 'Luz', provider: 'Iberdrola', price: 55, billing_period: 'monthly', status: 'active', renewal_date: iso(10), notice_days: 30, created_at: '2024-01-01' },
  { id: 'c2', property_id: 'p2', category: 'Internet', provider: 'Movistar', price: 40, billing_period: 'monthly', status: 'active', permanence_end: iso(-5), notice_days: 30, created_at: '2026-01-01' },
  { id: 'c4', property_id: 'p2', category: 'Agua', provider: 'Emasesa', price: 25, billing_period: 'monthly', status: 'active', paid_by: 'Inquilino', created_at: '2026-01-01' },
  { id: 'c3', property_id: null, category: 'Streaming', provider: 'Netflix', price: 120, billing_period: 'annual', status: 'cancelled', created_at: '2026-01-01' },
];
tables.expenses = [{ id: 'e1', property_id: 'p1', category: 'Comunidad', concept: 'Comunidad', amount: 90, period: 'quarterly', recurring: true, date: '2026-01-01', created_at: '2026-01-01' }];
tables.incomes = [{ id: 'i1', property_id: 'p2', concept: 'Alquiler', amount: 650, period: 'monthly', recurring: true, date: '2026-01-01', created_at: '2026-01-01' }];
tables.offers = [{ id: 'o1', contract_id: 'c1', provider: 'Octopus', price: 40, billing_period: 'monthly', date: '2026-11-01', created_at: '2026-11-01' }];
tables.price_history = [{ id: 'h1', contract_id: 'c1', price: 55, date: '2026-01-01', created_at: '2026-01-01' }];
tables.documents = [{ id: 'd1', contract_id: 'c1', property_id: 'p1', name: 'Contrato luz', kind: 'contrato', path: 'u1/p1/x.pdf', size_bytes: 2048, created_at: '2026-01-01' }];
tables.categories = [['Luz', '💡'], ['Internet', '🌐'], ['Streaming', '🎬'], ['Comunidad', '🏢']].map(([name, icon], i) => ({ id: `k${i}`, name, icon }));

await import('../js/app.js');
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
await wait(100);

const main = () => document.getElementById('main');
const text = () => main().textContent;
const routes = ['panel', 'contratos', 'contrato/c1', 'contrato/c3', 'gastos', 'ingresos', 'avisos', 'propiedades', 'propiedad/p1', 'propiedad/personal', 'documentos', 'ajustes', 'contrato/noexiste'];
for (const r of routes) {
  location.hash = `#/${r}`;
  await wait();
  assert.ok(main(), `shell montado en ${r}`);
  assert.ok(!text().includes('Error al mostrar'), `sin error en ${r}: ${text().slice(0, 120)}`);
  assert.ok(text().length > 10, `contenido en ${r}`);
  console.log('ok -', r);
}

location.hash = '#/panel'; await wait();
assert.match(text(), /Gasto mensual ahora/);
assert.match(text(), /Iberdrola/);            // aviso próximo
assert.match(text(), /Mi casa/);              // tabla por propiedad
location.hash = '#/contrato/c1'; await wait();
assert.match(text(), /Octopus/);              // oferta
assert.match(text(), /Ahorras/);              // ahorro frente a la actual
assert.match(text(), /Contrato luz/);         // documento
// filtro por propiedad
const sel = document.querySelector('.scope'); sel.value = 'p2'; sel.dispatchEvent(new dom.window.Event('change')); await wait();
location.hash = '#/contratos'; await wait();
assert.match(text(), /Movistar/); assert.doesNotMatch(text(), /Iberdrola/);

// Contrato pagado por el inquilino: aparece etiquetado y no suma al gasto
location.hash = '#/contratos'; await wait();
assert.match(text(), /Emasesa/); assert.match(text(), /Lo paga: Inquilino/);
location.hash = '#/contrato/c4'; await wait();
assert.match(text(), /Lo paga: Inquilino/);
location.hash = '#/propiedad/p2'; await wait();
assert.match(text(), /Emasesa/); assert.match(text(), /Lo paga: Inquilino/);

// Alta de contrato por formulario
const { contractForm } = await import('../js/forms.js');
sel.value = 'all'; sel.dispatchEvent(new dom.window.Event('change')); await wait();
contractForm(null, { property_id: 'p1' });
const form = document.querySelector('.modal form');
assert.ok(form, 'formulario abierto');
form.elements.provider.value = 'Naturgy';
form.elements.category.value = 'Luz';
form.elements.price.value = '33.5';
form.elements.paid_by.value = 'Inquilino';
form.elements.renewal_date.value = iso(200);
form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
await wait(80);
const nuevo = tables.contracts.find((c) => c.provider === 'Naturgy');
assert.ok(nuevo, 'contrato creado');
assert.equal(nuevo.property_id, 'p1');
assert.equal(nuevo.price, 33.5);
assert.equal(nuevo.notice_days, 30);
assert.equal(nuevo.paid_by, 'Inquilino');
assert.ok(tables.price_history.some((h) => h.contract_id === nuevo.id), 'historial inicial creado');
assert.ok(!document.querySelector('.modal'), 'modal cerrado');
// validación: sin compañía no guarda
contractForm();
document.querySelector('.modal form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
await wait();
assert.ok(document.querySelector('.modal'), 'sigue abierto si falta un campo');
console.log('ok - alta de contrato');
console.log('\nPrueba de humo OK');
process.exit(0);
