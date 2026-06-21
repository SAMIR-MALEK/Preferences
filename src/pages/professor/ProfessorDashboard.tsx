import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { toArabicNum, toArabicFixed } from '../../lib/utils';
import {
  GraduationCap, User, LogOut, Home, Award,
  Bell, ChevronRight, CheckCircle, Lock, Clock,
  FileText, Printer, Download
} from 'lucide-react';
import WishesFormPage from './WishesFormPage';
import ProfessorProfilePage from './ProfessorProfilePage';
import type { Wish } from '../../types';
import { HOURS_LECTURE, HOURS_TD } from '../../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type ProfTab = 'home' | 'profile' | 's1' | 's2' | 'card';

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

  // Reload prof data after changes
  const [profData, setProfData] = useState(prof);
  useEffect(() => { setProfData(prof); }, [prof]);

  const profileComplete = isProfileComplete(profData);
  const [tab, setTab] = useState<ProfTab>(profileComplete ? 'home' : 'profile');

  // إن لم يكتمل الملف الشخصي، يبقى الأستاذ محصوراً في تبويب "معلوماتي" دائماً
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
  const s2Unlocked = s1Locked; // السداسي الثاني يُفتح بعد تأكيد الأول

  const tabs = [
    { id: 'home' as ProfTab, label: 'الرئيسية', icon: Home, disabled: !profileComplete },
    { id: 'profile' as ProfTab, label: 'معلوماتي', icon: User },
    { id: 's1' as ProfTab, label: 'السداسي الأول', icon: Clock, disabled: !profileComplete },
    { id: 's2' as ProfTab, label: 'السداسي الثاني', icon: Clock, disabled: !profileComplete || !s2Unlocked },
    { id: 'card' as ProfTab, label: 'بطاقتي', icon: FileText, disabled: !profileComplete || !s1Locked },
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
                <p className="text-white font-bold text-xs font-display">منصة الرغبات البيداغوجية</p>
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
                      background: isActive ? '#c9a227' : 'transparent',
                      color: isActive ? 'white' : t.disabled ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.65)',
                      cursor: t.disabled ? 'not-allowed' : 'pointer',
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
              <div className="hidden sm:block text-left">
                <p className="text-white text-xs font-medium">{profData?.last_name} {profData?.first_name}</p>
                <p className="text-[#c9a227] text-[10px]">{profData?.rank}</p>
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
        {tab === 'home' && (
          <ProfHome
            prof={profData}
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
            onGoToWishes={() => setTab('s1')}
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
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ProfHome({ prof, s1Locked, s2Locked, s2Unlocked, profileComplete, setTab }: any) {
  const steps = [
    { n: '1', t: 'أكمل معلوماتك الشخصية', done: profileComplete, c: '#dbeafe', tc: '#1d4ed8', tab: 'profile' },
    { n: '2', t: 'سجّل رغبات السداسي الأول', done: s1Locked, c: 'rgba(26,58,107,.1)', tc: '#1a3a6b', tab: 's1' },
    { n: '3', t: 'سجّل رغبات السداسي الثاني', done: s2Locked, c: 'rgba(201,162,39,.15)', tc: '#92400e', tab: 's2', locked: !s2Unlocked },
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
            باب التسجيل <span className="text-green-400 font-bold">مفتوح</span> — الموسم الجامعي 2026/2027
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
          { sem: 2, tab: 's2', color: '#c9a227', bg: 'rgba(201,162,39,.1)', locked: s2Locked, disabled: !s2Unlocked },
        ].map(s => (
          <div key={s.sem}
            className="bg-white rounded-2xl p-4 border-2 shadow-sm transition-all"
            style={{
              borderColor: s.locked ? '#bbf7d0' : s.disabled ? '#f1f5f9' : `${s.color}33`,
              opacity: s.disabled ? 0.5 : 1,
            }}>
            <div className="flex justify-between items-start mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                <Clock className="w-5 h-5" style={{ color: s.color }} />
              </div>
              {s.locked
                ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> مكتمل
                  </span>
                : s.disabled
                ? <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3" /> مقفل
                  </span>
                : <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full animate-pulse">● جارٍ</span>
              }
            </div>
            <h3 className="font-display font-bold text-gray-800 text-sm mb-1">
              السداسي {s.sem === 1 ? 'الأول' : 'الثاني'}
            </h3>
            <p className="text-gray-400 text-xs mb-3">
              {s.disabled ? 'أكمل السداسي الأول أولاً' : 'حتى 5 رغبات — رغبتان إجباريتان'}
            </p>
            <button
              onClick={() => !s.disabled && setTab(s.tab)}
              disabled={!!s.disabled}
              className="w-full py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: s.disabled ? '#f1f5f9' : s.locked ? 'rgba(26,58,107,.08)' : `linear-gradient(135deg,${s.color},${s.sem === 1 ? '#0d2040' : '#a07820'})`,
                color: s.disabled ? '#94a3b8' : s.locked ? s.color : 'white',
                cursor: s.disabled ? 'not-allowed' : 'pointer',
              }}>
              {s.locked ? 'مراجعة' : s.disabled ? 'مقفل' : 'ابدأ التسجيل'}
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
