import { type Torrent } from "../models/torrent";
import { type WebUISettings } from "../models/webui";
import { type IdbStore, withStore } from "./idb";
import { generateId } from "./utils";

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

/**
 * Each click gets its own record, so a second click while a Config Selector is
 * open cannot overwrite the first. The id travels to the popup in its URL and
 * back in the Add message.
 *
 * shortcut: records of Config Selectors closed without an Add are never removed, so the store grows by one per such close; upgrade to pruning old records on save once that is measurable.
 */
export async function saveBufferedTorrent(buffered: BufferedTorrent): Promise<string> {
    const id = generateId();
    await withStore(BUFFERED_TORRENT_STORE, "readwrite", store => store.put(buffered, id));
    return id;
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
