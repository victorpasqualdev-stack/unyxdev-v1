const {test}=require('node:test');const assert=require('node:assert/strict');const {reportPeriod,buildReport}=require('../reports');const {buildDashboard}=require('../dashboard');
const now=new Date('2026-09-23T15:00:30Z'),timezone='America/Sao_Paulo';
const record=(id,date,time,statusCode,price=100)=>({id,date,time,statusCode,price,service:'Massagem',professional:'Camila'});
test('default report period is the current local month including its final day',()=>{
 assert.equal(reportPeriod(null,null,timezone,now).start,'2026-09-01');assert.equal(reportPeriod(null,null,timezone,now).end,'2026-09-30');
 assert.equal(reportPeriod(null,null,timezone,new Date('2026-10-01T02:59:00Z')).start,'2026-09-01');
 assert.equal(reportPeriod(null,null,timezone,new Date('2026-10-01T03:00:00Z')).start,'2026-10-01');
 assert.equal(reportPeriod(null,null,timezone,new Date('2028-02-10T15:00:00Z')).end,'2028-02-29');
});
test('period rejects missing, invalid calendar dates and reversed dates',()=>{
 for(const [start,end]of [['2026-02-30','2026-03-01'],['2026-09-01',null],['2026-10-01','2026-09-01'],['invalid','2026-09-01']])assert.throws(()=>reportPeriod(start,end,timezone,now),{status:400});
});
test('total includes all statuses while realized follows elapsed start time excluding cancellations and no-shows',()=>{
 const period=reportPeriod('2026-09-01','2026-09-30',timezone,now);
 const rows=[record('past','2026-09-22','14:00','confirmed'),record('pendingPast','2026-09-23','11:00','scheduled'),record('justStarted','2026-09-23','12:00','confirmed'),record('future','2026-09-23','13:00','confirmed'),record('cancel','2026-09-22','09:00','cancelled'),record('absent','2026-09-22','10:00','no_show'),record('futureDone','2026-09-24','10:00','completed')];
 const report=buildReport(rows,period,now);assert.equal(report.summary.totalAppointments,7);assert.equal(report.summary.completed,3);assert.equal(report.summary.cancelled,1);assert.equal(report.summary.noShows,1);assert.equal(report.summary.projectedRevenue,500);
 rows[0].statusCode='cancelled';const updated=buildReport(rows,period,now);assert.equal(updated.summary.totalAppointments,7);assert.equal(updated.summary.completed,2);assert.equal(updated.summary.cancelled,2);assert.equal(updated.summary.projectedRevenue,400);
});
test('inclusive period filters all report sections and projection matches dashboard for current month',()=>{
 const period=reportPeriod('2026-09-01','2026-09-30',timezone,now),rows=[record('first','2026-09-01','00:00','confirmed',120),record('last','2026-09-30','23:00','scheduled',200),record('outside','2026-10-01','12:00','confirmed',999)];
 const report=buildReport(rows,period,now);assert.equal(report.summary.totalAppointments,2);assert.equal(report.professionals[0].appointments,2);assert.equal(report.services[0].appointments,2);assert.equal(report.summary.pending,1);assert.equal(report.summary.projectedRevenue,buildDashboard(rows,timezone,now).summary.projectedRevenue);
});
test('empty report avoids invalid percentages and averages',()=>{
 const report=buildReport([],reportPeriod(null,null,timezone,now),now);assert.equal(report.summary.average,0);assert.equal(report.summary.cancellationRate,0);assert.deepEqual(report.professionals,[]);assert.deepEqual(report.services,[]);
});
