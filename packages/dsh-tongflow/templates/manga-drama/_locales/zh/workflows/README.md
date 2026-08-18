# 工作流模板

用 `tongflow_workflow_new({ path, fromTemplate: 'workflows/<名字>.tongflow.json' })` 复制一份,再绑定输入(`tongflow_workflow_bind`)运行。复制时每个节点会自动选用已安装的默认插件。

- `character-sheet` —— 文本 → 角色参考图(REF)。
- `location-plate` —— 文本 → 场景定场图(REF)。
- `storyboard-panel` —— 提示词输入 → 分镜图(SB),每镜绑定 `prompt`。
- `shot-keyframe` —— 参考图 + 提示词 → 关键帧(KF,image-fusion),每镜绑定 `refs`、`prompt`。
- `dub-line` —— 声线参考 + 台词 → 配音(DLG),每句绑定 `voice`、`text`。
- `voice-preset` —— 台词 → 预设音色语音(声线参考或没有克隆插件时的配音)。
- `shot-i2v` —— 关键帧 + 运动提示词 → 动画(ANI),每镜绑定 `image`、`prompt`。
- `episode-music` —— 情绪提示词 → 音乐(MUS)。
- `assemble-episode` —— 把本集已圈选的 ANI 按顺序拼成一版(CUT),绑定 `clips` ← tf://EP01/ANI。
