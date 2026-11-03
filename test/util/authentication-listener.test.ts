import { describe, it, expect, vi } from "vitest";
import { registerAuthenticationListener, rememberWebUiTab, resolveAuthCredentials } from "../../src/util/authentication-listener";
import { makeWebUISettings, seedWebUISettings } from "../helpers/fixtures";

const webUiSettings = (over = {}) => makeWebUISettings({ host: "h", port: 8080, ...over });

const authDetails = (over: Record<string, unknown> = {}): any => ({
    tabId: -1,
    requestId: "req-1",
    url: "http://h:8080/api/v2/auth/login",
    ...over,
});

function registeredAuthListener() {
    registerAuthenticationListener();
    return (chrome.webRequest.onAuthRequired.addListener as any).mock.calls[0][0];
}

describe("registerAuthenticationListener", () => {
    it("registers a single asyncBlocking listener without loading settings first", () => {
        registerAuthenticationListener();
        expect(chrome.webRequest.onAuthRequired.addListener).toHaveBeenCalledTimes(1);
        const [, filter, extra] = (chrome.webRequest.onAuthRequired.addListener as any).mock.calls[0];
        expect(filter).toEqual({ urls: ["<all_urls>"] });
        expect(extra).toEqual(["asyncBlocking"]);
        expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it("answers the challenge through the async callback", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        const listener = registeredAuthListener();
        const asyncCallback = vi.fn();

        listener(authDetails({ requestId: "async-1" }), asyncCallback);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(asyncCallback).toHaveBeenCalledWith({ authCredentials: { username: "u", password: "p" } });
    });

    it("hands challenges from tabs RTA did not open straight back to the browser", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        const listener = registeredAuthListener();
        const asyncCallback = vi.fn();

        listener(authDetails({ requestId: "async-2", tabId: 5 }), asyncCallback);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(asyncCallback).toHaveBeenCalledWith({});
        expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });
});

describe("resolveAuthCredentials", () => {
    it("supplies stored credentials for a request to a configured webui", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        expect(await resolveAuthCredentials(authDetails({ requestId: "a" }))).toEqual({
            authCredentials: { username: "u", password: "p" },
        });
    });

    it("matches the webui whose base url the request falls under", async () => {
        seedWebUISettings([
            webUiSettings({ id: "one", host: "first", port: 8080, username: "u1", password: "p1" }),
            webUiSettings({ id: "two", host: "second", port: 9090, username: "u2", password: "p2" }),
        ]);
        const details = authDetails({ requestId: "b", url: "http://second:9090/api/v2/torrents/add" });
        expect(await resolveAuthCredentials(details)).toEqual({
            authCredentials: { username: "u2", password: "p2" },
        });
    });

    it("stays out of the way for urls that are not a configured webui", async () => {
        seedWebUISettings([webUiSettings()]);
        const details = authDetails({ requestId: "c", url: "https://unrelated.example.com/private" });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("skips webuis missing host or port", async () => {
        seedWebUISettings([webUiSettings({ host: "" })]);
        expect(await resolveAuthCredentials(authDetails({ requestId: "d" }))).toEqual({});
    });

    it("ignores challenges that originate from a real tab", async () => {
        seedWebUISettings([webUiSettings()]);
        expect(await resolveAuthCredentials(authDetails({ requestId: "e", tabId: 5 }))).toEqual({});
    });

    it("supplies credentials to a tab RTA opened for a url under the webui", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        await rememberWebUiTab(5, "webui-1");
        const details = authDetails({ requestId: "t1", tabId: 5, type: "main_frame", url: "http://h:8080/" });
        expect(await resolveAuthCredentials(details)).toEqual({
            authCredentials: { username: "u", password: "p" },
        });
    });

    it("stays out of a tab RTA opened when the url is outside the webui", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        await rememberWebUiTab(5, "webui-1");
        const details = authDetails({ requestId: "t2", tabId: 5, type: "main_frame", url: "https://unrelated.example.com/" });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("stays out of a tab RTA opened once its webui has been deleted", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        await rememberWebUiTab(5, "gone");
        const details = authDetails({ requestId: "t3", tabId: 5, type: "main_frame", url: "http://h:8080/" });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("stays out of subresource requests from a tab RTA opened, even to the webui", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        await rememberWebUiTab(5, "webui-1");
        const details = authDetails({ requestId: "t5", tabId: 5, type: "xmlhttprequest", url: "http://h:8080/api/v2/app/version" });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("stays out of sub-frame requests from a tab RTA opened, even to the webui", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        await rememberWebUiTab(5, "webui-1");
        const details = authDetails({ requestId: "t6", tabId: 5, type: "sub_frame", url: "http://h:8080/" });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("returns an empty response on the second challenge for the same request in a tab RTA opened", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        await rememberWebUiTab(5, "webui-1");
        const details = authDetails({ requestId: "t4", tabId: 5, type: "main_frame", url: "http://h:8080/" });
        expect(await resolveAuthCredentials(details)).toEqual({
            authCredentials: { username: "u", password: "p" },
        });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("returns an empty response on the second challenge for the same request", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        const details = authDetails({ requestId: "dup" });
        expect(await resolveAuthCredentials(details)).toEqual({
            authCredentials: { username: "u", password: "p" },
        });
        expect(await resolveAuthCredentials(details)).toEqual({});
    });

    it("re-supplies credentials once the failed attempt has been handed back", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        const details = authDetails({ requestId: "retry" });
        const credentials = { authCredentials: { username: "u", password: "p" } };

        expect(await resolveAuthCredentials(details)).toEqual(credentials);
        expect(await resolveAuthCredentials(details)).toEqual({});
        expect(await resolveAuthCredentials(details)).toEqual(credentials);
    });

    it("still hands back the second challenge after the worker restarts", async () => {
        seedWebUISettings([webUiSettings({ username: "u", password: "p" })]);
        const details = authDetails({ requestId: "restart" });
        expect(await resolveAuthCredentials(details)).toEqual({
            authCredentials: { username: "u", password: "p" },
        });

        vi.resetModules();
        const restarted = await import("../../src/util/authentication-listener");

        expect(await restarted.resolveAuthCredentials(details)).toEqual({});
    });
});
