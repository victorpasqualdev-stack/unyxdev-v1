function appointmentPrice(value, fallback) {
  if (value == null || value === '') return Number(fallback);
  const normalized = typeof value === 'string' ? value.trim().replace(/^R\$\s*/, '').replace(/\s/g, '') : value;
  const amount = typeof normalized === 'string' && normalized.includes(',')
    ? (/^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(normalized) ? Number(normalized.replace(/\./g, '').replace(',', '.')) : NaN)
    : (typeof normalized === 'number' || /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001) throw Object.assign(new Error('Informe um valor válido para o agendamento.'), {status:400});
  return amount;
}
module.exports={appointmentPrice};
