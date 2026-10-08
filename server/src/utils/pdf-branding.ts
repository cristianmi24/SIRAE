import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// PDFKit no lee WebP; los PDF del servidor usan versiones JPEG de los logos.
function loadAsset(name: string): Buffer | undefined {
  const candidates = [path.resolve(process.cwd(), "server/assets", name), path.resolve(process.cwd(), "assets", name)];
  const found = candidates.find((file) => existsSync(file));
  return found ? readFileSync(found) : undefined;
}
let cache: { sirae?: Buffer; edutlan?: Buffer } | undefined;
function assets() { cache ??= { sirae: loadAsset("sirae-logo.jpg"), edutlan: loadAsset("edutlan-logo.jpg") }; return cache; }

type Doc = PDFKit.PDFDocument;

export function drawSiraeLogo(doc: Doc, x: number, y: number, width = 90) {
  const logo = assets().sirae;
  if (logo) doc.image(logo, x, y, { width });
}

// Marca de agua pequeña "by Edutlan" al pie de cada página, incluidas las que se agreguen después.
export function addEdutlanWatermark(doc: Doc) {
  const draw = () => {
    const logo = assets().edutlan;
    const { width, height, margins } = doc.page;
    const bottom = margins.bottom;
    doc.page.margins.bottom = 0;
    const y = height - 26;
    const logoWidth = 44;
    const textWidth = 14;
    const x = (width - logoWidth - textWidth) / 2;
    doc.save().opacity(0.6).fillColor("#6b7399").fontSize(7).font("Helvetica").text("by", x, y + 6, { lineBreak: false });
    if (logo) doc.image(logo, x + textWidth, y, { width: logoWidth });
    doc.restore();
    doc.page.margins.bottom = bottom;
    doc.x = margins.left; doc.y = margins.top;
  };
  draw();
  doc.on("pageAdded", draw);
}
