# desktop/
> L2 | 父级: ../CLAUDE.md

电脑版（Windows、macOS、Linux）。Electron 外壳把网页构建装进安装包，离线就能玩。
做法和 android/ 一样：游戏保留网站的源 `https://wrongdraw.maequeen.top`，存档、反馈和 AI 搭档照网页的方式工作。
外壳只负责载入和窗口。玩法全在网页构建里，这里不放玩法代码。

成员清单
main.mjs: 主进程。拦截发往游戏网站的请求，从安装包的 resources/game/ 回答；/api/ 和其他网站照常联网。用户代理末尾加 `WronglyDrawnDesktop/<版本> <系统>-<芯片>`：网页据此认出桌面版（render/Quality.ts 的 DESKTOP_APP），不显示网页版卡顿提示；更新提示（ui/UpdateNotice.ts）据此挑本机的安装包。外部链接交给系统浏览器。F11 切全屏，Esc 仍是游戏的暂停键。WD_SMOKE=1 时离线跑进第一关后退出（0 通过，1 失败），WD_SHOT 存下它看到的画面。
build.mjs: 先用相对路径构建游戏到 ../dist-desktop/，再用 electron-builder 打当前系统的包到 release/。`--dir` 只出未打包的 App（快，给检查用），`--skip-web` 沿用已有的网页构建。
package.json: 外壳自己的依赖（electron、electron-builder，锁定精确版本）。版本号不写在这里，打包时取根目录 package.json。
package-lock.json: 锁定上面两个依赖。
icon.png: 1024 px 图标，与安卓启动图标同一张。

每个系统出什么
- Windows：`WronglyDrawn-<版本>-windows-setup.exe`。一键安装到当前用户，不要管理员权限。没有代码签名，SmartScreen 会提醒。
- macOS：`-mac-arm64.dmg`（Apple 芯片）和 `-mac-x64.dmg`（Intel）。ad-hoc 签名，没有公证，第一次打开要在“隐私与安全性”里放行。本机的 Apple Development 证书不能用于分发，build.mjs 关掉了自动找证书。
- Linux：`-linux-x86_64.AppImage`。

本地打包
- 先在根目录 `npm ci`，再 `npm ci --prefix desktop`。
- `node desktop/build.mjs` 打当前系统的包。macOS 上一次出两个 dmg。
- 检查：`WD_SMOKE=1 desktop/release/mac-arm64/WronglyDrawn.app/Contents/MacOS/WronglyDrawn`，打印 passed 并以 0 退出。

发布由 `.github/workflows/release.yml` 在三个系统上各自打包、各自跑进第一关，再和 APK 一起发到 GitHub Release。见 `docs/RELEASES.md`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
