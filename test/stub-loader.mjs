// Sustituye el import remoto de supabase por un stub en memoria (solo para pruebas).
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://esm.sh/@supabase')) {
    return { url: new URL('./supabase-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
