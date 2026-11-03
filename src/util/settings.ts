import { ext } from "./browser-api";
import { type RTASettings } from "../models/settings";
import { migrateSettingsClientIdentifiers } from "./legacy-client-identifiers";
import { showNotification } from "./notifications";
import { serializeSettings, deserializeSettings } from "./serializer";
import { getDefaultSettings } from "./settings-defaults";


export const SETTINGS_KEY: string = "settings";
const SETTINGS_BACKUP_KEY_PREFIX: string = "settingsBackup:";

export class Settings {
    private _rtaSettings!: RTASettings;

    public get settings(): RTASettings {
        return this._rtaSettings;
    }

    public set rtaSettings(settings: RTASettings) {
        this._rtaSettings = settings;
        this.saveSettings(settings);
    }

    public async loadSettings(): Promise<RTASettings> {
        const response = await ext.storage.local.get([SETTINGS_KEY]) as Record<string, string>;
        const stored = response[SETTINGS_KEY];
        if (!stored) {
            console.debug("Initializing with default settings.");
            const defaults = getDefaultSettings();
            await this.saveSettings(defaults);
            return defaults;
        }
        let merged: RTASettings;
        let migrated: RTASettings;
        try {
            merged = { ...getDefaultSettings(), ...parseStoredSettings(stored) };
            migrated = migrateSettingsClientIdentifiers(merged);
        } catch (e) {
            console.error("Failed to deserialize settings, backing up the stored value and resetting to defaults", e instanceof Error ? e.name : "unknown error");
            const isNewBackup = await this.backupCorruptSettings(stored);
            const defaults = getDefaultSettings();
            await this.saveSettings(defaults);
            if (isNewBackup) {
                showNotification("Settings were reset", "Your stored settings could not be read and were reset to defaults. Re-import an export or set up your WebUIs again.");
            }
            return defaults;
        }
        if (migrated !== merged) {
            await this.persistMigration(migrated);
        }
        return migrated;
    }

    public async saveSettings(settings: RTASettings): Promise<void> {
        await ext.storage.local.set({ [SETTINGS_KEY]: serializeSettings(settings) });
    }

    public serialize(): string {
        return serializeSettings(this._rtaSettings);
    }

    public deserialize(serialized: string): RTASettings | null {
        return deserializeSettings(serialized);
    }

    private async persistMigration(migrated: RTASettings): Promise<void> {
        try {
            await this.saveSettings(migrated);
        } catch (e) {
            console.warn("Could not persist migrated settings; they will be migrated again on the next load", e instanceof Error ? e.name : "unknown error");
        }
    }

    private async backupCorruptSettings(stored: string): Promise<boolean> {
        const existing = await ext.storage.local.get(null) as Record<string, unknown>;
        const alreadyBackedUp = Object.keys(existing).some(key => key.startsWith(SETTINGS_BACKUP_KEY_PREFIX) && existing[key] === stored);
        if (alreadyBackedUp) {
            return false;
        }
        await ext.storage.local.set({ [SETTINGS_BACKUP_KEY_PREFIX + crypto.randomUUID()]: stored });
        return true;
    }

}

function parseStoredSettings(stored: string): RTASettings {
    const parsed = deserializeSettings(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Stored settings are not a plain object");
    }
    return parsed;
}

