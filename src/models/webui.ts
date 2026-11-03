import { type Client } from './clients';
import { type Torrent, type TorrentUploadConfig } from './torrent';

export interface WebUISettings {
    id: string;

    client: Client;
    name: string;

    host: string;
    port: number | null;
    secure: boolean;
    relativePath: string | null;

    username: string;
    password: string;

    showPerTorrentConfigSelector: boolean;
    useAlternativeLabelDirChooser?: boolean;
    defaultLabel: string | null;
    defaultDir: string | null;
    labels: Array<string>;
    dirs: Array<string>;
    addPaused: boolean;
    autoLabelDirSettings: Array<AutoLabelDirSetting>;

    clientSpecificSettings: Record<string, unknown>;
}

export interface ClientSpecificSettingDescriptor {
    key: string;
    label: string;
    type: "boolean";
    default: boolean;
    perTorrent: boolean;
    description?: string;
}

/**
 * The one fallback chain for Client-Specific Settings: the per-torrent override, then the stored
 * per-client value, then the descriptor's default, then false.
 */
export function resolveClientSpecificSetting(
    key: string,
    descriptors: ReadonlyArray<ClientSpecificSettingDescriptor>,
    stored: Record<string, unknown> | undefined,
    perTorrent?: Record<string, boolean>,
): boolean {
    const descriptor = descriptors.find(candidate => candidate.key === key);
    return perTorrent?.[key]
        ?? (stored?.[key] as boolean | undefined)
        ?? descriptor?.default
        ?? false;
}

export class HttpError extends Error {
    constructor(public readonly status: number, public readonly body: string) {
        super(`HTTP error ${status}`);
        this.name = "HttpError";
    }
}

/** The Add response, plus what the follow-ups need to address the added torrent. */
export interface AddResult extends TorrentAddingResult {
    /** The client's id for the added torrent, when the Add response carries one. */
    torrentId?: string;
}

/** Thrown by a login when the server answered but rejected the credentials. */
export class AuthenticationError extends Error {
    constructor(public readonly httpResponseCode: number, public readonly reason?: string) {
        super(reason ? `Authentication failed: ${reason}` : "Authentication failed");
        this.name = "AuthenticationError";
    }
}

export abstract class TorrentWebUI<Session = unknown> {
    _settings: WebUISettings;

    constructor(settings: WebUISettings) {
        this._settings = settings;
    }

    get name(): string {
        return this._settings.name;
    }

    get client(): Client {
        return this._settings.client;
    }

    get settings(): WebUISettings {
        return this._settings;
    }

    abstract get isLabelSupported(): boolean;
    abstract get isDirSupported(): boolean;
    abstract get isAddPausedSupported(): boolean;

    get isLabelDirChooserSupported(): boolean {
        return this.isLabelSupported || this.isDirSupported || this.isAddPausedSupported;
    }

    get isConnectionTestSupported(): boolean {
        return true;
    }

    get clientSpecificSettingDescriptors(): ReadonlyArray<ClientSpecificSettingDescriptor> {
        return [];
    }

    /** Logs in / opens a session. Adapters without one don't implement it. Throws AuthenticationError when the credentials are rejected. */
    protected login?(): Promise<Session>;
    /** Sends the Add request inside the session. */
    protected abstract add(torrent: Torrent, config: TorrentUploadConfig, session: Session): Promise<AddResult>;
    /** Sets a Label inside an open session. The public setLabel() wraps it with login + error mapping. */
    protected applyLabel?(session: Session, torrentId: string, label: string): Promise<TorrentAddingResult>;
    /** Follow-ups, implemented only by adapters whose Add request cannot carry the value. */
    protected labelAfterAdd?(session: Session, torrentId: string, label: string): Promise<TorrentAddingResult | void>;
    protected pauseAfterAdd?(session: Session, torrentId: string): Promise<TorrentAddingResult | void>;
    /** Id the follow-ups use. Default: added.torrentId. */
    protected addedTorrentId(added: AddResult, _torrent: Torrent): Promise<string | undefined> {
        return Promise.resolve(added.torrentId);
    }

    public async sendTorrent(torrent: Torrent, config: TorrentUploadConfig): Promise<TorrentAddingResult> {
        try {
            const session = (this.login ? await this.login() : undefined) as Session;
            const added = await this.add(torrent, config, session);
            const result: TorrentAddingResult = {
                success: added.success,
                httpResponseCode: added.httpResponseCode,
                httpResponseBody: added.httpResponseBody,
            };
            if (!added.success) {
                return result;
            }
            const warnings = await this.runAddFollowUps(session, torrent, added, config);
            return warnings.length > 0 ? { ...result, warning: warnings.join("; ") } : result;
        } catch (error) {
            return this.toFailureResult(error);
        }
    }

    public async setLabel(infoHash: string, label: string): Promise<TorrentAddingResult> {
        const applyLabel = this.applyLabel?.bind(this);
        if (!applyLabel) {
            return { success: false, httpResponseCode: 0, httpResponseBody: `${this.client} does not support labels` };
        }
        try {
            const session = (this.login ? await this.login() : undefined) as Session;
            return await applyLabel(session, infoHash, label);
        } catch (error) {
            return this.toFailureResult(error);
        }
    }

    private async runAddFollowUps(session: Session, torrent: Torrent, added: AddResult, config: TorrentUploadConfig): Promise<string[]> {
        let torrentId: Promise<string> | undefined;
        const addedId = (): Promise<string> => {
            torrentId ??= this.addedTorrentId(added, torrent).then((id) => {
                if (!id) {
                    throw new Error("the added torrent's id is missing from the response");
                }
                return id;
            });
            return torrentId;
        };

        const label = this.getLabel(config);
        const labelAfterAdd = this.labelAfterAdd?.bind(this);
        const labelWarning = label && labelAfterAdd
            ? await this.runFollowUp(`Label "${label}" was not applied`, async () => labelAfterAdd(session, await addedId(), label))
            : undefined;

        const pauseAfterAdd = this.pauseAfterAdd?.bind(this);
        const pauseWarning = this.getAddPaused(config) === true && pauseAfterAdd
            ? await this.runFollowUp("Add Paused was not applied", async () => pauseAfterAdd(session, await addedId()))
            : undefined;

        return [labelWarning, pauseWarning].filter((warning): warning is string => warning !== undefined);
    }

    public async testConnection(): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(this.createBaseUrl(), { method: "GET" });
            return {
                reachable: true,
                authenticated: null,
                httpResponseCode: response.status,
                message: "Reachable (credentials not checked for this client)",
            };
        } catch (error) {
            return this.toUnreachableResult(error);
        }
    }

    protected toReachableResult(authenticated: boolean, httpResponseCode: number): ConnectionTestResult {
        return {
            reachable: true,
            authenticated,
            httpResponseCode,
            message: authenticated
                ? "Reachable & authenticated"
                : "Reachable, but authentication failed",
        };
    }

    protected toUnreachableResult(error: unknown): ConnectionTestResult {
        return {
            reachable: false,
            authenticated: null,
            httpResponseCode: error instanceof HttpError ? error.status : 0,
            message: `Could not reach server: ${(error as Error)?.message ?? error}`,
        };
    }

    protected createBasicAuthHeaders(): Record<string, string> {
        if (this._settings.username || this._settings.password) {
            return { "Authorization": "Basic " + btoa(`${this._settings.username}:${this._settings.password}`) };
        }
        return {};
    }

    protected async probeWithBasicAuth(
        url: string,
        isAuthenticated: (response: Response) => boolean = (response) => response.ok,
    ): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(url, { method: "GET", headers: this.createBasicAuthHeaders() });
            if (isAuthenticated(response)) {
                return this.toReachableResult(true, response.status);
            }
            if (response.status === 401 || response.status === 403) {
                return this.toReachableResult(false, response.status);
            }
            return {
                reachable: true,
                authenticated: null,
                httpResponseCode: response.status,
                message: `Reachable, but the server answered HTTP ${response.status}; credentials could not be verified`,
            };
        } catch (error) {
            return this.toUnreachableResult(error);
        }
    }

    createBaseUrl(): string {
        let portPart: string;
        if(this._settings.port === null || this._settings.port === undefined) {
            portPart = "";
        } else if(this.settings.secure && this._settings.port === 443) {
            portPart = "";
        } else if(!this.settings.secure && this._settings.port === 80) {
            portPart = "";
        } else {
            portPart = `:${this._settings.port}`;
        }
        return [
            "http",
            this.settings.secure ? "s" : "",
            "://",
            this.settings.host,
            portPart,
            this.settings.relativePath ? this.addLeadingAndTrimTrailingSlashes(this.settings.relativePath) : "",
        ].join("");
    }

    createBaseUrlPatternForFilter(): string {
        return this.createBaseUrl().replace(/\/+$/, "") + "/";
    }

    protected async fetch(url: string, options?: RequestInit): Promise<Response> {
        return this.fetchAllowing(url, options, []);
    }

    protected async fetchAllowing(url: string, options: RequestInit | undefined, allowedStatuses: ReadonlyArray<number>): Promise<Response> {
        const res: Response = await fetch(url, options);
        if (!res.ok && !allowedStatuses.includes(res.status)) {
            throw new HttpError(res.status, await res.text().catch(() => ""));
        }
        return res;
    }

    protected toFailureResult(error: unknown): TorrentAddingResult {
        if (error instanceof HttpError) {
            return { success: false, httpResponseCode: error.status, httpResponseBody: error.body };
        }
        return { success: false, httpResponseCode: 0, httpResponseBody: (error as Error)?.message ?? null };
    }

    /**
     * Runs a step after the Add succeeded. If it throws or fails, the Add still succeeded, so the
     * problem comes back as a warning instead of a failed result.
     */
    private async runFollowUp(notApplied: string, step: () => Promise<TorrentAddingResult | void>): Promise<string | undefined> {
        try {
            const result = await step();
            if (result && !result.success) {
                return `${notApplied}: HTTP ${result.httpResponseCode} ${result.httpResponseBody ?? ""}`.trimEnd();
            }
            return undefined;
        } catch (error) {
            return `${notApplied}: ${(error as Error)?.message ?? error}`;
        }
    }

    protected addLeadingAndTrimTrailingSlashes(urlPart: string): string {
        if (!urlPart) {
            return "";
        }
        return "/" + urlPart.replace(/^\/+|\/+$/g, "");
    }

    protected getDirectory(config: TorrentUploadConfig): string | null {
        return config.dir ?? null;
    }

    protected getLabel(config: TorrentUploadConfig): string | null {
        return config.label ?? null;
    }

    protected getAddPaused(config: TorrentUploadConfig): boolean | null {
        return config.addPaused ?? false;
    }

    protected getClientSpecific(key: string, config: TorrentUploadConfig): boolean {
        return resolveClientSpecificSetting(
            key,
            this.clientSpecificSettingDescriptors,
            this.settings.clientSpecificSettings,
            config.clientSpecificSettings,
        );
    }

}

export interface TorrentAddingResult {
    success: boolean;
    httpResponseCode: number;
    httpResponseBody: string | null;
    /** Set when the torrent was added but a follow-up step (Add Paused, Label) did not apply. */
    warning?: string;
}

export interface ConnectionTestResult {
    reachable: boolean;
    authenticated: boolean | null;
    httpResponseCode: number;
    message: string;
}

export interface AutoLabelDirSetting {
    criteria: Array<AutoLabelDirCriterion>;
    label: string | null;
    dir: string | null;
}

export interface AutoLabelDirCriterion {
    field: "trackerUrl" | "filePath" | "torrentName";
    value: string;
}