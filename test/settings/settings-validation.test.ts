import { describe, it, expect } from "vite-plus/test";
import { parseSettings } from "../../src/settings/settings-validation";
import { serializeSettings } from "../../src/settings/serializer";
import { createWebUiSettings, getDefaultSettings } from "../../src/settings/settings-defaults";
import { Client } from "../../src/models/clients";
import { makeWebUISettings } from "../helpers/fixtures";

const NOT_AN_EXPORT = "That JSON is not a Remote Torrent Adder settings export.";

function exportWith(mutate: (raw: any) => void): string {
    const raw = JSON.parse(serializeSettings(getDefaultSettings()));
    raw.webuiSettings = [makeWebUISettings({ id: "w1", name: "Home" })];
    mutate(raw);
    return JSON.stringify(raw);
}

function problemsOf(text: string): string[] {
    const result = parseSettings(text);
    if (result.ok) throw new Error("expected the export to be rejected");
    return result.problems;
}

describe("parseSettings", () => {
    it("accepts an export produced by serializeSettings and restores its WebUIs and patterns", () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "w1", name: "Home", host: "nas.local", port: 8080 })];

        const result = parseSettings(serializeSettings(settings));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings).toEqual(settings.webuiSettings);
        expect(result.settings.linkCatchingRegexes.map((r) => r.source)).toEqual(
            settings.linkCatchingRegexes.map((r) => r.source),
        );
    });

    it("rejects text that is not JSON", () => {
        expect(problemsOf("{not json")).toEqual(["That is not valid JSON."]);
    });

    it.each([["null"], ["[]"], ['"text"'], ["{}"]])("rejects JSON that is not a settings export: %s", (text) => {
        expect(problemsOf(text)).toEqual([NOT_AN_EXPORT]);
    });

    it.each([["id"], ["client"]])("names the WebUI that is missing its %s, which cannot be made up", (field) => {
        const text = exportWith((raw) => {
            delete raw.webuiSettings[0][field];
        });
        expect(problemsOf(text)).toEqual([`WebUI 1 ("Home"): missing ${field}`]);
    });

    it("keeps a WebUI that is missing fields with a default, filling them in", () => {
        const text = exportWith((raw) => {
            delete raw.webuiSettings[0].host;
            delete raw.webuiSettings[0].addPaused;
            delete raw.webuiSettings[0].dirs;
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings[0]).toMatchObject({
            id: "w1",
            name: "Home",
            host: "",
            addPaused: false,
            dirs: [],
        });
    });

    it("orders a filled-in WebUI's fields like a newly created one, so both serialize the same", () => {
        const created = createWebUiSettings();
        const { id, ...fields } = created;
        const text = exportWith((raw) => {
            raw.webuiSettings = [{ ...fields, id }];
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Object.keys(result.settings.webuiSettings[0]!)).toEqual(Object.keys(created));
    });

    it("names a WebUI field with the wrong type", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings[0].port = "8080";
        });
        expect(problemsOf(text)).toEqual(['WebUI 1 ("Home"): invalid port']);
    });

    it("rejects a WebUI whose client is not a known Client", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings[0].client = "not-a-client";
        });
        expect(problemsOf(text)).toEqual(['WebUI 1 ("Home"): invalid client']);
    });

    it("accepts a legacy client identifier and migrates it, as stored settings are", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings[0].client = "qBittorrent WebUI";
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings[0]!.client).toBe(Client.QBittorrentWebUI);
    });

    it("reports every invalid WebUI in a partially invalid import", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings = [
                makeWebUISettings({ id: "w1", name: "Good" }),
                { ...makeWebUISettings({ id: "w2", name: "Home" }), client: undefined },
                { ...makeWebUISettings({ id: "w3", name: "Office" }), labels: "movies" },
            ];
        });
        expect(problemsOf(text)).toEqual(['WebUI 2 ("Home"): missing client', 'WebUI 3 ("Office"): invalid labels']);
    });

    it("rejects an empty Link Catching Pattern", () => {
        const text = exportWith((raw) => {
            raw.linkCatchingRegexes = [{ __type: "RegExp", source: "  ", flags: "" }];
        });
        expect(problemsOf(text)).toEqual(["Link Catching pattern 1 is empty."]);
    });

    it("rejects a Link Catching Pattern that does not compile", () => {
        const text = exportWith((raw) => {
            raw.linkCatchingRegexes = [{ __type: "RegExp", source: "(", flags: "" }];
        });
        expect(problemsOf(text)).toEqual(["Link Catching pattern 1 is not a valid regular expression."]);
    });

    it("uses the default Link Catching Patterns when the export has none", () => {
        const text = exportWith((raw) => {
            delete raw.linkCatchingRegexes;
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.linkCatchingRegexes.map((r) => r.source)).toEqual(
            getDefaultSettings().linkCatchingRegexes.map((r) => r.source),
        );
    });

    it("rejects a null Link Catching Pattern list instead of storing it", () => {
        const text = exportWith((raw) => {
            raw.linkCatchingRegexes = null;
        });
        expect(problemsOf(text)).toEqual(["Link Catching patterns must be a list."]);
    });

    it("accepts a draft WebUI, as WebUIsPage stores a new one before a client is chosen", () => {
        const draft = makeWebUISettings({
            id: "draft",
            name: "",
            client: "" as Client,
            host: "",
            port: null,
            relativePath: "",
        });
        const text = exportWith((raw) => {
            raw.webuiSettings = [draft];
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings).toEqual([draft]);
    });

    it("fills the WebUI fields that were added after older exports were made", () => {
        const text = exportWith((raw) => {
            delete raw.webuiSettings[0].useAlternativeLabelDirChooser;
            delete raw.webuiSettings[0].autoLabelDirSettings;
            delete raw.webuiSettings[0].clientSpecificSettings;
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings[0]).toMatchObject({
            useAlternativeLabelDirChooser: false,
            autoLabelDirSettings: [],
            clientSpecificSettings: {},
        });
    });

    it("keeps the stored values of the WebUI fields added later", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings[0].useAlternativeLabelDirChooser = true;
        });

        const result = parseSettings(text);

        expect(result.ok && result.settings.webuiSettings[0]!.useAlternativeLabelDirChooser).toBe(true);
    });

    it("still rejects WebUI fields added later that have the wrong type", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings[0].useAlternativeLabelDirChooser = "yes";
            raw.webuiSettings[0].autoLabelDirSettings = {};
            raw.webuiSettings[0].clientSpecificSettings = [];
        });
        expect(problemsOf(text)).toEqual([
            'WebUI 1 ("Home"): invalid useAlternativeLabelDirChooser',
            'WebUI 1 ("Home"): invalid autoLabelDirSettings',
            'WebUI 1 ("Home"): invalid clientSpecificSettings',
        ]);
    });

    it("fills top-level settings missing from the export with their defaults", () => {
        const text = exportWith((raw) => {
            delete raw.notificationsSoundEnabled;
            delete raw.iconClickAction;
            delete raw.notificationsDurationMs;
        });

        const result = parseSettings(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings).toMatchObject({
            notificationsSoundEnabled: getDefaultSettings().notificationsSoundEnabled,
            iconClickAction: getDefaultSettings().iconClickAction,
            notificationsDurationMs: getDefaultSettings().notificationsDurationMs,
        });
    });

    it.each([
        ["notificationsEnabled", "yes"],
        ["notificationsSoundEnabled", 1],
        ["notificationsLabelButtonEnabled", null],
        ["linkCatchingEnabled", "true"],
        ["notificationsDurationMs", "2000"],
        ["notificationsDurationMs", -1],
        ["iconClickAction", "openOptions"],
    ])("rejects a top-level %s of the wrong type or value (%j)", (field, value) => {
        const text = exportWith((raw) => {
            raw[field] = value;
        });
        expect(problemsOf(text)).toEqual([`Invalid ${field}`]);
    });

    it("never repeats a WebUI password in a problem message", () => {
        const password = "s3cret-webui-password";
        const text = exportWith((raw) => {
            raw.webuiSettings[0] = { ...makeWebUISettings({ id: "w1", name: "Home", password }), port: "8080" };
            raw.notificationsDurationMs = -1;
        });
        expect(problemsOf(text).join("\n")).not.toContain(password);
    });

    it("accepts an export whose WebUIs predate Auto Label/Dir Rules and Client-Specific Settings", () => {
        const text = exportWith((raw) => {
            delete raw.webuiSettings[0].autoLabelDirSettings;
            delete raw.webuiSettings[0].clientSpecificSettings;
        });

        expect(parseSettings(text).ok).toBe(true);
    });

    it("still rejects Auto Label/Dir Rules and Client-Specific Settings of the wrong type", () => {
        const text = exportWith((raw) => {
            raw.webuiSettings[0].autoLabelDirSettings = {};
            raw.webuiSettings[0].clientSpecificSettings = [];
        });
        expect(problemsOf(text)).toEqual([
            'WebUI 1 ("Home"): invalid autoLabelDirSettings',
            'WebUI 1 ("Home"): invalid clientSpecificSettings',
        ]);
    });
});
