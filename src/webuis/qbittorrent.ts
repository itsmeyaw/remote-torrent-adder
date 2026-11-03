import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, AuthenticationError, type ClientSpecificSettingDescriptor, HttpError, type TorrentAddingResult, TorrentWebUI } from "../models/webui";

const CLIENT_SPECIFIC_SETTINGS: ReadonlyArray<ClientSpecificSettingDescriptor> = [
    {
        key: "forceStart",
        label: "Force start",
        type: "boolean",
        default: false,
        perTorrent: true,
        description: "Bypass the queueing system and start immediately. Needs WebAPI 2.11 or newer; older servers ignore it.",
    },
];

export class QBittorrentWebUI extends TorrentWebUI {
    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const fetchOpts = await this.createTorrentFetchOptions(torrent, config);
        const response = await this.fetch(this.createBaseUrl() + "/api/v2/torrents/add", fetchOpts);

        const responseBody = await response.text();
        return {
            success: responseBody !== "Fails.",
            httpResponseCode: response.status,
            httpResponseBody: responseBody,
        };
    }

    protected override async applyLabel(_session: unknown, infoHash: string, label: string): Promise<TorrentAddingResult> {
        await this.createCategory(label);
        const body = new URLSearchParams();
        body.append("hashes", infoHash.toLowerCase());
        body.append("category", label);
        const response = await this.fetch(this.createBaseUrl() + "/api/v2/torrents/setCategory", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
            body
        });
        return { success: true, httpResponseCode: response.status, httpResponseBody: await response.text() };
    }

    private async createCategory(category: string): Promise<void> {
        const body = new URLSearchParams();
        body.append("category", category);
        try {
            await this.fetch(this.createBaseUrl() + "/api/v2/torrents/createCategory", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
                body
            });
        } catch (error) {
            if (!(error instanceof HttpError && error.status === 409)) {
                throw error;
            }
        }
    }

    protected override async login(): Promise<void> {
        const authenticationBody = new URLSearchParams();
        authenticationBody.append("username", this._settings.username);
        authenticationBody.append("password", this._settings.password);
        const response = await this.fetch(this.createBaseUrl() + "/api/v2/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
            },
            body: authenticationBody
        });
        if ((await response.text()).trim() !== "Ok.") {
            throw new AuthenticationError(response.status, "qBittorrent rejected the username or password");
        }
    }

    private async createTorrentFetchOptions(torrent: Torrent, config: TorrentUploadConfig): Promise<RequestInit> {
        const body = new FormData();
        if (torrent.isMagnet) {
            body.append("urls", torrent.data as string);
        } else {
            body.append("torrents", new File([torrent.data as Blob], torrent.name, { type: "application/x-bittorrent" }));
        }

        const dir = this.getDirectory(config);
        if (dir) {
            body.append("savepath", dir);
        }

        const label = this.getLabel(config);
        if (label) {
            body.append("category", label);
        }

        const addPaused = this.getAddPaused(config);
        if (addPaused !== null) {
            // `stopped` is WebAPI 2.11+; older servers only know `paused`. Unknown fields are ignored, so send both.
            body.append("paused", addPaused.toString());
            body.append("stopped", addPaused.toString());
        }

        if (this.getClientSpecific("forceStart", config)) {
            body.append("forced", "true");
        }

        return { method: "POST", body };
    }

    override get clientSpecificSettingDescriptors(): ReadonlyArray<ClientSpecificSettingDescriptor> {
        return CLIENT_SPECIFIC_SETTINGS;
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
