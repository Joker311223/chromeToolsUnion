# 需求文档：微信会员系统

## 简介

本系统旨在为社交媒体抓取插件提供微信扫码登录和会员支付功能。通过会员身份验证，系统将对普通用户的下载次数进行限制（每月 2 次），而会员用户则享有无限次下载权限。

## 术语表

- **系统 (System)**：社交媒体抓取插件及其后端服务。
- **用户 (User)**：插件的使用者。
- **会员 (Member)**：已支付并开通会员权限的用户。
- **普通用户 (Non-Member)**：未登录或未开通会员权限的用户。
- **下载 (Download)**：导出 Excel 数据的操作。
- **微信登录 (WeChat_Login)**：微信扫码登录流程。
- **微信支付 (WeChat_Pay)**：微信扫码支付流程。

## 需求

### 需求 1：微信登录

**用户故事：** 作为一名用户，我希望通过微信扫码登录，以便查看我的会员状态和下载记录。

#### 验收标准

1. 当用户点击登录按钮时，系统应显示微信登录二维码。 (WHEN a user clicks the login button, THE System SHALL display a WeChat login QR code.)
2. 当用户扫描二维码并授权后，系统应验证用户身份并存储会话令牌。 (WHEN a user scans the QR code and authorizes, THE System SHALL authenticate the user and store the session token.)
3. 当用户处于登录状态时，系统应显示用户的会员状态和剩余下载次数。 (WHILE a user is logged in, THE System SHALL display the user's membership status and remaining download count.)

### 需求 2：会员支付

**用户故事：** 作为一名普通用户，我希望通过微信扫码支付开通会员，以便享受无限次下载。

#### 验收标准

1. 当用户点击升级按钮时，系统应显示微信支付二维码。 (WHEN a user clicks the upgrade button, THE System SHALL display a WeChat payment QR code.)
2. 当用户完成支付后，系统应将用户状态升级为会员。 (WHEN a user completes the payment, THE System SHALL upgrade the user's status to Member.)
3. 当用户身份为会员时，系统应允许无限次下载。 (WHILE a user is a Member, THE System SHALL allow unlimited downloads.)

### 需求 3：下载次数限制

**用户故事：** 作为系统管理员，我希望限制普通用户的下载次数，以鼓励用户升级为会员。

#### 验收标准

1. 当普通用户尝试下载数据时，系统应检查当月下载次数。 (WHEN a Non-Member attempts to download data, THE System SHALL check the current month's download count.)
2. 如果普通用户已达到每月 2 次的下载限制，则系统应阻止下载并提示用户升级。 (IF a Non-Member has reached the monthly limit of 2 downloads, THEN THE System SHALL prevent the download and prompt the user to upgrade.)
3. 当下载成功时，系统应增加用户的当月下载计数。 (WHEN a download is successful, THE System SHALL increment the user's monthly download count.)
4. 系统应在每个日历月初重置所有普通用户的下载计数。 (THE System SHALL reset the download count for all Non-Members at the beginning of each calendar month.)

### 需求 4：数据持久化

**用户故事：** 作为一名用户，我希望我的会员状态在不同会话间保持一致，这样我就不需要重复登录或支付。

#### 验收标准

1. 系统应在安全的后端数据库中存储用户会员状态和下载计数。 (THE System SHALL store user membership status and download counts in a secure backend database.)
2. 系统应使用安全令牌验证所有敏感操作的用户身份。 (THE System SHALL use secure tokens to verify user identity for all sensitive operations.)
