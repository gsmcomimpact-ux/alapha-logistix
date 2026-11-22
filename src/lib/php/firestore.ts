// Firestore-compatible client backed by the PHP/MySQL API.
// Implements only the subset used by this application.
import { api } from './http';
import type { FirebaseApp } from './app';

// ------------------------------------------------------------ Timestamp ---
export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static fromMillis(ms: number): Timestamp {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromDate(d: Date): Timestamp {
    return Timestamp.fromMillis(d.getTime());
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
}

const SERVER_TS = { __sv: 'serverTimestamp' };
export function serverTimestamp(): any {
  return { ...SERVER_TS };
}

function decode(v: any): any {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) out[k] = decode(v[k]);
    return out;
  }
  return v;
}

function encode(v: any): any {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = encode(v[k]);
    return out;
  }
  return v;
}

// ----------------------------------------------------------- references ---
export interface Firestore {
  app?: FirebaseApp;
  databaseId?: string;
}

export function getFirestore(app?: FirebaseApp, databaseId?: string): Firestore {
  return { app, databaseId };
}

export class DocumentReference {
  readonly type = 'document' as const;
  readonly id: string;
  readonly path: string;
  constructor(path: string) {
    this.path = path;
    this.id = path.split('/').pop() as string;
  }
}

export class CollectionReference {
  readonly type = 'collection' as const;
  readonly id: string;
  readonly path: string;
  constructor(path: string) {
    this.path = path;
    this.id = path.split('/').pop() as string;
  }
}

type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
interface Constraint {
  kind: 'where' | 'orderBy' | 'limit';
  field?: string;
  op?: WhereOp;
  value?: unknown;
  dir?: 'asc' | 'desc';
  n?: number;
}

export class Query {
  readonly type = 'query' as const;
  readonly path: string;
  readonly constraints: Constraint[];
  constructor(path: string, constraints: Constraint[] = []) {
    this.path = path;
    this.constraints = constraints;
  }
}

function joinPath(segments: string[]): string {
  return segments
    .join('/')
    .split('/')
    .filter(Boolean)
    .join('/');
}

export function doc(base: Firestore | CollectionReference, ...segments: string[]): DocumentReference {
  const prefix = base instanceof CollectionReference ? [base.path] : [];
  return new DocumentReference(joinPath([...prefix, ...segments]));
}

export function collection(_db: Firestore, ...segments: string[]): CollectionReference {
  return new CollectionReference(joinPath(segments));
}

export function where(field: string, op: WhereOp, value: unknown): Constraint {
  return { kind: 'where', field, op, value: encode(value) };
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Constraint {
  return { kind: 'orderBy', field, dir };
}

export function limit(n: number): Constraint {
  return { kind: 'limit', n };
}

export function query(base: CollectionReference | Query, ...constraints: Constraint[]): Query {
  const prev = base instanceof Query ? base.constraints : [];
  return new Query(base.path, [...prev, ...constraints]);
}

// ------------------------------------------------------------ snapshots ---
export class DocumentSnapshot {
  readonly id: string;
  readonly ref: DocumentReference;
  private readonly _data: any | undefined;
  constructor(ref: DocumentReference, data: any | undefined) {
    this.ref = ref;
    this.id = ref.id;
    this._data = data;
  }
  exists(): boolean {
    return this._data !== undefined;
  }
  data(): any {
    return this._data;
  }
}

export class QuerySnapshot {
  readonly docs: DocumentSnapshot[];
  constructor(docs: DocumentSnapshot[]) {
    this.docs = docs;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  forEach(cb: (d: DocumentSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

function toError(e: any): Error {
  const err: any = new Error(e?.message ?? 'Request failed');
  err.code = e?.code ?? 'unavailable';
  return err;
}

// ---------------------------------------------------------------- reads ---
async function fetchDoc(ref: DocumentReference): Promise<{ snap: DocumentSnapshot; raw: string }> {
  try {
    const res = await api<{ exists: boolean; data?: any }>('/db', { body: { op: 'get', path: ref.path } });
    const data = res.exists ? decode(res.data) : undefined;
    return { snap: new DocumentSnapshot(ref, data), raw: JSON.stringify(res) };
  } catch (e) {
    throw toError(e);
  }
}

async function fetchQuery(q: Query): Promise<{ snap: QuerySnapshot; raw: string }> {
  const body = {
    op: 'list',
    path: q.path,
    where: q.constraints.filter((c) => c.kind === 'where').map((c) => [c.field, c.op, c.value]),
    orderBy: q.constraints.filter((c) => c.kind === 'orderBy').map((c) => [c.field, c.dir]),
    limit: q.constraints.find((c) => c.kind === 'limit')?.n,
  };
  try {
    const res = await api<{ docs: Array<{ id: string; data: any }> }>('/db', { body });
    const docs = res.docs.map((d) => new DocumentSnapshot(new DocumentReference(`${q.path}/${d.id}`), decode(d.data)));
    return { snap: new QuerySnapshot(docs), raw: JSON.stringify(res) };
  } catch (e) {
    throw toError(e);
  }
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  return (await fetchDoc(ref)).snap;
}

export const getDocFromServer = getDoc;

export async function getDocs(q: CollectionReference | Query): Promise<QuerySnapshot> {
  return (await fetchQuery(q instanceof Query ? q : new Query(q.path))).snap;
}

// --------------------------------------------------------------- writes ---
type WriteOp = { type: 'set' | 'update' | 'delete'; path: string; data?: any };

const WRITE_EVENT = 'alg-db-write';

async function commit(ops: WriteOp[]): Promise<void> {
  if (ops.length === 0) return;
  try {
    await api('/db', {
      body: { op: 'write', writes: ops.map((o) => ({ ...o, data: o.data !== undefined ? encode(o.data) : undefined })) },
    });
  } catch (e) {
    throw toError(e);
  }
  window.dispatchEvent(new Event(WRITE_EVENT)); // refresh live listeners immediately
}

export function setDoc(ref: DocumentReference, data: any): Promise<void> {
  return commit([{ type: 'set', path: ref.path, data }]);
}

export function updateDoc(ref: DocumentReference, data: any): Promise<void> {
  return commit([{ type: 'update', path: ref.path, data }]);
}

export function deleteDoc(ref: DocumentReference): Promise<void> {
  return commit([{ type: 'delete', path: ref.path }]);
}

export class WriteBatch {
  private ops: WriteOp[] = [];
  set(ref: DocumentReference, data: any): WriteBatch {
    this.ops.push({ type: 'set', path: ref.path, data });
    return this;
  }
  update(ref: DocumentReference, data: any): WriteBatch {
    this.ops.push({ type: 'update', path: ref.path, data });
    return this;
  }
  delete(ref: DocumentReference): WriteBatch {
    this.ops.push({ type: 'delete', path: ref.path });
    return this;
  }
  commit(): Promise<void> {
    const ops = this.ops;
    this.ops = [];
    return commit(ops);
  }
}

export function writeBatch(_db: Firestore): WriteBatch {
  return new WriteBatch();
}

// ---------------------------------------------------- live subscriptions ---
// Polling (every few seconds, paused while the tab is hidden) + immediate refresh
// after any local write. Good enough for a shared-hosting deployment.
const POLL_MS = 6000;

function subscribe<S>(
  fetcher: () => Promise<{ snap: S; raw: string }>,
  next: (snap: S) => void,
  onError?: (e: Error) => void
): () => void {
  let stopped = false;
  let lastRaw: string | null = null;
  let timer: number | undefined;
  let inFlight = false;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const { snap, raw } = await fetcher();
      if (!stopped && raw !== lastRaw) {
        lastRaw = raw;
        next(snap);
      }
    } catch (e) {
      if (!stopped) {
        try {
          onError?.(e as Error);
        } catch (cbErr) {
          // A throwing error callback must not become an unhandled rejection.
          console.error(cbErr);
        }
      }
    } finally {
      inFlight = false;
    }
  };
  const schedule = () => {
    if (stopped) return;
    timer = window.setTimeout(async () => {
      if (!document.hidden) await tick();
      schedule();
    }, POLL_MS);
  };
  const onWrite = () => void tick();
  const onVisible = () => {
    if (!document.hidden) void tick();
  };

  window.addEventListener(WRITE_EVENT, onWrite);
  document.addEventListener('visibilitychange', onVisible);
  void tick();
  schedule();

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    window.removeEventListener(WRITE_EVENT, onWrite);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function onSnapshot(
  ref: DocumentReference,
  next: (snap: DocumentSnapshot) => void,
  onError?: (e: Error) => void
): () => void;
export function onSnapshot(
  q: CollectionReference | Query,
  next: (snap: QuerySnapshot) => void,
  onError?: (e: Error) => void
): () => void;
export function onSnapshot(target: any, next: any, onError?: any): () => void {
  if (target instanceof DocumentReference) {
    return subscribe(() => fetchDoc(target), next, onError);
  }
  const q: Query = target instanceof Query ? target : new Query(target.path);
  return subscribe(() => fetchQuery(q), next, onError);
}
