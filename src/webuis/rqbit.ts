import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type AddResult, type ConnectionTestResult, TorrentWebUI } from "../models/webui";

export class RqbitWebUI extends TorrentWebUI {
    public override testConnection(): Promise<ConnectionTestResult> {
        return this.probeWithBasicAuth(this.createBaseUrl() + "/torrents");
    }

    protected override async add(torrent: Torrent, config: TorrentUploadConfig): Promise<AddResult> {
        const url = this.createBaseUrl() + "/torrents" + this.createQueryString(config);
        const response = await this.fetch(url, this.createTorrentFetchOptions(torrent));
        const responseBody = await response.text();
        return {
            success: true,
            httpResponseCode: response.status,
            httpResponseBody: responseBody,
            torrentId: this.parseTorrentId(responseBody),
        };
    }

    protected override async pauseAfterAdd(_session: unknown, torrentId: string): Promise<void> {
        await this.fetch(this.createBaseUrl() + `/torrents/${torrentId}/pause`, {
            method: "POST",
            headers: this.createBasicAuthHeaders(),
        });
    }

    private createQueryString(config: TorrentUploadConfig): string {
        const params = new URLSearchParams();

        const dir = this.getDirectory(config);
        if (dir) {
            params.append("output_folder", dir);
        }

        const query = params.toString();
        return query ? `?${query}` : "";
    }

    private parseTorrentId(responseBody: string): string | undefined {
        try {
            const id: unknown = JSON.parse(responseBody)?.id;
            return id === undefined || id === null ? undefined : String(id);
        } catch {
            return undefined;
        }
    }

    private createTorrentFetchOptions(torrent: Torrent): RequestInit {
        const fetchOpts: RequestInit = {
            method: "POST",
            headers: this.createBasicAuthHeaders(),
        };

        fetchOpts.body = torrent.isMagnet ? (torrent.data as string) : (torrent.data as Blob);

        return fetchOpts;
    }

    get isLabelSupported(): boolean {
        return false;
    }

    get isDirSupported(): boolean {
        return true;
    }

    get isAddPausedSupported(): boolean {
        return true;
    }
}
