// المرافقة البيداغوجية — الترشح والاختيار
// الأساس: المرسوم التنفيذي 09-03، القرار 148 (16/06/2010)، القرار 713 (03/11/2011)
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

export const fmtH = (n?: number | null) => {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ── عقد الالتزام الفردي: نص النموذج الرسمي (الملحق III بالقرار المؤرخ في 16 جوان 2010) ──
export function printContracts(list: any[]) {
  const w = window.open('', '_blank');
  if (!w) { alert('اسمح بالنوافذ المنبثقة للطباعة'); return; }
  const dots = (v: any, n = 40) => v ? `<b>${esc(v)}</b>` : '.'.repeat(n);
  const yr = (y: string) => { const [a, b] = String(y || TUT_YEAR).split('-'); return `${b}/${a}`; };
  const pages = list.map(c => `
  <section class="page">
    <div class="box">
      <div>نموذج عقد الالتزام الفردي بمهمة الإشراف</div>
      <div>في إطار تطبيق المادة (6) من</div>
      <div>المرسوم التنفيذي رقم 09-03 المؤرخ في 3 جانفي 2009</div>
    </div>
    <p>بين (المؤسسة الجامعية) <b>جامعة محمد البشير الإبراهيمي</b> مقرها <b>برج بوعريريج</b> والممثلة من طرف مديرها</p>
    <p>السيد ${dots('', 70)}</p>
    <p>والمشرف، السيد(ة) ${dots(c.name)}</p>
    <p>تاريخ الميلاد ${dots(fmtDate(c.birth_date))}</p>
    <p>الشهادة الجامعية المتحصل عليها ${dots(c.diploma)} بتاريخ ${dots(fmtDate(c.diploma_date), 20)}</p>
    <p>الرتبة (للأستاذ الباحث) ${dots(c.rank)}</p>
    <p>مسجل لنيل شهادة الدكتوراه ${'.'.repeat(25)} للسنة الجامعية ${'.'.repeat(20)}</p>
    <p>العنوان الشخصي ${dots(c.address, 60)}</p>
    <p>رقم الحساب الجاري البريدي ${dots(c.ccp, 30)} الهاتف ${dots(c.phone, 20)}</p>
    <p class="sp">من جهة أخرى</p>
    <p>قد تم الإتفاق على ما يلي</p>
    <p><u>المادة الأولى</u>: يكلف السيد(ة) ${dots(c.name)} بمهمة الإشراف طبقا للمادتين 2 و 3 من المرسوم التنفيذي المذكور أعلاه.</p>
    <p><u>المادة 2</u>: يلتزم المعني بأداء حجم ساعي أسبوعي بحد أقصاه اربع (4) ساعات لمدة لا تزيد عن (9) اشهر في السنة مع مراعاة أحكام الفقرة الثانية من المادة 10 من المرسوم التنفيذي المذكور أعلاه.</p>
    <p><u>المادة 3</u>: يستفيد المعني من مكافأة تحسب إستنادا لأحكام المادة 10 أو 11 من المرسوم التنفيذي المذكور أعلاه.</p>
    <p><u>المادة 4</u>: تسري أحكام هذا العقد ابتداء من السنة الجامعية ${yr(c.academic_year)}.</p>
    <p class="place">بـ ${'.'.repeat(30)} في ${'.'.repeat(25)}</p>
    <div class="sig"><span>مدير المؤسسة الجامعية</span><span>المشرف</span></div>
  </section>`).join('');
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>عقد الالتزام الفردي</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    body { font-family: 'Traditional Arabic','Amiri','Times New Roman',serif; font-size: 13pt; color:#000; margin:0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .box { border: 1px solid #000; width: 75%; margin: 0 auto 16px; padding: 8px; text-align: center; font-weight: bold; line-height: 1.7; }
    p { margin: 5px 0; line-height: 1.75; text-align: justify; }
    .sp { margin-top: 18px; }
    .place { text-align: left; margin-top: 20px; }
    .sig { display: flex; justify-content: space-between; margin-top: 26px; font-weight: bold; padding: 0 40px; }
  </style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

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
