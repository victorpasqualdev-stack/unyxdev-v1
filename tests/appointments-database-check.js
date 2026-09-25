// Verificação manual: todos os registros e alterações são revertidos em uma transação.
require('dotenv').config({quiet:true});const {Pool}=require('pg');const fs=require('fs');const vm=require('vm');const path=require('path');const assert=require('node:assert/strict');const {createRequire}=require('module');const root=path.resolve(__dirname,'..');const actualRequire=createRequire(path.join(root,'server.js'));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
(async()=>{const db=await pool.connect();try{await db.query('begin');
const company=(await db.query("select id from companies where status='active' order by created_at limit 1")).rows[0];assert.ok(company);
const service=(await db.query('select name from services where company_id=$1 and is_active limit 1',[company.id])).rows[0];const professional=(await db.query('select name from professionals where company_id=$1 and is_active limit 1',[company.id])).rows[0];
const wrapped={query:(sql,values)=>sql==='begin'?db.query('savepoint appointment_test'):sql==='commit'?db.query('release savepoint appointment_test'):sql==='rollback'?db.query('rollback to savepoint appointment_test'):db.query(sql,values),release(){}};
class TestPool{connect(){return wrapped;}}
const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'server.js'),'utf8')+'\nmodule.exports.checkCreate=createAppointment;', {module,__dirname:root,require:name=>name==='pg'?{Pool:TestPool}:actualRequire(name),process,console,URL,Buffer,setTimeout,clearTimeout});
const input={date:'2099-01-12',time:'10:00',name:'Teste transacional',phone:'(11) 90000-0099',service:service.name,professional:professional.name,status:'Confirmado',price:'R$ 123,45'};
const created=await module.exports.checkCreate(company,input);assert.equal(created.created,true);assert.equal(created.appointment.price,123.45);
const row=(await db.query('select date::text,appointment_date::text,time,start_time,price,amount,customer_name,service_name,professional_name from appointments where id=$1',[created.appointment.id])).rows[0];assert.equal(row.date,row.appointment_date);assert.equal(row.time,row.start_time);assert.equal(row.price,row.amount);assert.equal(row.customer_name,input.name);assert.equal(row.service_name,input.service);assert.equal(row.professional_name,input.professional);
await assert.rejects(module.exports.checkCreate(company,input),{status:409});
const edited=await module.exports.checkCreate(company,{...input,name:'Nome corrigido',price:'R$ 150,00'},null,created.appointment.id);
assert.equal(edited.appointment.id,created.appointment.id);assert.equal(edited.appointment.name,'Nome corrigido');assert.equal(edited.appointment.price,150);
assert.equal((await db.query('select count(*)::int as total from appointments where id=$1',[created.appointment.id])).rows[0].total,1);
await assert.rejects(module.exports.checkCreate({id:'99999999-9999-4999-8999-999999999999'},input,null,created.appointment.id),{status:404});
const blocker=await module.exports.checkCreate(company,{...input,time:'14:00'});
await assert.rejects(module.exports.checkCreate(company,{...input,time:'14:00'},null,created.appointment.id),{status:409});
const cancelled=await module.exports.checkCreate(company,{...input,time:'14:00',status:'Cancelado'},null,created.appointment.id);assert.equal(cancelled.appointment.statusCode,'cancelled');
assert.equal(blocker.created,true);

console.log('Criação e edição, mesmo ID, nome/preço, isolamento e conflitos: OK. Teste revertido ao final.');
}finally{await db.query('rollback');db.release();await pool.end();}})().catch(error=>{console.error('Falha: '+(error.code||error.name)+' '+error.message);process.exitCode=1});
