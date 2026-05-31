
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/react-app/contexts/AppContext';

export default function RegisterPage() {
  const { openAuthModal, user } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    } else {
      openAuthModal('register');
    }
  }, [user, navigate, openAuthModal]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4 dark:text-white">Redirecionando para Registo...</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    </div>
  );
}
