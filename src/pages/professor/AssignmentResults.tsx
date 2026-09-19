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

  const totalHours = assigned.reduce((s, a) => s + a.weekly_hours, 0);
  const maxHours = prof.max_weekly_hours || 9;
  const remaining = maxHours - totalHours;

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);

    // الإسنادات النهائية للأستاذ
    const { data: assignments } = await supabase
      .from('assignments')
      .select('module_id, teaching_type, weekly_hours, wish_order_satisfied, module:modules(name_ar, level:levels(name_ar))')
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
      })));
    }

    // الرغبات غير الملبّاة
    const { data: wishes } = await supabase
      .from('wishes')
      .select('wish_order, teaching_type, module:modules(name_ar, level:levels(name_ar))')
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER)
      .order('wish_order');

    if (wishes && assignments) {
      // مقارنة بـ module_id + teaching_type معاً لتجنب التناقض
      const assignedKeys = new Set(assignments.map((a: any) => a.module_id + '__' + a.teaching_type));
      setUnassigned(wishes
        .filter((w: any) => !assignedKeys.has((w.module?.id || '') + '__' + w.teaching_type))
        .map((w: any) => ({
          wish_order: w.wish_order,
          module_name: w.module?.name_ar || '—',
          level_name: w.module?.level?.name_ar || '—',
          teaching_type: w.teaching_type,
        }))
      );
    }

    // الـ slots الفارغة المتاحة
    const { data: allSlots } = await supabase
      .from('modules')
      .select('id, name_ar, level_id, has_lectures, has_td, weekly_sessions, level:levels(name_ar)')
      .eq('semester', SEMESTER)
      .eq('is_active', true);

    const { data: filledAssignments } = await supabase
      .from('assignments')
      .select('module_id, teaching_type')
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', SEMESTER)
      .in('status', ['نهائي', 'مؤقت']);

    if (allSlots && filledAssignments) {
      const filledLec = new Set(filledAssignments.filter((a: any) => a.teaching_type === 'محاضرة').map((a: any) => a.module_id));
      const slots: FreeSlot[] = [];
      allSlots.forEach((m: any) => {
        if (m.has_lectures && !filledLec.has(m.id)) {
          slots.push({
            module_id: m.id, module_name: m.name_ar,
            level_name: m.level?.name_ar || '—', level_id: m.level_id,
            teaching_type: 'محاضرة',
            weekly_hours: 2.25 * (m.weekly_sessions || 1),
            weekly_sessions: m.weekly_sessions || 1,
          });
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
    if (levelFilter) filtered = filtered.filter(s => s.level_name.includes(levelFilter));
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
        <h3 className="font-display font-bold text-gray-900 text-lg">النتائج الأولية — إسناد مقاييس السداسي الأول</h3>
        <p className="text-gray-500 text-sm mt-0.5">هذه نتائج أولية مؤقتة قابلة للتعديل</p>
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
      {assigned.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-green-50 border-b border-green-100">
            <h4 className="font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> المقاييس المُسنَدة ({toArabicNum(assigned.length)})
            </h4>
          </div>
          <div className="divide-y divide-gray-50">
            {assigned.map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#c9a227] font-bold ml-2">الرغبة {toArabicNum(a.wish_order)}</span>
                  <span className="font-medium text-gray-800">{a.level_name} — {a.module_name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">{a.teaching_type}</span>
                  <span className="font-bold text-[#1a3a6b]">{a.weekly_hours.toFixed(2)}س</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الرغبات غير الملبّاة */}
      {unassigned.length > 0 && (
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
                  تنافس عليها أكثر من أستاذ بنفس الأولوية
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
              <div className="bg-white rounded-xl border border-amber-200 overflow-hidden max-h-80 overflow-y-auto">
                {freeSlots.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">لا توجد مقاييس شاغرة حالياً</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {freeSlots.map((slot, i) => {
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
    </div>
  );
}
