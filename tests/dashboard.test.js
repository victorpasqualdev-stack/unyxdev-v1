const {test}=require('node:test');const assert=require('node:assert/strict');const {buildDashboard}=require('../dashboard');
const item=(id,date,time='12:00',statusCode='confirmed',price=100,createdAt='2026-09-01T12:00:00Z',service='Massagem')=>({id,date,time,statusCode,price,createdAt,service,name:'Cliente',status:statusCode});
const now=new Date('2026-09-23T15:00:00Z');
test('today/month totals and projection share status rules and company local date',()=>{
 const data=buildDashboard([item('1','2026-09-23','08:00','completed'),item('2','2026-09-23','13:00','scheduled',120),item('3','2026-09-23','14:00','cancelled'),item('4','2026-09-23','15:00','no_show'),item('5','2026-09-30','09:00','confirmed',200),item('6','2026-10-01')],'America/Sao_Paulo',now);
 assert.equal(data.summary.today,2);assert.equal(data.summary.month,5);assert.equal(data.summary.projectedRevenue,420);assert.equal(data.summary.upcoming,3);assert.deepEqual(data.upcoming.map(x=>x.id),['2','5','6']);
});
test('upcoming excludes earlier times today and completed future rows',()=>{
 const data=buildDashboard([item('past','2026-09-23','11:59'),item('now','2026-09-23','12:00'),item('done','2026-09-24','13:00','completed'),item('future','2026-09-24','09:00')],'America/Sao_Paulo',now);
 assert.deepEqual(data.upcoming.map(x=>x.id),['now','future']);
});
test('recent registrations sort by creation, not appointment date',()=>{
 const data=buildDashboard([item('future','2027-01-01','12:00','confirmed',100,'2026-09-01T00:00:00Z'),item('recent','2026-09-24','12:00','confirmed',100,'2026-09-23T13:00:00Z')],'America/Sao_Paulo',now);
 assert.equal(data.recent[0].id,'recent');
});
test('week always starts Monday and ends Sunday, including Sunday and year boundaries',()=>{
 for(const [instant,start,end]of [['2026-09-27T15:00:00Z','2026-09-21','2026-09-27'],['2026-09-28T15:00:00Z','2026-09-28','2026-10-04'],['2027-01-01T15:00:00Z','2026-12-28','2027-01-03']]){
 const data=buildDashboard([],'America/Sao_Paulo',new Date(instant));assert.equal(data.week.length,7);assert.equal(data.week[0].date,start);assert.equal(data.week[6].date,end);assert.equal(data.week[0].label,'Seg');assert.equal(data.week[6].label,'Dom');
 }
});
test('month automatically changes at midnight in company timezone, not UTC midnight',()=>{
 const records=[item('sep','2026-09-30'),item('oct','2026-10-01','12:00','scheduled',250)];
 const before=buildDashboard(records,'America/Sao_Paulo',new Date('2026-10-01T02:59:00Z'));const after=buildDashboard(records,'America/Sao_Paulo',new Date('2026-10-01T03:00:00Z'));
 assert.equal(before.period.today,'2026-09-30');assert.equal(before.summary.projectedRevenue,100);assert.equal(after.period.today,'2026-10-01');assert.equal(after.summary.projectedRevenue,250);
 const manaus=buildDashboard(records,'America/Manaus',new Date('2026-10-01T03:30:00Z'));assert.equal(manaus.period.month,'2026-09');
});
test('service ranking covers all time and only confirmed or completed appointments',()=>{
 const data=buildDashboard([item('1','2026-09-23','13:00','confirmed',10,undefined,'A'),item('2','2026-09-24','13:00','scheduled',10,undefined,'B'),item('3','2026-09-25','13:00','confirmed',10,undefined,'B'),item('4','2026-08-23','13:00','confirmed',10,undefined,'C'),item('5','2026-09-23','13:00','cancelled',10,undefined,'C')],'America/Sao_Paulo',now);
 assert.deepEqual(data.services.map(x=>[x.name,x.appointments]),[['A',1],['B',1],['C',1]]);
});
test('empty calendar returns zero values and seven empty weekdays',()=>{
 const data=buildDashboard([],'America/Sao_Paulo',now);assert.equal(data.summary.projectedRevenue,0);assert.equal(data.summary.today,0);assert.equal(data.week.reduce((sum,x)=>sum+x.appointments,0),0);assert.deepEqual(data.upcoming,[]);assert.deepEqual(data.services,[]);
});
