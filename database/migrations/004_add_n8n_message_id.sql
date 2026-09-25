-- Evita que uma nova tentativa do n8n crie o mesmo agendamento duas vezes.
-- Execute uma única vez no SQL Editor do Supabase antes de ativar o workflow.

begin;

alter table public.appointments
  add column if not exists n8n_message_id text;

create unique index if not exists idx_appointments_company_n8n_message_id
  on public.appointments (company_id, n8n_message_id)
  where n8n_message_id is not null;

comment on column public.appointments.n8n_message_id is
  'Identificador da mensagem/origem no n8n para garantir idempotência.';

commit;
