import { ext } from "../util/browser-api";
import { type RTASettings } from "../models/settings";
import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type TorrentAddingResult, type TorrentWebUI, type WebUISettings } from "../models/webui";
import { openActionPopup, openPopupWindow } from "./action";
import { resolveUploadConfig } from "../torrent/upload-config";
import { CloudflareChallengeError, downloadTorrent, type TorrentDownloadContext } from "../torrent/download";
import { HandledFailure } from "../util/errors";
import { computeInfoHash } from "../torrent/info-hash";
import { type NotificationLabelAction, type NotificationLink, showNotification } from "./notifications";
import { clearBufferedTorrent, readBufferedTorrent, saveBufferedTorrent } from "./buffered-torrent";
import { loadSettings, saveSettings } from "../settings/settings";
import { getDefaultSettings } from "../settings/settings-defaults";
import { findWebUiSettings, getPrimaryWebUi, getWebUi, getWebUis } from "../settings/webuis";

/** One WebUI by id, the Primary WebUI when no id is given, or Send to All. */
export type AddTarget = { webUiId?: string | null } | { sendToAll: true };

/** Where the link was found: downloads the Torrent File from it and places the Config Selector next to it. */
export interface AddPage extends TorrentDownloadContext {
    windowId?: number | null;
}

/** What the user settled on in the Config Selector for a Buffered Torrent. */
export interface ConfigSelectorChoice {
    bufferedId: string;
    webUiId: string;
    config: TorrentUploadConfig;
    labels: string[];
    directories: string[];
}

/** Every Add entry point goes through here, so every failure is reported the same way. */
export async function addLink(url: string, target: AddTarget, page: AddPage = {}): Promise<void> {
    await reportingFailures(async settings => {
        const targets = resolveTargets(target, settings);
        const [first] = targets;
        if (!first) {
            notify(settings, "No WebUI configured", "Check your settings.", true);
            throw new HandledFailure("No WebUI configured");
        }

        let torrent: Torrent;
        try {
            torrent = await downloadTorrent(url, { tabId: page.tabId, frameId: page.frameId, pageUrl: page.pageUrl });
        } catch (error) {
            console.error("Error downloading torrent:", error);
            notifyDownloadFailure(settings, error, first.settings.id);
            throw handledFailure(error);
        }

        if (!("sendToAll" in target) && first.settings.showPerTorrentConfigSelector) {
            await openConfigSelector(torrent, first.settings, page.windowId);
            return;
        }

        const results = await Promise.allSettled(targets.map(async webUi =>
            sendTorrentToWebUi(webUi, torrent, settings, resolveUploadConfig(torrent, webUi.settings).config)));
        const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (rejected) {
            throw rejected.reason;
        }
    });
}

/**
 * Completes the flow the Config Selector started: the torrent itself is still
 * sitting in IndexedDB where `addLink` parked it, so the popup only has to say
 * which WebUI and which label/dir the user picked.
 */
export async function addBufferedTorrent(choice: ConfigSelectorChoice): Promise<void> {
    await reportingFailures(async settings => {
        const buffered = await readBufferedTorrent(choice.bufferedId);
        if (!buffered) {
            throw new Error("No buffered torrent to add; it may already have been consumed.");
        }

        const webUi = getWebUi(settings, choice.webUiId);
        if (!webUi) {
            throw new Error(`No WebUI found for id ${choice.webUiId}`);
        }

        await sendTorrentToWebUi(webUi, buffered.torrent, settings, choice.config);
        // The Add already succeeded; failing here would invite a retry that adds the torrent twice.
        await clearBufferedTorrent(choice.bufferedId).catch(e => console.error("Failed clearing the buffered torrent", e));
        await rememberLabelsAndDirs(settings, choice.webUiId, choice.labels, choice.directories)
            .catch(e => console.error("Failed updating labels/dirs", e));
    });
}

async function reportingFailures(run: (settings: RTASettings) => Promise<void>): Promise<void> {
    let settings: RTASettings | undefined;
    try {
        settings = await loadSettings();
        await run(settings);
    } catch (error) {
        if (error instanceof HandledFailure) {
            throw error;
        }
        const failure = handledFailure(error);
        console.error("Adding torrent failed", error);
        if (!settings) {
            console.error("Could not load settings to show the failure; using defaults");
        }
        notify(settings ?? getDefaultSettings(), "Adding torrent failed", failure.message, true);
        throw failure;
    }
}

function resolveTargets(target: AddTarget, settings: RTASettings): TorrentWebUI[] {
    if ("sendToAll" in target) {
        return getWebUis(settings);
    }
    if (!target.webUiId) {
        const primaryWebUi = getPrimaryWebUi(settings);
        return primaryWebUi ? [primaryWebUi] : [];
    }
    const webUi = getWebUi(settings, target.webUiId);
    if (!webUi) {
        throw new Error(`No WebUI found for id ${target.webUiId}`);
    }
    return [webUi];
}

async function openConfigSelector(torrent: Torrent, webUiSettings: WebUISettings, windowId: number | null | undefined): Promise<void> {
    const bufferedId = await saveBufferedTorrent({ torrent, webUiSettings });
    if (webUiSettings.useAlternativeLabelDirChooser) {
        await openPopupWindow(undefined, bufferedId);
        return;
    }
    const popupWindowId = windowId ?? (await ext.windows.getLastFocused()).id ?? 0;
    await ext.windows.update(popupWindowId, { focused: true });
    try {
        await openActionPopup(popupWindowId, undefined, bufferedId);
    } catch (error) {
        console.warn("Could not open the action popup; falling back to a window.", error);
        await openPopupWindow(undefined, bufferedId);
    }
}

async function sendTorrentToWebUi(webUi: TorrentWebUI, torrent: Torrent, settings: RTASettings, config: TorrentUploadConfig): Promise<void> {
    const result = await webUi.sendTorrent(torrent, config).catch((error: unknown): TorrentAddingResult => {
        console.error("Error sending torrent:", error);
        return { success: false, httpResponseCode: 0, httpResponseBody: error instanceof Error ? error.message : String(error) };
    });
    if (result.success) {
        console.debug(`Torrent added: ${torrent.name} to -> ${webUi.name}`);
        const labelAction = settings.notificationsEnabled ? await createLabelAction(webUi, torrent, settings) : undefined;
        notify(settings, "Torrent added successfully",
            `${torrent.name} successfully added to ${webUi.name}${result.warning ? `\n${result.warning}` : ""}`,
            false,
            { webUiId: webUi.settings.id },
            labelAction);
        return;
    }
    console.warn(`Torrent rejected by ${webUi.name}: ${torrent.name}`, result);
    notify(settings, "Torrent adding failed",
        `HTTP Response code: ${result.httpResponseCode}\nResponse body: ${result.httpResponseBody}`,
        true,
        { webUiId: webUi.settings.id });
    throw new HandledFailure(`Adding ${torrent.name} to ${webUi.name} failed (HTTP ${result.httpResponseCode}): ${result.httpResponseBody}`);
}

async function createLabelAction(webUi: TorrentWebUI, torrent: Torrent, settings: RTASettings): Promise<NotificationLabelAction | undefined> {
    if (!webUi.isLabelSupported || !(settings.notificationsLabelButtonEnabled ?? true)) {
        return undefined;
    }
    const infoHash = await computeInfoHash(torrent);
    return infoHash ? { webUiId: webUi.settings.id, infoHash, torrentName: torrent.name } : undefined;
}

async function rememberLabelsAndDirs(settings: RTASettings, webUiId: string, labels: string[], directories: string[]): Promise<void> {
    const webUiSettings = findWebUiSettings(settings, webUiId);
    if (!webUiSettings) {
        const message = `WebUI with id ${webUiId} not found in settings; couldn't update labels and directories.`;
        console.error(message);
        throw new Error(message);
    }
    webUiSettings.labels = labels;
    webUiSettings.dirs = directories;
    await saveSettings(settings);
}

function notifyDownloadFailure(settings: RTASettings, error: unknown, webUiId: string): void {
    if (error instanceof CloudflareChallengeError) {
        notify(settings, "Cloudflare is blocking this download", error.message, true, { url: error.challengeUrl });
        return;
    }
    notify(settings, "Error downloading torrent", `Error: ${error}`, true, { webUiId });
}

function notify(settings: RTASettings, title: string, message: string, isFailed: boolean, link?: NotificationLink, labelAction?: NotificationLabelAction): void {
    if (!settings.notificationsEnabled) {
        return;
    }
    showNotification(title, message, isFailed, settings.notificationsDurationMs, settings.notificationsSoundEnabled, link, labelAction);
}

function handledFailure(error: unknown): HandledFailure {
    return new HandledFailure(error instanceof Error ? error.message : String(error), { cause: error });
}
