/**
 * Tree Helpers - Protocol-level tree operation utilities
 *
 * These helpers execute WorkspaceProtocol requests directly via the browser's
 * WebSocket service, enabling protocol-level testing of tree operations.
 */

import type { Page } from 'playwright';
import { sleep } from './utils.js';
import { isVisibleWithin } from './utils.js';

// ============================================================================
// Types
// ============================================================================

export type NodeEntityType = 'Workspace' | { Child: string };

export interface DomainNode {
  id: string;
  parent_id: string | null;
  entity_type: NodeEntityType;
  depth: number;
  name: string;
  description: string;
  owner_id: string;
  members: string[];
  children: string[];
  mdx_content: string;
  rules: string | null;
  chat_enabled: boolean;
  chat_channel_id: string | null;
  metadata: number[];
  allowed_child_types: string[] | null;
  is_default: boolean;
  created_at: bigint;
  updated_at: bigint;
}

export interface TreeNode {
  node: DomainNode;
  children: TreeNode[];
}

export interface EntityTypeConfig {
  type_name: string;
  icon: string;
  label: string;
  plural_label: string;
  name_placeholder: string;
  description_placeholder: string;
}

export interface TreeSchema {
  id: string;
  name: string;
  rules: NestingRule[];
  max_depth: number | null;
  entity_type_configs: EntityTypeConfig[];
}

export interface NestingRule {
  parent_type: string;
  allowed_child_types: string[];
}

export interface CustomNodeType {
  name: string;
  display_name: string;
  icon: string | null;
  allowed_parents: string[];
}

export interface WorkspaceProtocolResponse {
  Node?: DomainNode;
  Nodes?: DomainNode[];
  TreeStructure?: { root: TreeNode };
  TreeSchema?: TreeSchema;
  NodeTypes?: CustomNodeType[];
  NodeDeleted?: { node_id: string; children_deleted: string[] };
  NodeMoved?: { node_id: string; old_parent_id: string | null; new_parent_id: string | null };
  Success?: string;
  Error?: string;
  Workspace?: { id: string; name: string };
}

export interface CreateNodeResult {
  success: boolean;
  nodeId?: string;
  node?: DomainNode;
  error?: string;
}

export interface MoveNodeResult {
  success: boolean;
  oldParentId?: string | null;
  newParentId?: string | null;
  error?: string;
}

export interface DeleteNodeResult {
  success: boolean;
  childrenDeleted?: string[];
  error?: string;
}

// ============================================================================
// Protocol Request Execution
// ============================================================================

/**
 * Execute a WorkspaceProtocol request via the browser's WebSocket service.
 * Uses the exposed __workspaceService or direct WebSocket communication.
 */
export async function executeTreeProtocolRequest(
  page: Page,
  request: Record<string, unknown> | string
): Promise<WorkspaceProtocolResponse | null> {
  console.log(`  [Protocol] Executing:`, JSON.stringify(request).substring(0, 150));

  try {
    const result = await page.evaluate(async (req) => {
      return new Promise<WorkspaceProtocolResponse>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ Error: 'Protocol request timed out after 15s' });
        }, 15000);

        // Try to access workspace service
        const wsService = (window as unknown as Record<string, unknown>).__workspaceService as {
          sendRequest?: (payload: unknown) => Promise<unknown>;
          executeProtocolRequest?: (request: unknown) => Promise<unknown>;
        } | undefined;

        if (wsService?.sendRequest) {
          // Send the raw request directly - don't wrap in { Request: ... }
          wsService.sendRequest(req)
            .then((response) => {
              clearTimeout(timeout);
              resolve(response as WorkspaceProtocolResponse);
            })
            .catch((err) => {
              clearTimeout(timeout);
              resolve({ Error: String(err) });
            });
          return;
        }

        // Alternative: Use custom event-based communication
        const responseHandler = (event: CustomEvent<WorkspaceProtocolResponse>) => {
          clearTimeout(timeout);
          window.removeEventListener('workspace-protocol-response', responseHandler as EventListener);
          resolve(event.detail);
        };

        window.addEventListener('workspace-protocol-response', responseHandler as EventListener);

        // Dispatch request event
        window.dispatchEvent(new CustomEvent('workspace-protocol-request', {
          detail: { Request: req }
        }));

        // If no response after 5s via events, try direct evaluation
        setTimeout(() => {
          window.removeEventListener('workspace-protocol-response', responseHandler as EventListener);
          resolve({ Error: 'No workspace service available' });
        }, 5000);
      });
    }, request as Record<string, unknown>);

    if (result?.Error) {
      console.log(`  [Protocol] Error:`, result.Error);
    } else {
      console.log(`  [Protocol] Success`);
    }

    return result;
  } catch (error) {
    console.log(`  [Protocol] Exception:`, error);
    return { Error: String(error) };
  }
}

// ============================================================================
// Node CRUD Operations
// ============================================================================

/**
 * Create a node via protocol (not UI).
 * Returns the created node ID on success.
 */
export async function createNodeViaProtocol(
  page: Page,
  parentId: string | null,
  entityType: NodeEntityType,
  name: string,
  description: string = ''
): Promise<CreateNodeResult> {
  const request = {
    CreateNode: {
      parent_id: parentId,
      entity_type: entityType,
      name,
      description,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);

  if (response?.Node) {
    return {
      success: true,
      nodeId: response.Node.id,
      node: response.Node,
    };
  }

  return {
    success: false,
    error: response?.Error || 'Unknown error creating node',
  };
}

/**
 * Get a single node by ID.
 */
export async function getNodeViaProtocol(
  page: Page,
  nodeId: string
): Promise<DomainNode | null> {
  const request = {
    GetNode: { node_id: nodeId }
  };

  const response = await executeTreeProtocolRequest(page, request);
  return response?.Node || null;
}

/**
 * Update a node's properties.
 */
export async function updateNodeViaProtocol(
  page: Page,
  nodeId: string,
  updates: {
    name?: string;
    description?: string;
    mdx_content?: string;
    rules?: string;
    chat_enabled?: boolean;
  }
): Promise<DomainNode | null> {
  const request = {
    UpdateNode: {
      node_id: nodeId,
      ...updates,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);
  return response?.Node || null;
}

/**
 * Move a node to a new parent.
 */
export async function moveNodeViaProtocol(
  page: Page,
  nodeId: string,
  newParentId: string | null
): Promise<MoveNodeResult> {
  const request = {
    MoveNode: {
      node_id: nodeId,
      new_parent_id: newParentId,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);

  if (response?.NodeMoved) {
    return {
      success: true,
      oldParentId: response.NodeMoved.old_parent_id,
      newParentId: response.NodeMoved.new_parent_id,
    };
  }

  return {
    success: false,
    error: response?.Error || 'Unknown error moving node',
  };
}

/**
 * Delete a node.
 * @param cascade - If true, delete all descendants. If false, fail if node has children.
 */
export async function deleteNodeViaProtocol(
  page: Page,
  nodeId: string,
  cascade: boolean
): Promise<DeleteNodeResult> {
  const request = {
    DeleteNode: {
      node_id: nodeId,
      cascade,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);

  if (response?.NodeDeleted) {
    return {
      success: true,
      childrenDeleted: response.NodeDeleted.children_deleted,
    };
  }

  if (response?.Success) {
    return {
      success: true,
      childrenDeleted: [],
    };
  }

  return {
    success: false,
    error: response?.Error || 'Unknown error deleting node',
  };
}

/**
 * List nodes with optional filters.
 */
export async function listNodesViaProtocol(
  page: Page,
  options: {
    parentId?: string;
    depth?: number;
    entityTypes?: NodeEntityType[];
  } = {}
): Promise<DomainNode[]> {
  const request = {
    ListNodes: {
      parent_id: options.parentId,
      depth: options.depth,
      entity_types: options.entityTypes,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);
  return response?.Nodes || [];
}

// ============================================================================
// Tree Structure Operations
// ============================================================================

/**
 * Get the full tree structure.
 */
export async function getTreeStructure(
  page: Page,
  rootId?: string,
  maxDepth?: number
): Promise<TreeNode | null> {
  const request = {
    GetTreeStructure: {
      root_id: rootId,
      max_depth: maxDepth,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);
  return response?.TreeStructure?.root || null;
}

/**
 * Get the workspace root ID from the current context.
 * Supports multiple workspaces per server by detecting the workspace ID from URL or context.
 */
export async function getWorkspaceRootId(page: Page): Promise<string | null> {
  console.log('  [Tree] Searching for workspace root ID...');

  // Try to get from workspace context or localStorage
  const result = await page.evaluate(() => {
    // Try workspace context
    const ctx = (window as unknown as Record<string, unknown>).__workspaceContext as {
      workspace?: { id: string };
    } | undefined;

    if (ctx?.workspace?.id) {
      return { id: ctx.workspace.id, source: 'context' };
    }

    // Try localStorage/sessionStorage
    const stored = localStorage.getItem('currentWorkspace') ||
      sessionStorage.getItem('currentWorkspace');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.id) return { id: parsed.id, source: 'localStorage' };
        if (parsed.workspaceId) return { id: parsed.workspaceId, source: 'localStorage' };
      } catch {
        if (stored.match(/^[a-f0-9-]{36}$/i)) {
          return { id: stored, source: 'localStorage-raw' };
        }
      }
    }

    // Try to find workspace ID from DOM
    const wsElement = document.querySelector('[data-workspace-id]');
    if (wsElement) {
      const id = wsElement.getAttribute('data-workspace-id');
      if (id) return { id, source: 'dom-attribute' };
    }

    // Try to find any UUID in data attributes that looks like a workspace ID
    const allElements = Array.from(document.querySelectorAll('[data-id]'));
    for (const el of allElements) {
      const id = el.getAttribute('data-id');
      if (id && id.match(/^[a-f0-9-]{36}$/i)) {
        return { id, source: 'dom-data-id' };
      }
    }

    return { id: null, source: 'not-found' };
  });

  if (result?.id) {
    console.log(`  [Tree] Found workspace root ID: ${result.id} (via ${result.source})`);
    return result.id;
  }

  // Fallback: Get from URL (supports multiple workspaces)
  const url = page.url();
  const match = url.match(/workspace[/=]([a-f0-9-]{36})/i);
  if (match) {
    console.log(`  [Tree] Extracted workspace ID from URL: ${match[1]}`);
    return match[1];
  }

  // Final fallback: Use the default workspace-root constant for single-workspace servers
  console.log('  [Tree] Using default workspace-root ID');
  return 'workspace-root';
}

// ============================================================================
// UI-Based Node Operations (Use these instead of protocol-level ones)
// ============================================================================

/**
 * Create a top-level node (e.g. office) via the hierarchy sidebar UI.
 * Uses the generic `add-node-button` testid from TreeNodesSection.
 */
export async function createOfficeViaUI(
  page: Page,
  name: string,
  description: string = ''
): Promise<{ success: boolean; name: string }> {
  console.log(`  [UI] Creating top-level node: ${name}`);

  try {
    // The hierarchy sidebar uses add-node-button for top-level node creation
    const addBtnSelectors = [
      '[data-testid="add-node-button"]',
      '[data-testid="add-root-node-button"]',
    ];

    let addBtn = null;
    for (const selector of addBtnSelectors) {
      const btn = page.locator(selector).first();
      // waitFor, not isVisible({ timeout }) — Playwright ignores the timeout on
      // isVisible, making it an immediate snapshot.
      const visible = await btn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      if (visible) {
        addBtn = btn;
        console.log(`  [UI] Found Add Node button with selector: ${selector}`);
        break;
      }
    }

    // The button is disabled until the workspace tree schema arrives — creating a
    // node needs it to know which child types are allowed. Clicking early opened
    // no modal and raised a "schema is still loading" toast instead, which is
    // exactly the race this helper used to lose.
    if (addBtn) {
      await addBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      const enabled = await addBtn
        .evaluate((el: HTMLButtonElement) => !el.disabled)
        .catch(() => true);
      if (!enabled) {
        console.log('  [UI] Waiting for workspace schema before creating a node...');
        await page
          .locator(`${addBtnSelectors[0]}:not([disabled])`)
          .waitFor({ state: 'visible', timeout: 30_000 })
          .catch(() => undefined);
      }
    }

    if (!addBtn) {
      console.log('  [UI] Add node button not found');
      return { success: false, name };
    }

    await addBtn.click();
    await sleep(500);

    // Fill the form (use id selector since the input has id="name")
    const nameInput = page.locator('input#name, input[id="name"]').first();
    if (!await isVisibleWithin(nameInput, 2000)) {
      console.log('  [UI] Name input not found');
      await page.keyboard.press('Escape');
      return { success: false, name };
    }

    await nameInput.fill(name);

    if (description) {
      const descInput = page.locator('textarea#description, textarea[id="description"]').first();
      if (await isVisibleWithin(descInput, 1000)) {
        await descInput.fill(description);
      }
    }

    await sleep(300);

    // Submit - NodeManagementModal uses "Create {EntityType}" as button text
    const createBtn = page.locator('button:has-text("Create")').first();
    if (await isVisibleWithin(createBtn, 2000)) {
      await createBtn.click();
      await sleep(2000);

      // Verify creation. waitFor, not isVisible({ timeout }) — see nodeExistsInUI.
      const exists = await sidebarNode(page, name)
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      console.log(`  [UI] Node "${name}" created: ${exists}`);
      return { success: exists, name };
    }

    console.log('  [UI] Create button not found');
    await page.keyboard.press('Escape');
    return { success: false, name };
  } catch (error) {
    console.log(`  [UI] Error creating node: ${error}`);
    return { success: false, name };
  }
}

/**
 * Create a child node (e.g. room) via UI by using the parent node's "create child" menu item.
 * The parent node must be visible and expanded in the hierarchy sidebar.
 * @param parentName - Name of the parent node to find in the sidebar (required for reliable operation)
 */
export async function createRoomViaUI(
  page: Page,
  name: string,
  description: string = '',
  parentName?: string
): Promise<{ success: boolean; name: string }> {
  console.log(`  [UI] Creating child node: ${name}${parentName ? ` (parent: ${parentName})` : ''}`);

  try {
    // Close any stale menus/modals first
    await page.keyboard.press('Escape');
    await sleep(300);

    // Find the parent node's menu button by searching sidebar items
    const menuTestId = await page.evaluate((pName: string | undefined) => {
      const buttons = Array.from(document.querySelectorAll('[data-sidebar="menu-button"]'));
      for (const btn of buttons) {
        if (pName && !btn.textContent?.includes(pName)) continue;
        const parent = btn.closest('.group');
        if (parent) {
          const menuBtn = parent.querySelector('button[data-testid^="tree-node-menu-"]');
          if (menuBtn) {
            return menuBtn.getAttribute('data-testid');
          }
        }
      }
      return null;
    }, parentName);

    if (!menuTestId) {
      console.log(`  [UI] Parent node menu button not found${parentName ? ` for "${parentName}"` : ''}`);
      return { success: false, name };
    }

    const nodeId = menuTestId.replace('tree-node-menu-', '');
    console.log(`  [UI] Found parent node menu: ${menuTestId}`);

    // Click the menu button to open dropdown (force: true handles opacity:0)
    const menuBtn = page.locator(`[data-testid="${menuTestId}"]`);
    await menuBtn.click({ force: true, timeout: 2000 });
    await sleep(500);

    // Now look for the create-child item in the open dropdown
    const createChildTestId = `create-child-${nodeId}`;
    const createItem = page.locator(`[data-testid="${createChildTestId}"]`);
    // waitFor, not isVisible({ timeout }) — the dropdown animates in.
    const itemVisible = await createItem
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!itemVisible) {
      // Debug: log what menu items ARE visible
      const menuItems = await page.locator('[role="menuitem"]').allTextContents();
      console.log(`  [UI] Create Child option not found. Visible menu items: ${JSON.stringify(menuItems)}`);
      await page.keyboard.press('Escape');
      return { success: false, name };
    }

    await createItem.click();
    await sleep(500);

    // Wait for modal to open - look for the dialog
    const modal = page.locator('[role="dialog"], [role="alertdialog"]').first();
    const modalVisible = await isVisibleWithin(modal, 3000);
    if (!modalVisible) {
      console.log('  [UI] Modal did not open');
      return { success: false, name };
    }
    console.log('  [UI] Modal opened');

    // Fill the form (use id selector since the input has id="name")
    const nameInput = page.locator('input#name, input[id="name"]').first();
    if (!await isVisibleWithin(nameInput, 2000)) {
      console.log('  [UI] Name input not found');
      await page.keyboard.press('Escape');
      return { success: false, name };
    }

    await nameInput.fill(name);
    console.log(`  [UI] Filled name: ${name}`);

    if (description) {
      const descInput = page.locator('textarea#description, textarea[id="description"]').first();
      if (await isVisibleWithin(descInput, 500)) {
        await descInput.fill(description);
        console.log(`  [UI] Filled description`);
      }
    }

    await sleep(300);

    // Submit - NodeManagementModal uses "Create {EntityType}" as button text
    const createBtn = page.locator('button:has-text("Create")').first();
    if (await isVisibleWithin(createBtn, 2000)) {
      console.log('  [UI] Clicking Create button');
      await createBtn.click();
      await sleep(4000); // Wait longer for API call and UI update

      // Check for error toast
      const errorToast = page.locator('[role="status"]:has-text("Error"), .toast:has-text("Error")').first();
      if (await isVisibleWithin(errorToast, 500)) {
        console.log('  [UI] Error toast detected');
        return { success: false, name };
      }

      // Verify creation - the node should appear in the sidebar
      const nodeInSidebar = page.locator(`[data-sidebar="menu-button"]:has-text("${name}")`).first();
      const exists = await isVisibleWithin(nodeInSidebar, 5000);

      console.log(`  [UI] Child node "${name}" created: ${exists}`);
      return { success: exists, name };
    }

    console.log('  [UI] Create button not found');
    await page.keyboard.press('Escape');
    return { success: false, name };
  } catch (error) {
    console.log(`  [UI] Error creating child node: ${error}`);
    return { success: false, name };
  }
}

/**
 * Navigate to a node in the hierarchy sidebar.
 */
export async function navigateToNodeViaUI(
  page: Page,
  nodeName: string
): Promise<boolean> {
  console.log(`  [UI] Navigating to node: ${nodeName}`);

  const selectors = [
    `[data-sidebar="menu-button"]:has-text("${nodeName}")`,
    `button:has-text("${nodeName}")`,
    `a:has-text("${nodeName}")`,
  ];

  for (const selector of selectors) {
    const nodeBtn = page.locator(selector).first();
    if (await isVisibleWithin(nodeBtn, 2000)) {
      await nodeBtn.click();
      await sleep(1000);
      console.log(`  [UI] Navigated to node "${nodeName}"`);
      return true;
    }
  }

  console.log(`  [UI] Node "${nodeName}" not found`);
  return false;
}

/** @deprecated Use navigateToNodeViaUI instead */
export const navigateToOfficeViaUI = navigateToNodeViaUI;

/**
 * Delete a node via UI using the hierarchy sidebar's tree-node-menu.
 * Uses page.evaluate() to find menu buttons by node name.
 */
export async function deleteNodeViaUI(
  page: Page,
  nodeName: string,
  _nodeType: 'Office' | 'Room' = 'Office'
): Promise<{ success: boolean; cascaded: boolean }> {
  console.log(`  [UI] Deleting node: ${nodeName}`);

  try {
    // Close any open menus
    await page.keyboard.press('Escape');
    await sleep(300);

    // Find the node's menu button using page.evaluate
    // New tree uses data-testid="tree-node-menu-{id}" pattern
    const menuTestId = await page.evaluate((name: string) => {
      const buttons = Array.from(document.querySelectorAll('[data-sidebar="menu-button"]'));
      for (const btn of buttons) {
        if (btn.textContent?.includes(name)) {
          const parent = btn.closest('.group');
          if (parent) {
            const menuBtn = parent.querySelector('button[data-testid^="tree-node-menu-"]');
            if (menuBtn) {
              return menuBtn.getAttribute('data-testid');
            }
          }
        }
      }
      return null;
    }, nodeName);

    if (!menuTestId) {
      console.log(`  [UI] Menu button not found for "${nodeName}"`);
      return { success: false, cascaded: false };
    }

    console.log(`  [UI] Found menu button: ${menuTestId}`);
    const nodeId = menuTestId.replace('tree-node-menu-', '');

    // Click the menu button with force to handle opacity:0 styling
    const menuBtn = page.locator(`[data-testid="${menuTestId}"]`);
    await menuBtn.click({ force: true, timeout: 2000 });
    await sleep(600);

    // Click delete option using the new testid pattern
    const deleteOption = page.locator(`[data-testid="delete-node-${nodeId}"]`).first();
    if (!await isVisibleWithin(deleteOption, 3000)) {
      console.log(`  [UI] Delete option not found`);
      const allMenuItems = await page.locator('[role="menuitem"]').count();
      console.log(`  [UI] DEBUG: Found ${allMenuItems} menu items`);
      await page.keyboard.press('Escape');
      return { success: false, cascaded: false };
    }

    await deleteOption.click();
    await sleep(500);

    // Handle confirmation dialog
    const confirmBtn = page.locator('[role="alertdialog"] button:has-text("Delete")').first();
    if (await isVisibleWithin(confirmBtn, 2000)) {
      await confirmBtn.click();
      console.log(`  [UI] Node delete confirmed`);

      // Wait for the node to be removed from sidebar
      const nodeLocator = page.locator(`[data-sidebar="menu-button"]:has-text("${nodeName}")`).first();
      try {
        await nodeLocator.waitFor({ state: 'hidden', timeout: 5000 });
        console.log(`  [UI] Node removed from sidebar`);
        return { success: true, cascaded: true };
      } catch {
        console.log(`  [UI] WARNING: Node still visible after delete`);
        return { success: false, cascaded: true };
      }
    }

    console.log(`  [UI] Confirmation dialog not found`);
    return { success: false, cascaded: false };
  } catch (error) {
    console.log(`  [UI] Error deleting node: ${error}`);
    await page.keyboard.press('Escape');
    return { success: false, cascaded: false };
  }
}

/**
 * Check if a node exists in the sidebar.
 */
/**
 * Locator for a node in the hierarchy sidebar.
 *
 * Matches any button carrying the name rather than only
 * `[data-sidebar="menu-button"]`. The tree renders through SidebarMenuButton,
 * which does emit that attribute — but there are two SidebarMenuButton
 * implementations in the tree (components/ui/sidebar.tsx and
 * components/ui/sidebar/SidebarMenu.tsx), so pinning to the attribute makes the
 * helper depend on which one a given node happens to use. The broader match is
 * what the passing legacy suite has always used.
 */
export function sidebarNode(page: Page, nodeName: string) {
  return page.locator(`button:has-text("${nodeName}"), [data-sidebar="menu-button"]:has-text("${nodeName}")`).first();
}

/**
 * Wait for a node to disappear from the sidebar.
 *
 * Asserting absence with `nodeExistsInUI(...) === false` burns the full
 * appearance timeout on every deletion check, because it waits for something
 * that is never going to show up. This waits for the opposite state, so it
 * returns as soon as the node is actually gone.
 */
export async function nodeGoneFromUI(page: Page, nodeName: string, timeout = 10_000): Promise<boolean> {
  const gone = await sidebarNode(page, nodeName)
    .waitFor({ state: 'hidden', timeout })
    .then(() => true)
    .catch(() => false);
  console.log(`  [UI] Node "${nodeName}" gone: ${gone}`);
  return gone;
}

export async function nodeExistsInUI(page: Page, nodeName: string, timeout = 10_000): Promise<boolean> {
  // waitFor, NOT isVisible({ timeout }). Playwright ignores the timeout option on
  // isVisible — it is an immediate snapshot, not a wait. Creation round-trips to
  // the workspace server and the sidebar re-renders from the response, so an
  // immediate check reports "does not exist" for a node that is about to appear.
  // That mistake is why so much of this suite needed sleeps to work at all.
  const exists = await sidebarNode(page, nodeName)
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
  console.log(`  [UI] Node "${nodeName}" exists: ${exists}`);
  return exists;
}

// ============================================================================
// Tree Schema Operations
// ============================================================================

/**
 * Get the current tree schema.
 */
export async function getTreeSchema(page: Page): Promise<TreeSchema | null> {
  // Unit variant: send as string for correct serde deserialization
  const response = await executeTreeProtocolRequest(page, 'GetTreeSchema' as unknown as Record<string, unknown>);
  return response?.TreeSchema || null;
}

/**
 * Update the tree schema.
 */
export async function updateTreeSchema(
  page: Page,
  schema: TreeSchema
): Promise<boolean> {
  const request = {
    UpdateTreeSchema: { schema }
  };

  const response = await executeTreeProtocolRequest(page, request);
  return response?.Success !== undefined || response?.TreeSchema !== undefined;
}

/**
 * Create a custom node type.
 */
export async function createNodeType(
  page: Page,
  name: string,
  displayName: string,
  allowedParents: string[],
  icon?: string
): Promise<boolean> {
  const request = {
    CreateNodeType: {
      name,
      display_name: displayName,
      icon: icon || null,
      allowed_parents: allowedParents,
    }
  };

  const response = await executeTreeProtocolRequest(page, request);
  return response?.Success !== undefined || response?.NodeTypes !== undefined;
}

/**
 * List all node types (built-in + custom).
 */
export async function listNodeTypes(page: Page): Promise<CustomNodeType[]> {
  // Unit variant: send as string for correct serde deserialization
  const response = await executeTreeProtocolRequest(page, 'ListNodeTypes' as unknown as Record<string, unknown>);
  return response?.NodeTypes || [];
}

// ============================================================================
// Verification Helpers
// ============================================================================

/**
 * Verify a node has the expected depth.
 */
export async function verifyNodeDepth(
  page: Page,
  nodeId: string,
  expectedDepth: number
): Promise<boolean> {
  const node = await getNodeViaProtocol(page, nodeId);
  if (!node) {
    console.log(`  [Verify] Node ${nodeId} not found`);
    return false;
  }

  const matches = node.depth === expectedDepth;
  console.log(`  [Verify] Node ${nodeId} depth: ${node.depth} (expected: ${expectedDepth}) - ${matches ? 'PASS' : 'FAIL'} `);
  return matches;
}

/**
 * Verify a node has the expected parent.
 */
export async function verifyNodeParent(
  page: Page,
  nodeId: string,
  expectedParentId: string | null
): Promise<boolean> {
  const node = await getNodeViaProtocol(page, nodeId);
  if (!node) {
    console.log(`  [Verify] Node ${nodeId} not found`);
    return false;
  }

  const matches = node.parent_id === expectedParentId;
  console.log(`  [Verify] Node ${nodeId} parent: ${node.parent_id} (expected: ${expectedParentId}) - ${matches ? 'PASS' : 'FAIL'} `);
  return matches;
}

/**
 * Verify a node exists.
 */
export async function verifyNodeExists(
  page: Page,
  nodeId: string
): Promise<boolean> {
  const node = await getNodeViaProtocol(page, nodeId);
  const exists = node !== null;
  console.log(`  [Verify] Node ${nodeId} exists: ${exists} `);
  return exists;
}

/**
 * Verify a node does NOT exist (was deleted).
 */
export async function verifyNodeDeleted(
  page: Page,
  nodeId: string
): Promise<boolean> {
  const node = await getNodeViaProtocol(page, nodeId);
  const deleted = node === null;
  console.log(`  [Verify] Node ${nodeId} deleted: ${deleted} `);
  return deleted;
}

// ============================================================================
// Hierarchy Creation Helpers
// ============================================================================

/**
 * Create a deep hierarchy of nodes.
 * Returns array of created node IDs in order from root to deepest.
 * Automatically updates tree schema to allow Office/Room nesting at arbitrary depth.
 */
export async function createDeepHierarchy(
  page: Page,
  depth: number,
  workspaceRootId: string,
  namePrefix: string = 'Level'
): Promise<string[]> {
  // First, update tree schema to allow circular Office↔Room nesting
  const schema = await getTreeSchema(page);
  if (schema) {
    let schemaModified = false;
    // Ensure Room→Office nesting is allowed (for depth 3+)
    const roomRule = schema.rules.find((r: NestingRule) => r.parent_type === 'Room');
    if (roomRule) {
      if (!roomRule.allowed_child_types.includes('Office')) {
        roomRule.allowed_child_types.push('Office');
        schemaModified = true;
      }
    } else {
      schema.rules.push({ parent_type: 'Room', allowed_child_types: ['Office'] });
      schemaModified = true;
    }
    // Ensure Office→Office nesting is allowed (for same-type chains)
    const officeRule = schema.rules.find((r: NestingRule) => r.parent_type === 'Office');
    if (officeRule) {
      if (!officeRule.allowed_child_types.includes('Office')) {
        officeRule.allowed_child_types.push('Office');
        schemaModified = true;
      }
    }
    // Also ensure max_depth allows the requested depth
    if (schema.max_depth !== undefined && schema.max_depth !== null && schema.max_depth < depth + 1) {
      schema.max_depth = depth + 1;
      schemaModified = true;
      console.log(`  [DeepHierarchy] Increasing max_depth to ${depth + 1} `);
    }
    if (schemaModified) {
      console.log('  [DeepHierarchy] Updating tree schema for deep nesting');
      await updateTreeSchema(page, schema);
      await sleep(200);
    }
  }

  const nodeIds: string[] = [];
  let parentId: string | null = workspaceRootId;

  for (let i = 1; i <= depth; i++) {
    // Alternate between Office and Room for default schema
    const entityType: NodeEntityType = i % 2 === 1
      ? { Child: 'Office' }
      : { Child: 'Room' };

    const result = await createNodeViaProtocol(
      page,
      parentId,
      entityType,
      `${namePrefix}_${i}_${Date.now()} `,
      `Test node at depth ${i} `
    );

    if (!result.success || !result.nodeId) {
      console.log(`  [DeepHierarchy] Failed to create node at depth ${i}: ${result.error} `);
      break;
    }

    nodeIds.push(result.nodeId);
    parentId = result.nodeId;

    // Small delay to ensure ordering
    await sleep(100);
  }

  console.log(`  [DeepHierarchy] Created ${nodeIds.length} nodes`);
  return nodeIds;
}

/**
 * Create multiple sibling nodes under a parent.
 * Returns array of created node IDs.
 */
export async function createSiblingNodes(
  page: Page,
  parentId: string,
  entityType: NodeEntityType,
  count: number,
  namePrefix: string = 'Sibling'
): Promise<string[]> {
  const nodeIds: string[] = [];

  for (let i = 1; i <= count; i++) {
    const result = await createNodeViaProtocol(
      page,
      parentId,
      entityType,
      `${namePrefix}_${i}_${Date.now()} `,
      `Sibling node ${i} `
    );

    if (result.success && result.nodeId) {
      nodeIds.push(result.nodeId);
    }

    await sleep(50);
  }

  console.log(`  [Siblings] Created ${nodeIds.length}/${count} sibling nodes`);
  return nodeIds;
}

/**
 * Count all nodes in a tree recursively.
 */
export function countTreeNodes(tree: TreeNode): number {
  let count = 1; // Count this node
  for (const child of tree.children) {
    count += countTreeNodes(child);
  }
  return count;
}

/**
 * Find a node by ID in a tree.
 */
export function findNodeInTree(tree: TreeNode, nodeId: string): TreeNode | null {
  if (tree.node.id === nodeId) {
    return tree;
  }
  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

/**
 * Get all node IDs in a tree.
 */
export function getAllNodeIds(tree: TreeNode): string[] {
  const ids: string[] = [tree.node.id];
  for (const child of tree.children) {
    ids.push(...getAllNodeIds(child));
  }
  return ids;
}

/**
 * Get all descendant IDs of a node (not including the node itself).
 */
export function getDescendantIds(tree: TreeNode): string[] {
  const ids: string[] = [];
  for (const child of tree.children) {
    ids.push(child.node.id);
    ids.push(...getDescendantIds(child));
  }
  return ids;
}
