// Shared Tailwind class lists for the options page. Each entry is a complete class list, so Tailwind's
// scanner finds every class in this file; components combine whole entries and never join fragments.

/** Accent-filled button for Add, Test and Choose file. */
export const primaryButtonClass =
    "bg-rta-accent text-rta-green-dark border-none rounded-lg py-1 px-3 font-medium cursor-pointer";

/** Text field with the WebUI form's padding. */
export const inputClass = "text-[15px] rounded-lg py-1.5 px-3 border border-rta-border bg-rta-input-bg text-rta-text";

/** Text field with the compact padding of the auto label/dir rule editor. */
export const compactInputClass =
    "text-[15px] rounded-lg py-1 px-2.5 border border-rta-border bg-rta-input-bg text-rta-text";

/** Monospace text field for labels, directories and magnet links. */
export const monoInputClass =
    "font-[monospace] text-[15px] border border-rta-border bg-rta-input-bg text-rta-text rounded-lg py-1 px-2.5";

/** A label or directory shown as a chip. */
export const chipClass =
    "inline-flex items-center bg-rta-chip-bg border border-rta-chip-border rounded-2xl py-1 px-3 font-[monospace] text-[15px]";

/** The borderless entry field at the end of a chip list. */
export const chipInputClass =
    "font-[monospace] text-[15px] border-none outline-none bg-rta-input-bg text-rta-text rounded-lg py-0.5 px-2 mr-1";
