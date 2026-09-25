// Captura explicitamente /api/* na Vercel, mantendo as rotas originais
// (por exemplo /api/health e /api/integrations/n8n/*) disponíveis.
module.exports = require('../server');
