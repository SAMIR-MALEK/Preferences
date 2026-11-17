// ═══════════════════════════════════════════════════════════════════════════
// الغيابات — ثوابت ودوال مشتركة بين فضاء الأستاذ، الإدارة، وفضاء الطالب
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase';

export const ATT_YEAR = '2026-2027';

// المادة 36: خمس (05) غيابات مبررة أو غير مبررة في الأعمال الموجهة → الإقصاء من المادة
export const ABSENCE_LIMIT = 5;
export const ABSENCE_WARN = 3;

export const ABSENCE_WARNING_TEXT = 'خمس (05) غيابات، ولو كانت مبررة، تؤدي إلى الإقصاء من المادة.';

export const ST_PRESENT = 'حاضر';
export const ST_ABSENT = 'غائب';

export const J_PENDING = 'قيد الدراسة';
export const J_ACCEPTED = 'مقبول';
export const J_REJECTED = 'مرفوض';

// المادة 37: حالات الغياب المبرر
export const JUSTIFICATION_KINDS = [
  'وفاة في الأصول، الفروع أو الأقارب',
  'زواج المعني',
  'عطلة الأبوة أو الأمومة',
  'تكليف أو استدعاء رسمي',
  'مرض المعني',
  'حالة أخرى',
];
export const KIND_ILLNESS = 'مرض المعني';

export interface AttRecord {
  id?: string;
  session_id: string;
  student_id: string;
  status: string;
  module_id: string;
  group_number: number;
  session_date: string;
  is_makeup: boolean;
}

export interface AttSession {
  id: string;
  module_id: string;
  level_id: string | null;
  section_number: number | null;
  group_number: number;
  session_date: string;
  is_makeup: boolean;
  professor_id: string | null;
  assignment_id: string | null;
  created_at?: string;
}

export interface Justification {
  id: string;
  student_id: string;
  date_from: string;
  date_to: string;
  kind: string;
  reason: string | null;
  file_url: string | null;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

// ── تواريخ ────────────────────────────────────────────────────────────────
// YYYY-MM-DD ← DD/MM/YYYY (بدون تحويل مناطق زمنية)
export function fmtDay(d?: string | null): string {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : String(d);
}
export function fmtDayShort(d?: string | null): string {
  if (!d) return '';
  const [, m, day] = String(d).slice(0, 10).split('-');
  return m && day ? `${day}/${m}` : String(d);
}
export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
export function dayOnly(d?: string | null): string {
  return d ? String(d).slice(0, 10) : '';
}

// ── قواعد العدّ ───────────────────────────────────────────────────────────
// الغياب لا يُحتسب إذا كانت الحصة في فوج الطالب الحالي وقبل تاريخ إدراجه فيه.
// الغيابات المسجلة في فوج سابق تبقى محسوبة عليه (الغياب يتبع الطالب في المقياس).
export function recordCounts(
  rec: { status: string; session_date: string; group_number: number },
  student: { groupe?: number | null; groupe_since?: string | null } | undefined | null,
): boolean {
  if (rec.status !== ST_ABSENT) return false;
  if (student?.groupe_since && student.groupe === rec.group_number
      && dayOnly(rec.session_date) < dayOnly(student.groupe_since)) return false;
  return true;
}

// هل الطالب معني بحصة بتاريخ معيّن في فوجه الحالي؟
export function concernedBy(student: { groupe_since?: string | null }, sessionDate: string): boolean {
  if (!student.groupe_since) return true;
  return dayOnly(sessionDate) >= dayOnly(student.groupe_since);
}

// حالة التبرير لغياب بتاريخ معيّن: مقبول > قيد الدراسة > مرفوض
export function justificationFor(date: string, justs: Justification[] | undefined): Justification | null {
  if (!justs || justs.length === 0) return null;
  const d = dayOnly(date);
  const cover = justs.filter(j => dayOnly(j.date_from) <= d && d <= dayOnly(j.date_to));
  if (cover.length === 0) return null;
  return cover.find(j => j.status === J_ACCEPTED)
    || cover.find(j => j.status === J_PENDING)
    || cover[0];
}

export type AbsLevel = 'ok' | 'warn' | 'limit' | 'excluded';
export function absenceLevel(count: number, excluded: boolean): AbsLevel {
  if (excluded) return 'excluded';
  if (count >= ABSENCE_LIMIT) return 'limit';
  if (count >= ABSENCE_WARN) return 'warn';
  return 'ok';
}
export const LEVEL_STYLE: Record<AbsLevel, { bg: string; color: string; border: string; label: string }> = {
  ok:       { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', label: 'عادي' },
  warn:     { bg: '#fef3c7', color: '#b45309', border: '#fcd34d', label: 'تحذير' },
  limit:    { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', label: 'بلغ حد الإقصاء' },
  excluded: { bg: '#7f1d1d', color: '#ffffff', border: '#7f1d1d', label: 'مقصى' },
};
export const J_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  [J_PENDING]:  { bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
  [J_ACCEPTED]: { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  [J_REJECTED]: { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
};

// ── جلب كل الأسطر (تجاوز حد 1000 سطر) ─────────────────────────────────────
export async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// تقسيم قائمة معرفات لاستعلامات in() حتى لا يطول الرابط
export function chunk<T>(arr: T[], size = 80): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchByIds<T = any>(table: string, cols: string, col: string, ids: string[]): Promise<T[]> {
  let all: T[] = [];
  for (const part of chunk([...new Set(ids)].filter(Boolean))) {
    const rows = await fetchAll<T>(() => supabase.from(table).select(cols).in(col, part));
    all = all.concat(rows);
  }
  return all;
}

export function escHtml(v: any): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
