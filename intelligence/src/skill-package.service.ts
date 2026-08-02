import { Injectable, Logger } from '@nestjs/common';

export interface SkillPackage {
  key: string;
  name: string;
  version: string;
  description: string;
  category: 'crm' | 'tendering' | 'finance' | 'procurement' | 'projects' | 'hse';
  promptKey: string;
  tools: string[];
  requiredCapabilities: string[];
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

@Injectable()
export class SkillPackageService {
  private readonly logger = new Logger('SkillPackageService');
  private readonly packages = new Map<string, SkillPackage>();

  constructor() {
    this.seedDefaultPackages();
  }

  private seedDefaultPackages(): void {
    this.registerPackage({
      key: 'detect_tender',
      name: 'Detect Business Opportunities & Tenders',
      version: '1.0.0',
      description: 'Scans incoming emails and portals for tender announcements and RFP documents.',
      category: 'crm',
      promptKey: 'crm_tender_radar_v1',
      tools: ['scan_inbox_tenders'],
      requiredCapabilities: ['crm.lead.read', 'tendering.tender.create'],
      inputSchema: { type: 'object', properties: { portalUrl: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { tenderId: { type: 'string' } } },
    });

    this.registerPackage({
      key: 'analyze_boq',
      name: 'Analyze BOQ Line Items & Quantities',
      version: '1.2.0',
      description: 'Parses Excel/PDF bill of quantities, extracting item codes, specifications, and BOQ quantities.',
      category: 'tendering',
      promptKey: 'tendering_boq_parser_v1',
      tools: ['parse_boq_document'],
      requiredCapabilities: ['tendering.boq.read', 'estimation.buildup.create'],
      inputSchema: { type: 'object', properties: { documentUri: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { itemsParsed: { type: 'number' } } },
    });

    this.registerPackage({
      key: 'estimate_cost',
      name: 'Calibrate Cost & Rate Buildup (IEC)',
      version: '2.0.0',
      description: 'Calibrates material/labour rates against historical PO evidence and market quotes.',
      category: 'tendering',
      promptKey: 'estimation_rate_v1',
      tools: ['lookup_historical_pricing'],
      requiredCapabilities: ['estimation.buildup.read', 'pricing.source.read'],
      inputSchema: { type: 'object', properties: { itemCode: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { calibratedPrice: { type: 'number' } } },
    });

    this.registerPackage({
      key: 'detect_risk',
      name: 'Detect Project Budget & Cost Risks',
      version: '1.1.0',
      description: 'Monitors project WBS/CBS ledgers and identifies negative cost variance trends.',
      category: 'projects',
      promptKey: 'cost_variance_v1',
      tools: ['query_wbs_ledger'],
      requiredCapabilities: ['projects.wbs.read', 'finance.gl.read'],
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { varianceAmount: { type: 'number' } } },
    });
  }

  registerPackage(pkg: SkillPackage): void {
    this.packages.set(pkg.key, pkg);
    this.logger.log(`[SkillPackage] Registered skill package "${pkg.name}" v${pkg.version}`);
  }

  listPackages(): SkillPackage[] {
    return Array.from(this.packages.values());
  }

  getPackage(key: string): SkillPackage | null {
    return this.packages.get(key) ?? null;
  }
}
