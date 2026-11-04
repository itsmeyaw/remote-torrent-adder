import { type ComponentType } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsProvider } from "./SettingsContext";
import WebUIsPage from "./pages/WebUIsPage";
import NotificationsPage from "./pages/NotificationsPage";
import LinkCatchingPage from "./pages/LinkCatchingPage";
import IconClickPage from "./pages/IconClickPage";
import AboutPage from "./pages/AboutPage";
import ImportExportPage from "./pages/ImportExportPage";
import HostPermissionNotice from "./components/HostPermissionNotice";

interface Tab {
    id: string;
    title: string;
    Content: ComponentType;
}

const TABS: Tab[] = [
    { id: "webuis", title: "WebUIs", Content: WebUIsPage },
    { id: "icon-click", title: "Icon Click", Content: IconClickPage },
    { id: "notifications", title: "Notifications", Content: NotificationsPage },
    { id: "link-catching", title: "Link Catching", Content: LinkCatchingPage },
    { id: "import-export", title: "Import/Export", Content: ImportExportPage },
    { id: "about", title: "About", Content: AboutPage },
];

const DEFAULT_TAB = "webuis";

export default function OptionsPage() {
    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pt-10 pb-16">
            <header className="flex items-center gap-3">
                <img src="../assets/icons/BitTorrent48.png" alt="" className="size-8" />
                <h1 className="text-lg font-semibold tracking-tight">Remote Torrent Adder</h1>
            </header>

            <SettingsProvider>
                <HostPermissionNotice />

                <Tabs defaultValue={DEFAULT_TAB} className="gap-8">
                    <TabsList aria-label="Options sections" activateOnFocus className="w-full">
                        {TABS.map((tab) => (
                            <TabsTrigger key={tab.id} value={tab.id}>
                                {tab.title}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {TABS.map((tab) => (
                        <TabsContent key={tab.id} value={tab.id}>
                            <tab.Content />
                        </TabsContent>
                    ))}
                </Tabs>
            </SettingsProvider>
        </div>
    );
}
