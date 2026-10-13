// Renders raster icons from the supplied favicon SVG without altering the artwork.
// The 180 px apple icon is placed on Cream because iOS fills transparent corners with black.
import sharp from "sharp";
import fs from "node:fs";

const svg = "public/brand/zuscar-favicon.svg";
for (const size of [16, 32, 64]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/brand/zuscar-favicon-${size}.png`);
}
await sharp(svg, { density: 1152 }).resize(180, 180).flatten({ background: "#FAF6EF" }).png().toFile("app/apple-icon.png");
fs.copyFileSync(svg, "app/icon.svg");
console.log("icons rendered");
