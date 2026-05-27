/**
 * @t2000/ui/toaster — client-only entry for Sonner toast.
 *
 * This entry exists separately from the main barrel because Sonner's
 * `<Toaster>` uses client-only React hooks (useState / useEffect / useId)
 * at the top of its render function. The `'use client'` directive on
 * this file makes Next.js App Router treat the entry as a client bundle,
 * so consumers can import `Toaster` directly from a server component's
 * layout without hitting a hooks-on-server runtime error.
 *
 * Consumer pattern:
 *
 *   // app/layout.tsx (server)
 *   import { Toaster } from '@t2000/ui/toaster';
 *
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html>
 *         <body>
 *           {children}
 *           <Toaster />
 *         </body>
 *       </html>
 *     );
 *   }
 *
 *   // any-component.tsx (client)
 *   'use client';
 *   import { toast } from '@t2000/ui/toaster';
 *   toast.success('Copied to clipboard');
 *
 * Why this entry isn't part of the main `@t2000/ui` barrel:
 * the main barrel includes server-safe primitives (Card, Badge, Table,
 * Separator, Skeleton). Marking the barrel `'use client'` would force
 * those into the client bundle on every consumer page that imports them,
 * even pure-marketing pages that don't need any JS. Keeping Toaster in
 * its own entry preserves RSC-friendly imports for the rest of the lib.
 *
 * The `'use client'` directive is INJECTED at the top of `dist/toaster.js`
 * by the tsup post-build hook — esbuild strips top-of-source directives
 * during bundling (it warns "Module level directives cause errors when
 * bundled, 'use client' was ignored"), so the directive can't live in
 * source. See `tsup.config.ts` `onSuccess` callback.
 */
export { Toaster, toast, type ToasterProps } from './primitives/sonner.js';
