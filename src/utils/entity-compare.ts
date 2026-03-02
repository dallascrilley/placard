export type CompareDifferenceStatus =
  | "different"
  | "missing_in_source"
  | "missing_in_target";

export interface CompareDifference {
  field: string;
  status: CompareDifferenceStatus;
  source_value?: unknown;
  target_value?: unknown;
}

export interface CompareResult {
  match: boolean;
  summary: {
    total_compared_fields: number;
    matched_fields: number;
    different_fields: number;
    missing_in_source: number;
    missing_in_target: number;
  };
  differences: CompareDifference[];
}

interface CompareOptions {
  ignoreFields?: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }

  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const normalized: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      normalized[key] = stableValue(value[key]);
    }

    return normalized;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function shouldIgnore(path: string, ignoreFields: Set<string>): boolean {
  for (const ignore of ignoreFields) {
    if (path === ignore || path.startsWith(`${ignore}.`)) {
      return true;
    }
  }

  return false;
}

function flattenRecord(
  input: Record<string, unknown>,
  ignoreFields: Set<string>,
  pathPrefix = "",
  output: Record<string, unknown> = {},
): Record<string, unknown> {
  const keys = Object.keys(input).sort();

  for (const key of keys) {
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (shouldIgnore(path, ignoreFields)) {
      continue;
    }

    const value = input[key];

    if (isPlainObject(value)) {
      const nestedKeys = Object.keys(value);
      if (nestedKeys.length === 0) {
        output[path] = value;
      } else {
        flattenRecord(value, ignoreFields, path, output);
      }
      continue;
    }

    output[path] = value;
  }

  return output;
}

export function compareEntities(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  options: CompareOptions = {},
): CompareResult {
  const ignoreFields = new Set(options.ignoreFields ?? []);

  const flattenedSource = flattenRecord(source, ignoreFields);
  const flattenedTarget = flattenRecord(target, ignoreFields);

  const allFields = Array.from(
    new Set([...Object.keys(flattenedSource), ...Object.keys(flattenedTarget)]),
  ).sort();

  const differences: CompareDifference[] = [];
  let matchedFields = 0;
  let missingInSource = 0;
  let missingInTarget = 0;

  for (const field of allFields) {
    const hasSource = Object.prototype.hasOwnProperty.call(
      flattenedSource,
      field,
    );
    const hasTarget = Object.prototype.hasOwnProperty.call(
      flattenedTarget,
      field,
    );

    if (!hasSource && hasTarget) {
      missingInSource += 1;
      differences.push({
        field,
        status: "missing_in_source",
        target_value: flattenedTarget[field],
      });
      continue;
    }

    if (hasSource && !hasTarget) {
      missingInTarget += 1;
      differences.push({
        field,
        status: "missing_in_target",
        source_value: flattenedSource[field],
      });
      continue;
    }

    const sourceValue = flattenedSource[field];
    const targetValue = flattenedTarget[field];

    if (stableStringify(sourceValue) === stableStringify(targetValue)) {
      matchedFields += 1;
      continue;
    }

    differences.push({
      field,
      status: "different",
      source_value: sourceValue,
      target_value: targetValue,
    });
  }

  return {
    match: differences.length === 0,
    summary: {
      total_compared_fields: allFields.length,
      matched_fields: matchedFields,
      different_fields: differences.filter((d) => d.status === "different")
        .length,
      missing_in_source: missingInSource,
      missing_in_target: missingInTarget,
    },
    differences,
  };
}
