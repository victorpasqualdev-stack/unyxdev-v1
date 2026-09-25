# Banco de dados do painel

O Supabase desta aplicação foi consolidado pela migration `migrations/003_integrate_mvp_schema.sql`. Ela preserva as colunas legadas de agendamentos e adiciona os relacionamentos por ID usados pelo backend.

**Não execute `schema.sql` no banco atual.** Ele representa uma estrutura anterior e pode conflitar com as tabelas já implantadas.

## Ordem para um banco novo

1. Aplique as migrations em ordem, incluindo `003_integrate_mvp_schema.sql`.
2. Crie o usuário no Supabase Auth e associe o UUID dele à empresa em `user_companies`.

A migração `001_add_company_scope_to_appointments.sql` existe somente para instalações antigas que ainda tinham a tabela de agendamentos com colunas legadas. Ela foi ajustada para reconhecer tanto `date` quanto `appointment_date`, mas não é necessária em um banco criado a partir do schema atual.
