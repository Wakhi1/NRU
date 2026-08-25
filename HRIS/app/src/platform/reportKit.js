// Shared formal-report rendering: one HTML template for on-screen preview, one PDFKit layout
// and one ExcelJS workbook builder for real downloads, and a CSV writer for flat exports.
// Both reports.routes.js and audit.routes.js build on this so every export in the app — a
// payroll report, a combined multi-section report, or an audit-trail dump — looks and behaves
// the same way (letterhead, generated-by/at line, applied-filters summary, footer).
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtCell(value, col) {
  if (value == null) return '';
  if (col && col.type === 'currency') return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (col && col.type === 'number') return Number(value).toLocaleString();
  if (col && col.type === 'date' && value) return String(value).slice(0, 10);
  // A JSON-typed MySQL column (before_json/after_json in the audit export) comes back already
  // parsed into an object on real MySQL, but as a string on MariaDB — String(obj) would render
  // "[object Object]" only in the former case, so stringify objects/arrays explicitly.
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function logoFilePath(logoUrl) {
  if (!logoUrl || !logoUrl.startsWith('/')) return null;
  const p = path.join(__dirname, '..', '..', 'public', logoUrl);
  return fs.existsSync(p) ? p : null;
}

async function getOrgInfo(db) {
  const rows = await db.query(`SELECT setting_key, setting_value FROM app_setting WHERE setting_key IN ('org_logo_url', 'org_name')`);
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return { orgName: map.org_name || 'Your Organization', logoUrl: map.org_logo_url || '/img/nru-logo.png' };
}

// ---------------------------------------------------------------------------
// HTML preview — a self-contained formal document, meant to sit in an <iframe>.
// ---------------------------------------------------------------------------
function buildPreviewHtml({ title, subtitle, orgName, logoUrl, generatedBy, generatedAt, filterLines, sections }) {
  const sectionsHtml = sections.map((s) => `
    <section class="rk-section">
      <h2>${esc(s.heading)}</h2>
      ${s.note ? `<div class="rk-note">${esc(s.note)}</div>` : ''}
      ${s.kpis && s.kpis.length ? `
        <div class="rk-kpis">
          ${s.kpis.map((k) => `<div class="rk-kpi"><div class="rk-kpi-label">${esc(k.label)}</div><div class="rk-kpi-value">${esc(k.value)}</div></div>`).join('')}
        </div>` : ''}
      ${s.columns && s.rows ? `
        <table class="rk-table">
          <thead><tr>${s.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${s.rows.length ? s.rows.map((r) => `<tr>${s.columns.map((c) => `<td>${esc(fmtCell(r[c.key], c))}</td>`).join('')}</tr>`).join('')
              : `<tr><td colspan="${s.columns.length}" class="rk-empty">No records match these filters.</td></tr>`}
          </tbody>
        </table>
        <div class="rk-rowcount">${s.rows.length} record${s.rows.length === 1 ? '' : 's'}</div>` : ''}
    </section>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px 40px; background: #fff; }
  .rk-letterhead { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #12557f; padding-bottom: 16px; margin-bottom: 18px; }
  .rk-letterhead img { height: 56px; width: auto; }
  .rk-org-name { font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #12557f; font-weight: 700; }
  .rk-title { font-size: 22px; font-weight: 700; margin-top: 2px; }
  .rk-subtitle { font-size: 13px; color: #555; margin-top: 2px; }
  .rk-meta { display: flex; justify-content: space-between; font-size: 11.5px; color: #666; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
  .rk-filters { font-size: 11.5px; color: #444; background: #f4f7f9; border: 1px solid #e0e6ea; border-radius: 4px; padding: 8px 12px; margin-bottom: 22px; }
  .rk-filters strong { color: #12557f; }
  .rk-section { margin-bottom: 28px; page-break-inside: avoid; }
  .rk-section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .5px; color: #12557f; border-left: 4px solid #1c8a63; padding-left: 10px; margin: 0 0 10px; }
  .rk-note { font-size: 12px; color: #666; margin-bottom: 10px; }
  .rk-kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .rk-kpi { border: 1px solid #e0e6ea; border-radius: 4px; padding: 8px 14px; min-width: 130px; }
  .rk-kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #888; }
  .rk-kpi-value { font-size: 17px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }
  table.rk-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .rk-table th { text-align: left; background: #12557f; color: #fff; padding: 6px 8px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; font-size: 10.5px; }
  .rk-table td { padding: 5px 8px; border-bottom: 1px solid #e8ecee; }
  .rk-table tbody tr:nth-child(even) { background: #f7f9fa; }
  .rk-empty { text-align: center; color: #999; font-style: italic; padding: 14px !important; }
  .rk-rowcount { font-size: 10.5px; color: #888; margin-top: 4px; text-align: right; }
  .rk-footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
  @media print { body { padding: 12mm 16mm; } .rk-section { page-break-inside: avoid; } }
</style></head>
<body>
  <div class="rk-letterhead">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="" />` : ''}
    <div>
      <div class="rk-org-name">${esc(orgName)}</div>
      <div class="rk-title">${esc(title)}</div>
      ${subtitle ? `<div class="rk-subtitle">${esc(subtitle)}</div>` : ''}
    </div>
  </div>
  <div class="rk-meta"><span>Generated by ${esc(generatedBy)}</span><span>${esc(generatedAt)}</span></div>
  ${filterLines && filterLines.length ? `<div class="rk-filters"><strong>Filters applied:</strong> ${filterLines.map(esc).join(' &nbsp;·&nbsp; ')}</div>` : ''}
  ${sectionsHtml}
  <div class="rk-footer"><span>NRU HRIS — official report export</span><span>Confidential — internal use only</span></div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// PDF export (PDFKit) — same information, laid out for print rather than screen.
// ---------------------------------------------------------------------------
function buildPdf({ title, subtitle, orgName, logoUrl, generatedBy, generatedAt, filterLines, sections }, res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(res);

  const logoPath = logoFilePath(logoUrl);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  // Logos can be uploaded at any aspect ratio (see branding.routes.js) — scaling by height alone
  // left wide logos overlapping the text column next to them, since the rendered width wasn't
  // known ahead of time. `fit` constrains BOTH dimensions so the reserved text-start offset is
  // always correct regardless of the source image's shape.
  const LOGO_BOX_W = 80;
  const LOGO_BOX_H = 36;
  function drawLetterhead() {
    const top = doc.y;
    if (logoPath) { try { doc.image(logoPath, left, top, { fit: [LOGO_BOX_W, LOGO_BOX_H] }); } catch (e) { /* ignore unreadable image */ } }
    const textX = logoPath ? left + LOGO_BOX_W + 14 : left;
    const textWidth = right - textX;
    doc.fillColor('#12557f').fontSize(9).font('Helvetica-Bold').text(orgName.toUpperCase(), textX, top, { characterSpacing: 0.5, width: textWidth });
    doc.fillColor('#1a1a1a').fontSize(17).font('Helvetica-Bold').text(title, textX, top + 13, { width: textWidth });
    if (subtitle) doc.fillColor('#555').fontSize(10).font('Helvetica').text(subtitle, textX, top + 33, { width: textWidth });
    doc.moveDown();
    doc.y = Math.max(doc.y, top + (logoPath ? LOGO_BOX_H + 8 : 50));
    doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(2).strokeColor('#12557f').stroke();
    doc.moveDown(0.6);
    doc.fillColor('#666').fontSize(8.5).font('Helvetica')
      .text(`Generated by ${generatedBy}`, left, doc.y, { continued: true, width: right - left })
      .text(generatedAt, { align: 'right' });
    doc.moveDown(0.4);
    if (filterLines && filterLines.length) {
      doc.fillColor('#444').fontSize(8.5).text(`Filters: ${filterLines.join('  ·  ')}`, left, doc.y, { width: right - left });
    }
    doc.moveDown(0.8);
  }

  drawLetterhead();

  for (const section of sections) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.fillColor('#12557f').fontSize(12).font('Helvetica-Bold').text(section.heading.toUpperCase(), left, doc.y, { characterSpacing: 0.3 });
    doc.moveDown(0.3);
    if (section.note) { doc.fillColor('#666').fontSize(8.5).font('Helvetica').text(section.note, left); doc.moveDown(0.3); }

    if (section.kpis && section.kpis.length) {
      const kpiY = doc.y;
      const w = (right - left) / section.kpis.length;
      section.kpis.forEach((k, i) => {
        const x = left + i * w;
        doc.rect(x, kpiY, w - 6, 34).strokeColor('#e0e6ea').lineWidth(1).stroke();
        doc.fillColor('#888').fontSize(7).font('Helvetica').text(String(k.label).toUpperCase(), x + 6, kpiY + 5, { width: w - 12 });
        doc.fillColor('#1a1a1a').fontSize(12).font('Helvetica-Bold').text(String(k.value), x + 6, kpiY + 16, { width: w - 12 });
      });
      doc.y = kpiY + 40;
      doc.moveDown(0.4);
    }

    if (section.columns && section.rows) {
      const cols = section.columns;
      const colWidth = (right - left) / cols.length;
      function drawHeaderRow() {
        const y = doc.y;
        doc.rect(left, y, right - left, 18).fill('#12557f');
        doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold');
        cols.forEach((c, i) => doc.text(c.label.toUpperCase(), left + i * colWidth + 4, y + 5, { width: colWidth - 8 }));
        doc.y = y + 18;
      }
      drawHeaderRow();
      doc.font('Helvetica').fontSize(8);
      if (!section.rows.length) {
        doc.fillColor('#999').font('Helvetica-Oblique').text('No records match these filters.', left, doc.y + 6, { width: right - left, align: 'center' });
        doc.moveDown(1);
      } else {
        section.rows.forEach((r, idx) => {
          if (doc.y > doc.page.height - 60) { doc.addPage(); drawHeaderRow(); doc.font('Helvetica').fontSize(8); }
          const y = doc.y;
          if (idx % 2 === 1) doc.rect(left, y, right - left, 16).fill('#f7f9fa');
          doc.fillColor('#1a1a1a');
          cols.forEach((c, i) => doc.text(fmtCell(r[c.key], c), left + i * colWidth + 4, y + 4, { width: colWidth - 8, height: 12, ellipsis: true }));
          doc.y = y + 16;
        });
      }
      doc.fillColor('#888').fontSize(7.5).font('Helvetica').text(`${section.rows.length} record${section.rows.length === 1 ? '' : 's'}`, left, doc.y + 2, { width: right - left, align: 'right' });
    }
    doc.moveDown(1);
  }

  // Footer sits inside the bottom margin by design (30pt from the physical edge, margin is 40pt).
  // PDFKit's text() auto-paginates when a write target falls outside the page's margin-bounded
  // content area, even with an explicit y — writing here with the margin still active silently
  // appended a blank page per footer write. Zeroing the bottom margin for this loop only stops
  // that false trigger; it doesn't affect anything already drawn.
  const pageCount = doc.bufferedPageRange().count;
  const savedBottomMargin = doc.page.margins.bottom;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.fillColor('#999').fontSize(7.5).font('Helvetica')
      .text('NRU HRIS — official report export — confidential', left, doc.page.height - 30, { width: right - left - 60, lineBreak: false });
    doc.text(`Page ${i + 1} of ${pageCount}`, right - 60, doc.page.height - 30, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottomMargin;
  }

  doc.end();
}

// ---------------------------------------------------------------------------
// Payslip PDF (PDFKit) — a fixed one-page employee-facing document, not a filterable table
// like buildPdf() above. This is an internal HRIS document about the employee's own pay, so
// (unlike the external integration API, which never returns these) it shows a masked bank
// account and the employee's own tax number — normal for someone's own payslip.
// ---------------------------------------------------------------------------
function buildPayslipPdf({ orgInfo, person, run, payline, items, position, department, maskedBankAccount, taxNumber }, res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(res);

  const logoPath = logoFilePath(orgInfo.logoUrl);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const LOGO_BOX_W = 80;
  const LOGO_BOX_H = 36;

  const top = doc.y;
  if (logoPath) { try { doc.image(logoPath, left, top, { fit: [LOGO_BOX_W, LOGO_BOX_H] }); } catch (e) { /* ignore unreadable image */ } }
  const textX = logoPath ? left + LOGO_BOX_W + 14 : left;
  const textWidth = right - textX;
  doc.fillColor('#12557f').fontSize(9).font('Helvetica-Bold').text(orgInfo.orgName.toUpperCase(), textX, top, { characterSpacing: 0.5, width: textWidth });
  doc.fillColor('#1a1a1a').fontSize(17).font('Helvetica-Bold').text('Payslip', textX, top + 13, { width: textWidth });
  doc.fillColor('#555').fontSize(10).font('Helvetica').text(`Pay period ${run.period}`, textX, top + 33, { width: textWidth });
  doc.y = Math.max(doc.y, top + (logoPath ? LOGO_BOX_H + 8 : 50));
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(2).strokeColor('#12557f').stroke();
  doc.moveDown(1);

  // Employee / period summary block
  const infoY = doc.y;
  const infoColW = (right - left) / 2;
  doc.fillColor('#888').fontSize(8).font('Helvetica').text('EMPLOYEE', left, infoY);
  doc.fillColor('#1a1a1a').fontSize(11).font('Helvetica-Bold').text(person.full_legal_name, left, infoY + 11);
  doc.fillColor('#666').fontSize(9).font('Helvetica').text(person.employee_no, left, infoY + 25);
  const positionLine = [position, department].filter(Boolean).join(' · ');
  if (positionLine) doc.fillColor('#666').fontSize(9).font('Helvetica').text(positionLine, left, infoY + 37);

  doc.fillColor('#888').fontSize(8).font('Helvetica').text('PAY PERIOD', left + infoColW, infoY);
  doc.fillColor('#1a1a1a').fontSize(11).font('Helvetica-Bold').text(run.period, left + infoColW, infoY + 11);
  doc.fillColor('#666').fontSize(9).font('Helvetica').text(`Status: ${String(run.status).replace(/_/g, ' ')}`, left + infoColW, infoY + 25);

  doc.y = infoY + (positionLine ? 58 : 46);
  doc.moveDown(0.6);

  const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const allowanceItems = (items || []).filter((i) => i.kind === 'allowance');
  const deductionItems = (items || []).filter((i) => i.kind === 'deduction');

  function sectionHeader(label) {
    const y = doc.y;
    doc.rect(left, y, right - left, 18).fill('#12557f');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(label, left + 8, y + 5);
    doc.text('AMOUNT', right - 108, y + 5, { width: 100, align: 'right' });
    doc.y = y + 18;
  }
  function lineRow(label, value, idx) {
    const y = doc.y;
    if (idx % 2 === 1) doc.rect(left, y, right - left, 18).fill('#f7f9fa');
    doc.fillColor('#1a1a1a').font('Helvetica').fontSize(9.5).text(label, left + 8, y + 5);
    doc.text(money(value), right - 108, y + 5, { width: 100, align: 'right' });
    doc.y = y + 18;
  }
  function subtotalRow(label, value) {
    const y = doc.y;
    doc.rect(left, y, right - left, 20).fill('#e8eef2');
    doc.fillColor('#12557f').font('Helvetica-Bold').fontSize(9.5).text(label, left + 8, y + 5.5);
    doc.text(money(value), right - 108, y + 5.5, { width: 100, align: 'right' });
    doc.y = y + 20;
  }

  // ---- EARNINGS ----
  sectionHeader('EARNINGS');
  let idx = 0;
  lineRow('Basic Salary', payline.basic, idx++);
  if (Number(payline.overtime) !== 0) lineRow('Overtime', payline.overtime, idx++);
  if (allowanceItems.length) {
    allowanceItems.forEach((i) => lineRow(i.label, i.amount, idx++));
  } else if (Number(payline.allowances) !== 0) {
    lineRow('Allowances', payline.allowances, idx++);
  }
  const gross = Number(payline.basic) + Number(payline.overtime) + Number(payline.allowances);
  doc.moveDown(0.15);
  subtotalRow('GROSS PAY', gross);
  doc.moveDown(0.5);

  // ---- DEDUCTIONS ----
  sectionHeader('DEDUCTIONS');
  idx = 0;
  if (deductionItems.length) {
    deductionItems.forEach((i) => lineRow(i.label, i.amount, idx++));
  } else if (Number(payline.deductions) !== 0) {
    lineRow('Deductions', payline.deductions, idx++);
  } else {
    lineRow('No deductions', 0, idx++);
  }
  doc.moveDown(0.15);
  subtotalRow('TOTAL DEDUCTIONS', payline.deductions);
  doc.moveDown(0.5);

  // ---- NET PAY ----
  const netY = doc.y + 4;
  doc.rect(left, netY, right - left, 26).fill('#1c8a63');
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold');
  doc.text('NET PAY', left + 8, netY + 7);
  doc.text(money(payline.net), right - 128, netY + 7, { width: 120, align: 'right' });
  doc.y = netY + 26;
  doc.moveDown(1);

  // ---- Payment details ----
  if (maskedBankAccount || taxNumber) {
    doc.fillColor('#888').fontSize(8).font('Helvetica-Bold').text('PAYMENT DETAILS', left, doc.y);
    doc.moveDown(0.3);
    const parts = [];
    if (maskedBankAccount) parts.push(`Bank account: ${maskedBankAccount}`);
    if (taxNumber) parts.push(`Tax number: ${taxNumber}`);
    doc.fillColor('#555').fontSize(9).font('Helvetica').text(parts.join('   ·   '), left, doc.y);
    doc.moveDown(0.8);
  }

  doc.fillColor('#999').fontSize(8).font('Helvetica-Oblique')
    .text('This is a system-generated payslip.', left, doc.y, { width: right - left });

  const pageCount = doc.bufferedPageRange().count;
  const savedBottomMargin = doc.page.margins.bottom;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.fillColor('#999').fontSize(7.5).font('Helvetica')
      .text(`${orgInfo.orgName} — confidential payslip`, left, doc.page.height - 30, { width: right - left - 60, lineBreak: false });
    doc.text(`Page ${i + 1} of ${pageCount}`, right - 60, doc.page.height - 30, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottomMargin;
  }

  doc.end();
}

// ---------------------------------------------------------------------------
// XLSX export (ExcelJS) — one worksheet per section.
// ---------------------------------------------------------------------------
async function buildXlsx({ title, generatedBy, generatedAt, filterLines, sections }, res, filename) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NRU HRIS';
  wb.created = new Date();

  for (const section of sections) {
    const ws = wb.addWorksheet(section.heading.slice(0, 31) || 'Report');
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([`Generated by ${generatedBy} — ${generatedAt}`]).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
    if (filterLines && filterLines.length) ws.addRow([`Filters: ${filterLines.join('  |  ')}`]).font = { size: 9, color: { argb: 'FF444444' } };
    ws.addRow([]);

    if (section.columns && section.rows) {
      const headerRow = ws.addRow(section.columns.map((c) => c.label));
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12557F' } };
      });
      section.rows.forEach((r) => {
        ws.addRow(section.columns.map((c) => {
          const v = r[c.key];
          if (c.type === 'currency' || c.type === 'number') return v == null ? null : Number(v);
          return v == null ? '' : String(v);
        }));
      });
      ws.columns.forEach((col, i) => {
        const maxLen = Math.max(section.columns[i] ? section.columns[i].label.length : 10, ...section.rows.map((r) => String(r[section.columns[i].key] ?? '').length));
        col.width = Math.min(Math.max(maxLen + 2, 10), 40);
      });
      ws.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: section.columns.length } };
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ---------------------------------------------------------------------------
// CSV export — single flat table only (used for single-report and audit-trail exports).
// ---------------------------------------------------------------------------
function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(columns, rows) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => csvEscape(fmtCell(r[c.key], c))).join(','));
  return [header, ...lines].join('\r\n');
}

function sendCsv(res, columns, rows, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + buildCsv(columns, rows));
}

module.exports = { buildPreviewHtml, buildPdf, buildPayslipPdf, buildXlsx, buildCsv, sendCsv, getOrgInfo, esc, fmtCell };
