export function GuideApp() {
  return (
    <div className="guide">
      <h3>How AINCRAD OS works</h3>
      <p>
        This is a virtual desktop that runs entirely in your browser. It is not Windows, not a remote
        machine, and not a view of your device disk. Folders and text files live in IndexedDB on this
        origin. Preferences live in localStorage.
      </p>
      <h3>Accounts</h3>
      <ul>
        <li>Sign in with your username and password. Create account adds another account on this browser.</li>
        <li>In the menu: Sleep darkens the screen and keeps you signed in; Lock keeps your windows but asks for your password; Log out saves and closes everything.</li>
        <li>Settings → Account changes your profile picture and password.</li>
        <li>Accounts and passwords are saved as plain text in this browser. They lock the virtual desktop only; they are not real security.</li>
      </ul>
      <h3>Phones and tablets</h3>
      <ul>
        <li>On phones and touch tablets the layout switches to a mobile home screen: tap an icon to open an app full screen.</li>
        <li>The bar at the bottom has Back (close the current app), Home (all apps keep running), and Recent apps (switch or close).</li>
        <li>Your phone’s own back button or gesture works as Back.</li>
        <li>Settings → Desktop → Layout can force Desktop or Mobile on any device.</li>
      </ul>
      <h3>Desktop</h3>
      <ul>
        <li>Double-click an icon to open it. Drag icons to rearrange them. Positions are saved.</li>
        <li>Right-click the desktop to create a folder or text file in /Desktop. Those items appear as icons.</li>
        <li>Right-click an icon for Open, Rename, or Delete. App icons cannot be deleted.</li>
        <li>MENU opens the launcher. Search filters installed applications.</li>
        <li>The clock opens System. The bell keeps notices. The speaker toggles synthesized sounds.</li>
      </ul>
      <h3>Windows</h3>
      <ul>
        <li>Drag the title bar to move. Drag the edges to resize. Double-click the title bar to maximize.</li>
        <li>Minimize, maximize, and close are on the title bar. Running windows stay on the taskbar.</li>
        <li>Click a window or its taskbar button to bring it forward. Click the active taskbar button to minimize it.</li>
        <li>Inventory, Terminal, and Codex can be open more than once. Settings, System, Calculator, and Guide focus the existing window.</li>
      </ul>
      <h3>Inventory and Codex</h3>
      <ul>
        <li>Create, rename, delete, copy, cut, and paste. Drag an item onto a folder or breadcrumb to move it.</li>
        <li>Double-click a text file to edit it. Codex autosaves into the same archive.</li>
        <li>Search looks under the current folder. Properties shows path, size, and that storage is IndexedDB.</li>
        <li>/Home, /Desktop, /System, and /Trash are protected. Their contents are not.</li>
      </ul>
      <h3>Themes and wallpapers</h3>
      <ul>
        <li>Settings → Appearance has classic and character themes. New theme builds your own from five colors; paste a list of hex codes to fill them at once.</li>
        <li>For your own wallpaper, use Choose image… to upload one from your computer (kept in this browser, works offline), or paste a direct image link from the web.</li>
        <li>Each custom wallpaper has a trash button to delete it. Deleting an upload removes only the browser’s copy.</li>
        <li>In Terminal, <code>theme</code> lists themes and <code>theme &lt;name&gt;</code> switches.</li>
      </ul>
      <h3>Trash</h3>
      <ul>
        <li>Delete moves items to /Trash. Nothing is gone yet, so there is no confirmation.</li>
        <li>Open Trash from its desktop icon. Restore puts an item back in the folder it came from, or in /Home if that folder is gone.</li>
        <li>Delete forever, or Empty Trash, removes items permanently. Both ask first.</li>
        <li>Drag any icon onto the Trash icon to delete it. In Terminal, <code>rm</code> moves to Trash; <code>trash</code>, <code>trash restore &lt;name&gt;</code>, and <code>trash empty</code> manage it.</li>
      </ul>
      <h3>Drag and drop</h3>
      <ul>
        <li>Drag a desktop icon onto a desktop folder, onto a folder in Inventory, or into an Inventory window to move it there.</li>
        <li>Drag an Inventory item onto the desktop to move it to /Desktop at that spot, or onto a desktop folder.</li>
        <li>Drop text files from your computer (.txt, .md, .csv, code) onto the desktop, a folder, or an Inventory window to import a copy. Images, PDFs, and other binary files are skipped. Folders cannot be imported.</li>
      </ul>
      <h3>Notes</h3>
      <ul>
        <li>Right-click the desktop or an Inventory folder and choose New checklist, or New note for a note-taking method.</li>
        <li>Methods: Checklist, Cornell, Outline, Mind map, Charting, Sentence, Boxing, Zettelkasten, Flow-based, Bullet journal, Q / E / C, Split page, and Feynman. Hover a method to see what it is for.</li>
        <li>Each method creates a text file with that method’s layout and opens it in Codex. Edit the layout freely.</li>
        <li>Checklists are <code>.todo</code> files and open in the Checklist app. Enter adds an item, Backspace on an empty item removes it, Alt+Up/Down reorders.</li>
        <li>A checklist is plain <code>- [ ]</code> text. Use Open as text to edit it in Codex, or <code>cat</code> it in Terminal.</li>
      </ul>
      <h3>Terminal</h3>
      <p>
        The prompt runs against the same archive. <code>mkdir</code> in Terminal shows up in Inventory without a manual import.
        Type <code>help</code> for the command list. Up and Down recall history. Tab completes commands and names.
      </p>
      <h3>What is not claimed</h3>
      <ul>
        <li>No native filesystem, registry, process list, or hardware inventory.</li>
        <li>Sleep, Lock, and Log out only affect this page. They do not power off or lock your computer.</li>
        <li>Export downloads a JSON file through the browser. That is the copy you can keep. Erase deletes only the virtual archive.</li>
        <li>Clearing this site’s data in the browser removes the archive and preferences.</li>
      </ul>
    </div>
  );
}