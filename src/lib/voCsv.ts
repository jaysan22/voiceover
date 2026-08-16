import type { Character, VoRegion } from "@/lib/pack";

export function formatTimecode(ms: number) {
  const clamped = Math.max(0, ms);
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const frac = Math.floor(clamped % 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(frac).padStart(3, "0")}`;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function exportVoCsv(opts: {
  characters: Character[];
  regions: VoRegion[];
}) {
  const header = ["kind", "start_ms", "end_ms", "start", "end", "character", "character_id", "text"];
  const lines = [header.join(",")];
  for (const c of opts.characters) {
    lines.push(["character", "", "", "", "", csvEscape(c.name), csvEscape(c.id), ""].join(","));
  }
  for (const r of [...opts.regions].sort((a, b) => a.startMs - b.startMs)) {
    const name = opts.characters.find((c) => c.id === r.characterId)?.name ?? r.characterId;
    lines.push(
      [
        "vo",
        String(Math.round(r.startMs)),
        String(Math.round(r.endMs)),
        formatTimecode(r.startMs),
        formatTimecode(r.endMs),
        csvEscape(name),
        csvEscape(r.characterId),
        csvEscape(r.text),
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function importVoCsv(
  raw: string,
  existing: Character[],
  palette: string[],
): { characters: Character[]; regions: VoRegion[] } {
  const rows = parseCsv(raw.replace(/^\uFEFF/, "").trim());
  if (!rows.length) return { characters: existing, regions: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const named = header.includes("start_ms") || header.includes("kind") || header.includes("character");
  const body = named ? rows.slice(1) : rows;
  const col = (row: string[], name: string, fallback: number) => {
    const i = named ? header.indexOf(name) : -1;
    return (i >= 0 ? row[i] : row[fallback]) ?? "";
  };

  const characters = existing.map((c) => ({ ...c }));
  const ensureCharacter = (name: string, idHint?: string) => {
    const n = name.trim() || "Speaker";
    if (["everyone", "all", "chorus"].includes(n.toLowerCase())) return "all";
    const byId = idHint ? characters.find((c) => c.id === idHint) : undefined;
    if (byId) {
      if (n) byId.name = n;
      return byId.id;
    }
    const byName = characters.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (byName) return byName.id;
    const id =
      idHint && !characters.some((c) => c.id === idHint)
        ? idHint
        : `c${characters.length + 1}`;
    characters.push({
      id,
      name: n,
      color: palette[characters.length % palette.length],
    });
    return id;
  };

  const regions: VoRegion[] = [];
  for (const row of body) {
    const kind = col(row, "kind", 0).trim().toLowerCase();
    if (kind === "character") {
      ensureCharacter(col(row, "character", 5) || col(row, "name", 1), col(row, "character_id", 6) || undefined);
      continue;
    }
    const start = Number(col(row, "start_ms", kind ? 1 : 0));
    const end = Number(col(row, "end_ms", kind ? 2 : 1));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const character = col(row, "character", kind ? 5 : 2);
    const characterId = col(row, "character_id", 6);
    const text = col(row, "text", kind ? 7 : 3);
    regions.push({
      id: crypto.randomUUID().slice(0, 8),
      startMs: start,
      endMs: end,
      characterId: ensureCharacter(character, characterId || undefined),
      text: String(text).trim() || "Line",
    });
  }

  return { characters, regions };
}
