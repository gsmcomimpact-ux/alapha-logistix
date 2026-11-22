import { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TopBar } from './components/TopBar';
import { HeroSection } from './components/HeroSection';
import { ServicesBento } from './components/ServicesBento';
import { FreightCalculator } from './components/FreightCalculator';
import { TrackingPortal } from './components/TrackingPortal';
import { TeamSection } from './components/TeamSection';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { AdminPortalPage } from './components/AdminPortalPage';
import { ClientPortalPage } from './components/ClientPortalPage';
import { WhatsAppButton } from './components/WhatsAppButton';
import { QuotePrefill, ServiceCategory } from './types/logistics';

function PublicWebsite() {
  const { locale, t, navigateTo } = useLanguage();
  const [quotePrefill, setQuotePrefill] = useState<QuotePrefill | null>(null);

  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectServiceForQuote = (service: ServiceCategory) => {
    const localizedService = t.serviceLabels[service];
    setQuotePrefill({
      service,
      summary:
        locale === 'en'
          ? `Rate request regarding division: ${localizedService}.`
          : `Demande de tarification concernant le pôle : ${localizedService}.`,
    });
    scrollToSection('contact');
  };

  const handleApplyCalculatorToQuote = (prefill: QuotePrefill) => {
    setQuotePrefill(prefill);
    scrollToSection('contact');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar onPortalClick={() => navigateTo('/espace-client')} />
      <main className="flex-1">
        <HeroSection onEstimateClick={() => scrollToSection('simulateur')} />
        <ServicesBento onSelectServiceForQuote={handleSelectServiceForQuote} />
        <FreightCalculator onApplyToQuote={handleApplyCalculatorToQuote} />
        <TrackingPortal />
        <TeamSection />
        <ContactSection
          prefill={quotePrefill}
          onClearPrefill={() => setQuotePrefill(null)}
        />
      </main>
      <Footer />
    </div>
  );
}

function AppRouter() {
  const { subPath } = useLanguage();
  if (subPath === '/administration') return <AdminPortalPage />;
  if (subPath === '/espace-client') return <ClientPortalPage />;
  return <PublicWebsite />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <AppRouter />
          <WhatsAppButton />
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
