/*!
 * strapi-page-builder — front-end bridge
 *
 * Drop this on any page and it becomes clickable inside the Strapi visual builder:
 *
 *   <script src="http://localhost:1337/page-builder/bridge.js" defer></script>
 *
 * Framework-agnostic on purpose. It is plain ES5-compatible browser JavaScript with no build
 * step, no dependencies and no framework hooks — it reads the DOM the framework produced. That
 * is what makes "any front end" true: Nuxt, Next, SvelteKit, Astro, Rails, or a hand-written
 * HTML file all end up as DOM, and DOM is all this file needs.
 *
 * It does nothing at all outside the builder. The whole body is behind an "am I in an iframe
 * that speaks the protocol" check, so shipping it to production costs one cached request and
 * zero behaviour: no overlays, no listeners, no `postMessage` chatter.
 *
 * **On the duplicated source parsing.** `shared/source.ts` owns the same format. Normally that
 * would be the drift hazard this plugin's `shared/` exists to prevent, but this file is served
 * by the Strapi server from the installed plugin (`GET /page-builder/bridge.js`), so the
 * parser and the admin that talks to it are always the same release. A site that vendors this
 * file into its own bundle opts out of that guarantee — which is why `PROTOCOL_VERSION` is
 * checked on the handshake and reported in the builder.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || window.parent === window) return;

  var CHANNEL = 'strapi-page-builder';
  var VERSION = 1;

  var ATTR_ENTRY = 'data-strapi-entry';
  var ATTR_FIELD = 'data-strapi-field';
  var ATTR_SOURCE = 'data-strapi-source';
  var ATTR_LABEL = 'data-strapi-label';
  var ATTR_ZONE = 'data-strapi-zone';
  var ATTR_ITEM = 'data-strapi-item';

  var SELECTOR =
    '[' + ATTR_SOURCE + '],[' + ATTR_FIELD + '],[' + ATTR_ITEM + '],[' + ATTR_ENTRY + ']';

  /** Origin of the admin, learned from the `init` handshake and then locked. */
  var adminOrigin = null;
  var mode = 'edit';
  var overlay = null;
  var hovered = null;
  var scanTimer = null;
  var indicator = null;
  /** Draft-preview token from the admin, and whether the page took it up. */
  var previewToken = null;
  var previewActive = false;
  /** What is being dragged: {component} from the palette, or {itemId} from the page itself. */
  var dragging = null;

  /* ---------------------------------------------------------------- messaging */

  function send(message) {
    message.channel = CHANNEL;
    message.version = VERSION;
    /*
     * Before the handshake the admin's origin is unknown, so `ready` goes to `*`. That is a
     * deliberate, bounded leak: `ready` carries the page URL and a count, both of which the
     * embedder already knows because it chose the URL. Everything afterwards — which includes
     * content values — is addressed to the one origin that introduced itself.
     */
    window.parent.postMessage(message, adminOrigin || '*');
  }

  /* ------------------------------------------------------------ source lookup */

  function decode(value) {
    if (!value) return null;
    var parts = String(value).split('#');
    var uid = (parts[0] || '').trim();
    var documentId = (parts[1] || '').trim();
    if (!uid || !documentId) return null;

    var source = { uid: uid, documentId: documentId };
    if ((parts[2] || '').trim()) source.field = parts[2].trim();
    if ((parts[3] || '').trim()) source.locale = parts[3].trim();
    return source;
  }

  /**
   * Which Strapi data drew this element.
   *
   * A field element inherits its entry from the nearest annotated ancestor, so a repeated block
   * writes `data-strapi-entry` once and its fields stay short. An element carrying only
   * `data-strapi-entry` resolves to the whole entry, which is what selecting a block does.
   */
  function sourceOf(element) {
    if (!element || !element.closest) return null;

    var node = element.closest(SELECTOR);
    if (!node) return null;

    var direct = decode(node.getAttribute(ATTR_SOURCE));
    if (direct) {
      direct.label = node.getAttribute(ATTR_LABEL) || undefined;
      return { node: node, source: direct };
    }

    var field = node.getAttribute(ATTR_FIELD);
    var holder = node.hasAttribute(ATTR_ENTRY) ? node : node.closest('[' + ATTR_ENTRY + ']');
    if (!holder) return null;

    var entry = decode(holder.getAttribute(ATTR_ENTRY));
    if (!entry) return null;

    /*
     * A field inside a block is addressed by the block's position, and the position is read off
     * the DOM rather than out of the markup.
     *
     * The template writes `data-strapi-field="title"` and marks its item with a bare
     * `data-strapi-item`; it never has to know or number anything. Deriving the index here means
     * that after the bridge moves a node for an optimistic reorder, every path is already
     * correct — there is nothing to renumber and nothing that can be left stale.
     */
    var itemNode = node.hasAttribute(ATTR_ITEM) ? node : node.closest('[' + ATTR_ITEM + ']');
    var zoneNode = itemNode ? itemNode.closest('[' + ATTR_ZONE + ']') : null;

    if (itemNode && zoneNode) {
      var position = itemsOf(zoneNode).indexOf(itemNode);
      var prefix = zoneNode.getAttribute(ATTR_ZONE) + '.' + position;
      entry.field = field ? prefix + '.' + field : prefix;
    } else if (field) {
      entry.field = field;
    }

    entry.label =
      node.getAttribute(ATTR_LABEL) ||
      (itemNode && itemNode.getAttribute(ATTR_LABEL)) ||
      holder.getAttribute(ATTR_LABEL) ||
      undefined;

    return { node: node, source: entry };
  }

  function hitOf(found) {
    var box = found.node.getBoundingClientRect();
    var text = (found.node.textContent || '').trim();

    return {
      source: found.source,
      rect: { top: box.top, left: box.left, width: box.width, height: box.height },
      text: text.length > 240 ? text.slice(0, 240) : text
    };
  }

  function matches(node, source) {
    var found = sourceOf(node);
    if (!found) return false;
    return (
      found.source.uid === source.uid &&
      found.source.documentId === source.documentId &&
      (found.source.field || '') === (source.field || '')
    );
  }

  function findNode(source) {
    var nodes = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i += 1) {
      if (matches(nodes[i], source)) return nodes[i];
    }
    return null;
  }

  /* ---------------------------------------------------------------- overlay */

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.setAttribute('data-strapi-visual-overlay', '');
    overlay.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:2147483646',
      'border:2px solid #4945ff',
      'border-radius:2px',
      'background:rgba(73,69,255,.08)',
      'transition:top .08s,left .08s,width .08s,height .08s',
      'display:none'
    ].join(';');

    var tag = document.createElement('span');
    tag.setAttribute('data-strapi-visual-tag', '');
    tag.style.cssText = [
      'position:absolute',
      'top:-20px',
      'left:-2px',
      'font:600 11px/1.6 system-ui,sans-serif',
      'color:#fff',
      'background:#4945ff',
      'padding:0 6px',
      'border-radius:2px',
      'white-space:nowrap'
    ].join(';');
    overlay.appendChild(tag);

    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function paint(found) {
    var box = ensureOverlay();

    if (!found || mode !== 'edit') {
      box.style.display = 'none';
      return;
    }

    var rect = found.node.getBoundingClientRect();
    box.style.display = 'block';
    box.style.top = rect.top + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.firstChild.textContent =
      found.source.label || found.source.field || found.source.uid.split('.').pop();
  }

  /* ---------------------------------------------------------------- scanning */

  function scan() {
    var nodes = document.querySelectorAll(SELECTOR);
    var hits = [];

    for (var i = 0; i < nodes.length; i += 1) {
      var found = sourceOf(nodes[i]);
      if (found && found.node === nodes[i]) hits.push(hitOf(found));
    }

    return hits;
  }

  /** Direct item children of a zone — nested zones must not steal each other's items. */
  function itemsOf(zoneNode) {
    var all = zoneNode.querySelectorAll('[' + ATTR_ITEM + ']');
    var mine = [];

    for (var i = 0; i < all.length; i += 1) {
      if (all[i].closest('[' + ATTR_ZONE + ']') === zoneNode) mine.push(all[i]);
    }

    return mine;
  }

  function scanZones() {
    var nodes = document.querySelectorAll('[' + ATTR_ZONE + ']');
    var zones = [];

    for (var i = 0; i < nodes.length; i += 1) {
      var holder = nodes[i].closest('[' + ATTR_ENTRY + ']');
      var entry = holder && decode(holder.getAttribute(ATTR_ENTRY));
      if (!entry) continue;

      var box = nodes[i].getBoundingClientRect();

      zones.push({
        zone: nodes[i].getAttribute(ATTR_ZONE),
        entry: entry,
        rect: { top: box.top, left: box.left, width: box.width, height: box.height },
        items: itemsOf(nodes[i]).map(function (node) {
          var box = node.getBoundingClientRect();
          return { top: box.top, left: box.left, width: box.width, height: box.height };
        }),
      });
    }

    return zones;
  }

  /**
   * Re-scan after the DOM settles.
   *
   * Debounced because a hydrating framework mutates the DOM hundreds of times in the first
   * second, and an un-debounced observer turns that into hundreds of `postMessage` payloads
   * carrying every annotated element on the page.
   */
  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      scanTimer = null;
      armDraggables();
      send({ type: 'sources', hits: scan(), zones: scanZones(), preview: previewActive });
    }, 150);
  }

  /* ---------------------------------------------------------------- listeners */

  function onPointerMove(event) {
    if (mode !== 'edit') return;

    var found = sourceOf(event.target);

    if (!found) {
      if (hovered) {
        hovered = null;
        paint(null);
        send({ type: 'hover', hit: null });
      }
      return;
    }

    if (hovered === found.node) return;

    hovered = found.node;
    paint(found);
    send({ type: 'hover', hit: hitOf(found) });
  }

  /**
   * Click-to-edit.
   *
   * Capture phase with `stopPropagation`, so the site's own handlers never see the click: in
   * edit mode a click on a card is a request to edit that card, not to follow its link. Browse
   * mode leaves every click alone, which is how an editor walks to the page they want.
   */
  function onClick(event) {
    if (mode !== 'edit') return;

    var found = sourceOf(event.target);
    if (!found) return;

    event.preventDefault();
    event.stopPropagation();

    paint(found);
    send({ type: 'select', hit: hitOf(found) });
  }

  /* ------------------------------------------------------------ drag and drop */

  function ensureIndicator() {
    if (indicator) return indicator;

    indicator = document.createElement('div');
    indicator.setAttribute('data-strapi-visual-indicator', '');
    indicator.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:2147483647',
      'background:#4945ff',
      'border-radius:2px',
      'box-shadow:0 0 0 2px rgba(73,69,255,.25)',
      'display:none'
    ].join(';');

    document.documentElement.appendChild(indicator);
    return indicator;
  }

  function hideIndicator() {
    ensureIndicator().style.display = 'none';
  }

  /**
   * Where a drop at this point would insert.
   *
   * The axis that decides "before or after" is the axis that actually separates the items. For a
   * stack of full-width sections that is the **vertical** midpoint; for cards sharing a row it is
   * the horizontal one. Using the horizontal rule for everything was wrong in a way that looked
   * like a random off-by-one: the canvas has a scrollbar, so a full-width block's centre sits a
   * few pixels left of the iframe's centre, and every drop on the right-hand side landed one slot
   * late.
   */
  function insertionAt(zoneNode, x, y) {
    var items = itemsOf(zoneNode);

    for (var i = 0; i < items.length; i += 1) {
      var rect = items[i].getBoundingClientRect();
      var inRow = y >= rect.top && y <= rect.top + rect.height;

      if (!inRow) {
        // Above this item: the drop belongs before it. Below: keep looking.
        if (y < rect.top) return { items: items, index: i };
        continue;
      }

      /*
       * Side by side, or stacked? Tested as *substantial* vertical overlap, not any overlap:
       * adjacent stacked sections routinely share a boundary pixel, and treating that as a shared
       * row decides "before or after" on the wrong axis — every drop on the right-hand half then
       * lands one slot late.
       */
      var shares = false;

      for (var j = 0; j < items.length; j += 1) {
        if (j === i) continue;

        var other = items[j].getBoundingClientRect();
        var overlap =
          Math.min(rect.top + rect.height, other.top + other.height) -
          Math.max(rect.top, other.top);

        if (overlap > Math.min(rect.height, other.height) * 0.5) {
          shares = true;
          break;
        }
      }

      var after = shares ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;

      return { items: items, index: after ? i + 1 : i };
    }

    return { items: items, index: items.length };
  }

  function paintIndicator(zoneNode, spot) {
    var line = ensureIndicator();
    var items = spot.items;
    var anchor = items[spot.index] || items[items.length - 1];

    if (!anchor) {
      var zone = zoneNode.getBoundingClientRect();
      line.style.display = 'block';
      line.style.top = zone.top + 8 + 'px';
      line.style.left = zone.left + 8 + 'px';
      line.style.width = Math.max(zone.width - 16, 40) + 'px';
      line.style.height = '3px';
      return;
    }

    var rect = anchor.getBoundingClientRect();
    var atEnd = spot.index >= items.length;

    line.style.display = 'block';
    line.style.top = rect.top + 'px';
    line.style.left = (atEnd ? rect.right + 2 : rect.left - 5) + 'px';
    line.style.width = '3px';
    line.style.height = rect.height + 'px';
  }

  function zoneUnder(target) {
    return target && target.closest ? target.closest('[' + ATTR_ZONE + ']') : null;
  }

  function onDragOver(event) {
    if (!dragging || mode !== 'edit') return;

    var zoneNode = zoneUnder(event.target);

    if (!zoneNode) {
      hideIndicator();
      return;
    }

    // Without preventDefault the browser refuses the drop and shows the "no entry" cursor.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = dragging.index === undefined ? 'copy' : 'move';
    }

    paintIndicator(zoneNode, insertionAt(zoneNode, event.clientX, event.clientY));
  }

  function onDrop(event) {
    if (!dragging || mode !== 'edit') return;

    var zoneNode = zoneUnder(event.target);
    if (!zoneNode) return;

    event.preventDefault();
    event.stopPropagation();

    var holder = zoneNode.closest('[' + ATTR_ENTRY + ']');
    var entry = holder && decode(holder.getAttribute(ATTR_ENTRY));
    if (!entry) return;

    var spot = insertionAt(zoneNode, event.clientX, event.clientY);

    send({
      type: 'drop',
      zone: zoneNode.getAttribute(ATTR_ZONE),
      entry: entry,
      index: spot.index,
      from: dragging.index,
      component: dragging.component
    });

    dragging = null;
    hideIndicator();
  }

  /**
   * Let an existing block be picked up.
   *
   * `draggable` is set only in edit mode and removed again in browse mode: a permanently
   * draggable card hijacks text selection on the live site, and this bridge ships to production.
   */
  function armDraggables() {
    var items = document.querySelectorAll('[' + ATTR_ITEM + ']');

    for (var i = 0; i < items.length; i += 1) {
      if (mode === 'edit') items[i].setAttribute('draggable', 'true');
      else items[i].removeAttribute('draggable');
    }
  }

  function onDragStart(event) {
    if (mode !== 'edit') return;

    var itemNode = event.target.closest && event.target.closest('[' + ATTR_ITEM + ']');
    if (!itemNode) return;

    var zoneNode = itemNode.closest('[' + ATTR_ZONE + ']');
    if (!zoneNode) return;

    dragging = { index: itemsOf(zoneNode).indexOf(itemNode) };

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // Firefox starts no drag at all unless something is written here.
      event.dataTransfer.setData('text/plain', String(dragging.index));
    }
  }

  function onDragEnd() {
    dragging = null;
    hideIndicator();
  }

  /**
   * Move a node so the drag lands where it was dropped, before anything is saved.
   *
   * Expressed as from/to rather than as a whole new order: the admin computed the same move on
   * the array, and sending the two sides the same instruction keeps them from disagreeing about
   * what "index 3" meant once the item has been lifted out.
   */
  function applyMove(zone, from, to) {
    var zoneNode = document.querySelector('[' + ATTR_ZONE + '="' + zone + '"]');
    if (!zoneNode) return;

    var items = itemsOf(zoneNode);
    var node = items[from];
    if (!node) return;

    var target = to > from ? items[to] : items[to];

    if (!target) zoneNode.appendChild(node);
    else if (to > from) target.insertAdjacentElement('afterend', node);
    else target.insertAdjacentElement('beforebegin', node);
  }

  function onScrollOrResize() {
    if (hovered) paint(sourceOf(hovered));
  }

  function announce() {
    send({
      type: 'ready',
      url: location.href,
      version: VERSION,
      hits: scan().length,
      preview: previewActive
    });
  }

  /**
   * Offer the page a draft-preview token.
   *
   * Same idiom as `refresh`: a cancellable event the app claims by calling `preventDefault()`.
   * An app that claims it is telling the bridge "I will fetch drafts from now on", and only then
   * does the builder treat the canvas as showing draft content. An app that ignores the event is
   * showing published content and must keep being treated that way — guessing wrong here is how
   * an editor ends up believing an unpublished change is live.
   *
   * The token is also parked on `window` for apps that boot after this fires.
   */
  function offerPreview() {
    if (!previewToken) return;

    /*
     * Parked on `window` as well as announced, with an explicit acknowledgement.
     *
     * A framework that mounts its data layer after this fires would otherwise miss the offer
     * entirely — the event is gone and there is nothing to read. Leaving the token here lets a
     * late arrival pick it up, and `acknowledge()` is how it says it did, which is the same fact
     * `preventDefault()` communicates for a listener that was in time.
     */
    window.__strapiPageBuilder = {
      previewToken: previewToken,
      status: 'draft',
      acknowledge: function () {
        previewActive = true;
        announce();
      }
    };

    var event = new CustomEvent('strapi-page-builder:preview', {
      cancelable: true,
      detail: { token: previewToken, status: 'draft' }
    });

    previewActive = !window.dispatchEvent(event);
  }

  /**
   * Follow client-side navigation.
   *
   * A single-page app changes the URL without a load event, so the builder's address bar would
   * quietly go stale and "refresh" would reload the wrong page. Patching the two history methods
   * is the only framework-independent way to notice.
   */
  function watchNavigation() {
    var emit = function () {
      send({ type: 'navigate', url: location.href });
      scheduleScan();
    };

    ['pushState', 'replaceState'].forEach(function (name) {
      var original = history[name];
      history[name] = function () {
        var result = original.apply(this, arguments);
        emit();
        return result;
      };
    });

    window.addEventListener('popstate', emit);
  }

  function handle(message) {
    switch (message.type) {
      case 'init':
        /*
         * Record the origin and report, but do **not** announce again.
         *
         * The admin answers every `ready` with `init`. Announcing here closed that into a loop:
         * ready → init → ready → …, thousands of messages a second. It was not merely noisy —
         * the admin re-sends `setMode` on each `ready`, and `setMode` clears the in-flight drag,
         * so a block could be picked up but never dropped.
         */
        adminOrigin = message.origin || adminOrigin;

        if (message.previewToken && message.previewToken !== previewToken) {
          previewToken = message.previewToken;
          offerPreview();
        }

        send({ type: 'sources', hits: scan(), zones: scanZones(), preview: previewActive });
        break;

      case 'setMode':
        mode = message.mode === 'browse' ? 'browse' : 'edit';
        hovered = null;
        dragging = null;
        paint(null);
        hideIndicator();
        armDraggables();
        break;

      case 'dragStart':
        dragging = { component: message.component };
        break;

      case 'dragEnd':
        dragging = null;
        hideIndicator();
        break;

      case 'reorder':
        applyMove(message.zone, message.from, message.to);
        break;

      case 'removeItem': {
        var host = document.querySelector('[' + ATTR_ZONE + '="' + message.zone + '"]');
        var doomed = host && itemsOf(host)[message.index];
        if (doomed && doomed.parentNode) doomed.parentNode.removeChild(doomed);
        break;
      }

      case 'scan':
        send({ type: 'sources', hits: scan(), zones: scanZones(), preview: previewActive });
        break;

      case 'highlight': {
        if (!message.source) {
          paint(null);
          return;
        }
        var node = findNode(message.source);
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        paint(sourceOf(node));
        break;
      }

      case 'patch': {
        var target = findNode(message.source);
        if (target) target.textContent = message.value;
        break;
      }

      case 'refresh': {
        /*
         * Give the app a chance to re-fetch on its own before falling back to a reload. An app
         * that calls `preventDefault()` on this event keeps its scroll position, its open menus
         * and its client state — a full reload throws all of that away, which is jarring after
         * every single save.
         */
        var event = new CustomEvent('strapi-page-builder:refresh', { cancelable: true });
        var handled = !window.dispatchEvent(event);

        if (!handled || message.hard) location.reload();
        else scheduleScan();
        break;
      }

      default:
        break;
    }
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || data.channel !== CHANNEL) return;

    // Once an admin has introduced itself, ignore anyone else claiming the channel.
    if (adminOrigin && event.origin !== adminOrigin) return;
    if (!adminOrigin && data.type !== 'init') return;

    handle(data);
  });

  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('dragstart', onDragStart, true);
  document.addEventListener('dragover', onDragOver, true);
  document.addEventListener('drop', onDrop, true);
  document.addEventListener('dragend', onDragEnd, true);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  if (typeof MutationObserver === 'function') {
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [ATTR_ENTRY, ATTR_FIELD, ATTR_SOURCE]
    });
  }

  watchNavigation();
  armDraggables();
  announce();
})();
