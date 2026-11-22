import { FormEvent, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  Archive,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FolderPlus,
  Inbox,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ClientRecord,
  FIELD_LIMITS,
  QuoteRequestRecord,
  QuoteStatus,
  ServiceCategory,
  ShipmentRecord,
  TRANSPORT_MODES,
  UserProfile,
} from '../types/logistics';

interface AdminPendingRequestsPanelProps {
  quotes: QuoteRequestRecord[];
  loadingQuotes: boolean;
  registeredUsers: UserProfile[];
  adminClients: ClientRecord[];
  shipments: ShipmentRecord[];
  onConvertQuoteToShipment: (quote: QuoteRequestRecord) => void;
  onCreateShipmentForClient: (client: {
    uid: string;
    email: string;
    name: string;
    city: string;
  }) => void;
}

type RequestSubFilter = 'ALL' | 'quotes' | 'accounts';

function generateQuoteCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `COT-2026-${digits}`;
}

function formatDate(ts?: Timestamp | null): string {
  if (!ts) return 'À l’instant';
  try {
    return ts.toDate().toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function AdminPendingRequestsPanel({
  quotes,
  loadingQuotes,
  registeredUsers,
  adminClients,
  shipments,
  onConvertQuoteToShipment,
  onCreateShipmentForClient,
}: AdminPendingRequestsPanelProps) {
  const { user } = useAuth();

  const [subFilter, setSubFilter] = useState<RequestSubFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Create request form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [clientChoiceKey, setClientChoiceKey] = useState('');
  const [newClientUid, setNewClientUid] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTransportMode, setNewTransportMode] = useState<ServiceCategory>('Fret maritime');
  const [newOrigin, setNewOrigin] = useState('Port de Shanghai (Chine)');
  const [newDestination, setNewDestination] = useState('Niamey (Niger)');
  const [newMessage, setNewMessage] = useState('');
  const [newInitialStatus, setNewInitialStatus] = useState<'En attente' | 'Acceptée'>('En attente');
  const [newEstimatedAmount, setNewEstimatedAmount] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Optional inline tariff/note per pending quote before validating
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [quoteNotes, setQuoteNotes] = useState<Record<string, string>>({});

  const pendingAccounts = useMemo(
    () =>
      registeredUsers
        .filter((u) => (u.accountStatus ?? 'validated') === 'pending')
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    [registeredUsers]
  );

  const pendingQuotes = useMemo(
    () =>
      quotes
        .filter((q) => q.status === 'En attente' || q.status === "À l'étude")
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    [quotes]
  );

  const clientChoices = useMemo(() => {
    return [
      ...adminClients.map((c) => ({
        key: `cli:${c.id}`,
        uid: '',
        email: c.email,
        name: c.fullName,
        company: c.company,
        phone: c.phone,
        city: c.city,
        sourceLabel: 'Fiche admin',
      })),
      ...registeredUsers.map((u) => ({
        key: `usr:${u.uid}`,
        uid: u.uid,
        email: u.email,
        name: u.fullName,
        company: u.company,
        phone: u.phone,
        city: u.city,
        sourceLabel: (u.accountStatus ?? 'validated') === 'pending' ? 'Compte en attente' : 'Compte inscrit',
      })),
    ].sort((a, b) => `${a.company} ${a.name}`.localeCompare(`${b.company} ${b.name}`, 'fr'));
  }, [adminClients, registeredUsers]);

  const filteredPendingAccounts = useMemo(() => {
    if (subFilter === 'quotes') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pendingAccounts;
    return pendingAccounts.filter(
      (u) =>
        u.company.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.city.toLowerCase().includes(q)
    );
  }, [pendingAccounts, subFilter, searchQuery]);

  const filteredPendingQuotes = useMemo(() => {
    if (subFilter === 'accounts') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pendingQuotes;
    return pendingQuotes.filter(
      (item) =>
        item.quoteCode.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.clientEmail.toLowerCase().includes(q) ||
        item.origin.toLowerCase().includes(q) ||
        item.destination.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q)
    );
  }, [pendingQuotes, subFilter, searchQuery]);

  const handleSelectClient = (key: string) => {
    setClientChoiceKey(key);
    const match = clientChoices.find((c) => c.key === key);
    if (match) {
      setNewClientUid(match.uid);
      setNewClientEmail(match.email);
      setNewClientName(match.name);
      setNewCompany(match.company);
      setNewPhone(match.phone);
      if (match.city) setNewDestination(match.city);
    } else {
      setNewClientUid('');
    }
  };

  const handleCreateRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setCreateError(null);
    setFeedback(null);

    const cleanEmail = newClientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanName = newClientName.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanCompany = newCompany.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanPhone = newPhone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanOrigin = newOrigin.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanDest = newDestination.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanMsg = newMessage.trim().slice(0, FIELD_LIMITS.quoteMessageMax);
    const cleanAmount = newEstimatedAmount.trim().slice(0, FIELD_LIMITS.quoteAmountMax);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setCreateError('Veuillez saisir une adresse e-mail client valide.');
      return;
    }
    if (cleanName.length < 2 || cleanMsg.length < 5) {
      setCreateError('Renseignez le nom du client et les détails de la demande (5 caractères min.).');
      return;
    }

    const matchedUser = registeredUsers.find(
      (u) => (newClientUid && u.uid === newClientUid) || u.email.toLowerCase() === cleanEmail
    );
    const resolvedUid = newClientUid || matchedUser?.uid || '';

    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quoteCode = generateQuoteCode();
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setCreating(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'quoteRequests', quoteId), {
        id: quoteId,
        quoteCode,
        clientUid: resolvedUid,
        clientEmail: cleanEmail,
        clientName: cleanName,
        company: cleanCompany,
        phone: cleanPhone,
        transportMode: newTransportMode,
        origin: cleanOrigin,
        destination: cleanDest,
        message: cleanMsg,
        status: newInitialStatus,
        estimatedAmount: cleanAmount,
        adminResponse:
          newInitialStatus === 'Acceptée'
            ? 'Demande créée et validée par Alpha Logistix Group.'
            : '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        clientUid: resolvedUid,
        clientEmail: cleanEmail,
        shipmentId: '',
        trackingCode: quoteCode,
        category: 'quote',
        title:
          newInitialStatus === 'Acceptée'
            ? `Demande validée · ${quoteCode}`.slice(0, FIELD_LIMITS.notifTitleMax)
            : `Demande en attente enregistrée · ${quoteCode}`.slice(0, FIELD_LIMITS.notifTitleMax),
        message: `${newTransportMode} : ${cleanOrigin || 'Origine'} → ${cleanDest || 'Destination'}${
          cleanAmount ? ` · Tarif : ${cleanAmount}` : ''
        }.`.slice(0, FIELD_LIMITS.notifMessageMax),
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      if (
        newInitialStatus === 'Acceptée' &&
        matchedUser &&
        (matchedUser.accountStatus ?? 'validated') === 'pending'
      ) {
        batch.update(doc(db, 'users', matchedUser.uid), {
          accountStatus: 'validated',
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      setShowCreateForm(false);
      setClientChoiceKey('');
      setNewClientUid('');
      setNewClientEmail('');
      setNewClientName('');
      setNewCompany('');
      setNewPhone('');
      setNewMessage('');
      setNewEstimatedAmount('');
      setNewInitialStatus('En attente');
      setFeedback({
        type: 'ok',
        text:
          newInitialStatus === 'Acceptée'
            ? `Demande ${quoteCode} créée et validée immédiatement.`
            : `Demande ${quoteCode} créée en attente de validation.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `quoteRequests/${quoteId}`);
    } finally {
      setCreating(false);
    }
  };

  const handleValidateQuote = async (
    quote: QuoteRequestRecord,
    nextStatus: QuoteStatus,
    openCreateTracking: boolean
  ) => {
    if (!user) return;
    setBusyKey(`quote:${quote.id}`);
    setFeedback(null);

    const emailLower = quote.clientEmail.toLowerCase();
    const matchedUser = registeredUsers.find(
      (u) => (quote.clientUid && u.uid === quote.clientUid) || u.email.toLowerCase() === emailLower
    );
    const resolvedUid = quote.clientUid || matchedUser?.uid || '';

    const cleanAmount = (quoteAmounts[quote.id] ?? quote.estimatedAmount)
      .trim()
      .slice(0, FIELD_LIMITS.quoteAmountMax);
    const rawNote = (quoteNotes[quote.id] ?? quote.adminResponse).trim();
    const cleanResponse = (
      rawNote ||
      (nextStatus === 'Acceptée'
        ? 'Demande validée par l’équipe Alpha Logistix Group.'
        : nextStatus === 'Archivée'
        ? 'Demande clôturée / archivée.'
        : 'Demande en cours d’étude par nos équipes.')
    ).slice(0, FIELD_LIMITS.quoteResponseMax);

    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'quoteRequests', quote.id), {
        status: nextStatus,
        estimatedAmount: cleanAmount,
        adminResponse: cleanResponse,
        clientUid: resolvedUid,
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        clientUid: resolvedUid,
        clientEmail: emailLower,
        shipmentId: '',
        trackingCode: quote.quoteCode,
        category: 'quote',
        title: `Demande ${quote.quoteCode} · ${nextStatus}`.slice(0, FIELD_LIMITS.notifTitleMax),
        message: `${cleanAmount ? `Tarif : ${cleanAmount}. ` : ''}${cleanResponse}`.slice(
          0,
          FIELD_LIMITS.notifMessageMax
        ),
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      if (
        nextStatus === 'Acceptée' &&
        matchedUser &&
        (matchedUser.accountStatus ?? 'validated') === 'pending'
      ) {
        batch.update(doc(db, 'users', matchedUser.uid), {
          accountStatus: 'validated',
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      if (openCreateTracking) {
        onConvertQuoteToShipment({
          ...quote,
          clientUid: resolvedUid,
          status: nextStatus,
          estimatedAmount: cleanAmount,
          adminResponse: cleanResponse,
        });
      } else {
        setFeedback({
          type: 'ok',
          text:
            nextStatus === 'Acceptée'
              ? `Demande ${quote.quoteCode} validée et notification envoyée au client.`
              : nextStatus === 'Archivée'
              ? `Demande ${quote.quoteCode} archivée.`
              : `Demande ${quote.quoteCode} passée à l'étude.`,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quoteRequests/${quote.id}`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleValidateAccount = async (account: UserProfile, openCreateTracking: boolean) => {
    if (!user) return;
    setBusyKey(`account:${account.uid}`);
    setFeedback(null);
    const emailLower = account.email.trim().toLowerCase();

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', account.uid), {
        accountStatus: 'validated',
        updatedAt: serverTimestamp(),
      });

      const matchingShipments = shipments.filter(
        (s) => s.clientEmail.toLowerCase() === emailLower && !s.clientUid
      );
      for (const sh of matchingShipments) {
        batch.update(doc(db, 'shipments', sh.id), {
          clientUid: account.uid,
          updatedAt: serverTimestamp(),
        });
        const evSnap = await getDocs(collection(db, 'shipments', sh.id, 'events'));
        evSnap.docs.forEach((evDoc) => {
          if (!evDoc.data().clientUid) {
            batch.update(evDoc.ref, { clientUid: account.uid });
          }
        });
        const docSnapList = await getDocs(collection(db, 'shipments', sh.id, 'documents'));
        docSnapList.docs.forEach((dDoc) => {
          if (!dDoc.data().clientUid) {
            batch.update(dDoc.ref, { clientUid: account.uid });
          }
        });
      }

      const clientDocsSnap = await getDocs(
        query(collection(db, 'clientDocuments'), where('clientEmail', '==', emailLower))
      );
      clientDocsSnap.docs.forEach((cdDoc) => {
        if (!cdDoc.data().clientUid) {
          batch.update(cdDoc.ref, {
            clientUid: account.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      const quotesSnap = await getDocs(
        query(collection(db, 'quoteRequests'), where('clientEmail', '==', emailLower))
      );
      quotesSnap.docs.forEach((qDoc) => {
        if (!qDoc.data().clientUid) {
          batch.update(qDoc.ref, {
            clientUid: account.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      const notifsSnap = await getDocs(
        query(collection(db, 'notifications'), where('clientEmail', '==', emailLower))
      );
      notifsSnap.docs.forEach((nDoc) => {
        if (!nDoc.data().clientUid) {
          batch.update(nDoc.ref, { clientUid: account.uid });
        }
      });

      const welcomeNotifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      batch.set(doc(db, 'notifications', welcomeNotifId), {
        id: welcomeNotifId,
        clientUid: account.uid,
        clientEmail: emailLower,
        shipmentId: '',
        trackingCode: '',
        category: 'status',
        title: 'Compte client validé · Alpha Logistix Group'.slice(0, FIELD_LIMITS.notifTitleMax),
        message: `Votre compte (${account.company}) est activé. Vous pouvez désormais suivre vos expéditions, documents et demandes.`.slice(
          0,
          FIELD_LIMITS.notifMessageMax
        ),
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      if (openCreateTracking) {
        onCreateShipmentForClient({
          uid: account.uid,
          email: account.email,
          name: `${account.company} — ${account.fullName}`,
          city: account.city,
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Compte client « ${account.company} » validé et activé.`,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${account.uid}`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectAccount = async (account: UserProfile) => {
    setBusyKey(`account:${account.uid}`);
    setFeedback(null);
    try {
      await updateDoc(doc(db, 'users', account.uid), {
        accountStatus: 'rejected',
        updatedAt: serverTimestamp(),
      });
      setFeedback({
        type: 'ok',
        text: `Demande d’inscription « ${account.company} » refusée.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${account.uid}`);
    } finally {
      setBusyKey(null);
    }
  };

  const totalPendingCount = pendingQuotes.length + pendingAccounts.length;
  const shownEmpty =
    !loadingQuotes &&
    filteredPendingQuotes.length === 0 &&
    filteredPendingAccounts.length === 0;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par client, société, e-mail, référence..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setCreateError(null);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
        >
          {showCreateForm ? (
            <>
              <X className="w-4 h-4" aria-hidden="true" />
              <span>Fermer le formulaire</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Créer une demande</span>
            </>
          )}
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSubFilter('ALL')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            subFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Toutes en attente ({totalPendingCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubFilter('quotes')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            subFilter === 'quotes'
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Demandes expédition & cotation ({pendingQuotes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubFilter('accounts')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            subFilter === 'accounts'
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Comptes clients à valider ({pendingAccounts.length})</span>
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Create Pending Request Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateRequest}
          noValidate
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Créer une demande client (à valider ou pré-validée)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Enregistrez une demande reçue par téléphone, WhatsApp ou e-mail pour qu’elle
              apparaisse dans les demandes en attente ou soit validée directement.
            </p>
          </div>

          {clientChoices.length > 0 && (
            <div>
              <label
                htmlFor="pr-client-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Client existant (optionnel)
              </label>
              <select
                id="pr-client-select"
                value={clientChoiceKey}
                onChange={(e) => handleSelectClient(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="">Saisir manuellement...</option>
                {clientChoices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.company} — {c.name} ({c.email}) · {c.sourceLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="pr-email" className="block text-xs font-medium text-slate-700 mb-1">
                E-mail client
              </label>
              <input
                id="pr-email"
                type="email"
                maxLength={FIELD_LIMITS.emailMax}
                value={newClientEmail}
                onChange={(e) => {
                  setNewClientEmail(e.target.value);
                  setClientChoiceKey('');
                  setNewClientUid('');
                }}
                placeholder="client@entreprise.com"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="pr-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nom du contact
              </label>
              <input
                id="pr-name"
                type="text"
                maxLength={FIELD_LIMITS.companyMax}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Moussa Abdoulaye"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="pr-company" className="block text-xs font-medium text-slate-700 mb-1">
                Société
              </label>
              <input
                id="pr-company"
                type="text"
                maxLength={FIELD_LIMITS.companyMax}
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Sahel Import SARL"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="pr-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Téléphone
              </label>
              <input
                id="pr-phone"
                type="text"
                maxLength={FIELD_LIMITS.phoneMax}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+227 90 00 00 00"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="pr-mode" className="block text-xs font-medium text-slate-700 mb-1">
                Prestation
              </label>
              <select
                id="pr-mode"
                value={newTransportMode}
                onChange={(e) => setNewTransportMode(e.target.value as ServiceCategory)}
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                {TRANSPORT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pr-origin" className="block text-xs font-medium text-slate-700 mb-1">
                Origine
              </label>
              <input
                id="pr-origin"
                type="text"
                maxLength={FIELD_LIMITS.originDestMax}
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="pr-dest" className="block text-xs font-medium text-slate-700 mb-1">
                Destination
              </label>
              <input
                id="pr-dest"
                type="text"
                maxLength={FIELD_LIMITS.originDestMax}
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="pr-amount" className="block text-xs font-medium text-slate-700 mb-1">
                Tarif estimatif (optionnel)
              </label>
              <input
                id="pr-amount"
                type="text"
                maxLength={FIELD_LIMITS.quoteAmountMax}
                value={newEstimatedAmount}
                onChange={(e) => setNewEstimatedAmount(e.target.value)}
                placeholder="Ex. 2 400 000 FCFA"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="pr-status" className="block text-xs font-medium text-slate-700 mb-1">
                Décision initiale
              </label>
              <select
                id="pr-status"
                value={newInitialStatus}
                onChange={(e) => setNewInitialStatus(e.target.value as 'En attente' | 'Acceptée')}
                className="w-full min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="En attente">Mettre en attente</option>
                <option value="Acceptée">Créer et valider</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="pr-message" className="block text-xs font-medium text-slate-700 mb-1">
              Description de la marchandise / besoin client
            </label>
            <textarea
              id="pr-message"
              rows={2}
              maxLength={FIELD_LIMITS.quoteMessageMax}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Ex. 1x Conteneur 40'HC équipements médicaux depuis Guangzhou vers Niamey..."
              className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          {createError && (
            <p role="alert" className="text-xs font-medium text-red-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{createError}</span>
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer min-h-[38px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg cursor-pointer min-h-[38px]"
            >
              {creating
                ? 'Enregistrement...'
                : newInitialStatus === 'Acceptée'
                ? 'Créer et valider la demande'
                : 'Créer la demande en attente'}
            </button>
          </div>
        </form>
      )}

      {/* Pending Content */}
      {loadingQuotes ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-12 bg-slate-100 rounded animate-pulse" />
          <div className="h-12 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : shownEmpty ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Inbox className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="font-display text-base font-semibold text-slate-900">
            Aucune demande en attente
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Toutes les demandes clients ont été traitées, ou vous pouvez créer une nouvelle demande
            dès maintenant.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Créer une demande</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Pending Account Creation Requests */}
          {filteredPendingAccounts.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-orange-600" aria-hidden="true" />
                  <span>Comptes clients en attente de validation ({filteredPendingAccounts.length})</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {filteredPendingAccounts.map((acc) => {
                  const isBusy = busyKey === `account:${acc.uid}`;
                  return (
                    <div
                      key={acc.uid}
                      className="bg-white border border-amber-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded">
                            Nouveau compte client
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            Inscrit le {formatDate(acc.createdAt)}
                          </span>
                        </div>
                        <h4 className="font-display text-base font-bold text-slate-900">
                          {acc.company} — {acc.fullName}
                        </h4>
                        <p className="text-xs text-slate-600">
                          {acc.email} · {acc.phone} · {acc.city}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleValidateAccount(acc, true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                        >
                          <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Valider & Créer suivi</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleValidateAccount(acc, false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Valider le compte</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRejectAccount(acc)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-red-200 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                        >
                          <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Refuser</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2. Pending Client Expedition / Quote Requests */}
          {filteredPendingQuotes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-orange-600" aria-hidden="true" />
                  <span>
                    Demandes d’expédition & cotation en attente ({filteredPendingQuotes.length})
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredPendingQuotes.map((qItem) => {
                  const isBusy = busyKey === `quote:${qItem.id}`;
                  const amountVal = quoteAmounts[qItem.id] ?? qItem.estimatedAmount;
                  const noteVal = quoteNotes[qItem.id] ?? qItem.adminResponse;

                  return (
                    <div
                      key={qItem.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                              {qItem.quoteCode}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                                qItem.status === 'En attente'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {qItem.status}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {formatDate(qItem.createdAt)}
                            </span>
                          </div>

                          <h4 className="font-display text-base font-bold text-slate-900">
                            {qItem.company ? `${qItem.company} — ${qItem.clientName}` : qItem.clientName}
                          </h4>
                          <p className="text-xs text-slate-600">
                            {qItem.clientEmail}
                            {qItem.phone ? ` · ${qItem.phone}` : ''}
                          </p>
                        </div>

                        <div className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shrink-0">
                          <p className="font-semibold text-slate-900">{qItem.transportMode}</p>
                          <p className="text-slate-600">
                            {qItem.origin || 'Origine'} → {qItem.destination || 'Destination'}
                          </p>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                        {qItem.message}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor={`pr-amt-${qItem.id}`}
                            className="block text-[11px] font-medium text-slate-600 mb-1"
                          >
                            Tarif / Montant estimatif (optionnel)
                          </label>
                          <input
                            id={`pr-amt-${qItem.id}`}
                            type="text"
                            maxLength={FIELD_LIMITS.quoteAmountMax}
                            value={amountVal}
                            onChange={(e) =>
                              setQuoteAmounts((prev) => ({ ...prev, [qItem.id]: e.target.value }))
                            }
                            placeholder="Ex. 4 850 USD / 2 950 000 FCFA"
                            className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`pr-note-${qItem.id}`}
                            className="block text-[11px] font-medium text-slate-600 mb-1"
                          >
                            Note de validation / réponse client (optionnel)
                          </label>
                          <input
                            id={`pr-note-${qItem.id}`}
                            type="text"
                            maxLength={FIELD_LIMITS.quoteResponseMax}
                            value={noteVal}
                            onChange={(e) =>
                              setQuoteNotes((prev) => ({ ...prev, [qItem.id]: e.target.value }))
                            }
                            placeholder="Délai estimé, confirmation de prise en charge..."
                            className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        {qItem.status === 'En attente' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleValidateQuote(qItem, "À l'étude", false)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                          >
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Mettre à l’étude</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleValidateQuote(qItem, 'Archivée', false)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                        >
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Archiver</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleValidateQuote(qItem, 'Acceptée', false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Valider la demande</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleValidateQuote(qItem, 'Acceptée', true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg cursor-pointer min-h-[38px]"
                        >
                          <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Valider & Créer dossier</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
