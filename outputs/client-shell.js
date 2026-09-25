(() => {
  const sidebar=document.querySelector('.app > aside');if(!sidebar)return;
  document.body.classList.add('client-area');sidebar.className='client-sidebar';
  const links=[['/visaogeral','⌂','Visão geral'],['/agendamentos','▣','Agendamentos'],['/relatorios','◫','Relatórios']];
  const current=decodeURIComponent(location.pathname);
  sidebar.innerHTML=`<div class="brand"><div class="brand-mark" aria-hidden="true"></div><span>UnyxChat.AI</span></div><div class="nav-label">PAINEL DO CLIENTE</div><nav class="nav" aria-label="Menu do cliente">${links.map(([href,icon,label])=>`<a href="${href}" ${current===href?'class="active" aria-current="page"':''}><i class="icon" aria-hidden="true">${icon}</i><span>${label}</span></a>`).join('')}</nav><div class="help"><b>Precisa de ajuda?</b><p>Conte com a nossa equipe.</p><a href="https://wa.me/5548988234180?text=Olá%2C%20preciso%20de%20suporte%20com%20a%20UnyxChat.AI." target="_blank" rel="noopener noreferrer">Falar com suporte</a></div>`;
})();
