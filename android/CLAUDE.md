# android/
> L2 | 父级: ../CLAUDE.md

Android 应用是一层 WebView 外壳。游戏就是根目录的网页构建，打包进 APK，离线运行。
外壳只管载入、横屏、隐私同意和渲染进程崩溃后的重载。玩法、存档和反馈字段都在网页里。
WebView 把 https://wrongdraw.maequeen.top/ 映射到安装包里的 assets/game/。只有 /api/ 走真实网站（游戏内反馈）。
用户代理末尾加 ` WronglyDrawnAndroid/<版本>`。网页据此设 ANDROID_APP（src/render/Quality.ts）：开机即触屏，不显示网页版的卡顿提示。

成员清单
settings.gradle: 定义 Android 应用模块和官方依赖仓库。
build.gradle: 固定 Android Gradle Plugin 版本。
gradle.properties: 配置构建内存与 AndroidX。
gradlew、gradlew.bat: 运行仓库固定的 Gradle 版本。
gradle/wrapper/: 下载并启动 Gradle 8.13。
prepare-web.sh: 校验网页源码与给定提交一致，构建网页并复制进 assets/game/，写下来源记录 android-build.json。
app/build.gradle: 定义包名、SDK 和可选发布签名。版本从 ../../package.json 读取。
app/src/main/AndroidManifest.xml: 声明横屏窗口与网络权限。
app/src/main/java/game/taptap/wronglydrawn/MainActivity.java: 挂载离线资源、加用户代理标识、展示隐私说明、恢复渲染进程。
app/src/main/res/values/strings.xml: 定义安装后显示的应用名“错画之城”。
app/src/main/res/mipmap-xxxhdpi/ic_launcher.png: 沿用主角图标。
app/src/main/assets/game/: 构建时生成的网页产物，不进仓库。
app/src/main/assets/licenses/: 随包保留第三方开源许可。
app/src/androidTest/java/game/taptap/wronglydrawn/SmokeRunner.java: 在设备上验证模型数、App 标识、开机即触屏、无卡顿提示、首关、暂停恢复和帧率存储。

版本
版本号只写在根目录 package.json。versionName 就是它。
versionCode = 主版本×10000 + 次版本×100 + 修订号（0.2.2 → 202）。所有渠道共用这个序列，只增不减。
包名 game.taptap.wronglydrawn 和签名证书不能再换，否则玩家无法覆盖安装。

构建
发布由 .github/workflows/release.yml 在版本标签上完成，步骤见 docs/RELEASES.md。
本地构建：npm ci；local.properties 写 sdk.dir；用 JDK 21。
WRONGDRAW_GAMEPLAY_COMMIT=$(git rev-parse HEAD) VITE_RELEASE_ID=android-v<版本> ./android/prepare-web.sh
./android/gradlew -p android assembleRelease（设 WRONGDRAW_SIGNING_PROPERTIES 才会签名；键为 storeFile、storePassword、keyAlias、keyPassword）。
设备验收：安装 assembleDebug 与 assembleDebugAndroidTest 的产物，运行
adb shell am instrument -w game.taptap.wronglydrawn.test/game.taptap.wronglydrawn.SmokeRunner。
调试包和发布包签名不同，换装前先卸载。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
