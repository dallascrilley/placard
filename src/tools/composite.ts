/**
 * Composite Tools
 *
 * High-level MCP tools that compose multiple API calls into single-call workflows.
 * All tools are read-only and do not modify any resources.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MetaClient } from "../api/meta-client.js";
import { READ_ONLY_ANNOTATIONS } from "../constants/index.js";
import {
  accountIdSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import type { ReachEstimate } from "../types/meta-api.js";
import { compareEntities } from "../utils/entity-compare.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import { createSuccessResponse } from "../utils/tool-responses.js";

const DEFAULT_TREE_COMPARE_IGNORE_FIELDS = [
  "id",
  "created_time",
  "updated_time",
  "effective_status",
  "budget_remaining",
  "campaign_id",
  "adset_id",
  "creative.id",
];

interface PairingCandidate {
  source?: Record<string, unknown>;
  target?: Record<string, unknown>;
}
interface PairedEntity extends PairingCandidate {
  key: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shouldIgnorePath(path: string, ignoreFields: Set<string>): boolean {
  for (const field of ignoreFields) {
    if (path === field || path.startsWith(`${field}.`)) {
      return true;
    }
  }
  return false;
}

function pruneForSignature(
  value: unknown,
  ignoreFields: Set<string>,
  path = "",
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => pruneForSignature(item, ignoreFields, path));
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    const keys = Object.keys(value).sort();

    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      if (shouldIgnorePath(nextPath, ignoreFields)) {
        continue;
      }
      output[key] = pruneForSignature(value[key], ignoreFields, nextPath);
    }

    return output;
  }

  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of keys) {
      sorted[key] = stableValue(value[key]);
    }
    return sorted;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function getEntityName(entity: Record<string, unknown>): string {
  const name = entity["name"];
  return typeof name === "string" ? name : "";
}

function calculateComparisonScore(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  ignoreFields: string[],
): number {
  const compared = compareEntities(source, target, { ignoreFields });
  const namePenalty = getEntityName(source) === getEntityName(target) ? 0 : 1;
  return (
    compared.summary.different_fields +
    compared.summary.missing_in_source +
    compared.summary.missing_in_target +
    namePenalty
  );
}

function getEntityId(entity: Record<string, unknown> | undefined): string {
  if (!entity) return "";
  const id = entity["id"];
  return typeof id === "string" ? id : "";
}

function groupAdsByAdSetId(
  ads: Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const ad of ads) {
    const adSetId = ad["adset_id"];
    const key = typeof adSetId === "string" ? adSetId : "__unknown__";
    const existing = grouped.get(key);
    if (existing) {
      existing.push(ad);
    } else {
      grouped.set(key, [ad]);
    }
  }
  return grouped;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: matching heuristics intentionally evaluate multiple candidate dimensions
function pairEntitiesForComparison(
  sourceItems: Record<string, unknown>[],
  targetItems: Record<string, unknown>[],
  ignoreFields: string[],
): PairedEntity[] {
  const ignoreForSignature = new Set([...ignoreFields, "name"]);
  const remainingTargets = targetItems.map((target) => ({
    target,
    used: false,
  }));
  const pairs: PairingCandidate[] = [];

  for (const source of sourceItems) {
    const sourceSignature = stableStringify(
      pruneForSignature(source, ignoreForSignature),
    );

    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remainingTargets.length; i += 1) {
      const candidate = remainingTargets[i];
      if (candidate?.used || !candidate?.target) {
        continue;
      }

      const targetSignature = stableStringify(
        pruneForSignature(candidate.target, ignoreForSignature),
      );
      const signaturePenalty = sourceSignature === targetSignature ? 0 : 2;
      const score =
        calculateComparisonScore(source, candidate.target, ignoreFields) +
        signaturePenalty;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      const matched = remainingTargets[bestIndex];
      if (matched?.target) {
        matched.used = true;
        pairs.push({ source, target: matched.target });
      } else {
        pairs.push({ source });
      }
    } else {
      pairs.push({ source });
    }
  }

  for (const remaining of remainingTargets) {
    if (!remaining.used && remaining.target) {
      pairs.push({ target: remaining.target });
    }
  }

  const keyedPairs = new Map<string, number>();
  return pairs.map((pair) => {
    const sourceName = pair.source ? getEntityName(pair.source) : "";
    const targetName = pair.target ? getEntityName(pair.target) : "";
    const sourceId =
      pair.source && typeof pair.source["id"] === "string"
        ? (pair.source["id"] as string)
        : "";
    const targetId =
      pair.target && typeof pair.target["id"] === "string"
        ? (pair.target["id"] as string)
        : "";
    const baseKey =
      sourceName || targetName || sourceId || targetId || "entity";
    const index = (keyedPairs.get(baseKey) ?? 0) + 1;
    keyedPairs.set(baseKey, index);

    const key = index > 1 ? `${baseKey}#${index}` : baseKey;
    return { ...pair, key } satisfies PairedEntity;
  });
}

async function fetchAllAdSetsForCampaign(
  client: MetaClient,
  accountId: string,
  campaignId: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;

  while (true) {
    const response = await client.getAdSets(accountId, {
      campaign_id: campaignId,
      limit: 100,
      after,
    });
    results.push(...(response.data as unknown as Record<string, unknown>[]));

    const nextCursor = response.paging?.cursors?.after;
    if (!response.paging?.next || !nextCursor || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  return results;
}

async function fetchAllAdsForCampaign(
  client: MetaClient,
  campaignId: string,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;

  while (true) {
    const response = await client.getCampaignAds(campaignId, {
      limit: 100,
      after,
      fields: [
        "id",
        "name",
        "adset_id",
        "campaign_id",
        "status",
        "effective_status",
        "creative{id,body,title}",
      ],
    });
    results.push(...(response.data as unknown as Record<string, unknown>[]));

    const nextCursor = response.paging?.cursors?.after;
    if (!response.paging?.next || !nextCursor || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  return results;
}

function countStatus<T extends string>(items: T[], target: T): number {
  return items.filter((item) => item === target).length;
}

function buildPairwiseComparisons(
  items: Record<string, unknown>[],
  targets: Record<string, unknown>[],
  ignoreFields: string[],
) {
  const pairs = pairEntitiesForComparison(items, targets, ignoreFields);
  const comparisons = pairs.map((pair) => {
    if (!pair.source) {
      return {
        key: pair.key,
        match: false,
        status: "missing_in_source" as const,
        summary: {
          total_compared_fields: 0,
          matched_fields: 0,
          different_fields: 0,
          missing_in_source: 1,
          missing_in_target: 0,
        },
        differences: [],
      };
    }

    if (!pair.target) {
      return {
        key: pair.key,
        match: false,
        status: "missing_in_target" as const,
        summary: {
          total_compared_fields: 0,
          matched_fields: 0,
          different_fields: 0,
          missing_in_source: 0,
          missing_in_target: 1,
        },
        differences: [],
      };
    }

    const compared = compareEntities(pair.source, pair.target, {
      ignoreFields,
    });
    return {
      key: pair.key,
      match: compared.match,
      status: compared.match ? "match" : "different",
      summary: compared.summary,
      differences: compared.differences,
    };
  });

  const statuses = comparisons.map((comparison) => comparison.status);
  return {
    comparisons,
    pairs,
    matched: countStatus(statuses, "match"),
    missingInSource: countStatus(statuses, "missing_in_source"),
    missingInTarget: countStatus(statuses, "missing_in_target"),
    different: countStatus(statuses, "different"),
  };
}

function filterComparisons<T extends { match: boolean }>(
  comparisons: T[],
  includeMatches: boolean,
): T[] {
  if (includeMatches) {
    return comparisons;
  }
  return comparisons.filter((item) => !item.match);
}

function toRecordArray(items: unknown[]): Record<string, unknown>[] {
  return items.filter(isPlainObject) as Record<string, unknown>[];
}

function mergeIgnoreFields(ignoreFields: string[] | undefined): string[] {
  return [...DEFAULT_TREE_COMPARE_IGNORE_FIELDS, ...(ignoreFields ?? [])];
}

export function registerCompositeTools(server: McpServer): void {
  server.tool(
    "meta_get_campaign_summary",
    `Get a full campaign snapshot in one call.

Composes campaign details, campaign ad sets, and campaign ads with creative data into one response payload.

Args:
  - campaign_id (string, required): Campaign ID to summarize
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - include_insights (boolean, optional): Include last_7d campaign insights (default: false)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      campaign_id: z.string().describe("Campaign ID to summarize"),
      account_id: accountIdSchema,
      include_insights: z
        .boolean()
        .optional()
        .describe("Include last_7d campaign insights (default: false)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { campaign_id, account_id, include_insights },
        { client, format },
      ) => {
        const normalizedAccountId = normalizeAccountId(account_id);

        const [campaign, adsetsResponse, adsResponse] = await Promise.all([
          client.getCampaignDetails(campaign_id),
          client.getAdSets(normalizedAccountId, { campaign_id, limit: 100 }),
          client.getCampaignAds(campaign_id, {
            limit: 100,
            fields: [
              "id",
              "name",
              "adset_id",
              "campaign_id",
              "status",
              "effective_status",
              "creative{id,body,title}",
            ],
          }),
        ]);

        const insights = include_insights
          ? ((
              await client.getInsights(campaign_id, {
                date_preset: "last_7d",
                level: "campaign",
                fields: ["impressions", "clicks", "spend", "ctr", "cpc"],
              })
            ).data[0] ?? null)
          : null;

        const adsets = adsetsResponse.data;
        const ads = adsResponse.data;

        const counts = {
          adsets: adsets.length,
          ads: ads.length,
          active_adsets: adsets.filter(
            (adset) => (adset.effective_status ?? adset.status) === "ACTIVE",
          ).length,
          active_ads: ads.filter(
            (ad) => (ad.effective_status ?? ad.status) === "ACTIVE",
          ).length,
        };

        return createSuccessResponse(
          {
            summary: {
              campaign,
              adsets,
              ads,
              insights,
              counts,
            },
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_get_account_overview",
    `Get a high-level account dashboard in one call.

Composes account details, campaign status counts, and optional last_7d account insights for quick workflow orientation.

Args:
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - include_insights (boolean, optional): Include last_7d account-level insights (default: true)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      include_insights: z
        .boolean()
        .optional()
        .describe("Include last_7d account insights (default: true)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async ({ account_id, include_insights }, { client, format }) => {
        const normalizedId = normalizeAccountId(account_id);
        const shouldFetchInsights = include_insights !== false;

        const [account, campaignsResponse, insightsResponse] =
          await Promise.all([
            client.getAccountInfo(normalizedId),
            client.getCampaigns(normalizedId, {
              limit: 100,
              fields: [
                "id",
                "name",
                "status",
                "effective_status",
                "daily_budget",
                "lifetime_budget",
              ],
            }),
            shouldFetchInsights
              ? client.getInsights(normalizedId, {
                  date_preset: "last_7d",
                  level: "account",
                  fields: [
                    "impressions",
                    "clicks",
                    "spend",
                    "ctr",
                    "cpc",
                    "reach",
                  ],
                })
              : Promise.resolve(null),
          ]);

        const campaigns = campaignsResponse.data;
        const byStatus: Record<string, number> = {};
        for (const campaign of campaigns) {
          const status = campaign.effective_status ?? campaign.status;
          byStatus[status] = (byStatus[status] ?? 0) + 1;
        }

        const activeCampaigns = campaigns.filter(
          (campaign) =>
            (campaign.effective_status ?? campaign.status) === "ACTIVE",
        );

        return createSuccessResponse(
          {
            overview: {
              account,
              campaigns: {
                total:
                  campaignsResponse.summary?.total_count ?? campaigns.length,
                by_status: byStatus,
                active_campaigns: activeCampaigns,
              },
              insights_last_7d: insightsResponse?.data[0] ?? null,
            },
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_search_ads",
    `Search for ads by keyword across ad creative body/title text.

Scans ads in an account (optionally narrowed to one campaign), performs case-insensitive matching against creative body/title, and returns only matching ads.

Args:
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - query (string, required): Keyword or phrase to search
  - campaign_id (string, optional): Limit search to a specific campaign ID
  - max_pages (number, optional): Max pages to scan, 1-50 (default: 10)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      query: z.string().min(1).describe("Keyword or phrase to search for"),
      campaign_id: z
        .string()
        .optional()
        .describe("Limit search to a specific campaign ID"),
      max_pages: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum pages to scan (default: 10)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, query, campaign_id, max_pages },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const pageCap = max_pages ?? 10;
        const queryLower = query.toLowerCase();

        const matches: Array<Record<string, unknown>> = [];
        let adsScanned = 0;
        let pagesScanned = 0;
        let afterCursor: string | undefined;
        let hasMore = false;

        while (pagesScanned < pageCap) {
          const response = await client.getAds(normalizedId, {
            limit: 100,
            after: afterCursor,
            campaign_id,
            fields: [
              "id",
              "name",
              "adset_id",
              "campaign_id",
              "status",
              "effective_status",
              "creative{id,body,title}",
            ],
          });

          pagesScanned += 1;
          adsScanned += response.data.length;

          for (const ad of response.data) {
            const body = (ad.creative?.body ?? "").toLowerCase();
            const title = (ad.creative?.title ?? "").toLowerCase();
            const bodyMatch = body.includes(queryLower);
            const titleMatch = title.includes(queryLower);

            if (bodyMatch || titleMatch) {
              const matchIn: string[] = [];
              if (bodyMatch) matchIn.push("body");
              if (titleMatch) matchIn.push("title");

              matches.push({
                ad_id: ad.id,
                ad_name: ad.name,
                campaign_id: ad.campaign_id,
                adset_id: ad.adset_id,
                status: ad.effective_status ?? ad.status,
                creative_body: ad.creative?.body ?? null,
                creative_title: ad.creative?.title ?? null,
                match_in: matchIn.join(","),
              });
            }
          }

          const nextCursor = response.paging?.cursors?.after;
          hasMore = !!response.paging?.next && !!nextCursor;
          if (!hasMore || !nextCursor) {
            break;
          }
          afterCursor = nextCursor;
        }

        return createSuccessResponse(
          {
            query,
            matches,
            total_matches: matches.length,
            total_ads_scanned: adsScanned,
            pages_scanned: pagesScanned,
            has_more: hasMore,
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_validate_campaign_config",
    `Validate a campaign configuration before creation.

Runs dry-run checks without creating anything: budget minimum, objective validity, targeting interest IDs, geo presence, and reach estimate.

Args:
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - name (string, required): Proposed campaign name
  - objective (string, required): Campaign objective (OUTCOME_* format)
  - daily_budget (number, optional): Daily budget in cents
  - lifetime_budget (number, optional): Lifetime budget in cents
  - targeting (object, required): Targeting specification object
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Proposed campaign name"),
      objective: z.string().describe("Campaign objective (OUTCOME_* format)"),
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Daily budget in cents"),
      lifetime_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Lifetime budget in cents"),
      targeting: z
        .record(z.unknown())
        .describe("Targeting specification object"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        {
          account_id,
          name,
          objective,
          daily_budget,
          lifetime_budget,
          targeting,
        },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const errors: Array<{ field: string; message: string }> = [];
        const warnings: Array<{ field: string; message: string }> = [];
        const checks: Array<{ check: string; status: string; detail: string }> =
          [];

        if (!name.trim()) {
          errors.push({ field: "name", message: "Campaign name is required" });
          checks.push({
            check: "name_present",
            status: "fail",
            detail: "Campaign name is empty",
          });
        } else {
          checks.push({
            check: "name_present",
            status: "pass",
            detail: `Campaign name provided (${name.length} chars)`,
          });
        }

        if (daily_budget === undefined && lifetime_budget === undefined) {
          errors.push({
            field: "budget",
            message: "Either daily_budget or lifetime_budget is required",
          });
          checks.push({
            check: "budget_present",
            status: "fail",
            detail: "No daily_budget or lifetime_budget provided",
          });
        } else {
          const budget = daily_budget ?? lifetime_budget ?? 0;
          const budgetType = daily_budget !== undefined ? "Daily" : "Lifetime";
          const budgetDollars = (budget / 100).toFixed(2);

          checks.push({
            check: "budget_present",
            status: "pass",
            detail: `${budgetType} budget provided ($${budgetDollars})`,
          });

          if (budget < 100) {
            errors.push({
              field: "budget",
              message: `${budgetType} budget $${budgetDollars} is below minimum $1.00 (100 cents)`,
            });
            checks.push({
              check: "budget_minimum",
              status: "fail",
              detail: `${budgetType} budget $${budgetDollars} below minimum $1.00`,
            });
          } else {
            checks.push({
              check: "budget_minimum",
              status: "pass",
              detail: `${budgetType} budget $${budgetDollars} meets minimum $1.00`,
            });
          }
        }

        const validObjectives = [
          "OUTCOME_AWARENESS",
          "OUTCOME_ENGAGEMENT",
          "OUTCOME_LEADS",
          "OUTCOME_SALES",
          "OUTCOME_TRAFFIC",
          "OUTCOME_APP_PROMOTION",
        ];
        if (validObjectives.includes(objective)) {
          checks.push({
            check: "objective_valid",
            status: "pass",
            detail: `Objective "${objective}" is valid`,
          });
        } else {
          errors.push({
            field: "objective",
            message: `Invalid objective "${objective}". Must be one of: ${validObjectives.join(", ")}`,
          });
          checks.push({
            check: "objective_valid",
            status: "fail",
            detail: `Invalid objective "${objective}"`,
          });
        }

        const flexSpec = targeting["flexible_spec"];
        if (Array.isArray(flexSpec)) {
          const interestIds: string[] = [];
          for (const spec of flexSpec) {
            if (!spec || typeof spec !== "object") continue;
            const interests = (spec as Record<string, unknown>)["interests"];
            if (!Array.isArray(interests)) continue;
            for (const interest of interests) {
              if (!interest || typeof interest !== "object") continue;
              const id = (interest as Record<string, unknown>)["id"];
              if (typeof id === "string") interestIds.push(id);
            }
          }

          if (interestIds.length > 0) {
            let validCount = 0;
            const invalidIds: string[] = [];

            for (const id of interestIds) {
              try {
                const result = await client.searchTargeting(
                  "adinterestvalid",
                  id,
                  1,
                );
                if (result.data.length > 0) {
                  validCount += 1;
                } else {
                  invalidIds.push(id);
                }
              } catch {
                invalidIds.push(id);
              }
            }

            if (invalidIds.length > 0) {
              errors.push({
                field: "targeting.interests",
                message: `Invalid interest IDs: ${invalidIds.join(", ")}`,
              });
              checks.push({
                check: "interests_valid",
                status: "fail",
                detail: `${validCount}/${interestIds.length} interest IDs valid, invalid: ${invalidIds.join(", ")}`,
              });
            } else {
              checks.push({
                check: "interests_valid",
                status: "pass",
                detail: `${validCount}/${interestIds.length} interest IDs validated`,
              });
            }
          } else {
            checks.push({
              check: "interests_valid",
              status: "pass",
              detail: "No interest IDs provided to validate",
            });
          }
        } else {
          checks.push({
            check: "interests_valid",
            status: "pass",
            detail: "No flexible_spec interests to validate",
          });
        }

        const geoLocations = targeting["geo_locations"];
        if (!geoLocations) {
          errors.push({
            field: "targeting.geo_locations",
            message: "geo_locations is required in targeting",
          });
          checks.push({
            check: "geo_locations",
            status: "fail",
            detail: "Missing geo_locations in targeting",
          });
        } else {
          checks.push({
            check: "geo_locations",
            status: "pass",
            detail: "geo_locations present",
          });
        }

        let reachEstimate: ReachEstimate | null = null;
        try {
          const reach = await client.getReachEstimate(normalizedId, targeting);
          const reachData = reach.data;
          reachEstimate = reachData;

          const lower = Number(reachData.users_lower_bound ?? 0);
          const upper = Number(reachData.users_upper_bound ?? 0);

          checks.push({
            check: "reach_estimate",
            status: "pass",
            detail: `Estimated reach: ${lower.toLocaleString()} - ${upper.toLocaleString()}`,
          });

          if (upper > 0 && upper < 1000) {
            warnings.push({
              field: "targeting",
              message: `Audience is very narrow (${upper.toLocaleString()}). Consider broadening targeting.`,
            });
          } else if (lower > 10_000_000) {
            warnings.push({
              field: "targeting",
              message: `Audience is very broad (${lower.toLocaleString()}+). Consider narrowing targeting.`,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          checks.push({
            check: "reach_estimate",
            status: "warn",
            detail: `Could not estimate reach: ${message}`,
          });
          warnings.push({
            field: "targeting",
            message: `Reach estimate unavailable: ${message}`,
          });
        }

        return createSuccessResponse(
          {
            validation: {
              valid: errors.length === 0,
              errors,
              warnings,
              checks,
              reach_estimate: reachEstimate,
            },
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_compare_campaign_trees",
    `Compare two full campaign trees in a single call.

Fetches campaign details, all ad sets, and all ads for both campaigns, then returns field-level diff summaries for campaign + child entities. This is designed for validating MCP/agent-created campaigns against known-good reference campaign trees.

Args:
  - source_campaign_id (string, required): Reference campaign ID
  - target_campaign_id (string, required): Campaign ID to compare against reference
  - source_account_id (string, required): Ad account ID containing the source campaign
  - target_account_id (string, optional): Ad account ID containing the target campaign (default: source_account_id)
  - ignore_fields (array[string], optional): Additional field paths to ignore in all comparisons
  - include_matches (boolean, optional): Include matching child entities in output (default: false)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      source_campaign_id: z.string().describe("Reference campaign ID"),
      target_campaign_id: z.string().describe("Campaign ID to compare"),
      source_account_id: accountIdSchema,
      target_account_id: accountIdSchema
        .optional()
        .describe("Target account ID (defaults to source_account_id)"),
      ignore_fields: z
        .array(z.string().min(1))
        .optional()
        .describe("Additional field paths to ignore in all comparisons"),
      include_matches: z
        .boolean()
        .optional()
        .describe("Include matching child entities in output (default: false)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        {
          source_campaign_id,
          target_campaign_id,
          source_account_id,
          target_account_id,
          ignore_fields,
          include_matches,
        },
        { client, format },
      ) => {
        const normalizedSourceAccountId = normalizeAccountId(source_account_id);
        const normalizedTargetAccountId = normalizeAccountId(
          target_account_id ?? source_account_id,
        );
        const mergedIgnoreFields = mergeIgnoreFields(ignore_fields);

        const [
          sourceCampaign,
          targetCampaign,
          sourceAdSets,
          targetAdSets,
          sourceAds,
          targetAds,
        ] = await Promise.all([
          client.getCampaignDetails(source_campaign_id),
          client.getCampaignDetails(target_campaign_id),
          fetchAllAdSetsForCampaign(
            client,
            normalizedSourceAccountId,
            source_campaign_id,
          ),
          fetchAllAdSetsForCampaign(
            client,
            normalizedTargetAccountId,
            target_campaign_id,
          ),
          fetchAllAdsForCampaign(client, source_campaign_id),
          fetchAllAdsForCampaign(client, target_campaign_id),
        ]);

        const campaignComparison = compareEntities(
          sourceCampaign as unknown as Record<string, unknown>,
          targetCampaign as unknown as Record<string, unknown>,
          { ignoreFields: mergedIgnoreFields },
        );
        const adSetComparisonResult = buildPairwiseComparisons(
          toRecordArray(sourceAdSets),
          toRecordArray(targetAdSets),
          mergedIgnoreFields,
        );
        const sourceAdsRecords = toRecordArray(sourceAds);
        const targetAdsRecords = toRecordArray(targetAds);
        const sourceAdsByAdSet = groupAdsByAdSetId(sourceAdsRecords);
        const targetAdsByAdSet = groupAdsByAdSetId(targetAdsRecords);
        const consumedSourceAdSetIds = new Set<string>();
        const consumedTargetAdSetIds = new Set<string>();

        const adComparisons: Array<
          (typeof adSetComparisonResult.comparisons)[number]
        > = [];

        let adMatched = 0;
        let adMissingInSource = 0;
        let adMissingInTarget = 0;
        let adDifferent = 0;

        for (const adSetPair of adSetComparisonResult.pairs) {
          const sourceAdSetId = getEntityId(adSetPair.source);
          const targetAdSetId = getEntityId(adSetPair.target);
          if (sourceAdSetId) consumedSourceAdSetIds.add(sourceAdSetId);
          if (targetAdSetId) consumedTargetAdSetIds.add(targetAdSetId);

          const sourceGroup = sourceAdSetId
            ? (sourceAdsByAdSet.get(sourceAdSetId) ?? [])
            : [];
          const targetGroup = targetAdSetId
            ? (targetAdsByAdSet.get(targetAdSetId) ?? [])
            : [];

          const groupResult = buildPairwiseComparisons(
            sourceGroup,
            targetGroup,
            mergedIgnoreFields,
          );

          adMatched += groupResult.matched;
          adMissingInSource += groupResult.missingInSource;
          adMissingInTarget += groupResult.missingInTarget;
          adDifferent += groupResult.different;

          for (const comparison of groupResult.comparisons) {
            adComparisons.push({
              ...comparison,
              key: `${adSetPair.key}::${comparison.key}`,
            });
          }
        }

        // Any remaining ads are attached to ad sets that weren't present in paired ad set results.
        for (const [sourceAdSetId, sourceGroup] of sourceAdsByAdSet.entries()) {
          if (consumedSourceAdSetIds.has(sourceAdSetId)) continue;
          const groupResult = buildPairwiseComparisons(
            sourceGroup,
            [],
            mergedIgnoreFields,
          );
          adMatched += groupResult.matched;
          adMissingInSource += groupResult.missingInSource;
          adMissingInTarget += groupResult.missingInTarget;
          adDifferent += groupResult.different;
          for (const comparison of groupResult.comparisons) {
            adComparisons.push({
              ...comparison,
              key: `orphan_source_adset_${sourceAdSetId}::${comparison.key}`,
            });
          }
        }
        for (const [targetAdSetId, targetGroup] of targetAdsByAdSet.entries()) {
          if (consumedTargetAdSetIds.has(targetAdSetId)) continue;
          const groupResult = buildPairwiseComparisons(
            [],
            targetGroup,
            mergedIgnoreFields,
          );
          adMatched += groupResult.matched;
          adMissingInSource += groupResult.missingInSource;
          adMissingInTarget += groupResult.missingInTarget;
          adDifferent += groupResult.different;
          for (const comparison of groupResult.comparisons) {
            adComparisons.push({
              ...comparison,
              key: `orphan_target_adset_${targetAdSetId}::${comparison.key}`,
            });
          }
        }

        const adComparisonResult = {
          comparisons: adComparisons,
          matched: adMatched,
          missingInSource: adMissingInSource,
          missingInTarget: adMissingInTarget,
          different: adDifferent,
        };

        const includeMatchedEntities = include_matches === true;
        const filteredAdSetComparisons = filterComparisons(
          adSetComparisonResult.comparisons,
          includeMatchedEntities,
        );
        const filteredAdComparisons = filterComparisons(
          adComparisonResult.comparisons,
          includeMatchedEntities,
        );

        const fullMatch =
          campaignComparison.match &&
          adSetComparisonResult.matched ===
            adSetComparisonResult.comparisons.length &&
          adComparisonResult.matched === adComparisonResult.comparisons.length;

        return createSuccessResponse(
          {
            match: fullMatch,
            source_campaign_id,
            target_campaign_id,
            source_account_id: normalizedSourceAccountId,
            target_account_id: normalizedTargetAccountId,
            summary: {
              campaign_match: campaignComparison.match,
              adsets: {
                source_count: sourceAdSets.length,
                target_count: targetAdSets.length,
                compared: adSetComparisonResult.comparisons.length,
                matched: adSetComparisonResult.matched,
                different: adSetComparisonResult.different,
                missing_in_source: adSetComparisonResult.missingInSource,
                missing_in_target: adSetComparisonResult.missingInTarget,
              },
              ads: {
                source_count: sourceAdsRecords.length,
                target_count: targetAdsRecords.length,
                compared: adComparisonResult.comparisons.length,
                matched: adComparisonResult.matched,
                different: adComparisonResult.different,
                missing_in_source: adComparisonResult.missingInSource,
                missing_in_target: adComparisonResult.missingInTarget,
              },
            },
            campaign_comparison: campaignComparison,
            adset_comparisons: filteredAdSetComparisons,
            ad_comparisons: filteredAdComparisons,
          },
          format,
        );
      },
    ),
  );
}
