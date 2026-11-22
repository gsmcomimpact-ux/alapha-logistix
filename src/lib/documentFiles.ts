import { LocaleCode } from '../i18n';
import { DocMimeType, FIELD_LIMITS, ShipmentDocType } from '../types/logistics';

export const ALLOWED_FILE_MIMES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function formatFileSize(bytes: number, locale: LocaleCode, externalLabel: string): string {
  if (!bytes || bytes <= 0) return externalLabel;
  if (locale === 'en') {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('File read failed'));
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageIfNeeded(
  file: File
): Promise<{ dataUrl: string; mimeType: DocMimeType; byteSize: number } | null> {
  const rawUrl = await readFileAsDataUrl(file);
  const baseMime = file.type as DocMimeType;
  if (file.size <= FIELD_LIMITS.docMaxRawBytes && rawUrl.length <= FIELD_LIMITS.docFileDataMax) {
    return { dataUrl: rawUrl, mimeType: baseMime, byteSize: file.size };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1650;
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const qualities = [0.82, 0.68, 0.54, 0.42];
      for (const q of qualities) {
        const compressed = canvas.toDataURL('image/jpeg', q);
        const estimatedBytes = Math.round(((compressed.length - compressed.indexOf(',') - 1) * 3) / 4);
        if (
          compressed.length <= FIELD_LIMITS.docFileDataMax &&
          estimatedBytes <= FIELD_LIMITS.docMaxRawBytes
        ) {
          resolve({
            dataUrl: compressed,
            mimeType: 'image/jpeg',
            byteSize: estimatedBytes,
          });
          return;
        }
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = rawUrl;
  });
}

export type ProcessDocumentResult =
  | {
      ok: true;
      fileName: string;
      mimeType: DocMimeType;
      fileSize: number;
      fileData: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function processDocumentFile(
  file: File,
  locale: LocaleCode,
  externalLabel: string
): Promise<ProcessDocumentResult> {
  if (!ALLOWED_FILE_MIMES.has(file.type)) {
    return {
      ok: false,
      error:
        locale === 'en'
          ? 'Unsupported format. Please use a PDF, JPEG, PNG, or WebP file (or an HTTPS link).'
          : 'Format non pris en charge. Utilisez un fichier PDF, JPEG, PNG ou WebP (ou un lien HTTPS).',
    };
  }

  try {
    if (file.type === 'application/pdf') {
      if (file.size > FIELD_LIMITS.docMaxRawBytes) {
        return {
          ok: false,
          error:
            locale === 'en'
              ? `PDF "${file.name}" (${formatFileSize(file.size, locale, externalLabel)}) exceeds the 512 KB direct upload limit. Compress it or use an HTTPS link.`
              : `Le PDF « ${file.name} » (${formatFileSize(file.size, locale, externalLabel)}) dépasse la limite directe de 512 Ko. Compressez-le ou utilisez un lien HTTPS.`,
        };
      }
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > FIELD_LIMITS.docFileDataMax) {
        return {
          ok: false,
          error:
            locale === 'en'
              ? `Encoded PDF "${file.name}" exceeds maximum allowed capacity. Use a smaller file or HTTPS link.`
              : `Le PDF encodé « ${file.name} » dépasse la capacité maximale autorisée. Utilisez un fichier plus léger ou un lien HTTPS.`,
        };
      }
      return {
        ok: true,
        fileName: file.name.slice(0, FIELD_LIMITS.docFileNameMax),
        mimeType: 'application/pdf',
        fileSize: file.size,
        fileData: dataUrl,
      };
    }

    const processed = await compressImageIfNeeded(file);
    if (!processed) {
      return {
        ok: false,
        error:
          locale === 'en'
            ? `Image "${file.name}" is too large even after compression. Reduce its resolution or use an HTTPS link.`
            : `L’image « ${file.name} » reste trop volumineuse après compression. Réduisez la résolution ou utilisez un lien HTTPS.`,
      };
    }

    return {
      ok: true,
      fileName: file.name.slice(0, FIELD_LIMITS.docFileNameMax),
      mimeType: processed.mimeType,
      fileSize: processed.byteSize,
      fileData: processed.dataUrl,
    };
  } catch {
    return {
      ok: false,
      error:
        locale === 'en'
          ? `Unable to read file "${file.name}".`
          : `Impossible de lire le fichier « ${file.name} ».`,
    };
  }
}

export function inferDocTypeFromFilename(
  fileName: string,
  fallback: ShipmentDocType = 'Facture commerciale'
): ShipmentDocType {
  const lower = fileName.toLowerCase();
  if (/(\b|_|-)(bl|b_l|b-l|bill.?of.?lading|connaissement)(\b|_|-|\.)/.test(lower)) {
    return 'Bill of Lading';
  }
  if (/(awb|lta|air.?waybill|waybill)/.test(lower)) {
    return 'Air Waybill';
  }
  if (/(pack|colisage|packing.?list)/.test(lower)) {
    return 'Packing list';
  }
  if (/(douan|custom|declar|bsc|bordereau|d3|exo|certif)/.test(lower)) {
    return 'Documents douaniers';
  }
  if (/(pod|livraison|delivery|decharge|recu|proof)/.test(lower)) {
    return 'Preuve de livraison';
  }
  if (/(fact|invoice|inv|proforma)/.test(lower)) {
    return 'Facture commerciale';
  }
  return fallback;
}

export function deriveTitleFromFilename(fileName: string, fallback: string): string {
  const stripped = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const title = stripped || fallback;
  return title.slice(0, FIELD_LIMITS.docTitleMax);
}
