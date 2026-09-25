const {test}=require('node:test');
const assert=require('node:assert/strict');
const {serviceInput,professionalInput,settingsInput,companyResource}=require('../admin-resources');
const {createAdminApi,companyInput}=require('../admin');
const service={code:'SER-001',name:'Serviço',description:'Descrição',duration_minutes:50,price:120,is_active:true};
const settings={schedule_description:'Segunda a sexta',start_time:'08:00',end_time:'20:00',no_break:true,payment_methods:['Pix','Dinheiro'],reminder_minutes:60,cancellation_notice_minutes:1440,tone_of_voice:'Atenciosa'};
const id='11111111-1111-4111-8111-111111111111';
test('service fields validate money, duration, required text and booleans',()=>{
  for(const input of [{...service,price:-1},{...service,price:NaN},{...service,price:1.234},{...service,duration_minutes:0},{...service,duration_minutes:1.2},{...service,code:''},{...service,description:''},{...service,is_active:'true'},{...service,pre_care:23}])assert.throws(()=>serviceInput(input),{status:400});
  assert.equal(serviceInput({...service,price:0}).price,0);assert.equal(serviceInput({...service,price:19.99}).price,19.99);
});
test('professional requires name and boolean status',()=>{
  assert.throws(()=>professionalInput({name:'',is_active:true}),{status:400});assert.throws(()=>professionalInput({name:'Nome',is_active:1}),{status:400});
  assert.deepEqual(professionalInput({name:' Camila ',specialty:' Massoterapia ',is_active:false}),{name:'Camila',specialty:'Massoterapia',is_active:false});
});
test('settings validate paired times, ordering, reminder units and payment arrays',()=>{
  for(const input of [{...settings,start_time:'25:00'},{...settings,end_time:'07:00'},{...settings,end_time:null},{...settings,payment_methods:'Pix'},{...settings,payment_methods:[2]},{...settings,payment_methods:['']},{...settings,no_break:'true'},{...settings,reminder_minutes:-1},{...settings,cancellation_notice_minutes:1.5}])assert.throws(()=>settingsInput(input),{status:400});
  assert.equal(settingsInput(settings).start_time,'08:00:00');assert.equal(settingsInput({...settings,start_time:'08:00:30'}).start_time,'08:00:30');
  assert.deepEqual(settingsInput({...settings,payment_methods:['Pix','Pix']}).payment_methods,['Pix']);
  const empty=settingsInput({start_time:null,end_time:null,no_break:null,payment_methods:null,reminder_minutes:null,cancellation_notice_minutes:null});assert.equal(empty.no_break,null);assert.equal(empty.reminder_minutes,null);
  assert.equal(settingsInput({...settings,reminder_minutes:0}).reminder_minutes,0);
});
test('company review URL and timezone reject executable URLs and invalid zones',()=>{
  const valid={name:'Empresa',status:'active'};
  for(const change of [{review_url:'javascript:alert(1)'},{review_url:'ftp://example.com'},{review_url:'https://user:pass@example.com'},{timezone:'invalid'},{timezone:5}])assert.throws(()=>companyInput({...valid,...change}),{status:400});
  assert.equal(companyInput({...valid,review_url:'https://example.com/review',timezone:'America/Sao_Paulo'}).timezone,'America/Sao_Paulo');
  assert.equal(Object.hasOwn(companyInput(valid),'review_url'),false);
});
test('every nested route denies anonymous and ordinary company accounts before database access',async()=>{
  for(const resource of ['services','professionals','settings','accesses','activity'])for(const user of [null,{email:'client@example.com',email_confirmed_at:'date'}])for(const method of ['GET','POST','PUT']){
    const api=createAdminApi({pool:{query(){throw Error('unauthorized database call');}},supabaseUser:async()=>user,getAccessToken:()=>'',json:(_,status)=>status,isUuid:()=>true});
    assert.equal(await api({method},{},new URL(`http://localhost/api/admin/companies/${id}/${resource}`)),user?403:401);
  }
});
test('cross-company catalog record returns 404 and never updates',async()=>{
  const statements=[];const db={query:async(sql)=>{statements.push(sql);return {rows:sql==='select id from companies where id=$1 for update'?[{id}]:[]};},release(){}};
  const pool={query:async()=>({rows:[{id}]}),connect:async()=>db};
  await assert.rejects(companyResource({pool,req:{method:'PUT'},res:{},json:(_,status)=>status,readBody:async()=>service,companyId:id,resource:'services',recordId:id,isUuid:()=>true}),{status:404});
  assert.equal(statements.some(sql=>sql.startsWith('update services')),false);assert.equal(statements.at(-1),'rollback');
});
test('unknown resource and destructive methods are not accepted',async()=>{
  const args={pool:{query:async()=>({rows:[{id}]})},req:{method:'DELETE'},res:{},json:(_,status)=>status,companyId:id,isUuid:()=>true};
  assert.equal(await companyResource({...args,resource:'services',recordId:id}),405);
  assert.equal(await companyResource({...args,resource:'auth.users'}),404);
});
