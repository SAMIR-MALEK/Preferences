// v18-09-2026
import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import * as XLSX from 'xlsx';
import {
  Upload, Save, CheckCircle, AlertCircle, Users, BookOpen,
  ChevronDown, ChevronUp, X, Plus, RefreshCw,
  ArrowUpDown, ArrowUp, ArrowDown, Megaphone, Bell, ThumbsUp, ThumbsDown
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
  const [requests, setRequests] = useState<AssignmentRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [requestsTab, setRequestsTab] = useState<'requests' | 'appeals'>('requests');
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const [selectedProfIds, setSelectedProfIds] = useState<Set<string>>(new Set());
  const [announceSearch, setAnnounceSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const ACADEMIC_YEAR = '2026-2027';

interface Appeal {
  id: string;
  professor_name: string;
  appeal_type: string;
  wish_order?: number;
  wish_orders?: number[];
  assignment_ids?: string[];
  module_name?: string;
  reason: string;
  status: string;
  admin_reply: string;
  created_at: string;
}

interface AssignmentRequest {
  id: string;
  professor_id: string;
  professor_name: string;
  module_id: string;
  module_name: string;
  level_name: string;
  teaching_type: string;
  weekly_hours: number;
  status: string;
  created_at: string;
}

  // ── تحميل البيانات الأساسية من Supabase ──
  async function loadBaseData() {
    setLoading(true);
    const [{ data: profData }, { data: modData }, { data: lsData }] = await Promise.all([
      supabase.from('professors').select('id, last_name, first_name, rank, max_weekly_hours').order('last_name'),
      supabase.from('modules').select('id, name_ar, level_id, has_lectures, has_td, weekly_sessions, level:levels(name_ar, code)').eq('semester', 1).eq('is_active', true).order('display_order'),
      supabase.from('level_semesters').select('level_id, num_sections, num_groups').eq('semester', 1),
    ]);

    const localProfs: Prof[] = profData ? profData.map((p: any) => ({
      id: p.id,
      name: p.last_name + ' ' + p.first_name,
      rank: p.rank,
      max_hours: p.max_weekly_hours || 9,
    })) : [];
    setProfs(localProfs);

    const lsMap = new Map((lsData || []).map((ls: any) => [ls.level_id, ls]));
    const localModules: ModuleInfo[] = modData ? modData.map((m: any) => {
      const ls = lsMap.get(m.level_id) as any;
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
    }) : [];
    setModules(localModules);

    // تحميل الإسنادات المؤقتة
    const { data: existing } = await supabase
      .from('assignments')
      .select('professor_id, module_id, level_id, teaching_type, section_number, group_number, weekly_hours, wish_order_satisfied')
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', 1)
      .in('status', ['مؤقت', 'نهائي']);

    if (existing && existing.length > 0) {
      const mMap = new Map(localModules.map((m: ModuleInfo) => [m.id, m]));
      const pMap = new Map(localProfs.map((p: Prof) => [p.id, p]));
      const loadedSlots: SlotAssignment[] = existing.map((a: any) => {
        const mod = mMap.get(a.module_id);
        const prof = pMap.get(a.professor_id);
        return {
          module_id: a.module_id,
          module_name: mod?.name_ar || a.module_id,
          level_name: mod?.level_name || '—',
          professor_id: a.professor_id,
          professor_name: prof?.name || '—',
          teaching_type: a.teaching_type,
          section: a.section_number,
          group: a.group_number,
          weekly_hours: a.weekly_hours,
          wish_order: a.wish_order_satisfied,
        };
      });
      setSlots(loadedSlots);
      setSavedCount(loadedSlots.length);
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
        // دعم الهيكلين: القديم (col 4) والجديد (col 3)
        const semesterStr = String(row[3] || row[4] || '').trim();
        if (semesterStr !== 'السداسي الأول') continue;

        const prof = profs.find(p =>
          p.name.replace(/\s+/g, '') === profNameRaw.replace(/\s+/g, '') ||
          profNameRaw.replace(/\s+/g, '').startsWith(p.name.replace(/\s+/g, '').substring(0, 6))
        );

        for (let i = 0; i < 5; i++) {
          // الهيكل الجديد: رغبات تبدأ من col 4 (بدل 5 في القديم)
          // نكتشف الهيكل تلقائياً من موضع السداسي
          const colOffset = (row[3] && String(row[3]).includes('السداسي')) ? 4 : 5;
          const wish = String(row[colOffset + i * 3] || '').trim();
          const result = String(row[colOffset + 1 + i * 3] || '').trim();
          const tType = String(row[colOffset + 2 + i * 3] || '').trim() as 'محاضرة' | 'أعمال موجهة';

          if (result !== 'لبيت الرغبة' || !wish) continue;

          const match = wish.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
          if (!match) continue;
          const modName = match[1].trim().replace(/^\(/, '').trim();
          const levelName = match[2].trim();

          // مطابقة محسّنة: المستوى أولاً ثم اسم المقياس
          const wNormFull = modName.replace(/[\s()]/g, '');
          const lSearchFull = levelName.replace(/\s+/g, '');

          // أولاً: مطابقة تامة للمستوى + جزئية للمقياس
          let mod = modules.find(m => {
            const mNorm = m.name_ar.replace(/[\s()]/g, '');
            const lNorm = m.level_name.replace(/\s+/g, '');
            const levelMatch = lNorm === lSearchFull || lNorm.includes(lSearchFull) || lSearchFull.includes(lNorm);
            const moduleMatch = mNorm === wNormFull ||
              (wNormFull.length >= 6 && mNorm.includes(wNormFull.substring(0, Math.min(12, wNormFull.length)))) ||
              (mNorm.length >= 6 && wNormFull.includes(mNorm.substring(0, Math.min(12, mNorm.length))));
            return levelMatch && moduleMatch;
          });

          // ثانياً إن لم يُوجَد: مطابقة أوسع
          if (!mod) {
            mod = modules.find(m => {
              const mNorm = m.name_ar.replace(/[\s()]/g, '');
              const lNorm = m.level_name.replace(/\s+/g, '');
              const lSearch5 = lSearchFull.substring(0, 5);
              return lNorm.includes(lSearch5) &&
                (mNorm.includes(wNormFull.substring(0, 8)) || wNormFull.includes(mNorm.substring(0, 8)));
            });
          }

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
      .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1).eq('status', 'مؤقت');

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

    console.log('Inserting:', toInsert.length, 'slots');
    if (toInsert.length === 0) {
      setMessage({ type: 'error', text: 'لا توجد إسنادات للحفظ' });
      setSaving(false);
      return;
    }
    const { error } = await supabase.from('assignments').insert(toInsert);
    if (error) {
      setMessage({ type: 'error', text: 'خطأ في الحفظ: ' + error.message });
    } else {
      setSavedCount(toInsert.length);
      setMessage({ type: 'success', text: `تم حفظ ${toArabicNum(toInsert.length)} إسناداً — مؤقت (غير معلَن للأساتذة بعد)` });
    }
    setSaving(false);
  }

  async function announceToSelected() {
    if (selectedProfIds.size === 0) return;
    setAnnouncing(true);
    const ids = Array.from(selectedProfIds);
    const { error } = await supabase
      .from('assignments')
      .update({ status: 'نهائي' })
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', 1)
      .eq('status', 'مؤقت')
      .in('professor_id', ids);
    if (error) {
      setMessage({ type: 'error', text: 'خطأ في الإعلان: ' + error.message });
    } else {
      setMessage({ type: 'success', text: '✓ تم إعلان النتائج لـ ' + ids.length + ' أستاذ' });
      setSelectedProfIds(new Set());
      setShowAnnounceModal(false);
    }
    setAnnouncing(false);
  }

  async function loadRequests() {
    setRequestsLoading(true);
    const { data } = await supabase
      .from('assignment_requests')
      .select('id, professor_id, module_id, teaching_type, weekly_hours, status, created_at, professor:professors(last_name, first_name), module:modules(name_ar, level:levels(name_ar))')
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', 1)
      .order('created_at', { ascending: false });
    if (data) {
      setRequests(data.map((r: any) => ({
        id: r.id,
        professor_id: r.professor_id,
        professor_name: r.professor ? r.professor.last_name + ' ' + r.professor.first_name : '—',
        module_id: r.module_id,
        module_name: r.module?.name_ar || '—',
        level_name: r.module?.level?.name_ar || '—',
        teaching_type: r.teaching_type,
        weekly_hours: r.weekly_hours,
        status: r.status,
        created_at: r.created_at,
      })));
    }
    setRequestsLoading(false);
  }

  async function handleRequest(id: string, action: 'مقبول' | 'مرفوض', req?: AssignmentRequest) {
    await supabase.from('assignment_requests').update({ status: action }).eq('id', id);
    if (action === 'مقبول' && req) {
      const mod = modules.find(m => m.id === req.module_id);
      await supabase.from('assignments').insert({
        professor_id: req.professor_id,
        module_id: req.module_id,
        level_id: mod?.level_id,
        academic_year: ACADEMIC_YEAR,
        semester: 1,
        teaching_type: req.teaching_type,
        section_number: 1,
        group_number: null,
        weekly_hours: req.weekly_hours,
        wish_order_satisfied: 0,
        status: 'نهائي',
        conflict_resolved: false,
        score: null,
      });
    }
    await loadRequests();
  }

  async function loadAppeals() {
    const { data } = await supabase
      .from('assignment_appeals')
      .select('id, appeal_type, wish_order, wish_orders, assignment_ids, reason, status, admin_reply, created_at, professor:professors(last_name, first_name), module:modules(name_ar)')
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('semester', 1)
      .order('created_at', { ascending: false });
    if (data) {
      setAppeals(data.map((a: any) => ({
        id: a.id,
        professor_name: a.professor ? a.professor.last_name + ' ' + a.professor.first_name : '—',
        appeal_type: a.appeal_type,
        wish_order: a.wish_order,
        wish_orders: a.wish_orders,
        assignment_ids: a.assignment_ids,
        module_name: a.module?.name_ar,
        reason: a.reason,
        status: a.status,
        admin_reply: a.admin_reply || '',
        created_at: a.created_at,
      })));
    }
  }

  async function replyToAppeal(id: string, action: 'مقبول' | 'مرفوض') {
    await supabase.from('assignment_appeals').update({ status: action, admin_reply: replyText }).eq('id', id);
    setReplyingId(null);
    setReplyText('');
    await loadAppeals();
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
          <button onClick={() => setShowAnnounceModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
            <Megaphone className="w-4 h-4" /> إعلان النتائج
          </button>
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
        <button onClick={() => { setTab('requests' as any); loadRequests(); loadAppeals(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${(tab as any) === 'requests' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
          <Bell className="w-4 h-4" /> الطلبات الواردة
          {(requests.filter(r => r.status === 'معلّق').length + appeals.filter(a => a.status === 'معلّق').length) > 0 && (
            <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {requests.filter(r => r.status === 'معلّق').length + appeals.filter(a => a.status === 'معلّق').length}
            </span>
          )}
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
      {/* Modal إعلان النتائج */}
      {showAnnounceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAnnounceModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-gray-900 text-lg">إعلان النتائج لأساتذة محددين</h3>
              <button onClick={() => setShowAnnounceModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <input type="text" placeholder="ابحث عن أستاذ..." value={announceSearch}
              onChange={e => setAnnounceSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a3a6b]" />
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {profs.filter(p => p.name.includes(announceSearch)).map(p => {
                const hasAssignment = slots.some(s => s.professor_id === p.id);
                if (!hasAssignment) return null;
                const isSelected = selectedProfIds.has(p.id);
                return (
                  <button key={p.id} onClick={() => {
                    const next = new Set(selectedProfIds);
                    isSelected ? next.delete(p.id) : next.add(p.id);
                    setSelectedProfIds(next);
                  }} className={`w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-gray-50 transition-colors ${isSelected ? 'bg-emerald-50' : ''}`}>
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
                      {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                    <span className="text-xs text-gray-400">{profHours(slots, p.id).toFixed(2)}س</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => setSelectedProfIds(new Set(profs.filter(p => slots.some(s => s.professor_id === p.id)).map(p => p.id)))}
                  className="text-xs text-[#1a3a6b] hover:underline">تحديد الكل</button>
                <button onClick={() => setSelectedProfIds(new Set())}
                  className="text-xs text-gray-400 hover:underline">إلغاء التحديد</button>
              </div>
              <button onClick={announceToSelected} disabled={announcing || selectedProfIds.size === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
                <Megaphone className="w-4 h-4" />
                {announcing ? 'جارٍ الإعلان...' : 'إعلان لـ ' + selectedProfIds.size + ' أستاذ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(tab as any) === 'requests' && (
        <div className="space-y-4">
          {/* تبويبات داخلية */}
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
            <button onClick={() => setRequestsTab('requests')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${requestsTab === 'requests' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
              طلبات الاستكمال
              {requests.filter(r => r.status === 'معلّق').length > 0 && (
                <span className="mr-1.5 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{requests.filter(r => r.status === 'معلّق').length}</span>
              )}
            </button>
            <button onClick={() => setRequestsTab('appeals')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${requestsTab === 'appeals' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
              الطعون
              {appeals.filter(a => a.status === 'معلّق').length > 0 && (
                <span className="mr-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{appeals.filter(a => a.status === 'معلّق').length}</span>
              )}
            </button>
          </div>

          {/* طلبات الاستكمال */}
          {requestsTab === 'requests' && <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {requestsLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 text-gray-400">لا توجد طلبات واردة</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الأستاذ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المقياس</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المستوى</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">نوع التدريس</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الساعات</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {requests.map(r => (
                  <tr key={r.id} className={r.status !== 'معلّق' ? 'opacity-50' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.professor_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.module_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.level_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.teaching_type}</td>
                    <td className="px-4 py-3 font-bold text-[#1a3a6b]">{r.weekly_hours.toFixed(2)}س</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        r.status === 'معلّق' ? 'bg-amber-100 text-amber-700' :
                        r.status === 'مقبول' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'معلّق' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleRequest(r.id, 'مقبول', r)}
                            className="flex items-center gap-1 bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <ThumbsUp className="w-3 h-3" /> قبول
                          </button>
                          <button onClick={() => handleRequest(r.id, 'مرفوض')}
                            className="flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <ThumbsDown className="w-3 h-3" /> رفض
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>}

          {/* الطعون */}
          {requestsTab === 'appeals' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {appeals.length === 0 ? (
                <div className="text-center py-10 text-gray-400">لا توجد طعون واردة</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {appeals.map(a => (
                    <div key={a.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-bold text-gray-800">{a.professor_name}</span>
                          <span className="text-xs text-gray-500 mr-2">
{a.appeal_type === 'رغبة_غير_ملبّاة'
                              ? (a.wish_orders && a.wish_orders.length > 0
                                ? `رغبات غير ملبّاة: ${a.wish_orders.join('، ')}`
                                : a.wish_order ? `رغبة ${a.wish_order} غير ملبّاة` : 'رغبة غير ملبّاة')
                              : 'خطأ في الإسناد'}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          a.status === 'معلّق' ? 'bg-amber-100 text-amber-700' :
                          a.status === 'مقبول' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                        }`}>{a.status}</span>
                      </div>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{a.reason}</p>
                      {a.admin_reply && (
                        <p className="text-sm text-[#1a3a6b] bg-blue-50 rounded-xl p-3">
                          <strong>ردك:</strong> {a.admin_reply}
                        </p>
                      )}
                      {a.status === 'معلّق' && (
                        replyingId === a.id ? (
                          <div className="space-y-2">
                            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                              placeholder="اكتب ردك على الطعن..."
                              rows={2}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => replyToAppeal(a.id, 'مقبول')}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-sm font-bold transition-colors">
                                قبول الطعن
                              </button>
                              <button onClick={() => replyToAppeal(a.id, 'مرفوض')}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm font-bold transition-colors">
                                رفض الطعن
                              </button>
                              <button onClick={() => setReplyingId(null)}
                                className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm transition-colors">
                                إلغاء
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setReplyingId(a.id); setReplyText(''); }}
                            className="text-sm text-[#1a3a6b] hover:underline">
                            الرد على الطعن
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                        <div key={mod.id} className="border border-gray-100 rounded-xl p-3 space-y-3" style={{overflow:"visible"}}>
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
                                      <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px]" style={{zIndex:9999, position:"absolute"}}>
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
                                      <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[220px]" style={{zIndex:9999, position:"absolute"}}>
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
