import React, { useMemo, useState } from "react";
import { BookmarkPlus, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  BUILTIN_TOOL_PRESETS,
  type MachineConfig,
  type ParseResult,
  type ToolPreset,
  type ToolShape,
  type ToolSpec,
  getToolColor,
  toolShapeLabel,
} from "../../types/nc";

interface ToolMagazinePanelProps {
  parseResult: ParseResult | null;
  machineConfig: MachineConfig;
  onUpdateMachineConfig: (config: MachineConfig) => void;
  customToolPresets: ToolPreset[];
  activePresetId: string;
  onApplyToolPreset: (preset: ToolPreset) => void;
  onSaveToolPreset: (name: string) => void;
  onDeleteToolPreset: (id: string) => void;
}

export const ToolMagazinePanel: React.FC<ToolMagazinePanelProps> = ({
  parseResult,
  machineConfig,
  onUpdateMachineConfig,
  customToolPresets,
  activePresetId,
  onApplyToolPreset,
  onSaveToolPreset,
  onDeleteToolPreset,
}) => {
  const [toolSubTab, setToolSubTab] = useState<"t" | "d">("t");
  const [newTNum, setNewTNum] = useState("");
  const [newTDia, setNewTDia] = useState("10.0");
  const [newTShape, setNewTShape] = useState<ToolShape>("endmill");
  const [newTName, setNewTName] = useState("");
  const [newDNum, setNewDNum] = useState("");
  const [newDia, setNewDia] = useState("10.0");
  const [newPresetName, setNewPresetName] = useState("");

  const allPresets = useMemo(
    () => [...BUILTIN_TOOL_PRESETS, ...customToolPresets],
    [customToolPresets],
  );
  const selectedPreset = allPresets.find((p) => p.id === activePresetId) ?? null;

  const setToolSpec = (tNum: number, patch: Partial<ToolSpec>) => {
    const baseTools: Record<number, ToolSpec> = { ...machineConfig.tools };
    if (machineConfig.autoExtractDiameter && parseResult?.extractedTools) {
      for (const [k, v] of Object.entries(parseResult.extractedTools)) {
        const kn = Number(k);
        if (kn > 0) baseTools[kn] = { ...v };
      }
    }
    const current = baseTools[tNum] ?? { diameter: 6.0, shape: "endmill" as ToolShape, name: "" };
    baseTools[tNum] = {
      ...current,
      ...patch,
      diameter: Math.max(0, patch.diameter ?? current.diameter),
    };
    onUpdateMachineConfig({
      ...machineConfig,
      autoExtractDiameter: false,
      tools: baseTools,
    });
  };

  const addTEntry = () => {
    const tn = parseInt(newTNum, 10);
    const dia = parseFloat(newTDia);
    if (!Number.isFinite(tn) || tn <= 0 || !Number.isFinite(dia) || dia < 0) return;
    setToolSpec(tn, {
      diameter: dia,
      shape: newTShape,
      name: newTName.trim() || `${toolShapeLabel(newTShape)} Ø${dia}`,
    });
    setNewTNum("");
    setNewTName("");
  };

  const setDiameter = (dNum: number, val: number) => {
    const baseDiameters: Record<number, number> = { ...machineConfig.toolDiameters };
    if (machineConfig.autoExtractDiameter && parseResult?.extractedToolDiameters) {
      for (const [k, v] of Object.entries(parseResult.extractedToolDiameters)) {
        const kn = Number(k);
        if (kn > 0 && Number.isFinite(v)) {
          baseDiameters[kn] = v;
        }
      }
    }
    baseDiameters[dNum] = Math.max(0, val);

    onUpdateMachineConfig({
      ...machineConfig,
      autoExtractDiameter: false,
      toolDiameters: baseDiameters,
    });
  };

  const addDEntry = () => {
    const dn = parseInt(newDNum, 10);
    const dia = parseFloat(newDia);
    if (!Number.isFinite(dn) || dn <= 0 || !Number.isFinite(dia) || dia < 0) return;
    setDiameter(dn, dia);
    setNewDNum("");
  };

  const allTNumbers = Array.from(
    new Set([
      ...Object.keys(machineConfig.tools).map(Number),
      ...(parseResult?.detectedTools ?? []),
      ...Object.keys(parseResult?.extractedTools ?? {}).map(Number),
    ]),
  )
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const allDNumbers = Array.from(
    new Set([
      ...Object.keys(machineConfig.toolDiameters).map(Number),
      ...(parseResult?.detectedDNumbers ?? []),
      ...Object.keys(parseResult?.extractedToolDiameters ?? {}).map(Number),
    ]),
  )
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-3.5">
      {/* T番号 工具プリセット選択・保存 */}
      <section className="space-y-2 bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold text-[#9cdcfe] uppercase tracking-wider">
            T番号 工具プリセット
          </span>
          {selectedPreset && !selectedPreset.builtin && (
            <button
              onClick={() => onDeleteToolPreset(selectedPreset.id)}
              className="text-[10.5px] text-[#f87171] hover:underline flex items-center gap-0.5"
              title="選択中のカスタムプリセットを削除"
            >
              <Trash2 className="w-3 h-3" /> 削除
            </button>
          )}
        </div>

        <select
          value={activePresetId}
          onChange={(e) => {
            const found = allPresets.find((p) => p.id === e.target.value);
            if (found) onApplyToolPreset(found);
          }}
          className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#0078d4]"
        >
          <option value="custom-unsaved" disabled>
            — 手動編集中 / コメント抽出 —
          </option>
          <optgroup label="内蔵マガジンプリセット">
            {BUILTIN_TOOL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {customToolPresets.length > 0 && (
            <optgroup label="保存済みマイプリセット">
              {customToolPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            type="text"
            placeholder="プリセット名 (例: 1号機 アルミ)"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPresetName.trim()) {
                onSaveToolPreset(newPresetName.trim());
                setNewPresetName("");
              }
            }}
            className="flex-1 min-w-0 bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#0078d4]"
          />
          <button
            onClick={() => {
              if (!newPresetName.trim()) return;
              onSaveToolPreset(newPresetName.trim());
              setNewPresetName("");
            }}
            disabled={!newPresetName.trim()}
            className="px-2 py-1 rounded bg-[#0078d4] hover:bg-[#1a8ad4] disabled:opacity-40 text-white text-[11px] flex items-center gap-1 shrink-0 transition-colors"
            title="現在のT番号工具マガジン構成をプリセット保存"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            保存
          </button>
        </div>
      </section>

      {/* T番号 / D番号 サブタブ切替 */}
      <div className="grid grid-cols-2 bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-0.5 text-[11px]">
        <button
          onClick={() => setToolSubTab("t")}
          className={`py-1 rounded font-semibold transition-colors ${
            toolSubTab === "t"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "text-[#8e95a2] hover:text-white"
          }`}
        >
          T 工具マガジン ({allTNumbers.length})
        </button>
        <button
          onClick={() => setToolSubTab("d")}
          className={`py-1 rounded font-semibold transition-colors ${
            toolSubTab === "d"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "text-[#8e95a2] hover:text-white"
          }`}
        >
          D 径補正 ({allDNumbers.length})
        </button>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-[11.5px] px-1">
        <input
          type="checkbox"
          checked={machineConfig.autoExtractDiameter}
          onChange={(e) =>
            onUpdateMachineConfig({
              ...machineConfig,
              autoExtractDiameter: e.target.checked,
            })
          }
          className="accent-[#0078d4]"
        />
        <span>NCコメント (T=/D=) から自動抽出を優先</span>
      </label>

      {toolSubTab === "t" ? (
        <>
          <div className="space-y-1.5">
            {allTNumbers.map((tNum) => {
              const manualSpec = machineConfig.tools[tNum];
              const extractedSpec = parseResult?.extractedTools?.[tNum];
              const usingExtracted =
                machineConfig.autoExtractDiameter && extractedSpec !== undefined;
              const spec: ToolSpec = usingExtracted
                ? extractedSpec
                : (manualSpec ?? { diameter: 6.0, shape: "endmill", name: "" });
              const isUsed = parseResult?.detectedTools.includes(tNum);

              return (
                <div
                  key={tNum}
                  className={`p-2 rounded-md border space-y-1.5 transition-colors ${
                    isUsed
                      ? "bg-[#1e1e1e] border-[#0078d4]/60"
                      : "bg-[#1e1e1e]/60 border-[#2c2c2e]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-mono font-semibold text-[#e2e8f0]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getToolColor(tNum) }}
                      />
                      <span>T{String(tNum).padStart(2, "0")}</span>
                      {usingExtracted && (
                        <span title="NCコメントから自動抽出">
                          <Sparkles className="w-3 h-3 text-[#fbbf24]" />
                        </span>
                      )}
                    </div>
                    <select
                      value={spec.shape}
                      onChange={(e) =>
                        setToolSpec(tNum, { shape: e.target.value as ToolShape })
                      }
                      className="bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[10.5px] text-[#e2e8f0] focus:outline-none focus:border-[#0078d4]"
                    >
                      <option value="endmill">フラットEM</option>
                      <option value="ball">ボールEM</option>
                      <option value="drill">ドリル</option>
                      <option value="chamfer">面取/センター</option>
                      <option value="tap">タップ</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-[72px_1fr] gap-1.5 items-center">
                    <div className="relative">
                      <span className="absolute left-1.5 top-1 text-[10px] text-[#858585] font-mono">
                        Ø
                      </span>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        value={spec.diameter}
                        onChange={(e) =>
                          setToolSpec(tNum, {
                            diameter: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-[#252526] border border-[#3c3c3c] rounded pl-4 pr-1.5 py-0.5 font-mono text-right text-white text-[11px] focus:outline-none focus:border-[#0078d4]"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="工具メモ"
                      value={spec.name}
                      onChange={(e) => setToolSpec(tNum, { name: e.target.value })}
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[11px] text-[#cbd5e1] focus:outline-none focus:border-[#0078d4]"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2.5 border-t border-[#2b2b2b] space-y-1.5">
            <div className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
              T番号を追加
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                placeholder="T番号"
                min={1}
                value={newTNum}
                onChange={(e) => setNewTNum(e.target.value)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
              <input
                type="number"
                placeholder="直径mm"
                step={0.5}
                min={0}
                value={newTDia}
                onChange={(e) => setNewTDia(e.target.value)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={newTShape}
                onChange={(e) => setNewTShape(e.target.value as ToolShape)}
                className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-1.5 py-1 text-[11px] text-[#e2e8f0]"
              >
                <option value="endmill">フラットEM</option>
                <option value="ball">ボールEM</option>
                <option value="drill">ドリル</option>
                <option value="chamfer">面取</option>
                <option value="tap">タップ</option>
              </select>
              <input
                type="text"
                placeholder="工具名 (任意)"
                value={newTName}
                onChange={(e) => setNewTName(e.target.value)}
                className="flex-1 min-w-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px]"
              />
              <button
                onClick={addTEntry}
                className="px-2 py-1 bg-[#0078d4] hover:bg-[#1a8ad4] text-white rounded flex items-center"
                title="T番号を追加"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="text-[11px] text-[#8e95a2] leading-relaxed bg-[#1e1e1e] border border-[#2f2f32] rounded-md p-2">
            G41/G42 径補正のオフセット径（mm）を編集します。未登録のD番号は同番号の T工具径へ自動フォールバックされます。
          </div>

          <label className="flex items-center gap-2 cursor-pointer px-1">
            <input
              type="checkbox"
              checked={machineConfig.cornerArcRollAround}
              onChange={(e) =>
                onUpdateMachineConfig({
                  ...machineConfig,
                  cornerArcRollAround: e.target.checked,
                })
              }
              className="accent-[#0078d4]"
            />
            <span>外角コーナーにロールアラウンド円弧を挿入</span>
          </label>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[64px_1fr_54px] gap-2 text-[10.5px] text-[#858585] px-1">
              <span>補正番号</span>
              <span>補正直径 (mm)</span>
              <span className="text-right">半径R</span>
            </div>
            {allDNumbers.map((dNum) => {
              const manualVal = machineConfig.toolDiameters[dNum];
              const extractedVal = parseResult?.extractedToolDiameters[dNum];
              const usingExtracted =
                machineConfig.autoExtractDiameter && extractedVal !== undefined;
              const effectiveVal = usingExtracted
                ? extractedVal
                : (manualVal ?? machineConfig.tools[dNum]?.diameter ?? 0);
              const isUsed = parseResult?.detectedDNumbers.includes(dNum);

              return (
                <div
                  key={dNum}
                  className={`grid grid-cols-[64px_1fr_54px] items-center gap-2 px-1.5 py-1 rounded border ${
                    isUsed
                      ? "bg-[#1e1e1e] border-[#0078d4]/60"
                      : "bg-[#1e1e1e]/60 border-[#2c2c2e]"
                  }`}
                >
                  <div className="flex items-center gap-1 font-mono font-semibold text-[#e2e8f0]">
                    <span>D{String(dNum).padStart(2, "0")}</span>
                    {usingExtracted && (
                      <span
                        title={`NCコメントから自動抽出: Ø${extractedVal}mm (R${(extractedVal / 2).toFixed(2)})`}
                      >
                        <Sparkles className="w-3 h-3 text-[#fbbf24]" />
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={effectiveVal}
                    onChange={(e) => setDiameter(dNum, parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-0.5 font-mono text-right text-white focus:outline-none focus:border-[#0078d4]"
                  />
                  <span className="font-mono text-[11px] text-[#94a3b8] text-right">
                    R{(effectiveVal / 2).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2.5 border-t border-[#2b2b2b] space-y-1.5">
            <div className="text-[10.5px] text-[#9cdcfe] font-semibold uppercase tracking-wider">
              D番号を追加
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="D番号"
                min={1}
                value={newDNum}
                onChange={(e) => setNewDNum(e.target.value)}
                className="w-20 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
              <input
                type="number"
                placeholder="直径mm"
                step={0.5}
                min={0}
                value={newDia}
                onChange={(e) => setNewDia(e.target.value)}
                className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 font-mono text-xs focus:outline-none focus:border-[#0078d4]"
              />
              <button
                onClick={addDEntry}
                className="px-2 py-1 bg-[#0078d4] hover:bg-[#1a8ad4] text-white rounded flex items-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
