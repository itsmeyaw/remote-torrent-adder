import { type TorrentUploadConfig } from "./torrent";
import { type ConnectionTestResult, type WebUISettings } from "./webui";

export interface ILinkCatchingConfig {
    linkCatchingEnabled: boolean;
    linkCatchingRegexes: RegExp[];
}

export interface IPageLinkInfo {
    url: string;
    label: string;
}

export interface IPageLinksResponse {
    links: IPageLinkInfo[];
}

export interface IFetchedTorrentFile {
    ok: boolean;
    status: number;
    statusText: string;
    contentType: string | null;
    cfMitigated: string | null;
    finalUrl: string;
    base64: string;
}

/** What the user settled on in the Config Selector for a Buffered Torrent. */
export interface ConfigSelectorChoice {
    bufferedId: string;
    config: TorrentUploadConfig;
    labels: string[];
    directories: string[];
}

export interface PreAddTorrentRequest {
    url: string;
    webUiId?: string | null;
    tabId?: number | null;
    frameId?: number | null;
    pageUrl?: string | null;
}

export interface SetTorrentLabelRequest {
    webUiId: string;
    infoHash: string;
    torrentName: string;
    label: string;
    labels: string[];
}

type NoRequest = Record<string, never>;

/** One entry per action: what the sender passes in, and what the handler answers with. */
export interface MessageContracts {
    getSettings: { request: NoRequest; reply: string };
    getLinkCatchingConfig: { request: NoRequest; reply: string };
    saveSettings: { request: { settings: string }; reply: void };
    testNotification: { request: { isFailed: boolean }; reply: void };
    testConnection: { request: { webUiSettings: WebUISettings }; reply: ConnectionTestResult };
    preAddTorrent: { request: PreAddTorrentRequest; reply: void };
    addTorrentMessageWithLabelAndDir: { request: ConfigSelectorChoice; reply: void };
    setTorrentLabel: { request: SetTorrentLabelRequest; reply: void };
    updateActionBadgeText: { request: { text: string }; reply: void };
    openWebUi: { request: { webUiId: string }; reply: void };
    // Handled by the content script, sent with tabs.sendMessage.
    getPageLinks: { request: NoRequest; reply: IPageLinksResponse };
    fetchTorrentInPage: { request: { url: string }; reply: IFetchedTorrentFile };
    // Handled by the offscreen document.
    playSound: { request: { isFailed: boolean }; reply: void };
}

export type MessageAction = keyof MessageContracts;
export type Message<A extends MessageAction> = { action: A } & MessageContracts[A]["request"];
export type Reply<A extends MessageAction> = MessageContracts[A]["reply"];
