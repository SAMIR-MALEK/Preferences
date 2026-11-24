// المرافقة البيداغوجية — الترشح والاختيار
import { supabase } from './supabase';

export const TUT_YEAR = '2026-2027';
export const TUT_TITLE = 'المرافقة البيداغوجية';

export interface TutCampaign {
  academic_year: string;
  semester?: number;
  is_open: boolean;
  open_now: boolean;
  deadline?: string | null;
  field_sent_at?: string | null;
  dept_sent_at?: string | null;
}

export interface TutPrivate {
  birth_date: string; diploma: string; diploma_date: string; address: string; ccp: string;
}

export interface TutRow {
  id: string;
  professor_id: string;
  name: string;
  rank: string | null;
  phone: string | null;
  email: string | null;
  extra_hours: number;
  allowed_hours: number;
  field_decision: 'مقترح' | 'غير مقترح' | null;
  dept_opinion: 'موافق' | 'متحفظ' | null;
  dept_note: string | null;
  dean_decision: 'مصادق' | 'مرفوض' | null;
  created_at: string;
  private?: TutPrivate | null;
}

export async function tutRpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('ar-DZ', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ── قائمة مطبوعة (المصادق عليهم أو كل الملفات) ──
export function printList(title: string, rows: TutRow[], cols: { key: string; label: string; get?: (r: TutRow) => any }[]) {
  const w = window.open('', '_blank');
  if (!w) { alert('اسمح بالنوافذ المنبثقة للطباعة'); return; }
  const head = cols.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td>${cols.map(c => `<td>${esc(c.get ? c.get(r) : (r as any)[c.key])}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: 'Traditional Arabic','Amiri','Times New Roman',serif; font-size: 13pt; }
    .hd { text-align:center; line-height:1.6; font-weight:bold; }
    h2 { text-align:center; margin: 14px 0; font-size: 16pt; }
    table { width:100%; border-collapse: collapse; }
    th, td { border:1px solid #000; padding: 5px 6px; text-align:center; }
    th { background:#eee; }
    .sig { margin-top: 30px; text-align:left; padding-left: 40px; font-weight:bold; }
  </style></head><body>
  <div class="hd">الجمهورية الجزائرية الديمقراطية الشعبية<br>وزارة التعليم العالي والبحث العلمي<br>جامعة محمد البشير الإبراهيمي — برج بوعريريج<br>كلية الحقوق والعلوم السياسية</div>
  <h2>${esc(title)}</h2>
  <table><thead><tr><th>الرقم</th>${head}</tr></thead><tbody>${body}</tbody></table>
  <div class="sig">العميد</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

// الحالة النهائية المعروضة
export function tutStatus(r: Pick<TutRow, 'field_decision' | 'dept_opinion' | 'dean_decision'>): { label: string; cls: string } {
  if (r.dean_decision === 'مصادق') return { label: 'مصادق عليه', cls: 'bg-green-100 text-green-700' };
  if (r.dean_decision === 'مرفوض') return { label: 'غير مصادق', cls: 'bg-red-100 text-red-700' };
  if (r.field_decision === 'غير مقترح') return { label: 'غير مقترح', cls: 'bg-gray-100 text-gray-600' };
  if (r.dept_opinion) return { label: `رأي القسم: ${r.dept_opinion}`, cls: 'bg-blue-100 text-blue-700' };
  if (r.field_decision === 'مقترح') return { label: 'مقترح', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'مترشح', cls: 'bg-slate-100 text-slate-700' };
}
