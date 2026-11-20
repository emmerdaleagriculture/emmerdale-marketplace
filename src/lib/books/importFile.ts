/**
 * Read a spreadsheet someone downloaded from Xero or FreshBooks into rows of
 * cells: a CSV, or the first sheet of an Excel .xlsx (Xero's reports export
 * to Excel, not CSV). Old binary .xls files aren't read. Pure: no I/O.
 */

import { unzipSync, strFromU8 } from 'fflate';
import { parseCsv } from './bankCsv';

export type Sheet = string[][];

/** UTF-8 if it is valid UTF-8, otherwise Windows-1252 (older exports). */
export function decodeText(buf: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

export function readSheet(bytes: Uint8Array): Sheet | { error: string } {
  if (isOle(bytes)) return { error: 'That’s an old Excel (.xls) file. Save it as .xlsx or CSV and try again.' };
  if (isZip(bytes)) return readXlsx(bytes);
  if (bytes.includes(0)) return { error: 'That file can’t be read. Choose the CSV or Excel (.xlsx) file you exported.' };
  return parseCsv(decodeText(bytes));
}

// ── XLSX ────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** All the <t> text inside a fragment (rich text is split into runs). */
function texts(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return unescapeXml(out);
}

/** "AB12" → column 27 (0-based). */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function firstSheetPath(files: Record<string, Uint8Array>): string | null {
  const wb = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (wb && rels) {
    // The id comes from the file: keep it to plain characters before it goes in a pattern.
    const rid = strFromU8(wb).match(/<sheet\b[^>]*\br:id="([A-Za-z0-9_-]{1,32})"/)?.[1];
    const target = rid ? strFromU8(rels).match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] : undefined;
    const alt = rid ? strFromU8(rels).match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : undefined;
    const t = target ?? alt;
    if (t) {
      const path = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
      if (files[path]) return path;
    }
  }
  const sheets = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
  return sheets[0] ?? null;
}

const MAX_UNZIPPED = 40 * 1024 * 1024;

export function readXlsx(bytes: Uint8Array): Sheet | { error: string } {
  let files: Record<string, Uint8Array>;
  let total = 0;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!((f.name.startsWith('xl/') && f.name.endsWith('.xml')) || f.name.endsWith('.rels'))) return false;
        // A small file can claim to unpack to gigabytes; a real export is a few MB at most.
        total += f.originalSize;
        if (total > MAX_UNZIPPED) throw new Error('too big');
        return true;
      },
    });
  } catch {
    return { error: 'That Excel file can’t be opened. Try exporting it again, or as CSV.' };
  }
  const path = firstSheetPath(files);
  if (!path) return { error: 'That Excel file has no sheets in it.' };
  const shared: string[] = [];
  const ss = files['xl/sharedStrings.xml'];
  if (ss) for (const m of strFromU8(ss).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));

  const rows: Sheet = [];
  const xml = strFromU8(files[path]);
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = Number(r[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    let next = 0;
    for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const type = c[1].match(/\bt="([^"]+)"/)?.[1];
      const body = c[2] ?? '';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = texts(body);
      else if (v != null) value = unescapeXml(v);
      while (cells.length < idx) cells.push('');
      cells[idx] = value;
    }
    // Keep blank rows where the sheet has gaps, so row positions stay meaningful.
    while (rows.length < rowNum - 1) rows.push([]);
    rows.push(cells);
  }
  return rows;
}
