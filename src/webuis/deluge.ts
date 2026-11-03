import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, AuthenticationError, type TorrentAddingResult, TorrentWebUI } from "../models/webui";


export class DelugeWebUI extends TorrentWebUI {
    protected override async login(): Promise<void> {
        const payload = {
            method: "auth.login",
            params: [this._settings.password],
            id: this.randomId()
        };
        const response = await this.fetch(this.createBaseUrl() + "/json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if ((await response.json())["result"] !== true) {
            throw new AuthenticationError(response.status);
        }
    }

    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const pathOrMagnet = torrent.isMagnet
            ? (torrent.data as string)
            : await this.uploadTorrentFile(torrent);

        return this.startUploadedTorrent(pathOrMagnet, config);
    }

    protected override async applyLabel(_session: unknown, torrentId: string, label: string): Promise<TorrentAddingResult> {
        const delugeLabel = label.toLowerCase();
        const id = torrentId.toLowerCase();
        await this.fetch(this.createBaseUrl() + "/json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                method: "label.add",
                params: [delugeLabel],
                id: this.randomId()
            })
        });
        const response = await this.fetch(this.createBaseUrl() + "/json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                method: "label.set_torrent",
                params: [id, delugeLabel],
                id: this.randomId()
            })
        });
        const responseText = await response.text();
        return { success: !JSON.parse(responseText || "{}")["error"], httpResponseCode: response.status, httpResponseBody: responseText };
    }

    protected override labelAfterAdd(session: unknown, torrentId: string, label: string): Promise<TorrentAddingResult> {
        return this.applyLabel(session, torrentId, label);
    }

    private async uploadTorrentFile(torrent: Torrent): Promise<string> {
        const payload = new FormData();
        payload.append("file", new Blob([torrent.data], { type: "application/x-bittorrent" }), torrent.name);
        const response = await this.fetch(this.createBaseUrl() + "/upload", { method: "POST", body: payload });
        const responseJson = await response.json();
        if (!(responseJson["success"] === true && responseJson["files"].length > 0)) {
            throw new Error("File upload failed");
        }
        return responseJson["files"][0];
    }

    private async startUploadedTorrent(uploadedFilePathOrMagnetLink: string, config: TorrentUploadConfig): Promise<AddResult> {
        const jsonUrl = this.createBaseUrl() + "/json";
        const options: Record<string, unknown> = {
            add_paused: this.getAddPaused(config),
        };
        const directory = this.getDirectory(config);
        if (directory) {
            options["download_location"] = directory;
        }
        const payload = {
            method: "web.add_torrents",
            params: [
                [
                    {
                        path: uploadedFilePathOrMagnetLink,
                        options
                    }
                ]
            ],
            id: this.randomId()
        };

        const response = await this.fetch(jsonUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const responseJson = await response.json();
        const responseText = JSON.stringify(responseJson);
        const success = !!(responseJson["result"] && responseJson["result"].length > 0
            && responseJson["result"][0].length > 0 && responseJson["result"][0][0] === true);
        const torrentId: string | undefined = responseJson["result"]?.[0]?.[1];
        return { success, httpResponseCode: response.status, httpResponseBody: responseText, torrentId };
    }

    private randomId(): number {
        return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER + 1));
    }

    get isLabelSupported(): boolean {
        return true;
    }

    get isDirSupported(): boolean {
        return true;
    }

    get isAddPausedSupported(): boolean {
        return true;
    }
}
