import { Timestamp } from 'firebase/firestore';

export type ServiceCategory =
  | 'Fret maritime'
  | 'Fret aérien'
  | 'Corridor routier'
  | 'Dédouanement & Entreposage';

export interface QuotePrefill {
  service: ServiceCategory;
  summary: string;
  origin?: string;
  destination?: string;
}

export type ShipmentStatus =
  | 'Pris en charge'
  | 'En transit maritime'
  | 'En transit aérien'
  | 'Arrivé au port / hub'
  | 'En dédouanement'
  | 'En route corridor'
  | 'Livré';

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'Pris en charge',
  'En transit maritime',
  'En transit aérien',
  'Arrivé au port / hub',
  'En dédouanement',
  'En route corridor',
  'Livré',
];

export const TRANSPORT_MODES: ServiceCategory[] = [
  'Fret maritime',
  'Fret aérien',
  'Corridor routier',
  'Dédouanement & Entreposage',
];

export type ClientAccountStatus = 'pending' | 'validated' | 'rejected';

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  role: 'client';
  accountStatus?: ClientAccountStatus;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ClientRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  address: string;
  notes: string;
  createdBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type StaffRole = 'admin' | 'operator';

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  role: StaffRole;
  active: boolean;
  addedBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ShipmentRecord {
  id: string;
  trackingCode: string;
  clientUid: string;
  clientEmail: string;
  clientName: string;
  transportMode: ServiceCategory;
  origin: string;
  destination: string;
  cargoDescription: string;
  weightOrVolume: string;
  currentLocation: string;
  currentStatus: ShipmentStatus;
  estimatedArrival: string;
  updatesCount: number;
  createdBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface TrackingEventRecord {
  id?: string;
  shipmentId: string;
  clientUid: string;
  clientEmail: string;
  location: string;
  status: ShipmentStatus;
  notes: string;
  recordedBy: string;
  recordedByEmail: string;
  createdAt?: Timestamp | null;
}

export type ShipmentDocType =
  | 'Bill of Lading'
  | 'Air Waybill'
  | 'Packing list'
  | 'Facture commerciale'
  | 'Documents douaniers'
  | 'Preuve de livraison';

export const SHIPMENT_DOC_TYPES: ShipmentDocType[] = [
  'Bill of Lading',
  'Air Waybill',
  'Packing list',
  'Facture commerciale',
  'Documents douaniers',
  'Preuve de livraison',
];

export const CLIENT_UPLOADABLE_DOC_TYPES: ShipmentDocType[] = [
  'Packing list',
  'Facture commerciale',
];

export type DocVisibility = 'client' | 'internal';
export type DocMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'text/url';
export type DocUploaderRole = 'admin' | 'operator' | 'client';

export interface ShipmentDocumentRecord {
  id: string;
  shipmentId: string;
  clientUid: string;
  clientEmail: string;
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
  uploadedByRole: DocUploaderRole;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ClientDocumentRecord {
  id: string;
  clientUid: string;
  clientEmail: string;
  clientName: string;
  shipmentId: string;
  trackingCode: string;
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
  uploadedByRole: DocUploaderRole;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type QuoteStatus =
  | 'En attente'
  | "À l'étude"
  | 'Devis envoyé'
  | 'Acceptée'
  | 'Archivée';

export const QUOTE_STATUSES: QuoteStatus[] = [
  'En attente',
  "À l'étude",
  'Devis envoyé',
  'Acceptée',
  'Archivée',
];

export interface QuoteRequestRecord {
  id: string;
  quoteCode: string;
  clientUid: string;
  clientEmail: string;
  clientName: string;
  company: string;
  phone: string;
  transportMode: ServiceCategory;
  origin: string;
  destination: string;
  message: string;
  status: QuoteStatus;
  estimatedAmount: string;
  adminResponse: string;
  createdBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type NotificationCategory = 'position' | 'document' | 'status' | 'quote';

export interface ClientNotificationRecord {
  id: string;
  clientUid: string;
  clientEmail: string;
  shipmentId: string;
  trackingCode: string;
  category: NotificationCategory;
  title: string;
  message: string;
  read: boolean;
  createdBy: string;
  createdAt?: Timestamp | null;
}

export function emailToStaffId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export const FIELD_LIMITS = {
  trackingCodePattern: /^[A-Z0-9-]+$/,
  idPattern: /^[a-zA-Z0-9_-]+$/,
  fullNameMax: 100,
  companyMax: 120,
  phoneMax: 30,
  cityMax: 80,
  addressMax: 200,
  departmentMax: 80,
  emailMax: 150,
  staffEmailMax: 120,
  originDestMax: 120,
  cargoDescriptionMax: 300,
  weightOrVolumeMax: 80,
  locationMax: 150,
  etaMax: 40,
  notesMax: 500,
  docTitleMax: 120,
  docRefMax: 60,
  docFileNameMax: 160,
  docNotesMax: 300,
  docFileDataMax: 750000,
  docMaxRawBytes: 524288,
  docUrlMax: 500,
  quoteMessageMax: 1000,
  quoteAmountMax: 80,
  quoteResponseMax: 600,
  notifTitleMax: 140,
  notifMessageMax: 400,
} as const;
