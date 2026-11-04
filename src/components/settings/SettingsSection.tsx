import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The card surface shared by settings sections and popup lists. */
export const surfaceClass = "rounded-2xl bg-card ring-1 ring-foreground/10";

interface SettingsSectionProps {
    /** Omit when the tab name already says it; the group then carries `label` for screen readers. */
    title?: string;
    label?: string;
    description?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
}

/**
 * A titled group of settings. The body is one surface whose direct children are
 * separated by hairlines, so each child should be a {@link SettingsRow} or bring
 * its own padding.
 */
export default function SettingsSection({ title, label, description, actions, children }: SettingsSectionProps) {
    const titleId = useId();
    const hasHeader = title || description || actions;
    return (
        <section
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : label}
            className="flex flex-col gap-3"
        >
            {hasHeader && (
                <div className="flex items-end justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        {title && (
                            <h2 id={titleId} className="text-sm font-semibold">
                                {title}
                            </h2>
                        )}
                        {description && <div className="text-sm text-pretty text-muted-foreground">{description}</div>}
                    </div>
                    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </div>
            )}
            {children && <div className={cn(surfaceClass, "divide-y divide-border overflow-hidden")}>{children}</div>}
        </section>
    );
}

export function SettingsRow({ className, children, ...props }: ComponentProps<"div">) {
    return (
        <div className={cn("flex flex-col gap-4 px-4 py-3.5", className)} {...props}>
            {children}
        </div>
    );
}
