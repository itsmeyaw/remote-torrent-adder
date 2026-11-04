import { describe, it, expect, vi } from "vitest";
import { loadPopupData, submitTorrent } from "../../src/popup/popup-data";
import { saveBufferedTorrent } from "../../src/background/buffered-torrent";
import { Client } from "../../src/models/clients";
import { type WebUISettings } from "../../src/models/webui";
import { serializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { makeMagnetTorrent, makeWebUISettings } from "../helpers/fixtures";
import { callArgs } from "../helpers/assert";

const qbit = (overrides: Partial<WebUISettings> = {}) => makeWebUISettings({ id: "w1", client: Client.QBittorrentWebUI, ...overrides });

function serveSettings(...webuiSettings: WebUISettings[]) {
    (chrome.runtime.sendMessage as any).mockResolvedValue({ value: serializeSettings({ ...getDefaultSettings(), webuiSettings }) });
}

const park = async (webUiOverrides = {}, torrentOverrides = {}) => {
    serveSettings(qbit(webUiOverrides));
    return saveBufferedTorrent({ torrent: makeMagnetTorrent(torrentOverrides), webUiId: "w1" });
};

describe("loadPopupData", () => {
    it("returns null when no torrent is waiting under that id", async () => {
        expect(await loadPopupData("unknown")).toBeNull();
    });

    it("resolves only the torrent parked under the requested id", async () => {
        await park({}, { name: "first" });
        serveSettings(qbit(), qbit({ id: "w2" }));
        const second = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "second" }), webUiId: "w2" });

        expect((await loadPopupData(second))!.torrent.name).toBe("second");
    });

    it("exposes the parked torrent and its webui", async () => {
        const id = await park();

        const data = (await loadPopupData(id))!;
        expect(data.torrent.name).toBe("Cool Torrent");
        expect(data.webUiSettings.id).toBe("w1");
    });

    it("uses the WebUI's current settings, not the ones it had when the torrent was parked", async () => {
        const id = await park({ defaultLabel: "old" });
        serveSettings(qbit({ defaultLabel: "new" }));

        expect((await loadPopupData(id))!.initial.label).toBe("new");
    });

    it("rejects with a clear message when the WebUI no longer exists", async () => {
        const id = await park();
        serveSettings(qbit({ id: "other" }));

        await expect(loadPopupData(id)).rejects.toThrow("The WebUI this torrent was meant for no longer exists.");
    });

    it("rejects when the settings cannot be fetched", async () => {
        const id = await park();
        (chrome.runtime.sendMessage as any).mockResolvedValue(undefined);

        await expect(loadPopupData(id)).rejects.toThrow("Could not load Remote Torrent Adder's settings");
    });

    it("reports which controls the client supports", async () => {
        const id = await park();

        const data = (await loadPopupData(id))!;
        // qBittorrent supports all three
        expect(data.supports).toEqual({ label: true, directory: true, paused: true });
    });

    it("hides controls the client does not support", async () => {
        const id = await park({ client: Client.TTorrentWebUI });

        const data = (await loadPopupData(id))!;
        expect(data.supports.label).toBe(false);
        expect(data.supports.directory).toBe(false);
    });

    it("prefers the configured defaults over the first stored option", async () => {
        const id = await park({ defaultLabel: "tv", defaultDir: "/media", labels: ["movies"], dirs: ["/other"] });

        const data = (await loadPopupData(id))!;
        expect(data.initial.label).toBe("tv");
        expect(data.initial.directory).toBe("/media");
    });

    it("falls back to the first stored option when there is no default", async () => {
        const id = await park({ defaultLabel: null, defaultDir: null, labels: ["movies", "tv"], dirs: ["/data"] });

        const data = (await loadPopupData(id))!;
        expect(data.initial.label).toBe("movies");
        expect(data.initial.directory).toBe("/data");
    });

    it("leaves the fields empty when nothing is configured, rather than inventing options", async () => {
        const id = await park({ defaultLabel: null, defaultDir: null, labels: [], dirs: [] });

        const data = (await loadPopupData(id))!;
        expect(data.initial.label).toBe("");
        expect(data.initial.directory).toBe("");
        expect(data.labelOptions).toEqual([]);
    });

    it("applies a matching auto-label rule and flags it as automatic", async () => {
        const id = await park(
            {
                defaultLabel: "manual",
                autoLabelDirSettings: [
                    { criteria: [{ field: "trackerUrl", value: "tracker\\.example" }], label: "auto-tv", dir: "/auto" },
                ],
            },
            { trackers: ["http://tracker.example/announce"] },
        );

        const data = (await loadPopupData(id))!;
        expect(data.initial.label).toBe("auto-tv");
        expect(data.initial.directory).toBe("/auto");
        expect(data.auto).toEqual({ label: true, directory: true });
    });

    it("applies a rule matching the torrent name", async () => {
        const id = await park({
            autoLabelDirSettings: [
                { criteria: [{ field: "torrentName", value: "cool" }], label: "auto-name", dir: "/by-name" },
            ],
        });

        const data = (await loadPopupData(id))!;
        // the parked magnet's name is "Cool Torrent"; the match is case-insensitive
        expect(data.initial.label).toBe("auto-name");
        expect(data.initial.directory).toBe("/by-name");
        expect(data.auto).toEqual({ label: true, directory: true });
    });

    it("does not flag values as automatic when no rule matched", async () => {
        const id = await park(
            {
                defaultLabel: "manual",
                autoLabelDirSettings: [
                    { criteria: [{ field: "trackerUrl", value: "nope" }], label: "auto-tv", dir: null },
                ],
            },
            { trackers: ["http://tracker.example/announce"] },
        );

        const data = (await loadPopupData(id))!;
        expect(data.initial.label).toBe("manual");
        expect(data.auto.label).toBe(false);
    });

    it("carries the paused default through", async () => {
        const id = await park({ addPaused: true });
        expect((await loadPopupData(id))!.initial.paused).toBe(true);
    });

    it("offers the client's per-torrent client-specific settings", async () => {
        const id = await park();

        const { descriptors, initial } = (await loadPopupData(id))!.clientSpecific;
        expect(descriptors.map(descriptor => descriptor.key)).toEqual(["forceStart"]);
        expect(initial).toEqual({ forceStart: false });
    });

    it("seeds a client-specific setting from the stored per-client value", async () => {
        const id = await park({ clientSpecificSettings: { forceStart: true } });

        expect((await loadPopupData(id))!.clientSpecific.initial).toEqual({ forceStart: true });
    });

    it("omits client-specific settings the client does not offer per torrent", async () => {
        const id = await park({ client: Client.RuTorrentWebUI });

        expect((await loadPopupData(id))!.clientSpecific.descriptors).toEqual([]);
    });

    it("offers nothing for a client that declares no client-specific settings", async () => {
        const id = await park({ client: Client.TransmissionWebUI });

        const { descriptors, initial } = (await loadPopupData(id))!.clientSpecific;
        expect(descriptors).toEqual([]);
        expect(initial).toEqual({});
    });
});

describe("submitTorrent", () => {
    const request = {
        bufferedId: "b1",
        label: "movies",
        directory: "/data",
        paused: true,
        labelOptions: ["movies", "tv"],
        directoryOptions: ["/data"],
        clientSpecific: { forceStart: true },
    };

    it("sends the choices without the torrent, which stays in IndexedDB", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ value: undefined });
        await submitTorrent(request);

        const message = callArgs(chrome.runtime.sendMessage as any, 0)[0];
        expect(message.action).toBe("addTorrentMessageWithLabelAndDir");
        expect(message.bufferedId).toBe("b1");
        expect(message).not.toHaveProperty("webUiId");
        expect(message.config).toEqual({ label: "movies", dir: "/data", addPaused: true, clientSpecificSettings: { forceStart: true } });
        expect(message.labels).toEqual(["movies", "tv"]);
        expect(message.directories).toEqual(["/data"]);
        expect(message).not.toHaveProperty("serializedTorrent");
    });

    it("rejects when the service worker reports an error", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ error: "No buffered torrent" });

        await expect(submitTorrent(request)).rejects.toThrow("No buffered torrent");
    });

    it("resolves when the service worker acknowledges", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ value: undefined });

        await expect(submitTorrent(request)).resolves.toBeUndefined();
    });

    it("propagates a transport failure", async () => {
        (chrome.runtime.sendMessage as any).mockRejectedValue(new Error("port closed"));

        await expect(submitTorrent(request)).rejects.toThrow("port closed");
    });
});

// Guards the contract the service worker relies on: it looks the torrent up
// itself, so the popup must never be the one carrying the bytes.
describe("message payload", () => {
    it("never serializes torrent data into the message", async () => {
        vi.clearAllMocks();
        const id = await park();
        await submitTorrent({
            bufferedId: id,
            label: "",
            directory: "",
            paused: false,
            labelOptions: [],
            directoryOptions: [],
            clientSpecific: {},
        });

        const serialized = JSON.stringify(callArgs(chrome.runtime.sendMessage as any, 0)[0]);
        expect(serialized).not.toContain("magnet:");
    });
});
