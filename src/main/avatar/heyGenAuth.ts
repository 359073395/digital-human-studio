import crypto from "node:crypto";
import { defaultServiceSettings, type ServiceConfiguration } from "../../shared/serviceConfig";
import { redactSecret } from "../security/redaction";

const HEYGEN_OAUTH_CREDENTIAL_KIND = "heygen-oauth-v1";
const OAUTH_EXPIRY_SKEW_MS = 120_000;

interface HeyGenCredentialStore {
  readCredential: (providerId: "heygen") => Promise<string | null>;
  saveCredential?: (providerId: "heygen", secret: string) => Promise<void>;
}

export interface HeyGenOAuthCredential {
  kind: typeof HEYGEN_OAUTH_CREDENTIAL_KIND;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
}

export interface HeyGenOAuthStartInput {
  settings: ServiceConfiguration["settings"];
}

export interface HeyGenOAuthStartResult {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  message: string;
}

export interface HeyGenOAuthExchangeInput {
  settings: ServiceConfiguration["settings"];
  callbackUrlOrCode: string;
  codeVerifier: string;
  expectedState: string;
}

interface HeyGenTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: unknown;
  message?: string;
}

export function buildHeyGenAuthHeaders(
  configuration: ServiceConfiguration,
  credential: string
): Record<string, string> {
  const authMode = configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode;
  if (authMode === "oauth-bearer") {
    return {
      authorization: `Bearer ${credential}`
    };
  }

  return {
    "x-api-key": credential
  };
}

export async function readHeyGenCredentialForRequest(
  configuration: ServiceConfiguration,
  credentials: HeyGenCredentialStore,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const rawCredential = await credentials.readCredential("heygen");
  if (!rawCredential) {
    return null;
  }

  const oauthCredential = parseHeyGenOAuthCredential(rawCredential);
  const authMode = configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode;
  if (!oauthCredential) {
    return rawCredential;
  }

  if (authMode !== "oauth-bearer") {
    throw new Error(
      "本机保存的是 HeyGen 会员 OAuth 登录态，但当前认证方式选择了 API Key。请切回会员/OAuth，或清除凭据后保存新的 API Key。"
    );
  }

  if (!isOAuthCredentialExpiring(oauthCredential)) {
    return oauthCredential.accessToken;
  }

  if (!oauthCredential.refreshToken) {
    return oauthCredential.accessToken;
  }

  if (!credentials.saveCredential) {
    return oauthCredential.accessToken;
  }

  const refreshedCredential = await refreshHeyGenOAuthCredential(
    fetchImpl,
    configuration.settings,
    oauthCredential.refreshToken
  );
  await credentials.saveCredential("heygen", stringifyHeyGenOAuthCredential(refreshedCredential));
  return refreshedCredential.accessToken;
}

export function heyGenCredentialLabel(configuration: ServiceConfiguration): string {
  return (configuration.settings.authMode ?? defaultServiceSettings("heygen").authMode) ===
    "oauth-bearer"
    ? "HeyGen OAuth/Bearer Token"
    : "HeyGen API Key";
}

export function createHeyGenOAuthAuthorization(
  input: HeyGenOAuthStartInput
): HeyGenOAuthStartResult {
  const settings = { ...defaultServiceSettings("heygen"), ...input.settings };
  const clientId = settings.oauthClientId?.trim();
  const redirectUri = settings.oauthRedirectUri?.trim();
  const authorizeUrl = settings.oauthAuthorizeUrl?.trim();
  if (!clientId) {
    throw new Error("请先填写 HeyGen OAuth Client ID。");
  }
  if (!redirectUri) {
    throw new Error("请先填写 HeyGen OAuth Redirect URI。");
  }
  if (!authorizeUrl) {
    throw new Error("HeyGen OAuth 授权地址为空。");
  }

  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = createOAuthState();
  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_type", "code");
  if (settings.oauthScope?.trim()) {
    url.searchParams.set("scope", settings.oauthScope.trim());
  }

  return {
    authorizationUrl: url.toString(),
    codeVerifier,
    state,
    redirectUri,
    message: "已打开 HeyGen 授权页。授权后请复制回调地址或 code 粘贴回软件。"
  };
}

export async function exchangeHeyGenOAuthCode(
  fetchImpl: typeof fetch,
  input: HeyGenOAuthExchangeInput
): Promise<HeyGenOAuthCredential> {
  const settings = { ...defaultServiceSettings("heygen"), ...input.settings };
  const clientId = settings.oauthClientId?.trim();
  const redirectUri = settings.oauthRedirectUri?.trim();
  const tokenUrl = settings.oauthTokenUrl?.trim();
  if (!clientId) {
    throw new Error("请先填写 HeyGen OAuth Client ID。");
  }
  if (!redirectUri) {
    throw new Error("请先填写 HeyGen OAuth Redirect URI。");
  }
  if (!tokenUrl) {
    throw new Error("HeyGen OAuth Token 地址为空。");
  }

  const callback = parseHeyGenOAuthCallback(input.callbackUrlOrCode);
  if (callback.state && callback.state !== input.expectedState) {
    throw new Error("HeyGen OAuth state 校验失败，请重新开始授权。");
  }
  if (!callback.code) {
    throw new Error("没有从回调地址中读取到 HeyGen OAuth code。");
  }

  return requestHeyGenOAuthToken(fetchImpl, tokenUrl, {
    client_id: clientId,
    code: callback.code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: input.codeVerifier
  });
}

export function parseHeyGenOAuthCredential(rawCredential: string): HeyGenOAuthCredential | null {
  const trimmed = rawCredential.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    if (parsed.kind !== HEYGEN_OAUTH_CREDENTIAL_KIND) {
      return null;
    }
    const accessToken = readString(parsed, "accessToken");
    if (!accessToken) {
      return null;
    }
    return {
      kind: HEYGEN_OAUTH_CREDENTIAL_KIND,
      accessToken,
      refreshToken: readString(parsed, "refreshToken") || undefined,
      expiresAt: readString(parsed, "expiresAt") || undefined,
      tokenType: readString(parsed, "tokenType") || "Bearer"
    };
  } catch {
    return null;
  }
}

export function stringifyHeyGenOAuthCredential(credential: HeyGenOAuthCredential): string {
  return JSON.stringify({
    kind: HEYGEN_OAUTH_CREDENTIAL_KIND,
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    expiresAt: credential.expiresAt,
    tokenType: credential.tokenType ?? "Bearer"
  });
}

async function refreshHeyGenOAuthCredential(
  fetchImpl: typeof fetch,
  settings: ServiceConfiguration["settings"],
  refreshToken: string
): Promise<HeyGenOAuthCredential> {
  const mergedSettings = { ...defaultServiceSettings("heygen"), ...settings };
  const clientId = mergedSettings.oauthClientId?.trim();
  const refreshUrl = mergedSettings.oauthRefreshTokenUrl?.trim();
  if (!clientId) {
    throw new Error("HeyGen OAuth token 已过期，但 Client ID 为空，无法自动刷新。");
  }
  if (!refreshUrl) {
    throw new Error("HeyGen OAuth Refresh Token 地址为空，无法自动刷新。");
  }

  return requestHeyGenOAuthToken(fetchImpl, refreshUrl, {
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
}

async function requestHeyGenOAuthToken(
  fetchImpl: typeof fetch,
  url: string,
  form: Record<string, string>
): Promise<HeyGenOAuthCredential> {
  const body = new URLSearchParams(form);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const text = await response.text();
  const parsed = parseTokenResponse(text);
  if (!response.ok) {
    throw new Error(
      `HeyGen OAuth token 请求失败 (${response.status}): ${
        redactSecret(text.slice(0, 800)) || response.statusText
      }`
    );
  }
  if (parsed.error) {
    throw new Error(`HeyGen OAuth 返回错误：${redactSecret(String(parsed.error))}`);
  }
  if (!parsed.access_token) {
    throw new Error("HeyGen OAuth 响应缺少 access_token。");
  }

  return {
    kind: HEYGEN_OAUTH_CREDENTIAL_KIND,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token || form.refresh_token,
    expiresAt:
      typeof parsed.expires_in === "number"
        ? new Date(Date.now() + parsed.expires_in * 1000).toISOString()
        : undefined,
    tokenType: parsed.token_type || "Bearer"
  };
}

function parseTokenResponse(text: string): HeyGenTokenResponse {
  try {
    return JSON.parse(text) as HeyGenTokenResponse;
  } catch {
    return { message: text };
  }
}

function parseHeyGenOAuthCallback(value: string): { code: string; state?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { code: "" };
  }

  try {
    const url = new URL(trimmed);
    return {
      code: url.searchParams.get("code")?.trim() || "",
      state: url.searchParams.get("state")?.trim() || undefined
    };
  } catch {
    return { code: trimmed };
  }
}

function isOAuthCredentialExpiring(credential: HeyGenOAuthCredential): boolean {
  if (!credential.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(credential.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }
  return expiresAt - Date.now() <= OAUTH_EXPIRY_SKEW_MS;
}

function createCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(48));
}

function createCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(crypto.createHash("sha256").update(codeVerifier).digest());
}

function createOAuthState(): string {
  return base64UrlEncode(crypto.randomBytes(24));
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
