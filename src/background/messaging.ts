import { ext } from "../util/browser-api";
import { listenForMessages } from "../util/messaging";
import { type PreAddTorrentRequest, type SetTorrentLabelRequest, type ILinkCatchingConfig } from "../models/messages";
import { type ConnectionTestResult, type WebUISettings } from "../models/webui";
import { WebUIFactory } from "../models/clients";
import { openWebUi, updateBadgeText } from "./action";
import { executeMethodWrappedWithOriginStripped } from "./cors-tricks";
import { type TorrentDownloadContext } from "../torrent/download";
import { notify } from "./notifications";
import { serializeSettings, serializeObject } from "../settings/serializer";
import { loadSettings, saveSettings } from "../settings/settings";
import { parseSettings } from "../settings/settings-validation";
import { findWebUiSettings, getWebUi } from "../settings/webuis";
import { addBufferedTorrent, addLink } from "./add";

export function registerMessageListener(): void {
    listenForMessages({
        getSettings: async () => serializeSettings(await loadSettings()),
        getLinkCatchingConfig: async (): Promise<string> => {
            const settings = await loadSettings();
            const config: ILinkCatchingConfig = {
                linkCatchingEnabled: settings.linkCatchingEnabled,
                linkCatchingRegexes: settings.linkCatchingRegexes,
            };
            return serializeObject(config);
        },
        saveSettings: ({ settings }) => {
            const parsed = parseSettings(settings);
            if (!parsed.ok) {
                throw new Error(parsed.problems.join(" "));
            }
            return saveSettings(parsed.settings);
        },
        testNotification: async ({ isFailed }) => notify({ type: "test", isFailed }, await loadSettings()),
        testConnection: ({ webUiSettings }) => testConnectionForWebUiSettings(webUiSettings),
        preAddTorrent: (message, sender) => addLink(message.url, { webUiId: message.webUiId }, {
            ...resolveDownloadContext(message, sender),
            windowId: sender.tab?.windowId,
        }),
        addTorrentMessageWithLabelAndDir: choice => addBufferedTorrent(choice),
        setTorrentLabel: message => setTorrentLabel(message),
        updateActionBadgeText: ({ text }, sender) => updateBadgeText(text, sender.tab?.id ?? -1),
        openWebUi: async ({ webUiId }, sender) => {
            if (!sender.url?.startsWith(ext.runtime.getURL(""))) {
                throw new Error("openWebUi is only accepted from extension pages");
            }
            const webUi = getWebUi(await loadSettings(), webUiId);
            if (!webUi) {
                throw new Error(`No WebUI found for id ${webUiId}`);
            }
            void openWebUi(webUi).catch(error => console.error("Failed opening WebUI", error));
        },
    });
}

export function resolveDownloadContext(message: PreAddTorrentRequest, sender: chrome.runtime.MessageSender): TorrentDownloadContext {
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

async function setTorrentLabel(message: SetTorrentLabelRequest): Promise<void> {
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

    void notify({ type: "labelSet", webUi, torrentName: message.torrentName, label: message.label }, settings);
}
