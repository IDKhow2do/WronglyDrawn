# core/
> L2 | 父级: ../CLAUDE.md

AssetManager.ts: 预加载关卡共用模型和材质，缓存产物供会话复用。
Context.ts: 定义关卡会话向玩法系统提供的服务。
Events.ts: 分发会话中的玩法事件。
FeedbackClient.ts: 将玩家确认的反馈发到网页接口或 iOS 桥。接口默认在游戏目录旁；游戏放在网站子目录时，构建用 `VITE_FEEDBACK_URL` 指回网站根部。
GameStateManager.ts: 保存启动、标题、游玩和通关状态。
InputManager.ts: 汇合键鼠、手柄与触屏输入，提供按键边沿与镜头增量。
Loop.ts: 以固定步长推进模拟，按玩家设定的上限提交画面。
PhysicsWorld.ts: 初始化 Rapier，维护关卡碰撞与物理世界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
