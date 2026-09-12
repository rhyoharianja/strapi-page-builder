import { Alert } from '@strapi/design-system';

interface DraftNoticeProps {
  /** Whether the canvas is rendering draft content rather than what the public site serves. */
  preview: boolean;
}

/**
 * "You have saved something visitors cannot see yet."
 *
 * Lives above the inspector rather than inside it, because it used to be rendered only when a
 * block was selected — and the commonest way to reach this state is dragging, which selects
 * nothing. An editor reordered a page, saw the canvas change, and got no indication at all that
 * the change was a draft.
 *
 * Two different truths, and saying the wrong one is worse than saying nothing. With draft preview
 * the canvas shows exactly what was saved, so the only thing left to say is that visitors cannot
 * see it. Without it the canvas is showing the *older* published copy, which an editor will
 * misread as "my change did not take" unless it is named.
 */
const DraftNotice = ({ preview }: DraftNoticeProps) => (
  <Alert variant="warning" title="Saved as a draft" closeLabel="Dismiss">
    {preview
      ? 'This is the draft. Visitors still see the published version until you publish.'
      : 'The canvas still shows the published version — this site does not preview drafts. Publish to see the change.'}
  </Alert>
);

export { DraftNotice };
