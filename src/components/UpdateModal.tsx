import React from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { AppUpdateInfo, UpdateDownloadProgress } from "../services/updater";

export type UpdateModalState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "up-to-date"
  | "error";

interface UpdateModalProps {
  open: boolean;
  state: UpdateModalState;
  updateInfo: AppUpdateInfo | null;
  progress: UpdateDownloadProgress | null;
  errorMessage: string | null;
  onCheckAgain: () => void;
  onStartInstall: () => void;
  onClose: () => void;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  open,
  state,
  updateInfo,
  progress,
  errorMessage,
  onCheckAgain,
  onStartInstall,
  onClose,
}) => {
  if (!open) return null;

  const isBusy = state === "checking" || state === "downloading";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-4 py-3 border-b border-[#323233] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] text-[13px]">
            <Sparkles className="w-4 h-4 text-[#38bdf8]" />
            <span>TomboGCoder アップデート</span>
          </div>
          {!isBusy && (
            <button
              onClick={onClose}
              className="p-1 rounded text-[#8e95a2] hover:text-white hover:bg-[#323233]"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 本文 */}
        <div className="p-4 space-y-3">
          {state === "checking" && (
            <div className="py-6 flex flex-col items-center gap-2.5 text-[#cbd5e1]">
              <Loader2 className="w-6 h-6 text-[#38bdf8] animate-spin" />
              <div>最新バージョンを確認しています...</div>
            </div>
          )}

          {state === "up-to-date" && (
            <div className="py-4 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-7 h-7 text-[#4ade80]" />
              <div className="text-[13px] font-semibold text-white">
                最新バージョンを使用しています
              </div>
              <p className="text-[11px] text-[#94a3b8]">
                現在ご利用の TomboGCoder は最新です。
              </p>
            </div>
          )}

          {state === "available" && updateInfo && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-[#1e1e1e] border border-[#2f2f32] rounded-md px-3 py-2.5">
                <div>
                  <div className="text-[11px] text-[#94a3b8]">新しいバージョンが利用可能です</div>
                  <div className="mt-0.5 font-mono text-[14px] font-bold text-[#38bdf8]">
                    v{updateInfo.currentVersion} → v{updateInfo.version}
                  </div>
                </div>
                {updateInfo.date && (
                  <span className="text-[10.5px] font-mono text-[#787878]">
                    {updateInfo.date.slice(0, 10)}
                  </span>
                )}
              </div>

              {updateInfo.body && (
                <div className="space-y-1">
                  <div className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
                    更新内容
                  </div>
                  <div className="max-h-44 overflow-y-auto bg-[#1a1b1e] border border-[#2f2f32] rounded-md p-2.5 text-[11px] text-[#cbd5e1] whitespace-pre-wrap leading-relaxed font-mono">
                    {updateInfo.body}
                  </div>
                </div>
              )}

              <p className="text-[10.5px] text-[#8e95a2]">
                ※ マシン設定・工具リスト・置換ルールは保持されたまま自動更新・再起動されます。
              </p>
            </div>
          )}

          {state === "downloading" && (
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between text-[#e2e8f0]">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="w-4 h-4 text-[#38bdf8] animate-spin" />
                  ダウンロード＆適用中...
                </span>
                <span className="font-mono text-[11px] text-[#38bdf8]">
                  {progress?.percent !== null && progress?.percent !== undefined
                    ? `${progress.percent}%`
                    : ""}
                </span>
              </div>

              <div className="h-2 w-full bg-[#1a1b1e] rounded-full overflow-hidden border border-[#2f2f32]">
                <div
                  className="h-full bg-[#38bdf8] transition-all duration-150"
                  style={{ width: `${progress?.percent ?? 35}%` }}
                />
              </div>

              <div className="text-[10.5px] font-mono text-[#8e95a2] flex items-center justify-between">
                <span>
                  {progress
                    ? progress.totalBytes
                      ? `${formatMb(progress.downloadedBytes)} / ${formatMb(progress.totalBytes)}`
                      : formatMb(progress.downloadedBytes)
                    : "準備中..."}
                </span>
                <span>完了後に自動で再起動します</span>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5 bg-[#2a1618] border border-[#7f1d1d]/70 rounded-md p-3 text-[#fecaca]">
                <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold">アップデートの確認に失敗しました</div>
                  <div className="text-[11px] text-[#fca5a5] break-all font-mono">
                    {errorMessage ?? "ネットワーク接続またはリリース公開状態を確認してください。"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッターボタン */}
        <div className="px-4 py-2.5 bg-[#1e1e1e] border-t border-[#2f2f32] flex items-center justify-end gap-2">
          {state === "available" && (
            <>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-[#2d2d30] hover:bg-[#3c3c3c] text-[#d4d4d4] transition-colors"
              >
                あとで
              </button>
              <button
                onClick={onStartInstall}
                className="px-3.5 py-1.5 rounded bg-[#0078d4] hover:bg-[#1a8ad4] text-white font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>今すぐ更新して再起動</span>
              </button>
            </>
          )}

          {(state === "up-to-date" || state === "error") && (
            <>
              <button
                onClick={onCheckAgain}
                className="px-3 py-1.5 rounded bg-[#2d2d30] hover:bg-[#3c3c3c] text-[#e2e8f0] flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>再確認</span>
              </button>
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded bg-[#0078d4] hover:bg-[#1a8ad4] text-white font-semibold transition-colors"
              >
                閉じる
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
