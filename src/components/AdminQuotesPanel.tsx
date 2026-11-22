import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ClientRecord,
  FIELD_LIMITS,
  QUOTE_STATUSES,
  QuoteRequestRecord,
  QuoteStatus,
  ServiceCategory,
  TRANSPORT_MODES,
  UserProfile,
} from '../types/logistics';

interface AdminQuotesPanelProps {
  quotes: QuoteRequestRecord[];
  loading: boolean;
  adminClients: ClientRecord[];
  registeredUsers: UserProfile[];
  onConvertToShipment: (quote: QuoteRequestRecord) => void;
}

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

function getQuoteStatusTone(status: QuoteStatus): string {
  switch (status) {
    case 'Acceptée':
      return 'text-emerald-700';
    case 'Devis envoyé':
      return 'text-sky-700';
    case "À l'étude":
      return 'text-amber-700';
    case 'Archivée':
      return 'text-slate-500';
    default:
      return 'text-orange-700';
  }
}

export function AdminQuotesPanel({
  quotes,
  loading,
  adminClients,
  registeredUsers,
  onConvertToShipment,
}: AdminQuotesPanelProps) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuoteStatus>('ALL');

  // Create quote form state (for phone/WhatsApp client requests)
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit response state
  const [editStatus, setEditStatus] = useState<QuoteStatus>('En attente');
  const [editAmount, setEditAmount] = useState('');
  const [editResponse, setEditResponse] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && quotes.some((item) => item.id === prev)) return prev;
      return quotes[0]?.id ?? null;
    });
  }, [quotes]);

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.id === selectedId) ?? null,
    [quotes, selectedId]
  );

  useEffect(() => {
    if (!selectedQuote) return;
    setEditStatus(selectedQuote.status);
    setEditAmount(selectedQuote.estimatedAmount);
    setEditResponse(selectedQuote.adminResponse);
    setSaveFeedback(null);
    setConfirmDeleteId(null);
  }, [selectedQuote?.id]);

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
      })),
      ...registeredUsers.map((u) => ({
        key: `usr:${u.uid}`,
        uid: u.uid,
        email: u.email,
        name: u.fullName,
        company: u.company,
        phone: u.phone,
        city: u.city,
      })),
    ].sort((a, b) => `${a.company} ${a.name}`.localeCompare(`${b.company} ${b.name}`, 'fr'));
  }, [adminClients, registeredUsers]);

  const filteredQuotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return quotes.filter((item) => {
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesQuery =
        !q ||
        item.quoteCode.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.clientEmail.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [quotes, searchQuery, statusFilter]);

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

  const handleCreateQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setCreateError(null);

    const cleanEmail = newClientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanName = newClientName.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanCompany = newCompany.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanPhone = newPhone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanOrigin = newOrigin.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanDest = newDestination.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanMsg = newMessage.trim().slice(0, FIELD_LIMITS.quoteMessageMax);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setCreateError('Veuillez saisir une adresse e-mail client valide.');
      return;
    }
    if (cleanName.length < 2 || cleanMsg.length < 5) {
      setCreateError('Renseignez le nom du client et les détails de la cotation (5 caractères min.).');
      return;
    }

    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quoteCode = generateQuoteCode();
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const matchedUser = registeredUsers.find(
      (u) => (newClientUid && u.uid === newClientUid) || u.email.toLowerCase() === cleanEmail
    );
    const resolvedUid = newClientUid || matchedUser?.uid || '';

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
        status: 'En attente',
        estimatedAmount: '',
        adminResponse: '',
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
        title: `Demande de cotation enregistrée · ${quoteCode}`,
        message: `Votre demande (${newTransportMode} : ${cleanOrigin || 'Origine'} → ${cleanDest || 'Destination'}) est en cours de traitement.`,
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setSelectedId(quoteId);
      setShowCreateForm(false);
      setClientChoiceKey('');
      setNewClientUid('');
      setNewClientEmail('');
      setNewClientName('');
      setNewCompany('');
      setNewPhone('');
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `quoteRequests/${quoteId}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedQuote) return;
    setSaveFeedback(null);

    const cleanAmount = editAmount.trim().slice(0, FIELD_LIMITS.quoteAmountMax);
    const cleanResponse = editResponse.trim().slice(0, FIELD_LIMITS.quoteResponseMax);
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'quoteRequests', selectedQuote.id), {
        status: editStatus,
        estimatedAmount: cleanAmount,
        adminResponse: cleanResponse,
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        clientUid: selectedQuote.clientUid || '',
        clientEmail: selectedQuote.clientEmail.toLowerCase(),
        shipmentId: '',
        trackingCode: selectedQuote.quoteCode,
        category: 'quote',
        title: `Cotation ${selectedQuote.quoteCode} · ${editStatus}`,
        message: `${cleanAmount ? `Montant : ${cleanAmount}. ` : ''}${cleanResponse || 'Le statut de votre demande de cotation a été actualisé.'}`.slice(
          0,
          FIELD_LIMITS.notifMessageMax
        ),
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setSaveFeedback({
        type: 'ok',
        text: `Cotation ${selectedQuote.quoteCode} mise à jour et notification envoyée au client.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quoteRequests/${selectedQuote.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    try {
      await deleteDoc(doc(db, 'quoteRequests', quoteId));
      setConfirmDeleteId(null);
      if (selectedId === quoteId) setSelectedId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quoteRequests/${quoteId}`);
    }
  };

  return (
    <div className="space-y-4">
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
            placeholder="Filtrer par référence COT, client ou e-mail..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            aria-label="Filtrer les cotations par statut"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | QuoteStatus)}
            className="min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          >
            <option value="ALL">Tous les statuts ({quotes.length})</option>
            {QUOTE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
          >
            {showCreateForm ? (
              <>
                <X className="w-4 h-4" aria-hidden="true" />
                <span>Fermer</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Enregistrer une cotation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Create Quote Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateQuote}
          noValidate
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="font-display text-base font-bold text-slate-900">
            Nouvelle demande de cotation client (téléphone, WhatsApp ou comptoir)
          </h3>

          {clientChoices.length > 0 && (
            <div>
              <label
                htmlFor="admin-quote-client-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Client existant (optionnel)
              </label>
              <select
                id="admin-quote-client-select"
                value={clientChoiceKey}
                onChange={(e) => handleSelectClient(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="">Saisir manuellement...</option>
                {clientChoices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.company} — {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="aq-email" className="block text-xs font-medium text-slate-700 mb-1">
                E-mail client
              </label>
              <input
                id="aq-email"
                type="email"
                maxLength={FIELD_LIMITS.emailMax}
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                placeholder="client@entreprise.com"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="aq-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nom du contact
              </label>
              <input
                id="aq-name"
                type="text"
                maxLength={FIELD_LIMITS.companyMax}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Ibrahim Mahamadou"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="aq-company" className="block text-xs font-medium text-slate-700 mb-1">
                Société
              </label>
              <input
                id="aq-company"
                type="text"
                maxLength={FIELD_LIMITS.companyMax}
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Sahel Distribution"
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="aq-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Téléphone
              </label>
              <input
                id="aq-phone"
                type="text"
                maxLength={FIELD_LIMITS.phoneMax}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+227..."
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="aq-mode" className="block text-xs font-medium text-slate-700 mb-1">
                Prestation
              </label>
              <select
                id="aq-mode"
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
              <label htmlFor="aq-origin" className="block text-xs font-medium text-slate-700 mb-1">
                Origine
              </label>
              <input
                id="aq-origin"
                type="text"
                maxLength={FIELD_LIMITS.originDestMax}
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            <div>
              <label htmlFor="aq-dest" className="block text-xs font-medium text-slate-700 mb-1">
                Destination
              </label>
              <input
                id="aq-dest"
                type="text"
                maxLength={FIELD_LIMITS.originDestMax}
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="aq-message" className="block text-xs font-medium text-slate-700 mb-1">
              Détails marchandise / volume
            </label>
            <textarea
              id="aq-message"
              rows={2}
              maxLength={FIELD_LIMITS.quoteMessageMax}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Ex. 1x Conteneur 40'HC équipements solaires au départ de Ningbo..."
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
              className="px-4 py-2 text-xs font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg cursor-pointer min-h-[38px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg cursor-pointer min-h-[38px]"
            >
              {creating ? 'Création...' : 'Créer la demande de cotation'}
            </button>
          </div>
        </form>
      )}

      {/* Main Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : quotes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <FileSpreadsheet className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="font-display text-base font-semibold text-slate-900">
            Aucune demande de cotation enregistrée
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Les demandes soumises depuis le portail ou enregistrées par l’équipe apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Référence & Client</th>
                    <th className="py-3 px-4">Prestation & Axe</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredQuotes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 px-4 text-center text-xs text-slate-500">
                        Aucune cotation ne correspond à ce filtre.
                      </td>
                    </tr>
                  ) : (
                    filteredQuotes.map((qItem) => {
                      const active = qItem.id === selectedId;
                      return (
                        <tr
                          key={qItem.id}
                          onClick={() => setSelectedId(qItem.id)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3 px-4 align-top">
                            <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {qItem.quoteCode}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-slate-700 truncate max-w-[190px]">
                              {qItem.company || qItem.clientName}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[190px]">
                              {qItem.clientEmail}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <p className="text-xs font-medium text-slate-900">
                              {qItem.transportMode}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {(qItem.origin || 'Origine')} → {(qItem.destination || 'Destination')}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <span className={`text-xs font-semibold ${getQuoteStatusTone(qItem.status)}`}>
                              {qItem.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 align-top text-right font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                            {formatDate(qItem.createdAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
            {selectedQuote ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <p className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                      {selectedQuote.quoteCode}
                    </p>
                    <h3 className="mt-1 font-display text-base font-bold text-slate-900">
                      {selectedQuote.company
                        ? `${selectedQuote.company} — ${selectedQuote.clientName}`
                        : selectedQuote.clientName}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selectedQuote.clientEmail}
                      {selectedQuote.phone ? ` · ${selectedQuote.phone}` : ''}
                    </p>
                  </div>

                  {confirmDeleteId === selectedQuote.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleDeleteQuote(selectedQuote.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-xs text-slate-600 cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedQuote.id)}
                      aria-label="Supprimer cette cotation"
                      className="p-2 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <p className="font-semibold text-slate-900">
                    {selectedQuote.transportMode} · {selectedQuote.origin || '—'} →{' '}
                    {selectedQuote.destination || '—'}
                  </p>
                  <p className="text-slate-600 whitespace-pre-line leading-relaxed">
                    {selectedQuote.message}
                  </p>
                </div>

                <form onSubmit={handleSaveResponse} noValidate className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-q-status" className="block text-xs font-medium text-slate-700 mb-1">
                        Statut de la cotation
                      </label>
                      <select
                        id="edit-q-status"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as QuoteStatus)}
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      >
                        {QUOTE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="edit-q-amount" className="block text-xs font-medium text-slate-700 mb-1">
                        Montant estimatif / Tarif
                      </label>
                      <input
                        id="edit-q-amount"
                        type="text"
                        maxLength={FIELD_LIMITS.quoteAmountMax}
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        placeholder="Ex. 4 850 USD / 2 950 000 FCFA"
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-q-response" className="block text-xs font-medium text-slate-700 mb-1">
                      Réponse commerciale / Conditions (visible par le client)
                    </label>
                    <textarea
                      id="edit-q-response"
                      rows={3}
                      maxLength={FIELD_LIMITS.quoteResponseMax}
                      value={editResponse}
                      onChange={(e) => setEditResponse(e.target.value)}
                      placeholder="Délai de transit, validité du devis, conditions d’embarquement..."
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  {saveFeedback && (
                    <div
                      role="status"
                      className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                        saveFeedback.type === 'ok'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{saveFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {saving ? 'Enregistrement...' : 'Enregistrer & Notifier le client'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onConvertToShipment(selectedQuote)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>Ouvrir dossier</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Sélectionnez une demande de cotation pour répondre au client.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
