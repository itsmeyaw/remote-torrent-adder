import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type ConnectionTestResult, type TorrentAddingResult, TorrentWebUI } from "../models/webui";
import { blobToBase64 } from "../util/converter";

interface TransmissionRpcResponse {
    result?: string;
    arguments?: Record<string, { hashString?: string } | undefined>;
}

/** Transmission answers an authenticated request without a session id with 409 + the session id header. */
export const isTransmissionSessionHandshake = (response: Response): boolean =>
    response.status === 409 && response.headers.get("X-Transmission-Session-Id") !== null;

export class TransmissionWebUI extends TorrentWebUI {
    public override testConnection(): Promise<ConnectionTestResult> {
        return this.probeWithBasicAuth(this.createBaseUrl() + "/transmission/rpc", isTransmissionSessionHandshake);
    }

    public override async sendTorrent(torrent: Torrent, config: TorrentUploadConfig): Promise<TorrentAddingResult> {
        try {
            const sessionId = await this.fetchTransmissionSessionId();
            const fetchOpts = await this.createTorrentFetchOptions(torrent, config, sessionId);
            const response = await this.fetch(this.createBaseUrl() + "/transmission/rpc", fetchOpts);

            const responseText = await response.text();
            const responseData = this.parseRpcResponse(responseText);
            const success = responseData?.result === "success";
            const label = this.getLabel(config);
            const addedArguments = responseData?.arguments;
            const hashString = (addedArguments?.["torrent-added"] ?? addedArguments?.["torrent-duplicate"])?.hashString;
            if (!success || !label) {
                return { success, httpResponseCode: response.status, httpResponseBody: responseText };
            }
            const warning = await this.runLabelFollowUp(label, () => {
                if (!hashString) {
                    throw new Error("the added torrent's hash is missing from the response");
                }
                return this.setLabelWithSessionId(hashString, label, sessionId);
            });
            return { success, httpResponseCode: response.status, httpResponseBody: responseText, warning };
        } catch (error) {
            return this.toFailureResult(error);
        }
    }

    public override async setLabel(infoHash: string, label: string): Promise<TorrentAddingResult> {
        try {
            return await this.setLabelWithSessionId(infoHash, label, await this.fetchTransmissionSessionId());
        } catch (error) {
            return this.toFailureResult(error);
        }
    }

    private async setLabelWithSessionId(hashString: string, label: string, sessionId: string): Promise<TorrentAddingResult> {
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
