import React, { useState } from "react";
import {
  AlertTriangle,
  CornerDownRight,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { FileReadResult } from "../types/nc";
import type { EditorSelectionInfo } from "./NcEditor";

interface UnsavedChangesModalProps {
  fileName: string;
  actionLabel: string;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

/** 未保存変更があるときの3択確認モーダル */
export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  fileName,
  actionLabel,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden text-xs">
        <div className="px-4 py-3 border-b border-[#323233] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] text-[13px]">
            <AlertTriangle className="w-4 h-4 text-[#fbbf24]" />
            <span>未保存の変更があります</span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded text-[#8e95a2] hover:text-white hover:bg-[#323233]"
            title="キャンセル (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 text-[#cbd5e1] leading-relaxed">
          <p>
            <span className="font-mono text-white font-semibold">{fileName}</span>{" "}
            に保存されていない変更があります。
          </p>
          <p className="text-[#94a3b8] text-[11.5px]">
            「{actionLabel}」を実行する前に変更を保存しますか？
          </p>
        </div>

        <div className="px-4 py-3 bg-[#1e1e1e] border-t border-[#323233] flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded bg-[#2d2d30] hover:bg-[#3c3c3c] text-[#d4d4d4] transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onDiscardAndContinue}
            className="px-3 py-1.5 rounded bg-[#5a1d1d] hover:bg-[#7f1d1d] text-[#fecaca] border border-[#be1100]/70 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            保存せず破棄
          </button>
          <button
            onClick={onSaveAndContinue}
            autoFocus
            className="px-3 py-1.5 rounded bg-[#0078d4] hover:bg-[#1a8ad4] text-white font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            保存して続行
          </button>
        </div>
      </div>
    </div>
  );
};

interface DropActionModalProps {
  droppedFile: FileReadResult;
  selectionInfo: EditorSelectionInfo;
  editorOpen: boolean;
  isDirty: boolean;
  onOpenAsNew: () => void;
  onInsertAtSelection: (stripPercent: boolean) => void;
  onAppendToEnd: (stripPercent: boolean) => void;
  onCancel: () => void;
}

/** ドラッグ＆ドロップされたファイルの読み込み方法選択モーダル */
export const DropActionModal: React.FC<DropActionModalProps> = ({
  droppedFile,
  selectionInfo,
  editorOpen,
  isDirty,
  onOpenAsNew,
  onInsertAtSelection,
  onAppendToEnd,
  onCancel,
}) => {
  const [stripPercent, setStripPercent] = useState(true);

  const lines = droppedFile.content.replace(/\r\n/g, "\n").split("\n");
  const previewLines = lines.slice(0, 6).join("\n");
  const hasSelection = selectionInfo.selectedChars > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden text-xs">
        <div className="px-4 py-3 border-b border-[#323233] flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[#f1f5f9] text-[13px] min-w-0">
            <FileCode2 className="w-4 h-4 text-[#38bdf8] shrink-0" />
            <span className="truncate">{droppedFile.fileName}</span>
            <span className="px-1.5 py-0.5 rounded bg-[#181818] text-[10px] font-mono text-[#94a3b8] shrink-0">
              {lines.length}行 / {droppedFile.encoding}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded text-[#8e95a2] hover:text-white hover:bg-[#323233]"
            title="キャンセル (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 先頭コードプレビュー */}
          <div className="bg-[#181818] border border-[#2f2f32] rounded-md p-2.5 font-mono text-[11px] text-[#9cdcfe] overflow-x-auto max-h-28 whitespace-pre leading-snug">
            {previewLines}
            {lines.length > 6 && (
              <div className="text-[#6e7681] mt-1">... 他 {lines.length - 6} 行</div>
            )}
          </div>

          {/* 2大アクションカード */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={onOpenAsNew}
              className="text-left p-3 rounded-md bg-[#1e1e1e] hover:bg-[#094771]/55 border border-[#3c3c3c] hover:border-[#0078d4] transition-colors space-y-1.5 group"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-[#f1f5f9] group-hover:text-white">
                  <FolderOpen className="w-4 h-4 text-[#fbbf24]" />
                  新しいファイルとして開く
                </span>
                {isDirty && (
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#fbbf24]/20 text-[#fbbf24]">
                    未保存あり
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#94a3b8] leading-snug">
                現在のプログラムを閉じて、ドロップしたNCファイルを単体で開きます。
              </p>
            </button>

            <button
              onClick={() => onInsertAtSelection(stripPercent)}
              className="text-left p-3 rounded-md bg-[#1e1e1e] hover:bg-[#094771]/55 border border-[#3c3c3c] hover:border-[#38bdf8] transition-colors space-y-1.5 group"
            >
              <div className="flex items-center gap-1.5 font-semibold text-[#f1f5f9] group-hover:text-white">
                <CornerDownRight className="w-4 h-4 text-[#38bdf8]" />
                選択箇所にコード挿入
              </div>
              <p className="text-[11px] text-[#94a3b8] leading-snug">
                {!editorOpen
                  ? "エディタを開いて現在のカーソル位置へ挿入します（Ctrl+Zで戻せます）。"
                  : hasSelection
                    ? `L${selectionInfo.lineNumber}〜L${selectionInfo.endLineNumber} の選択範囲 (${selectionInfo.selectedChars}文字) を置換して挿入します。`
                    : `L${selectionInfo.lineNumber} 行目のカーソル位置に差し込みます（Ctrl+Zで戻せます）。`}
              </p>
            </button>
          </div>

          {/* 末尾追記 + 挿入オプション */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#323233]">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#cbd5e1]">
              <input
                type="checkbox"
                checked={stripPercent}
                onChange={(e) => setStripPercent(e.target.checked)}
                className="accent-[#0078d4]"
              />
              <span>挿入・追記時に先頭/末尾の &quot;%&quot; 行を除く</span>
            </label>

            <button
              onClick={() => onAppendToEnd(stripPercent)}
              className="px-2.5 py-1 rounded bg-[#2d2d30] hover:bg-[#3c3c3c] text-[#cbd5e1] hover:text-white flex items-center gap-1.5 text-[11px] transition-colors"
              title="現在のプログラムの末尾にサブプログラム等として連結する"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-[#4ade80]" />
              末尾に追記
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#1e1e1e] border-t border-[#323233] flex justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1 rounded bg-[#2d2d30] hover:bg-[#3c3c3c] text-[#d4d4d4] transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

/** ファイルをウィンドウへドラッグ中の視覚オーバーレイ */
export const DragHoverOverlay: React.FC = () => (
  <div className="fixed inset-0 z-40 pointer-events-none bg-[#0078d4]/15 backdrop-blur-[1px] flex items-center justify-center p-8">
    <div className="border-2 border-dashed border-[#38bdf8] bg-[#1e1e1e]/92 rounded-xl px-8 py-6 shadow-2xl text-center space-y-2">
      <FileCode2 className="w-10 h-10 text-[#38bdf8] mx-auto" />
      <div className="text-sm font-semibold text-white">
        ここにドロップして NC ファイル / マシン設定を読み込む
      </div>
      <div className="text-xs text-[#94a3b8]">
        NCファイルは「新しく開く」または「選択箇所にコード挿入」を選べます
      </div>
    </div>
  </div>
);
