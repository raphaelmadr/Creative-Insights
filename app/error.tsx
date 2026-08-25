'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to our internal system log database
    fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        level: 'ERROR',
        source: 'FRONTEND_UI',
        message: error.message || 'Unknown UI Error',
        stack: error.stack,
        url: typeof window !== 'undefined' ? window.location.href : '',
      }),
    }).catch(err => {
      console.error('Failed to send error to internal log:', err);
    });
  }, [error]);

  return (
    <div className="flex h-[80vh] w-full flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-red-500/10 p-4 mb-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold mb-2 text-white">Ops! Algo deu errado.</h2>
      <p className="text-gray-400 mb-6 max-w-md">
        Nossa equipe de monitoramento foi notificada automaticamente. Você pode tentar atualizar a página.
      </p>
      
      <button
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Tentar Novamente
      </button>

      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-[#1e1e20] border border-red-500/20 rounded-lg text-left max-w-2xl overflow-auto text-xs text-red-400 font-mono">
          <p className="font-bold mb-2">{error.message}</p>
          <pre>{error.stack}</pre>
        </div>
      )}
    </div>
  );
}
