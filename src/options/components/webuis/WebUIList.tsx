import { useEffect, useState } from "react";
import { GripVerticalIcon, PlusIcon } from "lucide-react";
import { ClientDisplayName } from "../../../models/clients";
import type { WebUISettings } from "../../../models/webui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isClientSelected } from "./webui-helpers";

type DropIndicator = "above" | "below" | null;

interface WebUIListProps {
    webuis: WebUISettings[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onMove: (from: number, to: number) => void;
}

export default function WebUIList({ webuis, selectedId, onSelect, onAdd, onMove }: WebUIListProps) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);

    const clearDrag = () => {
        setDragIndex(null);
        setOverIndex(null);
    };
    const handleDrop = () => {
        if (dragIndex !== null && overIndex !== null) onMove(dragIndex, overIndex);
        clearDrag();
    };
    const dropIndicatorFor = (idx: number): DropIndicator => {
        if (dragIndex === null || overIndex !== idx || dragIndex === idx) return null;
        return dragIndex > idx ? "above" : "below";
    };

    return (
        <div className="sticky top-6 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">WebUIs</span>
                <Button variant="ghost" size="icon-sm" aria-label="Add new WebUI" onClick={onAdd}>
                    <PlusIcon />
                </Button>
            </div>
            {webuis.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No WebUIs yet. Click + to add one.</p>
            ) : (
                <div className="flex flex-col gap-0.5">
                    {webuis.map((webui, idx) => (
                        <WebUIListItem
                            key={webui.id}
                            webui={webui}
                            index={idx}
                            selected={webui.id === selectedId}
                            isPrimary={idx === 0}
                            isDragging={dragIndex === idx}
                            dropIndicator={dropIndicatorFor(idx)}
                            onSelect={() => onSelect(webui.id)}
                            onMove={onMove}
                            onDragStart={() => setDragIndex(idx)}
                            onDragOver={() => setOverIndex(idx)}
                            onDragEnd={clearDrag}
                            onDrop={handleDrop}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface WebUIListItemProps {
    webui: WebUISettings;
    index: number;
    selected: boolean;
    isPrimary: boolean;
    isDragging: boolean;
    dropIndicator: DropIndicator;
    onSelect: () => void;
    onMove: (from: number, to: number) => void;
    onDragStart: () => void;
    onDragOver: () => void;
    onDragEnd: () => void;
    onDrop: () => void;
}

function WebUIListItem({
    webui,
    index,
    selected,
    isPrimary,
    isDragging,
    dropIndicator,
    onSelect,
    onMove,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
}: WebUIListItemProps) {
    const name = webui.name || "Unnamed WebUI";
    const subtitle = isClientSelected(webui.client) ? ClientDisplayName[webui.client] : "No client selected";
    // Only the handle arms dragging, so the row itself stays a plain click target.
    const [dragArmed, setDragArmed] = useState(false);

    useEffect(() => {
        if (!dragArmed || isDragging) return;
        const disarm = () => setDragArmed(false);
        window.addEventListener("pointerup", disarm);
        window.addEventListener("pointercancel", disarm);
        return () => {
            window.removeEventListener("pointerup", disarm);
            window.removeEventListener("pointercancel", disarm);
        };
    }, [dragArmed, isDragging]);

    return (
        <div
            onClick={onSelect}
            draggable={dragArmed}
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", webui.id);
                onDragStart();
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                onDragOver();
            }}
            onDrop={(e) => {
                e.preventDefault();
                onDrop();
            }}
            onDragEnd={() => {
                setDragArmed(false);
                onDragEnd();
            }}
            className={cn(
                "relative flex cursor-pointer items-center gap-1 rounded-xl px-1.5 py-2 transition-colors",
                selected ? "bg-muted" : "hover:bg-muted/60",
                isDragging && "opacity-40",
            )}
        >
            {dropIndicator && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute inset-x-2 h-0.5 rounded-full bg-primary",
                        dropIndicator === "above" ? "top-0" : "bottom-0",
                    )}
                />
            )}
            <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Reorder ${name}`}
                title="Drag to reorder (or use the arrow keys)"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={() => setDragArmed(true)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                        e.preventDefault();
                        onMove(index, index - 1);
                    } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        onMove(index, index + 1);
                    }
                }}
                className="cursor-grab touch-none text-muted-foreground"
            >
                <GripVerticalIcon />
            </Button>
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                className="flex min-w-0 flex-1 flex-col items-start text-left"
            >
                <span className={cn("w-full truncate text-sm font-medium", !webui.name && "text-muted-foreground")}>
                    {name}
                </span>
                <span className="w-full truncate text-xs text-muted-foreground">{subtitle}</span>
            </button>
            {isPrimary && (
                <Badge variant="outline" className="shrink-0">
                    Primary
                </Badge>
            )}
        </div>
    );
}
