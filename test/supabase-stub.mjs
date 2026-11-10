let seq = 0;
export const tables = {};
const T = (n) => (tables[n] ||= []);
function query(name) {
  const st = { op: 'select', filters: [], payload: null, single: false };
  const run = () => {
    const rows = T(name);
    if (st.op === 'select') return { data: rows.filter((r) => st.filters.every(([k, v]) => r[k] === v)), error: null };
    if (st.op === 'insert') {
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: `id${++seq}`, user_id: 'u1', created_at: new Date().toISOString(), ...r }));
      rows.push(...list);
      return { data: st.single ? list[0] : list, error: null };
    }
    if (st.op === 'update') {
      const hit = rows.filter((r) => st.filters.every(([k, v]) => r[k] === v));
      hit.forEach((r) => Object.assign(r, st.payload));
      return { data: st.single ? hit[0] : hit, error: null };
    }
    if (st.op === 'delete') { tables[name] = rows.filter((r) => !st.filters.every(([k, v]) => r[k] === v)); return { data: null, error: null }; }
  };
  const q = {
    select() { if (st.op === 'select') st.op = 'select'; return q; },
    insert(p) { st.op = 'insert'; st.payload = p; return q; },
    update(p) { st.op = 'update'; st.payload = p; return q; },
    delete() { st.op = 'delete'; return q; },
    eq(k, v) { st.filters.push([k, v]); return q; },
    single() { st.single = true; return q; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return q;
}
export function createClient() {
  return {
    from: query,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'test@test.es' } } } }),
      onAuthStateChange: () => {}, signOut: async () => {},
      signInWithPassword: async () => ({ data: {}, error: null }), signUp: async () => ({ data: {}, error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) }) },
  };
}
