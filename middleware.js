module.exports = (req, res, next) => {
  // Adicionar headers CORS
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Responder a requisições OPTIONS
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  // Log de requisições
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Continuar para o próximo middleware
  next();
}
