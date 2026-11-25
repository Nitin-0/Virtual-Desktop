/**
 * Note-taking methods offered under "New ▸" in the desktop and Inventory menus,
 * and by the terminal command `new`.
 *
 * Every note is an ordinary text file in the virtual archive. Most methods are
 * structured templates that open in Codex. Checklists use the `.todo`
 * extension and open in the interactive Checklist app; their content is plain
 * `- [ ]` / `- [x]` lines, so `cat` and Codex can still read them.
 */

export interface NoteType {
  id: string;
  label: string;
  /** One-line explanation shown in menus and by `new` in the terminal. */
  blurb: string;
  /** Default file name offered in the name prompt. */
  defaultName: string;
  template: (title: string, now: Date) => string;
}

export const CHECKLIST_EXT = '.todo';

function day(now: Date): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export const NOTE_TYPES: NoteType[] = [
  {
    id: 'checklist',
    label: 'Checklist',
    blurb: 'Action items you can tick off',
    defaultName: `Checklist${CHECKLIST_EXT}`,
    template: (title) => `# ${title}\n- [ ] First item\n`,
  },
  {
    id: 'note',
    label: 'Simple note',
    blurb: 'A blank page, just write',
    defaultName: 'Note.txt',
    template: (title) => `${title}\n\n`,
  },
  {
    id: 'cornell',
    label: 'Cornell',
    blurb: 'Cues, notes, and a summary',
    defaultName: 'Cornell notes.md',
    template: (title, now) => `# ${title}
Date: ${day(now)}
Topic:

## Cues and questions
(Fill in after the session: keywords and questions the notes answer.)
-

## Notes
(Write during the session. Short phrases, not full sentences.)
-

## Summary
(Two or three sentences in your own words.)
`,
  },
  {
    id: 'outline',
    label: 'Outline',
    blurb: 'Topics and indented subpoints',
    defaultName: 'Outline.md',
    template: (title) => `# ${title}

1. Main topic
   a. Subtopic
      - Supporting detail
      - Supporting detail
   b. Subtopic
      - Supporting detail
2. Main topic
   a. Subtopic
      - Supporting detail
3. Main topic
`,
  },
  {
    id: 'mindmap',
    label: 'Mind map',
    blurb: 'A central idea with branches',
    defaultName: 'Mind map.md',
    template: (title) => `# ${title}

Central idea: ${title}
│
├── Branch one
│   ├── Idea
│   └── Idea
│
├── Branch two
│   ├── Idea
│   │   └── Detail
│   └── Idea
│
└── Branch three
    └── Idea

(Add a branch for each theme. Keep each label to a few words.)
`,
  },
  {
    id: 'charting',
    label: 'Charting',
    blurb: 'Compare items in a table',
    defaultName: 'Chart.md',
    template: (title) => `# ${title}

| Item     | Aspect 1 | Aspect 2 | Aspect 3 |
|----------|----------|----------|----------|
|          |          |          |          |
|          |          |          |          |
|          |          |          |          |

(Rows are the things you compare. Columns are what you compare them on.)
`,
  },
  {
    id: 'sentence',
    label: 'Sentence',
    blurb: 'One numbered line per new fact',
    defaultName: 'Sentence notes.md',
    template: (title, now) => `# ${title}
Date: ${day(now)}

1.
2.
3.

(Write each new fact or idea as its own short sentence. Number every line.)
`,
  },
  {
    id: 'boxing',
    label: 'Boxing',
    blurb: 'Related notes grouped in boxes',
    defaultName: 'Boxing notes.md',
    template: (title) => `# ${title}

┌─ Topic one ──────────────────────────────┐
│ •                                        │
│ •                                        │
└──────────────────────────────────────────┘

┌─ Topic two ──────────────────────────────┐
│ •                                        │
│ •                                        │
└──────────────────────────────────────────┘

┌─ Topic three ────────────────────────────┐
│ •                                        │
└──────────────────────────────────────────┘
`,
  },
  {
    id: 'zettel',
    label: 'Zettelkasten',
    blurb: 'One atomic idea, linked to others',
    defaultName: 'Zettel.md',
    template: (title, now) => `# ${title}
ID: ${stamp(now)}
Tags: #

## Idea
(One idea only, in your own words.)

## Source
(Where it came from.)

## Links
- Relates to [[ ]] because
- Contradicts [[ ]] because
`,
  },
  {
    id: 'flow',
    label: 'Flow-based',
    blurb: 'Ideas linked with arrows as you think',
    defaultName: 'Flow notes.md',
    template: (title) => `# ${title}

Big question:
  → first idea
      → because
      → which leads to
  → second idea
      ↔ connects with first idea
  ⇒ so far I think

(Do not copy the source in order. Link each idea to ones you already wrote.
 →  leads to    ↔  related    ⇒  conclusion    ?  unsure)
`,
  },
  {
    id: 'bujo',
    label: 'Bullet journal',
    blurb: 'Rapid log of tasks, events, and notes',
    defaultName: 'Bullet journal.md',
    template: (title, now) => `# ${title}

Key:  •  task    ×  done    >  moved    <  scheduled    ○  event    –  note    *  priority

## ${day(now)}
•
○
–

## Later this month
<
`,
  },
  {
    id: 'qec',
    label: 'Q / E / C',
    blurb: 'Question, evidence, conclusion',
    defaultName: 'QEC notes.md',
    template: (title) => `# ${title}

## Question
(What are you trying to answer?)

## Evidence
-
-
-

## Conclusion
(What does the evidence support? How sure are you?)
`,
  },
  {
    id: 'split',
    label: 'Split page',
    blurb: 'Main ideas beside their details',
    defaultName: 'Split page.md',
    template: (title) => `# ${title}

Main ideas                 │ Details and examples
───────────────────────────┼────────────────────────────────────
                           │
                           │
───────────────────────────┼────────────────────────────────────
                           │
                           │
───────────────────────────┼────────────────────────────────────
                           │
`,
  },
  {
    id: 'feynman',
    label: 'Feynman',
    blurb: 'Explain it simply to find the gaps',
    defaultName: 'Feynman notes.md',
    template: (title) => `# ${title}

## 1. Concept
(Name what you are learning.)

## 2. Explain it simply
(As if teaching a 12-year-old. No jargon.)

## 3. Gaps
(Where did you get stuck or fall back on jargon? Go back to the source for these.)
-

## 4. Simplify
(Rewrite the explanation. Add an analogy.)
`,
  },
];

export function getNoteType(id: string): NoteType | undefined {
  const key = id.trim().toLowerCase();
  return NOTE_TYPES.find((type) => type.id === key || type.label.toLowerCase() === key);
}

export function isChecklistName(name: string): boolean {
  return name.toLowerCase().endsWith(CHECKLIST_EXT);
}

/** The app that opens a text file by default. */
export function appForFile(name: string): 'checklist' | 'editor' {
  return isChecklistName(name) ? 'checklist' : 'editor';
}

/** Title used inside a new note: the file name without its extension. */
export function titleFromName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Make sure a checklist keeps the extension that routes it to the Checklist app. */
export function nameForType(type: NoteType, name: string): string {
  if (type.id === 'checklist' && !isChecklistName(name)) return `${name}${CHECKLIST_EXT}`;
  return name;
}

export interface ChecklistItem {
  kind: 'item';
  done: boolean;
  text: string;
}

export interface ChecklistLine {
  kind: 'title' | 'text';
  text: string;
}

export type ChecklistEntry = ChecklistItem | ChecklistLine;

const ITEM_RE = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/;

/** Parse checklist text. Lines that are not items or the title are kept as-is. */
export function parseChecklist(content: string): ChecklistEntry[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let titled = false;
  return lines.map((line): ChecklistEntry => {
    const match = ITEM_RE.exec(line);
    if (match) return { kind: 'item', done: match[1] !== ' ', text: match[2] ?? '' };
    if (!titled && line.startsWith('# ')) {
      titled = true;
      return { kind: 'title', text: line.slice(2) };
    }
    return { kind: 'text', text: line };
  });
}

export function serializeChecklist(entries: ChecklistEntry[]): string {
  const body = entries.map((entry) => {
    if (entry.kind === 'item') return `- [${entry.done ? 'x' : ' '}] ${entry.text}`;
    if (entry.kind === 'title') return `# ${entry.text}`;
    return entry.text;
  });
  return body.length ? `${body.join('\n')}\n` : '';
}