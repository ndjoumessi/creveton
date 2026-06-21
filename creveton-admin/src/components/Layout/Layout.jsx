import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUiStore } from '../../store/uiStore';

export default function Layout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  return (
    <div className="app-shell">
      <Sidebar />
      <div className={`app-main ${collapsed ? 'collapsed' : ''}`}>
        <Header />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
