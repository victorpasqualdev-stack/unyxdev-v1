const { companyResource } = require('./admin-resources');
// Global administration is granted only by server configuration.
function isAdmin(user) {
  const emails = (process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.email && user.email_confirmed_at && emails.includes(user.email.toLowerCase()));
}

function companyInput(input) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Cadastro inválido.');
  const values = {};
  for (const [field, max] of Object.entries({ name: 160, segment: 100, phone: 30, email: 254, address: 500, description: 2000, client_code: 50, owner_email: 254 })) {
    if (input[field] != null && typeof input[field] !== 'string') fail('Informe textos válidos nos campos do cadastro.');
    const value = (input[field] || '').trim();
    if (value.length > max) fail(`O campo ${field} excede o tamanho permitido.`);
    values[field] = value || null;
  }
  if (!values.name) fail('Informe o nome da empresa.');
  for (const field of ['email', 'owner_email']) {
    if (values[field] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field])) fail('Informe um e-mail válido.');
  }
  if (values.phone && !/^[+\d\s().-]+$/.test(values.phone)) fail('Informe um telefone válido.');
  if (values.phone && (values.phone.replace(/\D/g, '').length < 10 || values.phone.replace(/\D/g, '').length > 15)) fail('Informe um telefone com DDD.');
  if (!['active', 'inactive'].includes(input.status)) fail('Selecione um status válido.');
  values.status = input.status;
  if (Object.hasOwn(input, 'review_url')) {
    if (typeof input.review_url !== 'string' && input.review_url !== null) fail('Informe um link de avaliações válido.');
    values.review_url = input.review_url?.trim() || null;
    if (values.review_url) {
      let url; try { url = new URL(values.review_url); } catch { fail('Informe um link de avaliações válido.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || values.review_url.length > 2000) fail('Use um link de avaliações HTTP ou HTTPS válido.');
    }
  }
  if (Object.hasOwn(input, 'timezone')) {
    if (typeof input.timezone !== 'string' || !input.timezone || input.timezone.length > 100) fail('Informe um fuso horário válido.');
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: input.timezone }); } catch { fail('Informe um fuso horário válido.'); }
    values.timezone = input.timezone;
  }
  return values;
}

function createAdminApi({ pool, supabaseUser, getAccessToken, readBody, json, isUuid }) {
  return async function adminApi(req, res, url) {
    const user = await supabaseUser(getAccessToken(req));
    if (!user) return json(res, 401, { error: 'Faça login para continuar.' });
    if (!isAdmin(user)) return json(res, 403, { error: 'Acesso exclusivo da administração.' });
    if (!pool) return json(res, 503, { error: 'Banco de dados não configurado.' });
    const match = url.pathname.match(/^\/api\/admin\/companies(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/);
    if (!match) return json(res, 404, { error: 'Rota não encontrada.' });
    const id = match[1];
    if (id && !isUuid(id)) return json(res, 400, { error: 'Empresa inválida.' });
    if (match[2]) return companyResource({ pool, req, res, json, readBody, companyId: id, resource: match[2], recordId: match[3], isUuid });
    if (req.method === 'GET') {
      const result = await pool.query(`
        select c.*,
          (select count(*)::int from customers x where x.company_id=c.id) as customers,
          (select count(*)::int from services x where x.company_id=c.id and x.is_active) as services,
          (select count(*)::int from professionals x where x.company_id=c.id and x.is_active) as professionals,
          (select count(*)::int from user_companies x where x.company_id=c.id) as users,
          (select count(*)::int from appointments x where x.company_id=c.id) as appointments,
          (select max(x.created_at) from appointments x where x.company_id=c.id) as last_activity
        from companies c ${id ? 'where c.id=$1' : ''} order by c.created_at desc`, id ? [id] : []);
      if (id && !result.rows.length) return json(res, 404, { error: 'Empresa não encontrada.' });
      return json(res, 200, id ? result.rows[0] : result.rows);
    }
    if (!(req.method === 'POST' && !id) && !(req.method === 'PUT' && id)) return json(res, 405, { error: 'Método não permitido.' });
    const input = companyInput(await readBody(req));
    const db = await pool.connect();
    try {
      await db.query('begin');
      if (input.client_code) {
        await db.query('select pg_advisory_xact_lock(hashtext(lower($1)))', [input.client_code]);
        const duplicate = await db.query('select id from companies where lower(client_code)=lower($1) and ($2::uuid is null or id<>$2) limit 1', [input.client_code, id || null]);
        if (duplicate.rows.length) throw Object.assign(new Error('Este código de cliente já pertence a outra empresa.'), { status:409 });
      }
      let owner;
      if (input.owner_email) {
        const result = await db.query('select id from auth.users where lower(email)=lower($1)', [input.owner_email]);
        owner = result.rows[0];
        if (!owner) throw Object.assign(new Error('Este e-mail ainda não tem uma conta. Crie o usuário no Supabase Auth e tente novamente, ou salve sem vincular um acesso.'), { status: 400 });
        const existing = await db.query('select company_id from user_companies where user_id=$1', [owner.id]);
        if (existing.rows.length && existing.rows[0].company_id !== id) throw Object.assign(new Error('Este usuário já está vinculado a outra empresa.'), { status: 409 });
      }
      const values = [input.name, input.segment, input.phone, input.email, input.address, input.description, input.client_code, input.status, input.status === 'active'];
      const result = id
        ? await db.query('update companies set name=$1,segment=$2,phone=$3,email=$4,address=$5,description=$6,client_code=$7,status=$8,active=$9,review_url=case when $10 then $11 else review_url end,timezone=coalesce($12,timezone),updated_at=now() where id=$13 returning id', [...values, Object.hasOwn(input, 'review_url'), input.review_url || null, input.timezone || null, id])
        : await db.query("insert into companies (name,segment,phone,email,address,description,client_code,status,active,review_url,timezone) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,'America/Sao_Paulo')) returning id", [...values,input.review_url || null,input.timezone || null]);
      if (!result.rows.length) throw Object.assign(new Error('Empresa não encontrada.'), { status: 404 });
      const companyId = result.rows[0].id;
      if (owner) await db.query('insert into user_companies (user_id,company_id) values ($1,$2) on conflict (user_id) do nothing', [owner.id, companyId]);
      // A concurrent link must never silently assign a user to the wrong company.
      if (owner) {
        const linked = await db.query('select company_id from user_companies where user_id=$1', [owner.id]);
        if (linked.rows[0]?.company_id !== companyId) throw Object.assign(new Error('Este usuário foi vinculado a outra empresa. Atualize e tente novamente.'), { status: 409 });
      }
      await db.query('commit');
      return json(res, id ? 200 : 201, { id: companyId });
    } catch (err) {
      await db.query('rollback');
      if (err.code === '23505') return json(res, 409, { error: 'Já existe um cadastro com esses dados. Confira o código da empresa.' });
      throw err;
    } finally { db.release(); }
  };
}

module.exports = { isAdmin, companyInput, createAdminApi };
