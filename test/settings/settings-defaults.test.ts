import { describe, it, expect } from "vitest";
import { createWebUiSettings, getDefaultSettings } from "../../src/settings/settings-defaults";

describe("getDefaultSettings", () => {
    it("enables notifications and link-catching by default", () => {
        const defaults = getDefaultSettings();
        expect(defaults.notificationsEnabled).toBe(true);
        expect(defaults.notificationsDurationMs).toBe(2000);
        expect(defaults.notificationsSoundEnabled).toBe(false);
        expect(defaults.notificationsLabelButtonEnabled).toBe(true);
        expect(defaults.linkCatchingEnabled).toBe(true);
    });

    it("provides default link-catching regexes that match torrent links", () => {
        const { linkCatchingRegexes } = getDefaultSettings();
        expect(linkCatchingRegexes.length).toBeGreaterThan(0);
        const matchesSome = (url: string) => linkCatchingRegexes.some((r) => r.test(url));
        expect(matchesSome("https://site.com/ubuntu.torrent")).toBe(true);
        expect(matchesSome("https://site.com/torrents.php?action=download&id=1")).toBe(true);
    });

    it("starts with no configured webuis", () => {
        expect(getDefaultSettings().webuiSettings).toEqual([]);
    });

    it("returns a fresh object on each call", () => {
        expect(getDefaultSettings()).not.toBe(getDefaultSettings());
    });
});

describe("createWebUiSettings", () => {
    it("gives every new WebUI a fresh id", () => {
        expect(createWebUiSettings().id).not.toBe(createWebUiSettings().id);
        expect(createWebUiSettings().id).not.toBe("");
    });

    it("starts as a draft with no client chosen and every field filled", () => {
        const { id: _id, ...fields } = createWebUiSettings();
        expect(fields.client).toBe("");
        expect(fields).toMatchObject({
            name: "",
            host: "",
            port: null,
            relativePath: "",
            showPerTorrentConfigSelector: false,
            defaultLabel: null,
            defaultDir: null,
            labels: [],
            dirs: [],
            addPaused: false,
            autoLabelDirSettings: [],
            clientSpecificSettings: {},
            useAlternativeLabelDirChooser: false,
        });
    });
});
