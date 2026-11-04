import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function NumberField({
    className,
    unit,
    decrementLabel = "Decrease",
    incrementLabel = "Increase",
    ...props
}: NumberFieldPrimitive.Root.Props & {
    /** Shown after the number, e.g. "s". */
    unit?: string;
    /** Names the step buttons for assistive tech, e.g. "Increase display duration". */
    decrementLabel?: string;
    incrementLabel?: string;
}) {
    return (
        <NumberFieldPrimitive.Root data-slot="number-field" className={cn("w-fit", className)} {...props}>
            <NumberFieldPrimitive.Group className="flex h-9 items-center rounded-4xl border border-input bg-input/30 transition-colors has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50">
                <NumberFieldPrimitive.Decrement
                    aria-label={decrementLabel}
                    className="flex size-9 shrink-0 items-center justify-center rounded-l-4xl text-muted-foreground outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
                >
                    <MinusIcon />
                </NumberFieldPrimitive.Decrement>
                <NumberFieldPrimitive.Input className="w-12 min-w-0 bg-transparent text-center text-sm tabular-nums outline-none" />
                {unit && <span className="-ml-2 pr-1 text-sm text-muted-foreground select-none">{unit}</span>}
                <NumberFieldPrimitive.Increment
                    aria-label={incrementLabel}
                    className="flex size-9 shrink-0 items-center justify-center rounded-r-4xl text-muted-foreground outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
                >
                    <PlusIcon />
                </NumberFieldPrimitive.Increment>
            </NumberFieldPrimitive.Group>
        </NumberFieldPrimitive.Root>
    );
}

export { NumberField };
