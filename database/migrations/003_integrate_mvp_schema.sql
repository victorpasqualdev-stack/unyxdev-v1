-- Integra o banco legado ao backend/API do MVP sem apagar dados existentes.
-- Mantém as colunas antigas em appointments para compatibilidade e auditoria.

begin;

create extension if not exists pgcrypto;

-- Padronização de empresas e tabelas de catálogo.
alter table public.companies add column if not exists status text;
update public.companies set status = case when active then 'active' else 'inactive' end where status is null;
alter table public.companies alter column status set default 'active';
alter table public.companies alter column status set not null;

alter table public.companies add column if not exists updated_at timestamptz not null default now();
alter table public.professionals add column if not exists is_active boolean not null default true;
update public.professionals set is_active = active where is_active is distinct from active;
alter table public.services add column if not exists internal_code text;
update public.services set internal_code = code where internal_code is null;
alter table public.services alter column internal_code set not null;
alter table public.services add column if not exists is_active boolean not null default true;
update public.services set is_active = active where is_active is distinct from active;

-- Clientes finais: cada telefone pertence apenas a uma empresa.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  phone text not null,
  email text,
  contact_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, phone),
  unique (company_id, id)
);

-- Novas relações normalizadas do agendamento.
alter table public.appointments add column if not exists customer_id uuid;
alter table public.appointments add column if not exists professional_id uuid;
alter table public.appointments add column if not exists service_id uuid;
alter table public.appointments add column if not exists appointment_date date;
alter table public.appointments add column if not exists start_time time;
alter table public.appointments add column if not exists end_time time;
alter table public.appointments add column if not exists amount numeric(12,2);
alter table public.appointments add column if not exists internal_notes text;
alter table public.appointments add column if not exists updated_at timestamptz not null default now();

-- Converte status legados para o padrão da API.
update public.appointments
set status = case lower(trim(status))
  when 'confirmado' then 'confirmed'
  when 'confirmed' then 'confirmed'
  when 'pendente' then 'scheduled'
  when 'scheduled' then 'scheduled'
  when 'cancelado' then 'cancelled'
  when 'cancelled' then 'cancelled'
  when 'realizado' then 'completed'
  when 'completed' then 'completed'
  when 'faltou' then 'no_show'
  when 'no_show' then 'no_show'
  else 'scheduled'
end;
alter table public.appointments alter column status set default 'scheduled';

-- Cria os clientes dos registros atuais e conecta cada agendamento a seus IDs.
insert into public.customers (company_id, name, phone)
select company_id, max(customer_name), customer_phone
from public.appointments
group by company_id, customer_phone
on conflict (company_id, phone) do update set name = excluded.name;

update public.appointments a
set customer_id = c.id
from public.customers c
where c.company_id = a.company_id
  and c.phone = a.customer_phone
  and a.customer_id is null;

update public.appointments a
set professional_id = p.id
from public.professionals p
where p.company_id = a.company_id
  and lower(trim(p.name)) = lower(trim(a.professional_name))
  and a.professional_id is null;

update public.appointments a
set service_id = s.id
from public.services s
where s.company_id = a.company_id
  and lower(trim(s.name)) = lower(trim(a.service_name))
  and a.service_id is null;

update public.appointments
set appointment_date = date,
    start_time = time,
    amount = price
where appointment_date is null or start_time is null or amount is null;

update public.appointments a
set end_time = (a.start_time + make_interval(mins => s.duration_minutes))::time
from public.services s
where s.id = a.service_id and a.end_time is null;

-- Interrompe sem alterar nada caso haja um registro legado sem correspondência.
do $$
begin
  if exists (
    select 1 from public.appointments
    where customer_id is null or professional_id is null or service_id is null
       or appointment_date is null or start_time is null or end_time is null or amount is null
  ) then
    raise exception 'Migration interrompida: existe agendamento sem cliente, profissional, serviço ou horário correspondente.';
  end if;
end $$;

alter table public.appointments alter column customer_id set not null;
alter table public.appointments alter column professional_id set not null;
alter table public.appointments alter column service_id set not null;
alter table public.appointments alter column appointment_date set not null;
alter table public.appointments alter column start_time set not null;
alter table public.appointments alter column end_time set not null;
alter table public.appointments alter column amount set not null;

-- Chaves compostas impedem que um agendamento aponte para dados de outra empresa.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'professionals_company_id_id_key') then
    alter table public.professionals add constraint professionals_company_id_id_key unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'services_company_id_id_key') then
    alter table public.services add constraint services_company_id_id_key unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_customer_company_fkey') then
    alter table public.appointments add constraint appointments_customer_company_fkey foreign key (company_id, customer_id) references public.customers(company_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_professional_company_fkey') then
    alter table public.appointments add constraint appointments_professional_company_fkey foreign key (company_id, professional_id) references public.professionals(company_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_service_company_fkey') then
    alter table public.appointments add constraint appointments_service_company_fkey foreign key (company_id, service_id) references public.services(company_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_status_check') then
    alter table public.appointments add constraint appointments_status_check check (status in ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_time_order_check') then
    alter table public.appointments add constraint appointments_time_order_check check (end_time > start_time);
  end if;
end $$;

create index if not exists idx_professionals_company_active on public.professionals(company_id, is_active);
create index if not exists idx_services_company_active on public.services(company_id, is_active);
create index if not exists idx_customers_company_phone on public.customers(company_id, phone);
create index if not exists idx_appointments_company_date_v2 on public.appointments(company_id, appointment_date);
create index if not exists idx_appointments_company_status on public.appointments(company_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();

-- A API é a única porta de acesso aos dados. Apps não consultam tabelas diretamente.
alter table public.companies enable row level security;
alter table public.professionals enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.business_settings enable row level security;
alter table public.user_companies enable row level security;

commit;
