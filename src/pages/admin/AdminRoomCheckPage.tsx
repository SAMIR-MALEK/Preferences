import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Printer, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchAll } from '../../lib/attendance';

// بطاقة متابعة حضور الأساتذة عبر القاعات — يأخذها المسؤول ويطوف بها
// اختيار تاريخ (+ حصة أو كل حصص اليوم مرتبة بالساعة). القاعات الفارغة تظهر، والحصص عن بعد لا تظهر.

const YEAR = '2026-2027';
const SEM = 1;
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const pad = (n: any) => String(n ?? '').padStart(2, '0');
const hm = (t: any) => String(t || '').slice(0, 5);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface Row { room: string; floor: string; entries: { level: string; module: string; kind: string; prof: string }[] }
interface Sheet { slotLabel: string; start: string; rows: Row[] }

export default function AdminRoomCheckPage() {
  const [date, setDate] = useState(todayISO());
  const [slotId, setSlotId] = useState<string>('all');
  const [dept, setDept] = useState<'all' | 'عام' | 'خاص'>('all');           // فلترة بالقسم
  const [occ, setOcc] = useState<'all' | 'busy' | 'free'>('all');           // القاعات: الكل / المشغولة / الشاغرة
  const [slots, setSlots] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [sch, setSch] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const dayName = useMemo(() => { const [y, m, d] = date.split('-').map(Number); return DAYS[new Date(y, m - 1, d).getDay()]; }, [date]);
  const daySlots = useMemo(() => slots.filter(s => s.day === dayName)
    .sort((a, b) => (a.slot_number ?? 0) - (b.slot_number ?? 0) || String(a.start_time).localeCompare(String(b.start_time))), [slots, dayName]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: ts }, { data: rm }] = await Promise.all([
          supabase.from('time_slots').select('id, day, start_time, end_time, slot_number'),
          supabase.from('rooms').select('id, name, code, floor').eq('is_active', true),
        ]);
        setSlots(ts || []);
        setRooms((rm || []).sort((a: any, b: any) =>
          String(a.floor ?? '').localeCompare(String(b.floor ?? ''), 'ar', { numeric: true })
          || String(a.name || a.code).localeCompare(String(b.name || b.code), 'ar', { numeric: true })));
      } catch (e: any) { setErr(e.message); }
    })();
  }, []);

  useEffect(() => {
    if (slots.length === 0) return;
    const ids = daySlots.map(s => s.id);
    setSlotId(prev => (prev !== 'all' && !ids.includes(prev) ? 'all' : prev));
    if (ids.length === 0) { setSch([]); setLoading(false); return; }
    setLoading(true); setErr('');
    fetchAll<any>(() => supabase.from('schedules')
      .select('id, room_id, time_slot_id, custom_module, custom_professor, assignment:assignments(teaching_type, section_number, group_number, module:modules(name_ar), level:levels(code, name_ar, department), professor:professors(last_name, first_name))')
      .eq('academic_year', YEAR).eq('semester', SEM).in('time_slot_id', ids).order('id'))
      .then(d => setSch(d.filter((s: any) => s.room_id && s.time_slot_id)))   // الحصص عن بعد (بلا قاعة/خانة) لا تظهر
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [daySlots, slots.length]);

  const sheets: Sheet[] = useMemo(() => {
    const chosen = slotId === 'all' ? daySlots : daySlots.filter(s => s.id === slotId);
    return chosen.map(s => {
      const here = sch.filter((x: any) => x.time_slot_id === s.id);
      const rows: Row[] = [];
      rooms.forEach((r: any) => {
        const inRoom = here.filter((x: any) => x.room_id === r.id);
        const vacant = inRoom.length === 0;                       // شاغرة فعلا (لكل الأقسام)
        const mine = dept === 'all' ? inRoom : inRoom.filter((x: any) => x.assignment?.level?.department === dept);
        if (occ === 'free' && !vacant) return;
        if (occ === 'busy' && mine.length === 0) return;
        if (!vacant && mine.length === 0) return;                // مشغولة بحصص قسم آخر
        const entries = mine.map((x: any) => {
          const a = x.assignment;
          const isLec = a?.teaching_type === 'محاضرة';
          return {
            level: a ? `${a.level?.code || a.level?.name_ar || ''} — ${isLec ? 'م' + pad(a.section_number) : 'ف' + pad(a.group_number)}` : '—',
            module: a?.module?.name_ar || x.custom_module || '—',
            kind: a ? (isLec ? 'محاضرة' : 'أ.م') : '—',
            prof: a?.professor ? `${a.professor.last_name || ''} ${a.professor.first_name || ''}`.trim() : (x.custom_professor || '—'),
          };
        });
        rows.push({ room: r.name || r.code, floor: r.floor ?? '', entries });
      });
      return { slotLabel: `${hm(s.start_time)} – ${hm(s.end_time)}`, start: hm(s.start_time), rows };
    });
  }, [slotId, daySlots, sch, rooms, dept, occ]);

  const dateFr = date.split('-').reverse().join('/');
  const filterLabel = [dept !== 'all' ? `قسم القانون ${dept}` : '', occ === 'free' ? 'القاعات الشاغرة' : occ === 'busy' ? 'القاعات المشغولة' : '']
    .filter(Boolean).join(' — ');

  function print() {
    const w = window.open('', '_blank');
    if (!w) { alert('اسمح بالنوافذ المنبثقة للطباعة'); return; }
    const pages = sheets.map(sh => {
      const body = sh.rows.map(r => {
        if (r.entries.length === 0) return `<tr class="empty"><td class="room">${esc(r.room)}</td><td colspan="4">— لا حصة مبرمجة —</td><td></td><td></td><td></td><td></td></tr>`;
        return r.entries.map((e, i) => `<tr>${i === 0 ? `<td class="room" rowspan="${r.entries.length}">${esc(r.room)}</td>` : ''}
          <td>${esc(e.level)}</td><td class="mod">${esc(e.module)}</td><td>${esc(e.kind)}</td><td class="prof">${esc(e.prof)}</td>
          <td class="box"></td><td class="box"></td><td class="box"></td><td class="note"></td></tr>`).join('');
      }).join('');
      const n = sh.rows.reduce((k, r) => k + r.entries.length, 0);
      return `<section class="page">
        <div class="hd">الجمهورية الجزائرية الديمقراطية الشعبية<br>وزارة التعليم العالي والبحث العلمي<br>جامعة محمد البشير الإبراهيمي — برج بوعريريج<br>كلية الحقوق والعلوم السياسية</div>
        <h2>بطاقة متابعة حضور الأساتذة</h2>
        <div class="meta"><span>اليوم: <b>${esc(dayName)}</b></span><span>التاريخ: <b>${esc(dateFr)}</b></span><span>الحصة: <b>${esc(sh.slotLabel)}</b></span><span>الحصص المبرمجة: <b>${n}</b></span>${filterLabel ? `<span><b>${esc(filterLabel)}</b></span>` : ''}</div>
        <table><thead><tr><th>القاعة</th><th>المستوى / الفوج</th><th>المقياس</th><th>النوع</th><th>الأستاذ</th><th>حاضر</th><th>غائب</th><th>متأخر</th><th>ملاحظة</th></tr></thead>
        <tbody>${body}</tbody></table>
        <div class="foot">
          <div>عدد الحاضرين: ........ &nbsp; عدد الغائبين: ........ &nbsp; عدد المتأخرين: ........</div>
          <div class="sig"><span>اسم ولقب المسؤول: ................................</span><span>التوقيع: ................</span></div>
        </div>
      </section>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>بطاقة متابعة حضور الأساتذة — ${esc(dateFr)}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: 'Traditional Arabic','Amiri','Times New Roman',serif; color:#000; margin:0; font-size: 10.5pt; }
      .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
      .hd { text-align:center; font-weight:bold; line-height:1.45; font-size: 10.5pt; }
      h2 { text-align:center; margin: 6px 0 4px; font-size: 15pt; }
      .meta { display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin-bottom:6px; font-size: 11pt; }
      table { width:100%; border-collapse: collapse; }
      th, td { border:1px solid #000; padding: 3px 4px; text-align:center; vertical-align: middle; }
      th { background:#e8e8e8; font-size: 10pt; }
      td.room { font-weight:bold; white-space:nowrap; }
      td.mod, td.prof { text-align:right; }
      td.box { width: 32px; } td.note { width: 90px; }
      tr.empty td { color:#555; font-style: italic; }
      .foot { margin-top: 8px; font-size: 11pt; line-height: 2; }
      .sig { display:flex; justify-content:space-between; }
    </style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  const total = sheets.reduce((k, s) => k + s.rows.reduce((j, r) => j + r.entries.length, 0), 0);
  const freeCount = sheets.reduce((k, s) => k + s.rows.filter(r => r.entries.length === 0).length, 0);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1a3a6b] flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-[#c9a227]" /></div>
        <div>
          <h2 className="font-bold text-gray-900 text-lg">بطاقة متابعة حضور الأساتذة</h2>
          <p className="text-xs text-gray-500">اختر اليوم والحصة، ثم اطبع البطاقة وطُف بها عبر القاعات.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] text-gray-500 mb-1">التاريخ</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-1">الحصة</p>
          <select value={slotId} onChange={e => setSlotId(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="all">كل حصص اليوم</option>
            {daySlots.map(s => <option key={s.id} value={s.id}>{hm(s.start_time)} – {hm(s.end_time)}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-1">القسم</p>
          <select value={dept} onChange={e => setDept(e.target.value as any)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="all">كل الأقسام</option>
            <option value="عام">قسم القانون العام</option>
            <option value="خاص">قسم القانون الخاص</option>
          </select>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-1">القاعات</p>
          <select value={occ} onChange={e => setOcc(e.target.value as any)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="all">كل القاعات</option>
            <option value="busy">المشغولة فقط</option>
            <option value="free">الشاغرة فقط</option>
          </select>
        </div>
        <span className="text-xs text-gray-500 pb-2">{dayName} — {occ === 'free' ? `${freeCount} قاعة شاغرة` : `${total} حصة مبرمجة`} في {sheets.length} {sheets.length === 1 ? 'ورقة' : 'أوراق'}</span>
        <button onClick={print} disabled={loading || sheets.length === 0}
          className="mr-auto flex items-center gap-2 bg-[#1a3a6b] text-white rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">
          <Printer className="w-4 h-4" /> طباعة البطاقة
        </button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{err}</div>}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        : daySlots.length === 0 ? <p className="text-center text-sm text-gray-400 py-10">لا توجد حصص في يوم {dayName}</p>
        : sheets.map(sh => (
          <div key={sh.slotLabel} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-[#1a3a6b] text-white px-4 py-2 text-sm font-bold flex justify-between">
              <span>{sh.slotLabel}</span><span className="text-[#c9a227]">{occ === 'free' ? `${sh.rows.length} قاعة شاغرة` : `${sh.rows.reduce((k, r) => k + r.entries.length, 0)} حصة`}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr><th className="px-2 py-2 text-right">القاعة</th><th className="px-2 py-2 text-right">المستوى / الفوج</th><th className="px-2 py-2 text-right">المقياس</th><th className="px-2 py-2">النوع</th><th className="px-2 py-2 text-right">الأستاذ</th></tr>
                </thead>
                <tbody>
                  {sh.rows.map(r => r.entries.length === 0 ? (
                    <tr key={r.room} className="border-t border-gray-100 text-gray-400"><td className="px-2 py-1.5 font-bold">{r.room}</td><td colSpan={4} className="px-2 py-1.5 italic">لا حصة مبرمجة</td></tr>
                  ) : r.entries.map((e, i) => (
                    <tr key={r.room + i} className="border-t border-gray-100">
                      {i === 0 && <td rowSpan={r.entries.length} className="px-2 py-1.5 font-bold text-[#1a3a6b] whitespace-nowrap">{r.room}</td>}
                      <td className="px-2 py-1.5 whitespace-nowrap">{e.level}</td><td className="px-2 py-1.5">{e.module}</td>
                      <td className="px-2 py-1.5 text-center">{e.kind}</td><td className="px-2 py-1.5">{e.prof}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}
