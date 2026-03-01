import { z } from "zod";
import {
  ADSET_STATUSES,
  BID_STRATEGIES,
  BILLING_EVENTS,
  CAMPAIGN_OBJECTIVES,
  DESTINATION_TYPES,
  OPTIMIZATION_GOALS,
  PACING_TYPES,
  SPECIAL_AD_CATEGORIES,
} from "../constants/index.js";
import {
  dailyBudgetSchema,
  lifetimeBudgetSchema,
  promotedObjectSchema,
  targetingSchema,
} from "./common.js";

const creativeSpecSchema = z
  .object({
    name: z.string().min(1),
    page_id: z.string().optional(),
    link: z.string().url().optional(),
    message: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    call_to_action_type: z.string().optional(),
    image_hash: z.string().min(1).optional(),
    image_key: z
      .string()
      .min(1)
      .optional()
      .describe("Semantic image key resolved via image_hashes map"),
    object_story_spec: z.record(z.unknown()).optional(),
    asset_feed_spec: z.record(z.unknown()).optional(),
    url_tags: z.string().optional(),
    instagram_actor_id: z.string().optional(),
    degrees_of_freedom_spec: z.record(z.unknown()).optional(),
    applink_treatment: z.string().optional(),
  })
  .strict();

const sharedCreativeSchema = creativeSpecSchema.extend({
  ref: z.string().min(1),
});

const adSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    creative_id: z.string().optional(),
    creative_ref: z.string().optional(),
    creative: creativeSpecSchema.optional(),
  })
  .strict()
  .superRefine((ad, ctx) => {
    const chosen = [ad.creative_id, ad.creative_ref, ad.creative].filter(
      (value) => value !== undefined,
    );
    if (chosen.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Each ad must provide exactly one creative source: creative_id, creative_ref, or creative.",
      });
    }
  });

const adSetSchema = z
  .object({
    name: z.string().min(1),
    optimization_goal: z.enum(OPTIMIZATION_GOALS),
    billing_event: z.enum(BILLING_EVENTS),
    targeting: targetingSchema,
    status: z.enum(ADSET_STATUSES).optional(),
    daily_budget: dailyBudgetSchema,
    lifetime_budget: lifetimeBudgetSchema,
    bid_amount: z.number().int().positive().optional(),
    bid_strategy: z.enum(BID_STRATEGIES).optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    promoted_object: promotedObjectSchema,
    destination_type: z.enum(DESTINATION_TYPES).optional(),
    is_dynamic_creative: z.boolean().optional(),
    pacing_type: z.enum(PACING_TYPES).optional(),
    ads: z.array(adSchema).min(1),
  })
  .strict();

const campaignSchema = z
  .object({
    name: z.string().min(1),
    objective: z.enum(CAMPAIGN_OBJECTIVES),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    special_ad_categories: z.array(z.enum(SPECIAL_AD_CATEGORIES)).optional(),
    special_ad_category_country: z.array(z.string().length(2)).optional(),
    daily_budget: dailyBudgetSchema,
    lifetime_budget: lifetimeBudgetSchema,
    bid_strategy: z.enum(BID_STRATEGIES).optional(),
    start_time: z.string().optional(),
    stop_time: z.string().optional(),
    promoted_object: promotedObjectSchema,
    spend_cap: z.number().int().positive().optional(),
    ad_sets: z.array(adSetSchema).min(1),
  })
  .strict();

export const batchCampaignConfigSchema = z
  .object({
    image_hashes: z
      .record(z.string().min(1))
      .optional()
      .describe("Map of semantic image keys to Meta image hashes"),
    creatives: z
      .array(sharedCreativeSchema)
      .optional()
      .describe("Alias for shared_creatives (preferred in show-level configs)"),
    shared_creatives: z.array(sharedCreativeSchema).optional(),
    campaigns: z.array(campaignSchema).min(1).max(10),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.creatives && config.shared_creatives) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["creatives"],
        message: "Provide either creatives or shared_creatives, not both.",
      });
    }
  });

export type BatchCampaignConfig = z.infer<typeof batchCampaignConfigSchema>;
export type BatchSharedCreative = z.infer<typeof sharedCreativeSchema>;
export type BatchCampaignInput = z.infer<typeof campaignSchema>;
export type BatchAdSetInput = z.infer<typeof adSetSchema>;
export type BatchAdInput = z.infer<typeof adSchema>;
