// Shared domain types (server + client). Mirrors CONTRACT.md.

export type AssetStatus = 'needs_review' | 'in_progress' | 'approved';

export interface Version {
  id: string;
  number: number;
  filename: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface Asset {
  id: string;
  name: string;
  status: AssetStatus;
  createdAt: string;
  versions: Version[];
}

export interface Anchor { x: number; y: number }

export interface Comment {
  id: string;
  assetId: string;
  versionId: string;
  parentId: string | null;
  time: number;
  endTime: number | null;
  frame: number | null;
  durationFrames: number | null;
  anchor: Anchor | null;
  text: string;
  author: string;
  authorEmail: string | null;
  internal: boolean;
  resolved: boolean;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
}

export type ShareTheme = 'dark' | 'light' | 'neutral';

/** Stored share (includes the passphrase hash; never send this to clients). */
export interface Share {
  token: string;
  assetId: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  passphraseHash: string | null;
  allowComments: boolean;
  allowDownload: boolean;
  enabled: boolean;
  showAllVersions: boolean;
  theme: ShareTheme;
  accentColor: string | null;
  description: string;
}

/** Share as returned by the API (hash replaced by hasPassphrase, plus url). */
export type PublicShare = Omit<Share, 'passphraseHash'> & { hasPassphrase: boolean; url: string };

export type ActivityType = 'open' | 'view' | 'comment' | 'download';

export interface Activity {
  id: string;
  shareToken: string;
  assetId: string;
  type: ActivityType;
  who: string | null;
  at: string;
}

export interface Database {
  assets: Asset[];
  comments: Comment[];
  shares: Share[];
  activity: Activity[];
}
