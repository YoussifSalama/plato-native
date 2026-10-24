import { BadRequestException } from '@nestjs/common';

// Rows owned by the Chrome extension engine are off limits to the legacy
// worker and its endpoints (retry, withdraw, answers, mark-submitted...).
export const isExtensionOwned = (app: {
  engine?: string | null;
  status?: string;
}) => app.engine === 'EXTENSION' || app.status === 'EXTENSION_ACTIVE';

export function assertLegacy(app: { engine?: string | null; status?: string }) {
  if (isExtensionOwned(app))
    throw new BadRequestException(
      'This application is handled by the Plato browser extension',
    );
}
