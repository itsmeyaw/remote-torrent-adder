import { describe, it, expect, vi, beforeEach } from "vitest";
import { Settings } from "../../src/settings/settings";
import { deserializeSettings, serializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { Client } from "../../src/models/clients";
import { type RTASettings } from "../../src/models/settings";
import { makeWebUISettings } from "../helpers/fixtures";
import { at } from "../helpers/assert";
import { showNotification } from "../../src/background/notifications";

vi.mock("../../src/background/notifications", () => ({ showNotification: vi.fn() }));

beforeEach(() => {
    vi.mocked(showNotification).mockClear();
});

function backupKeys(): string[] {
    return Object.keys((chrome as any).__storage).filter(key => key.startsWith("settingsBackup:"));
}

function storedSettings(): RTASettings {
    return deserializeSettings((chrome as any).__storage.settings)!;
}

describe("Settings.loadSettings", () => {
    it("initializes with defaults and persists them when storage is empty", async () => {
        const settings = new Settings();
        const loaded = await settings.loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        // defaults were written back to storage
        expect((chrome as any).__storage.settings).toBeTruthy();
    });

    it("deserializes previously stored settings", async () => {
        const stored = getDefaultSettings();
        stored.notificationsDurationMs = 5000;
        (chrome as any).__storage.settings = serializeSettings(stored);

        const loaded = await new Settings().loadSettings();
        expect(loaded.notificationsDurationMs).toBe(5000);
        expect(loaded.linkCatchingRegexes[0]).toBeInstanceOf(RegExp);
    });

    it("migrates legacy client identifiers and re-persists", async () => {
        const stored = getDefaultSettings();
        stored.webuiSettings = [makeWebUISettings({ client: "qBittorrent WebUI" as Client })];
        (chrome as any).__storage.settings = serializeSettings(stored);

        const loaded = await new Settings().loadSettings();
        expect(at(loaded.webuiSettings, 0).client).toBe(Client.QBittorrentWebUI);
        // re-persisted in migrated form
        const reloaded = await new Settings().loadSettings();
        expect(at(reloaded.webuiSettings, 0).client).toBe(Client.QBittorrentWebUI);
    });

    it("backs up the corrupt config, resets to defaults and tells the user", async () => {
        const corrupt = "{not valid json";
        (chrome as any).__storage.settings = corrupt;
        const loaded = await new Settings().loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        expect(backupKeys()).toHaveLength(1);
        expect((chrome as any).__storage[at(backupKeys(), 0)]).toBe(corrupt);
        expect(storedSettings()).toEqual(getDefaultSettings());
        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(at(vi.mocked(showNotification).mock.calls, 0)[0]).toBe("Settings were reset");
        expect(at(vi.mocked(showNotification).mock.calls, 0)[1]).toBe("Your stored settings could not be read and were reset to defaults. Re-import an export or set up your WebUIs again.");
    });

    it.each(["null", "0", "true", "[]", "\"x\""])("treats the stored value %s, which is not a plain object, as corrupt", async (stored) => {
        (chrome as any).__storage.settings = stored;
        const loaded = await new Settings().loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        expect(backupKeys()).toHaveLength(1);
        expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("does not reset or notify when persisting a migration fails, and returns the migrated settings", async () => {
        const stored = getDefaultSettings();
        stored.webuiSettings = [makeWebUISettings({ client: "qBittorrent WebUI" as Client })];
        (chrome as any).__storage.settings = serializeSettings(stored);
        vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("QUOTA_BYTES exceeded"));

        const loaded = await new Settings().loadSettings();

        expect(at(loaded.webuiSettings, 0).client).toBe(Client.QBittorrentWebUI);
        expect(backupKeys()).toEqual([]);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("skips the backup and notification when the same corrupt value is already backed up", async () => {
        (chrome as any).__storage.settings = "corrupt again";
        await new Settings().loadSettings();
        vi.mocked(showNotification).mockClear();
        (chrome as any).__storage.settings = "corrupt again";

        const loaded = await new Settings().loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        expect(backupKeys()).toHaveLength(1);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("keeps every earlier backup when the config is corrupted again", async () => {
        (chrome as any).__storage.settings = "first corrupt";
        await new Settings().loadSettings();
        (chrome as any).__storage.settings = "second corrupt";
        await new Settings().loadSettings();

        const originals = backupKeys().map(key => (chrome as any).__storage[key]);
        expect(originals.sort()).toEqual(["first corrupt", "second corrupt"]);
    });

    it("treats a config without a WebUI list as having no WebUIs, without resetting it", async () => {
        const stored = { ...getDefaultSettings(), notificationsDurationMs: 5000 } as Partial<RTASettings>;
        delete stored.webuiSettings;
        (chrome as any).__storage.settings = serializeSettings(stored as RTASettings);

        const loaded = await new Settings().loadSettings();
        expect(loaded.webuiSettings).toEqual([]);
        expect(loaded.notificationsDurationMs).toBe(5000);
        expect(backupKeys()).toEqual([]);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("fills keys missing from an older config with defaults and keeps stored values, falsy ones included", async () => {
        const stored = { ...getDefaultSettings(), notificationsDurationMs: 5000, notificationsSoundEnabled: true, linkCatchingEnabled: false } as Partial<RTASettings>;
        delete stored.notificationsLabelButtonEnabled;
        delete stored.iconClickAction;
        (chrome as any).__storage.settings = serializeSettings(stored as RTASettings);

        const loaded = await new Settings().loadSettings();
        expect(loaded.notificationsLabelButtonEnabled).toBe(getDefaultSettings().notificationsLabelButtonEnabled);
        expect(loaded.iconClickAction).toBe(getDefaultSettings().iconClickAction);
        expect(loaded.notificationsDurationMs).toBe(5000);
        expect(loaded.notificationsSoundEnabled).toBe(true);
        expect(loaded.linkCatchingEnabled).toBe(false);
        expect(backupKeys()).toEqual([]);
    });
});

describe("Settings.saveSettings", () => {
    it("serializes and stores settings under the settings key", async () => {
        const toSave = getDefaultSettings();
        toSave.notificationsSoundEnabled = true;
        await new Settings().saveSettings(toSave);

        expect(chrome.storage.local.set).toHaveBeenCalled();
        expect((chrome as any).__storage.settings).toContain("notificationsSoundEnabled");
    });
});

describe("Settings console output", () => {
    it("never logs WebUI credentials on load or save", async () => {
        const password = "s3cret-webui-password";
        const spies = (["log", "info", "debug", "warn", "error"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
        try {
            const settings = getDefaultSettings();
            settings.webuiSettings = [makeWebUISettings({ password })];

            await new Settings().saveSettings(settings);
            await new Settings().loadSettings();
            (chrome as any).__storage.settings = undefined;
            await new Settings().loadSettings();

            expect(spies.some(spy => spy.mock.calls.length > 0)).toBe(true);
            for (const spy of spies) {
                expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
            }
        } finally {
            vi.restoreAllMocks();
        }
    });
});

describe("Settings.serialize / deserialize", () => {
    it("round-trips the in-memory settings", () => {
        const settings = new Settings();
        const value = getDefaultSettings();
        value.notificationsDurationMs = 1234;
        settings.rtaSettings = value;

        const restored = settings.deserialize(settings.serialize())!;
        expect(restored.notificationsDurationMs).toBe(1234);
    });
});
