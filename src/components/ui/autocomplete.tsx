import * as React from "react";
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

const Autocomplete = AutocompletePrimitive.Root;

function AutocompleteInput({
    className,
    children,
    triggerLabel,
    ...props
}: AutocompletePrimitive.Input.Props & { children?: React.ReactNode; triggerLabel: string }) {
    return (
        <InputGroup className={cn("w-auto", className)}>
            <AutocompletePrimitive.Input render={<InputGroupInput />} {...props} />
            {children}
            <InputGroupAddon align="inline-end">
                <AutocompletePrimitive.Trigger
                    render={<InputGroupButton size="icon-xs" variant="ghost" aria-label={triggerLabel} />}
                >
                    <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
                </AutocompletePrimitive.Trigger>
            </InputGroupAddon>
        </InputGroup>
    );
}

function AutocompleteContent({ className, ...props }: AutocompletePrimitive.Popup.Props) {
    return (
        <AutocompletePrimitive.Portal>
            <AutocompletePrimitive.Positioner sideOffset={6} className="isolate z-50">
                <AutocompletePrimitive.Popup
                    data-slot="autocomplete-content"
                    className={cn(
                        "max-h-(--available-height) w-[calc(var(--anchor-width)+--spacing(9))] max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                        className,
                    )}
                    {...props}
                />
            </AutocompletePrimitive.Positioner>
        </AutocompletePrimitive.Portal>
    );
}

function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
    return (
        <AutocompletePrimitive.List
            data-slot="autocomplete-list"
            className={cn(
                "no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
                className,
            )}
            {...props}
        />
    );
}

function AutocompleteItem({ className, ...props }: AutocompletePrimitive.Item.Props) {
    return (
        <AutocompletePrimitive.Item
            data-slot="autocomplete-item"
            className={cn(
                "relative flex w-full cursor-default items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-3 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

export { Autocomplete, AutocompleteInput, AutocompleteContent, AutocompleteList, AutocompleteItem };
