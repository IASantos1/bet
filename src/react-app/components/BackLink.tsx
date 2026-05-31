import { useLocation, useNavigate } from "react-router-dom";

export function BackLink() {
  const location = useLocation();
  const navigate = useNavigate();
  const show = location.pathname !== '/';
  if (!show) return null;
  return (
    <button onClick={() => { try { if (window.history.length <= 2) navigate('/'); else navigate(-1); } catch { navigate('/'); } }} className="ml-4 text-sm font-semibold text-red-600 hover:underline bg-transparent p-0">Voltar</button>
  );
}
