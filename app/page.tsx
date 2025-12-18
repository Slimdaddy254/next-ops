import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  // If logged in, redirect to first tenant
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        memberships: {
          include: { tenant: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (user?.memberships[0]) {
      redirect(`/t/${user.memberships[0].tenant.slug}/incidents`);
    }
  }

  // DEV MODE: Redirect to first tenant
  if (process.env.NODE_ENV === "development") {
    const tenant = await prisma.tenant.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (tenant) {
      redirect(`/t/${tenant.slug}/incidents`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-4">Next Ops</h1>
        <p className="text-xl text-gray-400 mb-8">
          Incident Management & Feature Flags Platform
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
