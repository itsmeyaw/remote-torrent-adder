import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, TorrentWebUI } from "../models/webui";

export class ElementumWebUI extends TorrentWebUI {
    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const url = this.createElementumBaseUrl();
        const payload = torrent.isMagnet
            ? this.createPayloadForMagnet(torrent.data as string, config)
            : this.createPayloadForTorrent(torrent);

        const response = await this.fetch(url, { method: 'POST', body: payload });
        return { success: true, httpResponseCode: response.status, httpResponseBody: await response.text() };
    }

    createElementumBaseUrl(): string {
        return [
            this.createBaseUrl(),
            "/playuri"
        ].join("");
    }

    createPayloadForMagnet(magnetUri: string, _config: TorrentUploadConfig): FormData {
        const payload = new FormData();

        payload.append("uri", magnetUri);

        return payload;
    }

    createPayloadForTorrent(torrent: Torrent): FormData {
        const payload = new FormData();

        const blobData = new Blob([torrent.data], { type: "application/x-bittorrent" });
        payload.append("file", blobData, torrent.name);

        return payload;
    }

    get isLabelSupported(): boolean {
        return false;
    }

    get isDirSupported(): boolean {
        return false;
    }

    get isAddPausedSupported(): boolean {
        return false;
    }
}
