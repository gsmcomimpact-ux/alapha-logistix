import { CheckCircle2, Clock, MapPin, PackageCheck, Plane, Ship, Truck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { ShipmentStatus } from '../types/logistics';

interface StatusTextProps {
  status: ShipmentStatus;
}

export function StatusText({ status }: StatusTextProps) {
  const { t } = useLanguage();
  const label = t.statusLabels[status] || status;

  switch (status) {
    case 'Livré':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
          <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'En dédouanement':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'Arrivé au port / hub':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap shrink-0">
          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'En transit maritime':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap shrink-0">
          <Ship className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'En transit aérien':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap shrink-0">
          <Plane className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'En route corridor':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap shrink-0">
          <Truck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
  }
}
