const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const realRequire=createRequire(path.join(root,'server.js'));
process.env.ADMIN_EMAILS='admin@example.com';
const companyId='11111111-1111-4111-8111-111111111111';
function fixture() {
 const users={admin:{id:'admin',email:'admin@example.com',email_confirmed_at:'date'},client:{id:'client',email:'client@example.com',email_confirmed_at:'date'},unlinked:{id:'unlinked',email:'unlinked@example.com',email_confirmed_at:'date'}};
 class Pool {async query(sql,params){return {rows:sql.includes('from user_companies') && ['admin','client'].includes(params?.[0]) ? [{id:companyId,name:'Empresa',segment:'Segmento'}] : [],rowCount:0};}}
 const module={exports:{}};
 const context={module,exports:module.exports,__dirname:root,require:name=>name==='pg'?{Pool}:name==='dotenv'?{config(){}}:realRequire(name),process:{env:{DATABASE_URL:'test',SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'test',ADMIN_EMAILS:'admin@example.com'}},Buffer,URL,console,setTimeout,clearTimeout,
 fetch:async(url,options)=>{
   if(url.includes('/token?')){const input=JSON.parse(options.body);const user=Object.values(users).find(user=>user.email===input.email);return {ok:Boolean(user),json:async()=>user?{access_token:user.id}: {}};}
   const token=options.headers.Authorization?.replace('Bearer ','');return {ok:Boolean(users[token]),json:async()=>users[token]};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(root,'server.js'),'utf8'),context,{filename:'server.js'});
 return (url,{method='GET',cookie='',body}={})=>new Promise((resolve,reject)=>{
   const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=url;req.method=method;req.headers={host:'localhost',cookie};req.socket={remoteAddress:'127.0.0.1'};
   const headers={};let status=200;
   const res={setHeader(k,v){headers[k.toLowerCase()]=v;},writeHead(code,values={}){status=code;for(const [k,v]of Object.entries(values))headers[k.toLowerCase()]=v;},end(data){resolve({status,headers,body:data?.toString()||''});}};
   Promise.resolve(module.exports(req,res)).catch(reject);
 });
}
test('client and admin entry pages are distinct',async()=>{
 const request=fixture();const client=await request('/login'),admin=await request('/admin/login');
 assert.equal(client.status,200);assert.match(client.body,/data-login-scope="client"/);assert.doesNotMatch(client.body,/data-login-scope="admin"/);
 assert.equal(admin.status,200);assert.match(admin.body,/data-login-scope="admin"/);
 assert.equal((await request('/admin')).headers.location,'/admin/login');
});
test('same account gets separate cookies from the two login endpoints',async()=>{
 const request=fixture();const body={email:'admin@example.com',password:'password'};
 const client=await request('/api/auth/login',{method:'POST',body});const admin=await request('/api/admin-auth/login',{method:'POST',body});
 assert.equal(client.status,200);assert.match(client.headers['set-cookie'],/^client_session=admin;/);assert.match(client.headers['set-cookie'],/HttpOnly/);
 assert.equal(admin.status,200);assert.match(admin.headers['set-cookie'],/^admin_session=admin;/);
});
test('client session cannot open admin pages, admin profile or administration API',async()=>{
 const request=fixture(),options={cookie:'client_session=admin'};
 assert.equal((await request('/admin',options)).headers.location,'/admin/login');
 assert.equal((await request('/api/admin-auth/me',options)).status,401);
 assert.equal((await request('/api/admin/companies',options)).status,401);
});
test('admin session cannot open client pages or company data',async()=>{
 const request=fixture(),options={cookie:'admin_session=admin'};
 for(const page of ['/vis%C3%A3ogeral','/agendamentos','/relatorios'])assert.equal((await request(page,options)).headers.location,'/login');
 assert.equal((await request('/api/auth/me',options)).status,401);
 assert.equal((await request(`/api/companies/${companyId}/profile`,options)).status,401);
 assert.match((await request('/config.js',options)).body,/"companyId":""/);
});
test('admin role and active company membership are checked before granting login',async()=>{
 const request=fixture();
 const forbidden=await request('/api/admin-auth/login',{method:'POST',body:{email:'client@example.com',password:'password'}});
 assert.equal(forbidden.status,403);assert.equal(forbidden.headers['set-cookie'],undefined);
 const unlinked=await request('/api/auth/login',{method:'POST',body:{email:'unlinked@example.com',password:'password'}});
 assert.equal(unlinked.status,403);assert.equal(unlinked.headers['set-cookie'],undefined);
});
test('both sessions coexist and logout clears only the requested cookie',async()=>{
 const request=fixture();const cookie='client_session=admin; admin_session=admin';
 assert.equal((await request('/api/auth/me',{cookie})).status,200);assert.equal((await request('/api/admin-auth/me',{cookie})).status,200);
 const client=await request('/api/auth/logout',{method:'POST',cookie});assert.match(client.headers['set-cookie'],/^client_session=;/);assert.match(client.headers['set-cookie'],/Max-Age=0/);assert.doesNotMatch(client.headers['set-cookie'],/admin_session/);
 assert.equal((await request('/api/admin-auth/me',{cookie:'admin_session=admin'})).status,200);
 assert.equal((await request('/agendamentos',{cookie:'admin_session=admin'})).headers.location,'/login');
 const admin=await request('/api/admin-auth/logout',{method:'POST',cookie});assert.match(admin.headers['set-cookie'],/^admin_session=;/);assert.doesNotMatch(admin.headers['set-cookie'],/client_session/);
 assert.equal((await request('/api/auth/me',{cookie:'client_session=admin'})).status,200);
});
test('legacy shared session does not grant access to either panel',async()=>{
 const request=fixture();for(const endpoint of ['/api/auth/me','/api/admin-auth/me'])assert.equal((await request(endpoint,{cookie:'session=admin'})).status,401);
});
