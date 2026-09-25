-- Seed inicial do UnyxChat.AI.
-- Insere somente a empresa e suas configuracoes operacionais.
-- Nao insere profissionais, servicos, clientes, conversas ou agendamentos.

begin;

-- ID fixo para que este seed possa ser reconhecido sem depender de credenciais.
insert into companies (
  id,
  name,
  segment,
  short_description,
  phone,
  email,
  address_street,
  address_number,
  address_neighborhood,
  address_city,
  address_state,
  address_postal_code,
  address_reference,
  review_link,
  timezone,
  status
) values (
  '11111111-1111-4111-8111-111111111111',
  'Camila Orige Massoterapeuta',
  'Massoterapia',
  'Massagem estética e terapêutica.',
  '48-99609-9118',
  'camilaorige.massoterapeuta@gmail.com',
  'R. Luís Pedro Oliveira',
  's/nº',
  'Humaitá de Cima',
  'Tubarão',
  'SC',
  '88704-290',
  'ao lado da academia Elas Fitness',
  'https://g.page/r/CRdjuByJAmBCEBM/review',
  'America/Sao_Paulo',
  'active'
)
on conflict (id) do nothing;

-- Horario semanal: todos os dias, das 08:00 as 20:00, sem pausa.
insert into business_hours (
  id, company_id, day_of_week, schedule_type, start_time, end_time, is_active
) values
  ('21111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 0, 'weekly', '08:00', '20:00', true),
  ('21111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', 1, 'weekly', '08:00', '20:00', true),
  ('21111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111111', 2, 'weekly', '08:00', '20:00', true),
  ('21111111-1111-4111-8111-111111111114', '11111111-1111-4111-8111-111111111111', 3, 'weekly', '08:00', '20:00', true),
  ('21111111-1111-4111-8111-111111111115', '11111111-1111-4111-8111-111111111111', 4, 'weekly', '08:00', '20:00', true),
  ('21111111-1111-4111-8111-111111111116', '11111111-1111-4111-8111-111111111111', 5, 'weekly', '08:00', '20:00', true),
  ('21111111-1111-4111-8111-111111111117', '11111111-1111-4111-8111-111111111111', 6, 'weekly', '08:00', '20:00', true)
on conflict (id) do nothing;

-- Regra estruturada: nos meses 9, 10 e 11, atende somente em dias impares.
insert into business_schedule_rules (
  id, company_id, rule_type, description, configuration, is_active
) values (
  '31111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'day_parity',
  'Atende em dias impares durante setembro, outubro e novembro.',
  '{"parity":"odd","months":[9,10,11],"applies_to":"calendar_days"}'::jsonb,
  true
)
on conflict (id) do nothing;

-- Formas de pagamento aceitas.
insert into payment_methods (id, company_id, name, is_active) values
  ('41111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Pix', true),
  ('41111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', 'Débito', true),
  ('41111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111111', 'Cartão de crédito por aproximação', true),
  ('41111111-1111-4111-8111-111111111114', '11111111-1111-4111-8111-111111111111', 'Link de pagamento', true)
on conflict (id) do nothing;

-- Lembrete uma hora antes do procedimento.
insert into notification_rules (
  id, company_id, reminder_type, advance_minutes, channel, message_template, is_active
) values (
  '51111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'appointment_reminder',
  60,
  'whatsapp',
  'Lembrete: seu procedimento será realizado daqui a uma hora.',
  true
)
on conflict (id) do nothing;

-- Cancelamento sem custo com aviso minimo de 24 horas.
insert into cancellation_policies (
  id, company_id, description, minimum_notice_minutes, additional_charge, is_active
) values (
  '61111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'Cancelamento sem custo quando avisado com no minimo 24 horas de antecedencia.',
  1440,
  null,
  true
)
on conflict (id) do nothing;

-- Tom de atendimento para orientar respostas futuras do chatbot.
insert into knowledge_base_entries (
  id, company_id, title, category, content, keywords, status, priority
) values (
  '71111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'Tom de atendimento',
  'atendimento',
  'O atendimento deve ser simpático, educado, atencioso, carinhoso, cuidadoso e humano.',
  array['tom de voz', 'atendimento', 'comunicacao'],
  'active',
  100
)
on conflict (id) do nothing;

commit;
