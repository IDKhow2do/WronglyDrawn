# ui/
> L2 | 父级: ../CLAUDE.md

UI.ts: 组装标题、加载、暂停和 HUD。暂停设置读写画质与帧率，网页版附卡顿提示。观察提示可只显示文案。
FeedbackPanel.ts: 在标题和暂停菜单提供反馈。预览游戏快照。设备选填并须确认。
FeedbackPanel.css: 定义反馈入口和可滚动的手绘对话框。
PaintLoading.ts: 将调用方报告的进度变成数字、进度条和阶段文案。提供提交贴纸画面的等待函数。
PaintLoading.css: 使用游戏调色板绘制贴纸。颜料点不依赖游戏帧循环。
UpdateNotice.ts: 安卓和电脑版 App 在标题画面查一次网站的 /api/version。有更新的版本就贴一张“新版本”贴纸，下载本系统的安装包；“以后再说”三天内不再提同一版本。网页、iOS、TapTap 不查。
PlayTips.ts: 仅网页版在线游玩时提示卡顿。加载超过 8 秒推荐加速器；画质到底仍卡时推荐硬件加速。
DifficultyPicker.ts: 从选择器读写游戏难度。
difficulty.css: 定义难度选择器样式。
Guide.ts: 定义游戏内操作指南。
ItemArt.ts: 为道具与奖励提供贴纸素材。
LevelSelect.ts: 显示已解锁关卡，并将选择交给入口。
levelselect.css: 定义关卡卡片与选择页面样式。
LookPanel.ts: 呈现画风和色彩设置。
Pad.ts: 把手柄状态映射到游戏操作。
SetupScreen.ts: 在新游戏开始前呈现首次设置。画质与帧率共用一个面板。
setup.css: 定义首次设置页面样式。
SoulsHud.ts: 呈现灵魂战的状态。
souls.css: 定义灵魂战 HUD 样式。
StickerTips.ts: 为贴纸界面提供提示。
TouchControls.ts: iOS App、Android App 与手机 TapTap 启动时启用同一触屏 HUD、手势和贴纸栏。其余设备首次触屏时启用。
TouchIcons.ts: 提供触屏动作图标及空中动作状态。
TouchText.ts: 将提示里的键名换成触屏按钮名。
ios-touch.css: 用安全区与屏幕高度定位拇指按钮。工具抽屉与动作键分开。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
