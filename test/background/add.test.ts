import { describe, it, expect, vi, beforeEach } from "vitest";
import { callArgs } from "../helpers/assert";

// Mock the heavy collaborators so the Add module can be exercised in isolation.
const { showNotification, downloadTorrent } = vi.hoisted(() => ({
    showNotification: vi.fn(),
    downloadTorrent: vi.fn(),
}));
vi.mock("../../src/background/notifications", () => ({ showNotification }));
vi.mock("../../src/torrent/download", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    downloadTorrent,
}));

import { addBufferedTorrent, addLink } from "../../src/background/add";
import { HandledFailure } from "../../src/util/errors";
import { serializeSettings, deserializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { Client } from "../../src/models/clients";
import { type RTASettings } from "../../src/models/settings";
import { type WebUISettings } from "../../src/models/webui";
import { makeWebUISettings, makeMagnetTorrent, makeFileTorrent } from "../helpers/fixtures";
import { readBufferedTorrent, saveBufferedTorrent } from "../../src/background/buffered-torrent";
import { CloudflareChallengeError } from "../../src/torrent/download";
import { QBittorrentWebUI } from "../../src/webuis/qbittorrent-webui";
import { Settings } from "../../src/settings/settings";
import { loadPopupData } from "../../src/popup/popup-data";

const qbit = (over: Partial<WebUISettings> = {}) => makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, host: "h", port: 8080, ...over });

function seed(webuiSettings: WebUISettings[], over: Partial<RTASettings> = {}) {
    (chrome as any).__storage.settings = serializeSettings({ ...getDefaultSettings(), ...over, webuiSettings });
}

function respondOk() {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("Ok.") } as any));
    (globalThis as any).fetch = fetchMock;
    return fetchMock;
}

function uploadUrls(fetchMock: { mock: { calls: any[][] } }): string[] {
    return fetchMock.mock.calls.map(call => String(call[0])).filter(url => url.includes("/torrents/add"));
}

function popupBufferedIds(): string[] {
    return (chrome.action.setPopup as any).mock.calls
        .map((call: any[]) => new URLSearchParams(String(call[0].popup).split("?")[1]).get("buffered"))
        .filter((id: string | null): id is string => !!id);
}

const titles = (): string[] => showNotification.mock.calls.map((call: any[]) => call[0]);

beforeEach(() => {
    showNotification.mockClear();
    downloadTorrent.mockReset();
    (chrome.action.setPopup as any).mockClear();
});

describe("addLink: direct add", () => {
    it("downloads and sends the torrent, then shows a success notification", async () => {
        seed([qbit()]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = respondOk();

        await addLink("magnet:?x", { webUiId: "w1" });

        expect(downloadTorrent).toHaveBeenCalledWith("magnet:?x", {});
        expect(uploadUrls(fetchMock)).toHaveLength(1);
        expect(titles()).toEqual(["Torrent added successfully"]);
    });

    it("shows the success notification with the warning when a follow-up step does not apply", async () => {
        seed([qbit({ client: Client.RqbitWebUI, host: "h", port: 1337, addPaused: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('{"id":7}') } as any)
            .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve("not found") } as any);

        await addLink("magnet:?x", { webUiId: "w1" });

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[1]).toContain("Add Paused was not applied");
        expect(callArgs(showNotification, 0)[2]).toBe(false);
    });

    it("hands the download over to the tab the link was clicked in", async () => {
        seed([qbit()]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        respondOk();

        await addLink("https://tracker.org/get/1.torrent", { webUiId: "w1" }, { tabId: 9, frameId: 3, pageUrl: "https://tracker.org/browse", windowId: 1 });

        expect(downloadTorrent).toHaveBeenCalledWith("https://tracker.org/get/1.torrent", {
            tabId: 9,
            frameId: 3,
            pageUrl: "https://tracker.org/browse",
        });
    });

    it("downloads and adds directly when no per-torrent selector is configured", async () => {
        seed([qbit({ showPerTorrentConfigSelector: false })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        respondOk();

        await addLink("magnet:?x", { webUiId: "w1" }, { tabId: 4, frameId: 0, pageUrl: "https://tracker.org/browse" });

        expect(downloadTorrent).toHaveBeenCalledWith("magnet:?x", { tabId: 4, frameId: 0, pageUrl: "https://tracker.org/browse" });
    });

    it("applies a torrent-name auto-label rule in the direct-add path", async () => {
        seed([qbit({
            showPerTorrentConfigSelector: false,
            defaultLabel: "fallback",
            autoLabelDirSettings: [
                { criteria: [{ field: "torrentName", value: "cool" }], label: "auto-movies", dir: null },
            ],
        })]);
        // the magnet fixture's name is "Cool Torrent"
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = respondOk();

        await addLink("magnet:?x", { webUiId: "w1" });

        const uploadCall = fetchMock.mock.calls.find(call => String(call[0]).includes("/torrents/add"));
        expect(uploadCall).toBeDefined();
        expect((uploadCall![1]!.body as FormData).get("category")).toBe("auto-movies");
    });

    it("falls back to the first Label List entry in the direct-add path when there is no default", async () => {
        seed([qbit({ showPerTorrentConfigSelector: false, defaultLabel: null, labels: ["movies", "tv"] })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = respondOk();

        await addLink("magnet:?x", { webUiId: "w1" });

        const uploadCall = fetchMock.mock.calls.find(call => String(call[0]).includes("/torrents/add"));
        expect((uploadCall![1]!.body as FormData).get("category")).toBe("movies");
    });

    it("rejects with the WebUI's refusal when the direct add is refused", async () => {
        seed([qbit({ showPerTorrentConfigSelector: false })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );

        await expect(addLink("magnet:?x", { webUiId: "w1" })).rejects.toThrow(/failed \(HTTP 500\)/);
        expect(titles()).toEqual(["Torrent adding failed"]);
    });
});

describe("addLink: download failures", () => {
    it("notifies once and rejects with the download error when downloading fails", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockRejectedValue(new Error("network down"));

        await expect(addLink("magnet:?x", { webUiId: "w1" })).rejects.toThrow(/network down/);
        expect(titles()).toEqual(["Error downloading torrent"]);
    });

    it("keeps the original error as cause", async () => {
        seed([qbit()]);
        downloadTorrent.mockRejectedValue(new CloudflareChallengeError("https://tracker.org/get/1.torrent"));

        await expect(addLink("https://tracker.org/get/1.torrent", { webUiId: "w1" }))
            .rejects.toHaveProperty("cause", expect.any(CloudflareChallengeError));
    });

    it("rejects without a notification when notifications are off", async () => {
        seed([qbit()], { notificationsEnabled: false });
        downloadTorrent.mockRejectedValue(new Error("network down"));

        await expect(addLink("magnet:?x", { webUiId: "w1" })).rejects.toThrow(/network down/);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("points the notification at the tracker when Cloudflare challenges the download", async () => {
        seed([qbit()]);
        downloadTorrent.mockRejectedValue(new CloudflareChallengeError("https://tracker.org/get/1.torrent"));

        await expect(addLink("https://tracker.org/get/1.torrent", { webUiId: "w1" })).rejects.toBeInstanceOf(HandledFailure);

        expect(callArgs(showNotification, 0)[0]).toBe("Cloudflare is blocking this download");
        expect(callArgs(showNotification, 0)[5]).toEqual({ url: "https://tracker.org/get/1.torrent" });
    });
});

describe("addLink: Config Selector", () => {
    it("buffers the torrent and opens the popup when the selector is enabled", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());

        await addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 });

        expect(downloadTorrent).toHaveBeenCalled();
        expect(chrome.action.openPopup).toHaveBeenCalled();
    });

    it("falls back to a popup window when the action popup cannot be opened", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (chrome.action.openPopup as any).mockRejectedValue(new Error("openPopup requires a user gesture"));

        await addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 });

        expect(chrome.windows.create).toHaveBeenCalledWith(
            expect.objectContaining({ url: expect.stringMatching(/^popup\/popup\.html\?buffered=/), type: "popup" })
        );
    });

    it("clears the registered popup even when opening it fails", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (chrome.action.openPopup as any).mockRejectedValue(new Error("nope"));

        await addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 });

        expect(chrome.action.setPopup).toHaveBeenLastCalledWith({ popup: "" });
    });

    it("uses a popup window directly when the alternative chooser is enabled", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true, useAlternativeLabelDirChooser: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());

        await addLink("magnet:?x", { webUiId: "w1" });

        expect(chrome.action.openPopup).not.toHaveBeenCalled();
        expect(chrome.windows.create).toHaveBeenCalled();
    });

    it("parks the buffered torrent in IndexedDB so the popup can read it directly", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());

        await addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 });

        const [bufferedId] = popupBufferedIds();
        const buffered = await readBufferedTorrent(bufferedId!);
        expect(buffered!.torrent.data).toBe("magnet:?xt=urn:btih:abc123&dn=Cool+Torrent");
        expect(buffered!.webUiSettings.id).toBe("w1");
    });

    it("opens a separate Config Selector per torrent, each bound to its own buffered torrent", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent
            .mockResolvedValueOnce(makeMagnetTorrent({ name: "first" }))
            .mockResolvedValueOnce(makeMagnetTorrent({ name: "second" }));

        await addLink("magnet:?a", { webUiId: "w1" }, { windowId: 7 });
        await addLink("magnet:?b", { webUiId: "w1" }, { windowId: 7 });

        const popupIds = popupBufferedIds();
        expect(popupIds).toHaveLength(2);
        expect(popupIds[0]).not.toBe(popupIds[1]);
        expect((await readBufferedTorrent(popupIds[0]!))!.torrent.name).toBe("first");
        expect((await readBufferedTorrent(popupIds[1]!))!.torrent.name).toBe("second");
    });
});

describe("addLink: Send to All", () => {
    const alpha = () => qbit({ id: "a", host: "alpha.test", name: "Alpha" });
    const beta = () => qbit({ id: "b", host: "beta.test", name: "Beta" });

    it("downloads the Torrent File once and adds it to both WebUIs", async () => {
        seed([alpha(), beta()]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = respondOk();

        await addLink("magnet:?x", { sendToAll: true });

        expect(downloadTorrent).toHaveBeenCalledTimes(1);
        const urls = uploadUrls(fetchMock);
        expect(urls).toHaveLength(2);
        expect(urls.some(url => url.includes("alpha.test"))).toBe(true);
        expect(urls.some(url => url.includes("beta.test"))).toBe(true);
    });

    it("shows exactly one notification and rejects when the download fails", async () => {
        seed([alpha(), beta()]);
        downloadTorrent.mockRejectedValue(new Error("network down"));

        await expect(addLink("magnet:?x", { sendToAll: true })).rejects.toBeInstanceOf(HandledFailure);
        expect(titles()).toEqual(["Error downloading torrent"]);
    });

    it("still adds to the other WebUI when one refuses, and reports each outcome once", async () => {
        seed([alpha(), beta()]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = vi.fn((url: string) => Promise.resolve(
            String(url).includes("alpha.test") && String(url).includes("/torrents/add")
                ? { ok: false, status: 500, text: () => Promise.resolve("nope") }
                : { ok: true, status: 200, text: () => Promise.resolve("Ok.") }
        ) as any);
        (globalThis as any).fetch = fetchMock;

        await expect(addLink("magnet:?x", { sendToAll: true })).rejects.toThrow(/Alpha failed \(HTTP 500\)/);

        expect(uploadUrls(fetchMock).some(url => url.includes("beta.test"))).toBe(true);
        expect(titles()).toHaveLength(2);
        expect(titles()).toEqual(expect.arrayContaining(["Torrent adding failed", "Torrent added successfully"]));
    });
});

describe("addLink: choosing the WebUI", () => {
    it("adds to the Primary WebUI when no WebUI is given", async () => {
        seed([
            qbit({ id: "a", host: "alpha.test", name: "Alpha" }),
            qbit({ id: "b", host: "beta.test", name: "Beta" }),
        ]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const fetchMock = respondOk();

        await addLink("magnet:?x", {});

        const urls = uploadUrls(fetchMock);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toContain("alpha.test");
    });

    it("notifies 'No WebUI configured' and rejects when there is no WebUI at all", async () => {
        seed([]);

        await expect(addLink("magnet:?x", {})).rejects.toThrow("No WebUI configured");
        expect(callArgs(showNotification, 0)[0]).toBe("No WebUI configured");
        expect(callArgs(showNotification, 0)[1]).toBe("Check your settings.");
        expect(downloadTorrent).not.toHaveBeenCalled();
    });

    it("notifies an unknown WebUI id once and downloads nothing", async () => {
        seed([qbit()]);

        await expect(addLink("magnet:?x", { webUiId: "missing" })).rejects.toBeInstanceOf(HandledFailure);
        expect(titles()).toEqual(["Adding torrent failed"]);
        expect(callArgs(showNotification, 0)[1]).toBe("No WebUI found for id missing");
        expect(downloadTorrent).not.toHaveBeenCalled();
    });
});

describe("addLink: Upload Config parity", () => {
    const rows: [string, Partial<WebUISettings>][] = [
        ["a Winning Rule", {
            defaultLabel: "fallback",
            defaultDir: "/fallback",
            autoLabelDirSettings: [{ criteria: [{ field: "torrentName", value: "cool" }], label: "auto-movies", dir: "/auto" }],
        }],
        ["a Default Label and Directory", { defaultLabel: "fallback", defaultDir: "/fallback", labels: ["movies"], dirs: ["/data"] }],
        ["a Label and Directory List only", { labels: ["movies", "tv"], dirs: ["/data", "/other"] }],
        ["nothing configured", {}],
        ["Add Paused", { addPaused: true, defaultLabel: "fallback" }],
    ];

    it.each(rows)("gives the Config Selector the same initial values the direct add uses for %s", async (_name, rule) => {
        const webUi = qbit({ ...rule, showPerTorrentConfigSelector: false });
        seed([webUi]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        respondOk();
        const sendTorrent = vi.spyOn(QBittorrentWebUI.prototype, "sendTorrent");

        await addLink("magnet:?x", { webUiId: "w1" });
        const config = callArgs(sendTorrent, 0)[1];

        seed([{ ...webUi, showPerTorrentConfigSelector: true }]);
        await addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 });
        const [bufferedId] = popupBufferedIds();
        const popup = await loadPopupData(bufferedId!);

        expect(popup!.initial.label).toBe(config.label ?? "");
        expect(popup!.initial.directory).toBe(config.dir ?? "");
        expect(popup!.initial.paused).toBe(config.addPaused ?? false);
    });
});

describe("addLink and addBufferedTorrent: settings are loaded once per Add", () => {
    it("loads settings once for a direct add", async () => {
        seed([qbit()]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        respondOk();
        const loadSettings = vi.spyOn(Settings.prototype, "loadSettings");

        await addLink("magnet:?x", { webUiId: "w1" });

        expect(loadSettings).toHaveBeenCalledTimes(1);
    });

    it("loads settings once when opening the Config Selector", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        const loadSettings = vi.spyOn(Settings.prototype, "loadSettings");

        await addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 });

        expect(loadSettings).toHaveBeenCalledTimes(1);
    });

    it("loads settings once for Send to All", async () => {
        seed([qbit({ id: "a", host: "alpha.test" }), qbit({ id: "b", host: "beta.test" })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        respondOk();
        const loadSettings = vi.spyOn(Settings.prototype, "loadSettings");

        await addLink("magnet:?x", { sendToAll: true });

        expect(loadSettings).toHaveBeenCalledTimes(1);
    });

    it("loads settings once when adding the Config Selector's choice, and remembers the lists", async () => {
        seed([qbit()]);
        respondOk();
        const bufferedId = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: qbit() });
        const loadSettings = vi.spyOn(Settings.prototype, "loadSettings");

        await addBufferedTorrent({ bufferedId, webUiId: "w1", config: {}, labels: ["movies", "tv"], directories: ["/data"] });

        expect(loadSettings).toHaveBeenCalledTimes(1);
        const persisted = deserializeSettings((chrome as any).__storage.settings)!;
        expect(persisted.webuiSettings[0]!.labels).toEqual(["movies", "tv"]);
        expect(persisted.webuiSettings[0]!.dirs).toEqual(["/data"]);
    });
});

describe("addBufferedTorrent", () => {
    it("takes the torrent from IndexedDB rather than from the message", async () => {
        seed([qbit()]);
        const fetchMock = respondOk();
        const bufferedId = await saveBufferedTorrent({
            torrent: makeFileTorrent({ name: "parked.torrent" }),
            webUiSettings: qbit(),
        });

        await addBufferedTorrent({ bufferedId, webUiId: "w1", config: { label: "movies" }, labels: [], directories: [] });

        const uploadCall = fetchMock.mock.calls.find(call => String(call[0]).includes("/torrents/add"));
        const body = uploadCall![1]!.body as FormData;
        expect((body.get("torrents") as File).name).toBe("parked.torrent");
        expect(body.get("category")).toBe("movies");
    });

    it("clears only the buffered torrent its own Config Selector added, leaving the other one", async () => {
        seed([qbit()]);
        respondOk();
        const first = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "first" }), webUiSettings: qbit() });
        const second = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "second" }), webUiSettings: qbit() });

        await addBufferedTorrent({ bufferedId: first, webUiId: "w1", config: {}, labels: [], directories: [] });

        expect(await readBufferedTorrent(first)).toBeNull();
        expect((await readBufferedTorrent(second))!.torrent.name).toBe("second");
    });

    it("clears the buffered torrent once it has been handed to the client", async () => {
        seed([qbit()]);
        respondOk();
        const bufferedId = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: qbit() });

        await addBufferedTorrent({ bufferedId, webUiId: "w1", config: {}, labels: [], directories: [] });

        expect(await readBufferedTorrent(bufferedId)).toBeNull();
    });

    it("keeps the buffered torrent and notifies once when the WebUI refuses the add", async () => {
        seed([qbit()]);
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );
        const bufferedId = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: qbit() });

        await expect(addBufferedTorrent({ bufferedId, webUiId: "w1", config: {}, labels: [], directories: [] }))
            .rejects.toThrow(/failed \(HTTP 500\)/);

        expect(await readBufferedTorrent(bufferedId)).not.toBeNull();
        expect(titles()).toEqual(["Torrent adding failed"]);
    });

    it("rejects without a notification when the WebUI refuses and notifications are off", async () => {
        seed([qbit()], { notificationsEnabled: false });
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );
        const bufferedId = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: qbit() });

        await expect(addBufferedTorrent({ bufferedId, webUiId: "w1", config: {}, labels: [], directories: [] }))
            .rejects.toThrow(/failed \(HTTP 500\)/);
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("keeps the buffered torrent and reports the thrown message when the WebUI throws", async () => {
        seed([qbit()]);
        vi.spyOn(QBittorrentWebUI.prototype, "sendTorrent").mockRejectedValueOnce(new Error("socket hang up"));
        const bufferedId = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: qbit() });

        await expect(addBufferedTorrent({ bufferedId, webUiId: "w1", config: {}, labels: [], directories: [] }))
            .rejects.toThrow(/socket hang up/);

        expect(await readBufferedTorrent(bufferedId)).not.toBeNull();
        expect(callArgs(showNotification, 0)[1]).toMatch(/socket hang up/);
        expect(callArgs(showNotification, 0)[1]).not.toMatch(/undefined/);
    });
});

describe("failure reporting", () => {
    it("reports a buffered add with nothing buffered as one failure", async () => {
        seed([qbit()]);

        await expect(addBufferedTorrent({ bufferedId: "unknown", webUiId: "w1", config: {}, labels: [], directories: [] }))
            .rejects.toBeInstanceOf(HandledFailure);

        expect(titles()).toEqual(["Adding torrent failed"]);
        expect(callArgs(showNotification, 0)[1]).toMatch(/No buffered torrent/i);
    });

    it("reports a settings load failure, using defaults to notify, and keeps the buffered torrent", async () => {
        seed([qbit()]);
        const bufferedId = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: qbit() });
        vi.spyOn(Settings.prototype, "loadSettings").mockRejectedValueOnce(new Error("storage unavailable"));
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(addBufferedTorrent({ bufferedId, webUiId: "w1", config: {}, labels: [], directories: [] }))
            .rejects.toThrow(/storage unavailable/);

        expect(await readBufferedTorrent(bufferedId)).not.toBeNull();
        expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: "storage unavailable" }));
        expect(titles()).toEqual(["Adding torrent failed"]);
    });

    it("notifies with defaults when settings cannot be loaded at all", async () => {
        vi.spyOn(Settings.prototype, "loadSettings").mockRejectedValue(new Error("storage unavailable"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(addLink("magnet:?x", { webUiId: "w1" })).rejects.toBeInstanceOf(HandledFailure);

        expect(callArgs(showNotification, 0)[0]).toBe("Adding torrent failed");
        expect(callArgs(showNotification, 0)[1]).toBe("storage unavailable");
    });

    it("notifies once when the Config Selector window cannot be opened", async () => {
        seed([qbit({ showPerTorrentConfigSelector: true })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (chrome.action.openPopup as any).mockRejectedValue(new Error("nope"));
        (chrome.windows.create as any).mockRejectedValueOnce(new Error("no window for you"));

        await expect(addLink("magnet:?x", { webUiId: "w1" }, { windowId: 7 })).rejects.toBeInstanceOf(HandledFailure);

        expect(titles()).toEqual(["Adding torrent failed"]);
        expect(callArgs(showNotification, 0)[1]).toBe("no window for you");
    });

    it("does not notify a refused add a second time", async () => {
        seed([qbit({ showPerTorrentConfigSelector: false })]);
        downloadTorrent.mockResolvedValue(makeMagnetTorrent());
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("nope") } as any),
        );

        await expect(addLink("magnet:?x", { webUiId: "w1" })).rejects.toBeInstanceOf(HandledFailure);

        expect(titles()).toEqual(["Torrent adding failed"]);
    });
});

describe("labelling after the add", () => {
    const infoHash = "0123456789abcdef0123456789abcdef01234567";

    function seedLabelled(over = {}, globalOver: Partial<RTASettings> = {}) {
        seed([qbit({ labels: ["old"], ...over })], globalOver);
    }

    function respondToEveryFetchWith(ok: boolean, status: number) {
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok, status, text: () => Promise.resolve(ok ? "Ok." : "nope") } as any),
        );
    }

    async function addMagnet() {
        downloadTorrent.mockResolvedValue(makeMagnetTorrent({ data: `magnet:?xt=urn:btih:${infoHash}`, name: "Cool Torrent" }));
        await addLink("magnet:?x", { webUiId: "w1" });
    }

    it("offers the label action on the success notification of a client with labels", async () => {
        seedLabelled();
        respondToEveryFetchWith(true, 200);

        await addMagnet();

        expect(callArgs(showNotification, 0)[6]).toEqual({ webUiId: "w1", infoHash, torrentName: "Cool Torrent" });
    });

    it("offers no label action when the button is turned off in the options", async () => {
        seedLabelled({}, { notificationsLabelButtonEnabled: false });
        respondToEveryFetchWith(true, 200);

        await addMagnet();

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[6]).toBeUndefined();
    });

    it("offers no label action for a client without labels", async () => {
        seedLabelled({ client: Client.RqbitWebUI });
        (globalThis as any).fetch = vi.fn(() =>
            Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}"), json: () => Promise.resolve({}) } as any),
        );

        await addMagnet();

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[6]).toBeUndefined();
    });

    it("links the success notification to the webui that received the torrent", async () => {
        seedLabelled();
        respondToEveryFetchWith(true, 200);

        await addMagnet();

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent added successfully");
        expect(callArgs(showNotification, 0)[5]).toEqual({ webUiId: "w1" });
    });

    it("links the failure notification to the webui that rejected the torrent", async () => {
        seedLabelled();
        respondToEveryFetchWith(false, 500);

        await expect(addMagnet()).rejects.toBeInstanceOf(HandledFailure);

        expect(callArgs(showNotification, 0)[0]).toBe("Torrent adding failed");
        expect(callArgs(showNotification, 0)[5]).toEqual({ webUiId: "w1" });
    });
});
