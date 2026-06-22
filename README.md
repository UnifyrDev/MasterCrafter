# MasterCrafter

MasterCrafter is a local-first desktop app for D&D campaign preparation. It keeps worldbuilding, maps, questlines, timelines, encounters, notes, and workspaces in one place so you can prep and run a campaign without bouncing between tools.

![MasterCrafter timeline and questlines](./images/Map_Editor.png)

## Highlights

- Create, rename, open, delete, import, and export campaign workspaces.
- Model NPCs, landmarks, shrines, stores, items, notes, and custom entity types.
- Import map images and place point, region, and path markers linked to entities.
- Build calendar-aware timelines and questlines with linked events and quest nodes.
- Manage encounters with NPC and player libraries, combatants, sessions, and initiative tracking.
- Search across records and follow backlinks from the inspector.

## Screenshots

### Map editor

Import a map, browse available maps, and edit linked markers from the inspector.

![Map editor](./images/Map_Editor.png)

### Encounters

We have a top of the line Encounter Builder and Player for you with round tracker, condition tracker and timers for static timers

#### Encounter Builder

![Encounter Builder](./images/Encounter_Builder.png)

#### Encounter Player
![Encounter Player](./images/Encounter_Player.png)

### Calendar Settings

Setup your own Weekdays and Months, setup how long a year is or dont you use Months but just seasons? You can! With Mastercrafter!

![Calendar](./images/Calendar.png)

### Timeline Editor

This is the Timeline Editor, Do you have quests you have made and those are set in time or work with a fully dynamic timezone (your world keeps beating forward) then this is the tool you might wanna use aswell!

![Timeline](./images/Timeline.png)

## Getting Started

1. Install a recent version of Node.js and npm.
2. Install dependencies:

   ```bash
   npm install
   ```

   The postinstall hook rebuilds Electron native dependencies automatically.

3. Start the app:

   ```bash
   npm run dev
   ```

4. On Windows, you can also launch it with `Start MasterCrafter.bat`.

## Distribution Builds

Build the distribution installers from the platform you want to ship:

- Windows NSIS installer:

  ```bash
  npm run dist:win
  ```

- Debian package:

  ```bash
  npm run dist:linux:deb
  ```

- Fedora RPM package:

  ```bash
  npm run dist:linux:rpm
  ```

- Both Linux packages in one run:

  ```bash
  npm run dist:linux
  ```

`npm run dist` still builds the current host platform by default. For Linux package output, run the Linux distribution commands on a Linux build machine or CI runner. Installer and package filenames now follow the normalized display version, so a source version like `1.0.1-A` is published as `1.0.1a`.

## GitHub Actions

The repository includes a dedicated `1.0.1-a` distribution workflow at [`.github/workflows/distribution-release-1.0.1-a.yml`](./.github/workflows/distribution-release-1.0.1-a.yml).

- Manual runs upload versioned Windows and Linux artifacts for this release line.
- Tag pushes like `v1.0.1-a` create a GitHub prerelease and attach the installers.
