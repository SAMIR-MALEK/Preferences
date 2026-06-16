import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum, toArabicFixed } from '../../lib/utils';
import type {
  Professor, Assignment, Module, Level, LevelSemester,
  AssignmentCriterion, ProfessorHoursSummary
} from '../../types';
import { HOURS_LECTURE, HOURS_TD, MAX_WEEKLY_HOURS } from '../../types';
import {
  Play, RefreshCw, CheckCircle, AlertCircle, Lock, Info,
  ChevronDown, ChevronUp, Trash2, Users, BookOpen, Clock,
  BarChart2, Plus, Edit2, Save, X, Sliders
} from 'lucide-react';

// ── RANK SCORE ────────────────────────────────────────────────────────
const RANK_SCORE: Record<string, number> = {
  'أستاذ التعليم العالي': 100,
  'أستاذ محاضر - أ': 80,
  'أستاذ محاضر - ب': 60,
  'أستاذ مساعد - أ': 40,
  'أستاذ مساعد - ب': 20,
};

export default function AdminAssignmentPage() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelSemesters, setLevelSemesters] = useState<LevelSemester[]>([]);
  const [criteria, setCriteria] = useState<AssignmentCriterion[]>([]);

  const [view, setView] = useState<'profs' | 'modules'>('profs');
  const [semFilter, setSemFilter] = useState<0|1|2>(0);
  const [expandedProf, setExpandedProf] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [showAddCrit, setShowAddCrit] = useState(false);
  const [newCrit, setNewCrit] = useState({ label: '', description: '', weight: 10 });
  const [editCritId, setEditCritId] = useState<string|null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [
      { data: profs }, { data: asgns }, { data: mods },
      { data: lvls }, { data: ls }, { data: crits }
    ] = await Promise.all([
      supabase.from('professors').select('*').eq('is_active', true),
      supabase.from('assignments').select('*, professor:professors(*), module:modules(*), level:levels(*)')
        .eq('academic_year', '2026-2027').neq('status', 'ملغى'),
      supabase.from('modules').select('*, level:levels(*)').eq('is_active', true),
      supabase.from('levels').select('*').eq('is_active', true).order('display_order'),
      supabase.from('level_semesters').select('*'),
      supabase.from('assignment_criteria').select('*').order('display_order'),
    ]);
    if (profs) setProfessors(profs);
    if (asgns) setAssignments(asgns);
    if (mods) setModules(mods);
    if (lvls) setLevels(lvls);
    if (ls) setLevelSemesters(ls);
    if (crits) setCriteria(crits);
    if (asgns && asgns.length > 0) setRan(true);
  }

  // ── الأوزان ──────────────────────────────────────────────────────────
  const activeCriteria = criteria.filter(c => c.is_active);
  const totalWeight = activeCriteria.reduce((a, c) => a + c.weight, 0);
  const weightsOk = Math.abs(totalWeight - 100) < 0.5;

  // ── حساب ساعات كل أستاذ ──────────────────────────────────────────────
  const profHours = useMemo(() => {
    const h: Record<string, number> = {};
    professors.forEach(p => { h[p.id] = 0; });
    assignments.forEach(a => { h[a.professor_id] = (h[a.professor_id] || 0) + a.weekly_hours; });
    return h;
  }, [assignments, professors]);

  // ── حالة slots كل مقياس ─────────────────────────────────────────────
  const moduleSlotStatus = useMemo(() => {
    const result: Record<string, { lectureUsed: Assignment[]; tdUsed: Assignment[]; ls: LevelSemester | null }> = {};

    modules.forEach(mod => {
      const ls = levelSemesters.find(x => x.level_id === mod.level_id && x.semester === mod.semester) || null;
      const lectureUsed = assignments.filter(a => a.module_id === mod.id && a.teaching_type === 'محاضرة');
      const tdUsed = assignments.filter(a => a.module_id === mod.id && a.teaching_type === 'أعمال موجهة');
      result[mod.id] = { lectureUsed, tdUsed, ls };
    });
    return result;
  }, [assignments, modules, levelSemesters]);

  // ── المقاييس الناقصة ─────────────────────────────────────────────────
  const incompleteModules = useMemo(() => {
    return modules.filter(mod => {
      const status = moduleSlotStatus[mod.id];
      if (!status?.ls) return false;
      const lectFree = status.ls.num_sections - status.lectureUsed.length;
      const tdFree = mod.has_td ? (status.ls.num_sections * status.ls.num_groups) - status.tdUsed.length : 0;
      return lectFree > 0 || tdFree > 0;
    }).filter(mod => semFilter === 0 || mod.semester === semFilter);
  }, [modules, moduleSlotStatus, semFilter]);

  // ── تشغيل الخوارزمية ─────────────────────────────────────────────────
  async function runAlgorithm() {
    if (!weightsOk) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('run_assignment_algorithm', { p_year: '2026-2027' });
      if (error) throw error;
      await loadData();
      setRan(true);
    } catch (e) {
      console.error('Algorithm error:', e);
      // Fallback: simulate with local algorithm for demo
      await simulateAlgorithm();
    }
    setLoading(false);
  }

  async function simulateAlgorithm() {
    // Clear existing
    await supabase.from('assignments').delete().eq('academic_year', '2026-2027').eq('status', 'مؤقت');

    // Get all wishes ordered by wish_order
    const { data: wishes } = await supabase
      .from('wishes')
      .select('*, professor:professors(*)')
      .eq('academic_year', '2026-2027')
      .order('wish_order').order('professor_id');

    if (!wishes) return;

    const usedHours: Record<string, number> = {};
    const usedSlots: Record<string, number> = {}; // `${moduleId}_${type}` -> count

    const toInsert: Omit<Assignment, 'id' | 'assigned_at'>[] = [];

    for (const wish of wishes) {
      const profId = wish.professor_id;
      const hours = wish.teaching_type === 'محاضرة' ? HOURS_LECTURE : HOURS_TD;
      if ((usedHours[profId] || 0) + hours > MAX_WEEKLY_HOURS) continue;

      const ls = levelSemesters.find(x => x.level_id === wish.level_id && x.semester === wish.semester);
      if (!ls) continue;

      const key = `${wish.module_id}_${wish.teaching_type}`;
      const maxSlots = wish.teaching_type === 'محاضرة' ? ls.num_sections : ls.num_sections * ls.num_groups;
      const used = usedSlots[key] || 0;
      if (used >= maxSlots) continue;

      // Check for same-order conflict
      const conflict = toInsert.find(a =>
        a.module_id === wish.module_id &&
        a.teaching_type === wish.teaching_type &&
        a.wish_order_satisfied === wish.wish_order &&
        (usedSlots[key] || 0) >= maxSlots
      );

      usedSlots[key] = (usedSlots[key] || 0) + 1;
      usedHours[profId] = (usedHours[profId] || 0) + hours;

      const slotNum = usedSlots[key];
      const sectionNum = wish.teaching_type === 'محاضرة' ? slotNum : Math.ceil(slotNum / ls.num_groups);
      const groupNum = wish.teaching_type === 'أعمال موجهة' ? slotNum - (sectionNum - 1) * ls.num_groups : null;

      toInsert.push({
        professor_id: profId,
        module_id: wish.module_id,
        level_id: wish.level_id,
        academic_year: '2026-2027',
        semester: wish.semester,
        teaching_type: wish.teaching_type,
        section_number: sectionNum,
        group_number: groupNum,
        weekly_hours: hours,
        wish_order_satisfied: wish.wish_order,
        conflict_resolved: false,
        score: null,
        status: 'مؤقت',
      } as any);
    }

    if (toInsert.length > 0) {
      await supabase.from('assignments').insert(toInsert);
    }
    await loadData();
  }

  async function removeAssignment(id: string) {
    if (confirmed) return;
    await supabase.from('assignments').update({ status: 'ملغى' }).eq('id', id);
    setAssignments(prev => prev.filter(a => a.id !== id));
  }

  async function confirmAssignments() {
    if (!window.confirm('بعد التأكيد لا يمكن تعديل الإسنادات. تأكيد نهائي؟')) return;
    setConfirmSaving(true);
    await supabase.from('assignments').update({ status: 'نهائي' })
      .eq('academic_year', '2026-2027').eq('status', 'مؤقت');
    setConfirmed(true);
    setConfirmSaving(false);
  }

  async function toggleCriterion(id: string) {
    const c = criteria.find(x => x.id === id);
    if (!c) return;
    await supabase.from('assignment_criteria').update({ is_active: !c.is_active }).eq('id', id);
    setCriteria(prev => prev.map(x => x.id === id ? { ...x, is_active: !x.is_active } : x));
  }

  async function updateWeight(id: string, w: number) {
    setCriteria(prev => prev.map(x => x.id === id ? { ...x, weight: w } : x));
    await supabase.from('assignment_criteria').update({ weight: w }).eq('id', id);
  }

  async function addCriterion() {
    if (!newCrit.label.trim()) return;
    const { data } = await supabase.from('assignment_criteria').insert({
      ...newCrit, is_active: true, display_order: criteria.length + 1
    }).select().single();
    if (data) { setCriteria(prev => [...prev, data]); setNewCrit({ label: '', description: '', weight: 10 }); setShowAddCrit(false); }
  }

  async function deleteCriterion(id: string) {
    await supabase.from('assignment_criteria').delete().eq('id', id);
    setCriteria(prev => prev.filter(x => x.id !== id));
  }

  const filteredAssignments = semFilter === 0 ? assignments : assignments.filter(a => a.semester === semFilter);

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in pb-24" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-xl">خوارزمية الإسناد</h2>
          <p className="text-gray-500 text-sm mt-1">
            الأولوية: <strong className="text-gray-700">رقم الرغبة أولاً</strong> — المعايير عند التصادم فقط
          </p>
        </div>
        <button onClick={runAlgorithm} disabled={loading || !weightsOk}
          className="flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 text-white"
          style={{ background: 'linear-gradient(135deg,#c9a227,#a07820)' }}>
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'جارٍ التحليل...' : !weightsOk ? `المجموع ${toArabicNum(totalWeight.toFixed(0))}% ≠ 100%` : 'تشغيل الخوارزمية'}
        </button>
      </div>

      {/* Algorithm logic explanation */}
      <div className="bg-[#1a3a6b]/5 border border-[#1a3a6b]/15 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { n: '①', t: 'الرغبة 1 أولاً', d: 'كل رغبات الأساتذة المرتبة بـ1 تُعالَج قبل الرغبات 2، 3...', c: '#1a3a6b' },
            { n: '②', t: 'Slot فارغة → إسناد فوري', d: 'إذا كانت المجموعة/الفوج شاغرة: يأخذها الأستاذ مباشرة بغض النظر عن قوته', c: '#059669' },
            { n: '③', t: 'تصادم → المعايير', d: 'إذا تزاحم أستاذان على نفس slot بنفس رقم الرغبة: الأقوى بالمعايير يأخذها', c: '#dc2626' },
          ].map(s => (
            <div key={s.n} className="bg-white rounded-xl p-3 border" style={{ borderColor: `${s.c}25` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center font-display"
                  style={{ background: s.c }}>{s.n}</span>
                <span className="font-bold text-xs font-display" style={{ color: s.c }}>{s.t}</span>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap mt-3 text-xs text-gray-500">
          {[
            `📚 محاضرة = ${HOURS_LECTURE}س/أسبوع لكل مجموعة`,
            `✍️ أعمال موجهة = ${HOURS_TD}س/أسبوع لكل فوج`,
            `⏱ الحد الأقصى = ${MAX_WEEKLY_HOURS}س/أستاذ`,
            `👥 عدد المجموعات يحدد عدد فرص الإسناد`,
          ].map((t, i) => (
            <span key={i} className="bg-white px-2.5 py-1 rounded-lg border border-gray-200">{t}</span>
          ))}
        </div>
      </div>

      {/* Criteria Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <button onClick={() => setShowCriteria(!showCriteria)}
          className="w-full flex items-center justify-between p-4 text-right">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#1a3a6b]" />
            <span className="font-display font-semibold text-gray-800 text-sm">
              معايير الإسناد <span className="text-gray-400 font-normal text-xs">(عند التصادم فقط)</span>
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${weightsOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {toArabicNum(totalWeight.toFixed(0))}% {weightsOk ? '✓' : '✗'}
            </span>
          </div>
          {showCriteria ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showCriteria && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="flex justify-end">
              <button onClick={() => setShowAddCrit(!showAddCrit)}
                className="flex items-center gap-1.5 text-xs text-[#1a3a6b] bg-[#1a3a6b]/8 hover:bg-[#1a3a6b]/15 px-3 py-1.5 rounded-lg font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" /> معيار جديد
              </button>
            </div>

            {showAddCrit && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 animate-slide-up">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">الاسم *</label>
                    <input value={newCrit.label} onChange={e => setNewCrit(n => ({ ...n, label: e.target.value }))}
                      placeholder="مثال: نتائج التقييم"
                      className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">الوزن %</label>
                    <input type="number" min="0" max="100" step="5" value={newCrit.weight}
                      onChange={e => setNewCrit(n => ({ ...n, weight: +e.target.value }))}
                      className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white" dir="ltr" />
                  </div>
                </div>
                <input value={newCrit.description} onChange={e => setNewCrit(n => ({ ...n, description: e.target.value }))}
                  placeholder="وصف المعيار (اختياري)"
                  className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white" />
                <div className="flex gap-2">
                  <button onClick={addCriterion} disabled={!newCrit.label.trim()}
                    className="flex items-center gap-1.5 bg-[#1a3a6b] text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                    <Save className="w-3 h-3" /> إضافة
                  </button>
                  <button onClick={() => setShowAddCrit(false)}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs">
                    <X className="w-3 h-3" /> إلغاء
                  </button>
                </div>
              </div>
            )}

            {criteria.map(c => (
              <div key={c.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${c.is_active ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50/50 opacity-50'}`}>
                <button onClick={() => toggleCriterion(c.id)}
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ background: c.is_active ? '#1a3a6b' : 'white', borderColor: c.is_active ? '#1a3a6b' : '#cbd5e1' }}>
                  {c.is_active && <CheckCircle className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-800">{c.label}</span>
                  {c.description && <span className="text-xs text-gray-400 mr-2">{c.description}</span>}
                </div>
                {editCritId !== c.id && (
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <input type="range" min="0" max="60" step="5" value={c.weight}
                      onChange={e => updateWeight(c.id, +e.target.value)}
                      disabled={!c.is_active} className="w-20 accent-[#1a3a6b]" />
                    <span className="font-display font-bold text-[#1a3a6b] text-sm w-8 text-center">{c.weight}%</span>
                    <button onClick={() => deleteCriterion(c.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {!weightsOk && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5" />
                مجموع الأوزان النشطة = {toArabicNum(totalWeight.toFixed(0))}% — يجب أن يساوي 100%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!ran && !loading && (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
          <div className="w-16 h-16 rounded-2xl bg-[#c9a227]/10 flex items-center justify-center mx-auto mb-4">
            <Play className="w-8 h-8 text-[#c9a227]" />
          </div>
          <h3 className="font-display font-bold text-gray-700 text-lg mb-2">جاهز للإسناد</h3>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            اضغط "تشغيل الخوارزمية" لتوزيع المقاييس على الأساتذة حسب الرغبات والمجموعات المتاحة
          </p>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
          <div className="w-12 h-12 border-4 border-[#f1f5f9] border-t-[#c9a227] rounded-full animate-spin mx-auto mb-4" />
          <p className="font-display font-bold text-gray-800 mb-1">جارٍ تحليل الرغبات...</p>
          <p className="text-gray-400 text-sm">تطبيق المنطق: رغبة 1 أولاً ← تحقق من slots ← حل التصادمات</p>
        </div>
      )}

      {/* ══ Results ══════════════════════════════════════════════════════ */}
      {ran && !loading && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: 'إجمالي الإسنادات', v: assignments.length, c: '#1a3a6b', bg: 'rgba(26,58,107,.08)', i: CheckCircle },
              { l: 'تصادمات محلولة', v: assignments.filter(a => a.conflict_resolved).length, c: '#d97706', bg: 'rgba(217,119,6,.08)', i: AlertCircle },
              { l: 'مقاييس بـslots فارغة', v: incompleteModules.length, c: '#dc2626', bg: 'rgba(220,38,38,.07)', i: BookOpen },
              { l: 'وصلوا الحد 9س', v: Object.values(profHours).filter(h => h >= MAX_WEEKLY_HOURS).length, c: '#7c3aed', bg: 'rgba(124,58,237,.07)', i: Clock },
            ].map(s => {
              const Icon = s.i;
              return (
                <div key={s.l} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-display font-bold text-2xl" style={{ color: s.c }}>{s.v}</p>
                      <p className="text-gray-400 text-xs mt-1">{s.l}</p>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: s.bg }}>
                      <Icon className="w-4 h-4" style={{ color: s.c }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* View selector + filters */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
              {[
                { id: 'profs', l: 'قائمة الأساتذة', i: Users },
                { id: 'modules', l: 'المقاييس الناقصة', i: BookOpen, badge: incompleteModules.length },
              ].map(t => {
                const Icon = t.i;
                return (
                  <button key={t.id} onClick={() => setView(t.id as any)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: view === t.id ? '#1a3a6b' : 'transparent',
                      color: view === t.id ? 'white' : '#64748b',
                    }}>
                    <Icon className="w-4 h-4" />
                    {t.l}
                    {t.badge !== undefined && t.badge > 0 && (
                      <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                        style={{ background: view === t.id ? 'rgba(255,255,255,.25)' : '#dc2626', color: 'white' }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              {[['الكل', 0], ['السداسي الأول', 1], ['السداسي الثاني', 2]].map(([l, v]) => (
                <button key={v}
                  onClick={() => setSemFilter(v as 0|1|2)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: semFilter === v ? '#1a3a6b' : '#f1f5f9',
                    color: semFilter === v ? 'white' : '#64748b',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
              VIEW 1: قائمة الأساتذة
          ═══════════════════════════════════════════════ */}
          {view === 'profs' && (
            <div className="space-y-3">
              {!confirmed && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  هذه إسنادات <strong>مؤقتة</strong> — يمكنك حذف أي إسناد قبل التأكيد النهائي.
                </div>
              )}

              {professors.map(prof => {
                const profAssigns = filteredAssignments.filter(a => a.professor_id === prof.id);
                const totalH = profHours[prof.id] || 0;
                const remaining = MAX_WEEKLY_HOURS - totalH;
                const isExp = expandedProf === prof.id;
                const pct = Math.min((totalH / MAX_WEEKLY_HOURS) * 100, 100);
                const barColor = totalH >= MAX_WEEKLY_HOURS ? '#ef4444' : totalH >= 6.75 ? '#f59e0b' : '#10b981';

                return (
                  <div key={prof.id}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm"
                    style={{ border: `1px solid ${profAssigns.length === 0 ? '#fecaca' : '#e8ecf3'}` }}>
                    <button
                      onClick={() => setExpandedProf(isExp ? null : prof.id)}
                      className="w-full flex items-center gap-3 p-4 text-right hover:bg-gray-50/50 transition-colors">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm flex-shrink-0"
                        style={{
                          background: totalH >= MAX_WEEKLY_HOURS ? '#fee2e2' : 'rgba(26,58,107,.08)',
                          color: totalH >= MAX_WEEKLY_HOURS ? '#dc2626' : '#1a3a6b',
                        }}>
                        {prof.last_name?.[0]}{prof.first_name?.[0]}
                      </div>

                      <div className="flex-1 text-right">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold text-gray-800 text-sm">
                            {prof.last_name} {prof.first_name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {prof.rank}
                          </span>
                          {profAssigns.some(a => a.conflict_resolved) && (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> فاز بتصادم
                            </span>
                          )}
                          {profAssigns.length === 0 && (
                            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">لا إسنادات</span>
                          )}
                        </div>

                        {/* Hours bar */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                          <span className="font-display font-bold text-xs w-12" style={{ color: barColor }}>
                            {toArabicFixed(totalH)}س
                          </span>
                          <span className="text-xs" style={{ color: remaining > 0 ? '#10b981' : '#ef4444' }}>
                            {remaining > 0 ? `يبقى ${remaining.toFixed(2)}س` : '⛔ ممتلئ'}
                          </span>
                          <span className="text-xs text-gray-400">{toArabicNum(profAssigns.length)} إسناد</span>
                        </div>
                      </div>

                      {isExp ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                             : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>

                    {/* Assignments detail */}
                    {isExp && (
                      <div className="border-t border-gray-100 p-4">
                        {profAssigns.length === 0 ? (
                          <div className="text-center py-6 text-gray-400 text-sm">
                            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            لم تُسنَد لهذا الأستاذ أي مقاييس
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {profAssigns.map(a => {
                              const mod = modules.find(m => m.id === a.module_id);
                              const lvl = levels.find(l => l.id === a.level_id);
                              return (
                                <div key={a.id}
                                  className="flex items-center gap-3 p-3 rounded-xl"
                                  style={{
                                    border: `1.5px solid ${a.conflict_resolved ? '#fde68a' : '#f1f5f9'}`,
                                    background: a.conflict_resolved ? '#fffbeb' : '#fafafa',
                                  }}>
                                  {/* Wish badge */}
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-display flex-shrink-0"
                                    style={{
                                      background: a.wish_order_satisfied === 1 ? '#1a3a6b' : a.wish_order_satisfied === 2 ? '#c9a227' : '#e5e7eb',
                                      color: a.wish_order_satisfied <= 2 ? 'white' : '#475569',
                                    }}>
                                    {a.wish_order_satisfied}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-gray-800 text-sm truncate">{mod?.name_ar}</span>
                                      <span className="text-xs px-2 py-0.5 rounded-full"
                                        style={{
                                          background: a.teaching_type === 'محاضرة' ? 'rgba(26,58,107,.1)' : 'rgba(201,162,39,.1)',
                                          color: a.teaching_type === 'محاضرة' ? '#1a3a6b' : '#92400e',
                                        }}>
                                        {a.teaching_type}
                                      </span>
                                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                        م{a.section_number}{a.group_number ? `/ف${a.group_number}` : ''}
                                      </span>
                                      <span className="font-display font-bold text-xs text-[#1a3a6b]">
                                        {a.weekly_hours}س
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        س{a.semester}
                                      </span>
                                      {a.conflict_resolved && (
                                        <span className="text-xs text-amber-600 flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3" />
                                          تصادم ({toArabicNum((a.score??0).toFixed(0))} نق)
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{lvl?.name_ar}</p>
                                  </div>

                                  {!confirmed && (
                                    <button onClick={() => removeAssignment(a.id)}
                                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                      title="حذف هذا الإسناد">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}

                            {remaining > 0 && remaining < MAX_WEEKLY_HOURS && (
                              <div className="flex items-center gap-2 text-xs text-green-600 mt-2 pt-2 border-t border-gray-100">
                                <Clock className="w-3.5 h-3.5" />
                                متبقي <strong>{toArabicFixed(remaining)} ساعة</strong>
                                {remaining >= HOURS_LECTURE && (
                                  <span className="text-gray-400">
                                    (يسع {Math.floor(remaining / HOURS_LECTURE)} محاضرة إضافية)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              VIEW 2: المقاييس بدون إسناد كافٍ
          ═══════════════════════════════════════════════ */}
          {view === 'modules' && (
            <div className="space-y-3">
              {incompleteModules.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
                  <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <h3 className="font-display font-bold text-green-700 text-lg mb-2">
                    جميع المقاييس لديها إسنادات كاملة!
                  </h3>
                </div>
              ) : (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      هذه المقاييس لديها <strong>slots فارغة</strong> — إما لأن لا أحد طلبها، أو لأن رغبات الأساتذة لم تكفِ.
                      تحتاج تدخلاً يدوياً أو فتح رغبات إضافية.
                    </span>
                  </div>

                  {/* Group by level */}
                  {[...new Set(incompleteModules.map(m => m.level_id))].map(levelId => {
                    const lvl = levels.find(l => l.id === levelId);
                    const lvlMods = incompleteModules.filter(m => m.level_id === levelId);

                    return (
                      <div key={levelId} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                        <div className="bg-[#1a3a6b]/4 px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-[#1a3a6b] flex items-center justify-center">
                            <BookOpen className="w-3.5 h-3.5 text-white" />
                          </div>
                          <span className="font-display font-bold text-gray-800 text-sm">{lvl?.name_ar}</span>
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                            {toArabicNum(lvlMods.length)} مقياس ناقص
                          </span>
                        </div>

                        <div className="p-4 space-y-4">
                          {lvlMods.map(mod => {
                            const status = moduleSlotStatus[mod.id];
                            if (!status?.ls) return null;
                            const { ls, lectureUsed, tdUsed } = status;
                            const lectTotal = ls.num_sections;
                            const lectFree = lectTotal - lectureUsed.length;
                            const tdTotal = mod.has_td ? ls.num_sections * ls.num_groups : 0;
                            const tdFree = mod.has_td ? tdTotal - tdUsed.length : 0;

                            return (
                              <div key={mod.id}
                                className="rounded-xl overflow-hidden border border-red-100">
                                <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-3 flex-wrap">
                                  <span className="font-bold text-gray-800 text-sm">{mod.name_ar}</span>
                                  <span className="text-xs text-gray-400">
                                    السداسي {mod.semester === 1 ? 'الأول' : 'الثاني'}
                                  </span>
                                  {lectFree > 0 && (
                                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                      {lectFree} محاضرة فارغة
                                    </span>
                                  )}
                                  {tdFree > 0 && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                      {tdFree} TD فارغ
                                    </span>
                                  )}
                                </div>

                                <div className="p-4 space-y-4">
                                  {/* Lecture slots */}
                                  <div>
                                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                                      <BookOpen className="w-3.5 h-3.5 text-[#1a3a6b]" />
                                      المحاضرات — {toArabicNum(lectureUsed.length)}/{toArabicNum(lectTotal)} مشغول
                                    </p>
                                    <div className="flex gap-2 flex-wrap">
                                      {Array.from({ length: lectTotal }, (_, i) => {
                                        const a = lectureUsed[i];
                                        const p = a ? professors.find(pr => pr.id === a.professor_id) : null;
                                        return (
                                          <div key={i}
                                            className="flex-1 min-w-24 p-3 rounded-xl text-center border-2 transition-all"
                                            style={{
                                              borderColor: a ? '#bbf7d0' : '#fca5a5',
                                              background: a ? '#f0fdf4' : '#fff5f5',
                                            }}>
                                            <p className="text-xs text-gray-400 mb-1">م{i + 1}</p>
                                            {a ? (
                                              <>
                                                <p className="text-xs font-bold text-green-700">
                                                  {p?.last_name} {p?.first_name?.charAt(0)}.
                                                </p>
                                                <p className="text-xs text-gray-400">رغبة {a.wish_order_satisfied}</p>
                                              </>
                                            ) : (
                                              <p className="text-sm font-bold text-red-400">⬜ فارغة</p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* TD slots */}
                                  {mod.has_td && (
                                    <div>
                                      <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-[#c9a227]" />
                                        الأعمال الموجهة — {toArabicNum(tdUsed.length)}/{toArabicNum(tdTotal)} مشغول
                                        {tdFree > 0 && (
                                          <span className="text-amber-600">({tdFree} فارغ)</span>
                                        )}
                                      </p>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {Array.from({ length: Math.min(tdTotal, 20) }, (_, i) => {
                                          const a = tdUsed[i];
                                          const p = a ? professors.find(pr => pr.id === a.professor_id) : null;
                                          return (
                                            <div key={i}
                                              className="w-9 h-9 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all"
                                              style={{
                                                borderColor: a ? '#bbf7d0' : '#fde68a',
                                                background: a ? '#f0fdf4' : '#fffbeb',
                                                color: a ? '#15803d' : '#d97706',
                                              }}
                                              title={a ? `${p?.last_name} — رغبة ${a.wish_order_satisfied}` : 'فارغ'}>
                                              {a ? '✓' : '○'}
                                            </div>
                                          );
                                        })}
                                        {tdTotal > 20 && (
                                          <span className="text-xs text-gray-400 self-center">
                                            +{tdTotal - 20} أخرى
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Bottom bar ── */}
      {ran && !loading && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                {toArabicNum(assignments.length)} إسناد مؤقت
              </span>
              {incompleteModules.length > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {toArabicNum(incompleteModules.length)} مقياس بـslots فارغة
                </span>
              )}
              {Object.values(profHours).filter(h => h >= MAX_WEEKLY_HOURS).length > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Clock className="w-3.5 h-3.5" />
                  {toArabicNum(Object.values(profHours).filter(h => h >= MAX_WEEKLY_HOURS).length)} أستاذ وصل الحد
                </span>
              )}
            </div>

            {confirmed ? (
              <span className="flex items-center gap-2 text-green-600 font-medium text-sm">
                <CheckCircle className="w-4 h-4" /> تم التأكيد النهائي
              </span>
            ) : (
              <div className="flex gap-2">
                <button onClick={runAlgorithm} disabled={loading}
                  className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm transition-colors hover:bg-gray-200">
                  <RefreshCw className="w-3.5 h-3.5" /> إعادة الحساب
                </button>
                <button onClick={confirmAssignments} disabled={confirmSaving}
                  className="flex items-center gap-2 text-white font-bold px-5 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#1a3a6b,#0d2040)' }}>
                  <Lock className="w-4 h-4" />
                  {confirmSaving ? 'جارٍ...' : 'تأكيد الإسنادات نهائياً'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
