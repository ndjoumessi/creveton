import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/** Protège les routes : exige une session valide ET un rôle admin (CDC §3.7). */
export default function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (!isAdmin()) return <Navigate to="/login" replace />;
  return children;
}
