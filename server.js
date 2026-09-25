const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { isAdmin, createAdminApi } = require('./admin');
const { buildDashboard } = require('./dashboard');
const { reportPeriod, buildReport } = require('./reports');
const { appointmentPrice } = require('./appointment-input');

try { require('dotenv').config(); } catch {}

const root = __dirname;
const publicDir = path.join(root, 'outputs');
const publicRoutes = Object.freeze({
  '/': '/site-institucional.html',
  '/login': '/login.html',
  '/visaogeral': '/visao-geral.html',
  '/agendamentos': '/painel-agendamentos.html',
  '/relatorios': '/relatorios.html',
  '/admin': '/admin.html',
  '/admin/empresas': '/admin.html',
  '/admin/login': '/admin-login.html',
});
const legacyPageRoutes = Object.freeze({
  '/login.html': '/login',
  '/site-institucional.html': '/',
  '/visão-geral': '/visaogeral',
  '/visãogeral': '/visaogeral',
  '/visao-geral.html': '/visaogeral',
  '/painel-agendamentos.html': '/agendamentos',
  '/relatorios.html': '/relatorios',
  '/admin.html': '/admin',
  '/admin-login.html': '/admin/login',
});
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
// Funções serverless podem escalar horizontalmente. Uma conexão por instância
// evita esgotar o pool compartilhado do Supabase.
const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: process.env.VERCEL ? 1 : 10,
}) : null;
const MAX_BODY_BYTES = 1024 * 1024;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();
const N8N_SECRET_HEADER = 'x-n8n-webhook-secret';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3010,http://127.0.0.1:3000,http://127.0.0.1:3010,capacitor://localhost,ionic://localhost').split(',').map((value) => value.trim()).filter(Boolean));

const statusToDatabase = Object.freeze({
  Pendente: 'scheduled',
  Confirmado: 'confirmed',
  Cancelado: 'cancelled',
  scheduled: 'scheduled',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
  completed: 'completed',
  no_show: 'no_show',
  'Concluído': 'completed',
  'Não compareceu': 'no_show',
});
const statusToPanel = Object.freeze({
  scheduled: 'Pendente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Confirmado',
  no_show: 'Cancelado',
});

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  // Arquivos estáticos chegam como Buffer. Eles devem ser enviados sem
  // JSON.stringify, senão o navegador exibe {"type":"Buffer", ...}.
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}
function json(res, status, payload) { send(res, status, payload); }
function decodedPathname(url) { return decodeURIComponent(url.pathname); }
function applySecurityHeaders(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  return true;
}
function getCookie(req, name) {
  const entry = (req.headers.cookie || '').split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
function getAccessToken(req, scope = 'client') {
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return getCookie(req, scope === 'admin' ? 'admin_session' : 'client_session');
}
function formatDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
function formatTime(value) { return String(value || '').slice(0, 5); }
function mapAppointment(row) {
  return {
    id: row.id,
    date: formatDate(row.appointment_date),
    time: formatTime(row.start_time),
    name: row.name,
    phone: row.phone,
    service: row.service,
    professional: row.professional,
    price: Number(row.price),
    status: statusToPanel[row.status] || row.status,
    statusCode: row.status,
    serviceId: row.service_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        return reject(error('A requisição excede o limite permitido.', 413));
      }
      raw += chunk;
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON inválido.')); }
    });
  });
}
function uuid() { return crypto.randomUUID(); }
function error(message, status = 400) { const err = new Error(message); err.status = status; return err; }
function secureEquals(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)); }
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value)); }
function isTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)); }
function loginAttemptKey(req, email) { return `${req.socket.remoteAddress || 'unknown'}:${email}`; }
function isLoginLimited(key) {
  const record = loginAttempts.get(key);
  if (!record) return false;
  if (Date.now() - record.startedAt > LOGIN_WINDOW_MS) { loginAttempts.delete(key); return false; }
  return record.count >= LOGIN_MAX_ATTEMPTS;
}
function registerLoginFailure(key) {
  const record = loginAttempts.get(key);
  if (!record || Date.now() - record.startedAt > LOGIN_WINDOW_MS) loginAttempts.set(key, { count: 1, startedAt: Date.now() });
  else record.count += 1;
}

async function supabaseUser(accessToken) {
  if (!accessToken || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return response.ok ? response.json() : null;
}
async function authenticatedCompany(req, expectedCompanyId) {
  const user = await supabaseUser(getAccessToken(req));
  if (!user || !pool) return null;
  const result = await pool.query(
    `select c.id, c.name, c.segment, c.phone, c.timezone
     from user_companies uc
     join companies c on c.id = uc.company_id
     where uc.user_id = $1 and c.status = 'active'`,
    [user.id],
  );
  return result.rows.find((row) => row.id === expectedCompanyId) || null;
}

const appointmentSelect = `
  select a.id, a.appointment_date::text, a.start_time, a.status, a.amount as price, a.created_at, a.service_id,
         coalesce(a.customer_name, c.name) as name, coalesce(a.customer_phone, c.phone) as phone, s.name as service, p.name as professional
  from appointments a
  join customers c on c.company_id = a.company_id and c.id = a.customer_id
  left join services s on s.company_id = a.company_id and s.id = a.service_id
  left join professionals p on p.company_id = a.company_id and p.id = a.professional_id
`;

async function createAppointment(company, input, sourceMessageId = null, appointmentId = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Cadastro inválido.');
  const required = ['date', 'time', 'name', 'phone', 'service', 'professional'];
  if (required.some((field) => typeof input[field] !== 'string' || !input[field].trim())) throw error('Preencha todos os campos obrigatórios.');
  if (!isDate(input.date) || !isTime(input.time)) throw error('Informe uma data e um horário válidos.');
  if (String(input.name).trim().length > 120 || String(input.service).trim().length > 120 || String(input.professional).trim().length > 120) throw error('Um dos campos informados é muito longo.');
  if (String(input.phone).replace(/\D/g, '').length < 10) throw error('Informe um telefone válido.');
  if (sourceMessageId && String(sourceMessageId).length > 160) throw error('Identificador da mensagem é muito longo.');

  const status = statusToDatabase[input.status] || 'scheduled';
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('select id from companies where id=$1 for update', [company.id]);
    let previous;
    if (appointmentId) {
      previous = (await db.query('select id,service_id,professional_id from appointments where company_id=$1 and id=$2 for update', [company.id,appointmentId])).rows[0];
      if (!previous) throw error('Agendamento não encontrado.',404);
    }
    if (sourceMessageId) {
      const duplicate = await db.query(
        `select a.id from appointments a where a.company_id = $1 and a.n8n_message_id = $2 limit 1`,
        [company.id, String(sourceMessageId)],
      );
      if (duplicate.rowCount) {
        const existing = await db.query(`${appointmentSelect} where a.company_id = $1 and a.id = $2`, [company.id, duplicate.rows[0].id]);
        await db.query('commit');
        return { appointment: mapAppointment(existing.rows[0]), created: false };
      }
    }
    const serviceResult = await db.query(
      'select id, price, duration_minutes from services where company_id = $1 and name = $2 and (is_active = true or id = $3::uuid) limit 1',
      [company.id, input.service.trim(), previous?.service_id || null],
    );
    if (!serviceResult.rowCount) throw error('Serviço inválido ou inativo.');
    const service = serviceResult.rows[0];
    const amount = appointmentPrice(input.price, service.price);
    const [hour, minute] = input.time.split(':').map(Number);
    if (hour*60 + minute + service.duration_minutes >= 1440) throw error('O atendimento deve terminar antes da meia-noite.');
    const professionalResult = await db.query(
      'select id from professionals where company_id = $1 and name = $2 and (is_active = true or id = $3::uuid) limit 1',
      [company.id, input.professional.trim(), previous?.professional_id || null],
    );
    if (!professionalResult.rowCount) throw error('Profissional inválido ou inativo.');
    const professional = professionalResult.rows[0];
    const normalizedPhone = input.phone.trim();
    let customerResult = await db.query(
      'select id from customers where company_id = $1 and phone = $2 order by created_at asc limit 1',
      [company.id, normalizedPhone],
    );
    let customerId = customerResult.rows[0]?.id;
    if (!customerId) {
      customerResult = await db.query(
        'insert into customers (id, company_id, name, phone) values ($1, $2, $3, $4) returning id',
        [uuid(), company.id, input.name.trim(), normalizedPhone],
      );
      customerId = customerResult.rows[0].id;
    }
    const overlap = ['cancelled','no_show'].includes(status) ? {rowCount:0} : await db.query(
      `select 1 from appointments
       where company_id = $1 and professional_id = $2 and appointment_date = $3
         and status not in ('cancelled', 'no_show')
         and ($6::uuid is null or id<>$6)
         and start_time < ($4::time + make_interval(mins => $5::int))::time
         and end_time > $4::time
       limit 1`,
      [company.id, professional.id, input.date, input.time, service.duration_minutes, appointmentId],
    );
    if (overlap.rowCount) throw error('Esse horário já está ocupado para o profissional selecionado.', 409);
    if (appointmentId) {
      await db.query(`update appointments set customer_id=$3,professional_id=$4,service_id=$5,
        appointment_date=$6::date,date=$6::date,start_time=$7::time,time=$7::time,
        end_time=($7::time + make_interval(mins => $8::int))::time,status=$9,amount=$10,price=$10,
        customer_name=$11,customer_phone=$12,service_name=$13,professional_name=$14,updated_at=now()
        where company_id=$1 and id=$2`, [company.id,appointmentId,customerId,professional.id,service.id,input.date,input.time,service.duration_minutes,status,amount,input.name.trim(),normalizedPhone,input.service.trim(),input.professional.trim()]);
      const result=await db.query(`${appointmentSelect} where a.company_id=$1 and a.id=$2`,[company.id,appointmentId]);
      await db.query('commit');
      return {appointment:mapAppointment(result.rows[0]),created:false};
    }
    const created = await db.query(
      `insert into appointments
        (id, company_id, customer_id, professional_id, service_id, appointment_date, start_time, end_time, status, amount, n8n_message_id, date, time, customer_name, customer_phone, service_name, professional_name, price)
       values
        ($1, $2, $3, $4, $5, $6::date, $7::time, ($7::time + make_interval(mins => $8::int))::time, $9, $10, $11, $6::date, $7::time, $12, $13, $14, $15, $10)
       returning id`,
      [uuid(), company.id, customerId, professional.id, service.id, input.date, input.time, service.duration_minutes, status, amount, sourceMessageId ? String(sourceMessageId) : null, input.name.trim(), normalizedPhone, input.service.trim(), input.professional.trim()],
    );
    const result = await db.query(`${appointmentSelect} where a.company_id = $1 and a.id = $2`, [company.id, created.rows[0].id]);
    await db.query('commit');
    return { appointment: mapAppointment(result.rows[0]), created: true };
  } catch (err) {
    await db.query('rollback');
    throw err;
  } finally { db.release(); }
}

async function n8nApi(req, res, url) {
  if (!pool) return json(res, 503, { error: 'Banco de dados não configurado.' });
  const expectedSecret = process.env.N8N_WEBHOOK_SECRET;
  if (!expectedSecret) return json(res, 503, { error: 'Integração n8n não configurada no servidor.' });
  if (!secureEquals(req.headers[N8N_SECRET_HEADER], expectedSecret)) return json(res, 401, { error: 'Credencial da integração inválida.' });

  const parts = url.pathname.split('/').filter(Boolean);
  const clientCode = decodeURIComponent(parts[4] || '').trim();
  if (!clientCode || clientCode.length > 80) return json(res, 400, { error: 'Código da empresa inválido.' });
  const companyResult = await pool.query(
    `select id, name, segment, timezone, client_code, description, address, phone, email, review_url from companies
     where client_code = $1 and status = 'active' limit 1`,
    [clientCode],
  );
  if (!companyResult.rowCount) return json(res, 404, { error: 'Empresa não encontrada ou inativa.' });
  const company = companyResult.rows[0];
  const resource = parts[5];

  if (req.method === 'GET' && resource === 'context') {
    const [services, professionals, settings] = await Promise.all([
      pool.query(`select name, description, duration_minutes, price, pre_care, post_care from services where company_id = $1 and is_active = true order by name`, [company.id]),
      pool.query(`select name, specialty from professionals where company_id = $1 and is_active = true order by name`, [company.id]),
      pool.query('select schedule_description,start_time,end_time,no_break,payment_methods,reminder_minutes,cancellation_notice_minutes,tone_of_voice from business_settings where company_id=$1', [company.id]),
    ]);
    return json(res, 200, { company: { code: company.client_code, name: company.name, segment: company.segment, timezone: company.timezone, description:company.description, address:company.address, phone:company.phone, email:company.email, review_url:company.review_url }, services: services.rows, professionals: professionals.rows, settings:settings.rows[0] || null });
  }
  if (req.method === 'GET' && resource === 'availability') {
    const date = url.searchParams.get('date');
    const professional = url.searchParams.get('professional');
    if (!isDate(date) || !professional) return json(res, 400, { error: 'Informe data e profissional válidos.' });
    const busy = await pool.query(
      `select a.start_time, a.end_time from appointments a join professionals p on p.id = a.professional_id and p.company_id = a.company_id
       where a.company_id = $1 and a.appointment_date = $2 and p.name = $3 and a.status not in ('cancelled', 'no_show') order by a.start_time`,
      [company.id, date, professional],
    );
    return json(res, 200, { date, professional, busy: busy.rows.map((row) => ({ start: formatTime(row.start_time), end: formatTime(row.end_time) })) });
  }
  if (req.method === 'POST' && resource === 'appointments') {
    const input = await readBody(req);
    const result = await createAppointment(company, input, input.sourceMessageId);
    return json(res, result.created ? 201 : 200, { ...result, duplicate: !result.created });
  }
  return json(res, 404, { error: 'Rota de integração não encontrada.' });
}

async function api(req, res, url) {
  if (!pool) return json(res, 503, { error: 'Banco de dados não configurado. Defina DATABASE_URL.' });
  const parts = url.pathname.split('/').filter(Boolean);
  const versioned = parts[1] === 'v1';
  const companyId = parts[versioned ? 3 : 2];
  if (!companyId || !isUuid(companyId)) return json(res, 400, { error: 'Empresa inválida.' });
  const company = await authenticatedCompany(req, companyId);
  if (!company) return json(res, 401, { error: 'Sessão expirada ou sem acesso à empresa.' });

  const resource = parts[versioned ? 4 : 3] || '';
  if (req.method === 'GET' && resource === 'profile') {
    return json(res, 200, { id: company.id, name: company.name, segment: company.segment, phone: company.phone });
  }
  if (req.method === 'GET' && resource === 'dashboard') {
    const result = await pool.query(`${appointmentSelect} where a.company_id = $1 order by a.appointment_date asc, a.start_time asc`, [company.id]);
    const appointments = result.rows.map(mapAppointment);
    const dashboard = buildDashboard(appointments, company.timezone || 'America/Sao_Paulo');
    return json(res, 200, { ...dashboard, ...(url.searchParams.get('includeAppointments') === 'true' ? { appointments } : {}) });
  }
  if (req.method === 'GET' && resource === 'professionals') {
    const result = await pool.query('select name from professionals where company_id = $1 and is_active = true order by name', [company.id]);
    return json(res, 200, result.rows.map((row) => row.name));
  }
  if (req.method === 'GET' && resource === 'services') {
    const result = await pool.query(
      'select internal_code as code, name, duration_minutes, price from services where company_id = $1 and is_active = true order by internal_code',
      [company.id],
    );
    return json(res, 200, result.rows.map((row) => ({ ...row, price: Number(row.price) })));
  }
  if (req.method === 'GET' && resource === 'reports') {
    const now=new Date();
    const period=reportPeriod(url.searchParams.get('start'),url.searchParams.get('end'),company.timezone || 'America/Sao_Paulo',now);
    const result=await pool.query(`${appointmentSelect} where a.company_id=$1 and a.appointment_date between $2::date and $3::date order by a.appointment_date,a.start_time`,[company.id,period.start,period.end]);
    return json(res,200,buildReport(result.rows.map(mapAppointment),period,now));
  }
  if (req.method === 'GET' && resource === 'appointments') {
    const id = parts[versioned ? 5 : 4];
    if (id) {
      if (!isUuid(id)) return json(res,400,{error:'Agendamento inválido.'});
      const result=await pool.query(`${appointmentSelect} where a.company_id=$1 and a.id=$2`,[company.id,id]);
      if (!result.rows.length) return json(res,404,{error:'Agendamento não encontrado.'});
      return json(res,200,mapAppointment(result.rows[0]));
    }
    const date = url.searchParams.get('date');
    if (date && !isDate(date)) return json(res, 400, { error: 'A data informada é inválida.' });
    const result = await pool.query(
      `${appointmentSelect} where a.company_id = $1 ${date ? 'and a.appointment_date = $2' : ''} order by a.appointment_date, a.start_time`,
      date ? [company.id, date] : [company.id],
    );
    return json(res, 200, result.rows.map(mapAppointment));
  }
  if (req.method === 'POST' && resource === 'appointments') {
    const input = await readBody(req);
    const result = await createAppointment(company, input);
    return json(res, 201, result.appointment);
  }
  const appointmentId = parts[versioned ? 5 : 4];
  if (req.method === 'PATCH' && resource === 'appointments' && appointmentId) {
    if (!isUuid(appointmentId)) return json(res,400,{error:'Agendamento inválido.'});
    const result=await createAppointment(company,await readBody(req),null,appointmentId);
    return json(res,200,result.appointment);
  }
  if (req.method === 'DELETE' && resource === 'appointments' && appointmentId) {
    if (!isUuid(appointmentId)) return json(res, 400, { error: 'Agendamento inválido.' });
    const result = await pool.query('delete from appointments where company_id = $1 and id = $2 returning id', [company.id, appointmentId]);
    if (!result.rowCount) return json(res, 404, { error: 'Agendamento não encontrado.' });
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Rota não encontrada.' });
}

async function authApi(req, res, url, scope = 'client') {
  const authPath = scope === 'admin' ? url.pathname.replace('/api/admin-auth/', '/api/auth/') : url.pathname;
  const cookieName = scope === 'admin' ? 'admin_session' : 'client_session';
  if (authPath === '/api/auth/login') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return json(res, 503, { error: 'O login ainda não foi configurado.' });
    }

    const input = await readBody(req);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    if (!email || !password) return json(res, 400, { error: 'Informe seu e-mail e sua senha.' });
    const attemptKey = loginAttemptKey(req, email);
    if (isLoginLimited(attemptKey)) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });

    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      // Não informamos se o e-mail existe: evita enumeração de usuários.
      registerLoginFailure(attemptKey);
      return json(res, 401, { error: 'E-mail ou senha inválidos.' });
    }
    loginAttempts.delete(attemptKey);
    const user = await supabaseUser(data.access_token);
    if (!user) return json(res, 401, { error: 'Não foi possível validar a sessão.' });
    if (scope === 'admin') {
      if (!isAdmin(user)) return json(res, 403, { error: 'Esta conta não tem acesso à administração.' });
    } else {
      if (!pool) return json(res, 503, { error: 'Banco de dados não configurado.' });
      const membership = await pool.query("select c.id from user_companies uc join companies c on c.id=uc.company_id where uc.user_id=$1 and c.status='active' limit 1", [user.id]);
      if (!membership.rows.length) return json(res, 403, { error: 'Esta conta não possui uma empresa ativa vinculada. Entre em contato com o suporte.' });
    }

    const cookieParts = [
      `${cookieName}=${encodeURIComponent(data.access_token)}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
      'Max-Age=3600',
    ];
    if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
    return send(res, 200, { ok: true }, 'application/json; charset=utf-8', {
      'Set-Cookie': cookieParts.join('; '),
    });
  }

  if (authPath === '/api/auth/logout') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
    return send(res, 200, { ok: true }, 'application/json; charset=utf-8', {
      'Set-Cookie': `${cookieName}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    });
  }

  if (authPath !== '/api/auth/me') return json(res, 404, { error: 'Rota não encontrada.' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  const token = getAccessToken(req, scope);
  const user = await supabaseUser(token);
  if (!user || !pool) return json(res, 401, { error: 'Não autenticado.' });
  if (scope === 'admin') {
    if (!isAdmin(user)) return json(res, 403, { error: 'Acesso exclusivo da administração.' });
    return json(res, 200, { user: { id:user.id, email:user.email }, isAdmin:true });
  }
  const result = await pool.query(
    `select c.id, c.name, c.segment, c.phone, c.timezone
     from user_companies uc join companies c on c.id = uc.company_id
     where uc.user_id = $1 and c.status = 'active'`,
    [user.id],
  );
  return json(res, 200, { user: { id: user.id, email: user.email }, companies: result.rows });
}

const adminApi = createAdminApi({ pool, supabaseUser, getAccessToken: req => getAccessToken(req, 'admin'), readBody, json, isUuid });

function staticFile(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Método não permitido.', 'text/plain; charset=utf-8');
  const requestedPath = decodedPathname(url);
  const pathname = publicRoutes[requestedPath] || requestedPath;
  const file = path.resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(publicDir)) return send(res, 403, 'Acesso negado.', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Arquivo não encontrado.', 'text/plain; charset=utf-8');
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    if (req.method === 'HEAD') return send(res, 200, '', types[ext] || 'application/octet-stream');
    send(res, 200, data, types[ext] || 'application/octet-stream');
  });
}

async function app(req, res) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodedPathname(url);
    if (!applySecurityHeaders(req, res)) return json(res, 403, { error: 'Origem não autorizada.' });
    if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok' });
    if (url.pathname === '/config.js' && req.method === 'GET') {
      const user = await supabaseUser(getAccessToken(req));
      const result = user && pool ? await pool.query("select c.id from user_companies uc join companies c on c.id=uc.company_id where uc.user_id=$1 and c.status='active' order by c.created_at limit 1", [user.id]) : { rows: [] };
      return send(res, 200, `window.ONYX_CONFIG = ${JSON.stringify({ companyId: result.rows[0]?.id || '' })};`, 'application/javascript; charset=utf-8', { 'Cache-Control': 'no-store' });
    }
    if (url.pathname.startsWith('/api/auth/')) return await authApi(req, res, url);
    if (url.pathname.startsWith('/api/admin-auth/')) return await authApi(req, res, url, 'admin');
    if (url.pathname.startsWith('/api/admin/')) return await adminApi(req, res, url);
    if (url.pathname.startsWith('/api/integrations/n8n/')) return await n8nApi(req, res, url);
    if (url.pathname.startsWith('/api/companies/') || url.pathname.startsWith('/api/v1/companies/')) return await api(req, res, url);
    const legacyTarget = legacyPageRoutes[pathname];
    if (legacyTarget) {
      const clientTarget = ['/visaogeral', '/agendamentos', '/relatorios'].includes(legacyTarget);
      if (clientTarget && !await supabaseUser(getAccessToken(req))) {
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
      if (legacyTarget === '/admin' && !await supabaseUser(getAccessToken(req, 'admin'))) {
        res.writeHead(302, { Location: '/admin/login' });
        return res.end();
      }
      res.writeHead(302, { Location: legacyTarget });
      return res.end();
    }
    const resolvedPage = publicRoutes[pathname] || pathname;
    // Check the resolved file as well to prevent alternate static paths bypassing the guard.
    if (path.resolve(publicDir, `.${resolvedPage}`) === path.join(publicDir, 'admin.html')) {
      const user = await supabaseUser(getAccessToken(req, 'admin'));
      if (!user) { res.writeHead(302, { Location: '/admin/login' }); return res.end(); }
      if (!isAdmin(user)) return send(res, 403, 'Acesso exclusivo da administração.', 'text/plain; charset=utf-8');
    }
    if (['painel-agendamentos.html', 'relatorios.html', 'visao-geral.html'].some(file => path.resolve(publicDir, `.${resolvedPage}`) === path.join(publicDir, file))) {
      if (!await supabaseUser(getAccessToken(req))) {
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
    }
    return staticFile(req, res, url);
  } catch (err) {
    // Registro técnico apenas no ambiente do servidor. A resposta ao navegador
    // permanece genérica para não expor detalhes de banco ou autenticação.
    console.error(`request_error method=${req.method} path=${url?.pathname || req.url} status=${err.status || 500} code=${err.code || 'none'} message=${err.message || 'Erro sem mensagem'}`);
    return json(res, err.status || 500, { error: err.status ? err.message : 'Não foi possível concluir a operação.' });
  }
}

// Local: inicia um servidor HTTP. Vercel: exporta apenas o handler serverless.
if (require.main === module) {
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.listen(port, () => console.log(`Painel disponível em http://localhost:${port}`));

  function shutdown() {
    server.close(async () => {
      try { await pool?.end(); } finally { process.exit(0); }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = app;
