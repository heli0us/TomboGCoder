import type { ReplaceBatch, ReplaceRule } from "../types/nc";

/** \n や \t のエスケープ表記を実文字へ展開（\\n はリテラル \n として保持） */
function unescapeControlChars(text: string): string {
  return text.replace(/\\([nt\\])/g, (_, ch: string) => {
    if (ch === "n") return "\n";
    if (ch === "t") return "\t";
    return "\\";
  });
}

/**
 * 複数の置換ルールを先頭から順に適用する（複数行・正規表現・$1..\9 後方参照対応）
 */
export function applyReplaceRulesToText(
  source: string,
  rules: ReplaceRule[],
): { text: string; hitCount: number; appliedRules: number; error?: string } {
  const active = rules.filter((r) => r.enabled && r.pattern.length > 0);
  if (active.length === 0) {
    return { text: source, hitCount: 0, appliedRules: 0 };
  }

  // CRLF が混ざっていても \n ベースの複数行ルールが一致するよう一時正規化
  const usesCrlf = source.includes("\r\n");
  let next = usesCrlf ? source.replace(/\r\n/g, "\n") : source;
  let hitCount = 0;
  let appliedRules = 0;

  for (const rule of active) {
    try {
      if (rule.useRegex) {
        const flags = `g${rule.ignoreCase ? "i" : ""}${rule.multiline ? "m" : ""}`;
        const re = new RegExp(rule.pattern, flags);
        let localHits = 0;
        const replTemplate = rule.replacement;

        next = next.replace(re, (...args) => {
          localHits += 1;
          // args: [fullMatch, cap1, cap2, ..., offset, wholeString]
          const fullMatch = args[0] as string;
          const captures = args.slice(1, -2) as Array<string | undefined>;

          // $&, $1..$9, \1..\9, \n, \t を正確に展開
          let out = "";
          for (let i = 0; i < replTemplate.length; i++) {
            const ch = replTemplate[i];
            if (ch === "$" && i + 1 < replTemplate.length) {
              const nxt = replTemplate[i + 1];
              if (nxt === "$") {
                out += "$";
                i += 1;
                continue;
              }
              if (nxt === "&") {
                out += fullMatch;
                i += 1;
                continue;
              }
              if (nxt >= "1" && nxt <= "9") {
                const idx = Number(nxt) - 1;
                out += captures[idx] ?? "";
                i += 1;
                continue;
              }
            } else if (ch === "\\" && i + 1 < replTemplate.length) {
              const nxt = replTemplate[i + 1];
              if (nxt === "n") {
                out += "\n";
                i += 1;
                continue;
              }
              if (nxt === "t") {
                out += "\t";
                i += 1;
                continue;
              }
              if (nxt === "\\") {
                out += "\\";
                i += 1;
                continue;
              }
              if (nxt >= "1" && nxt <= "9") {
                const idx = Number(nxt) - 1;
                out += captures[idx] ?? "";
                i += 1;
                continue;
              }
            }
            out += ch;
          }
          return out;
        });

        if (localHits > 0) {
          hitCount += localHits;
          appliedRules += 1;
        }
      } else {
        const literalPat = unescapeControlChars(rule.pattern);
        const literalRepl = unescapeControlChars(rule.replacement);
        const escaped = literalPat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(escaped, rule.ignoreCase ? "gi" : "g");
        let localHits = 0;
        next = next.replace(re, () => {
          localHits += 1;
          return literalRepl;
        });
        if (localHits > 0) {
          hitCount += localHits;
          appliedRules += 1;
        }
      }
    } catch (err) {
      return {
        text: source,
        hitCount: 0,
        appliedRules: 0,
        error: `置換ルール「${rule.name}」の正規表現エラー: ${String(err)}`,
      };
    }
  }

  const finalText = usesCrlf ? next.replace(/\n/g, "\r\n") : next;
  return { text: finalText, hitCount, appliedRules };
}

/** MIFES のワイルドカード (* / ?) と \1..\9 を JS 正規表現・$1..$9 へ変換 */
export function convertMifesEntryToRule(
  rawPattern: string,
  rawReplacement: string,
  flagsHex: number,
  id: string,
): ReplaceRule {
  const isWildcard = (flagsHex & 0x02) !== 0;
  // MIFES 0x10 ビットは「大文字小文字を区別」or 検索オプション。NCコードは大文字主体のため false を基本とする
  const ignoreCase = false;

  if (!isWildcard) {
    // 通常置換（ただし \n が含まれるのでそのまま保持。applyReplaceRulesToText が \n を改行扱いする）
    return {
      id,
      name: `${rawPattern} → ${rawReplacement || "(削除)"}`,
      pattern: rawPattern,
      replacement: rawReplacement,
      useRegex: false,
      ignoreCase,
      multiline: true,
      enabled: true,
    };
  }

  // ワイルドカード有効時：* -> ([^\n]*?)、? -> ([^\n])、\n -> \n、他メタ文字はすべてエスケープ
  let regexPat = "";
  let hasWildcardToken = false;
  for (let i = 0; i < rawPattern.length; i++) {
    const ch = rawPattern[i];
    if (ch === "\\" && i + 1 < rawPattern.length) {
      const nxt = rawPattern[i + 1];
      if (nxt === "n") {
        regexPat += "\\n";
        i += 1;
        continue;
      }
      if (nxt === "t") {
        regexPat += "\\t";
        i += 1;
        continue;
      }
    }
    if (ch === "*") {
      // パターン末尾の * は行末まで最長一致（非貪欲 *? だと 0文字にマッチして行末座標が取り残されるため）
      const isAtPatternEnd = i === rawPattern.length - 1;
      regexPat += isAtPatternEnd ? "([^\\n]*)" : "([^\\n]*?)";
      hasWildcardToken = true;
    } else if (ch === "?") {
      regexPat += "([^\\n])";
      hasWildcardToken = true;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      regexPat += `\\${ch}`;
    } else {
      regexPat += ch;
    }
  }

  if (!hasWildcardToken) {
    // ワイルドカード記号を実際に含まない行は高速な通常置換として扱う
    return {
      id,
      name: `${rawPattern} → ${rawReplacement || "(削除)"}`,
      pattern: rawPattern,
      replacement: rawReplacement,
      useRegex: false,
      ignoreCase,
      multiline: true,
      enabled: true,
    };
  }

  // 置換後の \1..\9 を $1..$9 へ変換（$ は $$ へエスケープ）
  const jsReplacement = rawReplacement
    .replace(/\$/g, "$$$$")
    .replace(/\\([1-9])/g, "$$$1");

  return {
    id,
    name: `${rawPattern.slice(0, 28)}${rawPattern.length > 28 ? "…" : ""}`,
    pattern: regexPat,
    replacement: jsReplacement,
    useRegex: true,
    ignoreCase,
    multiline: true,
    enabled: true,
  };
}

/** MIFES の見出し用ダミー1行目かどうかを判定（日本語を含む かつ NCコード行ではない） */
function isMifesTitleLine(searchStr: string, replStr: string, groupLength: number): boolean {
  if (groupLength <= 1) return false;
  const hasNonAscii = /[^\x20-\x7e]/.test(searchStr) || /[^\x20-\x7e]/.test(replStr);
  const looksLikeGcode =
    /^(?:\/)?(?:G\d|M\d|T\d|H\d|F\d|X|Y|Z|C|\.|\\n)/i.test(searchStr.trim()) &&
    !/[ぁ-んァ-ヶ一-龠]/.test(searchStr);
  return hasNonAscii && !looksLikeGcode;
}

/** MIFES の REPBATCH 設定テキストを TomboGCoder の ReplaceBatch[] へ一括変換 */
export function parseMifesRepbatchText(rawText: string): ReplaceBatch[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const grouped = new Map<
    string,
    Array<{ flagsHex: number; search: string; replace: string }>
  >();
  const groupOrder: string[] = [];

  for (const line of lines) {
    const m = /^REPBATCH(\d+)=0x([0-9a-fA-F]+),(.*)$/.exec(line);
    if (!m) continue;
    const batchNum = m[1];
    const flagsHex = parseInt(m[2], 16);
    const rest = m[3];
    const tabIdx = rest.indexOf("\t");
    const search = tabIdx >= 0 ? rest.slice(0, tabIdx) : rest;
    const replace = tabIdx >= 0 ? rest.slice(tabIdx + 1) : "";

    if (!grouped.has(batchNum)) {
      grouped.set(batchNum, []);
      groupOrder.push(batchNum);
    }
    grouped.get(batchNum)!.push({ flagsHex, search, replace });
  }

  const batches: ReplaceBatch[] = [];
  for (const num of groupOrder) {
    const items = grouped.get(num) ?? [];
    if (items.length === 0) continue;

    let batchName = `バッチ ${num}`;
    let startIdx = 0;

    if (isMifesTitleLine(items[0].search, items[0].replace, items.length)) {
      const joined = [items[0].search.trim(), items[0].replace.trim()]
        .filter(Boolean)
        .join(" ");
      batchName = joined || batchName;
      startIdx = 1;
    } else if (items.length === 1) {
      const s = items[0].search.trim();
      const r = items[0].replace.trim();
      batchName =
        s.length <= 24
          ? `${s} → ${r || "(削除)"}`
          : `バッチ ${num} (${s.slice(0, 18)}…)`;
    }

    const rules: ReplaceRule[] = [];
    for (let i = startIdx; i < items.length; i++) {
      const it = items[i];
      if (!it.search) continue;
      rules.push(
        convertMifesEntryToRule(
          it.search,
          it.replace,
          it.flagsHex,
          `mifes-b${num}-r${i + 1}`,
        ),
      );
    }

    if (rules.length > 0) {
      batches.push({
        id: `mifes-batch-${num}`,
        name: batchName,
        rules,
      });
    }
  }

  return batches;
}

/** 旧MIFES変換で末尾が非貪欲 ([^\n]*?) になっていたパターンを行末最長一致 ([^\n]*) へ補正 */
export function normalizeReplaceRulePattern(pattern: string, useRegex: boolean): string {
  if (useRegex && pattern.endsWith("([^\\n]*?)")) {
    return `${pattern.slice(0, -"([^\\n]*?)".length)}([^\\n]*)`;
  }
  return pattern;
}

/** 保存済み置換バッチ配列の既知の変換バグを自動修復 */
export function repairReplaceBatches(batches: ReplaceBatch[]): ReplaceBatch[] {
  return batches.map((b) => ({
    ...b,
    rules: (b.rules ?? []).map((r) => ({
      ...r,
      pattern: normalizeReplaceRulePattern(r.pattern, Boolean(r.useRegex)),
    })),
  }));
}

/** JSON（新バッチ形式 / 旧フラット形式）または MIFES REPBATCH テキストを自動判別してインポート */
export function parseImportedReplaceBatches(rawText: string): ReplaceBatch[] {
  const trimmed = rawText.trim();
  if (/^REPBATCH\d+=/m.test(trimmed)) {
    const batches = parseMifesRepbatchText(trimmed);
    if (batches.length === 0) {
      throw new Error("MIFES REPBATCH 形式の有効なルールが見つかりませんでした。");
    }
    return batches;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  const normalizeRule = (r: Partial<ReplaceRule>, idx: number): ReplaceRule => {
    const useRegex = Boolean(r.useRegex);
    const rawPattern = typeof r.pattern === "string" ? r.pattern : "";
    return {
      id: r.id && typeof r.id === "string" ? r.id : `rule-imp-${Date.now()}-${idx}`,
      name: r.name && typeof r.name === "string" ? r.name : rawPattern || `ルール ${idx + 1}`,
      pattern: normalizeReplaceRulePattern(rawPattern, useRegex),
      replacement: typeof r.replacement === "string" ? r.replacement : "",
      useRegex,
      ignoreCase: Boolean(r.ignoreCase),
      multiline: r.multiline !== false,
      enabled: r.enabled !== false,
    };
  };

  // 1) 新形式: { format: "replace-batches", batches: [...] }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as { batches?: unknown }).batches)
  ) {
    const rawBatches = (parsed as { batches: unknown[] }).batches;
    const batches: ReplaceBatch[] = rawBatches
      .filter(
        (b): b is Partial<ReplaceBatch> =>
          Boolean(b && typeof b === "object" && Array.isArray((b as ReplaceBatch).rules)),
      )
      .map((b, bIdx) => ({
        id: b.id && typeof b.id === "string" ? b.id : `batch-imp-${Date.now()}-${bIdx}`,
        name: b.name && typeof b.name === "string" ? b.name : `インポート ${bIdx + 1}`,
        rules: ((b.rules ?? []) as unknown[])
          .filter(
            (r): r is Partial<ReplaceRule> =>
              Boolean(r && typeof r === "object" && typeof (r as ReplaceRule).pattern === "string"),
          )
          .map(normalizeRule),
      }))
      .filter((b) => b.rules.length > 0);
    if (batches.length > 0) return batches;
  }

  // 2) 旧形式: { rules: [...] } または ReplaceRule[]
  const rawRules = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { rules?: unknown }).rules)
      ? (parsed as { rules: unknown[] }).rules
      : [];
  const validRules = rawRules
    .filter(
      (x): x is Partial<ReplaceRule> =>
        Boolean(x && typeof x === "object" && typeof (x as ReplaceRule).pattern === "string"),
    )
    .map(normalizeRule);

  if (validRules.length > 0) {
    return [
      {
        id: `batch-imp-${Date.now()}`,
        name: "インポート置換セット",
        rules: validRules,
      },
    ];
  }

  throw new Error("有効な置換バッチ・ルールが見つかりませんでした。");
}
