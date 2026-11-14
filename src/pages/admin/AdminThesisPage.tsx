import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  ScrollText, Search, ChevronUp, ChevronDown,
  CheckCircle, X, Eye, Lock, Unlock, Filter
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
      .select('id, name_ar, thesis_enabled')
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
      })));
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
    </div>
  );
}
