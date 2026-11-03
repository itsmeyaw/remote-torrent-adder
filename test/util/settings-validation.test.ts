import { describe, it, expect } from "vitest";
import { parseSettingsExport } from "../../src/util/settings-validation";
import { serializeSettings } from "../../src/util/serializer";
import { getDefaultSettings } from "../../src/util/settings-defaults";
import { Client } from "../../src/models/clients";
import { makeWebUISettings } from "../helpers/fixtures";

function exportWith(mutate: (raw: any) => void): string {
    const raw = JSON.parse(serializeSettings(getDefaultSettings()));
    raw.webuiSettings = [makeWebUISettings({ id: "w1", name: "Home" })];
    mutate(raw);
    return JSON.stringify(raw);
}

function problemsOf(text: string): string[] {
    const result = parseSettingsExport(text);
    if (result.ok) throw new Error("expected the export to be rejected");
    return result.problems;
}

describe("parseSettingsExport", () => {
    it("accepts an export produced by serializeSettings and restores its WebUIs and patterns", () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "w1", name: "Home", host: "nas.local", port: 8080 })];

        const result = parseSettingsExport(serializeSettings(settings));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings).toEqual(settings.webuiSettings);
        expect(result.settings.linkCatchingRegexes.map(r => r.source)).toEqual(settings.linkCatchingRegexes.map(r => r.source));
    });

    it("rejects text that is not JSON", () => {
        expect(problemsOf("{not json")).toEqual(["That is not valid JSON."]);
    });

    it.each([["null"], ["[]"], ["\"text\""], ["{}"]])("rejects JSON that is not a settings export: %s", text => {
        expect(problemsOf(text)).toEqual(["That JSON is not a Remote Torrent Adder settings export."]);
    });

    it("names the WebUI that is missing a required field", () => {
        const text = exportWith(raw => { delete raw.webuiSettings[0].host; });
        expect(problemsOf(text)).toEqual(['WebUI 1 ("Home"): missing host']);
    });

    it("names a WebUI field with the wrong type", () => {
        const text = exportWith(raw => { raw.webuiSettings[0].port = "8080"; });
        expect(problemsOf(text)).toEqual(['WebUI 1 ("Home"): invalid port']);
    });

    it("rejects a WebUI whose client is not a known Client", () => {
        const text = exportWith(raw => { raw.webuiSettings[0].client = "not-a-client"; });
        expect(problemsOf(text)).toEqual(['WebUI 1 ("Home"): invalid client']);
    });

    it("accepts a legacy client identifier and migrates it, as stored settings are", () => {
        const text = exportWith(raw => { raw.webuiSettings[0].client = "qBittorrent WebUI"; });

        const result = parseSettingsExport(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings[0]!.client).toBe(Client.QBittorrentWebUI);
    });

    it("reports every invalid WebUI in a partially invalid import", () => {
        const text = exportWith(raw => {
            raw.webuiSettings = [
                makeWebUISettings({ id: "w1", name: "Good" }),
                { ...makeWebUISettings({ id: "w2", name: "Home" }), host: undefined },
                { ...makeWebUISettings({ id: "w3", name: "Office" }), labels: "movies" },
            ];
        });
        expect(problemsOf(text)).toEqual([
            'WebUI 2 ("Home"): missing host',
            'WebUI 3 ("Office"): invalid labels',
        ]);
    });

    it("rejects an empty Link Catching Pattern", () => {
        const text = exportWith(raw => { raw.linkCatchingRegexes = [{ __type: "RegExp", source: "  ", flags: "" }]; });
        expect(problemsOf(text)).toEqual(["Link Catching pattern 1 is empty."]);
    });

    it("rejects a Link Catching Pattern that does not compile", () => {
        const text = exportWith(raw => { raw.linkCatchingRegexes = [{ __type: "RegExp", source: "(", flags: "" }]; });
        expect(problemsOf(text)).toEqual(["Link Catching pattern 1 is not a valid regular expression."]);
    });

    it("uses the default Link Catching Patterns when the export has none", () => {
        const text = exportWith(raw => { delete raw.linkCatchingRegexes; });

        const result = parseSettingsExport(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.linkCatchingRegexes.map(r => r.source)).toEqual(getDefaultSettings().linkCatchingRegexes.map(r => r.source));
    });

    it("rejects a null Link Catching Pattern list instead of storing it", () => {
        const text = exportWith(raw => { raw.linkCatchingRegexes = null; });
        expect(problemsOf(text)).toEqual(["Link Catching patterns must be a list."]);
    });

    it("accepts a draft WebUI, as WebUIsPage stores a new one before a client is chosen", () => {
        const draft = makeWebUISettings({ id: "draft", name: "", client: "" as Client, host: "", port: null, relativePath: "" });
        const text = exportWith(raw => { raw.webuiSettings = [draft]; });

        const result = parseSettingsExport(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.webuiSettings).toEqual([draft]);
    });

    it("accepts an older export whose WebUIs predate Auto Label/Dir Rules and Client-Specific Settings", () => {
        const text = exportWith(raw => {
            delete raw.webuiSettings[0].autoLabelDirSettings;
            delete raw.webuiSettings[0].clientSpecificSettings;
        });

        expect(parseSettingsExport(text).ok).toBe(true);
    });

    it("still rejects Auto Label/Dir Rules and Client-Specific Settings of the wrong type", () => {
        const text = exportWith(raw => {
            raw.webuiSettings[0].autoLabelDirSettings = {};
            raw.webuiSettings[0].clientSpecificSettings = [];
        });
        expect(problemsOf(text)).toEqual([
            'WebUI 1 ("Home"): invalid autoLabelDirSettings',
            'WebUI 1 ("Home"): invalid clientSpecificSettings',
        ]);
    });
});
