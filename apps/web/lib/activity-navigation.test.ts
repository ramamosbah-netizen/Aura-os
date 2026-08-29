import { describe, expect, it } from 'vitest';
import { activityRegisterHref, isPersonalExecutableActivity, myWorkActivityHref, parseActivityContext } from './activity-navigation';

describe('activity ownership navigation', () => {
  it('preserves the related record when opening the register from a 360 page', () => {
    expect(activityRegisterHref('opportunity', 'opp/42')).toBe('/crm/activities?relatedType=opportunity&record=opp%2F42');
  });

  it('hands personal activity execution to My Work', () => {
    expect(myWorkActivityHref('activity/42')).toBe('/my-work/tasks?task=activity%2F42');
    expect(isPersonalExecutableActivity('follow_up')).toBe(true);
    expect(isPersonalExecutableActivity('call')).toBe(false);
  });

  it('treats scoped record links as related-record context and keeps legacy activity focus links', () => {
    expect(parseActivityContext('quotation', 'quote-42')).toEqual({ relatedType: 'quotation', relatedId: 'quote-42', activityId: '' });
    expect(parseActivityContext(undefined, 'activity-42')).toEqual({ relatedType: '', relatedId: '', activityId: 'activity-42' });
  });
});
