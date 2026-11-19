# 参与这个项目 · Contributing

谢谢你愿意帮忙。这是一个个人项目，作者拿它练手，也欢迎别人一起改。

## 反馈问题

开 Issue 时请用模板。最有用的三样东西：你在哪个平台和浏览器上玩、怎么一步步重现、你看到了什么（截图或录屏最好）。

## 改代码

1. 从 `main` 拉分支。大改动先开 Issue，明显的小修可以直接发 Pull Request。
2. 在本地用 `npm ci` 安装锁定的依赖，再运行 `npm run build`。
3. 在 PR 里列出涉及的平台、实测步骤和结果。玩法和画面改动附截图或录屏。改动触屏或原生壳时，在对应设备上复验。
4. 维护者也走 PR。等 `Check game builds` 通过，再把验证过的改动合进 `main`。发版使用通过验收的提交标签。

复现合并前检查：

```bash
npm ci
npm run build
node scripts/smoke-build.mjs dist
```

首关检查使用 Chrome。Linux 默认找 `google-chrome`，macOS 默认使用应用程序目录里的 Chrome。可通过 `CHROME_BIN` 指定浏览器。

## 代码约定

- 每个源文件开头有一段注释，写它依赖什么（INPUT）、提供什么（OUTPUT）、在模块里的位置（POS）。改了文件的依赖或导出，就把这段注释一起改掉。
- 每个目录的 `CLAUDE.md` 列出里面的文件各管什么。新增、删除或改名文件时同步更新它。
- 界面文字走 `src/i18n/`，中英文各一份，不要把文字写死在代码里。
- 新功能先看现有代码里有没有同类的做法，沿用它。

## 素材

代码贡献沿用 [PolyForm Noncommercial 1.0.0](LICENSE)。提交前确认你有权按此许可提供改动。新增第三方素材时，在 [CREDITS.md](CREDITS.md) 登记来源和许可。素材使用范围见 [LICENSE-ASSETS.md](LICENSE-ASSETS.md)。

## English

Use the issue templates for bug reports and ideas. Work on a branch from `main` and use a pull request for every change, including maintainer changes. Run `npm ci`, `npm run build`, and `node scripts/smoke-build.mjs dist` locally. Describe what you verified and include the affected platforms. Wait for `Check game builds` before merging. Keep source file headers and module maps up to date.

Code contributions use [PolyForm Noncommercial 1.0.0](LICENSE). Check that you have the rights to submit your changes under these terms. See [LICENSE-ASSETS.md](LICENSE-ASSETS.md) for game assets and [CREDITS.md](CREDITS.md) for third-party notices.
