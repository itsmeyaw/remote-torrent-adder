import PopupFrame from "./PopupFrame";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export default function Notice({
    title,
    children,
    tone,
    loading = false,
    action,
}: {
    title: string;
    children: React.ReactNode;
    tone?: "error";
    loading?: boolean;
    /** The way forward from a dead end, e.g. a button to the options page. */
    action?: React.ReactNode;
}) {
    return (
        <PopupFrame title={title}>
            <p
                className={cn(
                    "flex items-center gap-2 text-sm",
                    tone === "error" ? "text-destructive" : "text-muted-foreground",
                )}
            >
                {loading && <Spinner />}
                {children}
            </p>
            {action && <div className="flex">{action}</div>}
        </PopupFrame>
    );
}
