import { ext } from './util/browser-api';
import { refreshContextMenu, registerContextMenuClickListener } from './background/context-menu';
import { registerAuthenticationListener } from './background/authentication-listener';
import { SETTINGS_BACKUP_KEY_PREFIX, SETTINGS_KEY } from './settings/settings';
import { registerMessageListener } from './background/messaging';
import { registerActionClickListener } from './background/action';
import { loadWebUis } from './settings/webuis';
import { clearDynamicRules, registerCorsCircumventionForWebUis } from './background/cors-tricks';
import { registerNotificationButtonListener, registerNotificationClickListener, registerNotificationCleanupListeners, showNotification } from './background/notifications';


registerMessageListener();
registerNotificationClickListener();
registerNotificationButtonListener();
registerNotificationCleanupListeners();
registerActionClickListener();
registerContextMenuClickListener();
registerAuthenticationListener();

ext.storage.local.onChanged.addListener(
    ((changes: Record<string, chrome.storage.StorageChange>) => {
        if (changes[SETTINGS_KEY]) {
            void rebuildContextMenu();
            void refreshCorsCircumvention();
        }
        for (const [key, change] of Object.entries(changes)) {
            if (key.startsWith(SETTINGS_BACKUP_KEY_PREFIX) && change.newValue !== undefined && change.oldValue === undefined) {
                showNotification("Settings were reset", "Your stored settings could not be read and were reset to defaults. Re-import an export or set up your WebUIs again.");
            }
        }
    }) as Parameters<typeof ext.storage.local.onChanged.addListener>[0]
);

// Context menus outlive a worker restart but not a browser restart or an
// update, so they are rebuilt on those two events and whenever settings change.
ext.runtime.onInstalled.addListener(() => {
    void rebuildContextMenu();
});

ext.runtime.onStartup.addListener(() => {
    clearDynamicRules().catch(error => console.error("Failed to clear dynamic CORS rules", error));
    void rebuildContextMenu();
});

// Session rules are dropped when the browser session ends, so they are cheap to
// recompute and worth re-asserting on every worker start.
void refreshCorsCircumvention();


async function rebuildContextMenu(): Promise<void> {
    try {
        await refreshContextMenu(await loadWebUis());
    } catch (error) {
        console.error("Failed to rebuild the context menu", error);
    }
}

async function refreshCorsCircumvention(): Promise<void> {
    try {
        await registerCorsCircumventionForWebUis(await loadWebUis());
    } catch (error) {
        console.error("Failed to refresh CORS circumvention rules", error);
    }
}
