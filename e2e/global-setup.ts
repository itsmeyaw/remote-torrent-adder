import { access } from "node:fs/promises";
import { join } from "node:path";
import { EXTENSION_DIR } from "./fixtures/paths";
import { FIREFOX_EXTENSION_DIR } from "./fixtures/firefox-paths";

const BUNDLES = [
    { dir: EXTENSION_DIR, script: "pnpm run build" },
    { dir: FIREFOX_EXTENSION_DIR, script: "pnpm run build:firefox" },
];

export default async function globalSetup(): Promise<void> {
    for (const { dir, script } of BUNDLES) {
        try {
            await access(join(dir, "manifest.json"));
        } catch {
            throw new Error(`No built extension at ${dir}. Run \`${script}\` before \`pnpm run test:e2e\`.`);
        }
    }
}
