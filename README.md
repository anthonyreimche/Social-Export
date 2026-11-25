# Social Export for Safelight

Share your photos at the right size and shape for each social network:

- **Post straight from Safelight** to Bluesky, Mastodon and Pixelfed, with
  your text and alt text for each photo.
- **Save ready-to-upload files** for Instagram, Facebook, X and Threads, then
  open the site.

## Sharing

Right-click photos in the Library and choose **Share…**, or click the
**Share** button in the top bar. The top-bar button shares the selected
photos, or the photo open in Develop.

Pick a **Destination**, then:

- **Post:** for Bluesky, Mastodon and Pixelfed. Sign in once (see below),
  write the post, check each photo's alt text, and post. **Open post** shows
  it in your browser.
- **Save and open:** for Instagram, Facebook, X and Threads. Saves the files
  into your folder for shared photos, which you choose the first time, and
  shows them in your file manager. It then opens the site, where you upload
  them.
- **Save:** saves the files without opening the site.
- **Copy:** puts one photo, sized for the destination, on the clipboard, to
  paste into any post.

Files are sRGB JPEGs with no metadata, since the services strip it anyway.
They are rendered from your edits with your export sharpening and any export
add-ons, such as a watermark. They are made as small as each service needs,
so it recompresses them less.

| Destination | Shape | Size |
|---|---|---|
| Instagram: its own shape | 4:5 to 1.91:1 | 1080 wide |
| Instagram: portrait 4:5, square, story 9:16 | fixed | 1080 wide |
| Facebook | any | 2048 on the long edge |
| X | any | 4096 on the long edge, under 5 MB |
| Threads | any | 1440 on the long edge |
| Bluesky | any | 2000 on the long edge, under 2 MB, up to 4 photos |
| Mastodon, Pixelfed | any | your server's limits |

**Shapes:** when a photo's shape isn't one the destination shows,
**Border** keeps the whole photo inside a white, grey or black border, and
**Crop** fills the frame from the photo's centre.

## Signing in

- **Bluesky:** your handle and an **app password**. Make one in Bluesky ▸
  Settings ▸ Privacy and security ▸ App passwords; **Make an app password**
  opens that page. An app password can post for you but can't change your
  account. If your account is hosted somewhere other than Bluesky, change
  the hosting provider.
- **Mastodon and Pixelfed:** type your server (`mastodon.social`,
  `@you@pixelfed.social` or its address), allow Safelight to reach it, and
  approve Safelight on the sign-in page your browser opens.

Sign-ins are kept encrypted by your computer's keychain: Windows' protected
storage, the macOS Keychain, or the Secret Service or KWallet on Linux. They
are never kept in plain text. On a Linux computer without a keychain, a
sign-in lasts until Safelight closes. **Sign out** forgets it.

Needs Safelight 3.2.7 or later.

## Coming next

Posting straight to Instagram, Facebook, X and Threads.

## Developing

```
npm ci
npm run check   # typecheck, build, tests
```

Licensed under the GNU GPL v3 or later.
