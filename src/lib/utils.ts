// إرجاع الأرقام كما هي (لاتينية)
export function toArabicNum(n: number | string): string {
  return String(n);
}

// تنسيق الأعداد العشرية
export function toArabicFixed(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}
