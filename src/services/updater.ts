import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauriRuntime } from "./ncApi";

export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  raw: Update;
}

export interface UpdateDownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

/** GitHub Releases の最新バージョンを確認する（デスクトップアプリ実行時のみ） */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const update = await check();
  if (!update) {
    return null;
  }
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
    raw: update,
  };
}

/** アップデートをダウンロード・適用してアプリを自動再起動する */
export async function installAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      totalBytes = event.data.contentLength ?? null;
      downloadedBytes = 0;
      onProgress?.({ downloadedBytes, totalBytes, percent: totalBytes ? 0 : null });
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      const percent =
        totalBytes && totalBytes > 0
          ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          : null;
      onProgress?.({ downloadedBytes, totalBytes, percent });
    } else if (event.event === "Finished") {
      onProgress?.({
        downloadedBytes: totalBytes ?? downloadedBytes,
        totalBytes,
        percent: 100,
      });
    }
  });

  await relaunch();
}
