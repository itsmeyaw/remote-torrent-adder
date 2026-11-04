import { ext } from "../util/browser-api";
import {
    GetSettingsMessage,
    GetLinkCatchingConfig,
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
import { type ConnectionTestResult, type WebUISettings } from "../models/webui";
import { WebUIFactory } from "../models/clients";
import { openWebUi, updateBadgeText } from "./action";
import { executeMethodWrappedWithOriginStripped } from "./cors-tricks";
import { type TorrentDownloadContext } from "../torrent/download";
import { showNotification } from "./notifications";
import { serializeSettings, serializeObject } from "../settings/serializer";
import { loadSettings, saveSettings } from "../settings/settings";
import { parseSettings } from "../settings/settings-validation";
import { findWebUiSettings, getWebUi } from "../settings/webuis";
import { addBufferedTorrent, addLink } from "./add";

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
            switch (message.action) {
                case GetSettingsMessage.action: {
                    willRespondAsync = true;
                    loadSettings()
                        .then(settings => finish(serializeSettings(settings)))
                        .catch(respondWithError);
                    break;
                }
                case GetLinkCatchingConfig.action: {
                    willRespondAsync = true;
                    loadSettings()
                        .then(settings => finish(serializeObject({
                            linkCatchingEnabled: settings.linkCatchingEnabled,
                            linkCatchingRegexes: settings.linkCatchingRegexes,
                        })))
                        .catch(respondWithError);
                    break;
                }
                case SaveSettingsMessage.action: {
                    const saveSettingsMessage = message as ISaveSettingsMessage & { settings: string };
                    const parsed = parseSettings(saveSettingsMessage.settings);
                    if (!parsed.ok) {
                        respondWithError(new Error(parsed.problems.join(" ")));
                        break;
                    }
                    willRespondAsync = true;
                    saveSettings(parsed.settings)
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
                    addLink(preAddTorrentMessage.url, { webUiId: preAddTorrentMessage.webUiId }, {
                        ...resolveDownloadContext(preAddTorrentMessage, sender),
                        windowId: sender.tab?.windowId,
                    })
                        .then(() => finish({}))
                        .catch(respondWithError);
                    break;
                }
                case AddTorrentMessageWithLabelAndDir.action: {
                    willRespondAsync = true;
                    addBufferedTorrent(message as IAddTorrentMessageWithLabelAndDir)
                        .then(() => finish({}))
                        .catch(respondWithError);
                    break;
                }
                case SetTorrentLabelMessage.action: {
                    willRespondAsync = true;
                    setTorrentLabel(message as ISetTorrentLabelMessage)
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
                    loadSettings()
                        .then(settings => getWebUi(settings, (message as IOpenWebUiMessage).webUiId))
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

async function testConnectionForWebUiSettings(webUiSettings: WebUISettings): Promise<ConnectionTestResult> {
    const webUi = WebUIFactory.createWebUI(webUiSettings);
    if (!webUi) {
        return { reachable: false, authenticated: null, httpResponseCode: 0, message: "No client selected for this WebUI." };
    }
    return executeMethodWrappedWithOriginStripped(() => webUi.testConnection(), webUi.createBaseUrl());
}

async function setTorrentLabel(message: ISetTorrentLabelMessage): Promise<void> {
    const webUi = getWebUi(await loadSettings(), message.webUiId);
    if (!webUi) {
        throw new Error(`No WebUI found for id ${message.webUiId}`);
    }

    const result = await webUi.setLabel(message.infoHash, message.label);
    if (!result.success) {
        throw new Error(`Setting the label failed (HTTP ${result.httpResponseCode}): ${result.httpResponseBody ?? ""}`);
    }

    const settings = await loadSettings();
    const webUiSettings = findWebUiSettings(settings, message.webUiId);
    if (webUiSettings) {
        webUiSettings.labels = message.labels;
        await saveSettings(settings);
    }

    if (settings.notificationsEnabled) {
        showNotification("Label set",
            `${message.torrentName} labelled "${message.label}" in ${webUi.name}`,
            false,
            settings.notificationsDurationMs,
            settings.notificationsSoundEnabled,
            { webUiId: webUi.settings.id });
    }
}
