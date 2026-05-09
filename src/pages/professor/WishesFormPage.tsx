import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import type { Level, Module, Wish, TeachingType } from '../../types';
import { PREVIOUS_YEARS, HOURS_LECTURE, HOURS_TD } from '../../types';
import {
  Plus, Trash2, Lock, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, BookOpen, Info, Save, ArrowLeft
} from 'lucide-react';

interface WishForm {
  wish_order: number;
  level_id: string;
  module_id: string;
  teaching_type: TeachingType;
  taught_before: boolean;
  previous_years: string[];
  notes: string;
}


const emptyWish = (order: number): WishForm => ({
  wish_order: order,
  level_id: '',
  module_id: '',
  teaching_type: 'محاضرة' as TeachingType,
  taught_before: false,
  previous_years: [],
  notes: '',
});

interface Props {
  semester: 1 | 2;
  onConfirmed: () => void;
}

export default function WishesFormPage({ semester, onConfirmed }: Props) {
  const { user } = useAuth();
  const prof = user?.professor;

  const [levels, setLevels] = useState<Level[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [existingWishes, setExistingWishes] = useState<Wish[]>([]);
  const [wishes, setWishes] = useState<WishForm[]>([emptyWish(1), emptyWish(2)]);
  const [expanded, setExpanded] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [tempSaved, setTempSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isLocked = semester === 1 ? prof?.wishes_locked_s1 : prof?.wishes_locked_s2;
  const semLabel = semester === 1 ? 'الأول' : 'الثاني';
  const semColor = semester === 1 ? '#1a3a6b' : '#c9a227';
  const semBg = semester === 1 ? 'rgba(26,58,107,.08)' : 'rgba(201,162,39,.1)';

  useEffect(() => { loadData(); }, [semester]);

  async function loadData() {
    setLoading(true);
    const [{ data: lvls }, { data: mods }, { data: wsh }] = await Promise.all([
      supabase.from('levels').select('*').eq('is_active', true).order('display_order'),
      supabase.from('modules').select('*, level:levels(*)').eq('is_active', true).eq('semester', semester),
      supabase.from('wishes')
        .select('*, module:modules(*), level:levels(*)')
        .eq('professor_id', prof?.id)
        .eq('academic_year', '2026-2027')
        .eq('semester', semester)
        .order('wish_order'),
    ]);
    if (lvls) setLevels(lvls);
    if (mods) setAllModules(mods);
    if (wsh && wsh.length > 0) {
      setExistingWishes(wsh);
      const filled = wsh.map((w: Wish) => ({
        wish_order: w.wish_order,
        level_id: w.level_id,
        module_id: w.module_id,
        teaching_type: w.teaching_type,
        taught_before: w.taught_before ?? false,
        previous_years: w.previous_years || [],
        notes: w.notes || '',
      }));
      while (filled.length < 2) filled.push(emptyWish(filled.length + 1));
      setWishes(filled);
    }
    setLoading(false);
  }

  const modulesForLevel = (levelId: string) =>
    allModules.filter(m => m.level_id === levelId);

  function updateWish(index: number, field: Partial<WishForm>) {
    setWishes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...field };
      if (field.level_id) { updated[index].module_id = ''; updated[index].teaching_type = 'محاضرة' as TeachingType; }
      if (field.module_id) { updated[index].teaching_type = 'محاضرة' as TeachingType; }
      return updated;
    });
    setError('');
  }

  function addWish() {
    if (wishes.length < 5) {
      setWishes(prev => [...prev, emptyWish(prev.length + 1)]);
      setExpanded(wishes.length + 1);
    }
  }

  function removeWish(index: number) {
    if (wishes.length <= 2) return;
    setWishes(prev =>
      prev.filter((_, i) => i !== index).map((w, i) => ({ ...w, wish_order: i + 1 }))
    );
  }

  function isDuplicate(index: number): boolean {
    const w = wishes[index];
    if (!w.module_id || !w.teaching_type) return false;
    return wishes.some((x, i) =>
      i !== index && x.module_id === w.module_id && x.teaching_type === w.teaching_type
    );
  }

  function validate(): string | null {
    for (let i = 0; i < wishes.length; i++) {
      const w = wishes[i];
      if (!w.level_id)       return `الرغبة ${i + 1}: يرجى اختيار المستوى`;
      if (!w.module_id)      return `الرغبة ${i + 1}: يرجى اختيار المقياس`;
      if (!w.teaching_type)  return `الرغبة ${i + 1}: يرجى اختيار نوع التدريس`;
      if (isDuplicate(i))    return `الرغبة ${i + 1}: مكررة مع رغبة أخرى`;
      if (w.taught_before === null) return `الرغبة ${i + 1}: هل درّست هذا المقياس سابقاً؟`;
      if (w.taught_before && w.previous_years.length === 0)
        return `الرغبة ${i + 1}: يرجى تحديد السنوات السابقة`;
    }
    return null;
  }

  async function saveWishes(lock: boolean) {
    const validErr = validate();
    if (validErr) { setError(validErr); return; }

    if (lock) {
      const msg = semester === 2
        ? '⚠️ سيُقفل السداسيان معاً نهائياً. لا يمكن التعديل بعد ذلك إلا بإذن الإدارة.\n\nتأكيد؟'
        : '⚠️ ستُقفل رغبات السداسي الأول وتنتقل للسداسي الثاني.\n\nتأكيد؟';
      if (!window.confirm(msg)) return;
    }

    setSaving(true);
    setError('');

    try {
      await supabase.from('wishes')
        .delete()
        .eq('professor_id', prof?.id)
        .eq('academic_year', '2026-2027')
        .eq('semester', semester);

      const toInsert = wishes.map(w => ({
        professor_id: prof?.id,
        academic_year: '2026-2027',
        semester,
        wish_order: w.wish_order,
        module_id: w.module_id,
        level_id: w.level_id,
        teaching_type: (w.teaching_type || 'lecture') as TeachingType,
        taught_before: w.taught_before || false,
        previous_years: w.previous_years,
        notes: w.notes,
      }));

      const { error: insertErr } = await supabase.from('wishes').insert(toInsert);
      if (insertErr) throw insertErr;

      if (lock) {
        const lockField = semester === 1
          ? { wishes_locked_s1: true }
          : { wishes_locked_s1: true, wishes_locked_s2: true, wishes_locked_at: new Date().toISOString() };

        await supabase.from('professors').update(lockField).eq('id', prof?.id);
        onConfirmed();
      } else {
        setTempSaved(true);
        setTimeout(() => setTempSaved(false), 3000);
        await loadData();
      }
    } catch {
      setError('خطأ في الحفظ. يرجى المحاولة مجدداً.');
    }
    setSaving(false);
  }

  const wLabels = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
      <svg className="animate-spin h-6 w-6 text-[#1a3a6b]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );

  if (isLocked) return (
    <div className="animate-fade-in" dir="rtl">
      <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
        <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-amber-600" />
        </div>
        <h3 className="font-display font-bold text-gray-800 text-lg mb-2">
          رغبات السداسي {semLabel} مؤكدة ومقفلة
        </h3>
        <p className="text-gray-500 text-sm">للتعديل، تواصل مع نيابة العمادة المكلفة بالبيداغوجيا</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: semBg }}>
            <BookOpen className="w-5 h-5" style={{ color: semColor }} />
          </div>
          <div>
            <h2 className="font-display font-bold text-gray-900 text-lg">
              رغبات السداسي {semLabel}
            </h2>
            <p className="text-gray-500 text-xs">
              رغبتان إجباريتان + حتى 3 اختيارية · {wishes.length}/5
              {semester === 2 && (
                <span className="text-amber-600 font-semibold mr-2">
                  · التأكيد هنا يُقفل السداسيين معاً
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border"
          style={{ background: semBg, borderColor: `${semColor}40`, color: semColor }}>
          <Info className="w-3.5 h-3.5" />
          محاضرة = {HOURS_LECTURE}س · أعمال موجهة = {HOURS_TD}س
        </div>
      </div>

      {/* Wishes */}
      {wishes.map((w, i) => {
        const mods = modulesForLevel(w.level_id);
        const selMod = allModules.find(m => m.id === w.module_id);
        const selLvl = levels.find(l => l.id === w.level_id);
        const dup = isDuplicate(i);
        const done = w.level_id && w.module_id && w.teaching_type && w.taught_before !== null;
        const isOpt = i >= 2;
        const open = expanded === w.wish_order;

        return (
          <div key={w.wish_order}
            className="bg-white rounded-2xl overflow-hidden transition-all"
            style={{
              border: `2px solid ${dup ? '#fca5a5' : done ? '#bbf7d0' : open ? semColor + '44' : '#e5e7eb'}`
            }}>
            {/* Header */}
            <button
              onClick={() => setExpanded(open ? 0 : w.wish_order)}
              className="w-full flex items-center justify-between p-4 text-right hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm font-display"
                  style={{
                    background: dup ? '#fee2e2' : done ? '#dcfce7' : isOpt ? '#f1f5f9' : semBg,
                    color: dup ? '#dc2626' : done ? '#15803d' : isOpt ? '#64748b' : semColor
                  }}>
                  {w.wish_order}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-gray-800 text-sm">
                      الرغبة {wLabels[i]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isOpt ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
                      {isOpt ? 'اختيارية' : 'إجبارية'}
                    </span>
                    {dup && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">⚠ مكرر</span>}
                  </div>
                  {done && !dup && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selLvl?.name_ar} — {selMod?.name_ar} ({w.teaching_type})
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {done && !dup && <CheckCircle className="w-4 h-4 text-green-500" />}
                {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                {i >= 2 && (
                  <button onClick={e => { e.stopPropagation(); removeWish(i); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </button>

            {/* Body */}
            {open && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-3 animate-slide-up">
                {/* المستوى */}
                <div>
                  <label className="text-xs text-gray-600 flex items-center gap-1.5 mb-1.5">
                    <span className="w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
                      style={{ background: semColor, fontSize: '9px' }}>١</span>
                    المستوى
                  </label>
                  <select value={w.level_id} onChange={e => updateWish(i, { level_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50">
                    <option value="">— اختر المستوى —</option>
                    <optgroup label="ليسانس">
                      {levels.filter(l => l.degree_type === 'ليسانس').map(l =>
                        <option key={l.id} value={l.id}>{l.name_ar}</option>
                      )}
                    </optgroup>
                    <optgroup label="ماستر">
                      {levels.filter(l => l.degree_type === 'ماستر').map(l =>
                        <option key={l.id} value={l.id}>{l.name_ar}</option>
                      )}
                    </optgroup>
                  </select>
                </div>

                {/* المقياس */}
                {w.level_id && (
                  <div className="animate-slide-up">
                    <label className="text-xs text-gray-600 flex items-center gap-1.5 mb-1.5">
                      <span className="w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
                        style={{ background: semColor, fontSize: '9px' }}>٢</span>
                      المقياس
                      {mods.length === 0 && <span className="text-red-500">(لا توجد مقاييس في هذا السداسي)</span>}
                    </label>
                    <select value={w.module_id} onChange={e => updateWish(i, { module_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50">
                      <option value="">— اختر المقياس —</option>
                      {mods.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name_ar} {m.has_td ? '(م+ت)' : '(م فقط)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* نوع التدريس */}
                {w.module_id && selMod && (
                  <div className="animate-slide-up">
                    <label className="text-xs text-gray-600 flex items-center gap-1.5 mb-2">
                      <span className="w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
                        style={{ background: semColor, fontSize: '9px' }}>٣</span>
                      نوع التدريس
                    </label>
                    <div className="flex gap-3 flex-wrap">
                      {selMod.has_lectures && (
                        <button onClick={() => updateWish(i, { teaching_type: 'محاضرة' })}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all"
                          style={{
                            borderColor: w.teaching_type === 'محاضرة' ? semColor : '#e2e8f0',
                            background: w.teaching_type === 'محاضرة' ? semColor : 'white',
                            color: w.teaching_type === 'محاضرة' ? 'white' : '#475569',
                          }}>
                          <BookOpen className="w-4 h-4" />
                          محاضرة
                          <span className="text-xs opacity-75">{HOURS_LECTURE}س</span>
                        </button>
                      )}
                      {selMod.has_td && (
                        <button onClick={() => updateWish(i, { teaching_type: 'أعمال موجهة' })}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all"
                          style={{
                            borderColor: w.teaching_type === 'أعمال موجهة' ? semColor : '#e2e8f0',
                            background: w.teaching_type === 'أعمال موجهة' ? semColor : 'white',
                            color: w.teaching_type === 'أعمال موجهة' ? 'white' : '#475569',
                          }}>
                          <BookOpen className="w-4 h-4" />
                          أعمال موجهة
                          <span className="text-xs opacity-75">{HOURS_TD}س</span>
                        </button>
                      )}
                      {!selMod.has_td && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5" /> يُدرَّس كمحاضرات فقط
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* التدريس السابق */}
                {w.teaching_type && (
                  <div className="animate-slide-up">
                    <label className="text-xs text-gray-600 flex items-center gap-1.5 mb-2">
                      <span className="w-4 h-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
                        style={{ background: semColor, fontSize: '9px' }}>٤</span>
                      هل درّست هذا المقياس في آخر 3 مواسم؟
                    </label>
                    <div className="flex gap-3 mb-3">
                      {['نعم', 'لا'].map(v => (
                        <button key={v}
                          onClick={() => updateWish(i, { taught_before: v === 'نعم', previous_years: [] })}
                          className="px-5 py-2 rounded-xl border-2 text-sm font-medium transition-all"
                          style={{
                            borderColor: (v === 'نعم' && w.taught_before) || (v === 'لا' && w.taught_before === false)
                              ? v === 'نعم' ? '#22c55e' : '#475569' : '#e2e8f0',
                            background: (v === 'نعم' && w.taught_before) ? '#22c55e'
                              : (v === 'لا' && w.taught_before === false) ? '#475569' : 'white',
                            color: ((v === 'نعم' && w.taught_before) || (v === 'لا' && w.taught_before === false))
                              ? 'white' : '#475569',
                          }}>
                          {v}
                        </button>
                      ))}
                    </div>
                    {w.taught_before && (
                      <div className="flex gap-2 flex-wrap animate-slide-up">
                        {PREVIOUS_YEARS.map(year => (
                          <label key={year}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs cursor-pointer transition-all"
                            style={{
                              borderColor: w.previous_years.includes(year) ? semColor : '#e2e8f0',
                              background: w.previous_years.includes(year) ? `${semColor}12` : 'white',
                              color: w.previous_years.includes(year) ? semColor : '#475569',
                            }}>
                            <input type="checkbox" className="hidden"
                              checked={w.previous_years.includes(year)}
                              onChange={e => updateWish(i, {
                                previous_years: e.target.checked
                                  ? [...w.previous_years, year]
                                  : w.previous_years.filter(y => y !== year)
                              })} />
                            {year}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add wish */}
      {wishes.length < 5 && (
        <button onClick={addWish}
          className="w-full py-3 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          style={{
            border: `2px dashed ${semColor}44`,
            color: semColor,
            background: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = semBg)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <Plus className="w-4 h-4" />
          إضافة رغبة ({wishes.length}/5)
        </button>
      )}

      {/* Error / Success */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {tempSaved && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> تم الحفظ المؤقت
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button onClick={() => saveWishes(false)} disabled={saving}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          <Save className="w-4 h-4" />
          حفظ مؤقت
        </button>
        <button
          onClick={() => saveWishes(true)} disabled={saving}
          className="flex items-center gap-2 font-bold px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 text-white"
          style={{ background: `linear-gradient(135deg,${semColor},${semester === 1 ? '#0d2040' : '#a07820'})` }}>
          {semester === 1
            ? <><ArrowLeft className="w-4 h-4" /> تأكيد والانتقال للسداسي الثاني</>
            : <><Lock className="w-4 h-4" /> تأكيد نهائي وقفل السداسيين</>
          }
        </button>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />
        {semester === 1
          ? '"حفظ مؤقت" يحفظ دون قفل — "تأكيد" يقفل السداسي الأول وينتقل للثاني'
          : '"تأكيد نهائي" يُقفل السداسيان معاً ولا يمكن التعديل إلا بإذن الإدارة'
        }
      </p>
    </div>
  );
}
