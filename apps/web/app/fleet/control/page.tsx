import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import FleetControlClient from '../../../components/fleet-control-client';

export const dynamic = 'force-dynamic';

interface Vehicle {
  id: string;
  tenantId: string;
  companyId: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  registrationExpiry: string | null;
  status: 'active' | 'maintenance' | 'retired';
  driverEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FuelLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
  createdAt: string;
  updatedAt: string;
}

interface MaintenanceRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  date: string;
  description: string;
  cost: number;
  status: 'scheduled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default async function FleetControlPage() {
  const [vehicles, fuelLogs, maintenance, employees] = await Promise.all([
    getJson<Vehicle[]>('/api/fleet/vehicles'),
    getJson<FuelLog[]>('/api/fleet/fuel'),
    getJson<MaintenanceRecord[]>('/api/fleet/maintenance'),
    getJson<Employee[]>('/api/hr/employees'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Fleet & Logistics</h1>
      <p style={st.sub}>
        Manage corporate vehicles and heavy equipment, track fuel consumption log entries, assign drivers, and handle scheduled or completed preventative maintenance.
      </p>

      <FleetControlClient
        initialVehicles={vehicles ?? []}
        initialFuelLogs={fuelLogs ?? []}
        initialMaintenance={maintenance ?? []}
        employees={employees ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
