import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import {
  X, ChevronRight, ChevronLeft, Maximize2, Minimize2,
  Users, BookOpen, AlertTriangle, Award, Clock, BarChart2,
  Filter, CheckCircle, AlertCircle
} from 'lucide-react';

// ══════════════════════════════════════════
// Types
// ══════════════════════════════════════════
interface MeetingData {
  stats: {
    total_profs: number;
    completed_profs: number;
    incomplete_profs: number;
    total_wishes: number;
    total_modules: number;
    assigned: number;
    pending_conflict: number;
    unassigned_profs: number;
  };
  conflicts: {
    module_name: string;
    level_name: string;
    teaching_type: string;
    section_number: number;
    group_number: number | null;
    candidates: {
      name: string;
      rank: string;
      speciality: string;
      experience: number;
      wish_order: number;
    }[];
  }[];
  unassigned_modules: {
    name: string;
    level_name: string;
    teaching_type: string;
    semester: number;
  }[];
  unassigned_profs: {
    name: string;
    rank: string;
    department: string;
  }[];
  workload: {
    name: string;
    rank: string;
    weekly_hours: number;
    modules_count: number;
  }[];
  extra_hours: {
    name: string;
    rank: string;
    s1_hours: number | null;
    s2_hours: number | null;
  }[];
}

interface Props {
  onClose: () => void;
}

const DEPT_FILTERS = [
  { value: 'all', label: 'الكلية كاملة' },
  { value: 'عام', label: 'القانون العام' },
  { value: 'خاص', label: 'القانون الخاص' },
];

const LEVEL_DEPT: Record<string, string> = {
  'L1': 'عام', 'L3G': 'عام', 'M1CJ': 'عام', 'M2CJ': 'عام',
  'M1URB': 'عام', 'M2URB': 'عام', 'M1INFO': 'عام', 'M2INFO': 'عام',
  'L2': 'خاص', 'L3P': 'خاص', 'M1AFF': 'خاص', 'M2AFF': 'خاص',
  'M1SAN': 'خاص', 'M2SAN': 'خاص',
};

export default function MeetingMode({ onClose }: Props) {
  const [slide, setSlide] = useState(0);
  const [data, setData] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [dept, setDept] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const TOTAL_SLIDES = 7;
  const ACADEMIC_YEAR = '2026-2027';

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        setSlide(s => e.key === 'ArrowRight'
          ? Math.max(0, s - 1)
          : Math.min(TOTAL_SLIDES - 1, s + 1));
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function loadData() {
    setLoading(true);
    const [
      { data: profs },
      { data: wishes },
      { data: modules },
      { data: levels },
      { data: assignments },
    ] = await Promise.all([
      supabase.from('professors').select('id, last_name, first_name, rank, degree_speciality, professional_experience, wishes_locked_s1, wishes_locked_s2, wants_extra_hours_s1, wants_extra_hours_s2, extra_hours_count_s1, extra_hours_count_s2'),
      supabase.from('wishes').select('professor_id, semester, module_id, wish_order').eq('academic_year', ACADEMIC_YEAR),
      supabase.from('modules').select('id, name_ar, level_id, has_lectures, has_td, semester').eq('is_active', true),
      supabase.from('levels').select('id, name_ar, code').eq('is_active', true),
      supabase.from('assignments').select('professor_id, module_id, level_id, teaching_type, section_number, group_number, weekly_hours, wish_order_satisfied, status').eq('academic_year', ACADEMIC_YEAR),
    ]);

    if (!profs || !wishes || !modules || !levels || !assignments) {
      setLoading(false);
      return;
    }

    const levelMap = new Map(levels.map(l => [l.id, l]));
    const moduleMap = new Map(modules.map(m => [m.id, m]));
    const profMap = new Map(profs.map(p => [p.id, p]));

    // Stats
    const completed = profs.filter(p => p.wishes_locked_s1 && p.wishes_locked_s2).length;
    const assigned = assignments.filter(a => a.status === 'assigned').length;
    const pending = new Set(assignments.filter(a => a.status === 'pending_conflict').map(a => a.professor_id)).size;

    // Conflicts — group by module+teaching_type+section+group
    const conflictMap = new Map<string, typeof assignments>();
    assignments.filter(a => a.status === 'pending_conflict').forEach(a => {
      const key = `${a.module_id}__${a.teaching_type}__${a.section_number}__${a.group_number ?? 0}`;
      if (!conflictMap.has(key)) conflictMap.set(key, []);
      conflictMap.get(key)!.push(a);
    });

    const conflicts = Array.from(conflictMap.entries()).map(([, group]) => {
      const mod = moduleMap.get(group[0].module_id);
      const level = levelMap.get(group[0].level_id);
      return {
        module_name: mod?.name_ar || '—',
        level_name: level?.name_ar || '—',
        teaching_type: group[0].teaching_type,
        section_number: group[0].section_number,
        group_number: group[0].group_number,
        candidates: group.map(a => {
          const prof = profMap.get(a.professor_id);
          return {
            name: `${prof?.last_name} ${prof?.first_name}`,
            rank: prof?.rank || '—',
            speciality: prof?.degree_speciality || '—',
            experience: prof?.professional_experience || 0,
            wish_order: a.wish_order_satisfied,
          };
        }),
      };
    });

    // Modules without anyone assigned
    const assignedModuleIds = new Set(assignments.filter(a => a.status === 'assigned').map(a => a.module_id));
    const unassigned_modules = modules
      .filter(m => !assignedModuleIds.has(m.id))
      .map(m => {
        const level = levelMap.get(m.level_id);
        return {
          name: m.name_ar,
          level_name: level?.name_ar || '—',
          teaching_type: m.has_lectures ? 'محاضرة' : 'أعمال موجهة',
          semester: m.semester,
        };
      });

    // Profs without assignment
    const assignedProfIds = new Set(assignments.filter(a => a.status === 'assigned').map(a => a.professor_id));
    const unassigned_profs = profs
      .filter(p => !assignedProfIds.has(p.id) && (p.wishes_locked_s1 || p.wishes_locked_s2))
      .map(p => ({
        name: `${p.last_name} ${p.first_name}`,
        rank: p.rank,
        department: '—',
      }));

    // Workload per prof
    const workload = profs
      .filter(p => assignedProfIds.has(p.id))
      .map(p => {
        const profAssignments = assignments.filter(a => a.professor_id === p.id && a.status === 'assigned');
        return {
          name: `${p.last_name} ${p.first_name}`,
          rank: p.rank,
          weekly_hours: profAssignments.reduce((s, a) => s + (a.weekly_hours || 0), 0),
          modules_count: profAssignments.length,
        };
      })
      .sort((a, b) => b.weekly_hours - a.weekly_hours);

    // Extra hours
    const extra_hours = profs
      .filter(p => p.wants_extra_hours_s1 || p.wants_extra_hours_s2)
      .map(p => ({
        name: `${p.last_name} ${p.first_name}`,
        rank: p.rank,
        s1_hours: p.wants_extra_hours_s1 ? p.extra_hours_count_s1 : null,
        s2_hours: p.wants_extra_hours_s2 ? p.extra_hours_count_s2 : null,
      }));

    setData({
      stats: {
        total_profs: profs.length,
        completed_profs: completed,
        incomplete_profs: profs.length - completed,
        total_wishes: wishes.length,
        total_modules: modules.length,
        assigned,
        pending_conflict: pending,
        unassigned_profs: unassigned_profs.length,
      },
      conflicts,
      unassigned_modules,
      unassigned_profs,
      workload,
      extra_hours,
    });
    setLoading(false);
  }

  const toggleFullscreen = useCallback((key: string) => {
    setExpanded(e => e === key ? null : key);
  }, []);

  const slides = [
    { label: 'نظرة عامة', icon: BarChart2 },
    { label: 'نتائج الإسناد', icon: Award },
    { label: 'التصادمات', icon: AlertTriangle },
    { label: 'مقاييس بدون أستاذ', icon: BookOpen },
    { label: 'أساتذة بدون إسناد', icon: Users },
    { label: 'الحمل الساعي', icon: Clock },
    { label: 'الساعات الإضافية', icon: BarChart2 },
  ];

  if (loading) return (
    <div className="fixed inset-0 z-[100] bg-[#060e1d] flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#c9a227]/30 border-t-[#c9a227] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">جارٍ تحميل بيانات الاجتماع...</p>
      </div>
    </div>
  );

  if (!data) return null;

  const conflict = data.conflicts[conflictIndex];

  // filter helpers
  const filteredUnassignedModules = dept === 'all'
    ? data.unassigned_modules
    : data.unassigned_modules.filter(m => {
        // نحاول تخمين القسم من اسم المستوى — تقريب بسيط
        return true; // بدون بيانات code هنا، نعرض الكل
      });

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-[#060e1d] flex flex-col" dir="rtl">

      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#c9a227] flex items-center justify-center">
            <Award className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">وضع الاجتماع — منصة الرغبات البيداغوجية</p>
            <p className="text-[#c9a227] text-xs">كلية الحقوق والعلوم السياسية — {ACADEMIC_YEAR}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Dept Filter */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {DEPT_FILTERS.map(f => (
              <button key={f.value} onClick={() => setDept(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dept === f.value ? 'bg-[#c9a227] text-white' : 'text-white/50 hover:text-white'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <button onClick={onClose} className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide Content */}
      <div className="flex-1 overflow-hidden px-8 py-6">

        {/* ── الشريحة ① نظرة عامة ── */}
        {slide === 0 && (
          <div className="h-full flex flex-col gap-6">
            <h2 className="text-[#c9a227] text-2xl font-bold text-center">نظرة عامة على الموسم الجامعي {ACADEMIC_YEAR}</h2>
            <div className="grid grid-cols-4 gap-5 flex-1">
              {[
                { label: 'إجمالي الأساتذة', value: data.stats.total_profs, sub: `${data.stats.completed_profs} أكملوا التسجيل`, color: '#c9a227', icon: Users },
                { label: 'لم يكملوا التسجيل', value: data.stats.incomplete_profs, sub: 'أستاذ', color: '#ef4444', icon: AlertCircle },
                { label: 'إجمالي الرغبات', value: data.stats.total_wishes, sub: 'رغبة مسجَّلة', color: '#3b82f6', icon: CheckCircle },
                { label: 'إجمالي المقاييس', value: data.stats.total_modules, sub: 'في السداسيين', color: '#8b5cf6', icon: BookOpen },
              ].map((stat, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${stat.color}20` }}>
                    <stat.icon className="w-7 h-7" style={{ color: stat.color }} />
                  </div>
                  <p className="text-5xl font-bold text-white mb-2" style={{ color: stat.color }}>{toArabicNum(stat.value)}</p>
                  <p className="text-white font-semibold text-sm mb-1">{stat.label}</p>
                  <p className="text-white/40 text-xs">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── الشريحة ② نتائج الإسناد ── */}
        {slide === 1 && (
          <div className="h-full flex flex-col gap-6">
            <h2 className="text-[#c9a227] text-2xl font-bold text-center">نتائج خوارزمية الإسناد</h2>
            <div className="grid grid-cols-3 gap-6 flex-1">
              {[
                { label: 'مُسنَد بنجاح', value: data.stats.assigned, color: '#22c55e', desc: 'أستاذ حصل على مقياسه' },
                { label: 'تصادم معلّق', value: data.stats.pending_conflict, color: '#f59e0b', desc: 'ينتظر قرار الاجتماع' },
                { label: 'بدون إسناد', value: data.stats.unassigned_profs, color: '#ef4444', desc: 'استُنفذت رغباته الخمس' },
              ].map((item, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center text-center p-8">
                  <div className="w-32 h-32 rounded-full border-8 flex items-center justify-center mb-6"
                    style={{ borderColor: item.color, background: `${item.color}15` }}>
                    <span className="text-5xl font-bold" style={{ color: item.color }}>{toArabicNum(item.value)}</span>
                  </div>
                  <p className="text-white text-xl font-bold mb-2">{item.label}</p>
                  <p className="text-white/50 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── الشريحة ③ التصادمات ── */}
        {slide === 2 && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[#c9a227] text-2xl font-bold">التصادمات المعلّقة</h2>
              <div className="flex items-center gap-3">
                <span className="text-white/50 text-sm">
                  {toArabicNum(conflictIndex + 1)} / {toArabicNum(data.conflicts.length)}
                </span>
                <button onClick={() => setConflictIndex(i => Math.max(0, i - 1))} disabled={conflictIndex === 0}
                  className="p-2 rounded-xl bg-white/10 text-white disabled:opacity-30 hover:bg-white/20 transition-all">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => setConflictIndex(i => Math.min(data.conflicts.length - 1, i + 1))} disabled={conflictIndex === data.conflicts.length - 1}
                  className="p-2 rounded-xl bg-white/10 text-white disabled:opacity-30 hover:bg-white/20 transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => toggleFullscreen('conflict')} className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
                  {expanded === 'conflict' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {data.conflicts.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                  <p className="text-white text-xl font-bold">لا توجد تصادمات معلّقة</p>
                  <p className="text-white/50 mt-2">تم حسم جميع التصادمات</p>
                </div>
              </div>
            ) : conflict && (
              <div className={`flex-1 ${expanded === 'conflict' ? 'fixed inset-16 z-50 flex flex-col bg-[#060e1d] rounded-2xl p-6' : 'flex flex-col'}`}>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-2xl font-bold text-white">{conflict.module_name}</span>
                    <span className="text-[#c9a227] text-lg">{conflict.level_name}</span>
                    <span className="bg-white/10 text-white px-3 py-1 rounded-full text-sm">{conflict.teaching_type}</span>
                    <span className="bg-white/10 text-white px-3 py-1 rounded-full text-sm">
                      مجموعة {toArabicNum(conflict.section_number)}{conflict.group_number ? ` / فوج ${toArabicNum(conflict.group_number)}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-right py-3 px-4 text-white/50 text-sm font-medium">الأستاذ</th>
                        <th className="text-right py-3 px-4 text-white/50 text-sm font-medium">الرتبة</th>
                        <th className="text-right py-3 px-4 text-white/50 text-sm font-medium">التخصص</th>
                        <th className="text-right py-3 px-4 text-white/50 text-sm font-medium">الخبرة</th>
                        <th className="text-right py-3 px-4 text-white/50 text-sm font-medium">رقم الرغبة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflict.candidates.map((c, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-4 px-4 text-white font-semibold text-lg">{c.name}</td>
                          <td className="py-4 px-4 text-[#c9a227]">{c.rank}</td>
                          <td className="py-4 px-4 text-white/70">{c.speciality}</td>
                          <td className="py-4 px-4 text-white/70">{toArabicNum(c.experience)} سنة</td>
                          <td className="py-4 px-4">
                            <span className="bg-[#c9a227]/20 text-[#c9a227] px-3 py-1 rounded-full text-sm font-bold">
                              الرغبة {toArabicNum(c.wish_order)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── الشريحة ④ مقاييس بدون أستاذ ── */}
        {slide === 3 && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[#c9a227] text-2xl font-bold">
                مقاييس بدون أستاذ ({toArabicNum(data.unassigned_modules.length)})
              </h2>
              <button onClick={() => toggleFullscreen('modules')} className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
                {expanded === 'modules' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
            <div className={`flex-1 overflow-auto ${expanded === 'modules' ? 'fixed inset-16 z-50 bg-[#060e1d] rounded-2xl p-6' : ''}`}>
              {data.unassigned_modules.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <p className="text-white text-xl font-bold">كل المقاييس لها أستاذ</p>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#060e1d]">
                    <tr className="border-b border-white/10">
                      <th className="text-right py-3 px-4 text-white/50 text-sm">المقياس</th>
                      <th className="text-right py-3 px-4 text-white/50 text-sm">المستوى</th>
                      <th className="text-right py-3 px-4 text-white/50 text-sm">نوع التدريس</th>
                      <th className="text-right py-3 px-4 text-white/50 text-sm">السداسي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unassigned_modules.map((m, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-white font-medium">{m.name}</td>
                        <td className="py-3 px-4 text-[#c9a227]">{m.level_name}</td>
                        <td className="py-3 px-4 text-white/70">{m.teaching_type}</td>
                        <td className="py-3 px-4 text-white/70">السداسي {m.semester === 1 ? 'الأول' : 'الثاني'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── الشريحة ⑤ أساتذة بدون إسناد ── */}
        {slide === 4 && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[#c9a227] text-2xl font-bold">
                أساتذة بدون إسناد ({toArabicNum(data.unassigned_profs.length)})
              </h2>
              <button onClick={() => toggleFullscreen('profs')} className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
                {expanded === 'profs' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
            <div className={`flex-1 overflow-auto ${expanded === 'profs' ? 'fixed inset-16 z-50 bg-[#060e1d] rounded-2xl p-6' : ''}`}>
              {data.unassigned_profs.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <p className="text-white text-xl font-bold">كل الأساتذة لديهم إسناد</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {data.unassigned_profs.map((p, i) => (
                    <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <p className="text-white font-semibold">{p.name}</p>
                      <p className="text-red-400 text-sm mt-1">{p.rank}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── الشريحة ⑥ الحمل الساعي ── */}
        {slide === 5 && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[#c9a227] text-2xl font-bold">توزيع الحمل الساعي الأسبوعي</h2>
              <button onClick={() => toggleFullscreen('workload')} className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
                {expanded === 'workload' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
            <div className={`flex-1 overflow-auto ${expanded === 'workload' ? 'fixed inset-16 z-50 bg-[#060e1d] rounded-2xl p-6' : ''}`}>
              <table className="w-full">
                <thead className="sticky top-0 bg-[#060e1d]">
                  <tr className="border-b border-white/10">
                    <th className="text-right py-3 px-4 text-white/50 text-sm">الأستاذ</th>
                    <th className="text-right py-3 px-4 text-white/50 text-sm">الرتبة</th>
                    <th className="text-right py-3 px-4 text-white/50 text-sm">عدد المقاييس</th>
                    <th className="text-right py-3 px-4 text-white/50 text-sm">الساعات الأسبوعية</th>
                    <th className="py-3 px-4 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.workload.map((w, i) => {
                    const maxHours = Math.max(...data.workload.map(x => x.weekly_hours));
                    const pct = maxHours > 0 ? (w.weekly_hours / maxHours) * 100 : 0;
                    return (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-white font-medium">{w.name}</td>
                        <td className="py-3 px-4 text-[#c9a227] text-sm">{w.rank}</td>
                        <td className="py-3 px-4 text-white/70 text-center">{toArabicNum(w.modules_count)}</td>
                        <td className="py-3 px-4 text-white font-bold">{w.weekly_hours.toFixed(2)} س</td>
                        <td className="py-3 px-4">
                          <div className="bg-white/10 rounded-full h-2">
                            <div className="h-2 rounded-full bg-[#c9a227]" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── الشريحة ⑦ الساعات الإضافية ── */}
        {slide === 6 && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[#c9a227] text-2xl font-bold">
                طلبات الساعات الإضافية ({toArabicNum(data.extra_hours.length)})
              </h2>
              <button onClick={() => toggleFullscreen('extra')} className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all">
                {expanded === 'extra' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
            <div className={`flex-1 overflow-auto ${expanded === 'extra' ? 'fixed inset-16 z-50 bg-[#060e1d] rounded-2xl p-6' : ''}`}>
              {data.extra_hours.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-white/50 text-lg">لا يوجد أساتذة طلبوا ساعات إضافية</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#060e1d]">
                    <tr className="border-b border-white/10">
                      <th className="text-right py-3 px-4 text-white/50 text-sm">الأستاذ</th>
                      <th className="text-right py-3 px-4 text-white/50 text-sm">الرتبة</th>
                      <th className="text-right py-3 px-4 text-white/50 text-sm">السداسي الأول</th>
                      <th className="text-right py-3 px-4 text-white/50 text-sm">السداسي الثاني</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.extra_hours.map((e, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-white font-medium">{e.name}</td>
                        <td className="py-3 px-4 text-[#c9a227] text-sm">{e.rank}</td>
                        <td className="py-3 px-4">
                          {e.s1_hours
                            ? <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm">{toArabicNum(e.s1_hours)} ساعات</span>
                            : <span className="text-white/30">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {e.s2_hours
                            ? <span className="bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full text-sm">{toArabicNum(e.s2_hours)} ساعات</span>
                            : <span className="text-white/30">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 flex-shrink-0">
        <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white disabled:opacity-30 hover:bg-white/20 transition-all">
          <ChevronRight className="w-4 h-4" /> السابق
        </button>

        {/* Slide indicators */}
        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button key={i} onClick={() => setSlide(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                slide === i
                  ? 'bg-[#c9a227] text-white font-bold'
                  : 'text-white/40 hover:text-white hover:bg-white/10'
              }`}>
              <s.icon className="w-3 h-3" />
              <span className="hidden lg:inline">{s.label}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setSlide(s => Math.min(TOTAL_SLIDES - 1, s + 1))} disabled={slide === TOTAL_SLIDES - 1}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white disabled:opacity-30 hover:bg-white/20 transition-all">
          التالي <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
