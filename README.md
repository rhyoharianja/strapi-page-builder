# strapi-page-builder

[![npm](https://img.shields.io/npm/v/strapi-page-builder?logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/strapi-page-builder) ![license MIT](https://img.shields.io/badge/license-MIT-3DA639) ![Strapi 5](https://img.shields.io/badge/Strapi-5-4945FF?logo=strapi&logoColor=white) ![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white) ![React 18](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=white) ![zero runtime dependencies](https://img.shields.io/badge/runtime_deps-0-2F2F2F) ![postMessage bridge](https://img.shields.io/badge/bridge-postMessage-6E56CF)

[![PayPal](https://img.shields.io/badge/PayPal-donate-00457C?logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/sgkharianja) [![Saweria](https://img.shields.io/badge/Saweria-dukung-FF5C5C?logo=buymeacoffee&logoColor=white)](https://saweria.co/rhioharianja)

Click anything on your site, edit the Strapi content behind it, save, publish.

The site is loaded **by URL** into an iframe inside the Strapi admin. It does not matter what
built it — Nuxt, Next, SvelteKit, Astro, Laravel, or a hand-written HTML file — because the
plugin reads the DOM the framework produced, not the framework.

## What it is not

It is **not** zero-integration, and no honest implementation of this idea is. A browser cannot
know that an `<h1>` came from `api::page.page` document `lm0x9`, field `title` — only the
template knows that, so the template has to say so. That is two data attributes and one script
tag, and it is the same bargain Directus, Sanity and Netlify's page builders all make.

It is also **not** a layout builder. Blocks in a dynamic zone can be dragged, added and removed
(see below), but nesting, columns and page structure have nowhere to live in a dynamic zone —
that is a layout JSON field, i.e. `strapi-plugin-puck`.

## Tech stack

| | |
| --- | --- |
| **Strapi 5** (`^5.52`) | Peer, not a dependency. The plugin registers against the admin and server runtimes the host already has |
| **TypeScript 5.9** | Admin, server and the shared contract. The bridge is the exception — see below |
| **React 18** + `@strapi/design-system` 2 | The builder screen is built from Strapi's own components, so it inherits the panel's theme instead of fighting it |
| **`bridge/bridge.js`** — plain ES5, no build | Runs inside *your* site, not the admin. It must load in whatever a visitor's browser is, without a bundler and without assuming a module system |
| **`postMessage`** | The only channel between admin and site. Origin-locked after the handshake |
| **No runtime dependencies** | `dependencies` is empty. Everything it needs is a peer the host already installs, so adding this plugin adds nothing to your lockfile |

The shared entry point (`strapi-page-builder/shared`) imports no Strapi, React or DOM code at
all — it is safe in any front-end bundle, including one that has never heard of Strapi.

---

## Install

Requires **Strapi 5** (tested against 5.52–5.53). React 18, `@strapi/design-system` 2 and
`react-router-dom` 6 are peer dependencies — a Strapi 5 project already has all of them.

```bash
npm install strapi-page-builder
```

```ts
// config/plugins.ts
export default ({ env }) => ({
  'page-builder': {
    enabled: true,
    config: {
      frontendUrl: env('FRONTEND_URL', 'http://localhost:3000'),
      // Optional: staging, per-branch previews, a second brand.
      allowedOrigins: [env('STAGING_URL', '')].filter(Boolean),
    },
  },
});
```

### Open the builder from an entry

Add `entryUrls` and the Content Manager grows an **Edit visually** button on the edit view of
those content-types:

```ts
entryUrls: {
  'api::page.page': '/{slug}',
  'api::article.article': '/artikel/{slug}',
},
```

It opens the builder on *that entry's* page with the inspector already pointed at it, rather than
on `frontendUrl` and a fresh hunt for the right section.

The mapping has to be configured because Strapi knows the entry and only the project knows what
URL renders it — no amount of reading the schema produces that. A content-type left out of the
map gets no button, which is the right answer for anything that is not a page of its own. The
button also hides itself while an entry is being created, and while a placeholder it needs (`{slug}`)
has no value yet: opening the builder on a 404 is worse than not offering.

The plugin widens the `frame-src` CSP directive for those origins itself, in `register()` —
otherwise Strapi's `strapi::security` middleware sends `frame-src 'self'` and the iframe renders
blank with nothing but a console violation to explain it.

## Annotate the site

Two attributes. An element carrying `data-strapi-entry` marks one content entry; elements inside
it carrying `data-strapi-field` name a field on it.

```html
<section data-strapi-entry="api::page.page#lm0x9#en" data-strapi-label="Hero">
  <h1 data-strapi-field="hero.heading">Selamat datang</h1>
  <p  data-strapi-field="hero.subheading">Sejak 1901</p>
</section>
```

Field paths are dotted and may index arrays, so `blocks.2.heading` reaches the third item of a
dynamic zone. `data-strapi-source="uid#documentId#field#locale"` is the flattened shortcut when
one element is both.

## Drag blocks around

Mark the container and its items, and the blocks inside become draggable in the builder — and
droppable from the palette on the left, which is built from the dynamic zone's own schema:

```html
<div data-strapi-zone="kebutuhan" class="grid">
  <article data-strapi-item>
    <h3 data-strapi-field="title">Gadai</h3>
  </article>
  <article data-strapi-item>…</article>
</div>
```

`data-strapi-item` carries **no value**. Items are addressed by their position, and the bridge
reads that position from DOM order — the template numbers nothing, so it cannot number anything
wrongly, and after an optimistic reorder every path is already correct.

The first design addressed items by their component `id` instead, on the reasoning that a stable
identity beats a position. Running it disproved that: **Strapi renumbers component items between
the draft and published versions of a document.** The published entry the site renders had ids
13–18 while the draft the Content Manager edits had 1–6 — for the same six blocks. An id read off
the page matches nothing in the document being written. Position is the only correspondence that
survives publishing.

Clicking a block opens it in the inspector with all of its own fields and a **Remove block**
button; dragging one moves it; dragging a chip from the palette inserts a new one.

In TypeScript, build them with the helper instead of by hand:

```ts
import { encodeSource } from 'strapi-page-builder/shared';

const attr = encodeSource({ uid: 'api::page.page', documentId: page.documentId, locale: 'en' });
```

That entry point imports no Strapi, React or DOM code — it is safe in any front-end bundle.

## Load the bridge

```html
<script src="http://localhost:1337/api/page-builder/bridge.js" defer></script>
```

Served by Strapi so the bridge and the admin that talks to it are always the same release. Safe
to ship to production: the whole file is behind an "am I inside the builder" check, so outside
the iframe it costs one cached request and does nothing at all.

### Refreshing without a full reload

After a save the plugin asks the page to re-fetch. By default that is `location.reload()`, which
loses scroll position and client state. Intercept it and the app keeps both:

```js
window.addEventListener('strapi-page-builder:refresh', (event) => {
  event.preventDefault();   // "I'll handle it"
  refetchPageData();        // your own store / router refresh
});
```

## How it works

| Channel | Mechanism |
| --- | --- |
| Admin ↔ site | `postMessage`, origin-locked after the handshake (`shared/protocol.ts`) |
| Admin → Strapi | The **Content Manager's own endpoints** — so RBAC, validation and draft/publish apply unchanged |
| Site → Strapi | Whatever the site already uses (`@strapi/client`, `fetch`, its own SDK) |

Writing through the Content Manager rather than a plugin controller is the most consequential
decision here. A second write path would have to re-implement field-level permissions,
validation, draft & publish and the audit trail — and would quietly disagree with the first one
the day either changed.

## What the inspector can edit

Scalar fields, in place: `string`, `text`, `richtext`, `email`, `uid`, the numeric types,
`boolean`, `enumeration`, and the date types. Text fields also patch the DOM live as you type,
so the change is visible before it is saved.

Media, relations, components and dynamic zones are **not** approximated here. They link to the
real Content Manager form, which handles them properly. Widening that list is a decision to
reimplement a piece of the Content Manager and should be taken one type at a time.

## Draft preview

Inside the builder the canvas can render **unpublished** content, so a save is visible
immediately — including a block the page has never drawn before, which no amount of DOM patching
could invent.

The plugin mints a short-lived, read-only token and hands it to the page over `postMessage` —
never in the URL, where it would reach history, referrers and the front end's own logs. The site
opts in by claiming the offer:

```js
window.addEventListener('strapi-page-builder:preview', (event) => {
  event.preventDefault()          // "I will fetch drafts"
  previewToken = event.detail.token
  refetch()                       // add ?status=draft and Authorization: Bearer <token>
})
```

`preventDefault()` is the whole contract: a site that ignores the event is showing published
content, and the builder keeps saying so rather than pretending otherwise. A front end that boots
late can read the same token from `window.__strapiPageBuilder` and call its `acknowledge()`.

Server rendering must never use the token — it belongs to one editor's session, not to whatever
a cache serves the public.

### It also closes a hole Strapi leaves open

**Strapi 5 serves drafts to anyone who asks for them.** `?status=draft` is honoured for any
caller whose role holds `find`, which the Public role does on every collection a front end reads.
Verified here: an anonymous `GET /api/pages?…&status=draft` returned an entry that had been
saved and deliberately not published.

So the plugin registers a middleware that downgrades `status=draft` to `status=published` unless
the request carries a valid preview token. It downgrades rather than refuses, so a misconfigured
front end degrades to correct behaviour instead of breaking. Set `guardDrafts: false` to opt out.

## Dragging across the iframe boundary

**Chrome does not deliver drag events into a cross-origin iframe.** A real mouse drag from the
palette reaches the framed page as *nothing*: the page sees this plugin's own `dragStart` and
`dragEnd` messages and zero `dragenter`, `dragover` or `drop`.

So the two drags are handled in two places, and they have to be:

- **Reordering inside the canvas** starts and ends in the same document, so the bridge handles it
  natively — the browser routes those events normally.
- **Palette → canvas** is caught by a transparent surface in the admin, laid over the iframe only
  while a drag is in flight. The drop position is resolved against the item rectangles the bridge
  reports, shifted from the canvas's coordinate space into the admin's.

This was invisible for a long time because every automated check dropped blocks by posting the
protocol message straight to the bridge — which proves the protocol and says nothing about the
gesture. It only surfaced once a drag was driven through Chrome's own pipeline end to end.

## Where a block lands

The axis that decides "before or after" is the axis that actually separates the items: the
**vertical** midpoint for a stack of full-width sections, the **horizontal** one for cards sharing
a row. Both the bridge and the admin's drop surface apply the same rule, so a block lands in the
same place whichever way it was dragged.

Two things made this wrong in ways that read as a random off-by-one:

- Deciding on the horizontal axis for everything. The canvas has a scrollbar, so a full-width
  block's centre sits a few pixels left of the iframe's centre — and every drop on the right-hand
  half landed one slot late.
- Detecting "same row" as *any* vertical overlap. Adjacent stacked sections routinely share a
  boundary pixel (one ending at 434 while the next begins at 433), so a vertical stack was read as
  a grid row. A row now requires overlapping by more than half the shorter item.

## Save and Publish are document actions

They sit above the inspector, not inside it. Inside, they only existed while a block was selected
— and the commonest way to change a page is to drag, which selects nothing, so an editor could
reorder a page and find no way to publish it without first clicking some unrelated block.

## Two tabs: Layers and Components

**Layers** opens first and lists the blocks *this page* is made of, in order, read from the entry
rather than from the canvas — the entry is what gets saved, it carries blocks the page may not
have drawn yet, and its order is the order that matters. Each row shows the block's type and its
own title, and clicking one selects it and scrolls the canvas to it: a section three screens down
is otherwise selected but invisible, which reads as the click having done nothing.

**Components** is the library — everything the zone accepts, grouped by category.

They were one list at first, and it read as a menu of several dozen things with no relationship to
the page on screen: the two commonest actions, "take me to that section" and "add a section",
were both buried in it.

## The builder's chrome

**No address bar.** The canvas follows a picker built from `entryUrls`, so it can only offer
pages that exist and that the plugin knows how to edit. Typing a URL let an editor navigate
anywhere — including pages this CMS does not own — and then wonder why nothing on them was
editable.

**New** creates an entry in any mapped content-type without leaving the builder. It asks for the
two things nobody can derive — which content-type, and what it is called — and fills the rest from
the schema's own `required` flags, so it works for a content-type this plugin has never seen.

The entry stays a **draft**. Publishing on create was the first answer and it was wrong: an entry
that has to go through review must not be published just so a tool can look at it. What makes a
draft openable is the front end's **soft 404** — see below.

### A page awaiting review is still editable

The front end must not *throw* a 404 for a page it cannot find. Throwing replaces the whole app
with Nuxt's error page, and that is fatal for preview: the client never gets to ask again with the
editor's token, so a draft can never be opened.

```ts
if (!page.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)   // a status, not an exception
}
```

The component keeps rendering. A visitor and a crawler get a real 404; the builder gets a live
component that fills itself in the moment the preview token arrives.

**Viewports are a row of icons** — Desktop 1280, Tablet 834, Mobile 390, and Free, which fills
whatever the panels leave. The size beside them is **measured**, never assumed: a 1280px desktop
in a 900px column is 900px wide, and a readout that claimed otherwise would be worse than none.

**The panels resize.** Drag either handle; the widths are remembered per browser. While a handle
is held the canvas is shielded, because an iframe swallows pointer events and a drag that crossed
it would freeze halfway.

## The palette is a grid of tiles

Each block is a square carrying the icon it declares for itself — Strapi's own `info.icon` on the
component, the same value the Content-Type Builder shows. A project changes what a block looks
like in the palette by editing its component JSON, which is where every other fact about that
block already lives.

```json
{ "info": { "displayName": "Gold price", "icon": "chartCircle" } }
```

Thirty full-width rows is a column you scroll and read; the same blocks as two columns of
squares is something you scan and recognise. A handful of Content-Type Builder icon names differ
from the icon package's, and two of the names it offers have no icon at all — those are mapped
explicitly rather than left to a silent fallback that would make every one of them look
unconfigured.

## The palette groups itself

A component's uid already carries its category — `layout.hero`, `element.prose`, `chart.line` —
so the palette groups on that and nothing has to be listed twice. Thirty chips in one column
is a wall; three named groups is a menu. A category the plugin does not recognise still appears,
under its own name, rather than vanishing.

The categories are a modelling decision worth stating plainly:

- **layout** — full-width sections a page is made of.
- **element** — smaller pieces dropped between sections: prose, an image, a row of buttons.
- **chart** — one block per chart type, because a doughnut does not take the same data as a line:
  one flat list of values, not a list of named series. Folding them into one block with a `kind`
  field gives an editor two fields where only one ever applies.
- **shared** — never draggable: the items inside blocks, and `shared.motion`.

## Motion is a field, not a block

Every draggable block carries a `motion` component (`variant`, `delay`, `once`) and every binding
passes it to the front end's own reveal directive. An animation is *how* a section arrives, not a
thing on the page — a motion block would be something an editor could place with nothing to
animate.

## Known gaps

**Nested repeatable items cannot be added from the inspector yet.** A block's own fields are
editable in place, and existing items in a nested list are too — but a freshly dropped Features
or Chart arrives with an empty list and the panel says to add items in the Content Manager. The
block is droppable and configurable; filling its list still means a round trip.

**A site that does not implement draft preview still needs Save then Publish.** Without it the
canvas cannot show a draft, so it does not refresh after a save — it holds the view it has, and
the inspector says which of the two states you are looking at. Refreshing anyway would snap a
block the editor just dragged back to its published position and read as the drag having failed.

**A live patch can outlive a refresh.** The patch writes `textContent` directly; the framework's
virtual DOM still believes the old value, so if the re-fetch returns unchanged data it renders
no update and the patched text stays on screen. It clears on the next real change or a hard
reload. Harmless in practice, and the reason a patch is never treated as saved state.

**Structural editing is out of scope.** Adding, reordering and deleting blocks is an operation
on a dynamic zone, not on an annotated element.

## Status

Verified end to end in a real browser — Chrome driven through CDP, against Strapi 5.53 and a
Nuxt 4 front end whose every page is a `page` entry rendered from one dynamic zone.

Runs are asserted on behaviour, not on markup: a screenshot shows the icons and the tiles, and
says nothing about whether a viewport button resizes the canvas, whether a dragged handle moves a
panel, or whether a block landed in the slot it was dropped on.

| Suite | Result | What it proves |
| --- | --- | --- |
| Draft preview, save, publish | **13/13** | Canvas on draft content, token present in the page and absent from its URL, a save visible without publishing, an anonymous `status=draft` downgraded to published, a visitor still on the old copy, and Publish then promoting the change |
| Order, asserted exactly | **7/7** | The precise array at every stage — a block dropped at a chosen slot landing there, a reorder landing where it was dropped, the published order equal to the draft order, and a clean load rendering every published block |
| Real mouse drag | **6/6** | Chrome's own drag pipeline: the chip picked up from the palette, the canvas confirmed to receive no drag events at all, a block added by the drag, and a native drag inside the canvas still reordering |
| Builder chrome | **12/12** | No address bar and a picker in its place, four viewport icons that actually resize the canvas, a measured size readout, resizable panels, and **New** producing an entry that is confirmed *not published* and confirmed editable in the canvas anyway |
| Block library | **7/7** | Every block the zone declares is offered, grouped Layout / Elements / Charts, and one from each group dropped, saved and drawn with real height. The expected count is read from the zone's schema, so adding a block to the zone does not fail the suite |
| Sidebar | **8/8** | Both tabs present, Layers open by default and populated before anything is clicked, clicking a row selecting the block and bringing it on screen |
| Opening from an entry | **6/6** | The button on the Content Manager edit view, the builder opening on that entry's own URL, and draft preview active on arrival |
| Field editing | **21/21** | Bridge served and inert outside the builder, handshake completing, click selecting the right field, live patch while typing, Save writing a draft without touching the published page |

The front end it is verified against serves **every** URL from one catch-all route and consumes
Strapi through `@strapi/client`, including the preview token — so the integration above is not a
special case built for the plugin.

### Defects this verification found, all fixed

- The admin answered every `ready` with `init`, and the bridge announced again on `init` — an
  unbounded message loop. Worse than noise: each `ready` re-sent `setMode`, which clears the
  in-flight drag, so a block could be picked up and never dropped.
- Component item ids differ between a document's draft and published versions, so id-based
  addressing could not survive publishing. Addressing is positional now.
- `publish` returns the *published* document; keeping it left the panel holding published item
  ids while still editing the draft, and the next save was rejected. The draft is re-read instead.
- `POST …/actions/publish` with an empty body is a 400 — Strapi validates the document there.
- `/content-manager/components` reports `id` and `documentId` as attributes; a form built from
  the schema offered an `id` input until they were filtered out.
- Required text fields reject `''` as firmly as they reject a missing value, so a new block is
  seeded with the component's own name as a visible placeholder.
- The plugin guessed a content-type's kind before its schema arrived, so a **single type** was
  addressed as a collection type: the first request failed and every save silently did nothing.
  Collection types never noticed, because the guess happened to be right for them.
- The canvas kept rendering **published** content while the builder reported draft preview was
  on. `useAsyncData().refresh()` was not re-running the handler on the client, so adopting the
  preview token changed the flag and nothing else — and the Layers list (from the draft) then
  disagreed with the canvas (from the published version) about which blocks exist. The front-end
  binding now owns its fetch instead of asking Nuxt to repeat one. Only a panel that showed both
  views at once could have surfaced this.
- Save and Publish only existed while a block was selected, and dragging selects nothing — so a
  reordered page could not be published without first clicking some unrelated block.
- A block component with more than one possible root element silently loses fallthrough
  attributes, so it was rendered without `data-strapi-item` and simply could not be selected —
  with no warning anywhere. Block wrappers need a single root.
- Strapi returns unset optional fields as `null`, and Vue renders `null` in an interpolation as
  the string "null" — a hero read `null4,100null` until the block bindings normalised them to
  `undefined`. Worth knowing for any block wrapper, in any framework that stringifies.
- A hero laid out for a picture it has no field for renders a large empty panel. The variant
  fallback belongs in the block binding: choosing "split" is asking for a shape, not promising
  an asset.

### And defects in the tests themselves

Worth recording, because each one reported a failure that did not exist and hid the real
question:

- Dropping blocks by posting the protocol message straight to the bridge proves the protocol and
  says nothing about the gesture. **If a feature is driven by a gesture, test the gesture.**
- "Did it change" cannot see an off-by-one. Compare the exact array.
- A test that reads back a hard-coded block type after editing *whichever* field the click landed
  on will report "publish did not work" for a publish that worked.
- An expected count written into the test turns every legitimate addition into a red run that
  says nothing about what broke. Read the count from the schema.
- A block chosen by index is usually below the fold on a page of full-height sections, so the
  drag aimed at a coordinate belonging to nothing.

## Support

These plugins are free and MIT-licensed. If one saved you a day of work, you are welcome to
say thanks:

[![PayPal](https://img.shields.io/badge/PayPal-donate-00457C?logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/sgkharianja)
[![Saweria](https://img.shields.io/badge/Saweria-dukung-FF5C5C?logo=buymeacoffee&logoColor=white)](https://saweria.co/rhioharianja)

Bug reports and pull requests are worth just as much.

## License

MIT © Suryo Galih Kencana Harianja
