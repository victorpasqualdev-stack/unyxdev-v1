# API UnyxChat.AI

## Objetivo

O backend é independente de interface. O painel web, o futuro aplicativo Android e o futuro aplicativo iOS usam as mesmas rotas, regras de negócio e isolamento entre empresas.

## Autenticação

- **Web:** `POST /api/auth/login` cria um cookie `client_session` com `HttpOnly`; o token não fica exposto ao JavaScript.
- **Aplicativos nativos:** faça login pelo Supabase Auth e envie o token de acesso em `Authorization: Bearer <token>` em cada chamada à API.
- O backend sempre confirma o usuário no Supabase e procura sua empresa em `user_companies` antes de retornar qualquer dado.

## Rotas principais

As rotas atuais continuam disponíveis para o painel. As equivalentes versionadas para os futuros apps usam o prefixo `/api/v1`.

| Finalidade | Rota |
| --- | --- |
| Verificar disponibilidade | `GET /api/health` |
| Perfil da empresa | `GET /api/v1/companies/:companyId/profile` |
| Dashboard | `GET /api/v1/companies/:companyId/dashboard` |
| Serviços | `GET /api/v1/companies/:companyId/services` |
| Profissionais | `GET /api/v1/companies/:companyId/professionals` |
| Listar agendamentos | `GET /api/v1/companies/:companyId/appointments?date=AAAA-MM-DD` |
| Criar agendamento | `POST /api/v1/companies/:companyId/appointments` |
| Excluir agendamento | `DELETE /api/v1/companies/:companyId/appointments/:appointmentId` |

## Integração n8n

O n8n deve chamar a API, nunca o banco de dados diretamente. Antes de ativar o
workflow, execute `database/migrations/004_add_n8n_message_id.sql` no SQL Editor
do Supabase e defina `N8N_WEBHOOK_SECRET` no `.env` do servidor (não no front-end).

Todas as rotas abaixo exigem o cabeçalho `X-N8N-Webhook-Secret` com esse mesmo
segredo e usam o código público da empresa, por exemplo `CLIENTE-001`:

| Finalidade | Método e rota |
| --- | --- |
| Contexto para o assistente | `GET /api/integrations/n8n/companies/:clientCode/context` |
| Horários ocupados | `GET /api/integrations/n8n/companies/:clientCode/availability?date=AAAA-MM-DD&professional=Nome` |
| Criar agendamento | `POST /api/integrations/n8n/companies/:clientCode/appointments` |

Exemplo de corpo para criação:

```json
{
  "sourceMessageId": "identificador-unico-da-mensagem",
  "date": "2026-10-10",
  "time": "14:00",
  "name": "Nome da pessoa",
  "phone": "48999999999",
  "service": "Nome exato do serviço",
  "professional": "Nome exato do profissional",
  "status": "confirmed"
}
```

`sourceMessageId` torna a chamada idempotente: uma repetição do n8n retorna o
registro existente em vez de duplicar o agendamento.

## Regras de segurança já aplicadas

- Validação de empresa, IDs, data, horário, telefone e tamanho do corpo da requisição.
- Consultas SQL parametrizadas.
- Isolamento por `company_id` em toda consulta de dados da empresa.
- Cabeçalhos de segurança e CORS limitado às origens configuradas.
- Limite de tentativas de login por endereço/IP e e-mail.
- Proteção das páginas internas: sem sessão válida, o navegador retorna a `/login`.

## Produção

Antes de publicar, defina `NODE_ENV=production`, use HTTPS e configure `ALLOWED_ORIGINS` somente com os domínios oficiais. Para escalar a vários servidores, o limite de tentativas de login deve migrar da memória para Redis ou outro armazenamento compartilhado.

## Contexto de atendimento e administração

A resposta de `GET /api/integrations/n8n/companies/:clientCode/context` inclui também endereço, contato, descrição e link de avaliações em `company`, além de `settings` com dias/horários, intervalo, pagamentos, antecedências de lembrete/cancelamento e tom de voz. `settings` pode ser `null` quando a empresa ainda não foi configurada. O fluxo do assistente precisa consumir essas informações para aplicar as regras e enviar lembretes.

Essas informações e o catálogo podem ser mantidos no painel administrativo. Consulte [ADMIN.md](ADMIN.md) para as seções e rotas protegidas.

## URLs públicas

- `/`: site institucional.
- `/login`: entrada exclusiva do cliente; após autenticar, abre a visão geral da empresa.
- `/admin`: painel administrativo protegido; sem sessão administrativa, redireciona para `/admin/login`.
- `/admin/login`: entrada exclusiva da administração.

Os endereços antigos `/login.html`, `/site-institucional.html` e `/admin.html` redirecionam para as URLs correspondentes.

## Sessões independentes

O cliente usa `/api/auth/login`, `/api/auth/me` e `/api/auth/logout`, com o cookie `client_session`. A administração usa `/api/admin-auth/login`, `/api/admin-auth/me` e `/api/admin-auth/logout`, com o cookie `admin_session`. Ambos têm `HttpOnly` e `SameSite=Strict`, além de `Secure` em produção.

O login do cliente exige vínculo com uma empresa ativa. O administrativo exige a permissão global. Uma conta que reúna as duas permissões pode fazer login separadamente em cada área. Sair de uma área apaga apenas o cookie correspondente. Não há links de alternância entre painéis. O cookie compartilhado antigo `session` não é mais aceito: é necessário entrar novamente após a atualização. A autenticação por Bearer para integrações continua sujeita às permissões da conta.

## Indicadores do cliente

A visão geral e a agenda usam `GET /api/companies/:companyId/dashboard` (também disponível em `/api/v1`). O parâmetro opcional `includeAppointments=true` inclui os registros usados pelo calendário no mesmo resultado dos indicadores.

- `period`: dia, horário, mês, fuso da empresa e limites da semana atual.
- `summary.today`: quantidade no dia corrente, sem cancelamentos e faltas. `summary.month`: todos os agendamentos do mês corrente, independentemente do status.
- `summary.projectedRevenue`: soma dos valores agendados no mês corrente, sem cancelamentos e faltas. Inclui pendentes, confirmados e concluídos; não representa recebimentos.
- `summary.upcoming` e `upcoming`: pendentes/confirmados a partir do minuto atual, em ordem de data e horário, incluindo os próximos meses.
- `recent`: cinco registros mais recentes por `created_at`, independentemente da data do atendimento.
- `week`: segunda a domingo da semana atual, incluindo dias sem registros.
- `services`: serviços do mês corrente por quantidade decrescente, com desempate por nome.

As duas telas atualizam os dados a cada minuto enquanto visíveis, ao retomar o foco e após cadastrar/excluir um agendamento. O calendário usa datas completas, começa na segunda-feira e navega entre meses; essa navegação não muda os indicadores do mês corrente. Na agenda do dia, cancelamentos/faltas continuam visíveis com seu status para consulta do histórico.

A navegação do cliente está em `outputs/client-shell.js` e `outputs/client.css`, compartilhada por visão geral, agendamentos e relatórios. Em telas grandes fica fixa à esquerda; em telas pequenas, fixa no topo com os nomes das opções visíveis.

## Visualização e edição de agendamentos

O botão de visualizar abre o mesmo formulário do cadastro, inicialmente bloqueado. A opção **Editar** libera os campos; **Salvar alterações** atualiza o registro existente e fecha o formulário, assim como o cadastro de um novo agendamento. Erros preservam o formulário preenchido.

- `GET /api/companies/:companyId/appointments/:id`: consulta o agendamento atual.
- `PATCH /api/companies/:companyId/appointments/:id`: atualiza data, horário, cliente, telefone, serviço, profissional, valor e status. Envia os mesmos campos do cadastro.

As rotas também existem em `/api/v1`. Ambas validam o vínculo do usuário com a empresa. A edição mantém ID, data de criação e identificador n8n; sincroniza as colunas antigas e atuais. A verificação de conflito ignora o próprio agendamento. Edições de nome/telefone ficam no registro do atendimento, sem renomear outros atendimentos do mesmo cliente.

## Relatórios por período

`GET /api/companies/:companyId/reports?start=AAAA-MM-DD&end=AAAA-MM-DD` aceita um intervalo inclusivo pela data do atendimento. Sem parâmetros, usa o mês atual no fuso da empresa. Datas inválidas, incompletas ou em ordem invertida retornam 400. O mesmo recurso existe em `/api/v1`.

- Total: todos os registros no período, inclusive cancelados e faltas.
- Realizados: horário de início anterior ao momento atual no fuso da empresa, excluindo cancelados e faltas. É uma contagem calculada, sem alterar o status armazenado.
- Cancelados: somente registros com status `cancelled`.
- Projeção: soma dos valores no período, sem cancelados/faltas, com a mesma regra da visão geral; não indica recebimentos.
- Profissionais e serviços: volume não cancelado, contagem de realizados e valores previstos para o intervalo selecionado.

A leitura do período informa atendimentos futuros, confirmações pendentes entre os futuros, taxa/valor dos cancelamentos e valor médio previsto. A tela atualiza a cada minuto quando visível e preserva o filtro aplicado.

O filtro **Mês atual** da agenda lista todos os status, incluindo cancelados e faltas, em correspondência com o total mensal.
