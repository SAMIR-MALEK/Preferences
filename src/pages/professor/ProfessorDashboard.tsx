import { useState, useEffect, useRef } from 'react';
import AssignmentResults from './AssignmentResults';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { toArabicNum, toArabicFixed } from '../../lib/utils';
import { Home, User, Clock, FileText, Award, Download, Printer, Lock, GraduationCap, CheckCircle, BookOpen, Users, LogOut, Bell, ChevronRight, ScrollText, Plus, Trash2, Edit2, Send, X, AlertCircle, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import WishesFormPage from './WishesFormPage';
import ProfessorProfilePage from './ProfessorProfilePage';
import type { Wish } from '../../types';
import { HOURS_LECTURE, HOURS_TD } from '../../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import XLSX from 'xlsx-js-style';
import { unzipSync, strToU8, zipSync } from 'fflate';

type ProfTab = 'home' | 'profile' | 's1' | 's2' | 'card' | 'results' | 'schedule' | 'thesis';

function isProfileComplete(p: any): boolean {
  if (!p) return false;
  return Boolean(
    p.degree_speciality?.trim() &&
    p.degree_title?.trim() &&
    p.email?.trim() &&
    p.phone?.trim()
  );
}

// ─── Navbar Component ────────────────────────────────────────────────
function ProfNavbar({
  tab, setTab, profileComplete, profData, isVacataire, signOut, pendingThesisCount
}: {
  tab: ProfTab;
  setTab: (t: ProfTab) => void;
  profileComplete: boolean;
  profData: any;
  isVacataire: boolean;
  signOut: () => void;
  pendingThesisCount: number;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  function toggleMenu(name: string) {
    setOpenMenu(prev => prev === name ? null : name);
  }

  function go(t: ProfTab) {
    setTab(t);
    setOpenMenu(null);
  }

  const scheduleItems = [
    { tab: 'schedule' as ProfTab, label: 'جدول الحصص', desc: 'عرض توقيت حصصك الأسبوعية', icon: '📅', disabled: !profileComplete },
    { tab: 's1' as ProfTab, label: 'الرغبات — السداسي 1', desc: 'تسجيل وتعديل رغباتك', icon: '📝', disabled: !profileComplete },
    { tab: 's2' as ProfTab, label: 'الرغبات — السداسي 2', desc: 'تسجيل وتعديل رغباتك', icon: '📝', disabled: !profileComplete },
    { tab: 'card' as ProfTab, label: 'بطاقة الرغبات', desc: 'طباعة بطاقتك الموحدة', icon: '🪪', disabled: !profileComplete },
  ];

  const thesisItems = [
    { tab: 'thesis' as ProfTab, label: 'اقتراح العناوين', desc: 'المرحلة الأولى — جارٍ', icon: '📋', badge: pendingThesisCount > 0 ? String(pendingThesisCount) : null, disabled: !profileComplete, active: true },
    { tab: null, label: 'العناوين المقبولة', desc: 'المرحلة الثانية', icon: '✅', badge: 'قريباً', disabled: true },
    { tab: null, label: 'طلبات الطلبة', desc: 'المرحلة الثالثة', icon: '🎓', badge: 'قريباً', disabled: true },
    { tab: null, label: 'متابعة المذكرات', desc: 'المرحلة الرابعة', icon: '📊', badge: 'قريباً', disabled: true },
  ];

  const profileItems = [
    { tab: 'profile' as ProfTab, label: 'بياناتي الشخصية', desc: 'معلوماتك وملفك الأكاديمي', icon: '👤', disabled: false },
    { tab: 'card' as ProfTab, label: 'بطاقة الرغبات', desc: 'طباعة البطاقة الموحدة', icon: '🪪', disabled: !profileComplete },
  ];

  const isScheduleActive = ['schedule','s1','s2','card'].includes(tab);
  const isThesisActive = tab === 'thesis';
  const isProfileActive = ['profile'].includes(tab);

  return (
    <nav className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] shadow-xl sticky top-0 z-50" dir="rtl">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center h-14 gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2.5 ml-auto sm:ml-0">
            <div className="w-8 h-8 rounded-lg bg-[#c9a227] flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-white font-bold text-xs">المنصة البيداغوجية</p>
              <p className="text-[#c9a227] text-[10px]">كلية الحقوق — برج بوعريريج</p>
            </div>
          </div>

          {/* Nav items */}
          <div className="flex items-center gap-0.5 flex-1 justify-center">

            {/* التكليف البيداغوجي */}
            <div className="relative" onMouseLeave={() => setOpenMenu(null)}>
              <button
                onMouseEnter={() => setOpenMenu('schedule')}
                onClick={() => toggleMenu('schedule')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all select-none ${
                  isScheduleActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">التكليف البيداغوجي</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${openMenu === 'schedule' ? 'rotate-180' : ''}`} />
              </button>
              {openMenu === 'schedule' && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 z-50">
                  {scheduleItems.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => !item.disabled && go(item.tab)}
                      disabled={item.disabled}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 transition-colors text-right ${
                        item.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                      } ${tab === item.tab ? 'bg-blue-50' : ''}`}
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${tab === item.tab ? 'text-[#1a3a6b]' : 'text-gray-800'}`}>{item.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                      {tab === item.tab && <div className="w-1.5 h-1.5 rounded-full bg-[#1a3a6b] mt-1.5 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* مذكرات التخرج */}
            <div className="relative" onMouseLeave={() => setOpenMenu(null)}>
              <button
                onMouseEnter={() => setOpenMenu('thesis')}
                onClick={() => toggleMenu('thesis')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all select-none border ${
                  isThesisActive
                    ? 'bg-[#c9a227] text-white border-transparent'
                    : 'text-amber-300 hover:text-white hover:bg-[#c9a227]/20 border-[#c9a227]/30'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">مذكرات التخرج</span>
                {pendingThesisCount > 0 && !isThesisActive && (
                  <span className="bg-[#c9a227] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {pendingThesisCount}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${openMenu === 'thesis' ? 'rotate-180' : ''}`} />
              </button>
              {openMenu === 'thesis' && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 z-50">
                  {thesisItems.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => !item.disabled && item.tab && go(item.tab)}
                      disabled={item.disabled}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 transition-colors text-right ${
                        item.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-50 cursor-pointer'
                      } ${tab === item.tab ? 'bg-amber-50' : ''}`}
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-semibold ${tab === item.tab ? 'text-[#c9a227]' : 'text-gray-800'}`}>{item.label}</p>
                          {item.badge && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              item.badge === 'قريباً'
                                ? 'bg-gray-100 text-gray-400'
                                : 'bg-[#c9a227] text-white'
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* معلوماتي */}
            <div className="relative" onMouseLeave={() => setOpenMenu(null)}>
              <button
                onMouseEnter={() => setOpenMenu('profinfo')}
                onClick={() => toggleMenu('profinfo')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all select-none ${
                  isProfileActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <User className="w-3 h-3" />
                <span className="hidden sm:inline">معلوماتي</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${openMenu === 'profinfo' ? 'rotate-180' : ''}`} />
              </button>
              {openMenu === 'profinfo' && (
                <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 z-50">
                  {profileItems.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => !item.disabled && go(item.tab)}
                      disabled={item.disabled}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 transition-colors text-right ${
                        item.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                      } ${tab === item.tab ? 'bg-blue-50' : ''}`}
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                      <div>
                        <p className={`text-xs font-semibold ${tab === item.tab ? 'text-[#1a3a6b]' : 'text-gray-800'}`}>{item.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* User info + logout */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isVacataire && (profData as any)?.photo_url ? (
              <a href={(profData as any).photo_url} download={`صورة_${profData?.last_name}`} target="_blank" rel="noopener noreferrer">
                <img src={(profData as any).photo_url} alt="صورة"
                  className="w-8 h-8 rounded-full object-cover border-2 border-[#c9a227] hover:opacity-80 transition-opacity cursor-pointer" />
              </a>
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/40 flex items-center justify-center flex-shrink-0">
                <span className="text-[#c9a227] font-bold text-xs">
                  {profData?.last_name?.[0] || '؟'}
                </span>
              </div>
            )}
            <div className="hidden sm:block text-right">
              <p className="text-white text-xs font-medium leading-tight">{profData?.last_name} {profData?.first_name}</p>
              <p className="text-[#c9a227] text-[10px] leading-tight">{isVacataire ? 'أستاذ مؤقت' : profData?.rank}</p>
            </div>
            <button onClick={signOut} className="text-gray-400 hover:text-red-400 transition-colors p-1" title="تسجيل الخروج">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {/* Active underline indicator */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-[#c9a227]/40 to-transparent" />
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
export default function ProfessorDashboard() {
  const { user, signOut } = useAuth();
  const prof = user?.professor;
  const isVacataire = ((prof as any)?.username as string || '').startsWith('V');

  const [profData, setProfData] = useState(prof);
  const [hasResults, setHasResults] = useState(false);
  const [resultsPublished, setResultsPublished] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [pendingThesisCount, setPendingThesisCount] = useState(0);
  useEffect(() => { setProfData(prof); }, [prof]);

  const profileComplete = isProfileComplete(profData);
  const [tab, setTab] = useState<ProfTab>(profileComplete ? 'schedule' : 'profile');

  useEffect(() => {
    supabase.from('academic_settings')
      .select('*')
      .eq('academic_year', '2026-2027')
      .single()
      .then(({ data }) => { if(data) { setSettings(data); const pub = data.results_published === true; setResultsPublished(pub); setRegistrationOpen(data.registration_s1_open === true); } });

    if (!prof?.id) return;
    supabase.from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', prof.id)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1)
      .eq('status', 'نهائي')
      .then(({ count }) => setHasResults((count || 0) > 0));

    supabase.from('thesis_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', prof.id)
      .eq('academic_year', '2026-2027')
      .eq('status', 'مقترح')
      .then(({ count }) => setPendingThesisCount(count || 0));
  }, [prof?.id]);

  useEffect(() => {
    if (!profileComplete && tab !== 'profile') {
      setTab('profile');
    }
  }, [profileComplete, tab]);

  async function reloadProf() {
    const { data } = await supabase.from('professors').select('*').eq('id', prof?.id).single();
    if (data) setProfData(data);
  }

  const s1Locked = profData?.wishes_locked_s1 || false;
  const s2Locked = profData?.wishes_locked_s2 || false;
  const s2Unlocked = true;

  return (
    <div className="min-h-screen bg-[#f1f4f9] font-arabic" dir="rtl">
      <ProfNavbar
        tab={tab}
        setTab={setTab}
        profileComplete={profileComplete}
        profData={profData}
        isVacataire={isVacataire}
        signOut={signOut}
        pendingThesisCount={pendingThesisCount}
      />

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-5">
        {!resultsPublished && profileComplete && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">⏳</span>
            <div>
              <p className="font-bold text-amber-800 text-sm">النتائج النهائية قيد التدقيق</p>
              <p className="text-amber-600 text-xs mt-0.5">سيتم نشر نتائج الإسناد النهائية للسداسي الأول بعد التدقيق.</p>
            </div>
          </div>
        )}
        {tab === 'home' && hasResults && resultsPublished && (
          <div
            onClick={() => setTab('results')}
            className="cursor-pointer bg-gradient-to-l from-[#1a3a6b] to-[#0d2040] text-white rounded-2xl p-5 flex items-center gap-4 shadow-lg hover:shadow-xl transition-all mb-2 animate-fade-in">
            <div className="w-12 h-12 bg-[#c9a227] rounded-xl flex items-center justify-center flex-shrink-0">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-lg">صدرت نتائج الإسناد النهائية للسداسي الأول</p>
              <p className="text-white/70 text-sm mt-0.5">اضغط هنا للاطلاع على المقاييس المُسنَدة إليك</p>
            </div>
            <div className="text-white/50 text-2xl">←</div>
          </div>
        )}
        {tab === 'home' && (
          <ProfHome
            prof={profData}
            registrationOpen={registrationOpen}
            s1Locked={s1Locked}
            s2Locked={s2Locked}
            s2Unlocked={s2Unlocked}
            profileComplete={profileComplete}
            setTab={setTab}
          />
        )}
        {tab === 'profile' && (
          <ProfessorProfilePage
            forceComplete={!profileComplete}
            onSaved={async () => { await reloadProf(); }}
            onGoToWishes={!isVacataire ? () => setTab('s1') : undefined}
          />
        )}
        {tab === 's1' && (
          <WishesFormPage
            semester={1}
            onConfirmed={async () => { await reloadProf(); setTab('s2'); }}
          />
        )}
        {tab === 's2' && (
          <WishesFormPage
            semester={2}
            onConfirmed={async () => { await reloadProf(); setTab('card'); }}
          />
        )}
        {tab === 'card' && <WishCard prof={profData} />}
        {tab === 'results' && profData && resultsPublished && <AssignmentCard prof={profData} />}
        {tab === 'schedule' && profData && <ProfScheduleTab prof={profData} />}
        {tab === 'thesis' && profData && <ThesisProposalsTab prof={profData} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ProfHome({ prof, s1Locked, s2Locked, s2Unlocked, profileComplete, setTab, registrationOpen }: any) {
  const steps = [
    { n: '1', t: 'أكمل معلوماتك الشخصية', done: profileComplete, c: '#dbeafe', tc: '#1d4ed8', tab: 'profile' },
    { n: '2', t: 'سجّل رغبات السداسي الأول', done: s1Locked, c: 'rgba(26,58,107,.1)', tc: '#1a3a6b', tab: 's1' },
    { n: '3', t: 'سجّل رغبات السداسي الثاني (متاح في أي وقت)', done: s2Locked, c: 'rgba(201,162,39,.15)', tc: '#92400e', tab: 's2' },
    { n: '4', t: 'تأكيد واحد يُقفل السداسيين معاً', done: s2Locked, c: '#dcfce7', tc: '#15803d' },
    { n: '5', t: 'اطبع بطاقتك الموحّدة', done: false, c: '#fee2e2', tc: '#991b1b', tab: 'card', locked: !s1Locked },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(#c9a227 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[#c9a227] text-xs mb-1">أهلاً وسهلاً</p>
            <h2 className="font-display text-xl font-bold mb-2">{prof?.last_name} {prof?.first_name}</h2>
            <div className="flex items-center gap-2 text-gray-300 text-sm">
              <Award className="w-4 h-4 text-[#c9a227]" />
              {prof?.rank}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#c9a227]/20 border border-[#c9a227]/30 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-6 h-6 text-[#c9a227]" />
          </div>
        </div>
        <div className="relative mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#c9a227]" />
          <span className="text-xs text-gray-300">
            باب التسجيل <span className={registrationOpen ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{registrationOpen ? 'مفتوح' : 'مغلق'}</span> — الموسم الجامعي 2026/2027
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h3 className="font-display font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#1a3a6b] text-white text-[10px] flex items-center justify-center">!</span>
          مسار التسجيل
        </h3>
        <div className="relative">
          <div className="absolute right-3 top-3 bottom-3 w-0.5 bg-gray-100 z-0" />
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 mb-3 relative z-10">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{
                  background: s.done ? '#1a3a6b' : s.c,
                  border: `2px solid ${s.done ? '#1a3a6b' : s.tc}`,
                  color: s.done ? 'white' : s.tc,
                }}>
                {s.done ? '✓' : s.n}
              </div>
              <div className="flex-1 pt-0.5">
                <span className="text-sm" style={{ color: s.done ? '#15803d' : (s as any).locked ? '#94a3b8' : '#475569' }}>
                  {s.t}
                  {s.done && <span className="text-green-500 text-xs mr-2">✓ مكتمل</span>}
                  {(s as any).locked && <span className="text-gray-400 text-xs mr-2">🔒 مقفل</span>}
                </span>
              </div>
              {(s as any).tab && !(s as any).locked && !s.done && (
                <button onClick={() => setTab((s as any).tab)}
                  className="flex items-center gap-1 text-xs font-medium transition-colors flex-shrink-0"
                  style={{ color: s.tc }}>
                  ابدأ <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { sem: 1, tab: 's1', color: '#1a3a6b', bg: 'rgba(26,58,107,.07)', locked: s1Locked },
          { sem: 2, tab: 's2', color: '#c9a227', bg: 'rgba(201,162,39,.1)', locked: s2Locked },
        ].map(s => (
          <div key={s.sem}
            className="bg-white rounded-2xl p-4 border-2 shadow-sm transition-all"
            style={{ borderColor: s.locked ? '#bbf7d0' : `${s.color}33` }}>
            <div className="flex justify-between items-start mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <Clock className="w-5 h-5" style={{ color: s.color }} />
              </div>
              {s.locked
                ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> مكتمل
                  </span>
                : <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full animate-pulse">● جارٍ</span>
              }
            </div>
            <h3 className="font-display font-bold text-gray-800 text-sm mb-1">السداسي {s.sem === 1 ? 'الأول' : 'الثاني'}</h3>
            <p className="text-gray-400 text-xs mb-3">خمس رغبات إجبارية — متاح في أي وقت</p>
            <button
              onClick={() => setTab(s.tab as ProfTab)}
              className="w-full py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: s.locked ? 'rgba(26,58,107,.08)' : `linear-gradient(135deg,${s.color},${s.sem === 1 ? '#0d2040' : '#a07820'})`,
                color: s.locked ? s.color : 'white',
              }}>
              {s.locked ? 'مراجعة' : 'ابدأ التسجيل'}
            </button>
          </div>
        ))}
      </div>

      {s1Locked && !s2Locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
          <Bell className="w-4 h-4 flex-shrink-0 mt-0.5" />
          التأكيد في السداسي الثاني سيُقفل <strong>السداسيين معاً</strong> نهائياً بقفلة واحدة.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function WishCard({ prof }: any) {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('wishes')
      .select('*, module:modules(*, level:levels(*))')
      .eq('professor_id', prof?.id)
      .eq('academic_year', '2026-2027')
      .order('semester').order('wish_order')
      .then(({ data }) => { if (data) setWishes(data); setLoading(false); });
  }, []);

  async function downloadPDF() {
    if (!cardRef.current) return;
    setGenerating(true);
    const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#fff', logging: false });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth() - 20;
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, w, Math.min(h, 270));
    pdf.save(`بطاقة_الرغبات_${prof?.last_name}_2026-2027.pdf`);
    setGenerating(false);
  }

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin h-6 w-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full" /></div>;

  const s1Wishes = wishes.filter(w => w.semester === 1);
  const s2Wishes = wishes.filter(w => w.semester === 2);
  const wLabels = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

  const SemSection = ({ sem, list, color }: { sem: number; list: Wish[]; color: string }) => (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}>
          <Clock className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="font-display font-bold text-sm text-gray-800">السداسي {sem === 1 ? 'الأول' : 'الثاني'}</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}1a`, color }}>
          {toArabicNum(list.length)} رغبات
        </span>
      </div>
      {list.map((w, i) => (
        <div key={w.id}
          className="flex gap-3 items-center p-3 rounded-xl mb-2"
          style={{
            border: `1.5px solid ${i === 0 ? color + '55' : i === 1 ? color + '30' : '#e5e7eb'}`,
            background: i === 0 ? `${color}06` : '#fafafa'
          }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 font-display"
            style={{ background: i < 2 ? color : '#e5e7eb', color: i < 2 ? 'white' : '#475569' }}>
            {w.wish_order}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-800 text-sm">الرغبة {wLabels[i]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: w.teaching_type === 'محاضرة' ? 'rgba(26,58,107,.1)' : 'rgba(201,162,39,.1)',
                  color: w.teaching_type === 'محاضرة' ? '#1a3a6b' : '#92400e'
                }}>
                {w.teaching_type}
              </span>
              <span className="text-xs text-gray-400">
                {w.teaching_type === 'محاضرة' ? `${HOURS_LECTURE}س` : `${HOURS_TD}س`}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {(w as any).module?.level?.name_ar} — {(w as any).module?.name_ar}
            </p>
          </div>
          <div className="text-left flex-shrink-0">
            {w.taught_before
              ? <div><p className="text-xs text-green-600 font-semibold">✓ سابقاً</p>
                  <p className="text-xs text-gray-400">{w.previous_years?.join(' | ')}</p></div>
              : <span className="text-xs text-gray-400">—</span>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-lg">بطاقة الرغبات النهائية</h2>
          <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-200 mt-1">
            <Lock className="w-3 h-3" /> السداسيان مؤكدان ومقفلان
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPDF} disabled={generating}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg,#c9a227,#a07820)' }}>
            <Download className="w-4 h-4" />
            {generating ? 'جارٍ...' : 'PDF'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm transition-colors hover:bg-gray-200">
            <Printer className="w-4 h-4" />
            طباعة
          </button>
        </div>
      </div>

      <div ref={cardRef} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
        <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] p-5 text-white">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-[#c9a227] text-[10px]">الجمهورية الجزائرية الديمقراطية الشعبية — وزارة التعليم العالي</p>
              <p className="font-bold text-sm mt-1">جامعة محمد البشير الإبراهيمي — برج بوعريريج</p>
              <p className="text-[#c9a227] font-bold text-sm">كلية الحقوق والعلوم السياسية</p>
              <p className="text-gray-400 text-xs mt-0.5">نيابة العمادة المكلفة بالبيداغوجيا</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#c9a227]/20 border border-[#c9a227]/30 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-6 h-6 text-[#c9a227]" />
            </div>
          </div>
          <div className="text-center mt-4 pt-4 border-t border-white/15">
            <h2 className="font-display font-bold text-base">بطاقة تسجيل الرغبات البيداغوجية</h2>
            <p className="text-[#c9a227] text-xs font-semibold mt-1">الموسم الجامعي 2026 / 2027</p>
          </div>
        </div>

        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['اللقب والاسم', `${prof?.last_name} ${prof?.first_name}`],
              ['الرتبة', prof?.rank],
              ['الخبرة', `${prof?.professional_experience} سنة`],
              ['آخر شهادة', prof?.highest_degree],
              ['التخصص', prof?.degree_speciality || '—'],
              ['تاريخ التسجيل', new Date().toLocaleDateString('ar-DZ')],
            ].map(([k, v]) => (
              <div key={k as string}>
                <p className="text-[10px] text-gray-400 mb-0.5">{k}</p>
                <p className="text-xs font-semibold text-gray-800">{v as string}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <SemSection sem={1} list={s1Wishes} color="#1a3a6b" />
          <SemSection sem={2} list={s2Wishes} color="#c9a227" />
        </div>

        <div className="px-4 pb-5">
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-8 mt-5">
              {['توقيع الأستاذ', 'إمضاء نائب العميد المكلف بالبيداغوجيا'].map(s => (
                <div key={s} className="border-t-2 border-dashed border-gray-300 pt-2 text-center">
                  <p className="text-xs text-gray-400">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({ prof }: any) {
  const [assigned, setAssigned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('assignments')
      .select('teaching_type, weekly_hours, section_number, group_number, module:modules(name_ar), level:levels(name_ar)')
      .eq('professor_id', prof?.id)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1)
      .in('status', ['نهائي', 'مؤقت'])
      .then(({ data }) => { if (data) setAssigned(data); setLoading(false); });
  }, []);

  async function downloadPDF() {
    if (!cardRef.current) return;
    setGenerating(true);
    const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#fff', logging: false });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth() - 20;
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, w, Math.min(h, 270));
    pdf.save(`إسناد_${prof?.last_name}_2026-2027.pdf`);
    setGenerating(false);
  }

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin h-6 w-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full" /></div>;

  const lectures: any[] = [];
  const tds: any[] = [];
  assigned.forEach(a => {
    const modName = (a as any).module?.name_ar || '—';
    const levelName = (a as any).level?.name_ar || '—';
    if (a.teaching_type === 'محاضرة') {
      const ex = lectures.find(l => l.module_name === modName && l.level_name === levelName);
      if (ex) ex.weekly_hours += a.weekly_hours;
      else lectures.push({ module_name: modName, level_name: levelName, weekly_hours: a.weekly_hours });
    } else {
      const ex = tds.find(t => t.module_name === modName && t.level_name === levelName);
      if (ex) { ex.group_count++; ex.weekly_hours += a.weekly_hours; }
      else tds.push({ module_name: modName, level_name: levelName, group_count: 1, weekly_hours: a.weekly_hours });
    }
  });
  const totalHours = assigned.reduce((s, a) => s + a.weekly_hours, 0);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-lg">بطاقة الإسناد النهائي</h2>
          <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-200 mt-1">
            <CheckCircle className="w-3 h-3" /> الإسناد النهائي للسداسي الأول 2026/2027
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPDF} disabled={generating}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg,#c9a227,#a07820)' }}>
            <Download className="w-4 h-4" />
            {generating ? 'جارٍ...' : 'PDF'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm transition-colors hover:bg-gray-200">
            <Printer className="w-4 h-4" />
            طباعة
          </button>
        </div>
      </div>

      <div ref={cardRef} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
        <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] p-5 text-white">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-[#c9a227] text-[10px]">الجمهورية الجزائرية الديمقراطية الشعبية — وزارة التعليم العالي</p>
              <p className="font-bold text-sm mt-1">جامعة محمد البشير الإبراهيمي — برج بوعريريج</p>
              <p className="text-[#c9a227] font-bold text-sm">كلية الحقوق والعلوم السياسية</p>
              <p className="text-gray-400 text-xs mt-0.5">نيابة العمادة المكلفة بالبيداغوجيا</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#c9a227]/20 border border-[#c9a227]/30 flex items-center justify-center flex-shrink-0">
              <Award className="w-6 h-6 text-[#c9a227]" />
            </div>
          </div>
          <div className="text-center mt-4 pt-4 border-t border-white/15">
            <h2 className="font-display font-bold text-base">بطاقة الإسناد البيداغوجي النهائي</h2>
            <p className="text-[#c9a227] text-xs font-semibold mt-1">الموسم الجامعي 2026 / 2027 — السداسي الأول</p>
          </div>
        </div>

        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['اللقب والاسم', `${prof?.last_name} ${prof?.first_name}`],
              ['الرتبة', prof?.rank],
              ['الخبرة', `${prof?.professional_experience} سنة`],
              ['آخر شهادة', prof?.highest_degree],
              ['التخصص', prof?.degree_speciality || '—'],
              ['تاريخ الإصدار', new Date().toLocaleDateString('ar-DZ')],
            ].map(([k, v]) => (
              <div key={k as string}>
                <p className="text-[10px] text-gray-400 mb-0.5">{k}</p>
                <p className="text-xs font-semibold text-gray-800">{v as string}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {lectures.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-[#1a3a6b]" />
                </div>
                <span className="font-display font-bold text-sm text-gray-800">المحاضرات</span>
              </div>
              {lectures.map((l, i) => (
                <div key={i} className="flex gap-3 items-center p-3 rounded-xl mb-2 border border-blue-100 bg-blue-50/30">
                  <div className="flex-1">
                    <p className="font-bold text-gray-800 text-sm">{l.module_name}</p>
                    <p className="text-xs text-gray-500">{l.level_name}</p>
                  </div>
                  <span className="text-xs font-bold text-[#1a3a6b]">{l.weekly_hours.toFixed(2)}س/أسبوع</span>
                </div>
              ))}
            </div>
          )}
          {tds.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <div className="w-6 h-6 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-teal-600" />
                </div>
                <span className="font-display font-bold text-sm text-gray-800">الأعمال الموجهة</span>
              </div>
              {tds.map((t, i) => (
                <div key={i} className="flex gap-3 items-center p-3 rounded-xl mb-2 border border-teal-100 bg-teal-50/30">
                  <div className="flex-1">
                    <p className="font-bold text-gray-800 text-sm">{t.module_name}</p>
                    <p className="text-xs text-gray-500">{t.level_name} — {t.group_count === 1 ? 'فوج واحد' : t.group_count === 2 ? 'فوجان' : t.group_count + ' أفواج'}</p>
                  </div>
                  <span className="text-xs font-bold text-teal-700">{t.weekly_hours.toFixed(2)}س/أسبوع</span>
                </div>
              ))}
            </div>
          )}
          <div className="bg-[#1a3a6b] text-white rounded-xl p-3 text-center">
            <p className="text-xs text-blue-200">الحجم الساعي الأسبوعي الإجمالي</p>
            <p className="font-display font-bold text-lg">{totalHours.toFixed(2)} ساعة</p>
          </div>
        </div>

        <div className="px-4 pb-5">
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-8 mt-5">
              {['توقيع الأستاذ', 'إمضاء نائب العميد المكلف بالبيداغوجيا'].map(s => (
                <div key={s} className="border-t-2 border-dashed border-gray-300 pt-2 text-center">
                  <p className="text-xs text-gray-400">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function AttendanceDownloadButton({ prof, assignment }: { prof: any; assignment: any }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const { data: specRows } = await supabase
        .from('students').select('specialite').eq('groupe', assignment.group_number);
      const uniqueSpecs: string[] = [...new Set((specRows || []).map((r: any) => r.specialite).filter(Boolean))];
      const levelName: string = assignment.level_name || '';
      const normalize = (s: string) => s.replace(/\s+/g, ' ').replace(/ال/g, '').trim();
      const matchedSpec = uniqueSpecs.find(sp => normalize(sp) === normalize(levelName)) || uniqueSpecs[0] || null;

      let studQuery = supabase.from('students')
        .select('last_name, first_name, mat_etudiant')
        .eq('groupe', assignment.group_number)
        .order('last_name', { ascending: true });
      if (matchedSpec) studQuery = studQuery.eq('specialite', matchedSpec);
      const { data: students } = await studQuery;

      const groupStr = String(assignment.group_number).padStart(2, '0');
      const profName = `${prof?.last_name || ''} ${prof?.first_name || ''}`.trim();
      const sessions = 14;
      const totalCols = sessions + 2;

      const ws: any = {};
      const blackBorder = { style: 'thin', color: { rgb: '000000' } };
      const fullBorder  = { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder };

      const cell = (r: number, c: number, v: string | number, bold: boolean, halign: string, border: any) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        ws[addr] = {
          v, t: typeof v === 'number' ? 'n' : 's',
          s: {
            font:      { name: 'Calibri', sz: 12, bold },
            alignment: { horizontal: halign, vertical: 'center', readingOrder: 2, wrapText: false },
            border,
          },
        };
      };
      const empty = (r: number, c: number, border: any) => cell(r, c, '', false, 'center', border);
      const merge = (r: number, s: number, e: number) => ({ s: { r, c: s }, e: { r, c: e } });

      ws['!merges'] = [];

      cell(0, 0, 'جامعة محمد البشير الإبراهيمي — برج بوعريريج', true, 'center', {});
      for (let c = 1; c < totalCols; c++) empty(0, c, {});
      ws['!merges'].push(merge(0, 0, totalCols - 1));

      cell(1, 0, 'كلية الحقوق والعلوم السياسية', true, 'center', {});
      for (let c = 1; c < totalCols; c++) empty(1, c, {});
      ws['!merges'].push(merge(1, 0, totalCols - 1));

      for (let c = 0; c < totalCols; c++) empty(2, c, {});
      ws['!merges'].push(merge(2, 0, totalCols - 1));

      cell(3, 0, `المستوى: ${levelName}`, false, 'right', {});
      for (let c = 1; c < 5; c++) empty(3, c, {});
      ws['!merges'].push(merge(3, 0, 4));

      cell(3, 5, `الفوج: ${groupStr}`, false, 'center', {});
      for (let c = 6; c < 8; c++) empty(3, c, {});
      ws['!merges'].push(merge(3, 5, 7));

      cell(3, 8, `الأستاذ: ${profName}`, false, 'right', {});
      for (let c = 9; c < totalCols; c++) empty(3, c, {});
      ws['!merges'].push(merge(3, 8, totalCols - 1));

      cell(4, 0, `النوع: ${assignment.teaching_type || ''}`, false, 'right', {});
      for (let c = 1; c < 5; c++) empty(4, c, {});
      ws['!merges'].push(merge(4, 0, 4));

      cell(4, 5, `المقياس: ${assignment.module_name || ''}`, false, 'center', {});
      for (let c = 6; c < totalCols; c++) empty(4, c, {});
      ws['!merges'].push(merge(4, 5, totalCols - 1));

      for (let c = 0; c < totalCols; c++) empty(5, c, {});
      ws['!merges'].push(merge(5, 0, totalCols - 1));

      const headerFill = { fgColor: { rgb: 'D9D9D9' } };
      const hdrCell = (r: number, c: number, v: any, halign: string) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        ws[addr] = { v, t: typeof v === 'number' ? 'n' : 's',
          s: { font: { name: 'Calibri', sz: 12, bold: true },
               alignment: { horizontal: halign, vertical: 'center', readingOrder: 2, wrapText: false },
               fill: headerFill,
               border: fullBorder } };
      };
      hdrCell(6, 0, 'الرقم', 'center');
      hdrCell(6, 1, 'اللقب والاسم', 'center');
      for (let i = 0; i < sessions; i++) {
        hdrCell(6, 2 + i, `ح${i + 1}`, 'center');
      }

      (students || []).forEach((s: any, i: number) => {
        const r = 7 + i;
        const fullName = `${s.last_name || ''} ${s.first_name || ''}`.trim();
        cell(r, 0, i + 1,    false, 'center', fullBorder);
        cell(r, 1, fullName, false, 'right',  fullBorder);
        for (let c = 2; c < totalCols; c++) {
          empty(r, c, fullBorder);
        }
      });

      const totalRows = 7 + (students || []).length;
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: totalCols - 1 } });
      ws['!cols'] = [{ wch: 5 }, { wch: 24 }, ...Array(sessions).fill({ wch: 3 })];
      ws['!rows'] = [
        { hpt: 22 }, { hpt: 22 }, { hpt: 8 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, { hpt: 20 },
        ...Array((students || []).length).fill({ hpt: 18 }),
      ];
      ws['!rightToLeft'] = true;
      (ws as any)['!sheetViews'] = [{ rightToLeft: true }];
      ws['!pageSetup']   = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      ws['!margins']     = { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `ف${groupStr}`);
      const fname = `كشف_ف${groupStr}_${levelName.replace(/\s+/g, '_')}_${(assignment.module_name || '').replace(/\s+/g, '_')}.xlsx`;
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });

      const unzipped = unzipSync(new Uint8Array(wbout));
      const sheetKey = 'xl/worksheets/sheet1.xml';
      if (unzipped[sheetKey]) {
        let xml = new TextDecoder().decode(unzipped[sheetKey]);
        xml = xml.replace(/<sheetView /g, '<sheetView rightToLeft="1" ');
        if (!xml.includes('<sheetViews>')) {
          xml = xml.replace('<sheetData>', '<sheetViews><sheetView rightToLeft="1" tabSelected="1" workbookViewId="0"/></sheetViews><sheetData>');
        }
        unzipped[sheetKey] = strToU8(xml);
      }
      const fixedOut = zipSync(unzipped);
      const blob = new Blob([fixedOut], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err) {
      console.error('AttendanceDownload error:', err);
      alert('خطأ: ' + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={download}
        disabled={loading}
        className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-all"
        style={{ background: loading ? 'rgba(148,163,184,0.2)' : 'rgba(201,162,39,0.12)', color: loading ? '#94a3b8' : '#92400e', border: `1px solid ${loading ? 'rgba(148,163,184,0.3)' : 'rgba(201,162,39,0.3)'}` }}
      >
        <Download className="w-3 h-3" />
        {loading ? 'جارٍ...' : 'تحميل القائمة'}
      </button>
    </div>
  );
}

// ألوان افتراضية للتخصصات (تُطبَّق بالترتيب)
const SPEC_COLORS = ['#1a3a6b', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#db2777', '#d97706'];

// مذكرات التخرج — المرحلة 1: اقتراح العناوين بتخصصات ديناميكية
function ThesisProposalsTab({ prof }: any) {
  const [specialities, setSpecialities] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeForm, setActiveForm] = useState<string | null>(null); // speciality id
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ title_ar: '', title_fr: '', description: '' });
  const [error, setError] = useState('');

  const ACADEMIC_YEAR = '2026-2027';

  async function load() {
    setLoading(true);
    // جلب كل levels بدون فلتر ثم نصفّي على العميل
    const { data: levelsData, error: levelsError } = await supabase
      .from('levels')
      .select('id, name_ar, thesis_min, thesis_max, thesis_enabled')
      .order('name_ar', { ascending: true });

    console.log('[Thesis] levels raw:', levelsData, 'error:', levelsError);

    // فلترة ماستر 2 على العميل (يتعامل مع أي تشكيل في النص)
    const master2 = (levelsData || []).filter((l: any) => {
      const name = (l.name_ar || '').trim();
      return name.includes('ماستر 2') || name.includes('Master 2') || name.includes('master 2');
    });

    console.log('[Thesis] master2 rows:', master2);

    // نعرض كل ماستر 2 — إذا لم يكن العمود thesis_enabled موجوداً نتجاهل الفلتر
    const specs = master2
      .filter((l: any) => l.thesis_enabled !== false) // يُظهر إذا true أو null (عمود غير موجود)
      .map((l: any, i: number) => ({
        id: l.id,
        label: l.name_ar,
        min: l.thesis_min ?? 1,
        max: l.thesis_max ?? 3,
        color: SPEC_COLORS[i % SPEC_COLORS.length],
      }));
    setSpecialities(specs);

    // جلب المقترحات
    const { data } = await supabase
      .from('thesis_proposals')
      .select('*')
      .eq('professor_id', prof?.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .order('proposal_order', { ascending: true });
    setProposals(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [prof?.id]);

  function bySpec(specId: string | number) {
    return proposals
      .filter(p => String(p.speciality) === String(specId))
      .sort((a, b) => a.proposal_order - b.proposal_order);
  }

  function openAdd(specId: string) {
    setEditItem(null);
    setForm({ title_ar: '', title_fr: '', description: '' });
    setError('');
    setActiveForm(specId);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      title_ar: item.title_ar || '',
      title_fr: item.title_fr || '',
      description: item.description || '',
    });
    setError('');
    setActiveForm(item.speciality);
  }

  function cancelForm() {
    setActiveForm(null);
    setEditItem(null);
    setError('');
  }

  async function save(specId: string) {
    if (!form.title_ar.trim()) { setError('العنوان بالعربية إلزامي'); return; }
    setSaving(true);
    setError('');

    if (editItem) {
      const { error: err } = await supabase.from('thesis_proposals').update({
        title_ar: form.title_ar.trim(),
        title_fr: form.title_fr.trim() || null,
        description: form.description.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editItem.id);
      setSaving(false);
      if (err) { setError('حدث خطأ، حاول مجدداً'); return; }
    } else {
      const existing = bySpec(specId);
      const spec = specialities.find((s: any) => String(s.id) === String(specId))!;
      if (existing.length >= spec.max) {
        setError(`الحد الأقصى لهذا التخصص ${spec.max} عناوين`);
        setSaving(false);
        return;
      }
      const { error: err } = await supabase.from('thesis_proposals').insert({
        professor_id: prof?.id,
        academic_year: ACADEMIC_YEAR,
        title_ar: form.title_ar.trim(),
        title_fr: form.title_fr.trim() || null,
        speciality: String(specId),
        description: form.description.trim() || null,
        status: 'مقترح',
        proposal_order: existing.length + 1,
      });
      setSaving(false);
      if (err) { setError('حدث خطأ، حاول مجدداً'); return; }
    }

    setActiveForm(null);
    setEditItem(null);
    load();
  }

  async function remove(item: any) {
    await supabase.from('thesis_proposals').delete().eq('id', item.id);
    // إعادة ترقيم الترتيب في هذا التخصص
    const remaining = bySpec(item.speciality).filter(p => p.id !== item.id);
    for (let i = 0; i < remaining.length; i++) {
      await supabase.from('thesis_proposals').update({ proposal_order: i + 1 }).eq('id', remaining[i].id);
    }
    load();
  }

  async function moveUp(item: any) {
    const list = bySpec(item.speciality);
    const idx = list.findIndex(p => p.id === item.id);
    if (idx <= 0) return;
    const prev = list[idx - 1];
    await supabase.from('thesis_proposals').update({ proposal_order: idx }).eq('id', item.id);
    await supabase.from('thesis_proposals').update({ proposal_order: idx + 1 }).eq('id', prev.id);
    load();
  }

  async function moveDown(item: any) {
    const list = bySpec(item.speciality);
    const idx = list.findIndex(p => p.id === item.id);
    if (idx >= list.length - 1) return;
    const next = list[idx + 1];
    await supabase.from('thesis_proposals').update({ proposal_order: idx + 2 }).eq('id', item.id);
    await supabase.from('thesis_proposals').update({ proposal_order: idx + 1 }).eq('id', next.id);
    load();
  }

  // تحقق من اكتمال الحد الأدنى في كل التخصصات
  const allMinMet = specialities.length > 0 && specialities.every(spec => bySpec(spec.id).length >= spec.min);
  const totalProposals = proposals.filter(p => p.status === 'مقترح').length;

  async function submitAll() {
    if (!allMinMet) return;
    setSubmitting(true);
    // تغيير الحالة إلى "مُرسَل" (يمكن تعديل الاسم حسب الاتفاق)
    const ids = proposals.filter(p => p.status === 'مقترح').map(p => p.id);
    if (ids.length > 0) {
      await supabase.from('thesis_proposals').update({ status: 'مُرسَل' }).in('id', ids);
    }
    setSubmitting(false);
    load();
  }

  if (loading) return (
    <div className="flex justify-center p-10">
      <div className="animate-spin h-6 w-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(#c9a227 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-[#c9a227]/20 border border-[#c9a227]/30 flex items-center justify-center">
              <ScrollText className="w-3.5 h-3.5 text-[#c9a227]" />
            </div>
            <span className="text-[#c9a227] text-xs font-semibold">مذكرات التخرج — ماستر 2</span>
          </div>
          <h2 className="font-display font-bold text-base mt-1">اقتراح عناوين المذكرات</h2>
          <p className="text-gray-300 text-xs mt-1">الموسم الجامعي {ACADEMIC_YEAR} — يُرجى تعبئة جميع التخصصات بالحد الأدنى المطلوب</p>
        </div>
        <div className="relative mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> مقترح</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> مقبول</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> مرفوض</span>
            </div>
            <span className="font-bold text-white">{totalProposals} عنوان مقترح</span>
          </div>
        </div>
      </div>

      {/* Speciality cards */}
      {specialities.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-amber-700 text-sm">
          لم يتم تفعيل أي تخصص بعد — يرجى مراجعة الإدارة
        </div>
      )}
      {specialities.map(spec => {
        const list = bySpec(spec.id);
        const count = list.length;
        const pct = Math.min(100, Math.round((count / spec.max) * 100));
        const metMin = count >= spec.min;
        const atMax = count >= spec.max;
        const isFormOpen = activeForm === spec.id && !editItem;

        return (
          <div key={spec.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-800 text-sm">{spec.label}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      metMin ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {metMin ? '✓ اكتمل الحد الأدنى' : `الحد الأدنى: ${spec.min}`}
                    </span>
                    <span className="text-[10px] text-gray-400">الحد الأقصى: {spec.max}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          background: metMin ? spec.color : '#f59e0b',
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold flex-shrink-0" style={{ color: metMin ? spec.color : '#f59e0b' }}>
                      {count}/{spec.max}
                    </span>
                  </div>
                </div>
                {!atMax && (
                  <button
                    onClick={() => isFormOpen ? cancelForm() : openAdd(spec.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0"
                    style={{
                      background: isFormOpen ? 'rgba(239,68,68,0.08)' : `${spec.color}15`,
                      color: isFormOpen ? '#ef4444' : spec.color,
                      border: `1px solid ${isFormOpen ? 'rgba(239,68,68,0.2)' : spec.color + '30'}`,
                    }}>
                    {isFormOpen ? <><X className="w-3 h-3" /> إلغاء</> : <><Plus className="w-3 h-3" /> إضافة</>}
                  </button>
                )}
              </div>
            </div>

            {/* Proposals list */}
            {list.length > 0 && (
              <div className="divide-y divide-gray-50">
                {list.map((p, i) => {
                  const isEditing = editItem?.id === p.id && activeForm === spec.id;
                  const canEdit = p.status === 'مقترح';

                  if (isEditing) {
                    return (
                      <div key={p.id} className="px-5 py-4 bg-blue-50/50">
                        <InlineForm
                          form={form} setForm={setForm} error={error}
                          saving={saving}
                          onSave={() => save(spec.id)}
                          onCancel={cancelForm}
                          color={spec.color}
                          isEdit
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                      {/* Priority badge */}
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5"
                        style={{ background: spec.color, color: 'white' }}>
                        {p.proposal_order}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <StatusBadge status={p.status} />
                        </div>
                        <p className="font-semibold text-gray-800 text-sm leading-relaxed">{p.title_ar}</p>
                        {p.title_fr && (
                          <p className="text-gray-400 text-[11px] mt-0.5" dir="ltr">{p.title_fr}</p>
                        )}
                        {p.description && (
                          <p className="text-gray-400 text-[11px] mt-1 leading-relaxed">{p.description}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {canEdit && (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button onClick={() => moveUp(p)} disabled={i === 0}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 transition-all">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => moveDown(p)} disabled={i === list.length - 1}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 transition-all">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button onClick={() => openEdit(p)}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-[#1a3a6b] hover:bg-blue-50 transition-all">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => remove(p)}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add form */}
            {isFormOpen && (
              <div className="px-5 py-4 border-t border-gray-50 bg-gray-50/50">
                <InlineForm
                  form={form} setForm={setForm} error={error}
                  saving={saving}
                  onSave={() => save(spec.id)}
                  onCancel={cancelForm}
                  color={spec.color}
                />
              </div>
            )}

            {list.length === 0 && !isFormOpen && (
              <div className="px-5 py-6 text-center">
                <p className="text-gray-300 text-xs">لا توجد عناوين بعد — اضغط "إضافة" للبدء</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Submit button */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-sm mb-1">إرسال جميع المقترحات</p>
            <p className="text-gray-400 text-xs">
              {allMinMet
                ? 'جميع التخصصات مكتملة — يمكنك الإرسال الآن'
                : `يجب استيفاء الحد الأدنى في كل التخصصات قبل الإرسال`}
            </p>
            {!allMinMet && (
              <div className="mt-2 flex flex-wrap gap-1">
                {specialities.filter(s => bySpec(s.id).length < s.min).map(s => (
                  <span key={s.id} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                    {s.label}: {bySpec(s.id).length}/{s.min}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={submitAll}
            disabled={!allMinMet || submitting || proposals.every(p => p.status !== 'مقترح')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0"
            style={{
              background: allMinMet && !submitting ? 'linear-gradient(135deg,#1a3a6b,#0d2040)' : 'rgba(148,163,184,0.2)',
              color: allMinMet && !submitting ? 'white' : '#94a3b8',
              cursor: allMinMet && !submitting ? 'pointer' : 'not-allowed',
            }}>
            <Send className="w-4 h-4" />
            {submitting ? 'جارٍ الإرسال...' : 'إرسال'}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <span>الترتيب مهم - سيؤخذ الترتيب بعين الاعتبار عند انتقاء العناوين المقبولة، يمكنك ترتيب العناوين قبل التأكيد.</span>
      </div>
    </div>
  );
}

// ─── Inline Form ───────────────────────────────────────────────────
function InlineForm({ form, setForm, error, saving, onSave, onCancel, color, isEdit = false }: any) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">
          العنوان بالعربية <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.title_ar}
          onChange={e => setForm((f: any) => ({ ...f, title_ar: e.target.value }))}
          rows={2}
          placeholder="أدخل عنوان المذكرة بالعربية..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
          style={{ '--tw-ring-color': color } as any}
          dir="rtl"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">
          العنوان بالإنجليزية <span className="text-gray-400 font-normal">(اختياري)</span>
        </label>
        <input
          value={form.title_fr}
          onChange={e => setForm((f: any) => ({ ...f, title_fr: e.target.value }))}
          placeholder="Title in English (optional)..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
          dir="ltr"
        />
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1">
          الإشكالية أو أي ملاحظات أخرى <span className="text-gray-400 font-normal">(اختياري)</span>
        </label>
        <textarea
          value={form.description}
          onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="ستظهر هذه المعلومات للطلبة في حالة إضافتها..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
          dir="rtl"
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          style={{ background: color }}>
          <Send className="w-3.5 h-3.5" />
          {saving ? 'جارٍ...' : (isEdit ? 'حفظ التعديل' : 'إضافة العنوان')}
        </button>
        <button onClick={onCancel} className="px-3 py-2 rounded-xl text-xs text-gray-400 hover:bg-gray-100 transition-colors">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    'مقترح':  { bg: 'rgba(59,130,246,0.08)',  text: '#1d4ed8', border: 'rgba(59,130,246,0.2)' },
    'مُرسَل': { bg: 'rgba(139,92,246,0.08)',  text: '#6d28d9', border: 'rgba(139,92,246,0.2)' },
    'مقبول':  { bg: 'rgba(34,197,94,0.08)',   text: '#15803d', border: 'rgba(34,197,94,0.2)' },
    'مرفوض':  { bg: 'rgba(239,68,68,0.08)',   text: '#b91c1c', border: 'rgba(239,68,68,0.2)' },
    'معلّق':  { bg: 'rgba(245,158,11,0.08)',  text: '#92400e', border: 'rgba(245,158,11,0.2)' },
  };
  const sc = map[status] || map['مقترح'];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ProfScheduleTab({ prof }: any) {
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [unscheduled, setUnscheduled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHours, setTotalHours] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: assignments } = await supabase.from('assignments')
        .select('id, module_id, teaching_type, section_number, group_number, weekly_hours, level_id')
        .eq('professor_id', prof?.id)
        .eq('academic_year', '2026-2027')
        .eq('semester', 1);

      if (!assignments || assignments.length === 0) { setLoading(false); return; }

      const total = assignments.reduce((s: number, a: any) => s + (a.weekly_hours || 0), 0);
      setTotalHours(total);

      const moduleIds = [...new Set(assignments.map((a: any) => a.module_id))];
      const levelIds = [...new Set(assignments.map((a: any) => a.level_id).filter(Boolean))];
      const [{ data: mods }, { data: lvls }] = await Promise.all([
        supabase.from('modules').select('id, name_ar, weekly_sessions').in('id', moduleIds),
        supabase.from('levels').select('id, name_ar').in('id', levelIds),
      ]);
      const modMap = new Map((mods || []).map((m: any) => [m.id, m]));
      const lvlMap = new Map((lvls || []).map((l: any) => [l.id, l.name_ar]));

      const allIds = assignments.map((a: any) => a.id);
      const { data: sch } = await supabase.from('schedules')
        .select('id, assignment_id, room_id, time_slot_id, time_slot:time_slots(day, start_time, end_time, slot_number)')
        .in('assignment_id', allIds)
        .eq('academic_year', '2026-2027')
        .eq('semester', 1);

      const roomIds = [...new Set((sch || []).map((s: any) => s.room_id).filter(Boolean))];
      const { data: rooms } = roomIds.length > 0
        ? await supabase.from('rooms').select('id, name').in('id', roomIds)
        : { data: [] };
      const rMap = new Map((rooms || []).map((r: any) => [r.id, r.name]));
      const aMap = new Map(assignments.map((a: any) => [a.id, a]));

      const scheduledItems = (sch || []).map((s: any) => {
        const a = aMap.get(s.assignment_id) as any;
        const mod = modMap.get(a?.module_id);
        return {
          id: s.id,
          assignment_id: s.assignment_id,
          module_name: mod?.name_ar || '—',
          level_name: lvlMap.get(a?.level_id) || '—',
          teaching_type: a?.teaching_type || 'محاضرة',
          section: a?.section_number,
          group: a?.group_number,
          group_number: a?.group_number,
          level_id: a?.level_id,
          weekly_hours: a?.teaching_type === 'محاضرة' ? 2.25 : 1.5,
          room: rMap.get(s.room_id) || '—',
          day: s.time_slot?.day,
          start_time: s.time_slot?.start_time?.slice(0, 5),
          end_time: s.time_slot?.end_time?.slice(0, 5),
          slot_number: s.time_slot?.slot_number,
        };
      }).filter((s: any) => s.day);

      const dayOrder = Object.fromEntries(['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'].map((d,i) => [d,i]));
      scheduledItems.sort((a: any, b: any) => {
        const di = (dayOrder[a.day]??99) - (dayOrder[b.day]??99);
        return di !== 0 ? di : a.slot_number - b.slot_number;
      });
      setScheduled(scheduledItems);

      const scheduledIds = new Set(scheduledItems.map((s: any) => s.assignment_id));
      const unsch: any[] = [];
      const tdSeen = new Set<string>();
      assignments.filter((a: any) => !scheduledIds.has(a.id)).forEach((a: any) => {
        const mod = modMap.get(a.module_id);
        const level = lvlMap.get(a.level_id) || '—';
        if (a.teaching_type === 'أعمال موجهة') {
          const key = `${a.module_id}_${a.level_id}`;
          if (tdSeen.has(key)) return;
          tdSeen.add(key);
        }
        unsch.push({
          module_name: mod?.name_ar || '—',
          level_name: level,
          teaching_type: a.teaching_type,
          section: a.section_number,
          group: a.group_number,
          weekly_hours: (a.weekly_hours || 0) / (mod?.weekly_sessions || 1),
        });
      });
      setUnscheduled(unsch);
      setLoading(false);
    }
    load();
  }, [prof?.id]);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin h-6 w-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full" /></div>;

  const byDay = ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'].map(day => ({
    day,
    slots: scheduled.filter((s: any) => s.day === day),
  })).filter(d => d.slots.length > 0);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-700 flex items-center gap-2">
        <span>⚠</span> في حالة أي ملاحظة حول البرنامج يرجى الاتصال برئيسي القسمين
      </div>

      <div className="bg-[#1a3a6b] text-white rounded-2xl p-4 flex items-center justify-between">
        <p className="text-sm font-bold">الحجم الساعي الإجمالي</p>
        <p className="text-[#c9a227] font-bold text-lg">{totalHours.toFixed(2)} س/أسبوع</p>
      </div>

      {byDay.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-800 text-sm mb-3">📋 الحصص المبرمجة</h3>
          <div className="space-y-3">
            {byDay.map(({ day, slots }) => (
              <div key={day} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                <div className="bg-[#1a3a6b] px-4 py-2">
                  <p className="text-white font-bold text-xs">{day}</p>
                </div>
                {slots.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                    <div className="min-w-[110px]">
                      <p className="text-[#1a3a6b] font-bold text-xs">{s.start_time} — {s.end_time}</p>
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-xs">{s.module_name}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">
                        {s.level_name} —
                        {s.teaching_type === 'محاضرة' ? ` م${String(s.section).padStart(2,'0')}` : ` ف${String(s.group).padStart(2,'0')}`} —
                        {s.room}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'}`}>
                        {s.teaching_type}
                      </span>
                      <span className="text-[10px] text-gray-400">{s.weekly_hours?.toFixed(2)}س</span>
                      {s.teaching_type !== 'محاضرة' && (
                        <AttendanceDownloadButton prof={prof} assignment={s} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-800 text-sm mb-3">⏳ سيُبرمج توقيتها لاحقاً</h3>
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 overflow-hidden">
            {unscheduled.map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <p className="font-bold text-gray-600 text-xs">{s.module_name}</p>
                  <p className="text-gray-300 text-[10px] mt-0.5">
                    {s.level_name} —
                    {s.teaching_type === 'محاضرة' ? ` م${String(s.section).padStart(2,'0')}` : ` ف${String(s.group).padStart(2,'0')}`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-400' : 'bg-teal-50 text-teal-400'}`}>
                  {s.teaching_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {scheduled.length === 0 && unscheduled.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">لا توجد إسنادات بعد</p>
      )}
    </div>
  );
}
