import { defineConfig, type Plugin, type UserConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devDistDir, parseBrowser, prodDistDir, targetsFor } from "./scripts/browsers.ts";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const browser = parseBrowser(process.env.RTA_BROWSER);
const isProd = process.env.PROD === "true";
const distDir = isProd ? prodDistDir(browser) : devDistDir(browser);

const shared = {
    define: { __RTA_BROWSER__: JSON.stringify(browser) },
} satisfies UserConfig;

// Chrome serves extension pages from chrome-extension://, where the crossorigin
// attribute Vite emits on module scripts buys nothing and trips some CSPs.
const removeCrossOrigin: Plugin = {
    name: "remove-crossorigin",
    transformIndexHtml(html) {
        return html.replace(/ crossorigin(=["'][^"']*["'])?/g, "");
    },
};

/** An extension page: an HTML entry processed by Vite with React. */
function pageTarget(name: string, entryHtml: string): UserConfig {
    return {
        ...shared,
        root: path.resolve(rootDir, "src", name),
        base: "./",
        plugins: [react(), removeCrossOrigin],
        resolve: {
            alias: { "@": path.resolve(rootDir, "src", name) },
        },
        build: {
            outDir: path.resolve(rootDir, distDir, name),
            emptyOutDir: true,
            sourcemap: !isProd,
            minify: isProd,
            rolldownOptions: {
                input: path.resolve(rootDir, "src", name, entryHtml),
            },
        },
    };
}

interface ScriptBundle {
    entry: string;
    globalName: string;
    outSubDir: string;
    fileName: string;
}

/**
 * A classic script: the service worker and the content script both have to be
 * single self-contained files, so they are built as IIFE bundles rather than as
 * ES modules with shared chunks.
 */
function scriptTarget({ entry, globalName, outSubDir, fileName }: ScriptBundle): UserConfig {
    return {
        ...shared,
        root: rootDir,
        build: {
            outDir: path.resolve(rootDir, distDir, outSubDir),
            emptyOutDir: false,
            sourcemap: !isProd,
            minify: isProd,
            lib: {
                entry: path.resolve(rootDir, entry),
                formats: ["iife"],
                name: globalName,
                fileName: () => fileName,
            },
        },
    };
}

const targets: Record<string, UserConfig> = {
    popup: pageTarget("popup", "popup.html"),
    options: pageTarget("options", "options.html"),
    notifications: pageTarget("notifications", "offscreen.html"),
    worker: scriptTarget({
        entry: "src/service_worker.ts",
        globalName: "RTAServiceWorker",
        outSubDir: ".",
        fileName: "service_worker.js",
    }),
    "content-script": scriptTarget({
        entry: "src/content-script/rta.ts",
        globalName: "RTAContentScript",
        outSubDir: "content-script",
        fileName: "rta.js",
    }),
};

// `vp lint`, `vp fmt`, `vp check` and `vp test` read these blocks without a build target.
const tooling = {
    ...shared,
    lint: {
        jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
        options: { typeAware: true, typeCheck: true },
        plugins: ["typescript"],
        // Rules are opted into one by one below; no category is switched on wholesale.
        categories: { correctness: "off" },
        env: { builtin: true },
        ignorePatterns: ["dist/**", "dist-prod/**", "coverage/**", "node_modules/**", ".tmp/**"],
        rules: {
            "vite-plus/prefer-vite-plus-imports": "error",
            "constructor-super": "error",
            "for-direction": "error",
            "getter-return": "error",
            "no-array-constructor": "error",
            "no-async-promise-executor": "error",
            "no-case-declarations": "error",
            "no-class-assign": "error",
            "no-compare-neg-zero": "error",
            "no-cond-assign": "error",
            "no-const-assign": "error",
            "no-constant-binary-expression": "error",
            "no-constant-condition": "error",
            "no-control-regex": "error",
            "no-debugger": "error",
            "no-delete-var": "error",
            "no-dupe-class-members": "error",
            "no-dupe-else-if": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-empty": "error",
            "no-empty-character-class": "error",
            "no-empty-pattern": "error",
            "no-empty-static-block": "error",
            "no-ex-assign": "error",
            "no-extra-boolean-cast": "error",
            "no-fallthrough": "error",
            "no-func-assign": "error",
            "no-global-assign": "error",
            "no-import-assign": "error",
            "no-invalid-regexp": "error",
            "no-irregular-whitespace": "error",
            "no-loss-of-precision": "error",
            "no-misleading-character-class": "error",
            "no-new-native-nonconstructor": "error",
            "no-nonoctal-decimal-escape": "error",
            "no-obj-calls": "error",
            "no-prototype-builtins": "error",
            "no-redeclare": "error",
            "no-regex-spaces": "error",
            "no-self-assign": "error",
            "no-setter-return": "error",
            "no-shadow-restricted-names": "error",
            "no-sparse-arrays": "error",
            "no-this-before-super": "error",
            "no-unassigned-vars": "error",
            "no-unexpected-multiline": "error",
            "no-unreachable": "error",
            "no-unsafe-finally": "error",
            "no-unsafe-negation": "error",
            "no-unsafe-optional-chaining": "error",
            "no-unused-expressions": "error",
            "no-unused-labels": "error",
            "no-unused-private-class-members": "error",
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "no-useless-backreference": "error",
            "no-useless-catch": "error",
            "no-useless-escape": "error",
            "no-with": "error",
            "preserve-caught-error": "error",
            "require-yield": "error",
            "use-isnan": "error",
            "valid-typeof": "error",

            "typescript/ban-ts-comment": "error",
            "typescript/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
            "typescript/no-duplicate-enum-values": "error",
            "typescript/no-empty-object-type": "error",
            // The codebase leans on `any` at the chrome.* and bencode boundaries.
            // Those are tracked separately; keep the rule as a warning so new
            // occurrences are visible without failing the build on existing ones.
            "typescript/no-explicit-any": "warn",
            "typescript/no-extra-non-null-assertion": "error",
            "typescript/no-misused-new": "error",
            "typescript/no-namespace": "error",
            "typescript/no-non-null-asserted-optional-chain": "error",
            "typescript/no-require-imports": "error",
            "typescript/no-this-alias": "error",
            "typescript/no-unnecessary-type-constraint": "error",
            "typescript/no-unsafe-declaration-merging": "error",
            "typescript/no-unsafe-function-type": "error",
            "typescript/no-wrapper-object-types": "error",
            "typescript/prefer-as-const": "error",
            "typescript/prefer-namespace-keyword": "error",
            "typescript/triple-slash-reference": "error",

            "no-console": ["error", { allow: ["warn", "error", "debug"] }],
            eqeqeq: ["error", "always", { null: "ignore" }],
            "no-var": "error",
            "prefer-const": "error",
        },
        // Later overrides win, so the exemptions come after the rules they lift.
        overrides: [
            {
                // TypeScript already checks these.
                files: ["**/*.{ts,tsx,mts,cts}"],
                rules: {
                    "constructor-super": "off",
                    "getter-return": "off",
                    "no-class-assign": "off",
                    "no-const-assign": "off",
                    "no-dupe-class-members": "off",
                    "no-dupe-keys": "off",
                    "no-func-assign": "off",
                    "no-import-assign": "off",
                    "no-new-native-nonconstructor": "off",
                    "no-obj-calls": "off",
                    "no-redeclare": "off",
                    "no-setter-return": "off",
                    "no-this-before-super": "off",
                    "no-unreachable": "off",
                    "no-unsafe-negation": "off",
                    "no-with": "off",
                    "prefer-rest-params": "error",
                    "prefer-spread": "error",
                },
            },
            {
                files: ["src/**/*.{ts,tsx}"],
                env: { browser: true },
                globals: { chrome: "readonly" },
                rules: {
                    // Firefox only exposes promises on `browser`; `chrome` there is
                    // callback-only. Go through the `ext` shim so both browsers behave
                    // the same. Type positions (chrome.tabs.Tab) are unaffected.
                    "no-restricted-globals": [
                        "error",
                        {
                            name: "chrome",
                            message: "Use `ext` from util/browser-api instead of the bare `chrome` namespace.",
                        },
                    ],
                },
            },
            {
                files: ["src/util/browser-api.ts"],
                rules: { "no-restricted-globals": "off" },
            },
            {
                files: ["src/**/*.tsx"],
                plugins: ["react"],
                rules: {
                    "react/rules-of-hooks": "error",
                    "react/exhaustive-deps": "warn",
                    "react/static-components": "error",
                    "react/use-memo": "error",
                    "react/preserve-manual-memoization": "error",
                    "react/incompatible-library": "warn",
                    "react/immutability": "error",
                    "react/globals": "error",
                    "react/refs": "error",
                    "react/set-state-in-effect": "error",
                    "react/error-boundaries": "error",
                    "react/purity": "error",
                    "react/set-state-in-render": "error",
                    "react/unsupported-syntax": "warn",
                },
            },
            {
                files: ["test/**/*.{ts,tsx}"],
                env: { browser: true, node: true },
                globals: { chrome: "writable" },
                rules: {
                    "no-console": "off",
                    // Tests deliberately reach into mocks with loose types.
                    "typescript/no-explicit-any": "off",
                },
            },
            {
                files: ["e2e/**/*.ts", "test/it/**/*.ts"],
                env: { browser: true, node: true },
                globals: { chrome: "readonly" },
                rules: {
                    "no-console": "off",
                    "typescript/no-explicit-any": "off",
                    "typescript/no-non-null-assertion": "off",
                    // Playwright's fixture signature is `async ({}, use) => {}`.
                    "no-empty-pattern": "off",
                },
            },
            {
                files: ["**/*.{js,cjs,mjs}"],
                env: { node: true },
                rules: { "no-undef": "error", "typescript/no-require-imports": "off" },
            },
            {
                files: ["*.config.ts", "scripts/**/*.ts"],
                env: { node: true },
                rules: { "no-console": "off" },
            },
        ],
    },
    fmt: {
        tabWidth: 4,
        printWidth: 120,
        ignorePatterns: ["pnpm-lock.yaml", "package.json", "src/manifest.json", "updates.json"],
        overrides: [{ files: ["*.yml", "*.yaml"], options: { tabWidth: 2 } }],
    },
    test: {
        environment: "jsdom",
        pool: "vmThreads",
        globals: true,
        // Spies created with vi.spyOn are undone after each test, so call counts
        // cannot leak into the next one.
        restoreMocks: true,
        include: ["test/**/*.test.{ts,tsx}"],
        setupFiles: ["test/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.d.ts", "src/notifications/offscreen.ts", "src/notifications/play-sound.ts"],
            reporter: ["text", "html"],
        },
    },
} satisfies UserConfig;

export default defineConfig(({ mode }) => {
    const target = process.env.RTA_TARGET;
    if (!target || mode === "test") {
        return tooling;
    }
    const allowed = targetsFor(browser);
    const config = allowed.includes(target) ? targets[target] : undefined;
    if (!config) {
        throw new Error(`Set RTA_TARGET to one of: ${allowed.join(", ")} (RTA_BROWSER=${browser}, got ${target})`);
    }
    return { ...tooling, ...config };
});
