import { requireOrgContext } from "@/lib/auth";
import { VoiceLoggerApp } from "@/components/app/voice-logger-app";

export default async function VoiceLoggerPage() {
  const {
    data: [clients, serviceTypes],
  } = await requireOrgContext((tx) =>
    Promise.all([
      tx.client.findMany({ where: { activeStatus: true }, orderBy: { name: "asc" } }),
      tx.serviceType.findMany({ orderBy: { code: "asc" } }),
    ]),
  );

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName }));
  const serviceTypeOptions = serviceTypes.map((st) => ({
    id: st.id,
    code: st.code,
    label: st.label,
    billingMinimumHours: Number(st.billingMinimumHours),
    rateOverride: st.rateOverride ? Number(st.rateOverride) : null,
  }));

  return <VoiceLoggerApp clients={clientOptions} serviceTypes={serviceTypeOptions} />;
}
