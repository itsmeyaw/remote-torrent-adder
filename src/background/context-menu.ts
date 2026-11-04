import { ext } from "../util/browser-api";
import { type TorrentWebUI } from "../models/webui";
import OnClickData = chrome.contextMenus.OnClickData;
import Tab = chrome.tabs.Tab;
import { type TorrentDownloadContext } from "../torrent/download";
import { addLink, type AddTarget } from "./add";

const PARENT_MENU_ID = "server-main";
const SEND_ALL_MENU_ID = "server-all";
const SEPARATOR_MENU_ID = "sendall-separator";
const PER_SERVER_MENU_PREFIX = "server-webui-";

export function registerContextMenuClickListener(): void {
    ext.contextMenus.onClicked.addListener((onClickData: OnClickData, tab?: Tab) => {
        const target = resolveAddTarget(onClickData.menuItemId.toString());
        if (!target) {
            return;
        }
        addLink(onClickData.linkUrl ?? "", target, {
            ...resolveDownloadContext(onClickData, tab),
            windowId: tab?.windowId,
        }).catch((error) => console.error("Context menu click failed", error));
    });
}

// Deliberate exception to the stateless-worker rule: it only serializes rebuilds within one worker lifetime and must not outlive a restart.
let pendingRefresh: Promise<void> = Promise.resolve();

export function refreshContextMenu(allWebUis: TorrentWebUI[]): Promise<void> {
    pendingRefresh = pendingRefresh.catch(() => undefined).then(() => rebuildContextMenu(allWebUis));
    return pendingRefresh;
}

async function rebuildContextMenu(allWebUis: TorrentWebUI[]): Promise<void> {
    await ext.contextMenus.removeAll();

    createMenuItem({
        id: PARENT_MENU_ID,
        title: "Add to Remote WebUI",
        contexts: ["link"],
    });

    if (allWebUis.length > 1) {
        allWebUis.forEach((webUi) => {
            createMenuItem({
                id: `${PER_SERVER_MENU_PREFIX}${webUi.settings.id}`,
                title: webUi.name,
                contexts: ["link"],
                parentId: PARENT_MENU_ID,
            });
        });
        createMenuItem({ id: SEPARATOR_MENU_ID, type: "separator", contexts: ["link"], parentId: PARENT_MENU_ID });
        createMenuItem({
            id: SEND_ALL_MENU_ID,
            title: "send to all",
            contexts: ["link"],
            parentId: PARENT_MENU_ID,
        });
    }
}

function createMenuItem(properties: chrome.contextMenus.CreateProperties): void {
    ext.contextMenus.create(properties, () => {
        if (ext.runtime.lastError) {
            console.error(`Failed creating context menu item ${properties.id}`, ext.runtime.lastError.message);
        }
    });
}

function resolveAddTarget(menuItemId: string): AddTarget | null {
    if (menuItemId === PARENT_MENU_ID) {
        return {};
    }
    if (menuItemId === SEND_ALL_MENU_ID) {
        return { sendToAll: true };
    }
    if (menuItemId.startsWith(PER_SERVER_MENU_PREFIX)) {
        return { webUiId: menuItemId.slice(PER_SERVER_MENU_PREFIX.length) };
    }
    return null;
}

function resolveDownloadContext(onClickData: OnClickData, tab?: Tab): TorrentDownloadContext {
    return {
        tabId: tab?.id ?? null,
        frameId: onClickData.frameId ?? 0,
        pageUrl: onClickData.frameUrl ?? onClickData.pageUrl ?? tab?.url ?? null,
    };
}
