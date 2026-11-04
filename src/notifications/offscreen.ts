import { listenForMessages } from "../util/messaging";
import { playNotificationSound } from "./play-sound";

listenForMessages({
    playSound: ({ isFailed }) => playNotificationSound(isFailed),
});
