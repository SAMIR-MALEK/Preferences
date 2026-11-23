import { useEffect, type RefObject } from 'react';

// وضع «عرض فقط» لحسابات المصالح: يُخفي أزرار الإضافة والتعديل والحذف والحفظ والاستيراد
// داخل المحتوى، ويُبقي البحث والطباعة والتصدير والتنقل. الحماية الفعلية في قاعدة البيانات
// (حسابات المصالح لا تملك صلاحية كتابة)، وهذا الحارس لإخفاء الأزرار فقط.
const WRITE_ANY = /(إضافة|اضافة|إنشاء|انشاء|تعديل|حذف|حفظ|استيراد|رفع |رفع$|إعادة تعيين|إعادة التعيين|مزامنة|توليد|مسح الكل|إلغاء الإسناد|إسناد تلقائي|جديد|إدراج في|تغيير الدور|الأدوار)/;
const WRITE_START = /^(قبول|رفض|تفعيل|تعطيل|نقل|اعتماد|تطبيق|إرسال|ارسال|تشغيل|إدراج|ادراج|تغيير|تأكيد|نشر|تحويل|دمج|إعادة|تثبيت|جديد|ترحيل|تصفير|إفراغ|إسناد|مسح)/;
const WRITE_ICON = /lucide-(trash|pencil|edit|plus|save|upload|user-plus|user-minus|user-x|user-check|shield|key|lock|unlock|rotate|refresh|copy-plus|file-plus|folder-plus|circle-plus|square-pen|pen)/;
const KEEP_TEXT = /(طباعة|تصدير|تحميل|بحث|تصفية|عرض|PDF|Excel|CSV|إغلاق|رجوع|السابق|التالي|مسح البحث|إلغاء$)/;

function scrub(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('button, [role="button"], label').forEach(el => {
    if (el.dataset.roKeep || el.dataset.roHidden) return;
    const text = (el.textContent || '').trim();
    const svgCls = Array.from(el.querySelectorAll('svg')).map(s => s.getAttribute('class') || '').join(' ');
    const isFile = el.tagName === 'LABEL' && !!el.querySelector('input[type="file"]');
    const write = isFile || (!KEEP_TEXT.test(text) && (WRITE_ANY.test(text) || WRITE_START.test(text) || ((text.length < 2 && WRITE_ICON.test(svgCls)) || /^[+＋]$/.test(text) || WRITE_ANY.test(el.getAttribute('title') || ''))));
    if (write) { el.dataset.roHidden = '1'; el.style.display = 'none'; }
  });
  root.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(i => { i.disabled = true; });
}

export function useReadOnlyGuard(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    scrub(root);
    let timer: any = null;
    const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => scrub(root), 30); });
    obs.observe(root, { childList: true, subtree: true });
    return () => { obs.disconnect(); clearTimeout(timer); };
  }, [enabled, ref]);
}
