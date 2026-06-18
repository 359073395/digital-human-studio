export function normalizeHeyGenBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v[0-9]+$/i, "");
}
