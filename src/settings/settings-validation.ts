import { z } from "zod/mini";
import { type IconClickAction, type RTASettings } from "../models/settings";
import { type WebUISettings } from "../models/webui";
import { getDefaultSettings, getDefaultWebUiFields } from "./settings-defaults";
import { deserializeSettings, isSerializedRegExp } from "./serializer";
import { migrateSettingsClientIdentifiers, resolveClientIdentifier } from "./legacy-client-identifiers";

export type SettingsParseResult = { ok: true; settings: RTASettings } | { ok: false; problems: string[] };

type FieldCheck = z.ZodMiniType;

const NOT_AN_EXPORT = "That JSON is not a Remote Torrent Adder settings export.";
const ICON_CLICK_ACTIONS: readonly [IconClickAction, ...IconClickAction[]] = [
    "openPrimaryWebUi",
    "showWebUiPicker",
    "showPageLinks",
];

const SettingsExportSchema = z.looseObject({ webuiSettings: z.array(z.unknown()) });
const WebUiSchema = z.record(z.string(), z.unknown());
const PatternListSchema = z.array(z.unknown());
const PortSchema = z.nullable(z.int().check(z.minimum(0), z.maximum(65535)));
// A WebUI is stored with an empty client until the user picks one, so an empty client is a draft.
const ClientOrDraftSchema = z
    .string()
    .check(z.refine((value) => value === "" || resolveClientIdentifier(value) !== null));

const SETTING_CHECKS: ReadonlyArray<readonly [keyof RTASettings, FieldCheck]> = [
    ["notificationsEnabled", z.boolean()],
    ["notificationsDurationMs", z.number().check(z.nonnegative())],
    ["notificationsSoundEnabled", z.boolean()],
    ["notificationsLabelButtonEnabled", z.boolean()],
    ["linkCatchingEnabled", z.boolean()],
    ["iconClickAction", z.enum(ICON_CLICK_ACTIONS)],
];

// Without these a WebUI cannot be told apart or talked to, so they are never made up.
const REQUIRED_WEBUI_FIELD_CHECKS: ReadonlyArray<readonly [keyof WebUISettings, FieldCheck]> = [
    ["id", z.string().check(z.trim(), z.minLength(1))],
    ["client", ClientOrDraftSchema],
];

// Absent ones are filled from the defaults before they are checked.
const WEBUI_FIELD_CHECKS: ReadonlyArray<readonly [keyof WebUISettings, FieldCheck]> = [
    ["name", z.string()],
    ["host", z.string()],
    ["port", PortSchema],
    ["secure", z.boolean()],
    ["relativePath", z.nullable(z.string())],
    ["username", z.string()],
    ["password", z.string()],
    ["showPerTorrentConfigSelector", z.boolean()],
    ["useAlternativeLabelDirChooser", z.boolean()],
    ["defaultLabel", z.nullable(z.string())],
    ["defaultDir", z.nullable(z.string())],
    ["labels", z.array(z.string())],
    ["dirs", z.array(z.string())],
    ["addPaused", z.boolean()],
    ["autoLabelDirSettings", z.array(z.unknown())],
    ["clientSpecificSettings", z.record(z.string(), z.unknown())],
];

function settingProblems(raw: Record<string, unknown>): string[] {
    return SETTING_CHECKS.filter(
        ([field, check]) => raw[field] !== undefined && !check.safeParse(raw[field]).success,
    ).map(([field]) => `Invalid ${field}`);
}

// The id goes first, as in createWebUiSettings, so a WebUI serializes the same however it was made.
function withWebUiDefaults<T extends { id?: unknown }>(webUi: T): T & Omit<WebUISettings, "id"> {
    return { id: webUi.id, ...getDefaultWebUiFields(), ...webUi };
}

function webUiProblems(webUi: unknown, position: number): string[] {
    const parsed = WebUiSchema.safeParse(webUi);
    if (!parsed.success) {
        return [`WebUI ${position} is not an object.`];
    }
    const fields = parsed.data;
    const name = typeof fields.name === "string" && fields.name !== "" ? ` ("${fields.name}")` : "";
    const filled: Record<string, unknown> = withWebUiDefaults(fields);
    const failing = [
        ...REQUIRED_WEBUI_FIELD_CHECKS.filter(([field, check]) => !check.safeParse(fields[field]).success),
        ...WEBUI_FIELD_CHECKS.filter(([field, check]) => !check.safeParse(filled[field]).success),
    ];
    return failing.map(
        ([field]) =>
            `WebUI ${position}${name}: ${fields[field] === undefined || fields[field] === "" ? "missing" : "invalid"} ${field}`,
    );
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
    const exported = SettingsExportSchema.safeParse(raw);
    if (!exported.success) {
        return { ok: false, problems: [NOT_AN_EXPORT] };
    }
    const fields = exported.data;

    const patterns = PatternListSchema.safeParse(
        fields.linkCatchingRegexes === undefined ? [] : fields.linkCatchingRegexes,
    );
    const problems = [
        ...settingProblems(fields),
        ...fields.webuiSettings.flatMap((webUi, index) => webUiProblems(webUi, index + 1)),
        ...(patterns.success
            ? patterns.data.map((pattern, index) => linkCatchingPatternProblem(pattern, index + 1))
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
            webuiSettings: settings.webuiSettings.map(withWebUiDefaults),
        }),
    };
}
