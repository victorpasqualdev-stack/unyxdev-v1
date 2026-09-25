# Administração global

Acesse `/admin` com uma conta confirmada do Supabase Auth cujo e-mail esteja em `ADMIN_EMAILS` no servidor. A entrada administrativa é `/admin/login` e redireciona para `/admin`. O login do cliente em `/login` permanece independente. Contas comuns de empresas não recebem acesso global.

Exemplo: `ADMIN_EMAILS=administrador@suaempresa.com`. Reinicie o servidor após alterar o ambiente. Configure a mesma variável na hospedagem ao publicar.

## Cadastro completo

Na lista de empresas, clique em **Gerenciar**. Ao cadastrar uma empresa nova, o painel abre automaticamente suas etapas de configuração.

- **Resumo:** dados gerais, contato, endereço, descrição, código de integração, link de avaliações, fuso horário e checklist de preenchimento.
- **Serviços e pacotes:** nome, código, descrição completa, duração, preço, orientações antes/depois e status. Os pacotes existentes são itens do catálogo de serviços; não possuem controle de sessões ou validade no banco atual.
- **Profissionais:** nome, especialidade e status.
- **Funcionamento:** descrição dos dias/regras de atendimento, início/fim, presença de intervalo, formas de pagamento, antecedência de lembrete/cancelamento em minutos e tom de voz do assistente.
- **Acessos:** contas vinculadas, confirmação do e-mail e vínculo de uma conta existente pelo e-mail. Não cria senhas nem envia convites. Uma conta não é transferida de outra empresa.
- **Atividade:** últimos 50 agendamentos registrados, para acompanhamento. As ações operacionais de agendamento continuam no painel da empresa.

Os formulários leem e gravam as tabelas atuais. Não é necessário abrir o banco para cadastrar ou manter os dados de operação acima. A criação de novas contas de autenticação ainda é feita no Supabase Auth; vincular uma conta já existente é feito no painel.

Inativação mantém os registros e histórico. Empresas inativas não têm acesso às APIs operacionais; serviços/profissionais inativos deixam de ser oferecidos para novos agendamentos. Os campos legados `active`/`is_active` e `code`/`internal_code` são sincronizados ao salvar.

O checklist verifica preenchimento, não prontidão de integrações externas. Descrições livres de horários não são convertidas em validação automática de disponibilidade. Lembretes e políticas ficam disponíveis na API de contexto n8n; a execução depende do fluxo do assistente que consome essa API. O painel não envia mensagens ao salvar.

## Estrutura e compatibilidade

Usa as tabelas reais `companies`, `services`, `professionals`, `business_settings`, `user_companies`, `customers` e `appointments`. Não requer nova migração. Não aplique `database/schema.sql`, que representa uma estrutura anterior e não corresponde integralmente ao banco atual.

Todas as consultas e mutações são limitadas à empresa selecionada, após validação da permissão de administrador no servidor. Identificadores de registros de outra empresa retornam 404. Nomes duplicados de serviços/profissionais e códigos de clientes duplicados são rejeitados para evitar ambiguidade nas integrações que consultam por nome/código.

## Rotas

| Rota após `/api/admin/companies` | Métodos | Finalidade |
| --- | --- | --- |
| `/` | GET, POST | Listar/criar empresas |
| `/:id` | GET, PUT | Consultar/editar dados gerais |
| `/:id/services` | GET, POST | Listar/criar serviços e pacotes |
| `/:id/services/:recordId` | PUT | Editar serviço |
| `/:id/professionals` | GET, POST | Listar/criar profissionais |
| `/:id/professionals/:recordId` | PUT | Editar profissional |
| `/:id/settings` | GET, PUT | Consultar/salvar funcionamento |
| `/:id/accesses` | GET, POST | Listar/vincular contas existentes |
| `/:id/activity` | GET | Consultar atividade recente |

## Validação

- `npm test`: autorização, validações de entrada, transações, conflitos de vínculo e isolamento entre empresas, sem acessar o banco.
- `node tests/admin-database-check.js`: verificação manual com `.env`, lendo as seções existentes e testando o cadastro completo em uma transação revertida. Não mantém dados de teste e não cria contas de autenticação.

## Separação do painel do cliente

A administração tem sua própria sessão, endpoints de autenticação e tela de login. Não há links para alternar para o painel do cliente. Mesmo quando o mesmo e-mail tem ambos os acessos, é necessário entrar em cada área separadamente. A opção Sair encerra somente a sessão da área atual.
