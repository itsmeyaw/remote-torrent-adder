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
        checkUrlAndRegisterAction(element, () => {
            if (!element.getAttribute('href')?.trim()) {
                return undefined;
            }
            return getMatchingUrl(element.href, linkRegexes);
        }, 'click', (event, url) => {
            const mouseEvent = event as MouseEvent;
            if (mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) {
                console.debug("Clicked a recognized link, but RTA action was prevented due to pressed modifier keys.");
                return;
            }
            mouseEvent.preventDefault();
            sendMessageAndForget({ action: PreAddTorrentMessage.action, url } as IPreAddTorrentMessage);
        });
    });
}

function registerForms(linkRegexes: RegExp[]): void {
    observe<HTMLFormElement>('form', (form) => {
        checkUrlAndRegisterAction(form, () => {
            if (!form.getAttribute('action')?.trim()) {
                return undefined;
            }
            return getMatchingUrl(form.action, linkRegexes);
        }, 'submit', (event, url) => {
            event.preventDefault();
            sendMessageAndForget({ action: PreAddTorrentMessage.action, url } as IPreAddTorrentMessage);
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

function checkUrlAndRegisterAction(
    element: Element,
    getCurrentUrl: () => string | undefined,
    eventType: 'click' | 'submit',
    handleEvent: (event: Event, url: string) => void
): void {
    const url = getCurrentUrl();
    if (!url) {
        return;
    }
    recordFoundLink(element, url);
    console.debug(`Registered action for element: ${element.tagName}, URL: ${url}`);
    element.addEventListener(eventType, (event: Event) => {
        const currentUrl = getCurrentUrl();
        if (!currentUrl) {
            return;
        }
        handleEvent(event, currentUrl);
    });
}
