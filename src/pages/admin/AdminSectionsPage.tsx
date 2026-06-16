import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum, toArabicFixed } from '../../lib/utils';
import type { Level, LevelSemester } from '../../types';
import { HOURS_LECTURE, HOURS_TD } from '../../types';
import {
  Save, Plus, Edit2, X, CheckCircle, AlertCircle,
  Users, Layers, Info, ChevronDown, ChevronUp
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────
function totalLectureSlots(ls: LevelSemester) {
  return ls.num_sections;
}
function totalTDSlots(ls: LevelSemester) {
  return ls.num_sections * ls.num_groups;
}
function maxHoursIfAllLectures(ls: LevelSemester) {
  return ls.num_sections * HOURS_LECTURE;
}

// ─────────────────────────────────────────────────────────────────────
export default function AdminSectionsPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [semesterData, setSemesterData] = useState<Record<string, LevelSemester>>({});
  // key = `${level_id}_${semester}`
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ num_sections: 1, num_groups: 2 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: lvls }, { data: ls }] = await Promise.all([
      supabase.from('levels').select('*').eq('is_active', true).order('display_order'),
      supabase.from('level_semesters').select('*'),
    ]);
    if (lvls) setLevels(lvls);
    if (ls) {
      const map: Record<string, LevelSemester> = {};
      ls.forEach(item => { map[`${item.level_id}_${item.semester}`] = item; });
      setSemesterData(map);
    }
    setLoading(false);
  }

  function getLS(levelId: string, sem: 1 | 2): LevelSemester | null {
    return semesterData[`${levelId}_${sem}`] || null;
  }

  function startEdit(ls: LevelSemester) {
    setEditing(`${ls.level_id}_${ls.semester}`);
    setEditForm({ num_sections: ls.num_sections, num_groups: ls.num_groups });
  }

  async function saveEdit(levelId: string, sem: 1 | 2) {
    const key = `${levelId}_${sem}`;
    setSaving(key);
    const existing = semesterData[key];

    if (existing) {
      const { error } = await supabase
        .from('level_semesters')
        .update({ num_sections: editForm.num_sections, num_groups: editForm.num_groups })
        .eq('id', existing.id);
      if (!error) {
        setSemesterData(prev => ({
          ...prev,
          [key]: { ...existing, num_sections: editForm.num_sections, num_groups: editForm.num_groups }
        }));
        setMessage({ type: 'success', text: 'تم الحفظ بنجاح' });
      } else {
        setMessage({ type: 'error', text: 'خطأ في الحفظ' });
      }
    } else {
      const { data, error } = await supabase
        .from('level_semesters')
        .insert({ level_id: levelId, semester: sem, ...editForm })
        .select().single();
      if (data) {
        setSemesterData(prev => ({ ...prev, [key]: data }));
        setMessage({ type: 'success', text: 'تم الإنشاء بنجاح' });
      } else {
        setMessage({ type: 'error', text: error?.message || 'خطأ' });
      }
    }

    setSaving(null);
    setEditing(null);
    setTimeout(() => setMessage(null), 3000);
  }

  // ── Capacity Calculator ────────────────────────────────────────────
  function CapacityCard({ ls }: { ls: LevelSemester }) {
    const lectSlots = totalLectureSlots(ls);
    const tdSlots   = totalTDSlots(ls);
    const maxLect   = maxHoursIfAllLectures(ls);

    return (
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="bg-[#1a3a6b]/5 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">فرص المحاضرات</p>
          <p className="text-xl font-bold text-[#1a3a6b] font-display">{lectSlots}</p>
          <p className="text-xs text-gray-400">أستاذ × مجموعة</p>
        </div>
        <div className="bg-[#c9a227]/10 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">فرص الأعمال الموجهة</p>
          <p className="text-xl font-bold text-[#a07820] font-display">{tdSlots}</p>
          <p className="text-xs text-gray-400">{ls.num_sections} × {ls.num_groups} فوج</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">حجم ساعي لو محاضرات كلها</p>
          <p className="text-xl font-bold text-emerald-600 font-display">{maxLect}س</p>
          <p className="text-xs text-gray-400">{lectSlots} × {HOURS_LECTURE}س</p>
        </div>
      </div>
    );
  }

  // ── Edit Form ──────────────────────────────────────────────────────
  function EditForm({ levelId, sem }: { levelId: string; sem: 1 | 2 }) {
    const key = `${levelId}_${sem}`;
    const isSaving = saving === key;

    // Live preview
    const previewLect = editForm.num_sections;
    const previewTD   = editForm.num_sections * editForm.num_groups;

    return (
      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 animate-slide-up">
        <h4 className="text-sm font-semibold text-[#1a3a6b] mb-3 font-display">
          تعديل هيكل السداسي {sem === 1 ? 'الأول' : 'الثاني'}
        </h4>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#1a3a6b]" />
              عدد المجموعات (sections)
              <span className="text-gray-400 font-normal">— للمحاضرات</span>
            </label>
            <input
              type="number" min="1" max="20"
              value={editForm.num_sections}
              onChange={e => setEditForm(f => ({ ...f, num_sections: Math.max(1, parseInt(e.target.value) || 1) }))}
              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#c9a227]" />
              عدد الأفواج / مجموعة (groups)
              <span className="text-gray-400 font-normal">— للأعمال الموجهة</span>
            </label>
            <input
              type="number" min="1" max="20"
              value={editForm.num_groups}
              onChange={e => setEditForm(f => ({ ...f, num_groups: Math.max(1, parseInt(e.target.value) || 1) }))}
              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white"
              dir="ltr"
            />
          </div>
        </div>

        {/* Live Preview */}
        <div className="bg-white rounded-lg border border-blue-200 p-3 mb-3">
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-500" />
            معاينة فورية
          </p>
          <div className="flex gap-4 flex-wrap">
            <span className="text-xs">
              📚 فرص محاضرات: <strong className="text-[#1a3a6b]">{previewLect}</strong>
            </span>
            <span className="text-xs">
              ✍️ فرص أعمال موجهة: <strong className="text-[#a07820]">{previewTD}</strong>
              <span className="text-gray-400"> ({editForm.num_sections} × {editForm.num_groups})</span>
            </span>
            <span className="text-xs">
              ⏱ حجم ساعي للمحاضرات: <strong className="text-emerald-600">{toArabicFixed(previewLect * HOURS_LECTURE)}س</strong>
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => saveEdit(levelId, sem)}
            disabled={isSaving}
            className="flex items-center gap-1.5 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            إلغاء
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <svg className="animate-spin h-6 w-6 text-[#1a3a6b]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">المجموعات والأفواج</h2>
        <p className="text-gray-500 text-sm mt-1">
          حدد عدد المجموعات (sections) والأفواج (groups) لكل مستوى وسداسي.
          هذا يحدد عدد الفرص المتاحة لإسناد كل مقياس.
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-[#1a3a6b]/5 border border-[#1a3a6b]/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#1a3a6b] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[#1a3a6b]/80 leading-relaxed">
          <strong>كيف تعمل؟</strong><br/>
          • <strong>المحاضرة</strong> = مجموعة واحدة (section) لكل أستاذ — 4 sections = 4 أساتذة لنفس المقياس<br/>
          • <strong>الأعمال الموجهة</strong> = فوج واحد (group) لكل أستاذ — 4 sections × 8 أفواج = 32 فرصة<br/>
          • الحجم الساعي: محاضرة = <strong>{HOURS_LECTURE}س/أسبوع</strong> · أعمال موجهة = <strong>{HOURS_TD}س/أسبوع</strong>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="w-4 h-4" />
            : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Levels */}
      {levels.map(level => {
        const isExp = expanded === level.id;
        const ls1 = getLS(level.id, 1);
        const ls2 = getLS(level.id, 2);

        return (
          <div key={level.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Level Header */}
            <button
              onClick={() => setExpanded(isExp ? null : level.id)}
              className="w-full flex items-center justify-between p-4 text-right hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  level.degree_type === 'ليسانس'
                    ? 'bg-[#1a3a6b]/10'
                    : 'bg-[#c9a227]/10'
                }`}>
                  <Layers className={`w-5 h-5 ${
                    level.degree_type === 'ليسانس' ? 'text-[#1a3a6b]' : 'text-[#c9a227]'
                  }`} />
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm font-display">{level.name_ar}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {[ls1, ls2].map((ls, idx) => ls ? (
                      <span key={idx} className="text-xs text-gray-400">
                        س{idx+1}: {ls.num_sections}م × {ls.num_groups}ف
                        ({totalLectureSlots(ls)} محاضرة · {totalTDSlots(ls)} TD)
                      </span>
                    ) : (
                      <span key={idx} className="text-xs text-amber-500">س{idx+1}: غير محدد</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  level.degree_type === 'ليسانس'
                    ? 'bg-[#1a3a6b]/10 text-[#1a3a6b]'
                    : 'bg-[#c9a227]/10 text-[#a07820]'
                }`}>{level.degree_type}</span>
                {isExp ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Expanded: two semesters */}
            {isExp && (
              <div className="border-t border-gray-100 p-4 space-y-5">
                {([1, 2] as (1|2)[]).map(sem => {
                  const ls = getLS(level.id, sem);
                  const editKey = `${level.id}_${sem}`;
                  const isEditingThis = editing === editKey;

                  return (
                    <div key={sem} className={`rounded-xl border-2 p-4 ${
                      sem === 1 ? 'border-[#1a3a6b]/20' : 'border-[#c9a227]/30'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${
                            sem === 1 ? 'bg-[#1a3a6b] text-white' : 'bg-[#c9a227] text-white'
                          } font-display`}>{sem}</div>
                          <span className="font-semibold text-gray-800 text-sm font-display">
                            السداسي {sem === 1 ? 'الأول' : 'الثاني'}
                          </span>
                          {ls ? (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {ls.num_sections} مجموعات × {ls.num_groups} أفواج
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                              ⚠ لم يُحدَّد بعد
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (isEditingThis) {
                              setEditing(null);
                            } else {
                              startEdit(ls || {
                                id: '',
                                level_id: level.id,
                                semester: sem,
                                num_sections: 1,
                                num_groups: 2,
                              } as LevelSemester);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isEditingThis
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-[#1a3a6b]/10 text-[#1a3a6b] hover:bg-[#1a3a6b]/20'
                          }`}
                        >
                          <Edit2 className="w-3 h-3" />
                          {isEditingThis ? 'إلغاء' : 'تعديل'}
                        </button>
                      </div>

                      {/* Stats */}
                      {ls && !isEditingThis && <CapacityCard ls={ls} />}

                      {/* Edit Form */}
                      {isEditingThis && <EditForm levelId={level.id} sem={sem} />}

                      {/* Hint: visual grid of slots */}
                      {ls && !isEditingThis && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-400 mb-2">
                            تمثيل مرئي للمجموعات والأفواج:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: ls.num_sections }, (_, sIdx) => (
                              <div key={sIdx} className="flex flex-col gap-1">
                                <div className={`text-center text-xs font-bold px-2 py-1 rounded-md ${
                                  sem === 1 ? 'bg-[#1a3a6b] text-white' : 'bg-[#c9a227] text-white'
                                }`}>
                                  م{sIdx + 1}
                                </div>
                                <div className="flex flex-wrap gap-1 max-w-24">
                                  {Array.from({ length: ls.num_groups }, (_, gIdx) => (
                                    <div key={gIdx} className={`w-5 h-5 rounded text-xs flex items-center justify-center font-bold ${
                                      sem === 1 ? 'bg-[#1a3a6b]/10 text-[#1a3a6b]' : 'bg-[#c9a227]/10 text-[#a07820]'
                                    }`}>
                                      {gIdx + 1}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400 mt-1.5">
                            كل عمود = مجموعة (محاضرة) · كل مربع صغير = فوج (أعمال موجهة)
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
