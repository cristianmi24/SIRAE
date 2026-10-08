import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "client",
  publicDir: "../public",
  plugins: [react(), tailwindcss()],
  server: { allowedHosts: [".us4.manus.computer"] },
  // Se preempaquetan al arrancar para que Vite no re-optimice en caliente
  // (eso dejaba el navegador con dos copias de React).
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react-router-dom", "@tanstack/react-query", "lucide-react", "recharts", "qrcode", "@zxing/browser", "idb", "react-hook-form", "@hookform/resolvers/zod", "zod"],
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
