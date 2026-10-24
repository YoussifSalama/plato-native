/* eslint-disable */
jest.mock('@nestjs/jwt', () => {
  // @nestjs/jwt is ESM-only and jest can't load it; a signed-by-JSON stand-in
  // is enough to exercise JwtAuthGuard's cookie path.
  class JwtService {
    sign(p: object) { return Buffer.from(JSON.stringify(p)).toString('base64url'); }
    async verifyAsync(t: string) { return JSON.parse(Buffer.from(t, 'base64url').toString()); }
  }
  return { JwtService, JwtModule: { register: () => ({ module: class {}, providers: [JwtService], exports: [JwtService], global: true }) } };
});
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  EXTENSION_PUBLIC_KEY,
  ExtensionAuthGuard,
} from './extension-auth.guard';
import {
  ExtensionApiController,
  ExtensionPairingController,
  ExtensionWebController,
} from './extension.controllers';
import { isExtensionRoute } from './cors';

const routes = (cls: any) =>
  Object.getOwnPropertyNames(cls.prototype)
    .filter((n) => Reflect.hasMetadata(METHOD_METADATA, cls.prototype[n]))
    .map((n) => ({
      name: n,
      handler: cls.prototype[n],
      path: `/${Reflect.getMetadata(PATH_METADATA, cls)}/${Reflect.getMetadata(PATH_METADATA, cls.prototype[n])}`.replace(
        /\/+/g,
        '/',
      ),
      guards: [
        ...(Reflect.getMetadata('__guards__', cls) ?? []),
        ...(Reflect.getMetadata('__guards__', cls.prototype[n]) ?? []),
      ],
    }));

describe('extension route registry', () => {
  it('web routes: JwtAuthGuard only', () => {
    const r = routes(ExtensionWebController);
    expect(r.length).toBe(9); // + GET stops (the stop report)
    for (const x of r) expect(x.guards).toEqual([JwtAuthGuard]);
  });

  it('token routes: ExtensionAuthGuard and an explicit scope declaration on every handler', () => {
    const r = routes(ExtensionApiController);
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) {
      expect(x.guards).toEqual([ExtensionAuthGuard]);
      expect(Reflect.getMetadata('extension:scopes', x.handler)).toBeInstanceOf(
        Array,
      );
      expect(x.path.startsWith('/extension/v1/')).toBe(true);
    }
  });

  it('the only unguarded extension route is the pairing exchange', () => {
    const r = routes(ExtensionPairingController);
    expect(r.map((x) => x.path)).toEqual(['/extension/pairing/exchange']);
    for (const x of r) {
      expect(x.guards).toEqual([]);
      expect(Reflect.getMetadata(EXTENSION_PUBLIC_KEY, x.handler)).toBe(true);
    }
  });

  it('every route CORS treats as an extension route is a token or exchange route', () => {
    for (const x of [...routes(ExtensionWebController)])
      expect(isExtensionRoute(x.path)).toBe(false);
    for (const x of [
      ...routes(ExtensionApiController),
      ...routes(ExtensionPairingController),
    ])
      expect(isExtensionRoute(x.path)).toBe(true);
  });

  // Source scan over the whole API: the token guard can't leak into other
  // modules, and no extension route can use anything but the three groups.
  it('ExtensionAuthGuard is used only inside the extension module', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '..', '..'));
    const offenders = files.filter(
      (p) =>
        !p.includes(`${join('modules', 'extension')}`) &&
        readFileSync(p, 'utf8').includes('ExtensionAuthGuard'),
    );
    expect(offenders).toEqual([]);
    const ctrl = files.filter(
      (p) => p.endsWith('.controller.ts') || p.endsWith('.controllers.ts'),
    );
    const outside = ctrl.filter(
      (p) =>
        !p.includes(join('modules', 'extension')) &&
        /@Controller\(\s*['"`]extension/.test(readFileSync(p, 'utf8')),
    );
    expect(outside).toEqual([]);
  });
});
