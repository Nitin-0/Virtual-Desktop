# AINCRAD OS

A standalone browser desktop. Windows, a launcher, a virtual archive, a text editor, and a terminal share the same files.

It is not Windows, and it does not read your device disk.

## What is stored where

| Data | Where | Survives refresh |
| --- | --- | --- |
| Folders and text files | IndexedDB database `aincrad-os` on this origin | Yes |
| Theme, custom themes, wallpaper and wallpaper links, sound, icon positions, session name | `localStorage` key `aincrad-os-settings` | Yes |
| Terminal history | `localStorage` key `aincrad-os-history` | Yes |
| Accounts (username, plain-text password, profile picture) | `localStorage` key `aincrad-os-accounts` | Yes |
| Who is signed in | `sessionStorage` key `aincrad-os-session` | Same tab only |
| Uploaded wallpaper images | IndexedDB database `aincrad-os-wallpapers` | Yes |

Inventory and Terminal are two views of that IndexedDB archive. A folder created in one shows up in the other. Codex autosaves into the same archive.

Exporting from Settings asks the browser to download a JSON file. That download is the only built-in copy that leaves IndexedDB. Erase archive deletes only the virtual archive.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm install
npm run build
npm run preview
```

No backend and no API key are required. Use a current Chrome or Edge. The page needs IndexedDB.

Add `?fast=1` to skip the boot delay.

## Accounts

- **First run** shows **Create account**: username, password, confirm password.
- After that, the **sign-in** screen asks for username and password. **Create account** adds another account on this browser.
- Staying signed in: a reload in the same tab keeps you signed in. A new tab or a browser restart asks again.
- Start menu power buttons:
  - **Sleep** – screen goes dark; any key or click returns. You stay signed in.
  - **Lock** – windows stay open; your password is needed to return.
  - **Log out** – saves open documents, closes every window, and returns to sign-in.
- **Settings → Account**: add, change, or remove a profile picture (cropped to a square, shown on the sign-in screen and in the menu), and change your password.

Accounts are stored in `localStorage` (`aincrad-os-accounts`), **with passwords in plain text**. This is a convenience lock for the virtual desktop, not security: anyone using this browser profile can read or clear it, and there is no password recovery. All accounts on a browser share the same files and settings for now.

## Desktop

- Double-click an icon to open it. Drag icons; positions are saved.
- Right-click the desktop to create a folder or text file in `/Desktop`. Those items appear as icons.
- MENU opens the launcher. Search filters applications.
- The clock opens System. The bell lists notices. The speaker toggles synthesized sounds.
- Sleep, Lock, and Log out only affect this page. They do not power off or lock your computer.

## Windows

Drag the title bar. Drag the edges to resize. Double-click the title bar to maximize. Minimize, restore, and close work, and running windows stay on the taskbar. Click a window to bring it forward.

Inventory, Terminal, and Codex can be open more than once.

## Archive

Protected folders: `/Home`, `/Desktop`, `/System`, `/Trash`. Their contents can be changed.

Inventory can create, open, edit, rename, delete, copy, cut, paste, search, and show properties. Grid and list views and the breadcrumb are live. Drag an item onto a folder or a breadcrumb segment to move it.

## Themes and wallpapers

Settings → Appearance.

- **Themes** are five colors, darkest to lightest; the middle one is the accent. Built in: Aincrad, Cardinal, Twilight, Aurora, plus character palettes Crimson Elegance (Rin Tohsaka), Immortal Emerald (C.C.), Crimson Nightmare (Kurumi Tokisaki), Cyber Azure (Sinon), Soft Adventurer (Koharu), Sakura Devil (Zero Two), and Mystic Frost (Citlali).
- **New theme** opens an editor with five color pickers and a live preview. Paste a list such as `#171923 #8D263D #C44C62 #E6B8B8 #D5A85B` to fill all five. Custom themes can be edited and deleted.
- Text on the accent is white or the darkest color, whichever reads better.
- **Upload a wallpaper from your computer**: Choose image… accepts JPG, PNG, WebP, GIF, or AVIF up to 20 MB (several at once). A copy is kept in this browser's IndexedDB database `aincrad-os-wallpapers`, separate from the file archive, so it works offline. Nothing is sent to a server.
- **Wallpapers from a link**: upload an image anywhere on the web, paste its direct link (`https://…/image.jpg`), and Add. The link is checked before it is saved. The image loads from that site each time, so it needs a connection; if it stops loading, the desktop falls back to a dark fill.
- **Delete** a custom wallpaper with the trash button on its card (asks first). Deleting an upload removes the browser's copy; the file on your computer is untouched. Stored images that no wallpaper uses any more are cleaned up on the next load. Archive export does not include wallpapers.
- Terminal: `theme` lists every theme, `theme <id or name>` switches (`theme sinon`, `theme "cyber azure"`).

Custom themes and wallpaper links are stored with your other preferences in `localStorage`.

## Trash

Deleting moves items to `/Trash` instead of erasing them. Each trashed item remembers its original folder.

- **Restore** (Inventory, in Trash) or `trash restore <name>` puts it back. If the original folder is gone, it goes to `/Home`. Name clashes become `name copy.ext`.
- **Delete forever** (on items inside Trash), **Empty Trash**, `rm` inside `/Trash`, and `trash empty` delete permanently. The buttons confirm first.
- The desktop **Trash** icon shows a count, opens Trash, and accepts dragged icons.
- `rm` and `rmdir` in Terminal move to Trash. `trash` lists what is there and where it came from.

Archives created before Trash existed get the folder automatically on the next load.

## Drag and drop

- Desktop icon → desktop folder, Inventory folder, or Inventory window: moves it there.
- Inventory item → desktop: moves it to `/Desktop` at the drop point. → desktop folder: moves it into that folder.
- Text files from your computer → desktop, any folder, or an Inventory window: imports a copy into the archive. Name clashes become `name copy.ext`. Binary files (images, PDFs, archives) and folders are skipped with a notice.
- Files dropped anywhere else are ignored, so the browser never navigates away from the desktop.

## Notes

Right-click the desktop or an Inventory folder for **New checklist** and **New note ▸**. Inventory also has a **Note** toolbar button.

| Method | What the template gives you |
| --- | --- |
| Checklist | `.todo` file, opens in the Checklist app |
| Cornell | Cues, notes, summary |
| Outline | Numbered topics with indented subpoints |
| Mind map | Central idea with a text branch tree |
| Charting | Comparison table |
| Sentence | One numbered line per fact |
| Boxing | Topics grouped in boxes |
| Zettelkasten | One idea with ID, tags, source, and `[[links]]` |
| Flow-based | Ideas joined by arrows |
| Bullet journal | Rapid-log key and a daily log |
| Q / E / C | Question, evidence, conclusion |
| Split page | Main ideas beside details |
| Feynman | Concept, simple explanation, gaps, simplify |

Every note is a text file in the archive. Templates open in Codex. Checklists are `- [ ]` / `- [x]` lines, so Codex and `cat` can read them too.

## Terminal

The prompt is a real interpreter over the archive, not a scripted reply. Commands:

`help` `clear` `pwd` `ls` `cd` `mkdir` `touch` `cat` `write` `rename` `rm` `rmdir` `cp` `mv` `find` `date` `time` `about` `status` `apps` `open` `theme` `whoami` `new` `trash`

Up and Down recall history. Tab completes. `rm -r` deletes a folder and its contents. `write -a` appends. `\n` in `write` becomes a newline.

## Source map

```
src/App.tsx                 desktop shell
src/context/OSContext.tsx   windows, dialogs, settings, notifications
src/os/vfs.ts               IndexedDB virtual filesystem
src/os/terminal.ts          command interpreter
src/os/settings.ts          localStorage preferences
src/apps/Inventory.tsx      file manager
src/apps/Terminal.tsx       command line
src/apps/Editor.tsx         Codex autosave editor
src/apps/Checklist.tsx      interactive .todo checklists
src/os/noteTypes.ts         note methods, templates, checklist format
src/apps/SettingsApp.tsx    theme, wallpaper, sound, archive tools
src/apps/AppearanceSettings.tsx  theme picker and editor, wallpaper links
src/os/themes.ts            theme palettes and CSS variables
src/os/accounts.ts          local accounts and profile pictures
src/context/AuthProvider.tsx  sign-in, sleep, lock, log out
src/components/AuthScreens.tsx  sign-up, sign-in, lock, and sleep screens
src/os/wallpaperStore.ts    uploaded wallpaper images (IndexedDB)
src/apps/SystemInfo.tsx     browser-reported system facts
public/wallpapers/          original desktop images
```

System information only shows values the browser exposes. If a figure is missing, the page says it is not reported.
