import type { AppUpdateStatus } from "../../shared/updates";

interface UpdateInfoLike {
  version?: string;
  releaseName?: string | null;
  releaseNotes?: unknown;
}

interface UpdateCheckResultLike {
  updateInfo?: UpdateInfoLike;
}

interface DownloadProgressLike {
  percent?: number;
}

type AutoUpdaterEventName =
  | "checking-for-update"
  | "update-available"
  | "update-not-available"
  | "download-progress"
  | "update-downloaded"
  | "error";

interface AutoUpdaterLike {
  autoDownload: boolean;
  checkForUpdates: () => Promise<UpdateCheckResultLike | null>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: AutoUpdaterEventName, listener: (...args: unknown[]) => void) => unknown;
}

export interface UpdateServiceOptions {
  currentVersion: string;
  isPackaged: boolean;
  releasePageUrl: string;
  updater: AutoUpdaterLike;
  openExternal: (url: string) => Promise<unknown>;
}

export class UpdateService {
  private status: AppUpdateStatus;

  constructor(private readonly options: UpdateServiceOptions) {
    options.updater.autoDownload = false;
    this.status = this.createInitialStatus();
    this.registerUpdaterEvents();
  }

  getStatus(): AppUpdateStatus {
    return { ...this.status };
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (!this.options.isPackaged) {
      return this.setUnsupportedStatus();
    }

    this.status = {
      status: "checking",
      currentVersion: this.options.currentVersion,
      releaseUrl: this.options.releasePageUrl,
      message: "正在检查更新..."
    };

    try {
      const result = await this.options.updater.checkForUpdates();
      const updateInfo = result?.updateInfo;
      const availableVersion = updateInfo?.version?.trim();
      if (availableVersion && availableVersion !== this.options.currentVersion) {
        return this.setAvailableStatus(updateInfo);
      }

      this.status = {
        status: "not-available",
        currentVersion: this.options.currentVersion,
        releaseUrl: this.options.releasePageUrl,
        message: "当前已是最新版本。"
      };
      return this.getStatus();
    } catch (error) {
      if (isMissingOnlineUpdatePackageError(error)) {
        return this.setNoOnlinePackageStatus();
      }
      return this.setErrorStatus(error, "检查更新失败");
    }
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (!this.options.isPackaged) {
      return this.setUnsupportedStatus();
    }

    if (this.status.status !== "available" && this.status.status !== "error") {
      await this.checkForUpdates();
    }

    if (this.status.status !== "available") {
      return this.getStatus();
    }

    this.status = {
      ...this.status,
      status: "downloading",
      downloaded: false,
      progressPercent: 0,
      message: "正在下载更新..."
    };

    try {
      await this.options.updater.downloadUpdate();
      this.status = {
        ...this.status,
        status: "downloaded",
        downloaded: true,
        progressPercent: 100,
        message: "更新已下载，点击安装后会重启软件。"
      };
      return this.getStatus();
    } catch (error) {
      return this.setErrorStatus(error, "下载更新失败");
    }
  }

  installUpdate(): AppUpdateStatus {
    if (!this.options.isPackaged) {
      return this.setUnsupportedStatus();
    }

    if (this.status.status !== "downloaded") {
      this.status = {
        ...this.status,
        status: "error",
        message: "更新包尚未下载完成，请先点击立即更新。"
      };
      return this.getStatus();
    }

    this.options.updater.quitAndInstall(false, true);
    return this.getStatus();
  }

  async openReleasePage(): Promise<AppUpdateStatus> {
    await this.options.openExternal(this.options.releasePageUrl);
    return this.getStatus();
  }

  private createInitialStatus(): AppUpdateStatus {
    if (!this.options.isPackaged) {
      return {
        status: "unsupported",
        currentVersion: this.options.currentVersion,
        releaseUrl: this.options.releasePageUrl,
        message: "当前是开发版，无法在线更新；请安装正式版后使用在线更新。"
      };
    }

    return {
      status: "idle",
      currentVersion: this.options.currentVersion,
      releaseUrl: this.options.releasePageUrl,
      message: "尚未检查更新。"
    };
  }

  private registerUpdaterEvents(): void {
    this.options.updater.on("checking-for-update", () => {
      this.status = {
        ...this.status,
        status: "checking",
        message: "正在检查更新..."
      };
    });

    this.options.updater.on("update-available", (info) => {
      this.setAvailableStatus(readUpdateInfo(info));
    });

    this.options.updater.on("update-not-available", () => {
      this.status = {
        status: "not-available",
        currentVersion: this.options.currentVersion,
        releaseUrl: this.options.releasePageUrl,
        message: "当前已是最新版本。"
      };
    });

    this.options.updater.on("download-progress", (progress) => {
      const percent = readDownloadProgress(progress);
      this.status = {
        ...this.status,
        status: "downloading",
        downloaded: false,
        progressPercent: percent,
        message: `正在下载更新 ${Math.round(percent)}%`
      };
    });

    this.options.updater.on("update-downloaded", (info) => {
      const updateInfo = readUpdateInfo(info);
      this.status = {
        status: "downloaded",
        currentVersion: this.options.currentVersion,
        availableVersion: updateInfo.version ?? this.status.availableVersion,
        downloaded: true,
        progressPercent: 100,
        releaseUrl: this.options.releasePageUrl,
        message: "更新已下载，点击安装后会重启软件。"
      };
    });

    this.options.updater.on("error", (error) => {
      this.setErrorStatus(error, "更新失败");
    });
  }

  private setAvailableStatus(updateInfo: UpdateInfoLike | undefined): AppUpdateStatus {
    const availableVersion = updateInfo?.version?.trim() || "新版本";
    this.status = {
      status: "available",
      currentVersion: this.options.currentVersion,
      availableVersion,
      downloaded: false,
      releaseUrl: this.options.releasePageUrl,
      message: `发现新版本 ${availableVersion}，可以立即更新。`
    };
    return this.getStatus();
  }

  private setUnsupportedStatus(): AppUpdateStatus {
    this.status = this.createInitialStatus();
    return this.getStatus();
  }

  private setNoOnlinePackageStatus(): AppUpdateStatus {
    this.status = {
      status: "not-available",
      currentVersion: this.options.currentVersion,
      releaseUrl: this.options.releasePageUrl,
      message:
        "还没有发布在线更新包。请先在 GitHub Release 上传新版安装包、latest.yml 和 blockmap。"
    };
    return this.getStatus();
  }

  private setErrorStatus(error: unknown, fallback: string): AppUpdateStatus {
    if (isMissingOnlineUpdatePackageError(error)) {
      return this.setNoOnlinePackageStatus();
    }

    const message = error instanceof Error ? error.message : String(error || fallback);
    this.status = {
      ...this.status,
      status: "error",
      releaseUrl: this.options.releasePageUrl,
      message: `${fallback}：${message}`
    };
    return this.getStatus();
  }
}

function readUpdateInfo(value: unknown): UpdateInfoLike {
  return isRecord(value) ? value : {};
}

function readDownloadProgress(value: unknown): number {
  const progress = isRecord(value) ? (value as DownloadProgressLike).percent : 0;
  return Math.min(100, Math.max(0, Number.isFinite(progress) ? Number(progress) : 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingOnlineUpdatePackageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /latest\.yml|releases\/latest|No published versions|404|not found|Cannot find/i.test(
    message
  );
}
