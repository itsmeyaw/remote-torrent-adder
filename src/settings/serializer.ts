import { type RTASettings } from "../models/settings";

export function serializeSettings(settings: RTASettings): string {
    return serializeObject(settings);
}

export function deserializeSettings(serialized: string): RTASettings | null {
    return deserializeObject<RTASettings>(serialized);
}

export function serializeObject<T>(obj: T): string {
    return JSON.stringify(obj, customReplacer);
}

export function deserializeObject<T>(serialized: string): T | null {
    if (!serialized) {
        return null;
    }
    return JSON.parse(serialized, customReviver) as T;
}

function customReplacer(_key: string, value: unknown): unknown {
    if (value instanceof RegExp) {
        return { __type: "RegExp", source: value.source, flags: value.flags };
    }
    return value;
}

export interface SerializedRegExp {
    __type: "RegExp";
    source: string;
    flags: string;
}

export function isSerializedRegExp(value: unknown): value is SerializedRegExp {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { __type?: unknown }).__type === "RegExp" &&
        typeof (value as { source?: unknown }).source === "string" &&
        typeof (value as { flags?: unknown }).flags === "string"
    );
}

function customReviver(_key: string, value: unknown): unknown {
    if (isSerializedRegExp(value)) {
        return new RegExp(value.source, value.flags);
    }
    return value;
}
