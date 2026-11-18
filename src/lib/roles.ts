// ═══════════════════════════════════════════════════════════════════════════
// المناصب البيداغوجية والإدارية — مرجع واحد لكل المنصة
// كل أستاذ يشغل منصباً واحداً على الأكثر، وكل منصب فريد في نطاقه
// (إلا عضوية اللجنة العلمية وبعض أعضاء المجلس العلمي: عدة أعضاء في النطاق نفسه)
// عضوية المجلس العلمي بحكم المنصب (العميد، النائبان، رئيسا القسمين، رئيسا اللجنتين) تلقائية وتُعرض في صفحة الهيكل
// ═══════════════════════════════════════════════════════════════════════════

export type RoleScope = 'none' | 'department' | 'specialty';

export interface RoleDef {
  key: string;
  label: string;
  scope: RoleScope;
  multi?: boolean;      // عدة شاغلين في النطاق نفسه
  group: string;
}

export const ROLE_DEFS: RoleDef[] = [
  { key: 'dean',               label: 'عميد الكلية',                      scope: 'none',       group: 'إدارة الكلية' },
  { key: 'vice_dean',          label: 'نائب العميد المكلف بالبيداغوجيا',  scope: 'none',       group: 'إدارة الكلية' },
  { key: 'vice_dean_research', label: 'نائب العميد المكلف بالبحث العلمي', scope: 'none',       group: 'إدارة الكلية' },
  { key: 'dept_head',          label: 'رئيس القسم',                       scope: 'department', group: 'الأقسام' },
  { key: 'sci_head',           label: 'رئيس اللجنة العلمية',              scope: 'department', group: 'اللجان العلمية للأقسام' },
  { key: 'sci_member',         label: 'عضو اللجنة العلمية',               scope: 'department', group: 'اللجان العلمية للأقسام', multi: true },
  { key: 'council_head',       label: 'رئيس المجلس العلمي للكلية',        scope: 'none',       group: 'المجلس العلمي للكلية' },
  { key: 'council_member',     label: 'عضو المجلس العلمي',                scope: 'none',       group: 'المجلس العلمي للكلية', multi: true },
  { key: 'field_head',         label: 'مسؤول الميدان',                    scope: 'none',       group: 'الميدان والشعبة والتخصصات' },
  { key: 'branch_head',        label: 'مسؤول شعبة الحقوق',               scope: 'none',       group: 'الميدان والشعبة والتخصصات' },
  { key: 'spec_head',          label: 'مسؤول التخصص',                     scope: 'specialty',  group: 'الميدان والشعبة والتخصصات' },
];

// الأقسام: القيم نفسها المستعملة في levels.department و admins.department
export const DEPARTMENTS: { value: string; label: string }[] = [
  { value: 'عام', label: 'قسم القانون العام' },
  { value: 'خاص', label: 'قسم القانون الخاص' },
];

// أسماء مختلفة للتخصص نفسه في جدول المستويات → الاسم المعتمد
const SPECIALITY_ALIASES: Record<string, string> = {
  'قانون التهيئة والتعمير': 'قانون عقاري',
  'قانون الأعمال': 'قانون أعمال',
};
export function normalizeSpeciality(sp?: string | null): string {
  const s = String(sp || '').trim();
  return SPECIALITY_ALIASES[s] || s;
}

export function roleDef(key?: string | null): RoleDef | undefined {
  return ROLE_DEFS.find(r => r.key === key);
}

export function scopeLabel(role: string, scope?: string | null): string {
  const d = roleDef(role);
  if (!d || d.scope === 'none' || !scope) return '';
  if (d.scope === 'department') return DEPARTMENTS.find(x => x.value === scope)?.label || scope;
  return `تخصص ${scope}`;
}

// العنوان الكامل للمنصب، مثلاً: «رئيس قسم القانون الخاص» أو «مسؤول تخصص قانون أعمال»
export function roleTitle(role?: string | null, scope?: string | null): string {
  const d = roleDef(role);
  if (!d) return '';
  if (d.scope === 'department') {
    const dep = DEPARTMENTS.find(x => x.value === scope);
    if (!dep) return d.label;
    if (d.key === 'dept_head') return `رئيس ${dep.label}`;
    return `${d.label} ل${dep.label}`;          // رئيس/عضو اللجنة العلمية لقسم القانون الخاص
  }
  if (d.key === 'spec_head') return scope ? `مسؤول تخصص ${scope}` : d.label;
  return d.label;
}
