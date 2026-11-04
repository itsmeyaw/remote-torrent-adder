import { z } from "zod/mini";
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

const SerializedRegExpSchema = z.object({
    __type: z.literal("RegExp"),
    source: z.string(),
    flags: z.string(),
});

export type SerializedRegExp = z.infer<typeof SerializedRegExpSchema>;

export function isSerializedRegExp(value: unknown): value is SerializedRegExp {
    return SerializedRegExpSchema.safeParse(value).success;
}

function customReviver(_key: string, value: unknown): unknown {
    if (isSerializedRegExp(value)) {
        return new RegExp(value.source, value.flags);
    }
    return value;
}
