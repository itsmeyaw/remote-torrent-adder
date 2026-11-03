import { type Torrent } from "../models/torrent";
import { type WebUISettings } from "../models/webui";
import { type IdbStore, withStore } from "./idb";

/**
 * The torrent a click handed off to the popup, parked between the service
 * worker downloading it and the popup confirming where it should go.
 *
 * This lives in IndexedDB rather than chrome.storage.session because the
 * payload is a `.torrent` Blob. chrome.storage only holds JSON, which meant
 * base64-encoding the file (inflating it by a third, against a 10MB quota) on
 * the way in and decoding it again in the popup. IndexedDB stores the Blob as
 * it is, and the popup reads this record directly instead of asking the
 * service worker to hand the bytes back over a message.
 */
export interface BufferedTorrent {
    torrent: Torrent;
    webUiSettings: WebUISettings;
}

const BUFFERED_TORRENT_STORE: IdbStore = {
    dbName: "rta-torrents",
    storeName: "buffered",
    version: 1,
};

const RETENTION_MS = 24 * 60 * 60 * 1000;
// The one key used before each click got its own record; it sorts after the timestamped ids, so the range delete misses it.
const LEGACY_BUFFERED_TORRENT_KEY = "pending";

/**
 * Each click gets its own record, so a second click while a Config Selector is
 * open cannot overwrite the first. The id travels to the popup in its URL and
 * back in the Add message.
 *
 * Ids start with a zero-padded timestamp so the keys sort by age, which lets a
 * save drop the expired ones with a single range delete.
 *
 * shortcut: records are pruned on the next save once they are older than 24 hours, so a Config Selector left open longer than that can no longer add its torrent; upgrade to a timer-based or tab-close cleanup if that is reported.
 */
export async function saveBufferedTorrent(buffered: BufferedTorrent): Promise<string> {
    const now = Date.now();
    const id = `${sortableTimestamp(now)}-${crypto.randomUUID()}`;
    const expiredBefore = sortableTimestamp(now - RETENTION_MS);
    await withStore(BUFFERED_TORRENT_STORE, "readwrite", store => {
        // Queued first, so it runs before the put in the same transaction.
        store.delete(IDBKeyRange.upperBound(expiredBefore, true));
        store.delete(LEGACY_BUFFERED_TORRENT_KEY);
        return store.put(buffered, id);
    });
    return id;
}

function sortableTimestamp(time: number): string {
    return String(time).padStart(13, "0");
}


export async function readBufferedTorrent(id: string): Promise<BufferedTorrent | null> {
    const buffered = await withStore<BufferedTorrent | undefined>(
        BUFFERED_TORRENT_STORE,
        "readonly",
        store => store.get(id),
    );
    if (!buffered) {
        return null;
    }
    return { ...buffered, torrent: await detachTorrentData(buffered.torrent) };
}

async function detachTorrentData(torrent: Torrent): Promise<Torrent> {
    const data = torrent.data;
    if (typeof data === "string" || typeof data?.arrayBuffer !== "function") {
        return torrent;
    }
    return { ...torrent, data: new Blob([await data.arrayBuffer()], { type: data.type }) };
}

export function clearBufferedTorrent(id: string): Promise<void> {
    return withStore(BUFFERED_TORRENT_STORE, "readwrite", store => store.delete(id))
        .then(() => undefined);
}
