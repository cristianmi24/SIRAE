# Desplegar SIRAE en Vercel

- El frontend se compila con `vite build` y Vercel lo sirve desde `dist/client`.
- Todo `/api/*` lo atiende una sola función (`api/index.ts`) con la misma app Express.
- Los logos JPEG de los PDF (`server/assets/`) se incluyen en la función desde `vercel.json`.

## Pasos

```bash
vercel login
```
```bash
vercel link
```
Agrega las variables de entorno (Production) en el panel del proyecto o con `vercel env add`:

| Variable | Valor |
|---|---|
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas |
| `AUTH_JWT_SECRET` | Texto aleatorio largo (mínimo 32 caracteres) |
| `AULANEXO_ADMIN_EMAIL` | Correo del administrador de monitoreo |
| `AULANEXO_ADMIN_PASSWORD` | Clave del administrador |
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | La URL pública, por ejemplo `https://sirae.vercel.app` |

Vista previa y producción:
```bash
vercel
```
```bash
vercel --prod
```

## A tener en cuenta

- **MongoDB Atlas → Network Access:** Vercel no usa IP fijas; permite `0.0.0.0/0` o usa la integración de Atlas con Vercel.
- **Límites de intentos:** se guardan en memoria de cada instancia de la función. Siguen protegiendo, pero no se comparten entre instancias.
- **Cámara:** solo funciona en HTTPS; Vercel lo da por defecto.
