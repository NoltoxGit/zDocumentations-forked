import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { CACHE_DIR } from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

const media = {};
async function findMedia(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await findMedia(file); continue; }
    if (!entry.isFile()) continue;
    const stat = await fs.stat(file);
    if (stat.size <= 25 * 1024 * 1024) continue;
    const bytes = await fs.readFile(file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const url = "/" + path.relative("public", file).split(path.sep).join("/");
    const chunkSize = 4 * 1024 * 1024;
    media[url] = {
      size: bytes.length, hash, chunkSize,
      contentType: file.endsWith(".mp4") ? "video/mp4" : "application/octet-stream",
      chunks: Array.from({ length: Math.ceil(bytes.length / chunkSize) },
        (_, i) => `/cdn-cgi/groupez-media/${hash}/${i}`),
    };
  }
}
await findMedia("public");
await fs.writeFile(".generated/media-manifest.json", JSON.stringify(media));
const assets = path.resolve(".open-next/assets");
// Populate the read-only SSG cache during the build, so `wrangler deploy` alone
// is sufficient in Workers Builds (OpenNext's deploy CLI normally does this).
await fs.cp(path.resolve(".open-next/cache"), path.join(assets, CACHE_DIR), {
  recursive: true,
});
for (const [url, info] of Object.entries(media)) {
  const original = path.resolve(assets, "." + url);
  if (!original.startsWith(assets + path.sep))
    throw new Error("Asset path escaped the generated output");
  const source = path.resolve("public", "." + url);
  if (!source.startsWith(path.resolve("public") + path.sep))
    throw new Error("Media source path escaped public/");
  const bytes = await fs.readFile(source);
  for (let i = 0; i < info.chunks.length; i++) {
    const dest = path.resolve(assets, "." + info.chunks[i]);
    if (!dest.startsWith(assets + path.sep))
      throw new Error("Chunk path escaped the generated output");
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(
      dest,
      bytes.subarray(
        i * info.chunkSize,
        Math.min((i + 1) * info.chunkSize, bytes.length),
      ),
    );
  }
  // Only the generated deployment copy is replaced; public/ remains intact.
  await fs.unlink(original).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  console.log(
    `Preserved ${url} in ${info.chunks.length} Worker asset chunks (${bytes.length} original bytes).`,
  );
}
