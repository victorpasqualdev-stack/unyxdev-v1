-- Liga cada usuário autenticado do Supabase a uma única empresa.
-- Senhas NÃO são armazenadas nesta tabela: elas pertencem ao Supabase Auth.
create table if not exists public.user_companies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_companies_company_id
  on public.user_companies(company_id);

-- Não habilite RLS nesta tabela enquanto o backend usar DATABASE_URL com a role postgres.
-- O backend valida o usuário no Supabase Auth e filtra cada consulta pelo company_id vinculado.
