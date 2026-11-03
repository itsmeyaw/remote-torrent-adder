import { describe, it, expect } from "vitest";
import {
    serializeSettings,
    deserializeSettings,
    serializeObject,
    deserializeObject,
} from "../../src/settings/serializer";
import { type RTASettings } from "../../src/models/settings";
import { at } from "../helpers/assert";

describe("serializeObject / deserializeObject", () => {
    it("preserves RegExp values across a round-trip", () => {
        const obj = { pattern: /foo.*bar/gi, plain: "x" };
        const restored = deserializeObject<typeof obj>(serializeObject(obj))!;
        expect(restored.pattern).toBeInstanceOf(RegExp);
        expect(restored.pattern.source).toBe("foo.*bar");
        expect(restored.pattern.flags).toBe("gi");
        expect(restored.plain).toBe("x");
    });

    it("returns null when deserializing an empty string", () => {
        expect(deserializeObject("")).toBeNull();
    });

    it("round-trips nested plain objects", () => {
        const obj = { a: 1, b: { c: [1, 2, 3] } };
        expect(deserializeObject(serializeObject(obj))).toEqual(obj);
    });
});

describe("serializeSettings / deserializeSettings", () => {
    it("round-trips settings including link-catching regexes", () => {
        const settings: RTASettings = {
            notificationsEnabled: true,
            notificationsDurationMs: 2000,
            notificationsSoundEnabled: false,
            notificationsLabelButtonEnabled: true,
            linkCatchingEnabled: true,
            linkCatchingRegexes: [/\.torrent\b/, /action=download/],
            iconClickAction: "openPrimaryWebUi",
            webuiSettings: [],
        };
        const restored = deserializeSettings(serializeSettings(settings))!;
        expect(restored.notificationsDurationMs).toBe(2000);
        expect(restored.linkCatchingRegexes[0]).toBeInstanceOf(RegExp);
        expect(at(restored.linkCatchingRegexes, 0).source).toBe("\\.torrent\\b");
        expect(at(restored.linkCatchingRegexes, 1).source).toBe("action=download");
    });

    it("returns null for empty input", () => {
        expect(deserializeSettings("")).toBeNull();
    });
});
