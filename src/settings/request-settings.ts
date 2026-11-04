import { sendMessage } from "../util/messaging";
import { type RTASettings } from "../models/settings";
import { deserializeSettings } from "./serializer";

const MAX_ATTEMPTS = 3;

/** The settings from the service worker, or null once it has stayed unreachable. */
export async function requestSettings(attemptNumber: number = 0): Promise<RTASettings | null> {
    const serialized = await sendMessage("getSettings", {}).catch((error: unknown) => {
        console.debug("Settings request failed; the background script may be asleep.", error);
        return null;
    });
    if (serialized !== null) {
        return deserializeSettings(serialized);
    }
    if (attemptNumber + 1 < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attemptNumber + 1)));
        return requestSettings(attemptNumber + 1);
    }
    return null;
}
