import { describe, expect, it } from "vitest";
import { filterModelCatalog } from "./model-catalog";
import { PluginModelCatalogSchema } from "./plugins-registry-schema";

const catalog = PluginModelCatalogSchema.parse({
    url: "https://api.example.com/api/models",
    exclude: { upcoming: true },
    slots: {
        "gen-text": {
            features: "text-to-text",
            endpoints: "/v1/chat/completions",
        },
        "image-gen": { features: "text-to-image" },
        nested: { "arch.input": "image" },
    },
});

const payload = {
    data: [
        {
            id: "chat-a",
            features: ["text-to-text", "image-to-text"],
            endpoints: '{"openai-chat": {"path": "/v1/chat/completions"}}',
        },
        {
            id: "chat-soon",
            features: ["text-to-text"],
            endpoints: ["/v1/chat/completions"],
            upcoming: true,
        },
        {
            id: "img-a",
            features: ["text-to-image"],
            endpoints: ["image-generation"],
        },
        { id: "vision", arch: { input: ["text", "image"] } },
        { id: "", features: ["text-to-image"] },
        { features: ["text-to-image"] },
        "garbage",
    ],
};

describe("filterModelCatalog", () => {
    it("keeps ids whose fields contain every slot token, in catalog order", () => {
        expect(filterModelCatalog(catalog, payload)).toEqual({
            "gen-text": ["chat-a"],
            "image-gen": ["img-a"],
            nested: ["vision"],
        });
    });

    it("returns empty lists for every slot when the payload has no record array", () => {
        expect(filterModelCatalog(catalog, { data: null })).toEqual({
            "gen-text": [],
            "image-gen": [],
            nested: [],
        });
        expect(filterModelCatalog(catalog, "nope")["gen-text"]).toEqual([]);
    });

    it("honours custom items / id paths", () => {
        const c = PluginModelCatalogSchema.parse({
            url: "https://x",
            items: "result.models",
            id: "meta.slug",
            slots: { "gen-text": { kind: "llm" } },
        });
        const p = {
            result: { models: [{ meta: { slug: "m1" }, kind: "llm" }] },
        };
        expect(filterModelCatalog(c, p)).toEqual({ "gen-text": ["m1"] });
    });
});
