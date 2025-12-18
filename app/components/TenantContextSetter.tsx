"use client";

import { useEffect } from "react";
import { setTenantContext } from "@/app/actions/tenant";

export default function TenantContextSetter({ tenantSlug }: { tenantSlug: string }) {
  useEffect(() => {
    // Update tenant context whenever the slug changes
    setTenantContext(tenantSlug);
  }, [tenantSlug]);

  return null; // This component doesn't render anything
}
