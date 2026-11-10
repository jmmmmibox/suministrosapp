// Arranque: sesión, navegación por hash y estructura general.
import { sb, store, loadAll, seedCategoriesIfEmpty, setFilter } from './db.js';
import { h, bus, toast, errMsg } from './ui.js';
import {
  dashboardView, contractsView, contractDetailView, alertsView, alertCount, expensesView, incomesView,
  propertiesView, propertyDetailView, documentsView, settingsView,
} from './views.js';

const VIEWS = {
  panel: dashboardView, contratos: contractsView, contrato: contractDetailView, avisos: alertsView,
  gastos: expensesView, ingresos: incomesView, propiedades: propertiesView, propiedad: propertyDetailView,
  documentos: documentsView, ajustes: settingsView,
};

// Qué pestaña se marca como activa para cada ruta
const NAV_GROUP = { contrato: 'contratos', propiedad: 'propiedades' };

const NAV = [
  ['panel', 'Panel', '📊'], ['contratos', 'Contratos', '📑'], ['gastos', 'Gastos', '💸'], ['ingresos', 'Ingresos', '💶'],
  ['avisos', 'Avisos', '🔔'], ['propiedades', 'Propiedades', '🏠'], ['documentos', 'Documentos', '🗂️'], ['ajustes', 'Ajustes', '⚙️'],
];
const BOTTOM = ['panel', 'contratos', 'gastos', 'ingresos', 'mas'];

const app = document.getElementById('app');
let main = null;
let navEls = [];
let filterSel = null;
let bell = null;

try {
  const t = localStorage.getItem('sm_theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch { /* sin almacenamiento */ }

// ---------- Login ----------

function showLogin() {
  store.user = null;
  main = null;
  const email = h('input', { type: 'email', name: 'email', placeholder: 'Email', autocomplete: 'username', required: true });
  const pass = h('input', { type: 'password', name: 'password', placeholder: 'Contraseña', autocomplete: 'current-password', required: true, minlength: 6 });
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  let signup = false;
  const submit = h('button', { type: 'submit', class: 'btn primary block' }, 'Entrar');
  const toggle = h('button', {
    type: 'button', class: 'link-btn',
    onclick: () => {
      signup = !signup;
      submit.textContent = signup ? 'Crear cuenta' : 'Entrar';
      toggle.textContent = signup ? 'Ya tengo cuenta' : 'Crear cuenta nueva';
      pass.autocomplete = signup ? 'new-password' : 'current-password';
      msg.textContent = '';
    },
  }, 'Crear cuenta nueva');

  const form = h('form', {
    class: 'login-card',
    onsubmit: async (e) => {
      e.preventDefault();
      msg.textContent = '';
      submit.disabled = true;
      try {
        const creds = { email: email.value.trim(), password: pass.value };
        const res = signup ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
        if (res.error) throw res.error;
        if (res.data.session) await enter(res.data.session.user);
        else msg.textContent = 'Cuenta creada. Revisa tu correo para confirmarla y vuelve a entrar.';
      } catch (err) {
        msg.textContent = err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : errMsg(err);
      } finally {
        submit.disabled = false;
      }
    },
  },
  h('div', { class: 'logo' }, '🧾'), h('h1', {}, 'Suministros'),
  h('p', { class: 'muted' }, 'Tus contratos, gastos e ingresos en un sitio.'),
  email, pass, submit, msg, toggle);
  app.replaceChildren(h('div', { class: 'login' }, form));
}

// ---------- Estructura ----------

function buildShell() {
  filterSel = h('select', {
    class: 'scope', 'aria-label': 'Filtrar por propiedad',
    onchange: (e) => { setFilter(e.target.value); render(); },
  });
  bell = h('a', { href: '#/avisos', class: 'bell', 'aria-label': 'Avisos' }, '🔔', h('span', { class: 'count' }));
  main = h('main', { id: 'main' });

  navEls = [];
  const side = h('nav', { class: 'side' }, h('div', { class: 'brand' }, '🧾 Suministros'),
    NAV.map(([key, label, icon]) => {
      const a = h('a', { href: `#/${key}`, 'data-nav': key }, h('span', {}, icon), label);
      navEls.push(a);
      return a;
    }));

  const sheet = h('div', { class: 'more-sheet', hidden: true },
    NAV.filter(([k]) => ['avisos', 'propiedades', 'documentos', 'ajustes'].includes(k)).map(([key, label, icon]) =>
      h('a', { href: `#/${key}`, 'data-nav': key, onclick: () => { sheet.hidden = true; } }, h('span', {}, icon), label)));
  navEls.push(...sheet.querySelectorAll('a'));

  const bottom = h('nav', { class: 'bottom' }, BOTTOM.map((key) => {
    if (key === 'mas') return h('button', { type: 'button', 'data-nav': 'mas', onclick: () => { sheet.hidden = !sheet.hidden; } }, h('span', {}, '☰'), 'Más');
    const [, label, icon] = NAV.find(([k]) => k === key);
    const a = h('a', { href: `#/${key}`, 'data-nav': key }, h('span', {}, icon), label);
    navEls.push(a);
    return a;
  }));

  app.replaceChildren(h('div', { class: 'shell' }, side,
    h('div', { class: 'content' },
      h('header', { class: 'topbar' }, filterSel, bell), main),
    bottom, sheet));
}

function refreshScope() {
  const opts = [['all', 'Todas las propiedades'], ['personal', 'Personal'],
    ...[...store.data.properties].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => [p.id, p.name])];
  filterSel.replaceChildren(...opts.map(([v, l]) => h('option', { value: v, selected: v === store.filter }, l)));
}

function parseRoute() {
  const parts = (location.hash || '#/panel').replace(/^#\//, '').split('/');
  return { name: VIEWS[parts[0]] ? parts[0] : 'panel', id: parts[1] };
}

function render() {
  if (!main) return;
  const { name, id } = parseRoute();
  refreshScope();
  try {
    main.replaceChildren(VIEWS[name](id));
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'empty' }, h('p', {}, `Error al mostrar la pantalla: ${errMsg(e)}`)));
  }
  const active = NAV_GROUP[name] || name;
  navEls.forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  const n = alertCount();
  const c = bell.querySelector('.count');
  c.textContent = n || '';
  c.hidden = !n;
}

bus.rerender = render;

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
  document.querySelector('.more-sheet')?.setAttribute('hidden', '');
});

// ---------- Entrada ----------

async function enter(user) {
  store.user = user;
  app.replaceChildren(h('div', { class: 'loading' }, 'Cargando…'));
  try {
    await loadAll();
    await seedCategoriesIfEmpty();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
      h('h1', {}, 'No se pudo cargar'),
      h('p', { class: 'form-msg' }, errMsg(e)),
      h('p', { class: 'muted' }, '¿Has ejecutado schema.sql en Supabase? Es necesario la primera vez.'),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reintentar'),
      h('button', { class: 'link-btn', onclick: () => sb.auth.signOut() }, 'Cerrar sesión'))));
    return;
  }
  buildShell();
  if (!location.hash) location.hash = '#/panel';
  render();
}

async function boot() {
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') showLogin(); });
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user); else showLogin();
}

boot().catch((e) => { console.error(e); toast(errMsg(e), 'error'); showLogin(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
