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
// The receipt logo's PNG size must match RECEIPT_LOGO in lib/print.ts (read from the PNG IHDR header).
const printSrc = fs.readFileSync(path.join(process.cwd(), "lib", "print.ts"), "utf8");
const rl = printSrc.match(/RECEIPT_LOGO = \{ src: "\/brand\/([^"]+)", width: (\d+), height: (\d+)/);
if (!rl) throw new Error("RECEIPT_LOGO not found in lib/print.ts");
const png = fs.readFileSync(path.join(dir, rl[1]));
const [pw, ph] = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (String(pw) !== rl[2] || String(ph) !== rl[3]) { console.error(`MISMATCH ${rl[1]}: png=${pw}x${ph} print.ts=${rl[2]}x${rl[3]}`); bad++; }
else console.log(`ok ${rl[1]} ${pw}x${ph}`);
for (const f of ["zuscar-receipt-logo.png", "zuscar-favicon-16.png", "zuscar-favicon-32.png", "zuscar-favicon-64.png"]) {
  if (!fs.existsSync(path.join(dir, f))) { console.error(`MISSING ${f}`); bad++; }
}
process.exit(bad ? 1 : 0);
