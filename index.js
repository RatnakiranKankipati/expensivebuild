var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import dotenv2 from "dotenv";
import express4 from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  categories: () => categories,
  categoriesRelations: () => categoriesRelations,
  expenseWallets: () => expenseWallets,
  expenses: () => expenses,
  expensesRelations: () => expensesRelations,
  insertCategorySchema: () => insertCategorySchema,
  insertExpenseSchema: () => insertExpenseSchema,
  insertExpenseWalletSchema: () => insertExpenseWalletSchema,
  insertUserSchema: () => insertUserSchema,
  updateExpenseSchema: () => updateExpenseSchema,
  updateExpenseWalletSchema: () => updateExpenseWalletSchema,
  updateUserSchema: () => updateUserSchema,
  users: () => users
});
import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#3b82f6"),
  description: text("description"),
  isActive: integer("is_active").notNull().default(1)
});
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  // "admin" or "user"
  azureObjectId: text("azure_object_id").unique(),
  isActive: integer("is_active").notNull().default(1),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var expenseWallets = pgTable("expense_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  categoryId: varchar("category_id").references(() => categories.id).notNull(),
  vendor: text("vendor"),
  date: timestamp("date").notNull(),
  receiptPath: text("receipt_path"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
var insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  isActive: true
});
var insertExpenseWalletSchema = createInsertSchema(expenseWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  amount: z.union([z.string(), z.number()]).transform((val) => {
    const numVal = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(numVal) || numVal <= 0) {
      throw new Error("Amount must be a positive number");
    }
    return numVal;
  }),
  date: z.string().transform((val) => new Date(val))
});
var updateExpenseWalletSchema = insertExpenseWalletSchema.partial().extend({
  id: z.string()
});
var insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  date: z.string().transform((val) => new Date(val))
});
var updateExpenseSchema = insertExpenseSchema.partial().extend({
  id: z.string()
});
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true
});
var updateUserSchema = insertUserSchema.partial().extend({
  id: z.string()
});
var categoriesRelations = relations(categories, ({ many }) => ({
  expenses: many(expenses)
}));
var expensesRelations = relations(expenses, ({ one }) => ({
  category: one(categories, {
    fields: [expenses.categoryId],
    references: [categories.id]
  })
}));

// server/storage.ts
import { randomUUID } from "crypto";

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import dotenv from "dotenv";
dotenv.config();
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, sql as sql2, desc, asc, and, gte, lte, lt, like, count, sum } from "drizzle-orm";
var DatabaseStorage = class {
  constructor() {
  }
  // Category operations
  async getCategories() {
    return await db.select().from(categories).where(eq(categories.isActive, 1));
  }
  async getCategoryById(id) {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category || void 0;
  }
  async createCategory(category) {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }
  async updateCategory(id, category) {
    const [updated] = await db.update(categories).set(category).where(eq(categories.id, id)).returning();
    return updated || void 0;
  }
  async deleteCategory(id) {
    const [updated] = await db.update(categories).set({ isActive: 0 }).where(eq(categories.id, id)).returning();
    return !!updated;
  }
  // Expense Wallet operations
  async getExpenseWallets() {
    return await db.select().from(expenseWallets).orderBy(desc(expenseWallets.createdAt));
  }
  async getCurrentExpenseWallet() {
    const [wallet] = await db.select().from(expenseWallets).orderBy(desc(expenseWallets.updatedAt)).limit(1);
    return wallet || void 0;
  }
  async createExpenseWallet(wallet) {
    const [newWallet] = await db.insert(expenseWallets).values({
      ...wallet,
      amount: wallet.amount.toString()
    }).returning();
    return newWallet;
  }
  async updateExpenseWallet(id, wallet) {
    const updateData = { ...wallet, updatedAt: /* @__PURE__ */ new Date() };
    if (updateData.amount !== void 0) {
      updateData.amount = updateData.amount.toString();
    }
    const [updated] = await db.update(expenseWallets).set(updateData).where(eq(expenseWallets.id, id)).returning();
    return updated || void 0;
  }
  async deleteExpenseWallet(id) {
    const result = await db.delete(expenseWallets).where(eq(expenseWallets.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  // Expense operations
  async getExpenses(filters, sortBy = "date", sortOrder = "desc", limit = 50, offset = 0) {
    const baseQuery = db.select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      categoryId: expenses.categoryId,
      vendor: expenses.vendor,
      date: expenses.date,
      receiptPath: expenses.receiptPath,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
        description: categories.description,
        isActive: categories.isActive
      }
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id));
    const conditions = [];
    if (filters) {
      if (filters.search) {
        conditions.push(
          like(expenses.description, `%${filters.search}%`)
        );
      }
      if (filters.categoryId) {
        conditions.push(eq(expenses.categoryId, filters.categoryId));
      }
      if (filters.startDate) {
        conditions.push(gte(expenses.date, new Date(filters.startDate)));
      }
      if (filters.endDate) {
        conditions.push(lte(expenses.date, new Date(filters.endDate)));
      }
      if (filters.minAmount !== void 0) {
        conditions.push(gte(expenses.amount, filters.minAmount.toString()));
      }
      if (filters.maxAmount !== void 0) {
        conditions.push(lte(expenses.amount, filters.maxAmount.toString()));
      }
    }
    const sortColumn = {
      date: expenses.date,
      amount: expenses.amount,
      description: expenses.description,
      category: categories.name
    }[sortBy];
    const orderFn = sortOrder === "asc" ? asc : desc;
    if (conditions.length > 0) {
      return await baseQuery.where(and(...conditions)).orderBy(orderFn(sortColumn)).limit(limit).offset(offset);
    } else {
      return await baseQuery.orderBy(orderFn(sortColumn)).limit(limit).offset(offset);
    }
  }
  async getExpenseById(id) {
    const [expense] = await db.select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      categoryId: expenses.categoryId,
      vendor: expenses.vendor,
      date: expenses.date,
      receiptPath: expenses.receiptPath,
      notes: expenses.notes,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
        description: categories.description,
        isActive: categories.isActive
      }
    }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).where(eq(expenses.id, id));
    return expense || void 0;
  }
  async createExpense(expense) {
    const [newExpense] = await db.insert(expenses).values({
      ...expense,
      amount: expense.amount.toString()
    }).returning();
    return newExpense;
  }
  async updateExpense(id, expense) {
    const updateData = { ...expense, updatedAt: /* @__PURE__ */ new Date() };
    if (updateData.amount !== void 0 && updateData.amount !== null) {
      updateData.amount = updateData.amount.toString();
    }
    const [updated] = await db.update(expenses).set(updateData).where(eq(expenses.id, id)).returning();
    return updated || void 0;
  }
  async deleteExpense(id) {
    const result = await db.delete(expenses).where(eq(expenses.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async getExpensesCount(filters) {
    const baseQuery = db.select({ count: count() }).from(expenses);
    const conditions = [];
    if (filters) {
      if (filters.search) {
        conditions.push(like(expenses.description, `%${filters.search}%`));
      }
      if (filters.categoryId) {
        conditions.push(eq(expenses.categoryId, filters.categoryId));
      }
      if (filters.startDate) {
        conditions.push(gte(expenses.date, new Date(filters.startDate)));
      }
      if (filters.endDate) {
        conditions.push(lte(expenses.date, new Date(filters.endDate)));
      }
      if (filters.minAmount !== void 0) {
        conditions.push(gte(expenses.amount, filters.minAmount.toString()));
      }
      if (filters.maxAmount !== void 0) {
        conditions.push(lte(expenses.amount, filters.maxAmount.toString()));
      }
    }
    if (conditions.length > 0) {
      const [result] = await baseQuery.where(and(...conditions));
      return result.count;
    } else {
      const [result] = await baseQuery;
      return result.count;
    }
  }
  // Analytics operations
  async getWalletSummary() {
    const [walletResult] = await db.select({ totalAmount: sum(expenseWallets.amount) }).from(expenseWallets);
    const walletAmount = parseFloat(walletResult.totalAmount || "0");
    const [expenseResult] = await db.select({ totalAmount: sum(expenses.amount) }).from(expenses);
    const totalExpenses = parseFloat(expenseResult.totalAmount || "0");
    const [countResult] = await db.select({ count: count() }).from(expenses);
    const expenseCount = countResult.count;
    const remainingAmount = walletAmount - totalExpenses;
    const averageExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;
    const percentageUsed = walletAmount > 0 ? totalExpenses / walletAmount * 100 : 0;
    return {
      walletAmount,
      totalExpenses,
      remainingAmount,
      expenseCount,
      averageExpense,
      percentageUsed
    };
  }
  async getWalletSummaryForMonth(month, year) {
    const [walletResult] = await db.select({ totalAmount: sum(expenseWallets.amount) }).from(expenseWallets);
    const totalWalletBalance = parseFloat(walletResult.totalAmount || "0");
    const [allExpenseResult] = await db.select({ totalAmount: sum(expenses.amount) }).from(expenses);
    const totalExpensesEver = parseFloat(allExpenseResult.totalAmount || "0");
    const availableBalance = totalWalletBalance - totalExpensesEver;
    const startOfMonth = new Date(year, month - 1, 1);
    const nextMonthStart = new Date(year, month, 1);
    const [monthlyExpenseResult] = await db.select({
      totalAmount: sum(expenses.amount),
      count: count()
    }).from(expenses).where(and(
      gte(expenses.date, startOfMonth),
      // pass Date object
      lt(expenses.date, nextMonthStart)
    ));
    const monthlyExpenseAmount = parseFloat(monthlyExpenseResult.totalAmount || "0");
    const monthlyExpenseCount = monthlyExpenseResult.count;
    const monthlyAverageExpense = monthlyExpenseCount > 0 ? monthlyExpenseAmount / monthlyExpenseCount : 0;
    const monthlyPercentageUsed = totalWalletBalance > 0 ? monthlyExpenseAmount / totalWalletBalance * 100 : 0;
    const currentDate = /* @__PURE__ */ new Date();
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrentMonth = currentDate.getMonth() === month - 1 && currentDate.getFullYear() === year;
    let daysPassedForAverage = daysInMonth;
    if (isCurrentMonth) {
      daysPassedForAverage = Math.max(currentDate.getDate() - 1, 1);
    }
    const dailyAverage = daysPassedForAverage > 0 ? Math.round(monthlyExpenseAmount / daysPassedForAverage * 100) / 100 : 0;
    let projectedTotal = monthlyExpenseAmount;
    if (isCurrentMonth && currentDate.getDate() < daysInMonth) {
      const remainingDays = daysInMonth - currentDate.getDate();
      projectedTotal = Math.round((monthlyExpenseAmount + dailyAverage * remainingDays) * 100) / 100;
    }
    const currentYear = currentDate.getFullYear();
    const daysLeft = isCurrentMonth ? daysInMonth - currentDate.getDate() : year > currentYear || year === currentYear && month > currentDate.getMonth() + 1 ? daysInMonth : 0;
    return {
      walletAmount: totalWalletBalance,
      // Total wallet balance (all additions)
      monthlyBudget: totalWalletBalance,
      // Same as wallet amount for consistency
      totalExpenses: monthlyExpenseAmount,
      // Expenses for this month only
      remainingAmount: availableBalance,
      // Available balance after all expenses
      expenseCount: monthlyExpenseCount,
      // Count for this month only
      averageExpense: monthlyAverageExpense,
      // Average for this month only
      percentageUsed: monthlyPercentageUsed,
      // Monthly expenses vs total wallet
      dailyAverage,
      projectedTotal,
      daysLeft
    };
  }
  async getCategoryBreakdown(month, year) {
    let query = db.select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      description: categories.description,
      isActive: categories.isActive,
      totalAmount: sum(expenses.amount),
      expenseCount: count(expenses.id)
    }).from(categories).leftJoin(expenses, eq(categories.id, expenses.categoryId)).where(eq(categories.isActive, 1)).groupBy(categories.id, categories.name, categories.color, categories.description, categories.isActive);
    if (month && year) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);
      query = db.select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        description: categories.description,
        isActive: categories.isActive,
        totalAmount: sum(expenses.amount),
        expenseCount: count(expenses.id)
      }).from(categories).leftJoin(expenses, and(
        eq(categories.id, expenses.categoryId),
        gte(expenses.date, startOfMonth),
        lte(expenses.date, endOfMonth)
      )).where(eq(categories.isActive, 1)).groupBy(categories.id, categories.name, categories.color, categories.description, categories.isActive);
    }
    const results = await query;
    const totalAmount = results.reduce((sum2, cat) => sum2 + parseFloat(cat.totalAmount || "0"), 0);
    return results.map((cat) => ({
      ...cat,
      totalAmount: parseFloat(cat.totalAmount || "0"),
      percentage: totalAmount > 0 ? parseFloat(cat.totalAmount || "0") / totalAmount * 100 : 0
    }));
  }
  async getExpenseTrends(days) {
    const startDate = /* @__PURE__ */ new Date();
    startDate.setDate(startDate.getDate() - days);
    const results = await db.select({
      date: sql2`DATE(${expenses.date})`,
      amount: sum(expenses.amount)
    }).from(expenses).where(gte(expenses.date, startDate)).groupBy(sql2`DATE(${expenses.date})`).orderBy(sql2`DATE(${expenses.date})`);
    return results.map((result) => ({
      date: result.date,
      amount: parseFloat(result.amount || "0")
    }));
  }
  async getMonthlyExpenseTrends(months) {
    const startDate = /* @__PURE__ */ new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    const results = await db.select({
      month: sql2`TO_CHAR(${expenses.date}, 'YYYY-MM')`,
      amount: sum(expenses.amount)
    }).from(expenses).where(gte(expenses.date, startDate)).groupBy(sql2`TO_CHAR(${expenses.date}, 'YYYY-MM')`).orderBy(sql2`TO_CHAR(${expenses.date}, 'YYYY-MM')`);
    return results.map((result) => ({
      month: result.month,
      amount: parseFloat(result.amount || "0")
    }));
  }
  // User management methods
  async getUsers() {
    const result = await db.select().from(users).orderBy(desc(users.createdAt));
    return result;
  }
  async getUserById(id) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  async getUserByEmail(email) {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }
  async getUserByAzureObjectId(azureObjectId) {
    const result = await db.select().from(users).where(eq(users.azureObjectId, azureObjectId)).limit(1);
    return result[0];
  }
  async createUser(user) {
    const newUser = {
      ...user,
      id: randomUUID(),
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    const [result] = await db.insert(users).values(newUser).returning();
    return result;
  }
  async updateUser(id, user) {
    const updateData = {
      ...user,
      updatedAt: /* @__PURE__ */ new Date()
    };
    const [result] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return result;
  }
  async updateUserLastLogin(id) {
    await db.update(users).set({
      lastLoginAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(users.id, id));
  }
  async deleteUser(id) {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }
};
var storage = new DatabaseStorage();

// server/objectStorage.ts
import { Storage } from "@google-cloud/storage";
import { randomUUID as randomUUID2 } from "crypto";

// server/objectAcl.ts
var ACL_POLICY_METADATA_KEY = "custom:aclPolicy";
function isPermissionAllowed(requested, granted) {
  if (requested === "read" /* READ */) {
    return ["read" /* READ */, "write" /* WRITE */].includes(granted);
  }
  return granted === "write" /* WRITE */;
}
function createObjectAccessGroup(group) {
  switch (group.type) {
    // Implement the case for each type of access group to instantiate.
    //
    // For example:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    // case "EMAIL_DOMAIN":
    //   return new EmailDomainAccessGroup(group.id);
    // case "GROUP_MEMBER":
    //   return new GroupMemberAccessGroup(group.id);
    // case "SUBSCRIBER":
    //   return new SubscriberAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}
async function setObjectAclPolicy(objectFile, aclPolicy) {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }
  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy)
    }
  });
}
async function getObjectAclPolicy(objectFile) {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy);
}
async function canAccessObject({
  userId,
  objectFile,
  requestedPermission
}) {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }
  if (aclPolicy.visibility === "public" && requestedPermission === "read" /* READ */) {
    return true;
  }
  if (!userId) {
    return false;
  }
  if (aclPolicy.owner === userId) {
    return true;
  }
  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (await accessGroup.hasMember(userId) && isPermissionAllowed(requestedPermission, rule.permission)) {
      return true;
    }
  }
  return false;
}

// server/objectStorage.ts
var REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
var objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token"
      }
    },
    universe_domain: "googleapis.com"
  },
  projectId: ""
});
var ObjectNotFoundError = class _ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, _ObjectNotFoundError.prototype);
  }
};
var ObjectStorageService = class {
  constructor() {
  }
  // Gets the public object search paths.
  getPublicObjectSearchPaths() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr.split(",").map((path4) => path4.trim()).filter((path4) => path4.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }
  // Gets the private object directory.
  getPrivateObjectDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR || "server/uploads/private";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }
  // Search for a public object from the search paths.
  async searchPublicObject(filePath) {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }
  // Downloads an object to the response.
  async downloadObject(file, res, cacheTtlSec = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL() {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    const objectId = randomUUID2();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900
    });
  }
  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath) {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }
  normalizeObjectEntityPath(rawPath) {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }
  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(rawPath, aclPolicy) {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }
  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission
  }) {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? "read" /* READ */
    });
  }
};
function parseObjectPath(path4) {
  if (!path4.startsWith("/")) {
    path4 = `/${path4}`;
  }
  const pathParts = path4.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return {
    bucketName,
    objectName
  };
}
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec
}) {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1e3).toISOString()
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`
    );
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

// server/excelImport.ts
import XLSX from "xlsx";
async function parseExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    console.log("Raw Excel data:", rawData);
    console.log("Sample row:", rawData[0]);
    return rawData;
  } catch (error) {
    console.error("Error parsing Excel file:", error);
    throw new Error("Failed to parse Excel file");
  }
}
async function mapExcelRowToExpense(row, categories2) {
  const mappings = {
    date: ["date", "Date", "DATE", "expense_date", "Expense Date"],
    description: ["description", "Description", "DESCRIPTION", "expense_description", "Expense Description", "item", "Item"],
    amount: ["amount", "Amount", "AMOUNT", "expense_amount", "Expense Amount", "cost", "Cost", "price", "Price"],
    category: ["category", "Category", "CATEGORY", "expense_category", "Expense Category", "type", "Type"],
    vendor: ["vendor", "Vendor", "VENDOR", "supplier", "Supplier", "merchant", "Merchant"],
    notes: ["notes", "Notes", "NOTES", "comments", "Comments", "remarks", "Remarks"]
  };
  const mappedData = {};
  for (const [field, possibleKeys] of Object.entries(mappings)) {
    for (const key of possibleKeys) {
      if (row[key] !== void 0 && row[key] !== null && row[key] !== "") {
        mappedData[field] = row[key];
        break;
      }
    }
  }
  if (mappedData.date) {
    try {
      let dateValue;
      if (typeof mappedData.date === "number") {
        const excelDate = new Date((mappedData.date - 25569) * 86400 * 1e3);
        dateValue = excelDate.toISOString().split("T")[0];
      } else {
        const date = new Date(mappedData.date);
        dateValue = date.toISOString().split("T")[0];
      }
      mappedData.date = dateValue;
    } catch (error) {
      mappedData.date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    }
  } else {
    mappedData.date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
  if (mappedData.amount) {
    const amountStr = String(mappedData.amount).replace(/[₹,\s]/g, "");
    mappedData.amount = amountStr;
  }
  if (mappedData.category) {
    const categoryName = String(mappedData.category).trim();
    const matchedCategory = categories2.find(
      (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
    );
    if (matchedCategory) {
      mappedData.categoryId = matchedCategory.id;
    } else {
      try {
        const newCategory = await storage.createCategory({ name: categoryName });
        mappedData.categoryId = newCategory.id;
        categories2.push(newCategory);
      } catch (error) {
        console.error("Failed to create category:", categoryName, error);
        mappedData.categoryId = categories2[0]?.id;
      }
    }
  } else {
    mappedData.categoryId = categories2[0]?.id;
  }
  if (!mappedData.description) {
    mappedData.description = "Imported expense";
  }
  if (!mappedData.amount) {
    mappedData.amount = "0";
  }
  return mappedData;
}
async function importExpensesFromExcel(filePath) {
  try {
    const rawData = await parseExcelFile(filePath);
    if (!rawData || rawData.length === 0) {
      throw new Error("No data found in Excel file");
    }
    const categories2 = await storage.getCategories();
    const importResults = {
      total: rawData.length,
      successful: 0,
      failed: 0,
      errors: []
    };
    for (let i = 0; i < rawData.length; i++) {
      try {
        const row = rawData[i];
        const mappedExpense = await mapExcelRowToExpense(row, categories2);
        const validatedExpense = insertExpenseSchema.parse(mappedExpense);
        await storage.createExpense(validatedExpense);
        importResults.successful++;
      } catch (error) {
        console.error(`Failed to import row ${i + 1}:`, error);
        importResults.failed++;
        importResults.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    return importResults;
  } catch (error) {
    console.error("Error importing expenses from Excel:", error);
    throw error;
  }
}

// server/authProvider.ts
import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";

// server/authConfig.ts
var msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || "",
    authority: `${process.env.AZURE_CLOUD_INSTANCE || "https://login.microsoftonline.com/"}${process.env.AZURE_TENANT_ID || ""}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET || ""
  },
  system: {
    loggerOptions: {
      loggerCallback(level, message, containsPii) {
        if (!containsPii) {
          console.log(`[MSAL] ${message}`);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3
    }
  }
};
var REDIRECT_URI = process.env.AZURE_REDIRECT_URI || "https://ce024f68-a4f6-43ef-bf2b-5a8963f12ae5-00-ptzzz2z0tnld.riker.replit.dev/auth/redirect";
var POST_LOGOUT_REDIRECT_URI = process.env.AZURE_POST_LOGOUT_REDIRECT_URI || "https://ce024f68-a4f6-43ef-bf2b-5a8963f12ae5-00-ptzzz2z0tnld.riker.replit.dev";
var SCOPES = ["user.read"];

// server/authProvider.ts
import axios from "axios";
var AuthProvider = class {
  msalInstance;
  cryptoProvider;
  constructor() {
    this.msalInstance = new ConfidentialClientApplication(msalConfig);
    this.cryptoProvider = new CryptoProvider();
  }
  login(options = {}) {
    return async (req, res, next) => {
      try {
        const state = this.cryptoProvider.base64Encode(
          JSON.stringify({
            successRedirect: options.successRedirect || "/dashboard"
          })
        );
        const authCodeUrlRequestParams = {
          state,
          scopes: SCOPES,
          redirectUri: REDIRECT_URI
        };
        const authCodeUrl = await this.msalInstance.getAuthCodeUrl(authCodeUrlRequestParams);
        res.redirect(authCodeUrl);
      } catch (error) {
        console.error("Auth login error:", error);
        next(error);
      }
    };
  }
  async completeAuth(req, res, next) {
    try {
      if (!req.query.code || !req.query.state) {
        return res.status(400).send("Missing code or state parameter");
      }
      const state = JSON.parse(this.cryptoProvider.base64Decode(req.query.state));
      const authCodeRequest = {
        code: req.query.code,
        scopes: SCOPES,
        redirectUri: REDIRECT_URI,
        state: req.query.state
      };
      console.log("authCodeRequest", authCodeRequest);
      const response = await this.msalInstance.acquireTokenByCode(authCodeRequest);
      const userInfo = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: {
          "Authorization": `Bearer ${response.accessToken}`
        }
      });
      const azureUser = userInfo.data;
      let user = await storage.getUserByAzureObjectId(azureUser.id);
      if (!user) {
        const email = azureUser.mail || azureUser.userPrincipalName;
        user = await storage.getUserByEmail(email);
        if (user) {
          if (!user.isActive) {
            return res.status(403).json({
              error: "Your account is not active. Please contact the administrator."
            });
          }
          user = await storage.updateUser(user.id, {
            azureObjectId: azureUser.id,
            name: azureUser.displayName
            // Update name from Azure
          });
        } else {
          return res.status(403).json({
            error: "Access denied. Your email is not authorized. Please contact the administrator to request access."
          });
        }
      } else {
        if (!user.isActive) {
          return res.status(403).json({
            error: "Your account is not active. Please contact the administrator."
          });
        }
      }
      if (!user) {
        return res.status(500).json({ error: "Authentication failed" });
      }
      await storage.updateUserLastLogin(user.id);
      req.session.accessToken = response.accessToken;
      req.session.idToken = response.idToken;
      req.session.account = response.account;
      req.session.isAuthenticated = true;
      req.session.user = user;
      res.redirect(state.successRedirect);
    } catch (error) {
      console.error("Auth completion error:", error);
      next(error);
    }
  }
  logout() {
    return (req, res) => {
      const logoutUri = `${msalConfig.auth.authority}/oauth2/v2.0/logout?post_logout_redirect_uri=${POST_LOGOUT_REDIRECT_URI}`;
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
        res.redirect(logoutUri);
      });
    };
  }
  requireAuth() {
    return (req, res, next) => {
      if (req.session.isAuthenticated && req.session.user) {
        return next();
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }
    };
  }
  requireAdmin() {
    return (req, res, next) => {
      if (req.session.isAuthenticated && req.session.user?.role === "admin") {
        return next();
      } else {
        return res.status(403).json({ error: "Admin access required" });
      }
    };
  }
  getUser() {
    return (req, res, next) => {
      if (req.session.user) {
        req.user = req.session.user;
      }
      next();
    };
  }
};
var authProvider = new AuthProvider();

// server/authRoutes.ts
import express from "express";
var router = express.Router();
router.get("/signin", authProvider.login({
  successRedirect: "/dashboard"
}));
router.get("/redirect", async (req, res, next) => {
  await authProvider.completeAuth(req, res, next);
});
router.get("/signout", authProvider.logout());
router.get("/me", authProvider.requireAuth(), (req, res) => {
  res.json(req.session.user);
});
var authRoutes_default = router;

// server/userRoutes.ts
import express2 from "express";
var router2 = express2.Router();
router2.get("/", authProvider.requireAdmin(), async (req, res) => {
  try {
    const users2 = await storage.getUsers();
    res.json(users2);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});
router2.post("/", authProvider.requireAdmin(), async (req, res) => {
  try {
    const userData = insertUserSchema.omit({ id: true, createdAt: true, updatedAt: true, azureObjectId: true, lastLoginAt: true }).parse(req.body);
    const user = await storage.createUser(userData);
    res.status(201).json(user);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(400).json({ error: "Failed to create user" });
  }
});
router2.get("/:id", authProvider.requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await storage.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});
router2.put("/:id", authProvider.requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.session.user?.id && req.body.role === "user") {
      return res.status(400).json({ error: "Cannot demote yourself from admin role" });
    }
    const userData = updateUserSchema.partial().parse(req.body);
    const user = await storage.updateUser(id, userData);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(400).json({ error: "Failed to update user" });
  }
});
router2.patch("/:id/status", authProvider.requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (id === req.session.user?.id && !isActive) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }
    const user = await storage.updateUser(id, { isActive });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ error: "Failed to update user status" });
  }
});
router2.delete("/:id", authProvider.requireAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.session.user?.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    const success = await storage.deleteUser(id);
    if (!success) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});
var userRoutes_default = router2;

// server/routes.ts
import path from "path";
async function registerRoutes(app2) {
  app2.use("/auth", authRoutes_default);
  app2.use("/api/users", userRoutes_default);
  app2.use("/api", authProvider.requireAuth());
  app2.get("/api/categories", async (req, res) => {
    try {
      const categories2 = await storage.getCategories();
      res.json(categories2);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });
  app2.post("/api/categories", async (req, res) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(400).json({ error: "Failed to create category" });
    }
  });
  app2.put("/api/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const categoryData = insertCategorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(id, categoryData);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(400).json({ error: "Failed to update category" });
    }
  });
  app2.delete("/api/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteCategory(id);
      if (!success) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });
  app2.get("/api/expense-wallets", async (req, res) => {
    try {
      const expenseWallets2 = await storage.getExpenseWallets();
      res.json(expenseWallets2);
    } catch (error) {
      console.error("Error fetching expense wallets:", error);
      res.status(500).json({ error: "Failed to fetch expense wallets" });
    }
  });
  app2.get("/api/current-expense-wallet", async (req, res) => {
    try {
      const currentWallet = await storage.getCurrentExpenseWallet();
      if (!currentWallet) {
        return res.status(404).json({ error: "No expense wallet found" });
      }
      res.json(currentWallet);
    } catch (error) {
      console.error("Error fetching current expense wallet:", error);
      res.status(500).json({ error: "Failed to fetch current expense wallet" });
    }
  });
  app2.post("/api/expense-wallets", async (req, res) => {
    try {
      const walletData = insertExpenseWalletSchema.parse(req.body);
      const expenseWallet = await storage.createExpenseWallet(walletData);
      res.status(201).json(expenseWallet);
    } catch (error) {
      console.error("Error creating expense wallet:", error);
      res.status(400).json({ error: "Failed to create expense wallet" });
    }
  });
  app2.put("/api/expense-wallets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const walletData = insertExpenseWalletSchema.partial().parse(req.body);
      const expenseWallet = await storage.updateExpenseWallet(id, walletData);
      if (!expenseWallet) {
        return res.status(404).json({ error: "Expense wallet not found" });
      }
      res.json(expenseWallet);
    } catch (error) {
      console.error("Error updating expense wallet:", error);
      res.status(400).json({ error: "Failed to update expense wallet" });
    }
  });
  app2.get("/api/expenses", async (req, res) => {
    try {
      const {
        search,
        categoryId,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        sortBy = "date",
        sortOrder = "desc",
        limit = "50",
        offset = "0"
      } = req.query;
      const filters = {
        search,
        categoryId,
        startDate,
        endDate,
        minAmount: minAmount ? parseFloat(minAmount) : void 0,
        maxAmount: maxAmount ? parseFloat(maxAmount) : void 0
      };
      Object.keys(filters).forEach((key) => {
        if (filters[key] === void 0 || filters[key] === "") {
          delete filters[key];
        }
      });
      const expenses2 = await storage.getExpenses(
        Object.keys(filters).length > 0 ? filters : void 0,
        sortBy,
        sortOrder,
        parseInt(limit),
        parseInt(offset)
      );
      const totalCount = await storage.getExpensesCount(
        Object.keys(filters).length > 0 ? filters : void 0
      );
      res.json({
        expenses: expenses2,
        totalCount,
        hasMore: parseInt(offset) + expenses2.length < totalCount
      });
    } catch (error) {
      console.error("Error fetching expenses:", error);
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });
  app2.get("/api/expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const expense = await storage.getExpenseById(id);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      console.error("Error fetching expense:", error);
      res.status(500).json({ error: "Failed to fetch expense" });
    }
  });
  app2.post("/api/expenses", async (req, res) => {
    try {
      const expenseData = insertExpenseSchema.parse(req.body);
      const expense = await storage.createExpense(expenseData);
      res.status(201).json(expense);
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(400).json({ error: "Failed to create expense" });
    }
  });
  app2.put("/api/expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const expenseData = updateExpenseSchema.parse({ ...req.body, id });
      const expense = await storage.updateExpense(id, expenseData);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(400).json({ error: "Failed to update expense" });
    }
  });
  app2.delete("/api/expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteExpense(id);
      if (!success) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });
  app2.get("/api/analytics/wallet-summary", async (req, res) => {
    try {
      const summary = await storage.getWalletSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching wallet summary:", error);
      res.status(500).json({ error: "Failed to fetch wallet summary" });
    }
  });
  app2.get("/api/analytics/budget-summary/:month/:year", async (req, res) => {
    try {
      console.log("budget summary");
      const { month, year } = req.params;
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: "Invalid month or year parameter" });
      }
      const summary = await storage.getWalletSummaryForMonth(monthNum, yearNum);
      console.log(summary);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching budget summary:", error);
      res.status(500).json({ error: "Failed to fetch budget summary" });
    }
  });
  app2.get("/api/analytics/category-breakdown", async (req, res) => {
    try {
      const { month, year } = req.query;
      const monthNum = month ? parseInt(month) : void 0;
      const yearNum = year ? parseInt(year) : void 0;
      const breakdown = await storage.getCategoryBreakdown(monthNum, yearNum);
      res.json(breakdown);
    } catch (error) {
      console.error("Error fetching category breakdown:", error);
      res.status(500).json({ error: "Failed to fetch category breakdown" });
    }
  });
  app2.get("/api/analytics/expense-trends/:days", async (req, res) => {
    try {
      const days = parseInt(req.params.days);
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ error: "Invalid days parameter" });
      }
      const trends = await storage.getExpenseTrends(days);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching expense trends:", error);
      res.status(500).json({ error: "Failed to fetch expense trends" });
    }
  });
  app2.get("/api/analytics/expense-trends-monthly/:months", async (req, res) => {
    try {
      const months = parseInt(req.params.months);
      if (isNaN(months) || months < 1) {
        return res.status(400).json({ error: "Invalid months parameter" });
      }
      const trends = await storage.getMonthlyExpenseTrends(months);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching monthly expense trends:", error);
      res.status(500).json({ error: "Failed to fetch monthly expense trends" });
    }
  });
  app2.get("/api/export/csv", async (req, res) => {
    try {
      const {
        search,
        categoryId,
        startDate,
        endDate,
        minAmount,
        maxAmount
      } = req.query;
      const filters = {
        search,
        categoryId,
        startDate,
        endDate,
        minAmount: minAmount ? parseFloat(minAmount) : void 0,
        maxAmount: maxAmount ? parseFloat(maxAmount) : void 0
      };
      Object.keys(filters).forEach((key) => {
        if (filters[key] === void 0 || filters[key] === "") {
          delete filters[key];
        }
      });
      const expenses2 = await storage.getExpenses(
        Object.keys(filters).length > 0 ? filters : void 0,
        "date",
        "desc",
        999999,
        // Get all expenses for export
        0
      );
      const csvData = [
        ["Date", "Description", "Category", "Vendor", "Amount", "Notes"].join(","),
        ...expenses2.map((expense) => [
          new Date(expense.date).toLocaleDateString(),
          `"${expense.description.replace(/"/g, '""')}"`,
          expense.category ? `"${expense.category.name.replace(/"/g, '""')}"` : "Uncategorized",
          expense.vendor ? `"${expense.vendor.replace(/"/g, '""')}"` : "",
          expense.amount,
          expense.notes ? `"${expense.notes.replace(/"/g, '""')}"` : ""
        ].join(","))
      ].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="expenses-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv"`);
      res.send(csvData);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ error: "Failed to export CSV" });
    }
  });
  app2.get("/objects/:objectPath(*)", authProvider.requireAuth(), async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });
  app2.post("/api/objects/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });
  app2.post("/api/expenses/import-excel", async (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }
      const fullPath = path.join(process.cwd(), filePath);
      const results = await importExpensesFromExcel(fullPath);
      res.json(results);
    } catch (error) {
      console.error("Error importing Excel file:", error);
      res.status(500).json({ error: "Failed to import Excel file", details: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express3 from "express";
import fs from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path2.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path3.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express3.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
dotenv2.config();
var app = express4();
app.use(express4.json());
app.use(express4.urlencoded({ extended: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
  // needed for cookies
}));
var PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "fallback-secret-for-development",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1e3
  }
}));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "\u2026";
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    console.error(err);
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = Number(process.env.PORT) || 3e3;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
})();
