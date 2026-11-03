import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, type ConnectionTestResult, type TorrentAddingResult, TorrentWebUI } from "../models/webui";
import { computeInfoHash } from "../torrent/info-hash";
import { isTransmissionSessionHandshake } from "./transmission";

export class BiglyBTWebUI extends TorrentWebUI<string> {
    public override testConnection(): Promise<ConnectionTestResult> {
        return this.probeWithBasicAuth(this.createBaseUrl() + "/transmission/rpc", isTransmissionSessionHandshake);
    }

    protected override async login(): Promise<string> {
        const response = await this.fetchAllowing(this.createBaseUrl() + "/transmission/rpc", { method: "POST", body: "" }, [409]);
        return response.headers.get("X-Transmission-Session-Id") ?? "";
    }

    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const url = this.createBiglyBTBaseUrl(torrent, config);

        const payload = torrent.isMagnet
            ? this.createPayloadForMagnet(torrent.data as string, config)
            : this.createPayloadForTorrent(torrent);

        const response = await this.fetch(url, { method: 'POST', body: payload });
        const responseBody = await response.text();
        return { success: this.isSuccessResponse(responseBody), httpResponseCode: response.status, httpResponseBody: responseBody };
    }

    protected override async addedTorrentId(_added: AddResult, torrent: Torrent): Promise<string | undefined> {
        return (await computeInfoHash(torrent)) ?? undefined;
    }

    protected override async applyLabel(sessionId: string, infoHash: string, label: string): Promise<TorrentAddingResult> {
        const response = await this.fetch(this.createBaseUrl() + "/transmission/rpc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Transmission-Session-Id": sessionId
            },
            body: JSON.stringify({ method: "torrent-set", arguments: { ids: [infoHash.toUpperCase()], labels: [label] } })
        });
        const responseText = await response.text();
        return {
            success: this.isSuccessResponse(responseText),
            httpResponseCode: response.status,
            httpResponseBody: responseText,
        };
    }

    protected override labelAfterAdd(sessionId: string, torrentId: string, label: string): Promise<TorrentAddingResult> {
        return this.applyLabel(sessionId, torrentId, label);
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
        return JSON.stringify({ "method": "torrent-add", "arguments": { "paused": `${this.getAddPaused(config)}`, "filename": magnetUri } });
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


    get isLabelSupported(): boolean {
        return true;
    }

    get isDirSupported(): boolean {
        return false;
    }

    get isAddPausedSupported(): boolean {
        return true;
    }
}
