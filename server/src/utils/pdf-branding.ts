import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// PDFKit no lee WebP; los PDF del servidor usan versiones JPEG de los logos.
function loadAsset(name: string): Buffer | undefined {
  const candidates = [path.resolve(process.cwd(), "server/assets", name), path.resolve(process.cwd(), "assets", name)];
  const found = candidates.find((file) => existsSync(file));
  return found ? readFileSync(found) : undefined;
}
let cache: { sirae?: Buffer } | undefined;
function assets() { cache ??= { sirae: loadAsset("sirae-logo.jpg") }; return cache; }

type Doc = PDFKit.PDFDocument;

export function drawSiraeLogo(doc: Doc, x: number, y: number, width = 90) {
  const logo = assets().sirae;
  if (logo) doc.image(logo, x, y, { width });
}
