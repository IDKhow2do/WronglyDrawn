# .github/
> L2 | 父级: ../CLAUDE.md

成员清单
ISSUE_TEMPLATE/: 收集平台、复现步骤与玩法建议。
pull_request_template.md: 要求贡献者记录平台与实测结果。
workflows/checks.yml: 用只读权限构建网页及 TapTap 包，并运行首关检查。
workflows/release.yml: 下载版的发布。`v*` 标签触发三类任务：`android` 构建网页静态包和签名 APK，按仓库变量 `ANDROID_CERT_SHA256` 核对证书；`desktop` 在 Windows、macOS、Linux 各自用 `desktop/build.mjs` 打包，再离线跑进第一关；`publish` 合在一起写 SHA256SUMS、建 GitHub Release，再触发 `deploy-site.yml`，让网站的 /api/version 换成新版本。手动运行只构建，文件合成一个 Artifact。签名密钥只在 `android` 任务的环境 `android-release` 里。步骤见 `docs/RELEASES.md`。
release-notes.md: Release 说明的开头（各系统的下载与安装提示，含 SmartScreen 和 macOS 放行步骤）。release.yml 替换其中的 @VERSION@ 和 @CERT@，后面接 GitHub 自动生成的合并记录。
workflows/deploy-site.yml: 网站的自动发布。`main` 有相关改动时构建游戏（相对路径），调用 `scripts/assemble-site.mjs` 拼出“落地页在根部、游戏在 `play/`”的网站，拼的时候用最新 GitHub Release 写 `version.json`（App 的更新提示读它），再按仓库变量 `SITE_DEPLOY` 发到自己的服务器（rsync over SSH）或 GitHub Pages。变量没设置时只构建。开通和回滚见 `docs/DEPLOY.md`。

约定
- 服务器地址、用户、目录和钥匙只放在 GitHub 的密钥里。流程文件和日志里不出现它们的值。
- 引用的 action 都钉在提交哈希上，行尾注明版本。
- 商店（TapTap、App Store、TestFlight）的包不在这里发。GitHub Release 放电脑版安装包、APK 和网页包。
- 签名密钥只放在环境 `android-release`，环境只对 `v*` 标签和 `main` 开放。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
