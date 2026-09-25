// Explicit integration check: all writes stay inside one outer transaction, always rolled back.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createAdminApi } = require('../admin');
(async () => {
 const pool = new Pool({ connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_SSL === 'false' ? false : {rejectUnauthorized:false}, connectionTimeoutMillis:10000 });
 const db = await pool.connect();
 try {
  await db.query('begin');
  const adminEmail=(process.env.ADMIN_EMAILS || '').split(',')[0].trim();
  assert.ok(adminEmail, 'Configure ADMIN_EMAILS para a verificação');
  const wrapped = { query:async (sql,values) => sql==='begin' ? db.query('savepoint api_operation') : sql==='commit' ? db.query('release savepoint api_operation') : sql==='rollback' ? db.query('rollback to savepoint api_operation') : db.query(sql,values), release(){} };
  const api = createAdminApi({ pool:{query:db.query.bind(db),connect:async()=>wrapped}, supabaseUser:async()=>({email:adminEmail,email_confirmed_at:'verified-test'}),getAccessToken:()=>'',readBody:async req=>req.input,json:(_,status,body)=>({status,body}),isUuid:value=>/^[0-9a-f-]{36}$/i.test(value) });
  const call=(method,suffix='',input)=>api({method,input},{},new URL('http://localhost/api/admin/companies'+suffix));
  const list=await call('GET');assert.equal(list.status,200);
  const existing=list.body;
  for(const company of existing) for(const section of ['services','professionals','settings','accesses','activity']) assert.equal((await call('GET',`/${company.id}/${section}`)).status,200);
  console.log('Leitura de empresas e todas as seções existentes: OK');
  const input={name:'Verificação transacional UnyxChat',status:'active',client_code:'check-'+require('crypto').randomUUID().slice(0,12),review_url:'https://example.com/review',timezone:'America/Manaus'};
  const created=await call('POST','',input);assert.equal(created.status,201);const id=created.body.id;
  const other=await call('POST','',{name:'Segunda empresa de teste',status:'active'});assert.equal(other.status,201);
  await assert.rejects(call('POST','',{...input,name:'Duplicada'}),{status:409});
  const updated=await call('PUT','/'+id,{...input,status:'inactive'});assert.equal(updated.status,200);
  const details=await call('GET','/'+id);assert.equal(details.body.status,'inactive');assert.equal(details.body.active,false);assert.equal(details.body.review_url,input.review_url);assert.equal(details.body.timezone,input.timezone);
  const service={code:'SER-TEST',name:'Serviço teste',description:'Descrição completa',duration_minutes:50,price:125.5,pre_care:'Antes',post_care:'Depois',is_active:true};
  const saved=await call('POST',`/${id}/services`,service);assert.equal(saved.status,201);assert.equal(saved.body.code,saved.body.internal_code);
  const duplicate=await call('POST',`/${id}/services`,{...service,name:'Outro nome'});assert.equal(duplicate.status,409);
  const changed=await call('PUT',`/${id}/services/${saved.body.id}`,{...service,is_active:false,price:140});assert.equal(changed.status,200);assert.equal(changed.body.active,false);assert.equal(changed.body.is_active,false);assert.equal(Number(changed.body.price),140);
  await assert.rejects(call('PUT',`/${other.body.id}/services/${saved.body.id}`,service),{status:404});
  const professional={name:'Profissional teste',specialty:'Especialidade',is_active:true};
  const pro=await call('POST',`/${id}/professionals`,professional);assert.equal(pro.status,201);
  const proUpdated=await call('PUT',`/${id}/professionals/${pro.body.id}`,{...professional,is_active:false});assert.equal(proUpdated.body.active,false);assert.equal(proUpdated.body.is_active,false);
  await assert.rejects(call('POST',`/${id}/professionals`,professional),{status:409});
  const settings={schedule_description:'Dias ímpares',start_time:'08:00',end_time:'20:00',no_break:true,payment_methods:['Pix','Cartão'],reminder_minutes:60,cancellation_notice_minutes:1440,tone_of_voice:'Atenciosa'};
  assert.equal((await call('PUT',`/${id}/settings`,settings)).status,200);
  const settingsRead=await call('GET',`/${id}/settings`);assert.equal(settingsRead.body.reminder_minutes,60);assert.deepEqual(settingsRead.body.payment_methods,settings.payment_methods);
  const settingsUpdated=await call('PUT',`/${id}/settings`,{...settings,reminder_minutes:0,no_break:null});assert.equal(settingsUpdated.body.reminder_minutes,0);assert.equal(settingsUpdated.body.no_break,null);
  const linked=(await db.query('select u.email from user_companies uc join auth.users u on u.id=uc.user_id limit 1')).rows[0];
  if(linked) await assert.rejects(call('POST',`/${id}/accesses`,{email:linked.email}),{status:409});
  for(const company of existing){const after=await call('GET','/'+company.id);assert.deepEqual(after.body,company);}
  console.log('Cadastro completo, edição, inativação, conflitos e isolamento entre empresas: OK');
  console.log('Registros existentes preservados. Dados de teste revertidos ao final.');
 } finally {await db.query('rollback');db.release();await pool.end();}
})().catch(error=>{console.error('Verificação falhou: '+(error.code || error.name)+': '+error.message);process.exitCode=1;});
