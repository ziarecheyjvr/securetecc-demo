/**
 * Fills the demo database with random, fictional data shaped like a working
 * year at SecureTECC: staff, clients, a rate card, time entries, recurring
 * add-ons, invoices and payments, tickets, tasks, costs and team hours.
 *
 * Run by scripts/demo-db.mts on first start. Every name, company, address,
 * email and phone number is generated: emails use .example domains and phone
 * numbers sit in the 555-01xx range reserved for fiction, so nothing here can
 * reach a real person.
 *
 * Dates are generated relative to today, so the demo always looks current.
 * Set DEMO_SEED to a different number for a different (but repeatable) set.
 */
import { faker } from "@faker-js/faker";
import { PrismaClient } from "../src/generated/prisma/client";
import type {
  AddonItemType,
  BillingFrequency,
  LeadSource,
  PaymentMethod,
  TaskPriority,
  TaskStatus,
  TicketStatus,
  TicketUrgency,
} from "../src/generated/prisma/enums";
import { resolveRate } from "../src/lib/billing/rates";
import { billableHours, isOnSiteCode } from "../src/lib/billing/travel";

faker.seed(Number(process.env.DEMO_SEED ?? 20261014));
const prisma = new PrismaClient();

// ---------------------------------------------------------------- helpers ---

const DEMO_DOMAIN = "demo.securetecc.example";
const round2 = (n: number) => Math.round(n * 100) / 100;
const pick = <T>(xs: readonly T[]) => faker.helpers.arrayElement(xs);
const chance = (p: number) => faker.number.float({ min: 0, max: 1 }) < p;
const fakePhone = () =>
  `(${faker.helpers.arrayElement(["503", "971", "360", "541"])}) 555-01${faker.string.numeric(2)}`;

/** Date-only values are stored at UTC midnight throughout the app. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const monthStart = (y: number, m: number) => day(y, m, 1);
const monthEnd = (y: number, m: number) => day(y, m + 1, 0);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
/** A timestamp during working hours (Pacific, roughly) on a given date. */
const atWorkHour = (d: Date) =>
  new Date(d.getTime() + faker.number.int({ min: 16, max: 24 }) * 3_600_000 + faker.number.int({ min: 0, max: 59 }) * 60_000);

function weekdaysIn(y: number, m: number, upTo?: Date): Date[] {
  const out: Date[] = [];
  for (let d = monthStart(y, m); d <= monthEnd(y, m); d = addDays(d, 1)) {
    if (upTo && d > upTo) break;
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

const now = new Date();
const today = day(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
/** Fourteen calendar months: thirteen closed ones plus the current one. */
const MONTHS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 13 + i, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
});
const historyStart = monthStart(MONTHS[0].y, MONTHS[0].m);

/**
 * createMany in batches, so no single statement sent to PGlite carries
 * thousands of rows.
 */
async function inBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>, size = 100) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

// ------------------------------------------------------------- reference ---

const SERVICE_TYPES = [
  { code: "R-S", label: "Remote Service", billingMinimumHours: 0.25, rateOverride: null, weight: 46 },
  { code: "P-S", label: "Phone Service", billingMinimumHours: 0.25, rateOverride: null, weight: 14 },
  { code: "E-S", label: "Email Service", billingMinimumHours: 0.25, rateOverride: null, weight: 8 },
  { code: "O-S", label: "On-Site Service", billingMinimumHours: 1.0, rateOverride: null, weight: 20 },
  { code: "L-V", label: "Low Voltage", billingMinimumHours: 1.0, rateOverride: 150, weight: 5 },
  { code: "W-D", label: "Website Development", billingMinimumHours: 0.25, rateOverride: 50, weight: 4 },
  { code: "A-I", label: "AI Automation", billingMinimumHours: 0.25, rateOverride: 50, weight: 3 },
] as const;

const WORK: Record<string, string[]> = {
  "R-S": [
    "Patched and rebooted {host}; verified backups completed",
    "Remote session: resolved Outlook profile corruption for {person}",
    "Cleared print spooler and reinstalled driver on {host}",
    "Investigated slow login on {host}; disabled startup bloat",
    "Reset MFA for {person} and re-enrolled authenticator",
    "Configured new laptop for {person}: M365, VPN, RMM agent",
    "Reviewed RMM alerts; cleared low-disk warning on {host}",
    "Updated firewall firmware and reviewed rule set",
    "Migrated shared mailbox permissions for {person}",
    "Removed adware from {host} and ran full scan",
  ],
  "P-S": [
    "Phone support: {person} unable to access shared drive",
    "Walked {person} through Teams audio setup",
    "Call with {person} re: phishing email, confirmed no click-through",
    "Phone support: password reset and account unlock for {person}",
  ],
  "E-S": [
    "Email support: license reassignment for departing staff",
    "Email: advised on vendor invoice phishing attempt",
    "Email support: shared calendar permissions for {person}",
  ],
  "O-S": [
    "On-site: replaced failed switch in server closet",
    "On-site: new workstation deployment x{n}",
    "On-site: troubleshot intermittent Wi-Fi in conference room",
    "On-site: installed and configured network printer",
    "On-site: quarterly server maintenance and UPS test",
  ],
  "L-V": [
    "Ran {n} new Cat6 drops to front office",
    "Installed and terminated patch panel; labeled runs",
    "Mounted ceiling access point and ran cable",
  ],
  "W-D": [
    "Website: updated services page and contact form",
    "Website: plugin updates and staging backup",
    "Website: new landing page layout",
  ],
  "A-I": [
    "Built intake-email triage automation",
    "Configured AI meeting-notes workflow for {person}",
    "Automated monthly report export to shared drive",
  ],
};

const fillWork = (code: string) =>
  pick(WORK[code])
    .replace("{host}", `${faker.helpers.arrayElement(["FRONT", "ACCT", "MGR", "RECEP", "SHOP", "LAB"])}-PC${faker.number.int({ min: 1, max: 12 }).toString().padStart(2, "0")}`)
    .replace("{person}", faker.person.firstName())
    .replace("{n}", String(faker.number.int({ min: 2, max: 6 })));

type AddonTemplate = {
  itemType: AddonItemType;
  description: string;
  unit?: [number, number];
  flat?: [number, number];
  costShare: [number, number];
  frequency?: BillingFrequency;
};
const ADDONS: AddonTemplate[] = [
  { itemType: "SiteFee", description: "Managed IT site fee", flat: [150, 450], costShare: [0, 0] },
  { itemType: "RMM", description: "Remote monitoring & management", unit: [12, 20], costShare: [0.3, 0.45] },
  { itemType: "EmailSecurity", description: "Email security & filtering", unit: [4, 7], costShare: [0.4, 0.55] },
  { itemType: "DMARC", description: "DMARC monitoring", flat: [25, 25], costShare: [0.3, 0.4] },
  { itemType: "MonitoringSeat", description: "Endpoint protection", unit: [8, 15], costShare: [0.35, 0.5] },
  { itemType: "RemoteMonitoring", description: "Firewall monitoring", flat: [35, 60], costShare: [0.2, 0.35] },
  { itemType: "Other", description: "Cloud backup", flat: [45, 120], costShare: [0.4, 0.55] },
  { itemType: "Other", description: "Domain & SSL renewal", flat: [60, 180], costShare: [0.5, 0.7], frequency: "Annual" },
];

const LEAD_SOURCES: LeadSource[] = ["Legacy", "Legacy", "Legacy", "Referral", "Referral", "Website", "GoogleBusinessProfile", "SEO", "ExistingClient", "Campaign"];
const PAY_METHODS: PaymentMethod[] = ["Check", "Check", "Check", "ACH", "ACH", "Zelle", "Card", "PayPal", "Cash"];

// ------------------------------------------------------------------ main ---

async function main() {
  const owner = { first: faker.person.firstName(), last: faker.person.lastName() };
  const ownerName = `${owner.first} ${owner.last}`;

  const org = await prisma.organization.create({
    data: {
      name: "SecureTECC",
      supportEmail: `support@${DEMO_DOMAIN}`,
      notificationFromEmail: `noreply@${DEMO_DOMAIN}`,
      invoiceFromEmail: `owner@${DEMO_DOMAIN}`,
      ticketNotificationEmail: `tickets@${DEMO_DOMAIN}`,
      phone: fakePhone(),
      billerName: ownerName,
      billerAddress1: faker.location.streetAddress(),
      billerCityStateZip: `${faker.location.city()}, OR ${faker.location.zipCode("97###")}`,
      billerMobilePhone: fakePhone(),
      billerEmail: `owner@${DEMO_DOMAIN}`,
      website: "https://securetecc.example",
      invoiceForLabel: "IT Services",
      checkPayableTo: "SecureTECC Solutions",
      acceptedPaymentMethods: "Check, ACH, Zelle, Card",
      monthlyRevenueGoal: 17500,
    },
  });

  // ---- staff ------------------------------------------------------------
  const staffSpec = [
    { email: "owner", name: ownerName, role: "admin", jobTitle: "Owner / Lead Technician", tz: "America/Los_Angeles", delegate: true, hours: 40 },
    { email: "tech", name: faker.person.fullName(), role: "technician", jobTitle: "Field Technician", tz: "America/Los_Angeles", delegate: false, hours: 30 },
    { email: "partner", name: faker.person.fullName(), role: "admin", jobTitle: "Web & Automation", tz: "Asia/Manila", delegate: false, hours: 15 },
    { email: "va", name: faker.person.fullName(), role: "technician", jobTitle: "Virtual Assistant", tz: "Asia/Manila", delegate: false, hours: 20 },
    { email: "lowvoltage", name: faker.person.fullName(), role: "technician", jobTitle: "Low Voltage (subcontractor)", tz: "America/Los_Angeles", delegate: false, hours: 8 },
  ] as const;

  const users = [];
  for (const s of staffSpec) {
    users.push(
      await prisma.user.create({
        data: {
          organizationId: org.id,
          authUserId: faker.string.uuid(),
          name: s.name,
          email: `${s.email}@${DEMO_DOMAIN}`,
          role: s.role,
          jobTitle: s.jobTitle,
          timeZone: s.tz,
          canDelegateTasks: s.delegate,
          estimatedWeeklyHours: s.hours,
          offlineAfterMinutes: faker.helpers.arrayElement([1260, 1320, 1380]),
          birthMonth: faker.number.int({ min: 1, max: 12 }),
          birthDay: faker.number.int({ min: 1, max: 28 }),
          createdAt: historyStart,
        },
      }),
    );
  }
  const [ownerUser, techUser, partnerUser, vaUser, lvUser] = users;

  // ---- weekly hours -----------------------------------------------------
  const blocks: { userId: string; weekday: number; startMinutes: number; endMinutes: number; label?: string; kind?: "Work" | "Commitment" }[] = [];
  for (let wd = 1; wd <= 5; wd++) {
    blocks.push({ userId: ownerUser.id, weekday: wd, startMinutes: 480, endMinutes: 1050 });
    blocks.push({ userId: techUser.id, weekday: wd, startMinutes: 540, endMinutes: 900 });
    blocks.push({ userId: vaUser.id, weekday: wd, startMinutes: 540, endMinutes: 780, label: "Core hours" });
    blocks.push({ userId: vaUser.id, weekday: wd, startMinutes: 840, endMinutes: 1080, label: "Other client", kind: "Commitment" });
    if (wd % 2 === 1) blocks.push({ userId: partnerUser.id, weekday: wd, startMinutes: 1200, endMinutes: 1380 });
    blocks.push({ userId: partnerUser.id, weekday: wd, startMinutes: 600, endMinutes: 1020, label: "Other client", kind: "Commitment" });
  }
  blocks.push({ userId: lvUser.id, weekday: 2, startMinutes: 480, endMinutes: 960 });
  blocks.push({ userId: lvUser.id, weekday: 4, startMinutes: 480, endMinutes: 960 });
  await prisma.userAvailability.createMany({ data: blocks });

  const exceptions = [];
  for (let i = 0; i < 6; i++) {
    const u = pick(users);
    const d = addDays(today, faker.number.int({ min: -10, max: 21 }));
    exceptions.push({
      userId: u.id,
      date: d.toISOString().slice(0, 10),
      kind: pick(["Leave", "Unavailable", "Blocked", "DifferentHours"] as const),
      note: pick(["Dentist", "Family event", "Client migration", "Training day", null]),
      createdByUserId: u.id,
    });
  }
  await prisma.availabilityException.createMany({ data: exceptions });

  // ---- rate card ----------------------------------------------------------
  const nextJan = day(today.getUTCFullYear() + 1, 0, 1);
  const serviceTypes = new Map<string, Awaited<ReturnType<typeof prisma.serviceType.create>>>();
  for (const st of SERVICE_TYPES) {
    serviceTypes.set(
      st.code,
      await prisma.serviceType.create({
        data: {
          organizationId: org.id,
          code: st.code,
          label: st.label,
          billingMinimumHours: st.billingMinimumHours,
          rateOverride: st.rateOverride,
          ...(st.code === "O-S" ? { scheduledRate: 150, scheduledRateFrom: nextJan } : {}),
        },
      }),
    );
  }
  await prisma.addonPricing.createMany({
    data: [
      { organizationId: org.id, itemType: "DMARC", defaultRate: 25 },
      { organizationId: org.id, itemType: "MonitoringSeat", defaultRate: 15 },
      { organizationId: org.id, itemType: "RemoteMonitoring", defaultRate: 35 },
      { organizationId: org.id, itemType: "RMM", defaultRate: 15 },
      { organizationId: org.id, itemType: "EmailSecurity", defaultRate: 5 },
    ],
  });

  // ---- clients ----------------------------------------------------------
  const usedShort = new Set<string>();
  const shortFor = (name: string) => {
    const letters = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
    let base = letters.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
    if (base.length < 3) base = letters.join("").toUpperCase().slice(0, 3);
    let candidate = base;
    for (let i = 2; usedShort.has(candidate); i++) candidate = `${base}${i}`;
    usedShort.add(candidate);
    return candidate;
  };
  const SUFFIXES = ["Dental", "Family Law", "Veterinary Clinic", "Construction", "Realty", "CPA Group", "Physical Therapy", "Landscaping", "Insurance Agency", "Brewing Co.", "Auto Repair", "Architects", "Chiropractic", "Title & Escrow", "Bakery", "Engineering", "Property Management", "Orthodontics", "Nonprofit Alliance", "Machine Works"];

  type ClientRow = Awaited<ReturnType<typeof prisma.client.create>>;
  const clients: ClientRow[] = [];
  const CLIENT_COUNT = 18;
  // Retainer clients are supported below but off by default: the dashboard's
  // unbilled-work figure (lib/dashboard/metrics.ts) prices a retainer
  // client's hours at its monthly fee, which turns a few hours into tens of
  // thousands of dollars on screen.
  const RETAINER_CLIENTS = 0;
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const name = `${faker.helpers.arrayElement([faker.person.lastName(), faker.location.street(), faker.word.adjective({ length: { min: 4, max: 8 } })]).replace(/^./, (c) => c.toUpperCase())} ${SUFFIXES[i % SUFFIXES.length]}`;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 18);
    const isRetainer = i < RETAINER_CLIENTS;
    const leadSource = i < 11 ? "Legacy" : pick(LEAD_SOURCES.filter((l) => l !== "Legacy"));
    const started = i < 11 ? null : addDays(historyStart, faker.number.int({ min: 30, max: 300 }));
    clients.push(
      await prisma.client.create({
        data: {
          organizationId: org.id,
          name,
          shortName: shortFor(name),
          ownerName: faker.person.fullName(),
          billingContactName: chance(0.4) ? faker.person.fullName() : null,
          email: `billing@${slug}.example`,
          phone: fakePhone(),
          address1: faker.location.streetAddress(),
          address2: chance(0.25) ? `Suite ${faker.number.int({ min: 100, max: 400 })}` : null,
          cityStateZip: `${faker.location.city()}, ${pick(["OR", "OR", "OR", "WA"])} ${faker.location.zipCode("97###")}`,
          reference: `CLI-${String(i + 1).padStart(3, "0")}`,
          billingType: isRetainer ? "Retainer" : "Hourly",
          billingCadence: !isRetainer && chance(0.15) ? "Quarterly" : "Monthly",
          billingRate: isRetainer ? pick([1200, 1500, 1800, 2400]) : pick([95, 105, 110, 110, 115, 120]),
          ...(isRetainer ? {} : { scheduledRate: 125, scheduledRateFrom: nextJan }),
          serviceArea: chance(0.2) ? "OutOfArea" : "InArea",
          leadSource,
          leadSourceNote: leadSource === "Referral" ? `Referred by ${faker.person.fullName()}` : null,
          relationshipStartedOn: started,
          activeStatus: i !== CLIENT_COUNT - 1,
          notes: chance(0.4) ? pick(["Prefers phone over email.", "Gate code at front desk.", "Server closet key with office manager.", "Bill quarterly per agreement.", "Owner approves all purchases over $500."]) : null,
          createdAt: started ?? historyStart,
        },
      }),
    );
  }
  const internalClient = await prisma.client.create({
    data: {
      organizationId: org.id,
      name: "SecureTECC Internal",
      shortName: "STI",
      reference: "CLI-000",
      isInternal: true,
      billingRate: 0,
      leadSource: "Other",
      notes: "Internal and shared work. Never billed.",
      createdAt: historyStart,
    },
  });

  // ---- recurring charges ------------------------------------------------
  type ChargeRow = Awaited<ReturnType<typeof prisma.recurringCharge.create>>;
  const chargesByClient = new Map<string, ChargeRow[]>();
  let rcSeq = 0;
  for (const client of clients) {
    const list: ChargeRow[] = [];
    const templates = faker.helpers.arrayElements(ADDONS, { min: 1, max: 4 });
    for (const t of templates) {
      const seats = t.unit ? faker.number.int({ min: 4, max: 30 }) : null;
      const unitPrice = t.unit ? faker.number.int({ min: t.unit[0], max: t.unit[1] }) : null;
      const amount = t.unit ? seats! * unitPrice! : faker.number.int({ min: t.flat![0], max: t.flat![1] });
      const costShare = faker.number.float({ min: t.costShare[0], max: t.costShare[1] });
      const startDate = client.relationshipStartedOn ?? addDays(historyStart, -faker.number.int({ min: 60, max: 900 }));
      const charge = await prisma.recurringCharge.create({
        data: {
          organizationId: org.id,
          clientId: client.id,
          reference: `RC-${String(++rcSeq).padStart(3, "0")}`,
          description: t.description,
          amount,
          quantity: seats,
          unitPrice,
          cost: costShare > 0 ? round2(amount * costShare) : null,
          notes: seats ? `${seats} ${t.itemType === "EmailSecurity" ? "mailboxes" : "devices"} × $${unitPrice} — verify count monthly` : null,
          startDate,
          billingFrequency: t.frequency ?? "Monthly",
          activeStatus: client.activeStatus,
          itemType: t.itemType,
          authorizedBy: client.ownerName,
          createdAt: startDate < historyStart ? historyStart : startDate,
        },
      });
      await prisma.recurringChargeAuditLog.create({
        data: {
          organizationId: org.id,
          recurringChargeId: charge.id,
          action: "created",
          itemType: charge.itemType,
          description: charge.description,
          amount: charge.amount,
          billingFrequency: charge.billingFrequency,
          authorizedBy: charge.authorizedBy ?? ownerName,
          notes: charge.notes,
          createdAt: charge.createdAt,
        },
      });
      list.push(charge);
    }
    chargesByClient.set(client.id, list);
  }

  // ---- time entries -----------------------------------------------------
  const stWeights = SERVICE_TYPES.map((s) => ({ value: s.code, weight: s.weight }));
  const performerFor = (code: string) => {
    if (code === "L-V") return lvUser;
    if (code === "W-D" || code === "A-I") return partnerUser;
    if (code === "O-S") return faker.helpers.weightedArrayElement([{ value: ownerUser, weight: 6 }, { value: techUser, weight: 4 }]);
    return faker.helpers.weightedArrayElement([
      { value: ownerUser, weight: 5 }, { value: techUser, weight: 3 }, { value: vaUser, weight: 2 }, { value: partnerUser, weight: 1 },
    ]);
  };

  type Entry = {
    id: string; clientId: string; date: Date; durationHours: number; description: string;
    billableStatus: "Billable" | "NonBillable" | "Residual"; serviceTypeId: string; code: string;
    travelMinutes: number | null; project: string | null; loggedByUserId: string; performedByUserId: string;
    source: "Manual" | "Voice" | "CsvImport"; rawInput: string | null; createdAt: Date;
  };
  const entries: Entry[] = [];
  const PROJECTS = ["M365 migration", "Network refresh", "CMMC Level 1", "Server replacement", "Website rebuild"];

  for (const { y, m } of MONTHS) {
    const isCurrent = y === today.getUTCFullYear() && m === today.getUTCMonth();
    const days = weekdaysIn(y, m, isCurrent ? today : undefined);
    if (days.length === 0) continue;
    for (const client of [...clients, internalClient]) {
      if (client.createdAt > monthEnd(y, m)) continue;
      if (!client.activeStatus && monthStart(y, m) > addDays(today, -120)) continue;
      const base = client.isInternal ? 3 : client.billingType === "Retainer" ? 6 : 4;
      const count = Math.round(faker.number.int({ min: 0, max: base * 2 }) * (isCurrent ? days.length / 21 : 1));
      const project = chance(0.12) ? pick(PROJECTS) : null;
      for (let k = 0; k < count; k++) {
        const code = faker.helpers.weightedArrayElement(stWeights);
        const performer = performerFor(code);
        const date = pick(days);
        const onSite = isOnSiteCode(code);
        const worked = onSite || code === "L-V"
          ? faker.number.int({ min: 2, max: 14 }) * 0.25
          : faker.number.int({ min: 1, max: 8 }) * 0.25;
        const travelMinutes = onSite ? faker.helpers.arrayElement([15, 20, 30, 45]) : null;
        // durationHours stores what is BILLED -- minimum and travel applied at
        // write time, as time-entries/actions.ts does.
        const duration = billableHours({
          workedHours: worked,
          travelMinutes,
          serviceTypeMinimumHours: SERVICE_TYPES.find((s) => s.code === code)!.billingMinimumHours,
          serviceArea: client.serviceArea,
          isOnSite: onSite,
        }).hours;
        const source = faker.helpers.weightedArrayElement([
          { value: "Manual" as const, weight: 8 }, { value: "Voice" as const, weight: 2 },
        ]);
        const description = fillWork(code);
        entries.push({
          id: faker.string.uuid(),
          clientId: client.id,
          date,
          durationHours: duration,
          description,
          billableStatus: client.isInternal ? "NonBillable" : chance(0.06) ? "NonBillable" : "Billable",
          serviceTypeId: serviceTypes.get(code)!.id,
          code,
          travelMinutes,
          project: project && chance(0.6) ? project : null,
          loggedByUserId: chance(0.7) ? performer.id : ownerUser.id,
          performedByUserId: performer.id,
          source,
          rawInput: source === "Voice" ? `${client.shortName} ${worked} hours ${description.toLowerCase()}` : null,
          createdAt: atWorkHour(date),
        });
      }
    }
  }

  // ---- reimbursables ----------------------------------------------------
  type Reimb = { id: string; clientId: string; date: Date; description: string; amount: number; createdAt: Date };
  const reimbursables: Reimb[] = [];
  for (let i = 0; i < 22; i++) {
    const client = pick(clients.filter((c) => c.activeStatus));
    const date = addDays(historyStart, faker.number.int({ min: 0, max: Math.floor((today.getTime() - historyStart.getTime()) / 86_400_000) }));
    reimbursables.push({
      id: faker.string.uuid(),
      clientId: client.id,
      date,
      description: pick(["Replacement 24-port switch", "SSD upgrade (1TB)", "UPS battery", "Wireless access point", "Cat6 cable & keystones", "USB-C dock", "Toner cartridge", "Firewall license renewal"]),
      amount: faker.number.int({ min: 25, max: 480 }) + pick([0, 0.99, 0.5]),
      createdAt: atWorkHour(date),
    });
  }

  // ---- invoices ---------------------------------------------------------
  const stById = new Map([...serviceTypes.values()].map((s) => [s.id, s]));
  const entryInvoice = new Map<string, string>();
  const reimbInvoice = new Map<string, string>();
  const invoiceRows: object[] = [];
  const ircRows: object[] = [];
  const retainerRows: object[] = [];
  const paymentRows: object[] = [];
  const customItemRows: object[] = [];
  const sequences = new Map<string, number>();

  const lastClosed = MONTHS.length - 2; // index of last month
  const periods: { client: ClientRow; start: Date; end: Date; monthsBack: number }[] = [];
  for (const client of clients) {
    if (client.billingCadence === "Quarterly") {
      for (let i = 0; i <= lastClosed; i++) {
        const { y, m } = MONTHS[i];
        if (m % 3 !== 2) continue; // quarter ends Mar/Jun/Sep/Dec
        periods.push({ client, start: monthStart(y, m - 2), end: monthEnd(y, m), monthsBack: lastClosed - i });
      }
    } else {
      for (let i = 0; i <= lastClosed; i++) {
        const { y, m } = MONTHS[i];
        periods.push({ client, start: monthStart(y, m), end: monthEnd(y, m), monthsBack: lastClosed - i });
      }
    }
  }
  periods.sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const { client, start, end, monthsBack } of periods) {
    if (client.createdAt > end) continue;
    const invoiceId = faker.string.uuid();
    const lines = entries.filter(
      (e) => e.clientId === client.id && e.billableStatus === "Billable" && e.date >= start && e.date <= end && !entryInvoice.has(e.id),
    );
    let hours = 0;
    let amount = 0;
    // Child rows are held here and only kept if the invoice itself is.
    const pending = { retainer: [] as object[], irc: [] as object[], custom: [] as object[], reimb: [] as string[] };

    if (client.billingType === "Retainer") {
      for (let d = start; d <= end; d = monthStart(d.getUTCFullYear(), d.getUTCMonth() + 1)) {
        const r = Number(client.billingRate);
        pending.retainer.push({
          organizationId: org.id, invoiceId, clientId: client.id,
          periodStart: d, periodEnd: monthEnd(d.getUTCFullYear(), d.getUTCMonth()), amount: r,
        });
        amount += r;
      }
      for (const e of lines) hours += e.durationHours;
    } else {
      for (const e of lines) {
        const st = stById.get(e.serviceTypeId)!;
        const rate = resolveRate({
          entryRateOverride: null,
          serviceTypeRateOverride: st.rateOverride === null ? null : Number(st.rateOverride),
          serviceTypeScheduledRate: st.scheduledRate === null ? null : Number(st.scheduledRate),
          serviceTypeScheduledRateFrom: st.scheduledRateFrom,
          clientBillingRate: client.billingRate === null ? null : Number(client.billingRate),
          clientScheduledRate: client.scheduledRate === null ? null : Number(client.scheduledRate),
          clientScheduledRateFrom: client.scheduledRateFrom,
          entryDate: e.date,
        }) ?? 0;
        hours += e.durationHours;
        amount += round2(e.durationHours * rate);
      }
    }

    for (const charge of chargesByClient.get(client.id) ?? []) {
      if (!charge.activeStatus || (charge.startDate && charge.startDate > end)) continue;
      for (let d = start; d <= end; d = monthStart(d.getUTCFullYear(), d.getUTCMonth() + 1)) {
        if (charge.billingFrequency === "Annual" && d.getUTCMonth() !== 0) continue;
        pending.irc.push({
          organizationId: org.id, invoiceId, recurringChargeId: charge.id,
          description: charge.description, amount: charge.amount, billingFrequency: charge.billingFrequency,
          periodStart: d, periodEnd: monthEnd(d.getUTCFullYear(), d.getUTCMonth()),
        });
        amount += Number(charge.amount);
      }
    }

    for (const r of reimbursables) {
      if (r.clientId === client.id && r.date >= start && r.date <= end && !reimbInvoice.has(r.id)) {
        pending.reimb.push(r.id);
        amount += r.amount;
      }
    }

    if (chance(0.06)) {
      const credit = -pick([25, 50, 75]);
      pending.custom.push({ invoiceId, description: "Courtesy credit", amount: credit, sortOrder: 0 });
      amount += credit;
    }

    if (amount <= 0) continue;
    for (const e of lines) entryInvoice.set(e.id, invoiceId);
    for (const id of pending.reimb) reimbInvoice.set(id, invoiceId);
    retainerRows.push(...pending.retainer);
    ircRows.push(...pending.irc);
    customItemRows.push(...pending.custom);

    const seq = (sequences.get(client.id) ?? 0) + 1;
    sequences.set(client.id, seq);
    amount = round2(amount);

    // Older periods are settled; the latest ones are in flight, and a couple
    // of clients run late so the ageing report has something to show.
    const slowPayer = client.reference === "CLI-005" || client.reference === "CLI-009";
    const issuedAt = atWorkHour(addDays(end, faker.number.int({ min: 2, max: 6 })));
    let status: "Draft" | "Invoiced" | "Sent" | "Paid" = "Paid";
    if (monthsBack === 0) status = pick(["Draft", "Invoiced", "Sent", "Sent", "Sent"]);
    else if (monthsBack === 1) status = chance(0.55) ? "Paid" : "Sent";
    else if (slowPayer && monthsBack <= 3) status = "Sent";
    const sentAt = status === "Draft" || status === "Invoiced" ? null : addDays(issuedAt, faker.number.int({ min: 0, max: 2 }));

    let paidAt: Date | null = null;
    let paymentMethod: PaymentMethod | null = null;
    if (status === "Paid") {
      const method = pick(PAY_METHODS);
      paymentMethod = method;
      const received = addDays(sentAt!, faker.number.int({ min: 4, max: 38 }));
      const split = amount > 800 && chance(0.15);
      const parts = split ? [round2(amount / 2), round2(amount - round2(amount / 2))] : [amount];
      parts.forEach((part, idx) => {
        const at = addDays(received, idx * faker.number.int({ min: 10, max: 20 }));
        paidAt = atWorkHour(at);
        paymentRows.push({
          organizationId: org.id, invoiceId, amount: part,
          receivedAt: day(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
          method,
          reference: method === "Check" ? `#${faker.number.int({ min: 1000, max: 9999 })}` : method === "ACH" ? `ACH ${faker.string.alphanumeric(8).toUpperCase()}` : null,
          recordedByUserId: ownerUser.id,
          createdAt: paidAt,
        });
      });
    } else if (status === "Sent" && monthsBack === 1 && chance(0.25)) {
      // Part payment on an open invoice.
      const at = addDays(sentAt!, faker.number.int({ min: 5, max: 15 }));
      paymentRows.push({
        organizationId: org.id, invoiceId, amount: round2(amount * 0.5),
        receivedAt: day(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
        method: "ACH", reference: `ACH ${faker.string.alphanumeric(8).toUpperCase()}`,
        notes: "Partial — balance to follow", recordedByUserId: ownerUser.id, createdAt: atWorkHour(at),
      });
    }

    invoiceRows.push({
      id: invoiceId,
      organizationId: org.id,
      clientId: client.id,
      invoiceNumber: `${client.shortName}-${String(seq).padStart(5, "0")}`,
      periodStart: start,
      periodEnd: end,
      totalHours: round2(hours),
      totalAmount: amount,
      status,
      issuedAt: status === "Draft" ? null : issuedAt,
      sentAt,
      paidAt,
      paymentMethod,
      // Same path invoicePdfPath() builds. The file itself is rendered on
      // first download by the PDF route, rather than for every invoice here.
      pdfUrl: `${org.id}/${client.id}/${invoiceId}.pdf`,
      createdAt: issuedAt,
    });
  }

  await inBatches(invoiceRows, (b) => prisma.invoice.createMany({ data: b as never }));
  await inBatches(retainerRows, (b) => prisma.invoiceRetainerPeriod.createMany({ data: b as never }));
  await inBatches(ircRows, (b) => prisma.invoiceRecurringCharge.createMany({ data: b as never }));
  await inBatches(customItemRows, (b) => prisma.invoiceCustomItem.createMany({ data: b as never }));
  await inBatches(paymentRows, (b) => prisma.payment.createMany({ data: b as never }));
  for (const [clientId, seq] of sequences) {
    await prisma.client.update({ where: { id: clientId }, data: { lastInvoiceSequence: seq } });
  }

  await inBatches(
    entries.map(({ code: _code, ...e }) => ({
      ...e,
      organizationId: org.id,
      invoiceId: entryInvoice.get(e.id) ?? null,
    })),
    (b) => prisma.timeEntry.createMany({ data: b }),
  );
  await prisma.reimbursableExpense.createMany({
    data: reimbursables.map((r, i) => ({
      ...r,
      organizationId: org.id,
      reference: `RB-${faker.string.hexadecimal({ length: 8, casing: "lower", prefix: "" })}`,
      invoiceId: reimbInvoice.get(r.id) ?? null,
      loggedByUserId: i % 3 === 0 ? techUser.id : ownerUser.id,
    })),
  });

  // ---- tickets ----------------------------------------------------------
  const ticketRows = [];
  const TICKET_TEXT: Record<string, string[]> = {
    "Computer / Workstation": ["Computer won't turn on after the weekend.", "Laptop is extremely slow since the last update.", "Blue screen when opening our accounting software."],
    "Network / Internet": ["Internet keeps dropping every afternoon.", "Wi-Fi in the back office is very weak.", "Can't reach the shared drive from home."],
    Email: ["Not receiving emails from one of our vendors.", "Outlook keeps asking for my password.", "Need a new mailbox for a new hire starting Monday."],
    Printer: ["Printer shows offline for everyone.", "Scanner won't send to email anymore."],
    "Phone System": ["Front desk phone has no dial tone.", "Voicemail greeting needs updating."],
    "Security / Virus": ["Got a suspicious email asking to pay an invoice.", "Pop-ups saying my computer is infected."],
    Software: ["Need QuickBooks installed on a new PC.", "Adobe license expired message."],
    Other: ["Moving offices next month — need help planning.", "Quote for two new laptops."],
  };
  const TICKET_COUNT = 48;
  for (let i = 0; i < TICKET_COUNT; i++) {
    const client = pick(clients.filter((c) => c.activeStatus));
    const created = atWorkHour(addDays(today, -Math.round(((TICKET_COUNT - i) / TICKET_COUNT) * 180)));
    const ageDays = (today.getTime() - created.getTime()) / 86_400_000;
    const issueType = pick(Object.keys(TICKET_TEXT));
    const status: TicketStatus =
      ageDays > 21 ? "Closed" : ageDays > 10 ? pick(["Closed", "Completed"]) : pick(["New", "InProgress", "InProgress", "WaitingOnClient", "Completed"]);
    const contact = faker.person.fullName();
    ticketRows.push({
      organizationId: org.id,
      ticketNumber: `TKT-${String(i + 1).padStart(4, "0")}`,
      clientCompanyName: client.name,
      contactName: contact,
      contactEmail: `${contact.split(" ")[0].toLowerCase()}@${client.email!.split("@")[1]}`,
      callbackNumber: chance(0.7) ? fakePhone() : null,
      issueType,
      urgency: faker.helpers.weightedArrayElement<TicketUrgency>([
        { value: "Low", weight: 3 }, { value: "Medium", weight: 5 }, { value: "High", weight: 3 }, { value: "Critical", weight: 1 }, { value: "Emergency", weight: 0.4 },
      ]),
      description: pick(TICKET_TEXT[issueType]),
      status,
      assignedToUserId: status === "New" && chance(0.5) ? null : pick([ownerUser, ownerUser, techUser, vaUser]).id,
      internalNotes: status !== "New" && chance(0.5) ? pick(["Remoted in, applied fix.", "Waiting on client to confirm.", "Ordered replacement part.", "Escalated to ISP."]) : null,
      resolvedAt: status === "Completed" || status === "Closed" ? addDays(created, faker.number.float({ min: 0.1, max: 4 })) : null,
      createdAt: created,
    });
  }
  await inBatches(ticketRows, (b) => prisma.ticket.createMany({ data: b }));
  await prisma.organization.update({ where: { id: org.id }, data: { lastTicketSequence: TICKET_COUNT } });

  // ---- tasks ------------------------------------------------------------
  const TASKS = [
    "Renew domain for {c}", "Prepare quarterly security review for {c}", "Update client onboarding checklist",
    "Order replacement laptops for {c}", "Draft proposal: managed backup upsell", "Clean up stale RMM agents",
    "Audit M365 licences across clients", "Write SOP for new-hire setup", "Follow up on overdue invoices",
    "Refresh Google Business Profile photos", "Schedule firewall firmware updates", "Document {c} network diagram",
    "Set up DMARC reporting for {c}", "Review monthly profitability report", "Plan office move for {c}",
    "Publish blog post: phishing awareness", "Test backup restore for {c}", "Collect W-9 from low-voltage subcontractor",
  ];
  const assignable = [techUser, partnerUser, vaUser, lvUser];
  for (const t of TASKS) {
    const assignee = pick(assignable);
    const status: TaskStatus = pick(["NotStarted", "InProgress", "InProgress", "ForReview", "Completed", "Completed"]);
    const start = addDays(today, -faker.number.int({ min: 0, max: 30 }));
    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        title: t.replace("{c}", pick(clients).name),
        description: chance(0.6) ? faker.lorem.sentences({ min: 1, max: 2 }) : null,
        priority: pick<TaskPriority>(["Low", "Medium", "Medium", "High", "Urgent"]),
        status,
        startDate: start,
        dueDate: addDays(start, faker.number.int({ min: 3, max: 30 })),
        assignedToUserId: assignee.id,
        createdByUserId: ownerUser.id,
        completedAt: status === "Completed" ? atWorkHour(addDays(start, faker.number.int({ min: 1, max: 10 }))) : null,
        createdAt: atWorkHour(start),
      },
    });
    const extra = chance(0.25) ? assignable.filter((u) => u.id !== assignee.id).slice(0, 1) : [];
    await prisma.taskAssignee.createMany({
      data: [assignee, ...extra].map((u) => ({ taskId: task.id, userId: u.id, notifiedAt: task.createdAt })),
    });
  }

  // ---- business expenses ------------------------------------------------
  const vendor = () => `${faker.company.name().split(/[ ,]/)[0]} ${pick(["Software", "Cloud", "Networks", "Systems", "Labs"])}`;
  const EXPENSES = [
    { name: "RMM platform", category: "Software & services", amount: 189, frequency: "Monthly" },
    { name: "PSA / ticketing", category: "Software & services", amount: 79, frequency: "Monthly" },
    { name: "Remote access tool", category: "Software & services", amount: 49, frequency: "Monthly" },
    { name: "Business VoIP", category: "Business subscriptions", amount: 64, frequency: "Monthly" },
    { name: "Google Workspace", category: "Mailbox & email", amount: 42, frequency: "Monthly" },
    { name: "Transactional email", category: "Mailbox & email", amount: 20, frequency: "Monthly" },
    { name: "App hosting", category: "Hosting", amount: 20, frequency: "Monthly" },
    { name: "Website hosting", category: "Hosting", amount: 180, frequency: "Annual" },
    { name: "Liability insurance", category: "Other", amount: 1450, frequency: "Annual" },
    { name: "Accounting software", category: "Business subscriptions", amount: 35, frequency: "Monthly" },
    { name: "Test bench hardware", category: "Other", amount: 640, frequency: "OneOff" },
  ] as const;
  await prisma.businessExpense.createMany({
    data: [
      ...EXPENSES.map((e) => ({
        organizationId: org.id, name: e.name, vendor: vendor(), category: e.category,
        amount: e.amount, frequency: e.frequency, startDate: addDays(historyStart, -faker.number.int({ min: 0, max: 400 })),
      })),
      ...clients.slice(0, 4).map((c) => ({
        organizationId: org.id, name: `Dedicated backup storage — ${c.shortName}`, vendor: vendor(),
        category: "Hosting", amount: faker.number.int({ min: 15, max: 60 }), frequency: "Monthly" as const,
        clientId: c.id, startDate: c.relationshipStartedOn ?? historyStart,
      })),
    ],
  });

  console.log(
    [
      `[demo-seed] ${users.length} staff, ${clients.length + 1} clients, ${entries.length} time entries,`,
      `${invoiceRows.length} invoices, ${paymentRows.length} payments, ${TICKET_COUNT} tickets, ${TASKS.length} tasks.`,
      `[demo-seed] Sign in as ${ownerUser.email} (any password).`,
    ].join("\n"),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
