import { Linking, Text, View } from "react-native";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { radius, space, type as typeScale } from "@/theme/tokens";
import { AppText } from "./ui";

/**
 * Renders the model's lightweight markdown (headings, lists, quotes, simple
 * tables, **bold**, `code`, links and [Source N] markers) as native text.
 * The block parser is a port of dashboard/src/components/structured-answer.tsx.
 */
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbers"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

const isTableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, " · ").replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  const collect = (pattern: RegExp) => {
    const items: string[] = [];
    while (index < lines.length && pattern.test(lines[index].trim())) { items.push(lines[index].trim().replace(pattern, "")); index += 1; }
    return items;
  };
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || /^[|:\-\s]+$/.test(line)) { index += 1; continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { blocks.push({ kind: "heading", text: heading[2] }); index += 1; continue; }
    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
      const headers = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) { rows.push(cells(lines[index])); index += 1; }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }
    if (/^[-*]\s+/.test(line)) { blocks.push({ kind: "bullets", items: collect(/^[-*]\s+/) }); continue; }
    if (/^\d+[.)]\s+/.test(line)) { blocks.push({ kind: "numbers", items: collect(/^\d+[.)]\s+/) }); continue; }
    if (line.startsWith(">")) { blocks.push({ kind: "quote", text: collect(/^>\s?/).join(" ") }); continue; }
    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^(#{1,4})\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next) || next.startsWith(">") || (index + 1 < lines.length && next.includes("|") && isTableDivider(lines[index + 1]))) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

function Inline({ text }: { text: string }) {
  const { colors } = useTheme();
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\)|\[Source\s*\d+\])/gi).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <Text key={index} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>;
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <Text key={index} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>;
        if (part.startsWith("`") && part.endsWith("`")) return <Text key={index} style={[typeScale.mono, { backgroundColor: colors.raised }]}>{part.slice(1, -1)}</Text>;
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (link) return <Text key={index} accessibilityRole="link" style={{ color: colors.accent, textDecorationLine: "underline" }} onPress={() => void Linking.openURL(link[2])}>{link[1]}</Text>;
        if (/^\[Source\s*\d+\]$/i.test(part)) return <Text key={index} style={{ color: colors.accent, fontWeight: "600" }}>{part.replace(/\s+/g, " ")}</Text>;
        return <Text key={index}>{part.replaceAll("**", "")}</Text>;
      })}
    </>
  );
}

export function StructuredAnswer({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      {parseBlocks(text).map((block, index) => {
        if (block.kind === "heading") return <AppText key={index} variant="heading"><Inline text={block.text} /></AppText>;
        if (block.kind === "paragraph") return <AppText key={index} selectable><Inline text={block.text} /></AppText>;
        if (block.kind === "quote") return <View key={index} style={styles.quote}><AppText tone="muted"><Inline text={block.text} /></AppText></View>;
        if (block.kind === "bullets" || block.kind === "numbers") {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listItem}>
                  <AppText tone="muted" style={styles.marker}>{block.kind === "bullets" ? "•" : `${itemIndex + 1}.`}</AppText>
                  <AppText style={styles.flex} selectable><Inline text={item} /></AppText>
                </View>
              ))}
            </View>
          );
        }
        return (
          <View key={index} style={styles.list}>
            {block.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow}>
                {row.map((value, cellIndex) => (
                  <View key={cellIndex}>
                    <AppText variant="caption" tone="faint">{block.headers[cellIndex] || `Field ${cellIndex + 1}`}</AppText>
                    <AppText variant="small"><Inline text={value} /></AppText>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  stack: { gap: space.md },
  quote: { borderLeftWidth: 3, borderLeftColor: c.lineStrong, paddingLeft: space.md },
  list: { gap: space.sm },
  listItem: { flexDirection: "row", gap: space.sm },
  marker: { minWidth: 18 },
  flex: { flex: 1 },
  tableRow: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.raised },
}));
