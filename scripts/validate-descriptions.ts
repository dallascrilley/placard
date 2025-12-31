#!/usr/bin/env tsx
/**
 * Validation script for tool descriptions.
 *
 * Checks that all MCP tool descriptions are > 200 characters
 * and reports any that fail validation.
 */

import { readFileSync } from "node:fs";

const TOOL_FILES = [
  "src/tools/auth.ts",
  "src/tools/accounts.ts",
  "src/tools/campaigns.ts",
  "src/tools/adsets.ts",
  "src/tools/ads.ts",
  "src/tools/creatives.ts",
  "src/tools/targeting.ts",
  "src/tools/insights.ts",
];

const MIN_DESCRIPTION_LENGTH = 200;

interface ToolDescription {
  file: string;
  toolName: string;
  description: string;
  length: number;
}

function extractToolDescriptions(filePath: string): ToolDescription[] {
  const content = readFileSync(filePath, "utf-8");
  const results: ToolDescription[] = [];

  // Match server.tool() calls with both regular strings and template literals
  // This regex handles: server.tool("name", "desc") or server.tool("name", `desc`)
  const toolPattern =
    /server\.tool\s*\(\s*["']([^"']+)["']\s*,\s*([`"'])/g;

  let match;
  while ((match = toolPattern.exec(content)) !== null) {
    const toolName = match[1];
    const quoteType = match[2];
    const descStartPos = match.index + match[0].length;
    let description = "";

    if (quoteType === "`") {
      // Template literal - find the closing backtick
      let pos = descStartPos;
      while (pos < content.length) {
        if (content[pos] === "`" && (pos === 0 || content[pos - 1] !== "\\")) {
          description = content.slice(descStartPos, pos);
          break;
        }
        pos++;
      }
    } else {
      // Regular string - find the closing quote
      const stringChar = quoteType;
      let pos = descStartPos;
      while (pos < content.length) {
        if (
          content[pos] === stringChar &&
          (pos === 0 || content[pos - 1] !== "\\")
        ) {
          description = content.slice(descStartPos, pos);
          break;
        }
        pos++;
      }
      // Unescape the string
      description = description.replace(/\\(.)/g, "$1");
    }

    if (description) {
      results.push({
        file: filePath,
        toolName,
        description,
        length: description.length,
      });
    }
  }

  return results;
}

function validateDescriptions(): boolean {
  const allDescriptions: ToolDescription[] = [];
  const failures: ToolDescription[] = [];

  // Extract descriptions from all tool files
  for (const file of TOOL_FILES) {
    try {
      const descriptions = extractToolDescriptions(file);
      allDescriptions.push(...descriptions);
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
      return false;
    }
  }

  // Check each description
  for (const desc of allDescriptions) {
    if (desc.length <= MIN_DESCRIPTION_LENGTH) {
      failures.push(desc);
    }
  }

  // Report results
  console.log(`\nTool Description Validation\n${"=".repeat(50)}\n`);
  console.log(`Total tools found: ${allDescriptions.length}`);
  console.log(`Minimum required length: ${MIN_DESCRIPTION_LENGTH} characters\n`);

  if (failures.length === 0) {
    console.log("✅ All descriptions meet the minimum length requirement!\n");
    return true;
  }

  console.log(`❌ ${failures.length} description(s) are too short:\n`);

  for (const failure of failures) {
    console.log(`  ${failure.toolName} (${failure.length} chars)`);
    console.log(`    File: ${failure.file}`);
    console.log(`    Preview: ${failure.description.slice(0, 100)}...\n`);
  }

  return false;
}

// Run validation
const success = validateDescriptions();
process.exit(success ? 0 : 1);
