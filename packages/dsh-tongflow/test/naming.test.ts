import { describe, expect, it } from "vitest";
import {
    entityIdFor,
    entityKindOf,
    isEntityId,
    isShotId,
    ownerKindOf,
    parseShotId,
    parseTakeFileName,
    projectIdFor,
    sceneId,
    shotId,
    shotSortKey,
    takeFileName,
    assertPassForOwner,
} from "../src/project/naming.ts";

describe("naming", () => {
    it("builds and parses episode/scene/shot ids", () => {
        expect(sceneId("EP01", 3)).toBe("EP01_SC003");
        expect(shotId("EP01_SC003", 10)).toBe("EP01_SC003_SH0010");
        expect(isShotId("EP01_SC003_SH0010")).toBe(true);
        expect(isShotId("EP1_SC3_SH10")).toBe(false);
        expect(parseShotId("EP02_SC010_SH0120")).toEqual({
            episode: "EP02",
            scene: "EP02_SC010",
            episodeNo: 2,
            sceneNo: 10,
            shotNo: 120,
        });
        expect(shotSortKey("EP01_SC002_SH0010")).toBeLessThan(shotSortKey("EP01_SC002_SH0020"));
        expect(shotSortKey("EP01_SC009_SH0990")).toBeLessThan(shotSortKey("EP02_SC001_SH0010"));
    });

    it("derives entity ids", () => {
        expect(entityIdFor("character", "Mei Lin")).toBe("CHR_MEI_LIN");
        expect(entityIdFor("LOC", "school rooftop")).toBe("LOC_SCHOOL_ROOFTOP");
        expect(isEntityId("PRP_UMBRELLA")).toBe(true);
        expect(isEntityId("chr_mei")).toBe(false);
        expect(entityKindOf("STY_MAIN")).toBe("style");
    });

    it("classifies owners and passes", () => {
        expect(ownerKindOf("CHR_MEI")).toBe("entity");
        expect(ownerKindOf("EP01")).toBe("episode");
        expect(ownerKindOf("EP01_SC001_SH0010")).toBe("shot");
        expect(() => ownerKindOf("EP01_SC001")).toThrow();
        expect(assertPassForOwner("CHR_MEI", "REF")).toBe("entity");
        expect(() => assertPassForOwner("CHR_MEI", "KF")).toThrow(/does not belong/);
        expect(() => assertPassForOwner("EP01", "SB")).toThrow();
    });

    it("formats and parses take file names", () => {
        expect(takeFileName("EP01_SC003_SH0010", "KF", "T02", ".PNG")).toBe("EP01_SC003_SH0010_KF_T02.png");
        expect(parseTakeFileName("CHR_MEI_REF_T01.png")).toEqual({
            owner: "CHR_MEI",
            pass: "REF",
            take: "T01",
            takeNo: 1,
            ext: "png",
        });
        expect(parseTakeFileName("CHR_MEI_REF_T01.provenance.json")).toBeUndefined();
        expect(parseTakeFileName("random.png")).toBeUndefined();
        expect(parseTakeFileName("EP01_CUT_T03.mp4")?.owner).toBe("EP01");
    });

    it("slugs project ids", () => {
        expect(projectIdFor("My Manga Drama!")).toBe("my-manga-drama");
        expect(projectIdFor("我的漫剧")).toBe("project");
    });
});
