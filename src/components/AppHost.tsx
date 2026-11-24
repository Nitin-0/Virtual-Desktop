import type { AppWindow } from '../os/types';
import { CalculatorApp } from '../apps/Calculator';
import { ChecklistApp } from '../apps/Checklist';
import { EditorApp } from '../apps/Editor';
import { GuideApp } from '../apps/Guide';
import { HanoiApp } from '../apps/Hanoi';
import { InventoryApp } from '../apps/Inventory';
import { SettingsApp } from '../apps/SettingsApp';
import { SystemApp } from '../apps/SystemInfo';
import { TerminalApp } from '../apps/Terminal';

export function AppHost({ win }: { win: AppWindow }) {
  switch (win.appId) {
    case 'inventory':
      return <InventoryApp windowId={win.id} initialPath={win.payload?.path} />;
    case 'terminal':
      return <TerminalApp windowId={win.id} initialCwd={win.payload?.cwd} />;
    case 'editor':
      return <EditorApp windowId={win.id} fileId={win.payload?.fileId} />;
    case 'checklist':
      return <ChecklistApp windowId={win.id} fileId={win.payload?.fileId} />;
    case 'settings':
      return <SettingsApp />;
    case 'system':
      return <SystemApp />;
    case 'calculator':
      return <CalculatorApp windowId={win.id} />;
    case 'guide':
      return <GuideApp />;
    case 'hanoi':
      return <HanoiApp win={win} />;
    default:
      return <div className="app-error">Unknown application.</div>;
  }
}
