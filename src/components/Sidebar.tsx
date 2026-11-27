import React from "react";
import type {
  AutoBreakConfig,
  DisplayOptions,
  MachineConfig,
  MachineProfile,
  NcSnippet,
  ParseResult,
  ReplaceBatch,
  ReplaceRule,
} from "../types/nc";
import { FilterPanel } from "./sidebar/FilterPanel";
import { MachineProfilePanel } from "./sidebar/MachineProfilePanel";
import { EditToolsPanel } from "./sidebar/EditToolsPanel";
import { DebugPanel } from "./sidebar/DebugPanel";

export type SidebarTab = "filter" | "machine" | "edit" | "debug";

interface SidebarProps {
  activeTab: SidebarTab;
  parseResult: ParseResult | null;
  displayOptions: DisplayOptions;
  onUpdateDisplayOptions: (patch: Partial<DisplayOptions>) => void;
  onFocusProgram?: (prog: string, firstLine: number) => void;
  machineProfiles: MachineProfile[];
  activeMachineProfile: MachineProfile;
  onSelectMachineProfile: (id: string) => void;
  onUpdateActiveMachineConfig: (config: MachineConfig) => void;
  onDuplicateMachineProfile: (newName: string) => void;
  onDeleteMachineProfile: (id: string) => void;
  onResetBuiltinMachineProfile: (id: string) => void;
  onExportActiveMachineProfile: () => void;
  onExportAllMachineProfiles: () => void;
  onImportMachineProfiles: () => void;
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
  breakpoints: number[];
  onToggleBreakpoint: (lineNumber: number) => void;
  onClearBreakpoints: () => void;
  onJumpToLine: (lineNumber: number) => void;
  autoBreak: AutoBreakConfig;
  onUpdateAutoBreak: (patch: Partial<AutoBreakConfig>) => void;
}

const TITLES: Record<SidebarTab, string> = {
  filter: "表示フィルタ & ストック",
  machine: "マシン設定 (工具・径補正・仕様)",
  edit: "正規表現置換 & 定型文",
  debug: "ブレイクポイント & 自動停止",
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
        {props.activeTab === "machine" && (
          <MachineProfilePanel
            profiles={props.machineProfiles}
            activeProfile={props.activeMachineProfile}
            parseResult={props.parseResult}
            onSelectProfile={props.onSelectMachineProfile}
            onUpdateActiveConfig={props.onUpdateActiveMachineConfig}
            onDuplicateProfile={props.onDuplicateMachineProfile}
            onDeleteProfile={props.onDeleteMachineProfile}
            onResetBuiltinProfile={props.onResetBuiltinMachineProfile}
            onExportActiveProfile={props.onExportActiveMachineProfile}
            onExportAllProfiles={props.onExportAllMachineProfiles}
            onImportProfiles={props.onImportMachineProfiles}
          />
        )}
        {props.activeTab === "edit" && (
          <EditToolsPanel
            replaceBatches={props.replaceBatches}
            onUpdateReplaceBatches={props.onUpdateReplaceBatches}
            onRunReplaceBatch={props.onRunReplaceBatch}
            onApplySingleRule={props.onApplySingleRule}
            onExportReplaceBatches={props.onExportReplaceBatches}
            onImportReplaceBatches={props.onImportReplaceBatches}
            snippets={props.snippets}
            onUpdateSnippets={props.onUpdateSnippets}
            onInsertSnippet={props.onInsertSnippet}
            onExportSnippets={props.onExportSnippets}
            onImportSnippets={props.onImportSnippets}
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
      </div>
    </div>
  );
};
