import { ext } from "../util/browser-api";
import { WebUIFactory } from "../models/clients";
import { AddTorrentMessageWithLabelAndDir, type IAddTorrentMessageWithLabelAndDir } from "../models/messages";
import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type ClientSpecificSettingDescriptor, resolveClientSpecificSetting, type WebUISettings } from "../models/webui";
import { readBufferedTorrent } from "../background/buffered-torrent";
import { resolveUploadConfig } from "../torrent/upload-config";

/**
 * Everything the popup needs, resolved once before the form is rendered, so the
 * form can initialise its fields directly instead of being filled in field by
 * field after mounting.
 */
export interface PopupData {
    bufferedId: string;
    torrent: Torrent;
    webUiSettings: WebUISettings;
    /** Which controls this client understands. */
    supports: {
        label: boolean;
        directory: boolean;
        paused: boolean;
    };
    /** What each control starts out as. */
    initial: {
        label: string;
        directory: string;
        paused: boolean;
    };
    /** Whether the initial value came from an auto-label/dir rule, which the UI highlights. */
    auto: {
        label: boolean;
        directory: boolean;
    };
    labelOptions: string[];
    directoryOptions: string[];
    /** Extra options the selected client understands and offers per torrent. */
    clientSpecific: {
        descriptors: ReadonlyArray<ClientSpecificSettingDescriptor>;
        initial: Record<string, boolean>;
    };
}

/** Resolves the Buffered Torrent with this id, or null when there is none waiting to be added. */
export async function loadPopupData(bufferedId: string): Promise<PopupData | null> {
    const buffered = await readBufferedTorrent(bufferedId);
    if (!buffered) {
        return null;
    }

    const { torrent, webUiSettings } = buffered;
    const webUi = WebUIFactory.createWebUI(webUiSettings);

    // The resolver is pure, so the popup resolves this itself rather than having
    // the service worker compute it and ship the result across a message.
    const resolved = resolveUploadConfig(torrent, webUiSettings);

    const clientSpecificDescriptors = (webUi?.clientSpecificSettingDescriptors ?? []).filter(descriptor => descriptor.perTorrent);

    return {
        bufferedId,
        torrent,
        webUiSettings,
        supports: {
            label: webUi?.isLabelSupported ?? false,
            directory: webUi?.isDirSupported ?? false,
            paused: webUi?.isAddPausedSupported ?? false,
        },
        initial: {
            label: resolved.config.label ?? "",
            directory: resolved.config.dir ?? "",
            paused: resolved.config.addPaused ?? false,
        },
        auto: {
            label: resolved.fromRule.label,
            directory: resolved.fromRule.dir,
        },
        labelOptions: webUiSettings.labels,
        directoryOptions: webUiSettings.dirs,
        clientSpecific: {
            descriptors: clientSpecificDescriptors,
            initial: Object.fromEntries(clientSpecificDescriptors.map(descriptor => [
                descriptor.key,
                resolveClientSpecificSetting(descriptor.key, clientSpecificDescriptors, webUiSettings.clientSpecificSettings),
            ])),
        },
    };
}

export interface AddTorrentRequest {
    bufferedId: string;
    webUiId: string;
    label: string;
    directory: string;
    paused: boolean;
    labelOptions: string[];
    directoryOptions: string[];
    clientSpecific: Record<string, boolean>;
}

/**
 * The torrent bytes stay in IndexedDB; this only reports which WebUI and which
 * label/dir the user settled on. Rejects if the service worker reports a
 * problem, so the popup can surface it instead of closing on a failure.
 */
export async function submitTorrent(request: AddTorrentRequest): Promise<void> {
    const message: IAddTorrentMessageWithLabelAndDir = {
        action: AddTorrentMessageWithLabelAndDir.action,
        bufferedId: request.bufferedId,
        webUiId: request.webUiId,
        config: {
            label: request.label,
            dir: request.directory,
            addPaused: request.paused,
            clientSpecificSettings: request.clientSpecific,
        } satisfies TorrentUploadConfig,
        labels: request.labelOptions,
        directories: request.directoryOptions,
    };

    const response = await ext.runtime.sendMessage(message);
    if (response && typeof response === "object" && "error" in response) {
        throw new Error(String(response.error));
    }
}

