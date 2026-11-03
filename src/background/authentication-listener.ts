import { ext } from "../util/browser-api";
import { type TorrentWebUI } from "../models/webui";
import { loadSettings } from "../settings/settings";
import { getWebUi, getWebUis } from "../settings/webuis";


const AUTH_TRIED_KEY_PREFIX = "authTried:";
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
    const triedKey = AUTH_TRIED_KEY_PREFIX + details.requestId;
    if ((await ext.storage.session.get(triedKey))[triedKey]) {
        // Second firing for this request, let the browser handle it
        await ext.storage.session.remove(triedKey);
        return {};
    }

    const webUi = await findAuthorizedWebUi(details);
    if (!webUi) {
        return {};
    }

    await rememberRequest(details.requestId);
    return {
        authCredentials: {
            username: webUi.settings.username,
            password: webUi.settings.password
        }
    };
}

async function findAuthorizedWebUi(details: chrome.webRequest.OnAuthRequiredDetails): Promise<TorrentWebUI | undefined> {
    if (details.tabId === -1) {
        return getWebUis(await loadSettings()).find(candidate => isRequestForWebUi(details.url, candidate));
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
    const webUi = getWebUi(await loadSettings(), webUiId);
    return webUi && isRequestForWebUi(details.url, webUi) ? webUi : undefined;
}

function isRequestForWebUi(url: string, webUi: TorrentWebUI): boolean {
    if (!webUi.settings.host || !url) {
        return false;
    }
    const baseUrl = webUi.createBaseUrl().replace(/\/+$/, "");
    return url === baseUrl || url.startsWith(baseUrl + "/");
}

// shortcut: markers for requests that never fire a second challenge are kept until the browser session ends, add a webRequest.onCompleted/onErrorOccurred cleanup if this grows
async function rememberRequest(requestId: string): Promise<void> {
    await ext.storage.session.set({ [AUTH_TRIED_KEY_PREFIX + requestId]: true });
}
