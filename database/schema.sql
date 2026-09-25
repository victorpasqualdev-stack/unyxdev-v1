-- Schema inicial do banco do UnyxChat.AI.
-- Este arquivo cria a estrutura, mas nao cria empresas, clientes ou agendamentos.
-- A autenticacao, o RLS e a integracao com n8n ficam fora desta primeira versao.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Empresas clientes da OnyxChat.AI.
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
  updated_at timestamptz not null default now(),
  constraint companies_email_format check (email is null or position('@' in email) > 1),
  constraint companies_review_link_format check (review_link is null or review_link ~* '^https?://')
);

-- Profissionais que atendem por uma empresa.
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  specialty text,
  phone text not null,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professionals_email_format check (email is null or position('@' in email) > 1),
  constraint professionals_company_id_unique unique (company_id, id)
);

-- Servicos que o chatbot pode explicar e agendar.
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  professional_id uuid,
  internal_code text not null,
  name text not null,
  full_description text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  pre_appointment_instructions text,
  post_appointment_instructions text,
  minimum_booking_notice_minutes integer not null default 0 check (minimum_booking_notice_minutes >= 0),
  minimum_cancellation_notice_minutes integer not null default 0 check (minimum_cancellation_notice_minutes >= 0),
  allows_online_booking boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_company_code_unique unique (company_id, internal_code),
  constraint services_company_id_unique unique (company_id, id),
  constraint services_professional_same_company_fk foreign key (company_id, professional_id) references professionals(company_id, id) on delete restrict
);

-- Pacotes de servicos, especialmente pacotes mensais.
create table if not exists service_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  description text,
  sessions_quantity integer not null check (sessions_quantity > 0),
  session_duration_minutes integer not null check (session_duration_minutes > 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  informed_savings numeric(12,2) check (informed_savings is null or informed_savings >= 0),
  validity_days integer not null check (validity_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Horarios recorrentes de funcionamento.
-- schedule_type permite evoluir de uma grade semanal para dias pares/impares e excecoes.
create table if not exists business_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  day_of_week smallint check (day_of_week is null or day_of_week between 0 and 6),
  schedule_type text not null default 'weekly' check (schedule_type in ('weekly', 'odd_days', 'even_days', 'date_override')),
  start_time time not null,
  end_time time not null,
  break_start_time time,
  break_end_time time,
  valid_from date,
  valid_to date,
  exception_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_time_order check (end_time > start_time),
  constraint business_hours_break_pair check ((break_start_time is null and break_end_time is null) or (break_start_time is not null and break_end_time is not null and break_end_time > break_start_time and break_start_time >= start_time and break_end_time <= end_time)),
  constraint business_hours_validity_order check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint business_hours_schedule_shape check ((schedule_type = 'weekly' and day_of_week is not null and exception_date is null) or (schedule_type in ('odd_days', 'even_days') and exception_date is null) or (schedule_type = 'date_override' and exception_date is not null))
);

-- Regras estruturadas para o chatbot interpretar a agenda.
create table if not exists business_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  rule_type text not null,
  description text not null,
  configuration jsonb not null default '{}'::jsonb,
  valid_from date,
  valid_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_schedule_rules_validity_order check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint business_schedule_rules_configuration_object check (jsonb_typeof(configuration) = 'object')
);

-- Formas de pagamento aceitas por uma empresa.
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_company_name_unique unique (company_id, name)
);

-- Regras de lembretes enviados ao cliente.
create table if not exists notification_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  reminder_type text not null,
  advance_minutes integer not null check (advance_minutes >= 0),
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'other')),
  message_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Politicas de cancelamento da empresa.
create table if not exists cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  description text not null,
  minimum_notice_minutes integer not null check (minimum_notice_minutes >= 0),
  additional_charge numeric(12,2) check (additional_charge is null or additional_charge >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conteudo consultado pelo chatbot; nao armazena conversas completas.
create table if not exists knowledge_base_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  title text not null,
  category text not null,
  content text not null,
  keywords text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Clientes finais; sem dados medicos ou diagnosticos nesta primeira versao.
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  phone text not null,
  email text,
  contact_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_email_format check (email is null or position('@' in email) > 1),
  constraint customers_company_id_unique unique (company_id, id)
);

-- Agendamentos para uso futuro; o seed nao insere nenhum registro aqui.
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  customer_id uuid not null,
  professional_id uuid,
  service_id uuid,
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_order check (end_time > start_time),
  constraint appointments_customer_same_company_fk foreign key (company_id, customer_id) references customers(company_id, id) on delete restrict,
  constraint appointments_professional_same_company_fk foreign key (company_id, professional_id) references professionals(company_id, id) on delete restrict,
  constraint appointments_service_same_company_fk foreign key (company_id, service_id) references services(company_id, id) on delete restrict
);

-- Atualiza updated_at automaticamente nas tabelas editaveis.
drop trigger if exists companies_set_updated_at on companies;
create trigger companies_set_updated_at before update on companies for each row execute function set_updated_at();
drop trigger if exists professionals_set_updated_at on professionals;
create trigger professionals_set_updated_at before update on professionals for each row execute function set_updated_at();
drop trigger if exists services_set_updated_at on services;
create trigger services_set_updated_at before update on services for each row execute function set_updated_at();
drop trigger if exists service_packages_set_updated_at on service_packages;
create trigger service_packages_set_updated_at before update on service_packages for each row execute function set_updated_at();
drop trigger if exists business_hours_set_updated_at on business_hours;
create trigger business_hours_set_updated_at before update on business_hours for each row execute function set_updated_at();
drop trigger if exists business_schedule_rules_set_updated_at on business_schedule_rules;
create trigger business_schedule_rules_set_updated_at before update on business_schedule_rules for each row execute function set_updated_at();
drop trigger if exists payment_methods_set_updated_at on payment_methods;
create trigger payment_methods_set_updated_at before update on payment_methods for each row execute function set_updated_at();
drop trigger if exists notification_rules_set_updated_at on notification_rules;
create trigger notification_rules_set_updated_at before update on notification_rules for each row execute function set_updated_at();
drop trigger if exists cancellation_policies_set_updated_at on cancellation_policies;
create trigger cancellation_policies_set_updated_at before update on cancellation_policies for each row execute function set_updated_at();
drop trigger if exists knowledge_base_entries_set_updated_at on knowledge_base_entries;
create trigger knowledge_base_entries_set_updated_at before update on knowledge_base_entries for each row execute function set_updated_at();
drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at before update on customers for each row execute function set_updated_at();
drop trigger if exists appointments_set_updated_at on appointments;
create trigger appointments_set_updated_at before update on appointments for each row execute function set_updated_at();

-- Indices para isolamento por empresa e consultas recorrentes.
create index if not exists idx_professionals_company_id on professionals(company_id);
create index if not exists idx_services_company_id on services(company_id);
create index if not exists idx_services_company_active on services(company_id, is_active);
create index if not exists idx_services_name on services(company_id, lower(name));
create index if not exists idx_services_search on services using gin (to_tsvector('portuguese', name || ' ' || full_description));
create index if not exists idx_service_packages_company_id on service_packages(company_id);
create index if not exists idx_business_hours_company_id on business_hours(company_id);
create index if not exists idx_business_schedule_rules_company_id on business_schedule_rules(company_id);
create index if not exists idx_payment_methods_company_id on payment_methods(company_id);
create index if not exists idx_notification_rules_company_id on notification_rules(company_id);
create index if not exists idx_cancellation_policies_company_id on cancellation_policies(company_id);
create index if not exists idx_knowledge_base_entries_company_id on knowledge_base_entries(company_id);
create index if not exists idx_knowledge_base_entries_status_priority on knowledge_base_entries(company_id, status, priority desc);
create index if not exists idx_customers_company_id on customers(company_id);
create index if not exists idx_customers_company_phone on customers(company_id, phone);
-- Usa os nomes legados date/time para continuar compatível com a tabela já criada.
create index if not exists idx_appointments_company_date on appointments(company_id, date);
create index if not exists idx_appointments_company_status on appointments(company_id, status);
create index if not exists idx_appointments_date_time on appointments(date, time);
