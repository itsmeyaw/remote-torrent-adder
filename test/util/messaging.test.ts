import { describe, it, expect, vi, beforeEach } from "vitest";
import { at, callArgs } from "../helpers/assert";

// Mock the heavy collaborators so the dispatcher can be exercised in isolation.
const { showNotification, downloadTorrent } = vi.hoisted(() => ({
    showNotification: vi.fn(),
    downloadTorrent: vi.fn(),
}));
vi.mock("../../src/util/notifications", () => ({ showNotification }));
vi.mock("../../src/util/download", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    downloadTorrent,
}));

import { registerMessageListener, dispatchPreAddTorrent } from "../../src/util/messaging";
import {
    GetSettingsMessage,
    SaveSettingsMessage,
    TestNotificationMessage,
    PreAddTorrentMessage,
    AddTorrentMessage,
    AddTorrentMessageWithLabelAndDir,
    SetTorrentLabelMessage,
    OpenWebUiMessage,
} from "../../src/models/messages";
import { serializeSettings, deserializeSettings } from "../../src/util/serializer";
import { getDefaultSettings } from "../../src/util/settings-defaults";
import { Client } from "../../src/models/clients";
import { makeWebUISettings, makeMagnetTorrent, makeFileTorrent } from "../helpers/fixtures";
import { readBufferedTorrent, saveBufferedTorrent } from "../../src/util/buffered-torrent";
import { CloudflareChallengeError } from "../../src/util/download";
import { QBittorrentWebUI } from "../../src/webuis/qbittorrent-webui";
import { Settings } from "../../src/util/settings";

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
        const willRespondAsync = listener(message, sender, resolve);
        if (!willRespondAsync) {
            // synchronous responders already called sendResponse
        }
    });
}

beforeEach(() => {
    showNotification.mockClear();
    downloadTorrent.mockReset();
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

    it.each([[""], ["null"], ["5"], ["[]"]])("rejects a SaveSettings payload that is not a settings object (%j) and keeps the stored settings", async (settings) => {
        const before = (chrome as any).__storage.settings;
        const response = await dispatch({ action: SaveSettingsMessage.action, settings });
        expect(response).toEqual({ error: "SaveSettings payload is not a settings object" });
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

describe("AddTorrent flow", () => {
    function seedWebUi(over = {}) {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, host: "h", port: 8080, ...over })];
        (chrome as any).__storage.settings = serializeSettings(settings);
    }

    it("downloads and sends the torrent, then shows a success notification", async () => {
        seedWebUi();
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        // qBittorrent: auth then add, both ok
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );

        await dispatch({ action: AddTorrentMessage.action, webUiId: "w1", url: "magnet:?x", config: {} });
        await new Promise((r) => setTimeout(r, 0));

        expect(downloadTorrent).toHaveBeenCalledWith("magnet:?x", { tabId: null, frameId: 0, pageUrl: null });
        expect(showNotification).toHaveBeenCalled();
        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
    });

    it("shows the success notification with the warning when a follow-up step does not apply", async () => {
        seedWebUi({ client: Client.RqbitWebUI, host: "h", port: 1337 });
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{"id":7}') } as any)
            .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve("not found") } as any);

        const response = await dispatch({ action: AddTorrentMessage.action, webUiId: "w1", url: "magnet:?x", config: { addPaused: true } });
        await new Promise((r) => setTimeout(r, 0));

        expect(response).toEqual({});
        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[1]).toContain("Add Paused was not applied");
        expect(callArgs(showNotification, 0)[2]).toBe(false);
    });

    it("notifies the user when downloading the torrent fails", async () => {
        seedWebUi();
        downloadTorrent.mockRejectedValue(new Error("network down"));

        await dispatch({ action: AddTorrentMessage.action, webUiId: "w1", url: "magnet:?x", config: {} });
        await new Promise((r) => setTimeout(r, 0));

        expect(showNotification).toHaveBeenCalled();
        expect(callArgs(showNotification, 0)[0]).toBe("Error downloading torrent");
    });

    it("reports a failed download to the caller without a notification when notifications are off", async () => {
        const settings = { ...getDefaultSettings(), notificationsEnabled: false };
        settings.webuiSettings = [makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, host: "h", port: 8080 })];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockRejectedValue(new Error("network down"));

        const response = await dispatch({ action: AddTorrentMessage.action, webUiId: "w1", url: "magnet:?x", config: {} });

        expect(response.error).toMatch(/network down/);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("hands the download over to the tab the link was clicked in", async () => {
        seedWebUi();
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );

        await dispatch(
            { action: AddTorrentMessage.action, webUiId: "w1", url: "https://tracker.org/get/1.torrent", config: {} },
            { tab: { id: 9, windowId: 1, url: "https://tracker.org/browse" }, frameId: 3 },
        );
        await new Promise((r) => setTimeout(r, 0));

        expect(downloadTorrent).toHaveBeenCalledWith("https://tracker.org/get/1.torrent", {
            tabId: 9,
            frameId: 3,
            pageUrl: "https://tracker.org/browse",
        });
    });

    it("points the notification at the tracker when Cloudflare challenges the download", async () => {
        seedWebUi();
        downloadTorrent.mockRejectedValue(new CloudflareChallengeError("https://tracker.org/get/1.torrent"));

        await dispatch({ action: AddTorrentMessage.action, webUiId: "w1", url: "https://tracker.org/get/1.torrent", config: {} });
        await new Promise((r) => setTimeout(r, 0));

        expect(callArgs(showNotification, 0)[0]).toBe("Cloudflare is blocking this download");
        expect(callArgs(showNotification, 0)[5]).toBe("https://tracker.org/get/1.torrent");
    });

    it("persists updated labels and dirs for AddTorrentMessageWithLabelAndDir", async () => {
        seedWebUi();
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );
        await saveBufferedTorrent({
            torrent: makeMagnetTorrent(),
            webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
        });

        await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            webUiId: "w1",
            config: {},
            labels: ["movies", "tv"],
            directories: ["/data"],
        });
        await new Promise((r) => setTimeout(r, 0));

        const persisted = deserializeSettings((chrome as any).__storage.settings)!;
        expect(at(persisted.webuiSettings, 0).labels).toEqual(["movies", "tv"]);
        expect(at(persisted.webuiSettings, 0).dirs).toEqual(["/data"]);
    });

    it("takes the torrent from IndexedDB rather than from the message", async () => {
        seedWebUi();
        const fetchMock = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );
        (globalThis as any).fetch = fetchMock;
        await saveBufferedTorrent({
            torrent: makeFileTorrent({ name: "parked.torrent" }),
            webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
        });

        await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            webUiId: "w1",
            config: { label: "movies" },
            labels: [],
            directories: [],
        });
        const uploadCall = await vi.waitFor(() => {
            const call = (fetchMock.mock.calls as any[][]).find(c => String(c[0]).includes("/torrents/add"));
            expect(call).toBeDefined();
            return call!;
        });
        const body = uploadCall[1].body as FormData;
        expect((body.get("torrents") as File).name).toBe("parked.torrent");
        expect(body.get("category")).toBe("movies");
    });

    it("clears the buffered torrent once it has been handed to the client", async () => {
        seedWebUi();
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );
        await saveBufferedTorrent({
            torrent: makeMagnetTorrent(),
            webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
        });

        await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            webUiId: "w1",
            config: {},
            labels: [],
            directories: [],
        });
        await new Promise((r) => setTimeout(r, 0));

        expect(await readBufferedTorrent()).toBeNull();
    });

    it("reports an error when the popup adds with nothing buffered", async () => {
        seedWebUi();

        const response = await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            webUiId: "w1",
            config: {},
            labels: [],
            directories: [],
        });

        expect(response.error).toMatch(/No buffered torrent/i);
    });

    it("keeps the buffered torrent and reports the error when the WebUI refuses the add", async () => {
        seedWebUi();
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );
        await saveBufferedTorrent({
            torrent: makeMagnetTorrent(),
            webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
        });

        const response = await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            webUiId: "w1",
            config: {},
            labels: [],
            directories: [],
        });

        expect(response.error).toMatch(/failed \(HTTP 500\)/);
        expect(await readBufferedTorrent()).not.toBeNull();
        expect(callArgs(showNotification, 0)[0]).toBe("Torrent adding failed");
    });

    it("still reports a refused add to the popup but shows no notification when notifications are off", async () => {
        const settings = { ...getDefaultSettings(), notificationsEnabled: false };
        settings.webuiSettings = [makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, host: "h", port: 8080 })];
        (chrome as any).__storage.settings = serializeSettings(settings);
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );
        await saveBufferedTorrent({
            torrent: makeMagnetTorrent(),
            webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
        });

        const response = await dispatch({
            action: AddTorrentMessageWithLabelAndDir.action,
            webUiId: "w1",
            config: {},
            labels: [],
            directories: [],
        });

        expect(response.error).toMatch(/failed \(HTTP 500\)/);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("keeps the buffered torrent and reports the thrown message when the WebUI throws", async () => {
        seedWebUi();
        const sendTorrent = vi.spyOn(QBittorrentWebUI.prototype, "sendTorrent").mockRejectedValueOnce(new Error("socket hang up"));
        try {
            await saveBufferedTorrent({
                torrent: makeMagnetTorrent(),
                webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
            });

            const response = await dispatch({
                action: AddTorrentMessageWithLabelAndDir.action,
                webUiId: "w1",
                config: {},
                labels: [],
                directories: [],
            });

            expect(response.error).toMatch(/socket hang up/);
            expect(await readBufferedTorrent()).not.toBeNull();
            expect(callArgs(showNotification, 0)[1]).toMatch(/socket hang up/);
            expect(callArgs(showNotification, 0)[1]).not.toMatch(/undefined/);
        } finally {
            sendTorrent.mockRestore();
        }
    });

    it("reports a settings load failure and keeps the buffered torrent", async () => {
        seedWebUi();
        await saveBufferedTorrent({
            torrent: makeMagnetTorrent(),
            webUiSettings: makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI }),
        });
        const loadSettings = vi.spyOn(Settings.prototype, "loadSettings").mockRejectedValueOnce(new Error("storage unavailable"));
        try {
            const response = await dispatch({
                action: AddTorrentMessageWithLabelAndDir.action,
                webUiId: "w1",
                config: {},
                labels: [],
                directories: [],
            });

            expect(response.error).toMatch(/storage unavailable/);
            expect(await readBufferedTorrent()).not.toBeNull();
        } finally {
            loadSettings.mockRestore();
        }
    });
});

describe("dispatchPreAddTorrent", () => {
    it("downloads and adds directly when no per-torrent selector is configured", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: false }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );

        await dispatchPreAddTorrent(
            { action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" },
            1,
            { tabId: 4, frameId: 0, pageUrl: "https://tracker.org/browse" },
        );
        await new Promise((r) => setTimeout(r, 0));

        expect(downloadTorrent).toHaveBeenCalledWith("magnet:?x", { tabId: 4, frameId: 0, pageUrl: "https://tracker.org/browse" });
    });

    it("applies a torrent-name auto-label rule in the direct-add path", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({
                id: "w1",
                client: Client.QBittorrentWebUI,
                showPerTorrentConfigSelector: false,
                defaultLabel: "fallback",
                autoLabelDirSettings: [
                    { criteria: [{ field: "torrentName", value: "cool" }], label: "auto-movies", dir: null },
                ],
            }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        // the magnet fixture's name is "Cool Torrent"
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any),
        );
        (globalThis as any).fetch = fetchMock;

        await dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" }, 1);
        await new Promise((r) => setTimeout(r, 0));

        const uploadCall = (fetchMock.mock.calls as any[][]).find(call => String(call[0]).includes("/torrents/add"));
        expect(uploadCall).toBeDefined();
        expect((uploadCall![1].body as FormData).get("category")).toBe("auto-movies");
    });

    it("notifies instead of opening the popup when the download fails", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockRejectedValue(new CloudflareChallengeError("https://tracker.org/get/1.torrent"));

        await expect(dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "https://tracker.org/get/1.torrent", webUiId: "w1" }, 7))
            .rejects.toThrow(/Cloudflare/);
        await new Promise((r) => setTimeout(r, 0));

        expect(callArgs(showNotification, 0)[0]).toBe("Cloudflare is blocking this download");
        expect(chrome.action.openPopup).not.toHaveBeenCalled();
        expect(await readBufferedTorrent()).toBeNull();
    });

    it("responds to the message caller with the download error", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockRejectedValue(new Error("network down"));

        const response = await dispatch({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" });

        expect(response.error).toMatch(/network down/);
        expect(callArgs(showNotification, 0)[0]).toBe("Error downloading torrent");
    });

    it("responds to the message caller when the direct add is refused by the WebUI", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: false }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );

        const response = await dispatch({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" });

        expect(response.error).toMatch(/failed \(HTTP 500\)/);
    });

    it("responds to the message caller when the popup window cannot be opened", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (chrome.action.openPopup as any).mockRejectedValue(new Error("nope"));
        (chrome.windows.create as any).mockRejectedValueOnce(new Error("no window for you"));

        const response = await dispatch({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" });

        expect(response.error).toMatch(/no window for you/);
    });

    it("buffers the torrent and opens the popup when the selector is enabled", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());

        await dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" }, 7);
        await new Promise((r) => setTimeout(r, 0));

        expect(downloadTorrent).toHaveBeenCalled();
        expect(chrome.action.openPopup).toHaveBeenCalled();
    });

    it("falls back to a popup window when the action popup cannot be opened", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (chrome.action.openPopup as any).mockRejectedValue(new Error("openPopup requires a user gesture"));

        await dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" }, 7);
        await new Promise((r) => setTimeout(r, 0));

        expect(chrome.windows.create).toHaveBeenCalledWith(
            expect.objectContaining({ url: "popup/popup.html", type: "popup" })
        );
    });

    it("clears the registered popup even when opening it fails", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (chrome.action.openPopup as any).mockRejectedValue(new Error("nope"));

        await dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" }, 7);
        await new Promise((r) => setTimeout(r, 0));

        expect(chrome.action.setPopup).toHaveBeenLastCalledWith({ popup: "" });
    });

    it("uses a popup window directly when the alternative chooser is enabled", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({
                id: "w1",
                client: Client.QBittorrentWebUI,
                showPerTorrentConfigSelector: true,
                useAlternativeLabelDirChooser: true,
            }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());

        await dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" }, 7);
        await new Promise((r) => setTimeout(r, 0));

        expect(chrome.action.openPopup).not.toHaveBeenCalled();
        expect(chrome.windows.create).toHaveBeenCalled();
    });

    it("parks the buffered torrent in IndexedDB so the popup can read it directly", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, showPerTorrentConfigSelector: true }),
        ];
        (chrome as any).__storage.settings = serializeSettings(settings);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());

        await dispatchPreAddTorrent({ action: PreAddTorrentMessage.action, url: "magnet:?x", webUiId: "w1" }, 7);
        await new Promise((r) => setTimeout(r, 0));

        const buffered = await readBufferedTorrent();
        expect(buffered!.torrent.data).toBe("magnet:?xt=urn:btih:abc123&dn=Cool+Torrent");
        expect(buffered!.webUiSettings.id).toBe("w1");
    });
});

describe("labelling after the add", () => {
    const infoHash = "0123456789abcdef0123456789abcdef01234567";

    function seedWebUi(over = {}, globalOver: Partial<ReturnType<typeof getDefaultSettings>> = {}) {
        const settings = { ...getDefaultSettings(), ...globalOver };
        settings.webuiSettings = [makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, host: "h", port: 8080, labels: ["old"], ...over })];
        (chrome as any).__storage.settings = serializeSettings(settings);
    }

    function respondToEveryFetchWith(ok: boolean, status: number) {
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok, status, text: () => Promise.resolve(ok ? "Ok." : "nope") } as any),
        );
    }

    async function addMagnet() {
        downloadTorrent.mockResolvedValue(makeMagnetTorrent({ data: `magnet:?xt=urn:btih:${infoHash}`, name: "Cool Torrent" }));
        await dispatch({ action: AddTorrentMessage.action, webUiId: "w1", url: "magnet:?x", config: {} });
        await new Promise((r) => setTimeout(r, 0));
    }

    it("offers the label action on the success notification of a client with labels", async () => {
        seedWebUi();
        respondToEveryFetchWith(true, 200);

        await addMagnet();

        expect(callArgs(showNotification, 0)[6]).toEqual({ webUiId: "w1", infoHash, torrentName: "Cool Torrent" });
    });

    it("offers no label action when the button is turned off in the options", async () => {
        seedWebUi({}, { notificationsLabelButtonEnabled: false });
        respondToEveryFetchWith(true, 200);

        await addMagnet();

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[6]).toBeUndefined();
    });

    it("offers no label action for a client without labels", async () => {
        seedWebUi({ client: Client.RqbitWebUI });
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}"), json: () => Promise.resolve({}) } as any),
        );

        await addMagnet();

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[6]).toBeUndefined();
    });

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
        expect(callArgs(showNotification, 0)[0]).toBe("Label set");
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
