import { MessageCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export function WhatsAppButton() {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const text = encodeURIComponent(
    en
      ? 'Hello Alpha Logistix Group, I would like information regarding a shipment.'
      : 'Bonjour Alpha Logistix Group, je souhaite des informations pour une expédition.'
  );
  return (
    <a
      href={`https://wa.me/22789994453?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={en ? 'Chat on WhatsApp' : 'Discuter sur WhatsApp'}
      className="fixed bottom-5 right-5 z-50 inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      <MessageCircle className="w-6 h-6" aria-hidden="true" />
    </a>
  );
}
