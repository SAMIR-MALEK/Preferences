import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Shield } from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';
const NAVY = '#0F2942';
const GOLD = '#B8913A';

interface Props {
  /** الانتقال إلى صفحة إرسال اقتراحات المذكرات */
  onOpenProposals: () => void;
  /** الانتقال إلى صفحة الترشح للمجلس التأديبي */
  onOpenNomination: () => void;
}

export default function ProfessorNotices({ onOpenProposals, onOpenNomination }: Props) {
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [nominationOpen, setNominationOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('academic_settings')
        .select('proposals_open, disciplinary_open, disciplinary_deadline')
        .eq('academic_year', ACADEMIC_YEAR)
        .maybeSingle();

      setProposalsOpen(!!data?.proposals_open);
      const notExpired = data?.disciplinary_deadline
        ? new Date() <= new Date(data.disciplinary_deadline)
        : true;
      setNominationOpen(!!data?.disciplinary_open && notExpired);
    })();
  }, []);

  if (!proposalsOpen && !nominationOpen) return null;

  const cardCls = 'flex items-center gap-4 rounded-xl px-5 py-4 bg-white border border-gray-200 text-right w-full';

  return (
    <div className="flex flex-col gap-3 mb-6" dir="rtl">
      {proposalsOpen && (
        <button onClick={onOpenProposals} className={cardCls}
                style={{ borderRightWidth: 4, borderRightColor: NAVY }}>
          <FileText className="w-6 h-6 flex-shrink-0" style={{ color: NAVY }} />
          <div>
            <p className="font-bold text-sm text-gray-800">فُتح مجال إرسال اقتراحات المذكرات</p>
            <p className="text-xs text-gray-500 mt-0.5">يمكنك الآن إرسال اقتراحاتك لمذكرات الماستر.</p>
          </div>
        </button>
      )}

      {nominationOpen && (
        <button onClick={onOpenNomination} className={cardCls}
                style={{ borderRightWidth: 4, borderRightColor: GOLD }}>
          <Shield className="w-6 h-6 flex-shrink-0" style={{ color: GOLD }} />
          <div>
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
