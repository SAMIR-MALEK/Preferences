import { useState, useEffect, useRef } from 'react';
import AssignmentResults from './AssignmentResults';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { toArabicNum, toArabicFixed } from '../../lib/utils';
import { Home, User, Clock, FileText, Award, Download, Printer, Lock, GraduationCap, CheckCircle, BookOpen, Users, LogOut, Bell, ChevronRight } from 'lucide-react';
import WishesFormPage from './WishesFormPage';
import ProfessorProfilePage from './ProfessorProfilePage';
import type { Wish } from '../../types';
import { HOURS_LECTURE, HOURS_TD } from '../../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type ProfTab = 'home' | 'profile' | 's1' | 's2' | 'card' | 'results' | 'schedule';

function isProfileComplete(p: any): boolean {
  if (!p) return false;
  return Boolean(
    p.degree_speciality?.trim() &&
    p.degree_title?.trim() &&
    p.email?.trim() &&
    p.phone?.trim()
  );
}

export default function ProfessorDashboard() {
  const { user, signOut } = useAuth();
  const prof = user?.professor;
  const isVacataire = ((prof as any)?.username as string || '').startsWith('V');

  // Reload prof data after changes
  const [profData, setProfData] = useState(prof);
  const [hasResults, setHasResults] = useState(false);
  const [resultsPublished, setResultsPublished] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  useEffect(() => { setProfData(prof); }, [prof]);

  const profileComplete = isProfileComplete(profData);
  const [tab, setTab] = useState<ProfTab>(profileComplete ? 'schedule' : 'profile'); // سيُحدَّث بعد جلب resultsPublished

  // إن لم يكتمل الملف الشخصي، يبقى الأستاذ محصوراً في تبويب "معلوماتي" دائماً
  useEffect(() => {
    // جلب إعداد النشر
    supabase.from('academic_settings')
      .select('*')
      .eq('academic_year', '2026-2027')
      .single()
      .then(({ data }) => { if(data) { setSettings(data); const pub = data.results_published === true; setResultsPublished(pub); setRegistrationOpen(data.registration_s1_open === true); } });

    // فحص وجود نتائج إسناد أولية
    if (!prof?.id) return;
    supabase.from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', prof.id)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1)
      .eq('status', 'نهائي')
      .then(({ count }) => setHasResults((count || 0) > 0));
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
  const s2Unlocked = true; // حرية تنقّل كاملة بين السداسيين — لا إلزام بتأكيد الأول قبل الوصول للثاني

  const tabs = [
    { id: 'schedule' as ProfTab, label: 'التكليف البيداغوجي', icon: Clock, disabled: !profileComplete, highlighted: true },
    ...(resultsPublished ? [{ id: 'results' as ProfTab, label: 'الإسناد النهائي', icon: Award, disabled: !profileComplete, small: true }] : []),
    { id: 'profile' as ProfTab, label: 'معلوماتي', icon: User, small: true },
  ];

  return (
    <div className="min-h-screen bg-[#f1f4f9] font-arabic" dir="rtl">
      {/* Navbar */}
      <nav className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] shadow-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#c9a227] flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-white font-bold text-xs font-display">المنصة البيداغوجية</p>
                <p className="text-[#c9a227] text-[10px]">كلية الحقوق — برج بوعريريج</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              {tabs.map(t => {
                const Icon = t.icon;
                const isActive = tab === t.id;
                return (
                  <button key={t.id}
                    onClick={() => !t.disabled && setTab(t.id)}
                    disabled={t.disabled}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: isActive ? (t.id === 'results' ? '#c9a227' : '#c9a227') : (t.id === 'results' ? 'rgba(201,162,39,0.25)' : 'transparent'),
                      color: isActive ? 'white' : t.disabled ? 'rgba(255,255,255,.25)' : (t.id === 'results' ? '#fde68a' : 'rgba(255,255,255,.65)'),
                      cursor: t.disabled ? 'not-allowed' : 'pointer',
                      fontWeight: t.id === 'results' ? 'bold' : 'normal',
                      fontSize: t.id === 'results' ? '13px' : ((t as any).small ? '10px' : '11px'),
                      opacity: (t as any).small ? 0.75 : 1,
                      border: t.id === 'results' && !isActive ? '1px solid rgba(201,162,39,0.5)' : 'none',
                    }}>
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                    {/* Status dots */}
                    {t.id === 's1' && s1Locked && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    )}
                    {t.id === 's2' && s2Locked && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* User */}
            <div className="flex items-center gap-2">
              {isVacataire && (profData as any)?.photo_url ? (
                <a href={(profData as any).photo_url} download={`صورة_${profData?.last_name}`} target="_blank" rel="noopener noreferrer"
                  title="تحميل الصورة الشخصية">
                  <img src={(profData as any).photo_url} alt="صورة شخصية"
                    className="w-8 h-8 rounded-full object-cover border-2 border-[#c9a227] hover:opacity-80 transition-opacity cursor-pointer" />
                </a>
              ) : null}
              <div className="hidden sm:block text-left">
                <p className="text-white text-xs font-medium">{profData?.last_name} {profData?.first_name}</p>
                <p className="text-[#c9a227] text-[10px]">{isVacataire ? 'أستاذ مؤقت' : profData?.rank}</p>
              </div>
              <button onClick={signOut} className="text-gray-400 hover:text-red-400 transition-colors p-1">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

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
      {/* Banner */}
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

      {/* Steps */}
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
                <span className="text-sm" style={{ color: s.done ? '#15803d' : s.locked ? '#94a3b8' : '#475569' }}>
                  {s.t}
                  {s.done && <span className="text-green-500 text-xs mr-2">✓ مكتمل</span>}
                  {s.locked && <span className="text-gray-400 text-xs mr-2">🔒 مقفل</span>}
                </span>
              </div>
              {s.tab && !s.locked && !s.done && (
                <button onClick={() => setTab(s.tab)}
                  className="flex items-center gap-1 text-xs font-medium transition-colors flex-shrink-0"
                  style={{ color: s.tc }}>
                  ابدأ <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Semester cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { sem: 1, tab: 's1', color: '#1a3a6b', bg: 'rgba(26,58,107,.07)', locked: s1Locked },
          { sem: 2, tab: 's2', color: '#c9a227', bg: 'rgba(201,162,39,.1)', locked: s2Locked },
        ].map(s => (
          <div key={s.sem}
            className="bg-white rounded-2xl p-4 border-2 shadow-sm transition-all"
            style={{
              borderColor: s.locked ? '#bbf7d0' : `${s.color}33`,
            }}>
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
            <h3 className="font-display font-bold text-gray-800 text-sm mb-1">
              السداسي {s.sem === 1 ? 'الأول' : 'الثاني'}
            </h3>
            <p className="text-gray-400 text-xs mb-3">خمس رغبات إجبارية — متاح في أي وقت</p>
            <button
              onClick={() => setTab(s.tab)}
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
        <span className="font-display font-bold text-sm text-gray-800">
          السداسي {sem === 1 ? 'الأول' : 'الثاني'}
        </span>
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

      {/* The printable card */}
      <div ref={cardRef}
        className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
        {/* Card header */}
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

        {/* Prof info */}
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

        {/* Wishes */}
        <div className="p-4">
          <SemSection sem={1} list={s1Wishes} color="#1a3a6b" />
          <SemSection sem={2} list={s2Wishes} color="#c9a227" />
        </div>

        {/* Signatures */}
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

  // تجميع الإسنادات
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
        {/* Header */}
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

        {/* Prof info */}
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

        {/* Assignments */}
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

        {/* Signatures */}
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
// قالب كشف الغيابات (base64)
const ATTENDANCE_TEMPLATE_B64 = `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`;

// ─────────────────────────────────────────────────────────────────────
// كشف الغيابات — تحميل Excel لفوج واحد
function AttendanceDownloadButton({ prof, assignment }: { prof: any; assignment: any }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      // جلب القيم المميزة لـ specialite في هذا الفوج
      const { data: specRows } = await supabase
        .from('students')
        .select('specialite')
        .eq('groupe', assignment.group_number);
      const uniqueSpecs: string[] = [...new Set((specRows || []).map((r: any) => r.specialite).filter(Boolean))];

      // مطابقة specialite مع level_name (يتجاهل الفروق الطفيفة مثل "ال")
      const levelName: string = assignment.level_name || '';
      const normalize = (s: string) => s.replace(/\s+/g, ' ').replace(/ال/g, '').trim();
      const matchedSpec = uniqueSpecs.find(sp => normalize(sp) === normalize(levelName)) || uniqueSpecs[0] || null;

      let studQuery = supabase
        .from('students')
        .select('last_name, first_name, mat_etudiant')
        .eq('groupe', assignment.group_number)
        .order('last_name', { ascending: true });
      if (matchedSpec) studQuery = studQuery.eq('specialite', matchedSpec);
      const { data: students } = await studQuery;

      // تحميل القالب من base64
      const b64 = ATTENDANCE_TEMPLATE_B64;
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const wb = XLSX.read(bytes, { type: 'array' });
      const oldSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[oldSheetName];

      // تعديل اسم التبويب
      const groupStr = String(assignment.group_number).padStart(2, '0');
      const newSheetName = `ف${groupStr}`;
      wb.SheetNames[0] = newSheetName;
      wb.Sheets[newSheetName] = ws;
      if (oldSheetName !== newSheetName) delete wb.Sheets[oldSheetName];

      // ملء خلايا المعلومات
      const profName = `${prof?.last_name || ''} ${prof?.first_name || ''}`.trim();
      ws['A4'] = { ...ws['A4'], v: `المستوى: ${assignment.level_name || ''}`, w: `المستوى: ${assignment.level_name || ''}` };
      ws['D4'] = { ...ws['D4'], v: `الفوج: ${groupStr}`, w: `الفوج: ${groupStr}` };
      ws['G4'] = { ...ws['G4'], v: `المقياس: ${assignment.module_name || ''}`, w: `المقياس: ${assignment.module_name || ''}` };
      ws['K4'] = { ...ws['K4'], v: `الأستاذ: ${profName}`, w: `الأستاذ: ${profName}` };
      ws['A5'] = { ...ws['A5'], v: `النوع: ${assignment.teaching_type || ''}`, w: `النوع: ${assignment.teaching_type || ''}` };
      ws['D5'] = { ...ws['D5'], v: `الموسم: 2026/2027`, w: `الموسم: 2026/2027` };

      // ملء أسماء الطلبة (تبدأ من الصف 8)
      const startRow = 8;
      (students || []).forEach((s: any, i: number) => {
        const fullName = `${s.last_name || ''} ${s.first_name || ''}`.trim();
        const rowNum = startRow + i;
        const aKey = `A${rowNum}`;
        const bKey = `B${rowNum}`;
        if (ws[aKey]) {
          ws[aKey] = { ...ws[aKey], v: String(i + 1), w: String(i + 1), t: 'n', z: '0' };
        } else {
          ws[aKey] = { v: i + 1, t: 'n', z: '0' };
        }
        if (ws[bKey]) {
          ws[bKey] = { ...ws[bKey], v: fullName, w: fullName, t: 's' };
        } else {
          ws[bKey] = { v: fullName, t: 's' };
        }
      });

      // حذف الصفوف الفارغة الزائدة إن كان عدد الطلاب أقل من القالب
      const templateRows = 45; // القالب فيه 45 صفاً للطلاب
      const actualCount = (students || []).length;
      for (let i = actualCount; i < templateRows; i++) {
        const rowNum = startRow + i;
        for (let col = 0; col < 16; col++) {
          const key = XLSX.utils.encode_cell({ r: rowNum - 1, c: col });
          if (ws[key]) ws[key] = { ...ws[key], v: '', w: '' };
        }
      }

      // تحديث نطاق الورقة
      const lastRow = startRow + Math.max(actualCount, 1) - 1;
      ws['!ref'] = `A1:P${lastRow}`;

      const fname = `كشف_ف${groupStr}_${(assignment.level_name || '').replace(/\s+/g, '_')}_${(assignment.module_name || '').replace(/\s+/g, '_')}.xlsx`;
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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

// ─────────────────────────────────────────────────────────────────────
function ProfScheduleTab({ prof }: any) {
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [unscheduled, setUnscheduled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHours, setTotalHours] = useState(0);
  const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

  useEffect(() => {
    async function load() {
      // جلب كل إسنادات الأستاذ
      const { data: assignments } = await supabase.from('assignments')
        .select('id, module_id, teaching_type, section_number, group_number, weekly_hours, level_id')
        .eq('professor_id', prof?.id)
        .eq('academic_year', '2026-2027')
        .eq('semester', 1);

      if (!assignments || assignments.length === 0) { setLoading(false); return; }

      const total = assignments.reduce((s: number, a: any) => s + (a.weekly_hours || 0), 0);
      setTotalHours(total);

      // جلب المقاييس والمستويات منفصلاً
      const moduleIds = [...new Set(assignments.map((a: any) => a.module_id))];
      const levelIds = [...new Set(assignments.map((a: any) => a.level_id).filter(Boolean))];
      const [{ data: mods }, { data: lvls }] = await Promise.all([
        supabase.from('modules').select('id, name_ar, weekly_sessions').in('id', moduleIds),
        supabase.from('levels').select('id, name_ar').in('id', levelIds),
      ]);
      const modMap = new Map((mods || []).map((m: any) => [m.id, m]));
      const lvlMap = new Map((lvls || []).map((l: any) => [l.id, l.name_ar]));

      // جلب الحصص المبرمجة
      const allIds = assignments.map((a: any) => a.id);
      const { data: sch } = await supabase.from('schedules')
        .select('id, assignment_id, room_id, time_slot_id, time_slot:time_slots(day, start_time, end_time, slot_number)')
        .in('assignment_id', allIds)
        .eq('academic_year', '2026-2027')
        .eq('semester', 1);

      // جلب القاعات
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

      // ترتيب باليوم والوقت
      const dayOrder = Object.fromEntries(['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'].map((d,i) => [d,i]));
      scheduledItems.sort((a: any, b: any) => {
        const di = (dayOrder[a.day]??99) - (dayOrder[b.day]??99);
        return di !== 0 ? di : a.slot_number - b.slot_number;
      });
      setScheduled(scheduledItems);

      // غير المبرمجة — بدون تكرار للأعمال الموجهة
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

      {/* الحجم الساعي */}
      <div className="bg-[#1a3a6b] text-white rounded-2xl p-4 flex items-center justify-between">
        <p className="text-sm font-bold">الحجم الساعي الإجمالي</p>
        <p className="text-[#c9a227] font-bold text-lg">{totalHours.toFixed(2)} س/أسبوع</p>
      </div>

      {/* الحصص المبرمجة */}
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

      {/* غير المبرمجة */}
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
