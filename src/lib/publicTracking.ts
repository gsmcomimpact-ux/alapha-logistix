import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { FIELD_LIMITS, ShipmentStatus } from '../types/logistics';

export type PositionSource = 'confirmed' | 'estimated' | 'manual';

export const POSITION_SOURCES: PositionSource[] = ['confirmed', 'estimated', 'manual'];

export const POSITION_SOURCE_LABELS: Record<PositionSource, { fr: string; en: string }> = {
  confirmed: { fr: 'Confirmée', en: 'Confirmed' },
  estimated: { fr: 'Estimée', en: 'Estimated' },
  manual: { fr: 'Communiquée manuellement', en: 'Manually reported' },
};

/** Whitelisted, non-sensitive subset of a shipment, readable without authentication. */
export interface PublicTrackingRecord {
  trackingCode: string;
  transportMode: string;
  origin: string;
  destination: string;
  currentLocation: string;
  currentStatus: ShipmentStatus;
  estimatedArrival: string;
  positionSource: PositionSource;
  updatedAt?: Timestamp | null;
}

export function normalizeTrackingCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidTrackingCode(code: string): boolean {
  return code.length >= 3 && code.length <= 64 && FIELD_LIMITS.trackingCodePattern.test(code);
}

/**
 * Best-effort mirror of a shipment to the public collection. Never throws: the admin
 * operation it follows must not fail because the public mirror could not be written.
 */
export async function syncPublicTracking(
  data: Omit<PublicTrackingRecord, 'updatedAt'>
): Promise<boolean> {
  try {
    await setDoc(doc(db, 'publicTracking', data.trackingCode), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('publicTracking sync failed', error);
    return false;
  }
}

export async function fetchPublicTracking(code: string): Promise<PublicTrackingRecord | null> {
  const snap = await getDoc(doc(db, 'publicTracking', code));
  return snap.exists() ? (snap.data() as PublicTrackingRecord) : null;
}
