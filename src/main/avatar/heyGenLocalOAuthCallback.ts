import http from "node:http";

const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface HeyGenLocalOAuthCallbackServer {
  callback: Promise<string>;
  close: () => void;
  ready: Promise<void>;
}

export function createHeyGenLocalOAuthCallbackServer(input: {
  expectedState: string;
  redirectUri: string;
  timeoutMs?: number;
}): HeyGenLocalOAuthCallbackServer {
  const redirectUrl = new URL(input.redirectUri);
  assertLocalHttpRedirectUri(redirectUrl);

  const expectedPath = normalizePathname(redirectUrl.pathname);
  const host = redirectUrl.hostname;
  const port = Number(redirectUrl.port);
  let isListening = false;
  let settled = false;
  let timeout: NodeJS.Timeout | undefined;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveCallback!: (callbackUrl: string) => void;
  let rejectCallback!: (error: Error) => void;

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const callback = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const close = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    if (isListening) {
      server.close(() => undefined);
      isListening = false;
    }
  };

  const settle = (result: { ok: true; callbackUrl: string } | { ok: false; error: Error }) => {
    if (settled) {
      return;
    }
    settled = true;
    close();
    if (result.ok) {
      resolveCallback(result.callbackUrl);
      return;
    }
    rejectCallback(result.error);
  };

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", input.redirectUri);
    if (normalizePathname(requestUrl.pathname) !== expectedPath) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("HeyGen OAuth callback endpoint not found.");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    if (error) {
      const errorDescription = requestUrl.searchParams.get("error_description") || error;
      respondWithHtml(response, "授权失败", "HeyGen 返回授权失败，可以关闭这个页面。");
      settle({
        ok: false,
        error: new Error(`HeyGen OAuth 授权失败：${errorDescription}`)
      });
      return;
    }

    const code = requestUrl.searchParams.get("code")?.trim();
    const state = requestUrl.searchParams.get("state")?.trim();
    if (!code) {
      respondWithHtml(response, "授权失败", "回调地址中没有 code，可以关闭这个页面。");
      settle({
        ok: false,
        error: new Error("HeyGen OAuth 回调地址中没有 code。")
      });
      return;
    }

    if (state !== input.expectedState) {
      respondWithHtml(response, "授权失败", "授权状态校验失败，可以关闭这个页面。");
      settle({
        ok: false,
        error: new Error("HeyGen OAuth state 校验失败，请重新开始授权。")
      });
      return;
    }

    respondWithHtml(response, "授权成功", "HeyGen 会员授权已返回软件，可以关闭这个页面。");
    settle({ ok: true, callbackUrl: requestUrl.toString() });
  });

  server.on("error", (error) => {
    const wrappedError =
      error instanceof Error ? error : new Error("HeyGen OAuth 本机回调服务启动失败。");
    rejectReady(wrappedError);
    settle({ ok: false, error: wrappedError });
  });

  server.listen(port, host, () => {
    isListening = true;
    resolveReady();
  });

  timeout = setTimeout(() => {
    settle({
      ok: false,
      error: new Error("HeyGen OAuth 授权等待超时，请重新点击本机一键授权。")
    });
  }, input.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS);
  timeout.unref();

  return {
    callback,
    close,
    ready
  };
}

function assertLocalHttpRedirectUri(url: URL): void {
  if (url.protocol !== "http:") {
    throw new Error("本机自动授权只支持 http://127.0.0.1 或 http://localhost 回调地址。");
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("本机自动授权需要使用 127.0.0.1 或 localhost 回调地址。");
  }
  if (!url.port) {
    throw new Error("本机自动授权回调地址必须包含端口号。");
  }
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.trim() || "/";
  return normalized.endsWith("/") && normalized !== "/" ? normalized.slice(0, -1) : normalized;
}

function respondWithHtml(response: http.ServerResponse, title: string, message: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7f3; color: #1f2a27; }
      main { width: min(520px, calc(100vw - 40px)); padding: 32px; border: 1px solid #d8ded4; border-radius: 14px; background: #ffffff; box-shadow: 0 18px 60px rgba(32, 42, 39, 0.12); }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0; line-height: 1.7; color: #55615d; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
