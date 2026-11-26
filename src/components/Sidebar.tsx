import React from "react";
import type {
  AutoBreakConfig,
  DisplayOptions,
  MachineConfig,
  ParseResult,
  ToolPreset,
} from "../types/nc";
import { FilterPanel } from "./sidebar/FilterPanel";
import { ToolMagazinePanel } from "./sidebar/ToolMagazinePanel";
import { DebugPanel } from "./sidebar/DebugPanel";
import { MachinePanel } from "./sidebar/MachinePanel";

export type SidebarTab = "filter" | "tools" | "debug" | "machine";

interface SidebarProps {
  activeTab: SidebarTab;
  parseResult: ParseResult | null;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  onFocusProgram?: (prog: string, firstLine: number) => void;
  machineConfig: MachineConfig;
  onUpdateMachineConfig: (config: MachineConfig) => void;
  customToolPresets: ToolPreset[];
  activePresetId: string;
  onApplyToolPreset: (preset: ToolPreset) => void;
  onSaveToolPreset: (name: string) => void;
  onDeleteToolPreset: (id: string) => void;
  breakpoints: number[];
  onToggleBreakpoint: (lineNumber: number) => void;
  onClearBreakpoints: () => void;
  onJumpToLine: (lineNumber: number) => void;
  autoBreak: AutoBreakConfig;
  onUpdateAutoBreak: (patch: Partial<AutoBreakConfig>) => void;
}

const TITLES: Record<SidebarTab, string> = {
  filter: "表示フィルタ & レイヤー",
  tools: "工具マガジン (T) & 径補正 (D)",
  debug: "ブレイクポイント & 自動停止",
  machine: "機械パラメータ (サイクルタイム)",
};

export const Sidebar: React.FC<SidebarProps> = (props) => {
  return (
    <div className="h-full w-full bg-[#181818] border-r border-[#2b2b2b] flex flex-col overflow-hidden">
      <div className="h-9 px-3 flex items-center justify-between border-b border-[#2b2b2b] text-[11px] font-semibold uppercase tracking-wider text-[#b4b4b4] shrink-0">
        {TITLES[props.activeTab]}
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {props.activeTab === "filter" && (
          <FilterPanel
            parseResult={props.parseResult}
            displayOptions={props.displayOptions}
            onUpdateDisplayOptions={props.onUpdateDisplayOptions}
            onFocusProgram={props.onFocusProgram}
          />
        )}
        {props.activeTab === "tools" && (
          <ToolMagazinePanel
            parseResult={props.parseResult}
            machineConfig={props.machineConfig}
            onUpdateMachineConfig={props.onUpdateMachineConfig}
            customToolPresets={props.customToolPresets}
            activePresetId={props.activePresetId}
            onApplyToolPreset={props.onApplyToolPreset}
            onSaveToolPreset={props.onSaveToolPreset}
            onDeleteToolPreset={props.onDeleteToolPreset}
          />
        )}
        {props.activeTab === "debug" && (
          <DebugPanel
            breakpoints={props.breakpoints}
            onToggleBreakpoint={props.onToggleBreakpoint}
            onClearBreakpoints={props.onClearBreakpoints}
            onJumpToLine={props.onJumpToLine}
            autoBreak={props.autoBreak}
            onUpdateAutoBreak={props.onUpdateAutoBreak}
          />
        )}
        {props.activeTab === "machine" && (
          <MachinePanel
            machineConfig={props.machineConfig}
            onUpdateMachineConfig={props.onUpdateMachineConfig}
          />
        )}
      </div>
    </div>
  );
};
