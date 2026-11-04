import { ext } from "../../util/browser-api";
import { sendMessageAndForget, sendMessageToTab } from "../../util/messaging";
import { useEffect, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import Notice from "./Notice";
import PopupFrame from "./PopupFrame";
import { type IPageLinkInfo } from "../../models/messages";
import { surfaceClass } from "@/components/settings/SettingsSection";
import { cn } from "@/lib/utils";

type LoadState =
    | { status: "loading" }
    | { status: "empty" }
    | { status: "error"; message: string }
    | { status: "ready"; links: IPageLinkInfo[] };

export default function PageLinksView() {
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [sourceTab, setSourceTab] = useState<{ tabId: number; pageUrl: string | null } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) {
                    if (!cancelled) setState({ status: "empty" });
                    return;
                }
                if (!cancelled) setSourceTab({ tabId: tab.id, pageUrl: tab.url ?? null });
                const response = await sendMessageToTab(tab.id, "getPageLinks", {}, { frameId: 0 });
                if (cancelled) return;
                const links = response.links;
                setState(links.length ? { status: "ready", links } : { status: "empty" });
            } catch (error: unknown) {
                if (cancelled) return;
                console.error("Failed loading page links", error);
                setState({ status: "error", message: "Could not scan this page for links." });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const addLink = (url: string) => {
        sendMessageAndForget("preAddTorrent", {
            url,
            tabId: sourceTab?.tabId ?? null,
            frameId: 0,
            pageUrl: sourceTab?.pageUrl ?? null,
        });
        window.close();
    };

    if (state.status === "loading") {
        return (
            <Notice title="Remote Torrent Adder" loading>
                Scanning page…
            </Notice>
        );
    }
    if (state.status === "empty") {
        return <Notice title="No links found">No torrent or magnet links were found on this page.</Notice>;
    }
    if (state.status === "error") {
        return (
            <Notice title="Could not scan this page" tone="error">
                {state.message}
            </Notice>
        );
    }

    return (
        <PopupFrame title="Links found on this page">
            <div className={cn(surfaceClass, "max-h-96 divide-y divide-border overflow-y-auto")}>
                {state.links.map((link) => (
                    <button
                        key={link.url}
                        onClick={() => addLink(link.url)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    >
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-sm font-medium">{link.label}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{link.url}</span>
                        </span>
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                ))}
            </div>
        </PopupFrame>
    );
}
