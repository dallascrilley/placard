import { describe, expect, it, vi } from "vitest";
import type { MetaClient } from "../../api/meta-client.js";
import { hydrateObjectStorySpecLinkPicture } from "../../utils/hydrate-object-story-spec.js";

describe("hydrateObjectStorySpecLinkPicture", () => {
  it("maps image_hash to picture and removes hash", async () => {
    const getAdImageUrlByHash = vi
      .fn()
      .mockResolvedValue("https://cdn.example/img.jpg");
    const client = { getAdImageUrlByHash } as unknown as MetaClient;

    const out = await hydrateObjectStorySpecLinkPicture(client, "act_1", {
      page_id: "p1",
      link_data: {
        link: "https://example.com",
        image_hash: "abc",
      },
    });

    expect(getAdImageUrlByHash).toHaveBeenCalledWith("act_1", "abc");
    expect(out?.["link_data"]).toEqual({
      link: "https://example.com",
      picture: "https://cdn.example/img.jpg",
    });
  });

  it("strips image_hash when picture already set", async () => {
    const getAdImageUrlByHash = vi.fn();
    const client = { getAdImageUrlByHash } as unknown as MetaClient;

    const out = await hydrateObjectStorySpecLinkPicture(client, "act_1", {
      page_id: "p1",
      link_data: {
        link: "https://example.com",
        picture: "https://existing/p.jpg",
        image_hash: "should_strip",
      },
    });

    expect(getAdImageUrlByHash).not.toHaveBeenCalled();
    expect(out?.["link_data"]).toEqual({
      link: "https://example.com",
      picture: "https://existing/p.jpg",
    });
  });

  it("throws when hash cannot resolve", async () => {
    const client = {
      getAdImageUrlByHash: vi.fn().mockResolvedValue(null),
    } as unknown as MetaClient;

    await expect(
      hydrateObjectStorySpecLinkPicture(client, "act_1", {
        page_id: "p1",
        link_data: { link: "https://x.com", image_hash: "bad" },
      }),
    ).rejects.toThrow(/Could not resolve picture URL/);
  });
});
