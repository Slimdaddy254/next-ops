import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

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

  // Create Sample Incidents for Tenant 1
  const incidents1 = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      prisma.incident.create({
        data: {
          tenantId: tenant1.id,
          title: `Database Connection Timeout - Instance ${i + 1}`,
          severity: ["SEV1", "SEV2", "SEV3", "SEV4"][i % 4] as any,
          status: ["OPEN", "MITIGATED", "RESOLVED"][i % 3] as any,
          service: ["API", "Database", "Cache", "Auth"][i % 4],
          environment: ["PROD", "STAGING", "DEV"][i % 3] as any,
          tags: ["database", "timeout", `incident-${i + 1}`],
          createdById: user1.id,
          assigneeId: i % 2 === 0 ? user2.id : null,
        },
      })
    )
  );

  // Create Sample Incidents for Tenant 2
  const incidents2 = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      prisma.incident.create({
        data: {
          tenantId: tenant2.id,
          title: `API Rate Limiting Exceeded - Request ${i + 1}`,
          severity: ["SEV1", "SEV2", "SEV3", "SEV4"][i % 4] as any,
          status: ["OPEN", "MITIGATED", "RESOLVED"][i % 3] as any,
          service: ["API", "Payment", "Queue", "Email"][i % 4],
          environment: ["PROD", "STAGING", "DEV"][i % 3] as any,
          tags: ["rate-limit", "api", `request-${i + 1}`],
          createdById: user3.id,
          assigneeId: i % 3 === 0 ? user3.id : null,
        },
      })
    )
  );

  console.log(
    `✅ Created 40 incidents (20 per tenant) for Tenant 1 and Tenant 2`
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
  const flags1 = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.featureFlag.create({
        data: {
          tenantId: tenant1.id,
          key: `feature_${i + 1}`,
          name: `Feature ${i + 1}`,
          description: `Enable/disable feature ${i + 1} for ${tenant1.name}`,
          enabled: i % 2 === 0,
          environment: ["PROD", "STAGING", "DEV"][i % 3] as any,
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
  const flags2 = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.featureFlag.create({
        data: {
          tenantId: tenant2.id,
          key: `beta_feature_${i + 1}`,
          name: `Beta Feature ${i + 1}`,
          description: `Beta feature ${i + 1} for ${tenant2.name}`,
          enabled: i % 3 === 0,
          environment: ["PROD", "STAGING", "DEV"][i % 3] as any,
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
      afterData: incidents1[0] as any,
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
