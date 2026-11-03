import { ext, sendMessageAndForget, trySendMessage } from '../util/browser-api';
import { observe } from './mutations';
import { deriveLinkLabel, isMagnetLink } from './link-labels';
import {deserializeObject} from '../util/serializer';
import {
    FetchTorrentInPageMessage,
    GetLinkCatchingConfig,
    GetPageLinksMessage,
    type IFetchTorrentInPageMessage,
    type IFetchTorrentInPageResponse,
    type ILinkCatchingConfig,
    type IPageLinkInfo,
    type IPageLinksResponse,
    type IPreAddTorrentMessage,
    type IUpdateActionBadgeTextMessage,
    UpdateActionBadgeText
} from '../models/messages';
import { PreAddTorrentMessage } from '../models/messages';
import { isMatchedByRegexes } from '../util/utils';
import { fetchTorrentInPage } from './torrent-fetch';


let foundLinks: IPageLinkInfo[];
let seenLinkUrls: Set<string>;
loadSettingsAndRegisterActions();

ext.runtime.onMessage.addListener((
    message: { action?: string },
    _sender,
    sendResponse: (response: IPageLinksResponse | IFetchTorrentInPageResponse) => void
) => {
    if (message?.action === GetPageLinksMessage.action) {
        sendResponse({ links: foundLinks });
        return false;
    }
    if (message?.action === FetchTorrentInPageMessage.action) {
        fetchTorrentInPage((message as IFetchTorrentInPageMessage).url)
            .then(fetched => sendResponse({ fetched }))
            .catch((error: unknown) => sendResponse({ error: (error as Error)?.message ?? String(error) }));
        return true;
    }
    return false;
});

function loadSettingsAndRegisterActions(attemptNumber: number = 0): void {
    foundLinks = [];
    seenLinkUrls = new Set<string>();
    sendMessageAndForget({ action: UpdateActionBadgeText.action, text: '' } as IUpdateActionBadgeTextMessage);
    void trySendMessage<string>(GetLinkCatchingConfig).then(serializedConfig => {
        if (!serializedConfig) {
            if (attemptNumber < 3) {
                console.warn("Service worker might've been asleep. Retrying to load config...");
                setTimeout(() => loadSettingsAndRegisterActions(attemptNumber + 1), 100 * (attemptNumber + 1));
            }
            return;
        }

        const config = deserializeObject(serializedConfig) as ILinkCatchingConfig;
        console.debug("Received link-catching config from background script:", config);

        if (config.linkCatchingEnabled) {
            registerLinks(config.linkCatchingRegexes);
            registerForms(config.linkCatchingRegexes);
        }
    });
}

function registerLinks(linkRegexes: RegExp[]): void {
    observe<HTMLAnchorElement>('a', (element) => {
        const getCurrentUrl = () => element.getAttribute('href')?.trim()
            ? getMatchingUrl(element.href, linkRegexes)
            : undefined;
        const url = getCurrentUrl();
        if (url) {
            recordFoundLink(element, url);
        }
        element.addEventListener('click', (event: Event) => {
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
            sendMessageAndForget({ action: PreAddTorrentMessage.action, url: currentUrl } as IPreAddTorrentMessage);
        });
    });
}

function registerForms(linkRegexes: RegExp[]): void {
    observe<HTMLFormElement>('form', (form) => {
        // The action is often set after insertion, so the submit listener is always attached.
        const getCurrentUrl = () => form.getAttribute('action')?.trim()
            ? getMatchingUrl(form.action, linkRegexes)
            : undefined;
        const url = getCurrentUrl();
        if (url) {
            recordFoundLink(form, url);
        }
        form.addEventListener('submit', (event: Event) => {
            const currentUrl = getCurrentUrl();
            if (!currentUrl) {
                return;
            }
            event.preventDefault();
            sendMessageAndForget({ action: PreAddTorrentMessage.action, url: currentUrl } as IPreAddTorrentMessage);
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
    sendMessageAndForget({
        action: UpdateActionBadgeText.action,
        text: foundLinks.length.toString()
    } as IUpdateActionBadgeTextMessage);
}
