// Verifies lib/brand.ts dimensions against each supplied SVG's viewBox and that files exist.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "brand");
const src = fs.readFileSync(path.join(process.cwd(), "lib", "brand.ts"), "utf8");
const entries = [...src.matchAll(/src: "\/brand\/([^"]+)", width: (\d+), height: (\d+)/g)];
if (entries.length !== 6) throw new Error(`expected 6 brand entries, found ${entries.length}`);
let bad = 0;
for (const [, file, w, h] of entries) {
  const svg = fs.readFileSync(path.join(dir, file), "utf8");
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!vb || vb[1] !== w || vb[2] !== h) { console.error(`MISMATCH ${file}: viewBox=${vb?.slice(1).join("x")} brand.ts=${w}x${h}`); bad++; }
  else console.log(`ok ${file} ${w}x${h}`);
}
for (const f of ["zuscar-receipt-logo.png", "zuscar-favicon-16.png", "zuscar-favicon-32.png", "zuscar-favicon-64.png"]) {
  if (!fs.existsSync(path.join(dir, f))) { console.error(`MISSING ${f}`); bad++; }
}
process.exit(bad ? 1 : 0);
