#!/usr/bin/env node
import { spawnSync } from "node:child_process";

interface Waiver {
    package: string;
    ghsa: string;
    reason: string;
    reviewed: string;
}

interface Advisory {
    module_name: string;
    github_advisory_id: string;
    severity: string;
    title: string;
}

interface AuditReport {
    advisories: Record<string, Advisory>;
}

interface Finding {
    package: string;
    ghsa: string;
    severity: string;
    title: string;
}

const ALLOWLIST: Waiver[] = [];

const BLOCKING = new Set(["high", "critical"]);

const result = spawnSync("pnpm audit --json", { encoding: "utf8", shell: true });
if (!result.stdout) {
    console.error("pnpm audit produced no output.");
    console.error(result.error?.message ?? result.stderr);
    process.exit(1);
}

const report: AuditReport = JSON.parse(result.stdout);

const found = new Map<string, Finding>();
for (const advisory of Object.values(report.advisories ?? {})) {
    if (!BLOCKING.has(advisory.severity)) {
        continue;
    }
    const { module_name: name, github_advisory_id: ghsa, severity, title } = advisory;
    found.set(`${name}:${ghsa}`, { package: name, ghsa, severity, title });
}

const waived = new Set(ALLOWLIST.map(entry => `${entry.package}:${entry.ghsa}`));
const blocking = [...found.values()].filter(entry => !waived.has(`${entry.package}:${entry.ghsa}`));
const stale = [...waived].filter(key => !found.has(key));

for (const key of stale) {
    console.warn(`Allowlisted advisory no longer reported: ${key} - remove it from scripts/audit.ts.`);
}

if (blocking.length > 0) {
    console.error(`\n${blocking.length} unwaived high/critical advisor${blocking.length === 1 ? "y" : "ies"}:\n`);
    for (const entry of blocking) {
        console.error(`  ${entry.severity.padEnd(8)} ${entry.package} - ${entry.title}`);
        console.error(`           https://github.com/advisories/${entry.ghsa}`);
    }
    console.error("\nFix them, or add a reviewed entry to ALLOWLIST in scripts/audit.ts.\n");
    process.exit(1);
}

const waivedCount = found.size;
console.log(
    waivedCount === 0
        ? "No high or critical advisories."
        : `No unwaived high or critical advisories (${waivedCount} allowlisted).`,
);
