# Nota IA throwaway prototype

Design question: which IA best supports making and printing sheet music first,
phone practice second, and occasional deep editing third?

Priority confirmed by the user: **制谱打印 > 手机陪练 >> 深度编辑**.
No variant has been selected. This is evidence for issue #6, not its implementation.

## Three different structures

| Variant | Primary role and scenario | Structure | Tradeoff to evaluate |
| --- | --- | --- | --- |
| A — 引导式制谱 | Parent preparing a score for printing | Bring in → check original → adapt practice score → layout and deliver | Clear next action; repeated makers may prefer skipping steps |
| B — 谱面工作台 | Repeat maker adjusting while watching the score | Persistent canvas + contextual check/adapt/output/edit panel | Direct visual feedback; requires understanding task categories |
| C — 制作 / 练习双空间 | One maker prepares, family members practice on phones | Making projects and tasks ⇄ read-only practice library and reader | Separates roles; adds a navigation layer |

All variants share representative data and three resettable scenarios: first creation,
continue checking, phone practice. Switching variants keeps in-memory settings.
The bottom bar and Left/Right keys switch variants; text inputs retain their keys.
The top phone control uses a 390 CSS-pixel container, not device emulation.
The layouts also respond to the actual viewport.

## Dolce comparison

Nota's adopted baseline is Dolce 0.8.3 at
`2aab8ef2333ba9e1a2a7b342080381fcacdd41ac`, recorded in `app/UPSTREAM.md`.
Pinned source inspected:
https://github.com/lodebar2026/dolce/blob/2aab8ef2333ba9e1a2a7b342080381fcacdd41ac/index.html

Also opened the live homepage and example editor at
https://lodebar2026.github.io/dolce/ on 2026-10-16. Live upstream can change.
Its core flow is file → editing workspace → save/export. Preserve its original-image
comparison, source/visual editing, score rendering and format capabilities. Nota's
family library, practice adaptation and read-only practice need an explicit task layer.
The prototype's comparison page distinguishes these structures.

Working hypothesis for user evaluation: A's guided making flow + C's independent
practice space, with B available as an advanced editing workspace. **Not a verdict.**

## Run

From repository root:

```sh
npm --prefix app ci --ignore-scripts --no-audit --no-fund
npm run prototype:ia
```

Open `http://localhost:5188/?variant=A&scene=new`.
Other parameters: `variant=B|C`, `scene=review|practice`, `phone=1`.
The dedicated Vite configuration has no library/API middleware.
The production bootstrap gate requires `import.meta.env.DEV` and a variant parameter.
The standard production build removes the prototype import.

## Scope and verification

All state is memory-only. Refresh resets it. No file selection/upload, recognition,
real score conversion, audio, downloads or library writes are performed.
The source image and number score are layout placeholders. Chinese search results
are examples for evaluating the desired UX, not a backend search fix or coverage claim.
No accounts or roles/permissions system is proposed by the role-specific interfaces.

Manual native Edge QA: A check → adapt → deliver; B task switching and 390px
collapsed/expanded inspector; C making/practice library and reader; search empty,
Chinese query, candidate and return with query/results intact. Desktop and 390px
container inspected visually. Not a physical iPhone/Android/PWA verification.
`npm run build` passed (TypeScript + Vite; existing chunk warnings).

To bundle a self-contained HTML artifact, bundle `standalone.ts` with esbuild,
then inline the emitted CSS and JS in a UTF-8 HTML document with viewport metadata.
No prototype code should be promoted to main before the IA decision.
