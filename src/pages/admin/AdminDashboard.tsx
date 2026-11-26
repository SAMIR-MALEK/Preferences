import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { DEPARTMENT_LEVEL_CODES } from '../../types';
import { useReadOnlyGuard } from '../../lib/readOnlyGuard';
import ChangePasswordModal from '../../components/ChangePasswordModal';

import {
  GraduationCap, Users, ClipboardList, Settings, LogOut,
  BarChart2, BookOpen, Bell, Award, CheckCircle, Clock,
  Layers, Eye, AlertTriangle, Upload, Menu, X, Mail, MapPin, CalendarDays, Shield, ScrollText,
  ChevronDown, UserX, Network
} from 'lucide-react';
import { HeartHandshake, ClipboardCheck } from 'lucide-react';
import AdminRoomCheckPage from './AdminRoomCheckPage';
import TutoratReview from '../professor/TutoratReview';
import AdminHomeNow from './AdminHomeNow';
import AdminProfessorsPage    from './AdminProfessorsPage';
import AdminSectionsPage      from './AdminSectionsPage';
import AdminModulesPage       from './AdminModulesPage';
import AdminWishesViewerPage  from './AdminWishesViewerPage';
import AdminAssignmentPage    from './AdminAssignmentPage';
import AdminSettingsPage      from './AdminSettingsPage';
import AdminImportPage        from './AdminImportPage';
import AdminSpecialtiesPage   from './AdminSpecialtiesPage';
import AdminEmailPage         from './AdminEmailPage';
import AdminRoomsPage         from './AdminRoomsPage';
import AdminAuditPage         from './AdminAuditPage';
import AdminVacataireTab      from './AdminVacataireTab';
import AdminStudentsTab       from './AdminStudentsTab';
import AdminProfScheduleTab   from './AdminProfScheduleTab';
import AdminSchedulePage      from './AdminSchedulePage';
import AdminGroupRequests     from './AdminGroupRequests';
import AdminSessionsPage      from './AdminSessionsPage';
import AdminAssignmentBoardPage from './AdminAssignmentBoardPage';
import AdminThesisPage        from './AdminThesisPage';
import AdminDisciplinaryPage  from './AdminDisciplinaryPage';
import AdminMakeupPage        from './AdminMakeupPage';
import AdminAttendancePage    from './AdminAttendancePage';
import AdminStructurePage     from './AdminStructurePage';
import AdminStaffPage         from './AdminStaffPage';

type AdminTab =
  | 'dashboard' | 'professors' | 'import' | 'sections'
  | 'modules' | 'specialties' | 'sessions' | 'wishes' | 'assignment' | 'board' | 'rooms' | 'schedule' | 'audit' | 'vacataire' | 'settings' | 'email' | 'students' | 'profschedule' | 'grouprequests' | 'thesis' | 'disciplinary' | 'makeup' | 'attendance' | 'structure' | 'staff' | 'tutorat' | 'roomcheck';

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    main: true, components: false, pedagogy: false, students: false, system: false,
  });

  function toggleGroup(key: string) {
    setOpenGroups(g => ({ ...g, [key]: !g[key] }));
  }
  const [stats, setStats] = useState({
    profs: 0, locked: 0, modules: 0, wishes: 0, conflicts: 0, groupRequests: 0,
  });

  // إغلاق القائمة تلقائياً عند اختيار تبويب (على الهاتف)
  function selectTab(t: AdminTab) {
    setTab(t);
    setSidebarOpen(false);
  }

  // دعم السحب باللمس لفتح/إغلاق القائمة على الهاتف
  const touchStartX = useRef<number | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    // RTL: السحب من حافة الشاشة اليمنى نحو اليسار (deltaX سالب) يفتح القائمة
    if (!sidebarOpen && touchStartX.current > window.innerWidth - 40 && deltaX < -50) {
      setSidebarOpen(true);
    }
    // السحب من داخل القائمة نحو اليمين (deltaX إيجابي) يغلقها
    if (sidebarOpen && deltaX > 50) {
      setSidebarOpen(false);
    }
    touchStartX.current = null;
  }

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    const [{ count: p }, { count: l }, { count: m }, { count: w }, { count: gr }] = await Promise.all([
      supabase.from('professors').select('*',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('professors').select('*',{count:'exact',head:true}).eq('wishes_locked_s2',true),
      supabase.from('modules').select('*',{count:'exact',head:true}).eq('is_active',true),
      supabase.from('wishes').select('*',{count:'exact',head:true}).eq('academic_year','2026-2027'),
      supabase.from('group_change_requests').select('*',{count:'exact',head:true})
        .eq('status', 'pending'),
    ]);
    setStats({ profs: p||0, locked: l||0, modules: m||0, wishes: w||0, conflicts: 0, groupRequests: gr||0 });
  }

  const isDeptHead = user?.admin?.role === 'dept_head';
  const isStaff = user?.admin?.readOnly === true;   // مصلحة التدريس: عرض فقط
  const department = user?.admin?.department;
  const allowedLevelCodes = isDeptHead && department ? DEPARTMENT_LEVEL_CODES[department] : null;
  const STAFF_TABS: AdminTab[] = ['dashboard', 'sections', 'modules', 'rooms',
    'professors', 'schedule', 'profschedule', 'students', 'roomcheck'];
  const canSee = (t: AdminTab) => !isStaff || STAFF_TABS.includes(t);
  useReadOnlyGuard(mainRef, isStaff);

  type NavItem = { id: AdminTab; label: string; icon: any; badge?: number };
  type NavGroup = { key: string; label: string; items: NavItem[] };

  const allGroups: NavGroup[] = [
    {
      key: 'main',
      label: 'الرئيسية',
      items: [
        { id: 'dashboard', label: 'لوحة الإدارة', icon: BarChart2 },
        { id: 'structure', label: 'الهيكل الإداري والبيداغوجي', icon: Network },
      ],
    },
    {
      key: 'components',
      label: 'المكونات',
      items: [
        { id: 'specialties', label: 'التخصصات',    icon: GraduationCap },
        { id: 'sections',    label: 'المجموعات',   icon: Layers        },
        { id: 'modules',     label: 'المقاييس',    icon: BookOpen      },
        { id: 'rooms',       label: 'القاعات',      icon: MapPin        },
        { id: 'import',      label: 'استيراد Excel', icon: Upload       },
      ],
    },
    {
      key: 'professors',
      label: 'الأساتذة',
      items: [
        { id: 'professors',   label: 'الأساتذة',          icon: Users        },
        { id: 'vacataire',    label: 'الأساتذة المؤقتون', icon: Users        },
        { id: 'tutorat',      label: 'المرافقة البيداغوجية', icon: HeartHandshake },
        { id: 'schedule',     label: 'التوقيت',            icon: CalendarDays },
        { id: 'profschedule', label: 'برامج الأساتذة',    icon: CalendarDays },
        { id: 'roomcheck',    label: 'بطاقة متابعة القاعات', icon: ClipboardCheck },
      ],
    },
    {
      key: 'students',
      label: 'الطلبة',
      items: [
        { id: 'students',      label: 'الطلبة',         icon: GraduationCap                              },
        { id: 'grouprequests', label: 'تغيير الأفواج',  icon: ClipboardList, badge: stats.groupRequests },
        { id: 'attendance',    label: 'الغيابات',       icon: UserX                                      },
      ],
    },
    {
      key: 'pedagogy',
      label: 'التسيير البيداغوجي',
      items: [
        { id: 'wishes',       label: 'الرغبات',           icon: Eye           },
        { id: 'assignment',   label: 'الإسناد',           icon: Award         },
        { id: 'board',        label: 'لوحة الإسناد',      icon: Layers        },
        { id: 'schedule',     label: 'التوقيت',            icon: CalendarDays  },
        { id: 'profschedule', label: 'برامج الأساتذة',    icon: CalendarDays  },
        { id: 'roomcheck',    label: 'بطاقة متابعة القاعات', icon: ClipboardCheck },
        { id: 'makeup',       label: 'الحصص التعويضية',  icon: Clock         },
        { id: 'attendance',   label: 'الغيابات',          icon: UserX         },
        { id: 'thesis',       label: 'مذكرات التخرج',    icon: ScrollText    },
        { id: 'disciplinary', label: 'المجلس التأديبي',  icon: Shield        },
      ],
    },
    {
      key: 'system',
      label: 'النظام',
      items: [
        { id: 'email',    label: 'إرسال بريد',   icon: Mail     },
        { id: 'audit',    label: 'سجل التدقيق',  icon: Shield   },
        { id: 'staff',    label: 'حسابات المصالح', icon: Users  },
        { id: 'settings', label: 'الإعدادات',    icon: Settings },
      ],
    },
  ];

  // فلترة حسب الصلاحيات
  const isSuperAdmin = user?.admin?.role === 'super_admin' || (user?.admin as any)?.is_super === true;
  // المرافقة البيداغوجية: الإدارة (مشرف عام/مدير) أو رئيس قسم القانون العام فقط
  const tutoratMode: 'admin' | 'dept' | null = isStaff ? null
    : isDeptHead ? (department === 'عام' ? 'dept' : null)
    : (user?.admin?.role === 'super_admin' || user?.admin?.role === 'admin') ? 'admin' : null;
  const deptHeadHidden: AdminTab[] = ['assignment', 'settings', 'email', 'audit', 'staff', ...(tutoratMode ? [] : ['tutorat' as AdminTab])];
  const navGroups: NavGroup[] = allGroups.map(g => ({
    ...g,
    items: isStaff ? g.items.filter(i => STAFF_TABS.includes(i.id) && i.id !== 'import')
      : isDeptHead ? g.items.filter(i => !deptHeadHidden.includes(i.id))
      : isSuperAdmin ? g.items : g.items.filter(i => i.id !== 'staff' && (i.id !== 'tutorat' || !!tutoratMode)),
  })).filter(g => g.items.length > 0);

  return (
    <div
      className="flex h-screen overflow-hidden relative"
      dir="rtl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* شريط علوي ثابت — يظهر فقط على الهاتف والشاشات الصغيرة */}
      <div className="lg:hidden fixed top-0 right-0 left-0 z-30 h-14 bg-[#0d2040] flex items-center justify-between px-4 shadow-md">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-white p-1.5 -mr-1.5"
          aria-label="فتح القائمة">
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <p className="text-white font-display font-bold text-sm">لوحة الإدارة</p>
          <div className="w-7 h-7 rounded-lg bg-[#c9a227] flex items-center justify-center">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>

      {/* Overlay عند فتح القائمة على الهاتف */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-64 lg:w-52 bg-gradient-to-b from-[#060e1d] to-[#0d2040] flex flex-col flex-shrink-0 shadow-2xl
          fixed lg:static top-0 right-0 h-full z-50
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#c9a227] flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-display font-bold text-xs">لوحة الإدارة</p>
              <p className="text-[#c9a227] text-[10px]">2026/2027</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/50 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/30 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-[#c9a227]" />
            </div>
            <div>
              <p className="text-white text-xs font-medium">{user?.admin?.full_name}</p>
              <p className="text-gray-500 text-[10px]">
                {user?.admin?.role === 'super_admin' ? 'مشرف عام'
                  : isStaff ? (user?.admin?.service || 'مصلحة التدريس')
                  : user?.admin?.role === 'dept_head' ? `رئيس قسم القانون ${department}`
                  : 'مشرف'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto space-y-1">
          {navGroups.map(group => (
            <div key={group.key}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all mt-1"
                style={{
                  color: openGroups[group.key] ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                  background: openGroups[group.key] ? 'rgba(255,255,255,0.06)' : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = openGroups[group.key] ? 'rgba(255,255,255,0.06)' : 'transparent'; e.currentTarget.style.color = openGroups[group.key] ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'; }}
              >
                <span className="text-xs font-bold tracking-wide">{group.label}</span>
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform opacity-70"
                  style={{ transform: openGroups[group.key] ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                />
              </button>
              {/* Group items */}
              {openGroups[group.key] && (
                <div className="space-y-0.5 mt-0.5 pr-2">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} onClick={() => selectTab(item.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-medium transition-all text-right"
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
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-white/5">
          {isStaff && (
            <button onClick={() => setPwOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-[#c9a227] hover:bg-white/5 transition-all">
              <Settings className="w-3.5 h-3.5" />
              تغيير كلمة السر
            </button>
          )}
          <button onClick={signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      {/* Main */}
      <main ref={mainRef} className="flex-1 overflow-y-auto bg-[#eef1f7] p-5 pt-20 lg:pt-5">
        {tab === 'dashboard'  && (isStaff
          ? <AdminHome stats={stats} setTab={setTab} staff />
          : <AdminHomeNow setTab={setTab} department={isDeptHead ? (department || null) : null}
              allowedLevelCodes={allowedLevelCodes} tutoratMode={tutoratMode} />)}
        {canSee(tab) && tab === 'professors' && <AdminProfessorsPage />}
        {!isStaff && tab === 'tutorat' && tutoratMode && <TutoratReview mode={tutoratMode} />}
        {!isStaff && tab === 'import'     && <AdminImportPage allowedLevelCodes={allowedLevelCodes} />}
        {tab === 'sections'   && <AdminSectionsPage allowedLevelCodes={allowedLevelCodes} />}
        {tab === 'modules'    && <AdminModulesPage allowedLevelCodes={allowedLevelCodes} />}
        {!isStaff && tab === 'specialties' && <AdminSpecialtiesPage />}
        {!isStaff && tab === 'wishes'     && <AdminWishesViewerPage allowedLevelCodes={allowedLevelCodes} />}
        {!isDeptHead && tab === 'assignment' && <AdminAssignmentPage />}
        {!isStaff && tab === 'board'      && <AdminAssignmentBoardPage />}
        {tab === 'rooms'      && <AdminRoomsPage />}
        {tab === 'schedule'   && <AdminSchedulePage />}
        {!isDeptHead && tab === 'audit'      && <AdminAuditPage />}
        {!isStaff && tab === 'vacataire' && <AdminVacataireTab />}
        {tab === 'students' && <AdminStudentsTab />}
        {!isStaff && tab === 'grouprequests' && (
          <AdminGroupRequests
            role={user?.admin?.role === 'dept_head' ? 'dept_head' : 'super_admin'}
            department={user?.admin?.department as 'عام' | 'خاص' | undefined}
          />
        )}
        {tab === 'profschedule' && <AdminProfScheduleTab />}
        {tab === 'roomcheck'    && <AdminRoomCheckPage
          mode={isStaff ? 'print' : isDeptHead ? (department === 'عام' || department === 'خاص' ? 'record' : 'print')
            : (user?.admin?.role === 'super_admin' || user?.admin?.role === 'admin') ? 'view' : 'print'}
          department={isDeptHead ? (department || null) : null} />}
        {!isStaff && tab === 'thesis'                        && <AdminThesisPage />}
        {!isStaff && tab === 'disciplinary'              && <AdminDisciplinaryPage />}
        {!isStaff && tab === 'makeup'                    && <AdminMakeupPage />}
        {!isStaff && tab === 'attendance'                && <AdminAttendancePage />}
        {!isStaff && tab === 'structure'                 && <AdminStructurePage />}
        {isSuperAdmin && tab === 'staff'     && <AdminStaffPage />}
        {!isDeptHead && tab === 'settings'   && <AdminSettingsPage />}
        {!isDeptHead && tab === 'email'      && <AdminEmailPage />}
      </main>
    </div>
  );
}

// ── Dashboard Home ────────────────────────────────────────────────────
function AdminHome({ stats, setTab, staff }: { stats: any; setTab: (t: AdminTab) => void; staff?: boolean }) {
  const pct = stats.profs > 0 ? Math.round((stats.locked / stats.profs) * 100) : 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display font-bold text-gray-900 text-xl">الإدارة</h2>
        <p className="text-gray-500 text-sm">الموسم الجامعي 2026/2027</p>
      </div>

      {/* Banner */}
      {!staff && <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white relative overflow-hidden">
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
      </div>}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: 'الأساتذة',        v: stats.profs,   i: Users,         c: '#1a3a6b', bg: 'rgba(26,58,107,.08)',   t: 'professors' },
          { l: 'أكملوا',         v: stats.locked,  i: CheckCircle,   c: '#d97706', bg: 'rgba(217,119,6,.08)',   t: 'professors' },
          { l: 'المقاييس',       v: stats.modules, i: BookOpen,      c: '#7c3aed', bg: 'rgba(124,58,237,.08)', t: 'modules'    },
          { l: 'الرغبات المسجّلة', v: stats.wishes,  i: ClipboardList, c: '#059669', bg: 'rgba(5,150,105,.08)',  t: 'wishes'     },
          { l: 'استعراض الرغبات', v: '→',           i: Eye,           c: '#0891b2', bg: 'rgba(8,145,178,.08)',  t: 'wishes'     },
        ].filter(s => !staff || s.t === 'professors' || s.t === 'modules').filter(s => !staff || s.l !== 'أكملوا').map(s => {
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
      {!staff && <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
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
      </div>}

      {/* Quick actions */}
      {!staff && <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
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
      </div>}
    </div>
  );
}
