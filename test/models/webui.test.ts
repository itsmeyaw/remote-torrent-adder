import { describe, it, expect } from "vite-plus/test";
import {
    AuthenticationError,
    CredentialsUnverifiedError,
    HttpError,
    TorrentWebUI,
    resolveClientSpecificSetting,
} from "../../src/models/webui";
import type { AddResult, ClientSpecificSettingDescriptor, TorrentAddingResult } from "../../src/models/webui";
import type { Torrent, TorrentUploadConfig } from "../../src/models/torrent";
import { makeWebUISettings, makeFileTorrent } from "../helpers/fixtures";
import { mockResponse, queueFetch } from "../helpers/fetch-mock";
import { callArgs } from "../helpers/assert";

/**
 * Minimal concrete subclass that exposes the protected helpers so the base
 * class behaviour can be exercised directly.
 */
class TestWebUI extends TorrentWebUI {
    isLabelSupported = true;
    isDirSupported = true;
    isAddPausedSupported = true;

    override get clientSpecificSettingDescriptors(): ReadonlyArray<ClientSpecificSettingDescriptor> {
        return [
            { key: "flagOn", label: "Flag on", type: "boolean", default: true, perTorrent: true },
            { key: "flagOff", label: "Flag off", type: "boolean", default: false, perTorrent: false },
        ];
    }

    protected async add(): Promise<AddResult> {
        return { success: true, httpResponseCode: 200, httpResponseBody: null };
    }

    publicGetDirectory(config: TorrentUploadConfig) {
        return this.getDirectory(config);
    }
    publicGetLabel(config: TorrentUploadConfig) {
        return this.getLabel(config);
    }
    publicGetAddPaused(config: TorrentUploadConfig) {
        return this.getAddPaused(config);
    }
    publicGetClientSpecific(key: string, config: TorrentUploadConfig) {
        return this.getClientSpecific(key, config);
    }
    publicAddLeadingAndTrim(part: string) {
        return this.addLeadingAndTrimTrailingSlashes(part);
    }
    publicFetch(url: string, options?: RequestInit) {
        return this.fetch(url, options);
    }
    publicProbeWithBasicAuth(url: string, isAuthenticated?: (response: Response) => boolean) {
        return this.probeWithBasicAuth(url, isAuthenticated);
    }
}

const build = (over = {}) => new TestWebUI(makeWebUISettings(over));

describe("resolveClientSpecificSetting", () => {
    const descriptors: ReadonlyArray<ClientSpecificSettingDescriptor> = [
        { key: "flag", label: "Flag", type: "boolean", default: true, perTorrent: true },
    ];

    it("uses the stored value over the descriptor default", () => {
        expect(resolveClientSpecificSetting("flag", descriptors, { flag: false })).toBe(false);
    });

    it("falls back to the descriptor default when nothing is stored", () => {
        expect(resolveClientSpecificSetting("flag", descriptors, {})).toBe(true);
        expect(resolveClientSpecificSetting("flag", descriptors, undefined)).toBe(true);
    });

    it("uses the per-torrent override over the stored value", () => {
        expect(resolveClientSpecificSetting("flag", descriptors, { flag: false }, { flag: true })).toBe(true);
        expect(resolveClientSpecificSetting("flag", descriptors, { flag: true }, { flag: false })).toBe(false);
    });

    it("returns false for a key no descriptor declares", () => {
        expect(resolveClientSpecificSetting("unknown", descriptors, {})).toBe(false);
    });
});

describe("createBaseUrl", () => {
    it("builds a plain http url with explicit port", () => {
        expect(build({ host: "h", port: 8080, secure: false }).createBaseUrl()).toBe("http://h:8080");
    });

    it("builds an https url", () => {
        expect(build({ host: "h", port: 8443, secure: true }).createBaseUrl()).toBe("https://h:8443");
    });

    it("omits port 80 for insecure connections", () => {
        expect(build({ host: "h", port: 80, secure: false }).createBaseUrl()).toBe("http://h");
    });

    it("omits port 443 for secure connections", () => {
        expect(build({ host: "h", port: 443, secure: true }).createBaseUrl()).toBe("https://h");
    });

    it("omits the port entirely when none is configured", () => {
        expect(build({ host: "h", port: null, secure: false }).createBaseUrl()).toBe("http://h");
        expect(build({ host: "h", port: null, secure: true }).createBaseUrl()).toBe("https://h");
    });

    it("keeps port 443 when not secure", () => {
        expect(build({ host: "h", port: 443, secure: false }).createBaseUrl()).toBe("http://h:443");
    });

    it("appends a normalized relative path", () => {
        expect(build({ host: "h", port: 80, secure: false, relativePath: "rutorrent/" }).createBaseUrl()).toBe(
            "http://h/rutorrent",
        );
    });
});

describe("createBaseUrlPatternForFilter", () => {
    it("ensures exactly one trailing slash", () => {
        expect(build({ host: "h", port: 80 }).createBaseUrlPatternForFilter()).toBe("http://h/");
    });

    it("normalizes a relative path to a single trailing slash", () => {
        const url = build({ host: "h", port: 80, relativePath: "app" }).createBaseUrlPatternForFilter();
        expect(url).toBe("http://h/app/");
    });
});

describe("addLeadingAndTrimTrailingSlashes", () => {
    it("returns empty string for empty input", () => {
        expect(build().publicAddLeadingAndTrim("")).toBe("");
    });

    it("adds a leading slash and trims trailing slashes", () => {
        expect(build().publicAddLeadingAndTrim("path/")).toBe("/path");
        expect(build().publicAddLeadingAndTrim("//a/b//")).toBe("/a/b");
    });
});

describe("config resolution helpers", () => {
    it("getDirectory returns the config dir, or null when it is missing (defaults are resolved upstream)", () => {
        expect(build({ defaultDir: "/def" }).publicGetDirectory({ dir: "/cfg" })).toBe("/cfg");
        expect(build({ defaultDir: "/def" }).publicGetDirectory({})).toBeNull();
    });

    it("getLabel returns the config label, or null when it is missing (defaults are resolved upstream)", () => {
        expect(build({ defaultLabel: "def" }).publicGetLabel({ label: "cfg" })).toBe("cfg");
        expect(build({ defaultLabel: "def" }).publicGetLabel({})).toBeNull();
    });

    it("getAddPaused returns the config value, or false when it is missing (defaults are resolved upstream)", () => {
        expect(build({ addPaused: false }).publicGetAddPaused({ addPaused: true })).toBe(true);
        expect(build({ addPaused: true }).publicGetAddPaused({})).toBe(false);
    });

    it("getClientSpecific prefers config, then the stored setting, then the declared default", () => {
        const stored = { clientSpecificSettings: { flagOff: true } };
        expect(build(stored).publicGetClientSpecific("flagOff", { clientSpecificSettings: { flagOff: false } })).toBe(
            false,
        );
        expect(build(stored).publicGetClientSpecific("flagOff", {})).toBe(true);
        expect(build({ clientSpecificSettings: {} }).publicGetClientSpecific("flagOff", {})).toBe(false);
        expect(build({ clientSpecificSettings: {} }).publicGetClientSpecific("flagOn", {})).toBe(true);
    });

    it("getClientSpecific lets a stored false override a default of true", () => {
        expect(build({ clientSpecificSettings: { flagOn: false } }).publicGetClientSpecific("flagOn", {})).toBe(false);
    });

    it("getClientSpecific returns false for a key no descriptor declares", () => {
        expect(build({ clientSpecificSettings: {} }).publicGetClientSpecific("unknown", {})).toBe(false);
    });

    it("getClientSpecific tolerates settings saved before clientSpecificSettings existed", () => {
        const settings = makeWebUISettings();
        delete (settings as Partial<typeof settings>).clientSpecificSettings;
        const ui = new TestWebUI(settings);

        expect(ui.publicGetClientSpecific("flagOn", {})).toBe(true);
        expect(ui.publicGetClientSpecific("flagOff", {})).toBe(false);
    });
});

describe("isLabelDirChooserSupported", () => {
    it("is true when any of label/dir/addPaused are supported", () => {
        const ui = build();
        ui.isLabelSupported = false;
        ui.isDirSupported = false;
        ui.isAddPausedSupported = true;
        expect(ui.isLabelDirChooserSupported).toBe(true);
    });

    it("is false when none are supported", () => {
        const ui = build();
        ui.isLabelSupported = false;
        ui.isDirSupported = false;
        ui.isAddPausedSupported = false;
        expect(ui.isLabelDirChooserSupported).toBe(false);
    });
});

describe("fetch", () => {
    it("returns the response when ok", async () => {
        (globalThis as any).fetch = async () => ({ ok: true, status: 200 });
        const res = await build().publicFetch("http://x");
        expect(res.status).toBe(200);
    });

    it("throws an HttpError carrying the status and body on a non-ok response", async () => {
        (globalThis as any).fetch = async () => ({ ok: false, status: 500, text: async () => "boom" });
        await expect(build().publicFetch("http://x")).rejects.toMatchObject({
            message: "HTTP error 500",
            status: 500,
            body: "boom",
        });
    });
});

describe("probeWithBasicAuth", () => {
    const probeWithStatus = (status: number) => {
        queueFetch(mockResponse({ status }));
        return build().publicProbeWithBasicAuth("http://x/");
    };

    it("reports authenticated on a 2xx response", async () => {
        expect(await probeWithStatus(200)).toEqual({
            reachable: true,
            authenticated: true,
            httpResponseCode: 200,
            message: "Reachable & authenticated",
        });
    });

    it("reports an authentication failure on 401 and 403", async () => {
        for (const status of [401, 403]) {
            expect(await probeWithStatus(status)).toMatchObject({
                reachable: true,
                authenticated: false,
                httpResponseCode: status,
            });
        }
    });

    it("reports reachable but not verified on 404 and 500", async () => {
        for (const status of [404, 500]) {
            expect(await probeWithStatus(status)).toMatchObject({
                reachable: true,
                authenticated: null,
                httpResponseCode: status,
            });
        }
    });

    it("reports reachable but not verified with a message that does not blame the path on 5xx", async () => {
        expect((await probeWithStatus(500)).message).toBe(
            "Reachable, but the server answered HTTP 500; credentials could not be verified",
        );
    });

    it("accepts a response the client itself recognises as authenticated", async () => {
        const isAuthenticated = (response: Response) => response.status === 409;
        queueFetch(mockResponse({ status: 409 }));
        expect(await build().publicProbeWithBasicAuth("http://x/", isAuthenticated)).toMatchObject({
            reachable: true,
            authenticated: true,
        });
    });
});

/** Adapter with a login and every follow-up hook; records what the template calls. */
class RecordingWebUI extends TorrentWebUI<string> {
    isLabelSupported = true;
    isDirSupported = true;
    isAddPausedSupported = true;
    calls: string[] = [];
    sessionsSeen: Array<string | undefined> = [];
    lookups = 0;
    addResult: AddResult = { success: true, httpResponseCode: 200, httpResponseBody: "added", torrentId: "t1" };
    loginError: Error | null = null;
    addError: Error | null = null;
    followUpResult: TorrentAddingResult = { success: true, httpResponseCode: 200, httpResponseBody: null };
    followUpError: Error | null = null;

    protected override async login(): Promise<string> {
        this.calls.push("login");
        if (this.loginError) throw this.loginError;
        return "sess";
    }

    protected async add(_torrent: Torrent, _config: TorrentUploadConfig, session: string): Promise<AddResult> {
        this.calls.push("add");
        this.sessionsSeen.push(session);
        if (this.addError) throw this.addError;
        return this.addResult;
    }

    protected override async applyLabel(
        session: string,
        torrentId: string,
        label: string,
    ): Promise<TorrentAddingResult> {
        this.calls.push(`applyLabel:${session}:${torrentId}:${label}`);
        return this.followUp();
    }

    protected override labelAfterAdd(_session: string, torrentId: string, label: string): Promise<TorrentAddingResult> {
        this.calls.push(`label:${torrentId}:${label}`);
        return this.followUp();
    }

    protected override pauseAfterAdd(_session: string, torrentId: string): Promise<TorrentAddingResult> {
        this.calls.push(`pause:${torrentId}`);
        return this.followUp();
    }

    protected override async addedTorrentId(added: AddResult): Promise<string | undefined> {
        this.lookups++;
        return added.torrentId;
    }

    private async followUp(): Promise<TorrentAddingResult> {
        if (this.followUpError) throw this.followUpError;
        return this.followUpResult;
    }
}

/** Adapter without a login and without follow-up hooks, like Elementum. */
class MinimalWebUI extends TorrentWebUI {
    isLabelSupported = true;
    isDirSupported = true;
    isAddPausedSupported = true;
    sessionsSeen: Array<unknown> = [];

    protected async add(_torrent: Torrent, _config: TorrentUploadConfig, session: unknown): Promise<AddResult> {
        this.sessionsSeen.push(session);
        return { success: true, httpResponseCode: 200, httpResponseBody: null, torrentId: "t1" };
    }
}

const fileTorrent = makeFileTorrent();

describe("sendTorrent template", () => {
    it("logs in once before the add and hands the session to it", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        await ui.sendTorrent(fileTorrent, {});

        expect(ui.calls).toEqual(["login", "add"]);
        expect(ui.sessionsSeen).toEqual(["sess"]);
    });

    it("passes no session to an adapter without a login", async () => {
        const ui = new MinimalWebUI(makeWebUISettings());
        await ui.sendTorrent(fileTorrent, {});

        expect(ui.sessionsSeen).toEqual([undefined]);
    });

    it("returns a failed add as is and sends no follow-ups", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.addResult = { success: false, httpResponseCode: 400, httpResponseBody: "bad", torrentId: "t1" };

        await expect(ui.sendTorrent(fileTorrent, { label: "movies", addPaused: true })).resolves.toEqual({
            success: false,
            httpResponseCode: 400,
            httpResponseBody: "bad",
        });
        expect(ui.calls).toEqual(["login", "add"]);
    });

    it("applies the label through labelAfterAdd with the added torrent's id", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        await expect(ui.sendTorrent(fileTorrent, { label: "movies" })).resolves.toEqual({
            success: true,
            httpResponseCode: 200,
            httpResponseBody: "added",
        });
        expect(ui.calls).toEqual(["login", "add", "label:t1:movies"]);
    });

    it("sends Add Paused through pauseAfterAdd only when the config asks for it", async () => {
        const paused = new RecordingWebUI(makeWebUISettings());
        await paused.sendTorrent(fileTorrent, { addPaused: true });
        expect(paused.calls).toEqual(["login", "add", "pause:t1"]);

        const unpaused = new RecordingWebUI(makeWebUISettings());
        await unpaused.sendTorrent(fileTorrent, { addPaused: false });
        expect(unpaused.calls).toEqual(["login", "add"]);
    });

    it("skips a follow-up whose hook the adapter does not implement", async () => {
        const ui = new MinimalWebUI(makeWebUISettings());
        await expect(ui.sendTorrent(fileTorrent, { label: "movies", addPaused: true })).resolves.toEqual({
            success: true,
            httpResponseCode: 200,
            httpResponseBody: null,
        });
    });

    it("turns a follow-up that reports failure into a warning on the successful add", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.followUpResult = { success: false, httpResponseCode: 500, httpResponseBody: "boom" };

        await expect(ui.sendTorrent(fileTorrent, { label: "movies" })).resolves.toMatchObject({
            success: true,
            httpResponseCode: 200,
            warning: 'Label "movies" was not applied: HTTP 500 boom',
        });
    });

    it("turns a follow-up that throws into a warning on the successful add", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.followUpError = new Error("network down");

        await expect(ui.sendTorrent(fileTorrent, { addPaused: true })).resolves.toMatchObject({
            success: true,
            warning: "Add Paused was not applied: network down",
        });
    });

    it("warns and sends no follow-up when the added torrent has no id", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.addResult = { success: true, httpResponseCode: 200, httpResponseBody: "added" };

        await expect(ui.sendTorrent(fileTorrent, { label: "movies" })).resolves.toMatchObject({
            success: true,
            warning: `Label "movies" was not applied: the added torrent's id is missing from the response`,
        });
        expect(ui.calls).toEqual(["login", "add"]);
    });

    it("joins the warnings of several follow-ups with a semicolon", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.addResult = { success: true, httpResponseCode: 200, httpResponseBody: "added" };

        await expect(ui.sendTorrent(fileTorrent, { label: "movies", addPaused: true })).resolves.toMatchObject({
            warning:
                `Label "movies" was not applied: the added torrent's id is missing from the response; ` +
                `Add Paused was not applied: the added torrent's id is missing from the response`,
        });
    });

    it("resolves the torrent id once for all follow-ups", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        await ui.sendTorrent(fileTorrent, { label: "movies", addPaused: true });

        expect(ui.lookups).toBe(1);
        expect(ui.calls).toEqual(["login", "add", "label:t1:movies", "pause:t1"]);
    });

    it("never leaks the torrent id into the returned result", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        const result = await ui.sendTorrent(fileTorrent, {});

        expect(result).not.toHaveProperty("torrentId");
    });

    it("reports a rejected login as a failed result and never adds", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.loginError = new AuthenticationError(401, "nope");

        await expect(ui.sendTorrent(fileTorrent, {})).resolves.toEqual({
            success: false,
            httpResponseCode: 0,
            httpResponseBody: "Authentication failed: nope",
        });
        expect(ui.calls).toEqual(["login"]);
    });

    it("maps a throwing add through toFailureResult", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.addError = new HttpError(500, "boom");

        await expect(ui.sendTorrent(fileTorrent, {})).resolves.toEqual({
            success: false,
            httpResponseCode: 500,
            httpResponseBody: "boom",
        });
    });
});

describe("setLabel template", () => {
    it("reports that the client does not support labels when the adapter has no applyLabel", async () => {
        const ui = new MinimalWebUI(makeWebUISettings());

        await expect(ui.setLabel("h", "movies")).resolves.toEqual({
            success: false,
            httpResponseCode: 0,
            httpResponseBody: `${ui.client} does not support labels`,
        });
    });

    it("logs in and then applies the label to the info hash", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());

        await expect(ui.setLabel("h", "movies")).resolves.toMatchObject({ success: true });
        expect(ui.calls).toEqual(["login", "applyLabel:sess:h:movies"]);
    });

    it("maps a throwing applyLabel through toFailureResult", async () => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.followUpError = new Error("network down");

        await expect(ui.setLabel("h", "movies")).resolves.toEqual({
            success: false,
            httpResponseCode: 0,
            httpResponseBody: "network down",
        });
    });
});

describe("AuthenticationError", () => {
    it("formats the message with and without a reason", () => {
        expect(new AuthenticationError(401).message).toBe("Authentication failed");
        expect(new AuthenticationError(401, "bad password").message).toBe("Authentication failed: bad password");
        expect(new AuthenticationError(401).httpResponseCode).toBe(401);
    });
});

describe("testConnection through login", () => {
    const connectionTestOf = (loginError: Error | null) => {
        const ui = new RecordingWebUI(makeWebUISettings());
        ui.loginError = loginError;
        return ui.testConnection();
    };

    it("reports reachable and authenticated when login succeeds", async () => {
        await expect(connectionTestOf(null)).resolves.toEqual({
            reachable: true,
            authenticated: true,
            httpResponseCode: 200,
            message: "Reachable & authenticated",
        });
    });

    it("reports the rejected credentials with the reason when login throws AuthenticationError", async () => {
        await expect(connectionTestOf(new AuthenticationError(401, "bad password"))).resolves.toEqual({
            reachable: true,
            authenticated: false,
            httpResponseCode: 401,
            message: "Reachable, but authentication failed: bad password",
        });
    });

    it("reports rejected credentials without a reason when AuthenticationError has none", async () => {
        await expect(connectionTestOf(new AuthenticationError(403))).resolves.toEqual({
            reachable: true,
            authenticated: false,
            httpResponseCode: 403,
            message: "Reachable, but authentication failed",
        });
    });

    it("reports authentication failed on a 401 or 403 HttpError", async () => {
        for (const status of [401, 403]) {
            await expect(connectionTestOf(new HttpError(status, ""))).resolves.toEqual({
                reachable: true,
                authenticated: false,
                httpResponseCode: status,
                message: "Reachable, but authentication failed",
            });
        }
    });

    it("reports reachable but not verified on any other HttpError, without blaming the credentials", async () => {
        for (const status of [404, 500]) {
            await expect(connectionTestOf(new HttpError(status, ""))).resolves.toEqual({
                reachable: true,
                authenticated: null,
                httpResponseCode: status,
                message: `Reachable, but the server answered HTTP ${status}; credentials could not be verified`,
            });
        }
    });

    it("reports reachable but not verified with the reason when login throws CredentialsUnverifiedError", async () => {
        await expect(
            connectionTestOf(new CredentialsUnverifiedError(503, "Could not query the API list")),
        ).resolves.toEqual({
            reachable: true,
            authenticated: null,
            httpResponseCode: 503,
            message: "Reachable, but credentials could not be verified: Could not query the API list",
        });
    });

    it("reports unreachable when login fails at the network level", async () => {
        await expect(connectionTestOf(new TypeError("Failed to fetch"))).resolves.toEqual({
            reachable: false,
            authenticated: null,
            httpResponseCode: 0,
            message: "Could not reach server: Failed to fetch",
        });
    });
});

describe("testConnection without login", () => {
    it("probes the base URL and reports that credentials are not checked", async () => {
        const fetch = queueFetch(mockResponse({ status: 200 }));
        const ui = new MinimalWebUI(makeWebUISettings({ host: "h", port: 8080 }));

        await expect(ui.testConnection()).resolves.toEqual({
            reachable: true,
            authenticated: null,
            httpResponseCode: 200,
            message: "Reachable (credentials not checked for this client)",
        });
        expect(callArgs(fetch, 0)[0]).toBe("http://h:8080");
    });

    it("reports unreachable when the base URL cannot be fetched", async () => {
        (globalThis as any).fetch = async () => {
            throw new TypeError("Failed to fetch");
        };
        const ui = new MinimalWebUI(makeWebUISettings());

        await expect(ui.testConnection()).resolves.toMatchObject({
            reachable: false,
            authenticated: null,
            httpResponseCode: 0,
        });
    });
});
