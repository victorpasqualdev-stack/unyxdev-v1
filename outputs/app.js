const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const safe = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const companyId = window.ONYX_CONFIG?.companyId || '';
const apiBase = companyId ? `/api/companies/${companyId}` : null;

function addSharedStyles() {
  const style = document.createElement('style');
  style.textContent = `button,a,[role=button]{cursor:pointer}.new-appointment{margin-left:14px;border:0;border-radius:10px;padding:10px 14px;background:linear-gradient(90deg,#ffa731,#ff3d9a,#ca00cc);color:#fff;font:700 12px "DM Sans";box-shadow:0 6px 14px #ca00cc26}.new-appointment:hover{filter:brightness(.98);transform:translateY(-1px)}.appointment-actions{display:flex;align-items:center;gap:6px}.delete-appointment,.details-appointment{border:1px solid transparent;border-radius:8px;width:31px;height:31px;display:grid;place-items:center;transition:.18s ease}.details-appointment{background:#f7efff;border-color:#ead8fb;color:#72009e}.details-appointment:hover{background:#ead8fb;transform:translateY(-1px)}.delete-appointment{background:#fff2f5;border-color:#ffd8e2;color:#c53562}.delete-appointment:hover{background:#ffe0e8;transform:translateY(-1px)}.action-icon{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.onyx-dialog{border:0;border-radius:18px;padding:0;box-shadow:0 24px 80px #0b0b0f40;width:min(480px,calc(100% - 28px))}.onyx-dialog::backdrop{background:#0b0b0f88}.dialog-body{padding:24px}.dialog-body h2{margin:0 0 5px;font:700 22px Outfit,sans-serif}.dialog-body p{margin:0 0 19px;color:#737b8c;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.form-grid label{display:grid;gap:5px;font-size:11px;font-weight:700;color:#596170}.form-grid label.full{grid-column:1/-1}.form-grid input,.form-grid select{width:100%;border:1px solid #e1e4ea;border-radius:9px;padding:10px;font:13px "DM Sans";color:#25222a;background:#fff}.dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.dialog-actions button{border-radius:9px;padding:10px 13px;font:700 12px "DM Sans";border:1px solid #e1e4ea;background:#fff}.dialog-actions button[type=submit]{border:0;color:#fff;background:linear-gradient(90deg,#ff8c2b,#ff3d9a,#b900c2)}.appointment-details{margin-top:19px}.appointment-details dl{display:grid;grid-template-columns:130px 1fr;gap:10px;margin:0;font-size:13px}.appointment-details dt{color:#7b8290;font-weight:700}.appointment-details dd{margin:0;color:#28222e}.toast{position:fixed;right:20px;bottom:20px;background:#17121a;color:#fff;border-radius:10px;padding:12px 15px;font-size:12px;box-shadow:0 8px 30px #0003;z-index:5}`;
  const responsive = document.createElement('style');
  responsive.textContent = `
    button,a,[role=button]{touch-action:manipulation}
    .new-appointment{min-height:42px}.delete-appointment,.details-appointment{width:38px;height:38px}
    .onyx-dialog{max-height:calc(100dvh - 28px);overflow:auto}
    .form-grid input,.form-grid select{min-height:42px}.dialog-actions button{min-height:42px}
    @media(max-width:719px){
      .new-appointment{margin-left:0;min-height:44px;padding:10px 12px}
      .onyx-dialog{width:calc(100% - 20px);max-height:calc(100dvh - 20px);border-radius:16px}
      .dialog-body{padding:20px 16px}.form-grid{grid-template-columns:1fr}.form-grid label.full{grid-column:auto}
      .form-grid input,.form-grid select{min-height:48px;font-size:16px}
      .dialog-actions{position:sticky;bottom:-20px;padding:14px 0 2px;background:#fff}.dialog-actions button{min-height:46px}
      .appointment-details dl{grid-template-columns:1fr;gap:3px}.appointment-details dd{margin:0 0 11px}
      .toast{right:12px;left:12px;bottom:calc(80px + env(safe-area-inset-bottom));text-align:center;z-index:30}
    }`;
  document.head.append(style, responsive);
}
function toast(message) { const element = document.createElement('div'); element.className = 'toast'; element.textContent = message; document.body.append(element); setTimeout(() => element.remove(), 2800); }
async function request(url, options) { const response = await fetch(url, options); if (response.status === 401) { location.replace('/login'); throw new Error('Sua sessão expirou. Entre novamente.'); } if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Não foi possível concluir a ação.'); } return response.status === 204 ? null : response.json(); }

async function loadCompanyProfile() {
  if (!apiBase) return;
  try {
    const profile = await request(`${apiBase}/profile`);
    document.querySelectorAll('.profile .avatar').forEach(item => item.textContent = profile.name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase());
    document.querySelectorAll('[data-company-name]').forEach((item) => item.textContent = profile.name);
    document.querySelectorAll('[data-company-segment]').forEach((item) => item.textContent = profile.segment || 'Minha empresa');
    document.querySelectorAll('[data-company-first-name]').forEach((item) => item.textContent = profile.name.split(' ')[0]);
    document.querySelectorAll('.profile-text b').forEach((item) => item.textContent = profile.name);
    document.querySelectorAll('.profile-text span').forEach((item) => item.textContent = profile.segment || 'Minha empresa');
  } catch { /* A página continua utilizável e mostrará o aviso nas ações que dependem da API. */ }
}

function initAppointments() {
  if (!apiBase) return;
  const header = document.querySelector('.page-actions') || document.querySelector('main header');
  const button = document.createElement('button'); button.className='new-appointment';button.type='button';button.textContent='+ Novo agendamento';header?.append(button);
  const dialog=document.createElement('dialog');dialog.className='onyx-dialog';dialog.setAttribute('aria-label','Agendamento');
  dialog.innerHTML = `<form class="dialog-body" method="dialog"><h2>Novo agendamento</h2><p>Os campos abaixo usam os dados cadastrados para esta empresa.</p><div class="form-grid"><label>Data<input required name="date" type="date"></label><label>Horário<input required name="time" type="time"></label><label class="full">Nome do cliente<input required name="name" placeholder="Ex.: Maria Silva"></label><label class="full">Telefone<input required name="phone" inputmode="numeric" autocomplete="tel" placeholder="(48) 99999-9999"></label><label>Serviço<select required name="service"><option value="">Carregando serviços...</option></select></label><label>Profissional<select required name="professional"><option value="">Carregando profissionais...</option></select></label><label>Valor (R$)<input required name="price" inputmode="numeric" placeholder="R$ 0,00"></label><label>Status<select name="status"><option>Confirmado</option><option>Pendente</option><option>Cancelado</option><option>Concluído</option><option>Não compareceu</option></select></label></div><p class="appointment-form-error" role="alert"></p><div class="dialog-actions"><button type="button" data-edit hidden>Editar</button><button type="button" data-close>Cancelar</button><button type="submit">Salvar agendamento</button></div></form>`;document.body.append(dialog);
  const form=dialog.querySelector('form'), fields=[...form.querySelectorAll('input,select')];
  const submit=form.querySelector('[type=submit]'), edit=form.querySelector('[data-edit]'), close=form.querySelector('[data-close]'), message=form.querySelector('.appointment-form-error');
  const labels={scheduled:'Pendente',confirmed:'Confirmado',cancelled:'Cancelado',completed:'Concluído',no_show:'Não compareceu'};
  let current=null,mode='new',busy=false,dirty=false,ready=false,opening=0;
  function setMode(next) {
    mode=next;fields.forEach(field=>field.disabled=busy || next==='view' || !ready);
    form.querySelector('h2').textContent=next==='new'?'Novo agendamento':next==='view'?'Visualizar agendamento':'Editar agendamento';
    form.querySelector('p').textContent=next==='view'?'Informações do agendamento. Clique em Editar para fazer alterações.':'Preencha os dados e salve o agendamento.';
    edit.hidden=next!=='view';edit.disabled=busy || !ready || !current;
    submit.hidden=next==='view';submit.disabled=busy || !ready;submit.textContent=busy?'Salvando...':next==='new'?'Salvar agendamento':'Salvar alterações';
    close.disabled=busy;close.textContent=next==='view'?'Fechar':'Cancelar';
  }
  function formatPhone(value) {
    const digits=String(value || '').replace(/\D/g,'').slice(0,11);
    if (!digits) return '';
    if (digits.length<=2) return `(${digits}`;
    const local=digits.slice(2),split=local.length>8?5:4;
    return `(${digits.slice(0,2)}) ${local.slice(0,split)}${local.length>split?'-'+local.slice(split):''}`;
  }
  function fill(item) {
    for(const name of ['service','professional']) {
      const select=form.elements[name];select.querySelectorAll('[data-previous]').forEach(option=>option.remove());
      if(![...select.options].some(option=>option.value===item[name])) { const option=new Option(item[name] || 'Não informado',item[name] || '');option.dataset.previous='true';select.add(option); }
    }
    for(const name of ['date','time','name','phone','service','professional'])form.elements[name].value=item[name] || '';
    form.elements.phone.value=formatPhone(item.phone);
    form.elements.price.value=currency.format(item.price);form.elements.status.value=labels[item.statusCode] || item.status;
  }
  async function catalogs() {
    try {
      const [services,professionals]=await Promise.all([request(`${apiBase}/services`),request(`${apiBase}/professionals`)]);
      form.elements.service.innerHTML='<option value="">Selecione</option>'+services.map(item=>`<option value="${safe(item.name)}" data-price="${item.price}">${safe(item.name)}</option>`).join('');
      form.elements.professional.innerHTML='<option value="">Selecione</option>'+professionals.map(item=>{const name=typeof item==='string'?item:item.name;return `<option value="${safe(name)}">${safe(name)}</option>`;}).join('');
      ready=true;if(current)fill(current);setMode(mode);
    }catch(error){message.textContent='Não foi possível carregar serviços e profissionais. Feche e tente novamente.';ready=false;setMode(mode);}
  }
  const catalogPromise=catalogs();
  async function open(item) {
    const generation=++opening;dirty=false;busy=false;current=null;form.reset();message.textContent='';
    if(item){mode='view';setMode('view');message.textContent='Carregando informações...';}
    else setMode('new');
    dialog.showModal();
    if(!ready)await catalogPromise;
    if(!ready)await catalogs();
    if(item){try{const latest=await request(`${apiBase}/appointments/${item.id}`);if(generation!==opening || !dialog.open)return;current=latest;fill(latest);message.textContent=ready?'':'Serviços indisponíveis. Feche e tente novamente para editar.';setMode('view');}catch(error){if(generation===opening){message.textContent=error.message;setMode('view');}}}
  }
  button.addEventListener('click',()=>open());
  edit.addEventListener('click',()=>{if(current&&ready){message.textContent='';setMode('edit');form.elements.date.focus();}});
  form.addEventListener('input',()=>{if(mode!=='view')dirty=true;});
  form.elements.service.addEventListener('change',event=>{const price=event.target.selectedOptions[0]?.dataset.price;if(price!=null)form.elements.price.value=currency.format(price);});
  form.elements.phone.addEventListener('input',event=>{event.target.value=formatPhone(event.target.value);});
  form.elements.price.addEventListener('input',event=>{const digits=event.target.value.replace(/\D/g,'');event.target.value=digits?currency.format(Number(digits)/100):'';});
  function dismiss() {if(busy)return;if(dirty&&!confirm('Descartar as alterações não salvas?'))return;opening++;dialog.close();}
  close.addEventListener('click',dismiss);dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !ready || mode==='view')return;
    const payload=Object.fromEntries(new FormData(form));const id=current?.id;busy=true;message.textContent='';setMode(mode);
    try{const saved=await request(`${apiBase}/appointments${id?'/'+id:''}`,{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});current=saved;dirty=false;busy=false;fill(saved);setMode('view');opening++;dialog.close();toast(id?'Agendamento atualizado.':'Agendamento salvo.');await window.refreshAppointments?.();}
    catch(error){message.textContent=error.message;}
    finally{busy=false;setMode(mode);}
  });
  document.querySelector('[data-client-dashboard]')?.addEventListener('click',async event=>{
    const details=event.target.closest('.details-appointment');if(details){open(JSON.parse(decodeURIComponent(details.dataset.appointment)));return;}
    const deletion=event.target.closest('.delete-appointment');if(!deletion)return;
    const item=deletion.closest('[data-id]');if(!item || !confirm('Excluir este agendamento?'))return;
    try{await request(`${apiBase}/appointments/${item.dataset.id}`,{method:'DELETE'});toast('Agendamento excluído.');await window.refreshAppointments?.();}catch(error){toast(error.message);}
  });
}


addSharedStyles();
const logoutButton = document.createElement('button');
logoutButton.type = 'button'; logoutButton.className = 'client-logout';
logoutButton.textContent = 'Sair'; logoutButton.setAttribute('aria-label', 'Sair do painel e desconectar');
document.querySelector('.client-sidebar')?.append(logoutButton);
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true; logoutButton.textContent = 'Saindo...';
  try { await request('/api/auth/logout', {method:'POST'}); location.replace('/login'); }
  catch(error) { toast(error.message); logoutButton.disabled = false; logoutButton.textContent = 'Sair'; }
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

document.querySelectorAll('.brand span').forEach((item) => item.textContent = 'UnyxChat.AI');
document.querySelectorAll('.nav a').forEach((item) => {
  const label = item.textContent.trim();
  if (label.includes('Configurações')) item.remove();
  if (label.includes('Visão geral')) item.href = '/visaogeral';
  if (label.includes('Agendamentos')) item.href = '/agendamentos';
  if (label.includes('Relatórios')) item.href = '/relatorios';
});
loadCompanyProfile();
if (document.querySelector('[data-client-dashboard]')) { initAppointments(); if (document.body.dataset.clientPage === 'overview') document.querySelector('.new-appointment')?.remove(); }
