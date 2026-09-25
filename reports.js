const {buildDashboard}=require('./dashboard');
function reportPeriod(start,end,timezone,now=new Date()) {
 const current=buildDashboard([],timezone,now).period;
 if(!start&&!end){start=current.month+'-01';const last=new Date(start+'T12:00:00Z');last.setUTCMonth(last.getUTCMonth()+1,0);end=last.toISOString().slice(0,10);}
 const valid=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(start)||!valid(end)||start>end)throw Object.assign(new Error('Informe uma data inicial e uma data final válidas, nessa ordem.'),{status:400});
 return {start,end,timezone,today:current.today,localTime:current.localTime};
}
function buildReport(appointments,period,now=new Date()) {
 const seconds=new Intl.DateTimeFormat('en-GB',{timeZone:period.timezone,second:'2-digit'}).format(now);
 const instant=`${period.today}T${period.localTime}:${seconds.padStart(2,'0')}`;
 const records=appointments.filter(item=>item.date>=period.start&&item.date<=period.end);
 const valid=records.filter(item=>!['cancelled','no_show'].includes(item.statusCode));
 const elapsed=item=>`${item.date}T${item.time.length===5?item.time+':00':item.time}`<instant;
 const completed=valid.filter(elapsed),upcoming=valid.filter(item=>!elapsed(item));
 const cancelled=records.filter(item=>item.statusCode==='cancelled');
 const sum=items=>Math.round(items.reduce((total,item)=>total+Number(item.price||0),0)*100)/100;
 function grouped(field){const map=new Map();for(const item of valid){const name=item[field]||'Não informado';const group=map.get(name)||{name,appointments:0,completed:0,total:0};group.appointments++;if(elapsed(item))group.completed++;group.total+=Number(item.price||0);map.set(name,group);}return [...map.values()].map(item=>({...item,total:Math.round(item.total*100)/100,average:item.total/item.appointments})).sort((a,b)=>b.appointments-a.appointments||a.name.localeCompare(b.name,'pt-BR'));}
 return {period,summary:{totalAppointments:records.length,completed:completed.length,cancelled:cancelled.length,noShows:records.filter(item=>item.statusCode==='no_show').length,upcoming:upcoming.length,pending:upcoming.filter(item=>item.statusCode==='scheduled').length,projectedRevenue:sum(valid),average:valid.length?sum(valid)/valid.length:0,cancelledValue:sum(cancelled),cancellationRate:records.length?Math.round(cancelled.length/records.length*100):0},professionals:grouped('professional'),services:grouped('service')};
}
module.exports={reportPeriod,buildReport};
