import { ClientClassByClient, type Client } from "../../../models/clients";

export const MIN_PORT = 1;
export const MAX_PORT = 65535;

export function parsePortInput(raw: string): number | null {
    const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
    if (digits === "") {
        return null;
    }
    return Math.min(Number(digits), MAX_PORT);
}

export function isClientSelected(client: Client | ""): client is Client {
    return !!client && client in ClientClassByClient;
}
