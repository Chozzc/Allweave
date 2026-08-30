import {
    applyGraphPatch,
    createFlowStore,
    exportWorkflow,
    type GraphPatch,
} from "tongflow";

interface WorkflowTemplateDefinition {
    key: string;
    name: string;
    description: string;
    patch: GraphPatch;
}

const OPENROUTER = "tongflow-router-openrouter";
const TOAPIS = "tongflow-router-toapis";
const Z_IMAGE = "tongflow-modal-z-image";
const QWEN_TTS = "tongflow-modal-qwen3tts";
const H3 = "tongflow-modal-minimax-h3";
const ACE_STEP = "tongflow-modal-ace-step";

const definitions: WorkflowTemplateDefinition[] = [
    {
        key: "digital-presenter",
        name: "数字人口播 · 产品介绍",
        description:
            "主题生成口播稿与人物形象，再合成语音驱动的竖屏数字人视频。",
        patch: {
            add_nodes: [
                {
                    alias: "topicInput",
                    type: "addTextNode",
                    data: {
                        manualValue:
                            "为一款面向海外创作者的 AI 工作流产品写 20 秒中文口播稿，开头抓人，结尾带行动号召。",
                    },
                },
                {
                    alias: "topic",
                    type: "textNode",
                    data: {
                        texts: [
                            "为一款面向海外创作者的 AI 工作流产品写 20 秒中文口播稿，开头抓人，结尾带行动号召。",
                        ],
                    },
                },
                {
                    alias: "writeScript",
                    type: "genTextNode",
                    pluginId: OPENROUTER,
                    pluginModel: "openrouter/free",
                },
                { alias: "script", type: "textNode" },
                {
                    alias: "voice",
                    type: "textGenSpeechPresetNode",
                    data: {
                        language: "Chinese",
                        speaker: "Vivian",
                        instruct: "自然、可信、有活力的品牌介绍语气",
                    },
                    pluginId: QWEN_TTS,
                },
                { alias: "audio", type: "audioNode" },
                {
                    alias: "portraitInput",
                    type: "addTextNode",
                    data: {
                        manualValue:
                            "friendly young Asian product designer, clean studio, medium shot, looking at camera, premium commercial lighting, vertical portrait",
                    },
                },
                {
                    alias: "portraitPrompt",
                    type: "textNode",
                    data: {
                        texts: [
                            "friendly young Asian product designer, clean studio, medium shot, looking at camera, premium commercial lighting, vertical portrait",
                        ],
                    },
                },
                {
                    alias: "makePortrait",
                    type: "textGenImageNode",
                    data: { width: 720, height: 1280 },
                    pluginId: Z_IMAGE,
                },
                { alias: "portrait", type: "imageNode" },
                {
                    alias: "talkingVideo",
                    type: "speechImageGenVideoNode",
                    data: {
                        text: "人物自然直视镜头口播，轻微手势，保持身份与服装一致，商业广告质感",
                        width: 720,
                        height: 1280,
                    },
                    pluginId: H3,
                },
                { alias: "video", type: "videoNode" },
            ],
            add_edges: [
                { from: "topicInput", to: "topic" },
                { from: "topic", to: "writeScript" },
                { from: "writeScript", to: "script" },
                { from: "script", to: "voice" },
                { from: "voice", to: "audio" },
                { from: "portraitInput", to: "portraitPrompt" },
                { from: "portraitPrompt", to: "makePortrait" },
                { from: "makePortrait", to: "portrait" },
                { from: "portrait", to: "talkingVideo" },
                { from: "audio", to: "talkingVideo" },
                { from: "talkingVideo", to: "video" },
            ],
        },
    },
    {
        key: "product-commercial",
        name: "商品广告 · 竖屏短片",
        description: "从商品卖点生成广告创意、主视觉和带声音的竖屏产品短片。",
        patch: {
            add_nodes: [
                {
                    alias: "briefInput",
                    type: "addTextNode",
                    data: {
                        manualValue:
                            "为一款可折叠旅行咖啡杯设计 9:16 海外社媒广告：突出轻便、防漏、环保，生成一段可直接用于图像和视频模型的英文视觉提示词。",
                    },
                },
                {
                    alias: "brief",
                    type: "textNode",
                    data: {
                        texts: [
                            "为一款可折叠旅行咖啡杯设计 9:16 海外社媒广告：突出轻便、防漏、环保，生成一段可直接用于图像和视频模型的英文视觉提示词。",
                        ],
                    },
                },
                {
                    alias: "creative",
                    type: "genTextNode",
                    pluginId: OPENROUTER,
                    pluginModel: "openrouter/free",
                },
                { alias: "visualPrompt", type: "textNode" },
                {
                    alias: "heroImage",
                    type: "textGenImageNode",
                    data: { width: 720, height: 1280 },
                    pluginId: TOAPIS,
                    pluginModel: "doubao-seedream-5-0",
                },
                { alias: "image", type: "imageNode" },
                {
                    alias: "animate",
                    type: "imageGenVideoNode",
                    data: {
                        text: "cinematic product reveal, cup unfolds in one smooth motion, water splash demonstrates leak proof seal, quick travel lifestyle cuts, clean logo-safe ending, upbeat sound design",
                        duration: 5,
                        width: 720,
                        height: 1280,
                    },
                    pluginId: TOAPIS,
                    pluginModel: "seedance-2-fast",
                },
                { alias: "video", type: "videoNode" },
            ],
            add_edges: [
                { from: "briefInput", to: "brief" },
                { from: "brief", to: "creative" },
                { from: "creative", to: "visualPrompt" },
                { from: "visualPrompt", to: "heroImage" },
                { from: "heroImage", to: "image" },
                { from: "image", to: "animate" },
                { from: "animate", to: "video" },
            ],
        },
    },
    {
        key: "music-video",
        name: "音乐视觉 · MV 片段",
        description:
            "从主题生成歌词、音乐与主视觉，并用音乐和画面共同生成 MV 片段。",
        patch: {
            add_nodes: [
                {
                    alias: "songInput",
                    type: "addTextNode",
                    data: {
                        manualValue:
                            "写一段适合 15 秒品牌 MV 的中英双语歌词，主题是连接世界、释放创意；同时给出 dream pop 音乐风格描述。",
                    },
                },
                {
                    alias: "songBrief",
                    type: "textNode",
                    data: {
                        texts: [
                            "写一段适合 15 秒品牌 MV 的中英双语歌词，主题是连接世界、释放创意；同时给出 dream pop 音乐风格描述。",
                        ],
                    },
                },
                {
                    alias: "lyricsWriter",
                    type: "genTextNode",
                    pluginId: OPENROUTER,
                    pluginModel: "openrouter/free",
                },
                { alias: "lyrics", type: "textNode" },
                {
                    alias: "music",
                    type: "textGenMusicNode",
                    data: {
                        tags: "dream pop, cinematic, uplifting, electronic",
                        language: "Chinese and English",
                        duration: 15,
                        songTitle: "Weave the World",
                    },
                    pluginId: ACE_STEP,
                },
                { alias: "audio", type: "audioNode" },
                {
                    alias: "visualInput",
                    type: "addTextNode",
                    data: {
                        manualValue:
                            "surreal luminous threads connecting creators across world cities, flowing through screens into art, music and film, dream pop color palette, cinematic vertical composition",
                    },
                },
                {
                    alias: "visualPrompt",
                    type: "textNode",
                    data: {
                        texts: [
                            "surreal luminous threads connecting creators across world cities, flowing through screens into art, music and film, dream pop color palette, cinematic vertical composition",
                        ],
                    },
                },
                {
                    alias: "keyVisual",
                    type: "textGenImageNode",
                    data: { width: 720, height: 1280 },
                    pluginId: Z_IMAGE,
                },
                { alias: "image", type: "imageNode" },
                {
                    alias: "mvClip",
                    type: "speechImageGenVideoNode",
                    data: {
                        text: "music video montage, luminous threads pulse to the beat, slow push-in then energetic orbit, cinematic transitions, synchronized light and sound",
                        width: 720,
                        height: 1280,
                    },
                    pluginId: H3,
                },
                { alias: "video", type: "videoNode" },
            ],
            add_edges: [
                { from: "songInput", to: "songBrief" },
                { from: "songBrief", to: "lyricsWriter" },
                { from: "lyricsWriter", to: "lyrics" },
                { from: "lyrics", to: "music" },
                { from: "music", to: "audio" },
                { from: "visualInput", to: "visualPrompt" },
                { from: "visualPrompt", to: "keyVisual" },
                { from: "keyVisual", to: "image" },
                { from: "image", to: "mvClip" },
                { from: "audio", to: "mvClip" },
                { from: "mvClip", to: "video" },
            ],
        },
    },
];

export function buildWorkflowTemplates() {
    return definitions.map((definition) => {
        let sequence = 0;
        const createId = () => `${definition.key}-${++sequence}`;
        const store = createFlowStore({ createId });
        const result = applyGraphPatch(store, definition.patch, { createId });
        if (!result.ok) {
            throw new Error(`Invalid workflow template: ${definition.key}`);
        }
        store.getState().autoLayout(undefined, { history: false });
        const { nodes, edges } = store.getState();
        return {
            key: definition.key,
            name: definition.name,
            description: definition.description,
            nodes,
            edges,
            executable: exportWorkflow(nodes, edges, {
                name: definition.name,
                description: definition.description,
                includeOriginalFlow: false,
            }),
        };
    });
}
