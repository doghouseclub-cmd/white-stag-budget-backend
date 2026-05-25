const express = require('express');
const { v4: uuidv4 } = require('uuid');
const admin = require('../lib/firebase');
const supabase = require('../lib/supabase');
const router = express.Router();

// ---------------------------------------------------------------------------
// Middleware: verify Firebase Auth JWT
// ---------------------------------------------------------------------------
const verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ---------------------------------------------------------------------------
// Middleware: confirm caller belongs to a household
// ---------------------------------------------------------------------------
const requireHousehold = async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('household_id, household_role')
      .eq('id', req.user.uid)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!user.household_id) {
      return res.status(404).json({ success: false, error: 'User not in a household' });
    }
    req.householdId = user.household_id;
    req.userRole = user.household_role;
    next();
  } catch {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// Helper: shape a DB category row into the API category object
// ---------------------------------------------------------------------------
const formatCategory = (row) => ({
  id: row.id,
  name: row.name,
  amount: parseFloat(row.amount),
  order: row.sort_order,
  monthlyBudget: parseFloat(row.monthly_budget),
  maxBalance: row.max_balance != null ? parseFloat(row.max_balance) : null,
  description: row.description || '',
  icon: row.icon || '',
  color: row.color || '',
  isArchived: row.is_archived,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ---------------------------------------------------------------------------
// Helper: fetch a stack row + its categories in one place
// ---------------------------------------------------------------------------
const fetchStack = async (householdId, stackType) => {
  const { data: stack, error: sErr } = await supabase
    .from('priority_stacks')
    .select('*')
    .eq('household_id', householdId)
    .eq('stack_type', stackType)
    .single();

  if (sErr || !stack) return { stack: null, categories: [] };

  const { data: categories } = await supabase
    .from('priority_stack_categories')
    .select('*')
    .eq('stack_id', stack.id)
    .order('sort_order', { ascending: true });

  return { stack, categories: categories || [] };
};

// ---------------------------------------------------------------------------
// Helper: recompute totalAmount / categoryCount from a categories array
// ---------------------------------------------------------------------------
const computeTotals = (categories) => {
  const active = categories.filter((c) => !c.is_archived);
  return {
    total_amount: active.reduce((sum, c) => sum + parseFloat(c.amount), 0),
    category_count: active.length,
  };
};

// ---------------------------------------------------------------------------
// Helper: validate category fields; returns error string or null
// excludeId: skip this category's own values during uniqueness checks (edit)
// ---------------------------------------------------------------------------
const validateCategoryFields = (fields, existingCategories, allowNegativeBalances, excludeId = null) => {
  const nonArchived = existingCategories.filter((c) => !c.is_archived && c.id !== excludeId);
  const { name, amount, sort_order: order, monthly_budget, max_balance, description, color } = fields;

  if (name !== undefined) {
    const t = typeof name === 'string' ? name.trim() : '';
    if (t.length < 1 || t.length > 25) return 'Category name must be 1-25 characters';
    if (nonArchived.some((c) => c.name.trim().toLowerCase() === t.toLowerCase())) {
      return 'Category name must be unique within the stack';
    }
  }
  if (amount !== undefined) {
    if (typeof amount !== 'number') return 'amount must be a number';
    if (!allowNegativeBalances && amount < 0) return 'amount must be >= 0';
  }
  if (order !== undefined) {
    if (!Number.isInteger(order) || order < 1) return 'order must be an integer >= 1';
    if (nonArchived.some((c) => c.sort_order === order)) {
      return 'order must be unique among non-archived categories';
    }
  }
  if (monthly_budget !== undefined) {
    if (typeof monthly_budget !== 'number' || monthly_budget < 0) return 'monthlyBudget must be >= 0';
  }
  if (max_balance !== undefined && max_balance !== null) {
    if (typeof max_balance !== 'number' || max_balance <= 0) return 'maxBalance must be > 0';
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > 200) return 'description must be max 200 characters';
  }
  if (color !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return 'color must be a hex color in format #RRGGBB';
  }
  return null;
};

// ============================================================================
// GET /api/priority-stack/active
// ============================================================================
router.get('/active', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const { stack, categories } = await fetchStack(req.householdId, 'active');

    if (!stack) {
      return res.status(404).json({
        success: false,
        error: 'Active priority stack not found. Initialize household first.',
      });
    }

    res.status(200).json({
      success: true,
      stack: {
        id: 'active',
        version: stack.version,
        createdAt: stack.created_at,
        updatedAt: stack.updated_at,
        promotedAt: stack.promoted_at,
        promotedBy: stack.promoted_by,
        totalAmount: parseFloat(stack.total_amount),
        categoryCount: stack.category_count,
        categories: categories.filter((c) => !c.is_archived).map(formatCategory),
      },
    });
  } catch (error) {
    console.error('GET active error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// GET /api/priority-stack/draft
// ============================================================================
router.get('/draft', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const [{ stack, categories }, { data: household }] = await Promise.all([
      fetchStack(req.householdId, 'draft'),
      supabase.from('households').select('id').eq('id', req.householdId).single(),
    ]);

    if (!stack) {
      return res.status(404).json({
        success: false,
        error: 'Draft priority stack not found. Initialize household first.',
      });
    }

    // Get all household member IDs
    const { data: members } = await supabase
      .from('users')
      .select('id')
      .eq('household_id', req.householdId);

    const memberIds = (members || []).map((m) => m.id);

    // Get approvals for this draft
    const { data: approvals } = await supabase
      .from('stack_approvals')
      .select('user_id, approved')
      .eq('stack_id', stack.id);

    const approvedSet = new Set((approvals || []).filter((a) => a.approved).map((a) => a.user_id));

    const approvalStatus = memberIds.map((uid) => ({ userId: uid, approved: approvedSet.has(uid) }));

    res.status(200).json({
      success: true,
      stack: {
        id: 'draft',
        version: stack.version,
        createdAt: stack.created_at,
        updatedAt: stack.updated_at,
        lastEditedBy: stack.last_edited_by,
        lastEditedAt: stack.last_edited_at,
        totalAmount: parseFloat(stack.total_amount),
        categoryCount: stack.category_count,
        approvedBy: [...approvedSet],
        isFullyApproved: approvedSet.size === memberIds.length,
        approvalStatus,
        categories: categories.filter((c) => !c.is_archived).map(formatCategory),
      },
    });
  } catch (error) {
    console.error('GET draft error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// POST /api/priority-stack/draft  (action: add | edit | remove | reorder)
// ============================================================================
router.post('/draft', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['add', 'edit', 'remove', 'reorder'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'action must be one of: add, edit, remove, reorder',
      });
    }

    const { stack: draft, categories } = await fetchStack(req.householdId, 'draft');
    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'Draft priority stack not found. Initialize household first.',
      });
    }

    // Read allowNegativeBalances once (used by validation)
    const { data: hh } = await supabase
      .from('households')
      .select('allow_negative_balances')
      .eq('id', req.householdId)
      .single();
    const allowNegativeBalances = hh?.allow_negative_balances ?? false;

    const now = new Date().toISOString();

    // ---- action: add -------------------------------------------------------
    if (action === 'add') {
      const { name, amount, order, monthlyBudget, maxBalance, description, icon, color } = req.body;

      if (name === undefined || amount === undefined || order === undefined || monthlyBudget === undefined) {
        return res.status(400).json({ success: false, error: 'name, amount, order, and monthlyBudget are required' });
      }

      const err = validateCategoryFields(
        { name, amount, sort_order: order, monthly_budget: monthlyBudget, max_balance: maxBalance, description, color },
        categories,
        allowNegativeBalances
      );
      if (err) return res.status(400).json({ success: false, error: err });

      const { error: insErr } = await supabase.from('priority_stack_categories').insert({
        stack_id: draft.id,
        name: name.trim(),
        amount,
        sort_order: order,
        monthly_budget: monthlyBudget,
        max_balance: maxBalance ?? null,
        description: description ?? '',
        icon: icon ?? '',
        color: color ?? '',
        is_archived: false,
      });
      if (insErr) throw insErr;
    }

    // ---- action: edit -------------------------------------------------------
    else if (action === 'edit') {
      const { categoryId, name, amount, order, monthlyBudget, maxBalance, description, icon, color } = req.body;
      if (!categoryId) return res.status(400).json({ success: false, error: 'categoryId is required' });

      const target = categories.find((c) => c.id === categoryId);
      if (!target) return res.status(404).json({ success: false, error: 'Category not found' });

      const err = validateCategoryFields(
        { name, amount, sort_order: order, monthly_budget: monthlyBudget, max_balance: maxBalance, description, color },
        categories,
        allowNegativeBalances,
        categoryId
      );
      if (err) return res.status(400).json({ success: false, error: err });

      const updates = { updated_at: now };
      if (name !== undefined) updates.name = name.trim();
      if (amount !== undefined) updates.amount = amount;
      if (order !== undefined) updates.sort_order = order;
      if (monthlyBudget !== undefined) updates.monthly_budget = monthlyBudget;
      if (maxBalance !== undefined) updates.max_balance = maxBalance;
      if (description !== undefined) updates.description = description;
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;

      const { error: updErr } = await supabase
        .from('priority_stack_categories')
        .update(updates)
        .eq('id', categoryId);
      if (updErr) throw updErr;
    }

    // ---- action: remove ----------------------------------------------------
    else if (action === 'remove') {
      const { categoryId } = req.body;
      if (!categoryId) return res.status(400).json({ success: false, error: 'categoryId is required' });

      if (!categories.find((c) => c.id === categoryId)) {
        return res.status(404).json({ success: false, error: 'Category not found' });
      }

      const { error: archErr } = await supabase
        .from('priority_stack_categories')
        .update({ is_archived: true, updated_at: now })
        .eq('id', categoryId);
      if (archErr) throw archErr;
    }

    // ---- action: reorder ---------------------------------------------------
    else if (action === 'reorder') {
      const { categoryId, newOrder } = req.body;
      if (!categoryId || newOrder === undefined) {
        return res.status(400).json({ success: false, error: 'categoryId and newOrder are required' });
      }
      if (!Number.isInteger(newOrder) || newOrder < 1) {
        return res.status(400).json({ success: false, error: 'newOrder must be an integer >= 1' });
      }

      const target = categories.find((c) => c.id === categoryId);
      if (!target) return res.status(404).json({ success: false, error: 'Category not found' });

      const oldOrder = target.sort_order;
      const nonArchived = categories.filter((c) => !c.is_archived);

      // Build list of {id, sort_order} changes needed
      const changes = [];
      if (newOrder < oldOrder) {
        // Moving up: shift [newOrder, oldOrder) down by 1
        nonArchived
          .filter((c) => c.id !== categoryId && c.sort_order >= newOrder && c.sort_order < oldOrder)
          .forEach((c) => changes.push({ id: c.id, sort_order: c.sort_order + 1 }));
        changes.push({ id: categoryId, sort_order: newOrder });
      } else if (newOrder > oldOrder) {
        // Moving down: shift (oldOrder, newOrder] up by 1
        nonArchived
          .filter((c) => c.id !== categoryId && c.sort_order > oldOrder && c.sort_order <= newOrder)
          .forEach((c) => changes.push({ id: c.id, sort_order: c.sort_order - 1 }));
        changes.push({ id: categoryId, sort_order: newOrder });
      }

      for (const change of changes) {
        const { error: reErr } = await supabase
          .from('priority_stack_categories')
          .update({ sort_order: change.sort_order, updated_at: now })
          .eq('id', change.id);
        if (reErr) throw reErr;
      }
    }

    // ---- Update draft metadata and reset approvals -------------------------
    const { categories: refreshedCats } = await fetchStack(req.householdId, 'draft');
    const totals = computeTotals(refreshedCats);

    const { error: metaErr } = await supabase
      .from('priority_stacks')
      .update({
        version: draft.version + 1,
        last_edited_by: req.user.uid,
        last_edited_at: now,
        updated_at: now,
        ...totals,
      })
      .eq('id', draft.id);
    if (metaErr) throw metaErr;

    // Clear all approvals for this draft
    await supabase.from('stack_approvals').delete().eq('stack_id', draft.id);

    // Build response stack
    const { stack: updatedDraft, categories: finalCats } = await fetchStack(req.householdId, 'draft');

    res.status(200).json({
      success: true,
      action,
      message: `Category ${action} successful. All approvals have been reset.`,
      stack: {
        id: 'draft',
        version: updatedDraft.version,
        updatedAt: updatedDraft.updated_at,
        lastEditedBy: updatedDraft.last_edited_by,
        lastEditedAt: updatedDraft.last_edited_at,
        totalAmount: parseFloat(updatedDraft.total_amount),
        categoryCount: updatedDraft.category_count,
        approvedBy: [],
        categories: finalCats.filter((c) => !c.is_archived).map(formatCategory),
      },
    });
  } catch (error) {
    console.error('POST draft error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// POST /api/priority-stack/approve
// ============================================================================
router.post('/approve', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const { stack: draft } = await fetchStack(req.householdId, 'draft');
    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'Draft priority stack not found. Initialize household first.',
      });
    }

    // Check if already approved
    const { data: existingApproval } = await supabase
      .from('stack_approvals')
      .select('approved')
      .eq('stack_id', draft.id)
      .eq('user_id', req.user.uid)
      .maybeSingle();

    if (existingApproval?.approved) {
      return res.status(400).json({ success: false, error: 'User has already approved this draft version' });
    }

    const now = new Date().toISOString();

    // Record approval
    const { error: apprErr } = await supabase.from('stack_approvals').upsert(
      { stack_id: draft.id, user_id: req.user.uid, approved: true, approved_at: now },
      { onConflict: 'stack_id,user_id' }
    );
    if (apprErr) throw apprErr;

    // Count members and current approvals
    const [{ data: members }, { data: approvals }] = await Promise.all([
      supabase.from('users').select('id').eq('household_id', req.householdId),
      supabase.from('stack_approvals').select('user_id').eq('stack_id', draft.id).eq('approved', true),
    ]);

    const totalMembers = (members || []).length;
    const approvedCount = (approvals || []).length;
    const allApproved = approvedCount === totalMembers;

    const approvalStatus = (members || []).map((m) => ({
      userId: m.id,
      approved: (approvals || []).some((a) => a.user_id === m.id),
    }));

    if (!allApproved) {
      return res.status(200).json({
        success: true,
        approved: true,
        message: `Draft approved by user. ${approvedCount}/${totalMembers} members approved.`,
        approvalCount: `${approvedCount}/${totalMembers}`,
        approvalStatus,
      });
    }

    // ---- All approved: promote draft → active --------------------------------
    const { stack: active, categories: draftCats } = await fetchStack(req.householdId, 'draft');
    const { stack: activeStack } = await fetchStack(req.householdId, 'active');

    const newVersion = (activeStack?.version ?? 0) + 1;

    // Delete old active categories
    await supabase
      .from('priority_stack_categories')
      .delete()
      .eq('stack_id', activeStack.id);

    // Copy draft categories to active (new UUIDs, same content)
    const { categories: freshDraftCats } = await fetchStack(req.householdId, 'draft');
    if (freshDraftCats.length > 0) {
      const activeCopies = freshDraftCats.map((c) => ({
        stack_id: activeStack.id,
        name: c.name,
        amount: c.amount,
        sort_order: c.sort_order,
        monthly_budget: c.monthly_budget,
        max_balance: c.max_balance,
        description: c.description,
        icon: c.icon,
        color: c.color,
        is_archived: c.is_archived,
        created_at: c.created_at,
      }));
      const { error: copyErr } = await supabase.from('priority_stack_categories').insert(activeCopies);
      if (copyErr) throw copyErr;
    }

    // Update active stack metadata
    await supabase
      .from('priority_stacks')
      .update({
        version: newVersion,
        promoted_at: now,
        promoted_by: req.user.uid,
        updated_at: now,
        total_amount: draft.total_amount,
        category_count: draft.category_count,
      })
      .eq('id', activeStack.id);

    // Reset draft approvals and sync version
    await supabase.from('stack_approvals').delete().eq('stack_id', draft.id);
    await supabase
      .from('priority_stacks')
      .update({ version: newVersion, updated_at: now })
      .eq('id', draft.id);

    const { stack: promotedActive, categories: promotedCats } = await fetchStack(req.householdId, 'active');

    res.status(200).json({
      success: true,
      approved: true,
      message: 'Draft approved by user. All members approved. Draft promoted to active.',
      stack: {
        id: 'active',
        version: promotedActive.version,
        promotedAt: promotedActive.promoted_at,
        promotedBy: promotedActive.promoted_by,
        totalAmount: parseFloat(promotedActive.total_amount),
        categoryCount: promotedActive.category_count,
        categories: promotedCats.filter((c) => !c.is_archived).map(formatCategory),
      },
    });
  } catch (error) {
    console.error('POST approve error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// POST /api/priority-stack/reset
// ============================================================================
router.post('/reset', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const { stack: active, categories: activeCats } = await fetchStack(req.householdId, 'active');
    if (!active) {
      return res.status(404).json({
        success: false,
        error: 'Active priority stack not found. Initialize household first.',
      });
    }

    const { stack: draft } = await fetchStack(req.householdId, 'draft');
    const now = new Date().toISOString();

    // Delete all draft categories
    await supabase.from('priority_stack_categories').delete().eq('stack_id', draft.id);

    // Copy active categories to draft (new UUIDs)
    if (activeCats.length > 0) {
      const draftCopies = activeCats.map((c) => ({
        stack_id: draft.id,
        name: c.name,
        amount: c.amount,
        sort_order: c.sort_order,
        monthly_budget: c.monthly_budget,
        max_balance: c.max_balance,
        description: c.description,
        icon: c.icon,
        color: c.color,
        is_archived: c.is_archived,
        created_at: c.created_at,
      }));
      const { error: copyErr } = await supabase.from('priority_stack_categories').insert(draftCopies);
      if (copyErr) throw copyErr;
    }

    // Reset draft metadata
    await supabase
      .from('priority_stacks')
      .update({
        version: active.version,
        last_edited_by: null,
        last_edited_at: null,
        updated_at: now,
        total_amount: active.total_amount,
        category_count: active.category_count,
      })
      .eq('id', draft.id);

    // Clear all approvals
    await supabase.from('stack_approvals').delete().eq('stack_id', draft.id);

    const { stack: resetDraft, categories: resetCats } = await fetchStack(req.householdId, 'draft');

    res.status(200).json({
      success: true,
      message: 'Draft reset to active. All changes discarded. All approvals cleared.',
      stack: {
        id: 'draft',
        version: resetDraft.version,
        updatedAt: resetDraft.updated_at,
        totalAmount: parseFloat(resetDraft.total_amount),
        categoryCount: resetDraft.category_count,
        approvedBy: [],
        categories: resetCats.filter((c) => !c.is_archived).map(formatCategory),
      },
    });
  } catch (error) {
    console.error('POST reset error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// GET /api/priority-stack/approvals
// ============================================================================
router.get('/approvals', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const { stack: draft } = await fetchStack(req.householdId, 'draft');
    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'Draft priority stack not found. Initialize household first.',
      });
    }

    const [{ data: members }, { data: approvals }] = await Promise.all([
      supabase.from('users').select('id, email, name').eq('household_id', req.householdId),
      supabase
        .from('stack_approvals')
        .select('user_id, approved, approved_at')
        .eq('stack_id', draft.id),
    ]);

    const approvalMap = {};
    (approvals || []).forEach((a) => { approvalMap[a.user_id] = a; });

    const approvalStatus = (members || []).map((m) => ({
      userId: m.id,
      email: m.email,
      name: m.name,
      approved: approvalMap[m.id]?.approved ?? false,
      approvedAt: approvalMap[m.id]?.approved_at ?? null,
    }));

    const approvedCount = approvalStatus.filter((a) => a.approved).length;
    const totalCount = (members || []).length;

    res.status(200).json({
      success: true,
      allApproved: approvedCount === totalCount,
      approvalCount: `${approvedCount}/${totalCount}`,
      draftVersion: draft.version,
      lastUpdatedAt: draft.updated_at,
      approvalStatus,
    });
  } catch (error) {
    console.error('GET approvals error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// Initialization helper (called by household.js on household creation)
// ============================================================================
const initializePriorityStack = async (householdId, defaultCategories = []) => {
  const now = new Date().toISOString();

  const { data: activeStack, error: ae } = await supabase
    .from('priority_stacks')
    .insert({
      household_id: householdId,
      stack_type: 'active',
      version: 1,
      total_amount: 0,
      category_count: 0,
      promoted_at: now,
      promoted_by: null,
    })
    .select('id')
    .single();
  if (ae) throw ae;

  const { data: draftStack, error: de } = await supabase
    .from('priority_stacks')
    .insert({
      household_id: householdId,
      stack_type: 'draft',
      version: 1,
      total_amount: 0,
      category_count: 0,
    })
    .select('id')
    .single();
  if (de) throw de;

  if (defaultCategories.length > 0) {
    const rows = [];
    for (const cat of defaultCategories) {
      rows.push({ ...cat, stack_id: activeStack.id });
      rows.push({ ...cat, stack_id: draftStack.id });
    }
    await supabase.from('priority_stack_categories').insert(rows);
  }
};

module.exports = router;
module.exports.initializePriorityStack = initializePriorityStack;
