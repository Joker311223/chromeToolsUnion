export interface User {
  openid: string;
  isMember: boolean;
  downloadsThisMonth: number;
  lastDownloadMonth: number; // 0-11
}

export interface MembershipStatus {
  isMember: boolean;
  downloadsThisMonth: number;
  remainingDownloads: number | 'unlimited';
}

export interface DownloadRecord {
  openid: string;
  timestamp: number;
  platform: 'xhs' | 'wechat';
}
