import { FormEvent, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileDown,
  FileText,
  FolderPlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  exportClientsPdf,
  isDateRangeInvalid,
  isTimestampInPeriod,
} from '../lib/pdfExport';
import {
  ClientAccountStatus,
  ClientRecord,
  FIELD_LIMITS,
  ShipmentRecord,
  UserProfile,
} from '../types/logistics';

interface UnifiedClientRow {
  key: string;
  source: 'client' | 'user';
  docId: string;
  uid: string;
  accountStatus: ClientAccountStatus;
  fullName: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  shipmentsCount: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface AdminClientsPanelProps {
  adminClients: ClientRecord[];
  registeredUsers: UserProfile[];
  shipments: ShipmentRecord[];
  onCreateShipmentForClient: (client: {
    uid: string;
    email: string;
    name: string;
    city: string;
  }) => void;
  onManageDocumentsForClient: (clientEmail: string) => void;
}

export function AdminClientsPanel({
  adminClients,
  registeredUsers,
  shipments,
  onCreateShipmentForClient,
  onManageDocumentsForClient,
}: AdminClientsPanelProps) {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [validationFilter, setValidationFilter] = useState<'ALL' | 'pending' | 'validated'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateField, setDateField] = useState<'createdAt' | 'updatedAt'>('createdAt');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [validatingKey, setValidatingKey] = useState<string | null>(null);

  // Create form state
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Niamey');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Edit state
  const [editingRow, setEditingRow] = useState<UnifiedClientRow | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const unifiedClients = useMemo<UnifiedClientRow[]>(() => {
    const countByEmail = new Map<string, number>();
    shipments.forEach((s) => {
      const em = s.clientEmail.toLowerCase();
      countByEmail.set(em, (countByEmail.get(em) || 0) + 1);
    });

    const rows: UnifiedClientRow[] = [
      ...adminClients.map((c) => ({
        key: `client-${c.id}`,
        source: 'client' as const,
        docId: c.id,
        uid: '',
        accountStatus: 'validated' as ClientAccountStatus,
        fullName: c.fullName,
        company: c.company,
        email: c.email,
        phone: c.phone,
        city: c.city,
        address: c.address,
        notes: c.notes,
        shipmentsCount: countByEmail.get(c.email.toLowerCase()) || 0,
        createdAt: c.createdAt ?? null,
        updatedAt: c.updatedAt ?? null,
      })),
      ...registeredUsers.map((u) => ({
        key: `user-${u.uid}`,
        source: 'user' as const,
        docId: u.uid,
        uid: u.uid,
        accountStatus: (u.accountStatus ?? 'validated') as ClientAccountStatus,
        fullName: u.fullName,
        company: u.company,
        email: u.email,
        phone: u.phone,
        city: u.city,
        address: '',
        notes: '',
        shipmentsCount: countByEmail.get(u.email.toLowerCase()) || 0,
        createdAt: u.createdAt ?? null,
        updatedAt: u.updatedAt ?? null,
      })),
    ];

    rows.sort((a, b) => {
      const aPending = a.source === 'user' && a.accountStatus === 'pending' ? 0 : 1;
      const bPending = b.source === 'user' && b.accountStatus === 'pending' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return a.company.localeCompare(b.company, 'fr');
    });
    return rows;
  }, [adminClients, registeredUsers, shipments]);

  const pendingUsersCount = useMemo(
    () => unifiedClients.filter((c) => c.source === 'user' && c.accountStatus === 'pending').length,
    [unifiedClients]
  );

  const invalidDateRange = isDateRangeInvalid(dateFrom, dateTo);
  const hasDatePeriod = Boolean(dateFrom || dateTo);
  const dateFieldLabel = dateField === 'updatedAt' ? 'mise à jour' : 'création';

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedClients.filter((c) => {
      if (validationFilter === 'pending') {
        if (!(c.source === 'user' && c.accountStatus === 'pending')) return false;
      } else if (validationFilter === 'validated') {
        if (c.source === 'user' && c.accountStatus !== 'validated') return false;
      }

      const matchesQuery =
        !q ||
        c.company.toLowerCase().includes(q) ||
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q);
      if (!matchesQuery) return false;

      if (!invalidDateRange && hasDatePeriod) {
        const refTs =
          dateField === 'updatedAt'
            ? c.updatedAt ?? c.createdAt
            : c.createdAt ?? c.updatedAt;
        return isTimestampInPeriod(refTs, dateFrom, dateTo);
      }
      return true;
    });
  }, [
    unifiedClients,
    validationFilter,
    searchQuery,
    invalidDateRange,
    hasDatePeriod,
    dateField,
    dateFrom,
    dateTo,
  ]);

  const handleCreateClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setFormError(null);
    setFeedback(null);

    const cleanName = fullName.trim().slice(0, FIELD_LIMITS.fullNameMax);
    const cleanCompany = company.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanEmail = email.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanPhone = phone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanCity = city.trim().slice(0, FIELD_LIMITS.cityMax);
    const cleanAddress = address.trim().slice(0, FIELD_LIMITS.addressMax);
    const cleanNotes = notes.trim().slice(0, FIELD_LIMITS.notesMax);

    if (cleanName.length < 2) {
      setFormError('Le nom complet du client doit contenir au moins 2 caractères.');
      return;
    }
    if (cleanCompany.length < 1) {
      setFormError('Le nom de la société ou du client est requis.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setFormError('Veuillez saisir une adresse e-mail client valide.');
      return;
    }
    if (cleanPhone.length < 4) {
      setFormError('Veuillez saisir un numéro de téléphone valide.');
      return;
    }
    if (cleanCity.length < 2) {
      setFormError('Veuillez indiquer la ville du client.');
      return;
    }

    setCreating(true);
    const clientId = `cli-${Date.now()}`;
    const path = `clients/${clientId}`;

    try {
      await setDoc(doc(collection(db, 'clients'), clientId), {
        id: clientId,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        company: cleanCompany,
        city: cleanCity,
        address: cleanAddress,
        notes: cleanNotes,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setFullName('');
      setCompany('');
      setEmail('');
      setPhone('');
      setCity('Niamey');
      setAddress('');
      setNotes('');
      setShowCreateForm(false);
      setFeedback(`Client « ${cleanCompany} » enregistré avec succès.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setCreating(false);
    }
  };

  const openEditClient = (row: UnifiedClientRow) => {
    setEditingRow(row);
    setEditFullName(row.fullName);
    setEditCompany(row.company);
    setEditEmail(row.email);
    setEditPhone(row.phone);
    setEditCity(row.city);
    setEditAddress(row.address);
    setEditNotes(row.notes);
    setEditError(null);
    setFeedback(null);
    setShowCreateForm(false);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRow) return;
    setEditError(null);

    const cleanName = editFullName.trim().slice(0, FIELD_LIMITS.fullNameMax);
    const cleanCompany = editCompany.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanEmail = editEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanPhone = editPhone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanCity = editCity.trim().slice(0, FIELD_LIMITS.cityMax);
    const cleanAddress = editAddress.trim().slice(0, FIELD_LIMITS.addressMax);
    const cleanNotes = editNotes.trim().slice(0, FIELD_LIMITS.notesMax);

    if (cleanName.length < 2 || cleanCompany.length < 1 || cleanPhone.length < 4 || cleanCity.length < 2) {
      setEditError('Veuillez vérifier tous les champs obligatoires (nom, société, téléphone, ville).');
      return;
    }
    if (editingRow.source === 'client' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setEditError('Adresse e-mail client invalide.');
      return;
    }

    setSavingEdit(true);
    const collectionName = editingRow.source === 'client' ? 'clients' : 'users';
    const path = `${collectionName}/${editingRow.docId}`;

    try {
      if (editingRow.source === 'client') {
        await updateDoc(doc(db, 'clients', editingRow.docId), {
          fullName: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          company: cleanCompany,
          city: cleanCity,
          address: cleanAddress,
          notes: cleanNotes,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', editingRow.docId), {
          fullName: cleanName,
          phone: cleanPhone,
          company: cleanCompany,
          city: cleanCity,
          updatedAt: serverTimestamp(),
        });
      }

      setFeedback(`Fiche client « ${cleanCompany} » mise à jour.`);
      setEditingRow(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleValidateClient = async (row: UnifiedClientRow, openCreateTracking: boolean) => {
    if (!user || row.source !== 'user') return;
    setValidatingKey(row.key);
    setFeedback(null);
    const emailLower = row.email.trim().toLowerCase();
    const userPath = `users/${row.docId}`;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', row.docId), {
        accountStatus: 'validated',
        updatedAt: serverTimestamp(),
      });

      // Backfill clientUid on any existing records matching clientEmail
      const matchingShipments = shipments.filter(
        (s) => s.clientEmail.toLowerCase() === emailLower && !s.clientUid
      );
      for (const sh of matchingShipments) {
        batch.update(doc(db, 'shipments', sh.id), {
          clientUid: row.uid,
          updatedAt: serverTimestamp(),
        });
        const evSnap = await getDocs(collection(db, 'shipments', sh.id, 'events'));
        evSnap.docs.forEach((evDoc) => {
          if (!evDoc.data().clientUid) {
            batch.update(evDoc.ref, { clientUid: row.uid });
          }
        });
        const docSnapList = await getDocs(collection(db, 'shipments', sh.id, 'documents'));
        docSnapList.docs.forEach((dDoc) => {
          if (!dDoc.data().clientUid) {
            batch.update(dDoc.ref, { clientUid: row.uid });
          }
        });
      }

      const clientDocsSnap = await getDocs(
        query(collection(db, 'clientDocuments'), where('clientEmail', '==', emailLower))
      );
      clientDocsSnap.docs.forEach((cdDoc) => {
        if (!cdDoc.data().clientUid) {
          batch.update(cdDoc.ref, {
            clientUid: row.uid,
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
            clientUid: row.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      const notifsSnap = await getDocs(
        query(collection(db, 'notifications'), where('clientEmail', '==', emailLower))
      );
      notifsSnap.docs.forEach((nDoc) => {
        if (!nDoc.data().clientUid) {
          batch.update(nDoc.ref, { clientUid: row.uid });
        }
      });

      const welcomeNotifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      batch.set(doc(db, 'notifications', welcomeNotifId), {
        id: welcomeNotifId,
        clientUid: row.uid,
        clientEmail: emailLower,
        shipmentId: '',
        trackingCode: '',
        category: 'status',
        title: 'Compte client validé · Alpha Logistix Group'.slice(0, FIELD_LIMITS.notifTitleMax),
        message: `Votre compte (${row.company}) est activé. Vous pouvez désormais suivre vos expéditions, documents et cotations.`.slice(
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
          uid: row.uid,
          email: row.email,
          name: `${row.company} — ${row.fullName}`,
          city: row.city,
        });
      } else {
        setFeedback(`Compte client « ${row.company} » validé et activé.`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    } finally {
      setValidatingKey(null);
    }
  };

  const handleRejectClient = async (row: UnifiedClientRow) => {
    if (row.source !== 'user') return;
    setValidatingKey(row.key);
    setFeedback(null);
    const path = `users/${row.docId}`;
    try {
      await updateDoc(doc(db, 'users', row.docId), {
        accountStatus: 'rejected',
        updatedAt: serverTimestamp(),
      });
      setFeedback(`Compte client « ${row.company} » marqué comme non validé.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setValidatingKey(null);
    }
  };

  const handleDeleteClient = async (row: UnifiedClientRow) => {
    const collectionName = row.source === 'client' ? 'clients' : 'users';
    const path = `${collectionName}/${row.docId}`;
    try {
      await deleteDoc(doc(db, collectionName, row.docId));
      setConfirmDeleteKey(null);
      if (editingRow?.key === row.key) setEditingRow(null);
      setFeedback(`Client « ${row.company} » supprimé.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-6">
      {/* Pending Client Registrations Alert Banner */}
      {pendingUsersCount > 0 && (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 text-xs text-amber-950">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {pendingUsersCount} nouveau(x) compte(s) client(s) en attente de validation
              </p>
              <p className="mt-0.5 text-amber-800">
                Validez le compte du client ou cliquez sur « Valider & Créer suivi » pour ouvrir
                immédiatement son dossier tracking.
              </p>
            </div>
          </div>
          {validationFilter !== 'pending' && (
            <button
              type="button"
              onClick={() => setValidationFilter('pending')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Afficher ({pendingUsersCount}) à valider
            </button>
          )}
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un client par société, nom, e-mail ou ville..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={filteredClients.length === 0 || invalidDateRange}
            onClick={() =>
              exportClientsPdf(
                filteredClients.map((c) => ({
                  company: c.company,
                  fullName: c.fullName,
                  email: c.email,
                  phone: c.phone,
                  city: c.city,
                  address: c.address,
                  shipmentsCount: c.shipmentsCount,
                  sourceLabel: c.source === 'client' ? 'Fiche admin' : 'Compte inscrit',
                  createdAt: c.createdAt,
                })),
                {
                  dateFrom,
                  dateTo,
                  dateFieldLabel: hasDatePeriod ? dateFieldLabel : undefined,
                }
              )
            }
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-orange-700 bg-white hover:bg-orange-50 border border-orange-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
          >
            <FileDown className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <span>Exporter PDF ({filteredClients.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowCreateForm((v) => !v);
              setEditingRow(null);
              setFormError(null);
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
                <span>Créer un client</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setValidationFilter('ALL')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            validationFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          Tous ({unifiedClients.length})
        </button>
        <button
          type="button"
          onClick={() => setValidationFilter('pending')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            validationFilter === 'pending'
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>En attente de validation ({pendingUsersCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setValidationFilter('validated')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            validationFilter === 'validated'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          Validés ({unifiedClients.filter((c) => c.source === 'client' || c.accountStatus === 'validated').length})
        </button>
      </div>

      {/* Date Period Selection Bar for Clients PDF Export */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 mr-1">
            <Calendar className="w-3.5 h-3.5 text-sky-700" aria-hidden="true" />
            <span>Période d’exportation :</span>
          </span>

          <select
            aria-label="Critère de date des clients"
            value={dateField}
            onChange={(e) => setDateField(e.target.value as 'createdAt' | 'updatedAt')}
            className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          >
            <option value="createdAt">Date de création</option>
            <option value="updatedAt">Date de mise à jour</option>
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span>Du</span>
            <input
              type="date"
              aria-label="Date de début clients"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-h-[36px] px-2.5 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </label>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span>Au</span>
            <input
              type="date"
              aria-label="Date de fin clients"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-h-[36px] px-2.5 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </label>

          {hasDatePeriod && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 bg-white hover:bg-orange-50 border border-orange-300 rounded-lg transition-colors cursor-pointer min-h-[36px]"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>

        {invalidDateRange ? (
          <p role="alert" className="text-xs font-medium text-red-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>La date de début doit être antérieure ou égale à la date de fin.</span>
          </p>
        ) : (
          <p className="text-xs text-slate-500 tabular-nums">
            {hasDatePeriod
              ? `${filteredClients.length} client(s) inclus dans la période sélectionnée`
              : 'Toutes les dates sont incluses dans l’export PDF'}
          </p>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-800 underline cursor-pointer shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Create Client Form */}
      {showCreateForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h3 className="font-display text-lg font-bold text-slate-900">
            Nouveau dossier client
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Enregistrez les coordonnées du client. Vous pourrez ensuite lui attribuer un ou plusieurs
            numéros de suivi tracking.
          </p>

          <form onSubmit={handleCreateClient} noValidate className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="new-cli-company" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Société / Entreprise
                </label>
                <input
                  id="new-cli-company"
                  type="text"
                  maxLength={FIELD_LIMITS.companyMax}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Sahel Import-Export SARL"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="new-cli-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nom complet du contact
                </label>
                <input
                  id="new-cli-fullname"
                  type="text"
                  maxLength={FIELD_LIMITS.fullNameMax}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Moussa Abdoulaye"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="new-cli-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Adresse e-mail
                </label>
                <input
                  id="new-cli-email"
                  type="email"
                  maxLength={FIELD_LIMITS.emailMax}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@entreprise.com"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="new-cli-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Téléphone / WhatsApp
                </label>
                <input
                  id="new-cli-phone"
                  type="tel"
                  maxLength={FIELD_LIMITS.phoneMax}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+227 90 00 00 00"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="new-cli-city" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Ville
                </label>
                <input
                  id="new-cli-city"
                  type="text"
                  maxLength={FIELD_LIMITS.cityMax}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Niamey"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="new-cli-address" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Adresse / Quartier (optionnel)
                </label>
                <input
                  id="new-cli-address"
                  type="text"
                  maxLength={FIELD_LIMITS.addressMax}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Zone Industrielle, Niamey"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="new-cli-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                Notes internes (optionnel)
              </label>
              <input
                id="new-cli-notes"
                type="text"
                maxLength={FIELD_LIMITS.notesMax}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex. Client régulier Chine -> Cotonou -> Niamey"
                className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            {formError && (
              <p role="alert" className="flex items-center gap-2 text-xs font-medium text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer min-h-[40px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[40px]"
              >
                {creating ? 'Enregistrement...' : 'Enregistrer le client'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Client Panel */}
      {editingRow && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-sky-700">Modification de fiche client</p>
              <h3 className="mt-1 font-display text-lg font-bold text-slate-900">
                {editingRow.company} — {editingRow.fullName}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setEditingRow(null)}
              aria-label="Fermer l’édition"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} noValidate className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="edit-cli-company" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Société / Entreprise
                </label>
                <input
                  id="edit-cli-company"
                  type="text"
                  maxLength={FIELD_LIMITS.companyMax}
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="edit-cli-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nom complet
                </label>
                <input
                  id="edit-cli-fullname"
                  type="text"
                  maxLength={FIELD_LIMITS.fullNameMax}
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="edit-cli-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  E-mail {editingRow.source === 'user' ? '(compte Google fixe)' : ''}
                </label>
                <input
                  id="edit-cli-email"
                  type="email"
                  maxLength={FIELD_LIMITS.emailMax}
                  value={editEmail}
                  disabled={editingRow.source === 'user'}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="edit-cli-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Téléphone / WhatsApp
                </label>
                <input
                  id="edit-cli-phone"
                  type="tel"
                  maxLength={FIELD_LIMITS.phoneMax}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="edit-cli-city" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Ville
                </label>
                <input
                  id="edit-cli-city"
                  type="text"
                  maxLength={FIELD_LIMITS.cityMax}
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              {editingRow.source === 'client' && (
                <div>
                  <label htmlFor="edit-cli-address" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Adresse
                  </label>
                  <input
                    id="edit-cli-address"
                    type="text"
                    maxLength={FIELD_LIMITS.addressMax}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
              )}
            </div>

            {editingRow.source === 'client' && (
              <div>
                <label htmlFor="edit-cli-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Notes internes
                </label>
                <input
                  id="edit-cli-notes"
                  type="text"
                  maxLength={FIELD_LIMITS.notesMax}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            )}

            {editError && (
              <p role="alert" className="flex items-center gap-2 text-xs font-medium text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{editError}</span>
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer min-h-[40px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[40px]"
              >
                {savingEdit ? 'Mise à jour...' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Clients Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {unifiedClients.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">
              Aucun client enregistré pour le moment
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Créez une fiche client dès maintenant ou attendez qu’un client s’inscrive depuis le
              portail de suivi.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg cursor-pointer min-h-[40px]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Créer le premier client</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Société & Contact</th>
                  <th className="py-3 px-4">E-mail & Téléphone</th>
                  <th className="py-3 px-4">Ville</th>
                  <th className="py-3 px-4 text-right">Dossiers</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500">
                      Aucun client ne correspond à votre recherche.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        row.source === 'user' && row.accountStatus === 'pending'
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-3 px-4 align-top">
                        <p className="font-semibold text-slate-900">{row.company}</p>
                        <p className="text-xs text-slate-600">
                          {row.fullName} ·{' '}
                          <span className="text-slate-400">
                            {row.source === 'client' ? 'Fiche admin' : 'Compte inscrit'}
                          </span>
                        </p>
                        {row.source === 'user' && (
                          <p className="mt-1 text-[11px] font-semibold">
                            {row.accountStatus === 'pending' ? (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                <span>En attente de validation</span>
                              </span>
                            ) : row.accountStatus === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 text-red-700">
                                <Ban className="w-3 h-3" aria-hidden="true" />
                                <span>Non validé</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                <span>Compte validé</span>
                              </span>
                            )}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <p className="text-xs text-slate-800">{row.email}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                          {row.phone}
                        </p>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <p className="text-xs font-medium text-slate-800">{row.city}</p>
                        {row.address && (
                          <p className="mt-0.5 text-[11px] text-slate-500 truncate max-w-[180px]">
                            {row.address}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {row.shipmentsCount}
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {row.source === 'user' && row.accountStatus === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={validatingKey === row.key}
                                onClick={() => void handleValidateClient(row, true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {validatingKey === row.key
                                    ? 'Validation...'
                                    : 'Valider & Créer suivi'}
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={validatingKey === row.key}
                                onClick={() => void handleValidateClient(row, false)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Valider</span>
                              </button>

                              <button
                                type="button"
                                disabled={validatingKey === row.key}
                                onClick={() => void handleRejectClient(row)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Ban className="w-3 h-3" aria-hidden="true" />
                                <span>Refuser</span>
                              </button>
                            </>
                          )}

                          {row.source === 'user' && row.accountStatus === 'rejected' && (
                            <button
                              type="button"
                              disabled={validatingKey === row.key}
                              onClick={() => void handleValidateClient(row, false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Réactiver & Valider</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onManageDocumentsForClient(row.email)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Documents</span>
                          </button>

                          {(row.source === 'client' || row.accountStatus === 'validated') && (
                            <button
                              type="button"
                              onClick={() =>
                                onCreateShipmentForClient({
                                  uid: row.uid,
                                  email: row.email,
                                  name: `${row.company} — ${row.fullName}`,
                                  city: row.city,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Créer dossier</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openEditClient(row)}
                            aria-label={`Modifier ${row.company}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 bg-white border border-orange-200 hover:bg-orange-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Modifier</span>
                          </button>

                          {confirmDeleteKey === row.key ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleDeleteClient(row)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-md cursor-pointer whitespace-nowrap"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(null)}
                                className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(row.key)}
                              aria-label={`Supprimer ${row.company}`}
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
