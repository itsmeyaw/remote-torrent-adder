import { type IconClickAction, type RTASettings } from "../models/settings";
import { type WebUISettings } from "../models/webui";
import { getDefaultSettings, getDefaultWebUiFields } from "./settings-defaults";
import { deserializeSettings, isSerializedRegExp } from "./serializer";
import { migrateSettingsClientIdentifiers, resolveClientIdentifier } from "./legacy-client-identifiers";

export type SettingsParseResult = { ok: true; settings: RTASettings } | { ok: false; problems: string[] };

type FieldCheck = (value: unknown) => boolean;

const NOT_AN_EXPORT = "That JSON is not a Remote Torrent Adder settings export.";
const ICON_CLICK_ACTIONS: ReadonlyArray<IconClickAction> = ["openPrimaryWebUi", "showWebUiPicker", "showPageLinks"];

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
const isBoolean = (value: unknown): boolean => typeof value === "boolean";
const isString = (value: unknown): boolean => typeof value === "string";
const isNonEmptyString = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
const isNullableString = (value: unknown): boolean => value === null || typeof value === "string";
const isStringArray = (value: unknown): boolean => Array.isArray(value) && value.every(isString);
const isNonNegativeNumber = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isIconClickAction = (value: unknown): boolean => ICON_CLICK_ACTIONS.some(action => action === value);
const isPort = (value: unknown): boolean =>
    value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535);
const isKnownClient = (value: unknown): boolean => typeof value === "string" && resolveClientIdentifier(value) !== null;
// A WebUI is stored with an empty client until the user picks one, so an empty client is a draft.
const isClientOrDraft = (value: unknown): boolean => value === "" || isKnownClient(value);

const SETTING_CHECKS: ReadonlyArray<readonly [keyof RTASettings, FieldCheck]> = [
    ["notificationsEnabled", isBoolean],
    ["notificationsDurationMs", isNonNegativeNumber],
    ["notificationsSoundEnabled", isBoolean],
    ["notificationsLabelButtonEnabled", isBoolean],
    ["linkCatchingEnabled", isBoolean],
    ["iconClickAction", isIconClickAction],
];

/** Every field a WebUI needs for the client code, the popup and the options page to work with it. */
const WEBUI_FIELD_CHECKS: ReadonlyArray<readonly [keyof WebUISettings, FieldCheck]> = [
    ["id", isNonEmptyString],
    ["client", isClientOrDraft],
    ["name", isString],
    ["host", isString],
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
];

// Fields added after older configs were saved: absent ones are filled from the defaults, present ones must be valid.
const LATER_WEBUI_FIELD_CHECKS: ReadonlyArray<readonly [keyof WebUISettings, FieldCheck]> = [
    ["useAlternativeLabelDirChooser", isBoolean],
    ["autoLabelDirSettings", Array.isArray],
    ["clientSpecificSettings", isObject],
];

function settingProblems(raw: Record<string, unknown>): string[] {
    return SETTING_CHECKS
        .filter(([field, check]) => raw[field] !== undefined && !check(raw[field]))
        .map(([field]) => `Invalid ${field}`);
}

function webUiProblems(webUi: unknown, position: number): string[] {
    if (!isObject(webUi)) {
        return [`WebUI ${position} is not an object.`];
    }
    const name = typeof webUi.name === "string" && webUi.name !== "" ? ` ("${webUi.name}")` : "";
    const failing = [
        ...WEBUI_FIELD_CHECKS.filter(([field, check]) => !check(webUi[field])),
        ...LATER_WEBUI_FIELD_CHECKS.filter(([field, check]) => webUi[field] !== undefined && !check(webUi[field])),
    ];
    return failing.map(([field]) => `WebUI ${position}${name}: ${webUi[field] === undefined || webUi[field] === "" ? "missing" : "invalid"} ${field}`);
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
 * The one way settings come in, whether loaded from storage, saved by the options page or imported. Problems
 * are reported per setting, WebUI and Link Catching Pattern, so a partially broken file says exactly what to fix.
 * Missing settings are filled from the defaults. Passwords are never part of a problem message.
 */
export function parseSettings(text: string): SettingsParseResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return { ok: false, problems: ["That is not valid JSON."] };
    }
    if (!isObject(raw) || !Array.isArray(raw.webuiSettings)) {
        return { ok: false, problems: [NOT_AN_EXPORT] };
    }

    const patterns: unknown = raw.linkCatchingRegexes === undefined ? [] : raw.linkCatchingRegexes;
    const problems = [
        ...settingProblems(raw),
        ...raw.webuiSettings.flatMap((webUi, index) => webUiProblems(webUi, index + 1)),
        ...(Array.isArray(patterns)
            ? patterns.map((pattern, index) => linkCatchingPatternProblem(pattern, index + 1))
            : ["Link Catching patterns must be a list."]),
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) {
        return { ok: false, problems };
    }

    // Parsed again because only the serializer revives RegExp patterns; raw is already known to be an object.
    const settings = deserializeSettings(text)!;
    return {
        ok: true,
        settings: migrateSettingsClientIdentifiers({
            ...getDefaultSettings(),
            ...settings,
            webuiSettings: settings.webuiSettings.map(webUi => ({ ...getDefaultWebUiFields(), ...webUi })),
        }),
    };
}
