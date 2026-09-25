function buildDashboard(appointments, timezone = 'America/Sao_Paulo', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(now);
  const part = type => parts.find(item=>item.type===type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const localTime = `${part('hour')}:${part('minute')}`;
  const month = today.slice(0,7);
  const monthAppointments = appointments.filter(item=>item.date.startsWith(month));
  const valid = appointments.filter(item=>!['cancelled','no_show'].includes(item.statusCode) && !['Cancelado','Não compareceu'].includes(item.status));
  const monthly = valid.filter(item=>item.date.startsWith(month));
  const serviceAppointments = appointments.filter(item=>['confirmed','completed'].includes(item.statusCode));
  const upcoming = valid.filter(item=>['scheduled','confirmed'].includes(item.statusCode) && `${item.date}T${item.time}` >= `${today}T${localTime}`).sort((a,b)=>`${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`) || a.id.localeCompare(b.id));
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
  const week = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((label,index)=>{
    const day=new Date(monday);day.setUTCDate(day.getUTCDate()+index);const date=day.toISOString().slice(0,10);
    return {date,label,appointments:valid.filter(item=>item.date===date).length};
  });
  const services = [...serviceAppointments.reduce((map,item)=>{
    const key=item.serviceId || item.service || 'Sem serviço';
    const value=map.get(key)||{name:item.service || 'Sem serviço',appointments:0,total:0};
    value.appointments++;value.total+=Number(item.price||0);map.set(key,value);return map;
  },new Map()).values()].sort((a,b)=>b.appointments-a.appointments || a.name.localeCompare(b.name,'pt-BR')).slice(0,5);
  const recent=[...appointments].sort((a,b)=>String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || b.id.localeCompare(a.id)).slice(0,5);
  return { period:{today,localTime,month,timezone,weekStart:week[0].date,weekEnd:week[6].date},summary:{today:valid.filter(item=>item.date===today).length,month:monthAppointments.length,upcoming:upcoming.length,projectedRevenue:Math.round(monthly.reduce((sum,item)=>sum+Number(item.price||0),0)*100)/100},upcoming,recent,week,services };
}
module.exports={buildDashboard};
