import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle, Clock, User, MapPin, Loader2, Megaphone } from 'lucide-react';

// ممثل الفوج: تأكيد الحصص «تمت / لم تتم» + ملاحظة اختيارية. لا يراه الأستاذ.

interface RepStudent { mat_bac: string; annee_bac: number | null }

export interface RepSession {
  schedule_id: string; date: string; start: string; end: string; kind: string;
  module: string; professor: string; room: string | null;
  status: 'تمت' | 'لم تتم' | null; note: string | null; started: boolean;
}
export interface RepData {
  role: 'ممثل' | 'نائب'; level: string; section: number; groupe: number; today: string; sessions: RepSession[];
}

export function useRep(student: RepStudent | null) {
  const [data, setData] = useState<RepData | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    if (!student) return;
    setLoading(true);
    const { data: d, error } = await supabase.rpc('gr_my', { p_bac: student.mat_bac, p_year: student.annee_bac });
    if (!error) setData((d as RepData) || null);
    setLoading(false);
  }
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line */ }, [student?.mat_bac]);
  const pending = data ? data.sessions.filter(s => !s.status && s.started).length : 0;
  return { data, loading, pending, reload: load };
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDay = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };

export default function StudentRepPanel({ student, data, onChanged }:
  { student: RepStudent; data: RepData; onChanged: () => void }) {
  const [rows, setRows] = useState<RepSession[]>(data.sessions);
  const [busy, setBusy] = useState<string>('');
  const [err, setErr] = useState('');
  // تُحفظ القائمة كما فُتحت، حتى لا تختفي الحصة المؤكدة قبل إضافة الملاحظة

  const key = (s: RepSession) => s.schedule_id + s.date;

  async function save(s: RepSession, status: RepSession['status'], note: string | null) {
    setBusy(key(s)); setErr('');
    const { error } = await supabase.rpc('gr_confirm', {
      p_bac: student.mat_bac, p_year: student.annee_bac, p_schedule: s.schedule_id,
      p_date: s.date, p_status: status, p_note: status ? note : null,
    });
    setBusy('');
    if (error) { setErr(error.message); return; }
    setRows(rs => rs.map(r => key(r) === key(s) ? { ...r, status, note: status ? note : null } : r));
    onChanged();
  }

  const today = rows.filter(s => s.date === data.today);
  const past = rows.filter(s => s.date !== data.today);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1a3a6b 100%)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#c9a227' }}>
          <Megaphone className="w-5 h-5 text-[#0a1628]" />
        </div>
        <div>
          <p className="text-white font-bold text-sm">{data.role === 'ممثل' ? 'ممثل' : 'نائب ممثل'} الفوج {pad(data.groupe)} — المجموعة {pad(data.section)}</p>
          <p className="text-white/60 text-xs mt-1 leading-relaxed">
            أكّد بعد كل حصة هل تمّت أم لا. الملاحظة اختيارية وتصل إلى الإدارة فقط.
          </p>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{err}</div>}

      <Section title={`حصص اليوم ${fmtDay(data.today)}`} empty="لا توجد حصص لفوجك اليوم">
        {today.map(s => <Card key={key(s)} s={s} busy={busy === key(s)} onSave={save} />)}
      </Section>

      {past.length > 0 && (
        <Section title="حصص سابقة تنتظر تأكيدك" empty="">
          {past.map(s => <Card key={key(s)} s={s} busy={busy === key(s)} onSave={save} showDate />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: any }) {
  const list = Array.isArray(children) ? children : [children];
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-500 mb-2 px-1">{title}</h3>
      {list.length === 0
        ? <p className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-xl">{empty}</p>
        : <div className="space-y-2">{list}</div>}
    </div>
  );
}

function Card({ s, busy, onSave, showDate }: {
  s: RepSession; busy: boolean; showDate?: boolean;
  onSave: (s: RepSession, status: RepSession['status'], note: string | null) => void;
}) {
  const [note, setNote] = useState(s.note || '');
  useEffect(() => { setNote(s.note || ''); }, [s.note]);
  const pick = (v: 'تمت' | 'لم تتم') => onSave(s, s.status === v ? null : v, note.trim() || null);
  const lec = s.kind === 'محاضرة';

  return (
    <div className={`bg-white border rounded-xl p-3.5 space-y-3 ${s.status === 'تمت' ? 'border-green-200' : s.status === 'لم تتم' ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <div className="text-center min-w-[52px]">
          {showDate && <p className="text-[10px] text-gray-400">{fmtDay(s.date).slice(0, 5)}</p>}
          <p className="text-sm font-bold text-[#1a3a6b]">{s.start}</p>
          <p className="text-xs text-gray-400">{s.end}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-800 text-sm">{s.module}</p>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${lec ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {lec ? 'محاضرة' : 'أعمال موجهة'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
            {s.professor && <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.professor}</span>}
            {s.room && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.room}</span>}
          </div>
        </div>
      </div>

      {!s.started ? (
        <p className="flex items-center gap-1.5 text-xs text-gray-400"><Clock className="w-3.5 h-3.5" /> يمكنك التأكيد بعد بداية الحصة ({s.start})</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => pick('تمت')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold border transition-colors disabled:opacity-50 ${
                s.status === 'تمت' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-200'}`}>
              <CheckCircle2 className="w-4 h-4" /> تمّت
            </button>
            <button disabled={busy} onClick={() => pick('لم تتم')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold border transition-colors disabled:opacity-50 ${
                s.status === 'لم تتم' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200'}`}>
              <XCircle className="w-4 h-4" /> لم تتم
            </button>
          </div>
          {busy && <p className="flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></p>}
          {s.status && (
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500}
              onBlur={() => { if ((note.trim() || null) !== (s.note || null)) onSave(s, s.status, note.trim() || null); }}
              placeholder="ملاحظة (اختيارية) — تصل إلى الإدارة فقط"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/20" />
          )}
        </>
      )}
    </div>
  );
}
