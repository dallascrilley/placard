/**
 * Composite Tools
 *
 * High-level MCP tools that compose multiple API calls into single-call workflows.
 * Most tools are read-only; budget phase execution can optionally apply updates.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MetaClient } from "../api/meta-client.js";
import {
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS,
} from "../constants/index.js";
import {
  accountIdSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import type { ReachEstimate } from "../types/meta-api.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import { createSuccessResponse } from "../utils/tool-responses.js";

type VerificationIssueLevel = "error" | "warn";

interface VerificationIssue {
  level: VerificationIssueLevel;
  path: string;
  message: string;
}

const CAMPAIGN_VERIFY_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "bid_strategy",
  "daily_budget",
  "lifetime_budget",
] as const;

const ADSET_VERIFY_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "destination_type",
  "targeting",
] as const;

const AD_VERIFY_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "adset_id",
  "status",
  "effective_status",
] as const;

function issue(
  level: VerificationIssueLevel,
  path: string,
  message: string,
): VerificationIssue {
  return { level, path, message };
}

function readStringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function readFirstStringField(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = readStringField(obj, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function collectCampaignIssues(
  campaign: Record<string, unknown>,
  issues: VerificationIssue[],
): { campaignStatus: string | null; bidStrategy: string | null } {
  const campaignStatus = readFirstStringField(campaign, [
    "effective_status",
    "status",
  ]);
  const bidStrategy = readStringField(campaign, "bid_strategy");
  const dailyBudget = readStringField(campaign, "daily_budget");
  const lifetimeBudget = readStringField(campaign, "lifetime_budget");

  if (!campaignStatus) {
    issues.push(
      issue(
        "error",
        "campaign.effective_status",
        "Campaign status is missing.",
      ),
    );
  }
  if (!bidStrategy) {
    issues.push(
      issue(
        "warn",
        "campaign.bid_strategy",
        "Campaign bid_strategy is missing.",
      ),
    );
  }
  if (!dailyBudget && !lifetimeBudget) {
    issues.push(
      issue(
        "warn",
        "campaign.budget",
        "Campaign has no daily_budget or lifetime_budget configured.",
      ),
    );
  }

  return {
    campaignStatus: campaignStatus ?? null,
    bidStrategy: bidStrategy ?? null,
  };
}

function collectAdSetIssues(
  adSets: Array<Record<string, unknown>>,
  issues: VerificationIssue[],
): void {
  for (const adSet of adSets) {
    const adSetId = readStringField(adSet, "id") ?? "unknown";
    const adSetStatus = readFirstStringField(adSet, [
      "effective_status",
      "status",
    ]);
    const destinationType = readStringField(adSet, "destination_type");

    if (!adSetStatus) {
      issues.push(
        issue(
          "error",
          `ad_sets.${adSetId}.effective_status`,
          "Ad set status is missing.",
        ),
      );
    }
    if (!destinationType) {
      issues.push(
        issue(
          "warn",
          `ad_sets.${adSetId}.destination_type`,
          "Ad set destination_type is missing.",
        ),
      );
    }
    if (!adSet["targeting"]) {
      issues.push(
        issue(
          "error",
          `ad_sets.${adSetId}.targeting`,
          "Ad set targeting is missing.",
        ),
      );
    }
  }
}

function collectAdIssues(
  ads: Array<Record<string, unknown>>,
  issues: VerificationIssue[],
): void {
  for (const ad of ads) {
    const adId = readStringField(ad, "id") ?? "unknown";
    const adStatus = readFirstStringField(ad, ["effective_status", "status"]);
    if (!adStatus) {
      issues.push(
        issue("warn", `ads.${adId}.effective_status`, "Ad status is missing."),
      );
    }
  }
}

async function buildCampaignStructureReport(
  client: MetaClient,
  accountId: string,
  campaignId: string,
) {
  const [campaign, adSetsResponse, adsResponse] = await Promise.all([
    client.getCampaignDetails(campaignId, [...CAMPAIGN_VERIFY_FIELDS]),
    client.getAdSets(accountId, {
      campaign_id: campaignId,
      limit: 100,
      fields: [...ADSET_VERIFY_FIELDS],
    }),
    client.getAds(accountId, {
      campaign_id: campaignId,
      limit: 100,
      fields: [...AD_VERIFY_FIELDS],
    }),
  ]);

  const campaignData = campaign as unknown as Record<string, unknown>;
  const adSetData = adSetsResponse.data as unknown as Array<
    Record<string, unknown>
  >;
  const adData = adsResponse.data as unknown as Array<Record<string, unknown>>;

  const issues: VerificationIssue[] = [];
  const { campaignStatus, bidStrategy } = collectCampaignIssues(
    campaignData,
    issues,
  );
  collectAdSetIssues(adSetData, issues);
  collectAdIssues(adData, issues);

  return {
    campaign_id: campaignId,
    campaign_name: readStringField(campaignData, "name") ?? campaignId,
    campaign_status: campaignStatus,
    bid_strategy: bidStrategy,
    daily_budget: readStringField(campaignData, "daily_budget") ?? null,
    lifetime_budget: readStringField(campaignData, "lifetime_budget") ?? null,
    counts: {
      ad_sets: adSetData.length,
      ads: adData.length,
    },
    issues,
    valid: issues.every((entry) => entry.level !== "error"),
  };
}

interface BudgetPhaseEntry {
  campaign_id: string;
  daily_budget?: number | undefined;
  lifetime_budget?: number | undefined;
  spend_cap?: number | undefined;
}

interface BudgetPhase {
  phase: string;
  effective_date: string;
  updates: BudgetPhaseEntry[];
}

interface CampaignBudgetSnapshot {
  campaign_id: string;
  campaign_name: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
  spend_cap: string | null;
}

interface BudgetPhaseCall {
  effective_date: string;
  phase: string;
  tool: "meta_update_campaign";
  args: {
    campaign_id: string;
    daily_budget?: number | undefined;
    lifetime_budget?: number | undefined;
    spend_cap?: number | undefined;
  };
  checklist_item: string;
}

/** Input is already validated as YYYY-MM-DD by schema */
const toIsoDateLabel = (value: string) => value;

function buildPhaseUpdateCalls(phases: BudgetPhase[]): BudgetPhaseCall[] {
  return phases.flatMap((phase) =>
    phase.updates.map((update) => ({
      effective_date: toIsoDateLabel(phase.effective_date),
      phase: phase.phase,
      tool: "meta_update_campaign",
      args: {
        campaign_id: update.campaign_id,
        daily_budget: update.daily_budget,
        lifetime_budget: update.lifetime_budget,
        spend_cap: update.spend_cap,
      },
      checklist_item: `On ${toIsoDateLabel(phase.effective_date)} apply ${phase.phase} budget update to campaign ${update.campaign_id}`,
    })),
  );
}

async function executePhaseUpdateCalls(
  client: MetaClient,
  phaseCalls: BudgetPhaseCall[],
): Promise<{
  requested: number;
  succeeded: number;
  failed: number;
  results: Array<{
    phase: string;
    effective_date: string;
    campaign_id: string;
    success: boolean;
    error?: string;
  }>;
}> {
  const results: Array<{
    phase: string;
    effective_date: string;
    campaign_id: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const call of phaseCalls) {
    const base = {
      phase: call.phase,
      effective_date: call.effective_date,
      campaign_id: call.args.campaign_id,
    };
    try {
      await client.updateCampaign(call.args.campaign_id, {
        daily_budget: call.args.daily_budget,
        lifetime_budget: call.args.lifetime_budget,
        spend_cap: call.args.spend_cap,
      });
      results.push({ ...base, success: true });
    } catch (error) {
      results.push({
        ...base,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const succeeded = results.filter((result) => result.success).length;
  return {
    requested: phaseCalls.length,
    succeeded,
    failed: phaseCalls.length - succeeded,
    results,
  };
}

async function loadCampaignBudgetSnapshots(
  client: MetaClient,
  campaignIds: string[],
): Promise<Record<string, CampaignBudgetSnapshot>> {
  const settled = await Promise.allSettled(
    campaignIds.map((campaignId) =>
      client.getCampaignDetails(campaignId, [
        "id",
        "name",
        "daily_budget",
        "lifetime_budget",
        "spend_cap",
      ]),
    ),
  );

  const snapshots: Record<string, CampaignBudgetSnapshot> = {};
  for (const [index, entry] of settled.entries()) {
    if (entry.status === "rejected") {
      const campaignId = campaignIds[index];
      console.warn(
        `Could not load campaign ${campaignId} for budget comparison:`,
        entry.reason,
      );
      continue;
    }
    const campaign = entry.value;
    const campaignData = campaign as unknown as Record<string, unknown>;
    const campaignId = readStringField(campaignData, "id");
    if (!campaignId) {
      continue;
    }
    snapshots[campaignId] = {
      campaign_id: campaignId,
      campaign_name: readStringField(campaignData, "name") ?? campaignId,
      daily_budget: readStringField(campaignData, "daily_budget") ?? null,
      lifetime_budget: readStringField(campaignData, "lifetime_budget") ?? null,
      spend_cap: readStringField(campaignData, "spend_cap") ?? null,
    };
  }

  return snapshots;
}

function collectBudgetPhaseWarnings(
  phases: BudgetPhase[],
  snapshots: Record<string, CampaignBudgetSnapshot>,
): string[] {
  const warnings: string[] = [];
  for (const phase of phases) {
    for (const update of phase.updates) {
      const snapshot = snapshots[update.campaign_id];
      if (!snapshot) {
        warnings.push(
          `Campaign ${update.campaign_id} could not be loaded for live-budget comparison.`,
        );
        continue;
      }
      if (
        update.daily_budget !== undefined &&
        snapshot.daily_budget === String(update.daily_budget)
      ) {
        warnings.push(
          `Phase "${phase.phase}" keeps daily_budget unchanged for campaign ${update.campaign_id}.`,
        );
      }
      if (
        update.lifetime_budget !== undefined &&
        snapshot.lifetime_budget === String(update.lifetime_budget)
      ) {
        warnings.push(
          `Phase "${phase.phase}" keeps lifetime_budget unchanged for campaign ${update.campaign_id}.`,
        );
      }
      if (
        update.spend_cap !== undefined &&
        snapshot.spend_cap === String(update.spend_cap)
      ) {
        warnings.push(
          `Phase "${phase.phase}" keeps spend_cap unchanged for campaign ${update.campaign_id}.`,
        );
      }
    }
  }
  return warnings;
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
    "meta_verify_campaign_structure",
    `Verify campaign hierarchy structure and key config fields.

Fetches each campaign, its ad sets, and its ads, then reports structural/config mismatches.

Args:
  - campaign_ids (array[string], required): Campaign IDs to verify
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      campaign_ids: z
        .array(z.string().min(1))
        .min(1)
        .max(25)
        .describe("Campaign IDs to verify"),
      account_id: accountIdSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async ({ campaign_ids, account_id }, { client, format }) => {
        const normalizedId = normalizeAccountId(account_id);
        const reports = await Promise.all(
          campaign_ids.map((campaignId: string) =>
            buildCampaignStructureReport(client, normalizedId, campaignId),
          ),
        );

        return createSuccessResponse(
          {
            verification: {
              campaigns_checked: campaign_ids.length,
              valid_campaigns: reports.filter((report) => report.valid).length,
              reports,
            },
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_generate_budget_phase_plan",
    `Generate dated campaign budget phase transitions and exact update calls.

Creates a phased checklist and meta_update_campaign call payloads from planned budget phases.
Optionally validates current live campaign budgets to highlight unchanged updates.
Optionally executes all generated updates immediately.

Args:
  - account_id (string, required): Ad account ID (with or without act_ prefix)
  - phases (array, required): Ordered budget phases with effective_date and campaign updates
  - validate_live (boolean, optional): Fetch live campaign budgets for comparison (default: true)
  - execute_now (boolean, optional): Execute generated updates immediately (default: false)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      phases: z
        .array(
          z.object({
            phase: z.string().min(1),
            effective_date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
            updates: z
              .array(
                z
                  .object({
                    campaign_id: z.string().min(1),
                    daily_budget: z.number().int().positive().optional(),
                    lifetime_budget: z.number().int().positive().optional(),
                    spend_cap: z.number().int().positive().optional(),
                  })
                  .refine(
                    (update) =>
                      update.daily_budget !== undefined ||
                      update.lifetime_budget !== undefined ||
                      update.spend_cap !== undefined,
                    {
                      message:
                        "Each update must include at least one of daily_budget, lifetime_budget, or spend_cap.",
                    },
                  ),
              )
              .min(1),
          }),
        )
        .min(1),
      validate_live: z
        .boolean()
        .optional()
        .describe("Fetch live campaign budgets for comparison (default: true)"),
      execute_now: z
        .boolean()
        .optional()
        .describe(
          "Execute generated update calls immediately (default: false)",
        ),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    UPDATE_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, phases, validate_live, execute_now },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const phaseCalls = buildPhaseUpdateCalls(phases as BudgetPhase[]);
        const uniqueCampaignIds = Array.from(
          new Set(
            (phases as BudgetPhase[]).flatMap((phase) =>
              phase.updates.map((update) => update.campaign_id),
            ),
          ),
        );
        const shouldValidateLive = validate_live ?? true;
        const snapshots = shouldValidateLive
          ? await loadCampaignBudgetSnapshots(client, uniqueCampaignIds)
          : {};
        const warnings = shouldValidateLive
          ? collectBudgetPhaseWarnings(phases as BudgetPhase[], snapshots)
          : [];
        const execution = execute_now
          ? await executePhaseUpdateCalls(client, phaseCalls)
          : null;

        return createSuccessResponse(
          {
            phase_plan: {
              account_id: normalizedId,
              phases: phases.length,
              campaigns: uniqueCampaignIds.length,
              generated_calls: phaseCalls.length,
              execution_timezone_note:
                "Execute each effective_date using the ad account timezone (not local system time), because Meta budget resets and scheduled updates follow the account timezone.",
              calls: phaseCalls,
              current_budgets: snapshots,
              warnings,
              execution,
            },
          },
          format,
        );
      },
    ),
  );
}
