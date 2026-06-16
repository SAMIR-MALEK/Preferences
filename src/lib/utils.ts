// تحويل الأرقام اللاتينية إلى عربية
export function toArabicNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

// تنسيق الأعداد العشرية بالأرقام العربية
export function toArabicFixed(n: number, decimals = 2): string {
  return toArabicNum(n.toFixed(decimals));
}
