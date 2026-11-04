import { ext } from "../util/browser-api";
import { type TorrentWebUI } from "../models/webui";

function hasUsableHost(baseUrl: string): boolean {
    if (!baseUrl) {
        return false;
    }
    try {
        return new URL(baseUrl).hostname !== "";
    } catch {
        return false;
    }
}

export function registerCorsCircumventionForWebUis(allWebUis: TorrentWebUI[]): Promise<void> {
    // One refresh at a time: overlapping ones would each add a rule id the other has not removed yet.
    return navigator.locks.request("rta-cors-session-rules", () => replaceCorsRules(allWebUis));
}

async function replaceCorsRules(allWebUis: TorrentWebUI[]): Promise<void> {
    const oldRuleIds = (await ext.declarativeNetRequest.getSessionRules()).map((rule) => rule.id);
    const newRules: chrome.declarativeNetRequest.Rule[] = [];

    allWebUis.forEach((webUi, index) => {
        const webUiBaseUrl = webUi.createBaseUrl();
        if (hasUsableHost(webUiBaseUrl)) {
            const rule: chrome.declarativeNetRequest.Rule = {
                id: index + 1,
                priority: 100,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        {
                            header: "origin",
                            operation: "remove",
                        },
                    ],
                },
                condition: {
                    urlFilter: `|${webUiBaseUrl}*`,
                    resourceTypes: ["xmlhttprequest"],
                },
            };
            newRules.push(rule);
        }
    });

    await ext.declarativeNetRequest.updateSessionRules({
        removeRuleIds: oldRuleIds,
        addRules: newRules,
    });
}

export async function clearDynamicRules(): Promise<void> {
    const rules = await ext.declarativeNetRequest.getDynamicRules();
    const ruleIds = rules.map((rule) => rule.id);
    if (ruleIds.length > 0) {
        await ext.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIds,
        });
    }
}

// Random, not a counter: a restarted worker must not reuse the id of a rule still registered from before the restart.
function allocateDynamicRuleId(): number {
    return Math.floor(Math.random() * 2_000_000_000) + 1;
}

export async function executeMethodWrappedWithOriginStripped<T>(method: () => Promise<T>, baseUrl: string): Promise<T> {
    const originStripperRuleId = allocateDynamicRuleId();
    await ext.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [originStripperRuleId],
        addRules: [
            {
                id: originStripperRuleId,
                priority: 100,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        {
                            header: "origin",
                            operation: "remove",
                        },
                    ],
                },
                condition: {
                    urlFilter: `|${baseUrl}*`,
                    resourceTypes: ["xmlhttprequest"],
                },
            },
        ],
    });
    try {
        return await method();
    } finally {
        await ext.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [originStripperRuleId],
        });
    }
}

export async function executeMethodWrappedWithReferer<T>(
    method: () => Promise<T>,
    url: string,
    referer: string,
): Promise<T> {
    const refererSetterRuleId = allocateDynamicRuleId();
    await ext.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [refererSetterRuleId],
        addRules: [
            {
                id: refererSetterRuleId,
                priority: 100,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        {
                            header: "Referer",
                            operation: "set",
                            value: referer,
                        },
                        {
                            header: "Origin",
                            operation: "remove",
                        },
                    ],
                },
                condition: {
                    urlFilter: `|${url}*`,
                    resourceTypes: ["xmlhttprequest"],
                },
            },
        ],
    });
    try {
        return await method();
    } finally {
        await ext.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [refererSetterRuleId],
        });
    }
}
