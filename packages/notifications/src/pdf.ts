import { jsPDF } from 'jspdf';

export async function generatePlanPdf(
  markdown: string,
  projectName: string,
): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margins = { top: 50, bottom: 50, left: 50, right: 50 };
  const contentWidth = pageWidth - margins.left - margins.right;
  let y = margins.top;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('BrickOps Implementation Plan', margins.left, y);
  y += 30;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Project: ${projectName}`, margins.left, y);
  y += 16;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margins.left, y);
  y += 16;
  doc.text(`Tasks: ${markdown.split('\n').filter((l) => l.toLowerCase().includes('intent')).length}`, margins.left, y);
  y += 26;

  doc.setDrawColor(200, 200, 200);
  doc.line(margins.left, y, pageWidth - margins.right, y);
  y += 16;

  const lines = markdown.split('\n');

  for (const line of lines) {
    let cleaned = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();

    if (!cleaned) {
      y += 8;
      continue;
    }

    if (y > pageHeight - margins.bottom - 20) {
      doc.addPage();
      y = margins.top;
    }

    if (line.startsWith('###')) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    const splitLines = doc.splitTextToSize(cleaned, contentWidth);

    for (const splitLine of splitLines) {
      if (y > pageHeight - margins.bottom - 20) {
        doc.addPage();
        y = margins.top;
      }
      doc.text(splitLine, margins.left, y);
      y += 14;
    }

    y += 2;
  }

  const buffer = Buffer.from(doc.output('arraybuffer'));
  return buffer;
}

export function getPlanFilename(projectSlug: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `brickops-plan-${projectSlug}-${date}.pdf`;
}
