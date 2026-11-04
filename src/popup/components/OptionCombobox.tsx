import { useId, useState } from "react";
import { CheckIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react";
import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteList,
} from "@/components/ui/autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface OptionComboboxProps {
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    onRemoveOption: (option: string) => void;
    autoPicked?: boolean;
    className?: string;
}

/** A free-text field that also offers the options already used for this WebUI. */
export default function OptionCombobox({
    label,
    placeholder,
    value,
    onChange,
    options,
    onRemoveOption,
    autoPicked = false,
    className,
}: OptionComboboxProps) {
    const id = useId();
    const [highlighted, setHighlighted] = useState<string | undefined>(undefined);
    const trimmed = value.trim();
    const isNew = trimmed !== "" && !options.includes(trimmed);

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", className)}>
            <div className="flex items-center gap-2">
                <Label htmlFor={id}>{label}</Label>
                {autoPicked && (
                    <Badge variant="secondary">
                        <SparklesIcon />
                        Auto
                    </Badge>
                )}
            </div>
            <Autocomplete
                items={options}
                value={value}
                onValueChange={onChange}
                openOnInputClick
                onItemHighlighted={setHighlighted}
                // A value that is already an option is a choice, not a search, so every option stays on offer.
                filter={(option: string, query: string) =>
                    options.includes(query) || option.toLowerCase().includes(query.trim().toLowerCase())
                }
            >
                <AutocompleteInput
                    id={id}
                    placeholder={placeholder}
                    triggerLabel={`Show ${label.toLowerCase()} options`}
                    aria-description="Shift+Delete forgets the highlighted option."
                    onKeyDown={(event) => {
                        if (event.key === "Delete" && event.shiftKey && highlighted !== undefined) {
                            event.preventDefault();
                            onRemoveOption(highlighted);
                        }
                    }}
                >
                    {isNew && (
                        <InputGroupAddon align="inline-end">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <PlusIcon />
                                New
                            </span>
                        </InputGroupAddon>
                    )}
                </AutocompleteInput>
                <AutocompleteContent>
                    <AutocompleteList>
                        {(option: string) => (
                            <AutocompleteItem key={option} value={option} className="group/option">
                                <CheckIcon
                                    aria-hidden="true"
                                    className={cn("size-4 shrink-0", option !== value && "invisible")}
                                />
                                <span className="min-w-0 flex-1 truncate">{option}</span>
                                {/* Mouse shortcut only, kept out of the option's accessible tree; keyboard users have Shift+Delete. */}
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                    title={`Forget ${option}`}
                                    className="opacity-0 group-hover/option:opacity-100 group-data-highlighted/option:opacity-100"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onRemoveOption(option);
                                    }}
                                >
                                    <XIcon />
                                </Button>
                            </AutocompleteItem>
                        )}
                    </AutocompleteList>
                </AutocompleteContent>
            </Autocomplete>
        </div>
    );
}
