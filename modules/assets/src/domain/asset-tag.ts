import type { Asset } from './asset';

/**
 * Asset QR tag — the printable identification label for a physical asset. The payload is a
 * stable deep-link URI (`aura://assets/<id>?sn=<serial>`): scanning resolves the asset by id,
 * and the serial number lets a human cross-check the physical nameplate. Pure domain — the
 * QR rendering (SVG) happens in the service.
 */
export interface AssetTag {
  assetId: string;
  /** Human-readable tag code printed under the QR — the asset's serial number. */
  tagCode: string;
  name: string;
  category: string;
  /** The string encoded into the QR code. */
  payload: string;
  generatedAt: string;
}

export function makeAssetTag(asset: Pick<Asset, 'id' | 'serialNumber' | 'name' | 'category'>): AssetTag {
  if (!asset.id) throw new Error('asset id is required');
  if (!asset.serialNumber?.trim()) throw new Error('asset serial number is required');
  return {
    assetId: asset.id,
    tagCode: asset.serialNumber.trim().toUpperCase(),
    name: asset.name,
    category: asset.category,
    payload: `aura://assets/${asset.id}?sn=${encodeURIComponent(asset.serialNumber.trim().toUpperCase())}`,
    generatedAt: new Date().toISOString(),
  };
}
