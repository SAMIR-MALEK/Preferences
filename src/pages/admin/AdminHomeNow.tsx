import { useEffect, useState } from 'react';
import { Bell, Users, CheckCircle, ScrollText, Shield, HeartHandshake, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchAll, J_PENDING } from '../../lib/attendance';
import { TUT_YEAR, tutRpc } from '../../lib/tutorat';

// لوحة الإدارة — الموسم الجاري (نفس نسق اللوحة السابقة)
// رئيس القسم: نفس الصفحة محصورة في مستويات قسمه، عدا ما لا يُقسَّم (إشغال القاعات)

const YEAR = '2026-2027';
const SEM = 1;
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const FACULTY_COUNCIL = 'المجلس التأديبي للكلية';
const DEPT_COUNCIL: Record<string, string> = {
  'عام': 'المجلس التأديبي لقسم القانون العام',
  'خاص': 'المجلس التأديبي لقسم القانون الخاص',
};
const COUNCIL_LABEL: Record<string, string> = {
  [FACULTY_COUNCIL]: 'الكلية', [DEPT_COUNCIL['عام']]: 'القسم العام', [DEPT_COUNCIL['خاص']]: 'القسم الخاص',
};
const isVac = (u: any) => /^v/i.test(String(u || ''));

interface Props {
  setTab: (t: any) => void;
  department: string | null;            // رئيس القسم: 'عام' | 'خاص'
  allowedLevelCodes: string[] | null;   // نطاق رئيس القسم
  tutoratMode: 'admin' | 'dept' | null;
}

export default function AdminHomeNow({ setTab, department, allowedLevelCodes, tutoratMode }: Props) {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const safe = async <T,>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };

      // ── المستويات والنطاق ──
      const { data: lv } = await supabase.from('levels').select('id, code, name_ar, department');
      const levels = lv || [];
      const scope = new Set(levels.filter((l: any) => !allowedLevelCodes || allowedLevelCodes.includes(l.code)).map((l: any) => String(l.id)));
      const inScope = (levelId: any) => !allowedLevelCodes || scope.has(String(levelId));

      // ── اليوم ──
      const now = new Date();
      const dayName = DAYS[now.getDay()];
      const { data: tsAll } = await supabase.from('time_slots').select('id, day');
      const todaySlots = (tsAll || []).filter((t: any) => t.day === dayName);
      const slotIds = todaySlots.map((t: any) => t.id);
      const { count: roomCount } = await supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('is_active', true);
      let today = { td: 0, lec: 0, perm: 0, vac: 0, occ: 0, has: slotIds.length > 0 };
      if (slotIds.length > 0) {
        const sch = await safe(fetchAll<any>(() => supabase.from('schedules')
          .select('id, room_id, time_slot_id, assignment:assignments(teaching_type, professor_id, level_id, professor:professors(username))')
          .in('time_slot_id', slotIds).eq('academic_year', YEAR).eq('semester', SEM).order('id')), [] as any[]);
        const mine = sch.filter((s: any) => s.assignment && inScope(s.assignment.level_id));
        const perm = new Set<string>(), vac = new Set<string>();
        mine.forEach((s: any) => {
          const pid = s.assignment.professor_id; if (!pid) return;
          (isVac(s.assignment.professor?.username) ? vac : perm).add(pid);
        });
        const used = new Set(sch.filter((s: any) => s.room_id).map((s: any) => `${s.room_id}_${s.time_slot_id}`));
        const cap = (roomCount || 0) * slotIds.length;
        today = {
          td: mine.filter((s: any) => s.assignment.teaching_type === 'أعمال موجهة').length,
          lec: mine.filter((s: any) => s.assignment.teaching_type === 'محاضرة').length,
          perm: perm.size, vac: vac.size, occ: cap > 0 ? Math.round((used.size / cap) * 100) : 0, has: true,
        };
      }

      // ── الأساتذة واقتراح العناوين (مستويات ماستر 2 في النطاق) ──
      const profs = await safe(fetchAll<any>(() => supabase.from('professors').select('id, username').eq('is_active', true).order('id')), [] as any[]);
      const permProfs = profs.filter((p: any) => !isVac(p.username));
      const m2 = levels.filter((l: any) => String(l.name_ar || '').startsWith('ماستر 2') && (!department || l.department === department));
      const m2ids = m2.map((l: any) => String(l.id));
      let proposers = new Set<string>();
      if (m2ids.length > 0) {
        const list = `(${m2ids.join(',')})`;
        let props = await safe(fetchAll<any>(() => supabase.from('thesis_proposals').select('id, professor_id')
          .or(`level_id.in.${list},speciality.in.${list}`).eq('academic_year', YEAR).order('id')), [] as any[]);
        if (props.length === 0) props = await safe(fetchAll<any>(() => supabase.from('thesis_proposals').select('id, professor_id')
          .or(`level_id.in.${list},speciality.in.${list}`).order('id')), [] as any[]);
        proposers = new Set(props.map((p: any) => p.professor_id).filter(Boolean));
      }
      const permIds = new Set(permProfs.map((p: any) => p.id));
      const proposed = [...proposers].filter(id => permIds.has(id)).length;

      // ── الإسناد والتوقيت والغيابات ──
      const asg = (await safe(fetchAll<any>(() => supabase.from('assignments')
        .select('id, professor_id, module_id, level_id, teaching_type, group_number')
        .eq('academic_year', YEAR).eq('semester', SEM).in('status', ['مؤقت', 'نهائي']).order('id')), [] as any[]))
        .filter((a: any) => inScope(a.level_id));
      const unassigned = asg.filter((a: any) => !a.professor_id).length;
      const schAll = await safe(fetchAll<any>(() => supabase.from('schedules').select('assignment_id')
        .eq('academic_year', YEAR).eq('semester', SEM).order('id')), [] as any[]);
      const scheduled = new Set(schAll.map((s: any) => s.assignment_id));
      const unscheduled = asg.filter((a: any) => a.professor_id && !scheduled.has(a.id)).length;
      const sess = await safe(fetchAll<any>(() => supabase.from('attendance_sessions').select('module_id, group_number')
        .eq('academic_year', YEAR).order('id')), [] as any[]);
      const recorded = new Set(sess.map((s: any) => `${s.module_id}_${s.group_number}`));
      const noAbs = asg.filter((a: any) => a.professor_id && a.teaching_type === 'أعمال موجهة'
        && !recorded.has(`${a.module_id}_${a.group_number}`)).length;

      // ── التبريرات المعلقة ──
      const js = await safe(fetchAll<any>(() => supabase.from('absence_justifications').select('id, student_id')
        .eq('status', J_PENDING).order('id')), [] as any[]);
      let pendingJ = js.length;
      if (department && js.length > 0) {
        const ids = [...new Set(js.map((j: any) => j.student_id))];
        const { data: sts } = await supabase.from('students').select('id, specialite').in('id', ids.slice(0, 500));
        const byName = new Map(levels.map((l: any) => [String(l.name_ar || '').trim(), l]));
        const sMap = new Map((sts || []).map((s: any) => [s.id, s]));
        pendingJ = js.filter((j: any) => {
          const l: any = byName.get(String((sMap.get(j.student_id) as any)?.specialite || '').trim());
          return !l || l.department === department;
        }).length;
      }

      // ── الحصص التعويضية المعلقة ──
      const mk = await safe(fetchAll<any>(() => supabase.from('makeup_requests')
        .select('id, assignment:assignments(level_id)').eq('status', 'pending').order('id')), [] as any[]);
      const pendingMk = mk.filter((m: any) => inScope(m.assignment?.level_id)).length;

      // ── المجلس التأديبي ──
      const noms = await safe(fetchAll<any>(() => supabase.from('disciplinary_nominations')
        .select('professor_id, council').eq('academic_year', YEAR).order('professor_id')), [] as any[]);
      const councils = [FACULTY_COUNCIL, ...(department ? [DEPT_COUNCIL[department]] : Object.values(DEPT_COUNCIL))]
        .map(c => ({ c, n: noms.filter((x: any) => x.council === c).length }));
      const nomProfs = new Set(noms.filter((x: any) => councils.some(c => c.c === x.council)).map((x: any) => x.professor_id)).size;

      // ── المرافقة البيداغوجية ──
      let tut: { open: boolean; n: number } | null = null;
      if (tutoratMode) {
        const [c, l] = await Promise.all([
          safe(tutRpc<any>('tut_campaign', { p_year: TUT_YEAR }), null),
          safe(tutRpc<any[]>('tut_list', { p_year: TUT_YEAR }), [] as any[]),
        ]);
        tut = { open: c?.open_now === true, n: (l || []).length };
      }

      if (alive) setD({
        dayName, dateStr: `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`, today,
        profs: profs.length, perm: permProfs.length, proposed, unassigned, unscheduled, noAbs, pendingJ, pendingMk,
        councils, nomProfs, tut,
      });
    })();
    return () => { alive = false; };
  }, [department, allowedLevelCodes?.join(','), tutoratMode]);

  if (!d) return <div className="flex justify-center p-10"><div className="animate-spin h-6 w-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full" /></div>;

  const pct = d.perm > 0 ? Math.round((d.proposed / d.perm) * 100) : 0;
  const t = d.today;

  // يحتاج انتباهك: يظهر السطر إن كان الرقم أكبر من صفر؛ وسطرا المجلس والمرافقة إعلاميان
  const lines: { n: string; t: string; tab: string; c: string; show: boolean; info?: boolean }[] = [
    { n: String(d.unassigned), t: 'خانة إسناد بلا أستاذ', tab: 'board', c: '#dc2626', show: d.unassigned > 0 },
    { n: String(d.unscheduled), t: 'حصة مسندة غير مبرمجة في التوقيت', tab: 'schedule', c: '#dc2626', show: d.unscheduled > 0 },
    { n: String(d.noAbs), t: 'فوج أعمال موجهة بلا تسجيل غيابات', tab: 'attendance', c: '#d97706', show: d.noAbs > 0 },
    { n: String(d.pendingJ), t: 'تبرير غياب بانتظار القرار', tab: 'attendance', c: '#0891b2', show: d.pendingJ > 0 },
    { n: String(d.pendingMk), t: 'طلب حصة تعويضية', tab: 'makeup', c: '#0891b2', show: d.pendingMk > 0 },
    { n: '🛡', t: 'المجلس التأديبي — ' + d.councils.map((c: any) => `${COUNCIL_LABEL[c.c]} ${c.n}`).join(' — '),
      tab: 'disciplinary', c: '#c9a227', show: true, info: true },
    ...(d.tut ? [{ n: '🤝', t: `الترشح للمرافقة البيداغوجية ${d.tut.open ? 'مفتوح' : 'مغلق'} — عدد المترشحين: ${d.tut.n}`,
      tab: 'tutorat', c: '#16a34a', show: true, info: true }] : []),
  ];
  const shown = lines.filter(l => l.show);
  const allGood = !lines.some(l => !l.info && l.show);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display font-bold text-gray-900 text-xl">الإدارة</h2>
        <p className="text-gray-500 text-sm">الموسم الجامعي 2026/2027{department ? ` — قسم القانون ${department}` : ''}</p>
      </div>

      {/* شريط اليوم — صغير */}
      <button onClick={() => setTab('schedule')}
        className="w-full bg-white border border-gray-100 shadow-sm rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-right hover:shadow-md transition-shadow">
        <span className="flex items-center gap-1 font-bold text-[#1a3a6b]"><CalendarDays className="w-3.5 h-3.5" /> اليوم {d.dayName} {d.dateStr}</span>
        {t.has ? (
          <>
            <span className="text-gray-300">|</span><span><b className="text-gray-900">{t.td}</b> <span className="text-gray-500">حصة أعمال موجهة</span></span>
            <span className="text-gray-300">|</span><span><b className="text-gray-900">{t.lec}</b> <span className="text-gray-500">محاضرة</span></span>
            <span className="text-gray-300">|</span><span><b className="text-gray-900">{t.perm}</b> <span className="text-gray-500">أستاذا دائما اليوم</span></span>
            <span className="text-gray-300">|</span><span><b className="text-gray-900">{t.vac}</b> <span className="text-gray-500">أستاذا مؤقتا اليوم</span></span>
            <span className="text-gray-300">|</span><span><span className="text-gray-500">إشغال القاعات اليوم</span> <b className="text-gray-900">{t.occ}%</b></span>
          </>
        ) : <span className="text-gray-500">لا حصص مبرمجة اليوم</span>}
      </button>

      {/* اللافتة */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(#c9a227 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-[#c9a227]" />
              <span className="text-[#c9a227] text-xs font-semibold">مرحلة اقتراح عناوين المذكرات</span>
            </div>
            <h3 className="font-display font-bold text-xl">نسبة الاقتراح: {pct}%</h3>
            <p className="text-gray-300 text-sm mt-1">{d.proposed} أستاذا اقترحوا من {d.perm} — بقي {Math.max(0, d.perm - d.proposed)}</p>
          </div>
          <div className="w-16 h-16 relative flex-shrink-0">
            <svg width="64" height="64" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a227" strokeWidth="3"
                strokeDasharray={`${(pct / 100) * 87.96} ${87.96}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-display font-bold text-white text-sm">{pct}%</div>
          </div>
        </div>
      </div>

      {/* المربعات */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: 'الأساتذة', v: d.profs, i: Users, c: '#1a3a6b', bg: 'rgba(26,58,107,.08)', t: 'professors' },
          { l: 'اقترحوا عناوين', v: d.proposed, i: CheckCircle, c: '#059669', bg: 'rgba(5,150,105,.08)', t: 'thesis' },
          { l: 'لم يقترحوا', v: Math.max(0, d.perm - d.proposed), i: ScrollText, c: '#d97706', bg: 'rgba(217,119,6,.08)', t: 'thesis' },
          { l: 'مترشحو المجالس', v: d.nomProfs, i: Shield, c: '#c9a227', bg: 'rgba(201,162,39,.10)', t: 'disciplinary' },
          { l: 'مترشحو المرافقة', v: d.tut ? d.tut.n : '—', i: HeartHandshake, c: '#16a34a', bg: 'rgba(22,163,74,.08)', t: d.tut ? 'tutorat' : 'dashboard' },
        ].map(s => {
          const Icon = s.i;
          return (
            <button key={s.l} onClick={() => setTab(s.t)}
              className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-right hover:shadow-md transition-all cursor-pointer"
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: s.bg }}>
                <Icon style={{ color: s.c }} size={18} />
              </div>
              <p className="font-display font-bold text-2xl text-gray-900">{s.v}</p>
              <p className="text-gray-400 text-xs mt-1">{s.l}</p>
            </button>
          );
        })}
      </div>

      {/* يحتاج انتباهك */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <h3 className="font-display font-bold text-gray-800 text-sm mb-4">يحتاج انتباهك</h3>
        <div className="space-y-3">
          {allGood && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white" style={{ background: '#15803d', border: '2px solid #15803d' }}>✓</div>
              <span className="flex-1 text-sm text-green-700">الإسناد والتوقيت والغيابات والطلبات: لا شيء معلق</span>
            </div>
          )}
          {shown.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="min-w-8 h-8 px-1.5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${s.c}15`, color: s.c, border: `2px solid ${s.c}` }}>
                {s.n}
              </div>
              <span className="flex-1 text-sm text-slate-600">{s.t}</span>
              <button onClick={() => setTab(s.tab)}
                className="text-xs px-3 py-1 rounded-lg transition-colors hover:opacity-80 flex-shrink-0"
                style={{ background: `${s.c}12`, color: s.c }}>
                انتقل →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* إجراءات سريعة */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-display font-bold text-gray-800 text-sm mb-3">إجراءات سريعة</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'المذكرات', tab: 'thesis', style: { background: 'linear-gradient(135deg,#1a3a6b,#0d2040)', color: 'white' } },
            { label: 'المجلس التأديبي', tab: 'disciplinary', style: { background: 'linear-gradient(135deg,#c9a227,#a07820)', color: 'white' } },
            ...(tutoratMode ? [{ label: 'المرافقة البيداغوجية', tab: 'tutorat', style: { background: 'linear-gradient(135deg,#059669,#065f46)', color: 'white' } }] : []),
            { label: 'التوقيت', tab: 'schedule', style: { background: '#f1f5f9', color: '#475569' } },
          ].map(a => (
            <button key={a.label} onClick={() => setTab(a.tab)}
              className="px-4 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-90" style={a.style}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
