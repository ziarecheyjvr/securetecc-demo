/**
 * Splits a .sql file into individual statements.
 *
 * Exists because the obvious `sql.split(";")` is wrong twice over, and both
 * failures are silent. It breaks apart `$$ ... $$` function bodies, which
 * contain semicolons; and a statement spanning several lines gets dropped
 * when the naive splitter assumes one statement per line. An earlier
 * hand-rolled version applied "8 of 8" statements from a file that had
 * twelve -- the three it swallowed included a bucket that then didn't exist.
 *
 * So: track dollar-quoting, and only treat a semicolon as a terminator when
 * outside one. Comment-only chunks are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let dollarTag: string | null = null;

  for (const line of sql.split("\n")) {
    if (dollarTag === null) {
      const open = /\$([A-Za-z_]*)\$/.exec(line);
      if (open) {
        // A tag that opens and closes on the same line stays closed.
        const closes = line.split(open[0]).length - 1;
        if (closes % 2 === 1) dollarTag = open[0];
      }
    } else if (line.includes(dollarTag)) {
      const closes = line.split(dollarTag).length - 1;
      if (closes % 2 === 1) dollarTag = null;
    }

    buf += line + "\n";

    if (dollarTag === null && line.trimEnd().endsWith(";")) {
      out.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());

  return out.filter((s) => {
    const meaningful = s
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .join("");
    return meaningful.length > 0;
  });
}
