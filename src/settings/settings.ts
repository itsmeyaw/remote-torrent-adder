import { ext } from "../util/browser-api";
import { type RTASettings } from "../models/settings";
import { serializeSettings } from "./serializer";
import { getDefaultSettings } from "./settings-defaults";
import { parseSettings } from "./settings-validation";


export const SETTINGS_KEY: string = "settings";
export const SETTINGS_BACKUP_KEY_PREFIX: string = "settingsBackup:";

export async function loadSettings(): Promise<RTASettings> {
    const response = await ext.storage.local.get([SETTINGS_KEY]) as Record<string, string>;
    const stored = response[SETTINGS_KEY];
    if (!stored) {
        console.debug("Initializing with default settings.");
        const defaults = getDefaultSettings();
        await saveSettings(defaults);
        return defaults;
    }
    const result = parseSettings(stored);
    if (!result.ok) {
        console.error("Stored settings are invalid, backing up the stored value and resetting to defaults", result.problems);
        await backupCorruptSettings(stored);
        const defaults = getDefaultSettings();
        await saveSettings(defaults);
        return defaults;
    }
    if (serializeSettings(result.settings) !== stored) {
        await persistNormalized(result.settings);
    }
    return result.settings;
}

export async function saveSettings(settings: RTASettings): Promise<void> {
    const result = parseSettings(serializeSettings(settings));
    if (!result.ok) {
        throw new Error(`Settings were not saved: ${result.problems.join(" ")}`);
    }
    await ext.storage.local.set({ [SETTINGS_KEY]: serializeSettings(result.settings) });
}

async function persistNormalized(settings: RTASettings): Promise<void> {
    try {
        await saveSettings(settings);
    } catch (e) {
        console.warn("Could not persist normalized settings; they will be normalized again on the next load", e instanceof Error ? e.name : "unknown error");
    }
}

async function backupCorruptSettings(stored: string): Promise<void> {
    const existing = await ext.storage.local.get(null) as Record<string, unknown>;
    const alreadyBackedUp = Object.keys(existing).some(key => key.startsWith(SETTINGS_BACKUP_KEY_PREFIX) && existing[key] === stored);
    if (alreadyBackedUp) {
        return;
    }
    await ext.storage.local.set({ [SETTINGS_BACKUP_KEY_PREFIX + crypto.randomUUID()]: stored });
}
