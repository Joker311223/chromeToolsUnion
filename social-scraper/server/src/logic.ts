import { User } from './types';

/**
 * 检查并重置用户的每月下载计数
 * @param user 用户对象
 * @param currentMonth 当前月份 (0-11)
 * @returns 更新后的用户对象
 */
export function checkAndResetMonthlyDownloads(user: User, currentMonth: number): User {
  if (user.lastDownloadMonth !== currentMonth) {
    return {
      ...user,
      downloadsThisMonth: 0,
      lastDownloadMonth: currentMonth,
    };
  }
  return user;
}

/**
 * 检查用户是否有权下载
 * @param user 用户对象
 * @returns 是否有权下载
 */
export function canUserDownload(user: User): boolean {
  if (user.isMember) {
    return true;
  }
  return user.downloadsThisMonth < 2;
}

/**
 * 记录一次下载操作
 * @param user 用户对象
 * @returns 更新后的用户对象
 */
export function recordDownload(user: User): User {
  if (!canUserDownload(user)) {
    throw new Error('Monthly download limit reached. Please upgrade to member.');
  }
  return {
    ...user,
    downloadsThisMonth: user.downloadsThisMonth + 1,
  };
}
