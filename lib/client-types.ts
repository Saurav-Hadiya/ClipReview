// Client-only types shared between components and pages.
import type { Anchor, Asset, Comment, ShareTheme } from './types';

/** In/out marks set on the player (seconds). */
export interface Marks {
  inTime: number | null;
  outTime: number | null;
}

/** Payload produced by the comment composer. */
export interface NewComment {
  time: number;
  endTime: number | null;
  durationFrames: number | null;
  text: string;
  author: string;
  anchor: Anchor | null;
  internal: boolean;
  parentId: string | null;
  /** Optional; only some callers forward it. */
  frame?: number | null;
}

/** Position (0..1) plus playhead time reported by the player's pin tool. */
export interface PinPlacement extends Anchor {
  time: number;
}

export type CommentExportFormat = 'csv' | 'json';

/** Share settings visible to anonymous reviewers (GET /api/public/shares/:token). */
export interface PublicShareView {
  allowComments: boolean;
  allowDownload: boolean;
  hasPassphrase: boolean;
  name: string;
  theme: ShareTheme;
  accentColor: string | null;
  description: string;
  showAllVersions: boolean;
}

export interface PublicSharePayload {
  asset: Asset;
  share: PublicShareView;
  comments: Comment[];
}
