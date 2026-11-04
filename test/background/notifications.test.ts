import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import {
    notify,
    registerNotificationButtonListener,
    registerNotificationClickListener,
    registerNotificationCleanupListeners,
    type NotificationEvent,
} from "../../src/background/notifications";
import { BROWSER } from "../../src/util/platform";
import { computeInfoHash } from "../../src/torrent/info-hash";
import { WebUIFactory, Client } from "../../src/models/clients";
import { type RTASettings } from "../../src/models/settings";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { makeMagnetTorrent, makeWebUISettings, seedWebUISettings } from "../helpers/fixtures";

vi.mock("../../src/torrent/info-hash", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, computeInfoHash: vi.fn(actual.computeInfoHash as typeof computeInfoHash) };
});

const infoHash = "0123456789abcdef0123456789abcdef01234567";
const qbit = WebUIFactory.createWebUI(
    makeWebUISettings({ id: "w1", name: "qBit", client: Client.QBittorrentWebUI, host: "h", port: 8080 }),
)!;
const rqbit = WebUIFactory.createWebUI(
    makeWebUISettings({ id: "w2", name: "rqbit", client: Client.RqbitWebUI, host: "h", port: 1337 }),
)!;
const added = (over: Partial<Extract<NotificationEvent, { type: "added" }>> = {}): NotificationEvent => ({
    type: "added",
    webUi: qbit,
    torrent: makeMagnetTorrent({ data: `magnet:?xt=urn:btih:${infoHash}`, name: "Cool Torrent" }),
    ...over,
});
const labelSet: NotificationEvent = { type: "labelSet", webUi: qbit, torrentName: "Cool Torrent", label: "movies" };
const cloudflare: NotificationEvent = { type: "cloudflareChallenge", message: "blocked", challengeUrl: "http://h/" };
const settings = (over: Partial<RTASettings> = {}): RTASettings => ({ ...getDefaultSettings(), ...over });

const labelAction = { webUiId: "w1", infoHash, torrentName: "Cool Torrent" };

function firedAlarm(name: string): void {
    const [listener] = (chrome.alarms.onAlarm.addListener as any).mock.calls[0];
    listener({ name });
}

beforeEach(() => {
    vi.mocked(computeInfoHash).mockClear();
});

describe("notify", () => {
    it("creates a basic notification with the success icon", async () => {
        await notify(labelSet, settings());

        expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options).toMatchObject({
            type: "basic",
            title: "Label set",
            message: 'Cool Torrent labelled "movies" in qBit',
            iconUrl: "assets/icons/BitTorrent128.png",
        });
    });

    it("uses the red icon for a failure", async () => {
        await notify({ type: "addFailed", reason: "HTTP Response code: 500" }, settings());

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options).toMatchObject({
            title: "Adding torrent failed",
            message: "HTTP Response code: 500",
            iconUrl: "assets/icons/BitTorrent128-red.png",
        });
    });

    it("tells the user what was added and appends the warning", async () => {
        await notify(added({ warning: "Add Paused was not applied" }), settings());

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options).toMatchObject({
            title: "Torrent added successfully",
            message: "Cool Torrent successfully added to qBit\nAdd Paused was not applied",
        });
    });

    it("shows the settings reset notice as a failure", async () => {
        await notify({ type: "settingsReset" }, settings());

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options).toMatchObject({ title: "Settings were reset", iconUrl: "assets/icons/BitTorrent128-red.png" });
    });

    it.each([
        ["added", added()],
        ["addFailed", { type: "addFailed", reason: "nope" } as NotificationEvent],
        ["downloadFailed", { type: "downloadFailed", error: new Error("x"), webUiId: "w1" } as NotificationEvent],
        ["cloudflareChallenge", cloudflare],
        ["labelSet", labelSet],
        ["settingsReset", { type: "settingsReset" } as NotificationEvent],
    ])("shows nothing for a %s event when notifications are off", async (_name, event) => {
        await notify(event, settings({ notificationsEnabled: false }));

        expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it.each([true, false])(
        "shows a test notification with isFailed=%s even when notifications are off",
        async (isFailed) => {
            await notify({ type: "test", isFailed }, settings({ notificationsEnabled: false }));

            const [, options] = (chrome.notifications.create as any).mock.calls[0];
            expect(options).toMatchObject({
                title: "Test Notification",
                message: isFailed ? "This is a failed notification." : "This is a successful notification.",
            });
        },
    );

    it("schedules a cleanup alarm for the configured duration", async () => {
        const before = Date.now();
        await notify(labelSet, settings({ notificationsDurationMs: 1500 }));
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());

        const [name, info] = (chrome.alarms.create as any).mock.calls[0];
        expect(name).toBe("notification-cleanup:notif-id");
        expect(info.when).toBeGreaterThanOrEqual(before + 1500);
        expect(chrome.notifications.clear).not.toHaveBeenCalled();
    });

    it("clears the notification when its cleanup alarm fires", async () => {
        registerNotificationCleanupListeners();
        await notify(labelSet, settings({ notificationsDurationMs: 1500 }));
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

    it.skipIf(BROWSER !== "chrome")("creates an offscreen document to play sound when enabled", async () => {
        await notify({ type: "test", isFailed: false }, settings({ notificationsSoundEnabled: true }));

        expect(chrome.offscreen.hasDocument).toHaveBeenCalled();
    });

    it("stays silent when the sound is off", async () => {
        await notify({ type: "test", isFailed: false }, settings({ notificationsSoundEnabled: false }));

        expect(chrome.offscreen.hasDocument).not.toHaveBeenCalled();
    });
});

describe("notification links", () => {
    it("opens the webui when its notification is clicked", async () => {
        seedWebUISettings([makeWebUISettings({ id: "w1", host: "h", port: 8080 })]);
        registerNotificationClickListener();
        await notify(labelSet, settings());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://h:8080/" }));
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "about:blank", active: true });
        expect(await chrome.storage.session.get("webUiTab:1")).toEqual({ "webUiTab:1": "w1" });
    });

    it("opens the challenge page when a cloudflare notification is clicked", async () => {
        registerNotificationClickListener();
        await notify(cloudflare, settings());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "http://h/" }));
    });

    it("opens nothing when the notification's webui has been removed", async () => {
        seedWebUISettings([]);
        registerNotificationClickListener();
        await notify(labelSet, settings());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("opens the challenge page for a click delivered to a freshly restarted worker", async () => {
        await notify(cloudflare, settings());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());

        vi.resetModules();
        const restarted = await import("../../src/background/notifications");
        restarted.registerNotificationClickListener();
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");
        await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "http://h/" }));
    });

    it("ignores clicks on notifications without a stored link", async () => {
        registerNotificationClickListener();
        await notify({ type: "addFailed", reason: "no link" }, settings());
        (chrome.notifications.create as any).mockResolvedValueOnce("other-id");
        await notify(cloudflare, settings());
        await vi.waitFor(() =>
            expect(chrome.storage.session.set).toHaveBeenCalledWith({
                "notificationLink:other-id": { url: "http://h/" },
            }),
        );
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");
        onClicked("other-id");

        await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(1));
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "http://h/" });
    });

    it("forgets the stored link and dismisses the notification after a click", async () => {
        registerNotificationClickListener();
        await notify(cloudflare, settings());
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
        await notify(labelSet, settings());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        const onClicked = (chrome.notifications.onClicked.addListener as any).mock.calls[0][0];

        onClicked("notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLink:notif-id")).toEqual({});
    });

    it("forgets the stored link when the user dismisses the notification", async () => {
        registerNotificationCleanupListeners();
        await notify(cloudflare, settings({ notificationsDurationMs: 2000 }));
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        const onClosed = (chrome.notifications.onClosed.addListener as any).mock.calls[0][0];

        onClosed("notif-id", true);

        await vi.waitFor(() => expect(chrome.storage.session.remove).toHaveBeenCalledWith("notificationLink:notif-id"));
        expect(chrome.alarms.clear).toHaveBeenCalledWith("notification-cleanup:notif-id");
        expect(chrome.notifications.clear).not.toHaveBeenCalled();
    });

    it("clears the stored link when a cleanup alarm fires after a worker restart", async () => {
        await notify(cloudflare, settings());
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());

        vi.resetModules();
        const restarted = await import("../../src/background/notifications");
        restarted.registerNotificationCleanupListeners();
        firedAlarm("notification-cleanup:notif-id");

        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLink:notif-id")).toEqual({});
    });
});

describe("the add-label button", () => {
    it("is offered after an add when the option is on and the client has labels", async () => {
        await notify(added(), settings());

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options.buttons).toEqual([{ title: "Add label" }]);
        expect(computeInfoHash).toHaveBeenCalledTimes(1);
    });

    it("stores the label action with the webui, info hash and torrent name", async () => {
        registerNotificationCleanupListeners();
        await notify(added(), settings());

        await vi.waitFor(() =>
            expect(chrome.storage.session.set).toHaveBeenCalledWith({
                "notificationLabelAction:notif-id": labelAction,
            }),
        );
    });

    it("is not offered and its info hash is not computed when the option is off", async () => {
        await notify(added(), settings({ notificationsLabelButtonEnabled: false }));

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options.buttons).toBeUndefined();
        expect(computeInfoHash).not.toHaveBeenCalled();
    });

    it("is not offered and its info hash is not computed for a client without labels", async () => {
        await notify(added({ webUi: rqbit }), settings());

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options.buttons).toBeUndefined();
        expect(computeInfoHash).not.toHaveBeenCalled();
    });

    it("is not offered when the info hash cannot be read from the torrent", async () => {
        await notify(
            added({ torrent: makeMagnetTorrent({ data: "magnet:?dn=no-hash", name: "Cool Torrent" }) }),
            settings(),
        );

        const [, options] = (chrome.notifications.create as any).mock.calls[0];
        expect(options.buttons).toBeUndefined();
        expect(computeInfoHash).toHaveBeenCalledTimes(1);
    });

    it("is not offered and its info hash is not computed when notifications are off", async () => {
        await notify(added(), settings({ notificationsEnabled: false }));

        expect(chrome.notifications.create).not.toHaveBeenCalled();
        expect(computeInfoHash).not.toHaveBeenCalled();
    });

    it("opens the label window for the torrent and dismisses the notification", async () => {
        registerNotificationButtonListener();
        await notify(added(), settings());
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
        await notify(added(), settings({ notificationsDurationMs: 1500 }));
        await vi.waitFor(() => expect(chrome.alarms.create).toHaveBeenCalled());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());
        expect(await chrome.storage.session.get("notificationLabelAction:notif-id")).toEqual({
            "notificationLabelAction:notif-id": labelAction,
        });

        firedAlarm("notification-cleanup:notif-id");
        await vi.waitFor(() => expect(chrome.notifications.clear).toHaveBeenCalledWith("notif-id"));
        expect(await chrome.storage.session.get("notificationLabelAction:notif-id")).toEqual({});
    });
});
