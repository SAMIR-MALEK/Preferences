import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

import type { Level, Module, LevelSemester } from '../../types';
import { Plus, Trash2, Save, X, BookOpen, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react';

export default function AdminModulesPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [modules, setModules] = useState<Record<string, { s1: Module[]; s2: Module[] }>>({});
  const [lsData, setLsData] = useState<LevelSemester[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeSem, setActiveSem] = useState<Record<string, 1|2>>({});
  const [addingMod, setAddingMod] = useState<{ lvlId: string; sem: 1|2 } | null>(null);
  const [modForm, setModForm] = useState({ name: '', hasTD: false, spec: '' });
  const [addingLevel, setAddingLevel] = useState(false);
  const [lvlForm, setLvlForm] = useState({ name: '', type: 'ليسانس', code: '' });
  const [editLvl, setEditLvl] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ t: 's'|'e'; m: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: lvls }, { data: mods }, { data: ls }] = await Promise.all([
      supabase.from('levels').select('*').eq('is_active', true).order('display_order'),
      supabase.from('modules').select('*').eq('is_active', true).order('display_order'),
      supabase.from('level_semesters').select('*'),
    ]);
    if (lvls) {
      setLevels(lvls);
      const grouped: Record<string, { s1: Module[]; s2: Module[] }> = {};
      lvls.forEach((l: Level) => { grouped[l.id] = { s1: [], s2: [] }; });
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

  async function addModule(lvlId: string, sem: 1|2) {
    if (!modForm.name.trim()) { showMsg('e', 'اسم المقياس مطلوب'); return; }
    const code = `${levels.find(l => l.id === lvlId)?.code}-S${sem}-${Date.now()}`;
    const spec = modForm.spec.split(',').map(s => s.trim()).filter(Boolean);
    const { data, error } = await supabase.from('modules').insert({
      level_id: lvlId, code, name_ar: modForm.name.trim(), semester: sem,
      has_lectures: true, has_td: modForm.hasTD,
      weekly_hours_lecture: 2.25, weekly_hours_td: modForm.hasTD ? 1.5 : 0,
      specialty_match: spec,
      display_order: (modules[lvlId]?.[`s${sem}` as 's1'|'s2']?.length || 0),
      is_active: true,
    }).select().single();
    if (data) {
      setModules(prev => ({
        ...prev,
        [lvlId]: { ...prev[lvlId], [`s${sem}`]: [...(prev[lvlId]?.[`s${sem}` as 's1'|'s2'] || []), data] }
      }));
      showMsg('s', `تمت إضافة "${modForm.name}"`);
      setModForm({ name: '', hasTD: false, spec: '' });
      setAddingMod(null);
    } else { showMsg('e', error?.message || 'خطأ'); }
  }

  async function removeModule(modId: string, lvlId: string, sem: 1|2) {
    await supabase.from('modules').update({ is_active: false }).eq('id', modId);
    setModules(prev => ({
      ...prev,
      [lvlId]: {
        ...prev[lvlId],
        [`s${sem}`]: prev[lvlId][`s${sem}` as 's1'|'s2'].filter(m => m.id !== modId)
      }
    }));
    showMsg('s', 'تم الحذف');
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
          <p className="text-gray-500 text-sm">{levels.length} مستوى — سداسيان مستقلان لكل مستوى</p>
        </div>
        <button onClick={() => setAddingLevel(true)}
          className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> مستوى جديد
        </button>
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
                    {modules[level.id]?.s1.length || 0}م سداسي1 · {modules[level.id]?.s2.length || 0}م سداسي2
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
                      السداسي {s===1?'الأول':'الثاني'} ({modules[level.id]?.[ as 's1'|'s2']?.length || 0}|{modules[level.id]?.[ as 's1'|'s2']?.length || 0})
                      {ls && <span className="mr-1.5 opacity-70 text-xs">· {getLs(level.id, s)?.num_sections}م</span>}
                    </button>
                  ))}
                </div>

                {currentMods.length === 0 && !isAdding && (
                  <p className="text-center text-gray-400 text-sm py-4">لا توجد مقاييس في السداسي {sem===1?'الأول':'الثاني'}</p>
                )}

                <div className="space-y-2 mb-3">
                  {currentMods.map(mod => (
                    <div key={mod.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: mod.has_td ? '#c9a227' : '#1a3a6b' }} />
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{mod.name_ar}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            <span className="text-xs bg-[#1a3a6b]/09 text-[#1a3a6b] px-1.5 py-0.5 rounded">م 2.25س</span>
                            {mod.has_td && <span className="text-xs bg-[#c9a227]/09 text-[#a07820] px-1.5 py-0.5 rounded">ت 1.5س</span>}
                            {mod.specialty_match?.slice(0,2).map((s, i) => (
                              <span key={i} className="text-xs text-gray-400">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeModule(mod.id, level.id, sem)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {isAdding ? (
                  <div className="rounded-xl p-4 space-y-3 animate-slide-up"
                    style={{ border: `2px dashed ${semColor}44`, background: `${semColor}05` }}>
                    <p className="font-display font-semibold text-gray-700 text-sm">
                      إضافة مقياس — السداسي {sem===1?'الأول':'الثاني'}
                    </p>
                    <input value={modForm.name} onChange={e => setModForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="اسم المقياس *"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                    <input value={modForm.spec} onChange={e => setModForm(f => ({ ...f, spec: e.target.value }))}
                      placeholder="التخصصات المناسبة (فاصلة بين كل تخصص)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white" />
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={modForm.hasTD}
                        onChange={e => setModForm(f => ({ ...f, hasTD: e.target.checked }))} />
                      يشمل أعمال موجهة (TD) — 1.5س/أسبوع لكل فوج
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => addModule(level.id, sem)}
                        className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-medium"
                        style={{ background: semColor }}>
                        <Save className="w-3.5 h-3.5" /> إضافة
                      </button>
                      <button onClick={() => setAddingMod(null)}
                        className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm">
                        <X className="w-3.5 h-3.5" /> إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingMod({ lvlId: level.id, sem })}
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
    </div>
  );
}
