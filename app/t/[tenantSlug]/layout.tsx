import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/auth";
import UserMenu from "@/app/components/UserMenu";
import Sidebar from "@/app/components/Sidebar";
import TenantContextSetter from "@/app/components/TenantContextSetter";
import { prisma } from "@/lib/prisma";

type Membership = {
  tenant: { id: string; name: string; slug: string };
  role: string;
};

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
};

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { tenantSlug } = await params;
  
  // Check authentication
  const session = await auth();
  
  // DEV MODE: Allow access without auth
  if (process.env.NODE_ENV !== "development" && !session?.user) {
    redirect("/login");
  }

  // Get user with memberships
  let user;
  let tenants: { id: string; name: string; slug: string; role: string }[] = [];

  if (session?.user?.id) {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (user) {
      tenants = user.memberships.map((m: Membership) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        role: m.role,
      }));

      // Check if user has access to this tenant
      const hasAccess = tenants.some((t) => t.slug === tenantSlug);
      if (!hasAccess && process.env.NODE_ENV !== "development") {
        redirect("/login");
      }
    }
  } else if (process.env.NODE_ENV === "development") {
    // DEV MODE: Use mock user
    user = {
      name: "Dev User",
      email: "dev@example.com",
    };
    // Get all tenants for dev mode
    const allTenants = await prisma.tenant.findMany();
    tenants = allTenants.map((t: TenantRecord) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      role: "ADMIN",
    }));
  }

  // Get current path for sidebar highlighting
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || `/t/${tenantSlug}/incidents`;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Tenant Context Setter - updates session when tenant changes */}
      <TenantContextSetter tenantSlug={tenantSlug} />
      
      {/* Top Navigation */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href={`/t/${tenantSlug}/incidents`} className="text-xl font-bold text-white">
              Next Ops
            </Link>
          </div>
          <UserMenu
            user={user ? { name: user.name, email: user.email } : { name: "Guest", email: "" }}
            tenants={tenants}
            currentTenantSlug={tenantSlug}
          />
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <Sidebar tenantSlug={tenantSlug} currentPath={pathname} />

        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
