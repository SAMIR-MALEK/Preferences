import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { Module, Level, Wish, TeachingType } from '../../types';
import { PREVIOUS_YEARS } from '../../types';
import {
  Plus, Trash2, Save, CheckCircle, AlertCircle,
  Lock, Info, BookOpen, ChevronDown, ChevronUp
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

export default function WishesFormPage({ semester, onConfirmed }: Props) {
  const { user } = useAuth();
  const prof = user?.professor;

  const [modules, setModules] = useState<Module[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [wishes, setWishes] = useState<WishForm[]>([emptyWish(), emptyWish()]);
  const [savedWishes, setSavedWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [expandedWish, setExpandedWish] = useState<number | null>(null);

  const isLocked = semester === 1 ? prof?.wishes_locked_s1 : prof?.wishes_locked_s2;
  const academicYear = '2026-2027';

  useEffect(() => {
    loadData();
  }, [semester]);

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
      const forms = existingWishes.map(w => ({
        module_id: w.module_id,
        level_id: w.level_id,
        teaching_type: w.teaching_type as TeachingType,
        taught_before: w.taught_before,
        previous_years: w.previous_years || [],
        notes: w.notes || '',
      }));
      // اضمن وجود رغبتين على الأقل
      while (forms.length < 2) forms.push(emptyWish());
      setWishes(forms);
    }
    setLoading(false);
  }

  function updateWish(index: number, field: Partial<WishForm>) {
    setWishes(prev => prev.map((w, i) => i === index ? { ...w, ...field } : w));
  }

  function addWish() {
    if (wishes.length >= 5) return;
    setWishes(prev => [...prev, emptyWish()]);
  }

  function removeWish(index: number) {
    if (index < 2) return; // الأوليان إجباريتان
    setWishes(prev => prev.filter((_, i) => i !== index));
  }

  // الحفظ المؤقت
  async function handleSave() {
    const valid = wishes.filter(w => w.module_id && w.level_id);
    if (valid.length < 2) {
      setMessage({ type: 'error', text: 'يجب تعبئة رغبتين على الأقل (رقم المقياس والمستوى)' });
      return;
    }
    setSaving(true);
    setMessage(null);

    // حذف الرغبات القديمة وإعادة إدراجها
    await supabase.from('wishes').delete().eq('professor_id', prof?.id).eq('semester', semester).eq('academic_year', academicYear);

    const toInsert = valid.map((w, i) => ({
      professor_id: prof?.id,
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

    const { error } = await supabase.from('wishes').insert(toInsert);
    if (error) {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء الحفظ' });
    } else {
      setMessage({ type: 'success', text: 'تم حفظ الرغبات مؤقتاً — يمكنك التعديل قبل التأكيد النهائي' });
      loadData();
    }
    setSaving(false);
  }

  // التأكيد النهائي
  async function handleConfirm() {
    setConfirming(true);
    setShowConfirmDialog(false);

    // حفظ أولاً
    await handleSave();

    // قفل السداسي
    const lockField = semester === 1 ? 'wishes_locked_s1' : 'wishes_locked_s2';
    const { error } = await supabase.from('professors').update({
      [lockField]: true,
      wishes_locked_at: new Date().toISOString(),
    }).eq('id', prof?.id);

    if (error) {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء التأكيد' });
    } else {
      setMessage({ type: 'success', text: `تم تأكيد رغبات السداسي ${semester === 1 ? 'الأول' : 'الثاني'} وقفلها نهائياً` });
      onConfirmed?.();
    }
    setConfirming(false);
  }

  // مستويات المقياس المختار
  function getLevelsForModule(moduleId: string) {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return levels;
    return levels.filter(l => l.id === mod.level_id);
  }

  // أنواع التدريس المتاحة للمقياس
  function getTeachingTypes(moduleId: string): TeachingType[] {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return ['محاضرة', 'أعمال موجهة'];
    const types: TeachingType[] = [];
    if (mod.has_lectures) types.push('محاضرة');
    if (mod.has_td) types.push('أعمال موجهة');
    return types;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-[#1a3a6b]/20 border-t-[#1a3a6b] rounded-full animate-spin" />
    </div>
  );

  // ── واجهة مقفولة ──
  if (isLocked) return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-6 h-6 text-[#c9a227]" />
          <h2 className="text-lg font-bold font-display">
            رغبات السداسي {semester === 1 ? 'الأول' : 'الثاني'} — مؤكدة ومقفولة
          </h2>
        </div>
        <p className="text-gray-300 text-sm">تم تأكيد رغباتك نهائياً ولا يمكن تعديلها. للاستفسار تواصل مع نيابة العمادة.</p>
      </div>

      {/* عرض الرغبات المحفوظة */}
      <div className="space-y-3">
        {savedWishes.map((w, i) => (
          <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-[#1a3a6b] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {toArabicNum(i + 1)}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{w.module?.name_ar}</p>
                <p className="text-sm text-gray-500">{w.level?.name_ar} — {w.teaching_type}</p>
                {w.taught_before && (
                  <p className="text-xs text-[#c9a227] mt-1">✓ سبق تدريسه {w.previous_years?.join('، ')}</p>
                )}
                {w.notes && <p className="text-xs text-gray-400 mt-1">{w.notes}</p>}
              </div>
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── واجهة التسجيل ──
  return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <h2 className="text-lg font-bold font-display mb-1">
          رغبات السداسي {semester === 1 ? 'الأول' : 'الثاني'}
        </h2>
        <p className="text-gray-300 text-sm">سجّل من رغبتين إلى خمس رغبات مرتبة حسب الأولوية — الرغبتان الأولى والثانية إجباريتان</p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-600 space-y-0.5">
          <p>يمكنك حفظ الرغبات مؤقتاً والعودة للتعديل في أي وقت قبل التأكيد النهائي.</p>
          <p>بعد الضغط على <strong>تأكيد نهائي</strong> لا يمكن التعديل.</p>
          {semester === 2 && <p className="text-amber-600 font-medium">⚠ التأكيد النهائي للسداسي الثاني يقفل السداسيين معاً.</p>}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Wishes List */}
      <div className="space-y-3">
        {wishes.map((wish, index) => {
          const isRequired = index < 2;
          const isExpanded = expandedWish === index;
          const levelOptions = wish.module_id ? getLevelsForModule(wish.module_id) : levels;
          const teachingTypes = getTeachingTypes(wish.module_id);
          const selectedModule = modules.find(m => m.id === wish.module_id);

          return (
            <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Wish Header */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedWish(isExpanded ? null : index)}>
                <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                  isRequired ? 'bg-[#1a3a6b]' : 'bg-gray-400'
                }`}>
                  {toArabicNum(index + 1)}
                </span>
                <div className="flex-1 min-w-0">
                  {wish.module_id ? (
                    <div>
                      <p className="font-medium text-gray-800 text-sm truncate">{selectedModule?.name_ar}</p>
                      <p className="text-xs text-gray-400">{wish.teaching_type} — {levels.find(l => l.id === wish.level_id)?.name_ar}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">
                      {isRequired ? 'رغبة إجبارية — يرجى تعبئتها' : 'رغبة اختيارية'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isRequired && (
                    <button
                      onClick={e => { e.stopPropagation(); removeWish(index); }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Wish Form */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                  {/* المقياس */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <BookOpen className="w-4 h-4 text-[#1a3a6b]" />
                      المقياس {isRequired && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      value={wish.module_id}
                      onChange={e => {
                        const mod = modules.find(m => m.id === e.target.value);
                        updateWish(index, {
                          module_id: e.target.value,
                          level_id: mod?.level_id || '',
                          teaching_type: mod?.has_lectures ? 'محاضرة' : 'أعمال موجهة',
                        });
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50">
                      <option value="">— اختر المقياس —</option>
                      {levels.map(level => {
                        const levelMods = modules.filter(m => m.level_id === level.id);
                        if (!levelMods.length) return null;
                        return (
                          <optgroup key={level.id} label={level.name_ar}>
                            {levelMods.map(m => (
                              <option key={m.id} value={m.id}>{m.name_ar}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  {/* المستوى ونوع التدريس */}
                  {wish.module_id && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">المستوى</label>
                        <select
                          value={wish.level_id}
                          onChange={e => updateWish(index, { level_id: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50">
                          <option value="">— اختر —</option>
                          {levelOptions.map(l => (
                            <option key={l.id} value={l.id}>{l.name_ar}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">نوع التدريس</label>
                        <select
                          value={wish.teaching_type}
                          onChange={e => updateWish(index, { teaching_type: e.target.value as TeachingType })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50">
                          {teachingTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* سبق تدريسه */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wish.taught_before}
                        onChange={e => updateWish(index, {
                          taught_before: e.target.checked,
                          previous_years: e.target.checked ? wish.previous_years : [],
                        })}
                        className="w-4 h-4 accent-[#1a3a6b]"
                      />
                      <span className="text-sm text-gray-700">سبق لي تدريس هذا المقياس</span>
                    </label>
                    {wish.taught_before && (
                      <div className="mr-6 flex flex-wrap gap-2">
                        {PREVIOUS_YEARS.map(year => (
                          <label key={year} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={wish.previous_years.includes(year)}
                              onChange={e => {
                                const years = e.target.checked
                                  ? [...wish.previous_years, year]
                                  : wish.previous_years.filter(y => y !== year);
                                updateWish(index, { previous_years: years });
                              }}
                              className="w-3.5 h-3.5 accent-[#c9a227]"
                            />
                            <span className="text-xs text-gray-600">{year}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ملاحظات */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">ملاحظات (اختياري)</label>
                    <textarea
                      value={wish.notes}
                      onChange={e => updateWish(index, { notes: e.target.value })}
                      rows={2}
                      placeholder="أي ملاحظات إضافية..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add wish button */}
      {wishes.length < 5 && (
        <button
          onClick={addWish}
          className="flex items-center gap-2 text-[#1a3a6b] text-sm hover:underline font-medium">
          <Plus className="w-4 h-4" />
          إضافة رغبة اختيارية ({toArabicNum(wishes.length)}/5)
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-white border border-[#1a3a6b] text-[#1a3a6b] px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#1a3a6b]/5 transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'جارٍ الحفظ...' : 'حفظ مؤقت'}
        </button>
        <button
          onClick={() => setShowConfirmDialog(true)}
          disabled={saving || confirming}
          className="flex items-center gap-2 bg-[#1a3a6b] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
          <Lock className="w-4 h-4" />
          {confirming ? 'جارٍ التأكيد...' : 'تأكيد نهائي'}
        </button>
      </div>

      {/* Confirm Dialog */}
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
            <p className="text-sm text-gray-600 mb-2">
              ستُقفل رغبات السداسي {semester === 1 ? 'الأول' : 'الثاني'} نهائياً ولن تتمكن من تعديلها.
            </p>
            {semester === 2 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                ⚠ سيُقفل كلا السداسيين معاً بعد هذا التأكيد.
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button
                onClick={handleConfirm}
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
