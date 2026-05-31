import fs from 'fs';
import path from 'path';
import { randomBytes, scryptSync } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to store.json
const DATA_FILE = path.join(__dirname, '../server/data/store.json');

// Admin credentials
const ADMIN_EMAIL = 'admin@bet62.plus';
const ADMIN_PASSWORD = 'admin123!@#'; // Altere para uma senha forte

// Helper para hash de senha (mesma lógica do server/index.ts)
function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hashedPassword = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: hashedPassword };
}

function createAdmin() {
  console.log('🔒 Criando usuário Admin...');

  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ Arquivo de dados não encontrado:', DATA_FILE);
    console.log('⚠️ Certifique-se de ter iniciado o servidor pelo menos uma vez para criar a estrutura.');
    return;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);

    // Inicializar arrays se não existirem
    if (!data.users) data.users = [];
    if (!data.profiles) data.profiles = [];

    // Verificar se já existe
    const existingUserIndex = data.users.findIndex((u: any) => u.email === ADMIN_EMAIL);
    
    const { salt, hash } = hashPassword(ADMIN_PASSWORD);
    const userId = existingUserIndex !== -1 ? data.users[existingUserIndex].id : randomBytes(16).toString('hex');
    const profileId = randomBytes(16).toString('hex');

    const adminUser = {
      id: userId,
      email: ADMIN_EMAIL,
      password_hash: hash,
      password_salt: salt,
      role: 'admin',
      name: 'Super Admin'
    };

    const adminProfile = {
      id: profileId,
      user_id: userId,
      email: ADMIN_EMAIL,
      full_name: 'Super Admin',
      name: 'Admin',
      balance: 1000000, // Saldo infinito para testes
      is_admin: true,
      status: 'active',
      kyc_verified: true,
      email_verified: true,
      created_at: new Date().toISOString()
    };

    if (existingUserIndex !== -1) {
      console.log('🔄 Atualizando usuário admin existente...');
      data.users[existingUserIndex] = adminUser;
      
      // Atualizar perfil
      const profileIndex = data.profiles.findIndex((p: any) => p.user_id === userId);
      if (profileIndex !== -1) {
        data.profiles[profileIndex] = { ...data.profiles[profileIndex], ...adminProfile, id: data.profiles[profileIndex].id };
      } else {
        data.profiles.push(adminProfile);
      }
    } else {
      console.log('✨ Criando novo usuário admin...');
      data.users.push(adminUser);
      data.profiles.push(adminProfile);
    }

    // Salvar
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    
    console.log('\n✅ Admin configurado com sucesso!');
    console.log(`📧 Email: ${ADMIN_EMAIL}`);
    console.log(`🔑 Senha: ${ADMIN_PASSWORD}`);
    console.log('\n⚠️ REINICIE O SERVIDOR para carregar as alterações!');

  } catch (err) {
    console.error('❌ Erro ao manipular arquivo de dados:', err);
  }
}

createAdmin();