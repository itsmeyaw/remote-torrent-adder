import { describe, it, expect, vi, beforeEach } from "vitest";
import { at } from "../helpers/assert";

// The Add flow lives in add.ts and has its own tests; here we only check the router hands messages over.
const { showNotification, addLink, addBufferedTorrent } = vi.hoisted(() => ({
    showNotification: vi.fn(),
    addLink: vi.fn((_url: string, _target: unknown, _page?: unknown) => Promise.resolve()),
    addBufferedTorrent: vi.fn((_choice: unknown) => Promise.resolve()),
}));
vi.mock("../../src/background/notifications", () => ({ showNotification }));
vi.mock("../../src/background/add", () => ({ addLink, addBufferedTorrent }));

import { registerMessageListener } from "../../src/background/messaging";
import { HandledFailure } from "../../src/util/errors";
import {
    GetSettingsMessage,
    SaveSettingsMessage,
    TestNotificationMessage,
    PreAddTorrentMessage,
    AddTorrentMessageWithLabelAndDir,
    SetTorrentLabelMessage,
    OpenWebUiMessage,
} from "../../src/models/messages";
import { serializeSettings, deserializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { Client } from "../../src/models/clients";
import { makeWebUISettings } from "../helpers/fixtures";

/** Registers the listener and returns it so tests can invoke it directly. */
function getListener() {
    registerMessageListener();
    const calls = (chrome.runtime.onMessage.addListener as any).mock.calls;
    return calls[calls.length - 1][0];
}

/** Invokes the listener and resolves with the value passed to sendResponse. */
function dispatch(message: any, sender: any = {}): Promise<any> {
    const listener = getListener();
    return new Promise((resolve) => {
        listener(message, sender, resolve);
    });
}

beforeEach(() => {
    showNotification.mockClear();
    addLink.mockClear();
    addBufferedTorrent.mockClear();
});

describe("registerMessageListener routing", () => {
    it("responds with an error when the message has no action", async () => {
        expect(await dispatch({})).toEqual({ error: "missing action" });
    });

    it("responds with an error for an unknown action", async () => {
        expect(await dispatch({ action: "nope" })).toEqual({ error: "unknown action: nope" });
    });

    it("returns serialized settings for GetSettings", async () => {
        const stored = getDefaultSettings();
        stored.notificationsDurationMs = 4321;
        (chrome as any).__storage.settings = serializeSettings(stored);

        const response = await dispatch({ action: GetSettingsMessage.action });
        expect(deserializeSettings(response)!.notificationsDurationMs).toBe(4321);
    });

    it("persists settings for SaveSettings", async () => {
        const toSave = getDefaultSettings();
        toSave.notificationsSoundEnabled = true;
        const response = await dispatch({
            action: SaveSettingsMessage.action,
            settings: serializeSettings(toSave),
        });
        expect(response).toEqual({});
        expect(deserializeSettings((chrome as any).__storage.settings)!.notificationsSoundEnabled).toBe(true);
    });

    it.each([
        ["", "That is not valid JSON."],
        ["null", "That JSON is not a Remote Torrent Adder settings export."],
        ["[]", "That JSON is not a Remote Torrent Adder settings export."],
    ])("rejects a SaveSettings payload that is not a settings export (%j) and keeps the stored settings", async (settings, problem) => {
        const before = (chrome as any).__storage.settings;
        const response = await dispatch({ action: SaveSettingsMessage.action, settings });
        expect(response).toEqual({ error: problem });
        expect((chrome as any).__storage.settings).toBe(before);
    });

    it("rejects a SaveSettings payload with an invalid setting and reports the problem", async () => {
        const before = (chrome as any).__storage.settings;
        const invalid = { ...getDefaultSettings(), notificationsDurationMs: -1 };
        const response = await dispatch({ action: SaveSettingsMessage.action, settings: serializeSettings(invalid) });
        expect(response).toEqual({ error: "Invalid notificationsDurationMs" });
        expect((chrome as any).__storage.settings).toBe(before);
    });

    it("shows a notification for TestNotification", async () => {
        await dispatch({
            action: TestNotificationMessage.action,
            title: "T",
            message: "M",
            isFailed: false,
            popupDurationMs: 1000,
            playSound: false,
        });
        expect(showNotification).toHaveBeenCalledWith("T", "M", false, 1000, false);
    });
});

describe("Add messages", () => {
    it("hands a pre-add to addLink with its WebUI and the tab it came from", async () => {
        const response = await dispatch(
            { action: PreAddTorrentMessage.action, url: "https://tracker.org/get/1.torrent", webUiId: "w1" },
            { tab: { id: 9, windowId: 1, url: "https://tracker.org/browse" }, frameId: 3 },
        );

        expect(response).toEqual({});
        expect(addLink).toHaveBeenCalledWith(
            "https://tracker.org/get/1.torrent",
            { webUiId: "w1" },
            { tabId: 9, frameId: 3, pageUrl: "https://tracker.org/browse", windowId: 1 },
        );
    });

    it("hands a pre-add without a WebUI id to addLink as the Primary WebUI target", async () => {
        await dispatch({ action: PreAddTorrentMessage.action, url: "magnet:?x" });

        expect(at(addLink.mock.calls, 0)[1]).toEqual({ webUiId: undefined });
    });

    it("responds with the message of a failed pre-add", async () => {
        addLink.mockRejectedValueOnce(new HandledFailure("Adding Cool Torrent to My Client failed (HTTP 500): nope"));

        const response = await dispatch({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" });

        expect(response).toEqual({ error: "Adding Cool Torrent to My Client failed (HTTP 500): nope" });
    });

    it("hands the Config Selector's choice to addBufferedTorrent", async () => {
        const message = {
            action: AddTorrentMessageWithLabelAndDir.action,
            bufferedId: "b1",
            config: { label: "movies" },
            labels: ["movies"],
            directories: ["/data"],
        };

        const response = await dispatch(message);

        expect(response).toEqual({});
        expect(addBufferedTorrent).toHaveBeenCalledWith(message);
    });

    it("responds with the message of a failed buffered add", async () => {
        addBufferedTorrent.mockRejectedValueOnce(new HandledFailure("No buffered torrent to add; it may already have been consumed."));

        const response = await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            bufferedId: "unknown",
            config: {},
            labels: [],
            directories: [],
        });

        expect(response).toEqual({ error: "No buffered torrent to add; it may already have been consumed." });
    });
});

describe("setTorrentLabel", () => {
    const infoHash = "0123456789abcdef0123456789abcdef01234567";

    function seedWebUi() {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, host: "h", port: 8080, labels: ["old"] })];
        (chrome as any).__storage.settings = serializeSettings(settings);
    }

    function respondToEveryFetchWith(ok: boolean, status: number) {
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok, status, text: () => Promise.resolve(ok ? "Ok." : "nope") } as any),
        );
    }

    it("sets the label, remembers the label list and confirms with a notification", async () => {
        seedWebUi();
        respondToEveryFetchWith(true, 200);

        const response = await dispatch({
            action: SetTorrentLabelMessage.action,
            webUiId: "w1",
            infoHash,
            torrentName: "Cool Torrent",
            label: "movies",
            labels: ["movies", "old"],
        });

        expect(response).toEqual({});
        const setCategoryCall = (globalThis as any).fetch.mock.calls.find((call: any[]) => String(call[0]).endsWith("/setCategory"));
        expect(setCategoryCall[1].body.get("hashes")).toBe(infoHash);
        expect(at(deserializeSettings((chrome as any).__storage.settings)!.webuiSettings, 0).labels).toEqual(["movies", "old"]);
        expect(at(showNotification.mock.calls, 0)[0]).toBe("Label set");
    });

    it("reports the failure to the popup and keeps the label list when the client refuses", async () => {
        seedWebUi();
        respondToEveryFetchWith(false, 500);

        const response = await dispatch({
            action: SetTorrentLabelMessage.action,
            webUiId: "w1",
            infoHash,
            torrentName: "Cool Torrent",
            label: "movies",
            labels: ["movies", "old"],
        });

        expect(response.error).toMatch(/Setting the label failed \(HTTP 500\)/);
        expect(at(deserializeSettings((chrome as any).__storage.settings)!.webuiSettings, 0).labels).toEqual(["old"]);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("reports an unknown webui", async () => {
        seedWebUi();

        const response = await dispatch({
            action: SetTorrentLabelMessage.action,
            webUiId: "missing",
            infoHash,
            torrentName: "Cool Torrent",
            label: "movies",
            labels: [],
        });

        expect(response.error).toBe("No WebUI found for id missing");
    });
});

describe("openWebUi", () => {
    const extensionPage = () => ({ url: chrome.runtime.getURL("popup/popup.html") });

    function seedTwoWebUis() {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.RqbitWebUI, host: "first", port: 8080 }),
            makeWebUISettings({ id: "w2", client: Client.RqbitWebUI, host: "second", port: 9090 }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
    }

    it("opens the chosen webui and responds without waiting for the tab to load", async () => {
        seedTwoWebUis();

        expect(await dispatch({ action: OpenWebUiMessage.action, webUiId: "w2" }, extensionPage())).toEqual({});
        await vi.waitFor(() => expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://second:9090/" }));
    });

    it("reports an unknown webui", async () => {
        seedTwoWebUis();

        const response = await dispatch({ action: OpenWebUiMessage.action, webUiId: "missing" }, extensionPage());

        expect(response.error).toBe("No WebUI found for id missing");
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("refuses the message from a web page, so a page cannot open a WebUI", async () => {
        seedTwoWebUis();

        const response = await dispatch(
            { action: OpenWebUiMessage.action, webUiId: "w2" },
            { url: "https://evil.example/", tab: { id: 9 } },
        );

        expect(response.error).toMatch(/extension pages/);
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
});
