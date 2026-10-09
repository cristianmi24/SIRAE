import PDFDocument from "pdfkit";
import { addEdutlanWatermark, drawSiraeLogo } from "./pdf-branding.js";

// Paleta de SIRAE para los PDF.
export const C = { ink: "#1B2559", text: "#2E3866", muted: "#6B7399", line: "#E3E7F3", soft: "#F4F6FC", blue: "#4361EE", blueBg: "#EAEEFE", green: "#0F9D6E", amber: "#E08A00", coral: "#E5484D", slate: "#A3ABD4" };

export type Column = { label: string; width: number; align?: "left" | "right" | "center" };
type Cell = string | { text: string; bold?: boolean; color?: string; note?: string };

/**
 * Generador de documentos PDF de SIRAE (archivo real, no captura de pantalla).
 * Encabezado con logo, secciones numeradas, métricas, tablas con salto de página,
 * pie con número de página y marca "by Edutlan" en cada hoja.
 */
export class PdfReport {
  readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private readonly done: Promise<Buffer>;
  readonly left = 48;
  readonly right: number;
  readonly width: number;

  constructor(private readonly info: { title: string; subtitle: string; institution: string; generatedAt?: Date; timezone?: string; landscape?: boolean; footerNote?: string }) {
    this.doc = new PDFDocument({ size: "A4", layout: info.landscape ? "landscape" : "portrait", margins: { top: 48, bottom: 60, left: 48, right: 48 }, bufferPages: true, info: { Title: info.title, Author: "SIRAE", Subject: info.subtitle } });
    this.done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on("data", (chunk: Buffer) => this.chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
    });
    this.right = this.doc.page.width - 48;
    this.width = this.right - this.left;
    addEdutlanWatermark(this.doc);
    this.header();
  }

  private get bottomLimit() { return this.doc.page.height - this.doc.page.margins.bottom; }

  ensure(height: number) {
    if (this.doc.y + height > this.bottomLimit) { this.doc.addPage(); this.doc.x = this.left; this.doc.y = this.doc.page.margins.top; }
  }

  private header() {
    const d = this.doc;
    drawSiraeLogo(d, this.left, 34, 78);
    const generated = (this.info.generatedAt ?? new Date()).toLocaleString("es-CO", { timeZone: this.info.timezone ?? "America/Bogota", dateStyle: "medium", timeStyle: "short" });
    d.fillColor(C.ink).font("Helvetica-Bold").fontSize(11).text(this.info.institution || "SIRAE", this.left + 90, 42, { width: this.width - 250, lineBreak: false, ellipsis: true });
    d.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(this.info.subtitle, this.left + 90, 57, { width: this.width - 250 });
    d.fillColor(C.muted).fontSize(7.5).text("GENERADO", this.right - 150, 42, { width: 150, align: "right" });
    d.fillColor(C.text).fontSize(9).text(generated, this.right - 150, 53, { width: 150, align: "right" });
    d.moveTo(this.left, 88).lineTo(this.right, 88).lineWidth(1.4).strokeColor(C.ink).stroke();
    d.x = this.left; d.y = 104;
  }

  title(kicker: string, name: string, facts: [string, string][] = []) {
    const d = this.doc;
    d.fillColor(C.blue).font("Helvetica-Bold").fontSize(9).text(kicker, this.left, d.y);
    d.moveDown(.2).fillColor(C.ink).fontSize(22).text(name, { width: this.width });
    if (facts.length) {
      d.moveDown(.4);
      const y = d.y; const colW = Math.min(170, this.width / facts.length);
      facts.forEach(([label, value], i) => {
        d.fillColor(C.muted).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), this.left + i * colW, y, { width: colW - 10 });
        d.fillColor(C.ink).font("Helvetica").fontSize(10.5).text(value, this.left + i * colW, y + 11, { width: colW - 10 });
      });
      d.x = this.left; d.y = y + 30;
    }
    d.moveDown(.4);
  }

  filters(items: [string, string][]) {
    const d = this.doc; const y = d.y; const text = items.map(([k, v]) => `${k}: ${v}`).join("      ");
    const h = d.font("Helvetica").fontSize(8.5).heightOfString(text, { width: this.width - 20 }) + 14;
    d.roundedRect(this.left, y, this.width, h, 5).fill(C.blueBg);
    let x = this.left + 10;
    d.fontSize(8.5);
    for (const [k, v] of items) {
      d.fillColor(C.blue).font("Helvetica-Bold").text(`${k}  `, x, y + 7, { continued: true }).fillColor(C.text).font("Helvetica").text(v, { continued: false });
      x += d.widthOfString(`${k}  ${v}`) + 26;
      if (x > this.right - 80) break;
    }
    d.x = this.left; d.y = y + h + 6;
  }

  section(number: string, title: string) {
    this.ensure(60);
    const d = this.doc; d.moveDown(.8); const y = d.y;
    d.fillColor(C.blue).font("Helvetica-Bold").fontSize(9).text(number, this.left, y + 3);
    d.fillColor(C.ink).font("Helvetica-Bold").fontSize(14).text(title, this.left + 24, y);
    d.moveTo(this.left, d.y + 3).lineTo(this.right, d.y + 3).lineWidth(.6).strokeColor(C.line).stroke();
    d.x = this.left; d.y += 10;
  }

  metrics(items: [string, string | number][]) {
    this.ensure(52);
    const d = this.doc; const y = d.y; const w = this.width / items.length; const h = 44;
    d.roundedRect(this.left, y, this.width, h, 5).lineWidth(.7).strokeColor(C.line).stroke();
    items.forEach(([label, value], i) => {
      const x = this.left + i * w;
      if (i > 0) d.moveTo(x, y).lineTo(x, y + h).strokeColor(C.line).stroke();
      d.fillColor(C.ink).font("Helvetica-Bold").fontSize(14).text(String(value), x + 8, y + 8, { width: w - 16, lineBreak: false, ellipsis: true });
      d.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(label, x + 8, y + 28, { width: w - 16, lineBreak: false, ellipsis: true });
    });
    d.x = this.left; d.y = y + h + 8;
  }

  bar(parts: { value: number; color: string }[]) {
    const d = this.doc; const total = parts.reduce((s, p) => s + p.value, 0); const y = d.y;
    d.roundedRect(this.left, y, this.width, 5, 2.5).fill(C.line);
    let x = this.left;
    if (total) for (const p of parts) { if (!p.value) continue; const w = (p.value / total) * this.width; d.rect(x, y, w, 5).fill(p.color); x += w; }
    d.x = this.left; d.y = y + 13;
  }

  empty(text: string) {
    this.ensure(34);
    const d = this.doc; const y = d.y;
    const h = d.font("Helvetica-Oblique").fontSize(9.5).heightOfString(text, { width: this.width - 24 }) + 16;
    d.roundedRect(this.left, y, this.width, h, 5).dash(3, { space: 3 }).lineWidth(.7).strokeColor(C.slate).stroke().undash();
    d.fillColor(C.muted).text(text, this.left + 12, y + 8, { width: this.width - 24 });
    d.font("Helvetica"); d.x = this.left; d.y = y + h + 6;
  }

  paragraph(text: string, options: { size?: number; color?: string } = {}) {
    const d = this.doc;
    const h = d.font("Helvetica").fontSize(options.size ?? 10).heightOfString(text, { width: this.width });
    this.ensure(h + 4);
    d.fillColor(options.color ?? C.text).text(text, this.left, d.y, { width: this.width, lineGap: 2 });
    d.moveDown(.3);
  }

  highlight(label: string, value: string) {
    this.ensure(36);
    const d = this.doc; const y = d.y + 4;
    d.rect(this.left, y, this.width, 30).fill(C.blueBg); d.rect(this.left, y, 3, 30).fill(C.blue);
    d.fillColor(C.blue).font("Helvetica-Bold").fontSize(8.5).text(label.toUpperCase(), this.left + 12, y + 11, { width: this.width / 2 });
    d.fillColor(C.ink).font("Helvetica-Bold").fontSize(13).text(value, this.left + this.width / 2, y + 8, { width: this.width / 2 - 12, align: "right" });
    d.x = this.left; d.y = y + 38;
  }

  table(columns: Column[], rows: Cell[][], options: { cellColor?: (row: number, col: number) => string | undefined } = {}) {
    const d = this.doc;
    const total = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const drawHead = () => {
      const y = d.y; d.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted);
      let x = this.left;
      columns.forEach((c, i) => { d.text(c.label.toUpperCase(), x + 5, y, { width: widths[i]! - 10, align: c.align ?? "left" }); x += widths[i]!; });
      const h = Math.max(...columns.map((c, i) => d.heightOfString(c.label.toUpperCase(), { width: widths[i]! - 10 })));
      d.moveTo(this.left, y + h + 4).lineTo(this.right, y + h + 4).lineWidth(1.2).strokeColor(C.ink).stroke();
      d.y = y + h + 8;
    };
    this.ensure(40); drawHead();
    rows.forEach((row, r) => {
      const cells = row.map((cell) => typeof cell === "string" ? { text: cell } : cell);
      const heights = cells.map((cell, i) => {
        d.font(cell.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        let h = d.heightOfString(cell.text || " ", { width: widths[i]! - 10 });
        if (cell.note) h += d.font("Helvetica").fontSize(7.5).heightOfString(cell.note, { width: widths[i]! - 10 }) + 1;
        return h;
      });
      const rowH = Math.max(...heights) + 9;
      if (d.y + rowH > this.bottomLimit) { d.addPage(); d.x = this.left; d.y = d.page.margins.top; drawHead(); }
      const y = d.y;
      if (r % 2 === 1) d.rect(this.left, y - 2, this.width, rowH).fill(C.soft);
      let x = this.left;
      cells.forEach((cell, i) => {
        const align = columns[i]!.align ?? "left";
        d.fillColor(cell.color ?? options.cellColor?.(r, i) ?? C.text).font(cell.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(cell.text, x + 5, y + 2, { width: widths[i]! - 10, align });
        if (cell.note) d.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(cell.note, x + 5, d.y + 1, { width: widths[i]! - 10, align });
        x += widths[i]!;
      });
      d.moveTo(this.left, y + rowH - 2).lineTo(this.right, y + rowH - 2).lineWidth(.5).strokeColor(C.line).stroke();
      d.x = this.left; d.y = y + rowH;
    });
    d.moveDown(.5);
  }

  timeline(items: { meta: string; text: string; note?: string }[]) {
    const d = this.doc;
    for (const item of items) {
      const h = d.font("Helvetica").fontSize(9.5).heightOfString(item.text, { width: this.width - 18 }) + 22 + (item.note ? 12 : 0);
      this.ensure(h);
      const y = d.y;
      d.circle(this.left + 3, y + 4, 3).fill(C.blue);
      d.fillColor(C.muted).font("Helvetica-Bold").fontSize(7.5).text(item.meta.toUpperCase(), this.left + 14, y, { width: this.width - 18 });
      d.fillColor(C.text).font("Helvetica").fontSize(9.5).text(item.text, this.left + 14, d.y + 2, { width: this.width - 18 });
      if (item.note) d.fillColor(C.muted).fontSize(8.5).text(item.note, this.left + 14, d.y + 1, { width: this.width - 18 });
      d.x = this.left; d.y += 8;
    }
  }

  // Pie de cada hoja: nota de confidencialidad y número de página.
  async finish(): Promise<Buffer> {
    const d = this.doc; const range = d.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      d.switchToPage(i);
      const bottom = d.page.margins.bottom; d.page.margins.bottom = 0;
      const y = d.page.height - 44;
      d.moveTo(this.left, y - 6).lineTo(this.right, y - 6).lineWidth(.5).strokeColor(C.line).stroke();
      d.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(this.info.footerNote ?? "Documento confidencial. Acceso según los permisos de la institución.", this.left, y, { width: this.width - 90, lineBreak: false, ellipsis: true });
      d.text(`Página ${i - range.start + 1} de ${range.count}`, this.right - 90, y, { width: 90, align: "right", lineBreak: false });
      d.page.margins.bottom = bottom;
    }
    d.end();
    return this.done;
  }
}

export const fmtGrade = (value?: number) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
