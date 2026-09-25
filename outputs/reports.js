(() => {
  const root=document.querySelector('[data-reports]');if(!root)return;
  const $=selector=>root.querySelector(selector),form=$('#report-filter');
  let applied={},attempted={},sequence=0,loaded=false,filterDirty=false;
  const date=value=>value.split('-').reverse().join('/');
  const empty=message=>`<p class="client-empty">${safe(message)}</p>`;
  function render(data){
    const {summary:s,professionals,services,period}=data;
    $('[data-report-total]').textContent=s.totalAppointments;$('[data-report-completed]').textContent=s.completed;$('[data-report-cancelled]').textContent=s.cancelled;$('[data-report-projection]').textContent=currency.format(s.projectedRevenue);
    $('[data-report-period]').textContent=`${date(period.start)} a ${date(period.end)}`;
    $('[data-report-professionals]').innerHTML=professionals.length?professionals.map(item=>`<div class="pro-card"><div class="pro-top"><div class="pro-name">${safe(item.name)}</div></div><div class="pro-meta"><div>Agendamentos<b>${item.appointments}</b></div><div>Realizados<b>${item.completed}</b></div><div>Projeção<b>${currency.format(item.total)}</b></div></div><div class="bar-label"><span>Participação na projeção</span><b>${s.projectedRevenue?Math.round(item.total/s.projectedRevenue*100):0}%</b></div><div class="bar"><span style="width:${s.projectedRevenue?Math.round(item.total/s.projectedRevenue*100):0}%"></span></div></div>`).join(''):empty('Nenhum atendimento previsto ou realizado neste período.');
    $('[data-report-services]').innerHTML=services.length?services.map((item,index)=>`<div class="service"><span class="rank">${index+1}</span><div><b>${safe(item.name)}</b><small>${item.appointments} agendamento(s) · ${item.completed} realizado(s)</small></div><strong>${currency.format(item.total)}</strong><div class="bar"><span style="width:${Math.round(item.appointments/services[0].appointments*100)}%"></span></div></div>`).join(''):empty('Nenhum serviço agendado neste período.');
    const insights=[['Ainda por atender',s.upcoming,'Horários do período que ainda não passaram.'],['Cancelamentos',`${s.cancellationRate}%`,`${s.cancelled} de ${s.totalAppointments} agendamento(s). ${currency.format(s.cancelledValue)} excluídos da projeção.`],['Valor médio previsto',currency.format(s.average),'Por agendamento, desconsiderando cancelamentos e faltas.']];
    $('[data-report-insights]').innerHTML=s.totalAppointments?insights.map(([title,value,note])=>`<div class="report-insight"><h4>${title}</h4><strong>${value}</strong><p>${note}</p></div>`).join(''):empty('Nenhum agendamento encontrado. Escolha outro período para consultar.');
  }
  async function load(range=applied,updateInputs=false){
    const current=++sequence;attempted={...range};
    const query=new URLSearchParams(range).toString();
    form.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{
      if(!apiBase)throw new Error('Sua conta não possui uma empresa ativa vinculada.');
      const data=await request(`${apiBase}/reports${query?'?'+query:''}`);
      if(current!==sequence)return;
      applied={...range};render(data);loaded=true;$('[data-report-error]').hidden=true;
      if(updateInputs && !filterDirty){form.elements.start.value=data.period.start;form.elements.end.value=data.period.end;}
    }catch(error){
      if(current!==sequence)return;
      $('[data-report-error]').hidden=false;$('[data-report-error] span').textContent=loaded?`${error.message} Os dados exibidos continuam sendo do último período carregado.`:error.message;
      if(!loaded)for(const selector of ['[data-report-professionals]','[data-report-services]','[data-report-insights]'])$(selector).innerHTML=empty('Dados indisponíveis. Tente novamente.');
    }finally{if(current===sequence)form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  form.addEventListener('input',()=>{filterDirty=true;});
  form.addEventListener('submit',event=>{event.preventDefault();const start=form.elements.start.value,end=form.elements.end.value;if(!start||!end||start>end){$('[data-report-error]').hidden=false;$('[data-report-error] span').textContent='A data final deve ser igual ou posterior à data inicial.';return;}filterDirty=false;load({start,end});});
  $('[data-current-month]').addEventListener('click',()=>{filterDirty=false;load({},true);});
  $('[data-report-retry]').addEventListener('click',()=>load(attempted,!loaded));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && !filterDirty && !form.querySelector('[type=submit]').disabled)load(applied,!Object.keys(applied).length);});
  setInterval(()=>{if(!document.hidden && !filterDirty && !form.querySelector('[type=submit]').disabled)load(applied,!Object.keys(applied).length);},60000);
  load({},true);
})();
