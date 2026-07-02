import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum, toArabicFixed } from '../../lib/utils';
import type { Professor, Wish, Module, Level } from '../../types';
import {
  Search, Download, BarChart2, Users, BookOpen,
  AlertTriangle, Filter, ChevronDown, ChevronUp,
  CheckCircle, Clock, Info, Star
} from 'lucide-react';

function exportCSV(rows: (string|number)[][], filename: string) {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map(r =>
    r.map(c => {
      const s = String(c);
      return s.includes(',') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(',')
  ).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = filename;
  a.click();
}

interface WishFull extends Wish {
  professor?: Professor;
  module?: Module;
  level?: Level;
}

type ViewMode = 'by_prof' | 'by_module' | 'table' | 'conflicts' | 'stats';

const RANK_SCORE: Record<string, number> = {
  'أستاذ التعليم العالي': 5,
  'أستاذ محاضر - أ': 4,
  'أستاذ محاضر - ب': 3,
  'أستاذ مساعد - أ': 2,
  'أستاذ مساعد - ب': 1,
};

interface WishesViewerProps {
  allowedLevelCodes?: string[] | null;
}

export default function AdminWishesViewerPage({ allowedLevelCodes }: WishesViewerProps) {
  const [wishes, setWishes] = useState<WishFull[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [levelSemesters, setLevelSemesters] = useState<{level_id: string; semester: number; num_sections: number; num_groups: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('by_prof');
  const [semFilter, setSemFilter] = useState<0|1|2>(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [lockFilter, setLockFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedProf, setExpandedProf] = useState<string|null>(null);
  const [expandedMod, setExpandedMod] = useState<string|null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: ws }, { data: profs }, { data: ls }] = await Promise.all([
      supabase.from('wishes')
        .select(`*, professor:professors(*), module:modules(*), level:levels(*)`)
        .eq('academic_year', '2026-2027')
        .order('wish_order'),
      supabase.from('professors').select('*').eq('is_active', true),
      supabase.from('level_semesters').select('level_id, semester, num_sections, num_groups'),
    ]);
    if (ws) {
      const filteredWs = allowedLevelCodes
        ? ws.filter((w: WishFull) => w.level?.code && allowedLevelCodes.includes(w.level.code))
        : ws;
      setWishes(filteredWs);
    }
    if (profs) setProfessors(profs);
    if (ls) setLevelSemesters(ls);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return wishes.filter(w => {
      const prof = w.professor;
      if (semFilter !== 0 && w.semester !== semFilter) return false;
      if (typeFilter && w.teaching_type !== typeFilter) return false;
      if (rankFilter && prof?.rank !== rankFilter) return false;
      if (lockFilter === 'locked' && !prof?.wishes_locked_s2) return false;
      if (lockFilter === 'pending' && prof?.wishes_locked_s2) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${prof?.last_name} ${prof?.first_name} ${w.module?.name_ar} ${w.level?.name_ar}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [wishes, semFilter, typeFilter, rankFilter, lockFilter, search]);

  const conflicts = useMemo(() => {
    // تجميع الرغبات حسب (مقياس + نوع تدريس + رقم الرغبة + سداسي)
    const groups = new Map<string, WishFull[]>();
    wishes.forEach(w => {
      const key = `${w.module_id}|${w.teaching_type}|${w.wish_order}|${w.semester}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(w);
    });

    const found: { w1: WishFull; w2: WishFull; key: string }[] = [];

    for (const [key, group] of groups) {
      if (group.length <= 1) continue;

      // احسب الطاقة الاستيعابية الفعلية لهذا المقياس
      const levelId = group[0].level_id;
      const sem = group[0].semester;
      const teachingType = group[0].teaching_type;
      const ls = levelSemesters.find(x => x.level_id === levelId && x.semester === sem);

      let capacity = 1;
      if (ls) {
        capacity = teachingType === 'محاضرة' ? ls.num_sections : ls.num_sections * ls.num_groups;
      }

      // التصادم الحقيقي فقط إذا كان عدد الطالبين > الطاقة الاستيعابية
      if (group.length > capacity) {
        group.forEach((w1, i) => {
          group.slice(i + 1).forEach(w2 => {
            if (!found.some(f => f.key === key &&
              ((f.w1.professor_id === w1.professor_id && f.w2.professor_id === w2.professor_id) ||
               (f.w1.professor_id === w2.professor_id && f.w2.professor_id === w1.professor_id)))) {
              found.push({ w1, w2, key });
            }
          });
        });
      }
    }
    return found;
  }, [wishes, levelSemesters]);

  const stats = useMemo(() => {
    const modCount: Record<string, { name: string; type: string; count: number }> = {};
    wishes.forEach(w => {
      const k = `${w.module?.name_ar}|${w.teaching_type}`;
      if (!modCount[k]) modCount[k] = { name: w.module?.name_ar || '', type: w.teaching_type, count: 0 };
      modCount[k].count++;
    });
    const topModules = Object.values(modCount).sort((a, b) => b.count - a.count).slice(0, 10);
    return { topModules };
  }, [wishes]);

  const moduleGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: { key: string; modName: string; level: string; sem: number; type: string; ws: WishFull[] }[] = [];
    filtered.forEach(w => {
      const key = `${w.module_id}|${w.teaching_type}|${w.semester}`;
      if (!seen.has(key)) {
        seen.add(key);
        const ws = filtered.filter(x => x.module_id === w.module_id && x.teaching_type === w.teaching_type && x.semester === w.semester).sort((a,b)=>a.wish_order-b.wish_order);
        groups.push({ key, modName: w.module?.name_ar||'', level: w.level?.name_ar||'', sem: w.semester, type: w.teaching_type, ws });
      }
    });
    return groups.sort((a,b)=>a.modName.localeCompare(b.modName,'ar'));
  }, [filtered]);

  const profGroups = useMemo(() => {
    return professors.filter(prof => {
      if (lockFilter==='locked' && !prof.wishes_locked_s2) return false;
      if (lockFilter==='pending' && prof.wishes_locked_s2) return false;
      if (rankFilter && prof.rank!==rankFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${prof.last_name} ${prof.first_name}`.toLowerCase().includes(s)) return false;
      }
      return wishes.some(w => w.professor_id === prof.id);
    });
  }, [professors, wishes, lockFilter, rankFilter, search]);

  const wishBadge = (n: number) => ({
    width: 26, height: 26, borderRadius: 7, display: 'inline-flex' as const,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    fontSize: 11, fontWeight: 800, flexShrink: 0 as const,
    background: n===1?'#1a3a6b':n===2?'#c9a227':n===3?'#6366f1':n===4?'#10b981':'#e5e7eb',
    color: n<=4?'white':'#475569',
  });

  // ── كل الـ hooks قبل أي return ──
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-[#1a3a6b] border-t-transparent rounded-full" />
    </div>
  );

  const lockedProfs = professors.filter(p => p.wishes_locked_s2).length;
  const pendingProfs = professors.filter(p => !p.wishes_locked_s2 && wishes.some(w => w.professor_id === p.id)).length;

  function exportFull() {
    const header = ['الأستاذ','الرتبة','التخصص','السداسي','رقم الرغبة','المستوى','المقياس','نوع التدريس','الساعات','درّسه سابقاً','السنوات','حالة الأستاذ'];
    const rows = filtered.map(w => {
      const prof = w.professor;
      return [
        `${prof?.last_name} ${prof?.first_name}`,
        prof?.rank || '',
        prof?.degree_speciality || '',
        `السداسي ${w.semester === 1 ? 'الأول' : 'الثاني'}`,
        `الرغبة ${w.wish_order}`,
        w.level?.name_ar || '',
        w.module?.name_ar || '',
        w.teaching_type,
        w.teaching_type === 'محاضرة' ? '2.25' : '1.50',
        w.taught_before ? 'نعم' : 'لا',
        (w.previous_years || []).join(' / ') || '—',
        prof?.wishes_locked_s2 ? 'مقفل' : 'قيد الإدخال',
      ];
    });
    exportCSV([header, ...rows], `رغبات_الكاملة_2026-2027.csv`);
  }

  function exportByProf() {
    const header = ['الأستاذ','الرتبة','الخبرة','السداسي','الرغبة 1','ن1','الرغبة 2','ن2','الرغبة 3','ن3','الرغبة 4','ن4','الرغبة 5','ن5'];
    const rows: (string|number)[][] = [];
    professors.forEach(prof => {
      [1, 2].forEach(sem => {
        const ws = wishes.filter(w => w.professor_id === prof.id && w.semester === sem).sort((a,b)=>a.wish_order-b.wish_order);
        if (ws.length === 0) return;
        const row: (string|number)[] = [
          `${prof.last_name} ${prof.first_name}`,
          prof.rank,
          prof.professional_experience,
          `السداسي ${sem===1?'الأول':'الثاني'}`,
        ];
        for (let i = 1; i <= 5; i++) {
          const w = ws.find(x => x.wish_order === i);
          row.push(w ? `${w.module?.name_ar} (${w.level?.name_ar})` : '—');
          row.push(w ? w.teaching_type : '—');
        }
        rows.push(row);
      });
    });
    exportCSV([header, ...rows], `رغبات_حسب_الأستاذ_2026-2027.csv`);
  }

  function exportByModule() {
    const header = ['المقياس','المستوى','السداسي','نوع التدريس','عدد الطلبات','الأساتذة بالترتيب'];
    const seen = new Set<string>();
    const rows: (string|number)[][] = [];
    wishes.forEach(w => {
      const k = `${w.module_id}|${w.teaching_type}|${w.semester}`;
      if (seen.has(k)) return;
      seen.add(k);
      const ws = wishes.filter(x => x.module_id === w.module_id && x.teaching_type === w.teaching_type && x.semester === w.semester).sort((a,b)=>a.wish_order-b.wish_order);
      const profsStr = ws.map(x => {
        const p = x.professor;
        return `${p?.last_name} ${p?.first_name} (رغبة ${x.wish_order} — ${p?.rank?.replace('أستاذ ','أ. ')})`;
      }).join(' | ');
      rows.push([w.module?.name_ar||'', w.level?.name_ar||'', `السداسي ${w.semester===1?'الأول':'الثاني'}`, w.teaching_type, ws.length, profsStr]);
    });
    exportCSV([header, ...rows], `رغبات_حسب_المقياس_2026-2027.csv`);
  }

  function exportConflicts() {
    const header = ['المقياس','النوع','السداسي','رقم الرغبة','الأستاذ الأول','رتبته','تخصصه','درّسه؟','الأستاذ الثاني','رتبته','تخصصه','درّسه؟'];
    const rows = conflicts.map(c => {
      const p1 = c.w1.professor; const p2 = c.w2.professor;
      return [
        c.w1.module?.name_ar||'', c.w1.teaching_type,
        `السداسي ${c.w1.semester===1?'الأول':'الثاني'}`, `الرغبة ${c.w1.wish_order}`,
        `${p1?.last_name} ${p1?.first_name}`, p1?.rank||'', p1?.degree_speciality||'', c.w1.taught_before?'نعم':'لا',
        `${p2?.last_name} ${p2?.first_name}`, p2?.rank||'', p2?.degree_speciality||'', c.w2.taught_before?'نعم':'لا',
      ];
    });
    exportCSV([header, ...rows], `التصادمات_المحتملة_2026-2027.csv`);
  }

  return (
    <div className="space-y-5 animate-fade-in pb-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-xl">استعراض الرغبات الخام</h2>
          <p className="text-gray-500 text-sm mt-1">
            {toArabicNum(wishes.length)} رغبة · {toArabicNum(filtered.length)} مطابق للفلاتر ·
            <span className="text-amber-600 font-semibold"> قبل أي إسناد أو خوارزمية</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportFull} className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium" style={{background:'linear-gradient(135deg,#16a34a,#15803d)'}}>
            <Download className="w-4 h-4" /> القائمة الكاملة
          </button>
          <button onClick={exportByProf} className="flex items-center gap-2 bg-[#1a3a6b]/10 text-[#1a3a6b] hover:bg-[#1a3a6b]/20 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Users className="w-4 h-4" /> حسب الأستاذ
          </button>
          <button onClick={exportByModule} className="flex items-center gap-2 bg-[#c9a227]/10 text-[#a07820] hover:bg-[#c9a227]/20 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <BookOpen className="w-4 h-4" /> حسب المقياس
          </button>
          {conflicts.length > 0 && (
            <button onClick={exportConflicts} className="flex items-center gap-2 bg-red-50 text-red-700 hover:bg-red-100 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
              <AlertTriangle className="w-4 h-4" /> التصادمات
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: 'إجمالي الرغبات', v: wishes.length, c: '#1a3a6b', bg: 'rgba(26,58,107,.08)', i: Star },
          { l: 'أساتذة سجّلوا', v: new Set(wishes.map(w=>w.professor_id)).size, c: '#059669', bg: 'rgba(5,150,105,.08)', i: Users },
          { l: 'أكملوا ومقفلون', v: lockedProfs, c: '#d97706', bg: 'rgba(217,119,6,.08)', i: CheckCircle },
          { l: 'قيد الإدخال', v: pendingProfs, c: '#7c3aed', bg: 'rgba(124,58,237,.08)', i: Clock },
          { l: 'تصادمات محتملة', v: conflicts.length, c: '#dc2626', bg: 'rgba(220,38,38,.07)', i: AlertTriangle, action: () => setViewMode('conflicts') },
        ].map(s => {
          const Icon = s.i;
          return (
            <div key={s.l} onClick={s.action}
              className={`bg-white rounded-xl p-3 border border-gray-100 shadow-sm transition-all ${s.action ? 'cursor-pointer hover:shadow-md' : ''}`}
              onMouseEnter={e => s.action && (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-display font-bold text-2xl" style={{ color: s.c }}>{s.v}</p>
                  <p className="text-gray-400 text-xs mt-1">{s.l}</p>
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: s.bg }}>
                  <Icon className="w-4 h-4" style={{ color: s.c }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs + Filters */}
      <div className="space-y-3">
        <div className="flex gap-2 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit flex-wrap">
          {[
            { id: 'by_prof', l: 'حسب الأستاذ', i: Users },
            { id: 'by_module', l: 'حسب المقياس', i: BookOpen },
            { id: 'table', l: 'جدول كامل', i: Filter },
            { id: 'conflicts', l: 'التصادمات', i: AlertTriangle, badge: conflicts.length },
            { id: 'stats', l: 'إحصاءات', i: BarChart2 },
          ].map(v => {
            const Icon = v.i;
            return (
              <button key={v.id} onClick={() => setViewMode(v.id as ViewMode)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ background: viewMode === v.id ? '#1a3a6b' : 'transparent', color: viewMode === v.id ? 'white' : '#64748b' }}>
                <Icon className="w-3.5 h-3.5" />
                {v.l}
                {v.badge !== undefined && v.badge > 0 && (
                  <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                    style={{ background: viewMode === v.id ? 'rgba(255,255,255,.3)' : '#dc2626', color: 'white' }}>
                    {v.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو المقياس..."
              className="w-full border border-gray-200 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none bg-white" />
          </div>
          {[
            { val: semFilter, set: (v: any) => setSemFilter((v === '0' ? 0 : parseInt(v)) as 0|1|2), opts: [['كل السداسيات','0'],['السداسي الأول','1'],['السداسي الثاني','2']] },
            { val: typeFilter, set: setTypeFilter, opts: [['كل الأنواع',''],['محاضرة','محاضرة'],['أعمال موجهة','أعمال موجهة']] },
            { val: rankFilter, set: setRankFilter, opts: [['كل الرتب',''],['أستاذ التعليم العالي','أستاذ التعليم العالي'],['أستاذ محاضر - أ','أستاذ محاضر - أ'],['أستاذ محاضر - ب','أستاذ محاضر - ب'],['أستاذ مساعد - أ','أستاذ مساعد - أ'],['أستاذ مساعد - ب','أستاذ مساعد - ب']] },
            { val: lockFilter, set: setLockFilter, opts: [['كل الحالات','all'],['مقفل ✓','locked'],['قيد الإدخال','pending']] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white text-gray-600">
              {f.opts.map(([l, v]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* VIEW: حسب الأستاذ */}
      {viewMode === 'by_prof' && (
        <div className="space-y-3">
          {profGroups.map(prof => {
            const profWishes = filtered.filter(w => w.professor_id === prof.id);
            const s1 = profWishes.filter(w => w.semester === 1).sort((a,b) => a.wish_order - b.wish_order);
            const s2 = profWishes.filter(w => w.semester === 2).sort((a,b) => a.wish_order - b.wish_order);
            const isExp = expandedProf === prof.id;
            const totalH = profWishes.reduce((a, w) => a + (w.teaching_type === 'محاضرة' ? 2.25 : 1.5), 0);
            return (
              <div key={prof.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <button onClick={() => setExpandedProf(isExp ? null : prof.id)}
                  className="w-full flex items-center gap-3 p-4 text-right hover:bg-gray-50/50 transition-colors">
                  <div className="w-11 h-11 rounded-xl bg-[#1a3a6b]/08 flex items-center justify-center font-display font-bold text-[#1a3a6b] text-sm flex-shrink-0">
                    {prof.last_name?.[0]}{prof.first_name?.[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-display font-bold text-gray-800">{prof.last_name} {prof.first_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a3a6b]/08 text-[#1a3a6b]">{prof.rank}</span>
                      <span className="text-xs text-gray-400">{prof.degree_speciality}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${prof.wishes_locked_s2 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {prof.wishes_locked_s2 ? '✓ مقفل' : '⏳ قيد الإدخال'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                      <span>{toArabicNum(profWishes.length)} رغبة إجمالاً</span>
                      <span>سداسي1: <strong className="text-[#1a3a6b]">{toArabicNum(s1.length)}</strong></span>
                      <span>سداسي2: <strong className="text-[#c9a227]">{toArabicNum(s2.length)}</strong></span>
                      <span>ساعات محتملة: <strong>{toArabicFixed(totalH)}س</strong></span>
                    </div>
                  </div>
                  {isExp ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>
                {isExp && (
                  <div className="border-t border-gray-100 p-4">
                    {[{ sem: 1, list: s1, col: '#1a3a6b' }, { sem: 2, list: s2, col: '#c9a227' }].map(({ sem, list, col }) =>
                      list.length > 0 && (
                        <div key={sem} className={sem === 1 && s2.length > 0 ? 'mb-5' : ''}>
                          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold font-display" style={{ background: col }}>{sem}</span>
                            <span className="font-display font-semibold text-gray-800 text-sm">السداسي {sem === 1 ? 'الأول' : 'الثاني'}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${col}18`, color: col }}>{toArabicNum(list.length)} رغبات</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {list.map(w => (
                              <div key={w.id} className="flex gap-3 items-start p-3 rounded-xl border transition-all hover:shadow-sm"
                                style={{ borderColor: w.wish_order === 1 ? col+'55' : w.wish_order === 2 ? col+'30' : '#e5e7eb', background: w.wish_order === 1 ? `${col}06` : '#fafafa' }}>
                                <div style={wishBadge(w.wish_order)} className="font-display mt-0.5">{w.wish_order}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-800 text-sm truncate">{w.module?.name_ar}</p>
                                  <div className="flex gap-1.5 mt-1 flex-wrap">
                                    <span className="text-xs px-1.5 py-0.5 rounded"
                                      style={{ background: w.teaching_type==='محاضرة'?'rgba(26,58,107,.1)':'rgba(201,162,39,.1)', color: w.teaching_type==='محاضرة'?'#1a3a6b':'#92400e' }}>
                                      {w.teaching_type}
                                    </span>
                                    <span className="text-xs text-gray-400 truncate">{w.level?.name_ar}</span>
                                  </div>
                                  {w.taught_before && <p className="text-xs text-green-600 mt-1">✓ {w.previous_years?.join(' · ')}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {profGroups.length === 0 && <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">لا توجد نتائج مطابقة</div>}
        </div>
      )}

      {/* VIEW: حسب المقياس */}
      {viewMode === 'by_module' && (
        <div className="space-y-3">
          {moduleGroups.map(g => {
            const isExp = expandedMod === g.key;
            const hasConflict = g.ws.some((w1, i) => g.ws.slice(i+1).some(w2 => w1.wish_order === w2.wish_order));
            return (
              <div key={g.key} className="bg-white rounded-2xl shadow-sm overflow-hidden"
                style={{ border: `1px solid ${hasConflict ? '#fde68a' : '#e8ecf3'}` }}>
                <button onClick={() => setExpandedMod(isExp ? null : g.key)}
                  className="w-full flex items-center gap-3 p-4 text-right hover:bg-gray-50/50 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: g.sem===1?'rgba(26,58,107,.08)':'rgba(201,162,39,.1)' }}>
                    <BookOpen className="w-5 h-5" style={{ color: g.sem===1?'#1a3a6b':'#c9a227' }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-display font-bold text-gray-800">{g.modName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: g.sem===1?'rgba(26,58,107,.09)':'rgba(201,162,39,.1)', color: g.sem===1?'#1a3a6b':'#92400e' }}>س{g.sem}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: g.type==='محاضرة'?'rgba(26,58,107,.06)':'rgba(201,162,39,.08)', color: g.type==='محاضرة'?'#1a3a6b':'#92400e' }}>{g.type}</span>
                      {hasConflict && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> تصادم محتمل</span>}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{g.level}</span>
                      <span><strong className="text-gray-700">{toArabicNum(g.ws.length)}</strong> أستاذ طلبه</span>
                    </div>
                  </div>
                  {isExp ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {isExp && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {['الرغبة','الأستاذ','الرتبة','التخصص','الخبرة','درّسه سابقاً','السنوات'].map(h => (
                            <th key={h} className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {g.ws.map((w, i) => {
                          const prof = w.professor;
                          const isConflict = g.ws.some((x, j) => j !== i && x.wish_order === w.wish_order);
                          return (
                            <tr key={w.id} style={{ background: isConflict ? '#fffbeb' : 'white' }}
                              onMouseEnter={e => e.currentTarget.style.background = isConflict?'#fef3c7':'#fafafa'}
                              onMouseLeave={e => e.currentTarget.style.background = isConflict?'#fffbeb':'white'}>
                              <td className="px-4 py-2.5"><div style={wishBadge(w.wish_order)} className="font-display">{w.wish_order}</div></td>
                              <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{prof?.last_name} {prof?.first_name}</td>
                              <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-[#1a3a6b]/08 text-[#1a3a6b] whitespace-nowrap">{prof?.rank?.replace('أستاذ ','أ. ')}</span></td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{prof?.degree_speciality}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-600 text-center">{prof?.professional_experience}س</td>
                              <td className="px-4 py-2.5 text-xs" style={{ color: w.taught_before?'#15803d':'#94a3b8' }}>{w.taught_before?'✓ نعم':'—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{w.previous_years?.join(' · ')||'—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW: جدول كامل */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <Filter className="w-4 h-4 text-[#1a3a6b]" />
            <span className="font-display font-semibold text-gray-800 text-sm">الجدول الكامل</span>
            <span className="text-gray-400 text-xs">{toArabicNum(filtered.length)} سطر</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['الأستاذ','الرتبة','س','الرغبة','المستوى','المقياس','نوع','ساعات','سابقاً','السنوات','الحالة'].map(h => (
                    <th key={h} className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((w, i) => {
                  const prof = w.professor;
                  const h = w.teaching_type==='محاضرة'?2.25:1.5;
                  return (
                    <tr key={w.id} style={{ background: i%2===0?'white':'#fafafa' }}
                      onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
                      onMouseLeave={e => e.currentTarget.style.background=i%2===0?'white':'#fafafa'}>
                      <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{prof?.last_name} {prof?.first_name}</td>
                      <td className="px-3 py-2.5"><span className="text-xs bg-[#1a3a6b]/08 text-[#1a3a6b] px-2 py-0.5 rounded-full whitespace-nowrap">{prof?.rank?.replace('أستاذ ','أ. ')}</span></td>
                      <td className="px-3 py-2.5"><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: w.semester===1?'rgba(26,58,107,.09)':'rgba(201,162,39,.1)', color: w.semester===1?'#1a3a6b':'#92400e' }}>س{w.semester}</span></td>
                      <td className="px-3 py-2.5"><div style={wishBadge(w.wish_order)} className="font-display">{w.wish_order}</div></td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{w.level?.name_ar}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{w.module?.name_ar}</td>
                      <td className="px-3 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: w.teaching_type==='محاضرة'?'rgba(26,58,107,.08)':'rgba(201,162,39,.09)', color: w.teaching_type==='محاضرة'?'#1a3a6b':'#92400e' }}>{w.teaching_type}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="font-display font-bold text-xs text-[#1a3a6b]">{h}س</span></td>
                      <td className="px-3 py-2.5 text-xs text-center" style={{ color: w.taught_before?'#15803d':'#94a3b8' }}>{w.taught_before?'✓':'—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{w.previous_years?.join(' · ')||'—'}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${prof?.wishes_locked_s2?'bg-green-50 text-green-700':'bg-amber-50 text-amber-700'}`}>{prof?.wishes_locked_s2?'✓ مقفل':'⏳ جارٍ'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">لا توجد نتائج</p>}
          </div>
        </div>
      )}

      {/* VIEW: التصادمات */}
      {viewMode === 'conflicts' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>التصادمات المحتملة</strong> — أساتذة طلبوا نفس المقياس بنفس النوع وبنفس رقم الرغبة.<br/>
              هذا يعني أن الخوارزمية ستستخدم المعايير لتحديد الأولوية.
            </div>
          </div>
          {conflicts.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-display font-bold text-green-700 text-lg mb-2">لا توجد تصادمات!</h3>
              <p className="text-gray-400 text-sm">كل الرغبات متمايزة في رقمها بالنسبة لنفس المقياس</p>
            </div>
          ) : (
            conflicts.map((conf, i) => {
              const p1 = conf.w1.professor; const p2 = conf.w2.professor;
              const p1Score = (RANK_SCORE[p1?.rank||'']||0)*30 + (conf.w1.taught_before?20:0) + (p1?.professional_experience||0)*0.5;
              const p2Score = (RANK_SCORE[p2?.rank||'']||0)*30 + (conf.w2.taught_before?20:0) + (p2?.professional_experience||0)*0.5;
              const winner = p1Score > p2Score ? 'p1' : p2Score > p1Score ? 'p2' : 'tie';
              return (
                <div key={i} className="bg-white rounded-2xl p-5 border-2 border-amber-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <div>
                      <span className="font-display font-bold text-gray-800">{conf.w1.module?.name_ar}</span>
                      <span className="text-gray-400 text-sm mr-2">({conf.w1.teaching_type}) — السداسي {conf.w1.semester===1?'الأول':'الثاني'} — الرغبة {conf.w1.wish_order}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                    {[{w:conf.w1,p:p1,score:p1Score,side:'p1'},{w:conf.w2,p:p2,score:p2Score,side:'p2'}].map(({w,p,score,side})=>(
                      <div key={side} className="rounded-xl p-4 border-2"
                        style={{ borderColor: winner===side?'#22c55e':winner==='tie'?'#f59e0b':'#e5e7eb', background: winner===side?'#f0fdf4':'#fafafa' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-display font-bold text-gray-800 text-sm">{p?.last_name} {p?.first_name}</span>
                          {winner===side && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">أولوية ↑</span>}
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div><span className="text-gray-400">الرتبة: </span>{p?.rank?.replace('أستاذ ','أ. ')}</div>
                          <div><span className="text-gray-400">التخصص: </span>{p?.degree_speciality}</div>
                          <div><span className="text-gray-400">الخبرة: </span>{p?.professional_experience} سنة</div>
                          <div><span className="text-gray-400">درّس سابقاً: </span>
                            <span style={{color:w.taught_before?'#15803d':'#94a3b8'}}>{w.taught_before?`✓ ${w.previous_years?.join(', ')}`:'—'}</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400">نقاط المعايير (تقريبي)</span>
                            <span className="font-display font-bold text-sm" style={{color:winner===side?'#15803d':'#475569'}}>{toArabicNum(score.toFixed(0))}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${Math.max(score,0)}%`,background:winner===side?'#22c55e':'#94a3b8'}} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center mx-auto mb-1">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      </div>
                      <p className="text-xs text-gray-400">تصادم</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-blue-50 rounded-lg px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    {winner==='tie'?'النقاط متساوية — الخوارزمية ستختار عشوائياً أو حسب وقت التسجيل'
                      :`بناءً على المعايير: ${winner==='p1'?p1?.last_name:p2?.last_name} ${winner==='p1'?p1?.first_name:p2?.first_name} سيحصل على هذا المقياس`}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW: إحصاءات */}
      {viewMode === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-display font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-[#c9a227]" /> أكثر المقاييس طلباً
            </h3>
            {stats.topModules.map((m, i) => (
              <div key={i} className="flex items-center gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-[#1a3a6b]/09 text-[#1a3a6b] text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{background:m.type==='محاضرة'?'rgba(26,58,107,.09)':'rgba(201,162,39,.1)',color:m.type==='محاضرة'?'#1a3a6b':'#92400e'}}>{m.type}</span>
                    </div>
                    <span className="font-display font-bold text-gray-700 text-sm flex-shrink-0 mr-2">{m.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{width:`${(m.count/(stats.topModules[0]?.count||1))*100}%`,background:'linear-gradient(90deg,#1a3a6b,#c9a227)'}} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-display font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1a3a6b]" /> توزيع الرغبات حسب الرتبة
            </h3>
            {['أستاذ التعليم العالي','أستاذ محاضر - أ','أستاذ محاضر - ب','أستاذ مساعد - أ','أستاذ مساعد - ب'].map(rank => {
              const profs = professors.filter(p => p.rank === rank);
              const count = wishes.filter(w => profs.some(p => p.id === w.professor_id)).length;
              const colors: Record<string,string> = {'أستاذ التعليم العالي':'#1a3a6b','أستاذ محاضر - أ':'#0d9488','أستاذ محاضر - ب':'#6366f1','أستاذ مساعد - أ':'#f59e0b','أستاذ مساعد - ب':'#ef4444'};
              const c = colors[rank];
              if (count === 0) return null;
              return (
                <div key={rank} className="flex items-center gap-3 mb-3">
                  <div className="w-1 h-9 rounded-full flex-shrink-0" style={{background:c}} />
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600">{rank.replace('أستاذ ','أ. ')}</span>
                      <span className="font-display font-bold text-xs" style={{color:c}}>{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${(count/wishes.length)*100}%`,background:c}} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-display font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#6366f1]" /> توزيع حسب السداسي والنوع
            </h3>
            {[{sem:1,col:'#1a3a6b'},{sem:2,col:'#c9a227'}].map(({sem,col})=>{
              const lect = wishes.filter(w=>w.semester===sem&&w.teaching_type==='محاضرة').length;
              const td = wishes.filter(w=>w.semester===sem&&w.teaching_type==='أعمال موجهة').length;
              return (
                <div key={sem} className="mb-4">
                  <p className="font-display font-bold text-sm mb-2" style={{color:col}}>السداسي {sem===1?'الأول':'الثاني'} — {lect+td} رغبة</p>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-xl p-3 text-center" style={{background:col,color:'white'}}>
                      <p className="font-display font-bold text-xl">{lect}</p>
                      <p className="text-xs opacity-80">محاضرة</p>
                    </div>
                    <div className="flex-1 rounded-xl p-3 text-center border-2" style={{borderColor:col,color:col}}>
                      <p className="font-display font-bold text-xl">{td}</p>
                      <p className="text-xs">أعمال موجهة</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-display font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#059669]" /> حالة التسجيل لكل أستاذ
            </h3>
            <div className="space-y-2">
              {professors.map(prof => {
                const count = wishes.filter(w=>w.professor_id===prof.id).length;
                const s1 = wishes.filter(w=>w.professor_id===prof.id&&w.semester===1).length;
                const s2 = wishes.filter(w=>w.professor_id===prof.id&&w.semester===2).length;
                return (
                  <div key={prof.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:prof.wishes_locked_s2?'#22c55e':'#f59e0b'}} />
                    <span className="flex-1 text-sm text-gray-800 font-medium truncate">{prof.last_name} {prof.first_name}</span>
                    <span className="text-xs text-gray-400">سداسي1:{s1} · سداسي2:{s2}</span>
                    <span className="font-display font-bold text-xs text-[#1a3a6b] w-10 text-center">{count}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${prof.wishes_locked_s2?'bg-green-50 text-green-700':'bg-amber-50 text-amber-700'}`}>
                      {prof.wishes_locked_s2?'✓':'⏳'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}