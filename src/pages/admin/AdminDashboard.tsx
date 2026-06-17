import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

import {
  GraduationCap, Users, ClipboardList, Settings, LogOut,
  BarChart2, BookOpen, Bell, Award, CheckCircle, Clock,
  Layers, Eye, AlertTriangle, Upload
} from 'lucide-react';
import AdminProfessorsPage    from './AdminProfessorsPage';
import AdminSectionsPage      from './AdminSectionsPage';
import AdminModulesPage       from './AdminModulesPage';
import AdminWishesViewerPage  from './AdminWishesViewerPage';
import AdminAssignmentPage    from './AdminAssignmentPage';
import AdminSettingsPage      from './AdminSettingsPage';
import AdminImportPage        from './AdminImportPage';

type AdminTab =
  | 'dashboard' | 'professors' | 'import' | 'sections'
  | 'modules' | 'wishes' | 'assignment' | 'settings';

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState({
    profs: 0, locked: 0, modules: 0, wishes: 0, conflicts: 0,
  });

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    const [{ count: p }, { count: l }, { count: m }, { count: w }] = await Promise.all([
      supabase.from('professors').select('*',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('professors').select('*',{count:'exact',head:true}).eq('wishes_locked_s2',true),
      supabase.from('modules').select('*',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('wishes').select('*',{count:'exact',head:true}).eq('academic_year','2026-2027'),
    ]);
    setStats({ profs: p||0, locked: l||0, modules: m||0, wishes: w||0, conflicts: 0 });
  }

  const nav: { id: AdminTab; label: string; icon: any; badge?: number }[] = [
    { id: 'dashboard',  label: 'الإدارة',           icon: BarChart2  },
    { id: 'professors', label: 'الأساتذة',           icon: Users      },
    { id: 'import',     label: 'استيراد Excel',      icon: Upload     },
    { id: 'sections',   label: 'المجموعات',          icon: Layers     },
    { id: 'modules',    label: 'المقاييس',           icon: BookOpen   },
    { id: 'wishes',     label: 'استعراض الرغبات',   icon: Eye        },
    { id: 'assignment', label: 'الإسناد',            icon: Award      },
    { id: 'settings',   label: 'الإعدادات',          icon: Settings   },
  ];

  return (
    <div className="flex h-screen overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-52 bg-gradient-to-b from-[#060e1d] to-[#0d2040] flex flex-col flex-shrink-0 shadow-2xl">
        <div className="p-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#c9a227] flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-display font-bold text-xs">لوحة الإدارة</p>
              <p className="text-[#c9a227] text-[10px]">2026/2027</p>
            </div>
          </div>
        </div>

        <div className="p-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/30 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-[#c9a227]" />
            </div>
            <div>
              <p className="text-white text-xs font-medium">{user?.admin?.full_name}</p>
              <p className="text-gray-500 text-[10px]">{user?.admin?.role === 'super_admin' ? 'مشرف عام' : 'مشرف'}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => setTab(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-right"
                style={{
                  background: tab === item.id ? '#c9a227' : 'transparent',
                  color: tab === item.id ? 'white' : 'rgba(255,255,255,.5)',
                }}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="mr-auto w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t border-white/5">
          <button onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-[#eef1f7] p-5">
        {tab === 'dashboard'  && <AdminHome stats={stats} setTab={setTab} />}
        {tab === 'professors' && <AdminProfessorsPage />}
        {tab === 'import'     && <AdminImportPage />}
        {tab === 'sections'   && <AdminSectionsPage />}
        {tab === 'modules'    && <AdminModulesPage />}
        {tab === 'wishes'     && <AdminWishesViewerPage />}
        {tab === 'assignment' && <AdminAssignmentPage />}
        {tab === 'settings'   && <AdminSettingsPage />}
      </main>
    </div>
  );
}

// ── Dashboard Home ────────────────────────────────────────────────────
function AdminHome({ stats, setTab }: { stats: any; setTab: (t: AdminTab) => void }) {
  const pct = stats.profs > 0 ? Math.round((stats.locked / stats.profs) * 100) : 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display font-bold text-gray-900 text-xl">الإدارة</h2>
        <p className="text-gray-500 text-sm">الموسم الجامعي 2026/2027</p>
      </div>

      {/* Banner */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(#c9a227 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-[#c9a227]" />
              <span className="text-[#c9a227] text-xs font-semibold">الموسم 2026/2027 — التسجيل جارٍ</span>
            </div>
            <h3 className="font-display font-bold text-xl">نسبة الإنجاز: {pct}%</h3>
            <p className="text-gray-300 text-sm mt-1">{stats.locked} من {stats.profs} أستاذ أكملوا السداسيين</p>
          </div>
          <div className="w-16 h-16 relative flex-shrink-0">
            <svg width="64" height="64" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a227" strokeWidth="3"
                strokeDasharray={`${(pct/100)*87.96} ${87.96}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white text-sm">
              {pct}%
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: 'الأساتذة',        v: stats.profs,   i: Users,         c: '#1a3a6b', bg: 'rgba(26,58,107,.08)',   t: 'professors' },
          { l: 'أكملوا',         v: stats.locked,  i: CheckCircle,   c: '#d97706', bg: 'rgba(217,119,6,.08)',   t: 'professors' },
          { l: 'المقاييس',       v: stats.modules, i: BookOpen,      c: '#7c3aed', bg: 'rgba(124,58,237,.08)', t: 'modules'    },
          { l: 'الرغبات المسجّلة', v: stats.wishes,  i: ClipboardList, c: '#059669', bg: 'rgba(5,150,105,.08)',  t: 'wishes'     },
          { l: 'استعراض الرغبات', v: '→',           i: Eye,           c: '#0891b2', bg: 'rgba(8,145,178,.08)',  t: 'wishes'     },
        ].map(s => {
          const Icon = s.i;
          return (
            <button key={s.l} onClick={() => setTab(s.t as AdminTab)}
              className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-right hover:shadow-md transition-all cursor-pointer"
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: s.bg }}>
                <Icon className="w-4.5 h-4.5" style={{ color: s.c }} size={18} />
              </div>
              <p className="font-display font-bold text-2xl text-gray-900">{s.v}</p>
              <p className="text-gray-400 text-xs mt-1">{s.l}</p>
            </button>
          );
        })}
      </div>

      {/* Workflow guide */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <h3 className="font-display font-bold text-gray-800 text-sm mb-4">
          الخطوات المنهجية — قبل الإسناد
        </h3>
        <div className="space-y-3">
          {[
            { n: '1', t: 'استيراد الأساتذة من Excel', done: stats.profs > 0, tab: 'import', c: '#1a3a6b' },
            { n: '2', t: 'ضبط المجموعات والأفواج لكل مستوى', done: false, tab: 'sections', c: '#7c3aed' },
            { n: '3', t: 'إدخال المقاييس في كل سداسي', done: stats.modules > 0, tab: 'modules', c: '#0891b2' },
            { n: '4', t: 'انتظار تسجيل الأساتذة رغباتهم', done: stats.wishes > 0, tab: 'wishes', c: '#059669' },
            { n: '5', t: 'استعراض الرغبات الخام وتحليلها', done: false, tab: 'wishes', c: '#d97706' },
            { n: '6', t: 'تشغيل خوارزمية الإسناد', done: false, tab: 'assignment', c: '#dc2626' },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{
                  background: s.done ? s.c : `${s.c}15`,
                  color: s.done ? 'white' : s.c,
                  border: `2px solid ${s.c}`,
                }}>
                {s.done ? '✓' : s.n}
              </div>
              <span className="flex-1 text-sm" style={{ color: s.done ? '#15803d' : '#475569' }}>{s.t}</span>
              <button onClick={() => setTab(s.tab as AdminTab)}
                className="text-xs px-3 py-1 rounded-lg transition-colors hover:opacity-80"
                style={{ background: `${s.c}12`, color: s.c }}>
                انتقل →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-display font-bold text-gray-800 text-sm mb-3">إجراءات سريعة</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'استيراد من Excel',    tab: 'import',     style: { background: 'linear-gradient(135deg,#1a3a6b,#0d2040)', color: 'white' } },
            { label: 'استعراض الرغبات',    tab: 'wishes',     style: { background: 'linear-gradient(135deg,#059669,#065f46)', color: 'white' } },
            { label: 'تشغيل الإسناد',      tab: 'assignment', style: { background: 'linear-gradient(135deg,#c9a227,#a07820)', color: 'white' } },
            { label: 'إدارة المجموعات',    tab: 'sections',   style: { background: '#f1f5f9', color: '#475569' } },
          ].map(a => (
            <button key={a.label} onClick={() => setTab(a.tab as AdminTab)}
              className="px-4 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-90" style={a.style}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
