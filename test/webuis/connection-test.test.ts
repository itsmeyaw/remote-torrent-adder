import { describe, it, expect } from "vitest";
import { callArgs } from "../helpers/assert";
import { type TorrentWebUI } from "../../src/models/webui";
import { QBittorrentWebUI } from "../../src/webuis/qbittorrent";
import { FloodWebUI } from "../../src/webuis/flood";
import { PorlaWebUI } from "../../src/webuis/porla";
import { DelugeWebUI } from "../../src/webuis/deluge";
import { QNAPDownloadStationWebUI } from "../../src/webuis/qnapdownloadstation";
import { SynologyDownloadStationWebUI } from "../../src/webuis/synologydownloadstation";
import { TransmissionWebUI } from "../../src/webuis/transmission";
import { BiglyBTWebUI } from "../../src/webuis/biglybt";
import { makeWebUISettings, makeMagnetTorrent } from "../helpers/fixtures";
import { mockResponse, queueFetch } from "../helpers/fetch-mock";

const settings = makeWebUISettings({ host: "h", port: 8080, username: "u", password: "p" });

const SYNOLOGY_DISCOVERY = mockResponse({
    status: 200,
    json: {
        success: true,
        data: {
            "SYNO.API.Auth": { path: "auth.cgi", minVersion: 1, maxVersion: 7 },
            "SYNO.DownloadStation.Task": { path: "DownloadStation/task.cgi", minVersion: 1, maxVersion: 3 },
        },
    },
});

interface LoginAdapter {
    name: string;
    build: () => TorrentWebUI;
    /** Responses the adapter fetches before its login request (Synology discovers the API first). */
    prelude: () => Response[];
    loginUrl: string;
    loginOk: () => Response;
}

const rows: LoginAdapter[] = [
    {
        name: "qBittorrent",
        build: () => new QBittorrentWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/api/v2/auth/login",
        loginOk: () => mockResponse({ status: 200, body: "Ok." }),
    },
    {
        name: "Flood",
        build: () => new FloodWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/api/auth/authenticate",
        loginOk: () => mockResponse({ status: 200, json: { success: true } }),
    },
    {
        name: "Porla",
        build: () => new PorlaWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/api/v1/jsonrpc",
        loginOk: () => mockResponse({ status: 200, json: { result: { token: "t" } } }),
    },
    {
        name: "Deluge",
        build: () => new DelugeWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/json",
        loginOk: () => mockResponse({ status: 200, json: { result: true, error: null } }),
    },
    {
        name: "QNAP Download Station",
        build: () => new QNAPDownloadStationWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/downloadstation/V4/Misc/Login",
        loginOk: () => mockResponse({ status: 200, json: { sid: "sid-1" } }),
    },
    {
        name: "Synology Download Station",
        build: () => new SynologyDownloadStationWebUI(settings),
        prelude: () => [SYNOLOGY_DISCOVERY],
        loginUrl: "http://h:8080/webapi/auth.cgi",
        loginOk: () => mockResponse({ status: 200, json: { success: true, data: { sid: "sid-1" } } }),
    },
    {
        name: "Transmission",
        build: () => new TransmissionWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/transmission/rpc",
        loginOk: () => mockResponse({ status: 409, headers: { "X-Transmission-Session-Id": "s" } }),
    },
    {
        name: "BiglyBT",
        build: () => new BiglyBTWebUI(settings),
        prelude: () => [],
        loginUrl: "http://h:8080/transmission/rpc",
        loginOk: () => mockResponse({ status: 409, headers: { "X-Transmission-Session-Id": "s" } }),
    },
];

/** Drops the per-request id that JSON-RPC adapters randomise, so two login bodies compare by content. */
const normalizeBody = (body: unknown): unknown => {
    if (body instanceof FormData) {
        return [...body.entries()].map(([key, value]) => [key, String(value)]);
    }
    if (body instanceof URLSearchParams) {
        return body.toString();
    }
    if (typeof body === "string" && body !== "") {
        const { id: _id, ...json } = JSON.parse(body);
        return json;
    }
    return body;
};

const loginRequest = (fetch: ReturnType<typeof queueFetch>, index: number) => {
    const [url, options] = callArgs(fetch, index);
    return { url, method: options.method, body: normalizeBody(options.body) };
};

describe.each(rows)("Connection Test for $name", (row) => {
    const connectionTestWith = (login: () => Response | Promise<Response>) => {
        const fetch = queueFetch(...row.prelude(), login);
        return { result: row.build().testConnection(), fetch };
    };

    it("reports authentication failed on 401", async () => {
        const { result } = connectionTestWith(() => mockResponse({ status: 401 }));
        await expect(result).resolves.toMatchObject({ reachable: true, authenticated: false, httpResponseCode: 401 });
    });

    it("reports authentication failed on 403", async () => {
        const { result } = connectionTestWith(() => mockResponse({ status: 403 }));
        await expect(result).resolves.toMatchObject({ reachable: true, authenticated: false, httpResponseCode: 403 });
    });

    it.each([404, 500])("reports reachable but not verified on %i, not as a wrong password", async (status) => {
        const { result } = connectionTestWith(() => mockResponse({ status }));
        await expect(result).resolves.toMatchObject({
            reachable: true,
            authenticated: null,
            httpResponseCode: status,
            message: expect.stringContaining("could not be verified"),
        });
    });

    it("reports unreachable on a network failure", async () => {
        const { result } = connectionTestWith(() => Promise.reject(new TypeError("Failed to fetch")));
        await expect(result).resolves.toMatchObject({ reachable: false, authenticated: null, httpResponseCode: 0 });
    });

    it("reports reachable and authenticated when login succeeds", async () => {
        const { result } = connectionTestWith(() => row.loginOk());
        await expect(result).resolves.toMatchObject({ reachable: true, authenticated: true });
    });

    it("sends the same first login request as an Add", async () => {
        const connectionTest = connectionTestWith(() => row.loginOk());
        await connectionTest.result;

        const add = queueFetch(...row.prelude(), () => row.loginOk());
        await row.build().sendTorrent(makeMagnetTorrent(), {});

        expect(loginRequest(connectionTest.fetch, row.prelude().length)).toEqual(
            loginRequest(add, row.prelude().length),
        );
        expect(loginRequest(add, row.prelude().length).url).toBe(row.loginUrl);
    });
});
