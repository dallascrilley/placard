/**
 * Converts link_data.image_hash to link_data.picture using the ad account's
 * adimages API. Meta rejects sending both fields (ObjectStorySpecRedundant);
 * image_hash-only creates have produced blank Ads Manager previews.
 */
import type { MetaClient } from "../api/meta-client.js";

function cloneRecord(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

/**
 * Before POST /adcreatives: if link_data has image_hash, replace with picture URL
 * from GET /act_.../adimages. If picture is already set, drop image_hash only.
 */
export async function hydrateObjectStorySpecLinkPicture(
  client: MetaClient,
  accountId: string,
  objectStorySpec: Record<string, unknown> | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (!objectStorySpec) {
    return undefined;
  }

  const cloned = cloneRecord(objectStorySpec);
  const linkData = cloned["link_data"];
  if (!linkData || typeof linkData !== "object" || Array.isArray(linkData)) {
    return cloned;
  }

  const ld = { ...(linkData as Record<string, unknown>) };
  const picture = ld["picture"];
  const imageHash = ld["image_hash"];

  if (typeof picture === "string" && picture.trim().length > 0) {
    if (imageHash !== undefined) {
      delete ld["image_hash"];
    }
    cloned["link_data"] = ld;
    return cloned;
  }

  if (typeof imageHash !== "string" || !imageHash.trim()) {
    cloned["link_data"] = ld;
    return cloned;
  }

  const url = await client.getAdImageUrlByHash(accountId, imageHash);
  if (!url) {
    throw new Error(
      `Could not resolve picture URL for image_hash "${imageHash}" in ad account ${accountId}. Upload the image to this account first.`,
    );
  }

  const out = { ...ld, picture: url };
  delete out["image_hash"];
  cloned["link_data"] = out;
  return cloned;
}
