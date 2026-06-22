import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useThemeStore from './store/themeStore';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Classement from './pages/Classement';
import Questions from './pages/Questions';
import Parties from './pages/Parties';
import Tournois from './pages/Tournois';
import TournoiDetail from './pages/TournoiDetail';
import Utilisateurs from './pages/Utilisateurs';
import Parametres from './pages/Parametres';
import TeamPage from './pages/TeamPage';
import RolesPage from './pages/RolesPage';
import SupportPage from './pages/SupportPage';

export default function App() {
  const isDark = useThemeStore((s) => s.isDark);

  // Applique le thème sur <html> (data-theme + classe) à chaque changement.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <Routes>
      {/* Routes publiques : la racine affiche la landing (vitrine grand public) */}
      <Route path="/" element={<Landing />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Console d'administration (protégée par PrivateRoute) */}
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/classement" element={<Classement />} />
        <Route path="/sessions" element={<Parties />} />
        <Route path="/tournaments" element={<Tournois />} />
        <Route path="/tournaments/:id" element={<TournoiDetail />} />
        <Route path="/users" element={<Utilisateurs />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/team/roles" element={<RolesPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/settings" element={<Parametres />} />
      </Route>

      {/* Inconnu → landing publique */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
