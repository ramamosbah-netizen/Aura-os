import { Injectable, Logger } from '@nestjs/common';
import { AiPlatformService } from './ai-platform.service';

export interface MarketplaceAgentPackage {
  packageId: string;
  name: string;
  version: string;
  publisher: string;
  category: 'procurement' | 'finance' | 'hr' | 'inventory' | 'contracts' | 'hse';
  description: string;
  rating: number;
  installCount: number;
  icon: string;
  priceUsdMonthly: number;
  isInstalled: boolean;
  requiredCapabilities: string[];
  manifestKey: string;
}

@Injectable()
export class AgentMarketplaceService {
  private readonly logger = new Logger('AgentMarketplaceService');
  private readonly catalog = new Map<string, MarketplaceAgentPackage>();
  private readonly installedPackages = new Set<string>();

  constructor(private readonly aiPlatform: AiPlatformService) {
    this.seedCatalog();
  }

  private seedCatalog(): void {
    const packages: MarketplaceAgentPackage[] = [
      {
        packageId: 'pkg_contract_negotiator',
        name: 'Contract Terms & Risk Negotiator',
        version: '2.1.0',
        publisher: 'AURA Enterprise Labs',
        category: 'contracts',
        description: 'Autonomously audits subcontracts, flags liability cap breaches, and suggests redline edits.',
        rating: 4.9,
        installCount: 1420,
        icon: '📜',
        priceUsdMonthly: 49,
        isInstalled: true,
        requiredCapabilities: ['contracts.clause.read', 'contracts.redline.create'],
        manifestKey: 'contract_negotiator',
      },
      {
        packageId: 'pkg_hr_recruiter',
        name: 'Autonomous HR Recruiter & Onboarding',
        version: '1.4.0',
        publisher: 'TalentAI Systems',
        category: 'hr',
        description: 'Screens candidate CVs against MEP engineering competencies and drafts visa onboarding tasks.',
        rating: 4.7,
        installCount: 890,
        icon: '👥',
        priceUsdMonthly: 29,
        isInstalled: false,
        requiredCapabilities: ['hr.candidate.read', 'hr.onboarding.create'],
        manifestKey: 'hr_recruiter',
      },
      {
        packageId: 'pkg_warehouse_optimizer',
        name: 'Warehouse & Inventory Optimizer',
        version: '3.0.1',
        publisher: 'LogiTech AI',
        category: 'inventory',
        description: 'Monitors site store stock levels, forecasts safety stock depletion, and auto-emits PR requisitions.',
        rating: 4.8,
        installCount: 2150,
        icon: '📦',
        priceUsdMonthly: 39,
        isInstalled: false,
        requiredCapabilities: ['inventory.stock.read', 'procurement.pr.create'],
        manifestKey: 'warehouse_optimizer',
      },
      {
        packageId: 'pkg_finance_controller',
        name: 'Autonomous Financial Controller',
        version: '2.0.0',
        publisher: 'AURA Enterprise Labs',
        category: 'finance',
        description: 'Reconciles bank statements, forecasts cashflow liquidity, and detects revenue leakage.',
        rating: 5.0,
        installCount: 3400,
        icon: '💼',
        priceUsdMonthly: 79,
        isInstalled: true,
        requiredCapabilities: ['finance.gl.read', 'finance.cashflow.read'],
        manifestKey: 'finance_controller',
      },
      {
        packageId: 'pkg_maintenance_planner',
        name: 'Predictive Maintenance Planner',
        version: '1.2.0',
        publisher: 'FleetPulse',
        category: 'hse',
        description: 'Schedules preventive maintenance for heavy site equipment based on telemetry usage logs.',
        rating: 4.6,
        installCount: 640,
        icon: '🚜',
        priceUsdMonthly: 19,
        isInstalled: false,
        requiredCapabilities: ['fleet.telemetry.read', 'amc.ticket.create'],
        manifestKey: 'maintenance_planner',
      },
    ];

    for (const pkg of packages) {
      this.catalog.set(pkg.packageId, pkg);
      if (pkg.isInstalled) this.installedPackages.add(pkg.packageId);
    }
  }

  listCatalog(): MarketplaceAgentPackage[] {
    return Array.from(this.catalog.values()).map((p) => ({
      ...p,
      isInstalled: this.installedPackages.has(p.packageId),
    }));
  }

  installPackage(packageId: string): MarketplaceAgentPackage {
    const pkg = this.catalog.get(packageId);
    if (!pkg) throw new Error(`Marketplace package "${packageId}" not found`);

    this.installedPackages.add(packageId);
    pkg.isInstalled = true;
    this.logger.log(`[Marketplace] Installed agent package "${pkg.name}" (${pkg.packageId})`);

    // Register into active platform agent registry
    this.aiPlatform.registerAgent({
      key: pkg.manifestKey,
      label: pkg.name,
      description: pkg.description,
      promptKey: 'procurement_audit_v1',
      toolKeys: ['fetch_po_matching_data'],
      model: 'claude-3-5-sonnet',
      maxIterations: 4,
      enabled: true,
      grantedCapabilities: pkg.requiredCapabilities,
    });

    return pkg;
  }
}
