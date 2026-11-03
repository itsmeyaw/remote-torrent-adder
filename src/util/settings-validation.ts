import { type RTASettings } from "../models/settings";
import { type WebUISettings } from "../models/webui";
import { getDefaultSettings } from "./settings-defaults";
import { deserializeSettings } from "./serializer";
import { migrateSettingsClientIdentifiers, resolveClientIdentifier } from "./legacy-client-identifiers";

export type SettingsImportResult = { ok: true; settings: RTASettings } | { ok: false; problems: string[] };

type FieldCheck = (value: unknown) => boolean;

const NOT_AN_EXPORT = "That JSON is not a Remote Torrent Adder settings export.";

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
const isBoolean = (value: unknown): boolean => typeof value === "boolean";
const isString = (value: unknown): boolean => typeof value === "string";
const isNonEmptyString = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
const isNullableString = (value: unknown): boolean => value === null || typeof value === "string";
const isStringArray = (value: unknown): boolean => Array.isArray(value) && value.every(isString);
const isPort = (value: unknown): boolean =>
    value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535);
const isKnownClient = (value: unknown): boolean => typeof value === "string" && resolveClientIdentifier(value) !== null;

/** Every field a WebUI needs for the client code, the popup and the options page to work with it. */
const WEBUI_FIELD_CHECKS: ReadonlyArray<readonly [keyof WebUISettings, FieldCheck]> = [
    ["id", isNonEmptyString],
    ["client", isKnownClient],
    ["name", isString],
    ["host", isNonEmptyString],
    ["port", isPort],
    ["secure", isBoolean],
    ["relativePath", isNullableString],
    ["username", isString],
    ["password", isString],
    ["showPerTorrentConfigSelector", isBoolean],
    ["defaultLabel", isNullableString],
    ["defaultDir", isNullableString],
    ["labels", isStringArray],
    ["dirs", isStringArray],
    ["addPaused", isBoolean],
    ["autoLabelDirSettings", Array.isArray],
    ["clientSpecificSettings", isObject],
];

function webUiProblems(webUi: unknown, position: number): string[] {
    if (!isObject(webUi)) {
        return [`WebUI ${position} is not an object.`];
    }
    const name = typeof webUi.name === "string" && webUi.name !== "" ? ` ("${webUi.name}")` : "";
    return WEBUI_FIELD_CHECKS
        .filter(([field, check]) => !check(webUi[field]))
        .map(([field]) => `WebUI ${position}${name}: ${webUi[field] === undefined || webUi[field] === "" ? "missing" : "invalid"} ${field}`);
}

function isSerializedRegExp(value: unknown): value is { source: string; flags: string } {
    return isObject(value) && value.__type === "RegExp" && typeof value.source === "string" && typeof value.flags === "string";
}

function linkCatchingPatternProblem(pattern: unknown, position: number): string | null {
    if (!isSerializedRegExp(pattern)) {
        return `Link Catching pattern ${position} is invalid.`;
    }
    if (pattern.source.trim() === "") {
        return `Link Catching pattern ${position} is empty.`;
    }
    try {
        RegExp(pattern.source, pattern.flags);
        return null;
    } catch {
        return `Link Catching pattern ${position} is not a valid regular expression.`;
    }
}

/**
 * Validates a pasted settings export before it is allowed to replace the stored settings. Problems are
 * reported per WebUI and per Link Catching Pattern, so a partially broken file says exactly what to fix.
 * Passwords are never part of a problem message.
 */
export function parseSettingsExport(text: string): SettingsImportResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, problems: ["That is not valid JSON."] };
    }
    if (!isObject(raw) || !Array.isArray(raw.webuiSettings)) {
        return { ok: false, problems: [NOT_AN_EXPORT] };
    }

    const patterns: unknown = raw.linkCatchingRegexes ?? [];
    const problems = [
        ...raw.webuiSettings.flatMap((webUi, index) => webUiProblems(webUi, index + 1)),
        ...(Array.isArray(patterns)
            ? patterns.map((pattern, index) => linkCatchingPatternProblem(pattern, index + 1))
            : ["Link Catching patterns must be a list."]),
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) {
        return { ok: false, problems };
    }

    const settings = deserializeSettings(text);
    if (!settings) {
        return { ok: false, problems: [NOT_AN_EXPORT] };
    }
    return { ok: true, settings: migrateSettingsClientIdentifiers({ ...getDefaultSettings(), ...settings }) };
}
