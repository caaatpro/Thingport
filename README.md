<div align="center">

<img src="frontend/src/assets/logos/thingport-lockup-stacked-color.svg" alt="Thingport" width="250">

<h3>Your personal 3D model library.</h3>

<p>
Collect, organize, preview, and manage your 3D printing models<br>
from the places where you discover them.
</p>

</div>

## Features

- 🌐 **Import from MakerWorld, Printables, Thingiverse and Cults3D** — paste a link, or use the Thingport Grab browser extension. Whole collections, likes and MakerWorld print profiles come across with their title, description, tags, photos and author. Big imports run in the background and notify you when they finish, and a model you already have is never imported twice.
- 📤 **Upload your own files** — STL, 3MF, STEP, OBJ and LightBurn files, or a ZIP to pick files from, with its folders recreated as categories.
- 🧊 **3D previews** — STL, 3MF, OBJ and STEP in the browser, with a thumbnail for every plate of a multi-plate 3MF.
- 🗂️ **Organize and search** — nested categories, collections, tags, favourites and browsing history, with full-text search across names, tags, notes and authors (`⌘K` / `/`). Grid or list view, and bulk actions on selected models.
- 👥 **Sharing with permissions** — share a model or a whole collection with other accounts. For collections each person gets a level: view, upload, edit or delete.
- 📊 **Dashboard** — library stats, what you opened recently, favourites, recently added models, most viewed and most used models, and top authors.
- 🖨️ **Open in your slicer** — Bambu Studio, OrcaSlicer, PrusaSlicer, Cura, Creality Print, Anycubic Slicer Next, Elegoo Slicer and Snapmaker Orca.
- 💡 **Normalized MakerWorld 3MFs** — an "Open normalized" option that keeps painted colours, plates and the designer's print settings.
- 📦 **Download as ZIP** — a model's files, or a whole category, tag or collection in one archive.
- 💾 **Plain files on your disk** — choose the folder layout and back up with any tool.
- 🛠️ **Administration** — user management (invite, disable, reset), an overview, logs and settings.
- 🌗 **Light and dark themes.**

## Thingport Grab

A browser extension that imports MakerWorld, Thingiverse and Printables models straight from their own pages. Your instance serves it from the **Downloads** page; see [extension/README.md](extension/README.md).

## Provider setup

Printables imports work with no setup. MakerWorld and Thingiverse each need a credential from your own account first — see [docs/PROVIDER_SETUP.md](docs/PROVIDER_SETUP.md).

## Running it

The stack is Postgres, the API (`backend/`) and the web app behind nginx (`frontend/`), described in [docker-compose.yml](docker-compose.yml):

```bash
docker compose up -d
```

Thingport is then available at `http://<host>:<WEB_PORT>`. The first account you register becomes the admin account. Read the comments at the top of the compose file for the settings you can change (port, database credentials, JWT secret).

The database is the part worth backing up: [scripts/backup-db.sh](scripts/backup-db.sh) writes a compressed dump and prunes old ones, and is meant to be run daily from cron or a systemd timer. Model files live in the storage volume and need their own backup.

## Developing

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for running everything locally with hot reload and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow. Tests: `scripts/e2e.sh` runs the browser tests against a throwaway stack; unit tests live next to the code.

## License

Thingport is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License, version 3](LICENSE) (AGPL-3.0-only), as published by the Free
Software Foundation.
