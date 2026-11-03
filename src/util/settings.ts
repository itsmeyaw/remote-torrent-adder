import { generateId } from "./utils";
import { ext } from "./browser-api";
import { type RTASettings } from "../models/settings";
import { getDefaultSettings } from "./settings-defaults";
import { migrateSettingsClientIdentifiers } from "./legacy-client-identifiers";
import { showNotification } from "./notifications";
import { serializeSettings, deserializeSettings } from "./serializer";


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
        if (!response[SETTINGS_KEY]) {
            console.debug("Initializing with default settings.");
            const defaults = getDefaultSettings();
            await this.saveSettings(defaults);
            return defaults;
        }
        try {
            const loaded = deserializeSettings(response[SETTINGS_KEY]);
            if (loaded === null) {
                throw new Error("Stored settings are not an object");
            }
            const merged = { ...getDefaultSettings(), ...loaded };
            const migrated = migrateSettingsClientIdentifiers(merged);
            if (migrated !== merged) {
                await this.saveSettings(migrated);
            }
            return migrated;
        } catch (e) {
            console.error("Failed to deserialize settings, backing up the stored value and resetting to defaults", e instanceof Error ? e.name : "unknown error");
            await ext.storage.local.set({ [SETTINGS_BACKUP_KEY_PREFIX + generateId()]: response[SETTINGS_KEY] });
            const defaults = getDefaultSettings();
            await this.saveSettings(defaults);
            showNotification("Settings were reset", "Your saved settings could not be read, so they were reset to defaults. The old settings were kept in extension storage.");
            return defaults;
        }
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

}
