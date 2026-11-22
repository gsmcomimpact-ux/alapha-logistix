import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
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
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  LogOut,
  MapPin,
  Package,
  Plus,
  Search,
  UserCog,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { dataUrlToBlob, formatFileSize } from '../lib/documentFiles';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ClientDocumentRecord,
  ClientNotificationRecord,
  FIELD_LIMITS,
  QuoteRequestRecord,
  QuoteStatus,
  ServiceCategory,
  SHIPMENT_DOC_TYPES,
  SHIPMENT_STATUSES,
  ShipmentDocType,
  ShipmentDocumentRecord,
  ShipmentRecord,
  ShipmentStatus,
  TrackingEventRecord,
  TRANSPORT_MODES,
} from '../types/logistics';
import { ClientAccountSetup } from './ClientAccountSetup';
import { ShipmentDocumentsPanel } from './ShipmentDocumentsPanel';
import { StatusText } from './StatusText';

interface ClientTrackingWorkspaceProps {
  onGoToContact: () => void;
}

type ClientTab =
  | 'shipments'
  | 'pendingRequests'
  | 'documents'
  | 'history'
  | 'quotes'
  | 'notifications';
type OperationCategory = 'ALL' | 'tracking' | 'document' | 'quote';

interface ClientDocumentWithShipment extends ShipmentDocumentRecord {
  trackingCode: string;
}

interface ClientEventWithShipment extends TrackingEventRecord {
  trackingCode: string;
  routeLabel: string;
}

interface UnifiedOperation {
  id: string;
  category: 'tracking' | 'document' | 'quote';
  referenceCode: string;
  title: string;
  subtitle: string;
  details: string;
  timestamp: Timestamp | null | undefined;
  shipmentId?: string;
}

function formatDate(ts: Timestamp | null | undefined, intlLocale: string, justNowLabel: string): string {
  if (!ts) return justNowLabel;
  try {
    return ts.toDate().toLocaleString(intlLocale, {
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

export function ClientTrackingWorkspace({ onGoToContact }: ClientTrackingWorkspaceProps) {
  const { user, userProfile, authReady, signOutUser } = useAuth();
  const { locale, localeConfig, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<ClientTab>('shipments');

  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [eventsByShipment, setEventsByShipment] = useState<Record<string, TrackingEventRecord[]>>({});
  const [docsByShipment, setDocsByShipment] = useState<Record<string, ShipmentDocumentRecord[]>>({});
  const [clientGeneralDocs, setClientGeneralDocs] = useState<ClientDocumentRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequestRecord[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [notifications, setNotifications] = useState<ClientNotificationRecord[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  // Filters & UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShipmentStatus>('ALL');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | ShipmentDocType>('ALL');
  const [historyCategory, setHistoryCategory] = useState<OperationCategory>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [notifFilter, setNotifFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [editingProfile, setEditingProfile] = useState(false);

  // In-app document preview modal state (Documents tab)
  const [previewDoc, setPreviewDoc] = useState<ClientDocumentWithShipment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // New Quote / Pending Request form inside client space
  const [showNewQuoteForm, setShowNewQuoteForm] = useState(false);
  const [showPendingCreateForm, setShowPendingCreateForm] = useState(false);
  const [quoteMode, setQuoteMode] = useState<ServiceCategory>('Fret maritime');
  const [quoteOrigin, setQuoteOrigin] = useState(
    locale === 'en' ? 'Port of Shanghai (China)' : 'Port de Shanghai (Chine)'
  );
  const [quoteDestination, setQuoteDestination] = useState('');
  const [quoteMessage, setQuoteMessage] = useState('');
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [validatingQuoteId, setValidatingQuoteId] = useState<string | null>(null);
  const [quoteFeedback, setQuoteFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [pendingReqFeedback, setPendingReqFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const emailLower = (user?.email || '').toLowerCase();

  useEffect(() => {
    setQuoteOrigin((prev) => {
      if (locale === 'en' && prev === 'Port de Shanghai (Chine)') {
        return 'Port of Shanghai (China)';
      }
      if (locale === 'fr' && prev === 'Port of Shanghai (China)') {
        return 'Port de Shanghai (Chine)';
      }
      return prev;
    });
  }, [locale]);

  useEffect(() => {
    if (userProfile?.city && !quoteDestination) {
      setQuoteDestination(userProfile.city);
    }
  }, [userProfile?.city]);

  useEffect(() => {
    if (!previewDoc || !previewDoc.fileData) {
      setPreviewBlobUrl(null);
      return;
    }
    const blob = dataUrlToBlob(previewDoc.fileData, previewDoc.mimeType);
    if (!blob) {
      setPreviewBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [previewDoc]);

  useEffect(() => {
    if (!previewDoc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewDoc(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc]);

  // 1. Subscribe to client's shipments
  useEffect(() => {
    if (!authReady || !user || !emailLower) return;

    setLoadingShipments(true);
    const shipmentsQuery = user.emailVerified
      ? query(collection(db, 'shipments'), where('clientEmail', '==', emailLower))
      : query(collection(db, 'shipments'), where('clientUid', '==', user.uid));

    const unsubscribe = onSnapshot(
      shipmentsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => docSnap.data() as ShipmentRecord);
        list.sort((a, b) => {
          const tA = a.updatedAt?.toMillis?.() ?? 0;
          const tB = b.updatedAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setShipments(list);
        setLoadingShipments(false);
        setSelectedId((prev) => {
          if (prev && list.some((item) => item.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      },
      (error) => {
        setLoadingShipments(false);
        handleFirestoreError(error, OperationType.LIST, 'shipments');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, emailLower]);

  // 2. Subscribe to events & shared documents across ALL client shipments
  const shipmentIdsKey = useMemo(() => shipments.map((s) => s.id).join(','), [shipments]);

  useEffect(() => {
    if (!authReady || !user || !emailLower || shipments.length === 0) {
      setEventsByShipment({});
      setDocsByShipment({});
      return;
    }

    const unsubscribers: Array<() => void> = [];

    shipments.forEach((sh) => {
      const evPath = `shipments/${sh.id}/events`;
      const evQuery = user.emailVerified
        ? query(collection(db, 'shipments', sh.id, 'events'), where('clientEmail', '==', emailLower))
        : query(collection(db, 'shipments', sh.id, 'events'), where('clientUid', '==', user.uid));
      unsubscribers.push(
        onSnapshot(
          evQuery,
          (snap) => {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as TrackingEventRecord),
            }));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setEventsByShipment((prev) => ({ ...prev, [sh.id]: list }));
          },
          (error) => {
            handleFirestoreError(error, OperationType.LIST, evPath);
          }
        )
      );

      const docsPath = `shipments/${sh.id}/documents`;
      const docsQuery = user.emailVerified
        ? query(
            collection(db, 'shipments', sh.id, 'documents'),
            where('clientEmail', '==', emailLower),
            where('visibility', '==', 'client')
          )
        : query(
            collection(db, 'shipments', sh.id, 'documents'),
            where('clientUid', '==', user.uid),
            where('visibility', '==', 'client')
          );
      unsubscribers.push(
        onSnapshot(
          docsQuery,
          (snap) => {
            const list = snap.docs.map((d) => ({
              ...(d.data() as ShipmentDocumentRecord),
              id: d.id,
            }));
            list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
            setDocsByShipment((prev) => ({ ...prev, [sh.id]: list }));
          },
          (error) => {
            handleFirestoreError(error, OperationType.LIST, docsPath);
          }
        )
      );
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [authReady, user, emailLower, shipmentIdsKey]);

  // 2b. Subscribe to client-level shared documents (/clientDocuments)
  useEffect(() => {
    if (!authReady || !user || !emailLower) {
      setClientGeneralDocs([]);
      return;
    }

    const q = user.emailVerified
      ? query(
          collection(db, 'clientDocuments'),
          where('clientEmail', '==', emailLower),
          where('visibility', '==', 'client')
        )
      : query(
          collection(db, 'clientDocuments'),
          where('clientUid', '==', user.uid),
          where('visibility', '==', 'client')
        );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          ...(d.data() as ClientDocumentRecord),
          id: d.id,
        }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setClientGeneralDocs(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clientDocuments');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, emailLower]);

  // 3. Subscribe to client's quote requests
  useEffect(() => {
    if (!authReady || !user || !emailLower) {
      setQuotes([]);
      setLoadingQuotes(false);
      return;
    }

    setLoadingQuotes(true);
    const quotesQuery = user.emailVerified
      ? query(collection(db, 'quoteRequests'), where('clientEmail', '==', emailLower))
      : query(collection(db, 'quoteRequests'), where('clientUid', '==', user.uid));

    const unsubscribe = onSnapshot(
      quotesQuery,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          ...(d.data() as QuoteRequestRecord),
          id: d.id,
        }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setQuotes(list);
        setLoadingQuotes(false);
      },
      (error) => {
        setLoadingQuotes(false);
        handleFirestoreError(error, OperationType.LIST, 'quoteRequests');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, emailLower]);

  // 4. Subscribe to client's shipment notifications
  useEffect(() => {
    if (!authReady || !user || !emailLower) {
      setNotifications([]);
      setLoadingNotifications(false);
      return;
    }

    setLoadingNotifications(true);
    const notifQuery = user.emailVerified
      ? query(collection(db, 'notifications'), where('clientEmail', '==', emailLower))
      : query(collection(db, 'notifications'), where('clientUid', '==', user.uid));

    const unsubscribe = onSnapshot(
      notifQuery,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          ...(d.data() as ClientNotificationRecord),
          id: d.id,
        }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setNotifications(list);
        setLoadingNotifications(false);
      },
      (error) => {
        setLoadingNotifications(false);
        handleFirestoreError(error, OperationType.LIST, 'notifications');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, emailLower]);

  const filteredShipments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shipments.filter((item) => {
      const matchesStatus = statusFilter === 'ALL' || item.currentStatus === statusFilter;
      const matchesQuery =
        !q ||
        item.trackingCode.toLowerCase().includes(q) ||
        item.currentLocation.toLowerCase().includes(q) ||
        item.cargoDescription.toLowerCase().includes(q) ||
        item.origin.toLowerCase().includes(q) ||
        item.destination.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [shipments, searchQuery, statusFilter]);

  const selectedShipment = useMemo(
    () => shipments.find((s) => s.id === selectedId) ?? null,
    [shipments, selectedId]
  );

  const selectedEvents = selectedId ? eventsByShipment[selectedId] ?? [] : [];

  const allDocuments = useMemo<ClientDocumentWithShipment[]>(() => {
    const shipmentMap = new Map(shipments.map((s) => [s.id, s]));
    const collected: ClientDocumentWithShipment[] = [];
    Object.entries(docsByShipment).forEach(([shipmentId, docsList]) => {
      const sh = shipmentMap.get(shipmentId);
      docsList.forEach((docItem) => {
        collected.push({
          ...docItem,
          trackingCode: sh?.trackingCode ?? shipmentId,
        });
      });
    });
    clientGeneralDocs.forEach((cDoc) => {
      collected.push({
        id: cDoc.id,
        shipmentId: cDoc.shipmentId || '',
        clientUid: cDoc.clientUid,
        clientEmail: cDoc.clientEmail,
        docType: cDoc.docType,
        title: cDoc.title,
        referenceNumber: cDoc.referenceNumber,
        fileName: cDoc.fileName,
        mimeType: cDoc.mimeType,
        fileSize: cDoc.fileSize,
        fileData: cDoc.fileData,
        externalUrl: cDoc.externalUrl,
        visibility: cDoc.visibility,
        notes: cDoc.notes,
        uploadedBy: cDoc.uploadedBy,
        uploadedByEmail: cDoc.uploadedByEmail,
        uploadedByRole: cDoc.uploadedByRole,
        createdAt: cDoc.createdAt,
        updatedAt: cDoc.updatedAt,
        trackingCode: cDoc.trackingCode || '',
      });
    });
    collected.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    return collected;
  }, [shipments, docsByShipment, clientGeneralDocs]);

  const filteredDocuments = useMemo(() => {
    const q = docSearchQuery.trim().toLowerCase();
    return allDocuments.filter((docItem) => {
      const matchesType = docTypeFilter === 'ALL' || docItem.docType === docTypeFilter;
      const matchesQuery =
        !q ||
        docItem.title.toLowerCase().includes(q) ||
        docItem.trackingCode.toLowerCase().includes(q) ||
        docItem.referenceNumber.toLowerCase().includes(q) ||
        docItem.fileName.toLowerCase().includes(q) ||
        docItem.docType.toLowerCase().includes(q) ||
        (t.docTypeLabels[docItem.docType] || '').toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [allDocuments, docTypeFilter, docSearchQuery, t.docTypeLabels]);

  const unifiedOperations = useMemo<UnifiedOperation[]>(() => {
    const shipmentMap = new Map(shipments.map((s) => [s.id, s]));
    const ops: UnifiedOperation[] = [];

    Object.entries(eventsByShipment).forEach(([shipmentId, evList]) => {
      const sh = shipmentMap.get(shipmentId);
      const trackingCode = sh?.trackingCode ?? shipmentId;
      const routeLabel = sh ? `${sh.origin} → ${sh.destination}` : '';
      evList.forEach((ev: TrackingEventRecord, idx) => {
        const enrichedEv: ClientEventWithShipment = { ...ev, trackingCode, routeLabel };
        const statusDisplay = t.statusLabels[enrichedEv.status] || enrichedEv.status;
        ops.push({
          id: `ev-${shipmentId}-${ev.id ?? idx}`,
          category: 'tracking',
          referenceCode: enrichedEv.trackingCode,
          title: `${statusDisplay} · ${enrichedEv.location}`,
          subtitle: enrichedEv.routeLabel,
          details: enrichedEv.notes || t.clientSpace.history.defaultNote,
          timestamp: enrichedEv.createdAt,
          shipmentId,
        });
      });
    });

    allDocuments.forEach((docItem) => {
      const docTypeLabel = t.docTypeLabels[docItem.docType] || docItem.docType;
      ops.push({
        id: `doc-${docItem.shipmentId || 'client'}-${docItem.id}`,
        category: 'document',
        referenceCode: docItem.trackingCode || t.clientSpace.documents.clientGeneralFile,
        title: `${docTypeLabel} — ${docItem.title}`,
        subtitle:
          docItem.uploadedByRole === 'client'
            ? t.clientSpace.history.clientUploaded
            : t.clientSpace.history.alphaUploaded,
        details: `${docItem.referenceNumber ? `${docItem.referenceNumber} · ` : ''}${docItem.fileName} (${formatFileSize(docItem.fileSize, locale, t.common.externalLink)})`,
        timestamp: docItem.createdAt,
        shipmentId: docItem.shipmentId || undefined,
      });
    });

    quotes.forEach((qItem) => {
      const modeLabel = t.serviceLabels[qItem.transportMode] || qItem.transportMode;
      const statusLabel = t.quoteStatusLabels[qItem.status] || qItem.status;
      ops.push({
        id: `quote-${qItem.id}`,
        category: 'quote',
        referenceCode: qItem.quoteCode,
        title: `${modeLabel} (${statusLabel})`,
        subtitle: `${qItem.origin || '—'} → ${qItem.destination || '—'}`,
        details: qItem.estimatedAmount
          ? `${t.clientSpace.history.quoteTariffPrefix} ${qItem.estimatedAmount}${qItem.adminResponse ? ` — ${qItem.adminResponse}` : ''}`
          : qItem.message,
        timestamp: qItem.updatedAt ?? qItem.createdAt,
      });
    });

    ops.sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0));
    return ops;
  }, [shipments, eventsByShipment, allDocuments, quotes, locale, t]);

  const filteredOperations = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return unifiedOperations.filter((op) => {
      const matchesCat = historyCategory === 'ALL' || op.category === historyCategory;
      const matchesQuery =
        !q ||
        op.referenceCode.toLowerCase().includes(q) ||
        op.title.toLowerCase().includes(q) ||
        op.subtitle.toLowerCase().includes(q) ||
        op.details.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [unifiedOperations, historyCategory, historySearch]);

  const pendingClientRequests = useMemo(
    () =>
      quotes.filter(
        (q) => q.status === 'En attente' || q.status === "À l'étude" || q.status === 'Devis envoyé'
      ),
    [quotes]
  );

  const validatedClientRequests = useMemo(
    () => quotes.filter((q) => q.status === 'Acceptée'),
    [quotes]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read),
    [notifications]
  );

  const displayedNotifications = useMemo(() => {
    if (notifFilter === 'UNREAD') return unreadNotifications;
    return notifications;
  }, [notifications, unreadNotifications, notifFilter]);

  const getNotificationCategoryLabel = (category: ClientNotificationRecord['category']): string => {
    switch (category) {
      case 'position':
        return t.clientSpace.notifications.catPosition;
      case 'document':
        return t.clientSpace.notifications.catDocument;
      case 'quote':
        return t.clientSpace.notifications.catQuote;
      default:
        return t.clientSpace.notifications.catStatus;
    }
  };

  const handleDirectDownload = (record: ShipmentDocumentRecord) => {
    if (!record.fileData) return;
    const blob = dataUrlToBlob(record.fileData, record.mimeType);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = record.fileName || `${record.docType.replace(/\s+/g, '_')}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const submitClientRequest = async (sourceTab: 'quotes' | 'pendingRequests') => {
    if (!user || !user.email) return;
    if (sourceTab === 'pendingRequests') {
      setPendingReqFeedback(null);
    } else {
      setQuoteFeedback(null);
    }

    const cleanMessage = quoteMessage.trim().slice(0, FIELD_LIMITS.quoteMessageMax);
    const cleanOrigin = quoteOrigin.trim().slice(0, FIELD_LIMITS.originDestMax);
    const cleanDest = quoteDestination.trim().slice(0, FIELD_LIMITS.originDestMax);

    if (cleanMessage.length < 5) {
      const errMsg = { type: 'err' as const, text: t.clientSpace.quotes.errMinMessage };
      if (sourceTab === 'pendingRequests') {
        setPendingReqFeedback(errMsg);
      } else {
        setQuoteFeedback(errMsg);
      }
      return;
    }

    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const quoteCode = `COT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    setSubmittingQuote(true);
    try {
      await setDoc(doc(db, 'quoteRequests', quoteId), {
        id: quoteId,
        quoteCode,
        clientUid: user.uid,
        clientEmail: user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax),
        clientName: (userProfile?.fullName || user.displayName || user.email).slice(
          0,
          FIELD_LIMITS.companyMax
        ),
        company: (userProfile?.company || '').slice(0, FIELD_LIMITS.companyMax),
        phone: (userProfile?.phone || '').slice(0, FIELD_LIMITS.phoneMax),
        transportMode: quoteMode,
        origin: cleanOrigin,
        destination: cleanDest,
        message: cleanMessage,
        status: 'En attente',
        estimatedAmount: '',
        adminResponse: '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setQuoteMessage('');
      if (sourceTab === 'pendingRequests') {
        setShowPendingCreateForm(false);
        setPendingReqFeedback({
          type: 'ok',
          text: `${quoteCode} — ${t.clientSpace.pendingRequests.createdSuccess}`,
        });
      } else {
        setShowNewQuoteForm(false);
        setQuoteFeedback({
          type: 'ok',
          text: `${quoteCode} — ${t.clientSpace.quotes.createdSuccess}`,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `quoteRequests/${quoteId}`);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleSubmitClientQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitClientRequest('quotes');
  };

  const handleSubmitPendingRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitClientRequest('pendingRequests');
  };

  const handleAcceptQuote = async (quoteId: string, sourceTab: 'quotes' | 'pendingRequests' = 'quotes') => {
    setValidatingQuoteId(quoteId);
    if (sourceTab === 'pendingRequests') {
      setPendingReqFeedback(null);
    } else {
      setQuoteFeedback(null);
    }
    try {
      await updateDoc(doc(db, 'quoteRequests', quoteId), {
        status: 'Acceptée',
        updatedAt: serverTimestamp(),
      });
      if (sourceTab === 'pendingRequests') {
        setPendingReqFeedback({
          type: 'ok',
          text: t.clientSpace.pendingRequests.validatedSuccess,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quoteRequests/${quoteId}`);
    } finally {
      setValidatingQuoteId(null);
    }
  };

  const handleMarkNotificationRead = async (notif: ClientNotificationRecord) => {
    if (!notif.read) {
      try {
        await updateDoc(doc(db, 'notifications', notif.id), {
          read: true,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `notifications/${notif.id}`);
      }
    }

    if (notif.category === 'quote') {
      setActiveTab('quotes');
    } else if (notif.category === 'document') {
      if (notif.shipmentId && shipments.some((s) => s.id === notif.shipmentId)) {
        setSelectedId(notif.shipmentId);
        setActiveTab('shipments');
      } else {
        setActiveTab('documents');
      }
    } else if (notif.shipmentId && shipments.some((s) => s.id === notif.shipmentId)) {
      setSelectedId(notif.shipmentId);
      setActiveTab('shipments');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (unreadNotifications.length === 0) return;
    try {
      for (let i = 0; i < unreadNotifications.length; i += 450) {
        const chunk = unreadNotifications.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((n) => {
          batch.update(doc(db, 'notifications', n.id), { read: true });
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'notifications');
    }
  };

  if (editingProfile) {
    return (
      <ClientAccountSetup
        isEditing
        onSaved={() => setEditingProfile(false)}
        onCancel={() => setEditingProfile(false)}
      />
    );
  }

  const cs = t.clientSpace;

  return (
    <div className="space-y-6">
      {/* Client Header Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-700">{cs.headerEyebrow}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
            {userProfile ? `${userProfile.company} — ${userProfile.fullName}` : user?.email}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {userProfile
              ? `${userProfile.city} · ${userProfile.phone} · ${userProfile.email}`
              : user?.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditingProfile(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
          >
            <UserCog className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <span>{cs.editProfile}</span>
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 bg-white hover:bg-orange-50 border border-orange-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
          >
            <LogOut className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <span>{t.common.signOut}</span>
          </button>
        </div>
      </div>

      {/* Unread Shipment Notifications Strip */}
      {unreadNotifications.length > 0 && activeTab !== 'notifications' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Bell className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">
                {unreadNotifications.length} {cs.unreadAlertTitle}
              </p>
              <p className="text-xs text-slate-600 truncate">
                {unreadNotifications[0].title} — {unreadNotifications[0].message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
          >
            {cs.viewNotifications} ({unreadNotifications.length})
          </button>
        </div>
      )}

      {/* Client Space Navigation Tabs */}
      <div
        role="tablist"
        aria-label={cs.headerEyebrow}
        className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shipments'}
          onClick={() => setActiveTab('shipments')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
            activeTab === 'shipments'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {cs.tabs.shipments} ({shipments.length})
          </span>
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
          <Clock className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          <span>
            {cs.tabs.pendingRequests} ({pendingClientRequests.length})
          </span>
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
          <span>
            {cs.tabs.documents} ({allDocuments.length})
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
            activeTab === 'history'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {cs.tabs.history} ({unifiedOperations.length})
          </span>
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
          <span>
            {cs.tabs.quotes} ({quotes.length})
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notifications'}
          onClick={() => setActiveTab('notifications')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
            activeTab === 'notifications'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {cs.tabs.notifications} (
            {unreadNotifications.length > 0 ? (
              <span className="text-orange-600 font-bold">
                {unreadNotifications.length} {cs.tabs.unreadSuffix}
              </span>
            ) : (
              notifications.length
            )}
            )
          </span>
        </button>
      </div>

      {/* TAB 1: CONSULTATION DES EXPEDITIONS */}
      {activeTab === 'shipments' && (
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
                placeholder={cs.shipments.searchPlaceholder}
                aria-label={cs.shipments.searchPlaceholder}
                className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[36px] ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cs.shipments.allStatuses} ({shipments.length})
              </button>
              {SHIPMENT_STATUSES.map((st) => {
                const count = shipments.filter((s) => s.currentStatus === st).length;
                if (count === 0) return null;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[36px] ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.statusLabels[st]} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {loadingShipments ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3" aria-busy="true">
              <div className="h-10 bg-slate-100 rounded-md animate-pulse" />
              <div className="h-10 bg-slate-100 rounded-md animate-pulse" />
              <div className="h-10 bg-slate-100 rounded-md animate-pulse" />
            </div>
          ) : shipments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Package className="w-10 h-10 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {cs.shipments.emptyTitle}
              </h3>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                {cs.shipments.emptyDescPrefix}{' '}
                <span className="font-medium text-slate-900">{emailLower}</span>,{' '}
                {cs.shipments.emptyDescSuffix}
              </p>
              <button
                type="button"
                onClick={onGoToContact}
                className="mt-5 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer min-h-[44px]"
              >
                {cs.shipments.emptyCta}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">{cs.shipments.colCode}</th>
                        <th className="py-3 px-4">{cs.shipments.colLocation}</th>
                        <th className="py-3 px-4">{cs.shipments.colStatus}</th>
                        <th className="py-3 px-4 text-right">{cs.shipments.colUpdated}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredShipments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 px-4 text-center text-sm text-slate-500">
                            {cs.shipments.noMatch}
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
                                active ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-3 px-4 align-top">
                                <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {item.trackingCode}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[180px]">
                                  {item.origin} → {item.destination}
                                </p>
                              </td>
                              <td className="py-3 px-4 align-top">
                                <p className="text-xs font-medium text-slate-900">
                                  {item.currentLocation}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[200px]">
                                  {item.cargoDescription}
                                </p>
                              </td>
                              <td className="py-3 px-4 align-top">
                                <StatusText status={item.currentStatus} />
                              </td>
                              <td className="py-3 px-4 align-top text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                                {formatDate(item.updatedAt, localeConfig.intlLocale, t.common.justNow)}
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
                {selectedShipment ? (
                  <div>
                    <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                      <div>
                        <p className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                          {selectedShipment.trackingCode}
                        </p>
                        <h3 className="mt-1 font-display text-lg font-bold text-slate-900">
                          {selectedShipment.cargoDescription}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {t.serviceLabels[selectedShipment.transportMode] ||
                            selectedShipment.transportMode}{' '}
                          · {selectedShipment.weightOrVolume}
                        </p>
                      </div>
                      <StatusText status={selectedShipment.currentStatus} />
                    </div>

                    <div className="mt-4 p-4 rounded-lg bg-slate-900 text-white">
                      <p className="text-xs text-slate-400">{cs.shipments.currentPositionLabel}</p>
                      <div className="mt-1.5 flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <p className="font-display text-base font-semibold text-white">
                          {selectedShipment.currentLocation}
                        </p>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                        <span>
                          {selectedShipment.origin} → {selectedShipment.destination}
                        </span>
                        {selectedShipment.estimatedArrival && (
                          <span className="font-mono tabular-nums text-sky-300">
                            {cs.shipments.etaLabel} {selectedShipment.estimatedArrival}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6">
                      <h4 className="text-xs font-semibold text-slate-900 mb-3">
                        {cs.shipments.historyTitle} ({selectedEvents.length})
                      </h4>

                      {selectedEvents.length === 0 ? (
                        <p className="text-xs text-slate-500">{cs.shipments.noEvents}</p>
                      ) : (
                        <ol className="divide-y divide-slate-200 border-t border-slate-200">
                          {selectedEvents.map((ev, index) => (
                            <li key={ev.id || index} className="py-3.5">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">{ev.location}</p>
                                <span className="font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                                  {formatDate(ev.createdAt, localeConfig.intlLocale, t.common.justNow)}
                                </span>
                              </div>
                              <div className="mt-1">
                                <StatusText status={ev.status} />
                              </div>
                              {ev.notes && (
                                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                                  {ev.notes}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>

                    <ShipmentDocumentsPanel shipment={selectedShipment} mode="client" />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{cs.shipments.selectPrompt}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1B: DEMANDES DE CLIENT EN ATTENTE (CREER & VALIDER) */}
      {activeTab === 'pendingRequests' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                {cs.pendingRequests.title}
              </h3>
              <p className="text-xs text-slate-500">{cs.pendingRequests.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPendingCreateForm((v) => !v);
                setPendingReqFeedback(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
            >
              {showPendingCreateForm ? (
                <>
                  <X className="w-4 h-4" aria-hidden="true" />
                  <span>{cs.pendingRequests.closeFormBtn}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>{cs.pendingRequests.newBtn}</span>
                </>
              )}
            </button>
          </div>

          {pendingReqFeedback && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                pendingReqFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {pendingReqFeedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span>{pendingReqFeedback.text}</span>
            </div>
          )}

          {showPendingCreateForm && (
            <form
              onSubmit={handleSubmitPendingRequest}
              noValidate
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h4 className="font-display text-sm font-bold text-slate-900">
                {cs.pendingRequests.formTitle}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="pr-mode" className="block text-xs font-medium text-slate-700 mb-1">
                    {cs.quotes.modeLabel}
                  </label>
                  <select
                    id="pr-mode"
                    value={quoteMode}
                    onChange={(e) => setQuoteMode(e.target.value as ServiceCategory)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  >
                    {TRANSPORT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {t.serviceLabels[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pr-origin" className="block text-xs font-medium text-slate-700 mb-1">
                    {cs.quotes.originLabel}
                  </label>
                  <input
                    id="pr-origin"
                    type="text"
                    maxLength={FIELD_LIMITS.originDestMax}
                    value={quoteOrigin}
                    onChange={(e) => setQuoteOrigin(e.target.value)}
                    placeholder={locale === 'en' ? 'Shanghai / Dubai' : 'Shanghai / Dubaï'}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div>
                  <label htmlFor="pr-dest" className="block text-xs font-medium text-slate-700 mb-1">
                    {cs.quotes.destLabel}
                  </label>
                  <input
                    id="pr-dest"
                    type="text"
                    maxLength={FIELD_LIMITS.originDestMax}
                    value={quoteDestination}
                    onChange={(e) => setQuoteDestination(e.target.value)}
                    placeholder="Niamey (Niger)"
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pr-msg" className="block text-xs font-medium text-slate-700 mb-1">
                  {cs.quotes.messageLabel}
                </label>
                <textarea
                  id="pr-msg"
                  rows={3}
                  maxLength={FIELD_LIMITS.quoteMessageMax}
                  value={quoteMessage}
                  onChange={(e) => setQuoteMessage(e.target.value)}
                  placeholder={cs.quotes.messagePlaceholder}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPendingCreateForm(false)}
                  className="px-4 py-2 text-xs font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg cursor-pointer min-h-[38px]"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submittingQuote}
                  className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg cursor-pointer min-h-[38px]"
                >
                  {submittingQuote ? cs.pendingRequests.submittingBtn : cs.pendingRequests.submitBtn}
                </button>
              </div>
            </form>
          )}

          {loadingQuotes ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3" aria-busy="true">
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : pendingClientRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Clock className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
              <h4 className="font-display text-base font-semibold text-slate-900">
                {cs.pendingRequests.emptyTitle}
              </h4>
              <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
                {cs.pendingRequests.emptyDesc}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingClientRequests.map((qItem) => {
                const statusBadgeLabel =
                  qItem.status === 'Devis envoyé'
                    ? cs.pendingRequests.readyToValidateBadge
                    : qItem.status === "À l'étude"
                      ? cs.pendingRequests.underReviewBadge
                      : cs.pendingRequests.awaitingAdminBadge;

                return (
                  <div
                    key={qItem.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                          {qItem.quoteCode}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs font-semibold text-slate-900">
                          {t.serviceLabels[qItem.transportMode] || qItem.transportMode}
                        </span>
                        {(qItem.origin || qItem.destination) && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-600">
                              {qItem.origin || '—'} → {qItem.destination || '—'}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold ${getQuoteStatusTone(qItem.status)}`}>
                          {statusBadgeLabel}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {formatDate(qItem.createdAt, localeConfig.intlLocale, t.common.justNow)}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                      {qItem.message}
                    </p>

                    {(qItem.estimatedAmount || qItem.adminResponse || qItem.status === 'Devis envoyé') && (
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        {(qItem.estimatedAmount || qItem.adminResponse) && (
                          <>
                            <p className="text-xs font-semibold text-slate-900">
                              {cs.quotes.responseHeader}
                              {qItem.estimatedAmount
                                ? ` · ${cs.quotes.tariffLabel} ${qItem.estimatedAmount}`
                                : ''}
                            </p>
                            {qItem.adminResponse && (
                              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                {qItem.adminResponse}
                              </p>
                            )}
                          </>
                        )}

                        {qItem.status === 'Devis envoyé' && (
                          <div className="pt-1">
                            <button
                              type="button"
                              disabled={validatingQuoteId === qItem.id}
                              onClick={() => void handleAcceptQuote(qItem.id, 'pendingRequests')}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[38px]"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {validatingQuoteId === qItem.id
                                  ? cs.pendingRequests.validatingBtn
                                  : cs.pendingRequests.validateBtn}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {validatedClientRequests.length > 0 && (
            <div className="pt-4 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-700">
                {cs.pendingRequests.validatedSectionTitle} ({validatedClientRequests.length})
              </h4>
              <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl">
                {validatedClientRequests.slice(0, 5).map((vItem) => (
                  <div
                    key={vItem.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                        {vItem.quoteCode}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="font-medium text-slate-900">
                        {t.serviceLabels[vItem.transportMode] || vItem.transportMode}
                      </span>
                      <span className="text-slate-500">
                        ({vItem.origin || '—'} → {vItem.destination || '—'})
                      </span>
                    </div>
                    <span className="font-semibold text-emerald-700">
                      {t.quoteStatusLabels[vItem.status] || vItem.status}
                      {vItem.estimatedAmount ? ` · ${vItem.estimatedAmount}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TELECHARGEMENT DES DOCUMENTS (ALL SHIPMENTS) */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
                placeholder={cs.documents.searchPlaceholder}
                className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <select
              aria-label={cs.documents.filterByCat}
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as 'ALL' | ShipmentDocType)}
              className="min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            >
              <option value="ALL">
                {cs.documents.allCategories} ({allDocuments.length})
              </option>
              {SHIPMENT_DOC_TYPES.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {t.docTypeLabels[typeOption]} (
                  {allDocuments.filter((d) => d.docType === typeOption).length})
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {allDocuments.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {cs.documents.emptyTitle}
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
                  {cs.documents.emptyDesc}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">{cs.documents.colDoc}</th>
                      <th className="py-3 px-4">{cs.documents.colCategory}</th>
                      <th className="py-3 px-4">{cs.documents.colShipment}</th>
                      <th className="py-3 px-4">{cs.documents.colDateSize}</th>
                      <th className="py-3 px-4 text-right">{cs.documents.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500">
                          {cs.documents.noMatch}
                        </td>
                      </tr>
                    ) : (
                      filteredDocuments.map((docItem) => (
                        <tr key={`${docItem.shipmentId}-${docItem.id}`} className="hover:bg-slate-50">
                          <td className="py-3 px-4 align-top">
                            <p className="text-xs font-semibold text-slate-900">{docItem.title}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {docItem.referenceNumber ? `${docItem.referenceNumber} · ` : ''}
                              {docItem.fileName}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top text-xs font-medium text-sky-700 whitespace-nowrap">
                            {t.docTypeLabels[docItem.docType] || docItem.docType}
                          </td>
                          <td className="py-3 px-4 align-top">
                            {docItem.shipmentId && docItem.trackingCode ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(docItem.shipmentId);
                                  setActiveTab('shipments');
                                }}
                                className="font-mono text-xs font-semibold text-orange-700 hover:underline tabular-nums cursor-pointer"
                              >
                                {docItem.trackingCode}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-600">
                                {cs.documents.clientGeneralFile}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 align-top text-xs text-slate-600 whitespace-nowrap">
                            <p className="font-mono text-[11px] tabular-nums">
                              {formatDate(
                                docItem.createdAt,
                                localeConfig.intlLocale,
                                t.common.justNow
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 tabular-nums">
                              {formatFileSize(docItem.fileSize, locale, t.common.externalLink)}
                            </p>
                          </td>
                          <td className="py-3 px-4 align-top text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {docItem.fileData ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc(docItem)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md cursor-pointer whitespace-nowrap"
                                  >
                                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>{t.common.consult}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDirectDownload(docItem)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md cursor-pointer whitespace-nowrap"
                                  >
                                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>{t.common.download}</span>
                                  </button>
                                </>
                              ) : docItem.externalUrl ? (
                                <a
                                  href={docItem.externalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{t.common.download}</span>
                                </a>
                              ) : null}
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
      )}

      {/* TAB 3: HISTORIQUE DES OPERATIONS */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={cs.history.searchPlaceholder}
                className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              {(
                [
                  { key: 'ALL', label: cs.history.catAll },
                  { key: 'tracking', label: cs.history.catTracking },
                  { key: 'document', label: cs.history.catDocument },
                  { key: 'quote', label: cs.history.catQuote },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setHistoryCategory(cat.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[36px] ${
                    historyCategory === cat.key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredOperations.length === 0 ? (
              <div className="p-10 text-center">
                <History className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-900">{cs.history.emptyTitle}</p>
                <p className="mt-1 text-xs text-slate-500">{cs.history.emptyDesc}</p>
              </div>
            ) : (
              <ol className="divide-y divide-slate-200">
                {filteredOperations.map((op) => (
                  <li key={op.id} className="p-4 sm:px-6 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                          {op.referenceCode}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs font-medium text-slate-500">
                          {op.category === 'tracking'
                            ? cs.history.labelTracking
                            : op.category === 'document'
                            ? cs.history.labelDocument
                            : cs.history.labelQuote}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDate(op.timestamp, localeConfig.intlLocale, t.common.justNow)}
                      </span>
                    </div>

                    <p className="mt-1 text-sm font-semibold text-slate-900">{op.title}</p>
                    {op.subtitle && <p className="mt-0.5 text-xs text-slate-600">{op.subtitle}</p>}
                    {op.details && (
                      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{op.details}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONSULTATION DES DEMANDES DE COTATION */}
      {activeTab === 'quotes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">{cs.quotes.title}</h3>
              <p className="text-xs text-slate-500">{cs.quotes.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowNewQuoteForm((v) => !v);
                setQuoteFeedback(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
            >
              {showNewQuoteForm ? (
                <>
                  <X className="w-4 h-4" aria-hidden="true" />
                  <span>{cs.quotes.closeFormBtn}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>{cs.quotes.newBtn}</span>
                </>
              )}
            </button>
          </div>

          {quoteFeedback && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                quoteFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {quoteFeedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <span>{quoteFeedback.text}</span>
            </div>
          )}

          {showNewQuoteForm && (
            <form
              onSubmit={handleSubmitClientQuote}
              noValidate
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <h4 className="font-display text-sm font-bold text-slate-900">
                {cs.quotes.formTitle}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="cq-mode" className="block text-xs font-medium text-slate-700 mb-1">
                    {cs.quotes.modeLabel}
                  </label>
                  <select
                    id="cq-mode"
                    value={quoteMode}
                    onChange={(e) => setQuoteMode(e.target.value as ServiceCategory)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  >
                    {TRANSPORT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {t.serviceLabels[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cq-origin" className="block text-xs font-medium text-slate-700 mb-1">
                    {cs.quotes.originLabel}
                  </label>
                  <input
                    id="cq-origin"
                    type="text"
                    maxLength={FIELD_LIMITS.originDestMax}
                    value={quoteOrigin}
                    onChange={(e) => setQuoteOrigin(e.target.value)}
                    placeholder={locale === 'en' ? 'Shanghai / Dubai' : 'Shanghai / Dubaï'}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
                <div>
                  <label htmlFor="cq-dest" className="block text-xs font-medium text-slate-700 mb-1">
                    {cs.quotes.destLabel}
                  </label>
                  <input
                    id="cq-dest"
                    type="text"
                    maxLength={FIELD_LIMITS.originDestMax}
                    value={quoteDestination}
                    onChange={(e) => setQuoteDestination(e.target.value)}
                    placeholder="Niamey (Niger)"
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cq-msg" className="block text-xs font-medium text-slate-700 mb-1">
                  {cs.quotes.messageLabel}
                </label>
                <textarea
                  id="cq-msg"
                  rows={3}
                  maxLength={FIELD_LIMITS.quoteMessageMax}
                  value={quoteMessage}
                  onChange={(e) => setQuoteMessage(e.target.value)}
                  placeholder={cs.quotes.messagePlaceholder}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewQuoteForm(false)}
                  className="px-4 py-2 text-xs font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg cursor-pointer min-h-[38px]"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submittingQuote}
                  className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg cursor-pointer min-h-[38px]"
                >
                  {submittingQuote ? cs.quotes.submittingBtn : cs.quotes.submitBtn}
                </button>
              </div>
            </form>
          )}

          {loadingQuotes ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <FileSpreadsheet className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
              <h4 className="font-display text-base font-semibold text-slate-900">
                {cs.quotes.emptyTitle}
              </h4>
              <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">{cs.quotes.emptyDesc}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {quotes.map((qItem) => (
                <div
                  key={qItem.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-sky-700 tabular-nums">
                        {qItem.quoteCode}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs font-semibold text-slate-900">
                        {t.serviceLabels[qItem.transportMode] || qItem.transportMode}
                      </span>
                      {(qItem.origin || qItem.destination) && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs text-slate-600">
                            {qItem.origin || '—'} → {qItem.destination || '—'}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold ${getQuoteStatusTone(qItem.status)}`}>
                        {t.quoteStatusLabels[qItem.status] || qItem.status}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {formatDate(qItem.createdAt, localeConfig.intlLocale, t.common.justNow)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                    {qItem.message}
                  </p>

                  {(qItem.estimatedAmount || qItem.adminResponse) && (
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-900">
                        {cs.quotes.responseHeader}
                        {qItem.estimatedAmount
                          ? ` · ${cs.quotes.tariffLabel} ${qItem.estimatedAmount}`
                          : ''}
                      </p>
                      {qItem.adminResponse && (
                        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                          {qItem.adminResponse}
                        </p>
                      )}
                      {qItem.status === 'Devis envoyé' && (
                        <div className="pt-2">
                          <button
                            type="button"
                            disabled={validatingQuoteId === qItem.id}
                            onClick={() => void handleAcceptQuote(qItem.id, 'quotes')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {validatingQuoteId === qItem.id
                                ? cs.pendingRequests.validatingBtn
                                : cs.quotes.acceptBtn}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: NOTIFICATIONS RELATIVES AUX EXPEDITIONS */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setNotifFilter('ALL')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer min-h-[36px] ${
                  notifFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cs.notifications.all} ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setNotifFilter('UNREAD')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer min-h-[36px] ${
                  notifFilter === 'UNREAD'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cs.notifications.unread} ({unreadNotifications.length})
              </button>
            </div>

            {unreadNotifications.length > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllNotificationsRead()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px]"
              >
                <CheckCheck className="w-4 h-4" aria-hidden="true" />
                <span>{cs.notifications.markAllRead}</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loadingNotifications ? (
              <div className="p-6 space-y-3">
                <div className="h-12 bg-slate-100 rounded animate-pulse" />
                <div className="h-12 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="p-10 text-center">
                <Bell className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
                <h4 className="font-display text-base font-semibold text-slate-900">
                  {notifFilter === 'UNREAD'
                    ? cs.notifications.emptyUnread
                    : cs.notifications.emptyAll}
                </h4>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                  {cs.notifications.emptyDesc}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {displayedNotifications.map((notif) => (
                  <li
                    key={notif.id}
                    className={`p-4 sm:px-6 transition-colors ${
                      notif.read ? 'bg-white' : 'bg-orange-50/50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          {!notif.read && (
                            <span
                              className="w-2 h-2 rounded-full bg-orange-600 inline-block"
                              aria-label={cs.notifications.unread}
                            />
                          )}
                          <span className="font-semibold text-sky-700">
                            {getNotificationCategoryLabel(notif.category)}
                          </span>
                          {notif.trackingCode && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-mono font-semibold text-slate-800 tabular-nums">
                                {notif.trackingCode}
                              </span>
                            </>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {formatDate(
                              notif.createdAt,
                              localeConfig.intlLocale,
                              t.common.justNow
                            )}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{notif.title}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{notif.message}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleMarkNotificationRead(notif)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer min-h-[34px]"
                        >
                          <span>
                            {notif.read ? cs.notifications.openBtn : cs.notifications.markReadOpenBtn}
                          </span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* In-App Document Preview Modal (Documents Tab) */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-doc-viewer-title"
          onClick={() => setPreviewDoc(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sky-700">
                  {t.docTypeLabels[previewDoc.docType] || previewDoc.docType}
                  {previewDoc.referenceNumber ? ` · ${previewDoc.referenceNumber}` : ''} ·{' '}
                  {previewDoc.trackingCode || cs.documents.clientGeneralFile}
                </p>
                <h3
                  id="client-doc-viewer-title"
                  className="mt-0.5 font-display text-base font-bold text-slate-900 truncate"
                >
                  {previewDoc.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {previewBlobUrl && (
                  <a
                    href={previewBlobUrl}
                    download={previewDoc.fileName || `${previewDoc.docType}.pdf`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.common.download}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  aria-label={t.common.close}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="p-5 bg-slate-50">
              {previewBlobUrl ? (
                previewDoc.mimeType.startsWith('image/') ? (
                  <img
                    src={previewBlobUrl}
                    alt={previewDoc.title}
                    className="max-h-[68vh] w-auto mx-auto rounded-lg border border-slate-200 bg-white object-contain"
                  />
                ) : (
                  <iframe
                    src={previewBlobUrl}
                    title={previewDoc.title}
                    className="w-full h-[68vh] rounded-lg border border-slate-200 bg-white"
                  />
                )
              ) : (
                <div className="py-12 text-center text-sm text-slate-600">
                  {cs.documents.previewUnavailable}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
