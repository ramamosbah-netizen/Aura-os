import { Inject, Injectable } from '@nestjs/common';
import { SAVED_VIEW_STORE, type NewSavedView, type SavedView, type SavedViewStore, makeSavedView } from './saved-view-store';

@Injectable()
export class SavedViewService {
  constructor(@Inject(SAVED_VIEW_STORE) private readonly store: SavedViewStore) {}
  async create(input: NewSavedView): Promise<SavedView> {
    const v = makeSavedView(input);
    await this.store.save(v);
    return v;
  }
  list(tenantId: string, path?: string): Promise<SavedView[]> { return this.store.list(tenantId, path); }
  remove(tenantId: string, id: string): Promise<void> { return this.store.remove(tenantId, id); }
}
