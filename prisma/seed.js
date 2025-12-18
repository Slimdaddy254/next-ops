import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function hashPassword(password) {
  return hash(password, 10);
}

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up existing data
  await prisma.auditLog.deleteMany();
  await prisma.timelineEvent.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.savedView.deleteMany();

  console.log("🧹 Cleared existing data");

  // Create Tenants
  const tenant1 = await prisma.tenant.create({
    data: {
      name: "Acme Corp",
      slug: "acme-corp",
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      name: "TechStart Inc",
      slug: "techstart-inc",
    },
  });

  console.log(`✅ Created tenants: ${tenant1.name}, ${tenant2.name}`);

  // Create Users
  const user1 = await prisma.user.create({
    data: {
      email: "alice@acme.com",
      name: "Alice Johnson",
      password: await hashPassword("password123"),
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: "bob@acme.com",
      name: "Bob Smith",
      password: await hashPassword("password123"),
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: "charlie@techstart.com",
      name: "Charlie Brown",
      password: await hashPassword("password123"),
    },
  });

  console.log(`✅ Created users: ${user1.name}, ${user2.name}, ${user3.name}`);

  // Create Memberships (cross-tenant)
  await prisma.membership.create({
    data: {
      userId: user1.id,
      tenantId: tenant1.id,
      role: "ADMIN",
    },
  });

  await prisma.membership.create({
    data: {
      userId: user2.id,
      tenantId: tenant1.id,
      role: "ENGINEER",
    },
  });

  await prisma.membership.create({
    data: {
      userId: user3.id,
      tenantId: tenant2.id,
      role: "ADMIN",
    },
  });

  // Cross-tenant: Alice also has access to TechStart as VIEWER
  await prisma.membership.create({
    data: {
      userId: user1.id,
      tenantId: tenant2.id,
      role: "VIEWER",
    },
  });

  console.log(
    "✅ Created memberships (including cross-tenant access for Alice)"
  );

  // Create DISTINCT Sample Incidents for Acme Corp (Tenant 1)
  // Theme: E-commerce platform issues
  const acmeIncidents = [
    { title: "Shopping Cart Checkout Failure", severity: "SEV1", status: "OPEN", service: "Payment Gateway", environment: "PROD", tags: ["checkout", "payment", "critical"] },
    { title: "Order Processing Delay in Production", severity: "SEV2", status: "MITIGATED", service: "Order Service", environment: "PROD", tags: ["orders", "latency"] },
    { title: "Payment API Timeout During Peak Hours", severity: "SEV1", status: "OPEN", service: "Payment Gateway", environment: "PROD", tags: ["payment", "timeout"] },
    { title: "Email Notifications Not Sending", severity: "SEV3", status: "RESOLVED", service: "Email Service", environment: "PROD", tags: ["email", "notifications"] },
    { title: "Product Search Returns Empty Results", severity: "SEV2", status: "OPEN", service: "Search API", environment: "PROD", tags: ["search", "database"] },
    { title: "Analytics Dashboard Loading Slowly", severity: "SEV4", status: "OPEN", service: "Analytics", environment: "STAGING", tags: ["performance", "analytics"] },
    { title: "Inventory Sync Failing for Store Locations", severity: "SEV2", status: "MITIGATED", service: "Inventory Service", environment: "PROD", tags: ["inventory", "sync"] },
    { title: "Coupon Code Validation Errors", severity: "SEV3", status: "RESOLVED", service: "Promotion Engine", environment: "PROD", tags: ["coupons", "discounts"] },
  ];

  const incidents1 = await Promise.all(
    acmeIncidents.map((inc, i) =>
      prisma.incident.create({
        data: {
          tenantId: tenant1.id,
          title: inc.title,
          severity: inc.severity,
          status: inc.status,
          service: inc.service,
          environment: inc.environment,
          tags: inc.tags,
          createdById: user1.id,
          assigneeId: i % 2 === 0 ? user2.id : null,
        },
      })
    )
  );

  // Create DISTINCT Sample Incidents for TechStart Inc (Tenant 2)
  // Theme: SaaS platform and infrastructure issues
  const techstartIncidents = [
    { title: "Cloud Storage Upload Failures", severity: "SEV1", status: "OPEN", service: "Storage API", environment: "PROD", tags: ["storage", "uploads", "critical"] },
    { title: "Authentication Service Intermittent Errors", severity: "SEV2", status: "OPEN", service: "Auth Service", environment: "PROD", tags: ["auth", "login"] },
    { title: "Mobile App API Rate Limiting", severity: "SEV3", status: "MITIGATED", service: "Mobile API", environment: "PROD", tags: ["mobile", "rate-limit"] },
    { title: "Database Migration Failed on Staging", severity: "SEV2", status: "RESOLVED", service: "Database", environment: "STAGING", tags: ["database", "migration"] },
    { title: "Deployment Pipeline Stuck in DEV", severity: "SEV4", status: "OPEN", service: "CI/CD", environment: "DEV", tags: ["deployment", "pipeline"] },
    { title: "WebSocket Connections Dropping", severity: "SEV2", status: "OPEN", service: "Realtime Service", environment: "PROD", tags: ["websocket", "realtime"] },
    { title: "Push Notifications Delayed by 5 Minutes", severity: "SEV3", status: "MITIGATED", service: "Notification Hub", environment: "PROD", tags: ["notifications", "latency"] },
    { title: "Test Suite Failing After Latest Deploy", severity: "SEV4", status: "RESOLVED", service: "Testing", environment: "STAGING", tags: ["tests", "ci"] },
  ];

  await Promise.all(
    techstartIncidents.map((inc, i) =>
      prisma.incident.create({
        data: {
          tenantId: tenant2.id,
          title: inc.title,
          severity: inc.severity,
          status: inc.status,
          service: inc.service,
          environment: inc.environment,
          tags: inc.tags,
          createdById: user3.id,
          assigneeId: i % 3 === 0 ? user3.id : null,
        },
      })
    )
  );

  console.log(
    `✅ Created distinct incidents:\n   - Acme Corp: ${acmeIncidents.length} e-commerce incidents\n   - TechStart Inc: ${techstartIncidents.length} SaaS platform incidents`
  );

  // Add timeline events to some incidents
  await prisma.timelineEvent.create({
    data: {
      incidentId: incidents1[0].id,
      tenantId: tenant1.id,
      type: "NOTE",
      message: "Database connections are slowly recovering",
      createdById: user1.id,
    },
  });

  await prisma.timelineEvent.create({
    data: {
      incidentId: incidents1[0].id,
      tenantId: tenant1.id,
      type: "STATUS_CHANGE",
      data: { from: "OPEN", to: "MITIGATED" },
      createdById: user2.id,
    },
  });

  console.log("✅ Created timeline events");

  // Create Feature Flags for Tenant 1
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.featureFlag.create({
        data: {
          tenantId: tenant1.id,
          key: `feature_${i + 1}`,
          name: `Feature ${i + 1}`,
          description: `Enable/disable feature ${i + 1} for ${tenant1.name}`,
          enabled: i % 2 === 0,
          environment: ["PROD", "STAGING", "DEV"][i % 3],
          rules: {
            create: [
              {
                type: "PERCENT_ROLLOUT",
                condition: { percentage: 50 },
                order: 0,
              },
            ],
          },
        },
      })
    )
  );

  // Create Feature Flags for Tenant 2
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.featureFlag.create({
        data: {
          tenantId: tenant2.id,
          key: `beta_feature_${i + 1}`,
          name: `Beta Feature ${i + 1}`,
          description: `Beta feature ${i + 1} for ${tenant2.name}`,
          enabled: i % 3 === 0,
          environment: ["PROD", "STAGING", "DEV"][i % 3],
          rules: {
            create: [
              {
                type: "ALLOWLIST",
                condition: { userIds: [user3.id] },
                order: 0,
              },
            ],
          },
        },
      })
    )
  );

  console.log(
    `✅ Created 20 feature flags (10 per tenant) for Tenant 1 and Tenant 2`
  );

  // Create Audit Logs
  await prisma.auditLog.create({
    data: {
      tenantId: tenant1.id,
      actorId: user1.id,
      action: "CREATE",
      entityType: "Incident",
      entityId: incidents1[0].id,
      afterData: incidents1[0],
    },
  });

  console.log("✅ Created audit logs");

  console.log("\n✨ Seeding completed successfully!");
  console.log(`\n📊 Database Summary:`);
  console.log(`   Tenants: 2`);
  console.log(`   Users: 3`);
  console.log(`   Memberships: 4 (including cross-tenant)`);
  console.log(`   Incidents: 40`);
  console.log(`   Feature Flags: 20`);
  console.log(`   Timeline Events: 2`);
  console.log(`   Audit Logs: 1`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
