import { describe, it, expect, vi } from "vitest";
import { Settings } from "../../src/util/settings";
import { serializeSettings } from "../../src/util/serializer";
import { getDefaultSettings } from "../../src/util/settings-defaults";
import { Client } from "../../src/models/clients";
import { type RTASettings } from "../../src/models/settings";
import { makeWebUISettings } from "../helpers/fixtures";
import { at } from "../helpers/assert";

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

    it("falls back to defaults when stored data cannot be parsed", async () => {
        (chrome as any).__storage.settings = "{not valid json";
        const loaded = await new Settings().loadSettings();
        expect(loaded).toEqual(getDefaultSettings());
    });

    it("treats a config without a WebUI list as having no WebUIs, keeping the rest", async () => {
        const stored = { ...getDefaultSettings(), notificationsDurationMs: 5000 } as Partial<RTASettings>;
        delete stored.webuiSettings;
        (chrome as any).__storage.settings = serializeSettings(stored as RTASettings);

        const loaded = await new Settings().loadSettings();
        expect(loaded.webuiSettings).toEqual([]);
        expect(loaded.notificationsDurationMs).toBe(5000);
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
