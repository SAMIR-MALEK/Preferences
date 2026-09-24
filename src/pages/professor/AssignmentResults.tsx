import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { Professor } from '../../types';
import { CheckCircle, AlertCircle, Clock, Plus, Send, X } from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';
const SEMESTER = 1;

interface AssignedModule {
  module_id: string;
  module_name: string;
  level_name: string;
  teaching_type: string;
  weekly_hours: number;
  wish_order: number;
  group_number?: number | null;
  section_number?: number | null;
}

interface UnassignedWish {
  wish_order: number;
  module_name: string;
  level_name: string;
  teaching_type: string;
}

interface FreeSlot {
  module_id: string;
  module_name: string;
  level_name: string;
  level_id: string;
  teaching_type: string;
  weekly_hours: number;
  weekly_sessions: number;
}

interface Appeal {
  id: string;
  appeal_type: 'رغبة_غير_ملبّاة' | 'خطأ_في_الإسناد';
  wish_order?: number;
  module_id?: string;
  module_name?: string;
  assignment_id?: string;
  assigned_module_name?: string;
  reason: string;
  status: 'معلّق' | 'مقبول' | 'مرفوض';
  admin_reply?: string;
}

interface Props {
  prof: Professor;
}

export default function AssignmentResults({ prof }: Props) {
  const [assigned, setAssigned] = useState<AssignedModule[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedWish[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showFreeSlots, setShowFreeSlots] = useState(false);
  const [slotSearch, setSlotSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [existingRequests, setExistingRequests] = useState<string[]>([]);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealsOpen, setAppealsOpen] = useState(false);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [appealType, setAppealType] = useState<'رغبة_غير_ملبّاة' | 'خطأ_في_الإسناد'>('رغبة_غير_ملبّاة');
  const [appealSelectedWishes, setAppealSelectedWishes] = useState<number[]>([]);
  const [appealSelectedAssignments, setAppealSelectedAssignments] = useState<string[]>([]);
  const [appealReason, setAppealReason] = useState('');
  const [sendingAppeal, setSendingAppeal] = useState(false);

  const totalHours = assigned.reduce((s, a) => s + a.weekly_hours, 0);
  const maxHours = prof.max_weekly_hours || 9;
  const remaining = maxHours - totalHours;

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);

    // الإسنادات النهائية للأستاذ
    const { data: assignments } = await supabase
      .from('assignments')
      .select('module_id, teaching_type, weekly_hours, wish_order_satisfied, section_number, group_number, module:modules(name_ar, level:levels(name_ar))')
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER)
      .eq('status', 'نهائي');

    if (assignments) {
      setAssigned(assignments.map((a: any) => ({
        module_id: a.module_id,
        module_name: a.module?.name_ar || '—',
        level_name: a.module?.level?.name_ar || '—',
        teaching_type: a.teaching_type,
        weekly_hours: a.weekly_hours,
        wish_order: a.wish_order_satisfied,
        group_number: a.group_number,
        section_number: a.section_number,
      })));
    }

    // الرغبات غير الملبّاة
    const { data: wishes } = await supabase
      .from('wishes')
      .select('wish_order, module_id, teaching_type, module:modules(name_ar, level:levels(name_ar))')
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER)
      .order('wish_order');

    if (wishes && assignments) {
      // مقارنة بـ module_id + teaching_type معاً لتجنب التناقض
      const assignedKeys = new Set(assignments.map((a: any) => a.module_id + '__' + a.teaching_type));
      setUnassigned(wishes
        .filter((w: any) => !assignedKeys.has((w.module_id || '') + '__' + w.teaching_type))
        .map((w: any) => ({
          wish_order: w.wish_order,
          module_name: w.module?.name_ar || '—',
          level_name: w.module?.level?.name_ar || '—',
          teaching_type: w.teaching_type,
        }))
      );
    }

    // الـ slots الفارغة المتاحة
    const [{ data: allSlots }, { data: levelSemesters }] = await Promise.all([
      supabase.from('modules').select('id, name_ar, level_id, has_lectures, has_td, weekly_sessions, level:levels(name_ar)').eq('semester', SEMESTER).eq('is_active', true),
      supabase.from('level_semesters').select('level_id, num_sections, num_groups').eq('semester', SEMESTER),
    ]);
    const lsMap = new Map((levelSemesters || []).map((ls: any) => [ls.level_id, ls]));

    const { data: filledAssignments } = await supabase
      .from('assignments')
      .select('module_id, teaching_type')
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER)
      .in('status', ['نهائي', 'مؤقت']);

    if (allSlots && filledAssignments) {
      // المحاضرات الشاغرة (مجموعة واحدة على الأقل بدون أستاذ)
      const filledLec = new Set(filledAssignments.filter((a: any) => a.teaching_type === 'محاضرة').map((a: any) => a.module_id));

      // الأعمال الموجهة — نحسب عدد الأفواج الممتلئة لكل مقياس
      const tdFilled = new Map<string, number>();
      filledAssignments.filter((a: any) => a.teaching_type === 'أعمال موجهة').forEach((a: any) => {
        tdFilled.set(a.module_id, (tdFilled.get(a.module_id) || 0) + 1);
      });

      const slots: FreeSlot[] = [];
      allSlots.forEach((m: any) => {
        // محاضرة شاغرة
        if (m.has_lectures && !filledLec.has(m.id)) {
          slots.push({
            module_id: m.id, module_name: m.name_ar,
            level_name: m.level?.name_ar || '—', level_id: m.level_id,
            teaching_type: 'محاضرة',
            weekly_hours: 2.25 * (m.weekly_sessions || 1),
            weekly_sessions: m.weekly_sessions || 1,
          });
        }
        // TD فيه فوج شاغر واحد على الأقل
        if (m.has_td) {
          // نجلب عدد الأفواج من level_semesters لاحقاً — نستخدم تقديراً بسيطاً
          const filledCount = tdFilled.get(m.id) || 0;
          const ls = lsMap.get(m.level_id);
          const totalGroups = ls ? ls.num_sections * ls.num_groups : 8;
          if (filledCount < totalGroups) {
            // تحقق بسيط: إن لم تكن كل الأفواج ممتلئة
            if (true) {
              slots.push({
                module_id: m.id, module_name: m.name_ar,
                level_name: m.level?.name_ar || '—', level_id: m.level_id,
                teaching_type: 'أعمال موجهة',
                weekly_hours: 1.5,
                weekly_sessions: 1,
              });
            }
          }
        }
      });
      setFreeSlots(slots);
    }

    // الطلبات المرسلة مسبقاً
    const { data: reqs } = await supabase
      .from('assignment_requests')
      .select('module_id')
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER);
    if (reqs) setExistingRequests(reqs.map((r: any) => r.module_id));

    // تحميل الطعون المرسلة
    // جلب إعداد باب الطعون
    const { data: settingsData } = await supabase
      .from('academic_settings')
      .select('appeals_open')
      .single();
    setAppealsOpen(settingsData?.appeals_open === true);
    const { data: appealsData } = await supabase
      .from('assignment_appeals')
      .select('id, appeal_type, wish_order, module_id, reason, status, admin_reply, assignment_id')
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER)
      .order('created_at', { ascending: false });
    if (appealsData) setAppeals(appealsData as Appeal[]);

    setLoading(false);
  }

  function toggleSlot(slot: FreeSlot) {
    const totalSelected = selectedSlots.reduce((s, sl) => s + sl.weekly_hours, 0);
    const alreadySelected = selectedSlots.find(s => s.module_id === slot.module_id);
    if (alreadySelected) {
      setSelectedSlots(prev => prev.filter(s => s.module_id !== slot.module_id));
    } else {
      if (totalSelected + slot.weekly_hours > remaining + 0.01) {
        setMessage({ type: 'error', text: 'اختياراتك تتجاوز الحجم الساعي المتبقي' });
        return;
      }
      setSelectedSlots(prev => [...prev, slot]);
    }
    setMessage(null);
  }

  // ترتيب ذكي حسب تخصص الأستاذ
  async function sendAppeal() {
    if (!appealReason.trim()) {
      setMessage({ type: 'error', text: 'يرجى كتابة سبب الطعن' });
      return;
    }
    if (appealType === 'رغبة_غير_ملبّاة' && appealSelectedWishes.length === 0) {
      setMessage({ type: 'error', text: 'يرجى اختيار رغبة واحدة على الأقل' });
      return;
    }
    if (appealType === 'خطأ_في_الإسناد' && appealSelectedAssignments.length === 0) {
      setMessage({ type: 'error', text: 'يرجى اختيار مقياس واحد على الأقل' });
      return;
    }
    setSendingAppeal(true);
    const toInsert: any = {
      professor_id: prof.id,
      academic_year: ACADEMIC_YEAR,
      semester: SEMESTER,
      appeal_type: appealType,
      reason: appealReason,
      // نخزن الاختيارات كـ JSON في حقل الشرح مع الأسباب
      wish_orders: appealType === 'رغبة_غير_ملبّاة' ? appealSelectedWishes : null,
      assignment_ids: appealType === 'خطأ_في_الإسناد' ? appealSelectedAssignments : null,
    };
    const { error } = await supabase.from('assignment_appeals').insert(toInsert);
    if (error) {
      setMessage({ type: 'error', text: 'خطأ في إرسال الطعن' });
    } else {
      setMessage({ type: 'success', text: '✓ تم إرسال طعنك — ستُعلَم بالرد' });
      setAppealReason('');
      setAppealSelectedWishes([]);
      setAppealSelectedAssignments([]);
      setShowAppealForm(false);
      await loadData();
    }
    setSendingAppeal(false);
  }

  function sortedSlots() {
    const profSpec = (prof as any).degree_speciality || '';
    const profRank = (s: FreeSlot) => {
      const n = s.module_name + ' ' + s.level_name;
      // نفس الكلمات المفتاحية من تخصص الأستاذ
      const specWords = profSpec.split(' ').filter((w: string) => w.length > 3);
      const matchCount = specWords.filter((w: string) => n.includes(w)).length;
      if (matchCount > 0) return 0; // أعلى أولوية
      // نفس المستوى العام (ليسانس/ماستر)
      const profLevel = profSpec.includes('جنائي') ? 'جنائي' :
        profSpec.includes('أعمال') ? 'أعمال' :
        profSpec.includes('عقاري') ? 'عقاري' :
        profSpec.includes('صحة') ? 'صحة' : '';
      if (profLevel && n.includes(profLevel)) return 1;
      return 2; // باقي المقاييس
    };

    let filtered = freeSlots;
    if (slotSearch) filtered = filtered.filter(s =>
      s.module_name.includes(slotSearch) || s.level_name.includes(slotSearch)
    );
    if (levelFilter) filtered = filtered.filter(s => s.level_name === levelFilter);
    return [...filtered].sort((a, b) => profRank(a) - profRank(b));
  }

  async function sendRequests() {
    if (selectedSlots.length === 0) return;
    setSending(true);
    const toInsert = selectedSlots.map(s => ({
      professor_id: prof.id,
      module_id: s.module_id,
      level_id: s.level_id,
      academic_year: ACADEMIC_YEAR,
      semester: SEMESTER,
      teaching_type: s.teaching_type,
      weekly_hours: s.weekly_hours,
      status: 'معلّق',
    }));
    const { error } = await supabase.from('assignment_requests').insert(toInsert);
    if (error) {
      setMessage({ type: 'error', text: 'خطأ في إرسال الطلب' });
    } else {
      setMessage({ type: 'success', text: 'تم إرسال طلبك للإدارة — ستُعلَم بالنتيجة' });
      setSelectedSlots([]);
      setShowFreeSlots(false);
      await loadData();
    }
    setSending(false);
  }

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (assigned.length === 0 && unassigned.length === 0) return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
      <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
      <p className="font-bold text-amber-800">النتائج الأولية لم تُنشر بعد</p>
      <p className="text-amber-600 text-sm mt-1">ستُعلَم فور نشر الإدارة لنتائج إسناد مقاييس السداسي الأول</p>
    </div>
  );

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h3 className="font-display font-bold text-gray-900 text-lg">النتائج بعد دراسة الطعون — إسناد مقاييس السداسي الأول</h3>
        <p className="text-gray-500 text-sm mt-0.5">النتائج النهائية لإسناد مقاييس السداسي الأول</p>
      </div>

      {/* الحجم الساعي */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-gray-700">الحجم الساعي الأسبوعي</span>
          <span className={`font-bold text-lg ${totalHours >= maxHours ? 'text-green-600' : 'text-[#1a3a6b]'}`}>
            {totalHours.toFixed(2)} / {maxHours} ساعة
          </span>
        </div>
        <div className="bg-gray-100 rounded-full h-3">
          <div className={`h-3 rounded-full transition-all ${totalHours >= maxHours ? 'bg-green-500' : 'bg-[#1a3a6b]'}`}
            style={{ width: Math.min((totalHours / maxHours) * 100, 100) + '%' }} />
        </div>
        {remaining > 0.01 && (
          <p className="text-amber-600 text-sm mt-2">
            ⚠ يتبقى لك {remaining.toFixed(2)} ساعة لم تُسنَد — يمكنك طلب مقاييس إضافية أدناه
          </p>
        )}
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* المقاييس المُسنَدة */}
      {assigned.length > 0 && (() => {
        // دمج الأفواج لنفس المقياس ونفس النوع
        const grouped: {
          module_name: string; level_name: string; teaching_type: string;
          weekly_hours: number; wish_order: number; groups: number[]; sections: number[];
        }[] = [];

        assigned.forEach(a => {
          const key = `${a.module_name}__${a.teaching_type}`;
          const existing = grouped.find(g => `${g.module_name}__${g.teaching_type}` === key);
          if (existing) {
            existing.weekly_hours += a.weekly_hours;
            if (a.group_number) existing.groups.push(a.group_number);
            if (a.section_number && !a.group_number) existing.sections.push(a.section_number);
          } else {
            grouped.push({
              module_name: a.module_name,
              level_name: a.level_name,
              teaching_type: a.teaching_type,
              weekly_hours: a.weekly_hours,
              wish_order: a.wish_order,
              groups: a.group_number ? [a.group_number] : [],
              sections: (!a.group_number && a.section_number) ? [a.section_number] : [],
            });
          }
        });

        // ترتيب: المحاضرات أولاً ثم الأعمال الموجهة
        grouped.sort((a, b) => {
          if (a.teaching_type === 'محاضرة' && b.teaching_type !== 'محاضرة') return -1;
          if (a.teaching_type !== 'محاضرة' && b.teaching_type === 'محاضرة') return 1;
          return a.wish_order - b.wish_order;
        });

        const lectures = grouped.filter(g => g.teaching_type === 'محاضرة');
        const tds = grouped.filter(g => g.teaching_type !== 'محاضرة');

        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-green-50 border-b border-green-100">
              <h4 className="font-semibold text-green-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> المقاييس المُسنَدة ({toArabicNum(grouped.length)})
              </h4>
            </div>
            <div className="divide-y divide-gray-50">
              {/* المحاضرات */}
              {lectures.length > 0 && (
                <div className="px-5 py-2 bg-blue-50/40">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">محاضرات</p>
                </div>
              )}
              {lectures.map((a, i) => {
                const isDouble = a.weekly_hours >= 4.5;
                return (
                <div key={i} className="px-5 py-3 flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      {a.wish_order > 0
                        ? <span className="text-xs text-[#c9a227] font-bold bg-amber-50 px-2 py-0.5 rounded-full">الرغبة {toArabicNum(a.wish_order)}</span>
                        : <span className="text-xs text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-full">إسناد إداري</span>
                      }
                    </div>
                    <p className="font-semibold text-gray-800">{a.module_name}</p>
                    <p className="text-xs text-gray-500">{a.level_name}</p>
                    {isDouble && <p className="text-xs text-blue-500 font-medium">حصتان أسبوعياً</p>}
                  </div>
                  <div className="text-left">
                    <span className="font-bold text-[#1a3a6b] text-lg">{a.weekly_hours.toFixed(2)}</span>
                    <span className="text-gray-400 text-xs mr-1">س/أسبوع</span>
                  </div>
                </div>
                );
              })}

              {/* الأعمال الموجهة */}
              {tds.length > 0 && (
                <div className="px-5 py-2 bg-teal-50/40">
                  <p className="text-xs font-bold text-teal-600 uppercase tracking-wide">أعمال موجهة</p>
                </div>
              )}
              {tds.map((a, i) => {
                const groupCount = a.groups.length || 1;
                const groupLabel = groupCount === 1 ? 'فوج واحد' : groupCount === 2 ? 'فوجان' : `${toArabicNum(groupCount)} أفواج`;
                return (
                <div key={i} className="px-5 py-3 flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      {a.wish_order > 0
                        ? <span className="text-xs text-[#c9a227] font-bold bg-amber-50 px-2 py-0.5 rounded-full">الرغبة {toArabicNum(a.wish_order)}</span>
                        : <span className="text-xs text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-full">إسناد إداري</span>
                      }
                    </div>
                    <p className="font-semibold text-gray-800">{a.module_name}</p>
                    <p className="text-xs text-gray-500">{a.level_name}</p>
                    {groupCount > 0 && <p className="text-xs text-teal-500 font-medium">{groupLabel}</p>}
                  </div>
                  <div className="text-left">
                    <span className="font-bold text-teal-600 text-lg">{a.weekly_hours.toFixed(2)}</span>
                    <span className="text-gray-400 text-xs mr-1">س/أسبوع</span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* الرغبات غير الملبّاة — مخفية */}
      {false && unassigned.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-100">
            <h4 className="font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> رغبات لم تُلبَّ ({toArabicNum(unassigned.length)})
            </h4>
          </div>
          <div className="divide-y divide-gray-50">
            {unassigned.map((w, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-400 font-bold ml-2">الرغبة {toArabicNum(w.wish_order)}</span>
                  <span className="text-gray-600">{w.level_name} — {w.module_name}</span>
                </div>
                <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full">
                  لم يتم تلبية الرغبة
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* طلب مقاييس إضافية */}
      {remaining > 0.01 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-amber-800">استكمال الحجم الساعي</h4>
              <p className="text-amber-600 text-sm mt-0.5">
                يتبقى {remaining.toFixed(2)} ساعة — اختر من المقاييس الشاغرة
              </p>
            </div>
            <button onClick={() => setShowFreeSlots(!showFreeSlots)}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
              <Plus className="w-4 h-4" />
              {showFreeSlots ? 'إخفاء' : 'عرض المقاييس الشاغرة'}
            </button>
          </div>

          {showFreeSlots && (
            <div className="space-y-3">
              <div className="flex gap-2 mb-2">
                <input type="text" placeholder="ابحث عن مقياس..." value={slotSearch}
                  onChange={e => setSlotSearch(e.target.value)}
                  className="flex-1 border border-amber-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 bg-white" />
                <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
                  className="border border-amber-200 rounded-xl px-3 py-2 text-xs focus:outline-none bg-white min-w-[140px]">
                  <option value="">كل المستويات</option>
                  {Array.from(new Set(freeSlots.map(s => s.level_name))).sort().map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="bg-white rounded-xl border border-amber-200 overflow-hidden max-h-80 overflow-y-auto">
                {freeSlots.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">لا توجد مقاييس شاغرة حالياً</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {sortedSlots().map((slot, i) => {
                      const isSelected = selectedSlots.some(s => s.module_id === slot.module_id);
                      const alreadyRequested = existingRequests.includes(slot.module_id);
                      const priority = (() => {
                        const profSpec = (prof as any).degree_speciality || '';
                        const specWords = profSpec.split(' ').filter((w: string) => w.length > 3);
                        const n = slot.module_name + ' ' + slot.level_name;
                        return specWords.some((w: string) => n.includes(w)) ? 'high' : 'normal';
                      })();
                      return (
                        <button key={i} onClick={() => !alreadyRequested && toggleSlot(slot)} disabled={alreadyRequested}
                          className={`w-full px-4 py-3 flex items-center justify-between text-right transition-all ${
                            alreadyRequested ? 'bg-gray-50 opacity-50 cursor-not-allowed' :
                            isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'
                          }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'
                            }`}>
                              {isSelected && <X className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className="text-sm text-gray-700">{slot.level_name} — {slot.module_name}</span>
                            {priority === 'high' && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">مقترح</span>}
                            {alreadyRequested && <span className="text-xs text-gray-400">(طُلب مسبقاً)</span>}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">{slot.teaching_type}</span>
                            <span className="font-bold text-amber-700">{slot.weekly_hours.toFixed(2)}س</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedSlots.length > 0 && (
                <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-200">
                  <span className="text-sm text-gray-600">
                    اخترت {toArabicNum(selectedSlots.length)} مقياس (+{selectedSlots.reduce((s, sl) => s + sl.weekly_hours, 0).toFixed(2)}س)
                  </span>
                  <button onClick={sendRequests} disabled={sending}
                    className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" />
                    {sending ? 'جارٍ الإرسال...' : 'إرسال الطلب للإدارة'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* قسم الطعون */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-red-800">الطعون</h4>
            <p className="text-red-600 text-sm mt-0.5">
              {appealsOpen ? 'في حال عدم الرضا عن نتائج الإسناد' : 'باب الطعون مغلق حالياً'}
            </p>
          </div>
          {appealsOpen && (
            <button onClick={() => setShowAppealForm(!showAppealForm)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
              {showAppealForm ? 'إخفاء' : 'تقديم طعن'}
            </button>
          )}
        </div>

        {/* الطعون المرسلة مسبقاً */}
        {appeals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-red-700">طعونك المرسلة:</p>
            {appeals.map(a => (
              <div key={a.id} className="bg-white rounded-xl p-3 border border-red-100 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-700">
                    {a.appeal_type === 'رغبة_غير_ملبّاة' ? `رغبة ${a.wish_order} غير ملبّاة` : 'خطأ في الإسناد'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.status === 'معلّق' ? 'bg-amber-100 text-amber-700' :
                    a.status === 'مقبول' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>{a.status}</span>
                </div>
                <p className="text-gray-500 text-xs">{a.reason}</p>
                {a.admin_reply && (
                  <p className="text-[#1a3a6b] text-xs mt-1 bg-blue-50 rounded-lg p-2">
                    <strong>رد الإدارة:</strong> {a.admin_reply}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* نموذج الطعن */}
        {appealsOpen && showAppealForm && (
          <div className="bg-white rounded-xl p-4 border border-red-200 space-y-3">
            {/* نوع الطعن */}
            <div className="flex gap-2">
              {(['رغبة_غير_ملبّاة', 'خطأ_في_الإسناد'] as const).map(t => (
                <button key={t} onClick={() => setAppealType(t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                    appealType === t ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200'
                  }`}>
                  {t === 'رغبة_غير_ملبّاة' ? 'رغبة لم تُلبَّ' : 'خطأ في الإسناد'}
                </button>
              ))}
            </div>

            {/* اختيار الرغبات غير الملبّاة */}
            {appealType === 'رغبة_غير_ملبّاة' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">اختر الرغبة/الرغبات التي تطعن فيها:</p>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-50">
                  {unassigned.map(u => (
                    <label key={u.wish_order} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox"
                        checked={appealSelectedWishes.includes(u.wish_order)}
                        onChange={e => {
                          if (e.target.checked) setAppealSelectedWishes(prev => [...prev, u.wish_order]);
                          else setAppealSelectedWishes(prev => prev.filter(w => w !== u.wish_order));
                        }}
                        className="w-4 h-4 accent-red-600" />
                      <span className="text-sm text-gray-700">
                        <span className="text-red-600 font-bold ml-1">الرغبة {u.wish_order}</span>
                        {u.level_name} — {u.module_name} ({u.teaching_type})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* اختيار المقاييس المُسنَدة بالخطأ */}
            {appealType === 'خطأ_في_الإسناد' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">اختر المقياس/المقاييس التي تطعن في إسنادها:</p>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-50">
                  {assigned.map((a, i) => (
                    <label key={i} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox"
                        checked={appealSelectedAssignments.includes(a.module_id)}
                        onChange={e => {
                          if (e.target.checked) setAppealSelectedAssignments(prev => [...prev, a.module_id]);
                          else setAppealSelectedAssignments(prev => prev.filter(id => id !== a.module_id));
                        }}
                        className="w-4 h-4 accent-red-600" />
                      <span className="text-sm text-gray-700">
                        <span className="text-[#1a3a6b] font-bold ml-1">الرغبة {a.wish_order}</span>
                        {a.level_name} — {a.module_name} ({a.teaching_type})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* سبب الطعن */}
            <textarea value={appealReason} onChange={e => setAppealReason(e.target.value)}
              placeholder="اشرح سبب طعنك بالتفصيل..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />

            <button onClick={sendAppeal} disabled={sendingAppeal}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
              {sendingAppeal ? 'جارٍ الإرسال...' : 'إرسال الطعن'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
