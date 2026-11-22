import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { LOCALE_STORAGE_KEY } from '../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

function isEnglishLocale(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'en') {
    return true;
  }
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/en')) return true;
    try {
      if (window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'en') return true;
    } catch {
      // ignore storage errors
    }
  }
  return false;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const isEn = isEnglishLocale();
    return {
      hasError: true,
      errorMessage:
        error.message ||
        (isEn ? 'An unexpected error occurred.' : 'Une erreur inattendue est survenue.'),
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary:', error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  private handleFullReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isEn = isEnglishLocale();
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900">
                  {isEn
                    ? 'Temporary application interruption'
                    : 'Interruption temporaire de l’application'}
                </h1>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {isEn
                    ? 'A technical incident occurred while communicating with the tracking service. You can retry, reload the page, or contact our support desk at +227 89 99 44 53.'
                    : 'Un incident technique s’est produit lors de la communication avec le service de suivi. Vous pouvez réessayer, actualiser la page ou contacter notre support au +227 89 99 44 53.'}
                </p>
                {this.state.errorMessage && (
                  <p className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700 break-words">
                    {this.state.errorMessage}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>{isEn ? 'Retry view' : 'Réessayer'}</span>
              </button>
              <button
                type="button"
                onClick={this.handleFullReload}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer min-h-[44px]"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>{isEn ? 'Reload page' : 'Actualiser la page'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
