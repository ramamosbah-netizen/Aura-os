// The single stacking order for the app's UI layers. Components must reference these instead of
// inventing local z-index numbers — that is exactly how the AI Dock (1000) ended up on top of the
// LeadCapture drawer (200). A drawer/modal always outranks the ambient floating assistant.
export const UI_Z_INDEX = {
  page: 0,
  sticky: 100,
  floatingAssistant: 1000,
  drawer: 1100,
  modal: 1200,
  toast: 1300,
} as const;

export type UiLayer = keyof typeof UI_Z_INDEX;
