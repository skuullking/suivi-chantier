/** Generates PWA icons from the SVG logo (run once: `pnpm tsx scripts/generate-icons.ts`). */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const svg = (padding: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${padding ? 0 : 112}" fill="#ffd400"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - 2 * padding) / 512})">
    <path d="M128 352 256 160l128 192M192 352h128" fill="none" stroke="#121212" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

async function main() {
  await mkdir("public/icons", { recursive: true });
  const outputs: [string, number, number][] = [
    ["icon-192.png", 192, 0],
    ["icon-512.png", 512, 0],
    ["maskable-512.png", 512, 80],
    ["apple-touch-icon.png", 180, 40],
  ];
  for (const [name, size, padding] of outputs) {
    await sharp(Buffer.from(svg(padding)))
      .resize(size, size)
      .png()
      .toFile(`public/icons/${name}`);
  }
  console.log("Icônes générées dans public/icons/");
}

main();
