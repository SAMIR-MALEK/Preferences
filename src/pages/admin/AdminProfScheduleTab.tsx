import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Printer } from 'lucide-react';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

export default function AdminProfScheduleTab() {
  const [profs, setProfs] = useState<any[]>([]);
  const [selectedProf, setSelectedProf] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [schedule, setSchedule] = useState<any[]>([]);
  const [unscheduled, setUnscheduled] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalHours, setTotalHours] = useState(0);

  useEffect(() => {
    supabase.from('professors').select('id, last_name, first_name, username, rank')
      .order('last_name')
      .then(({ data }) => { if (data) setProfs(data); });
  }, []);

  async function loadProfSchedule(prof: any) {
    setSelectedProf(prof);
    setLoading(true);
    setSchedule([]);
    setUnscheduled([]);

    // جلب كل إسنادات الأستاذ
    const { data: assignments } = await supabase.from('assignments')
      .select('id, module_id, teaching_type, section_number, group_number, weekly_hours, level:levels(name_ar), module:modules(name_ar)')
      .eq('professor_id', prof.id)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    if (!assignments || assignments.length === 0) { setLoading(false); return; }

    const total = assignments.reduce((sum: number, a: any) => sum + (a.weekly_hours || 0), 0);
    setTotalHours(total);

    const lecIds = assignments.filter((a: any) => a.teaching_type === 'محاضرة').map((a: any) => a.id);
    const tdIds = assignments.filter((a: any) => a.teaching_type === 'أعمال موجهة').map((a: any) => a.id);
    const allIds = [...lecIds, ...tdIds];

    // جلب الحصص المبرمجة
    const { data: sch } = await supabase.from('schedules')
      .select('id, assignment_id, room_id, time_slot_id, time_slot:time_slots(day, start_time, end_time, slot_number)')
      .in('assignment_id', allIds)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    // جلب القاعات
    const roomIds = [...new Set((sch || []).map((s: any) => s.room_id).filter(Boolean))];
    const { data: rooms } = roomIds.length > 0
      ? await supabase.from('rooms').select('id, name').in('id', roomIds)
      : { data: [] };
    const roomMap = new Map((rooms || []).map((r: any) => [r.id, r.name]));

    const aMap = new Map(assignments.map((a: any) => [a.id, a]));
    const scheduledIds = new Set((sch || []).map((s: any) => s.assignment_id));

    const scheduled = (sch || []).map((s: any) => {
      const a = aMap.get(s.assignment_id) as any;
      return {
        id: s.id,
        day: s.time_slot?.day,
        start_time: s.time_slot?.start_time?.slice(0, 5),
        end_time: s.time_slot?.end_time?.slice(0, 5),
        slot_number: s.time_slot?.slot_number,
        module_name: a?.module?.name_ar || '—',
        level_name: a?.level?.name_ar || '—',
        teaching_type: a?.teaching_type,
        section: a?.section_number,
        group: a?.group_number,
        room: roomMap.get(s.room_id) || '—',
        weekly_hours: a?.weekly_hours,
      };
    }).filter((s: any) => s.day);

    // ترتيب باليوم والوقت
    const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
    scheduled.sort((a: any, b: any) => {
      const di = (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99);
      return di !== 0 ? di : (a.slot_number - b.slot_number);
    });

    setSchedule(scheduled);

    // غير المبرمجة
    const unsch = assignments.filter((a: any) => !scheduledIds.has(a.id)).map((a: any) => ({
      module_name: a.module?.name_ar || '—',
      level_name: a.level?.name_ar || '—',
      teaching_type: a.teaching_type,
      section: a.section_number,
      group: a.group_number,
      weekly_hours: a.weekly_hours,
    }));
    setUnscheduled(unsch);
    setLoading(false);
  }

  function printSchedule() {
    if (!selectedProf) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = schedule.map(s => `
      <tr>
        <td>${s.day}</td>
        <td>${s.start_time} — ${s.end_time}</td>
        <td>${s.level_name}</td>
        <td>${s.teaching_type === 'محاضرة' ? `المجموعة ${String(s.section).padStart(2,'0')}` : `الفوج ${String(s.group).padStart(2,'0')}`}</td>
        <td>${s.module_name}</td>
        <td>${s.teaching_type}</td>
        <td>${s.room}</td>
        <td>${s.weekly_hours}س</td>
      </tr>`).join('');
    const unrows = unscheduled.map(s => `
      <tr style="color:#999">
        <td colspan="2">غير مبرمج</td>
        <td>${s.level_name}</td>
        <td>${s.teaching_type === 'محاضرة' ? `المجموعة ${String(s.section).padStart(2,'0')}` : `الفوج ${String(s.group).padStart(2,'0')}`}</td>
        <td>${s.module_name}</td>
        <td>${s.teaching_type}</td>
        <td>—</td>
        <td>${s.weekly_hours}س</td>
      </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <style>body{font-family:Arial;padding:20px;direction:rtl}
    h2{color:#1a3a6b}table{width:100%;border-collapse:collapse;margin:10px 0}
    td,th{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#1a3a6b;color:white}
    .total{font-weight:bold;color:#1a3a6b;margin-top:10px}
    </style></head><body>
    <div style="text-align:center;margin-bottom:15px">
      <p style="font-size:11px;color:#666">الجمهورية الجزائرية الديمقراطية الشعبية</p>
      <p style="font-weight:bold">جامعة محمد البشير الإبراهيمي — برج بوعريريج</p>
      <p style="color:#1a3a6b;font-weight:bold">كلية الحقوق والعلوم السياسية</p>
      <h2>التكليف البيداغوجي الأسبوعي — الموسم 2026/2027</h2>
      <h3>أ. ${selectedProf.last_name} ${selectedProf.first_name} — ${selectedProf.rank || 'أستاذ مؤقت'}</h3>
    </div>
    <table>
      <thead><tr><th>اليوم</th><th>الوقت</th><th>المستوى</th><th>المجموعة/الفوج</th><th>المقياس</th><th>النوع</th><th>القاعة</th><th>الحجم الساعي</th></tr></thead>
      <tbody>${rows}${unrows}</tbody>
    </table>
    <p class="total">الحجم الساعي الإجمالي: ${totalHours.toFixed(2)} ساعة أسبوعياً</p>
    <div style="margin-top:40px;display:flex;justify-content:space-between">
      <div style="text-align:center"><div style="border-top:1px solid #000;width:150px;margin:0 auto;padding-top:5px;font-size:11px">توقيع الأستاذ</div></div>
      <div style="text-align:center"><div style="border-top:1px solid #000;width:150px;margin:0 auto;padding-top:5px;font-size:11px">نائب العميد المكلف بالبيداغوجيا</div></div>
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const filteredProfs = profs.filter(p =>
    `${p.last_name} ${p.first_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const isVacataire = (p: any) => String(p.username || '').startsWith('V');

  const permanent = filteredProfs.filter(p => !isVacataire(p));
  const vacataire = filteredProfs.filter(p => isVacataire(p));

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">برامج الأساتذة</h2>
          <p className="text-gray-500 text-sm">التكليف البيداغوجي الأسبوعي — 2026/2027</p>
        </div>
        {selectedProf && (
          <button onClick={printSchedule}
            className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors">
            <Printer className="w-4 h-4" /> طباعة
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* قائمة الأساتذة */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم..."
                className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-50">
            {permanent.map(p => (
              <div key={p.id} onClick={() => loadProfSchedule(p)}
                className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedProf?.id === p.id ? 'bg-blue-50/50 border-r-2 border-[#1a3a6b]' : ''}`}>
                <p className="font-medium text-gray-800 text-sm">{p.last_name} {p.first_name}</p>
                <p className="text-xs text-gray-400">{p.rank}</p>
              </div>
            ))}
            {vacataire.length > 0 && (
              <>
                <div className="bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 border-t border-amber-100">أساتذة مؤقتون</div>
                {vacataire.map(p => (
                  <div key={p.id} onClick={() => loadProfSchedule(p)}
                    className={`p-3 cursor-pointer hover:bg-amber-50/50 transition-colors ${selectedProf?.id === p.id ? 'bg-blue-50/50 border-r-2 border-[#1a3a6b]' : ''}`}>
                    <p className="font-medium text-amber-800 text-sm">{p.last_name} {p.first_name}</p>
                    <p className="text-xs text-amber-400">{p.username}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* البرنامج */}
        <div className="lg:col-span-2 space-y-3">
          {!selectedProf && (
            <div className="bg-white rounded-2xl h-40 flex items-center justify-center text-gray-400 text-sm border border-gray-100">
              اختر أستاذاً لعرض برنامجه
            </div>
          )}

          {selectedProf && loading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin h-6 w-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full" />
            </div>
          )}

          {selectedProf && !loading && (
            <>
              <div className="bg-gradient-to-r from-[#1a3a6b] to-[#0d2040] text-white rounded-2xl p-4">
                <p className="font-bold text-lg">أ. {selectedProf.last_name} {selectedProf.first_name}</p>
                <p className="text-blue-200 text-sm">{selectedProf.rank || 'أستاذ مؤقت'}</p>
                <p className="text-[#c9a227] font-bold mt-2">الحجم الساعي: {totalHours.toFixed(2)} ساعة/أسبوع</p>
              </div>

              {/* المحاضرات والأعمال الموجهة المبرمجة */}
              {schedule.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                    <p className="text-xs font-bold text-blue-700">الحصص المبرمجة</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {schedule.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-[90px] text-center">
                          <p className="text-xs font-bold text-[#1a3a6b]">{s.day}</p>
                          <p className="text-[10px] text-gray-400">{s.start_time} — {s.end_time}</p>
                        </div>
                        <div className="w-px h-10 bg-gray-200" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-800 text-xs">{s.module_name}</p>
                          <p className="text-gray-400 text-[10px] mt-0.5">
                            {s.level_name} —
                            {s.teaching_type === 'محاضرة' ? ` المجموعة ${String(s.section).padStart(2,'0')}` : ` الفوج ${String(s.group).padStart(2,'0')}`} —
                            {s.room}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'}`}>
                          {s.teaching_type}
                        </span>
                        <span className="text-[10px] text-gray-400">{s.weekly_hours}س</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* غير المبرمجة */}
              {unscheduled.length > 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-500">سيُبرمج توقيتها لاحقاً</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {unscheduled.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-[90px] text-center">
                          <p className="text-[10px] text-gray-300">غير مبرمج</p>
                        </div>
                        <div className="w-px h-8 bg-gray-100" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-500 text-xs">{s.module_name}</p>
                          <p className="text-gray-300 text-[10px] mt-0.5">
                            {s.level_name} —
                            {s.teaching_type === 'محاضرة' ? ` المجموعة ${String(s.section).padStart(2,'0')}` : ` الفوج ${String(s.group).padStart(2,'0')}`}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-400' : 'bg-teal-50 text-teal-400'}`}>
                          {s.teaching_type}
                        </span>
                        <span className="text-[10px] text-gray-300">{s.weekly_hours}س</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {schedule.length === 0 && unscheduled.length === 0 && (
                <div className="bg-white rounded-2xl p-8 text-center text-gray-400 border border-gray-100">
                  لا توجد إسنادات لهذا الأستاذ
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
