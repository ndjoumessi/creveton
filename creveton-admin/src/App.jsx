import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Classement from './pages/Classement';
import Questions from './pages/Questions';
import Parties from './pages/Parties';
import Tournois from './pages/Tournois';
import Utilisateurs from './pages/Utilisateurs';
import Parametres from './pages/Parametres';

export default function App() {
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
        <Route path="/users" element={<Utilisateurs />} />
        <Route path="/settings" element={<Parametres />} />
      </Route>

      {/* Inconnu → landing publique */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
