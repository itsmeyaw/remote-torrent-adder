import { describe, it, expect, vi } from "vite-plus/test";
import {
    registerActionClickListener,
    openPrimaryWebUi,
    updateBadgeText,
    addTrailingSlash,
} from "../../src/background/action";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { serializeSettings } from "../../src/settings/serializer";
import { SETTINGS_KEY } from "../../src/settings/settings";
import { makeWebUISettings, seedWebUISettings } from "../helpers/fixtures";

function registeredClickListener() {
    registerActionClickListener();
    const calls = (chrome.action.onClicked.addListener as any).mock.calls;
    return calls[calls.length - 1][0];
}

function seedSettings(overrides: Partial<ReturnType<typeof getDefaultSettings>>): void {
    const settings = { ...getDefaultSettings(), ...overrides };
    (chrome as any).__storage[SETTINGS_KEY] = serializeSettings(settings);
}

function expectWebUiTabOpened(url: string): void {
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "about:blank", active: true });
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("registerActionClickListener", () => {
    it("registers the listener without needing any settings loaded first", () => {
        registerActionClickListener();
        expect(chrome.action.onClicked.addListener).toHaveBeenCalledTimes(1);
        expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it("resolves the webui at click time and opens it", async () => {
        seedWebUISettings([makeWebUISettings({ host: "h", port: 8080 })]);
        registeredClickListener()({} as chrome.tabs.Tab);
        await flush();
        expectWebUiTabOpened("http://h:8080/");
    });

    it("opens the WebUI picker popup when that behavior is selected and multiple WebUIs are configured", async () => {
        seedSettings({
            iconClickAction: "showWebUiPicker",
            webuiSettings: [makeWebUISettings({ id: "a" }), makeWebUISettings({ id: "b" })],
        });
        registeredClickListener()({ windowId: 5 } as chrome.tabs.Tab);
        await flush();

        expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "popup/popup.html?mode=picker" });
        expect(chrome.action.openPopup).toHaveBeenCalledWith({ windowId: 5 });
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("falls back to opening the primary WebUI when the picker is selected but only one WebUI is configured", async () => {
        seedSettings({
            iconClickAction: "showWebUiPicker",
            webuiSettings: [makeWebUISettings({ id: "a", host: "h", port: 8080 })],
        });
        registeredClickListener()({ windowId: 5 } as chrome.tabs.Tab);
        await flush();

        expect(chrome.action.openPopup).not.toHaveBeenCalled();
        expectWebUiTabOpened("http://h:8080/");
    });

    it("opens the page-links popup when that behavior is selected", async () => {
        seedSettings({ iconClickAction: "showPageLinks", webuiSettings: [makeWebUISettings()] });
        registeredClickListener()({ windowId: 9 } as chrome.tabs.Tab);
        await flush();

        expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: "popup/popup.html?mode=links" });
        expect(chrome.action.openPopup).toHaveBeenCalledWith({ windowId: 9 });
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("falls back to opening the primary WebUI when the window id is unknown", async () => {
        seedSettings({
            iconClickAction: "showPageLinks",
            webuiSettings: [makeWebUISettings({ host: "h", port: 8080 })],
        });
        registeredClickListener()({} as chrome.tabs.Tab);
        await flush();

        expect(chrome.action.openPopup).not.toHaveBeenCalled();
        expectWebUiTabOpened("http://h:8080/");
    });
});

describe("openPrimaryWebUi", () => {
    it("opens the first configured webui", async () => {
        seedWebUISettings([
            makeWebUISettings({ id: "a", host: "first", port: 8080 }),
            makeWebUISettings({ id: "b", host: "second", port: 9090 }),
        ]);
        await openPrimaryWebUi();
        expectWebUiTabOpened("http://first:8080/");
    });

    it("remembers the new tab as belonging to the webui before navigating it", async () => {
        seedWebUISettings([makeWebUISettings({ id: "a", host: "first", port: 8080 })]);
        await openPrimaryWebUi();

        expect(chrome.storage.session.set).toHaveBeenCalledWith({ "webUiTab:1": "a" });
        expect(vi.mocked(chrome.storage.session.set).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(chrome.tabs.update).mock.invocationCallOrder[0]!,
        );
    });

    it("throws instead of navigating when the new tab has no id", async () => {
        seedWebUISettings([makeWebUISettings({ host: "h", port: 8080 })]);
        (chrome.tabs.create as any).mockResolvedValueOnce({});

        await expect(openPrimaryWebUi()).rejects.toThrow("Opened tab has no id");
        expect(chrome.tabs.update).not.toHaveBeenCalled();
    });

    it("opens the options page when no webui is configured", async () => {
        seedWebUISettings([]);
        await openPrimaryWebUi();
        expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
});

describe("updateBadgeText", () => {
    it("sets the badge text for the tab when non-empty", () => {
        updateBadgeText("3", 42);
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "3", tabId: 42 });
    });

    it("clears the badge with an empty string", () => {
        updateBadgeText("", 42);
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "", tabId: 42 });
    });
});

describe("addTrailingSlash", () => {
    it("appends a slash when missing", () => {
        expect(addTrailingSlash("http://x.com")).toBe("http://x.com/");
    });

    it("leaves an existing trailing slash untouched", () => {
        expect(addTrailingSlash("http://x.com/")).toBe("http://x.com/");
    });
});
