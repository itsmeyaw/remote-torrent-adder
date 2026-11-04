import { afterEach, beforeEach, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createChromeMock } from "./helpers/chrome-mock";

// A fresh chrome mock, clean fetch stub and empty IndexedDB before every test,
// so listener registrations, stored settings and buffered torrents never bleed
// across test boundaries. A brand-new IDBFactory is how fake-indexeddb is reset:
// it drops every database the previous test created.
beforeEach(() => {
    (globalThis as any).chrome = createChromeMock();
    (globalThis as any).fetch = vi.fn();
    (globalThis as any).indexedDB = new IDBFactory();
    (globalThis as any).IDBKeyRange = IDBKeyRange;
});

// jsdom has no Web Locks API; this one grants each lock name to one holder at a time, in request order.
function createLocksMock(): Pick<LockManager, "request"> {
    const tails = new Map<string, Promise<unknown>>();
    return {
        request: ((name: string, callback: () => unknown) => {
            const run = (tails.get(name) ?? Promise.resolve()).then(() => callback());
            tails.set(
                name,
                run.catch(() => undefined),
            );
            return run;
        }) as LockManager["request"],
    };
}

beforeEach(() => {
    Object.defineProperty(navigator, "locks", { value: createLocksMock(), configurable: true });
});

// Unmount anything a component test rendered, so the next test starts on an
// empty document and queries cannot match a leftover tree.
afterEach(() => {
    cleanup();
});
