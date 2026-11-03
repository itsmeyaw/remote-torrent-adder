// @vitest-environment node
//
// fake-indexeddb round-trips values through structuredClone, which cannot
// serialize a jsdom Blob (it comes back as {}). Node's own Blob clones
// correctly, so this file runs in the node environment to exercise the real
// store-and-read path that Chrome performs natively.

import { describe, it, expect } from "vitest";
import { clearBufferedTorrent, readBufferedTorrent, saveBufferedTorrent } from "../../src/util/buffered-torrent";
import { makeWebUISettings, makeMagnetTorrent, makeFileTorrent } from "../helpers/fixtures";

const HOUR_MS = 60 * 60 * 1000;

describe("buffered torrent store", () => {
    it("returns null when no torrent is buffered under that id", async () => {
        expect(await readBufferedTorrent("unknown")).toBeNull();
    });

    it("round-trips a magnet torrent", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: makeWebUISettings({ id: "w1" }) });

        const buffered = await readBufferedTorrent(id);
        expect(buffered!.torrent.isMagnet).toBe(true);
        expect(buffered!.torrent.data).toBe("magnet:?xt=urn:btih:abc123&dn=Cool+Torrent");
        expect(buffered!.webUiSettings.id).toBe("w1");
    });

    it("keeps a .torrent payload as a Blob instead of encoding it", async () => {
        const torrent = makeFileTorrent({ name: "ubuntu.torrent" });
        const id = await saveBufferedTorrent({ torrent, webUiSettings: makeWebUISettings() });

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

        const id = await saveBufferedTorrent({ torrent, webUiSettings: makeWebUISettings() });

        const buffered = await readBufferedTorrent(id);
        expect((buffered!.torrent.data as Blob).size).toBe(size);
    });

    it("keeps each saved torrent under its own id so two Config Selectors stay independent", async () => {
        const first = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "first" }), webUiSettings: makeWebUISettings() });
        const second = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "second" }), webUiSettings: makeWebUISettings() });

        expect(second).not.toBe(first);
        expect((await readBufferedTorrent(first))!.torrent.name).toBe("first");
        expect((await readBufferedTorrent(second))!.torrent.name).toBe("second");
    });

    it("leaves a magnet payload alone", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: makeWebUISettings() });

        const buffered = await readBufferedTorrent(id);

        expect(typeof buffered!.torrent.data).toBe("string");
    });

    it("clears the entry", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiSettings: makeWebUISettings() });
        await clearBufferedTorrent(id);

        expect(await readBufferedTorrent(id)).toBeNull();
    });

    it("clears only the entry it is given", async () => {
        const first = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "first" }), webUiSettings: makeWebUISettings() });
        const second = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "second" }), webUiSettings: makeWebUISettings() });
        await clearBufferedTorrent(first);

        expect(await readBufferedTorrent(first)).toBeNull();
        expect((await readBufferedTorrent(second))!.torrent.name).toBe("second");
    });

    it("keeps a record saved less than 24 hours ago when a later one is saved", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            const savedAt = Date.now();
            vi.setSystemTime(savedAt);
            const older = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "older" }), webUiSettings: makeWebUISettings() });
            vi.setSystemTime(savedAt + 23 * HOUR_MS);
            await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "later" }), webUiSettings: makeWebUISettings() });

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
            const expired = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "expired" }), webUiSettings: makeWebUISettings() });
            vi.setSystemTime(savedAt + 25 * HOUR_MS);
            const fresh = await saveBufferedTorrent({ torrent: makeMagnetTorrent({ name: "fresh" }), webUiSettings: makeWebUISettings() });

            expect(await readBufferedTorrent(expired)).toBeNull();
            expect((await readBufferedTorrent(fresh))!.torrent.name).toBe("fresh");
        } finally {
            vi.useRealTimers();
        }
    });

    it("tolerates clearing when nothing is buffered", async () => {
        await expect(clearBufferedTorrent("unknown")).resolves.toBeUndefined();
    });
});
