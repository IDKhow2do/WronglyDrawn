# scripts/
> L2 | 父级: ../CLAUDE.md

assemble-site.mjs: 拼出网站目录：落地页在根部，游戏在 play/，build.txt 写提交。给了 WD_RELEASE_JSON 时另写 version.json（最新 Release 的版本和各系统安装包地址）。拼完自查入口和引用。deploy-site.yml 和本地预览都用它。
smoke-build.mjs: 用 Chrome 验证网页与 TapTap 包能进入首关。
tripoPost.mjs: 离线简化 GLB、压缩贴图，统一模型比例与轴心。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
