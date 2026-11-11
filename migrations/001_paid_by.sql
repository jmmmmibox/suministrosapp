-- Migración 001: "Lo paga otra persona" en contratos y gastos.
-- Pégala en Supabase > SQL Editor > Run. Es seguro ejecutarla más de una vez
-- (y también si ya habías ejecutado la versión anterior de este archivo).
-- Campo vacío = lo pagas tú. Si trae un nombre (p. ej. Inquilino), lo paga otra persona.

alter table public.contracts add column if not exists paid_by text;
alter table public.expenses  add column if not exists paid_by text;

-- Limpieza por si se ejecutó la versión anterior (valores fijos me / tenant)
alter table public.contracts drop constraint if exists contracts_paid_by_check;
alter table public.expenses  drop constraint if exists expenses_paid_by_check;
alter table public.contracts alter column paid_by drop not null;
alter table public.expenses  alter column paid_by drop not null;
alter table public.contracts alter column paid_by drop default;
alter table public.expenses  alter column paid_by drop default;
update public.contracts set paid_by = null where paid_by = 'me';
update public.expenses  set paid_by = null where paid_by = 'me';
update public.contracts set paid_by = 'Inquilino' where paid_by = 'tenant';
update public.expenses  set paid_by = 'Inquilino' where paid_by = 'tenant';

notify pgrst, 'reload schema';
