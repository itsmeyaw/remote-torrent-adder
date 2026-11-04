import type { ReactNode } from "react";

interface PopupFrameProps {
    title: string;
    subtitle?: string;
    children?: ReactNode;
}

/** The chrome every popup view shares: the app icon, a title, and an optional line about what it acts on. */
export default function PopupFrame({ title, subtitle, children }: PopupFrameProps) {
    return (
        <div className="flex flex-col gap-4 p-5">
            <header className="flex items-start gap-3">
                <img src="../assets/icons/BitTorrent48.png" alt="" className="size-6 shrink-0" />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h1 className="text-base font-semibold text-balance">{title}</h1>
                    {subtitle && <p className="text-sm text-muted-foreground break-all">{subtitle}</p>}
                </div>
            </header>
            {children}
        </div>
    );
}
