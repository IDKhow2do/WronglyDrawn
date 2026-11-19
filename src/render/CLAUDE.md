# render/
> L2 | 父级: ../CLAUDE.md

ArtStyle.ts: 将画风应用到场景材质。共享派生贴图的像素源。iOS 换画风和离开关卡时释放缓存。
CameraController.ts: 插值玩家镜头，约束跟随与遮挡。
ComicShading.ts: 为材质安装漫画分段光照。
CreatureBars.ts: 绘制场景内的生物血条。
DoodleEye.ts: 生成手绘眼睛及其表情。
Effects.ts: 更新场景中的粒子与短时特效。
Grade.ts: 将调色参数接入渲染材质。
InkPass.ts: 绘制墨线描边通道。
LockOn.ts: 选取锁定目标并呈现锁定标记。
Look.ts: 保存调色偏好和画风预设。
Materials.ts: 创建场景与玩法物件共用的材质。
MovingInk.ts: 按材质聚合移动生物的描边绘制。
OcclusionFader.ts: 淡化挡住玩家和镜头的物件。
OrganArt.ts: 将器官类型映射到贴纸素材。
PaintSystem.ts: 将喷漆颜色写入命中网格的表面。
PaintTextures.ts: 生成喷漆贴图、笔刷和色板。
Quality.ts: 保存画质与帧率。按画面提交速度调节分辨率。分辨率和档位到底仍卡时调用一次 onStruggle。IOS_APP、ANDROID_APP、DESKTOP_APP 标明运行在 App 里。
Renderer.ts: 提交关卡、描边和视角模型的绘制。
SceneOptimizer.ts: 优化场景裁剪和扁平透明几何的绘制。
ScreenMarks.ts: 将短时战斗笔触叠加到屏幕。
SoundFx.ts: 把喊声与撞击画成声波特效。
SoundShapes.ts: 定义声波的几何与颜色。
SprayFx.ts: 绘制喷漆时的粒子与笔触。
StampInkFx.ts: 绘制印章墨迹特效。
StaticBatch.ts: 合并静止不透明网格，被交互时恢复单独绘制。
Viewmodel.ts: 绘制第一人称视角的手与工具。
geom.ts: 提供渲染几何的转换函数。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
