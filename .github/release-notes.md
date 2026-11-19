## 下载 · Downloads

下载对应的文件，安装或打开就能玩，游戏本身不用联网。以后的版本直接覆盖安装，进度保留。

| 系统 · System | 文件 · File | 怎么装 |
|---|---|---|
| **Windows** 10 / 11 | **WronglyDrawn-@VERSION@-windows-setup.exe** | 双击安装，桌面会出现快捷方式。如果弹出“Windows 已保护你的电脑”，点“更多信息”→“仍要运行”。 |
| **macOS**（Apple 芯片：M1 及以后） | **WronglyDrawn-@VERSION@-mac-arm64.dmg** | 打开 dmg，把游戏拖进“应用程序”。第一次打开时 macOS 会拦下：到“系统设置”→“隐私与安全性”，在页面底部点“仍要打开”。 |
| **macOS**（Intel 芯片） | WronglyDrawn-@VERSION@-mac-x64.dmg | 同上。不确定是哪种芯片：屏幕左上角苹果菜单 →“关于本机”，看“芯片”或“处理器”那一行。 |
| **Linux** | WronglyDrawn-@VERSION@-linux-x86_64.AppImage | `chmod +x` 后直接运行。 |
| **安卓** 8.0 及以上 | **WronglyDrawn-@VERSION@-android.apk** | 下载后点开安装，系统会让你允许“安装未知应用”。 |
| 自己架设 | WronglyDrawn-@VERSION@-web.zip | 网页版的静态文件，要放在网页服务器上（例如解压后运行 `npx serve`），直接双击 index.html 打不开。 |
| | SHA256SUMS.txt | 各文件的 SHA-256 校验值。 |

电脑版和安卓版的游戏文件都在安装包里，画面卡顿时在暂停菜单把画质调低。游戏内反馈和可选的 AI 搭档需要联网。

不想下载？[在浏览器里直接玩](https://wrongdraw.maequeen.top/)。iOS 请用 [TestFlight](https://testflight.apple.com/join/hRrbcM4Q)。GitHub 在国内下载可能较慢。

*Download, install or open, and play: the game itself runs offline, and later versions install over this one and keep your progress. Windows: if SmartScreen stops it, choose “More info” → “Run anyway”. macOS (arm64 = Apple silicon, x64 = Intel): drag the app to Applications; the first launch is blocked, so open System Settings → Privacy & Security and click “Open Anyway”. Linux: `chmod +x` the AppImage and run it. Android 8.0+: open the APK (allow installs from unknown sources). The web zip is for self-hosting. Or just [play in the browser](https://wrongdraw.maequeen.top/).*

The desktop apps are not signed by Microsoft or notarized by Apple, which is why the systems warn on first launch. APK signing certificate SHA-256: `@CERT@`
