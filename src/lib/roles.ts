// ═══════════════════════════════════════════════════════════════════════════
// المناصب البيداغوجية والإدارية — مرجع واحد لكل المنصة
// كل أستاذ يشغل منصباً واحداً على الأكثر، وكل منصب فريد في نطاقه
// (إلا عضوية اللجنة العلمية: عدة أعضاء في كل تخصص)
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
  { key: 'field_head',         label: 'مسؤول الميدان',                    scope: 'none',       group: 'الميدان والشعبة' },
  { key: 'branch_head',        label: 'مسؤول شعبة الحقوق',               scope: 'none',       group: 'الميدان والشعبة' },
  { key: 'spec_head',          label: 'مسؤول التخصص',                     scope: 'specialty',  group: 'التخصصات' },
  { key: 'sci_head',           label: 'رئيس اللجنة العلمية',              scope: 'specialty',  group: 'التخصصات' },
  { key: 'sci_member',         label: 'عضو اللجنة العلمية',               scope: 'specialty',  group: 'التخصصات', multi: true },
];

// الأقسام: القيم نفسها المستعملة في levels.department و admins.department
export const DEPARTMENTS: { value: string; label: string }[] = [
  { value: 'عام', label: 'قسم القانون العام' },
  { value: 'خاص', label: 'قسم القانون الخاص' },
];

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
    return dep ? `رئيس ${dep.label}` : d.label;
  }
  if (d.key === 'spec_head') return scope ? `مسؤول تخصص ${scope}` : d.label;
  if (d.scope === 'specialty') return scope ? `${d.label} — تخصص ${scope}` : d.label;
  return d.label;
}
