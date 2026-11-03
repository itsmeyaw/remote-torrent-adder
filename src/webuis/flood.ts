import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, AuthenticationError, type TorrentAddingResult, TorrentWebUI } from "../models/webui";
import { blobToBase64 } from "../torrent/converter";

export class FloodWebUI extends TorrentWebUI {
    protected override async login(): Promise<void> {
        const response = await this.fetch(this.createBaseUrl() + "/api/auth/authenticate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8"
            },
            body: JSON.stringify({
                username: this._settings.username,
                password: this._settings.password
            })
        });
        const json = await response.json();
        if (!json.success) {
            throw new AuthenticationError(response.status);
        }
    }

    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const url = this.createBaseUrl() + (torrent.isMagnet ? "/api/torrents/add-urls" : "/api/torrents/add-files");

        const fetchOpts = await this.createTorrentFetchOptions(torrent, config);
        const response = await this.fetch(url, fetchOpts);

        const success = response.status === 200 || response.status === 202;
        return {
            success,
            httpResponseCode: response.status,
            httpResponseBody: success ? null : await response.text(),
        };
    }

    protected override async applyLabel(_session: unknown, infoHash: string, label: string): Promise<TorrentAddingResult> {
        const response = await this.fetch(this.createBaseUrl() + "/api/torrents/tags", {
            method: "PATCH",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({ hashes: [infoHash.toUpperCase()], tags: [label] })
        });
        return { success: true, httpResponseCode: response.status, httpResponseBody: await response.text() };
    }

    private async createTorrentFetchOptions(torrent: Torrent, config: TorrentUploadConfig): Promise<RequestInit> {
        const body = torrent.isMagnet
            ? JSON.stringify(this.createPayloadForMagnet(torrent.data as string, config))
            : JSON.stringify(await this.createPayloadForTorrent(torrent, config));

        return {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8"
            },
            body
        };
    }

    private createPayloadForMagnet(magnetUri: string, config: TorrentUploadConfig): Record<string, unknown> {
        const tags = this.getLabel(config) ? [this.getLabel(config)] : [];
        return {
            urls: [magnetUri],
            start: !this.getAddPaused(config),
            destination: this.getDirectory(config) ?? "",
            tags,
            isBasePath: false,
            isCompleted: false
        };
    }

    private async createPayloadForTorrent(torrent: Torrent, config: TorrentUploadConfig): Promise<Record<string, unknown>> {
        const tags = this.getLabel(config) ? [this.getLabel(config)] : [];
        return {
            files: [await blobToBase64(torrent.data as Blob)],
            start: !this.getAddPaused(config),
            destination: this.getDirectory(config) ?? "",
            tags,
            isBasePath: false,
            isCompleted: false
        };
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
