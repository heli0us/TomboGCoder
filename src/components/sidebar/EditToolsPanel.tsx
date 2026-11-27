import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Download,
  FileText,
  FolderPlus,
  Play,
  Plus,
  Replace,
  Trash2,
  Upload,
} from "lucide-react";
import type { NcSnippet, ReplaceBatch, ReplaceRule } from "../../types/nc";

interface EditToolsPanelProps {
  replaceBatches: ReplaceBatch[];
  onUpdateReplaceBatches: (batches: ReplaceBatch[]) => void;
  onRunReplaceBatch: (batch: ReplaceBatch) => void;
  onApplySingleRule: (rule: ReplaceRule) => void;
  onExportReplaceBatches: () => void;
  onImportReplaceBatches: () => void;
  snippets: NcSnippet[];
  onUpdateSnippets: (snippets: NcSnippet[]) => void;
  onInsertSnippet: (snippet: NcSnippet) => void;
  onExportSnippets: () => void;
  onImportSnippets: () => void;
}

function validateRegex(pattern: string, useRegex: boolean): string | null {
  if (!useRegex || !pattern) return null;
  try {
    new RegExp(pattern, "g");
    return null;
  } catch (err) {
    return String(err);
  }
}

export const EditToolsPanel: React.FC<EditToolsPanelProps> = ({
  replaceBatches,
  onUpdateReplaceBatches,
  onRunReplaceBatch,
  onApplySingleRule,
  onExportReplaceBatches,
  onImportReplaceBatches,
  snippets,
  onUpdateSnippets,
  onInsertSnippet,
  onExportSnippets,
  onImportSnippets,
}) => {
  const [subTab, setSubTab] = useState<"replace" | "snippet">("replace");
  const [selectedBatchId, setSelectedBatchId] = useState<string>(
    () => replaceBatches[0]?.id ?? "",
  );
  const [showBatchEditor, setShowBatchEditor] = useState<boolean>(false);
  const [batchFilter, setBatchFilter] = useState("");
  const [newBatchName, setNewBatchName] = useState("");
  const [showNewBatchForm, setShowNewBatchForm] = useState(false);

  // ルール新規追加フォーム
  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleReplacement, setNewRuleReplacement] = useState("");
  const [newRuleRegex, setNewRuleRegex] = useState(true);
  const [newRuleIgnoreCase, setNewRuleIgnoreCase] = useState(false);

  // 定型文フィルタ＆新規追加フォーム
  const [snippetFilter, setSnippetFilter] = useState("");
  const [newSnipName, setNewSnipName] = useState("");
  const [newSnipCat, setNewSnipCat] = useState("共通");
  const [newSnipBody, setNewSnipBody] = useState("");

  const activeBatch = useMemo(
    () => replaceBatches.find((b) => b.id === selectedBatchId) ?? replaceBatches[0] ?? null,
    [replaceBatches, selectedBatchId],
  );

  const filteredBatches = useMemo(() => {
    const q = batchFilter.trim().toLowerCase();
    if (!q) return replaceBatches;
    return replaceBatches.filter((b) => b.name.toLowerCase().includes(q));
  }, [replaceBatches, batchFilter]);

  const filteredSnippets = useMemo(() => {
    const q = snippetFilter.trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q),
    );
  }, [snippets, snippetFilter]);

  const updateActiveBatch = (updater: (batch: ReplaceBatch) => ReplaceBatch) => {
    if (!activeBatch) return;
    onUpdateReplaceBatches(
      replaceBatches.map((b) => (b.id === activeBatch.id ? updater(b) : b)),
    );
  };

  const handleCreateBatch = () => {
    const name = newBatchName.trim();
    if (!name) return;
    const id = `batch-${Date.now()}`;
    onUpdateReplaceBatches([...replaceBatches, { id, name, rules: [] }]);
    setSelectedBatchId(id);
    setShowBatchEditor(true);
    setNewBatchName("");
    setShowNewBatchForm(false);
  };

  const handleDeleteBatch = (id: string) => {
    const updated = replaceBatches.filter((b) => b.id !== id);
    onUpdateReplaceBatches(updated);
    if (selectedBatchId === id) {
      setSelectedBatchId(updated[0]?.id ?? "");
    }
  };

  const handleAddRule = () => {
    if (!activeBatch || !newRulePattern) return;
    const rule: ReplaceRule = {
      id: `rule-${Date.now()}`,
      name: newRuleName.trim() || `${newRulePattern} → ${newRuleReplacement || "(削除)"}`,
      pattern: newRulePattern,
      replacement: newRuleReplacement,
      useRegex: newRuleRegex,
      ignoreCase: newRuleIgnoreCase,
      multiline: true,
      enabled: true,
    };
    updateActiveBatch((b) => ({ ...b, rules: [...b.rules, rule] }));
    setNewRuleName("");
    setNewRulePattern("");
    setNewRuleReplacement("");
  };

  const handleUpdateRule = (ruleId: string, patch: Partial<ReplaceRule>) => {
    updateActiveBatch((b) => ({
      ...b,
      rules: b.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    }));
  };

  const handleDeleteRule = (ruleId: string) => {
    updateActiveBatch((b) => ({
      ...b,
      rules: b.rules.filter((r) => r.id !== ruleId),
    }));
  };

  const handleAddSnippet = () => {
    if (!newSnipName.trim() || !newSnipBody.trim()) return;
    const snip: NcSnippet = {
      id: `snip-${Date.now()}`,
      name: newSnipName.trim(),
      category: newSnipCat.trim() || "共通",
      body: newSnipBody,
    };
    onUpdateSnippets([...snippets, snip]);
    setNewSnipName("");
    setNewSnipBody("");
  };

  const handleDeleteSnippet = (id: string) => {
    onUpdateSnippets(snippets.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* 2連サブタブ：正規表現置換 / 定型文 */}
      <div className="grid grid-cols-2 bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-0.5 text-[11px]">
        <button
          onClick={() => setSubTab("replace")}
          className={`py-1 rounded font-semibold flex items-center justify-center gap-1 transition-colors ${
            subTab === "replace"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "text-[#8e95a2] hover:text-white"
          }`}
        >
          <Replace className="w-3 h-3" />
          置換 ({replaceBatches.length})
        </button>
        <button
          onClick={() => setSubTab("snippet")}
          className={`py-1 rounded font-semibold flex items-center justify-center gap-1 transition-colors ${
            subTab === "snippet"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "text-[#8e95a2] hover:text-white"
          }`}
        >
          <FileText className="w-3 h-3" />
          定型文 ({snippets.length})
        </button>
      </div>

      {/* タブ1：バッチ一発実行 ＆ 正規表現置換ルール */}
      {subTab === "replace" && (
        <div className="space-y-2.5">
          {/* 入出力・新規セットバー */}
          <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2 space-y-1.5">
            <div className="grid grid-cols-3 gap-1 text-[10.5px]">
              <button
                onClick={onImportReplaceBatches}
                className="px-1.5 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1"
                title="JSON または MIFES REPBATCH (.ini/.txt) をそのまま読み込み"
              >
                <Upload className="w-3 h-3 text-[#38bdf8] shrink-0" /> 読込
              </button>
              <button
                onClick={onExportReplaceBatches}
                className="px-1.5 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1"
                title="すべての置換セットをJSONへ書き出し"
              >
                <Download className="w-3 h-3 text-[#4ade80] shrink-0" /> 書出
              </button>
              <button
                onClick={() => setShowNewBatchForm((v) => !v)}
                className="px-1.5 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#9cdcfe] hover:text-white flex items-center justify-center gap-1"
                title="新しい置換セットを作成"
              >
                <FolderPlus className="w-3 h-3 shrink-0" /> 新規
              </button>
            </div>

            {showNewBatchForm && (
              <div className="flex items-center gap-1 pt-1 border-t border-[#2c2c2e]">
                <input
                  type="text"
                  placeholder="新セット名 (例: 1.2号→3.4号)"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateBatch();
                  }}
                  autoFocus
                  className="flex-1 min-w-0 bg-[#252526] border border-[#0078d4] rounded px-2 py-1 text-[11px] text-white focus:outline-none"
                />
                <button
                  onClick={handleCreateBatch}
                  disabled={!newBatchName.trim()}
                  className="px-2 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white text-[11px]"
                >
                  作成
                </button>
              </div>
            )}

            {replaceBatches.length > 4 && (
              <input
                type="text"
                placeholder="置換セットを検索..."
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#0078d4]"
              />
            )}
          </div>

          {/* ワンクリック一発実行バッチ一覧 */}
          <div className="space-y-1 max-h-60 overflow-y-auto pr-0.5">
            {filteredBatches.map((batch) => {
              const isSelected = activeBatch?.id === batch.id;
              const activeCount = batch.rules.filter((r) => r.enabled && r.pattern).length;
              return (
                <div
                  key={batch.id}
                  className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md border transition-colors ${
                    isSelected
                      ? "bg-[#222832] border-[#0078d4]/75"
                      : "bg-[#1e1e1e] border-[#2c2c2e] hover:border-[#424246]"
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedBatchId(batch.id);
                      setShowBatchEditor(true);
                    }}
                    className="min-w-0 flex-1 text-left flex items-center gap-1.5"
                    title={`${batch.name}（クリックして中身ルールを編集）`}
                  >
                    <span className="text-[11px] font-medium text-[#e2e8f0] truncate">
                      {batch.name}
                    </span>
                    <span className="px-1 py-0 rounded bg-[#252526] text-[9.5px] font-mono text-[#94a3b8] shrink-0">
                      {activeCount}
                    </span>
                  </button>
                  <button
                    onClick={() => onRunReplaceBatch(batch)}
                    disabled={activeCount === 0}
                    className="px-2 py-0.5 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white text-[10.5px] font-semibold flex items-center gap-1 shrink-0 transition-colors"
                    title={`「${batch.name}」の ${activeCount}件のルールを一発適用 (Ctrl+Zで戻せます)`}
                  >
                    <Play className="w-2.5 h-2.5" /> 実行
                  </button>
                </div>
              );
            })}
          </div>

          {/* 選択中バッチの詳細ルール編集アコーディオン */}
          {activeBatch && (
            <div className="pt-2 border-t border-[#2b2b2b] space-y-2">
              <div className="flex items-center justify-between gap-1">
                <button
                  onClick={() => setShowBatchEditor((v) => !v)}
                  className="flex items-center gap-1 text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider min-w-0"
                >
                  {showBatchEditor ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">編集: {activeBatch.name}</span>
                </button>
                <button
                  onClick={() => handleDeleteBatch(activeBatch.id)}
                  className="text-[#8e95a2] hover:text-[#f87171] shrink-0"
                  title="この置換セットを削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {showBatchEditor && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={activeBatch.name}
                    onChange={(e) =>
                      updateActiveBatch((b) => ({ ...b, name: e.target.value }))
                    }
                    className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
                    placeholder="セット名"
                  />

                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                    {activeBatch.rules.map((rule, idx) => {
                      const regexErr = validateRegex(rule.pattern, rule.useRegex);
                      return (
                        <div
                          key={rule.id}
                          className={`p-2 rounded-md border space-y-1.5 ${
                            regexErr
                              ? "bg-[#3a1616]/50 border-[#ef4444]"
                              : rule.enabled
                                ? "bg-[#1e1e1e] border-[#2f2f32]"
                                : "bg-[#19191b] border-[#242426] opacity-60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <label className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={(e) =>
                                  handleUpdateRule(rule.id, { enabled: e.target.checked })
                                }
                                className="accent-[#0078d4]"
                              />
                              <span className="text-[10px] font-mono text-[#787878] shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="text-[10.5px] font-medium text-[#e2e8f0] truncate">
                                {rule.name}
                              </span>
                            </label>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => onApplySingleRule(rule)}
                                disabled={!rule.pattern || Boolean(regexErr)}
                                className="px-1.5 py-0 rounded bg-[#094771] hover:bg-[#0078d4] disabled:opacity-40 text-white text-[9.5px]"
                                title="この1行ルールだけ単独適用"
                              >
                                単発
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-[#8e95a2] hover:text-[#f87171]"
                                title="削除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1 font-mono text-[10px]">
                            <input
                              type="text"
                              value={rule.pattern}
                              onChange={(e) =>
                                handleUpdateRule(rule.id, { pattern: e.target.value })
                              }
                              placeholder="検索パターン (\nで改行)"
                              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[#fca5a5]"
                            />
                            <input
                              type="text"
                              value={rule.replacement}
                              onChange={(e) =>
                                handleUpdateRule(rule.id, { replacement: e.target.value })
                              }
                              placeholder="置換後 ($1..$9, \n可 / 空欄で削除)"
                              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[#86efac]"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-[9.5px]">
                            <button
                              onClick={() =>
                                handleUpdateRule(rule.id, { useRegex: !rule.useRegex })
                              }
                              className={`px-1.5 py-0 rounded font-mono border ${
                                rule.useRegex
                                  ? "bg-[#094771] border-[#0078d4] text-[#7dd3fc]"
                                  : "bg-[#252526] border-[#3c3c3c] text-[#787878]"
                              }`}
                            >
                              .* 正規表現
                            </button>
                            <button
                              onClick={() =>
                                handleUpdateRule(rule.id, { ignoreCase: !rule.ignoreCase })
                              }
                              className={`px-1.5 py-0 rounded font-mono border ${
                                rule.ignoreCase
                                  ? "bg-[#094771] border-[#0078d4] text-[#7dd3fc]"
                                  : "bg-[#252526] border-[#3c3c3c] text-[#787878]"
                              }`}
                            >
                              Aa 大小無視
                            </button>
                          </div>

                          {regexErr && (
                            <div className="text-[10px] text-[#fca5a5] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span className="truncate">{regexErr}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ルール追加フォーム */}
                  <div className="pt-2 border-t border-[#2b2b2b] space-y-1.5">
                    <div className="text-[10px] text-[#9cdcfe] font-semibold">
                      このセットへルールを追加
                    </div>
                    <input
                      type="text"
                      placeholder="ルール名 (任意)"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
                    />
                    <input
                      type="text"
                      placeholder="検索パターン (\nで改行、正規表現可)"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-[11px] text-white"
                    />
                    <input
                      type="text"
                      placeholder="置換後 ($1..$9, \n可)"
                      value={newRuleReplacement}
                      onChange={(e) => setNewRuleReplacement(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddRule();
                      }}
                      className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-[11px] text-white"
                    />
                    <div className="flex items-center justify-between gap-2 text-[10.5px]">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newRuleRegex}
                            onChange={(e) => setNewRuleRegex(e.target.checked)}
                            className="accent-[#0078d4]"
                          />
                          <span>正規表現</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newRuleIgnoreCase}
                            onChange={(e) => setNewRuleIgnoreCase(e.target.checked)}
                            className="accent-[#0078d4]"
                          />
                          <span>大小無視</span>
                        </label>
                      </div>
                      <button
                        onClick={handleAddRule}
                        disabled={!newRulePattern}
                        className="px-2 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> 追加
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* タブ2：定型文（スニペット）入力 */}
      {subTab === "snippet" && (
        <div className="space-y-2.5">
          <div className="bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2 space-y-1.5">
            <input
              type="text"
              placeholder="定型文を検索..."
              value={snippetFilter}
              onChange={(e) => setSnippetFilter(e.target.value)}
              className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#0078d4]"
            />
            <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
              <button
                onClick={onImportSnippets}
                className="px-2 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1"
              >
                <Upload className="w-3 h-3 text-[#38bdf8]" /> 読込 (JSON)
              </button>
              <button
                onClick={onExportSnippets}
                className="px-2 py-1 rounded bg-[#252526] hover:bg-[#2f2f32] border border-[#3c3c3c] text-[#d4d4d4] hover:text-white flex items-center justify-center gap-1"
              >
                <Download className="w-3 h-3 text-[#4ade80]" /> 書き出し
              </button>
            </div>
          </div>

          {/* 定型文一覧 */}
          <div className="space-y-1.5">
            {filteredSnippets.map((snip) => (
              <div
                key={snip.id}
                className="p-2 rounded-md bg-[#1e1e1e] border border-[#2f2f32] hover:border-[#424246] space-y-1.5 transition-colors"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="px-1.5 py-0 rounded bg-[#252526] text-[9.5px] text-[#9cdcfe] shrink-0">
                      {snip.category}
                    </span>
                    <span className="text-[11px] font-medium text-[#e2e8f0] truncate">
                      {snip.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onInsertSnippet(snip)}
                      className="px-2 py-0.5 rounded bg-[#0078d4] hover:bg-[#1a8ad4] text-white text-[10.5px] flex items-center gap-0.5"
                      title="エディタの現在カーソル位置に挿入 (Ctrl+Zで戻せます)"
                    >
                      <CornerDownRight className="w-3 h-3" /> 挿入
                    </button>
                    <button
                      onClick={() => handleDeleteSnippet(snip.id)}
                      className="text-[#8e95a2] hover:text-[#f87171]"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <pre className="bg-[#181818] border border-[#2a2a2d] rounded px-2 py-1 font-mono text-[10px] text-[#9cdcfe] whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
                  {snip.body}
                </pre>
              </div>
            ))}
          </div>

          {/* 新規定型文追加 */}
          <div className="pt-2 border-t border-[#2b2b2b] space-y-1.5">
            <div className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
              定型文を追加
            </div>
            <div className="grid grid-cols-[1fr_76px] gap-1.5">
              <input
                type="text"
                placeholder="タイトル (例: G83 深穴ドリル)"
                value={newSnipName}
                onChange={(e) => setNewSnipName(e.target.value)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
              />
              <input
                type="text"
                placeholder="分類"
                value={newSnipCat}
                onChange={(e) => setNewSnipCat(e.target.value)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
              />
            </div>
            <textarea
              rows={3}
              placeholder="挿入するNCコードを入力..."
              value={newSnipBody}
              onChange={(e) => setNewSnipBody(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-[11px] text-white resize-y"
            />
            <button
              onClick={handleAddSnippet}
              disabled={!newSnipName.trim() || !newSnipBody.trim()}
              className="w-full py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white text-[11px] flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 定型文を登録
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
