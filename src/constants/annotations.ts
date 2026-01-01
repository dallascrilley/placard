/**
 * Tool Annotations Constants
 *
 * MCP tool annotations that describe tool behavior to clients.
 * These help LLMs and clients understand whether tools are read-only,
 * destructive, idempotent, and whether they interact with external systems.
 */

// ToolAnnotations type is re-exported from the server/mcp module
// We define the type inline to avoid deep import path issues
interface ToolAnnotations {
  /**
   * If true, the tool does not modify its environment.
   * Default: false
   */
  readOnlyHint?: boolean;
  /**
   * If true, the tool may perform destructive updates.
   * Only meaningful when readOnlyHint is false.
   * Default: true
   */
  destructiveHint?: boolean;
  /**
   * If true, repeated calls with same arguments have no additional effect.
   * Only meaningful when readOnlyHint is false.
   * Default: false
   */
  idempotentHint?: boolean;
  /**
   * If true, the tool may interact with external entities.
   * Default: true
   */
  openWorldHint?: boolean;
}

/**
 * Annotations for read-only tools (get_*, search_*, check_*).
 * These tools only retrieve data and never modify state.
 */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Annotations for create tools (create_*).
 * These tools create new resources and are not idempotent.
 */
export const CREATE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * Annotations for update tools (update_*).
 * These tools modify existing resources and are idempotent.
 */
export const UPDATE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Annotations for the logout tool.
 * Modifies local auth state, doesn't interact with external systems.
 */
export const LOGOUT_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * Annotations for the health check tool.
 * Read-only, local check, no external interaction.
 */
export const HEALTH_CHECK_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
