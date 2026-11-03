
export interface Torrent {
    data: Blob | string;
    name: string;
    declaredName?: string;
    isMagnet: boolean;
    trackers?: string[];
    files?: string[];
    isPrivate?: boolean;
}

export interface TorrentUploadConfig {
    dir?: string;
    label?: string;
    addPaused?: boolean;
    clientSpecificSettings?: Record<string, boolean>;
}
