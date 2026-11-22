import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileDown,
  FileSpreadsheet,
  FileText,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  POSITION_SOURCES,
  POSITION_SOURCE_LABELS,
  PositionSource,
  syncPublicTracking,
} from '../lib/publicTracking';
import {
  exportShipmentDetailPdf,
  exportShipmentsListPdf,
  isDateRangeInvalid,
  isTimestampInPeriod,
} from '../lib/pdfExport';
import {
  ClientRecord,
  FIELD_LIMITS,
  QuoteRequestRecord,
  ServiceCategory,
  SHIPMENT_STATUSES,
  ShipmentRecord,
  ShipmentStatus,
  TrackingEventRecord,
  TRANSPORT_MODES,
  UserProfile,
} from '../types/logistics';
import { AdminClientsPanel } from './AdminClientsPanel';
import { AdminDocumentsPanel } from './AdminDocumentsPanel';
import { AdminPendingRequestsPanel } from './AdminPendingRequestsPanel';
import { AdminQuotesPanel } from './AdminQuotesPanel';
import { AdminStaffPanel } from './AdminStaffPanel';
import { ShipmentDocumentsPanel } from './ShipmentDocumentsPanel';
import { StatusText } from './StatusText';

type AdminTab =
  | 'dashboard'
  | 'tracking'
  | 'pendingRequests'
  | 'create'
  | 'clients'
  | 'documents'
  | 'quotes'
  | 'users';

const LOCATION_PRESETS = [
  'Port de Shanghai (Chine) — Terminal export',
  'Port de Ningbo-Zhoushan (Chine) — Embarquement',
  'Port de Shenzhen / Yantian (Chine)',
  'Port de Guangzhou / Nansha (Chine)',
  'Port de Qingdao (Chine)',
  'En transit maritime — Océan Indien',
  'Aéroport de Dubaï (DXB / DWC) — Fret prêt au départ',
  'En transit aérien vers Niamey',
  'Port de Cotonou (Bénin) — Parc sous douane',
  'Port de Lomé (Togo) — Terminal conteneurs',
  'Corridor Cotonou–Niamey — Frontière Malanville / Gaya',
  'Aéroport Diori Hamani — Niamey (Douane)',
  'Niamey — Entrepôt Alpha Logistix Group',
  'Livré chez le client final',
];

const ORIGIN_PRESETS = [
  'Port de Shanghai (Chine)',
  'Port de Ningbo-Zhoushan (Chine)',
  'Port de Shenzhen / Yantian (Chine)',
  'Port de Guangzhou / Nansha (Chine)',
  'Port de Qingdao (Chine)',
  'Port de Tianjin (Chine)',
  'Aéroport de Dubaï (DXB / DWC)',
  'Port de Cotonou (Bénin)',
  'Port de Lomé (Togo)',
];

function generateTrackingCode(): string {
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `ALG-2026-${randomDigits}`;
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

export function AdminTrackingWorkspace() {
  const { user, authReady, canManageUsers, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [docPreselectClientEmail, setDocPreselectClientEmail] = useState('');

  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [quotes, setQuotes] = useState<QuoteRequestRecord[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [adminClients, setAdminClients] = useState<ClientRecord[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<TrackingEventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShipmentStatus>('ALL');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportDateField, setExportDateField] = useState<'updatedAt' | 'createdAt'>('updatedAt');

  // Position Update Form State
  const [newLocation, setNewLocation] = useState('');
  const [newStatus, setNewStatus] = useState<ShipmentStatus>('En transit maritime');
  const [newEta, setNewEta] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSource, setNewSource] = useState<PositionSource>('confirmed');
  const [updatingPos, setUpdatingPos] = useState(false);
  const [posFeedback, setPosFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Edit Shipment Metadata State
  const [editingShipment, setEditingShipment] = useState(false);
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editMode, setEditMode] = useState<ServiceCategory>('Fret maritime');
  const [editOrigin, setEditOrigin] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editEta, setEditEta] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Confirm delete state (no window.confirm!)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Create Shipment Form State
  const [selectedClientKey, setSelectedClientKey] = useState<string>('');
  const [selectedClientUid, setSelectedClientUid] = useState<string>('');
  const [trackingCode, setTrackingCode] = useState<string>(() => generateTrackingCode());
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [transportMode, setTransportMode] = useState<ServiceCategory>('Fret maritime');
  const [origin, setOrigin] = useState('Port de Shanghai (Chine)');
  const [destination, setDestination] = useState('Niamey (Niger)');
  const [cargoDescription, setCargoDescription] = useState('');
  const [weightOrVolume, setWeightOrVolume] = useState('');
  const [initialLocation, setInitialLocation] = useState('Port de Shanghai (Chine) — Terminal export');
  const [initialStatus, setInitialStatus] = useState<ShipmentStatus>('Pris en charge');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Subscribe to all shipments
  useEffect(() => {
    if (!authReady || !user) return;
    setLoadingShipments(true);

    const q = query(collection(db, 'shipments'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => docSnap.data() as ShipmentRecord);
        setShipments(list);
        setLoadingShipments(false);
        setSelectedId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      },
      (error) => {
        setLoadingShipments(false);
        handleFirestoreError(error, OperationType.LIST, 'shipments');
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  // Subscribe to self-registered clients (/users)
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => docSnap.data() as UserProfile);
        list.sort((a, b) => a.company.localeCompare(b.company, 'fr'));
        setRegisteredUsers(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  // Subscribe to admin-created clients (/clients)
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubscribe = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => docSnap.data() as ClientRecord);
        list.sort((a, b) => a.company.localeCompare(b.company, 'fr'));
        setAdminClients(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients');
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  // Subscribe to all client quote / shipping requests (/quoteRequests)
  useEffect(() => {
    if (!authReady || !user) return;
    setLoadingQuotes(true);

    const q = query(collection(db, 'quoteRequests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as QuoteRequestRecord),
          id: docSnap.id,
        }));
        setQuotes(list);
        setLoadingQuotes(false);
      },
      (error) => {
        setLoadingQuotes(false);
        handleFirestoreError(error, OperationType.LIST, 'quoteRequests');
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  // Subscribe to events of currently selected shipment
  useEffect(() => {
    if (!authReady || !user || !selectedId) {
      setEvents([]);
      return;
    }

    setLoadingEvents(true);
    const path = `shipments/${selectedId}/events`;
    const q = query(
      collection(db, 'shipments', selectedId, 'events'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as TrackingEventRecord),
        }));
        setEvents(list);
        setLoadingEvents(false);
      },
      (error) => {
        setLoadingEvents(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [authReady, user, selectedId]);

  const selectedShipment = useMemo(
    () => shipments.find((s) => s.id === selectedId) ?? null,
    [shipments, selectedId]
  );

  useEffect(() => {
    if (!selectedShipment) return;
    setNewLocation(selectedShipment.currentLocation);
    setNewStatus(selectedShipment.currentStatus);
    setNewEta(selectedShipment.estimatedArrival);
    setNewNotes('');
    setPosFeedback(null);
    setConfirmDeleteId(null);
    setEditingShipment(false);

    setEditClientEmail(selectedShipment.clientEmail);
    setEditClientName(selectedShipment.clientName);
    setEditMode(selectedShipment.transportMode);
    setEditOrigin(selectedShipment.origin);
    setEditDestination(selectedShipment.destination);
    setEditCargo(selectedShipment.cargoDescription);
    setEditWeight(selectedShipment.weightOrVolume);
    setEditEta(selectedShipment.estimatedArrival);
  }, [selectedShipment?.id]);

  const clientChoices = useMemo(() => {
    return [
      ...adminClients.map((c) => ({
        key: `cli:${c.id}`,
        uid: '',
        email: c.email,
        name: `${c.company} — ${c.fullName}`,
        city: c.city,
        sourceLabel: 'Fiche admin',
      })),
      ...registeredUsers.map((u) => ({
        key: `usr:${u.uid}`,
        uid: u.uid,
        email: u.email,
        name: `${u.company} — ${u.fullName}`,
        city: u.city,
        sourceLabel: 'Compte client',
      })),
    ].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [adminClients, registeredUsers]);

  const invalidDateRange = isDateRangeInvalid(exportDateFrom, exportDateTo);
  const hasDatePeriod = Boolean(exportDateFrom || exportDateTo);
  const dateFieldLabel = exportDateField === 'createdAt' ? 'création' : 'mise à jour';

  const filteredShipments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shipments.filter((item) => {
      const matchesStatus = statusFilter === 'ALL' || item.currentStatus === statusFilter;
      const matchesQuery =
        !q ||
        item.trackingCode.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.clientEmail.toLowerCase().includes(q) ||
        item.currentLocation.toLowerCase().includes(q) ||
        item.cargoDescription.toLowerCase().includes(q);

      if (!matchesStatus || !matchesQuery) return false;

      if (!invalidDateRange && hasDatePeriod) {
        const refTs =
          exportDateField === 'createdAt'
            ? item.createdAt ?? item.updatedAt
            : item.updatedAt ?? item.createdAt;
        return isTimestampInPeriod(refTs, exportDateFrom, exportDateTo);
      }
      return true;
    });
  }, [
    shipments,
    searchQuery,
    statusFilter,
    invalidDateRange,
    hasDatePeriod,
    exportDateField,
    exportDateFrom,
    exportDateTo,
  ]);

  const filteredEventsForExport = useMemo(() => {
    if (invalidDateRange || !hasDatePeriod) return events;
    return events.filter((ev) => isTimestampInPeriod(ev.createdAt, exportDateFrom, exportDateTo));
  }, [events, invalidDateRange, hasDatePeriod, exportDateFrom, exportDateTo]);

  const handleSelectClientChoice = (key: string) => {
    setSelectedClientKey(key);
    const match = clientChoices.find((c) => c.key === key);
    if (match) {
      setSelectedClientUid(match.uid);
      setClientEmail(match.email);
      setClientName(match.name);
      if (match.city) {
        setDestination(match.city);
      }
    } else {
      setSelectedClientUid('');
    }
  };

  const handleCreateShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !user.email) return;
    setCreateError(null);

    const cleanCode = trackingCode.trim().toUpperCase();
    const cleanEmail = clientEmail.trim().toLowerCase();
    const cleanName = clientName.trim();
    const cleanOrigin = origin.trim();
    const cleanDestination = destination.trim();
    const cleanCargo = cargoDescription.trim();
    const cleanWeight = weightOrVolume.trim();
    const cleanLocation = initialLocation.trim();
    const cleanEta = estimatedArrival.trim();

    if (!FIELD_LIMITS.trackingCodePattern.test(cleanCode) || cleanCode.length < 4 || cleanCode.length > 40) {
      setCreateError('Code de suivi invalide (lettres majuscules, chiffres et tirets uniquement, 4–40 caractères).');
      return;
    }
    if (shipments.some((s) => s.id === cleanCode)) {
      setCreateError(`Un dossier utilise déjà le numéro de suivi ${cleanCode}. Générez un autre numéro.`);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setCreateError('Adresse e-mail client invalide.');
      return;
    }
    if (cleanName.length < 2 || cleanOrigin.length < 2 || cleanDestination.length < 2 || cleanCargo.length < 2 || cleanWeight.length < 1 || cleanLocation.length < 2) {
      setCreateError('Veuillez remplir tous les champs obligatoires du dossier client.');
      return;
    }

    setCreating(true);
    const shipmentId = cleanCode;
    const eventId = `evt-${Date.now()}`;
    const matchedUser = registeredUsers.find(
      (u) => (selectedClientUid && u.uid === selectedClientUid) || u.email.toLowerCase() === cleanEmail
    );
    const resolvedClientUid = selectedClientUid || matchedUser?.uid || '';

    try {
      const batch = writeBatch(db);
      const shipmentRef = doc(db, 'shipments', shipmentId);
      const eventRef = doc(db, 'shipments', shipmentId, 'events', eventId);

      batch.set(shipmentRef, {
        id: shipmentId,
        trackingCode: cleanCode,
        clientUid: resolvedClientUid,
        clientEmail: cleanEmail.slice(0, FIELD_LIMITS.emailMax),
        clientName: cleanName.slice(0, FIELD_LIMITS.companyMax),
        transportMode,
        origin: cleanOrigin.slice(0, FIELD_LIMITS.originDestMax),
        destination: cleanDestination.slice(0, FIELD_LIMITS.originDestMax),
        cargoDescription: cleanCargo.slice(0, FIELD_LIMITS.cargoDescriptionMax),
        weightOrVolume: cleanWeight.slice(0, FIELD_LIMITS.weightOrVolumeMax),
        currentLocation: cleanLocation.slice(0, FIELD_LIMITS.locationMax),
        currentStatus: initialStatus,
        estimatedArrival: cleanEta.slice(0, FIELD_LIMITS.etaMax),
        updatesCount: 1,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(eventRef, {
        shipmentId,
        clientUid: resolvedClientUid,
        clientEmail: cleanEmail.slice(0, FIELD_LIMITS.emailMax),
        location: cleanLocation.slice(0, FIELD_LIMITS.locationMax),
        status: initialStatus,
        notes: 'Création du dossier client et attribution du numéro de suivi.',
        recordedBy: user.uid,
        recordedByEmail: user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax),
        createdAt: serverTimestamp(),
      });

      const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        clientUid: resolvedClientUid,
        clientEmail: cleanEmail.slice(0, FIELD_LIMITS.emailMax),
        shipmentId,
        trackingCode: cleanCode,
        category: 'status',
        title: `Nouveau dossier d’expédition · ${cleanCode}`.slice(0, FIELD_LIMITS.notifTitleMax),
        message: `${cleanOrigin} → ${cleanDestination} · Position initiale : ${cleanLocation} (${initialStatus}).`.slice(
          0,
          FIELD_LIMITS.notifMessageMax
        ),
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      if (matchedUser && (matchedUser.accountStatus ?? 'validated') === 'pending') {
        batch.update(doc(db, 'users', matchedUser.uid), {
          accountStatus: 'validated',
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      void syncPublicTracking({
        trackingCode: cleanCode,
        transportMode,
        origin: cleanOrigin.slice(0, FIELD_LIMITS.originDestMax),
        destination: cleanDestination.slice(0, FIELD_LIMITS.originDestMax),
        currentLocation: cleanLocation.slice(0, FIELD_LIMITS.locationMax),
        currentStatus: initialStatus,
        estimatedArrival: cleanEta.slice(0, FIELD_LIMITS.etaMax),
        positionSource: 'confirmed',
      });

      setSelectedId(shipmentId);
      setTrackingCode(generateTrackingCode());
      setCargoDescription('');
      setWeightOrVolume('');
      setEstimatedArrival('');
      setSelectedClientKey('');
      setActiveTab('tracking');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `shipments/${shipmentId}`);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdatePosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !user.email || !selectedShipment) return;
    setPosFeedback(null);

    const cleanLoc = newLocation.trim().slice(0, FIELD_LIMITS.locationMax);
    const sourceTag = `[Source : ${POSITION_SOURCE_LABELS[newSource].fr}]`;
    const cleanNotes = `${sourceTag} ${newNotes.trim()}`
      .trim()
      .slice(0, FIELD_LIMITS.notesMax);
    const cleanEta = newEta.trim().slice(0, FIELD_LIMITS.etaMax);

    if (cleanLoc.length < 2) {
      setPosFeedback({ type: 'err', text: 'Veuillez indiquer la position actuelle de la marchandise.' });
      return;
    }

    setUpdatingPos(true);
    const eventId = `evt-${Date.now()}`;

    try {
      const batch = writeBatch(db);
      const shipmentRef = doc(db, 'shipments', selectedShipment.id);
      const eventRef = doc(db, 'shipments', selectedShipment.id, 'events', eventId);

      batch.update(shipmentRef, {
        currentLocation: cleanLoc,
        currentStatus: newStatus,
        estimatedArrival: cleanEta,
        updatesCount: (selectedShipment.updatesCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      batch.set(eventRef, {
        shipmentId: selectedShipment.id,
        clientUid: selectedShipment.clientUid || '',
        clientEmail: selectedShipment.clientEmail,
        location: cleanLoc,
        status: newStatus,
        notes: cleanNotes,
        recordedBy: user.uid,
        recordedByEmail: user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax),
        createdAt: serverTimestamp(),
      });

      const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        clientUid: selectedShipment.clientUid || '',
        clientEmail: selectedShipment.clientEmail.toLowerCase(),
        shipmentId: selectedShipment.id,
        trackingCode: selectedShipment.trackingCode,
        category: 'position',
        title: `Position mise à jour · ${selectedShipment.trackingCode}`.slice(
          0,
          FIELD_LIMITS.notifTitleMax
        ),
        message: `${cleanLoc} — Statut : ${newStatus}${cleanEta ? ` · ETA : ${cleanEta}` : ''}${cleanNotes ? ` (${cleanNotes})` : ''}`.slice(
          0,
          FIELD_LIMITS.notifMessageMax
        ),
        read: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      void syncPublicTracking({
        trackingCode: selectedShipment.trackingCode,
        transportMode: selectedShipment.transportMode,
        origin: selectedShipment.origin,
        destination: selectedShipment.destination,
        currentLocation: cleanLoc,
        currentStatus: newStatus,
        estimatedArrival: cleanEta,
        positionSource: newSource,
      });

      setNewNotes('');
      setPosFeedback({
        type: 'ok',
        text: `Position mise à jour : « ${cleanLoc} ». Le client voit cette étape en direct.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `shipments/${selectedShipment.id}`);
    } finally {
      setUpdatingPos(false);
    }
  };

  const handleSaveShipmentMeta = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedShipment) return;
    setPosFeedback(null);

    const cleanEmail = editClientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanName = editClientName.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanOrigin = editOrigin.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanDest = editDestination.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanCargo = editCargo.trim().slice(0, FIELD_LIMITS.cargoDescriptionMax);
    const cleanWeight = editWeight.trim().slice(0, FIELD_LIMITS.weightOrVolumeMax);
    const cleanEta = editEta.trim().slice(0, FIELD_LIMITS.etaMax);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanName.length < 2 || cleanOrigin.length < 2 || cleanDest.length < 2 || cleanCargo.length < 2 || cleanWeight.length < 1) {
      setPosFeedback({ type: 'err', text: 'Veuillez vérifier tous les champs du dossier.' });
      return;
    }

    setSavingMeta(true);
    try {
      const matchedUser = registeredUsers.find((u) => u.email.toLowerCase() === cleanEmail);
      const nextUid =
        matchedUser?.uid ||
        (cleanEmail === selectedShipment.clientEmail ? selectedShipment.clientUid || '' : '');

      const allOps: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [
        {
          ref: doc(db, 'shipments', selectedShipment.id),
          data: {
            clientUid: nextUid,
            clientEmail: cleanEmail,
            clientName: cleanName,
            transportMode: editMode,
            origin: cleanOrigin,
            destination: cleanDest,
            cargoDescription: cleanCargo,
            weightOrVolume: cleanWeight,
            estimatedArrival: cleanEta,
            updatedAt: serverTimestamp(),
          },
        },
      ];

      if (cleanEmail !== selectedShipment.clientEmail || nextUid !== (selectedShipment.clientUid || '')) {
        const [eventsSnap, docsSnap, notifsSnap] = await Promise.all([
          getDocs(collection(db, 'shipments', selectedShipment.id, 'events')),
          getDocs(collection(db, 'shipments', selectedShipment.id, 'documents')),
          getDocs(
            query(collection(db, 'notifications'), where('shipmentId', '==', selectedShipment.id))
          ),
        ]);

        eventsSnap.docs.forEach((d) =>
          allOps.push({ ref: d.ref, data: { clientUid: nextUid, clientEmail: cleanEmail } })
        );
        docsSnap.docs.forEach((d) =>
          allOps.push({ ref: d.ref, data: { clientUid: nextUid, clientEmail: cleanEmail } })
        );
        notifsSnap.docs.forEach((d) =>
          allOps.push({ ref: d.ref, data: { clientUid: nextUid, clientEmail: cleanEmail } })
        );
      }

      for (let i = 0; i < allOps.length; i += 450) {
        const batch = writeBatch(db);
        allOps.slice(i, i + 450).forEach((item) => batch.update(item.ref, item.data));
        await batch.commit();
      }

      setNewEta(cleanEta);
      setEditingShipment(false);
      setPosFeedback({
        type: 'ok',
        text: `Dossier ${selectedShipment.trackingCode} mis à jour.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shipments/${selectedShipment.id}`);
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDeleteShipment = async (shipment: ShipmentRecord) => {
    try {
      const [eventsSnap, docsSnap, notifsSnap] = await Promise.all([
        getDocs(collection(db, 'shipments', shipment.id, 'events')),
        getDocs(collection(db, 'shipments', shipment.id, 'documents')),
        getDocs(query(collection(db, 'notifications'), where('shipmentId', '==', shipment.id))),
      ]);

      const refsToDelete = [
        ...eventsSnap.docs.map((d) => d.ref),
        ...docsSnap.docs.map((d) => d.ref),
        ...notifsSnap.docs.map((d) => d.ref),
        doc(db, 'shipments', shipment.id),
      ];

      for (let i = 0; i < refsToDelete.length; i += 450) {
        const batch = writeBatch(db);
        refsToDelete.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      setConfirmDeleteId(null);
      setSelectedId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shipments/${shipment.id}`);
    }
  };

  const inTransitCount = shipments.filter(
    (s) => s.currentStatus !== 'Livré' && s.currentStatus !== 'En dédouanement'
  ).length;
  const customsCount = shipments.filter((s) => s.currentStatus === 'En dédouanement').length;
  const deliveredCount = shipments.filter((s) => s.currentStatus === 'Livré').length;
  const totalClientsCount = adminClients.length + registeredUsers.length;
  const pendingUsersCount = registeredUsers.filter(
    (u) => (u.accountStatus ?? 'validated') === 'pending'
  ).length;
  const pendingQuotesCount = quotes.filter(
    (q) => q.status === 'En attente' || q.status === "À l'étude"
  ).length;
  const totalPendingRequestsCount = pendingUsersCount + pendingQuotesCount;

  return (
    <div className="space-y-6">
      {/* Admin Summary Strip */}
      {activeTab !== 'dashboard' && (
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total dossiers</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {shipments.length}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">En transit</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-sky-700 tabular-nums">
            {inTransitCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">En dédouanement</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {customsCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Livrées</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {deliveredCount}
          </p>
        </div>
      </div>
      )}

      {/* Admin Workspace Navigation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Sections d'administration"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'dashboard'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tableau de bord
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tracking'}
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'tracking'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dossiers & Positions ({shipments.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pendingRequests'}
            onClick={() => setActiveTab('pendingRequests')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'pendingRequests'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Demandes en attente</span>
            {totalPendingRequestsCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-orange-600 rounded tabular-nums">
                {totalPendingRequestsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create'}
            onClick={() => setActiveTab('create')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'create'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Créer un dossier</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'clients'}
            onClick={() => setActiveTab('clients')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'clients'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Clients ({totalClientsCount})</span>
            {pendingUsersCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-orange-600 rounded tabular-nums">
                {pendingUsersCount} à valider
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'documents'}
            onClick={() => setActiveTab('documents')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'documents'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Documents clients</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quotes'}
            onClick={() => setActiveTab('quotes')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
              activeTab === 'quotes'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cotations</span>
          </button>

          {canManageUsers && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'users'}
              onClick={() => setActiveTab('users')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
                activeTab === 'users'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Utilisateurs</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 bg-white hover:bg-orange-50 border border-orange-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] self-start md:self-auto"
        >
          <LogOut className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          <span>Déconnexion</span>
        </button>
      </div>

      {/* TAB 0: GENERAL TRACKING DASHBOARD */}
      {activeTab === 'dashboard' && (
        <AdminDashboard
          shipments={shipments}
          quotes={quotes}
          users={registeredUsers}
          clients={adminClients}
          onOpenTab={(tab) => setActiveTab(tab)}
          onOpenShipment={(id) => {
            setSelectedId(id);
            setActiveTab('tracking');
          }}
        />
      )}

      {/* TAB 1: TRACKING & LIVE POSITION UPDATE */}
      {activeTab === 'tracking' && (
        <div className="space-y-4">
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
                placeholder="Filtrer par code suivi, client ou position..."
                className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                aria-label="Filtrer par statut"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ShipmentStatus)}
                className="min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="ALL">Tous les statuts</option>
                {SHIPMENT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={filteredShipments.length === 0 || invalidDateRange}
                onClick={() =>
                  exportShipmentsListPdf(filteredShipments, {
                    dateFrom: exportDateFrom,
                    dateTo: exportDateTo,
                    dateFieldLabel: hasDatePeriod ? dateFieldLabel : undefined,
                  })
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
              >
                <FileDown className="w-4 h-4" aria-hidden="true" />
                <span>Exporter PDF ({filteredShipments.length})</span>
              </button>
            </div>
          </div>

          {/* Date Period Selection Bar for PDF Export & Filtering */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 mr-1">
                <Calendar className="w-3.5 h-3.5 text-sky-700" aria-hidden="true" />
                <span>Période d’exportation :</span>
              </span>

              <select
                aria-label="Critère de date pour la période"
                value={exportDateField}
                onChange={(e) => setExportDateField(e.target.value as 'updatedAt' | 'createdAt')}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="updatedAt">Date de mise à jour</option>
                <option value="createdAt">Date de création</option>
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <span>Du</span>
                <input
                  type="date"
                  aria-label="Date de début d'exportation"
                  value={exportDateFrom}
                  onChange={(e) => setExportDateFrom(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <span>Au</span>
                <input
                  type="date"
                  aria-label="Date de fin d'exportation"
                  value={exportDateTo}
                  onChange={(e) => setExportDateTo(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </label>

              {hasDatePeriod && (
                <button
                  type="button"
                  onClick={() => {
                    setExportDateFrom('');
                    setExportDateTo('');
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
                  ? `${filteredShipments.length} dossier(s) inclus dans la période sélectionnée`
                  : 'Toutes les dates sont incluses dans l’export PDF'}
              </p>
            )}
          </div>

          {loadingShipments ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : shipments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                Aucun dossier créé pour le moment
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Créez votre premier dossier client pour attribuer un numéro de suivi et mettre à
                jour la position de la marchandise étape par étape.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer min-h-[44px]"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Créer un premier dossier</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Table */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Dossier & Client</th>
                        <th className="py-3 px-4">Position actuelle</th>
                        <th className="py-3 px-4">Statut</th>
                        <th className="py-3 px-4 text-right">Étapes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredShipments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 px-4 text-center text-xs text-slate-500">
                            Aucun dossier ne correspond à ce filtre.
                          </td>
                        </tr>
                      ) : (
                        filteredShipments.map((item) => {
                          const active = item.id === selectedId;
                          return (
                            <tr
                              key={item.id}
                              onClick={() => setSelectedId(item.id)}
                              className={`cursor-pointer transition-colors ${
                                active ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-3 px-4 align-top">
                                <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {item.trackingCode}
                                </p>
                                <p className="mt-0.5 text-xs font-medium text-slate-700 truncate max-w-[180px]">
                                  {item.clientName}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                  {item.clientEmail}
                                </p>
                              </td>
                              <td className="py-3 px-4 align-top">
                                <p className="text-xs font-medium text-slate-900">
                                  {item.currentLocation}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {item.origin} → {item.destination}
                                </p>
                              </td>
                              <td className="py-3 px-4 align-top">
                                <StatusText status={item.currentStatus} />
                              </td>
                              <td className="py-3 px-4 align-top text-right font-mono text-xs text-slate-600 tabular-nums">
                                {item.updatesCount}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Panel: Live Position Updater + Edit Dossier + History */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
                {selectedShipment ? (
                  <div>
                    <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                          {selectedShipment.trackingCode}
                        </p>
                        <h3 className="mt-1 font-display text-base font-bold text-slate-900 truncate">
                          {selectedShipment.clientName}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {selectedShipment.cargoDescription} · {selectedShipment.weightOrVolume}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={invalidDateRange}
                          onClick={() =>
                            exportShipmentDetailPdf(selectedShipment, filteredEventsForExport, {
                              dateFrom: exportDateFrom,
                              dateTo: exportDateTo,
                              dateFieldLabel: hasDatePeriod ? 'positions' : undefined,
                            })
                          }
                          aria-label="Exporter la fiche de suivi en PDF"
                          title="Exporter la fiche PDF (selon la période définie)"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingShipment((v) => !v)}
                          aria-label="Modifier les informations du dossier"
                          className={`p-2 rounded-md transition-colors cursor-pointer ${
                            editingShipment
                              ? 'bg-orange-100 text-orange-800'
                              : 'text-slate-400 hover:text-orange-700'
                          }`}
                        >
                          {editingShipment ? (
                            <X className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>

                        {confirmDeleteId === selectedShipment.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleDeleteShipment(selectedShipment)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-md cursor-pointer"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(selectedShipment.id)}
                            aria-label="Supprimer ce dossier"
                            className="p-2 text-slate-400 hover:text-red-700 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    {editingShipment ? (
                      <form onSubmit={handleSaveShipmentMeta} noValidate className="mt-5 space-y-3.5">
                        <p className="text-xs font-semibold text-sky-700">
                          Modifier les détails du dossier
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="meta-client-name" className="block text-xs font-medium text-slate-700 mb-1">
                              Client / Société
                            </label>
                            <input
                              id="meta-client-name"
                              type="text"
                              maxLength={FIELD_LIMITS.companyMax}
                              value={editClientName}
                              onChange={(e) => setEditClientName(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                          <div>
                            <label htmlFor="meta-client-email" className="block text-xs font-medium text-slate-700 mb-1">
                              E-mail client
                            </label>
                            <input
                              id="meta-client-email"
                              type="email"
                              maxLength={FIELD_LIMITS.emailMax}
                              value={editClientEmail}
                              onChange={(e) => setEditClientEmail(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="meta-mode" className="block text-xs font-medium text-slate-700 mb-1">
                              Mode
                            </label>
                            <select
                              id="meta-mode"
                              value={editMode}
                              onChange={(e) => setEditMode(e.target.value as ServiceCategory)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            >
                              {TRANSPORT_MODES.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="meta-weight" className="block text-xs font-medium text-slate-700 mb-1">
                              Poids / Volume
                            </label>
                            <input
                              id="meta-weight"
                              type="text"
                              maxLength={FIELD_LIMITS.weightOrVolumeMax}
                              value={editWeight}
                              onChange={(e) => setEditWeight(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="meta-origin" className="block text-xs font-medium text-slate-700 mb-1">
                              Origine
                            </label>
                            <input
                              id="meta-origin"
                              type="text"
                              maxLength={FIELD_LIMITS.originDestMax}
                              value={editOrigin}
                              onChange={(e) => setEditOrigin(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                          <div>
                            <label htmlFor="meta-dest" className="block text-xs font-medium text-slate-700 mb-1">
                              Destination
                            </label>
                            <input
                              id="meta-dest"
                              type="text"
                              maxLength={FIELD_LIMITS.originDestMax}
                              value={editDestination}
                              onChange={(e) => setEditDestination(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label htmlFor="meta-cargo" className="block text-xs font-medium text-slate-700 mb-1">
                              Marchandise
                            </label>
                            <input
                              id="meta-cargo"
                              type="text"
                              maxLength={FIELD_LIMITS.cargoDescriptionMax}
                              value={editCargo}
                              onChange={(e) => setEditCargo(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                          <div>
                            <label htmlFor="meta-eta" className="block text-xs font-medium text-slate-700 mb-1">
                              Arrivée estimée
                            </label>
                            <input
                              id="meta-eta"
                              type="text"
                              maxLength={FIELD_LIMITS.etaMax}
                              value={editEta}
                              onChange={(e) => setEditEta(e.target.value)}
                              placeholder="Ex. 12 déc. 2026"
                              className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingShipment(false)}
                            className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            disabled={savingMeta}
                            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg cursor-pointer"
                          >
                            {savingMeta ? 'Enregistrement...' : 'Enregistrer le dossier'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Update Location Form */
                      <form onSubmit={handleUpdatePosition} noValidate className="mt-5 space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <label
                              htmlFor="admin-new-location"
                              className="text-xs font-semibold text-slate-900 flex items-center gap-1.5"
                            >
                              <MapPin className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                              <span>Position manuelle de la marchandise</span>
                            </label>
                            {newLocation && (
                              <button
                                type="button"
                                onClick={() => setNewLocation('')}
                                className="text-[11px] font-medium text-orange-600 hover:text-orange-700 underline cursor-pointer"
                              >
                                Effacer pour saisir
                              </button>
                            )}
                          </div>

                          <input
                            id="admin-new-location"
                            type="text"
                            maxLength={FIELD_LIMITS.locationMax}
                            value={newLocation}
                            onChange={(e) => setNewLocation(e.target.value)}
                            placeholder="Saisissez manuellement la position exacte (ex. Poste frontière Gaya)..."
                            className="w-full min-h-[42px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                          />

                          <select
                            aria-label="Ou choisir une étape prédéfinie"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) setNewLocation(e.target.value);
                            }}
                            className="w-full min-h-[36px] mt-2 px-3 py-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                          >
                            <option value="">Ou insérer une étape prédéfinie (optionnel)...</option>
                            {LOCATION_PRESETS.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="admin-new-status"
                              className="block text-xs font-medium text-slate-700 mb-1"
                            >
                              Statut logistique
                            </label>
                            <select
                              id="admin-new-status"
                              value={newStatus}
                              onChange={(e) => setNewStatus(e.target.value as ShipmentStatus)}
                              className="w-full min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            >
                              {SHIPMENT_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="admin-new-eta"
                              className="block text-xs font-medium text-slate-700 mb-1"
                            >
                              Arrivée estimée (ETA)
                            </label>
                            <input
                              id="admin-new-eta"
                              type="text"
                              maxLength={FIELD_LIMITS.etaMax}
                              value={newEta}
                              onChange={(e) => setNewEta(e.target.value)}
                              placeholder="Ex. 28 nov. 2026"
                              className="w-full min-h-[42px] px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="admin-new-source"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Origine de l’information
                          </label>
                          <select
                            id="admin-new-source"
                            value={newSource}
                            onChange={(e) => setNewSource(e.target.value as PositionSource)}
                            className="w-full min-h-[42px] px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                          >
                            {POSITION_SOURCES.map((src) => (
                              <option key={src} value={src}>
                                {POSITION_SOURCE_LABELS[src].fr}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="admin-new-notes"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Observations / Détails pour le client
                          </label>
                          <textarea
                            id="admin-new-notes"
                            rows={2}
                            maxLength={FIELD_LIMITS.notesMax}
                            value={newNotes}
                            onChange={(e) => setNewNotes(e.target.value)}
                            placeholder="Ex. Conteneur dédouané, départ convoi routier vers Niamey..."
                            className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 resize-y"
                          />
                        </div>

                        {posFeedback && (
                          <div
                            role="status"
                            className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                              posFeedback.type === 'ok'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-red-50 border-red-200 text-red-900'
                            }`}
                          >
                            {posFeedback.type === 'ok' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                            )}
                            <span>{posFeedback.text}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={updatingPos}
                          className="w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                        >
                          {updatingPos ? 'Enregistrement...' : 'Mettre à jour la position'}
                        </button>
                      </form>
                    )}

                    {/* Position History */}
                    <div className="mt-6 pt-5 border-t border-slate-200">
                      <h4 className="text-xs font-semibold text-slate-900 mb-3">
                        Journal des positions enregistrées ({events.length})
                      </h4>
                      {loadingEvents ? (
                        <div className="h-12 bg-slate-100 rounded animate-pulse" />
                      ) : (
                        <ol className="divide-y divide-slate-200 max-h-64 overflow-y-auto pr-1">
                          {events.map((ev, idx) => (
                            <li key={ev.id || idx} className="py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-900">{ev.location}</p>
                                <span className="font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                                  {formatDate(ev.createdAt)}
                                </span>
                              </div>
                              <div className="mt-1">
                                <StatusText status={ev.status} />
                              </div>
                              {ev.notes && <p className="mt-1 text-xs text-slate-600">{ev.notes}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>

                    {/* Shipment Documents Management */}
                    <ShipmentDocumentsPanel shipment={selectedShipment} mode="admin" />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Sélectionnez un dossier pour mettre à jour la position de la marchandise.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PENDING CLIENT REQUESTS (CREATE & VALIDATE) */}
      {activeTab === 'pendingRequests' && (
        <AdminPendingRequestsPanel
          quotes={quotes}
          loadingQuotes={loadingQuotes}
          registeredUsers={registeredUsers}
          adminClients={adminClients}
          shipments={shipments}
          onConvertQuoteToShipment={(quote) => {
            setSelectedClientUid(quote.clientUid || '');
            setClientEmail(quote.clientEmail);
            setClientName(quote.company ? `${quote.company} — ${quote.clientName}` : quote.clientName);
            setTransportMode(quote.transportMode);
            if (quote.origin) setOrigin(quote.origin);
            if (quote.destination) setDestination(quote.destination);
            setCargoDescription(quote.message.slice(0, FIELD_LIMITS.cargoDescriptionMax));
            setSelectedClientKey('');
            setActiveTab('create');
          }}
          onCreateShipmentForClient={(client) => {
            setSelectedClientUid(client.uid);
            setClientEmail(client.email);
            setClientName(client.name);
            if (client.city) setDestination(client.city);
            setSelectedClientKey('');
            setActiveTab('create');
          }}
        />
      )}

      {/* TAB 2: CREATE CLIENT DOSSIER & TRACKING */}
      {activeTab === 'create' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-3xl">
          <h3 className="font-display text-lg font-bold text-slate-900">
            Créer un dossier client & attribuer un numéro de suivi
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Sélectionnez un client enregistré ou saisissez ses coordonnées, attribuez un numéro de
            suivi tracking et définissez la position de départ.
          </p>

          <form onSubmit={handleCreateShipment} noValidate className="mt-6 space-y-5">
            {clientChoices.length > 0 && (
              <div>
                <label
                  htmlFor="create-client-select"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Sélectionner un client existant (optionnel)
                </label>
                <select
                  id="create-client-select"
                  value={selectedClientKey}
                  onChange={(e) => handleSelectClientChoice(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  <option value="">Saisir manuellement un client...</option>
                  {clientChoices.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.email}) — {c.sourceLabel}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="create-tracking-code"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Numéro de suivi tracking
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="create-tracking-code"
                    type="text"
                    maxLength={40}
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                    className="w-full min-h-[42px] px-3 py-2 font-mono text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                  <button
                    type="button"
                    onClick={() => setTrackingCode(generateTrackingCode())}
                    aria-label="Générer un nouveau numéro de suivi"
                    title="Générer un nouveau numéro"
                    className="min-h-[42px] px-3 text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="create-client-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  E-mail du client
                </label>
                <input
                  id="create-client-email"
                  type="email"
                  maxLength={FIELD_LIMITS.emailMax}
                  value={clientEmail}
                  onChange={(e) => {
                    setClientEmail(e.target.value);
                    setSelectedClientKey('');
                    setSelectedClientUid('');
                  }}
                  placeholder="client@entreprise.com"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label
                  htmlFor="create-client-name"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Nom / Société du client
                </label>
                <input
                  id="create-client-name"
                  type="text"
                  maxLength={FIELD_LIMITS.companyMax}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Sahel Distribution"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="create-mode"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Mode de transport
                </label>
                <select
                  id="create-mode"
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as ServiceCategory)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  {TRANSPORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="create-origin"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Origine (Chine, Dubaï, Port...)
                </label>
                <select
                  aria-label="Choisir une origine rapide"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setOrigin(e.target.value);
                  }}
                  className="w-full min-h-[36px] mb-1.5 px-2.5 py-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  <option value="">Origine rapide (Chine / Dubaï / Afrique)...</option>
                  {ORIGIN_PRESETS.map((orig) => (
                    <option key={orig} value={orig}>
                      {orig}
                    </option>
                  ))}
                </select>
                <input
                  id="create-origin"
                  type="text"
                  maxLength={FIELD_LIMITS.originDestMax}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Port de Shanghai / Dubaï DXB"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label
                  htmlFor="create-destination"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Destination
                </label>
                <input
                  id="create-destination"
                  type="text"
                  maxLength={FIELD_LIMITS.originDestMax}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Niamey (Niger)"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="create-cargo"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Description de la marchandise
                </label>
                <input
                  id="create-cargo"
                  type="text"
                  maxLength={FIELD_LIMITS.cargoDescriptionMax}
                  value={cargoDescription}
                  onChange={(e) => setCargoDescription(e.target.value)}
                  placeholder="1x Conteneur 40'HC — Matériel électrique et panneaux solaires"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label
                  htmlFor="create-weight"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Poids / Volume
                </label>
                <input
                  id="create-weight"
                  type="text"
                  maxLength={FIELD_LIMITS.weightOrVolumeMax}
                  value={weightOrVolume}
                  onChange={(e) => setWeightOrVolume(e.target.value)}
                  placeholder="18 400 kg · 64 m³"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="create-init-loc"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Position initiale
                </label>
                <input
                  id="create-init-loc"
                  type="text"
                  maxLength={FIELD_LIMITS.locationMax}
                  value={initialLocation}
                  onChange={(e) => setInitialLocation(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label
                  htmlFor="create-init-status"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Statut initial
                </label>
                <select
                  id="create-init-status"
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value as ShipmentStatus)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  {SHIPMENT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="create-eta"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Arrivée estimée (optionnel)
                </label>
                <input
                  id="create-eta"
                  type="text"
                  maxLength={FIELD_LIMITS.etaMax}
                  value={estimatedArrival}
                  onChange={(e) => setEstimatedArrival(e.target.value)}
                  placeholder="12 déc. 2026"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            {createError && (
              <p role="alert" className="flex items-center gap-2 text-xs font-medium text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{createError}</span>
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('tracking')}
                className="px-4 py-2.5 text-sm font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg cursor-pointer min-h-[44px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[44px]"
              >
                {creating ? 'Création en cours...' : 'Créer le dossier & numéro de suivi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: CLIENTS DIRECTORY (VIEW, CREATE, EDIT, DELETE) */}
      {activeTab === 'clients' && (
        <AdminClientsPanel
          adminClients={adminClients}
          registeredUsers={registeredUsers}
          shipments={shipments}
          onCreateShipmentForClient={(client) => {
            setSelectedClientUid(client.uid);
            setClientEmail(client.email);
            setClientName(client.name);
            if (client.city) setDestination(client.city);
            setSelectedClientKey('');
            setActiveTab('create');
          }}
          onManageDocumentsForClient={(email) => {
            setDocPreselectClientEmail(email);
            setActiveTab('documents');
          }}
        />
      )}

      {/* TAB 4: CENTRALIZED CLIENT DOCUMENTS (BATCH UPLOAD & DIRECTORY) */}
      {activeTab === 'documents' && (
        <AdminDocumentsPanel
          adminClients={adminClients}
          registeredUsers={registeredUsers}
          shipments={shipments}
          initialClientEmail={docPreselectClientEmail}
          onClearInitialClient={() => setDocPreselectClientEmail('')}
        />
      )}

      {/* TAB 4: QUOTE REQUESTS MANAGEMENT */}
      {activeTab === 'quotes' && (
        <AdminQuotesPanel
          quotes={quotes}
          loading={loadingQuotes}
          adminClients={adminClients}
          registeredUsers={registeredUsers}
          onConvertToShipment={(quote) => {
            setSelectedClientUid(quote.clientUid || '');
            setClientEmail(quote.clientEmail);
            setClientName(quote.company ? `${quote.company} — ${quote.clientName}` : quote.clientName);
            setTransportMode(quote.transportMode);
            if (quote.origin) setOrigin(quote.origin);
            if (quote.destination) setDestination(quote.destination);
            setCargoDescription(quote.message.slice(0, FIELD_LIMITS.cargoDescriptionMax));
            setSelectedClientKey('');
            setActiveTab('create');
          }}
        />
      )}

      {/* TAB 5: DATA MANAGEMENT USERS */}
      {activeTab === 'users' && canManageUsers && <AdminStaffPanel />}
    </div>
  );
}
