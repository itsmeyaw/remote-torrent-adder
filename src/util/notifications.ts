import { ext, sendMessageAndForget } from "./browser-api";
import { type IPlaySoundMessage, PlaySoundMessage } from "../models/messages";
import { canUseOffscreen, isFirefox } from "./platform";
import { playNotificationSound } from "./play-sound";
import { openSetLabelWindow, openWebUi } from "./action";
import { loadWebUis } from "./webuis";

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

export function registerNotificationClickListener(): void {
    ext.notifications.onClicked.addListener((notificationId) => {
        void openNotificationLink(notificationId).catch(error => console.error("Opening the link of a notification failed", error));
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

export function showNotification(title: string, message: string, isFailed: boolean = true, popupDurationMs: number = 2000, playSound: boolean = false, link?: NotificationLink, labelAction?: NotificationLabelAction): void {
    const notificationCreateOptions: chrome.notifications.NotificationCreateOptions = {
        type: "basic",
        iconUrl: isFailed ? "assets/icons/BitTorrent128-red.png" : "assets/icons/BitTorrent128.png",
        title: title,
        message: message
    };
    const offeredLabelAction = isFirefox() ? undefined : labelAction;
    if (offeredLabelAction) {
        notificationCreateOptions.buttons = [{ title: "Add label" }];
    }

    void ext.notifications.create("", notificationCreateOptions).then(async myId => {
        if (link) {
            await ext.storage.session.set({ [LINK_KEY_PREFIX + myId]: link });
        }
        if (offeredLabelAction) {
            await ext.storage.session.set({ [LABEL_ACTION_KEY_PREFIX + myId]: offeredLabelAction });
        }

        void ext.alarms.create(CLEANUP_ALARM_PREFIX + myId, { when: Date.now() + popupDurationMs });
    });

    if (playSound) {
        if (canUseOffscreen()) {
            void ensureOffscreenDocument().then(() => {
                const playSoundMessage = {
                    action: PlaySoundMessage.action,
                    isFailed
                } as IPlaySoundMessage;
                sendMessageAndForget(playSoundMessage);
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
    if ("webUiId" in link) {
        const webUi = (await loadWebUis()).find(candidate => candidate.settings.id === link.webUiId);
        if (webUi) {
            await openWebUi(webUi);
        } else {
            console.warn(`Notification's WebUI ${link.webUiId} no longer exists`);
        }
    } else {
        void ext.tabs.create({ url: link.url }).then();
    }
    forgetNotification(notificationId);
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
        url: 'notifications/offscreen.html',
        justification: "playing a lil audio along with the notification"
    });
}
