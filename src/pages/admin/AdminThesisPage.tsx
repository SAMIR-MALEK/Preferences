import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  ScrollText, Search, ChevronUp, ChevronDown,
  CheckCircle, X, Eye, Lock, Unlock, Filter,
  Users, Settings, Save, RotateCcw, AlertCircle
} from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';

// ─── Badge الحالة ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    'مقترح':  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    'مُرسَل': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
    'مقبول':  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    'مرفوض':  { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  };
  const s = map[status] ?? { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

// ─── Modal تفاصيل العنوان ─────────────────────────────────────────────────
function ProposalModal({ proposal, onClose }: { proposal: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#1a3a6b]/10 flex items-center justify-center">
              <ScrollText className="w-4 h-4 text-[#1a3a6b]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">تفاصيل العنوان</h3>
              <p className="text-xs text-gray-400">{proposal.spec_name}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 mb-1">العنوان بالعربية</p>
            <p className="text-sm font-semibold text-gray-800 leading-relaxed">{proposal.title_ar || '—'}</p>
          </div>
          {proposal.title_fr && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-1">العنوان بالفرنسية</p>
              <p className="text-sm text-gray-700 leading-relaxed" dir="ltr">{proposal.title_fr}</p>
            </div>
          )}
          {proposal.description && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-1">الوصف</p>
              <p className="text-sm text-gray-600 leading-relaxed">{proposal.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-1">الأستاذ المشرف</p>
              <p className="text-sm font-medium text-gray-800">{proposal.professor_name}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-1">الحالة</p>
              <div className="mt-1"><StatusBadge status={proposal.status} /></div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 mb-1">تاريخ الاقتراح</p>
            <p className="text-sm text-gray-700">
              {proposal.created_at
                ? new Date(proposal.created_at).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── رأس العمود القابل للترتيب ────────────────────────────────────────────
function SortTh({ col, label, sortCol, sortDir, onSort, className = '' }: {
  col: string; label: string; sortCol: string; sortDir: 1 | -1;
  onSort: (c: string) => void; className?: string;
}) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-right text-xs font-bold cursor-pointer select-none whitespace-nowrap ${className}`}
      style={{ color: active ? '#c9a227' : '#1a3a6b' }}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sortDir === 1 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <span className="text-gray-300 text-[10px]">⇅</span>}
      </span>
    </th>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function AdminThesisPage() {
  const { user } = useAuth();

  const [department, setDepartment] = useState<string | null>(null);
  const [specs,      setSpecs]      = useState<any[]>([]);
  const [rows,       setRows]       = useState<any[]>([]);
  const [allProfs,   setAllProfs]   = useState<any[]>([]);
  const [deadline,   setDeadline]   = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);

  const [searchText,   setSearchText]   = useState('');
  const [filterSpec,   setFilterSpec]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortCol,      setSortCol]      = useState('prof');
  const [sortDir,      setSortDir]      = useState<1 | -1>(1);
  const [selected,     setSelected]     = useState<any | null>(null);
  const [showSent,     setShowSent]     = useState(false);
  const [showNotSent,  setShowNotSent]  = useState(false);

  // ── التبويبات + السماح بالتعديل + إعدادات التخصصات ──
  const [view,         setView]         = useState<'titles' | 'profs' | 'settings'>('titles');
  const [unlocks,      setUnlocks]      = useState<any[]>([]);
  const [unlocksError, setUnlocksError] = useState('');
  const [msg,          setMsg]          = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy,         setBusy]         = useState<string | null>(null);
  const [profSearch,   setProfSearch]   = useState('');
  const [profFilter,   setProfFilter]   = useState<'all' | 'sent' | 'notsent' | 'open'>('all');
  const [confirmKey,   setConfirmKey]   = useState<string | null>(null);
  const [specEdits,    setSpecEdits]    = useState<Record<string, any>>({});
  const [savingSpec,   setSavingSpec]   = useState<string | null>(null);
  const [savedSpec,    setSavedSpec]    = useState<string | null>(null);

  const adminInfo: any = (user as any)?.admin;
  const isDeptHead = adminInfo?.role === 'dept_head';
  const adminName: string = adminInfo?.full_name || adminInfo?.username || (isDeptHead ? 'رئيس القسم' : 'نائب العميد');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    const { data: settingsData } = await supabase
      .from('academic_settings').select('thesis_deadline')
      .eq('academic_year', ACADEMIC_YEAR).single();
    setDeadline(settingsData?.thesis_deadline ?? null);

    let dept: string | null = (user as any)?.admin?.department ?? null;
    if (!dept) {
      const { data: profRow } = await supabase
        .from('professors').select('id').eq('user_id', user?.id).maybeSingle();
      if (profRow?.id) {
        const { data: roleRow } = await supabase
          .from('professor_roles').select('speciality')
          .eq('professor_id', profRow.id).eq('role', 'dept_head').maybeSingle();
        if (roleRow?.speciality) {
          if (roleRow.speciality === 'عام' || roleRow.speciality === 'خاص') {
            dept = roleRow.speciality;
          } else {
            const { data: lvl } = await supabase
              .from('levels').select('department').eq('id', roleRow.speciality).maybeSingle();
            dept = lvl?.department ?? null;
          }
        }
      }
    }
    setDepartment(dept);

    let q = supabase.from('levels')
      .select('id, name_ar, thesis_enabled, thesis_min, thesis_max, department')
      .ilike('name_ar', 'ماستر 2%').order('name_ar');
    if (dept) q = q.eq('department', dept);
    const { data: levelsData } = await q;
    const levels = levelsData ?? [];
    setSpecs(levels);

    let proposals: any[] = [];
    if (levels.length > 0) {
      const ids = levels.map((l: any) => String(l.id));

      const { data: byLevel } = await supabase
        .from('thesis_proposals')
        .select('id, title_ar, title_fr, description, status, created_at, level_id, speciality, proposal_order, professor_id')
        .in('level_id', ids).eq('academic_year', ACADEMIC_YEAR)
        .order('proposal_order', { ascending: true });
      proposals = byLevel ?? [];

      if (proposals.length === 0) {
        const { data: bySpec } = await supabase
          .from('thesis_proposals')
          .select('id, title_ar, title_fr, description, status, created_at, level_id, speciality, proposal_order, professor_id')
          .in('speciality', ids).eq('academic_year', ACADEMIC_YEAR)
          .order('proposal_order', { ascending: true });
        proposals = bySpec ?? [];
      }
      if (proposals.length === 0) {
        const { data: noYear } = await supabase
          .from('thesis_proposals')
          .select('id, title_ar, title_fr, description, status, created_at, level_id, speciality, proposal_order, professor_id')
          .or(`level_id.in.(${ids.join(',')}),speciality.in.(${ids.join(',')})`)
          .order('proposal_order', { ascending: true });
        proposals = noYear ?? [];
      }

      const profIds = [...new Set(proposals.map((p: any) => p.professor_id))];
      let profMap: Record<string, any> = {};
      if (profIds.length > 0) {
        const { data: profs } = await supabase
          .from('professors').select('id, last_name, first_name').in('id', profIds);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
      }

      const specMap: Record<string, string> = {};
      levels.forEach((l: any) => { specMap[String(l.id)] = l.name_ar; });

      setRows(proposals.map((p: any) => ({
        ...p,
        professor_name: profMap[p.professor_id]
          ? `${profMap[p.professor_id].last_name} ${profMap[p.professor_id].first_name}`
          : '—',
        prof_last: profMap[p.professor_id]?.last_name ?? '',
        spec_name: specMap[String(p.level_id)] ?? specMap[String(p.speciality)] ?? '—',
        spec_id: specMap[String(p.level_id)] ? String(p.level_id) : specMap[String(p.speciality)] ? String(p.speciality) : '',
      })));
    } else {
      setRows([]);
    }

    // السماحات بالتعديل النشطة (جدول جديد — قد لا يكون موجوداً بعد)
    const { data: ul, error: ulErr } = await supabase
      .from('thesis_edit_unlocks')
      .select('*')
      .eq('academic_year', ACADEMIC_YEAR)
      .order('granted_at', { ascending: false });
    if (ulErr) {
      setUnlocks([]);
      setUnlocksError('جدول السماح بالتعديل غير موجود بعد — شغّل استعلام SQL الخاص بهذه الميزة.');
    } else {
      setUnlocks(ul ?? []);
      setUnlocksError('');
    }

    const RANKS = ['أستاذ التعليم العالي','أستاذ محاضر - أ','أستاذ محاضر - ب','أستاذ مساعد - أ','أستاذ مساعد - ب'];
    const { data: ap } = await supabase
      .from('professors').select('id, last_name, first_name, username')
      .in('rank', RANKS).order('last_name');
    setAllProfs((ap ?? []).filter((p: any) => !p.username?.toUpperCase().startsWith('V')));

    setLoading(false);
  }

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortCol(col); setSortDir(1); }
  }

  const filtered = useMemo(() => {
    let data = [...rows];
    if (filterSpec)   data = data.filter(r => r.spec_name === filterSpec);
    if (filterStatus) data = data.filter(r => r.status === filterStatus);
    if (searchText) {
      const q = searchText.toLowerCase();
      data = data.filter(r =>
        r.title_ar?.toLowerCase().includes(q) ||
        r.professor_name?.toLowerCase().includes(q)
      );
    }
    data.sort((a, b) => {
      let av = '', bv = '';
      if (sortCol === 'prof')   { av = a.prof_last;    bv = b.prof_last; }
      if (sortCol === 'spec')   { av = a.spec_name;    bv = b.spec_name; }
      if (sortCol === 'title')  { av = a.title_ar??''; bv = b.title_ar??''; }
      if (sortCol === 'status') { av = a.status??'';   bv = b.status??''; }
      return av.localeCompare(bv, 'ar') * sortDir;
    });
    return data;
  }, [rows, filterSpec, filterStatus, searchText, sortCol, sortDir]);

  const sentProfIds  = new Set(rows.map(r => r.professor_id));
  const sentProfs    = allProfs.filter(p => sentProfIds.has(p.id));
  const notSentProfs = allProfs.filter(p => !sentProfIds.has(p.id));
  const deadlinePassed = deadline ? new Date(deadline) < new Date() : false;
  const deadlineLabel  = deadline
    ? new Date(deadline).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'لم يُحدَّد';
  const deptLabel = department === 'عام' ? 'القانون العام'
    : department === 'خاص' ? 'القانون الخاص' : 'جميع الأقسام';

  // ══ السماح بالتعديل ═══════════════════════════════════════════════════
  const specIds = new Set(specs.map(sp => String(sp.id)));
  const specName = (id: string) => specs.find(sp => String(sp.id) === String(id))?.name_ar || '—';
  const activeUnlocks = unlocks.filter(u => !u.closed_at && specIds.has(String(u.level_id)));
  const activeUnlockFor = (profId: string, levelId: string) =>
    activeUnlocks.find(u => u.professor_id === profId && String(u.level_id) === String(levelId));

  // التخصصات التي يُفتح فيها التعديل: تخصصات الأستاذ التي له فيها عناوين (ضمن صلاحيتك)،
  // وإن لم يقترح شيئاً بعد: كل تخصصات صلاحيتك
  function targetSpecsFor(profId: string): string[] {
    const withTitles = [...new Set(rows.filter(r => r.professor_id === profId && r.spec_id).map(r => r.spec_id))];
    return withTitles.length > 0 ? withTitles : specs.map(sp => String(sp.id));
  }

  async function grantUnlock(prof: any) {
    const targets = targetSpecsFor(prof.id).filter(id => !activeUnlockFor(prof.id, id));
    if (targets.length === 0) { setMsg({ type: 'err', text: 'التعديل مفتوح لهذا الأستاذ من قبل' }); return; }
    setBusy(prof.id);
    setMsg(null);
    const { error: insErr } = await supabase.from('thesis_edit_unlocks').insert(
      targets.map(levelId => ({ professor_id: prof.id, level_id: levelId, academic_year: ACADEMIC_YEAR, granted_by: adminName })),
    );
    if (insErr) {
      setMsg({ type: 'err', text: 'تعذّر فتح التعديل: ' + insErr.message });
      setBusy(null);
      return;
    }
    // العناوين المُرسَلة في هذه التخصصات تعود «مقترح» — المقبولة والمرفوضة لا تُمسّ
    const expected = rows.filter(r => r.professor_id === prof.id && targets.includes(r.spec_id) && r.status === 'مُرسَل').length;
    let reopened = 0;
    if (expected > 0) {
      const list = targets.join(',');
      const { data: upd, error: updErr } = await supabase.from('thesis_proposals')
        .update({ status: 'مقترح' })
        .eq('professor_id', prof.id)
        .eq('academic_year', ACADEMIC_YEAR)
        .eq('status', 'مُرسَل')
        .or(`level_id.in.(${list}),speciality.in.(${list})`)
        .select('id');
      reopened = upd?.length ?? 0;
      if (updErr || reopened < expected) {
        setMsg({
          type: 'err',
          text: `فُتح التعديل للأستاذ، لكن قاعدة البيانات لم تسمح بإعادة فتح عناوينه المُرسَلة (${reopened} من ${expected}). شغّل استعلام SQL الخاص بهذه الميزة ثم أعد المحاولة.`,
        });
        await load();
        setBusy(null);
        return;
      }
    }
    setMsg({
      type: 'ok',
      text: `سُمح للأستاذ ${prof.last_name} ${prof.first_name} بتعديل مقترحاته (${targets.map(specName).join('، ')})` +
        (reopened > 0 ? ` — أُعيد فتح ${reopened} عنوان.` : '.'),
    });
    await load();
    setBusy(null);
  }

  // إغلاق التعديل: تُثبَّت عناوينه الحالية كمُرسَلة في كل التخصصات المفتوحة له
  async function revokeUnlock(prof: any) {
    const opens = activeUnlocks.filter(u => u.professor_id === prof.id);
    if (opens.length === 0) return;
    setBusy(prof.id);
    setMsg(null);
    const list = opens.map(u => String(u.level_id)).join(',');
    const { error: e1 } = await supabase.from('thesis_proposals')
      .update({ status: 'مُرسَل' })
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('status', 'مقترح')
      .or(`level_id.in.(${list}),speciality.in.(${list})`);
    const { error: e2 } = await supabase.from('thesis_edit_unlocks')
      .update({ closed_at: new Date().toISOString(), closed_reason: `أغلقه ${adminName}` })
      .in('id', opens.map(u => u.id));
    if (e1 || e2) setMsg({ type: 'err', text: 'تعذّر إغلاق التعديل: ' + (e1?.message || e2?.message) });
    else setMsg({ type: 'ok', text: `أُغلق التعديل للأستاذ ${prof.last_name} ${prof.first_name} وثُبّتت عناوينه الحالية كمُرسَلة.` });
    setConfirmKey(null);
    await load();
    setBusy(null);
  }

  // ══ إعدادات التخصصات ══════════════════════════════════════════════════
  const specValue = (sp: any, field: string) =>
    specEdits[sp.id] && field in specEdits[sp.id] ? specEdits[sp.id][field] : sp[field];

  function editSpec(id: string, field: string, value: any) {
    setSpecEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  }

  async function saveSpec(sp: any) {
    const min = Number(specValue(sp, 'thesis_min') ?? 0);
    const maxRaw = specValue(sp, 'thesis_max');
    const max = maxRaw === '' || maxRaw === null || maxRaw === undefined ? null : Number(maxRaw);
    if (max !== null && max < min) { setMsg({ type: 'err', text: `«${sp.name_ar}»: الحد الأقصى أقل من الحد الأدنى` }); return; }
    setSavingSpec(sp.id);
    setMsg(null);
    const { error } = await supabase.from('levels').update({
      thesis_min: min,
      thesis_max: max,
      thesis_enabled: !!specValue(sp, 'thesis_enabled'),
    }).eq('id', sp.id);
    setSavingSpec(null);
    if (error) { setMsg({ type: 'err', text: 'تعذّر الحفظ: ' + error.message }); return; }
    setSavedSpec(sp.id);
    setTimeout(() => setSavedSpec(null), 2000);
    setSpecEdits(prev => { const n = { ...prev }; delete n[sp.id]; return n; });
    await load();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {selected && <ProposalModal proposal={selected} onClose={() => setSelected(null)} />}

      {/* ── رأس الصفحة ── */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ScrollText className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold">مذكرات التخرج</span>
            </div>
            <h2 className="font-bold text-base">{deptLabel} — {ACADEMIC_YEAR}</h2>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
            deadlinePassed
              ? 'bg-red-500/20 text-red-200 border-red-500/30'
              : deadline
                ? 'bg-green-500/20 text-green-200 border-green-500/30'
                : 'bg-white/10 text-gray-300 border-white/20'
          }`}>
            {deadlinePassed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>الموعد النهائي: <strong>{deadlineLabel}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{specs.filter(s => s.thesis_enabled).length}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">تخصصات مفتوحة</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{rows.length}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">إجمالي العناوين</p>
          </div>
          <button onClick={() => { setShowSent(v => !v); setShowNotSent(false); }}
            className={`rounded-xl p-3 text-center transition-all ${showSent ? 'bg-green-400/30 ring-2 ring-green-400/50' : 'bg-white/10 hover:bg-white/20'}`}>
            <p className="text-xl font-bold text-green-300">{sentProfs.length}</p>
            <p className="text-[10px] text-green-200 mt-0.5 flex items-center justify-center gap-1">
              أرسلوا {showSent ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </p>
          </button>
          <button onClick={() => { setShowNotSent(v => !v); setShowSent(false); }}
            className={`rounded-xl p-3 text-center transition-all ${showNotSent ? 'bg-amber-400/30 ring-2 ring-amber-400/50' : 'bg-white/10 hover:bg-white/20'}`}>
            <p className="text-xl font-bold text-amber-300">{notSentProfs.length}</p>
            <p className="text-[10px] text-amber-200 mt-0.5 flex items-center justify-center gap-1">
              لم يرسلوا {showNotSent ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </p>
          </button>
        </div>

        {showSent && (
          <div className="mt-3 bg-white/10 rounded-xl overflow-hidden">
            {sentProfs.length === 0
              ? <p className="px-4 py-3 text-xs text-gray-300">لم يرسل أي أستاذ بعد</p>
              : <div className="max-h-52 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[#0f2347]">
                      <tr>
                        <th className="px-3 py-2 text-right text-xs font-bold text-green-300 w-8">#</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-green-300">اللقب والاسم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sentProfs.map((p, i) => (
                        <tr key={p.id} className="hover:bg-white/5">
                          <td className="px-3 py-2 text-xs text-gray-400 text-center">{i + 1}</td>
                          <td className="px-3 py-2 text-sm text-white">{p.last_name} {p.first_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {showNotSent && (
          <div className="mt-3 bg-white/10 rounded-xl overflow-hidden">
            {notSentProfs.length === 0
              ? <div className="px-4 py-3 text-xs text-green-200 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> جميع الأساتذة أرسلوا مقترحاتهم
                </div>
              : <div className="max-h-52 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[#0f2347]">
                      <tr>
                        <th className="px-3 py-2 text-right text-xs font-bold text-amber-300 w-8">#</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-amber-300">اللقب والاسم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {notSentProfs.map((p, i) => (
                        <tr key={p.id} className="hover:bg-white/5">
                          <td className="px-3 py-2 text-xs text-gray-400 text-center">{i + 1}</td>
                          <td className="px-3 py-2 text-sm text-white">{p.last_name} {p.first_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}
      </div>

      {/* ── التبويبات ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex flex-wrap gap-1">
        {([
          ['titles', 'العناوين', ScrollText, 0],
          ['profs', 'الأساتذة والسماح بالتعديل', Users, activeUnlocks.length],
          ['settings', 'إعدادات التخصصات', Settings, 0],
        ] as const).map(([key, label, Icon, badge]) => (
          <button key={key} onClick={() => { setView(key); setMsg(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              view === key ? 'bg-[#1a3a6b] text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
            {badge > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] flex items-center justify-center font-bold ${view === key ? 'bg-white text-[#1a3a6b]' : 'bg-amber-500 text-white'}`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start justify-between gap-3 ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {view === 'titles' && (<>
      {/* ── شريط الفلاتر ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="بحث بالعنوان أو الأستاذ..."
            className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
          {searchText && (
            <button onClick={() => setSearchText('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select value={filterSpec} onChange={e => setFilterSpec(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white min-w-[150px]">
            <option value="">كل التخصصات</option>
            {specs.map(s => <option key={s.id} value={s.name_ar}>{s.name_ar}</option>)}
          </select>
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white">
          <option value="">كل الحالات</option>
          {['مقترح','مُرسَل','مقبول','مرفوض'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-gray-400 mr-auto">{filtered.length} عنوان</span>
      </div>

      {/* ── الجدول ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <ScrollText className="w-10 h-10 mb-3" />
            <p className="text-sm">لا توجد نتائج</p>
            {(searchText || filterSpec || filterStatus) && (
              <button onClick={() => { setSearchText(''); setFilterSpec(''); setFilterStatus(''); }}
                className="mt-3 text-xs text-amber-500 hover:underline">
                إزالة الفلاتر
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1a3a6b]/5 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-[#1a3a6b] w-8">#</th>
                  <SortTh col="prof"   label="الأستاذ"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="spec"   label="التخصص"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="title"  label="العنوان"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="min-w-[200px]" />
                  <SortTh col="status" label="الحالة"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-20" />
                  <th className="px-3 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-3 text-xs text-gray-400 text-center font-bold">{i + 1}</td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">{r.professor_name}</td>
                    <td className="px-3 py-3">
                      <span className="inline-block bg-[#1a3a6b]/5 text-[#1a3a6b] text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
                        {r.spec_name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-800 leading-relaxed">{r.title_ar}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => setSelected(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1a3a6b]/5 hover:bg-[#1a3a6b]/10 text-[#1a3a6b] text-[11px] font-medium transition-colors">
                        <Eye className="w-3 h-3" />
                        عرض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* ════════ الأساتذة والسماح بالتعديل ════════ */}
      {view === 'profs' && (() => {
        const q = profSearch.trim();
        const list = allProfs.map(p => {
          const mine = rows.filter(r => r.professor_id === p.id && r.spec_id);
          const bySpecMap = new Map<string, any[]>();
          for (const r of mine) { if (!bySpecMap.has(r.spec_id)) bySpecMap.set(r.spec_id, []); bySpecMap.get(r.spec_id)!.push(r); }
          const opens = activeUnlocks.filter(u => u.professor_id === p.id);
          const sent = mine.some(r => r.status !== 'مقترح');
          return { p, bySpecMap, opens, sent, total: mine.length };
        }).filter(x => {
          if (q && !`${x.p.last_name} ${x.p.first_name}`.includes(q)) return false;
          if (profFilter === 'sent' && !x.sent) return false;
          if (profFilter === 'notsent' && x.sent) return false;
          if (profFilter === 'open' && x.opens.length === 0) return false;
          return true;
        });
        return (
          <>
            {unlocksError && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {unlocksError}
              </div>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={profSearch} onChange={e => setProfSearch(e.target.value)} placeholder="بحث باسم الأستاذ..."
                  className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
              </div>
              {([['all', 'الكل'], ['sent', 'أرسلوا'], ['notsent', 'لم يرسلوا'], ['open', 'مفتوح لهم التعديل']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setProfFilter(k)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${profFilter === k ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 px-1 leading-relaxed">
              «السماح بالتعديل» يعيد فتح العناوين المُرسَلة للأستاذ في كل تخصصاته{isDeptHead ? ' (ضمن قسمك)' : ''}، ويفتحها له حتى بعد الموعد النهائي أو إغلاق التخصص. الأستاذ الذي لم يقترح بعد تُفتح له كل التخصصات.
              العناوين المقبولة والمرفوضة لا تُمسّ. يُغلق السماح تلقائياً حين يعيد الأستاذ الإرسال.
            </p>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {list.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-14">لا توجد نتائج</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {list.map(({ p, bySpecMap, opens }) => {
                    return (
                      <div key={p.id} className="px-4 py-3.5 flex flex-wrap items-start gap-x-4 gap-y-2">
                        <div className="flex-1 min-w-[200px]">
                          <p className="font-bold text-gray-800 text-sm">{p.last_name} {p.first_name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {bySpecMap.size === 0 && <span className="text-[11px] text-gray-400">لم يقترح أي عنوان في تخصصاتكم</span>}
                            {[...bySpecMap.entries()].map(([sid, rs]) => {
                              const c = (st: string) => rs.filter((r: any) => r.status === st).length;
                              return (
                                <span key={sid} className="text-[11px] bg-[#1a3a6b]/5 text-[#1a3a6b] px-2 py-0.5 rounded-full">
                                  {specName(sid)}: {rs.length}
                                  {c('مقترح') > 0 && <span className="text-blue-700"> · {c('مقترح')} مقترح</span>}
                                  {c('مُرسَل') > 0 && <span className="text-purple-700"> · {c('مُرسَل')} مُرسَل</span>}
                                  {c('مقبول') > 0 && <span className="text-green-700"> · {c('مقبول')} مقبول</span>}
                                  {c('مرفوض') > 0 && <span className="text-red-700"> · {c('مرفوض')} مرفوض</span>}
                                </span>
                              );
                            })}
                          </div>
                          {opens.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                                <Unlock className="w-3 h-3" /> التعديل مفتوح: {opens.map(u => specName(u.level_id)).join('، ')}
                              </span>
                              <span className="text-gray-400">منذ {new Date(opens[0].granted_at).toLocaleDateString('ar-DZ')} — {opens[0].granted_by || '—'}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {opens.length === 0 ? (
                            <button onClick={() => grantUnlock(p)} disabled={!!unlocksError || busy === p.id || specs.length === 0}
                              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40">
                              <RotateCcw className="w-3.5 h-3.5" /> السماح بالتعديل
                            </button>
                          ) : confirmKey !== p.id ? (
                            <button onClick={() => setConfirmKey(p.id)}
                              className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl text-xs font-bold">
                              <Lock className="w-3.5 h-3.5" /> إغلاق التعديل
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <button onClick={() => revokeUnlock(p)} disabled={busy === p.id}
                                className="bg-red-600 text-white px-3 py-2 rounded-xl font-bold disabled:opacity-50">تأكيد (تُثبَّت عناوينه الحالية كمُرسَلة)</button>
                              <button onClick={() => setConfirmKey(null)} className="border border-gray-200 px-3 py-2 rounded-xl text-gray-600">تراجع</button>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ════════ إعدادات التخصصات ════════ */}
      {view === 'settings' && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-xs text-gray-600 flex flex-wrap items-center gap-2">
            {deadlinePassed ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5 text-green-600" />}
            <span>الموعد النهائي للاقتراح: <strong>{deadlineLabel}</strong></span>
            <span className="text-gray-400">— {isDeptHead ? 'يحدده نائب العميد.' : 'يُعدَّل من صفحة الإعدادات.'}</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {specs.length === 0 && <p className="text-center text-gray-400 text-sm py-12">لا توجد تخصصات ماستر 2</p>}
            {specs.map(sp => {
              const enabled = !!specValue(sp, 'thesis_enabled');
              const dirty = !!specEdits[sp.id];
              return (
                <div key={sp.id} className="px-4 py-4 flex flex-wrap items-center gap-3">
                  <button onClick={() => editSpec(sp.id, 'thesis_enabled', !enabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {enabled ? <><Unlock className="w-3 h-3" /> مفتوح</> : <><Lock className="w-3 h-3" /> مغلق</>}
                  </button>
                  <span className="flex-1 min-w-[160px] text-sm font-semibold text-gray-800">{sp.name_ar}</span>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    الحد الأدنى
                    <input type="number" min={0} max={99} value={specValue(sp, 'thesis_min') ?? 0}
                      onChange={e => editSpec(sp.id, 'thesis_min', e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    الحد الأقصى
                    <input type="number" min={0} max={99} placeholder="∞" value={specValue(sp, 'thesis_max') ?? ''}
                      onChange={e => editSpec(sp.id, 'thesis_max', e.target.value === '' ? null : Number(e.target.value))}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  </label>
                  <button onClick={() => saveSpec(sp)} disabled={savingSpec === sp.id || !dirty}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                    style={{ background: savedSpec === sp.id ? '#dcfce7' : '#fef3c7', color: savedSpec === sp.id ? '#15803d' : '#92400e' }}>
                    {savedSpec === sp.id ? <><CheckCircle className="w-3 h-3" /> حُفظ</> : <><Save className="w-3 h-3" /> حفظ</>}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 px-1">التغيير لا يُحفظ إلا بالضغط على «حفظ» في سطر التخصص.</p>
        </>
      )}
    </div>
  );
}
