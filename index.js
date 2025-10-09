// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: text("employee_id").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  designation: text("designation").notNull(),
  role: text("role").notNull().default("employee"),
  // employee, hr, or manager
  department: text("department").notNull()
});
var workEntries = pgTable("work_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(),
  // YYYY-MM-DD format
  workType: text("work_type").notNull(),
  // Task, Project, Meeting, Skill-up, Partial Leave
  description: text("description").notNull(),
  timeSpent: text("time_spent").notNull(),
  // hours in decimal format
  status: text("status").notNull().default("pending"),
  // pending, approved, rejected
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});
var managerPreferences = pgTable("manager_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  managerId: varchar("manager_id").notNull(),
  selectedEmployeeIds: text("selected_employee_ids").notNull(),
  // JSON array of employee IDs
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`)
});
var workHourRequests = pgTable("work_hour_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  requestedDate: text("requested_date").notNull(),
  // YYYY-MM-DD format
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  // pending, approved, rejected
  managerId: varchar("manager_id"),
  managerComments: text("manager_comments"),
  requestedAt: timestamp("requested_at").notNull().default(sql`now()`),
  reviewedAt: timestamp("reviewed_at")
});
var insertUserSchema = createInsertSchema(users).omit({
  id: true
}).partial({
  username: true,
  password: true
});
var insertWorkEntrySchema = createInsertSchema(workEntries).omit({
  id: true,
  userId: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAt: true
});
var insertManagerPreferencesSchema = createInsertSchema(managerPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertWorkHourRequestSchema = createInsertSchema(workHourRequests).omit({
  id: true,
  employeeId: true,
  managerId: true,
  managerComments: true,
  requestedAt: true,
  reviewedAt: true
});
var updateWorkHourRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  managerComments: z.string().optional()
});
var updateWorkEntryStatusSchema = z.object({
  status: z.enum(["approved", "rejected"])
});

// server/storage.ts
import { randomUUID, scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import session from "express-session";
import createMemoryStore from "memorystore";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and, gte, lte } from "drizzle-orm";
import { sql as sql2 } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
var MemoryStore = createMemoryStore(session);
var client = neon(process.env.DATABASE_URL);
var db = drizzle(client);
var DbStorage = class {
  sessionStore;
  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 864e5
      // prune expired entries every 24h
    });
    this.seedData().catch(console.error);
  }
  async seedData() {
    const existingUser = await this.getUserByEmail("navalika@fdestech.com");
    if (!existingUser) {
      const accounts = [
        {
          employeeId: "MGR002",
          username: "navalika.fd",
          password: "azure-auth",
          firstName: "Navalika",
          lastName: "FD",
          email: "navalika@fdestech.com",
          designation: "Operations Manager",
          role: "manager",
          department: "Management"
        }
      ];
      for (const account of accounts) {
        const hashedPassword = await hashPassword(account.password);
        await db.insert(users).values({
          ...account,
          password: hashedPassword
        });
      }
    }
  }
  async getUser(id) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  async getUserByUsername(username) {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }
  async getUserByEmail(email) {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }
  async createUser(insertUser) {
    const username = insertUser.username || `${insertUser.firstName.toLowerCase()}.${insertUser.lastName.toLowerCase()}`;
    const password = insertUser.password || "defaultPassword123";
    const hashedPassword = await hashPassword(password);
    const userData = {
      ...insertUser,
      username,
      password: hashedPassword,
      role: insertUser.role || "employee"
    };
    const result = await db.insert(users).values(userData).returning();
    return result[0];
  }
  async getAllUsers() {
    return await db.select().from(users);
  }
  async updateUser(id, updateData) {
    const result = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return result[0];
  }
  async deleteUser(id) {
    const user = await this.getUser(id);
    if (!user) return false;
    const allUsers = await this.getAllUsers();
    const remainingUsers = allUsers.filter((u) => u.id !== id);
    const hasManagersLeft = remainingUsers.some((u) => u.role === "manager");
    if (user.role === "manager" && !hasManagersLeft) {
      throw new Error("Cannot delete the last manager user");
    }
    const result = await db.delete(users).where(eq(users.id, id));
    return true;
  }
  async createWorkEntry(data) {
    const workEntryData = {
      ...data,
      status: "pending",
      reviewedBy: null,
      reviewedAt: null
    };
    const result = await db.insert(workEntries).values(workEntryData).returning();
    return result[0];
  }
  async getWorkEntriesByUserId(userId) {
    return await db.select().from(workEntries).where(eq(workEntries.userId, userId)).orderBy(sql2`${workEntries.date} DESC`);
  }
  async getWorkEntriesByUserIdWithFilters(filters) {
    const conditions = [eq(workEntries.userId, filters.userId)];
    if (filters.startDate) {
      conditions.push(gte(workEntries.date, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(workEntries.date, filters.endDate));
    }
    return await db.select().from(workEntries).where(and(...conditions)).orderBy(sql2`${workEntries.date} DESC`);
  }
  async getAllWorkEntries() {
    const result = await db.select({
      id: workEntries.id,
      userId: workEntries.userId,
      date: workEntries.date,
      workType: workEntries.workType,
      description: workEntries.description,
      timeSpent: workEntries.timeSpent,
      status: workEntries.status,
      reviewedBy: workEntries.reviewedBy,
      reviewedAt: workEntries.reviewedAt,
      createdAt: workEntries.createdAt,
      user: {
        id: users.id,
        employeeId: users.employeeId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        designation: users.designation,
        role: users.role,
        department: users.department
      }
    }).from(workEntries).leftJoin(users, eq(workEntries.userId, users.id)).orderBy(sql2`${workEntries.date} DESC`);
    return result.filter((entry) => entry.user);
  }
  async getWorkEntryById(id) {
    const result = await db.select().from(workEntries).where(eq(workEntries.id, id)).limit(1);
    return result[0];
  }
  async updateWorkEntryStatus(id, status, reviewedBy) {
    const result = await db.update(workEntries).set({
      status,
      reviewedBy,
      reviewedAt: /* @__PURE__ */ new Date()
    }).where(eq(workEntries.id, id)).returning();
    return result[0];
  }
  async deleteWorkEntry(id) {
    await db.delete(workEntries).where(eq(workEntries.id, id));
    return true;
  }
  async getWorkEntriesByFilters(filters) {
    let query = db.select({
      id: workEntries.id,
      userId: workEntries.userId,
      date: workEntries.date,
      workType: workEntries.workType,
      description: workEntries.description,
      timeSpent: workEntries.timeSpent,
      status: workEntries.status,
      reviewedBy: workEntries.reviewedBy,
      reviewedAt: workEntries.reviewedAt,
      createdAt: workEntries.createdAt,
      user: {
        id: users.id,
        employeeId: users.employeeId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        designation: users.designation,
        role: users.role,
        department: users.department
      }
    }).from(workEntries).leftJoin(users, eq(workEntries.userId, users.id));
    const conditions = [];
    if (filters.userId) {
      conditions.push(eq(workEntries.userId, filters.userId));
    }
    if (filters.department) {
      conditions.push(eq(users.department, filters.department));
    }
    if (filters.status) {
      conditions.push(eq(workEntries.status, filters.status));
    }
    if (filters.startDate) {
      conditions.push(gte(workEntries.date, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(workEntries.date, filters.endDate));
    }
    if (conditions.length > 0) {
      const result2 = await query.where(and(...conditions)).orderBy(sql2`${workEntries.date} DESC`);
      return result2.filter((entry) => entry.user);
    }
    const result = await query.orderBy(sql2`${workEntries.date} DESC`);
    return result.filter((entry) => entry.user);
  }
  async getDailyWorkReport(userId, date) {
    const entries = await db.select().from(workEntries).where(and(eq(workEntries.userId, userId), eq(workEntries.date, date)));
    const totalHours = entries.reduce((sum, entry) => sum + parseFloat(entry.timeSpent), 0);
    return {
      date,
      entries,
      totalHours
    };
  }
  // Manager preferences methods
  async getManagerPreferences(managerId) {
    const result = await db.select().from(managerPreferences).where(eq(managerPreferences.managerId, managerId)).limit(1);
    return result[0];
  }
  async saveManagerPreferences(preferences) {
    const result = await db.insert(managerPreferences).values(preferences).returning();
    return result[0];
  }
  async updateManagerPreferences(managerId, selectedEmployeeIds) {
    const existing = await this.getManagerPreferences(managerId);
    if (existing) {
      const result = await db.update(managerPreferences).set({
        selectedEmployeeIds: JSON.stringify(selectedEmployeeIds),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(managerPreferences.id, existing.id)).returning();
      return result[0];
    } else {
      return this.saveManagerPreferences({
        managerId,
        selectedEmployeeIds: JSON.stringify(selectedEmployeeIds)
      });
    }
  }
  // Work hour request methods
  async createWorkHourRequest(request) {
    const result = await db.insert(workHourRequests).values(request).returning();
    return result[0];
  }
  async getWorkHourRequestsByEmployeeId(employeeId) {
    const result = await db.select({
      id: workHourRequests.id,
      employeeId: workHourRequests.employeeId,
      requestedDate: workHourRequests.requestedDate,
      reason: workHourRequests.reason,
      status: workHourRequests.status,
      managerId: workHourRequests.managerId,
      managerComments: workHourRequests.managerComments,
      requestedAt: workHourRequests.requestedAt,
      reviewedAt: workHourRequests.reviewedAt,
      employee: {
        id: users.id,
        employeeId: users.employeeId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        designation: users.designation,
        role: users.role,
        department: users.department
      }
    }).from(workHourRequests).leftJoin(users, eq(workHourRequests.employeeId, users.id)).where(eq(workHourRequests.employeeId, employeeId)).orderBy(sql2`${workHourRequests.requestedAt} DESC`);
    return result.filter((req) => req.employee);
  }
  async getWorkHourRequestsByManagerId(managerId) {
    const result = await db.select({
      id: workHourRequests.id,
      employeeId: workHourRequests.employeeId,
      requestedDate: workHourRequests.requestedDate,
      reason: workHourRequests.reason,
      status: workHourRequests.status,
      managerId: workHourRequests.managerId,
      managerComments: workHourRequests.managerComments,
      requestedAt: workHourRequests.requestedAt,
      reviewedAt: workHourRequests.reviewedAt,
      employee: {
        id: users.id,
        employeeId: users.employeeId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        designation: users.designation,
        role: users.role,
        department: users.department
      }
    }).from(workHourRequests).leftJoin(users, eq(workHourRequests.employeeId, users.id)).where(eq(workHourRequests.status, "pending")).orderBy(sql2`${workHourRequests.requestedAt} DESC`);
    return result.filter((req) => req.employee);
  }
  async getAllWorkHourRequests() {
    const result = await db.select({
      id: workHourRequests.id,
      employeeId: workHourRequests.employeeId,
      requestedDate: workHourRequests.requestedDate,
      reason: workHourRequests.reason,
      status: workHourRequests.status,
      managerId: workHourRequests.managerId,
      managerComments: workHourRequests.managerComments,
      requestedAt: workHourRequests.requestedAt,
      reviewedAt: workHourRequests.reviewedAt,
      employee: {
        id: users.id,
        employeeId: users.employeeId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        designation: users.designation,
        role: users.role,
        department: users.department
      }
    }).from(workHourRequests).leftJoin(users, eq(workHourRequests.employeeId, users.id)).orderBy(sql2`${workHourRequests.requestedAt} DESC`);
    return result.filter((req) => req.employee);
  }
  async getWorkHourRequestById(id) {
    const result = await db.select({
      id: workHourRequests.id,
      employeeId: workHourRequests.employeeId,
      requestedDate: workHourRequests.requestedDate,
      reason: workHourRequests.reason,
      status: workHourRequests.status,
      managerId: workHourRequests.managerId,
      managerComments: workHourRequests.managerComments,
      requestedAt: workHourRequests.requestedAt,
      reviewedAt: workHourRequests.reviewedAt,
      employee: {
        id: users.id,
        employeeId: users.employeeId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        designation: users.designation,
        role: users.role,
        department: users.department
      }
    }).from(workHourRequests).leftJoin(users, eq(workHourRequests.employeeId, users.id)).where(eq(workHourRequests.id, id)).limit(1);
    const req = result[0];
    return req?.employee ? req : void 0;
  }
  async updateWorkHourRequest(id, updates) {
    const updateData = {
      status: updates.status,
      reviewedAt: /* @__PURE__ */ new Date()
    };
    if (updates.managerId) {
      updateData.managerId = updates.managerId;
    }
    if (updates.managerComments) {
      updateData.managerComments = updates.managerComments;
    }
    const result = await db.update(workHourRequests).set(updateData).where(eq(workHourRequests.id, id)).returning();
    return result[0];
  }
  async deleteWorkHourRequest(id) {
    const result = await db.delete(workHourRequests).where(eq(workHourRequests.id, id));
    return result.rowCount > 0;
  }
  // Legacy methods for backward compatibility
  async createTimesheet(timesheet) {
    return this.createWorkEntry(timesheet);
  }
  async getTimesheetsByUserId(userId) {
    return this.getWorkEntriesByUserId(userId);
  }
  async getAllTimesheets() {
    return this.getAllWorkEntries();
  }
  async getTimesheetById(id) {
    return this.getWorkEntryById(id);
  }
  async updateTimesheetStatus(id, status, reviewedBy) {
    return this.updateWorkEntryStatus(id, status, reviewedBy);
  }
  async deleteTimesheet(id) {
    return this.deleteWorkEntry(id);
  }
  async getTimesheetsByFilters(filters) {
    return this.getWorkEntriesByFilters(filters);
  }
};
var storage = new DbStorage();

// server/routes.ts
import { z as z2 } from "zod";

// server/auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
import { scrypt as scrypt2, randomBytes as randomBytes2, timingSafeEqual } from "crypto";
import { promisify as promisify2 } from "util";
function sanitizeUser(user) {
  const { password, ...publicUser } = user;
  return publicUser;
}
var scryptAsync2 = promisify2(scrypt2);
async function hashPassword2(password) {
  const salt = randomBytes2(16).toString("hex");
  const buf = await scryptAsync2(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync2(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "dev-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore
  };
  app2.set("trust proxy", 1);
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !await comparePasswords(password, user.password)) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, user);
      } else {
        done(null, false);
      }
    } catch (error) {
      console.error("Error deserializing user:", error);
      done(null, false);
    }
  });
  app2.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }
      const validatedData = insertUserSchema.parse({
        ...req.body,
        role: "employee"
        // Always set role to employee, ignore client input
      });
      if (!validatedData.password) {
        return res.status(400).send("Password is required");
      }
      const user = await storage.createUser({
        ...validatedData,
        password: await hashPassword2(validatedData.password)
      });
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(sanitizeUser(user));
      });
    } catch (error) {
      res.status(500).send("Registration failed");
    }
  });
  app2.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(sanitizeUser(req.user));
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    console.log("my req", req);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(sanitizeUser(req.user));
  });
}

// server/azure-auth.ts
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
var clientConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (!containsPii) {
          console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3
      // Info level
    }
  }
};
var msalInstance = new ConfidentialClientApplication(clientConfig);
function getGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
}
async function getAuthUrl() {
  const redirectUri = process.env.AZURE_REDIRECT_URI || `http://localhost:5002/auth/redirect`;
  console.log("Debug - FORCED redirectUri:", redirectUri);
  const authCodeUrlRequest = {
    scopes: ["user.read", "openid", "profile", "email"],
    redirectUri
  };
  const authUrl = await msalInstance.getAuthCodeUrl(authCodeUrlRequest);
  console.log("Debug - Generated Auth URL:", authUrl);
  return authUrl;
}
async function handleCallback(code) {
  try {
    const redirectUri = process.env.AZURE_REDIRECT_URI || `http://localhost:5002/auth/redirect`;
    const tokenRequest = {
      code,
      scopes: ["user.read", "openid", "profile", "email"],
      redirectUri
    };
    const response = await msalInstance.acquireTokenByCode(tokenRequest);
    if (!response) {
      throw new Error("Failed to acquire token");
    }
    const graphClient = getGraphClient(response.accessToken);
    const user = await graphClient.api("/me").get();
    return {
      accessToken: response.accessToken,
      user: {
        id: user.id,
        email: user.userPrincipalName || user.mail,
        firstName: user.givenName,
        lastName: user.surname,
        displayName: user.displayName
      }
    };
  } catch (error) {
    console.error("Azure auth error:", error);
    throw error;
  }
}
async function ensureUserExists(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "No user found in session" });
    }
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "User not found in system" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("User verification error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// server/routes.ts
function requireAuth(req, res, next) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}
async function registerRoutes(app2) {
  setupAuth(app2);
  app2.get("/api/auth/azure", async (req, res) => {
    try {
      const authUrl = await getAuthUrl();
      res.redirect(authUrl);
    } catch (error) {
      console.error("Azure auth error:", error);
      res.status(500).json({ message: "Failed to initiate Azure authentication" });
    }
  });
  app2.get("/auth/redirect", async (req, res) => {
    try {
      const code = req.query.code;
      if (!code) return res.status(400).send("No code provided by Azure");
      const authResult = await handleCallback(code);
      const azureUser = authResult.user;
      const user = await storage.getUserByEmail(azureUser.email);
      if (!user) {
        return res.status(403).send("User not registered in the system");
      }
      req.login(user, (err) => {
        if (err) return res.status(500).send("Login failed");
        if (user.role === "manager") res.redirect("/manager");
        else if (user.role === "hr") res.redirect("/hr");
        else res.redirect("/");
      });
    } catch (error) {
      console.error("Azure callback error:", error);
      res.status(500).send("Authentication failed");
    }
  });
  app2.get("/api/auth/callback", async (req, res) => {
    try {
      const { code } = req.query;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Authorization code missing" });
      }
      const authResult = await handleCallback(code);
      const azureUser = authResult.user;
      let user = await storage.getUserByEmail(azureUser.email);
      if (!user) {
        if (azureUser.email === "navalika@fdestech.com") {
          user = await storage.createUser({
            employeeId: "MGR002",
            username: azureUser.firstName.toLowerCase() + "." + azureUser.lastName.toLowerCase(),
            firstName: azureUser.firstName,
            lastName: azureUser.lastName,
            email: azureUser.email,
            designation: "Manager",
            department: "Management",
            role: "manager",
            password: "azure-auth"
            // Placeholder since we're using Azure auth
          });
        } else {
          return res.status(403).json({
            message: "User not found in system. Please contact your administrator."
          });
        }
      }
      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        if (user.role === "manager") {
          res.redirect("/manager");
        } else if (user.role === "hr") {
          res.redirect("/hr");
        } else {
          res.redirect("/");
        }
      });
    } catch (error) {
      console.error("Azure callback error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });
  app2.get("/api/users", requireAuth, ensureUserExists, requireRole("hr", "manager"), async (req, res) => {
    try {
      const users2 = await storage.getAllUsers();
      const sanitizedUsers = users2.map((user) => {
        const { password, ...publicUser } = user;
        return publicUser;
      });
      res.json(sanitizedUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app2.post("/api/users", requireAuth, ensureUserExists, requireRole("manager"), async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validatedData);
      const { password, ...publicUser } = user;
      res.json(publicUser);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user" });
    }
  });
  app2.put("/api/users/:id", requireAuth, ensureUserExists, requireRole("manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      delete updateData.id;
      if ((updateData.firstName || updateData.lastName) && !updateData.username) {
        const existingUser = await storage.getUser(id);
        if (existingUser) {
          const firstName = updateData.firstName || existingUser.firstName;
          const lastName = updateData.lastName || existingUser.lastName;
          updateData.username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
        }
      }
      delete updateData.password;
      const updatedUser = await storage.updateUser(id, updateData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...publicUser } = updatedUser;
      res.json(publicUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  app2.delete("/api/users/:id", requireAuth, ensureUserExists, requireRole("manager"), async (req, res) => {
    try {
      const { id } = req.params;
      if (req.user.id === id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      if (error.message === "Cannot delete the last manager user") {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to delete user" });
    }
  });
  app2.post("/api/work-entries", requireAuth, async (req, res) => {
    try {
      const validatedData = insertWorkEntrySchema.parse(req.body);
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const requestedDate = validatedData.date;
      let isAllowedDate = requestedDate === today;
      if (!isAllowedDate) {
        const approvedRequests = await storage.getWorkHourRequestsByEmployeeId(req.user.id);
        const approvedDates = approvedRequests.filter((request) => request.status === "approved").map((request) => request.requestedDate);
        isAllowedDate = approvedDates.includes(requestedDate);
      }
      if (!isAllowedDate) {
        return res.status(400).json({
          message: "You can only create work entries for today's date or approved work hour request dates"
        });
      }
      const existingEntries = await storage.getWorkEntriesByUserIdWithFilters({
        userId: req.user.id,
        startDate: requestedDate,
        endDate: requestedDate
      });
      if (existingEntries.length > 0) {
        return res.status(400).json({
          message: "A work entry already exists for this date"
        });
      }
      const workEntry = await storage.createWorkEntry({
        ...validatedData,
        userId: req.user.id
      });
      res.json(workEntry);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create work entry" });
    }
  });
  app2.get("/api/work-entries/my", requireAuth, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const filters = {
        userId: req.user.id,
        startDate,
        endDate
      };
      const entries = await storage.getWorkEntriesByUserIdWithFilters(filters);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work entries" });
    }
  });
  app2.get("/api/work-entries", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { userId, department, status, startDate, endDate } = req.query;
      const filters = {
        userId,
        department,
        status,
        startDate,
        endDate
      };
      const entries = await storage.getWorkEntriesByFilters(filters);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work entries" });
    }
  });
  app2.patch("/api/work-entries/:id/status", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateWorkEntryStatusSchema.parse(req.body);
      const entry = await storage.updateWorkEntryStatus(id, validatedData.status, req.user.id);
      if (!entry) {
        return res.status(404).json({ message: "Work entry not found" });
      }
      res.json(entry);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update work entry status" });
    }
  });
  app2.delete("/api/work-entries/:id", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteWorkEntry(id);
      if (!success) {
        return res.status(404).json({ message: "Work entry not found" });
      }
      res.json({ message: "Work entry deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete work entry" });
    }
  });
  app2.get("/api/users/:userId/daily-report/:date", requireAuth, async (req, res) => {
    try {
      const { userId, date } = req.params;
      if (userId !== req.user.id && !["hr", "manager"].includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const report = await storage.getDailyWorkReport(userId, date);
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch daily work report" });
    }
  });
  app2.post("/api/timesheets", requireAuth, async (req, res) => {
    try {
      const validatedData = insertWorkEntrySchema.parse(req.body);
      const entry = await storage.createTimesheet({
        ...validatedData,
        userId: req.user.id
      });
      res.json(entry);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create timesheet" });
    }
  });
  app2.get("/api/timesheets/my", requireAuth, async (req, res) => {
    try {
      const timesheets = await storage.getTimesheetsByUserId(req.user.id);
      res.json(timesheets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timesheets" });
    }
  });
  app2.get("/api/timesheets", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { userId, department, status, startDate, endDate } = req.query;
      const filters = {
        userId,
        department,
        status,
        startDate,
        endDate
      };
      const timesheets = await storage.getTimesheetsByFilters(filters);
      res.json(timesheets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timesheets" });
    }
  });
  app2.patch("/api/timesheets/:id/status", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateWorkEntryStatusSchema.parse(req.body);
      const timesheet = await storage.updateTimesheetStatus(id, validatedData.status, req.user.id);
      if (!timesheet) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update timesheet status" });
    }
  });
  app2.delete("/api/timesheets/:id", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteTimesheet(id);
      if (!success) {
        return res.status(404).json({ message: "Timesheet not found" });
      }
      res.json({ message: "Timesheet deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete timesheet" });
    }
  });
  app2.get("/api/stats", requireAuth, async (req, res) => {
    try {
      if (req.user.role === "hr" || req.user.role === "manager") {
        const allEntries = await storage.getAllWorkEntries();
        const allUsers = await storage.getAllUsers();
        const employees = allUsers.filter((u) => u.role === "employee");
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const employeesWithTodayEntries = /* @__PURE__ */ new Set();
        allEntries.forEach((entry) => {
          if (entry.date === today) {
            employeesWithTodayEntries.add(entry.userId);
          }
        });
        const submittedToday = employeesWithTodayEntries.size;
        const notSubmittedToday = employees.length - submittedToday;
        const totalHours = allEntries.reduce((sum, e) => sum + parseFloat(e.timeSpent), 0);
        const avgHours = totalHours / allEntries.length || 0;
        res.json({
          totalEmployees: employees.length,
          totalEntries: allEntries.length,
          totalHours: totalHours.toFixed(1),
          avgHours: avgHours.toFixed(1),
          submittedToday,
          notSubmittedToday
        });
      } else {
        const entries = await storage.getWorkEntriesByUserId(req.user.id);
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const startOfWeek = /* @__PURE__ */ new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startOfMonth = new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1);
        const todayHours = entries.filter((e) => e.date === today).reduce((sum, e) => sum + parseFloat(e.timeSpent), 0);
        const weekHours = entries.filter((e) => new Date(e.date) >= startOfWeek).reduce((sum, e) => sum + parseFloat(e.timeSpent), 0);
        const monthHours = entries.filter((e) => new Date(e.date) >= startOfMonth).reduce((sum, e) => sum + parseFloat(e.timeSpent), 0);
        res.json({
          todayHours: todayHours.toFixed(1),
          weekHours: weekHours.toFixed(1),
          monthHours: monthHours.toFixed(1),
          status: "On Track"
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });
  app2.get("/api/work-entries/export", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { format, ...filters } = req.query;
      const entries = await storage.getWorkEntriesByFilters(filters);
      if (format === "csv") {
        const csvHeaders = "Employee ID,Employee,Date,Work Type,Description,Time Spent,Status\n";
        const csvRows = entries.map(
          (e) => `"${e.user.employeeId}","${e.user.firstName} ${e.user.lastName}","${e.date}","${e.workType}","${e.description}","${e.timeSpent}","${e.status}"`
        ).join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="work-entries.csv"');
        res.send(csvHeaders + csvRows);
      } else {
        res.json(entries);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to export work entries" });
    }
  });
  app2.get("/api/timesheets/export", requireAuth, requireRole("hr", "manager"), async (req, res) => {
    try {
      const { format, ...filters } = req.query;
      const timesheets = await storage.getTimesheetsByFilters(filters);
      if (format === "csv") {
        const csvHeaders = "Employee,Date,Work Type,Description,Time Spent,Status\n";
        const csvRows = timesheets.map(
          (t) => `"${t.user.firstName} ${t.user.lastName}","${t.date}","${t.workType}","${t.description}","${t.timeSpent}","${t.status}"`
        ).join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="timesheets.csv"');
        res.send(csvHeaders + csvRows);
      } else {
        res.json(timesheets);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to export timesheets" });
    }
  });
  app2.get("/api/manager-dashboard-stats", requireAuth, requireRole("manager"), async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const employees = allUsers.filter((user) => user.role === "employee");
      const allEntries = await storage.getAllWorkEntries();
      const totalEmployees = employees.length;
      const today = /* @__PURE__ */ new Date();
      const todayStr = today.toISOString().split("T")[0];
      const todayEntries = allEntries.filter((entry) => entry.date === todayStr);
      const employeesWithEntriesToday = new Set(todayEntries.map((entry) => entry.userId));
      const submitted = employeesWithEntriesToday.size;
      const notSubmitted = totalEmployees - submitted;
      const totalWorkHoursToday = todayEntries.reduce((sum, entry) => sum + parseFloat(entry.timeSpent), 0);
      res.json({
        totalEmployees,
        submitted,
        notSubmitted,
        totalWorkHours: totalWorkHoursToday.toFixed(1)
      });
    } catch (error) {
      console.error("Manager dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch manager dashboard statistics" });
    }
  });
  app2.get("/api/manager-preferences", requireAuth, requireRole("manager"), async (req, res) => {
    try {
      const preferences = await storage.getManagerPreferences(req.user.id);
      if (preferences) {
        const selectedEmployeeIds = JSON.parse(preferences.selectedEmployeeIds);
        res.json({ ...preferences, selectedEmployeeIds });
      } else {
        res.json({ selectedEmployeeIds: [] });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch manager preferences" });
    }
  });
  app2.post("/api/manager-preferences", requireAuth, requireRole("manager"), async (req, res) => {
    try {
      const { selectedEmployeeIds } = req.body;
      if (!Array.isArray(selectedEmployeeIds)) {
        return res.status(400).json({ message: "selectedEmployeeIds must be an array" });
      }
      const preferences = await storage.updateManagerPreferences(req.user.id, selectedEmployeeIds);
      res.json({ ...preferences, selectedEmployeeIds: JSON.parse(preferences.selectedEmployeeIds) });
    } catch (error) {
      res.status(500).json({ message: "Failed to save manager preferences" });
    }
  });
  app2.post("/api/work-hour-requests", requireAuth, requireRole("employee"), async (req, res) => {
    try {
      const validatedData = insertWorkHourRequestSchema.parse(req.body);
      const existingRequests = await storage.getWorkHourRequestsByEmployeeId(req.user.id);
      const duplicateRequest = existingRequests.find(
        (request2) => request2.requestedDate === validatedData.requestedDate && request2.status === "pending"
      );
      if (duplicateRequest) {
        return res.status(400).json({ message: "A request for this date is already pending" });
      }
      const requestedDate = new Date(validatedData.requestedDate);
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      if (requestedDate >= today) {
        return res.status(400).json({ message: "Can only request work hours for past dates" });
      }
      const request = await storage.createWorkHourRequest({
        ...validatedData,
        employeeId: req.user.id
      });
      res.json(request);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create work hour request" });
    }
  });
  app2.get("/api/work-hour-requests/my", requireAuth, requireRole("employee"), async (req, res) => {
    try {
      const requests = await storage.getWorkHourRequestsByEmployeeId(req.user.id);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work hour requests" });
    }
  });
  app2.get("/api/work-hour-requests", requireAuth, requireRole("manager"), async (req, res) => {
    try {
      const requests = await storage.getWorkHourRequestsByManagerId(req.user.id);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work hour requests" });
    }
  });
  app2.put("/api/work-hour-requests/:id", requireAuth, requireRole("manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateWorkHourRequestSchema.parse(req.body);
      const request = await storage.updateWorkHourRequest(id, {
        status: validatedData.status,
        managerId: req.user.id,
        managerComments: validatedData.managerComments
      });
      if (!request) {
        return res.status(404).json({ message: "Work hour request not found" });
      }
      res.json(request);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update work hour request" });
    }
  });
  app2.get("/api/work-hour-requests/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const request = await storage.getWorkHourRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Work hour request not found" });
      }
      if (req.user.role === "employee" && request.employeeId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work hour request" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
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
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
import dotenv2 from "dotenv";
dotenv2.config();
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use(express2.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
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
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
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
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = process.env.PORT || 3e3;
  app.listen(port, "localhost", () => {
    console.log(`Server running on ${port}`);
  });
})();
