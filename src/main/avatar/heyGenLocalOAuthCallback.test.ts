import net from "node:net";
import { describe, expect, it } from "vitest";
import { createHeyGenLocalOAuthCallbackServer } from "./heyGenLocalOAuthCallback";

describe("createHeyGenLocalOAuthCallbackServer", () => {
  it("resolves the callback URL when HeyGen redirects with code and state", async () => {
    const redirectUri = `http://127.0.0.1:${await getFreePort()}/heygen/oauth/callback`;
    const callbackServer = createHeyGenLocalOAuthCallbackServer({
      expectedState: "state-123",
      redirectUri,
      timeoutMs: 2_000
    });

    await callbackServer.ready;
    const response = await fetch(`${redirectUri}?code=authorization-code&state=state-123`);
    const callbackUrl = await callbackServer.callback;

    expect(response.ok).toBe(true);
    expect(callbackUrl).toContain("code=authorization-code");
    expect(callbackUrl).toContain("state=state-123");
  });

  it("rejects callbacks with a mismatched state", async () => {
    const redirectUri = `http://127.0.0.1:${await getFreePort()}/heygen/oauth/callback`;
    const callbackServer = createHeyGenLocalOAuthCallbackServer({
      expectedState: "expected-state",
      redirectUri,
      timeoutMs: 2_000
    });

    await callbackServer.ready;
    const callbackExpectation = expect(callbackServer.callback).rejects.toThrow("state");
    const response = await fetch(`${redirectUri}?code=authorization-code&state=wrong-state`);

    await callbackExpectation;
    expect(response.ok).toBe(true);
  });

  it("requires a local http redirect URI with an explicit port", () => {
    expect(() =>
      createHeyGenLocalOAuthCallbackServer({
        expectedState: "state",
        redirectUri: "https://example.com/heygen/oauth/callback",
        timeoutMs: 100
      })
    ).toThrow("本机自动授权");
  });
});

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a free port.")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
