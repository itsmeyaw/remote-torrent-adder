import { ext } from "./browser-api";
import { type TorrentWebUI } from "../models/webui";
import { loadWebUis } from "./webuis";


const MAX_TRACKED_REQUESTS = 256;
const triedRequestIds: Set<string> = new Set();
const WEBUI_TAB_KEY_PREFIX = "webUiTab:";

export function registerAuthenticationListener(): void {
    ext.webRequest.onAuthRequired.addListener(
        (details, asyncCallback) => {
            if (!asyncCallback) {
                return {};
            }
            resolveAuthCredentials(details)
                .catch(error => {
                    console.error("Failed resolving credentials for auth challenge", error);
                    return {} as chrome.webRequest.BlockingResponse;
                })
                .then(asyncCallback);
            return;
        },
        { urls: ["<all_urls>"] },
        ["asyncBlocking"]
    );
}

/** Marks a tab RTA opened for a WebUI, so the auth listener may answer its challenges. */
export async function rememberWebUiTab(tabId: number, webUiId: string): Promise<void> {
    // shortcut: entries for closed tabs are never removed; tab ids are not reused within a browser session, add a tabs.onRemoved cleanup if this grows
    await ext.storage.session.set({ [WEBUI_TAB_KEY_PREFIX + tabId]: webUiId });
}

export async function resolveAuthCredentials(
    details: chrome.webRequest.OnAuthRequiredDetails
): Promise<chrome.webRequest.BlockingResponse> {
    if (triedRequestIds.has(details.requestId)) {
        // Second firing for this request, let the browser handle it
        triedRequestIds.delete(details.requestId);
        return {};
    }

    const webUi = await findAuthorizedWebUi(details);
    if (!webUi) {
        return {};
    }

    rememberRequest(details.requestId);
    return {
        authCredentials: {
            username: webUi.settings.username,
            password: webUi.settings.password
        }
    };
}

async function findAuthorizedWebUi(details: chrome.webRequest.OnAuthRequiredDetails): Promise<TorrentWebUI | undefined> {
    if (details.tabId === -1) {
        return (await loadWebUis()).find(candidate => isRequestForWebUi(details.url, candidate));
    }

    // Only the tab's own navigation: a page the user browsed to later must not get credentials for its subresources
    if (details.type !== "main_frame") {
        return undefined;
    }
    const key = WEBUI_TAB_KEY_PREFIX + details.tabId;
    const webUiId = (await ext.storage.session.get(key))[key] as string | undefined;
    if (!webUiId) {
        return undefined;
    }
    return (await loadWebUis()).find(candidate => candidate.settings.id === webUiId && isRequestForWebUi(details.url, candidate));
}

function isRequestForWebUi(url: string, webUi: TorrentWebUI): boolean {
    if (!webUi.settings.host || !url) {
        return false;
    }
    const baseUrl = webUi.createBaseUrl().replace(/\/+$/, "");
    return url === baseUrl || url.startsWith(baseUrl + "/");
}

function rememberRequest(requestId: string): void {
    triedRequestIds.add(requestId);
    while (triedRequestIds.size > MAX_TRACKED_REQUESTS) {
        const oldest = triedRequestIds.values().next().value;
        if (oldest === undefined) {
            return;
        }
        triedRequestIds.delete(oldest);
    }
}
