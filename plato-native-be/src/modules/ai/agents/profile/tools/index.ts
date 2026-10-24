export * from './context';
export * from './profile.tools';
export * from './documents.tools';
export * from './social-links.tools';
export * from './preferences.tools';

import { getProfileTool, updateProfileTool } from './profile.tools';
import {
  listDocumentsTool,
  addDocumentTool,
  removeDocumentTool,
} from './documents.tools';
import {
  listSocialLinksTool,
  addSocialLinkTool,
  updateSocialLinkTool,
  removeSocialLinkTool,
} from './social-links.tools';
import { getPreferencesTool, updatePreferencesTool } from './preferences.tools';

export const profileTools = [
  getProfileTool,
  updateProfileTool,
  listDocumentsTool,
  addDocumentTool,
  removeDocumentTool,
  listSocialLinksTool,
  addSocialLinkTool,
  updateSocialLinkTool,
  removeSocialLinkTool,
  getPreferencesTool,
  updatePreferencesTool,
];
