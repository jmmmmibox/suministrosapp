-- ============================================================
-- Suministros App - esquema de base de datos (Supabase / Postgres)
-- Pega este archivo completo en: Supabase > SQL Editor > Run
-- Es seguro ejecutarlo más de una vez.
-- ============================================================

-- ---------- Tablas ----------

create table if not exists public.properties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  address     text,
  type        text not null default 'vivienda',  -- vivienda | alquilada | local | otra
  color       text not null default '#4f8cff',
  surface_m2  numeric,
  occupants   integer,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  icon        text not null default '📄',
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.contracts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id      uuid references public.properties(id) on delete cascade, -- null = Personal
  category         text not null default 'Otros',
  provider         text not null,
  name             text,
  contract_number  text,
  holder           text,
  paid_by          text not null default 'me' check (paid_by in ('me', 'tenant')), -- me | tenant
  price            numeric not null default 0,
  billing_period   text not null default 'monthly', -- monthly | bimonthly | quarterly | semiannual | annual
  start_date       date,
  end_date         date,
  renewal_date     date,
  permanence_end   date,
  penalty          numeric,
  notice_days      integer not null default 30,
  auto_renew       boolean not null default true,
  status           text not null default 'active',  -- active | cancelled
  last_reviewed    date,
  notes            text,
  created_at       timestamptz not null default now()
);

create table if not exists public.price_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  price        numeric not null,
  date         date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id  uuid references public.properties(id) on delete cascade,
  contract_id  uuid references public.contracts(id) on delete set null,
  concept      text not null,
  category     text not null default 'Otros',
  amount       numeric not null default 0,
  paid_by      text not null default 'me' check (paid_by in ('me', 'tenant')), -- me | tenant
  date         date not null default current_date,
  recurring    boolean not null default false,
  period       text not null default 'monthly',
  end_date     date,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.incomes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id  uuid references public.properties(id) on delete cascade,
  concept      text not null default 'Alquiler',
  tenant       text,
  amount       numeric not null default 0,
  date         date not null default current_date,
  recurring    boolean not null default true,
  period       text not null default 'monthly',
  end_date     date,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.offers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  provider     text not null,
  price        numeric not null,
  billing_period text not null default 'monthly',
  conditions   text,
  url          text,
  date         date not null default current_date,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id  uuid references public.properties(id) on delete cascade,
  contract_id  uuid references public.contracts(id) on delete cascade,
  name         text not null,
  kind         text not null default 'contrato', -- contrato | factura | escritura | certificado | otro
  path         text not null,                    -- ruta en el bucket "documentos"
  size_bytes   bigint,
  mime_type    text,
  created_at   timestamptz not null default now()
);

-- ---------- Actualizaciones para bases de datos ya creadas ----------
alter table public.contracts add column if not exists paid_by text not null default 'me' check (paid_by in ('me', 'tenant'));
alter table public.expenses  add column if not exists paid_by text not null default 'me' check (paid_by in ('me', 'tenant'));

-- ---------- Índices ----------
create index if not exists idx_contracts_property   on public.contracts(property_id);
create index if not exists idx_contracts_user       on public.contracts(user_id);
create index if not exists idx_expenses_property    on public.expenses(property_id);
create index if not exists idx_incomes_property     on public.incomes(property_id);
create index if not exists idx_offers_contract      on public.offers(contract_id);
create index if not exists idx_documents_contract   on public.documents(contract_id);
create index if not exists idx_documents_property   on public.documents(property_id);
create index if not exists idx_price_history_contract on public.price_history(contract_id);

-- ---------- Seguridad por fila (RLS): cada usuario solo ve lo suyo ----------
do $$
declare t text;
begin
  foreach t in array array[
    'properties','categories','contracts','price_history',
    'expenses','incomes','offers','documents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "own_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "own_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own_delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- Almacenamiento de documentos (bucket privado) ----------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Los archivos se guardan como  <user_id>/<carpeta>/<archivo>
drop policy if exists "docs_select" on storage.objects;
drop policy if exists "docs_insert" on storage.objects;
drop policy if exists "docs_update" on storage.objects;
drop policy if exists "docs_delete" on storage.objects;

create policy "docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_update" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
