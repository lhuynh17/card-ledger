import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
export async function saveSnapshot(snapshot, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const stamp = snapshot.scrapedAt.replace(/[:.]/g, "-");
  const datedPath = path.join(outputDir, `alt-${stamp}.json`);
  const latestPath = path.join(outputDir, "latest.json");
  const text = JSON.stringify(snapshot, null, 2) + "\n";
  await Promise.all([writeFile(datedPath, text), writeFile(latestPath, text)]);
  return { datedPath, latestPath };
}
