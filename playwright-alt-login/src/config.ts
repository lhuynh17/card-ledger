import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export const config = {
  baseUrl: process.env.ALT_BASE_URL ?? "https://alt.xyz",
  email: process.env.ALT_EMAIL ?? "",
  password: process.env.ALT_PASSWORD ?? "",
  /** Persistent Chrome profile — keeps cookies/localStorage across runs */
  profileDir: path.resolve(".auth/browser-profile"),
  /** Optional Playwright storageState snapshot */
  storageStatePath: path.resolve(".auth/storage-state.json"),
  outputDir: path.resolve("output"),
};
