import { FileText, Shield } from 'lucide-react';

interface Props {
  proposalsOpen: boolean;
  nominationOpen: boolean;
  onOpenProposals: () => void;
  onOpenNomination: () => void;
}

export default function ProfessorNotices({
  proposalsOpen, nominationOpen, onOpenProposals, onOpenNomination,
}: Props) {
  if (!proposalsOpen && !nominationOpen) return null;

  const cardCls =
    'flex items-center gap-4 rounded-2xl px-5 py-4 bg-white border border-gray-200 shadow-sm text-right w-full hover:shadow-md transition-shadow';

  return (
    <div className="flex flex-col gap-3 mb-4" dir="rtl">
      {proposalsOpen && (
        <button onClick={onOpenProposals} className={cardCls}
                style={{ borderRightWidth: 4, borderRightColor: '#1a3a6b' }}>
          <FileText className="w-6 h-6 flex-shrink-0 text-[#1a3a6b]" />
          <div className="flex-1">
            <p className="font-bold text-sm text-gray-800">فُتح مجال إرسال اقتراحات المذكرات</p>
            <p className="text-xs text-gray-500 mt-0.5">يمكنك الآن إرسال اقتراحاتك لعناوين مذكرات الماستر.</p>
          </div>
        </button>
      )}

      {nominationOpen && (
        <button onClick={onOpenNomination} className={cardCls}
                style={{ borderRightWidth: 4, borderRightColor: '#c9a227' }}>
          <Shield className="w-6 h-6 flex-shrink-0 text-[#c9a227]" />
          <div className="flex-1">
            <p className="font-bold text-sm text-gray-800">الترشح للمجلس التأديبي مفتوح</p>
            <p className="text-xs text-gray-500 mt-0.5">
              يمكنك الترشح لمجلس الكلية ولمجلس قسم واحد.
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
