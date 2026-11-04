import { ext } from "../util/browser-api";
import { sendMessageAndForget } from "../util/messaging";
import { canUseOffscreen, isFirefox } from "../util/platform";
import { playNotificationSound } from "../notifications/play-sound";
import { openSetLabelWindow, openWebUi } from "./action";
import { loadSettings } from "../settings/settings";
import { getWebUi } from "../settings/webuis";
import { type RTASettings } from "../models/settings";
import { type Torrent } from "../models/torrent";
import { type TorrentWebUI } from "../models/webui";
import { computeInfoHash } from "../torrent/info-hash";

const LINK_KEY_PREFIX = "notificationLink:";
const LABEL_ACTION_KEY_PREFIX = "notificationLabelAction:";
const CLEANUP_ALARM_PREFIX = "notification-cleanup:";

export interface NotificationLabelAction {
    webUiId: string;
    infoHash: string;
    torrentName: string;
}

/** A WebUI is opened with its credentials; any other link is a plain tab. */
export type NotificationLink = { webUiId: string } | { url: string };

export type NotificationEvent =
    | { type: "added"; webUi: TorrentWebUI; torrent: Torrent; warning?: string }
    | { type: "addFailed"; reason: string; webUiId?: string }
    | { type: "downloadFailed"; error: unknown; webUiId: string }
    | { type: "cloudflareChallenge"; message: string; challengeUrl: string }
    | { type: "labelSet"; webUi: TorrentWebUI; torrentName: string; label: string }
    | { type: "settingsReset" }
    | { type: "test"; isFailed: boolean };

interface Presentation {
    title: string;
    message: string;
    isFailed: boolean;
    link?: NotificationLink;
    labelAction?: NotificationLabelAction;
}

export function registerNotificationClickListener(): void {
    ext.notifications.onClicked.addListener((notificationId) => {
        void openNotificationLink(notificationId).catch((error) =>
            console.error("Opening the link of a notification failed", error),
        );
    });
}

export function registerNotificationButtonListener(): void {
    ext.notifications.onButtonClicked?.addListener((notificationId) => {
        void openSetLabelWindowFor(notificationId);
    });
}

export function registerNotificationCleanupListeners(): void {
    ext.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name.startsWith(CLEANUP_ALARM_PREFIX)) {
            forgetNotification(alarm.name.slice(CLEANUP_ALARM_PREFIX.length));
        }
    });
    ext.notifications.onClosed.addListener((notificationId) => {
        clearStoredNotification(notificationId);
    });
}

export async function notify(event: NotificationEvent, settings: RTASettings): Promise<void> {
    if (event.type !== "test" && !settings.notificationsEnabled) {
        return;
    }
    try {
        show(await present(event, settings), settings);
    } catch (error) {
        console.error("Showing a notification failed", error);
    }
}

async function present(event: NotificationEvent, settings: RTASettings): Promise<Presentation> {
    switch (event.type) {
        case "added":
            return {
                title: "Torrent added successfully",
                message: `${event.torrent.name} successfully added to ${event.webUi.name}${event.warning ? `\n${event.warning}` : ""}`,
                isFailed: false,
                link: { webUiId: event.webUi.settings.id },
                labelAction: await labelActionFor(event.webUi, event.torrent, settings),
            };
        case "addFailed":
            return {
                title: "Adding torrent failed",
                message: event.reason,
                isFailed: true,
                link: event.webUiId ? { webUiId: event.webUiId } : undefined,
            };
        case "downloadFailed":
            return {
                title: "Error downloading torrent",
                message: `Error: ${event.error}`,
                isFailed: true,
                link: { webUiId: event.webUiId },
            };
        case "cloudflareChallenge":
            return {
                title: "Cloudflare is blocking this download",
                message: event.message,
                isFailed: true,
                link: { url: event.challengeUrl },
            };
        case "labelSet":
            return {
                title: "Label set",
                message: `${event.torrentName} labelled "${event.label}" in ${event.webUi.name}`,
                isFailed: false,
                link: { webUiId: event.webUi.settings.id },
            };
        case "settingsReset":
            return {
                title: "Settings were reset",
                message:
                    "Your stored settings could not be read and were reset to defaults. Re-import an export or set up your WebUIs again.",
                isFailed: true,
            };
        case "test":
            return {
                title: "Test Notification",
                message: event.isFailed ? "This is a failed notification." : "This is a successful notification.",
                isFailed: event.isFailed,
            };
    }
}

async function labelActionFor(
    webUi: TorrentWebUI,
    torrent: Torrent,
    settings: RTASettings,
): Promise<NotificationLabelAction | undefined> {
    // Firefox rejects notifications that carry buttons.
    if (isFirefox() || !settings.notificationsLabelButtonEnabled || !webUi.isLabelSupported) {
        return undefined;
    }
    const infoHash = await computeInfoHash(torrent);
    return infoHash ? { webUiId: webUi.settings.id, infoHash, torrentName: torrent.name } : undefined;
}

function show(presentation: Presentation, settings: RTASettings): void {
    const { title, message, isFailed, link, labelAction } = presentation;
    const notificationCreateOptions: chrome.notifications.NotificationCreateOptions = {
        type: "basic",
        iconUrl: isFailed ? "assets/icons/BitTorrent128-red.png" : "assets/icons/BitTorrent128.png",
        title: title,
        message: message,
    };
    if (labelAction) {
        notificationCreateOptions.buttons = [{ title: "Add label" }];
    }

    void ext.notifications.create("", notificationCreateOptions).then(async (myId) => {
        if (link) {
            await ext.storage.session.set({ [LINK_KEY_PREFIX + myId]: link });
        }
        if (labelAction) {
            await ext.storage.session.set({ [LABEL_ACTION_KEY_PREFIX + myId]: labelAction });
        }

        void ext.alarms.create(CLEANUP_ALARM_PREFIX + myId, { when: Date.now() + settings.notificationsDurationMs });
    });

    if (settings.notificationsSoundEnabled) {
        if (canUseOffscreen()) {
            void ensureOffscreenDocument().then(() => {
                sendMessageAndForget("playSound", { isFailed });
            });
        } else {
            void playNotificationSound(isFailed);
        }
    }
}

async function openSetLabelWindowFor(notificationId: string): Promise<void> {
    const key = LABEL_ACTION_KEY_PREFIX + notificationId;
    const labelAction = (await ext.storage.session.get(key))[key] as NotificationLabelAction | undefined;
    if (labelAction) {
        openSetLabelWindow({ ...labelAction });
        forgetNotification(notificationId);
    }
}

async function openNotificationLink(notificationId: string): Promise<void> {
    const key = LINK_KEY_PREFIX + notificationId;
    const link = (await ext.storage.session.get(key))[key] as NotificationLink | undefined;
    if (!link) {
        return;
    }
    try {
        if ("webUiId" in link) {
            const webUi = getWebUi(await loadSettings(), link.webUiId);
            if (webUi) {
                await openWebUi(webUi);
            } else {
                console.warn(`Notification's WebUI ${link.webUiId} no longer exists`);
            }
        } else {
            void ext.tabs.create({ url: link.url }).then();
        }
    } finally {
        forgetNotification(notificationId);
    }
}

function forgetNotification(notificationId: string): void {
    ext.notifications.clear(notificationId).then();
    clearStoredNotification(notificationId);
}

function clearStoredNotification(notificationId: string): void {
    void ext.alarms.clear(CLEANUP_ALARM_PREFIX + notificationId);
    void ext.storage.session.remove(LINK_KEY_PREFIX + notificationId);
    void ext.storage.session.remove(LABEL_ACTION_KEY_PREFIX + notificationId);
}

async function ensureOffscreenDocument(): Promise<void> {
    if (await ext.offscreen.hasDocument()) return;
    await ext.offscreen.createDocument({
        reasons: ["AUDIO_PLAYBACK"],
        url: "notifications/offscreen.html",
        justification: "playing a lil audio along with the notification",
    });
}
