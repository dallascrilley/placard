import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MetaClient } from "../api/meta-client.js";
import { CREATE_ANNOTATIONS } from "../constants/index.js";
import {
  type BatchCampaignConfig,
  type BatchSharedCreative,
  accountIdSchema,
  batchCampaignConfigSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import { createSuccessResponse } from "../utils/tool-responses.js";
import {
  validateAdvantageAgeConstraint,
  validateCboBudgetConstraint,
  validateGeoRadius,
  validatePromotedObjectConstraints,
} from "./adsets.js";
import {
  validateStopTimeBudgetCompatibility,
  validateTimestampTimezone,
} from "./campaigns.js";
import { hydrateObjectStorySpecLinkPicture } from "../utils/hydrate-object-story-spec.js";
import {
  validateCreativeCallToAction,
  validateCreativeSpecInputs,
} from "./creatives.js";

interface ValidationMessage {
  path: string;
  message: string;
}

const CREATIVE_ARCHIVAL_ROLLBACK_HINT =
  "Meta ad creatives cannot be deleted after creation; archive/ignore those IDs if you retry with a new config.";

type BatchCampaign = BatchCampaignConfig["campaigns"][number];
type BatchAdSet = BatchCampaign["ad_sets"][number];
type BatchAd = BatchAdSet["ads"][number];
type BatchCreative = NonNullable<BatchAd["creative"]>;
type SharedCreativeList = NonNullable<
  BatchCampaignConfig["shared_creatives"] | BatchCampaignConfig["creatives"]
>;
type CreativeInput = BatchCreative | BatchSharedCreative;

export interface BatchValidationResult {
  valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

export interface CreatedResource {
  type: "campaign" | "ad_set" | "ad" | "creative";
  id: string;
  name: string;
  parent_type?: "campaign" | "ad_set";
  parent_id?: string;
  ref?: string;
}

export interface BatchExecutionResult {
  completed: boolean;
  created: CreatedResource[];
  summary: {
    campaigns: number;
    ad_sets: number;
    creatives: number;
    ads: number;
  };
  warnings: ValidationMessage[];
  error?: {
    tier: "shared_creatives" | "campaigns" | "ad_sets" | "ads";
    message: string;
    rollback_hints: string[];
  };
}

function getSharedCreatives(config: BatchCampaignConfig): SharedCreativeList {
  return (config.shared_creatives ??
    config.creatives ??
    []) as SharedCreativeList;
}

function summarizeConfig(config: BatchCampaignConfig): {
  campaigns: number;
  ad_sets: number;
  creatives: number;
  ads: number;
} {
  return {
    campaigns: config.campaigns.length,
    ad_sets: config.campaigns.reduce(
      (sum, campaign) => sum + campaign.ad_sets.length,
      0,
    ),
    creatives:
      getSharedCreatives(config).length +
      config.campaigns.reduce(
        (sum, campaign) =>
          sum +
          campaign.ad_sets.reduce(
            (nestedSum, adSet) =>
              nestedSum +
              adSet.ads.filter((ad) => ad.creative !== undefined).length,
            0,
          ),
        0,
      ),
    ads: config.campaigns.reduce(
      (sum, campaign) =>
        sum +
        campaign.ad_sets.reduce(
          (nestedSum, adSet) => nestedSum + adSet.ads.length,
          0,
        ),
      0,
    ),
  };
}

async function resolveBatchConfigInput(
  config: BatchCampaignConfig | undefined,
  configPath: string | undefined,
): Promise<BatchCampaignConfig> {
  if (config && configPath) {
    throw new Error(
      "Provide either config or config_path, not both. Use config_path when loading from file.",
    );
  }
  if (!config && !configPath) {
    throw new Error(
      "Missing batch configuration. Provide config object or config_path.",
    );
  }

  if (config) {
    return config;
  }

  const filePath = configPath as string;
  const resolvedPath = resolve(filePath);
  const baseReal = await realpath(process.cwd());
  let configReal: string;
  try {
    configReal = await realpath(resolvedPath);
  } catch {
    throw new Error(
      `config_path does not exist or is not accessible: ${resolvedPath}`,
    );
  }
  if (!isAbsolute(configReal)) {
    throw new Error(
      `config_path must resolve to an absolute path within the working directory. Got: ${configReal}`,
    );
  }
  const rel = relative(baseReal, configReal);
  if (rel.startsWith("..") || rel === ".." || isAbsolute(rel)) {
    throw new Error(
      `config_path must be within the working directory (${baseReal}). Resolved path: ${configReal}`,
    );
  }
  const raw = await readFile(configReal, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse batch config JSON at "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = batchCampaignConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid config_path JSON at "${filePath}": ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return result.data;
}

class AdCreationError extends Error {
  inlineCreativeId?: string;
  inlineCreativeName?: string;

  constructor(
    message: string,
    options?: { inlineCreativeId?: string; inlineCreativeName?: string },
  ) {
    super(message);
    this.name = "AdCreationError";
    if (options?.inlineCreativeId) {
      this.inlineCreativeId = options.inlineCreativeId;
    }
    if (options?.inlineCreativeName) {
      this.inlineCreativeName = options.inlineCreativeName;
    }
  }
}

function computeSummary(created: CreatedResource[]) {
  return {
    campaigns: created.filter((item) => item.type === "campaign").length,
    ad_sets: created.filter((item) => item.type === "ad_set").length,
    creatives: created.filter((item) => item.type === "creative").length,
    ads: created.filter((item) => item.type === "ad").length,
  };
}

function extractRejectionMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (
    reason &&
    typeof reason === "object" &&
    "message" in reason &&
    typeof (reason as Record<string, unknown>)["message"] === "string"
  ) {
    return (reason as Record<string, unknown>)["message"] as string;
  }
  return String(reason);
}

function collectRejections(
  settled: PromiseSettledResult<unknown>[],
): { message: string } | null {
  const messages: string[] = [];
  for (const item of settled) {
    if (item.status === "rejected") {
      messages.push(extractRejectionMessage(item.reason));
    }
  }
  if (messages.length === 0) return null;
  return { message: messages.join("; ") };
}

function requiresSpecialAdCountry(categories: string[] | undefined): boolean {
  if (!categories || categories.length === 0) {
    return false;
  }

  return categories.some(
    (category) =>
      category === "EMPLOYMENT" ||
      category === "HOUSING" ||
      category === "CREDIT" ||
      category === "ISSUES_ELECTIONS_POLITICS",
  );
}

function addError(
  errors: ValidationMessage[],
  path: string,
  message: string,
): void {
  errors.push({ path, message });
}

function addWarning(
  warnings: ValidationMessage[],
  path: string,
  message: string,
): void {
  warnings.push({ path, message });
}

function createCampaignBudgetForCbo(campaign: BatchCampaign): {
  daily_budget?: string;
  lifetime_budget?: string;
} {
  const budget: { daily_budget?: string; lifetime_budget?: string } = {};
  if (campaign.daily_budget !== undefined) {
    budget.daily_budget = String(campaign.daily_budget);
  }
  if (campaign.lifetime_budget !== undefined) {
    budget.lifetime_budget = String(campaign.lifetime_budget);
  }
  return budget;
}

function createAdSetBudgetForCbo(adSet: BatchAdSet): {
  daily_budget?: number;
  lifetime_budget?: number;
} {
  const budget: { daily_budget?: number; lifetime_budget?: number } = {};
  if (adSet.daily_budget !== undefined) {
    budget.daily_budget = adSet.daily_budget;
  }
  if (adSet.lifetime_budget !== undefined) {
    budget.lifetime_budget = adSet.lifetime_budget;
  }
  return budget;
}

function validateCreativeImageKey(
  creative: CreativeInput,
  imageHashes: Record<string, string>,
  path: string,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
): void {
  if (creative.image_hash && creative.image_key) {
    addWarning(
      warnings,
      `${path}.image_key`,
      "Both image_hash and image_key are set; image_hash will be used.",
    );
  }

  if (!creative.image_key) {
    return;
  }

  if (!imageHashes[creative.image_key]) {
    addError(
      errors,
      `${path}.image_key`,
      `Unknown image_key "${creative.image_key}". Define it in config.image_hashes.`,
    );
    return;
  }

  if (creative.asset_feed_spec) {
    return;
  }

  if (creative.page_id && (creative.link || creative.event_id)) {
    return;
  }

  const story = creative.object_story_spec;
  if (!story || typeof story !== "object") {
    addWarning(
      warnings,
      `${path}.image_key`,
      `image_key "${creative.image_key}" is set but object_story_spec/asset_feed_spec is missing.`,
    );
    return;
  }

  const hasLinkData =
    typeof story["link_data"] === "object" && story["link_data"] !== null;
  const hasPhotoData =
    typeof story["photo_data"] === "object" && story["photo_data"] !== null;
  if (!hasLinkData && !hasPhotoData) {
    addWarning(
      warnings,
      `${path}.image_key`,
      `image_key "${creative.image_key}" provided but no link_data/photo_data section was found to inject image_hash.`,
    );
  }
}

function usesCopyTemplate(creative: CreativeInput): boolean {
  return (
    creative.page_id !== undefined ||
    creative.link !== undefined ||
    creative.event_id !== undefined ||
    creative.message !== undefined ||
    creative.title !== undefined ||
    creative.description !== undefined ||
    creative.call_to_action_type !== undefined
  );
}

function resolveCreativeImageHash(
  creative: CreativeInput,
  imageHashes: Record<string, string>,
): string | undefined {
  if (creative.image_hash) {
    return creative.image_hash;
  }
  if (creative.image_key) {
    return imageHashes[creative.image_key];
  }
  return undefined;
}

function buildObjectStorySpecFromTemplate(
  creative: CreativeInput,
  imageHash: string | undefined,
): Record<string, unknown> {
  if (!creative.page_id || (!creative.link && !creative.event_id)) {
    throw new Error(
      "Copy-template creatives require page_id and at least one of link or event_id when object_story_spec is not provided.",
    );
  }

  const linkData: Record<string, unknown> = {};
  if (creative.link) {
    linkData["link"] = creative.link;
  }
  if (creative.event_id) {
    linkData["event_id"] = creative.event_id;
  }
  if (creative.message) {
    linkData["message"] = creative.message;
  }
  if (creative.title) {
    linkData["name"] = creative.title;
  }
  if (creative.description) {
    linkData["description"] = creative.description;
  }
  if (creative.call_to_action_type) {
    if (!creative.link) {
      throw new Error(
        "call_to_action_type requires link when using copy-template creative fields.",
      );
    }
    linkData["call_to_action"] = {
      type: creative.call_to_action_type,
      value: { link: creative.link },
    };
  }
  if (imageHash) {
    linkData["image_hash"] = imageHash;
  }

  return {
    page_id: creative.page_id,
    link_data: linkData,
  };
}

function resolveCreativeForCreate(
  creative: CreativeInput,
  imageHashes: Record<string, string>,
): {
  name: string;
  object_story_spec?: Record<string, unknown> | undefined;
  asset_feed_spec?: Record<string, unknown> | undefined;
  url_tags?: string | undefined;
  instagram_actor_id?: string | undefined;
  degrees_of_freedom_spec?: Record<string, unknown> | undefined;
  applink_treatment?: string | undefined;
} {
  const imageHash = resolveCreativeImageHash(creative, imageHashes);
  const hasExplicitSpec =
    creative.object_story_spec !== undefined ||
    creative.asset_feed_spec !== undefined;
  const templateStorySpec =
    !hasExplicitSpec && usesCopyTemplate(creative)
      ? buildObjectStorySpecFromTemplate(creative, imageHash)
      : undefined;
  const objectStorySpecInput = creative.object_story_spec ?? templateStorySpec;
  const objectStorySpec =
    imageHash && objectStorySpecInput
      ? applyImageHashToObjectStorySpec(objectStorySpecInput, imageHash)
      : objectStorySpecInput;
  const assetFeedSpec =
    imageHash && creative.asset_feed_spec
      ? applyImageHashToAssetFeedSpec(creative.asset_feed_spec, imageHash)
      : creative.asset_feed_spec;

  return {
    name: creative.name,
    object_story_spec: objectStorySpec,
    asset_feed_spec: assetFeedSpec,
    url_tags: creative.url_tags,
    instagram_actor_id: creative.instagram_actor_id,
    degrees_of_freedom_spec: creative.degrees_of_freedom_spec,
    applink_treatment: creative.applink_treatment,
  };
}

/** Resolve creative for Graph API: link_data.image_hash → picture (adimages URL). */
async function resolveCreativePayloadForGraph(
  client: MetaClient,
  accountId: string,
  creative: CreativeInput,
  imageHashes: Record<string, string>,
): Promise<ReturnType<typeof resolveCreativeForCreate>> {
  const base = resolveCreativeForCreate(creative, imageHashes);
  const oss = await hydrateObjectStorySpecLinkPicture(
    client,
    accountId,
    base.object_story_spec,
  );
  return { ...base, object_story_spec: oss };
}

function applyImageHashToObjectStorySpec(
  objectStorySpec: Record<string, unknown>,
  imageHash: string,
): Record<string, unknown> {
  const cloned = { ...objectStorySpec };

  const linkData = cloned["link_data"];
  if (linkData && typeof linkData === "object" && !Array.isArray(linkData)) {
    cloned["link_data"] = {
      ...(linkData as Record<string, unknown>),
      image_hash:
        (linkData as Record<string, unknown>)["image_hash"] ?? imageHash,
    };
  }

  const photoData = cloned["photo_data"];
  if (photoData && typeof photoData === "object" && !Array.isArray(photoData)) {
    cloned["photo_data"] = {
      ...(photoData as Record<string, unknown>),
      image_hash:
        (photoData as Record<string, unknown>)["image_hash"] ?? imageHash,
    };
  }

  return cloned;
}

function applyImageHashToAssetFeedSpec(
  assetFeedSpec: Record<string, unknown>,
  imageHash: string,
): Record<string, unknown> {
  const cloned = { ...assetFeedSpec };
  const images = cloned["images"];
  if (!Array.isArray(images) || images.length === 0) {
    cloned["images"] = [{ hash: imageHash }];
  }
  return cloned;
}

function requireId(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function validateAd(
  ad: BatchAd,
  adPath: string,
  sharedRefs: Set<string>,
  imageHashes: Record<string, string>,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
): void {
  const creativeChoices = [ad.creative_id, ad.creative_ref, ad.creative].filter(
    (value) =>
      value !== undefined &&
      value !== null &&
      (typeof value !== "string" || value.trim() !== ""),
  );
  if (creativeChoices.length !== 1) {
    addError(
      errors,
      adPath,
      "Each ad must provide exactly one creative source: creative_id, creative_ref, or creative.",
    );
  }

  if (ad.creative_ref && !sharedRefs.has(ad.creative_ref)) {
    addError(
      errors,
      `${adPath}.creative_ref`,
      `Unknown creative_ref "${ad.creative_ref}".`,
    );
  }

  if (!ad.creative) {
    return;
  }

  validateCreativeImageKey(
    ad.creative,
    imageHashes,
    `${adPath}.creative`,
    errors,
    warnings,
  );

  let resolvedCreative: ReturnType<typeof resolveCreativeForCreate> | undefined;
  try {
    resolvedCreative = resolveCreativeForCreate(ad.creative, imageHashes);
  } catch (error) {
    addError(
      errors,
      `${adPath}.creative`,
      error instanceof Error
        ? error.message
        : "Invalid creative template fields.",
    );
    return;
  }

  const specError = validateCreativeSpecInputs(
    resolvedCreative.object_story_spec,
    resolvedCreative.asset_feed_spec,
  );
  if (specError) {
    addError(errors, `${adPath}.creative`, specError);
  }

  const ctaError = validateCreativeCallToAction(
    resolvedCreative.object_story_spec,
  );
  if (ctaError) {
    addError(errors, `${adPath}.creative.object_story_spec`, ctaError);
  }
}

function validateAdSet(
  adSet: BatchAdSet,
  adSetPath: string,
  campaignHasBudget: boolean,
  campaignBudget: { daily_budget?: string; lifetime_budget?: string },
  sharedRefs: Set<string>,
  imageHashes: Record<string, string>,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
): void {
  const ageError = validateAdvantageAgeConstraint(adSet.targeting);
  if (ageError) {
    addError(errors, `${adSetPath}.targeting`, ageError);
  }

  const radiusError = validateGeoRadius(adSet.targeting);
  if (radiusError) {
    addError(errors, `${adSetPath}.targeting.geo_locations`, radiusError);
  }

  const promotedWarning = validatePromotedObjectConstraints(
    adSet.optimization_goal,
    adSet.promoted_object,
  );
  if (promotedWarning) {
    addWarning(
      warnings,
      `${adSetPath}.${promotedWarning.field}`,
      promotedWarning.message,
    );
  }

  if (
    adSet.optimization_goal === "EVENT_RESPONSES" &&
    adSet.destination_type !== "ON_EVENT"
  ) {
    addWarning(
      warnings,
      `${adSetPath}.destination_type`,
      "EVENT_RESPONSES ad sets should set destination_type to ON_EVENT.",
    );
  }

  const cboError = validateCboBudgetConstraint(
    campaignBudget,
    createAdSetBudgetForCbo(adSet),
  );
  if (cboError) {
    addError(errors, adSetPath, cboError);
  }

  const hasAdSetBudget =
    adSet.daily_budget !== undefined || adSet.lifetime_budget !== undefined;
  if (!campaignHasBudget && !hasAdSetBudget) {
    addError(
      errors,
      adSetPath,
      "Ad set requires daily_budget or lifetime_budget when campaign has no campaign-level budget.",
    );
  }

  for (const [adIndex, ad] of adSet.ads.entries()) {
    validateAd(
      ad,
      `${adSetPath}.ads[${adIndex}]`,
      sharedRefs,
      imageHashes,
      errors,
      warnings,
    );
  }
}

function validateCampaign(
  campaign: BatchCampaign,
  campaignPath: string,
  sharedRefs: Set<string>,
  imageHashes: Record<string, string>,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
): void {
  const startTzError = validateTimestampTimezone(
    "start_time",
    campaign.start_time,
  );
  if (startTzError) {
    addError(errors, `${campaignPath}.start_time`, startTzError);
  }

  const stopTzError = validateTimestampTimezone(
    "stop_time",
    campaign.stop_time,
  );
  if (stopTzError) {
    addError(errors, `${campaignPath}.stop_time`, stopTzError);
  }

  const campaignHasBudget =
    campaign.daily_budget !== undefined ||
    campaign.lifetime_budget !== undefined;
  if (!campaignHasBudget) {
    addError(
      errors,
      campaignPath,
      "Campaign requires either daily_budget or lifetime_budget in batch config.",
    );
  }

  const stopTimeBudgetError = validateStopTimeBudgetCompatibility(
    campaign.stop_time,
    {
      daily_budget: campaign.daily_budget,
      lifetime_budget: campaign.lifetime_budget,
    },
  );
  if (stopTimeBudgetError) {
    addError(errors, `${campaignPath}.stop_time`, stopTimeBudgetError);
  }

  const filteredCategories = campaign.special_ad_categories?.filter(
    (category) => category !== "NONE",
  );
  if (
    requiresSpecialAdCountry(filteredCategories) &&
    !campaign.special_ad_category_country?.length
  ) {
    addError(
      errors,
      `${campaignPath}.special_ad_category_country`,
      "special_ad_category_country is required when using regulated special ad categories.",
    );
  }

  const campaignBudget = createCampaignBudgetForCbo(campaign);
  for (const [adSetIndex, adSet] of campaign.ad_sets.entries()) {
    validateAdSet(
      adSet,
      `${campaignPath}.ad_sets[${adSetIndex}]`,
      campaignHasBudget,
      campaignBudget,
      sharedRefs,
      imageHashes,
      errors,
      warnings,
    );
  }
}

export function validateConfig(
  config: BatchCampaignConfig,
): BatchValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const imageHashes = config.image_hashes ?? {};
  const sharedCreatives = getSharedCreatives(config);

  if (config.creatives && config.shared_creatives) {
    addError(
      errors,
      "creatives",
      "Provide either creatives or shared_creatives, not both.",
    );
  }
  if (config.creatives && !config.shared_creatives) {
    addWarning(
      warnings,
      "creatives",
      "creatives is deprecated; prefer shared_creatives as the canonical field.",
    );
  }

  const sharedRefCounts = new Map<string, number>();
  for (const [index, sharedCreative] of sharedCreatives.entries()) {
    const pathBase = `shared_creatives[${index}]`;
    let resolvedCreative:
      | ReturnType<typeof resolveCreativeForCreate>
      | undefined;
    try {
      resolvedCreative = resolveCreativeForCreate(sharedCreative, imageHashes);
    } catch (error) {
      addError(
        errors,
        pathBase,
        error instanceof Error
          ? error.message
          : "Invalid creative template fields.",
      );
      continue;
    }

    const specError = validateCreativeSpecInputs(
      resolvedCreative.object_story_spec,
      resolvedCreative.asset_feed_spec,
    );
    if (specError) {
      errors.push({ path: pathBase, message: specError });
    }

    const ctaError = validateCreativeCallToAction(
      resolvedCreative.object_story_spec,
    );
    if (ctaError) {
      errors.push({ path: `${pathBase}.object_story_spec`, message: ctaError });
    }

    validateCreativeImageKey(
      sharedCreative,
      imageHashes,
      pathBase,
      errors,
      warnings,
    );

    sharedRefCounts.set(
      sharedCreative.ref,
      (sharedRefCounts.get(sharedCreative.ref) ?? 0) + 1,
    );
  }

  for (const [ref, count] of sharedRefCounts) {
    if (count > 1) {
      errors.push({
        path: "shared_creatives",
        message: `Duplicate shared creative ref "${ref}". Refs must be unique.`,
      });
    }
  }

  const sharedRefs = new Set(sharedCreatives.map((item) => item.ref));

  for (const [campaignIndex, campaign] of config.campaigns.entries()) {
    validateCampaign(
      campaign,
      `campaigns[${campaignIndex}]`,
      sharedRefs,
      imageHashes,
      errors,
      warnings,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function executeBatch(
  client: MetaClient,
  accountId: string,
  config: BatchCampaignConfig,
  validationWarnings: ValidationMessage[] = [],
): Promise<BatchExecutionResult> {
  const created: CreatedResource[] = [];
  const createdCreativeIds = new Set<string>();
  const refToIdMap = new Map<string, string>();
  const imageHashes = config.image_hashes ?? {};
  const sharedCreatives = getSharedCreatives(config);

  const recordCreative = (id: string, name: string, ref?: string) => {
    if (createdCreativeIds.has(id)) {
      return;
    }
    createdCreativeIds.add(id);
    const creative: CreatedResource = {
      type: "creative",
      id,
      name,
    };
    if (ref) {
      creative.ref = ref;
    }
    created.push(creative);
  };

  const sharedResults = await Promise.allSettled(
    sharedCreatives.map(async (creative) =>
      client.createAdCreative(
        accountId,
        await resolveCreativePayloadForGraph(
          client,
          accountId,
          creative,
          imageHashes,
        ),
      ),
    ),
  );

  for (const [index, result] of sharedResults.entries()) {
    if (result.status === "fulfilled") {
      const source = sharedCreatives[index];
      if (!source) {
        continue;
      }
      refToIdMap.set(source.ref, result.value.id);
      recordCreative(result.value.id, source.name, source.ref);
    }
  }

  const sharedFailure = collectRejections(sharedResults);
  if (sharedFailure) {
    return {
      completed: false,
      created,
      summary: computeSummary(created),
      warnings: validationWarnings,
      error: {
        tier: "shared_creatives",
        message: sharedFailure.message,
        rollback_hints: [
          "Shared creatives may have been created before failure.",
          CREATIVE_ARCHIVAL_ROLLBACK_HINT,
        ],
      },
    };
  }

  const campaignResults = await Promise.allSettled(
    config.campaigns.map((campaign) => {
      const filteredCategories = campaign.special_ad_categories?.filter(
        (category) => category !== "NONE",
      );
      return client.createCampaign(accountId, {
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status ?? "PAUSED",
        special_ad_categories: filteredCategories,
        special_ad_category_country: campaign.special_ad_category_country,
        daily_budget: campaign.daily_budget,
        lifetime_budget: campaign.lifetime_budget,
        bid_strategy: campaign.bid_strategy,
        start_time: campaign.start_time,
        stop_time: campaign.stop_time,
        promoted_object: campaign.promoted_object,
        spend_cap: campaign.spend_cap,
      });
    }),
  );

  const campaignIdByIndex = new Map<number, string>();
  for (const [index, result] of campaignResults.entries()) {
    if (result.status === "fulfilled") {
      const campaign = config.campaigns[index];
      if (!campaign) {
        continue;
      }
      campaignIdByIndex.set(index, result.value.id);
      created.push({
        type: "campaign",
        id: result.value.id,
        name: campaign.name,
      });
    }
  }

  const campaignFailure = collectRejections(campaignResults);
  if (campaignFailure) {
    return {
      completed: false,
      created,
      summary: computeSummary(created),
      warnings: validationWarnings,
      error: {
        tier: "campaigns",
        message: campaignFailure.message,
        rollback_hints: [
          "Some campaigns may have been created before failure.",
          "Archive or delete created campaigns before re-running batch.",
        ],
      },
    };
  }

  const adSetJobs = config.campaigns.flatMap((campaign, campaignIndex) =>
    campaign.ad_sets.map((adSet, adSetIndex) => ({
      campaign,
      campaignIndex,
      adSet,
      adSetIndex,
      campaignId: requireId(
        campaignIdByIndex.get(campaignIndex),
        `Unable to resolve campaign ID for campaign index ${campaignIndex}.`,
      ),
    })),
  );

  const adSetResults = await Promise.allSettled(
    adSetJobs.map((job) =>
      client.createAdSet(accountId, {
        name: job.adSet.name,
        campaign_id: job.campaignId,
        optimization_goal: job.adSet.optimization_goal,
        billing_event: job.adSet.billing_event,
        targeting: job.adSet.targeting,
        status: job.adSet.status ?? "PAUSED",
        daily_budget: job.adSet.daily_budget,
        lifetime_budget: job.adSet.lifetime_budget,
        bid_amount: job.adSet.bid_amount,
        bid_strategy: job.adSet.bid_strategy,
        start_time: job.adSet.start_time,
        end_time: job.adSet.end_time,
        promoted_object: job.adSet.promoted_object,
        destination_type: job.adSet.destination_type,
        is_dynamic_creative: job.adSet.is_dynamic_creative,
        pacing_type: job.adSet.pacing_type,
      }),
    ),
  );

  const adSetIdByKey = new Map<string, string>();
  for (const [index, result] of adSetResults.entries()) {
    if (result.status === "fulfilled") {
      const job = adSetJobs[index];
      if (!job) {
        continue;
      }
      const key = `${job.campaignIndex}:${job.adSetIndex}`;
      adSetIdByKey.set(key, result.value.id);
      created.push({
        type: "ad_set",
        id: result.value.id,
        name: job.adSet.name,
        parent_type: "campaign",
        parent_id: job.campaignId,
      });
    }
  }

  const adSetFailure = collectRejections(adSetResults);
  if (adSetFailure) {
    return {
      completed: false,
      created,
      summary: computeSummary(created),
      warnings: validationWarnings,
      error: {
        tier: "ad_sets",
        message: adSetFailure.message,
        rollback_hints: [
          "Some ad sets may have been created before failure.",
          "Delete partial ad sets and campaigns if full rollback is required.",
        ],
      },
    };
  }

  const adJobs = config.campaigns.flatMap((campaign, campaignIndex) =>
    campaign.ad_sets.flatMap((adSet, adSetIndex) =>
      adSet.ads.map((ad) => ({
        campaignIndex,
        adSetIndex,
        ad,
        adSetId: requireId(
          adSetIdByKey.get(`${campaignIndex}:${adSetIndex}`),
          `Unable to resolve ad set ID for campaign index ${campaignIndex}, ad set index ${adSetIndex}.`,
        ),
      })),
    ),
  );

  type AdJobResult = {
    adId: string;
    adName: string;
    adSetId: string;
    inlineCreativeId?: string | undefined;
    inlineCreativeName?: string | undefined;
  };
  const adResults = await Promise.allSettled(
    adJobs.map(async (job): Promise<AdJobResult> => {
      let creativeId = job.ad.creative_id;

      if (!creativeId && job.ad.creative_ref) {
        creativeId = refToIdMap.get(job.ad.creative_ref);
        if (!creativeId) {
          throw new Error(
            `creative_ref \"${job.ad.creative_ref}\" did not resolve to a shared creative ID.`,
          );
        }
      }

      let inlineCreativeResult: { id: string } | null = null;
      if (!creativeId && job.ad.creative) {
        inlineCreativeResult = await client.createAdCreative(
          accountId,
          await resolveCreativePayloadForGraph(
            client,
            accountId,
            job.ad.creative,
            imageHashes,
          ),
        );
        creativeId = inlineCreativeResult.id;
      }

      if (!creativeId) {
        throw new Error(
          `Ad \"${job.ad.name}\" could not resolve a creative source.`,
        );
      }

      let adResult: { id: string };
      try {
        adResult = await client.createAd(accountId, {
          name: job.ad.name,
          adset_id: job.adSetId,
          creative: { creative_id: creativeId },
          status: job.ad.status ?? "PAUSED",
          ...(job.ad.tracking_specs
            ? { tracking_specs: job.ad.tracking_specs }
            : {}),
        });
      } catch (error) {
        const errorOptions: {
          inlineCreativeId?: string;
          inlineCreativeName?: string;
        } = {};
        if (inlineCreativeResult?.id) {
          errorOptions.inlineCreativeId = inlineCreativeResult.id;
        }
        if (job.ad.creative?.name) {
          errorOptions.inlineCreativeName = job.ad.creative.name;
        }
        throw new AdCreationError(
          error instanceof Error ? error.message : "Failed to create ad.",
          errorOptions,
        );
      }

      return {
        adId: adResult.id,
        adName: job.ad.name,
        adSetId: job.adSetId,
        inlineCreativeId: inlineCreativeResult?.id,
        inlineCreativeName: job.ad.creative?.name,
      };
    }),
  );

  for (const result of adResults) {
    if (result.status === "fulfilled") {
      if (result.value.inlineCreativeId && result.value.inlineCreativeName) {
        recordCreative(
          result.value.inlineCreativeId,
          result.value.inlineCreativeName,
        );
      }
      created.push({
        type: "ad",
        id: result.value.adId,
        name: result.value.adName,
        parent_type: "ad_set",
        parent_id: result.value.adSetId,
      });
      continue;
    }

    if (
      result.reason instanceof AdCreationError &&
      result.reason.inlineCreativeId &&
      result.reason.inlineCreativeName
    ) {
      recordCreative(
        result.reason.inlineCreativeId,
        result.reason.inlineCreativeName,
      );
    }
  }

  const adFailure = collectRejections(adResults);
  if (adFailure) {
    return {
      completed: false,
      created,
      summary: computeSummary(created),
      warnings: validationWarnings,
      error: {
        tier: "ads",
        message: adFailure.message,
        rollback_hints: [
          "Some ads or inline creatives may have been created before failure.",
          "Remove created ads before re-running batch.",
          CREATIVE_ARCHIVAL_ROLLBACK_HINT,
        ],
      },
    };
  }

  return {
    completed: true,
    created,
    summary: computeSummary(created),
    warnings: validationWarnings,
  };
}

export function registerBatchTools(server: McpServer): void {
  server.tool(
    "meta_create_campaign_from_config",
    `Create campaign hierarchy from a structured config in one call.

Creates shared creatives, campaigns, ad sets, and ads in tiered execution.
Link creatives: image_hash in link_data is resolved to picture (adimages URL) before Graph create so Ads Manager previews show the image; do not pass picture and image_hash together in config.
Supports dry-run validation mode for pre-flight checks.

Args:
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - config (object, optional): Batch hierarchy config with campaigns/ad_sets/ads
  - config_path (string, optional): Local path to JSON file containing the config
  - dry_run (boolean, optional): Validate only; do not call Meta API (default: false)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      config: batchCampaignConfigSchema.optional(),
      config_path: z
        .string()
        .optional()
        .describe("Local JSON file path containing batch config"),
      dry_run: z
        .boolean()
        .optional()
        .describe("Validate only without creating resources (default: false)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, config, config_path, dry_run },
        { client, format },
      ) => {
        const normalizedAccountId = normalizeAccountId(account_id);
        const resolvedConfig = await resolveBatchConfigInput(
          config as BatchCampaignConfig | undefined,
          config_path as string | undefined,
        );
        const validation = validateConfig(resolvedConfig);

        if (dry_run) {
          return createSuccessResponse(
            {
              dry_run: true,
              completed: false,
              valid: validation.valid,
              errors: validation.errors,
              warnings: validation.warnings,
              summary: summarizeConfig(resolvedConfig),
            },
            format,
          );
        }

        if (!validation.valid) {
          return createSuccessResponse(
            {
              completed: false,
              created: [],
              summary: { campaigns: 0, ad_sets: 0, creatives: 0, ads: 0 },
              warnings: validation.warnings,
              errors: validation.errors,
              error: {
                tier: "campaigns",
                message: "Batch configuration failed validation.",
                rollback_hints: [
                  "No API calls were made because validation failed pre-flight.",
                  "Run with dry_run: true to inspect errors and warnings.",
                ],
              },
            },
            format,
          );
        }

        const executionResult = await executeBatch(
          client,
          normalizedAccountId,
          resolvedConfig,
          validation.warnings,
        );

        return createSuccessResponse(
          executionResult as unknown as Record<string, unknown>,
          format,
        );
      },
    ),
  );
}
