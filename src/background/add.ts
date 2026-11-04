import { ext } from "../util/browser-api";
import { type RTASettings } from "../models/settings";
import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type ConfigSelectorChoice } from "../models/messages";
import { type TorrentAddingResult, type TorrentWebUI, type WebUISettings } from "../models/webui";
import { openActionPopup, openPopupWindow } from "./action";
import { resolveUploadConfig } from "../torrent/upload-config";
import { CloudflareChallengeError, downloadTorrent, type TorrentDownloadContext } from "../torrent/download";
import { HandledFailure } from "../util/errors";
import { notify } from "./notifications";
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

/** Every Add entry point goes through here, so every failure is reported the same way. */
export async function addLink(url: string, target: AddTarget, page: AddPage = {}): Promise<void> {
    await reportingFailures(async (settings) => {
        const targets = resolveTargets(target, settings);
        const [first] = targets;
        if (!first) {
            void notify({ type: "addFailed", reason: "No WebUI configured. Check your settings." }, settings);
            throw new HandledFailure("No WebUI configured");
        }

        let torrent: Torrent;
        try {
            torrent = await downloadTorrent(url, { tabId: page.tabId, frameId: page.frameId, pageUrl: page.pageUrl });
        } catch (error) {
            console.error("Error downloading torrent:", error);
            void notify(
                error instanceof CloudflareChallengeError
                    ? { type: "cloudflareChallenge", message: error.message, challengeUrl: error.challengeUrl }
                    : { type: "downloadFailed", error, webUiId: first.settings.id },
                settings,
            );
            throw handledFailure(error);
        }

        if (!("sendToAll" in target) && first.settings.showPerTorrentConfigSelector) {
            await openConfigSelector(torrent, first.settings, page.windowId);
            return;
        }

        const results = await Promise.allSettled(
            targets.map(async (webUi) =>
                sendTorrentToWebUi(webUi, torrent, settings, resolveUploadConfig(torrent, webUi.settings).config),
            ),
        );
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
    await reportingFailures(async (settings) => {
        const buffered = await readBufferedTorrent(choice.bufferedId);
        if (!buffered) {
            throw new Error("No buffered torrent to add; it may already have been consumed.");
        }

        const webUi = getWebUi(settings, buffered.webUiId);
        if (!webUi) {
            throw new Error(`No WebUI found for id ${buffered.webUiId}`);
        }

        await sendTorrentToWebUi(webUi, buffered.torrent, settings, choice.config);
        // The Add already succeeded; failing here would invite a retry that adds the torrent twice.
        await clearBufferedTorrent(choice.bufferedId).catch((e) =>
            console.error("Failed clearing the buffered torrent", e),
        );
        await rememberLabelsAndDirs(settings, buffered.webUiId, choice.labels, choice.directories).catch((e) =>
            console.error("Failed updating labels/dirs", e),
        );
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
        void notify({ type: "addFailed", reason: failure.message }, settings ?? getDefaultSettings());
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

async function openConfigSelector(
    torrent: Torrent,
    webUiSettings: WebUISettings,
    windowId: number | null | undefined,
): Promise<void> {
    const bufferedId = await saveBufferedTorrent({ torrent, webUiId: webUiSettings.id });
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

async function sendTorrentToWebUi(
    webUi: TorrentWebUI,
    torrent: Torrent,
    settings: RTASettings,
    config: TorrentUploadConfig,
): Promise<void> {
    const result = await webUi.sendTorrent(torrent, config).catch((error: unknown): TorrentAddingResult => {
        console.error("Error sending torrent:", error);
        return {
            success: false,
            httpResponseCode: 0,
            httpResponseBody: error instanceof Error ? error.message : String(error),
        };
    });
    if (result.success) {
        console.debug(`Torrent added: ${torrent.name} to -> ${webUi.name}`);
        void notify({ type: "added", webUi, torrent, warning: result.warning }, settings);
        return;
    }
    console.warn(`Torrent rejected by ${webUi.name}: ${torrent.name}`, result);
    void notify(
        {
            type: "addFailed",
            reason: `HTTP Response code: ${result.httpResponseCode}\nResponse body: ${result.httpResponseBody}`,
            webUiId: webUi.settings.id,
        },
        settings,
    );
    throw new HandledFailure(
        `Adding ${torrent.name} to ${webUi.name} failed (HTTP ${result.httpResponseCode}): ${result.httpResponseBody}`,
    );
}

async function rememberLabelsAndDirs(
    settings: RTASettings,
    webUiId: string,
    labels: string[],
    directories: string[],
): Promise<void> {
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

function handledFailure(error: unknown): HandledFailure {
    return new HandledFailure(error instanceof Error ? error.message : String(error), { cause: error });
}
