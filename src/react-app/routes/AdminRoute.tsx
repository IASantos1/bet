import { Navigate } from 'react-router-dom';
import { useAuth } from '@/react-app/contexts/AuthContext';

type Props = {
  children: JSX.Element;
};

export function AdminRoute({ children }: Props) {
  const { user, loading } = useAuth();

  /* ================================
     LOADING CONTROLADO
  ================================= */
  if (loading) {
    return (
      <div className="w-full h-[60vh] flex items-center justify-center text-gray-500">
        A verificar permissões…
      </div>
    );
  }

  /* ================================
     NÃO LOGADO
  ================================= */
  if (!user) {
    return <Navigate to="/" replace />;
  }

  /* ================================
     NÃO É OPERADOR
  ================================= */
  if (!(user as any).is_operator) {
    return <Navigate to="/" replace />;
  }

  /* ================================
     OK
  ================================= */
  return children;
}
