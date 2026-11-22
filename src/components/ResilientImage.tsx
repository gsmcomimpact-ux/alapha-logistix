import { useEffect, useState } from 'react';
import { Container } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
}

export function ResilientImage({
  src,
  alt,
  fallbackTitle,
  className = '',
}: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-200 p-8 text-center ${className}`}
      >
        <Container className="w-10 h-10 text-sky-400 mb-3" strokeWidth={1.5} aria-hidden="true" />
        <p className="font-display text-base font-semibold tracking-tight text-white">
          {fallbackTitle}
        </p>
        <p className="mt-1 text-xs text-slate-400">Alpha Logistix Group</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
