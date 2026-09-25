const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function object(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Cadastro inválido.');
}
function text(input, field, label, max, required = false) {
  const value = input[field];
  if (value != null && typeof value !== 'string') fail(`Informe um texto válido em ${label}.`);
  const clean = (value || '').trim();
  if (clean.length > max) fail(`${label}: limite de ${max} caracteres.`);
  if (required && !clean) fail(`Preencha ${label}.`);
  return clean || null;
}
function integer(value, label, min, max, nullable = false) {
  if (nullable && (value === '' || value == null)) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(`${label}: informe um número inteiro entre ${min} e ${max}.`);
  return value;
}
function boolean(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'boolean') fail(`Selecione ${label}.`);
  return value;
}
function serviceInput(input) {
  object(input);
  const price = input.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 9999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) fail('Informe um preço válido com até duas casas decimais.');
  return {
    code: text(input, 'code', 'o código do serviço', 50, true),
    name: text(input, 'name', 'o nome do serviço', 120, true),
    description: text(input, 'description', 'a descrição do serviço', 10000, true),
    duration_minutes: integer(input.duration_minutes, 'Duração em minutos', 1, 1439),
    price,
    pre_care: text(input, 'pre_care', 'cuidados antes do atendimento', 10000),
    post_care: text(input, 'post_care', 'cuidados após o atendimento', 10000),
    is_active: boolean(input.is_active, 'o status do serviço'),
  };
}
function professionalInput(input) {
  object(input);
  return { name: text(input, 'name', 'o nome do profissional', 120, true), specialty: text(input, 'specialty', 'a especialidade', 500), is_active: boolean(input.is_active, 'o status do profissional') };
}
function settingsInput(input) {
  object(input);
  const times = ['start_time', 'end_time'].map(field => {
    const value = input[field];
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) fail('Informe horários válidos.');
    return value.length === 5 ? value + ':00' : value;
  });
  if (Boolean(times[0]) !== Boolean(times[1])) fail('Preencha o início e o fim do atendimento juntos.');
  if (times[0] && times[1] <= times[0]) fail('O fim do atendimento deve ser posterior ao início.');
  let paymentMethods = input.payment_methods;
  if (paymentMethods != null) {
    if (!Array.isArray(paymentMethods) || paymentMethods.length > 30 || paymentMethods.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 120)) fail('Informe até 30 formas de pagamento, com até 120 caracteres cada.');
    paymentMethods = [...new Set(paymentMethods.map(value => value.trim()))];
  }
  return {
    schedule_description: text(input, 'schedule_description', 'a descrição do funcionamento', 10000),
    start_time: times[0], end_time: times[1], no_break: boolean(input.no_break, 'se há intervalo', true),
    payment_methods: paymentMethods ?? null,
    reminder_minutes: integer(input.reminder_minutes, 'Antecedência do lembrete', 0, 525600, true),
    cancellation_notice_minutes: integer(input.cancellation_notice_minutes, 'Antecedência de cancelamento', 0, 525600, true),
    tone_of_voice: text(input, 'tone_of_voice', 'o tom de voz', 5000),
  };
}

// Called only after the global administrator guard in admin.js.
async function companyResource({ pool, req, res, json, readBody, companyId, resource, recordId, isUuid }) {
  if (recordId && !isUuid(recordId)) return json(res, 400, { error: 'Registro inválido.' });
  if (!['services', 'professionals', 'settings', 'accesses', 'activity'].includes(resource)) return json(res, 404, { error: 'Seção não encontrada.' });
  const company = await pool.query('select id from companies where id=$1', [companyId]);
  if (!company.rows.length) return json(res, 404, { error: 'Empresa não encontrada.' });
  if (req.method === 'GET') {
    if (recordId) return json(res, 405, { error: 'Use a listagem da seção.' });
    if (resource === 'settings') return json(res, 200, (await pool.query('select * from business_settings where company_id=$1', [companyId])).rows[0] || null);
    if (resource === 'accesses') return json(res, 200, (await pool.query('select uc.user_id,uc.created_at,u.email,(u.email_confirmed_at is not null) as confirmed from user_companies uc join auth.users u on u.id=uc.user_id where uc.company_id=$1 order by uc.created_at', [companyId])).rows);
    if (resource === 'activity') return json(res, 200, (await pool.query(`select a.id,a.appointment_date::text,a.start_time,a.status,a.amount,coalesce(a.customer_name,c.name) as customer_name,s.name as service_name,p.name as professional_name
      from appointments a join customers c on c.id=a.customer_id and c.company_id=a.company_id
      left join services s on s.id=a.service_id and s.company_id=a.company_id
      left join professionals p on p.id=a.professional_id and p.company_id=a.company_id
      where a.company_id=$1 order by a.created_at desc limit 50`, [companyId])).rows);
    // resource is an internal allowlist, never an arbitrary table name.
    return json(res, 200, (await pool.query(`select * from ${resource} where company_id=$1 order by name,id`, [companyId])).rows);
  }
  const collection = ['services', 'professionals'].includes(resource);
  if (!(collection && ((req.method === 'POST' && !recordId) || (req.method === 'PUT' && recordId))) && !(resource === 'settings' && req.method === 'PUT' && !recordId) && !(resource === 'accesses' && req.method === 'POST' && !recordId)) return json(res, 405, { error: 'Método não permitido.' });
  const raw = await readBody(req);
  let input;
  if (resource === 'services') input = serviceInput(raw);
  if (resource === 'professionals') input = professionalInput(raw);
  if (resource === 'settings') input = settingsInput(raw);
  if (resource === 'accesses') {
    object(raw); input = { email: text(raw, 'email', 'o e-mail da conta', 254, true) };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fail('Informe um e-mail válido.');
  }
  const db = await pool.connect();
  try {
    await db.query('begin');
    // Serialize catalog mutations within this company (names are used by booking integrations).
    await db.query('select id from companies where id=$1 for update', [companyId]);
    if (collection) {
      if (recordId && !(await db.query(`select id from ${resource} where company_id=$1 and id=$2`, [companyId, recordId])).rows.length) fail('Registro não encontrado nesta empresa.', 404);
      const conflict = await db.query(`select id from ${resource} where company_id=$1 and lower(trim(name))=lower($2) and ($3::uuid is null or id<>$3) limit 1`, [companyId, input.name, recordId || null]);
      if (conflict.rows.length) fail('Já existe um registro com esse nome nesta empresa. Edite o cadastro existente.', 409);
      let result;
      if (resource === 'services') {
        const values = [companyId,input.code,input.name,input.description,input.duration_minutes,input.price,input.pre_care,input.post_care,input.is_active];
        result = recordId
          ? await db.query('update services set code=$2,internal_code=$2,name=$3,description=$4,duration_minutes=$5,price=$6,pre_care=$7,post_care=$8,is_active=$9,active=$9 where company_id=$1 and id=$10 returning *', [...values,recordId])
          : await db.query('insert into services (company_id,code,internal_code,name,description,duration_minutes,price,pre_care,post_care,is_active,active) values ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning *', values);
      } else {
        const values = [companyId,input.name,input.specialty,input.is_active];
        result = recordId
          ? await db.query('update professionals set name=$2,specialty=$3,is_active=$4,active=$4 where company_id=$1 and id=$5 returning *', [...values,recordId])
          : await db.query('insert into professionals (company_id,name,specialty,is_active,active) values ($1,$2,$3,$4,$4) returning *', values);
      }
      await db.query('commit');
      return json(res, recordId ? 200 : 201, result.rows[0]);
    }
    if (resource === 'settings') {
      const result = await db.query(`insert into business_settings (company_id,schedule_description,start_time,end_time,no_break,payment_methods,reminder_minutes,cancellation_notice_minutes,tone_of_voice)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (company_id) do update set schedule_description=excluded.schedule_description,start_time=excluded.start_time,end_time=excluded.end_time,no_break=excluded.no_break,payment_methods=excluded.payment_methods,reminder_minutes=excluded.reminder_minutes,cancellation_notice_minutes=excluded.cancellation_notice_minutes,tone_of_voice=excluded.tone_of_voice returning *`, [companyId,input.schedule_description,input.start_time,input.end_time,input.no_break,input.payment_methods,input.reminder_minutes,input.cancellation_notice_minutes,input.tone_of_voice]);
      await db.query('commit'); return json(res, 200, result.rows[0]);
    }
    const owner = (await db.query('select id from auth.users where lower(email)=lower($1)', [input.email])).rows[0];
    if (!owner) fail('Conta não encontrada. Informe o e-mail de uma conta já cadastrada no sistema.', 400);
    await db.query('insert into user_companies (user_id,company_id) values ($1,$2) on conflict (user_id) do nothing', [owner.id,companyId]);
    const link = (await db.query('select company_id from user_companies where user_id=$1', [owner.id])).rows[0];
    if (link?.company_id !== companyId) fail('Essa conta já está vinculada a outra empresa.', 409);
    await db.query('commit'); return json(res, 200, { ok:true });
  } catch (err) {
    await db.query('rollback');
    if (err.code === '23505') return json(res, 409, { error: 'Esse código já está cadastrado nesta empresa.' });
    throw err;
  } finally { db.release(); }
}
module.exports = { serviceInput, professionalInput, settingsInput, companyResource };
