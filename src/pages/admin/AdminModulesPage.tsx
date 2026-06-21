import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { Level, Module, LevelSemester, UEType, DeliveryMode } from '../../types';
import { UE_TYPES, DELIVERY_MODES } from '../../types';
import { Plus, Trash2, Save, X, BookOpen, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Pencil } from 'lucide-react';

const emptyModForm = { name: '', hasTD: false, spec: '', ue: 'أساسية' as UEType, mode: 'حضوري' as DeliveryMode };

interface Props {
  allowedLevelCodes?: string[] | null; // إن وُجدت، يُحصر العرض بهذه الرموز فقط (لرئيس القسم)
}

export default function AdminModulesPage({ allowedLevelCodes }: Props) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [modules, setModules] = useState<Record<string, { s1: Module[]; s2: Module[] }>>({});
  const [lsData, setLsData] = useState<LevelSemester[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeSem, setActiveSem] = useState<Record<string, 1|2>>({});
  const [addingMod, setAddingMod] = useState<{ lvlId: string; sem: 1|2 } | null>(null);
  const [editingMod, setEditingMod] = useState<Module | null>(null);
  const [modForm, setModForm] = useState(emptyModForm);
  const [addingLevel, setAddingLevel] = useState(false);
  const [lvlForm, setLvlForm] = useState({ name: '', type: 'ليسانس', code: '' });
  const [msg, setMsg] = useState<{ t: 's'|'e'; m: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // تحديد متعدد للحذف الجماعي
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string; lvlId: string; sem: 1|2 } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: lvls }, { data: mods }, { data: ls }] = await Promise.all([
      supabase.from('levels').select('*').eq('is_active', true).order('display_order'),
      supabase.from('modules').select('*').eq('is_active', true).order('display_order'),
      supabase.from('level_semesters').select('*'),
    ]);
    if (lvls) {
      const filteredLvls = allowedLevelCodes
        ? lvls.filter((l: Level) => allowedLevelCodes.includes(l.code))
        : lvls;
      setLevels(filteredLvls);
      const grouped: Record<string, { s1: Module[]; s2: Module[] }> = {};
      filteredLvls.forEach((l: Level) => { grouped[l.id] = { s1: [], s2: [] }; });
      (mods || []).forEach((m: Module) => {
        if (grouped[m.level_id]) {
          if (m.semester === 1) grouped[m.level_id].s1.push(m);
          else grouped[m.level_id].s2.push(m);
        }
      });
      setModules(grouped);
    }
    if (ls) setLsData(ls);
    setLoading(false);
  }

  function showMsg(t: 's'|'e', m: string) {
    setMsg({ t, m });
    setTimeout(() => setMsg(null), 3000);
  }

  function getLs(levelId: string, sem: 1|2) {
    return lsData.find(x => x.level_id === levelId && x.semester === sem);
  }

  function startAddModule(lvlId: string, sem: 1|2) {
    setModForm(emptyModForm);
    setEditingMod(null);
    setAddingMod({ lvlId, sem });
  }

  function startEditModule(mod: Module) {
    setModForm({
      name: mod.name_ar,
      hasTD: mod.has_td,
      spec: (mod.specialty_match || []).join(', '),
      ue: mod.ue_type || 'أساسية',
      mode: mod.delivery_mode || 'حضوري',
    });
    setEditingMod(mod);
    setAddingMod({ lvlId: mod.level_id, sem: mod.semester });
  }

  function cancelModForm() {
    setAddingMod(null);
    setEditingMod(null);
    setModForm(emptyModForm);
  }

  async function addModule(lvlId: string, sem: 1|2) {
    if (!modForm.name.trim()) { showMsg('e', 'اسم المقياس مطلوب'); return; }
    const code = `${levels.find(l => l.id === lvlId)?.code}-S${sem}-${Date.now()}`;
    const spec = modForm.spec.split(',').map(s => s.trim()).filter(Boolean);
    const { data, error } = await supabase.from('modules').insert({
      level_id: lvlId, code, name_ar: modForm.name.trim(), semester: sem,
      has_lectures: true, has_td: modForm.mode === 'عن بعد' ? false : modForm.hasTD,
      weekly_hours_lecture: 2.25, weekly_hours_td: (modForm.mode === 'عن بعد' ? false : modForm.hasTD) ? 1.5 : 0,
      specialty_match: spec,
      ue_type: modForm.ue,
      delivery_mode: modForm.mode,
      display_order: (modules[lvlId]?.[`s${sem}` as 's1'|'s2']?.length || 0),
      is_active: true,
    }).select().single();
    if (data) {
      setModules(prev => ({
        ...prev,
        [lvlId]: { ...prev[lvlId], [`s${sem}`]: [...(prev[lvlId]?.[`s${sem}` as 's1'|'s2'] || []), data] }
      }));
      showMsg('s', `تمت إضافة "${modForm.name}"`);
      cancelModForm();
    } else { showMsg('e', error?.message || 'خطأ'); }
  }

  async function updateModule() {
    if (!editingMod) return;
    if (!modForm.name.trim()) { showMsg('e', 'اسم المقياس مطلوب'); return; }
    const spec = modForm.spec.split(',').map(s => s.trim()).filter(Boolean);
    const hasTD = modForm.mode === 'عن بعد' ? false : modForm.hasTD;
    const { data, error } = await supabase.from('modules').update({
      name_ar: modForm.name.trim(),
      has_td: hasTD,
      weekly_hours_td: hasTD ? 1.5 : 0,
      specialty_match: spec,
      ue_type: modForm.ue,
      delivery_mode: modForm.mode,
    }).eq('id', editingMod.id).select().single();

    if (data) {
      const lvlId = editingMod.level_id, sem = editingMod.semester;
      setModules(prev => ({
        ...prev,
        [lvlId]: {
          ...prev[lvlId],
          [`s${sem}`]: prev[lvlId][`s${sem}` as 's1'|'s2'].map(m => m.id === data.id ? data : m)
        }
      }));
      showMsg('s', 'تم تعديل المقياس بنجاح');
      cancelModForm();
    } else { showMsg('e', error?.message || 'خطأ أثناء التعديل'); }
  }

  // ── حذف مقياس واحد ──
  function askDeleteModule(mod: Module) {
    setConfirmDelete({ ids: [mod.id], label: mod.name_ar, lvlId: mod.level_id, sem: mod.semester });
  }

  // ── حذف جماعي ──
  function askDeleteSelected(lvlId: string, sem: 1|2) {
    if (selectedMods.size === 0) return;
    setConfirmDelete({ ids: Array.from(selectedMods), label: `${toArabicNum(selectedMods.size)} مقياس محدّد`, lvlId, sem });
  }

  function askDeleteAllInSemester(lvlId: string, sem: 1|2, mods: Module[]) {
    if (mods.length === 0) return;
    setConfirmDelete({ ids: mods.map(m => m.id), label: `جميع مقاييس السداسي (${toArabicNum(mods.length)})`, lvlId, sem });
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { lvlId, sem, ids } = confirmDelete;
    const { error } = await supabase.from('modules').update({ is_active: false }).in('id', ids);
    if (!error) {
      setModules(prev => ({
        ...prev,
        [lvlId]: {
          ...prev[lvlId],
          [`s${sem}`]: prev[lvlId][`s${sem}` as 's1'|'s2'].filter(m => !ids.includes(m.id))
        }
      }));
      showMsg('s', `تم حذف ${confirmDelete.label}`);
      setSelectedMods(new Set());
    } else {
      showMsg('e', 'حدث خطأ أثناء الحذف');
    }
    setDeleting(false);
    setConfirmDelete(null);
  }

  function toggleSelectMod(id: string) {
    setSelectedMods(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllInSemester(mods: Module[]) {
    const allIds = mods.map(m => m.id);
    const allSelected = allIds.every(id => selectedMods.has(id));
    setSelectedMods(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach(id => next.delete(id));
      } else {
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  async function addLevel() {
    if (!lvlForm.name.trim() || !lvlForm.code.trim()) { showMsg('e', 'الاسم والرمز مطلوبان'); return; }
    const { data } = await supabase.from('levels').insert({
      code: lvlForm.code.toUpperCase().trim(), name_ar: lvlForm.name.trim(),
      degree_type: lvlForm.type, display_order: levels.length + 1, is_active: true,
    }).select().single();
    if (data) {
      setLevels(prev => [...prev, data]);
      setModules(prev => ({ ...prev, [data.id]: { s1: [], s2: [] } }));
      await supabase.from('level_semesters').insert([
        { level_id: data.id, semester: 1, num_sections: 1, num_groups: 2 },
        { level_id: data.id, semester: 2, num_sections: 1, num_groups: 2 },
      ]);
      showMsg('s', `تمت إضافة "${lvlForm.name}"`);
      setLvlForm({ name: '', type: 'ليسانس', code: '' });
      setAddingLevel(false);
    }
  }

  async function deleteLevel(id: string) {
    if (!window.confirm('حذف هذا المستوى وجميع مقاييسه؟')) return;
    await supabase.from('levels').update({ is_active: false }).eq('id', id);
    setLevels(prev => prev.filter(l => l.id !== id));
    showMsg('s', 'تم الحذف');
  }

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-xl">المقاييس والمستويات</h2>
          <p className="text-gray-500 text-sm">{toArabicNum(levels.length)} مستوى — سداسيان مستقلان لكل مستوى</p>
        </div>
        {!allowedLevelCodes && (
          <button onClick={() => setAddingLevel(true)}
            className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> مستوى جديد
          </button>
        )}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${msg.t === 's' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.t === 's' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.m}
        </div>
      )}

      {addingLevel && (
        <div className="bg-white rounded-2xl p-5 border-2 border-[#1a3a6b]/20 shadow-sm animate-slide-up">
          <h3 className="font-display font-semibold text-gray-800 text-sm mb-4">إضافة مستوى جديد</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">الاسم *</label>
              <input value={lvlForm.name} onChange={e => setLvlForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: ماستر 1 قانون البيئة"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">الرمز *</label>
              <input value={lvlForm.code} onChange={e => setLvlForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="M1ENV"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">النوع</label>
              <select value={lvlForm.type} onChange={e => setLvlForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50">
                <option>ليسانس</option><option>ماستر</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addLevel} className="flex items-center gap-1.5 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-medium">
              <Save className="w-3.5 h-3.5" /> إضافة
            </button>
            <button onClick={() => setAddingLevel(false)} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm">
              <X className="w-3.5 h-3.5" /> إلغاء
            </button>
          </div>
        </div>
      )}

      {levels.map(level => {
        const isExp = expanded === level.id;
        const sem = activeSem[level.id] || 1;
        const currentMods = modules[level.id]?.[`s${sem}` as 's1'|'s2'] || [];
        const isAdding = addingMod?.lvlId === level.id && addingMod?.sem === sem;
        const semColor = sem === 1 ? '#1a3a6b' : '#c9a227';
        const ls = getLs(level.id, sem);
        const selectedInThisSem = currentMods.filter(m => selectedMods.has(m.id)).length;

        return (
          <div key={level.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setExpanded(isExp ? null : level.id)}
              className="w-full flex items-center justify-between p-4 text-right hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${level.degree_type === 'ليسانس' ? 'bg-[#1a3a6b]/09' : 'bg-[#c9a227]/09'}`}>
                  <BookOpen className="w-5 h-5" style={{ color: level.degree_type === 'ليسانس' ? '#1a3a6b' : '#c9a227' }} />
                </div>
                <div>
                  <p className="font-display font-bold text-gray-800 text-sm">{level.name_ar}</p>
                  <p className="text-gray-400 text-xs">
                    {toArabicNum(modules[level.id]?.s1.length || 0)}م سداسي1 · {toArabicNum(modules[level.id]?.s2.length || 0)}م سداسي2
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); deleteLevel(level.id); }}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <span className={`text-xs px-2 py-0.5 rounded-full ${level.degree_type==='ليسانس'?'bg-[#1a3a6b]/09 text-[#1a3a6b]':'bg-[#c9a227]/09 text-[#a07820]'}`}>
                  {level.degree_type}
                </span>
                {isExp ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {isExp && (
              <div className="border-t border-gray-100 p-4 animate-slide-up">
                {/* Semester tabs */}
                <div className="flex gap-2 mb-4">
                  {([1, 2] as (1|2)[]).map(s => (
                    <button key={s} onClick={() => setActiveSem(prev => ({ ...prev, [level.id]: s }))}
                      className="px-4 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{ background: sem===s?(s===1?'#1a3a6b':'#c9a227'):'#f1f5f9', color: sem===s?'white':'#64748b' }}>
                      السداسي {s===1?'الأول':'الثاني'} ({toArabicNum(modules[level.id]?.[`s${s}` as 's1'|'s2']?.length || 0)})
                      {ls && <span className="mr-1.5 opacity-70 text-xs">· {toArabicNum(getLs(level.id, s)?.num_sections || 0)}م</span>}
                    </button>
                  ))}
                </div>

                {currentMods.length === 0 && !isAdding && (
                  <p className="text-center text-gray-400 text-sm py-4">لا توجد مقاييس في السداسي {sem===1?'الأول':'الثاني'}</p>
                )}

                {/* أدوات التحديد الجماعي */}
                {currentMods.length > 0 && (
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox"
                        checked={currentMods.length > 0 && currentMods.every(m => selectedMods.has(m.id))}
                        onChange={() => toggleSelectAllInSemester(currentMods)}
                        className="w-3.5 h-3.5 accent-[#1a3a6b]" />
                      تحديد الكل
                    </label>
                    {selectedInThisSem > 0 && (
                      <button onClick={() => askDeleteSelected(level.id, sem)}
                        className="flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> حذف المحدّد ({toArabicNum(selectedInThisSem)})
                      </button>
                    )}
                    <button onClick={() => askDeleteAllInSemester(level.id, sem, currentMods)}
                      className="flex items-center gap-1.5 text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 hover:text-red-500 hover:border-red-200 transition-colors mr-auto">
                      <Trash2 className="w-3.5 h-3.5" /> حذف كل مقاييس السداسي
                    </button>
                  </div>
                )}

                <div className="space-y-2 mb-3">
                  {currentMods.map(mod => (
                    <div key={mod.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                        selectedMods.has(mod.id) ? 'border-[#1a3a6b]/30 bg-[#1a3a6b]/5' : 'border-gray-100 hover:bg-gray-50'
                      }`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={selectedMods.has(mod.id)}
                          onChange={() => toggleSelectMod(mod.id)}
                          className="w-4 h-4 accent-[#1a3a6b] flex-shrink-0" />
                        <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: mod.has_td ? '#c9a227' : '#1a3a6b' }} />
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{mod.name_ar}</p>
                          <div className="flex gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs bg-[#1a3a6b]/09 text-[#1a3a6b] px-1.5 py-0.5 rounded">م 2.25س</span>
                            {mod.has_td && <span className="text-xs bg-[#c9a227]/09 text-[#a07820] px-1.5 py-0.5 rounded">ت 1.5س</span>}
                            <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{mod.ue_type || 'أساسية'}</span>
                            {mod.delivery_mode === 'عن بعد' && <span className="text-xs bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded">عن بعد</span>}
                            {mod.specialty_match?.slice(0,2).map((s, i) => (
                              <span key={i} className="text-xs text-gray-400">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEditModule(mod)}
                          className="p-1.5 text-gray-300 hover:text-[#1a3a6b] hover:bg-[#1a3a6b]/5 rounded-lg transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => askDeleteModule(mod)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {isAdding ? (
                  <div className="rounded-xl p-4 space-y-3 animate-slide-up"
                    style={{ border: `2px dashed ${semColor}44`, background: `${semColor}05` }}>
                    <p className="font-display font-semibold text-gray-700 text-sm">
                      {editingMod ? 'تعديل مقياس' : 'إضافة مقياس'} — السداسي {sem===1?'الأول':'الثاني'}
                    </p>
                    <input value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="اسم المقياس *"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">الوحدة</label>
                        <select value={modForm.ue} onChange={e => setModForm(f => ({ ...f, ue: e.target.value as UEType }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                          {UE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">نمط الحضور</label>
                        <select value={modForm.mode} onChange={e => setModForm(f => ({ ...f, mode: e.target.value as DeliveryMode }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                          {DELIVERY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <input value={modForm.spec} onChange={e => setModForm(f => ({ ...f, spec: e.target.value }))}
                      placeholder="تخصص الأستاذ المفضّل للإسناد (فاصلة بين كل تخصص، اختياري)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                    <label className={`flex items-center gap-2 text-sm cursor-pointer ${modForm.mode === 'عن بعد' ? 'text-gray-300' : 'text-gray-600'}`}>
                      <input type="checkbox" checked={modForm.hasTD} disabled={modForm.mode === 'عن بعد'}
                        onChange={e => setModForm(f => ({ ...f, hasTD: e.target.checked }))} />
                      يشمل أعمال موجهة (TD) — 1.5س/أسبوع لكل فوج
                      {modForm.mode === 'عن بعد' && <span className="text-xs">(غير متاح في نمط عن بعد)</span>}
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => editingMod ? updateModule() : addModule(level.id, sem)}
                        className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-medium"
                        style={{ background: semColor }}>
                        <Save className="w-3.5 h-3.5" /> {editingMod ? 'حفظ التعديلات' : 'إضافة'}
                      </button>
                      <button onClick={cancelModForm}
                        className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm">
                        <X className="w-3.5 h-3.5" /> إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => startAddModule(level.id, sem)}
                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{ border: `2px dashed ${semColor}33`, color: semColor, background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${semColor}06`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <Plus className="w-4 h-4" />
                    إضافة مقياس في السداسي {sem===1?'الأول':'الثاني'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 font-display">تأكيد الحذف</h3>
                <p className="text-xs text-gray-500">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              هل أنت متأكد من حذف <strong>{confirmDelete.label}</strong>؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button
                onClick={confirmDeleteAction}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? 'جارٍ الحذف...' : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
