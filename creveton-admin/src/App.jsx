import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
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
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Classement />} />
        <Route path="/questions" element={<Questions />} />
        <Route path="/sessions" element={<Parties />} />
        <Route path="/tournaments" element={<Tournois />} />
        <Route path="/users" element={<Utilisateurs />} />
        <Route path="/settings" element={<Parametres />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
