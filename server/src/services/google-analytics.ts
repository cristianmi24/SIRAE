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

type Named = { name: string; value: number };
export interface AnalyticsSummary {
  configured: boolean; days: number;
  totals?: { users: number; newUsers: number; sessions: number; pageViews: number; avgSessionSeconds: number; engagementRate: number; bounceRate: number; events: number; viewsPerSession: number };
  daily?: { date: string; users: number; sessions: number; pageViews: number }[];
  hourly?: { hour: number; users: number }[];
  pages?: { path: string; views: number; users: number }[];
  channels?: Named[]; countries?: Named[]; cities?: Named[]; devices?: Named[]; browsers?: Named[]; systems?: Named[]; visitorTypes?: Named[];
}
export interface AnalyticsRealtime {
  configured: boolean; users: number; viewsLast30: number;
  minutes?: { minutesAgo: number; users: number }[];
  pages?: { name: string; users: number }[];
  countries?: Named[]; cities?: Named[]; devices?: Named[];
}

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), ttl, value });
  return value;
}

const num = (row: Row | undefined, index: number) => Number(row?.metricValues?.[index]?.value ?? 0);
const label = (row: Row, index = 0) => row.dimensionValues?.[index]?.value ?? "";
const topBy = (metric: string) => [{ metric: { metricName: metric }, desc: true }];
const named = (rows: Row[]): Named[] => rows.map((row) => ({ name: label(row) || "(sin datos)", value: num(row, 0) }));

export async function analyticsSummary(days: number): Promise<AnalyticsSummary> {
  const found = credentials();
  if (!found) return { configured: false, days };
  return cached(`summary:${days}`, 60_000, async () => {
    const bearer = await accessToken(found.account);
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
    const run = (body: object) => report("runReport", found.propertyId, bearer, { dateRanges, ...body });
    const by = (dimension: string, limit = 8) => run({ dimensions: [{ name: dimension }], metrics: [{ name: "activeUsers" }], orderBys: topBy("activeUsers"), limit });
    const [total, daily, hourly, pages, channels, countries, cities, devices, browsers, systems, visitors] = await Promise.all([
      run({ metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: "engagementRate" }, { name: "bounceRate" }, { name: "eventCount" }, { name: "screenPageViewsPerSession" }] }),
      run({ dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
      run({ dimensions: [{ name: "hour" }], metrics: [{ name: "activeUsers" }], orderBys: [{ dimension: { dimensionName: "hour" } }] }),
      run({ dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], orderBys: topBy("screenPageViews"), limit: 10 }),
      run({ dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: topBy("sessions"), limit: 8 }),
      by("country"), by("city"), by("deviceCategory"), by("browser"), by("operatingSystem"), by("newVsReturning"),
    ]);
    const hours = new Map(hourly.map((row) => [Number(label(row)), num(row, 0)]));
    return {
      configured: true, days,
      totals: { users: num(total[0], 0), newUsers: num(total[0], 1), sessions: num(total[0], 2), pageViews: num(total[0], 3), avgSessionSeconds: Math.round(num(total[0], 4)), engagementRate: num(total[0], 5), bounceRate: num(total[0], 6), events: num(total[0], 7), viewsPerSession: num(total[0], 8) },
      daily: daily.map((row) => ({ date: label(row), users: num(row, 0), sessions: num(row, 1), pageViews: num(row, 2) })),
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, users: hours.get(hour) ?? 0 })),
      pages: pages.map((row) => ({ path: label(row), views: num(row, 0), users: num(row, 1) })),
      channels: named(channels), countries: named(countries), cities: named(cities), devices: named(devices), browsers: named(browsers), systems: named(systems), visitorTypes: named(visitors),
    };
  });
}

// Últimos 30 minutos, minuto a minuto (datos en vivo de Google Analytics).
export async function analyticsRealtime(): Promise<AnalyticsRealtime> {
  const found = credentials();
  if (!found) return { configured: false, users: 0, viewsLast30: 0 };
  return cached("realtime", 10_000, async () => {
    const bearer = await accessToken(found.account);
    const run = (body: object) => report("runRealtimeReport", found.propertyId, bearer, body);
    const by = (dimension: string, limit = 6) => run({ dimensions: [{ name: dimension }], metrics: [{ name: "activeUsers" }], orderBys: topBy("activeUsers"), limit });
    const [now, minutes, pages, countries, cities, devices] = await Promise.all([
      run({ metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }] }),
      run({ dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "activeUsers" }] }),
      by("unifiedScreenName", 8), by("country"), by("city"), by("deviceCategory"),
    ]);
    const perMinute = new Map(minutes.map((row) => [Number(label(row)), num(row, 0)]));
    return {
      configured: true, users: num(now[0], 0), viewsLast30: num(now[0], 1),
      minutes: Array.from({ length: 30 }, (_, index) => ({ minutesAgo: 29 - index, users: perMinute.get(29 - index) ?? 0 })),
      pages: pages.map((row) => ({ name: label(row) || "(sin título)", users: num(row, 0) })),
      countries: named(countries), cities: named(cities), devices: named(devices),
    };
  });
}
