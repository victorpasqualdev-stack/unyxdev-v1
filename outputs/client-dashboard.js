(() => {
  const root=document.querySelector('[data-client-dashboard]');if(!root)return;
  const $=selector=>root.querySelector(selector);
  const isAgenda=document.body.dataset.clientPage==='appointments';
  const statusLabels={scheduled:'Pendente',confirmed:'Confirmado',cancelled:'Cancelado',completed:'Concluído',no_show:'Não compareceu'};
  const empty=message=>`<p class="client-empty">${safe(message)}</p>`;
  const dateLabel=(value,options={day:'2-digit',month:'short'})=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',...options}).format(new Date(value+'T12:00:00Z'));
  let data=null,selectedDate=null,calendarMonth=null,mode='day',sequence=0;
  const requestedView=new URLSearchParams(location.search).get('view');
  if(['upcoming','month'].includes(requestedView))mode=requestedView;
  const active=item=>!['cancelled','no_show'].includes(item.statusCode);
  function rows(items,{deletable=false}={}) {
    if(!items.length)return empty('Nenhum agendamento para mostrar.');
    return items.map(item=>`<article class="appointment-row" data-id="${safe(item.id)}"><div class="appointment-when">${safe(item.time)}<small>${safe(dateLabel(item.date,{day:'2-digit',month:'2-digit',year:'numeric'}))}</small></div><div><div class="appointment-person">${safe(item.name)}</div><div class="appointment-service">${safe(item.service || 'Serviço não informado')}<br>${safe(item.professional || 'Profissional não informado')}</div></div><div class="appointment-footer"><strong class="appointment-price">${currency.format(item.price)}</strong><div class="appointment-actions"><span class="appointment-badge ${safe(item.statusCode)}">${safe(statusLabels[item.statusCode] || item.status)}</span><button class="details-appointment" type="button" aria-label="Ver detalhes de ${safe(item.name)}" data-appointment="${safe(encodeURIComponent(JSON.stringify({...item,status:statusLabels[item.statusCode] || item.status})))}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2.4"/></svg></button>${deletable?`<button type="button" class="delete-appointment" aria-label="Excluir agendamento de ${safe(item.name)}"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13"/></svg></button>`:''}</div></div></article>`).join('');
  }
  function renderUpcoming(){
    $('[data-upcoming]').innerHTML=rows(data.upcoming.slice(0,5));
  }
  function renderCalendar(){
    if(!isAgenda)return;
    $('[data-calendar-month]').textContent=dateLabel(calendarMonth+'-01',{month:'long',year:'numeric'});
    const first=new Date(calendarMonth+'-01T12:00:00Z');first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
    const counts=new Map();for(const item of data.appointments.filter(active))counts.set(item.date,(counts.get(item.date)||0)+1);
    const weekdays=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(day=>`<span class="calendar-weekday">${day}</span>`).join('');
    $('[data-calendar]').innerHTML=weekdays+Array.from({length:42},(_,index)=>{
      const day=new Date(first);day.setUTCDate(day.getUTCDate()+index);const key=day.toISOString().slice(0,10),count=counts.get(key)||0;
      return `<button type="button" class="calendar-day ${key.slice(0,7)!==calendarMonth?'outside':''} ${key===data.period.today?'today':''} ${key===selectedDate?'selected':''}" data-calendar-date="${key}" aria-pressed="${key===selectedDate}" ${key===data.period.today?'aria-current="date"':''} aria-label="${safe(dateLabel(key,{day:'numeric',month:'long',year:'numeric'}))}, ${count} agendamento(s)"><span>${day.getUTCDate()}</span>${count?`<small>${count} horário${count===1?'':'s'}</small>`:'<small aria-hidden="true">·</small>'}</button>`;
    }).join('');
  }
  function renderAgenda(){
    if(!isAgenda)return;
    let items,title,description;
    if(mode==='upcoming'){items=data.upcoming;title='Próximos atendimentos';description='Todos os horários pendentes ou confirmados, a partir de agora.';}
    else if(mode==='month'){items=data.appointments.filter(item=>item.date.startsWith(data.period.month));title='Agendamentos no mês atual';description=dateLabel(data.period.month+'-01',{month:'long',year:'numeric'})+' · todos os status';}
    else{items=data.appointments.filter(item=>item.date===selectedDate);title='Agenda do dia';description=dateLabel(selectedDate,{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
    items=[...items].sort((a,b)=>`${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    $('[data-agenda-title]').textContent=title;$('[data-agenda-description]').textContent=description;$('[data-agenda-count]').textContent=`${items.length} registro(s)`;
    $('[data-agenda]').innerHTML=rows(items,{deletable:true});
    root.querySelectorAll('[data-agenda-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.agendaMode===mode)));
  }
  function render(){
    for(const [key,value]of Object.entries(data.summary)){const element=$(`[data-metric="${key}"]`);if(element)element.textContent=key==='projectedRevenue'?currency.format(value):value;}
    const monthLabel=dateLabel(data.period.month+'-01',{month:'long',year:'numeric'});
    $('[data-note="today"]').textContent=`${dateLabel(data.period.today)} · ${data.summary.today?'horários no dia':'nenhum agendamento'}`;
    $('[data-note="upcoming"]').textContent=data.summary.upcoming?'Pendentes e confirmados a partir de agora':'Nenhum próximo atendimento';
    $('[data-note="month"]').textContent=monthLabel+' · todos os status';
    $('[data-note="projectedRevenue"]').textContent=`Previsão de ${monthLabel}; não é valor recebido`;
    renderUpcoming();$('[data-recent]').innerHTML=rows(data.recent);
    $('[data-week-period]').textContent=`${dateLabel(data.period.weekStart)} a ${dateLabel(data.period.weekEnd)} · segunda a domingo`;
    const max=Math.max(...data.week.map(day=>day.appointments),1);
    $('[data-week]').innerHTML=data.week.map(day=>`<div class="week-column ${day.date===data.period.today?'today':''}"><strong>${day.appointments}</strong><div class="week-bar" style="height:${Math.max(3,day.appointments/max*145)}px" role="img" aria-label="${safe(dateLabel(day.date))}: ${day.appointments} agendamento(s)"></div><span>${day.label}</span><small>${safe(dateLabel(day.date,{day:'2-digit',month:'2-digit'}))}</small></div>`).join('');
    $('[data-service-period]').textContent='Todo o período · confirmados e realizados, por quantidade';
    $('[data-services]').innerHTML=data.services.length?data.services.map((service,index)=>`<div class="ranking-row"><span class="ranking-position">${index+1}.</span><span class="ranking-name">${safe(service.name)}</span><strong class="ranking-count" aria-label="${service.appointments} agendamentos">${service.appointments}</strong></div>`).join(''):empty('Nenhum serviço agendado neste mês.');
    renderCalendar();renderAgenda();
  }
  async function refresh(){
    const current=++sequence;
    try{
      if(!apiBase)throw new Error('Sua conta não possui uma empresa ativa vinculada. Entre em contato com o suporte.');
      const next=await request(`${apiBase}/dashboard${isAgenda?'?includeAppointments=true':''}`);
      if(current!==sequence)return;
      if(!selectedDate || selectedDate===data?.period.today)selectedDate=next.period.today;
      if(!calendarMonth || calendarMonth===data?.period.month)calendarMonth=next.period.month;
      data=next;render();$('[data-dashboard-error]').hidden=true;
    }catch(error){
      if(current!==sequence)return;
      $('[data-dashboard-error] span').textContent=error.message;$('[data-dashboard-error]').hidden=false;
      if(!data){root.querySelectorAll('[data-note]').forEach(element=>element.textContent='Não foi possível carregar');for(const selector of ['[data-upcoming]','[data-recent]','[data-week]','[data-services]','[data-agenda]']){const element=$(selector);if(element)element.innerHTML=empty('Dados indisponíveis. Tente novamente.');}if(isAgenda){$('[data-agenda-description]').textContent='Não foi possível carregar os horários.';}}
    }
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-retry-dashboard')){refresh();return;}
    if(!data)return;
    if(button.dataset.calendarDate){selectedDate=button.dataset.calendarDate;calendarMonth=selectedDate.slice(0,7);mode='day';renderCalendar();renderAgenda();}
    if(button.dataset.monthOffset){const date=new Date(calendarMonth+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+Number(button.dataset.monthOffset));calendarMonth=date.toISOString().slice(0,7);renderCalendar();}
    if(button.hasAttribute('data-calendar-today')){selectedDate=data.period.today;calendarMonth=data.period.month;mode='day';renderCalendar();renderAgenda();}
    if(button.dataset.agendaMode){mode=button.dataset.agendaMode;renderAgenda();}
  });
  window.refreshAppointments=refresh;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('focus',()=>refresh());
  setInterval(()=>{if(!document.hidden)refresh();},60000);
  refresh();
})();
