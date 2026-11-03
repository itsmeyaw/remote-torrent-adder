import { ext } from "./browser-api";
import {
    AddTorrentMessage,
    GetSettingsMessage,
    GetLinkCatchingConfig,
    type IAddTorrentMessage,
    type IAddTorrentMessageWithLabelAndDir,
    type IPreAddTorrentMessage,
    PreAddTorrentMessage,
    AddTorrentMessageWithLabelAndDir,
    UpdateActionBadgeText,
    SaveSettingsMessage,
    type IUpdateActionBadgeTextMessage,
    TestNotificationMessage,
    TestConnectionMessage,
    type ITestConnectionMessage,
    type ISaveSettingsMessage,
    type ITestNotificationMessage,
    type IMessagable,
    SetTorrentLabelMessage,
    type ISetTorrentLabelMessage,
    OpenWebUiMessage,
    type IOpenWebUiMessage
} from "../models/messages";
import { type RTASettings } from "../models/settings";
import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type ConnectionTestResult, type TorrentAddingResult, type TorrentWebUI, type WebUISettings } from "../models/webui";
import { WebUIFactory } from "../models/clients";
import { openActionPopup, openPopupWindow, openWebUi, updateBadgeText } from "./action";
import { getAutoDirResult, getAutoLabelResult } from "./auto-label-dir-matcher";
import { executeMethodWrappedWithOriginStripped } from "./cors-tricks";
import { CloudflareChallengeError, downloadTorrent, type TorrentDownloadContext } from "./download";
import { computeInfoHash } from "./info-hash";
import { type NotificationLabelAction, showNotification } from "./notifications";
import { serializeSettings, serializeObject, deserializeSettings } from "./serializer";
import { clearBufferedTorrent, readBufferedTorrent, saveBufferedTorrent } from "./buffered-torrent";
import { Settings } from "./settings";
import { addTrailingSlash } from "./utils";
import { initiateWebUis } from "./webuis";


export function registerMessageListener(): void {
    ext.runtime.onMessage.addListener((message: IMessagable, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
        let willRespondAsync = false;

        const finish = (payload?: unknown) => {
            try { sendResponse(payload); } catch { /* channel maybe closed */ }
        };

        const respondWithError = (err: unknown) => {
            console.error("Message handling error", message?.action, err);
            finish({ error: (err as Error)?.message || String(err) });
        };

        try {
            if (!message || !message.action) {
                finish({ error: "missing action" });
                return false;
            }

            console.debug(`Received message of type ${message.action}`);
            const settingsProvider = new Settings();

            switch (message.action) {
                case GetSettingsMessage.action: {
                    willRespondAsync = true;
                    settingsProvider.loadSettings()
                        .then(settings => finish(serializeSettings(settings)))
                        .catch(respondWithError);
                    break;
                }
                case GetLinkCatchingConfig.action: {
                    willRespondAsync = true;
                    settingsProvider.loadSettings()
                        .then(settings => finish(serializeObject({
                            linkCatchingEnabled: settings.linkCatchingEnabled,
                            linkCatchingRegexes: settings.linkCatchingRegexes,
                        })))
                        .catch(respondWithError);
                    break;
                }
                case SaveSettingsMessage.action: {
                    const saveSettingsMessage = message as ISaveSettingsMessage & { settings: string };
                    const settings = deserializeSettings(saveSettingsMessage.settings);
                    if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
                        respondWithError(new Error("SaveSettings payload is not a settings object"));
                        break;
                    }
                    willRespondAsync = true;
                    settingsProvider.saveSettings(settings)
                        .then(() => finish({}))
                        .catch(respondWithError);
                    break;
                }
                case TestNotificationMessage.action: {
                    const testNotificationMessage = message as ITestNotificationMessage;
                    showNotification(
                        testNotificationMessage.title,
                        testNotificationMessage.message,
                        testNotificationMessage.isFailed,
                        testNotificationMessage.popupDurationMs,
                        testNotificationMessage.playSound
                    );
                    finish({});
                    break;
                }
                case TestConnectionMessage.action: {
                    willRespondAsync = true;
                    testConnectionForWebUiSettings((message as ITestConnectionMessage).webUiSettings)
                        .then(finish)
                        .catch(respondWithError);
                    break;
                }
                case PreAddTorrentMessage.action: {
                    willRespondAsync = true;
                    const preAddTorrentMessage = message as IPreAddTorrentMessage;
                    ext.windows.getLastFocused().then(async lastFocusedWindow => {
                        await dispatchPreAddTorrent(
                            preAddTorrentMessage,
                            sender.tab?.windowId ?? lastFocusedWindow.id ?? 0,
                            resolveDownloadContext(preAddTorrentMessage, sender)
                        );
                        finish({});
                    }).catch(respondWithError);
                    break;
                }
                case AddTorrentMessage.action: {
                    willRespondAsync = true;
                    const addTorrentMessage = message as IAddTorrentMessage;
                    addTorrentToWebUiById(
                        addTorrentMessage.webUiId,
                        addTorrentMessage.url,
                        addTorrentMessage.config,
                        resolveDownloadContext(addTorrentMessage, sender)
                    )
                        .then(() => finish({}))
                        .catch(respondWithError);
                    break;
                }
                case AddTorrentMessageWithLabelAndDir.action: {
                    willRespondAsync = true;
                    addBufferedTorrent(message as IAddTorrentMessageWithLabelAndDir, settingsProvider)
                        .then(() => finish({}))
                        .catch(respondWithError);
                    break;
                }
                case SetTorrentLabelMessage.action: {
                    willRespondAsync = true;
                    setTorrentLabel(message as ISetTorrentLabelMessage, settingsProvider)
                        .then(() => finish({}))
                        .catch(respondWithError);
                    break;
                }
                case UpdateActionBadgeText.action: {
                    updateBadgeText((message as IUpdateActionBadgeTextMessage).text, sender.tab?.id || -1);
                    break;
                }
                case OpenWebUiMessage.action: {
                    if (!sender.url?.startsWith(ext.runtime.getURL(""))) {
                        respondWithError(new Error("openWebUi is only accepted from extension pages"));
                        break;
                    }
                    willRespondAsync = true;
                    getWebUiById((message as IOpenWebUiMessage).webUiId, settingsProvider)
                        .then(webUi => {
                            if (!webUi) {
                                throw new Error(`No WebUI found for id ${(message as IOpenWebUiMessage).webUiId}`);
                            }
                            void openWebUi(webUi).catch(error => console.error("Failed opening WebUI", error));
                            finish({});
                        })
                        .catch(respondWithError);
                    break;
                }
                default: {
                    finish({ error: `unknown action: ${message.action}` });
                }
            }
        } catch (err) {
            respondWithError(err);
        }

        return willRespondAsync;
    });
}

export function resolveDownloadContext(message: IPreAddTorrentMessage, sender: chrome.runtime.MessageSender): TorrentDownloadContext {
    const senderPageUrl = sender.tab ? sender.url ?? sender.tab.url ?? null : null;
    return {
        tabId: sender.tab?.id ?? message.tabId ?? null,
        frameId: (sender.tab ? sender.frameId : message.frameId) ?? 0,
        pageUrl: senderPageUrl ?? message.pageUrl ?? null
    };
}

export async function dispatchPreAddTorrent(message: IPreAddTorrentMessage, windowId: number, context: TorrentDownloadContext = {}): Promise<void> {
    const settingsProvider = new Settings();
    const allWebUis = await getAllWebUis(settingsProvider);
    const webUiById = await getWebUiById(message.webUiId ?? "", settingsProvider);
    const webUi = webUiById ?? allWebUis[0] ?? null;
    if (webUi && webUi.settings.showPerTorrentConfigSelector) {
        let torrent: Torrent;
        try {
            torrent = await downloadTorrent(message.url, context);
        } catch (error) {
            console.error("Error downloading torrent:", error);
            notifyDownloadFailure(error, await settingsProvider.loadSettings(), addTrailingSlash(webUi.createBaseUrl()));
            throw error;
        }
        await saveBufferedTorrent({ torrent, webUiSettings: webUi.settings });
        if (webUi.settings.useAlternativeLabelDirChooser) {
            await openPopupWindow();
        } else {
            await ext.windows.update(windowId, { focused: true });
            try {
                await openActionPopup(windowId);
            } catch (error) {
                console.warn("Could not open the action popup; falling back to a window.", error);
                await openPopupWindow();
            }
        }
    } else {
        await downloadAndAddTorrentToWebUi(webUi, message.url, null, message, context);
    }
}


export async function addTorrentToWebUiById(webUiId: string, url: string, config: TorrentUploadConfig | null, context: TorrentDownloadContext = {}): Promise<void> {
    const webUi = await getWebUiById(webUiId, new Settings());
    await downloadAndAddTorrentToWebUi(webUi, url, config, { action: AddTorrentMessage.action, url, webUiId } as IPreAddTorrentMessage, context);
}

async function testConnectionForWebUiSettings(webUiSettings: WebUISettings): Promise<ConnectionTestResult> {
    const webUi = WebUIFactory.createWebUI(webUiSettings);
    if (!webUi) {
        return { reachable: false, authenticated: null, httpResponseCode: 0, message: "No client selected for this WebUI." };
    }
    return executeMethodWrappedWithOriginStripped(() => webUi.testConnection(), webUi.createBaseUrl());
}

async function getAllWebUis(settingsProvider: Settings): Promise<TorrentWebUI[]> {
    return initiateWebUis(await settingsProvider.loadSettings());
}

async function getWebUiById(webUiId: string, settingsProvider: Settings): Promise<TorrentWebUI | null> {
    if (!webUiId) {
        return null;
    }

    const allWebUis = await getAllWebUis(settingsProvider);
    return allWebUis.find(webUi => webUi.settings.id === webUiId) ?? null;
}

async function downloadAndAddTorrentToWebUi(webUi: TorrentWebUI | null, url: string, config: TorrentUploadConfig | null, message: IPreAddTorrentMessage, context: TorrentDownloadContext = {}): Promise<void> {
    const settings = await new Settings().loadSettings();
    if (!webUi) {
        console.error("No WebUI found for addTorrentMessage:", message);
        if (settings.notificationsEnabled) {
            showNotification("No WebUI configured",
                `Check your settings.`,
                true,
                settings.notificationsDurationMs,
                settings.notificationsSoundEnabled);
        }
        throw new Error("No WebUI configured");
    }

    let torrent: Torrent;
    try {
        torrent = await downloadTorrent(url, context);
    } catch (error) {
        console.error("Error downloading torrent:", error);
        notifyDownloadFailure(error, settings, addTrailingSlash(webUi.createBaseUrl()));
        throw error;
    }
    const fallbackConfig: TorrentUploadConfig = {
        addPaused: webUi.settings.addPaused,
        dir: getAutoDirResult(torrent, webUi._settings.autoLabelDirSettings) ?? webUi.settings.defaultDir ?? undefined,
        label: getAutoLabelResult(torrent, webUi._settings.autoLabelDirSettings) ?? webUi.settings.defaultLabel ?? undefined
    };
    await sendTorrentToWebUi(webUi, torrent, config ?? fallbackConfig);
}

function notifyDownloadFailure(error: unknown, settings: RTASettings, webUiUrl: string): void {
    if (!settings.notificationsEnabled) {
        return;
    }
    if (error instanceof CloudflareChallengeError) {
        showNotification("Cloudflare is blocking this download",
            error.message,
            true,
            settings.notificationsDurationMs,
            settings.notificationsSoundEnabled,
            error.challengeUrl);
        return;
    }

    showNotification("Error downloading torrent",
        `Error: ${error}`,
        true,
        settings.notificationsDurationMs,
        settings.notificationsSoundEnabled,
        webUiUrl);
}

/**
 * Completes the flow the popup started: the torrent itself is still sitting in
 * IndexedDB where `dispatchPreAddTorrent` parked it, so the popup only has to
 * say which WebUI and which label/dir the user picked.
 */
async function addBufferedTorrent(message: IAddTorrentMessageWithLabelAndDir, settingsProvider: Settings): Promise<void> {
    const buffered = await readBufferedTorrent();
    if (!buffered) {
        throw new Error("No buffered torrent to add; it may already have been consumed.");
    }

    const webUi = await getWebUiById(message.webUiId, settingsProvider);
    if (!webUi) {
        throw new Error(`No WebUI found for id ${message.webUiId}`);
    }

    await sendTorrentToWebUi(webUi, buffered.torrent, message.config);
    // The Add already succeeded; failing here would invite a retry that adds the torrent twice.
    await clearBufferedTorrent().catch(e => console.error("Failed clearing the buffered torrent", e));
    await updateWebUiSettingsForWebUi(settingsProvider, message.webUiId, message.labels, message.directories)
        .catch(e => console.error("Failed updating labels/dirs", e));
}

async function updateWebUiSettingsForWebUi(settingsProvider: Settings, webUiId: string, labels: string[], directories: string[]): Promise<void> {
    const settings = await settingsProvider.loadSettings();
    const webUiSettings = settings.webuiSettings.find(webUi => webUi.id === webUiId);
    if (!webUiSettings) {
        const message = `WebUI with id ${webUiId} not found in settings; couldn't update labels and directories.`;
        console.error(message);
        throw new Error(message);
    }
    webUiSettings.labels = labels;
    webUiSettings.dirs = directories;
    await settingsProvider.saveSettings(settings);
}

async function setTorrentLabel(message: ISetTorrentLabelMessage, settingsProvider: Settings): Promise<void> {
    const webUi = await getWebUiById(message.webUiId, settingsProvider);
    if (!webUi) {
        throw new Error(`No WebUI found for id ${message.webUiId}`);
    }

    const result = await webUi.setLabel(message.infoHash, message.label);
    if (!result.success) {
        throw new Error(`Setting the label failed (HTTP ${result.httpResponseCode}): ${result.httpResponseBody ?? ""}`);
    }

    const settings = await settingsProvider.loadSettings();
    const webUiSettings = settings.webuiSettings.find(candidate => candidate.id === message.webUiId);
    if (webUiSettings) {
        webUiSettings.labels = message.labels;
        await settingsProvider.saveSettings(settings);
    }

    if (settings.notificationsEnabled) {
        showNotification("Label set",
            `${message.torrentName} labelled "${message.label}" in ${webUi.name}`,
            false,
            settings.notificationsDurationMs,
            settings.notificationsSoundEnabled,
            addTrailingSlash(webUi.createBaseUrl()));
    }
}

async function createLabelAction(webUi: TorrentWebUI, torrent: Torrent, settings: RTASettings): Promise<NotificationLabelAction | undefined> {
    if (!webUi.isLabelSupported || !(settings.notificationsLabelButtonEnabled ?? true)) {
        return undefined;
    }
    const infoHash = await computeInfoHash(torrent);
    return infoHash ? { webUiId: webUi.settings.id, infoHash, torrentName: torrent.name } : undefined;
}

async function sendTorrentToWebUi(webUi: TorrentWebUI, torrent: Torrent, config: TorrentUploadConfig | null): Promise<void> {
    const settings = await new Settings().loadSettings();
    const webUiUrl = addTrailingSlash(webUi.createBaseUrl());
    const result = await webUi.sendTorrent(torrent, config ?? {}).catch((error: unknown): TorrentAddingResult => {
        console.error("Error sending torrent:", error);
        return { success: false, httpResponseCode: 0, httpResponseBody: error instanceof Error ? error.message : String(error) };
    });
    if (result.success) {
        console.debug(`Torrent added: ${torrent.name} to -> ${webUi.name}`);
        if (settings.notificationsEnabled) {
            showNotification("Torrent added successfully",
                `${torrent.name} successfully added to ${webUi.name}${result.warning ? `\n${result.warning}` : ""}`,
                false,
                settings.notificationsDurationMs,
                settings.notificationsSoundEnabled,
                webUiUrl,
                await createLabelAction(webUi, torrent, settings));
        }
        return;
    }
    console.warn(`Torrent rejected by ${webUi.name}: ${torrent.name}`, result);
    if (settings.notificationsEnabled) {
        showNotification("Torrent adding failed",
            `HTTP Response code: ${result.httpResponseCode}\nResponse body: ${result.httpResponseBody}`,
            true,
            settings.notificationsDurationMs,
            settings.notificationsSoundEnabled,
            webUiUrl);
    }
    throw new Error(`Adding ${torrent.name} to ${webUi.name} failed (HTTP ${result.httpResponseCode}): ${result.httpResponseBody}`);
}

