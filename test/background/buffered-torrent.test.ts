// @vitest-environment node
//
// fake-indexeddb round-trips values through structuredClone, which cannot
// serialize a jsdom Blob (it comes back as {}). Node's own Blob clones
// correctly, so this file runs in the node environment to exercise the real
// store-and-read path that Chrome performs natively.

import { describe, it, expect } from "vitest";
import { clearBufferedTorrent, readBufferedTorrent, saveBufferedTorrent } from "../../src/background/buffered-torrent";
import { withStore } from "../../src/util/idb";
import { makeWebUISettings, makeMagnetTorrent, makeFileTorrent } from "../helpers/fixtures";

const HOUR_MS = 60 * 60 * 1000;
const BUFFERED_STORE = { dbName: "rta-torrents", storeName: "buffered", version: 1 };

describe("buffered torrent store", () => {
    it("returns null when no torrent is buffered under that id", async () => {
        expect(await readBufferedTorrent("unknown")).toBeNull();
    });

    it("round-trips a magnet torrent", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiId: "w1" });

        const buffered = await readBufferedTorrent(id);
        expect(buffered!.torrent.isMagnet).toBe(true);
        expect(buffered!.torrent.data).toBe("magnet:?xt=urn:btih:abc123&dn=Cool+Torrent");
        expect(buffered!.webUiId).toBe("w1");
    });

    it("stores only the WebUI id, never its settings or password", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiId: "w1" });

        const stored = await withStore(BUFFERED_STORE, "readonly", (store) => store.get(id));
        expect(stored).toEqual({ torrent: expect.anything(), webUiId: "w1" });
    });

    it("reads a record written before the WebUI id existed without throwing", async () => {
        const legacy = {
            torrent: makeMagnetTorrent({ name: "legacy" }),
            webUiSettings: makeWebUISettings({ password: "secret" }),
        };
        const id = "1700000000000-legacy";
        await withStore(BUFFERED_STORE, "readwrite", (store) => store.put(legacy, id));

        const buffered = await readBufferedTorrent(id);
        expect(buffered!.torrent.name).toBe("legacy");
        expect(buffered!.webUiId).toBeUndefined();
    });

    it("keeps a .torrent payload as a Blob instead of encoding it", async () => {
        const torrent = makeFileTorrent({ name: "ubuntu.torrent" });
        const id = await saveBufferedTorrent({ torrent, webUiId: "w1" });

        const buffered = await readBufferedTorrent(id);
        expect(buffered!.torrent.data).toBeInstanceOf(Blob);
        expect(buffered!.torrent.name).toBe("ubuntu.torrent");
        const bytes = new Uint8Array(await (buffered!.torrent.data as Blob).arrayBuffer());
        expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    });

    it("holds a payload far larger than the chrome.storage.session quota", async () => {
        // 12MB: over the 10MB session quota, and over it again once base64 would
        // have inflated it by a third. IndexedDB stores the bytes as they are.
        const size = 12 * 1024 * 1024;
        const torrent = makeFileTorrent({ data: new Blob([new Uint8Array(size)]) });

        const id = await saveBufferedTorrent({ torrent, webUiId: "w1" });

        const buffered = await readBufferedTorrent(id);
        expect((buffered!.torrent.data as Blob).size).toBe(size);
    });

    it("keeps each saved torrent under its own id so two Config Selectors stay independent", async () => {
        const first = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "first" }), webUiId: "w1" });
        const second = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "second" }), webUiId: "w1" });

        expect(second).not.toBe(first);
        expect((await readBufferedTorrent(first))!.torrent.name).toBe("first");
        expect((await readBufferedTorrent(second))!.torrent.name).toBe("second");
    });

    it("leaves a magnet payload alone", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiId: "w1" });

        const buffered = await readBufferedTorrent(id);

        expect(typeof buffered!.torrent.data).toBe("string");
    });

    it("clears the entry", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiId: "w1" });
        await clearBufferedTorrent(id);

        expect(await readBufferedTorrent(id)).toBeNull();
    });

    it("clears only the entry it is given", async () => {
        const first = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "first" }), webUiId: "w1" });
        const second = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "second" }), webUiId: "w1" });
        await clearBufferedTorrent(first);

        expect(await readBufferedTorrent(first)).toBeNull();
        expect((await readBufferedTorrent(second))!.torrent.name).toBe("second");
    });

    it("keeps a record saved less than 24 hours ago when a later one is saved", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            const savedAt = Date.now();
            vi.setSystemTime(savedAt);
            const older = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "older" }), webUiId: "w1" });
            vi.setSystemTime(savedAt + 23 * HOUR_MS);
            await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "later" }), webUiId: "w1" });

            expect((await readBufferedTorrent(older))!.torrent.name).toBe("older");
        } finally {
            vi.useRealTimers();
        }
    });

    it("prunes a record older than 24 hours on the next save", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            const savedAt = Date.now();
            vi.setSystemTime(savedAt);
            const expired = await saveBufferedTorrent({
                torrent: makeMagnetTorrent({ name: "expired" }),
                webUiId: "w1",
            });
            vi.setSystemTime(savedAt + 25 * HOUR_MS);
            const fresh = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "fresh" }), webUiId: "w1" });

            expect(await readBufferedTorrent(expired)).toBeNull();
            expect((await readBufferedTorrent(fresh))!.torrent.name).toBe("fresh");
        } finally {
            vi.useRealTimers();
        }
    });

    it("drops the single record left by versions before per-click ids on the next save", async () => {
        const legacy = { torrent: makeMagnetTorrent({ name: "legacy" }), webUiSettings: makeWebUISettings() };
        await withStore(BUFFERED_STORE, "readwrite", (store) => store.put(legacy, "pending"));

        await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "new" }), webUiId: "w1" });

        expect(await readBufferedTorrent("pending")).toBeNull();
    });

    it("tolerates clearing when nothing is buffered", async () => {
        await expect(clearBufferedTorrent("unknown")).resolves.toBeUndefined();
    });
});
