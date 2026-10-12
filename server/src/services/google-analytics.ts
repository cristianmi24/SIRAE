import { createSign } from "node:crypto";

// Lee las estadísticas de Google Analytics 4 con una cuenta de servicio (API de datos).
// Variables: GA_PROPERTY_ID (número de la propiedad) y GA_SERVICE_ACCOUNT_JSON
// (el JSON de la cuenta de servicio, tal cual o en base64).
interface ServiceAccount { client_email: string; private_key: string }

function credentials(): { propertyId: string; account: ServiceAccount } | null {
  const propertyId = process.env.GA_PROPERTY_ID?.trim().replace(/^properties\//, "");
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON?.trim();
  if (!propertyId || !raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const account = JSON.parse(text) as ServiceAccount;
    if (!account.client_email || !account.private_key) return null;
    return { propertyId, account: { ...account, private_key: account.private_key.replace(/\\n/g, "\n") } };
  } catch { return null; }
}

const b64 = (value: object | Buffer) => (value instanceof Buffer ? value : Buffer.from(JSON.stringify(value))).toString("base64url");
let token: { value: string; expiresAt: number } | undefined;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: account.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64(signature)}` }) });
  if (!response.ok) throw new Error("Google rechazó las credenciales de Analytics.");
  const body = await response.json() as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

type Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
async function report(kind: "runReport" | "runRealtimeReport", propertyId: string, bearer: string, body: object): Promise<Row[]> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${kind}`, { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 403 ? "La cuenta de servicio no tiene acceso a la propiedad de Analytics." : "Analytics no respondió correctamente.");
  return ((await response.json()) as { rows?: Row[] }).rows ?? [];
}

export interface AnalyticsSummary {
  configured: boolean; days: number;
  totals?: { users: number; newUsers: number; sessions: number; pageViews: number; avgSessionSeconds: number };
  realtimeUsers?: number;
  daily?: { date: string; users: number; pageViews: number }[];
  pages?: { path: string; views: number }[];
  countries?: { name: string; users: number }[];
  devices?: { name: string; users: number }[];
}

const cache = new Map<number, { at: number; value: AnalyticsSummary }>();

export async function analyticsSummary(days: number): Promise<AnalyticsSummary> {
  const found = credentials();
  if (!found) return { configured: false, days };
  const cached = cache.get(days);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const bearer = await accessToken(found.account);
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const num = (row: Row | undefined, index: number) => Number(row?.metricValues?.[index]?.value ?? 0);
  const run = (body: object, kind: "runReport" | "runRealtimeReport" = "runReport") => report(kind, found.propertyId, bearer, body);
  const topBy = (metric: string) => [{ metric: { metricName: metric }, desc: true }];
  const [total, daily, pages, countries, devices, realtime] = await Promise.all([
    run({ dateRanges, metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }] }),
    run({ dateRanges, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
    run({ dateRanges, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: topBy("screenPageViews"), limit: 10 }),
    run({ dateRanges, dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }], orderBys: topBy("activeUsers"), limit: 8 }),
    run({ dateRanges, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }], orderBys: topBy("activeUsers") }),
    run({ metrics: [{ name: "activeUsers" }] }, "runRealtimeReport"),
  ]);
  const label = (row: Row) => row.dimensionValues?.[0]?.value ?? "";
  const value: AnalyticsSummary = {
    configured: true, days,
    totals: { users: num(total[0], 0), newUsers: num(total[0], 1), sessions: num(total[0], 2), pageViews: num(total[0], 3), avgSessionSeconds: Math.round(num(total[0], 4)) },
    realtimeUsers: num(realtime[0], 0),
    daily: daily.map((row) => ({ date: label(row), users: num(row, 0), pageViews: num(row, 1) })),
    pages: pages.map((row) => ({ path: label(row), views: num(row, 0) })),
    countries: countries.map((row) => ({ name: label(row), users: num(row, 0) })),
    devices: devices.map((row) => ({ name: label(row), users: num(row, 0) })),
  };
  cache.set(days, { at: Date.now(), value });
  return value;
}
