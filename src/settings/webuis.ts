import { WebUIFactory } from "../models/clients";
import { type RTASettings } from "../models/settings";
import { type TorrentWebUI, type WebUISettings } from "../models/webui";

/** The one lookup of a WebUI's settings by id; everything else that needs a WebUI by id goes through it. */
export function findWebUiSettings(settings: RTASettings, id: string | null | undefined): WebUISettings | undefined {
    if (!id) {
        return undefined;
    }
    return settings.webuiSettings.find((webUi) => webUi.id === id);
}

export function getWebUi(settings: RTASettings, id: string | null | undefined): TorrentWebUI | null {
    const webUiSettings = findWebUiSettings(settings, id);
    return webUiSettings ? WebUIFactory.createWebUI(webUiSettings) : null;
}

/** Every configured WebUI in list order; drafts without a client are skipped. */
export function getWebUis(settings: RTASettings): TorrentWebUI[] {
    return settings.webuiSettings
        .map((webUiSettings) => WebUIFactory.createWebUI(webUiSettings))
        .filter((webUi) => webUi !== null);
}

export function getPrimaryWebUi(settings: RTASettings): TorrentWebUI | null {
    return getWebUis(settings)[0] ?? null;
}
