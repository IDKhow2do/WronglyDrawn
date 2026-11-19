# .github/
> L2 | 父级: ../CLAUDE.md

成员清单
ISSUE_TEMPLATE/: 收集平台、复现步骤与玩法建议。
pull_request_template.md: 要求贡献者记录平台与实测结果。
workflows/checks.yml: 用只读权限构建网页及 TapTap 包，并运行首关检查。
workflows/deploy-site.yml: 网站的自动发布。`main` 有相关改动时构建游戏（相对路径），调用 `scripts/assemble-site.mjs` 拼出“落地页在根部、游戏在 `play/`”的网站，再按仓库变量 `SITE_DEPLOY` 发到自己的服务器（rsync over SSH）或 GitHub Pages。变量没设置时只构建。开通和回滚见 `docs/DEPLOY.md`。

约定
- 服务器地址、用户、目录和钥匙只放在 GitHub 的密钥里。流程文件和日志里不出现它们的值。
- 引用的 action 都钉在提交哈希上，行尾注明版本。
- 各商店的包不在这里发。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
