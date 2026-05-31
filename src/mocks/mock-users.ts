export interface MockUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string | null;
  birth_date?: string | null;
  balance: number;
  is_admin: boolean;
  created_at: string;
}

export const mockUsers: MockUser[] = [
  {
    id: 'admin-001',
    email: 'admin@betpro.pt',
    password: 'admin123',
    full_name: 'Administrador',
    phone: '+351912345678',
    birth_date: '1985-01-15',
    balance: 10000,
    is_admin: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-001',
    email: 'joao@example.com',
    password: 'senha123',
    full_name: 'João Silva',
    phone: '+351923456789',
    birth_date: '1990-05-20',
    balance: 500,
    is_admin: false,
    created_at: '2024-02-15T10:30:00Z',
  },
  {
    id: 'user-002',
    email: 'maria@example.com',
    password: 'senha123',
    full_name: 'Maria Santos',
    phone: '+351934567890',
    birth_date: '1988-08-10',
    balance: 1200,
    is_admin: false,
    created_at: '2024-03-01T14:20:00Z',
  },
  {
    id: 'user-003',
    email: 'pedro@example.com',
    password: 'senha123',
    full_name: 'Pedro Costa',
    phone: null,
    birth_date: '1995-12-05',
    balance: 250,
    is_admin: false,
    created_at: '2024-03-10T09:15:00Z',
  },
];
