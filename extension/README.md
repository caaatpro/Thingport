# Thingport Grab

A browser extension for Chrome, Edge and Firefox that imports MakerWorld, Thingiverse, and
Printables models into your self-hosted Thingport instance without leaving the provider's site.
Visiting a model, collection, or Thingiverse Likes page shows a floating Thingport icon; clicking it
opens a small panel to pick what to import (and, for a single model, an optional destination
collection), then imports it the same way Thingport's own "+ Add > Import" does.

It's useful without Thingport too: on MakerWorld model pages it adds a **Download normalized**
button that turns the Bambu Studio project into a 3MF that PrusaSlicer, Cura and other slicers open
with its colors and print settings intact. See [Download normalized](#download-normalized-no-thingport-needed).

**Get it from your Thingport instance's Downloads page.**

It talks directly to your Thingport instance's API from the extension's background script -- no
separate server, no data sent anywhere else -- and converts files in your browser. See the [privacy policy](PRIVACY.md) for exactly what
it stores and sends.

## Screenshots

<table>
  <tr>
    <td width="50%"><a href="docs/screenshots/panel-printables.jpg"><img src="docs/screenshots/panel-printables.jpg" alt="Import panel on a Printables model page"></a><br><sub><b>Printables</b> -- import panel on a model page</sub></td>
    <td width="50%"><a href="docs/screenshots/imported-printables.jpg"><img src="docs/screenshots/imported-printables.jpg" alt="Import finished, with an Open in Thingport button"></a><br><sub><b>Imported</b> -- with a link straight to the model in Thingport</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/screenshots/panel-makerworld.jpg"><img src="docs/screenshots/panel-makerworld.jpg" alt="Import panel on a MakerWorld model page"></a><br><sub><b>MakerWorld</b> -- import panel on a model page</sub></td>
    <td width="50%"><a href="docs/screenshots/panel-thingiverse.jpg"><img src="docs/screenshots/panel-thingiverse.jpg" alt="Import panel on a Thingiverse thing page"></a><br><sub><b>Thingiverse</b> -- import panel on a thing page</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/screenshots/setup-dialog-makerworld.jpg"><img src="docs/screenshots/setup-dialog-makerworld.jpg" alt="Setup dialog opened from the grayed-out icon"></a><br><sub><b>Not set up yet</b> -- the grayed-out icon's setup dialog</sub></td>
    <td width="50%"></td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/popup-setup.png" alt="Popup before setup"><br><sub><b>Popup</b> -- before setup</sub></td>
    <td width="33%"><img src="docs/screenshots/popup-connected.png" alt="Popup when connected, with recent imports"><br><sub><b>Popup</b> -- connected, with recent imports</sub></td>
    <td width="33%"><img src="docs/screenshots/popup-connected-dark.png" alt="Popup in dark mode"><br><sub><b>Popup</b> -- dark mode</sub></td>
  </tr>
</table>

## Install

Your Thingport instance serves the extension itself: open **Downloads** in the sidebar and download the
Chromium build (`thingport-grab-chrome.zip`). Neither the extension nor the instance talk to any browser store.

### Chrome, Edge and other Chromium browsers

1. Unzip the download somewhere permanent (the browser loads the extension from that folder every time it
   starts, so don't delete it).
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Click the new Thingport icon in your toolbar (it may be under the puzzle-piece Extensions button) and
   enter your instance's URL and your Thingport login or API token.

A hand-installed copy doesn't update itself -- repeat these steps for a newer version.

### Firefox

Firefox refuses to install _any_ unsigned extension outside of Developer Edition/Nightly. Use the `.xpi` built by
the release workflow (see [Releases](CONTRIBUTING.md#releases-ci)), open it in Firefox (double-click, or
`File > Open File`) and confirm the install prompt.

## Download normalized (no Thingport needed)

MakerWorld's files are Bambu Studio projects, which PrusaSlicer, Cura, Anycubic Slicer Next,
Creality Print, Elegoo Slicer and Snapmaker Orca often open without their colors or print settings.
On a MakerWorld model page, the extension adds a **Download normalized** button under MakerWorld's
own "Open in Bambu Studio" (or Download) button. Clicking it downloads the selected print profile's file, converts it, and saves
a `<name>-normalized.3mf` that keeps painted colors, filament colors, plates and the designer's
settings (walls, layer height, infill, supports). Multi-part objects may be merged into one,
per-object overrides and layer color changes are dropped, and you pick your own printer profile.
Hover the bulb on the button for the same summary.

- **Who sees it:** everyone who hasn't connected the extension to a Thingport instance, and people
  who have, when their Thingport profile's slicer is one of those above (with Bambu Studio or
  OrcaSlicer picked, the original file is the right one, so the button stays hidden).
- **Where it runs:** entirely in your browser, the same conversion Thingport's "Open normalized"
  does on the server. The file goes nowhere but your downloads folder.
- **Limits:** you need to be signed in to MakerWorld, as for its own Download button, and files over
  50 MB are too big to convert in the browser -- the button says so. MakerWorld's button is found by
  its label, so it only appears while MakerWorld is in English.

## Setup

The popup asks for your instance URL (e.g. `https://thingport.example.com`) and an **API token**.
Create the token in Thingport under **Profile → API tokens**, then paste it into the popup. The
extension never sees your account password. Until that's done, importable pages show a grayed-out
Thingport icon; clicking it explains what's needed and opens that same setup form (the toolbar
popup, or the same form in a tab where the browser won't let the extension open its popup itself).
Saving requests permission to reach that one origin and checks the token against your instance
before storing anything. After that, the toolbar icon turns from the dark/inactive icon to the
color/active one, and the floating icon becomes the normal import button. Reopen the popup any time
to change the instance (the pencil next to its address), flip **Extension enabled** off to pause it
without losing the saved setup, or **Disconnect** to forget the instance and token.

A token is **scoped and revocable**. It can only do what the extension needs -- import models, file
them into collections, and a few reads -- and cannot edit or delete models, change your account or
manage tokens. Revoke it from the same Profile page at any time; the extension then shows a
"reconnect" notice and stops working until you paste a new one. Tokens can also be given an expiry.

Plain `http://` is only accepted for `localhost` and private-network addresses (e.g. a home server
on `192.168.x.x`); anywhere else the instance must use `https://`, because the token and your
MakerWorld session travel to it.

Upgrading from a version that signed in with an email and password? The old password is deleted from
the extension's storage on update, the instance address is kept, and you only need to paste a token.

### After connecting: importing a model

Open a model page on MakerWorld, Printables or Thingiverse. A round Thingport button appears in the
bottom-right corner of the page; click it, optionally pick a collection, and press **Import**.

You can also do it from the toolbar popup: when the tab you're looking at is a model (or collection)
page, the popup shows an **Import this model** button that opens the same panel on the page. This
also works on a tab that was already open when you installed the extension, which browsers don't
attach content scripts to until the next reload -- the extension attaches itself on demand. On any
other page the popup shows links to the three sites.

If a model is already in your library, the button stays visible with a check mark and opens a link to
it, rather than disappearing.

### MakerWorld: no separate cookie setup needed

Importing from MakerWorld normally requires pasting a session cookie into Thingport's Profile
settings by hand (MakerWorld's own site sets it `HttpOnly`, which blocks a normal web page from
reading it -- that's the whole reason for the manual copy/paste). This extension reads that same
cookie directly from your browser instead, using the `cookies` API -- a privileged, extension-only
capability explicitly allowed to read `HttpOnly` cookies, unlike a regular page's own JavaScript.
It's sent only to your own Thingport instance, as part of the same import request that needs it,
exactly like the cookie you'd otherwise paste in by hand -- never anywhere else. If you'd rather
keep it in the browser, turn off **Share my MakerWorld session** in the popup. If your Thingport
account doesn't already have a MakerWorld cookie saved, the extension also pushes this one to
Profile > MakerWorld for you, so the plain web app's own imports benefit too, not just ones started
from the extension.

## What counts as "importable"

- A single model page (MakerWorld, a Thingiverse Thing, a Printables Model) -- hidden automatically
  once you've already imported that exact page.
- A MakerWorld collection, a Thingiverse Collection or Likes page, or a Printables collection --
  lets you import the listed designs in one go.

Picking a destination collection is only offered for a single-model import; a batch import instead
lands in Thingport's own auto-named collection for that batch (e.g. "Thingiverse Likes"), matching
how the web app's own batch imports already work.

A batch import keeps running on the server even if you close the panel or the tab -- closing it
just stops showing progress, it doesn't cancel anything.

## Privacy

Thingport Grab has no servers of its own and sends nothing to its developer or any third party --
only to your own Thingport instance and the provider site you're on. The
**[privacy policy](PRIVACY.md)** lists exactly what it stores, what it sends and where.

## Contributing

The extension is TypeScript and SCSS, built per browser with esbuild. See
**[CONTRIBUTING.md](CONTRIBUTING.md)** for the development setup, the code layout, building and
packaging, and how the screenshots
above are generated.
