(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
  const date = v => v ? new Intl.DateTimeFormat('pt-BR').format(new Date(v)) : 'Sem registros';
  const initials = v => String(v || '').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || '—';
  let companies = [];
  const companiesPage = location.pathname === '/admin/empresas';
  document.querySelectorAll('[data-admin-link]').forEach(link => { const active = link.dataset.adminLink === (companiesPage ? 'companies' : 'overview'); link.classList.toggle('selected', active); if (active) link.setAttribute('aria-current','page'); });
  if (companiesPage) document.body.classList.add('admin-companies-page');
  async function api(path) {
    const response = await fetch(path), data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) { location.assign('/admin/login'); throw Error('Sua sessão expirou.'); }
    if (!response.ok) throw Error(data.error || 'Não foi possível carregar as informações.');
    return data;
  }
  function render() {
    const active = companies.filter(c => c.status === 'active').length, linked = companies.filter(c => c.users > 0).length;
    $('#metric-total').textContent=num(companies.length); $('#metric-active').textContent=num(active); $('#active-note').textContent=num(companies.length-active)+' empresa(s) inativa(s)';
    $('#metric-customers').textContent=num(companies.reduce((a,c)=>a+Number(c.customers||0),0)); $('#metric-appointments').textContent=num(companies.reduce((a,c)=>a+Number(c.appointments||0),0));
    $('#linked-count').textContent=num(linked); $('#pending-count').textContent=num(companies.length-linked); $('#company-count').textContent=num(companies.length);
    const search=$('#search').value.trim().toLowerCase(), status=$('#status-filter').value;
    const list=companies.filter(c => (status==='all'||c.status===status) && [c.name,c.segment,c.email,c.client_code].some(v=>String(v||'').toLowerCase().includes(search)));
    $('#company-rows').innerHTML=list.length ? list.map(c =>
      '<tr><td><div class="company-cell"><div class="company-avatar">'+esc(initials(c.name))+'</div><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.segment||'Segmento não informado')+(c.client_code?' · '+esc(c.client_code):'')+'</small></div></div></td><td><span class="badge '+(c.status==='active'?'':'inactive')+'">'+(c.status==='active'?'Ativa':'Inativa')+'</span></td><td>'+num(c.customers)+'</td><td>'+num(c.appointments)+'</td><td class="'+(c.users?'':'access-pending')+'">'+(c.users?num(c.users)+' vinculado(s)':'Sem acesso')+'</td><td>'+date(c.last_activity)+'</td><td><button class="row-button" data-details="'+esc(c.id)+'">Visualizar</button></td></tr>'
    ).join('') : '<tr><td colspan="7" class="empty">'+(companies.length?'Nenhuma empresa corresponde à busca.':'Ainda não há empresas para visualizar.')+'</td></tr>';
    $('#results').textContent=num(list.length)+' de '+num(companies.length)+' empresa(s)';
  }
  async function load() {
    $('#refresh').disabled=true; $('#notice').hidden=true;
    try { companies=await api('/api/admin/companies'); render(); if (companiesPage) requestAnimationFrame(() => $('#companies').scrollIntoView({block:'start'})); }
    catch(e) { $('#notice').textContent=e.message; $('#notice').hidden=false; }
    finally { $('#refresh').disabled=false; }
  }
  function rows(title, list, empty) {
    return '<section class="detail-section"><h3>'+title+' <span>'+num(list.length)+'</span></h3>'+(list.length?'<div class="resource-list">'+list.map(x=>'<article><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.meta)+'</small></div><span class="badge '+(x.active?'':'inactive')+'">'+(x.active?'Ativo':'Inativo')+'</span></article>').join('')+'</div>':'<p class="detail-empty">'+empty+'</p>')+'</section>';
  }
  async function openDetails(id) {
    const c=companies.find(x=>x.id===id); if(!c)return;
    const dialog=$('#company-detail'), content=$('#detail-content'); $('#detail-title').textContent=c.name; $('#detail-subtitle').textContent='Carregando dados da operação...'; content.innerHTML='<p class="empty">Carregando informações...</p>'; dialog.showModal();
    try {
      const data=await Promise.all(['','/services','/professionals','/settings','/accesses','/activity'].map(x=>api('/api/admin/companies/'+encodeURIComponent(id)+x)));
      const full=data[0], services=data[1], pros=data[2], settings=data[3], access=data[4], activity=data[5];
      $('#detail-subtitle').textContent=(full.segment||'Segmento não informado')+' · '+(full.status==='active'?'Operação ativa':'Operação inativa');
      const info=[['E-mail',full.email],['Telefone',full.phone],['Código',full.client_code],['Endereço',full.address],['Fuso horário',full.timezone],['Acesso ao painel',access.length?access.map(x=>x.email).join(', '):'Não vinculado']].map(x=>'<div class="detail-item"><span>'+esc(x[0])+'</span><strong>'+esc(x[1]||'Não informado')+'</strong></div>').join('');
      const setup=[['Horário',settings&&settings.start_time?String(settings.start_time).slice(0,5)+' às '+String(settings.end_time).slice(0,5):null],['Agenda',settings&&settings.schedule_description],['Tom de voz',settings&&settings.tone_of_voice],['Pagamentos',settings&&settings.payment_methods&&settings.payment_methods.join(', ')]].map(x=>'<div class="detail-item"><span>'+esc(x[0])+'</span><strong>'+esc(x[1]||'Não informado')+'</strong></div>').join('');
      const appointments=activity.length?'<div class="activity-list">'+activity.slice(0,5).map(x=>'<article><time>'+esc(date(x.appointment_date))+' · '+esc(String(x.start_time||'').slice(0,5))+'</time><div><strong>'+esc(x.customer_name||'Cliente')+'</strong><small>'+esc(x.service_name||'Serviço não informado')+'</small></div><span class="activity-status">'+esc(x.status||'agendado')+'</span></article>').join('')+'</div>':'<p class="detail-empty">Nenhum agendamento registrado.</p>';
      content.innerHTML='<section class="detail-metrics read-only"><article><small>Clientes</small><strong>'+num(full.customers)+'</strong></article><article><small>Agendamentos</small><strong>'+num(full.appointments)+'</strong></article><article><small>Serviços ativos</small><strong>'+num(services.filter(x=>x.is_active).length)+'</strong></article></section><div class="detail-columns"><section><h3>Informações da empresa</h3><div class="detail-grid">'+info+'</div></section><section><h3>Funcionamento</h3><div class="detail-grid">'+setup+'</div></section></div>'+rows('Serviços cadastrados',services.map(x=>({name:x.name,meta:(x.duration_minutes||'—')+' min',active:x.is_active})),'Nenhum serviço cadastrado.')+rows('Profissionais',pros.map(x=>({name:x.name,meta:x.specialty||'Especialidade não informada',active:x.is_active})),'Nenhum profissional cadastrado.')+'<section class="detail-section"><h3>Últimos agendamentos</h3>'+appointments+'</section>';
    } catch(e) { content.innerHTML='<div class="notice">'+esc(e.message)+'</div>'; $('#detail-subtitle').textContent='Não foi possível carregar a visualização.'; }
  }
  $('#search').addEventListener('input',render); $('#status-filter').addEventListener('change',render); $('#refresh').addEventListener('click',load);
  $('#company-rows').addEventListener('click',e=>{const b=e.target.closest('[data-details]');if(b)openDetails(b.dataset.details)});
  $('[data-close-detail]').addEventListener('click',()=>$('#company-detail').close());
  $('#logout').addEventListener('click',async()=>{await fetch('/api/admin-auth/logout',{method:'POST'});location.assign('/admin/login')});
  api('/api/admin-auth/me').then(p=>{if(!p.isAdmin)return location.assign('/admin/login');$('#account-email').textContent=p.user.email;$('.avatar').textContent=p.user.email[0].toUpperCase();load()}).catch(e=>{$('#notice').textContent=e.message;$('#notice').hidden=false});
})();
