// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { UpdateService } from "./updateService";

function createUpdaterStub(input?: {
  version?: string;
  downloadFails?: boolean;
  checkFails?: Error;
}) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    updater: {
      autoDownload: true,
      checkForUpdates: vi.fn(async () => {
        if (input?.checkFails) {
          throw input.checkFails;
        }
        return {
          updateInfo: input?.version ? { version: input.version } : { version: "1.0.0" }
        };
      }),
      downloadUpdate: vi.fn(async () => {
        if (input?.downloadFails) {
          throw new Error("network down");
        }
        listeners.get("download-progress")?.forEach((listener) => listener({ percent: 50 }));
        listeners
          .get("update-downloaded")
          ?.forEach((listener) => listener({ version: input?.version ?? "1.1.0" }));
        return [];
      }),
      quitAndInstall: vi.fn(),
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
      })
    },
    listeners
  };
}

describe("UpdateService", () => {
  it("reports unsupported updates in development builds", async () => {
    const { updater } = createUpdaterStub({ version: "1.1.0" });
    const service = new UpdateService({
      currentVersion: "1.0.0",
      isPackaged: false,
      releasePageUrl: "https://github.com/example/repo/releases",
      updater,
      openExternal: vi.fn()
    });

    const status = await service.checkForUpdates();

    expect(status.status).toBe("unsupported");
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("detects an available update without downloading automatically", async () => {
    const { updater } = createUpdaterStub({ version: "1.1.0" });
    const service = new UpdateService({
      currentVersion: "1.0.0",
      isPackaged: true,
      releasePageUrl: "https://github.com/example/repo/releases",
      updater,
      openExternal: vi.fn()
    });

    const status = await service.checkForUpdates();

    expect(updater.autoDownload).toBe(false);
    expect(status.status).toBe("available");
    expect(status.availableVersion).toBe("1.1.0");
  });

  it("reports missing GitHub release metadata as no online package", async () => {
    const { updater } = createUpdaterStub({
      checkFails: new Error("Cannot find latest.yml in the latest release artifacts (404)")
    });
    const service = new UpdateService({
      currentVersion: "1.0.1",
      isPackaged: true,
      releasePageUrl: "https://github.com/example/repo/releases",
      updater,
      openExternal: vi.fn()
    });

    const status = await service.checkForUpdates();

    expect(status.status).toBe("not-available");
    expect(status.message).toContain("还没有发布在线更新包");
  });

  it("downloads an available update and allows install", async () => {
    const { updater } = createUpdaterStub({ version: "1.1.0" });
    const service = new UpdateService({
      currentVersion: "1.0.0",
      isPackaged: true,
      releasePageUrl: "https://github.com/example/repo/releases",
      updater,
      openExternal: vi.fn()
    });

    await service.checkForUpdates();
    const downloaded = await service.downloadUpdate();
    const installed = service.installUpdate();

    expect(downloaded.status).toBe("downloaded");
    expect(installed.downloaded).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("opens the configured GitHub release page", async () => {
    const openExternal = vi.fn(async () => undefined);
    const { updater } = createUpdaterStub();
    const service = new UpdateService({
      currentVersion: "1.0.0",
      isPackaged: true,
      releasePageUrl: "https://github.com/example/repo/releases",
      updater,
      openExternal
    });

    await service.openReleasePage();

    expect(openExternal).toHaveBeenCalledWith("https://github.com/example/repo/releases");
  });
});
