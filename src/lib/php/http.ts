// Tiny client for the PHP/MySQL API (hosted on the same domain under /api).
const TOKEN_KEY = 'alg_session_token';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: session lasts for this page only
  }
}

export async function api<T = any>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Auth-Token'] = token; // fallback for hosts that strip Authorization
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('auth/network-request-failed', 'Network error', 0);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON answer (e.g. host error page)
  }
  if (!res.ok) {
    const err = data?.error;
    if (err) throw new ApiError(err.code ?? 'internal', err.message ?? `HTTP ${res.status}`, res.status);
    const hint =
      res.status === 404
        ? 'API introuvable (HTTP 404) : le dossier api/ et son .htaccess sont-ils bien en ligne ?'
        : `Le serveur a répondu HTTP ${res.status} : ouvrez /api/health pour diagnostiquer.`;
    throw new ApiError('internal', hint, res.status);
  }
  if (data === null) {
    throw new ApiError(
      'internal',
      'Réponse inattendue de l’API : le dossier api/ est-il bien en ligne et le .htaccess actif ? (voir /api/health)',
      res.status
    );
  }
  return data as T;
}
