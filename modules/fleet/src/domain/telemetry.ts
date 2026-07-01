import { randomUUID } from 'node:crypto';

export interface VehicleTelemetry {
  id: string;
  tenantId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;
  odometer: number | null;
  recordedAt: string;
}

export interface NewVehicleTelemetry {
  tenantId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;
  odometer?: number | null;
  recordedAt?: string;
}

export function makeVehicleTelemetry(input: NewVehicleTelemetry): VehicleTelemetry {
  if (!input.vehicleId) throw new Error('vehicleId is required');
  if (input.latitude === undefined || input.latitude < -90 || input.latitude > 90) {
    throw new Error('latitude must be between -90 and 90');
  }
  if (input.longitude === undefined || input.longitude < -180 || input.longitude > 180) {
    throw new Error('longitude must be between -180 and 180');
  }
  if (input.speed === undefined || input.speed < 0) {
    throw new Error('speed must be non-negative');
  }

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    vehicleId: input.vehicleId,
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    speed: Number(input.speed),
    odometer: input.odometer !== undefined ? Number(input.odometer) : null,
    recordedAt: input.recordedAt || new Date().toISOString(),
  };
}

export const FLEET_TELEMETRY_EVENT = {
  received: 'fleet.telemetry.received',
} as const;
