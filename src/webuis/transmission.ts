import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, type ConnectionTestResult, type TorrentAddingResult, TorrentWebUI } from "../models/webui";
import { blobToBase64 } from "../torrent/converter";

interface TransmissionRpcResponse {
    result?: string;
    arguments?: Record<string, { hashString?: string } | undefined>;
}

/** Transmission answers an authenticated request without a session id with 409 + the session id header. */
export const isTransmissionSessionHandshake = (response: Response): boolean =>
    response.status === 409 && response.headers.get("X-Transmission-Session-Id") !== null;

export class TransmissionWebUI extends TorrentWebUI<string> {
    public override testConnection(): Promise<ConnectionTestResult> {
        return this.probeWithBasicAuth(this.createBaseUrl() + "/transmission/rpc", isTransmissionSessionHandshake);
    }

    protected override login(): Promise<string> {
        return this.fetchTransmissionSessionId();
    }

    protected override async add(torrent: Torrent, config: TorrentUploadConfig, sessionId: string): Promise<AddResult> {
        const fetchOpts = await this.createTorrentFetchOptions(torrent, config, sessionId);
        const response = await this.fetch(this.createBaseUrl() + "/transmission/rpc", fetchOpts);

        const responseText = await response.text();
        const responseData = this.parseRpcResponse(responseText);
        const addedArguments = responseData?.arguments;
        const torrentId = (addedArguments?.["torrent-added"] ?? addedArguments?.["torrent-duplicate"])?.hashString;
        return {
            success: responseData?.result === "success",
            httpResponseCode: response.status,
            httpResponseBody: responseText,
            torrentId,
        };
    }

    protected override async applyLabel(sessionId: string, hashString: string, label: string): Promise<TorrentAddingResult> {
        const response = await this.fetch(this.createBaseUrl() + "/transmission/rpc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Transmission-Session-Id": sessionId
            },
            body: JSON.stringify({ method: "torrent-set", arguments: { ids: [hashString], labels: [label] } })
        });
        const responseText = await response.text();
        return {
            success: this.parseRpcResponse(responseText)?.result === "success",
            httpResponseCode: response.status,
            httpResponseBody: responseText,
        };
    }

    protected override labelAfterAdd(sessionId: string, torrentId: string, label: string): Promise<TorrentAddingResult> {
        return this.applyLabel(sessionId, torrentId, label);
    }

    private parseRpcResponse(responseText: string): TransmissionRpcResponse | null {
        try {
            return JSON.parse(responseText);
        } catch {
            return null;
        }
    }

    private async fetchTransmissionSessionId(): Promise<string> {
        const response = await this.fetchAllowing(this.createBaseUrl() + "/transmission/rpc", { method: "POST", body: "" }, [409]);
        return response.headers.get("X-Transmission-Session-Id") ?? "";
    }

    private async createTorrentFetchOptions(torrent: Torrent, config: TorrentUploadConfig, transmissionSessionId: string): Promise<RequestInit> {
        const payload: Record<string, string | Record<string, string | boolean>> = {
            method: "torrent-add",
            arguments: {}
        };
        if (torrent.isMagnet) {
            payload["arguments"] = {
                filename: torrent.data as string
            };
        } else {
            payload["arguments"] = {
                metainfo: await blobToBase64(torrent.data as Blob)
            };
        }

        const dir = this.getDirectory(config);
        if (dir) {
            payload["arguments"]["download-dir"] = dir;
        }

        const addPaused = this.getAddPaused(config);
        if (addPaused !== null) {
            payload["arguments"]["paused"] = addPaused;
        }

        return {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Transmission-Session-Id": transmissionSessionId
            },
            body: JSON.stringify(payload)
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
