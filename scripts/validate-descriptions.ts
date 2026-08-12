#!/usr/bin/env tsx
/**
 * Validation script for tool descriptions.
 *
 * Checks that all MCP tool descriptions are > 200 characters
 * and reports any that fail validation.
 */

import { readFileSync } from "node:fs";

// Every file that calls server.tool(). Keep this in sync when adding one, or
// the new tool's description silently escapes the length floor.
const TOOL_FILES = [
  "src/server.ts",
  "src/tools/accounts.ts",
  "src/tools/ad-images.ts",
  "src/tools/ads.ts",
  "src/tools/adsets.ts",
  "src/tools/auth.ts",
  "src/tools/batch.ts",
  "src/tools/campaigns.ts",
  "src/tools/composite.ts",
  "src/tools/creatives.ts",
  "src/tools/insights.ts",
  "src/tools/targeting.ts",
];

const MIN_DESCRIPTION_LENGTH = 200;

interface ToolDescription {
  file: string;
  toolName: string;
  description: string;
  length: number;
}

/**
 * Counts consecutive backslashes before a position.
 */
function countPrecedingBackslashes(content: string, pos: number): number {
  let count = 0;
  let i = pos - 1;
  while (i >= 0 && content[i] === "\\") {
    count++;
    i--;
  }
  return count;
}

/**
 * Checks if a character at position is escaped (odd number of preceding backslashes).
 */
function isEscaped(content: string, pos: number): boolean {
  return countPrecedingBackslashes(content, pos) % 2 === 1;
}

/**
 * Unescapes a JavaScript string literal, handling standard escape sequences.
 */
function unescapeString(str: string): string {
  try {
    // Use JSON.parse for robust unescaping (handles \n, \t, \", \\, etc.)
    return JSON.parse(`"${str}"`);
  } catch {
    // Fallback: basic unescape for common sequences
    return str
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }
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
      // Template literal - find the unescaped closing backtick
      let pos = descStartPos;
      while (pos < content.length) {
        if (content[pos] === "`" && !isEscaped(content, pos)) {
          description = content.slice(descStartPos, pos);
          break;
        }
        pos++;
      }
    } else {
      // Regular string - find the unescaped closing quote
      const stringChar = quoteType;
      let pos = descStartPos;
      while (pos < content.length) {
        if (content[pos] === stringChar && !isEscaped(content, pos)) {
          description = content.slice(descStartPos, pos);
          break;
        }
        pos++;
      }
      // Properly unescape the string
      description = unescapeString(description);
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
