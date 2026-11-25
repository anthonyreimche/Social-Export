# Social Export — behaviour (1.0.0)

Issue: anthonyreimche/SafeLight#213, "Export to Instagram, Facebook, X, etc."

## What it is

A **Share** window. It opens from the Library right-click menu ("Share…") and
from a top-bar button. It acts on the photos it was opened for: the ones
right-clicked, else the selection, else the photo open in Develop.

You pick a destination, and the window makes the photos the right size, shape
and file size for it. Then:

- **Bluesky, Mastodon and Pixelfed:** **Post** sends them straight there, with
  your text and each photo's alt text.
- **Instagram, Facebook, X and Threads:** **Save and open** writes the files
  into a folder you chose once, shows them in the file manager, and opens the
  site in your browser. Those services gate posting through their APIs: app
  review, paid tiers, public image hosting. Direct posting to them is 1.1.0.
- **Copy** puts one photo on the clipboard, for pasting into any composer.
- **Save** writes the files and nothing else.

minAppVersion 3.2.7, for the network, secrets, kept-folder, window and
top-bar seams. `ui.notify` arrives in 3.2.8; before that, the window's own
status line reports progress and results. The typings in `src/safelight.d.ts`
are the 3.2.7 release's, so the typecheck catches anything newer.

## Destinations

| id | Shape | Size | File limit |
|---|---|---|---|
| instagram | 4:5 to 1.91:1, outside that fitted to the nearest | 1080 wide | 8 MB |
| instagram-portrait | 4:5 frame | 1080 × 1350 | 8 MB |
| instagram-square | 1:1 frame | 1080 × 1080 | 8 MB |
| instagram-story | 9:16 frame (Stories, Reels) | 1080 × 1920 | 8 MB |
| facebook | any | 2048 long edge | 8 MB |
| x | any | 4096 long edge | 5 MB |
| threads | any | 1440 long edge | 8 MB |
| bluesky | any | 2000 long edge | 2,000,000 bytes, 4 photos, 300 characters |
| mastodon | any | the instance's pixel limit (default 3840 long, 8.3 MP) | the instance's (default 16 MB) |
| pixelfed | any | 2048 long edge, or the instance's | the instance's (default 15 MB) |

**Shape:** when the photo's aspect is outside the destination's range, the
**Fit** setting decides what happens:

- **Border**, the default, keeps the whole photo and fills the rest of the
  frame with the border colour (white, black or grey).
- **Crop** fills the frame from the photo's centre.

A photo within the range keeps its own shape.

**Size:** a photo is never enlarged past the size it renders at.

**Files:** JPEG in sRGB, with no metadata, since the services strip it anyway.
Encoding starts at quality 0.92 and steps down to 0.6 until the file fits the
limit. If it still doesn't fit, the image shrinks by the square root of the
overshoot, less 5%, and the steps run again.

**Rendering:** `api.export.renderPhotos` renders through the person's own
edits, with their export sharpening, as PNG at the frame's long side. When
the plan needs more pixels than that render has, it renders again at the size
needed. It also renders again when the plan needs under three quarters of
them, so sharpening isn't lost to a big downscale. Smaller downscales draw on
a canvas with high-quality smoothing.

## Posting

**Text:** one text for the post. A counter shows what the service allows:
graphemes for Bluesky, characters for the others. The text is required on none
of them.

**Alt text:** each photo has its own, prefilled from the catalogue's
description (`exif.imageDescription`). Bluesky and Mastodon show it to screen
readers.

**Limits:**

- Bluesky takes 4 photos a post.
- Mastodon and Pixelfed take the instance's `max_media_attachments` (default 4).
- More photos than that refuses the post, with the reason, before anything is
  sent.

### Bluesky

Sign-in takes a handle or email and an **app password** (Settings ▸ Privacy
and security ▸ App passwords), against a hosting provider (default
`https://bsky.social`).

1. `com.atproto.server.createSession` at the provider.
2. The didDoc's `#atproto_pds` service is the PDS, which takes later calls.
   bsky-hosted PDSes (`*.host.bsky.network`) are declared in the manifest.
   Another one is asked for through `network.requestAccess`.

The `refreshJwt` is kept in `api.secrets`; the handle, DID and PDS are kept in
settings. A post runs:

1. `uploadBlob` for each image.
2. `createRecord` of an `app.bsky.feed.post` with `app.bsky.embed.images`,
   carrying each image's alt text and `aspectRatio`. Its facets mark links
   (`https://…`) and hashtags (`#word`) at UTF-8 byte offsets.

An `ExpiredToken` answer refreshes once with the refresh token. A refusal
then signs out.

### Mastodon and Pixelfed (Mastodon API)

1. The instance address is typed in and allowed (`permissions.userOrigins`,
   `network.requestAccess`). It must be https.
2. `POST /api/v1/apps` registers the redirect `http://127.0.0.1`. Mastodon's
   Doorkeeper and Pixelfed's Passport both ignore a loopback redirect's port
   (RFC 8252 §7.3). Checked in Doorkeeper's and league/oauth2-server 9.x's
   source; not yet tried against a live instance.
3. `network.authorizeInBrowser` runs `/oauth/authorize` with PKCE (S256) and a
   random state, and the state is checked.
4. `/oauth/token` exchanges the code, and `/api/v1/accounts/verify_credentials`
   names the account.

Scopes:

- Mastodon: `read:accounts write:media write:statuses`.
- Pixelfed: `read write`.

The client id and secret and the access token are kept in `api.secrets`; the
instance and account name are kept in settings.

Limits come from `GET /api/v2/instance`, then `/api/v1/instance`, else the
defaults above.

A post runs:

1. `POST /api/v2/media` (multipart: file and description), falling back to
   `/api/v1/media` on 404. A 202 is polled at `GET /api/v1/media/:id` until it
   has a `url`, for at most 30 s.
2. `POST /api/v1/statuses` with `media_ids`, `visibility` (Public, Unlisted,
   Followers) and `sensitive`, plus `spoiler_text` for an optional content
   warning, under an `Idempotency-Key`.

A 401 signs out with "sign in again".

### Results

Progress and results are shown with `ui.notify`. A finished post offers its
link (its `url`, or the bsky.app address made from the record's rkey).

## Saving

The folder is picked once with `project.pickKeptDirectory`, and its token is
kept in settings. **Change folder** picks another.

Files are named `<photo base name>_<destination>.jpg`. A name already in the
folder gets " (2)", " (3)" and so on, so nothing is overwritten. The folder's
names are listed once (`keys()`), compared without case: core's desktop folder
handle answers `getFileHandle` for a name that isn't there, so probing
doesn't work.

**Save and open** then:

- shows the first file in the file manager (`project.reveal`);
- opens the site's upload page: instagram.com, facebook.com, x.com/compose/post
  or threads.net.

## Not in 1.0.0

- Direct posting to Instagram, Facebook, X and Threads (1.1.0).
- Video, scheduling, several accounts per service, Bluesky OAuth.
