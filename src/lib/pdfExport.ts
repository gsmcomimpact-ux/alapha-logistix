import { Timestamp } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ShipmentRecord, TrackingEventRecord } from '../types/logistics';

export interface PdfClientRow {
  company: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  shipmentsCount: number;
  sourceLabel: string;
  createdAt?: Timestamp | null;
}

export interface DatePeriodOptions {
  dateFrom?: string;
  dateTo?: string;
  dateFieldLabel?: string;
}

function parseInputDateBoundary(value: string, endOfDay: boolean): number | null {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  const dt = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  return dt.getTime();
}

export function isDateRangeInvalid(dateFrom?: string, dateTo?: string): boolean {
  return Boolean(dateFrom && dateTo && dateFrom > dateTo);
}

export function isTimestampInPeriod(
  ts?: Timestamp | null,
  dateFrom?: string,
  dateTo?: string
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!ts) return false;

  try {
    const timeMs = ts.toDate().getTime();
    if (dateFrom) {
      const minMs = parseInputDateBoundary(dateFrom, false);
      if (minMs !== null && timeMs < minMs) return false;
    }
    if (dateTo) {
      const maxMs = parseInputDateBoundary(dateTo, true);
      if (maxMs !== null && timeMs > maxMs) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function formatInputDateFr(value: string): string {
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDatePeriodLabel(options?: DatePeriodOptions): string {
  const from = options?.dateFrom?.trim();
  const to = options?.dateTo?.trim();
  const fieldPrefix = options?.dateFieldLabel ? ` (${options.dateFieldLabel})` : '';

  if (from && to) {
    return `Période${fieldPrefix} : du ${formatInputDateFr(from)} au ${formatInputDateFr(to)}`;
  }
  if (from) {
    return `Période${fieldPrefix} : à partir du ${formatInputDateFr(from)}`;
  }
  if (to) {
    return `Période${fieldPrefix} : jusqu'au ${formatInputDateFr(to)}`;
  }
  return 'Période : toutes les dates';
}

function pdfText(value?: string | null): string {
  if (!value) return '-';
  return value
    .replace(/\u2192/g, '->')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');
}

function formatTs(ts?: Timestamp | null): string {
  if (!ts) return '-';
  try {
    return pdfText(
      ts.toDate().toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  } catch {
    return '-';
  }
}

function formatShortDate(ts?: Timestamp | null): string {
  if (!ts) return '-';
  try {
    return pdfText(
      ts.toDate().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    );
  } catch {
    return '-';
  }
}

function fileDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function filePeriodSuffix(options?: DatePeriodOptions): string {
  const from = options?.dateFrom?.trim();
  const to = options?.dateTo?.trim();
  if (from && to) return `${from}_au_${to}`;
  if (from) return `depuis_${from}`;
  if (to) return `jusquau_${to}`;
  return fileDateStamp();
}

function drawBrandedHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Slate 900 top header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ALPHA LOGISTIX GROUP', 14, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text(
    'Transit International · Chine & Dubaï -> Afrique de l\'Ouest | Tel: +227 89 99 44 53 | commercial@alphalogistixgroup.com',
    14,
    18.5
  );

  const exportDate = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setTextColor(203, 213, 225);
  doc.text(`Édité le ${exportDate}`, pageWidth - 14, 11.5, { align: 'right' });

  // Document title block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(pdfText(title), 14, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(pdfText(subtitle), 14, 42);
}

function drawPageFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Alpha Logistix Group — alphalogistixgroup.com',
      14,
      pageHeight - 8
    );
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }
}

export function exportShipmentsListPdf(
  shipments: ShipmentRecord[],
  period?: DatePeriodOptions
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const periodText = formatDatePeriodLabel(period);

  drawBrandedHeader(
    doc,
    'Rapport des Expéditions & Positions des Marchandises',
    `${shipments.length} dossier(s) exporté(s) · ${periodText}`
  );

  autoTable(doc, {
    startY: 48,
    head: [[
      'Code Suivi',
      'Client',
      'Mode & Trajet',
      'Marchandise',
      'Position Actuelle',
      'Statut',
      'ETA',
      'Créé le',
      'MAJ',
    ]],
    body: shipments.map((s) => [
      pdfText(s.trackingCode),
      pdfText(`${s.clientName}\n${s.clientEmail}`),
      pdfText(`${s.transportMode}\n${s.origin} -> ${s.destination}`),
      pdfText(`${s.cargoDescription}\n(${s.weightOrVolume})`),
      pdfText(s.currentLocation),
      pdfText(s.currentStatus),
      pdfText(s.estimatedArrival || '-'),
      formatShortDate(s.createdAt),
      formatTs(s.updatedAt),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 2.3,
      textColor: [15, 23, 42],
      valign: 'top',
    },
    headStyles: {
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });

  drawPageFooters(doc);
  doc.save(`alpha-logistix-dossiers-${filePeriodSuffix(period)}.pdf`);
}

export function exportShipmentDetailPdf(
  shipment: ShipmentRecord,
  events: TrackingEventRecord[],
  period?: DatePeriodOptions
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasPeriodFilter = Boolean(period?.dateFrom || period?.dateTo);
  const subtitle = hasPeriodFilter
    ? `Dossier ${shipment.clientName} · ${formatDatePeriodLabel(period)}`
    : `Dossier client ${shipment.clientName} (${shipment.clientEmail})`;

  drawBrandedHeader(
    doc,
    `Fiche de Suivi Expédition : ${shipment.trackingCode}`,
    subtitle
  );

  autoTable(doc, {
    startY: 48,
    head: [['Information du dossier', 'Détail']],
    body: [
      ['Numéro de suivi', pdfText(shipment.trackingCode)],
      ['Client / Société', pdfText(`${shipment.clientName} (${shipment.clientEmail})`)],
      ['Mode de transport', pdfText(shipment.transportMode)],
      ['Itinéraire', pdfText(`${shipment.origin} -> ${shipment.destination}`)],
      ['Marchandise', pdfText(`${shipment.cargoDescription} (${shipment.weightOrVolume})`)],
      ['Position actuelle', pdfText(shipment.currentLocation)],
      ['Statut actuel', pdfText(shipment.currentStatus)],
      ['Arrivée estimée (ETA)', pdfText(shipment.estimatedArrival || 'Non précisée')],
      ['Création du dossier', formatTs(shipment.createdAt)],
      ['Dernière mise à jour', formatTs(shipment.updatedAt)],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.8,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 52, fillColor: [248, 250, 252] },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 138;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Historique des positions (${events.length})`, 14, finalY + 10);

  autoTable(doc, {
    startY: finalY + 14,
    head: [['Date & Heure', 'Position de la marchandise', 'Statut', 'Observations']],
    body:
      events.length > 0
        ? events.map((ev) => [
            formatTs(ev.createdAt),
            pdfText(ev.location),
            pdfText(ev.status),
            pdfText(ev.notes || '-'),
          ])
        : hasPeriodFilter
        ? [['-', 'Aucune position enregistrée sur cette période', '-', '-']]
        : [['-', pdfText(shipment.currentLocation), pdfText(shipment.currentStatus), 'Position initiale']],
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.8,
      textColor: [15, 23, 42],
      valign: 'top',
    },
    headStyles: {
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });

  drawPageFooters(doc);
  doc.save(
    hasPeriodFilter
      ? `dossier-${shipment.trackingCode}-${filePeriodSuffix(period)}.pdf`
      : `dossier-${shipment.trackingCode}.pdf`
  );
}

export function exportClientsPdf(
  clients: PdfClientRow[],
  period?: DatePeriodOptions
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const periodText = formatDatePeriodLabel(period);

  drawBrandedHeader(
    doc,
    'Répertoire Clients — Alpha Logistix Group',
    `${clients.length} fiche(s) client exportée(s) · ${periodText}`
  );

  autoTable(doc, {
    startY: 48,
    head: [['Société', 'Contact', 'E-mail', 'Téléphone', 'Ville', 'Adresse', 'Dossiers', 'Créé le', 'Origine']],
    body: clients.map((c) => [
      pdfText(c.company),
      pdfText(c.fullName),
      pdfText(c.email),
      pdfText(c.phone),
      pdfText(c.city),
      pdfText(c.address || '-'),
      String(c.shipmentsCount),
      formatShortDate(c.createdAt),
      pdfText(c.sourceLabel),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 2.4,
      textColor: [15, 23, 42],
      valign: 'top',
    },
    headStyles: {
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14, bottom: 16 },
  });

  drawPageFooters(doc);
  doc.save(`alpha-logistix-clients-${filePeriodSuffix(period)}.pdf`);
}
