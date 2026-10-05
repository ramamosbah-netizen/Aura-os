import { Global, Module } from '@nestjs/common';
import { AccountService, ContactService, CrmModule, LeadService, OpportunityService } from '@aura/crm';
import { TenderingModule, TenderService } from '@aura/tendering';
import { ProcurementModule, SupplierService } from '@aura/procurement';
import { ProjectsModule, ProjectService } from '@aura/projects';
import { MAIL_RECORD_DIRECTORY, type MailRecordDirectory } from '../comms/mail/mail-record-directory';
import type { MailRecordType } from '../comms/mail/mail-domain';

/**
 * App-layer answer to Communication's record directory (MAIL-03…07), in the shape the other wiring
 * modules use: the port is declared where it is asked, and bound here, where every owning module is
 * already known. Each kind is answered by its OWN module's service, and a record of another tenant is
 * not found — the tenant is compared here as well as in the services that already check it.
 */
@Global()
@Module({
  imports: [CrmModule, TenderingModule, ProcurementModule, ProjectsModule],
  providers: [
    {
      provide: MAIL_RECORD_DIRECTORY,
      inject: [AccountService, ContactService, LeadService, OpportunityService, TenderService, SupplierService, ProjectService],
      useFactory: (
        accounts: AccountService, contacts: ContactService, leads: LeadService, opportunities: OpportunityService,
        tenders: TenderService, suppliers: SupplierService, projects: ProjectService,
      ): MailRecordDirectory => {
        const read: Record<MailRecordType, (id: string) => Promise<{ tenantId: string; label: string } | null>> = {
          'crm.account': async (id) => { const r = await accounts.get(id); return r && { tenantId: r.tenantId, label: r.name }; },
          'crm.contact': async (id) => { const r = await contacts.get(id); return r && { tenantId: r.tenantId, label: r.name }; },
          'crm.lead': async (id) => { const r = await leads.get(id); return r && { tenantId: r.tenantId, label: r.name }; },
          'crm.opportunity': async (id) => { const r = await opportunities.get(id); return r && { tenantId: r.tenantId, label: r.title }; },
          'tendering.tender': async (id) => { const r = await tenders.get(id); return r && { tenantId: r.tenantId, label: r.title }; },
          'procurement.supplier': async (id) => { const r = await suppliers.get(id); return r && { tenantId: r.tenantId, label: r.name }; },
          'projects.project': async (id) => { const r = await projects.get(id); return r && { tenantId: r.tenantId, label: r.title }; },
        };
        return {
          async labelOf(tenantId, recordType, recordId) {
            // A malformed id is simply not a record; the stores behind these services key on uuids.
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) return null;
            const found = await read[recordType](recordId).catch(() => null);
            return found && found.tenantId === tenantId ? found.label : null;
          },
        };
      },
    },
  ],
  exports: [MAIL_RECORD_DIRECTORY],
})
export class MailRecordDirectoryModule {}
