(() => {
  const admin = document.body.dataset.loginScope === 'admin';
  const endpoint = admin ? '/api/admin-auth/login' : '/api/auth/login';
  const destination = admin ? '/admin' : '/visaogeral';
  const form = document.querySelector('#login-form');
  const password = document.querySelector('#password');
  const toggle = document.querySelector('.password-toggle');
  const message = document.querySelector('.message');
  const button = form.querySelector('button[type=submit]');
  const label = button.textContent;
  toggle.addEventListener('click', () => {
    const hidden = password.type === 'password';
    password.type = hidden ? 'text' : 'password';
    toggle.setAttribute('aria-label', hidden ? 'Ocultar senha' : 'Mostrar senha');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); message.textContent = ''; button.disabled = true; button.textContent = 'Verificando acesso...';
    try {
      const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      location.replace(destination);
    } catch(error) { message.textContent=error.message; button.disabled=false; button.textContent=label; }
  });
})();
