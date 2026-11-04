import { ext } from "../util/browser-api";
import { type RTASettings } from "../models/settings";
import { migrateSettingsClientIdentifiers } from "./legacy-client-identifiers";
import { serializeSettings, deserializeSettings } from "./serializer";
import { getDefaultSettings } from "./settings-defaults";


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
    let merged: RTASettings;
    let migrated: RTASettings;
    try {
        merged = { ...getDefaultSettings(), ...parseStoredSettings(stored) };
        migrated = migrateSettingsClientIdentifiers(merged);
    } catch (e) {
        console.error("Failed to deserialize settings, backing up the stored value and resetting to defaults", e instanceof Error ? e.name : "unknown error");
        await backupCorruptSettings(stored);
        const defaults = getDefaultSettings();
        await saveSettings(defaults);
        return defaults;
    }
    if (migrated !== merged) {
        await persistMigration(migrated);
    }
    return migrated;
}

export async function saveSettings(settings: RTASettings): Promise<void> {
    await ext.storage.local.set({ [SETTINGS_KEY]: serializeSettings(settings) });
}

async function persistMigration(migrated: RTASettings): Promise<void> {
    try {
        await saveSettings(migrated);
    } catch (e) {
        console.warn("Could not persist migrated settings; they will be migrated again on the next load", e instanceof Error ? e.name : "unknown error");
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

function parseStoredSettings(stored: string): RTASettings {
    const parsed = deserializeSettings(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Stored settings are not a plain object");
    }
    return parsed;
}
