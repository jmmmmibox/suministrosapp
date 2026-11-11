-- Migración 001: "Quién lo paga" en contratos y gastos.
-- Pégala en Supabase > SQL Editor > Run. Es seguro ejecutarla más de una vez.
-- Los datos existentes quedan como 'me' (los pagas tú).

alter table public.contracts
  add column if not exists paid_by text not null default 'me' check (paid_by in ('me', 'tenant'));

alter table public.expenses
  add column if not exists paid_by text not null default 'me' check (paid_by in ('me', 'tenant'));

notify pgrst, 'reload schema';
