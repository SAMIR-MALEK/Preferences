import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import ProfessorDashboard from './pages/professor/ProfessorDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] to-[#1a3a6b] flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#c9a227] flex items-center justify-center mx-auto mb-5 animate-pulse">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 01-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
        <p className="text-white text-sm font-arabic">جارٍ التحميل...</p>
      </div>
    </div>
  );

  if (!user) return <LoginPage />;
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'professor') return <ProfessorDashboard />;
  return <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
