import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, type TorrentAddingResult } from "../models/webui";
import { computeInfoHash } from "../torrent/info-hash";
import { TransmissionWebUI } from "./transmission";

export class BiglyBTWebUI extends TransmissionWebUI {
    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const url = this.createBiglyBTBaseUrl(torrent, config);

        const payload = torrent.isMagnet
            ? this.createPayloadForMagnet(torrent.data as string, config)
            : this.createPayloadForTorrent(torrent);

        const response = await this.fetch(url, { method: "POST", body: payload });
        const responseBody = await response.text();
        return {
            success: this.isSuccessResponse(responseBody),
            httpResponseCode: response.status,
            httpResponseBody: responseBody,
        };
    }

    protected override async addedTorrentId(_added: AddResult, torrent: Torrent): Promise<string | undefined> {
        return (await computeInfoHash(torrent)) ?? undefined;
    }

    protected override applyLabel(sessionId: string, infoHash: string, label: string): Promise<TorrentAddingResult> {
        return super.applyLabel(sessionId, infoHash.toUpperCase(), label);
    }

    createBiglyBTBaseUrl(torrent: Torrent, config: TorrentUploadConfig): string {
        return [
            this.createBaseUrl(),
            "/transmission/",
            torrent.isMagnet ? "rpc" : "upload",
            !torrent.isMagnet && this.getAddPaused(config) ? "?paused=true" : "",
        ].join("");
    }

    createPayloadForMagnet(magnetUri: string, config: TorrentUploadConfig): string {
        return JSON.stringify({
            method: "torrent-add",
            arguments: { paused: `${this.getAddPaused(config)}`, filename: magnetUri },
        });
    }

    createPayloadForTorrent(torrent: Torrent): FormData {
        const payload = new FormData();

        const blobData = new Blob([torrent.data], { type: "application/x-bittorrent" });
        payload.append("torrent_files[]", blobData, torrent.name);

        return payload;
    }

    private isSuccessResponse(responseBody: string): boolean {
        if (/<h1>200: OK<\/h1>/.test(responseBody)) {
            return true;
        }
        try {
            return JSON.parse(responseBody)["result"] === "success";
        } catch {
            return false;
        }
    }

    override get isLabelSupported(): boolean {
        return true;
    }

    override get isDirSupported(): boolean {
        return false;
    }

    override get isAddPausedSupported(): boolean {
        return true;
    }
}
