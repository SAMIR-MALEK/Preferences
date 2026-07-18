import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import * as XLSX from 'xlsx';
import {
  Upload, Save, CheckCircle, AlertCircle, Users, BookOpen,
  ChevronDown, ChevronUp, X, Plus, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Megaphone
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════
interface Prof {
  id: string;
  name: string;
  rank: string;
  max_hours: number;
}

interface ModuleInfo {
  id: string;
  name_ar: string;
  level_id: string;
  level_name: string;
  level_code: string;
  has_lectures: boolean;
  has_td: boolean;
  weekly_sessions: number;
  num_sections: number;
  num_groups: number;
}

interface SlotAssignment {
  module_id: string;
  module_name: string;
  level_name: string;
  professor_id: string | null;
  professor_name: string | null;
  teaching_type: 'محاضرة' | 'أعمال موجهة';
  section: number;
  group: number | null;
  weekly_hours: number;
  wish_order?: number;
  from_excel?: boolean;
}

// ساعات كل slot
function slotHours(type: string, weeklySessions: number): number {
  if (type === 'محاضرة') return 2.25 * (weeklySessions || 1);
  return 1.5;
}

// حساب ساعات أستاذ معيّن
function profHours(slots: SlotAssignment[], profId: string): number {
  return slots
    .filter(s => s.professor_id === profId)
    .reduce((sum, s) => sum + s.weekly_hours, 0);
}

// ═══════════════════════════════════════════════════════
export default function AdminAssignmentBoardPage() {
  const [profs, setProfs] = useState<Prof[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [slots, setSlots] = useState<SlotAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'profs' | 'slots'>('profs');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [pickingSlot, setPickingSlot] = useState<string | null>(null);
  const [profSearch, setProfSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'rank' | 'hours'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const fileRef = useRef<HTMLInputElement>(null);
  const ACADEMIC_YEAR = '2026-2027';

  // ── تحميل البيانات الأساسية من Supabase ──
  async function loadBaseData() {
    setLoading(true);
    const [{ data: profData }, { data: modData }, { data: lsData }] = await Promise.all([
      supabase.from('professors').select('id, last_name, first_name, rank, max_weekly_hours').order('last_name'),
      supabase.from('modules').select('id, name_ar, level_id, has_lectures, has_td, weekly_sessions, level:levels(name_ar, code)').eq('semester', 1).eq('is_active', true).order('display_order'),
      supabase.from('level_semesters').select('level_id, num_sections, num_groups').eq('semester', 1),
    ]);

    if (profData) {
      setProfs(profData.map(p => ({
        id: p.id,
        name: `${p.last_name} ${p.first_name}`,
        rank: p.rank,
        max_hours: p.max_weekly_hours || 9,
      })));
    }

    if (modData && lsData) {
      const lsMap = new Map(lsData.map(ls => [ls.level_id, ls]));
      setModules(modData.map((m: any) => {
        const ls = lsMap.get(m.level_id);
        return {
          id: m.id,
          name_ar: m.name_ar,
          level_id: m.level_id,
          level_name: m.level?.name_ar || '—',
          level_code: m.level?.code || '',
          has_lectures: m.has_lectures,
          has_td: m.has_td,
          weekly_sessions: m.weekly_sessions || 1,
          num_sections: ls?.num_sections || 1,
          num_groups: ls?.num_groups || 1,
        };
      }));
    }

    setLoading(false);
    setLoaded(true);
  }

  // ── استيراد Excel ──
  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || modules.length === 0 || profs.length === 0) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const newSlots: SlotAssignment[] = [];
      const usedLecSlots = new Map<string, number>(); // module_id -> عدد مجموعات المحاضرة المُستخدَمة

      for (const row of raw.slice(1)) {
        const profNameRaw = String(row[0] || '').trim();
        const semesterStr = String(row[4] || '').trim();
        if (semesterStr !== 'السداسي الأول') continue;

        const prof = profs.find(p =>
          p.name.replace(/\s+/g, '') === profNameRaw.replace(/\s+/g, '') ||
          profNameRaw.replace(/\s+/g, '').startsWith(p.name.replace(/\s+/g, '').substring(0, 6))
        );

        for (let i = 0; i < 5; i++) {
          const wish = String(row[5 + i * 3] || '').trim();
          const result = String(row[6 + i * 3] || '').trim();
          const tType = String(row[7 + i * 3] || '').trim() as 'محاضرة' | 'أعمال موجهة';

          if (result !== 'لبيت الرغبة' || !wish) continue;

          const match = wish.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
          if (!match) continue;
          const modName = match[1].trim().replace(/^\(/, '').trim();
          const levelName = match[2].trim();

          const mod = modules.find(m => {
            const mNorm = m.name_ar.replace(/[\s()]/g, '');
            const wNorm = modName.replace(/[\s()]/g, '');
            const lNorm = m.level_name.replace(/\s+/g, '');
            const lSearch = levelName.replace(/\s+/g, '').substring(0, 5);
            return (mNorm.includes(wNorm.substring(0, 8)) || wNorm.includes(mNorm.substring(0, 8)))
              && lNorm.includes(lSearch);
          });

          if (!mod) continue;

          if (tType === 'محاضرة') {
            // قاعدة صارمة: أستاذ واحد = مجموعة محاضرة واحدة فقط
            const alreadyHasLecture = newSlots.some(s =>
              s.module_id === mod.id &&
              s.teaching_type === 'محاضرة' &&
              s.professor_id === (prof?.id || null) &&
              s.professor_name === (prof?.name || profNameRaw)
            );
            if (alreadyHasLecture) continue;

            const used = usedLecSlots.get(mod.id) || 0;
            if (used >= mod.num_sections) continue;

            newSlots.push({
              module_id: mod.id,
              module_name: mod.name_ar,
              level_name: mod.level_name,
              professor_id: prof?.id || null,
              professor_name: prof?.name || profNameRaw,
              teaching_type: 'محاضرة',
              section: used + 1,
              group: null,
              weekly_hours: slotHours('محاضرة', mod.weekly_sessions),
              wish_order: i + 1,
              from_excel: true,
            });
            usedLecSlots.set(mod.id, used + 1);

          } else {
            // TD: فوج واحد فقط لكل أستاذ في نفس المقياس
            const alreadyHasTD = newSlots.some(s =>
              s.module_id === mod.id &&
              s.teaching_type === 'أعمال موجهة' &&
              s.professor_id === (prof?.id || null) &&
              s.professor_name === (prof?.name || profNameRaw)
            );
            if (alreadyHasTD) continue;

            for (let s = 1; s <= mod.num_sections; s++) {
              let assigned = false;
              for (let g = 1; g <= mod.num_groups && !assigned; g++) {
                const taken = newSlots.some(sl =>
                  sl.module_id === mod.id && sl.teaching_type === 'أعمال موجهة' &&
                  sl.section === s && sl.group === g
                );
                if (!taken) {
                  newSlots.push({
                    module_id: mod.id,
                    module_name: mod.name_ar,
                    level_name: mod.level_name,
                    professor_id: prof?.id || null,
                    professor_name: prof?.name || profNameRaw,
                    teaching_type: 'أعمال موجهة',
                    section: s,
                    group: g,
                    weekly_hours: 1.5,
                    wish_order: i + 1,
                    from_excel: true,
                  });
                  assigned = true;
                }
              }
              if (assigned) break;
            }
          }
        }
      }

      setSlots(newSlots);
      setMessage({ type: 'success', text: `تم استيراد ${newSlots.length} إسناداً من Excel` });
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  // ── تعيين أستاذ لـ slot ──
  function assignProf(slotKey: string, profId: string | null) {
    const [modId, type, sec, grp] = slotKey.split('__');
    setSlots(prev => {
      const exists = prev.find(s =>
        s.module_id === modId && s.teaching_type === type &&
        s.section === Number(sec) && String(s.group) === grp
      );
      const prof = profs.find(p => p.id === profId);
      const mod = modules.find(m => m.id === modId);
      if (exists) {
        if (profId === null) {
          return prev.filter(s => !(
            s.module_id === modId && s.teaching_type === type &&
            s.section === Number(sec) && String(s.group) === grp
          ));
        }
        return prev.map(s =>
          s.module_id === modId && s.teaching_type === type &&
          s.section === Number(sec) && String(s.group) === grp
            ? { ...s, professor_id: profId, professor_name: prof?.name || '' }
            : s
        );
      } else if (profId) {
        return [...prev, {
          module_id: modId,
          module_name: mod?.name_ar || '',
          level_name: mod?.level_name || '',
          professor_id: profId,
          professor_name: prof?.name || '',
          teaching_type: type as 'محاضرة' | 'أعمال موجهة',
          section: Number(sec),
          group: grp === 'null' ? null : Number(grp),
          weekly_hours: slotHours(type, mod?.weekly_sessions || 1),
        }];
      }
      return prev;
    });
    setPickingSlot(null);
  }

  // ── حفظ نهائي ──
  async function saveToDB() {
    setSaving(true);
    setMessage(null);

    await supabase.from('assignments').delete()
      .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1);

    const toInsert = slots
      .filter(s => s.professor_id)
      .map(s => ({
        professor_id: s.professor_id,
        module_id: s.module_id,
        level_id: modules.find(m => m.id === s.module_id)?.level_id,
        academic_year: ACADEMIC_YEAR,
        semester: 1,
        teaching_type: s.teaching_type,
        section_number: s.section,
        group_number: s.group,
        weekly_hours: s.weekly_hours,
        wish_order_satisfied: s.wish_order || 0,
        status: 'مؤقت',
        conflict_resolved: false,
        score: null,
      }));

    const { error } = await supabase.from('assignments').insert(toInsert);
    if (error) {
      setMessage({ type: 'error', text: 'خطأ في الحفظ: ' + error.message });
    } else {
      setSavedCount(toInsert.length);
      setMessage({ type: 'success', text: `تم حفظ ${toArabicNum(toInsert.length)} إسناداً — مؤقت (غير معلَن للأساتذة بعد)` });
    }
    setSaving(false);
  }

  function toggleSort(key: 'name' | 'rank' | 'hours') {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: 'name' | 'rank' | 'hours' }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-gray-300 inline mr-1" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-[#1a3a6b] inline mr-1" />
      : <ArrowDown className="w-3 h-3 text-[#1a3a6b] inline mr-1" />;
  }

  // ── إعلان النتائج ──
  async function announceResults() {
    if (!window.confirm('سيتم إعلان نتائج الإسناد لجميع الأساتذة. هل أنت متأكد؟')) return;
    setAnnouncing(true);
    const { error } = await supabase
      .from('assignments')
      .update({ status: 'نهائي' })
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', 1)
      .eq('status', 'مؤقت');
    if (error) {
      setMessage({ type: 'error', text: 'خطأ في الإعلان: ' + error.message });
    } else {
      setMessage({ type: 'success', text: '✓ تم إعلان النتائج للأساتذة بنجاح' });
      setSavedCount(0);
    }
    setAnnouncing(false);
  }

  // ── تجميع المستويات ──
  const levelGroups = Array.from(new Set(modules.map(m => m.level_name))).map(lvl => ({
    name: lvl,
    modules: modules.filter(m => m.level_name === lvl),
  }));

  // ════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════
  if (!loaded) return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">لوحة الإسناد التفاعلية</h2>
        <p className="text-gray-500 text-sm mt-1">استيراد الإسناد اليدوي من Excel مع إمكانية التعديل الكاملة</p>
      </div>
      <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-sm">
        <BookOpen className="w-14 h-14 text-[#1a3a6b]/20 mx-auto mb-4" />
        <p className="text-gray-600 font-medium mb-6">ابدأ بتحميل بيانات المقاييس والأساتذة من قاعدة البيانات</p>
        <button onClick={loadBaseData} disabled={loading}
          className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-3 rounded-xl font-bold mx-auto hover:bg-[#0d2040] transition-colors disabled:opacity-50">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
          {loading ? 'جارٍ التحميل...' : 'تحميل البيانات'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">لوحة الإسناد التفاعلية — السداسي الأول</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {toArabicNum(slots.filter(s => s.professor_id).length)} إسناد محدَّد
            {' · '}
            {toArabicNum(profs.length)} أستاذ
            {' · '}
            {toArabicNum(modules.length)} مقياس
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
            <Upload className="w-4 h-4" /> استيراد Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcel} className="hidden" />
          <button onClick={saveToDB} disabled={saving || slots.length === 0}
            className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
            <Save className="w-4 h-4" />
            {saving ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الإسناد'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('profs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'profs' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
          <Users className="w-4 h-4" /> الأساتذة
        </button>
        <button onClick={() => setTab('slots')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'slots' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
          <BookOpen className="w-4 h-4" /> المقاييس والـ Slots
        </button>
      </div>

      {/* ═══ TAB: الأساتذة ═══ */}
      {tab === 'profs' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-[#1a3a6b]" onClick={() => toggleSort('name')}><SortIcon col="name" />الأستاذ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-[#1a3a6b]" onClick={() => toggleSort('rank')}><SortIcon col="rank" />الرتبة</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-[#1a3a6b]" onClick={() => toggleSort('hours')}><SortIcon col="hours" />الحجم الساعي</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المقاييس المُسنَدة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...profs].sort((a, b) => {
                  let av: any, bv: any;
                  if (sortKey === 'name') { av = a.name; bv = b.name; }
                  else if (sortKey === 'rank') { av = a.rank; bv = b.rank; }
                  else { av = profHours(slots, a.id); bv = profHours(slots, b.id); }
                  if (av < bv) return sortDir === 'asc' ? -1 : 1;
                  if (av > bv) return sortDir === 'asc' ? 1 : -1;
                  return 0;
                }).map(prof => {
                  const hours = profHours(slots, prof.id);
                  const pct = Math.min((hours / prof.max_hours) * 100, 100);
                  const profSlots = slots.filter(s => s.professor_id === prof.id);
                  const isOver = hours > prof.max_hours;
                  return (
                    <tr key={prof.id} className={isOver ? 'bg-red-50/30' : ''}>
                      <td className="px-4 py-3 font-medium text-gray-800">{prof.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{prof.rank.replace('أستاذ ', 'أ. ')}</td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${isOver ? 'bg-red-500' : hours >= prof.max_hours ? 'bg-green-500' : 'bg-[#1a3a6b]'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs font-bold whitespace-nowrap ${isOver ? 'text-red-600' : hours >= prof.max_hours ? 'text-green-600' : 'text-gray-600'}`}>
                            {hours.toFixed(2)}/{prof.max_hours}س
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {profSlots.map((s, i) => (
                            <span key={i} className="flex items-center gap-1 text-xs bg-[#1a3a6b]/08 text-[#1a3a6b] px-2 py-1 rounded-full">
                              {s.module_name}
                              <span className="text-[#c9a227]">
  {s.teaching_type === 'محاضرة' ? `م${s.section}` : `ف${s.group}`}{s.wish_order ? ` (ر${s.wish_order})` : ''}
                              </span>
                              {s.wish_order && <span className="text-gray-400">(ر{s.wish_order})</span>}
                              <button onClick={() => assignProf(`${s.module_id}__${s.teaching_type}__${s.section}__${s.group}`, null)}
                                className="text-gray-400 hover:text-red-500 transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          {profSlots.length === 0 && (
                            <span className="text-xs text-gray-300">لا إسناد بعد</span>
                          )}
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

      {/* ═══ TAB: المقاييس والـ Slots ═══ */}
      {tab === 'slots' && (
        <div className="space-y-3">
          {levelGroups.map(lvl => {
            const isExp = expandedLevel === lvl.name;
            return (
              <div key={lvl.name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button onClick={() => setExpandedLevel(isExp ? null : lvl.name)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-right">
                  <div className="flex items-center gap-3">
                    <span className="font-display font-bold text-gray-800">{lvl.name}</span>
                    <span className="text-xs bg-[#1a3a6b]/08 text-[#1a3a6b] px-2 py-0.5 rounded-full">
                      {toArabicNum(lvl.modules.length)} مقياس
                    </span>
                  </div>
                  {isExp ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {isExp && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {lvl.modules.map(mod => {
                      // بناء خلايا المحاضرات
                      const lectureCells = mod.has_lectures
                        ? Array.from({ length: mod.num_sections }, (_, i) => i + 1).map(sec => {
                            const key = `${mod.id}__محاضرة__${sec}__null`;
                            const assigned = slots.find(s =>
                              s.module_id === mod.id && s.teaching_type === 'محاضرة' && s.section === sec
                            );
                            return { key, sec, group: null, assigned };
                          })
                        : [];

                      // بناء خلايا الأعمال الموجهة
                      const tdCells = mod.has_td
                        ? Array.from({ length: mod.num_sections }, (_, i) => i + 1).flatMap(sec =>
                            Array.from({ length: mod.num_groups }, (_, j) => j + 1).map(grp => {
                              const key = `${mod.id}__أعمال موجهة__${sec}__${grp}`;
                              const assigned = slots.find(s =>
                                s.module_id === mod.id && s.teaching_type === 'أعمال موجهة' &&
                                s.section === sec && s.group === grp
                              );
                              return { key, sec, group: grp, assigned };
                            })
                          )
                        : [];

                      return (
                        <div key={mod.id} className="border border-gray-100 rounded-xl p-3 space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800 text-sm">{mod.name_ar}</span>
                            {mod.weekly_sessions > 1 && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">×{mod.weekly_sessions} أسبوعياً</span>
                            )}
                          </div>

                          {/* محاضرات */}
                          {lectureCells.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1.5">محاضرات ({toArabicNum(lectureCells.length)} مجموعة)</p>
                              <div className="flex flex-wrap gap-2">
                                {lectureCells.map(cell => (
                                  <div key={cell.key} className="relative">
                                    {cell.assigned ? (
                                      <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-xl text-xs">
                                        <span className="text-gray-400">م{cell.sec}</span>
                                        <span className="font-medium">{cell.assigned.professor_name}</span>
                                        <span className="text-green-600">{cell.assigned.weekly_hours}س</span>
                                        <button onClick={() => assignProf(cell.key, null)} className="text-gray-300 hover:text-red-500 mr-1">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setPickingSlot(pickingSlot === cell.key ? null : cell.key)}
                                        className="flex items-center gap-1.5 bg-gray-50 border-2 border-dashed border-gray-200 hover:border-[#1a3a6b] text-gray-400 hover:text-[#1a3a6b] px-3 py-2 rounded-xl text-xs transition-all">
                                        <span>م{cell.sec}</span>
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                    {pickingSlot === cell.key && (
                                      <div className="absolute top-full mt-1 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px]" style={{zIndex:100}}>
                                        <div className="p-2 border-b border-gray-100">
                                          <input autoFocus type="text" placeholder="ابحث عن أستاذ..." value={profSearch}
                                            onChange={e => setProfSearch(e.target.value)}
                                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a3a6b]" dir="rtl" />
                                        </div>
                                        <div className="max-h-52 overflow-y-auto p-1">
                                          {profs.filter(p => p.name.includes(profSearch)).map(p => (
                                            <button key={p.id} onClick={() => { assignProf(cell.key, p.id); setProfSearch(''); }}
                                              className="w-full text-right px-3 py-1.5 text-xs hover:bg-[#1a3a6b]/05 rounded-lg flex items-center justify-between">
                                              <span>{p.name}</span>
                                              <span className="text-gray-400">{profHours(slots, p.id).toFixed(2)}/{p.max_hours}س</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* أعمال موجهة */}
                          {tdCells.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1.5">أعمال موجهة ({toArabicNum(tdCells.length)} فوج)</p>
                              <div className="flex flex-wrap gap-2">
                                {tdCells.map(cell => (
                                  <div key={cell.key} className="relative">
                                    {cell.assigned ? (
                                      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-xl text-xs">
                                        <span className="text-gray-400">ف{cell.group}</span>
                                        <span className="font-medium">{cell.assigned.professor_name}</span>
                                        <button onClick={() => assignProf(cell.key, null)} className="text-gray-300 hover:text-red-500 mr-1">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setPickingSlot(pickingSlot === cell.key ? null : cell.key)}
                                        className="flex items-center gap-1.5 bg-gray-50 border-2 border-dashed border-gray-200 hover:border-[#c9a227] text-gray-400 hover:text-[#c9a227] px-3 py-2 rounded-xl text-xs transition-all">
                                        <span>م{cell.sec}-ف{cell.group}</span>
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    )}
                                    {pickingSlot === cell.key && (
                                      <div className="absolute top-full mt-1 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px]" style={{zIndex:100}}>
                                        <div className="p-2 border-b border-gray-100">
                                          <input autoFocus type="text" placeholder="ابحث عن أستاذ..." value={profSearch}
                                            onChange={e => setProfSearch(e.target.value)}
                                            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#c9a227]" dir="rtl" />
                                        </div>
                                        <div className="max-h-52 overflow-y-auto p-1">
                                          {profs.filter(p => p.name.includes(profSearch)).map(p => (
                                            <button key={p.id} onClick={() => { assignProf(cell.key, p.id); setProfSearch(''); }}
                                              className="w-full text-right px-3 py-1.5 text-xs hover:bg-[#c9a227]/05 rounded-lg flex items-center justify-between">
                                              <span>{p.name}</span>
                                              <span className="text-gray-400">{profHours(slots, p.id).toFixed(2)}/{p.max_hours}س</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
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
      )}
    </div>
  );
}
