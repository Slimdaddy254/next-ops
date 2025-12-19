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
    { title: "Image CDN Returning 404 Errors", severity: "SEV2", status: "OPEN", service: "CDN", environment: "PROD", tags: ["cdn", "images"] },
    { title: "Customer Review System Down", severity: "SEV3", status: "MITIGATED", service: "Review Service", environment: "PROD", tags: ["reviews", "database"] },
    { title: "Shipping Calculator Incorrect Rates", severity: "SEV2", status: "OPEN", service: "Shipping API", environment: "PROD", tags: ["shipping", "calculation"] },
    { title: "Mobile App Crashes on iOS 17", severity: "SEV1", status: "OPEN", service: "Mobile App", environment: "PROD", tags: ["mobile", "ios", "crash"] },
    { title: "Product Recommendations Not Loading", severity: "SEV3", status: "RESOLVED", service: "ML Service", environment: "PROD", tags: ["ml", "recommendations"] },
    { title: "Wishlist Sync Issues Between Devices", severity: "SEV4", status: "OPEN", service: "User Service", environment: "PROD", tags: ["wishlist", "sync"] },
    { title: "Checkout Flow A/B Test Causing Errors", severity: "SEV2", status: "MITIGATED", service: "Frontend", environment: "PROD", tags: ["frontend", "ab-test"] },
    { title: "Gift Card Validation Failing", severity: "SEV1", status: "OPEN", service: "Payment Gateway", environment: "PROD", tags: ["giftcard", "payment"] },
    { title: "Product Stock Levels Not Updating", severity: "SEV2", status: "OPEN", service: "Inventory Service", environment: "PROD", tags: ["inventory", "stock"] },
    { title: "Return Portal Processing Delays", severity: "SEV3", status: "RESOLVED", service: "Return Service", environment: "PROD", tags: ["returns", "processing"] },
    { title: "Customer Support Chat Widget Offline", severity: "SEV2", status: "OPEN", service: "Support Service", environment: "PROD", tags: ["support", "chat"] },
    { title: "Subscription Renewal Billing Errors", severity: "SEV1", status: "MITIGATED", service: "Billing Service", environment: "PROD", tags: ["billing", "subscription"] },
    { title: "Product Filter Search Timeout", severity: "SEV3", status: "OPEN", service: "Search API", environment: "PROD", tags: ["search", "performance"] },
    { title: "Order Tracking Map Not Displaying", severity: "SEV4", status: "RESOLVED", service: "Tracking Service", environment: "PROD", tags: ["tracking", "maps"] },
    { title: "Loyalty Points Calculation Wrong", severity: "SEV2", status: "OPEN", service: "Loyalty Service", environment: "PROD", tags: ["loyalty", "points"] },
    { title: "Flash Sale Timer Desync Issues", severity: "SEV3", status: "MITIGATED", service: "Promotion Engine", environment: "PROD", tags: ["sales", "timer"] },
    { title: "Product Variant Selector Not Working", severity: "SEV2", status: "OPEN", service: "Frontend", environment: "PROD", tags: ["frontend", "products"] },
    { title: "Tax Calculation Incorrect for EU Orders", severity: "SEV1", status: "OPEN", service: "Tax Service", environment: "PROD", tags: ["tax", "compliance"] },
    { title: "Admin Dashboard Statistics Outdated", severity: "SEV4", status: "RESOLVED", service: "Analytics", environment: "STAGING", tags: ["admin", "analytics"] },
    { title: "Multi-Currency Conversion Rate Issues", severity: "SEV2", status: "MITIGATED", service: "Currency Service", environment: "PROD", tags: ["currency", "conversion"] },
    { title: "Guest Checkout Flow Broken", severity: "SEV1", status: "OPEN", service: "Checkout Service", environment: "PROD", tags: ["checkout", "guest"] },
    { title: "SMS Order Confirmation Not Sent", severity: "SEV3", status: "OPEN", service: "Notification Service", environment: "PROD", tags: ["sms", "notifications"] },
    { title: "Product Bundle Pricing Error", severity: "SEV2", status: "RESOLVED", service: "Pricing Engine", environment: "PROD", tags: ["pricing", "bundles"] },
    { title: "Referral Code System Malfunction", severity: "SEV3", status: "MITIGATED", service: "Referral Service", environment: "PROD", tags: ["referral", "marketing"] },
    { title: "Store Locator Map API Failing", severity: "SEV4", status: "OPEN", service: "Store Service", environment: "PROD", tags: ["stores", "maps"] },
    { title: "Order History Export Timing Out", severity: "SEV3", status: "OPEN", service: "Export Service", environment: "PROD", tags: ["export", "orders"] },
    { title: "Product Availability Notification Delays", severity: "SEV2", status: "RESOLVED", service: "Notification Service", environment: "PROD", tags: ["notifications", "stock"] },
    { title: "Abandoned Cart Email Not Triggering", severity: "SEV3", status: "MITIGATED", service: "Email Service", environment: "PROD", tags: ["email", "cart"] },
    { title: "Social Login Facebook Integration Down", severity: "SEV2", status: "OPEN", service: "Auth Service", environment: "PROD", tags: ["auth", "social"] },
    { title: "Promo Code Stacking Validation Bug", severity: "SEV2", status: "OPEN", service: "Promotion Engine", environment: "PROD", tags: ["promo", "validation"] },
    { title: "Checkout Address Autocomplete Broken", severity: "SEV3", status: "RESOLVED", service: "Address Service", environment: "PROD", tags: ["checkout", "address"] },
    { title: "Order Confirmation Page 500 Error", severity: "SEV1", status: "OPEN", service: "Order Service", environment: "PROD", tags: ["orders", "error"] },
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
    { title: "OAuth2 Token Refresh Failing for Google", severity: "SEV2", status: "OPEN", service: "Auth Service", environment: "PROD", tags: ["oauth", "google"] },
    { title: "API Gateway 502 Errors Spike", severity: "SEV1", status: "MITIGATED", service: "API Gateway", environment: "PROD", tags: ["gateway", "502"] },
    { title: "Document Export Service Memory Leak", severity: "SEV2", status: "OPEN", service: "Export Service", environment: "PROD", tags: ["memory", "export"] },
    { title: "Video Transcoding Queue Backlog", severity: "SEV3", status: "OPEN", service: "Media Service", environment: "PROD", tags: ["video", "queue"] },
    { title: "Elasticsearch Cluster Yellow Status", severity: "SEV2", status: "RESOLVED", service: "Search Service", environment: "PROD", tags: ["elasticsearch", "cluster"] },
    { title: "Backup Job Failed for 3 Days", severity: "SEV1", status: "OPEN", service: "Backup Service", environment: "PROD", tags: ["backup", "critical"] },
    { title: "Webhook Delivery Failing to Slack", severity: "SEV3", status: "MITIGATED", service: "Webhook Service", environment: "PROD", tags: ["webhook", "slack"] },
    { title: "Redis Cache Hit Rate Below 50%", severity: "SEV2", status: "OPEN", service: "Cache Service", environment: "PROD", tags: ["redis", "performance"] },
    { title: "GraphQL Query Complexity Attack", severity: "SEV1", status: "MITIGATED", service: "GraphQL API", environment: "PROD", tags: ["security", "graphql"] },
    { title: "SSO SAML Assertion Signature Invalid", severity: "SEV2", status: "OPEN", service: "SSO Service", environment: "PROD", tags: ["sso", "saml"] },
    { title: "Kubernetes Pod Eviction Loop", severity: "SEV1", status: "OPEN", service: "Infrastructure", environment: "PROD", tags: ["kubernetes", "pods"] },
    { title: "File Preview Generation Timeout", severity: "SEV3", status: "RESOLVED", service: "Preview Service", environment: "PROD", tags: ["preview", "timeout"] },
    { title: "CDN Cache Purge Not Working", severity: "SEV2", status: "MITIGATED", service: "CDN", environment: "PROD", tags: ["cdn", "cache"] },
    { title: "Monitoring Alert Storm from DEV", severity: "SEV4", status: "OPEN", service: "Monitoring", environment: "DEV", tags: ["monitoring", "alerts"] },
    { title: "Distributed Lock Service Deadlock", severity: "SEV1", status: "OPEN", service: "Lock Service", environment: "PROD", tags: ["lock", "deadlock"] },
    { title: "PDF Generation Service OOM Errors", severity: "SEV2", status: "MITIGATED", service: "PDF Service", environment: "PROD", tags: ["pdf", "oom"] },
    { title: "Audit Log Write Latency Spike", severity: "SEV3", status: "OPEN", service: "Audit Service", environment: "PROD", tags: ["audit", "latency"] },
    { title: "gRPC Service Discovery Failing", severity: "SEV2", status: "RESOLVED", service: "Service Mesh", environment: "STAGING", tags: ["grpc", "discovery"] },
    { title: "Scheduled Report Generation Missing", severity: "SEV3", status: "OPEN", service: "Report Service", environment: "PROD", tags: ["reports", "cron"] },
    { title: "API Versioning Header Parsing Error", severity: "SEV2", status: "MITIGATED", service: "API Gateway", environment: "PROD", tags: ["versioning", "api"] },
    { title: "Session Store Connection Pool Exhausted", severity: "SEV1", status: "OPEN", service: "Session Service", environment: "PROD", tags: ["session", "pool"] },
    { title: "Multi-Region Replication Lag 10 Minutes", severity: "SEV2", status: "OPEN", service: "Database", environment: "PROD", tags: ["replication", "lag"] },
    { title: "Container Registry Pull Rate Limited", severity: "SEV3", status: "RESOLVED", service: "CI/CD", environment: "STAGING", tags: ["registry", "docker"] },
    { title: "Load Balancer Health Check Flapping", severity: "SEV2", status: "MITIGATED", service: "Load Balancer", environment: "PROD", tags: ["lb", "health"] },
    { title: "Secret Rotation Job Failed", severity: "SEV1", status: "OPEN", service: "Security Service", environment: "PROD", tags: ["secrets", "rotation"] },
    { title: "Worker Queue Dead Letter Overflow", severity: "SEV2", status: "OPEN", service: "Queue Service", environment: "PROD", tags: ["queue", "dlq"] },
    { title: "DNS Resolution Timeout in EU Region", severity: "SEV2", status: "MITIGATED", service: "Infrastructure", environment: "PROD", tags: ["dns", "network"] },
    { title: "Feature Flag Evaluation Cache Stale", severity: "SEV3", status: "RESOLVED", service: "Feature Service", environment: "PROD", tags: ["feature-flags", "cache"] },
    { title: "Email Template Rendering Broken", severity: "SEV2", status: "OPEN", service: "Email Service", environment: "PROD", tags: ["email", "template"] },
    { title: "Terraform State Lock Conflict", severity: "SEV3", status: "OPEN", service: "Infrastructure", environment: "STAGING", tags: ["terraform", "lock"] },
    { title: "WebRTC Connection Establishment Failing", severity: "SEV2", status: "MITIGATED", service: "Video Service", environment: "PROD", tags: ["webrtc", "video"] },
    { title: "Rate Limiter False Positives on /health", severity: "SEV4", status: "OPEN", service: "API Gateway", environment: "PROD", tags: ["rate-limit", "health"] },
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

  // Create Feature Flags for Tenant 1 (E-commerce)
  const acmeFlags = [
    { key: "new_checkout_flow", name: "New Checkout Flow", description: "Enable redesigned checkout experience with one-page flow", enabled: true, env: "PROD", rollout: 25 },
    { key: "ai_product_recommendations", name: "AI Product Recommendations", description: "ML-powered personalized product suggestions", enabled: true, env: "PROD", rollout: 75 },
    { key: "guest_checkout", name: "Guest Checkout", description: "Allow purchases without account creation", enabled: true, env: "PROD", rollout: 100 },
    { key: "apple_pay_integration", name: "Apple Pay Integration", description: "Enable Apple Pay as payment method", enabled: false, env: "STAGING", rollout: 0 },
    { key: "dark_mode_theme", name: "Dark Mode Theme", description: "Enable dark mode UI theme", enabled: true, env: "PROD", rollout: 50 },
    { key: "wishlist_sharing", name: "Wishlist Sharing", description: "Allow users to share wishlists via social media", enabled: true, env: "PROD", rollout: 100 },
    { key: "virtual_try_on", name: "Virtual Try-On AR", description: "AR feature for trying products virtually", enabled: false, env: "DEV", rollout: 5 },
    { key: "subscription_products", name: "Subscription Products", description: "Enable subscribe and save functionality", enabled: true, env: "PROD", rollout: 100 },
    { key: "live_chat_support", name: "Live Chat Support", description: "24/7 live chat widget", enabled: true, env: "PROD", rollout: 100 },
    { key: "crypto_payments", name: "Crypto Payments", description: "Accept Bitcoin and Ethereum payments", enabled: false, env: "STAGING", rollout: 0 },
    { key: "loyalty_rewards_v2", name: "Loyalty Rewards V2", description: "New points and rewards system", enabled: true, env: "STAGING", rollout: 30 },
    { key: "social_shopping", name: "Social Shopping", description: "Shop together with friends in real-time", enabled: false, env: "DEV", rollout: 10 },
  ];

  await Promise.all(
    acmeFlags.map((flag) =>
      prisma.featureFlag.create({
        data: {
          tenantId: tenant1.id,
          key: flag.key,
          name: flag.name,
          description: flag.description,
          enabled: flag.enabled,
          environment: flag.env,
          rolloutPercentage: flag.rollout,
          rules: {
            create: [
              {
                type: "PERCENT_ROLLOUT",
                condition: { percentage: flag.rollout },
                order: 0,
              },
            ],
          },
        },
      })
    )
  );

  // Create Feature Flags for Tenant 2 (SaaS Platform)
  const techstartFlags = [
    { key: "advanced_analytics_dashboard", name: "Advanced Analytics Dashboard", description: "Real-time metrics and custom reporting", enabled: true, env: "PROD", rollout: 100 },
    { key: "team_collaboration_v3", name: "Team Collaboration V3", description: "Enhanced real-time collaboration features", enabled: true, env: "PROD", rollout: 80 },
    { key: "api_rate_limit_increase", name: "API Rate Limit Increase", description: "10x higher API limits for enterprise", enabled: true, env: "PROD", rollout: 100 },
    { key: "graphql_api_beta", name: "GraphQL API Beta", description: "New GraphQL endpoint for flexible queries", enabled: false, env: "STAGING", rollout: 20 },
    { key: "audit_log_streaming", name: "Audit Log Streaming", description: "Stream audit logs to external SIEM", enabled: true, env: "PROD", rollout: 100 },
    { key: "custom_branding", name: "Custom Branding", description: "White-label UI customization", enabled: true, env: "PROD", rollout: 100 },
    { key: "sso_okta_integration", name: "SSO Okta Integration", description: "Single sign-on with Okta", enabled: true, env: "PROD", rollout: 100 },
    { key: "workspace_templates", name: "Workspace Templates", description: "Pre-configured workspace templates", enabled: true, env: "STAGING", rollout: 50 },
    { key: "ai_code_assistant", name: "AI Code Assistant", description: "GPT-powered coding suggestions", enabled: false, env: "DEV", rollout: 15 },
    { key: "version_control_git", name: "Version Control Git", description: "Built-in Git integration", enabled: true, env: "PROD", rollout: 100 },
    { key: "mobile_offline_mode", name: "Mobile Offline Mode", description: "Work offline with automatic sync", enabled: false, env: "STAGING", rollout: 25 },
    { key: "advanced_permissions", name: "Advanced Permissions", description: "Granular role-based access control", enabled: true, env: "PROD", rollout: 100 },
  ];

  await Promise.all(
    techstartFlags.map((flag) =>
      prisma.featureFlag.create({
        data: {
          tenantId: tenant2.id,
          key: flag.key,
          name: flag.name,
          description: flag.description,
          enabled: flag.enabled,
          environment: flag.env,
          rolloutPercentage: flag.rollout,
          rules: {
            create: [
              {
                type: flag.rollout === 100 ? "ALLOWLIST" : "PERCENT_ROLLOUT",
                condition: flag.rollout === 100 ? { userIds: [user3.id] } : { percentage: flag.rollout },
                order: 0,
              },
            ],
          },
        },
      })
    )
  );

  console.log(
    `✅ Created ${acmeFlags.length + techstartFlags.length} feature flags (${acmeFlags.length} for ${tenant1.name}, ${techstartFlags.length} for ${tenant2.name})`
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
  console.log(`   Incidents: ${acmeIncidents.length + techstartIncidents.length} (${acmeIncidents.length} e-commerce + ${techstartIncidents.length} SaaS)`);
  console.log(`   Feature Flags: ${acmeFlags.length + techstartFlags.length} (${acmeFlags.length} e-commerce + ${techstartFlags.length} SaaS)`);
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
