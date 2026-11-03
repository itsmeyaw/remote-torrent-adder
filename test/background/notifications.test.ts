import { describe, it, expect, vi } from "vitest";
import { showNotification, registerNotificationButtonListener, registerNotificationClickListener, registerNotificationCleanupListeners } from "../../src/background/notifications";
import { BROWSER } from "../../src/util/platform";
import { makeWebUISettings, seedWebUISettings } from "../helpers/fixtures";

const labelAction = { webUiId: "w1", infoHash: "0123456789abcdef0123456789abcdef01234567", torrentName: "Cool Torrent" };

function firedAlarm(name: string): void {
    const [listener] = (chrome.alarms.onAlarm.addListener as any).mock.calls[0];
    listener({ name });
}

describe("showNotification", () => {
    it("creates a basic notification with the success icon by default", () => {
        showNotification("Title", "Body", false);
        expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options).toMatchObject({
            type: "basic",
            title: "Title",
            message: "Body",
            iconUrl: "assets/icons/BitTorrent128.png",
        });
    });

    it("uses the red icon when the notification represents a failure", () => {
        showNotification("Title", "Body", true);
        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options.iconUrl).toBe("assets/icons/BitTorrent128-red.png");
    });

    it("schedules a cleanup alarm for the configured duration", async () => {
        const before = Date.now();
        showNotification("T", "B", false, 1500);
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());

        const [name, info] = (chrome.alarms.create as any).mock.calls[0];
        expect(name).toBe("notification-cleanup:notif-id");
        expect(info.when).toBeGreaterThanOrEqual(before + 1500);
        expect(chrome.notifications.clear).not.toHaveBeenCalled();
    });

    it("clears the notification when its cleanup alarm fires", async () => {
        registerNotificationCleanupListeners();
        showNotification("T", "B", false, 1500);
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());

        firedAlarm("notification-cleanup:notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
    });

    it("ignores alarms that are not notification cleanups", async () => {
        registerNotificationCleanupListeners();

        firedAlarm("something-else");

        await Promise.resolve();
        expect(chrome.notifications.clear).not.toHaveBeenCalled();
    });

    it("forgets the stored url and label when the user dismisses the notification", async () => {
        registerNotificationCleanupListeners();
        showNotification("T", "B", false, 2000, false, { url: "http://h/" });
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        const onClosed = (chrome.notifications.onClosed.addListener as any).mock.calls[0][0];

        onClosed("notif-id", true);

        await vi.waitFor(() => expect(chrome.storage.session.remove).toHaveBeenCalledWith("notificationLink:notif-id"));
        expect(chrome.alarms.clear).toHaveBeenCalledWith("notification-cleanup:notif-id");
        expect(chrome.notifications.clear).not.toHaveBeenCalled();
    });

    it("opens the webui when its notification is clicked", async () => {
        registerNotificationClickListener();
        showNotification("T", "B", false, 2000, false, { url: "http://h/" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");
        await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "http://h/" }));
    });

    it("opens a notification's webui the way the toolbar icon does, so the auth listener knows its tab", async () => {
        seedWebUISettings([makeWebUISettings({ id: "w1", host: "h", port: 8080 })]);
        registerNotificationClickListener();
        showNotification("T", "B", false, 2000, false, { webUiId: "w1" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://h:8080/" }));
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "about:blank", active: true });
        expect(await chrome.storage.session.get("webUiTab:1")).toEqual({ "webUiTab:1": "w1" });
    });

    it("opens nothing when the notification's webui has been removed", async () => {
        seedWebUISettings([]);
        registerNotificationClickListener();
        showNotification("T", "B", false, 2000, false, { webUiId: "w1" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("opens the webui for a click delivered to a freshly restarted worker", async () => {
        showNotification("T", "B", false, 2000, false, { url: "http://h/" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());

        vi.resetModules();
        const restarted = await import("../../src/background/notifications");
        restarted.registerNotificationClickListener();
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");
        await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "http://h/" }));
    });

    it("ignores clicks on notifications without a stored url", async () => {
        registerNotificationClickListener();
        showNotification("T", "B", false); // no webui url
        (chrome.notifications.create as any).mockResolvedValueOnce("other-id");
        showNotification("T", "B", false, 2000, false, { url: "http://other/" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalledWith({ "notificationLink:other-id": { url: "http://other/" } }));
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");
        onClicked("other-id");

        await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(1));
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "http://other/" });
    });

    it("forgets the stored url and dismisses the notification after a click", async () => {
        registerNotificationClickListener();
        showNotification("T", "B", false, 2000, false, { url: "http://h/" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLink:notif-id")).toEqual({});
    });

    it("forgets the notification even when its webui cannot be opened", async () => {
        seedWebUISettings([makeWebUISettings({ id: "w1", host: "h", port: 8080 })]);
        vi.mocked(chrome.tabs.create).mockRejectedValueOnce(new Error("tabs unavailable"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        registerNotificationClickListener();
        showNotification("T", "B", false, 2000, false, { webUiId: "w1" });
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLink:notif-id")).toEqual({});
    });

    it("clears the stored url and label and the notification when a cleanup alarm fires after a worker restart", async () => {
        showNotification("T", "B", false, 2000, false, { url: "http://h/" }, labelAction);
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalledTimes(2));

        vi.resetModules();
        const restarted = await import("../../src/background/notifications");
        restarted.registerNotificationCleanupListeners();
        firedAlarm("notification-cleanup:notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLink:notif-id")).toEqual({});
        expect(await chrome.storage.session.get("notificationLabelAction:notif-id")).toEqual({});
    });

    it("clears the stored url and label when the user dismisses the notification after a worker restart", async () => {
        showNotification("T", "B", false, 2000, false, { url: "http://h/" }, labelAction);
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalledTimes(2));

        vi.resetModules();
        const restarted = await import("../../src/background/notifications");
        restarted.registerNotificationCleanupListeners();
        const onClosed = (chrome.notifications.onClosed.addListener as any).mock.calls[0][0];
        onClosed("notif-id", true);

        await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledWith("notification-cleanup:notif-id"));
        expect(await chrome.storage.session.get("notificationLink:notif-id")).toEqual({});
        expect(await chrome.storage.session.get("notificationLabelAction:notif-id")).toEqual({});
    });

    it.skipIf(BROWSER !== "chrome")("creates an offscreen document to play sound when requested", async () => {
        showNotification("T", "B", false, 2000, true);
        await Promise.resolve();
        await Promise.resolve();
        expect(chrome.offscreen.hasDocument).toHaveBeenCalled();
    });
});

describe("the add-label button", () => {
    it("is only shown when a label action is given", async () => {
        showNotification("T", "B", false, 2000, false, { url: "http://h/" });
        showNotification("T", "B", false, 2000, false, { url: "http://h/" }, labelAction);
        await Promise.resolve();

        expect((chrome.notifications.create as any).mock.calls[0][1].buttons).toBeUndefined();
        expect((chrome.notifications.create as any).mock.calls[1][1].buttons).toEqual([{ title: "Add label" }]);
    });

    it("opens the label window for the torrent and dismisses the notification", async () => {
        registerNotificationButtonListener();
        showNotification("T", "B", false, 2000, false, { url: "http://h/" }, labelAction);
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onButtonClicked = (chrome.notifications.onButtonClicked.addListener as any).mock.calls[0][0];

        onButtonClicked("notif-id", 0);

        await vi.waitFor(() => expect(chrome.windows.create).toHaveBeenCalled());
        const url = new URL((chrome.windows.create as any).mock.calls[0][0].url, "chrome-extension://rta/");
        expect(url.pathname).toBe("/popup/popup.html");
        expect(Object.fromEntries(url.searchParams)).toEqual({ mode: "label", ...labelAction });
        expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id");
    });

    it("forgets the label action once the notification times out", async () => {
        registerNotificationCleanupListeners();
        showNotification("T", "B", false, 1500, false, { url: "http://h/" }, labelAction);
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        expect(await chrome.storage.session.get("notificationLabelAction:notif-id")).toEqual({ "notificationLabelAction:notif-id": labelAction });

        firedAlarm("notification-cleanup:notif-id");
        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLabelAction:notif-id")).toEqual({});
    });
});
