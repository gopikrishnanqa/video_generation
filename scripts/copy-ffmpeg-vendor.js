const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "public", "vendor", "ffmpeg");

const copies = [
  ["node_modules/@ffmpeg/ffmpeg/dist/umd/ffmpeg.js", "ffmpeg.js"],
  ["node_modules/@ffmpeg/ffmpeg/dist/umd/814.ffmpeg.js", "814.ffmpeg.js"],
  ["node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js", "ffmpeg-core.js"],
  ["node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm", "ffmpeg-core.wasm"],
];

fs.mkdirSync(out, { recursive: true });

for (const [src, name] of copies) {
  const from = path.join(root, src);
  const to = path.join(out, name);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-ffmpeg] skip missing ${src}`);
    continue;
  }
  fs.copyFileSync(from, to);
  console.log(`[copy-ffmpeg] ${name}`);
}
