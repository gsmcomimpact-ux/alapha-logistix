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
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  dataUrlToBlob,
  deriveTitleFromFilename,
  formatFileSize,
  inferDocTypeFromFilename,
  processDocumentFile,
} from '../lib/documentFiles';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CLIENT_UPLOADABLE_DOC_TYPES,
  DocMimeType,
  DocVisibility,
  FIELD_LIMITS,
  SHIPMENT_DOC_TYPES,
  ShipmentDocType,
  ShipmentDocumentRecord,
  ShipmentRecord,
} from '../types/logistics';

interface ShipmentDocumentsPanelProps {
  shipment: ShipmentRecord;
  mode: 'admin' | 'client';
}

type DepositSourceMode = 'file' | 'url';

interface QueuedBatchFile {
  localId: string;
  docType: ShipmentDocType;
  title: string;
  referenceNumber: string;
  visibility: DocVisibility;
  fileName: string;
  mimeType: DocMimeType;
  fileSize: number;
  fileData: string;
  notes: string;
  fileError?: string;
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

export function ShipmentDocumentsPanel({ shipment, mode }: ShipmentDocumentsPanelProps) {
  const { user, staffRole } = useAuth();
  const { locale, localeConfig, t } = useLanguage();

  const [documents, setDocuments] = useState<ShipmentDocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | ShipmentDocType>('ALL');

  // Deposit Form State (single item)
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [docType, setDocType] = useState<ShipmentDocType>(
    mode === 'admin' ? 'Bill of Lading' : 'Packing list'
  );
  const [title, setTitle] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [visibility, setVisibility] = useState<DocVisibility>('client');
  const [sourceMode, setSourceMode] = useState<DepositSourceMode>('file');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedMimeType, setSelectedMimeType] = useState<DocMimeType>('application/pdf');
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [selectedFileData, setSelectedFileData] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [notes, setNotes] = useState('');

  // Multi-file Batch Queue (Admin only)
  const [batchQueue, setBatchQueue] = useState<QueuedBatchFile[]>([]);
  const [processingFile, setProcessingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Confirm delete + Preview modal state
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [togglingVisId, setTogglingVisId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ShipmentDocumentRecord | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const emailLower = (user?.email || '').toLowerCase();
  const allowedDepositTypes =
    mode === 'admin' ? SHIPMENT_DOC_TYPES : CLIENT_UPLOADABLE_DOC_TYPES;

  useEffect(() => {
    setShowUploadForm(false);
    setBatchQueue([]);
    setFeedback(null);
    setConfirmDeleteDocId(null);
    setPreviewDoc(null);
  }, [shipment.id]);

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
    const objectUrl = URL.createObjectURL(blob);
    setPreviewBlobUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
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

  useEffect(() => {
    if (!user || !shipment.id) {
      setDocuments([]);
      setLoadingDocs(false);
      return;
    }
    if (mode === 'client' && !emailLower) {
      setDocuments([]);
      setLoadingDocs(false);
      return;
    }

    setLoadingDocs(true);
    const path = `shipments/${shipment.id}/documents`;
    const docsQuery =
      mode === 'admin'
        ? query(collection(db, 'shipments', shipment.id, 'documents'), orderBy('createdAt', 'desc'))
        : user.emailVerified
          ? query(
              collection(db, 'shipments', shipment.id, 'documents'),
              where('clientEmail', '==', emailLower),
              where('visibility', '==', 'client')
            )
          : query(
              collection(db, 'shipments', shipment.id, 'documents'),
              where('clientUid', '==', user.uid),
              where('visibility', '==', 'client')
            );

    const unsubscribe = onSnapshot(
      docsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as ShipmentDocumentRecord),
          id: docSnap.id,
        }));
        if (mode === 'client') {
          list.sort((a, b) => {
            const tA = a.createdAt?.toMillis?.() ?? 0;
            const tB = b.createdAt?.toMillis?.() ?? 0;
            return tB - tA;
          });
        }
        setDocuments(list);
        setLoadingDocs(false);
      },
      (error) => {
        setLoadingDocs(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [user, shipment.id, mode, emailLower]);

  const filteredDocuments = useMemo(() => {
    if (docTypeFilter === 'ALL') return documents;
    return documents.filter((d) => d.docType === docTypeFilter);
  }, [documents, docTypeFilter]);

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setFeedback(null);
    if (files.length === 0) return;

    setProcessingFile(true);
    try {
      // Multi-file batch mode when admin picks 2+ files or already has a batch queue active
      if (mode === 'admin' && (files.length > 1 || batchQueue.length > 0)) {
        const nextQueue: QueuedBatchFile[] = [...batchQueue];

        // Preserve already-selected single file if switching to batch mode
        if (nextQueue.length === 0 && selectedFileData && selectedFileName) {
          nextQueue.push({
            localId: `q-${Date.now()}-init`,
            docType,
            title: title.trim() || deriveTitleFromFilename(selectedFileName, docType),
            referenceNumber: referenceNumber.trim(),
            visibility,
            fileName: selectedFileName,
            mimeType: selectedMimeType,
            fileSize: selectedFileSize,
            fileData: selectedFileData,
            notes: notes.trim(),
          });
        }

        for (let i = 0; i < files.length; i += 1) {
          const f = files[i];
          const res = await processDocumentFile(f, locale, t.common.externalLink);
          const guessedType = inferDocTypeFromFilename(f.name, docType);
          nextQueue.push({
            localId: `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            docType: guessedType,
            title: deriveTitleFromFilename(f.name, t.docTypeLabels[guessedType] || guessedType),
            referenceNumber: '',
            visibility,
            fileName: f.name.slice(0, FIELD_LIMITS.docFileNameMax),
            mimeType: res.ok ? res.mimeType : 'application/pdf',
            fileSize: res.ok ? res.fileSize : 0,
            fileData: res.ok ? res.fileData : '',
            notes: '',
            fileError: res.ok ? undefined : res.error,
          });
        }
        setBatchQueue(nextQueue);
        event.target.value = '';
        return;
      }

      // Single-file selection
      const file = files[0];
      const result = await processDocumentFile(file, locale, t.common.externalLink);
      if (!result.ok) {
        setFeedback({ type: 'err', text: result.error });
        setSelectedFileData('');
        setSelectedFileName('');
        setSelectedFileSize(0);
        event.target.value = '';
        return;
      }

      setSelectedFileName(result.fileName);
      setSelectedMimeType(result.mimeType);
      setSelectedFileSize(result.fileSize);
      setSelectedFileData(result.fileData);

      if (mode === 'admin') {
        const guessed = inferDocTypeFromFilename(file.name, docType);
        setDocType(guessed);
      }

      if (!title.trim()) {
        setTitle(deriveTitleFromFilename(file.name, t.docTypeLabels[docType]));
      }
    } finally {
      setProcessingFile(false);
    }
  };

  const resetFormFields = () => {
    setTitle('');
    setReferenceNumber('');
    setSelectedFileName('');
    setSelectedMimeType('application/pdf');
    setSelectedFileSize(0);
    setSelectedFileData('');
    setExternalUrl('');
    setNotes('');
    setVisibility('client');
    setBatchQueue([]);
  };

  const updateBatchItem = (localId: string, patch: Partial<QueuedBatchFile>) => {
    setBatchQueue((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
    );
  };

  const removeBatchItem = (localId: string) => {
    setBatchQueue((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !user.email) return;
    setFeedback(null);

    const resolvedRole =
      mode === 'admin' ? (staffRole === 'admin' ? 'admin' : 'operator') : 'client';
    const cleanClientEmail = shipment.clientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const uploaderEmail = user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax);

    // Multi-file Admin Batch Submit
    if (mode === 'admin' && batchQueue.length > 0) {
      const invalidItem = batchQueue.find((item) => !item.fileData || item.fileSize <= 0 || item.fileError);
      if (invalidItem) {
        setFeedback({
          type: 'err',
          text:
            locale === 'en'
              ? `The file “${invalidItem.fileName}” is invalid or too large. Please remove it before saving.`
              : `Le fichier « ${invalidItem.fileName} » est invalide ou trop volumineux. Retirez-le avant d’enregistrer.`,
        });
        return;
      }

      setUploading(true);
      let savedCount = 0;
      try {
        for (let i = 0; i < batchQueue.length; i += 1) {
          const item = batchQueue[i];
          const docId = `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
          const cleanTitle = (item.title.trim() || item.docType).slice(0, FIELD_LIMITS.docTitleMax);
          const cleanRef = item.referenceNumber.trim().slice(0, FIELD_LIMITS.docRefMax);
          const cleanNotes = item.notes.trim().slice(0, FIELD_LIMITS.docNotesMax);
          const path = `shipments/${shipment.id}/documents/${docId}`;

          try {
            const batch = writeBatch(db);
            batch.set(doc(db, 'shipments', shipment.id, 'documents', docId), {
              id: docId,
              shipmentId: shipment.id,
              clientUid: shipment.clientUid || '',
              clientEmail: cleanClientEmail,
              docType: item.docType,
              title: cleanTitle,
              referenceNumber: cleanRef,
              fileName: item.fileName.slice(0, FIELD_LIMITS.docFileNameMax),
              mimeType: item.mimeType,
              fileSize: item.fileSize,
              fileData: item.fileData,
              externalUrl: '',
              visibility: item.visibility,
              notes: cleanNotes,
              uploadedBy: user.uid,
              uploadedByEmail: uploaderEmail,
              uploadedByRole: resolvedRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            if (item.visibility === 'client') {
              const notifId = `notif-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
              batch.set(doc(db, 'notifications', notifId), {
                id: notifId,
                clientUid: shipment.clientUid || '',
                clientEmail: cleanClientEmail,
                shipmentId: shipment.id,
                trackingCode: shipment.trackingCode,
                category: 'document',
                title: `Nouveau document · ${shipment.trackingCode}`.slice(
                  0,
                  FIELD_LIMITS.notifTitleMax
                ),
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
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, path);
            return;
          }
        }

        resetFormFields();
        setShowUploadForm(false);
        setFeedback({
          type: 'ok',
          text:
            locale === 'en'
              ? `${savedCount} document(s) uploaded successfully to shipment ${shipment.trackingCode}.`
              : `${savedCount} document(s) déposé(s) avec succès sur le dossier ${shipment.trackingCode}.`,
        });
      } finally {
        setUploading(false);
      }
      return;
    }

    // Single Document Submit
    const cleanTitle = (title.trim() || docType).slice(0, FIELD_LIMITS.docTitleMax);
    const cleanRef = referenceNumber.trim().slice(0, FIELD_LIMITS.docRefMax);
    const cleanNotes = notes.trim().slice(0, FIELD_LIMITS.docNotesMax);
    const cleanUrl = externalUrl.trim().slice(0, FIELD_LIMITS.docUrlMax);

    if (cleanTitle.length < 2) {
      setFeedback({
        type: 'err',
        text:
          locale === 'en'
            ? 'Please enter a document title (minimum 2 characters).'
            : 'Veuillez saisir un intitulé de document (2 caractères minimum).',
      });
      return;
    }

    if (mode === 'client' && !CLIENT_UPLOADABLE_DOC_TYPES.includes(docType)) {
      setFeedback({
        type: 'err',
        text:
          locale === 'en'
            ? 'Client accounts may only upload Packing lists and Commercial invoices.'
            : 'Vos droits client autorisent uniquement le dépôt de Packing lists et Factures commerciales.',
      });
      return;
    }

    if (sourceMode === 'file') {
      if (!selectedFileData || selectedFileSize <= 0) {
        setFeedback({
          type: 'err',
          text:
            locale === 'en'
              ? 'Please select a PDF or image file to upload.'
              : 'Veuillez sélectionner un fichier PDF ou image à déposer.',
        });
        return;
      }
    } else {
      if (!cleanUrl.startsWith('https://') || cleanUrl.length < 12) {
        setFeedback({
          type: 'err',
          text:
            locale === 'en'
              ? 'Please enter a secure URL starting with https://'
              : 'Veuillez saisir une URL sécurisée commençant par https://',
        });
        return;
      }
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `shipments/${shipment.id}/documents/${docId}`;
    const resolvedVisibility: DocVisibility = mode === 'admin' ? visibility : 'client';

    setUploading(true);
    try {
      const batch = writeBatch(db);

      batch.set(doc(db, 'shipments', shipment.id, 'documents', docId), {
        id: docId,
        shipmentId: shipment.id,
        clientUid: shipment.clientUid || '',
        clientEmail: cleanClientEmail,
        docType,
        title: cleanTitle,
        referenceNumber: cleanRef,
        fileName:
          sourceMode === 'file'
            ? selectedFileName.slice(0, FIELD_LIMITS.docFileNameMax)
            : 'Lien sécurisé',
        mimeType: sourceMode === 'file' ? selectedMimeType : 'text/url',
        fileSize: sourceMode === 'file' ? selectedFileSize : 0,
        fileData: sourceMode === 'file' ? selectedFileData : '',
        externalUrl: sourceMode === 'url' ? cleanUrl : '',
        visibility: resolvedVisibility,
        notes: cleanNotes,
        uploadedBy: user.uid,
        uploadedByEmail: uploaderEmail,
        uploadedByRole: resolvedRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (mode === 'admin' && resolvedVisibility === 'client') {
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        batch.set(doc(db, 'notifications', notifId), {
          id: notifId,
          clientUid: shipment.clientUid || '',
          clientEmail: cleanClientEmail,
          shipmentId: shipment.id,
          trackingCode: shipment.trackingCode,
          category: 'document',
          title: `Nouveau document · ${shipment.trackingCode}`.slice(0, FIELD_LIMITS.notifTitleMax),
          message: `${docType} : ${cleanTitle}${cleanRef ? ` (Réf. ${cleanRef})` : ''}`.slice(
            0,
            FIELD_LIMITS.notifMessageMax
          ),
          read: false,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      resetFormFields();
      setShowUploadForm(false);
      setFeedback({
        type: 'ok',
        text:
          locale === 'en'
            ? `Document “${cleanTitle}” (${t.docTypeLabels[docType]}) uploaded successfully.`
            : `Document « ${cleanTitle} » (${t.docTypeLabels[docType]}) déposé avec succès.`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleVisibility = async (record: ShipmentDocumentRecord) => {
    if (mode !== 'admin' || !user) return;
    const nextVisibility: DocVisibility = record.visibility === 'client' ? 'internal' : 'client';
    setTogglingVisId(record.id);
    const path = `shipments/${shipment.id}/documents/${record.id}`;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'shipments', shipment.id, 'documents', record.id), {
        visibility: nextVisibility,
        updatedAt: serverTimestamp(),
      });

      if (nextVisibility === 'client') {
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        batch.set(doc(db, 'notifications', notifId), {
          id: notifId,
          clientUid: shipment.clientUid || '',
          clientEmail: shipment.clientEmail.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax),
          shipmentId: shipment.id,
          trackingCode: shipment.trackingCode,
          category: 'document',
          title: `Document partagé · ${shipment.trackingCode}`.slice(0, FIELD_LIMITS.notifTitleMax),
          message: `${record.docType} : ${record.title} est désormais disponible au téléchargement.`.slice(
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
      setTogglingVisId(null);
    }
  };

  const handleDeleteDocument = async (record: ShipmentDocumentRecord) => {
    const path = `shipments/${shipment.id}/documents/${record.id}`;
    try {
      await deleteDoc(doc(db, 'shipments', shipment.id, 'documents', record.id));
      setConfirmDeleteDocId(null);
      if (previewDoc?.id === record.id) {
        setPreviewDoc(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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

  const docCopy = t.clientSpace.documents;
  const isBatchMode = mode === 'admin' && batchQueue.length > 0;

  return (
    <div className="mt-6 pt-5 border-t border-slate-200">
      {/* Section Header & Deposit Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
            <span>
              {docCopy.sectionTitle} ({documents.length})
            </span>
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {mode === 'admin' ? docCopy.sectionDescAdmin : docCopy.sectionDescClient}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowUploadForm((v) => !v);
            setFeedback(null);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
        >
          {showUploadForm ? (
            <>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{docCopy.closeBtn}</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {mode === 'admin'
                  ? locale === 'en'
                    ? 'Upload document(s)'
                    : 'Déposer document(s)'
                  : docCopy.depositBtn}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`mt-3 p-3 rounded-lg border text-xs flex items-start gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Collapsible Upload Form */}
      {showUploadForm && (
        <form
          onSubmit={handleUploadSubmit}
          noValidate
          className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900">
              {docCopy.formTitle} · {shipment.trackingCode}
            </p>
            <span className="text-[11px] font-medium text-slate-500">
              {mode === 'admin' ? docCopy.roleAdmin : docCopy.roleClient}
            </span>
          </div>

          {!isBatchMode && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`doc-type-${shipment.id}`}
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {docCopy.docTypeLabel}
                  </label>
                  <select
                    id={`doc-type-${shipment.id}`}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as ShipmentDocType)}
                    className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  >
                    {allowedDepositTypes.map((typeOption) => (
                      <option key={typeOption} value={typeOption}>
                        {t.docTypeLabels[typeOption]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`doc-ref-${shipment.id}`}
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {docCopy.refLabel}
                  </label>
                  <input
                    id={`doc-ref-${shipment.id}`}
                    type="text"
                    maxLength={FIELD_LIMITS.docRefMax}
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={docCopy.refPlaceholder}
                    className="w-full min-h-[38px] px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>

              <div className={mode === 'admin' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                <div>
                  <label
                    htmlFor={`doc-title-${shipment.id}`}
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {docCopy.titleLabel}
                  </label>
                  <input
                    id={`doc-title-${shipment.id}`}
                    type="text"
                    maxLength={FIELD_LIMITS.docTitleMax}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`Ex. ${t.docTypeLabels[docType]} — ${shipment.trackingCode}`}
                    className="w-full min-h-[38px] px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  />
                </div>

                {mode === 'admin' && (
                  <div>
                    <label
                      htmlFor={`doc-visibility-${shipment.id}`}
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {docCopy.visibilityLabel}
                    </label>
                    <select
                      id={`doc-visibility-${shipment.id}`}
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as DocVisibility)}
                      className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    >
                      <option value="client">{docCopy.visibilityClient}</option>
                      <option value="internal">{docCopy.visibilityInternal}</option>
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Deposit Method Selector */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-medium text-slate-700">
                {mode === 'admin'
                  ? locale === 'en'
                    ? 'File(s) or secure link (multi-selection supported)'
                    : 'Fichier(s) ou lien sécurisé (sélection multiple autorisée)'
                  : docCopy.sourceLabel}
              </span>
              {!isBatchMode && (
                <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-md">
                  <button
                    type="button"
                    onClick={() => setSourceMode('file')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                      sourceMode === 'file'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-3 h-3" aria-hidden="true" />
                    <span>{docCopy.sourceFile}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('url')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                      sourceMode === 'url'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Link2 className="w-3 h-3" aria-hidden="true" />
                    <span>{docCopy.sourceUrl}</span>
                  </button>
                </div>
              )}
            </div>

            {sourceMode === 'file' || isBatchMode ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-lg p-3">
                <input
                  id={`doc-file-${shipment.id}`}
                  type="file"
                  multiple={mode === 'admin'}
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => void handleFileSelected(e)}
                  className="block w-full text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                />
                {!isBatchMode && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {processingFile
                      ? docCopy.processingFile
                      : selectedFileName
                      ? `${docCopy.readyPrefix} ${selectedFileName} (${formatFileSize(selectedFileSize, locale, t.common.externalLink)})`
                      : docCopy.fileHint}
                  </p>
                )}
              </div>
            ) : (
              <input
                id={`doc-url-${shipment.id}`}
                type="url"
                maxLength={FIELD_LIMITS.docUrlMax}
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder={docCopy.urlPlaceholder}
                className="w-full min-h-[38px] px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            )}
          </div>

          {/* Admin Multi-file Queue Preview */}
          {isBatchMode && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-900">
                  {locale === 'en'
                    ? `Batch ready for this shipment (${batchQueue.length} files)`
                    : `Lot prêt pour ce dossier (${batchQueue.length} fichiers)`}
                </p>
                <button
                  type="button"
                  onClick={() => setBatchQueue([])}
                  className="text-[11px] font-medium text-slate-500 hover:text-red-700 cursor-pointer"
                >
                  {locale === 'en' ? 'Switch back to single file' : 'Revenir à un fichier unique'}
                </button>
              </div>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                {batchQueue.map((item) => (
                  <div key={item.localId} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-700 truncate">
                        {item.fileName}{' '}
                        <span className="text-slate-400">
                          ({formatFileSize(item.fileSize, locale, t.common.externalLink)})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeBatchItem(item.localId)}
                        aria-label={`${locale === 'en' ? 'Remove' : 'Retirer'} ${item.fileName}`}
                        className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    {item.fileError ? (
                      <p className="text-[11px] font-medium text-red-700">{item.fileError}</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          aria-label={docCopy.docTypeLabel}
                          value={item.docType}
                          onChange={(e) =>
                            updateBatchItem(item.localId, {
                              docType: e.target.value as ShipmentDocType,
                            })
                          }
                          className="min-h-[34px] px-2 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                        >
                          {SHIPMENT_DOC_TYPES.map((typeOpt) => (
                            <option key={typeOpt} value={typeOpt}>
                              {t.docTypeLabels[typeOpt] || typeOpt}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          maxLength={FIELD_LIMITS.docTitleMax}
                          value={item.title}
                          onChange={(e) =>
                            updateBatchItem(item.localId, { title: e.target.value })
                          }
                          placeholder={docCopy.titleLabel}
                          className="min-h-[34px] px-2 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                        />
                        <select
                          aria-label={docCopy.visibilityLabel}
                          value={item.visibility}
                          onChange={(e) =>
                            updateBatchItem(item.localId, {
                              visibility: e.target.value as DocVisibility,
                            })
                          }
                          className="min-h-[34px] px-2 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-md"
                        >
                          <option value="client">{docCopy.sharedClient}</option>
                          <option value="internal">{docCopy.internalOnly}</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isBatchMode && (
            <div>
              <label
                htmlFor={`doc-notes-${shipment.id}`}
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {docCopy.notesLabel}
              </label>
              <input
                id={`doc-notes-${shipment.id}`}
                type="text"
                maxLength={FIELD_LIMITS.docNotesMax}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={docCopy.notesPlaceholder}
                className="w-full min-h-[38px] px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
          )}

          {mode === 'client' && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {docCopy.clientDepositHint}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowUploadForm(false);
                resetFormFields();
              }}
              className="px-3 py-1.5 text-xs font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg cursor-pointer min-h-[36px]"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={uploading || processingFile}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[36px]"
            >
              {uploading
                ? docCopy.savingDocBtn
                : isBatchMode
                ? locale === 'en'
                  ? `Save all ${batchQueue.length} documents`
                  : `Enregistrer les ${batchQueue.length} documents`
                : docCopy.saveDocBtn}
            </button>
          </div>
        </form>
      )}

      {/* Filter Strip (shown when >= 2 docs) */}
      {documents.length > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <label htmlFor={`filter-doc-${shipment.id}`} className="text-[11px] text-slate-500">
            {docCopy.filterByCat}
          </label>
          <select
            id={`filter-doc-${shipment.id}`}
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value as 'ALL' | ShipmentDocType)}
            className="min-h-[32px] px-2.5 py-1 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          >
            <option value="ALL">
              {docCopy.allTypes} ({documents.length})
            </option>
            {SHIPMENT_DOC_TYPES.map((typeOption) => {
              const count = documents.filter((d) => d.docType === typeOption).length;
              if (count === 0) return null;
              return (
                <option key={typeOption} value={typeOption}>
                  {t.docTypeLabels[typeOption]} ({count})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Documents List */}
      <div className="mt-3">
        {loadingDocs ? (
          <div className="space-y-2">
            <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="py-5 px-4 rounded-lg bg-slate-50 border border-slate-200 text-center">
            <p className="text-xs text-slate-500">
              {documents.length === 0 ? docCopy.emptyShipmentDocs : docCopy.emptyCategoryDocs}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {filteredDocuments.map((docItem) => {
              const isImage = docItem.mimeType.startsWith('image/');
              const isExternal = docItem.mimeType === 'text/url';
              const canDelete =
                mode === 'admin' ||
                (Boolean(user?.uid) &&
                  docItem.uploadedBy === user?.uid &&
                  docItem.uploadedByRole === 'client');

              return (
                <li key={docItem.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 text-orange-600 shrink-0">
                        {isImage ? (
                          <ImageIcon className="w-4 h-4" aria-hidden="true" />
                        ) : isExternal ? (
                          <Link2 className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <FileText className="w-4 h-4" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {docItem.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          <span className="font-medium text-sky-700">
                            {t.docTypeLabels[docItem.docType] || docItem.docType}
                          </span>
                          {docItem.referenceNumber && (
                            <>
                              {' · '}
                              <span className="font-mono text-slate-800">
                                {docItem.referenceNumber}
                              </span>
                            </>
                          )}
                          {' · '}
                          <span className="tabular-nums">
                            {formatFileSize(docItem.fileSize, locale, t.common.externalLink)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          <span>
                            {formatDate(docItem.createdAt, localeConfig.intlLocale, t.common.justNow)}
                          </span>
                          {' · '}
                          <span>
                            {docItem.uploadedByRole === 'client'
                              ? docCopy.uploadedByClient
                              : docCopy.uploadedByAlpha}
                          </span>
                          {mode === 'admin' && (
                            <>
                              {' · '}
                              <span
                                className={
                                  docItem.visibility === 'client'
                                    ? 'font-semibold text-emerald-700'
                                    : 'font-semibold text-amber-700'
                                }
                              >
                                {docItem.visibility === 'client'
                                  ? docCopy.sharedClient
                                  : docCopy.internalOnly}
                              </span>
                            </>
                          )}
                        </p>
                        {docItem.notes && (
                          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
                            {docItem.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      {docItem.fileData ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(docItem)}
                            aria-label={`${t.common.consult} ${docItem.title}`}
                            title={t.common.consult}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.common.consult}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDirectDownload(docItem)}
                            aria-label={`${t.common.download} ${docItem.title}`}
                            title={t.common.download}
                            className="p-1.5 text-orange-700 hover:bg-orange-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      ) : docItem.externalUrl ? (
                        <a
                          href={docItem.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t.common.open}</span>
                        </a>
                      ) : null}

                      {mode === 'admin' && (
                        <button
                          type="button"
                          disabled={togglingVisId === docItem.id}
                          onClick={() => void handleToggleVisibility(docItem)}
                          title={
                            docItem.visibility === 'client'
                              ? docCopy.restrictInternal
                              : docCopy.shareWithClient
                          }
                          aria-label={
                            docItem.visibility === 'client'
                              ? docCopy.restrictInternal
                              : docCopy.shareWithClient
                          }
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            docItem.visibility === 'internal'
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'text-slate-400 hover:text-orange-700 hover:bg-orange-50'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}

                      {canDelete &&
                        (confirmDeleteDocId === docItem.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDeleteDocument(docItem)}
                              className="px-2 py-1 text-[11px] font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                            >
                              {t.common.delete}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDocId(null)}
                              className="px-1.5 py-1 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              {t.common.cancel}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDocId(docItem.id)}
                            aria-label={`${t.common.delete} ${docItem.title}`}
                            title={t.common.delete}
                            className="p-1.5 text-slate-400 hover:text-red-700 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* In-App Secure Document Viewer Modal */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-viewer-title"
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
                  {shipment.trackingCode}
                </p>
                <h3
                  id="doc-viewer-title"
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
                  {docCopy.previewUnavailable}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
