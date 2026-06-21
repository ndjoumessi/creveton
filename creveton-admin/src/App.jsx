import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Questions from './pages/Questions';
import Utilisateurs from './pages/Utilisateurs';
import Tournois from './pages/Tournois';
import Analytics from './pages/Analytics';
import Transactions from './pages/Transactions';
import ComingSoon from './pages/ComingSoon';

// Sections de la sidebar pas encore implémentées → placeholder (évite les liens morts).
const SOON = ['/alerts', '/support', '/kyc', '/finances', '/wallet-ops', '/compliance', '/audit', '/team', '/challenges', '/settings'];

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
        <Route path="/questions" element={<Questions />} />
        <Route path="/users" element={<Utilisateurs />} />
        <Route path="/tournaments" element={<Tournois />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/transactions" element={<Transactions />} />
        {SOON.map((p) => (
          <Route key={p} path={p} element={<ComingSoon />} />
        ))}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
