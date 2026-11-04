import { ExternalLinkIcon } from "lucide-react";

const headingClass = "text-base font-semibold";
const subheadingClass = "text-sm font-semibold";
const paragraphClass = "max-w-prose text-sm leading-relaxed text-foreground/80";

export default function AboutPage() {
    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-2">
                <h2 className={headingClass}>About Remote Torrent Adder</h2>
                <p className={paragraphClass}>
                    This extension allows you to automatically add torrents to your torrent client without having to
                    download a torrent file and opening your torrent client.
                </p>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className={headingClass}>RTA v2 (Manifest V3)</h2>
                <p className={paragraphClass}>
                    A lot of things have changed with Chrome&apos;s insistence on Manifest V3. This has prompted a
                    complete rewrite of this project. Some features were removed, others were improved, some new stuff
                    was added. I&apos;ve tried to migrate old configurations, but it&apos;s a good possibility that some
                    things don&apos;t work. Should you see problems after migration to RTA v2.x from RTA v1.x, please
                    reinstall the extension and reconfigure it. If you&apos;re faced with bugs or problems on a clean
                    install, file an issue at the GitHub repo below.
                </p>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className={headingClass}>Support, Source, Contact</h2>
                <p className={paragraphClass}>
                    Take a look at the GitHub repository:{" "}
                    <a
                        href="https://github.com/bogenpirat/remote-torrent-adder"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
                    >
                        https://github.com/bogenpirat/remote-torrent-adder
                        <ExternalLinkIcon className="size-3.5" />
                    </a>
                </p>
            </section>

            <section className="flex flex-col gap-6">
                <h2 className={headingClass}>Settings</h2>
                <div className="flex flex-col gap-2">
                    <h3 className={subheadingClass}>Primary Client</h3>
                    <p className={paragraphClass}>
                        The first WebUI in the list is the primary client: it is the one used when you just left-click a
                        recognized torrent link. Drag a WebUI to the top, or use its Make primary button.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <h3 className={subheadingClass}>Relative Path</h3>
                    <p className={paragraphClass}>
                        Should be optional for some clients, but is available for all of them in case you use a reverse
                        proxy.
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <h3 className={subheadingClass}>Auto Label/Dir Settings</h3>
                    <p className={paragraphClass}>
                        This feature allows you to automatically assign labels and destination directories based on the
                        contents of a torrent. Each rule can combine three kinds of criteria: <em>Tracker URL</em>,
                        matched against every tracker announced by the torrent; <em>File in torrent</em>, matched
                        against the full relative path of every file it contains; and <em>Torrent name</em>, matched
                        against the name the torrent declares. A sub-string works, but every criterion is evaluated as a
                        regular expression.
                    </p>
                    <p className={paragraphClass}>
                        All criteria of a rule must match for it to apply, and the first matching rule wins. File
                        criteria are matched case-insensitively. Magnet links announce their trackers, so tracker
                        criteria apply to them as well; they carry no file list until the torrent is fetched by the
                        client, so file criteria never match a magnet link.
                    </p>
                    <p className={paragraphClass}>
                        To check your rules without adding anything anywhere, use <em>Test these rules</em> below the
                        rule list: drop a .torrent file onto it or paste a magnet link, and it will show you the
                        resulting label and directory along with exactly which criterion matched what. Everything is
                        evaluated locally in your browser.
                    </p>
                </div>
            </section>
        </div>
    );
}
