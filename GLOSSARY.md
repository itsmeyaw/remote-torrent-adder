# Remote Torrent Adder

A browser extension that catches torrent links on web pages and adds them straight to a user's remote BitTorrent clients, so nothing has to be downloaded and opened locally.

## Language

### Torrents

**Torrent**:
One thing the user wants downloaded, either as a Torrent File or a Magnet Link, plus what could be read from it.
_Avoid_: Download, item, link

**Torrent File**:
A `.torrent` file fetched from the page's site, carrying the Declared Name, Trackers, file list and Private flag.
_Avoid_: Torrent blob, metafile

**Magnet Link**:
A `magnet:` URI identifying a torrent by Info Hash, optionally with a Declared Name and Trackers; it has no file list.
_Avoid_: Magnet URL, magnet URI

**Declared Name**:
The name the torrent gives itself (the Torrent File's name field or the Magnet Link's display name), as opposed to a name guessed from the link.
_Avoid_: Title, file name

**Info Hash**:
The identifier a Client uses for a torrent once it is added.
_Avoid_: Hash, torrent ID

**Tracker**:
An announce URL the torrent lists.
_Avoid_: Announce, announcer

**Private Torrent**:
A torrent flagged to be shared only through its own Trackers.

### Destinations

**Client**:
A kind of BitTorrent software the extension can talk to, such as qBittorrent or Transmission.
_Avoid_: Server, backend, client type

**Client Identifier**:
The fixed short name under which a Client is stored, never changed after release and separate from the name the user sees.
_Avoid_: Client name, client label

**WebUI**:
One configured connection to a running Client: where it is, how to log in, and its add preferences.
_Avoid_: Server, client (for the configured instance), remote, instance

**Primary WebUI**:
The first WebUI in the user's list, used whenever a link is added without picking a target.
_Avoid_: Default WebUI, main client, primary client

**Connection Test**:
A check of whether a WebUI can be reached and, where the Client allows it, whether its credentials are accepted.

### Placement

**Label**:
A tag that groups a torrent inside its Client.
_Avoid_: Category, tag

**Directory**:
The location on the Client's machine where a torrent's data is saved.
_Avoid_: Dir, save path, download location, folder

**Add Paused**:
Adding a torrent without starting it.
_Avoid_: Start stopped, paused mode

**Default Label** / **Default Directory**:
The Label or Directory a WebUI applies when nothing more specific was chosen or matched.

**Label List** / **Directory List**:
The Labels or Directories a WebUI remembers and offers in the Config Selector.
_Avoid_: Presets, history

**Client-Specific Setting**:
An on/off option that only one Client supports, set per WebUI.

**Per-Torrent Setting**:
A Client-Specific Setting that can also be changed for a single torrent in the Config Selector.

**Upload Config**:
The Label, Directory, Add Paused choice and Per-Torrent Settings that go with one torrent when it is added.
_Avoid_: Torrent options, add options

### Auto Label/Dir

**Auto Label/Dir Rule**:
A WebUI rule that picks a Label and/or Directory for a torrent when all of its Criteria match.
_Avoid_: Filter, auto rule

**Criterion**:
One pattern that a Tracker URL, a file path or the Declared Name must match for its rule to apply.
_Avoid_: Condition, matcher

**Winning Rule**:
The first Auto Label/Dir Rule, in list order, whose Criteria all match; later matching rules are ignored.

### Adding

**Add**:
Handing a torrent to a WebUI so its Client starts managing it.
_Avoid_: Send, upload, push

**Link Catching**:
Intercepting clicks on links that look like torrents and adding them instead of letting the browser follow them.
_Avoid_: Link interception, hijacking

**Link Catching Pattern**:
A user-editable pattern that decides which non-magnet links count as torrent links.
_Avoid_: Link regex, link filter

**Config Selector**:
The prompt shown before adding, where the user reviews one torrent and picks its Upload Config for an already chosen WebUI.
_Avoid_: Label/dir chooser, popup, per-torrent config selector

**Buffered Torrent**:
A torrent that has already been fetched and is waiting for the user to finish the Config Selector.
_Avoid_: Pending torrent, cached torrent

**Send to All**:
Adding one link to every configured WebUI at once, without a Config Selector.
_Avoid_: Broadcast

**Page Links**:
The list of torrent links found on the current page, from which the user can add any one.

**Icon Click Action**:
What clicking the extension's toolbar icon does: open the Primary WebUI, pick a WebUI to open, or show the Page Links.

**Set Label**:
Assigning a Label to a torrent after it has been added, from the success notification.
_Avoid_: Relabel, label button

**Cloudflare Challenge**:
A site's bot check that answered instead of the Torrent File; the user has to pass it in a tab before the torrent can be fetched.
