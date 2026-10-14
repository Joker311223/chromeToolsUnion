# Chrome Tools Union

Chrome 扩展工具集合，各目录为独立扩展。

| 扩展目录 | 说明 |
| --- | --- |
| [omnibox-tab-reuse](./omnibox-tab-reuse/) | 已有标签定位：地址栏导航放行，其他导航命中相同网址时聚焦并刷新已有标签；支持启停开关和定位通知。 |
| [social-scraper](./social-scraper/) | 原有插件 |
| [xhs-scraper](./xhs-scraper/) | 原有插件 |

## 加载「已有标签定位」

1. 下载或克隆本仓库。
2. 在 Chrome 打开 `chrome://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本仓库中的 `omnibox-tab-reuse` 目录。
4. 点击扩展图标可以开启或关闭自动定位，开关状态会保存。

详细行为、权限和验收步骤见 [插件说明](./omnibox-tab-reuse/README.md)。

## 本地测试

需要 Node.js 18 或以上版本，无需安装 npm 依赖：

```sh
cd omnibox-tab-reuse
npm test
```
