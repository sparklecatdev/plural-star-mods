// A deliberately small HTML table subset; unsupported markup falls back to rich text.
export type TableCell = {text: string; header: boolean; css: string};
export type FieldPart = {kind: 'text'; text: string} | {kind: 'table'; rows: TableCell[][]};
const entities: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0'};
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, name: string) => {
    if (name[0] !== '#') return entities[name.toLowerCase()] || all;
    const value = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : all;
  });
}
export function parseFieldTables(text: string): FieldPart[] | null {
  if (text.length > 65536 || !/<table\b/i.test(text)) return null;
  const parts: FieldPart[] = [];
  const tables = /<table\b([^>]*)>([\s\S]*?)<\/table\s*>/gi;
  let match: RegExpExecArray | null; let end = 0;
  while ((match = tables.exec(text))) {
    if (/<\/?table\b/i.test(match[2]) || /<\/?table\b/i.test(text.slice(end, match.index))) return null;
    const rows: TableCell[][] = [];
    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    let row: RegExpExecArray | null; let rest = match[2];
    while ((row = rowPattern.exec(match[2]))) {
      const cells: TableCell[] = []; let remaining = row[1];
      const cellPattern = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
      let cell: RegExpExecArray | null;
      while ((cell = cellPattern.exec(row[1]))) {
        if (/\b(?:rowspan|colspan)\s*=/i.test(cell[2]) || /<(?!br\s*\/?\s*>)/i.test(cell[3])) return null;
        const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(cell[2]);
        cells.push({text: decode(cell[3].replace(/<br\s*\/?\s*>/gi, '\n').trim()), header: cell[1].toLowerCase() === 'th', css: style ? style[1] || style[2] || '' : ''});
        remaining = remaining.replace(cell[0], '');
      }
      if (remaining.trim() || !cells.length || cells.length > 20) return null;
      rows.push(cells); rest = rest.replace(row[0], '');
    }
    if (!rows.length || rows.length > 50 || rest.replace(/<\/?(?:thead|tbody|tfoot)\b[^>]*>/gi, '').trim()) return null;
    if (rows.some(row => row.length !== rows[0].length)) return null;
    if (match.index > end) parts.push({kind: 'text', text: text.slice(end, match.index)});
    parts.push({kind: 'table', rows}); end = tables.lastIndex;
  }
  if (!parts.length || /<\/?table\b/i.test(text.slice(end))) return null;
  if (end < text.length) parts.push({kind: 'text', text: text.slice(end)});
  return parts;
}
