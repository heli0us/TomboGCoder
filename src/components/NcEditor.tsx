import React, { useEffect, useRef } from "react";
import { EditorState, RangeSet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  type ViewUpdate,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import type { Diagnostic } from "../types/nc";

interface NcEditorProps {
  value: string;
  onChange: (value: string) => void;
  activeLine: number | null;
  diagnostics: Diagnostic[];
  breakpoints: number[];
  onToggleBreakpoint: (lineNumber: number) => void;
  onLineClick?: (lineNumber: number) => void;
}

// 外部から現在トレース行・診断行・ブレイクポイントをエディタへ反映する StateEffect
const setTraceLineEffect = StateEffect.define<number | null>();
const setDiagnosticsEffect = StateEffect.define<Diagnostic[]>();
const setBreakpointsEffect = StateEffect.define<number[]>();

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-bp-dot";
    el.title = "ブレイクポイント（クリックで解除）";
    return el;
  }
}

const bpMarker = new BreakpointMarker();

const breakpointStateField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const eff of tr.effects) {
      if (eff.is(setBreakpointsEffect)) {
        const sorted = [...eff.value].sort((a, b) => a - b);
        const builder = new RangeSetBuilder<GutterMarker>();
        for (const lineNo of sorted) {
          if (lineNo >= 1 && lineNo <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNo);
            builder.add(line.from, line.from, bpMarker);
          }
        }
        return builder.finish();
      }
    }
    return set;
  },
});

const traceLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const eff of tr.effects) {
      if (eff.is(setTraceLineEffect)) {
        const lineNo = eff.value;
        if (lineNo !== null && lineNo >= 1 && lineNo <= tr.state.doc.lines) {
          const line = tr.state.doc.line(lineNo);
          const builder = new RangeSetBuilder<Decoration>();
          builder.add(
            line.from,
            line.from,
            Decoration.line({ class: "cm-trace-active-line" }),
          );
          return builder.finish();
        }
        return Decoration.none;
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const diagnosticsLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const eff of tr.effects) {
      if (eff.is(setDiagnosticsEffect)) {
        const lineSeverity = new Map<number, "error" | "warning">();
        for (const d of eff.value) {
          if (d.severity === "error") {
            lineSeverity.set(d.lineNumber, "error");
          } else if (d.severity === "warning" && lineSeverity.get(d.lineNumber) !== "error") {
            lineSeverity.set(d.lineNumber, "warning");
          }
        }
        const sorted = Array.from(lineSeverity.entries()).sort((a, b) => a[0] - b[0]);
        const builder = new RangeSetBuilder<Decoration>();
        for (const [lineNo, sev] of sorted) {
          if (lineNo >= 1 && lineNo <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNo);
            builder.add(
              line.from,
              line.from,
              Decoration.line({
                class: sev === "error" ? "cm-diag-error-line" : "cm-diag-warn-line",
              }),
            );
          }
        }
        return builder.finish();
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// FANUC Gコード＋カスタムマクロB トークンハイライト（可視範囲のみ高速処理）
const TOKEN_REGEX =
  /(\([^)]*\)|;.*$|#\d+|\b(?:WHILE|DO|END|IF|THEN|GOTO|EQ|NE|GT|LT|GE|LE|AND|OR|XOR|MOD|SIN|COS|TAN|ASIN|ACOS|ATAN|SQRT|ABS|ROUND|FIX|FUP|LN|EXP)\b|\b[Oo]\d+\b|\b[Nn]\d+\b|\b[Gg]\d+(?:\.\d+)?|\b[Mm]\d+(?:\.\d+)?|\b[Xx](?:[+-]?\d*\.?\d+|#\d+)|\b[Yy](?:[+-]?\d*\.?\d+|#\d+)|\b[Zz](?:[+-]?\d*\.?\d+|#\d+)|\b[IiJjKkRr](?:[+-]?\d*\.?\d+|#\d+)|\b[FfSsTtHhDdPpQqLlAaBb](?:[+-]?\d*\.?\d+|#\d+))/gi;

const MACRO_KEYWORDS = new Set([
  "WHILE",
  "DO",
  "END",
  "IF",
  "THEN",
  "GOTO",
  "EQ",
  "NE",
  "GT",
  "LT",
  "GE",
  "LE",
  "AND",
  "OR",
  "XOR",
  "MOD",
  "SIN",
  "COS",
  "TAN",
  "ASIN",
  "ACOS",
  "ATAN",
  "SQRT",
  "ABS",
  "ROUND",
  "FIX",
  "FUP",
  "LN",
  "EXP",
]);

function buildGcodeDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      TOKEN_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TOKEN_REGEX.exec(text)) !== null) {
        const tok = match[0];
        const start = line.from + match.index;
        const end = start + tok.length;
        let cls = "";
        if (tok.startsWith("(") || tok.startsWith(";")) {
          cls = "nc-tok-comment";
        } else if (tok.startsWith("#")) {
          cls = "nc-tok-macro-var";
        } else if (MACRO_KEYWORDS.has(tok.toUpperCase())) {
          cls = "nc-tok-macro-kw";
        } else {
          const ch = tok[0].toUpperCase();
          if (ch === "G") cls = "nc-tok-g";
          else if (ch === "M") cls = "nc-tok-m";
          else if (ch === "X") cls = "nc-tok-axis-x";
          else if (ch === "Y") cls = "nc-tok-axis-y";
          else if (ch === "Z") cls = "nc-tok-axis-z";
          else if (ch === "I" || ch === "J" || ch === "K" || ch === "R") cls = "nc-tok-ijk";
          else if (ch === "O" || ch === "N") cls = "nc-tok-prog";
          else cls = "nc-tok-param";
        }
        if (cls) {
          builder.add(start, end, Decoration.mark({ class: cls }));
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const gcodeHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildGcodeDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildGcodeDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

const vscodeDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
    },
    ".cm-content": {
      caretColor: "#aeafad",
      padding: "6px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#aeafad",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#264f78",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
    },
  },
  { dark: true },
);

export const NcEditor: React.FC<NcEditorProps> = ({
  value,
  onChange,
  activeLine,
  diagnostics,
  breakpoints,
  onToggleBreakpoint,
  onLineClick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onLineClickRef = useRef(onLineClick);
  const onToggleBpRef = useRef(onToggleBreakpoint);
  const suppressEmitRef = useRef(false);

  onChangeRef.current = onChange;
  onLineClickRef.current = onLineClick;
  onToggleBpRef.current = onToggleBreakpoint;

  useEffect(() => {
    if (!containerRef.current) return;

    const breakpointGutter = gutter({
      class: "cm-breakpoint-gutter",
      markers: (v) => v.state.field(breakpointStateField),
      initialSpacer: () => bpMarker,
      domEventHandlers: {
        mousedown(view, line) {
          const lineNo = view.state.doc.lineAt(line.from).number;
          onToggleBpRef.current(lineNo);
          return true;
        },
      },
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        breakpointStateField,
        breakpointGutter,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        search({ top: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        vscodeDarkTheme,
        gcodeHighlightPlugin,
        traceLineField,
        diagnosticsLineField,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressEmitRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet && update.transactions.some((t) => t.isUserEvent("select"))) {
            const head = update.state.selection.main.head;
            const lineNo = update.state.doc.lineAt(head).number;
            onLineClickRef.current?.(lineNo);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 初期化はマウント時のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部からのソース更新を同期
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      suppressEmitRef.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      suppressEmitRef.current = false;
    }
  }, [value]);

  // 現在トレース行のハイライト＆自動スクロール
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const effects: StateEffect<unknown>[] = [setTraceLineEffect.of(activeLine)];
    if (activeLine !== null && activeLine >= 1 && activeLine <= view.state.doc.lines) {
      const line = view.state.doc.line(activeLine);
      effects.push(EditorView.scrollIntoView(line.from, { y: "nearest" }));
    }
    view.dispatch({ effects });
  }, [activeLine]);

  // 診断エラー・警告行のハイライト
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setDiagnosticsEffect.of(diagnostics) });
  }, [diagnostics]);

  // ブレイクポイント反映
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setBreakpointsEffect.of(breakpoints) });
  }, [breakpoints]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
};
