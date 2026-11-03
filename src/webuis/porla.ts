import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, AuthenticationError, type TorrentAddingResult, TorrentWebUI } from "../models/webui";
import { bytesToBase64 } from "../torrent/torrent-bytes";

export class PorlaWebUI extends TorrentWebUI<string> {
    protected override async login(): Promise<string> {
        const response = await this.fetch(this.createBaseUrl() + "/api/v1/jsonrpc", this.createLoginRequest());
        const json = await response.json();
        const token = json.result?.token;
        if (json.error || !token) {
            throw new AuthenticationError(response.status, json.error?.message);
        }
        return token;
    }

    protected override async add(torrent: Torrent, config: TorrentUploadConfig, jsonRpcToken: string): Promise<AddResult> {
        const fetchOpts = await this.createTorrentFetchOptions(jsonRpcToken, torrent, config);
        const response = await this.fetch(this.createBaseUrl() + "/api/v1/jsonrpc", fetchOpts);

        const responseText = await response.text();
        const responseJson = JSON.parse(responseText);
        return {
            success: !responseJson.error,
            httpResponseCode: response.status,
            httpResponseBody: responseText,
        };
    }

    protected override async applyLabel(jsonRpcToken: string, infoHash: string, label: string): Promise<TorrentAddingResult> {
        const response = await this.fetch(this.createBaseUrl() + "/api/v1/jsonrpc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "Authorization": "Bearer " + jsonRpcToken
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "torrents.properties.set",
                id: Math.floor(Date.now() / 1000),
                params: {
                    info_hash: infoHash.toLowerCase(),
                    category: label
                }
            })
        });
        const responseText = await response.text();
        return {
            success: !JSON.parse(responseText).error,
            httpResponseCode: response.status,
            httpResponseBody: responseText,
        };
    }

    private createLoginRequest(): RequestInit {
        return {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "auth.login",
                id: Math.floor(Date.now() / 1000),
                params: {
                    username: this._settings.username,
                    password: this._settings.password
                }
            })
        };
    }

    private async createTorrentFetchOptions(jsonRpcToken: string, torrent: Torrent, config: TorrentUploadConfig): Promise<RequestInit> {
        const body = torrent.isMagnet
            ? JSON.stringify(this.createPayloadForMagnet(torrent.data as string, config))
            : JSON.stringify(await this.createPayloadForTorrent(torrent, config));

        return {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "Authorization": "Bearer " + jsonRpcToken
            },
            body
        };
    }

    private createPayloadForMagnet(magnetUri: string, config: TorrentUploadConfig): Record<string, unknown> {
        return {
            jsonrpc: "2.0",
            method: "torrents.add",
            id: Math.floor(Date.now() / 1000),
            params: {
                magnet_uri: magnetUri,
                save_path: this.getDirectory(config) ?? "./",
                ...this.createCategoryParam(config)
            }
        };
    }

    private async createPayloadForTorrent(torrent: Torrent, config: TorrentUploadConfig): Promise<Record<string, unknown>> {
        return {
            jsonrpc: "2.0",
            method: "torrents.add",
            id: Math.floor(Date.now() / 1000),
            params: {
                ti: bytesToBase64(new Uint8Array(await (torrent.data as Blob).arrayBuffer())),
                save_path: this.getDirectory(config) ?? "./",
                ...this.createCategoryParam(config)
            }
        };
    }

    private createCategoryParam(config: TorrentUploadConfig): Record<string, string> {
        const label = this.getLabel(config);
        return label ? { category: label } : {};
    }

    get isLabelSupported(): boolean {
        return true;
    }

    get isDirSupported(): boolean {
        return true;
    }

    get isAddPausedSupported(): boolean {
        return false;
    }
}
