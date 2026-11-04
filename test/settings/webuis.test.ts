import { describe, it, expect } from "vitest";
import { findWebUiSettings, getPrimaryWebUi, getWebUi, getWebUis } from "../../src/settings/webuis";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { Client } from "../../src/models/clients";
import { type RTASettings } from "../../src/models/settings";
import { QBittorrentWebUI } from "../../src/webuis/qbittorrent";
import { makeWebUISettings } from "../helpers/fixtures";
import { at } from "../helpers/assert";

function settingsWith(...webuiSettings: ReturnType<typeof makeWebUISettings>[]): RTASettings {
    return { ...getDefaultSettings(), webuiSettings };
}

const qbit = (id: string) => makeWebUISettings({ id, client: Client.QBittorrentWebUI });
const draft = (id: string) => makeWebUISettings({ id, client: "unknown" as Client });

describe("findWebUiSettings", () => {
    it("finds the configured WebUI with the given id", () => {
        const settings = settingsWith(qbit("a"), qbit("b"));
        expect(findWebUiSettings(settings, "b")?.id).toBe("b");
    });

    it("finds a draft WebUI, which has no client yet", () => {
        expect(findWebUiSettings(settingsWith(draft("d")), "d")?.id).toBe("d");
    });

    it("returns undefined for an unknown id", () => {
        expect(findWebUiSettings(settingsWith(qbit("a")), "missing")).toBeUndefined();
    });

    it.each([[""], [null], [undefined]])("returns undefined for the id %j", (id) => {
        expect(findWebUiSettings(settingsWith(makeWebUISettings({ id: "" })), id)).toBeUndefined();
    });
});

describe("getWebUi", () => {
    it("constructs the WebUI with the given id", () => {
        const webUi = getWebUi(settingsWith(qbit("a"), qbit("b")), "b");
        expect(webUi).toBeInstanceOf(QBittorrentWebUI);
        expect(webUi?.settings.id).toBe("b");
    });

    it("returns null for a draft without a client", () => {
        expect(getWebUi(settingsWith(draft("d")), "d")).toBeNull();
    });

    it("returns null for an unknown id", () => {
        expect(getWebUi(settingsWith(qbit("a")), "missing")).toBeNull();
    });

    it("returns null for a missing id", () => {
        expect(getWebUi(settingsWith(qbit("a")), undefined)).toBeNull();
    });
});

describe("getWebUis", () => {
    it("constructs every configured WebUI in list order", () => {
        const webUis = getWebUis(settingsWith(qbit("b"), qbit("a")));
        expect(webUis.map((webUi) => webUi.settings.id)).toEqual(["b", "a"]);
        expect(at(webUis, 0)).toBeInstanceOf(QBittorrentWebUI);
    });

    it("skips drafts without a client", () => {
        const webUis = getWebUis(settingsWith(draft("d"), qbit("a")));
        expect(webUis.map((webUi) => webUi.settings.id)).toEqual(["a"]);
    });

    it("returns an empty array when no WebUIs are configured", () => {
        expect(getWebUis(getDefaultSettings())).toEqual([]);
    });
});

describe("getPrimaryWebUi", () => {
    it("returns the first configured WebUI", () => {
        expect(getPrimaryWebUi(settingsWith(qbit("a"), qbit("b")))?.settings.id).toBe("a");
    });

    it("skips a leading draft", () => {
        expect(getPrimaryWebUi(settingsWith(draft("d"), qbit("a")))?.settings.id).toBe("a");
    });

    it("returns null when no WebUI is configured", () => {
        expect(getPrimaryWebUi(getDefaultSettings())).toBeNull();
    });
});
