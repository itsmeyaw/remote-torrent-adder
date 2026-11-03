import { ext } from "./browser-api";
import { type Message, type MessageAction, type MessageContracts, type Reply } from "../models/messages";

type AnyHandler = (message: unknown, sender: chrome.runtime.MessageSender) => unknown;

export type MessageHandlers = {
    [A in MessageAction]: (message: Message<A>, sender: chrome.runtime.MessageSender) => Reply<A> | Promise<Reply<A>>;
};

export async function sendMessage<A extends MessageAction>(action: A, request: MessageContracts[A]["request"]): Promise<Reply<A>> {
    return unwrap(action, await ext.runtime.sendMessage({ action, ...request }));
}

export async function sendMessageToTab<A extends MessageAction>(
    tabId: number,
    action: A,
    request: MessageContracts[A]["request"],
    options?: { frameId?: number },
): Promise<Reply<A>> {
    return unwrap(action, await ext.tabs.sendMessage(tabId, { action, ...request }, options));
}

/** For messages whose failure is deliberately ignored, such as badge updates. */
export function sendMessageAndForget<A extends MessageAction>(action: A, request: MessageContracts[A]["request"]): void {
    void sendMessage(action, request).catch(() => undefined);
}

function unwrap<A extends MessageAction>(action: A, reply: unknown): Reply<A> {
    if (typeof reply !== "object" || reply === null) {
        throw new Error(`No reply to ${action}; the receiving end may be asleep or gone.`);
    }
    if ("error" in reply) {
        throw new Error(String(reply.error));
    }
    return ("value" in reply ? reply.value : undefined) as Reply<A>;
}

/**
 * Registers the one runtime listener for this context. Messages without a handler
 * are left alone, since another context (worker, offscreen, popup, options) may own them.
 */
export function listenForMessages(handlers: Partial<MessageHandlers>): void {
    ext.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
        const action = typeof message === "object" && message !== null && "action" in message && typeof message.action === "string" ? message.action : undefined;
        const handler = action !== undefined && Object.hasOwn(handlers, action)
            ? (handlers as Record<string, AnyHandler | undefined>)[action]
            : undefined;
        if (!handler) {
            return false;
        }

        console.debug(`Received message of type ${action}`);
        void (async () => {
            let envelope: { value: unknown } | { error: string };
            try {
                envelope = { value: await handler(message, sender) };
            } catch (error) {
                console.error("Message handling error", action, error);
                envelope = { error: error instanceof Error ? error.message : String(error) };
            }
            try {
                sendResponse(envelope);
            } catch {
                // The channel closed before the reply; nobody is waiting for it.
            }
        })();
        return true;
    });
}
