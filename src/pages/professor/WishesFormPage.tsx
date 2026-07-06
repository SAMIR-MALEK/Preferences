import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { Module, Level, Wish, TeachingType } from '../../types';
import { PREVIOUS_YEARS } from '../../types';
import {
  Save, CheckCircle, AlertCircle,
  Lock, Info, ChevronDown, ChevronUp, ArrowDown
} from 'lucide-react';

interface WishForm {
  module_id: string;
  level_id: string;
  teaching_type: TeachingType;
  taught_before: boolean;
  previous_years: string[];
  notes: string;
}

const emptyWish = (): WishForm => ({
  module_id: '',
  level_id: '',
  teaching_type: 'محاضرة',
  taught_before: false,
  previous_years: [],
  notes: '',
});

interface Props {
  semester: 1 | 2;
  onConfirmed?: () => void;
}

const WISH_COUNT = 5;

export default function WishesFormPage({ semester, onConfirmed }: Props) {
  const { user } = useAuth();
  const prof = user?.professor;

  const [modules, setModules] = useState<Module[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [wishes, setWishes] = useState<WishForm[]>(Array.from({ length: WISH_COUNT }, emptyWish));
  const [savedWishes, setSavedWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [expandedWish, setExpandedWish] = useState<number | null>(0);

  const [wantsExtraHours, setWantsExtraHours] = useState(false);
  const [extraHoursCount, setExtraHoursCount] = useState<number | null>(null);

  const isProfessorRank = prof?.rank === 'أستاذ التعليم العالي';
  const isLocked = semester === 1 ? prof?.wishes_locked_s1 : prof?.wishes_locked_s2;
  const academicYear = '2026-2027';

  useEffect(() => { loadData(); }, [semester]);

  async function loadData() {
    setLoading(true);
    const [{ data: mods }, { data: lvls }, { data: existingWishes }] = await Promise.all([
      supabase.from('modules').select('*, level:levels(*)').eq('semester', semester).eq('is_active', true).order('display_order'),
      supabase.from('levels').select('*').eq('is_active', true).order('display_order'),
      supabase.from('wishes').select('*, module:modules(*), level:levels(*)').eq('professor_id', prof?.id).eq('semester', semester).eq('academic_year', academicYear).order('wish_order'),
    ]);
    if (mods) setModules(mods);
    if (lvls) setLevels(lvls);
    if (existingWishes && existingWishes.length > 0) {
      setSavedWishes(existingWishes);
      const forms = existingWishes
        .filter(w => w.wish_order <= 5)
        .map(w => ({
          module_id: w.module_id,
          level_id: w.level_id,
          teaching_type: w.teaching_type as TeachingType,
          taught_before: w.taught_before,
          previous_years: w.previous_years || [],
          notes: w.notes || '',
        }));
      while (forms.length < WISH_COUNT) forms.push(emptyWish());
      setWishes(forms.slice(0, WISH_COUNT));
    } else {
      // لا توجد رغبات محفوظة لهذا السداسي — نبدأ بنموذج فارغ
      setWishes(Array.from({ length: WISH_COUNT }, emptyWish));
      setSavedWishes([]);
    }

    if (semester === 1) {
      setWantsExtraHours(prof?.wants_extra_hours_s1 || false);
      setExtraHoursCount(prof?.extra_hours_count_s1 ?? null);
    } else {
      setWantsExtraHours(prof?.wants_extra_hours_s2 || false);
      setExtraHoursCount(prof?.extra_hours_count_s2 ?? null);
    }
    setLoading(false);
  }

  function updateWish(index: number, field: Partial<WishForm>) {
    setWishes(prev => prev.map((w, i) => i === index ? { ...w, ...field } : w));
  }

  function validateNoDuplicates(allWishes: WishForm[]): string | null {
    const filled = allWishes.filter(w => w.module_id && w.level_id);
    const keys = filled.map(w => `${w.module_id}__${w.teaching_type}`);
    const dupeKey = keys.find((k, idx) => keys.indexOf(k) !== idx);
    if (dupeKey) {
      const [modId] = dupeKey.split('__');
      const modName = modules.find(m => m.id === modId)?.name_ar || 'مقياس';
      return `لا يمكن تكرار نفس الرغبة — لاحظنا تكرار "${modName}" بنفس نوع التدريس في رغبتين`;
    }
    return null;
  }

  function validateProfessorRule(allWishes: WishForm[]): string | null {
    if (!isProfessorRank) return null;
    const l1Level = levels.find(l => l.code === 'L1');
    if (!l1Level) return null;
    const hasL1Lecture = allWishes.some(w =>
      w.level_id === l1Level.id && w.module_id && w.teaching_type === 'محاضرة'
    );
    if (!hasL1Lecture) {
      return 'بصفتك أستاذ التعليم العالي، يجب أن تتضمن رغباتك الخمس مقياساً واحداً على الأقل من السنة أولى ليسانس (L1) بنوع تدريس "محاضرة"';
    }
    return null;
  }

  function wishCompletion(w: WishForm) {
    if (!w.level_id) return 0;
    if (!w.module_id) return 1;
    return 2;
  }

  // ترجع true إن نجح الحفظ، false إن فشل
  async function handleSave(): Promise<boolean> {
    const valid = wishes.filter(w => w.module_id && w.level_id);
    if (valid.length < WISH_COUNT) {
      setMessage({ type: 'error', text: `يجب تعبئة الرغبات الخمس كاملة — أكملت ${toArabicNum(valid.length)} من ٥` });
      return false;
    }

    const dupError = validateNoDuplicates(wishes);
    if (dupError) { setMessage({ type: 'error', text: dupError }); return false; }

    const profError = validateProfessorRule(wishes);
    if (profError) { setMessage({ type: 'error', text: profError }); return false; }

    if (wantsExtraHours && !extraHoursCount) {
      setMessage({ type: 'error', text: 'يرجى تحديد عدد الساعات الإضافية المرغوبة' });
      return false;
    }

    if (!prof?.id) {
      setMessage({ type: 'error', text: 'خطأ: لم يتم التعرف على هويتك. يرجى تسجيل الخروج والدخول مجدداً.' });
      return false;
    }

    setSaving(true);
    setMessage(null);

    // حفظ رغبة الساعات الإضافية
    const extraHoursField = semester === 1
      ? { wants_extra_hours_s1: wantsExtraHours, extra_hours_count_s1: wantsExtraHours ? extraHoursCount : null }
      : { wants_extra_hours_s2: wantsExtraHours, extra_hours_count_s2: wantsExtraHours ? extraHoursCount : null };

    const { error: extraErr } = await supabase.from('professors').update(extraHoursField).eq('id', prof.id);
    if (extraErr) {
      console.error('خطأ في حفظ الساعات الإضافية:', extraErr);
    }

    // حذف الرغبات القديمة
    const { error: deleteErr } = await supabase.from('wishes').delete()
      .eq('professor_id', prof.id)
      .eq('semester', semester)
      .eq('academic_year', academicYear);

    if (deleteErr) {
      console.error('خطأ في حذف الرغبات القديمة:', deleteErr);
      setMessage({ type: 'error', text: 'حدث خطأ أثناء الحذف: ' + deleteErr.message });
      setSaving(false);
      return false;
    }

    const toInsert = valid.map((w, i) => ({
      professor_id: prof.id,
      academic_year: academicYear,
      semester,
      wish_order: i + 1,
      module_id: w.module_id,
      level_id: w.level_id,
      teaching_type: w.teaching_type,
      taught_before: w.taught_before,
      previous_years: w.previous_years,
      notes: w.notes,
    }));

    const { error: insertErr } = await supabase.from('wishes').insert(toInsert);

    if (insertErr) {
      console.error('خطأ في إدراج الرغبات:', insertErr);
      setMessage({ type: 'error', text: 'حدث خطأ أثناء الحفظ: ' + insertErr.message });
      setSaving(false);
      return false;
    }

    setMessage({ type: 'success', text: 'تم حفظ رغباتك مؤقتاً — يمكنك التعديل قبل التأكيد النهائي' });
    await loadData();
    setSaving(false);
    return true;
  }

  async function handleConfirm() {
    setConfirming(true);
    setShowConfirmDialog(false);

    // حفظ أولاً — إن فشل، لا نقفل
    const saved = await handleSave();
    if (!saved) {
      setConfirming(false);
      return;
    }

    const lockField = semester === 1 ? 'wishes_locked_s1' : 'wishes_locked_s2';
    const { error } = await supabase.from('professors').update({
      [lockField]: true,
      wishes_locked_at: new Date().toISOString(),
    }).eq('id', prof?.id);

    if (error) {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء التأكيد: ' + error.message });
    } else {
      setMessage({ type: 'success', text: `تم تأكيد رغبات السداسي ${semester === 1 ? 'الأول' : 'الثاني'} وقفلها نهائياً` });
      onConfirmed?.();
    }
    setConfirming(false);
  }

  function getTeachingTypes(moduleId: string): TeachingType[] {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return ['محاضرة', 'أعمال موجهة'];
    const types: TeachingType[] = [];
    if (mod.has_lectures) types.push('محاضرة');
    if (mod.has_td) types.push('أعمال موجهة');
    return types.length ? types : ['محاضرة'];
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-[#1a3a6b]/20 border-t-[#1a3a6b] rounded-full animate-spin" />
    </div>
  );

  if (isLocked) return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Lock className="w-6 h-6 text-[#c9a227]" />
          <h2 className="text-lg font-bold font-display">رغبات السداسي {semester === 1 ? 'الأول' : 'الثاني'} — مؤكدة ومقفولة</h2>
        </div>
        <p className="text-gray-300 text-sm">تم تأكيد رغباتك نهائياً. للاستفسار تواصل مع نيابة العمادة.</p>
      </div>
      <div className="space-y-3">
        {savedWishes.filter(w => w.wish_order <= 5).map((w) => (
          <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-[#1a3a6b] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {toArabicNum(w.wish_order)}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{(w as any).module?.name_ar}</p>
                <p className="text-sm text-gray-500">{(w as any).level?.name_ar} — {w.teaching_type}</p>
                {w.taught_before && <p className="text-xs text-[#c9a227] mt-1">✓ سبق تدريسه {w.previous_years?.join('، ')}</p>}
              </div>
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-sm text-gray-600">
          الساعات الإضافية:{' '}
          {wantsExtraHours
            ? <strong className="text-[#1a3a6b]">{toArabicNum(extraHoursCount || 0)} {extraHoursCount === 1 ? 'ساعة' : 'ساعات'}</strong>
            : <strong className="text-gray-400">لا يرغب</strong>}
        </p>
      </div>
    </div>
  );

  const completedCount = wishes.filter(w => wishCompletion(w) === 2).length;
  const l1Level = levels.find(l => l.code === 'L1');
  const hasL1Lecture = isProfessorRank && wishes.some(w =>
    w.level_id === l1Level?.id && w.module_id && w.teaching_type === 'محاضرة'
  );

  return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <h2 className="text-lg font-bold font-display mb-1">رغبات السداسي {semester === 1 ? 'الأول' : 'الثاني'}</h2>
        <p className="text-gray-300 text-sm">سجّل خمس رغبات — يمكن الحفظ المؤقت والتنقل بحرية بين السداسيين قبل التأكيد.</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 bg-white/15 rounded-full h-2.5 overflow-hidden">
            <div className="h-full bg-[#c9a227] transition-all" style={{ width: `${(completedCount / WISH_COUNT) * 100}%` }} />
          </div>
          <span className="text-sm font-bold whitespace-nowrap">{toArabicNum(completedCount)} / ٥</span>
        </div>
      </div>

      {isProfessorRank && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${hasL1Lecture ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {hasL1Lecture ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <p className="text-xs">
            {hasL1Lecture
              ? 'تم الشرط الإلزامي: إحدى رغباتك تشمل مقياس محاضرة من السنة أولى ليسانس ✓'
              : 'تنبيه للبروفيسور: يجب أن تتضمن رغباتك الخمس مقياساً واحداً على الأقل من السنة أولى ليسانس (L1) بنوع تدريس "محاضرة".'}
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <p className="text-xs text-blue-600">الخطوات لكل رغبة: <strong>① اختر المستوى</strong> ← <strong>② اختر المقياس</strong> ← <strong>③ اختر نوع التدريس</strong>. الشرط الوحيد: لا تكرار نفس المقياس بنفس نوع التدريس.</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {wishes.map((wish, index) => {
          const isExpanded = expandedWish === index;
          const teachingTypes = getTeachingTypes(wish.module_id);
          const selectedModule = modules.find(m => m.id === wish.module_id);
          const completion = wishCompletion(wish);

          return (
            <div key={index} className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-colors ${completion === 2 ? 'border-green-200' : 'border-gray-100'}`}>
              <button type="button" onClick={() => setExpandedWish(isExpanded ? null : index)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-right">
                <span className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0 ${completion === 2 ? 'bg-green-500' : 'bg-[#1a3a6b]'}`}>
                  {completion === 2 ? <CheckCircle className="w-4 h-4" /> : toArabicNum(index + 1)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-0.5">الرغبة {toArabicNum(index + 1)}</p>
                  {completion === 2 ? (
                    <div>
                      <p className="font-medium text-gray-800 text-sm truncate">{selectedModule?.name_ar}</p>
                      <p className="text-xs text-gray-400">{wish.teaching_type} — {levels.find(l => l.id === wish.level_id)?.name_ar}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 font-medium">
                      {completion === 0 ? '① اختر المستوى أولاً' : '② الآن اختر المقياس'}
                    </p>
                  )}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-bold text-[#1a3a6b]">
                      <span className="w-5 h-5 rounded-full bg-[#1a3a6b] text-white text-[10px] flex items-center justify-center">١</span>
                      اختر المستوى
                    </label>
                    <select value={wish.level_id}
                      onChange={e => updateWish(index, { level_id: e.target.value, module_id: '' })}
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#1a3a6b] bg-gray-50">
                      <option value="">— اضغط هنا لاختيار المستوى —</option>
                      {levels.map(level => (
                        <option key={level.id} value={level.id}>{level.name_ar}</option>
                      ))}
                    </select>
                  </div>

                  {wish.level_id && !wish.module_id && (
                    <div className="flex items-center justify-center text-gray-300">
                      <ArrowDown className="w-5 h-5" />
                    </div>
                  )}

                  {wish.level_id && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm font-bold text-[#1a3a6b]">
                        <span className="w-5 h-5 rounded-full bg-[#1a3a6b] text-white text-[10px] flex items-center justify-center">٢</span>
                        اختر المقياس
                      </label>
                      <select value={wish.module_id}
                        onChange={e => {
                          const mod = modules.find(m => m.id === e.target.value);
                          updateWish(index, {
                            module_id: e.target.value,
                            teaching_type: mod?.has_lectures ? 'محاضرة' : 'أعمال موجهة',
                          });
                        }}
                        className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#1a3a6b] bg-gray-50">
                        <option value="">— اضغط هنا لاختيار المقياس —</option>
                        {modules.filter(m => m.level_id === wish.level_id).map(m => (
                          <option key={m.id} value={m.id}>{m.name_ar}</option>
                        ))}
                      </select>
                      {modules.filter(m => m.level_id === wish.level_id).length === 0 && (
                        <p className="text-xs text-amber-600">لا توجد مقاييس متاحة لهذا المستوى في هذا السداسي بعد.</p>
                      )}
                    </div>
                  )}

                  {wish.module_id && (
                    <div className="flex items-center justify-center text-gray-300">
                      <ArrowDown className="w-5 h-5" />
                    </div>
                  )}

                  {wish.module_id && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm font-bold text-[#1a3a6b]">
                        <span className="w-5 h-5 rounded-full bg-[#1a3a6b] text-white text-[10px] flex items-center justify-center">٣</span>
                        نوع التدريس
                      </label>
                      {teachingTypes.length > 1 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {teachingTypes.map(t => (
                            <button key={t} type="button" onClick={() => updateWish(index, { teaching_type: t })}
                              className={`py-3 rounded-xl text-sm font-medium border-2 transition-all ${wish.teaching_type === t ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="w-full border-2 border-green-100 rounded-xl px-3 py-3 text-sm bg-green-50 text-green-700 font-medium">
                          ✓ {teachingTypes[0]} <span className="text-xs text-green-500">(الوحيد المتاح لهذا المقياس)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {wish.module_id && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={wish.taught_before}
                          onChange={e => updateWish(index, { taught_before: e.target.checked, previous_years: e.target.checked ? wish.previous_years : [] })}
                          className="w-4 h-4 accent-[#1a3a6b]" />
                        <span className="text-sm text-gray-700">سبق لي تدريس هذا المقياس</span>
                      </label>
                      {wish.taught_before && (
                        <div className="mr-6 flex flex-wrap gap-2">
                          {PREVIOUS_YEARS.map(year => (
                            <label key={year} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={wish.previous_years.includes(year)}
                                onChange={e => {
                                  const years = e.target.checked ? [...wish.previous_years, year] : wish.previous_years.filter(y => y !== year);
                                  updateWish(index, { previous_years: years });
                                }}
                                className="w-3.5 h-3.5 accent-[#c9a227]" />
                              <span className="text-xs text-gray-600">{year}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {completion === 2 && index < WISH_COUNT - 1 && (
                    <button type="button" onClick={() => setExpandedWish(index + 1)}
                      className="w-full flex items-center justify-center gap-2 bg-[#1a3a6b]/5 hover:bg-[#1a3a6b]/10 text-[#1a3a6b] py-2.5 rounded-xl text-sm font-bold transition-colors">
                      تمت هذه الرغبة — الانتقال إلى الرغبة {toArabicNum(index + 2)}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-800 font-display">هل ترغب في تدريس ساعات إضافية في السداسي {semester === 1 ? 'الأول' : 'الثاني'}؟</h3>
        <div className="flex gap-3">
          <button onClick={() => setWantsExtraHours(true)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${wantsExtraHours ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            نعم
          </button>
          <button onClick={() => { setWantsExtraHours(false); setExtraHoursCount(null); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${!wantsExtraHours ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            لا
          </button>
        </div>
        {wantsExtraHours && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">عدد الساعات الإضافية المرغوبة</label>
            <select value={extraHoursCount ?? ''}
              onChange={e => setExtraHoursCount(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50">
              <option value="">— اختر العدد —</option>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <option key={n} value={n}>{toArabicNum(n)} {n === 1 ? 'ساعة' : 'ساعات'}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-2">
        <button onClick={() => handleSave()} disabled={saving}
          className="flex items-center gap-2 bg-white border border-[#1a3a6b] text-[#1a3a6b] px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#1a3a6b]/5 transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'جارٍ الحفظ...' : 'حفظ مؤقت'}
        </button>
        <button onClick={() => setShowConfirmDialog(true)} disabled={saving || confirming}
          className="flex items-center gap-2 bg-[#1a3a6b] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
          <Lock className="w-4 h-4" />
          {confirming ? 'جارٍ التأكيد...' : 'تأكيد نهائي'}
        </button>
      </div>

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 font-display">تأكيد نهائي</h3>
                <p className="text-xs text-gray-500">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">ستُقفل رغبات السداسي {semester === 1 ? 'الأول' : 'الثاني'} نهائياً.</p>
            {semester === 2 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">⚠ سيُقفل كلا السداسيين معاً بعد هذا التأكيد.</p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowConfirmDialog(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button onClick={handleConfirm}
                className="flex-1 bg-[#1a3a6b] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors">
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
