import { prisma } from "@/lib/prisma";
import { getCurrentTenantContext } from "@/lib/tenant";

export default async function SettingsPage() {
  const tenantContext = await getCurrentTenantContext();

  if (!tenantContext) {
    return (
      <div className="p-6">
        <p className="text-red-400">Unable to load tenant settings.</p>
      </div>
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantContext.tenantId },
    include: {
      users: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!tenant) {
    return (
      <div className="p-6">
        <p className="text-red-400">Tenant not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Tenant Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Organization Details
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-500 dark:text-gray-400 text-sm mb-1">Name</label>
            <p className="text-gray-900 dark:text-white text-lg">{tenant.name}</p>
          </div>
          <div>
            <label className="block text-gray-500 dark:text-gray-400 text-sm mb-1">Slug</label>
            <p className="text-gray-700 dark:text-gray-300 font-mono">{tenant.slug}</p>
          </div>
          <div>
            <label className="block text-gray-500 dark:text-gray-400 text-sm mb-1">Created</label>
            <p className="text-gray-700 dark:text-gray-300">
              {new Date(tenant.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Team Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left text-gray-500 dark:text-gray-400 pb-3 font-medium">
                  Name
                </th>
                <th className="text-left text-gray-500 dark:text-gray-400 pb-3 font-medium">
                  Email
                </th>
                <th className="text-left text-gray-500 dark:text-gray-400 pb-3 font-medium">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {tenant.users.map((membership: { id: string; role: string; user: { name: string; email: string } }) => (
                <tr
                  key={membership.id}
                  className="border-b border-gray-200 dark:border-gray-700 last:border-0"
                >
                  <td className="py-3 text-gray-900 dark:text-white">{membership.user.name}</td>
                  <td className="py-3 text-gray-700 dark:text-gray-300">{membership.user.email}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        membership.role === "ADMIN"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400"
                          : membership.role === "ENGINEER"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-400"
                      }`}
                    >
                      {membership.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-gray-800 rounded-lg p-6 border border-red-700/50">
        <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
        <p className="text-gray-400 mb-4">
          These actions are irreversible. Please proceed with caution.
        </p>
        <button
          disabled
          className="px-4 py-2 bg-red-600/50 text-red-300 rounded-lg cursor-not-allowed"
        >
          Delete Organization (Disabled)
        </button>
      </div>
    </div>
  );
}
