const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAdmin, companyInput, createAdminApi } = require('../admin');
process.env.ADMIN_EMAILS = 'victor@unyxdev.com';
const admin = { id:'admin', email:'victor@unyxdev.com', email_confirmed_at:'2026-01-01' };
const valid = { name:'Empresa teste', status:'active' };
const id = '11111111-1111-4111-8111-111111111111';
function setup(user, db) {
  return createAdminApi({ pool:db, supabaseUser:async()=>user, getAccessToken:()=>'', readBody:async req=>req.input, json:(_,status,body)=>({status,body}), isUuid:value=>value === id });
}
function call(api, method='GET', suffix='', input=valid) { return api({method,input},{},new URL('http://localhost/api/admin/companies'+suffix)); }

test('global access requires a confirmed email in the server allowlist',()=>{
  assert.equal(isAdmin(admin),true);
  assert.equal(isAdmin({...admin,email:'VICTOR@UNYXDEV.COM'}),true);
  assert.equal(isAdmin({...admin,email_confirmed_at:null}),false);
  assert.equal(isAdmin({...admin,email:'client@example.com',user_metadata:{isAdmin:true}}),false);
  assert.equal(isAdmin(null),false);
});
test('anonymous and company users cannot read or mutate global data',async()=>{
  for(const [user,status] of [[null,401],[{...admin,email:'client@example.com'},403]]) {
    for(const method of ['GET','POST','PUT']) {
      const response=await call(setup(user,{query(){throw Error('must not query');}}),method,method==='PUT'?'/'+id:'');
      assert.equal(response.status,status);
    }
  }
});
test('validates required fields, types, status, lengths, email and phone',()=>{
  for(const value of [null,[],{...valid,name:''},{...valid,name:23},{...valid,name:'a'.repeat(161)},{...valid,status:'admin'},{...valid,email:'bad'},{...valid,phone:'123'},{...valid,owner_email:'bad'}]) assert.throws(()=>companyInput(value),{status:400});
  assert.equal(companyInput({...valid,name:' Teste ',phone:'(11) 99999-9999'}).name,'Teste');
});
test('successful create uses bound values and commits',async()=>{
  const calls=[]; let released=false;
  const db={query:async(sql,values)=>{calls.push({sql,values});return {rows:sql.startsWith('insert into companies')?[{id}]:[]};},release(){released=true;}};
  const response=await call(setup(admin,{connect:async()=>db}),'POST','',{...valid,name:"Empresa ' especial"});
  assert.equal(response.status,201); assert.equal(response.body.id,id);
  assert.equal(calls[1].values[0],"Empresa ' especial"); assert.equal(calls.at(-1).sql,'commit'); assert.equal(released,true);
});
test('missing owner rolls back the entire company creation',async()=>{
  const calls=[];const db={query:async sql=>{calls.push(sql);return {rows:[]};},release(){}};
  await assert.rejects(call(setup(admin,{connect:async()=>db}),'POST','',{...valid,owner_email:'missing@example.com'}),{status:400});
  assert.equal(calls.at(-1),'rollback');assert.equal(calls.some(sql=>sql.startsWith('insert into companies')),false);
});
test('existing owner cannot be moved from another company',async()=>{
  const calls=[]; const db={query:async sql=>{calls.push(sql);return {rows:sql.includes('auth.users')?[{id:'owner'}]:sql.includes('user_companies')?[{company_id:'other'}]:[]};},release(){}};
  await assert.rejects(call(setup(admin,{connect:async()=>db}),'PUT','/'+id,{...valid,owner_email:'owner@example.com'}),{status:409});
  assert.equal(calls.at(-1),'rollback');
});
test('concurrent owner assignment rolls back instead of granting wrong access',async()=>{
  let links=0;const calls=[];const db={query:async sql=>{calls.push(sql);return {rows:sql.includes('from auth.users')?[{id:'owner'}]:sql.startsWith('select company_id')?(++links===1?[]:[{company_id:'other'}]):sql.startsWith('insert into companies')?[{id}]:[]};},release(){}};
  await assert.rejects(call(setup(admin,{connect:async()=>db}),'POST','',{...valid,owner_email:'owner@example.com'}),{status:409});
  assert.equal(calls.at(-1),'rollback');
});
test('missing company update returns 404 with rollback',async()=>{
  const calls=[];const db={query:async sql=>{calls.push(sql);return {rows:[]};},release(){}};
  await assert.rejects(call(setup(admin,{connect:async()=>db}),'PUT','/'+id),{status:404});assert.equal(calls.at(-1),'rollback');
});
test('unsupported methods and invalid identifiers are rejected',async()=>{
  const api=setup(admin,{}); assert.equal((await call(api,'DELETE','/'+id)).status,405);assert.equal((await call(api,'GET','/invalid')).status,400);
});
