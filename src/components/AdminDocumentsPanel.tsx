import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  dataUrlToBlob,
  deriveTitleFromFilename,
  formatFileSize,
  inferDocTypeFromFilename,
  processDocumentFile,
} from '../lib/documentFiles';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ClientDocumentRecord,
  ClientRecord,
  DocMimeType,
  DocVisibility,
  FIELD_LIMITS,
  SHIPMENT_DOC_TYPES,
  ShipmentDocType,
  ShipmentDocumentRecord,
  ShipmentRecord,
  UserProfile,
} from '../types/logistics';

interface AdminDocumentsPanelProps {
  adminClients: ClientRecord[];
  registeredUsers: UserProfile[];
  shipments: ShipmentRecord[];
  initialClientEmail?: string;
  onClearInitialClient?: () => void;
}

interface UnifiedClientOption {
  email: string;
  uid: string;
  name: string;
  company: string;
  shipmentsCount: number;
}

interface UnifiedAdminDoc {
  uidKey: string;
  id: string;
  storage: 'client' | 'shipment';
  shipmentId: string;
  trackingCode: string;
  clientUid: string;
  clientEmail: string;
  clientName: string;
  docType: ShipmentDocType;
  title: string;
  referenceNumber: string;
  fileName: string;
  mimeType: DocMimeType;
  fileSize: number;
  fileData: string;
  externalUrl: string;
  visibility: DocVisibility;
  notes: string;
  uploadedBy: string;
  uploadedByEmail: string;
  uploadedByRole: 'admin' | 'operator' | 'client';
  createdAt?: Timestamp | null;
}

interface StagedDocItem {
  localId: string;
  docType: ShipmentDocType;
  title: string;
  referenceNumber: string;
  sourceMode: 'file' | 'url';
  fileName: string;
  mimeType: DocMimeType;
  fileSize: number;
  fileData: string;
  externalUrl: string;
  visibility: DocVisibility;
  notes: string;
  fileError?: string;
}

function makeLocalId(): string {
  return `stg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

export function AdminDocumentsPanel({
  adminClients,
  registeredUsers,
  shipments,
  initialClientEmail,
  onClearInitialClient,
}: AdminDocumentsPanelProps) {
  const { user, authReady, staffRole } = useAuth();

  // Remote state
  const [clientDocs, setClientDocs] = useState<ClientDocumentRecord[]>([]);
  const [shipmentDocsMap, setShipmentDocsMap] = useState<Record<string, ShipmentDocumentRecord[]>>({});
  const [loadingClientDocs, setLoadingClientDocs] = useState(true);

  // Batch upload builder state
  const [showBatchForm, setShowBatchForm] = useState(true);
  const [targetClientEmail, setTargetClientEmail] = useState('');
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientEmail, setManualClientEmail] = useState('');
  const [targetShipmentId, setTargetShipmentId] = useState('');
  const [defaultVisibility, setDefaultVisibility] = useState<DocVisibility>('client');
  const [notifyClient, setNotifyClient] = useState(true);
  const [stagedItems, setStagedItems] = useState<StagedDocItem[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Directory filters
  const [filterClientEmail, setFilterClientEmail] = useState<'ALL' | string>('ALL');
  const [filterDocType, setFilterDocType] = useState<'ALL' | ShipmentDocType>('ALL');
  const [filterVisibility, setFilterVisibility] = useState<'ALL' | DocVisibility>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Row actions
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<UnifiedAdminDoc | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Deduplicated clients directory (users + adminClients + shipment clients)
  const clientOptions = useMemo<UnifiedClientOption[]>(() => {
    const map = new Map<string, UnifiedClientOption>();

    registeredUsers.forEach((u) => {
      const email = u.email.trim().toLowerCase();
      if (!email) return;
      map.set(email, {
        email,
        uid: u.uid,
        name: u.fullName,
        company: u.company,
        shipmentsCount: 0,
      });
    });

    adminClients.forEach((c) => {
      const email = c.email.trim().toLowerCase();
      if (!email) return;
      const existing = map.get(email);
      map.set(email, {
        email,
        uid: existing?.uid || '',
        name: c.fullName || existing?.name || email,
        company: c.company || existing?.company || c.fullName,
        shipmentsCount: existing?.shipmentsCount || 0,
      });
    });

    shipments.forEach((s) => {
      const email = s.clientEmail.trim().toLowerCase();
      if (!email) return;
      const existing = map.get(email);
      if (existing) {
        existing.shipmentsCount += 1;
        if (!existing.uid && s.clientUid) {
          existing.uid = s.clientUid;
        }
      } else {
        map.set(email, {
          email,
          uid: s.clientUid || '',
          name: s.clientName,
          company: s.clientName,
          shipmentsCount: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      `${a.company} ${a.name}`.localeCompare(`${b.company} ${b.name}`, 'fr')
    );
  }, [adminClients, registeredUsers, shipments]);

  // Apply preselected client when navigating from Clients tab
  useEffect(() => {
    if (!initialClientEmail) return;
    const lower = initialClientEmail.trim().toLowerCase();
    setTargetClientEmail(lower);
    setFilterClientEmail(lower);
    setTargetShipmentId('');
    setShowBatchForm(true);
    setFeedback(null);
  }, [initialClientEmail]);

  // Preview Blob URL lifecycle
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

  // 1. Subscribe to /clientDocuments
  useEffect(() => {
    if (!authReady || !user) return;
    setLoadingClientDocs(true);
    const q = query(collection(db, 'clientDocuments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as ClientDocumentRecord),
          id: docSnap.id,
        }));
        setClientDocs(list);
        setLoadingClientDocs(false);
      },
      (error) => {
        setLoadingClientDocs(false);
        handleFirestoreError(error, OperationType.LIST, 'clientDocuments');
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  // 2. Subscribe to /shipments/{id}/documents across active shipments
  const shipmentIdsKey = useMemo(() => shipments.map((s) => s.id).join(','), [shipments]);

  useEffect(() => {
    if (!authReady || !user || shipments.length === 0) {
      setShipmentDocsMap({});
      return;
    }

    const unsubscribers: Array<() => void> = [];
    shipments.forEach((sh) => {
      const docsPath = `shipments/${sh.id}/documents`;
      const q = query(
        collection(db, 'shipments', sh.id, 'documents'),
        orderBy('createdAt', 'desc')
      );
      unsubscribers.push(
        onSnapshot(
          q,
          (snapshot) => {
            const list = snapshot.docs.map((docSnap) => ({
              ...(docSnap.data() as ShipmentDocumentRecord),
              id: docSnap.id,
            }));
            setShipmentDocsMap((prev) => ({ ...prev, [sh.id]: list }));
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
  }, [authReady, user, shipmentIdsKey]);

  const selectedTargetClient = useMemo(() => {
    if (!targetClientEmail || targetClientEmail === '__manual__') return null;
    return clientOptions.find((c) => c.email === targetClientEmail) ?? null;
  }, [clientOptions, targetClientEmail]);

  const clientShipments = useMemo(() => {
    const activeEmail =
      targetClientEmail === '__manual__'
        ? manualClientEmail.trim().toLowerCase()
        : targetClientEmail;
    if (!activeEmail) return [];
    return shipments.filter((s) => s.clientEmail.toLowerCase() === activeEmail);
  }, [shipments, targetClientEmail, manualClientEmail]);

  useEffect(() => {
    if (targetShipmentId && !clientShipments.some((s) => s.id === targetShipmentId)) {
      setTargetShipmentId('');
    }
  }, [clientShipments, targetShipmentId]);

  const unifiedDocuments = useMemo<UnifiedAdminDoc[]>(() => {
    const shipmentMap = new Map(shipments.map((s) => [s.id, s]));
    const clientNameByEmail = new Map(
      clientOptions.map((c) => [c.email, c.company ? `${c.company} — ${c.name}` : c.name])
    );

    const rows: UnifiedAdminDoc[] = [];

    clientDocs.forEach((d) => {
      rows.push({
        uidKey: `client:${d.id}`,
        id: d.id,
        storage: 'client',
        shipmentId: d.shipmentId || '',
        trackingCode: d.trackingCode || '',
        clientUid: d.clientUid || '',
        clientEmail: d.clientEmail.toLowerCase(),
        clientName: d.clientName,
        docType: d.docType,
        title: d.title,
        referenceNumber: d.referenceNumber,
        fileName: d.fileName,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        fileData: d.fileData,
        externalUrl: d.externalUrl,
        visibility: d.visibility,
        notes: d.notes,
        uploadedBy: d.uploadedBy,
        uploadedByEmail: d.uploadedByEmail,
        uploadedByRole: d.uploadedByRole,
        createdAt: d.createdAt,
      });
    });

    Object.entries(shipmentDocsMap).forEach(([shId, list]) => {
      const sh = shipmentMap.get(shId);
      list.forEach((d) => {
        const lowerEmail = d.clientEmail.toLowerCase();
        rows.push({
          uidKey: `ship:${shId}:${d.id}`,
          id: d.id,
          storage: 'shipment',
          shipmentId: shId,
          trackingCode: sh?.trackingCode || shId,
          clientUid: d.clientUid || sh?.clientUid || '',
          clientEmail: lowerEmail,
          clientName: sh?.clientName || clientNameByEmail.get(lowerEmail) || lowerEmail,
          docType: d.docType,
          title: d.title,
          referenceNumber: d.referenceNumber,
          fileName: d.fileName,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          fileData: d.fileData,
          externalUrl: d.externalUrl,
          visibility: d.visibility,
          notes: d.notes,
          uploadedBy: d.uploadedBy,
          uploadedByEmail: d.uploadedByEmail,
          uploadedByRole: d.uploadedByRole,
          createdAt: d.createdAt,
        });
      });
    });

    rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    return rows;
  }, [clientDocs, shipmentDocsMap, shipments, clientOptions]);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedDocuments.filter((item) => {
      const matchesClient =
        filterClientEmail === 'ALL' || item.clientEmail === filterClientEmail.toLowerCase();
      const matchesType = filterDocType === 'ALL' || item.docType === filterDocType;
      const matchesVis = filterVisibility === 'ALL' || item.visibility === filterVisibility;
      const matchesQuery =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.clientEmail.toLowerCase().includes(q) ||
        item.referenceNumber.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q) ||
        item.trackingCode.toLowerCase().includes(q) ||
        item.docType.toLowerCase().includes(q);
      return matchesClient && matchesType && matchesVis && matchesQuery;
    });
  }, [unifiedDocuments, filterClientEmail, filterDocType, filterVisibility, searchQuery]);

  // Multi-file selection handler
  const handleMultiFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    setFeedback(null);
    setProcessingFiles(true);

    try {
      const nextRows: StagedDocItem[] = [];
      for (const file of files) {
        const result = await processDocumentFile(file, 'fr', 'Lien externe');
        const guessedType = inferDocTypeFromFilename(file.name);
        if (result.ok) {
          nextRows.push({
            localId: makeLocalId(),
            docType: guessedType,
            title: deriveTitleFromFilename(file.name, guessedType),
            referenceNumber: '',
            sourceMode: 'file',
            fileName: result.fileName,
            mimeType: result.mimeType,
            fileSize: result.fileSize,
            fileData: result.fileData,
            externalUrl: '',
            visibility: defaultVisibility,
            notes: '',
          });
        } else {
          nextRows.push({
            localId: makeLocalId(),
            docType: guessedType,
            title: deriveTitleFromFilename(file.name, guessedType),
            referenceNumber: '',
            sourceMode: 'file',
            fileName: file.name.slice(0, FIELD_LIMITS.docFileNameMax),
            mimeType: 'application/pdf',
            fileSize: 0,
            fileData: '',
            externalUrl: '',
            visibility: defaultVisibility,
            notes: '',
            fileError: result.error,
          });
        }
      }
      setStagedItems((prev) => [...prev, ...nextRows]);
    } finally {
      setProcessingFiles(false);
    }
  };

  // Update file for an individual staged row
  const handleRowFileSelected = async (
    localId: string,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProcessingFiles(true);
    try {
      const result = await processDocumentFile(file, 'fr', 'Lien externe');
      setStagedItems((prev) =>
        prev.map((row) => {
          if (row.localId !== localId) return row;
          if (result.ok) {
            return {
              ...row,
              sourceMode: 'file',
              fileName: result.fileName,
              mimeType: result.mimeType,
              fileSize: result.fileSize,
              fileData: result.fileData,
              externalUrl: '',
              title: row.title.trim() || deriveTitleFromFilename(file.name, row.docType),
              fileError: undefined,
            };
          }
          return {
            ...row,
            fileData: '',
            fileSize: 0,
            fileError: result.error,
          };
        })
      );
    } finally {
      setProcessingFiles(false);
    }
  };

  const handlePrepareFullPack = () => {
    setFeedback(null);
    const existingTypes = new Set(stagedItems.map((item) => item.docType));
    const missingTypes = SHIPMENT_DOC_TYPES.filter((t) => !existingTypes.has(t));
    const typesToAdd = missingTypes.length > 0 ? missingTypes : SHIPMENT_DOC_TYPES;

    const packRows: StagedDocItem[] = typesToAdd.map((docType) => ({
      localId: makeLocalId(),
      docType,
      title: docType,
      referenceNumber: '',
      sourceMode: 'file',
      fileName: '',
      mimeType: 'application/pdf',
      fileSize: 0,
      fileData: '',
      externalUrl: '',
      visibility: defaultVisibility,
      notes: '',
    }));

    setStagedItems((prev) => [...prev, ...packRows]);
  };

  const handleAddSingleRow = () => {
    setFeedback(null);
    setStagedItems((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        docType: 'Facture commerciale',
        title: '',
        referenceNumber: '',
        sourceMode: 'file',
        fileName: '',
        mimeType: 'application/pdf',
        fileSize: 0,
        fileData: '',
        externalUrl: '',
        visibility: defaultVisibility,
        notes: '',
      },
    ]);
  };

  const updateStagedRow = (localId: string, patch: Partial<StagedDocItem>) => {
    setStagedItems((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  };

  const removeStagedRow = (localId: string) => {
    setStagedItems((prev) => prev.filter((row) => row.localId !== localId));
  };

  const handleRemoveEmptyRows = () => {
    setStagedItems((prev) =>
      prev.filter((row) =>
        row.sourceMode === 'file' ? Boolean(row.fileData) : row.externalUrl.trim().length > 0
      )
    );
  };

  const handleBatchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !user.email) return;
    setFeedback(null);

    const isManual = targetClientEmail === '__manual__';
    const resolvedEmail = (isManual ? manualClientEmail : targetClientEmail)
      .trim()
      .toLowerCase()
      .slice(0, FIELD_LIMITS.emailMax);
    const resolvedName = (
      isManual
        ? manualClientName
        : selectedTargetClient
        ? selectedTargetClient.company
          ? `${selectedTargetClient.company} — ${selectedTargetClient.name}`
          : selectedTargetClient.name
        : ''
    )
      .trim()
      .slice(0, FIELD_LIMITS.companyMax);
    const resolvedClientUid = isManual ? '' : selectedTargetClient?.uid || '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(resolvedEmail)) {
      setFeedback({
        type: 'err',
        text: 'Veuillez sélectionner un client ou saisir une adresse e-mail client valide.',
      });
      return;
    }
    if (resolvedName.length < 2) {
      setFeedback({
        type: 'err',
        text: 'Veuillez indiquer le nom ou la société du client (2 caractères minimum).',
      });
      return;
    }

    if (stagedItems.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Ajoutez au moins un fichier ou lien documentaire avant d’enregistrer.',
      });
      return;
    }

    // Filter only rows that have a file or URL provided; warn if any row is incomplete
    const emptyRows = stagedItems.filter((row) =>
      row.sourceMode === 'file' ? !row.fileData : !row.externalUrl.trim()
    );
    if (emptyRows.length > 0) {
      setFeedback({
        type: 'err',
        text: `${emptyRows.length} ligne(s) n’ont pas encore de fichier ou de lien HTTPS. Complétez-les ou cliquez sur « Retirer les lignes vides ».`,
      });
      return;
    }

    for (const row of stagedItems) {
      const cleanTitle = (row.title.trim() || row.docType).slice(0, FIELD_LIMITS.docTitleMax);
      if (cleanTitle.length < 2) {
        setFeedback({
          type: 'err',
          text: `Intitulé invalide pour un document de type ${row.docType}.`,
        });
        return;
      }
      if (row.sourceMode === 'url') {
        const cleanUrl = row.externalUrl.trim();
        if (!cleanUrl.startsWith('https://') || cleanUrl.length < 12) {
          setFeedback({
            type: 'err',
            text: `Le lien « ${cleanTitle} » doit commencer par https:// (12 caractères min).`,
          });
          return;
        }
      }
    }

    const linkedShipment = targetShipmentId
      ? shipments.find((s) => s.id === targetShipmentId) ?? null
      : null;

    const resolvedRole = staffRole === 'admin' ? 'admin' : 'operator';
    const uploaderEmail = user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax);

    setSavingBatch(true);
    setSaveProgress({ done: 0, total: stagedItems.length });

    let savedCount = 0;
    const remaining: StagedDocItem[] = [];

    for (let i = 0; i < stagedItems.length; i += 1) {
      const item = stagedItems[i];
      const docId = `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanTitle = (item.title.trim() || item.docType).slice(0, FIELD_LIMITS.docTitleMax);
      const cleanRef = item.referenceNumber.trim().slice(0, FIELD_LIMITS.docRefMax);
      const cleanNotes = item.notes.trim().slice(0, FIELD_LIMITS.docNotesMax);
      const cleanUrl = item.externalUrl.trim().slice(0, FIELD_LIMITS.docUrlMax);

      const targetPath = linkedShipment
        ? `shipments/${linkedShipment.id}/documents/${docId}`
        : `clientDocuments/${docId}`;

      try {
        const batch = writeBatch(db);

        if (linkedShipment) {
          batch.set(doc(db, 'shipments', linkedShipment.id, 'documents', docId), {
            id: docId,
            shipmentId: linkedShipment.id,
            clientUid: linkedShipment.clientUid || resolvedClientUid || '',
            clientEmail: linkedShipment.clientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax),
            docType: item.docType,
            title: cleanTitle,
            referenceNumber: cleanRef,
            fileName:
              item.sourceMode === 'file'
                ? item.fileName.slice(0, FIELD_LIMITS.docFileNameMax)
                : 'Lien sécurisé',
            mimeType: item.sourceMode === 'file' ? item.mimeType : 'text/url',
            fileSize: item.sourceMode === 'file' ? item.fileSize : 0,
            fileData: item.sourceMode === 'file' ? item.fileData : '',
            externalUrl: item.sourceMode === 'url' ? cleanUrl : '',
            visibility: item.visibility,
            notes: cleanNotes,
            uploadedBy: user.uid,
            uploadedByEmail: uploaderEmail,
            uploadedByRole: resolvedRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(doc(db, 'clientDocuments', docId), {
            id: docId,
            clientUid: resolvedClientUid || '',
            clientEmail: resolvedEmail,
            clientName: resolvedName,
            shipmentId: '',
            trackingCode: '',
            docType: item.docType,
            title: cleanTitle,
            referenceNumber: cleanRef,
            fileName:
              item.sourceMode === 'file'
                ? item.fileName.slice(0, FIELD_LIMITS.docFileNameMax)
                : 'Lien sécurisé',
            mimeType: item.sourceMode === 'file' ? item.mimeType : 'text/url',
            fileSize: item.sourceMode === 'file' ? item.fileSize : 0,
            fileData: item.sourceMode === 'file' ? item.fileData : '',
            externalUrl: item.sourceMode === 'url' ? cleanUrl : '',
            visibility: item.visibility,
            notes: cleanNotes,
            uploadedBy: user.uid,
            uploadedByEmail: uploaderEmail,
            uploadedByRole: resolvedRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (notifyClient && item.visibility === 'client') {
          const notifId = `notif-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
          const trackingLabel = linkedShipment?.trackingCode || 'Espace client';
          batch.set(doc(db, 'notifications', notifId), {
            id: notifId,
            clientUid: linkedShipment?.clientUid || resolvedClientUid || '',
            clientEmail: linkedShipment
              ? linkedShipment.clientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax)
              : resolvedEmail,
            shipmentId: linkedShipment?.id || '',
            trackingCode: linkedShipment?.trackingCode || '',
            category: 'document',
            title: `Nouveau document · ${trackingLabel}`.slice(0, FIELD_LIMITS.notifTitleMax),
            message: `${item.docType} : ${cleanTitle}${cleanRef ? ` (Réf. ${cleanRef})` : ''}`.slice(
              0,
              FIELD_LIMITS.notifMessageMax
            ),
            read: false,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          });
        }

        await batch.commit();
        savedCount += 1;
        setSaveProgress({ done: savedCount, total: stagedItems.length });
      } catch (error) {
        remaining.push(item);
        setStagedItems([...remaining, ...stagedItems.slice(i + 1)]);
        setSavingBatch(false);
        setSaveProgress(null);
        handleFirestoreError(error, OperationType.CREATE, targetPath);
        return;
      }
    }

    setStagedItems([]);
    setSavingBatch(false);
    setSaveProgress(null);
    setFilterClientEmail(resolvedEmail);
    setFeedback({
      type: 'ok',
      text: `${savedCount} document(s) enregistré(s) pour ${resolvedName}${
        linkedShipment ? ` (dossier ${linkedShipment.trackingCode})` : ' (dossier client général)'
      }.`,
    });
  };

  const handleToggleVisibility = async (item: UnifiedAdminDoc) => {
    if (!user) return;
    const nextVisibility: DocVisibility = item.visibility === 'client' ? 'internal' : 'client';
    const path =
      item.storage === 'shipment'
        ? `shipments/${item.shipmentId}/documents/${item.id}`
        : `clientDocuments/${item.id}`;

    setTogglingKey(item.uidKey);
    try {
      const batch = writeBatch(db);
      const docRef =
        item.storage === 'shipment'
          ? doc(db, 'shipments', item.shipmentId, 'documents', item.id)
          : doc(db, 'clientDocuments', item.id);

      batch.update(docRef, {
        visibility: nextVisibility,
        updatedAt: serverTimestamp(),
      });

      if (nextVisibility === 'client') {
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        batch.set(doc(db, 'notifications', notifId), {
          id: notifId,
          clientUid: item.clientUid || '',
          clientEmail: item.clientEmail.toLowerCase(),
          shipmentId: item.shipmentId || '',
          trackingCode: item.trackingCode || '',
          category: 'document',
          title: `Document partagé · ${item.trackingCode || 'Espace client'}`.slice(
            0,
            FIELD_LIMITS.notifTitleMax
          ),
          message: `${item.docType} : ${item.title} est désormais disponible au téléchargement.`.slice(
            0,
            FIELD_LIMITS.notifMessageMax
          ),
          read: false,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setTogglingKey(null);
    }
  };

  const handleDeleteDoc = async (item: UnifiedAdminDoc) => {
    const path =
      item.storage === 'shipment'
        ? `shipments/${item.shipmentId}/documents/${item.id}`
        : `clientDocuments/${item.id}`;
    try {
      const docRef =
        item.storage === 'shipment'
          ? doc(db, 'shipments', item.shipmentId, 'documents', item.id)
          : doc(db, 'clientDocuments', item.id);
      await deleteDoc(docRef);
      setConfirmDeleteKey(null);
      if (previewDoc?.uidKey === item.uidKey) {
        setPreviewDoc(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleDirectDownload = (item: UnifiedAdminDoc) => {
    if (!item.fileData) return;
    const blob = dataUrlToBlob(item.fileData, item.mimeType);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.fileName || `${item.docType.replace(/\s+/g, '_')}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const emptyRowsCount = stagedItems.filter((row) =>
    row.sourceMode === 'file' ? !row.fileData : !row.externalUrl.trim()
  ).length;

  return (
    <div className="space-y-6">
      {/* Header & Toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-orange-600" aria-hidden="true" />
            <span>Gestion centralisée des documents clients</span>
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
            Ajoutez en lot tous les documents d’un client (Bill of Lading, Air Waybill, Packing list,
            Facture commerciale, Douane, Preuve de livraison), liés à une expédition ou directement au
            dossier client.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBatchForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
        >
          {showBatchForm ? (
            <>
              <X className="w-4 h-4" aria-hidden="true" />
              <span>Masquer le dépôt en lot</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Ajouter les documents d’un client</span>
            </>
          )}
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline shrink-0 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Batch Client Document Deposit Workspace */}
      {showBatchForm && (
        <form
          onSubmit={handleBatchSubmit}
          noValidate
          className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div>
              <p className="text-xs font-semibold text-sky-700">Dépôt documentaire multi-fichiers</p>
              <h4 className="mt-0.5 font-display text-base font-bold text-slate-900">
                Ajouter tous les documents d’un client
              </h4>
            </div>
            {initialClientEmail && onClearInitialClient && (
              <button
                type="button"
                onClick={() => {
                  onClearInitialClient();
                  setFilterClientEmail('ALL');
                }}
                className="text-xs font-medium text-orange-700 hover:underline cursor-pointer"
              >
                Afficher tous les clients
              </button>
            )}
          </div>

          {/* Step 1: Target Client & Optional Shipment */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="batch-client-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                1. Client destinataire
              </label>
              <select
                id="batch-client-select"
                value={targetClientEmail}
                onChange={(e) => {
                  setTargetClientEmail(e.target.value);
                  if (e.target.value && e.target.value !== '__manual__') {
                    setFilterClientEmail(e.target.value);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="">Sélectionner un client...</option>
                {clientOptions.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.company ? `${c.company} — ${c.name}` : c.name} ({c.email})
                  </option>
                ))}
                <option value="__manual__">+ Saisir manuellement un e-mail client...</option>
              </select>
            </div>

            <div>
              <label htmlFor="batch-shipment-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                2. Dossier d’expédition (optionnel)
              </label>
              <select
                id="batch-shipment-select"
                value={targetShipmentId}
                onChange={(e) => setTargetShipmentId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="">Dossier client général (sans expédition spécifique)</option>
                {clientShipments.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.trackingCode} · {sh.origin} → {sh.destination}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="batch-default-vis" className="block text-xs font-medium text-slate-700 mb-1.5">
                3. Droits d’accès par défaut
              </label>
              <select
                id="batch-default-vis"
                value={defaultVisibility}
                onChange={(e) => {
                  const vis = e.target.value as DocVisibility;
                  setDefaultVisibility(vis);
                  setStagedItems((prev) => prev.map((row) => ({ ...row, visibility: vis })));
                }}
                className="w-full min-h-[42px] px-3 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              >
                <option value="client">Partagés avec le client (Espace Client)</option>
                <option value="internal">Interne uniquement (Admin / Opérateur)</option>
              </select>
            </div>
          </div>

          {targetClientEmail === '__manual__' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label htmlFor="batch-manual-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Société / Nom du client
                </label>
                <input
                  id="batch-manual-name"
                  type="text"
                  maxLength={FIELD_LIMITS.companyMax}
                  value={manualClientName}
                  onChange={(e) => setManualClientName(e.target.value)}
                  placeholder="Ex. Niger Import SARL"
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
              <div>
                <label htmlFor="batch-manual-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Adresse e-mail du client
                </label>
                <input
                  id="batch-manual-email"
                  type="email"
                  maxLength={FIELD_LIMITS.emailMax}
                  value={manualClientEmail}
                  onChange={(e) => setManualClientEmail(e.target.value)}
                  placeholder="client@entreprise.com"
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>
          )}

          {/* Step 2: Multi-file Picker + Preset Liasse Controls */}
          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Sélectionner plusieurs fichiers d’un coup ou préparer la liasse complète
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  PDF (max 512 Ko par fichier) ou images JPEG/PNG/WebP (compression automatique).
                  Classification automatique d’après le nom du fichier.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer min-h-[38px]">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{processingFiles ? 'Chargement...' : 'Choisir plusieurs fichiers'}</span>
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => void handleMultiFilesSelected(e)}
                    className="sr-only"
                  />
                </label>

                <button
                  type="button"
                  onClick={handlePrepareFullPack}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-orange-700 bg-white hover:bg-orange-50 border border-orange-300 rounded-lg transition-colors cursor-pointer min-h-[38px]"
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Préparer la liasse complète (6 docs)</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddSingleRow}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors cursor-pointer min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>+ Ajouter une ligne</span>
                </button>
              </div>
            </div>
          </div>

          {/* Staged Documents Queue */}
          {stagedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">
                  Documents prêts à être ajoutés ({stagedItems.length})
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {emptyRowsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveEmptyRows}
                      className="text-xs font-medium text-orange-700 hover:underline cursor-pointer"
                    >
                      Retirer les {emptyRowsCount} ligne(s) vide(s)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStagedItems([])}
                    className="text-xs font-medium text-slate-500 hover:text-red-700 cursor-pointer"
                  >
                    Tout vider
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
                {stagedItems.map((row, idx) => (
                  <div key={row.localId} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-sky-700">
                        Document #{idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                          <button
                            type="button"
                            onClick={() => updateStagedRow(row.localId, { sourceMode: 'file', fileError: undefined })}
                            className={`px-2 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                              row.sourceMode === 'file'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600'
                            }`}
                          >
                            Fichier
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStagedRow(row.localId, { sourceMode: 'url', fileError: undefined })}
                            className={`px-2 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                              row.sourceMode === 'url'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600'
                            }`}
                          >
                            Lien HTTPS
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeStagedRow(row.localId)}
                          aria-label={`Retirer document #${idx + 1}`}
                          className="p-1.5 text-slate-400 hover:text-red-700 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Catégorie
                        </label>
                        <select
                          value={row.docType}
                          onChange={(e) =>
                            updateStagedRow(row.localId, { docType: e.target.value as ShipmentDocType })
                          }
                          className="w-full min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                        >
                          {SHIPMENT_DOC_TYPES.map((typeOption) => (
                            <option key={typeOption} value={typeOption}>
                              {typeOption}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Intitulé
                        </label>
                        <input
                          type="text"
                          maxLength={FIELD_LIMITS.docTitleMax}
                          value={row.title}
                          onChange={(e) => updateStagedRow(row.localId, { title: e.target.value })}
                          placeholder={`Ex. ${row.docType}`}
                          className="w-full min-h-[36px] px-2.5 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Référence / N°
                        </label>
                        <input
                          type="text"
                          maxLength={FIELD_LIMITS.docRefMax}
                          value={row.referenceNumber}
                          onChange={(e) =>
                            updateStagedRow(row.localId, { referenceNumber: e.target.value })
                          }
                          placeholder="BL / LTA / Facture..."
                          className="w-full min-h-[36px] px-2.5 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Visibilité
                        </label>
                        <select
                          value={row.visibility}
                          onChange={(e) =>
                            updateStagedRow(row.localId, { visibility: e.target.value as DocVisibility })
                          }
                          className="w-full min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                        >
                          <option value="client">Client + Équipe</option>
                          <option value="internal">Interne uniquement</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                      <div>
                        {row.sourceMode === 'file' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp"
                              onChange={(e) => void handleRowFileSelected(row.localId, e)}
                              className="block w-full text-xs text-slate-700 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                            />
                            {row.fileData ? (
                              <span className="text-[11px] font-medium text-emerald-700">
                                Prêt : {row.fileName} ({formatFileSize(row.fileSize, 'fr', 'Lien')})
                              </span>
                            ) : row.fileError ? (
                              <span className="text-[11px] font-medium text-red-700">
                                {row.fileError}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                Aucun fichier sélectionné
                              </span>
                            )}
                          </div>
                        ) : (
                          <input
                            type="url"
                            maxLength={FIELD_LIMITS.docUrlMax}
                            value={row.externalUrl}
                            onChange={(e) =>
                              updateStagedRow(row.localId, { externalUrl: e.target.value })
                            }
                            placeholder="https://drive.google.com/... ou lien sécurisé"
                            className="w-full min-h-[36px] px-2.5 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                          />
                        )}
                      </div>

                      <div>
                        <input
                          type="text"
                          maxLength={FIELD_LIMITS.docNotesMax}
                          value={row.notes}
                          onChange={(e) => updateStagedRow(row.localId, { notes: e.target.value })}
                          placeholder="Observations / note pour ce document (optionnel)"
                          className="w-full min-h-[36px] px-2.5 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Batch Footer Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyClient}
                onChange={(e) => setNotifyClient(e.target.checked)}
                className="w-4 h-4 accent-orange-600 rounded"
              />
              <span>Notifier automatiquement le client pour les documents partagés</span>
            </label>

            <button
              type="submit"
              disabled={savingBatch || processingFiles || stagedItems.length === 0}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>
                {savingBatch && saveProgress
                  ? `Enregistrement ${saveProgress.done} / ${saveProgress.total}...`
                  : `Enregistrer tous les documents (${stagedItems.length})`}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Documents Directory Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par client, titre, référence ou suivi..."
            className="w-full min-h-[40px] pl-10 pr-4 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrer par client"
            value={filterClientEmail}
            onChange={(e) => setFilterClientEmail(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          >
            <option value="ALL">Tous les clients ({unifiedDocuments.length})</option>
            {clientOptions.map((c) => {
              const count = unifiedDocuments.filter((d) => d.clientEmail === c.email).length;
              return (
                <option key={c.email} value={c.email}>
                  {c.company ? `${c.company} — ${c.name}` : c.name} ({count})
                </option>
              );
            })}
          </select>

          <select
            aria-label="Filtrer par catégorie de document"
            value={filterDocType}
            onChange={(e) => setFilterDocType(e.target.value as 'ALL' | ShipmentDocType)}
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          >
            <option value="ALL">Toutes catégories</option>
            {SHIPMENT_DOC_TYPES.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {typeOption}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrer par visibilité"
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value as 'ALL' | DocVisibility)}
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          >
            <option value="ALL">Tous les droits</option>
            <option value="client">Partagés client</option>
            <option value="internal">Interne uniquement</option>
          </select>
        </div>
      </div>

      {/* Unified Client Documents Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loadingClientDocs && unifiedDocuments.length === 0 ? (
          <div className="p-6 space-y-3">
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : unifiedDocuments.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-9 h-9 text-slate-400 mx-auto mb-3" strokeWidth={1.5} aria-hidden="true" />
            <h4 className="font-display text-base font-semibold text-slate-900">
              Aucun document client enregistré
            </h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Sélectionnez un client ci-dessus et déposez ses connaissements, LTA, packing lists,
              factures, documents douaniers ou preuves de livraison.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Catégorie & Dossier</th>
                  <th className="py-3 px-4">Visibilité & Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500">
                      Aucun document ne correspond à ces filtres.
                    </td>
                  </tr>
                ) : (
                  filteredDocuments.map((item) => {
                    const isImage = item.mimeType.startsWith('image/');
                    const isExternal = item.mimeType === 'text/url';

                    return (
                      <tr key={item.uidKey} className="hover:bg-slate-50">
                        <td className="py-3 px-4 align-top">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-orange-600 shrink-0">
                              {isImage ? (
                                <ImageIcon className="w-4 h-4" aria-hidden="true" />
                              ) : isExternal ? (
                                <Link2 className="w-4 h-4" aria-hidden="true" />
                              ) : (
                                <FileText className="w-4 h-4" aria-hidden="true" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {item.referenceNumber ? `${item.referenceNumber} · ` : ''}
                                {item.fileName} (
                                {formatFileSize(item.fileSize, 'fr', 'Lien externe')})
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <p className="text-xs font-medium text-slate-900">{item.clientName}</p>
                          <p className="text-[11px] text-slate-500">{item.clientEmail}</p>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <p className="text-xs font-medium text-sky-700">{item.docType}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                            {item.trackingCode ? item.trackingCode : 'Dossier client général'}
                          </p>
                        </td>

                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <p
                            className={`text-xs font-semibold ${
                              item.visibility === 'client' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {item.visibility === 'client' ? 'Partagé client' : 'Interne uniquement'}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatDate(item.createdAt)}
                          </p>
                        </td>

                        <td className="py-3 px-4 align-top text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {item.fileData ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md cursor-pointer whitespace-nowrap"
                                >
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Consulter</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDirectDownload(item)}
                                  aria-label={`Télécharger ${item.title}`}
                                  title="Télécharger"
                                  className="p-1.5 text-orange-700 hover:bg-orange-50 rounded-md cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </>
                            ) : item.externalUrl ? (
                              <a
                                href={item.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md whitespace-nowrap"
                              >
                                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Ouvrir</span>
                              </a>
                            ) : null}

                            <button
                              type="button"
                              disabled={togglingKey === item.uidKey}
                              onClick={() => void handleToggleVisibility(item)}
                              title={
                                item.visibility === 'client'
                                  ? 'Restreindre en interne'
                                  : 'Partager avec le client'
                              }
                              aria-label={
                                item.visibility === 'client'
                                  ? 'Restreindre en interne'
                                  : 'Partager avec le client'
                              }
                              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                item.visibility === 'internal'
                                  ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                  : 'text-slate-400 hover:text-orange-700 hover:bg-orange-50'
                              }`}
                            >
                              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            {confirmDeleteKey === item.uidKey ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteDoc(item)}
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                                >
                                  Supprimer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(null)}
                                  className="px-1.5 py-1 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(item.uidKey)}
                                aria-label={`Supprimer ${item.title}`}
                                title="Supprimer"
                                className="p-1.5 text-slate-400 hover:text-red-700 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-doc-viewer-title"
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
                  {previewDoc.docType}
                  {previewDoc.referenceNumber ? ` · ${previewDoc.referenceNumber}` : ''} ·{' '}
                  {previewDoc.clientName}
                </p>
                <h3
                  id="admin-doc-viewer-title"
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
                    <span>Télécharger</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  aria-label="Fermer l’aperçu"
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
                  Aperçu indisponible pour ce document.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
