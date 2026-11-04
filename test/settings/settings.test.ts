import { describe, it, expect, vi } from "vitest";
import { loadSettings, saveSettings } from "../../src/settings/settings";
import { deserializeSettings, serializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { Client } from "../../src/models/clients";
import { type RTASettings } from "../../src/models/settings";
import { makeWebUISettings } from "../helpers/fixtures";
import { at } from "../helpers/assert";

function backupKeys(): string[] {
    return Object.keys((chrome as any).__storage).filter((key) => key.startsWith("settingsBackup:"));
}

function storedSettings(): RTASettings {
    return deserializeSettings((chrome as any).__storage.settings)!;
}

describe("loadSettings", () => {
    it("initializes with defaults and persists them when storage is empty", async () => {
        const loaded = await loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        // defaults were written back to storage
        expect((chrome as any).__storage.settings).toBeTruthy();
    });

    it("deserializes previously stored settings", async () => {
        const stored = getDefaultSettings();
        stored.notificationsDurationMs = 5000;
        (chrome as any).__storage.settings = serializeSettings(stored);

        const loaded = await loadSettings();
        expect(loaded.notificationsDurationMs).toBe(5000);
        expect(loaded.linkCatchingRegexes[0]).toBeInstanceOf(RegExp);
    });

    it("migrates legacy client identifiers and re-persists", async () => {
        const stored = getDefaultSettings();
        stored.webuiSettings = [makeWebUISettings({ client: "qBittorrent WebUI" as Client })];
        (chrome as any).__storage.settings = serializeSettings(stored);

        const loaded = await loadSettings();
        expect(at(loaded.webuiSettings, 0).client).toBe(Client.QBittorrentWebUI);
        // re-persisted in migrated form
        const reloaded = await loadSettings();
        expect(at(reloaded.webuiSettings, 0).client).toBe(Client.QBittorrentWebUI);
    });

    it("backs up the corrupt config, resets to defaults and tells the user", async () => {
        const corrupt = "{not valid json";
        (chrome as any).__storage.settings = corrupt;
        const loaded = await loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        expect(backupKeys()).toHaveLength(1);
        expect((chrome as any).__storage[at(backupKeys(), 0)]).toBe(corrupt);
        expect(storedSettings()).toEqual(getDefaultSettings());
    });

    it.each(["null", "0", "true", "[]", '"x"'])(
        "treats the stored value %s, which is not a plain object, as corrupt",
        async (stored) => {
            (chrome as any).__storage.settings = stored;
            const loaded = await loadSettings();

            expect(loaded).toEqual(getDefaultSettings());
            expect(backupKeys()).toHaveLength(1);
        },
    );

    it("does not reset when persisting a migration fails, and returns the migrated settings", async () => {
        const stored = getDefaultSettings();
        stored.webuiSettings = [makeWebUISettings({ client: "qBittorrent WebUI" as Client })];
        (chrome as any).__storage.settings = serializeSettings(stored);
        vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("QUOTA_BYTES exceeded"));

        const loaded = await loadSettings();

        expect(at(loaded.webuiSettings, 0).client).toBe(Client.QBittorrentWebUI);
        expect(backupKeys()).toEqual([]);
    });

    it("skips the backup and notification when the same corrupt value is already backed up", async () => {
        (chrome as any).__storage.settings = "corrupt again";
        await loadSettings();
        (chrome as any).__storage.settings = "corrupt again";

        const loaded = await loadSettings();

        expect(loaded).toEqual(getDefaultSettings());
        expect(backupKeys()).toHaveLength(1);
    });

    it("keeps every earlier backup when the config is corrupted again", async () => {
        (chrome as any).__storage.settings = "first corrupt";
        await loadSettings();
        (chrome as any).__storage.settings = "second corrupt";
        await loadSettings();

        const originals = backupKeys().map((key) => (chrome as any).__storage[key]);
        expect(originals.sort()).toEqual(["first corrupt", "second corrupt"]);
    });

    it("backs up and resets a config without a WebUI list, as it does any other invalid config", async () => {
        const stored = { ...getDefaultSettings(), notificationsDurationMs: 5000 } as Partial<RTASettings>;
        delete stored.webuiSettings;
        const original = serializeSettings(stored as RTASettings);
        (chrome as any).__storage.settings = original;

        const loaded = await loadSettings();
        expect(loaded).toEqual(getDefaultSettings());
        expect((chrome as any).__storage[at(backupKeys(), 0)]).toBe(original);
    });

    it("backs up and resets a config with an invalid value, without repeating the stored value in the log", async () => {
        const password = "s3cret-webui-password";
        const stored = {
            ...getDefaultSettings(),
            notificationsDurationMs: -1,
            webuiSettings: [makeWebUISettings({ password })],
        };
        const original = serializeSettings(stored);
        (chrome as any).__storage.settings = original;
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        try {
            const loaded = await loadSettings();

            expect(loaded).toEqual(getDefaultSettings());
            expect((chrome as any).__storage[at(backupKeys(), 0)]).toBe(original);
            expect(JSON.stringify(error.mock.calls)).toContain("Invalid notificationsDurationMs");
            expect(JSON.stringify(error.mock.calls)).not.toContain(password);
        } finally {
            error.mockRestore();
        }
    });

    it("fills keys missing from an older config with defaults and keeps stored values, falsy ones included", async () => {
        const stored = {
            ...getDefaultSettings(),
            notificationsDurationMs: 5000,
            notificationsSoundEnabled: true,
            linkCatchingEnabled: false,
        } as Partial<RTASettings>;
        delete stored.notificationsLabelButtonEnabled;
        delete stored.iconClickAction;
        (chrome as any).__storage.settings = serializeSettings(stored as RTASettings);

        const loaded = await loadSettings();
        expect(loaded.notificationsLabelButtonEnabled).toBe(getDefaultSettings().notificationsLabelButtonEnabled);
        expect(loaded.iconClickAction).toBe(getDefaultSettings().iconClickAction);
        expect(loaded.notificationsDurationMs).toBe(5000);
        expect(loaded.notificationsSoundEnabled).toBe(true);
        expect(loaded.linkCatchingEnabled).toBe(false);
        expect(backupKeys()).toEqual([]);
    });

    it("persists the filled-in defaults once, so the next load writes nothing", async () => {
        const stored = { ...getDefaultSettings() } as Partial<RTASettings>;
        delete stored.notificationsLabelButtonEnabled;
        (chrome as any).__storage.settings = serializeSettings(stored as RTASettings);
        vi.mocked(chrome.storage.local.set).mockClear();

        await loadSettings();
        expect(storedSettings().notificationsLabelButtonEnabled).toBe(true);
        await loadSettings();

        expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    });
});

describe("saveSettings", () => {
    it("serializes and stores settings under the settings key", async () => {
        const toSave = getDefaultSettings();
        toSave.notificationsSoundEnabled = true;
        await saveSettings(toSave);

        expect(chrome.storage.local.set).toHaveBeenCalled();
        expect((chrome as any).__storage.settings).toContain("notificationsSoundEnabled");
    });

    it("rejects settings that fail validation and writes nothing", async () => {
        const before = (chrome as any).__storage.settings;
        vi.mocked(chrome.storage.local.set).mockClear();
        const invalid = { ...getDefaultSettings(), notificationsDurationMs: -1 };

        await expect(saveSettings(invalid)).rejects.toThrow("Settings were not saved: Invalid notificationsDurationMs");

        expect(chrome.storage.local.set).not.toHaveBeenCalled();
        expect((chrome as any).__storage.settings).toBe(before);
    });
});

describe("Settings console output", () => {
    it("never logs WebUI credentials on load or save", async () => {
        const password = "s3cret-webui-password";
        const spies = (["log", "info", "debug", "warn", "error"] as const).map((method) =>
            vi.spyOn(console, method).mockImplementation(() => {}),
        );
        try {
            const settings = getDefaultSettings();
            settings.webuiSettings = [makeWebUISettings({ password })];

            await saveSettings(settings);
            await loadSettings();
            (chrome as any).__storage.settings = undefined;
            await loadSettings();

            expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
            for (const spy of spies) {
                expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
            }
        } finally {
            vi.restoreAllMocks();
        }
    });
});
