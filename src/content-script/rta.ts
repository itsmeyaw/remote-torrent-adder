import { listenForMessages, sendMessage, sendMessageAndForget } from "../util/messaging";
import { observe } from "./mutations";
import { deriveLinkLabel, isMagnetLink } from "./link-labels";
import { deserializeObject } from "../settings/serializer";
import { type ILinkCatchingConfig, type IPageLinkInfo } from "../models/messages";
import { isMatchedByRegexes } from "./link-catching";
import { fetchTorrentInPage } from "./torrent-fetch";

let foundLinks: IPageLinkInfo[];
let seenLinkUrls: Set<string>;
loadSettingsAndRegisterActions();

listenForMessages({
    getPageLinks: () => ({ links: foundLinks }),
    fetchTorrentInPage: ({ url }) => fetchTorrentInPage(url),
});

function loadSettingsAndRegisterActions(attemptNumber: number = 0): void {
    foundLinks = [];
    seenLinkUrls = new Set<string>();
    sendMessageAndForget("updateActionBadgeText", { text: "" });
    sendMessage("getLinkCatchingConfig", {}).then(
        (serializedConfig) => {
            const config = deserializeObject<ILinkCatchingConfig>(serializedConfig);
            console.debug("Received link-catching config from background script:", config);

            if (config?.linkCatchingEnabled) {
                registerLinks(config.linkCatchingRegexes);
                registerForms(config.linkCatchingRegexes);
            }
        },
        () => {
            if (attemptNumber < 3) {
                console.warn("Service worker might've been asleep. Retrying to load config...");
                setTimeout(() => loadSettingsAndRegisterActions(attemptNumber + 1), 100 * (attemptNumber + 1));
            }
        },
    );
}

function registerLinks(linkRegexes: RegExp[]): void {
    observe<HTMLAnchorElement>("a", (element) => {
        const getCurrentUrl = () =>
            element.getAttribute("href")?.trim() ? getMatchingUrl(element.href, linkRegexes) : undefined;
        const url = getCurrentUrl();
        if (url) {
            recordFoundLink(element, url);
        }
        element.addEventListener("click", (event: Event) => {
            const currentUrl = getCurrentUrl();
            if (!currentUrl) {
                return;
            }
            const mouseEvent = event as MouseEvent;
            if (mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) {
                console.debug("Clicked a recognized link, but RTA action was prevented due to pressed modifier keys.");
                return;
            }
            mouseEvent.preventDefault();
            sendMessageAndForget("preAddTorrent", { url: currentUrl });
        });
    });
}

function registerForms(linkRegexes: RegExp[]): void {
    observe<HTMLFormElement>("form", (form) => {
        // The action is often set after insertion, so the submit listener is always attached.
        const getCurrentUrl = () =>
            form.getAttribute("action")?.trim() ? getMatchingUrl(form.action, linkRegexes) : undefined;
        const url = getCurrentUrl();
        if (url) {
            recordFoundLink(form, url);
        }
        form.addEventListener("submit", (event: Event) => {
            const currentUrl = getCurrentUrl();
            if (!currentUrl) {
                return;
            }
            event.preventDefault();
            sendMessageAndForget("preAddTorrent", { url: currentUrl });
        });
    });
}

function getMatchingUrl(url: string, linkRegexes: RegExp[]): string | undefined {
    return isMatchedByRegexes(url, linkRegexes) || isMagnetLink(url) ? url : undefined;
}

function recordFoundLink(element: Element, url: string): void {
    if (seenLinkUrls.has(url)) {
        return;
    }
    seenLinkUrls.add(url);
    foundLinks.push({ url, label: deriveLinkLabel(element, url) });
    sendMessageAndForget("updateActionBadgeText", { text: foundLinks.length.toString() });
}
