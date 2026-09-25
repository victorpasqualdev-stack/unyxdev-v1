-- Migration incremental e não destrutiva para a tabela legada de agendamentos.
-- Execute schema.sql primeiro e, depois, esta migration no SQL Editor do Supabase.
-- Ela não apaga nem importa registros existentes.

create extension if not exists pgcrypto;

-- A migration pode rodar mesmo quando o schema principal ainda não foi aplicado.
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text,
  short_description text,
  phone text,
  email text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_postal_code text,
  address_reference text,
  review_link text,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table appointments add column if not exists company_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_company_id_fkey') then
    alter table appointments
      add constraint appointments_company_id_fkey
      foreign key (company_id) references companies(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_appointments_company_id on appointments(company_id);
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'appointment_date'
  ) then
    execute 'create index if not exists idx_appointments_company_date_legacy on public.appointments(company_id, appointment_date)';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'date'
  ) then
    execute 'create index if not exists idx_appointments_company_date_legacy on public.appointments(company_id, date)';
  end if;
end $$;

comment on column appointments.company_id is 'Empresa dona do agendamento. Deve ser preenchido antes de tornar a coluna obrigatória.';


